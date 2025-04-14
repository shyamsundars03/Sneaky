const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const usercollection = require("../../models/userSchema");
const Offer = require("../../models/offerSchema"); 


const calculateCurrentPrice = async (product) => {
    const currentDate = new Date();
    const activeOffers = await Offer.find({
        startDate: { $lte: currentDate },
        endDate: { $gte: currentDate }
    }).populate('category');

    let finalPrice = product.offerPrice || product.price;
    
    if (product.category) {
        const categoryOffer = activeOffers.find(offer => 
            offer.category && offer.category._id.toString() === product.category._id.toString()
        );
        
        if (categoryOffer) {
            const categoryOfferPrice = Math.round(
                product.price * (1 - categoryOffer.discountPercentage/100)
            );
            finalPrice = Math.min(finalPrice, categoryOfferPrice);
        }
    }
    
    return finalPrice;
};

const validateCartQuantities = async (cart) => {
    const validation = {
        isValid: true,
        updatedCart: { ...cart.toObject() },
        outOfStockItems: [],
        adjustedItems: []
    };

    validation.updatedCart.cartTotal = 0; // Reset total for recalculation

    for (const item of validation.updatedCart.cartItems) {
        const product = await Product.findById(item.product._id || item.product)
            .populate('category');
        if (!product) {
            validation.outOfStockItems.push({
                productName: item.product?.productName || 'Unknown',
                size: item.size,
                reason: 'Product no longer available'
            });
            continue;
        }

        const sizeObj = product.sizes.find(s => s.size === item.size);
        if (!sizeObj) {
            validation.outOfStockItems.push({
                productName: product.productName,
                size: item.size,
                reason: 'Size no longer available'
            });
            continue;
        }

        // Calculate current price for this item
        const currentPrice = await calculateCurrentPrice(product);
        
        if (item.quantity > sizeObj.stock) {
            if (sizeObj.stock > 0) {
                const originalQty = item.quantity;
                item.quantity = sizeObj.stock;
                validation.adjustedItems.push({
                    productName: product.productName,
                    size: item.size,
                    originalQuantity: originalQty,
                    newQuantity: sizeObj.stock,
                    price: currentPrice
                });
                // Update the item price to current price
                item.price = currentPrice;
            } else {
                validation.outOfStockItems.push({
                    productName: product.productName,
                    size: item.size,
                    reason: 'Out of stock'
                });
            }
        } else {
            // Update the item price to current price
            item.price = currentPrice;
        }

        // Only add to total if item is valid
        if (!validation.outOfStockItems.some(i => 
            i.productName === product.productName && i.size === item.size
        )) {
            validation.updatedCart.cartTotal += item.price * item.quantity;
        }
    }

    // Filter out unavailable items
    validation.updatedCart.cartItems = validation.updatedCart.cartItems.filter(item => 
        !validation.outOfStockItems.some(outItem => 
            outItem.productName === (item.product?.productName || 'Unknown') && 
            outItem.size === item.size
        )
    );

    validation.isValid = validation.outOfStockItems.length === 0 && 
                        validation.adjustedItems.length === 0;

    return validation;
};






// Load Cart Page
const loadCart = async (req, res) => {
    try {
        const userId = req.user._id;
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: "cartItems.product",
                populate: { path: "category" }
            });

        if (!cart) {
            return res.render("cart", {
                user: req.user,
                cart: { cartItems: [] },
                cartTotal: 0
            });
        }

        // Calculate current prices and filter unavailable products
        const validCartItems = [];
        let cartTotal = 0;

        for (const item of cart.cartItems) {
            if (!item.product || !item.product.isListed || item.product.isDeleted) {
                continue; // Skip unavailable products
            }

            // Get current price
            const currentPrice = await calculateCurrentPrice(item.product);
            const itemTotal = currentPrice * item.quantity;
            
            // Transform image path
            if (item.product.productImage?.[0]) {
                item.product.productImage[0] = item.product.productImage[0]
                    .replace(/\\/g, '/')
                    .replace('public/', '/');
            }

            validCartItems.push({
                ...item.toObject(),
                price: currentPrice,
                itemTotal: itemTotal
            });

            cartTotal += itemTotal;
        }

        res.render("cart", {
            user: req.user,
            cart: {
                cartItems: validCartItems,
                cartTotal: cartTotal
            },
            cartTotal: cartTotal
        });
    } catch (error) {
        console.error("Error loading cart:", error);
        res.status(500).render("page-404");
    }
};

