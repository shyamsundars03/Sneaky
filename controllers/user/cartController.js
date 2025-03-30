const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const usercollection = require("../../models/userSchema");
const Offer = require("../../models/offerSchema"); 
// Load Cart Page
const loadCart = async (req, res) => {
    try {
        const userId = req.user._id;

        // Fetch the cart and populate product details
        const cart = await Cart.findOne({ user: userId }).populate({
            path: "cartItems.product",
            model: "Product",
            select: "productName productImage price isListed", // Include isListed in the select
        });

        let cartTotal = 0;
        let filteredCartItems = [];

        if (cart) {
            // Filter out unlisted products (only for rendering, not saving)
            filteredCartItems = cart.cartItems.filter(item => item.product.isListed);

            // Recalculate the cart total based on filtered items
            cartTotal = filteredCartItems.reduce((total, item) => {
                return total + item.price * item.quantity;
            }, 0);

            // Transform image paths for the frontend
            filteredCartItems = filteredCartItems.map(item => {
                if (item.product.productImage && item.product.productImage[0]) {
                    item.product.productImage[0] = item.product.productImage[0].replace(/\\/g, '/').replace('public/', '/');
                }
                return item;
            });
        }

        // Debug: Log product image paths
        filteredCartItems.forEach(item => {
            console.log("Transformed Product Image Path:", item.product.productImage[0]);
        });

        // Render the cart page with filtered items and updated total
        res.render("cart", {
            user: req.user,
            cart: {
                cartItems: filteredCartItems,
                cartTotal: cartTotal,
            },
            cartTotal,
        });
    } catch (error) {
        console.error("Error loading cart page:", error);
        res.status(500).render("page-404");
    }
};

// Add Product to Cart
const addToCart = async (req, res) => {
    try {
        const { productId, size, quantity = 1 } = req.body;
        const userId = req.user._id;

        // Validate required fields
        if (!productId || !size) {
            return res.status(400).json({ 
                success: false,
                error: 'MISSING_FIELDS',
                message: "Product ID and size are required"
            });
        }

        // Get product with category populated
        const product = await Product.findById(productId).populate('category');
        if (!product) {
            return res.status(404).json({ 
                success: false, 
                error: 'PRODUCT_NOT_FOUND',
                message: "Product not found." 
            });
        }

        // Check product availability
        if (!product.isListed || product.isDeleted) {
            return res.status(400).json({ 
                success: false, 
                error: 'PRODUCT_UNAVAILABLE',
                message: "This product is currently unavailable." 
            });
        }

        // Validate size
        const selectedSize = product.sizes.find(s => s.size === size);
        if (!selectedSize) {
            return res.status(400).json({ 
                success: false,
                error: 'INVALID_SIZE',
                message: "Selected size not available." 
            });
        }

        // Check stock
        if (quantity > selectedSize.stock) {
            return res.status(400).json({ 
                success: false,
                error: 'INSUFFICIENT_STOCK',
                message: "Not enough stock available." 
            });
        }

        // Calculate final price (offer price or category offer price)
        let finalPrice = product.offerPrice || product.price;
        if (product.category) {
            const currentDate = new Date();
            const activeOffers = await Offer.find({
                startDate: { $lte: currentDate },
                endDate: { $gte: currentDate },
                category: product.category._id
            });
            
            if (activeOffers.length > 0) {
                const categoryOfferPrice = Math.round(product.price * (1 - activeOffers[0].discountPercentage/100));
                finalPrice = Math.min(finalPrice, categoryOfferPrice);
            }
        }

        // Update cart
        let cart = await Cart.findOne({ user: userId }) || 
                 new Cart({ user: userId, cartItems: [] });

        const existingItem = cart.cartItems.find(item => 
            item.product.equals(productId) && item.size === size
        );

        if (existingItem) {
            if (existingItem.quantity + quantity > selectedSize.stock) {
                return res.status(400).json({ 
                    success: false,
                    error: 'EXCEEDS_STOCK',
                    message: "Cannot add more than available stock" 
                });
            }
            existingItem.quantity += quantity;
            existingItem.price = finalPrice;
        } else {
            cart.cartItems.push({
                product: productId,
                size,
                quantity,
                price: finalPrice
            });
        }

        cart.cartTotal = cart.cartItems.reduce(
            (total, item) => total + (item.price * item.quantity), 0
        );

        await cart.save();

        res.json({ 
            success: true, 
            message: "Product added to cart!",
            price: finalPrice,
            cartTotal: cart.cartTotal
        });

    } catch (error) {
        console.error("Cart Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to add to cart",
            error: error.message 
        });
    }
};

// Update Product Quantity in Cart
const updateQuantity = async (req, res) => {
    try {
        const { productId, action } = req.body;
        const userId = req.user._id;

        const cart = await Cart.findOne({ user: userId }).populate({
            path: 'cartItems.product',
            populate: { path: 'category' }
        });
        
        if (!cart) {
            return res.status(404).json({ success: false, message: "Cart not found." });
        }

        // Find the cart item by product ID (instead of item ID)
        const item = cart.cartItems.find(item => 
            item.product._id.toString() === productId
        );

        if (!item) {
            return res.status(404).json({ success: false, message: "Product not found in cart." });
        }

        // Rest of your existing code for price calculation and stock check...
        // Get active category offers
        const currentDate = new Date();
        const activeOffers = await Offer.find({
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate }
        }).populate('category');

        // Recalculate final price in case offers changed
        let finalPrice = item.product.offerPrice || item.product.price;
        if (item.product.category) {
            const categoryOffer = activeOffers.find(offer => 
                offer.category && offer.category._id.toString() === item.product.category._id.toString()
            );

            if (categoryOffer) {
                const categoryOfferPrice = Math.round(item.product.price * (1 - categoryOffer.discountPercentage/100));
                if (categoryOfferPrice < finalPrice) {
                    finalPrice = categoryOfferPrice;
                }
            }
        }

        // Update price if it changed
        if (item.price !== finalPrice) {
            item.price = finalPrice;
        }

        // Check stock
        const selectedSize = item.product.sizes.find(s => s.size === item.size);
        if (!selectedSize) {
            return res.status(400).json({ success: false, message: "Selected size not available." });
        }

        if (action === 'increase') {
            if (item.quantity + 1 > selectedSize.stock) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Only " + selectedSize.stock + " items available in stock." 
                });
            }
            item.quantity += 1;
        } else if (action === 'decrease' && item.quantity > 1) {
            item.quantity -= 1;
        } else {
            return res.status(400).json({ 
                success: false, 
                message: "Minimum quantity is 1" 
            });
        }

        cart.cartTotal = cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
        await cart.save();

        res.json({
            success: true,
            newQuantity: item.quantity,
            newPrice: item.price * item.quantity,
            newSubtotal: cart.cartTotal,
            newTotal: cart.cartTotal,
        });
    } catch (error) {
        console.error("Error updating quantity:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to update the quantity.",
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

module.exports = {
    loadCart,
    addToCart,
    updateQuantity,
    removeFromCart,
};