const addToCart = async (req, res) => {
    try {
        const { productId, size, quantity = 1 } = req.body;
        const userId = req.user._id;

        // Validate input
        if (!productId || !size) {
            return res.status(400).json({ 
                success: false,
                error: "MISSING_FIELDS",
                message: "Product ID and size are required" 
            });
        }

        // Get product with category
        const product = await Product.findById(productId).populate('category');
        if (!product || !product.isListed || product.isDeleted) {
            return res.status(404).json({ 
                success: false,
                error: "PRODUCT_UNAVAILABLE",
                message: "Product not available" 
            });
        }

        // Validate size and stock
        const sizeObj = product.sizes.find(s => s.size === size);
        if (!sizeObj) {
            return res.status(400).json({ 
                success: false,
                error: "INVALID_SIZE",
                message: "Selected size not available" 
            });
        }

        if (quantity > sizeObj.stock) {
            return res.status(400).json({ 
                success: false,
                error: "INSUFFICIENT_STOCK",
                message: `Only ${sizeObj.stock} available in stock` 
            });
        }

        // Calculate current price
        const currentPrice = await calculateCurrentPrice(product);

        // Update cart
        let cart = await Cart.findOne({ user: userId }) || 
                 new Cart({ user: userId, cartItems: [] });

        const existingItem = cart.cartItems.find(item => 
            item.product.equals(productId) && item.size === size
        );

        if (existingItem) {
            // Check if new quantity exceeds stock
            if (existingItem.quantity + quantity > sizeObj.stock) {
                return res.status(400).json({ 
                    success: false,
                    error: "EXCEEDS_STOCK",
                    message: `Cannot add more than available stock. kindly check Cart` 
                });
            }
            existingItem.quantity += quantity;
        } else {
            cart.cartItems.push({
                product: productId,
                size,
                quantity
            });
        }

        await cart.save();

        // Return success but don't include price in response
        res.json({ 
            success: true,
            message: "Product added to cart"
        });

    } catch (error) {
        console.error("Cart error:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to add to cart",
            error: error.message 
        });
    }
};

const updateQuantity = async (req, res) => {
    try {
        const { productId, size, action } = req.body;
        const userId = req.user._id;

        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: "cartItems.product",
                populate: { path: "category" }
            });

        if (!cart) {
            return res.status(404).json({ 
                success: false,
                message: "Cart not found" 
            });
        }

        // Find item by BOTH productId AND size
        const item = cart.cartItems.find(item => 
            item.product._id.toString() === productId && 
            item.size === size
        );

        if (!item) {
            return res.status(404).json({ 
                success: false,
                message: "Item not found in cart" 
            });
        }

        // Get current price for this item
        const currentPrice = await calculateCurrentPrice(item.product);

        // Check size availability
        const sizeObj = item.product.sizes.find(s => s.size === item.size);
        if (!sizeObj) {
            return res.status(400).json({ 
                success: false,
                message: "Selected size no longer available" 
            });
        }

        // Update quantity
        if (action === 'increase') {
            if (item.quantity + 1 > sizeObj.stock) {
                return res.status(400).json({ 
                    success: false,
                    message: `Only ${sizeObj.stock} available in stock for size ${item.size}` 
                });
            }
            item.quantity += 1;
        } else if (action === 'decrease') {
            if (item.quantity <= 1) {
                return res.status(400).json({ 
                    success: false,
                    message: "Minimum quantity is 1" 
                });
            }
            item.quantity -= 1;
        }

        await cart.save();

        // Calculate item total
        const itemTotal = currentPrice * item.quantity;

        // Calculate cart total - we need to process items sequentially
        let cartTotal = 0;
        for (const cartItem of cart.cartItems) {
            const itemPrice = await calculateCurrentPrice(cartItem.product);
            cartTotal += itemPrice * cartItem.quantity;
        }

        res.json({
            success: true,
            newQuantity: item.quantity,
            newPrice: itemTotal,
            newSubtotal: cartTotal,
            newTotal: cartTotal
        });

    } catch (error) {
        console.error("Update quantity error:", error);
        res.status(500).json({ 
            success: false,
            message: "Failed to update quantity",
            error: error.message 
        });
    }
};


// Remove Product from Cart
const removeFromCart = async (req, res) => {
    try {
        const { itemId } = req.body;
        const userId = req.user._id;

        if (!itemId) {
            return res.status(400).json({
                success: false,
                message: "Item ID is required"
            });
        }

        const cart = await Cart.findOne({ user: userId });
        
        if (!cart) {
            return res.status(404).json({ 
                success: false, 
                message: "Cart not found" 
            });
        }

        // Find the index of the item to remove
        const itemIndex = cart.cartItems.findIndex(item => 
            item._id.toString() === itemId
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: "Item not found in cart"
            });
        }

        // Remove the item
        cart.cartItems.splice(itemIndex, 1);
        
        // Recalculate total
        cart.cartTotal = cart.cartItems.reduce(
            (total, item) => total + (item.price * item.quantity), 
            0
        );
        
        await cart.save();

        res.json({ 
            success: true, 
            message: "Item removed from cart",
            cartTotal: cart.cartTotal
        });
    } catch (error) {
        console.error("Error removing from cart:", error);
        res.status(500).json({ 
            success: false, 
            message: error.message || "Failed to remove item from cart" 
        });
    }
};


const proceedToCheckout = async (req, res) => {
    try {
        const userId = req.user._id;
        const cart = await Cart.findOne({ user: userId })
            .populate({
                path: "cartItems.product",
                populate: { path: "category" }
            });

        if (!cart || cart.cartItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Your cart is empty"
            });
        }

        // Validate quantities and get current prices
        const validation = await validateCartQuantities(cart);

        // Initialize checkout session with current prices
        req.session.checkoutData = {
            cart: {
                items: validation.updatedCart.cartItems.map(item => ({
                    product: item.product._id,
                    size: item.size,
                    quantity: item.quantity,
                    price: item.price // Ensure we store the current price
                })),
                total: validation.updatedCart.cartTotal
            },
            step: 1
        };

        if (!validation.isValid) {
            // Save the updated cart if changes were made
            cart.cartItems = validation.updatedCart.cartItems;
            cart.cartTotal = validation.updatedCart.cartTotal;
            await cart.save();

            let errorMessage = 'Some items in your cart need attention:\n\n';
            
            if (validation.outOfStockItems.length > 0) {
                errorMessage += 'The following items are no longer available:\n';
                validation.outOfStockItems.forEach(item => {
                    errorMessage += `- ${item.productName} (Size: ${item.size}): ${item.reason}\n`;
                });
                errorMessage += '\n';
            }

            if (validation.adjustedItems.length > 0) {
                errorMessage += 'Updated Stock Quantities for these items:\n';
                validation.adjustedItems.forEach(item => {
                    errorMessage += `- ${item.productName} (Size: ${item.size}): ` +
                                  `Reduced from ${item.originalQuantity} to ${item.newQuantity}\n`;
                });
            }

            return res.status(400).json({
                success: false,
                needsAttention: true,
                message: errorMessage,
                outOfStockItems: validation.outOfStockItems,
                adjustedItems: validation.adjustedItems
            });
        }

        // If everything is valid, proceed to checkout
        res.json({
            success: true,
            redirect: '/checkout1'
        });

    } catch (error) {
        console.error("Checkout error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to proceed to checkout"
        });
    }
};




module.exports = {
    loadCart,
    addToCart,
    updateQuantity,
    removeFromCart,
    proceedToCheckout,
    calculateCurrentPrice
};