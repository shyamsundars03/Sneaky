const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const Product = require("../../models/productSchema");
const Coupon = require("../../models/couponSchema");
const { calculateCurrentPrice } = require('./cartController');
const mongoose = require('mongoose');


// Helper function to validate cart items
const validateCartItems = async (cartItems) => {
    const validation = {
        isValid: true,
        updatedItems: [],
        outOfStockItems: [],
        adjustedItems: []
    };

    for (const item of cartItems) {
        const product = await Product.findById(item.product).populate('category');
        if (!product || !product.isListed || product.isDeleted) {
            validation.outOfStockItems.push({
                productName: product?.productName || 'Unknown',
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

        if (item.quantity > sizeObj.stock) {
            if (sizeObj.stock > 0) {
                const originalQty = item.quantity;
                item.quantity = sizeObj.stock;
                validation.adjustedItems.push({
                    productName: product.productName,
                    size: item.size,
                    originalQuantity: originalQty,
                    newQuantity: sizeObj.stock,
                    price: await calculateCurrentPrice(product)
                });
                validation.updatedItems.push(item);
            } else {
                validation.outOfStockItems.push({
                    productName: product.productName,
                    size: item.size,
                    reason: 'Out of stock'
                });
            }
        } else {
            validation.updatedItems.push(item);
        }
    }

    validation.isValid = validation.outOfStockItems.length === 0 && 
                        validation.adjustedItems.length === 0;

    return validation;
};

// Initialize checkout session
const initializeCheckout = async (req) => {
    const userId = req.user._id;
    const cart = await Cart.findOne({ user: userId })
        .populate({
            path: "cartItems.product",
            populate: { path: "category" }
        });

    if (!cart || cart.cartItems.length === 0) {
        throw new Error("Your cart is empty");
    }

    // Validate cart items and get current prices
    let cartTotal = 0;
    const validItems = [];
    
    for (const item of cart.cartItems) {
        const product = item.product;
        if (!product || !product.isListed || product.isDeleted) {
            continue; // Skip unavailable products
        }

        const sizeObj = product.sizes.find(s => s.size === item.size);
        if (!sizeObj || sizeObj.stock < 1) {
            continue; // Skip unavailable sizes
        }

        // Ensure we don't exceed available stock
        const quantity = Math.min(item.quantity, sizeObj.stock);
        const price = await calculateCurrentPrice(product);
        
        validItems.push({
            product: product._id,
            size: item.size,
            quantity,
            price
        });

        cartTotal += price * quantity;
    }

    if (validItems.length === 0) {
        throw new Error("All items in your cart are currently unavailable");
    }

    // Initialize session data
    req.session.checkoutData = {
        cart: {
            items: validItems,
            total: cartTotal
        },
        step: 1,
        shippingMethod: 'Standard',
        shippingCost: 100,
        selectedAddress: null,
        paymentMethod: null,
        couponCode: null,
        discountAmount: 0
    };

    return req.session.checkoutData;
};

// Load Checkout Step 1
const loadCheckout1 = async (req, res) => {
    try {
        if (!req.session.checkoutData) {
            await initializeCheckout(req);
        }

        const userId = req.user._id;
        const addresses = await Address.find({ userId });

        // Use the prices stored in session
        const cartTotal = req.session.checkoutData.cart.total;

        res.render("checkout1", { 
            cart: req.session.checkoutData.cart,
            addresses,
            shippingCost: req.session.checkoutData.shippingCost || 100,
            shippingMethod: req.session.checkoutData.shippingMethod || 'Standard',
            user: req.user,
            couponApplied: req.session.checkoutData.couponCode ? true : false,
            couponCode: req.session.checkoutData.couponCode || '',
            discountAmount: req.session.checkoutData.discountAmount || 0,
            cartTotal: cartTotal
        });
    } catch (error) {
        console.error("Error loading checkout1:", error);
        res.render("checkout1", {
            errorMessage: error.message,
            cart: req.session.checkoutData ? req.session.checkoutData.cart : {},
            addresses: [],
            shippingCost: 100,
            shippingMethod: 'Standard',
            user: req.user,
            couponApplied: false,
            couponCode: '',
            discountAmount: 0,
            cartTotal: 0
        });
    }
};

const removeCoupon = async (req, res) => {
    try {
        if (!req.session.checkoutData) {
            return res.status(400).json({ success: false, message: "Session expired" });
        }

        // Remove coupon from session
        delete req.session.checkoutData.couponCode;
        delete req.session.checkoutData.discountAmount;

        res.json({ 
            success: true,
            message: 'Coupon removed successfully'
        });
    } catch (error) {
        console.error('Error removing coupon:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to remove coupon'
        });
    }
};




const loadCheckout2 = async (req, res) => {
    try {
        if (!req.session.checkoutData) {
            await initializeCheckout(req);
        }

        const userId = req.user._id;
        const user = await User.findById(userId);
        const checkoutData = req.session.checkoutData;

        // Calculate total with shipping and coupon
        const shippingCost = checkoutData.shippingCost || 100;
        const discountAmount = checkoutData.discountAmount || 0;
        const subtotal = checkoutData.cart.total;
        const total = subtotal + shippingCost - discountAmount;

        // Check COD eligibility
        const isCODAllowed = total <= 7000;

        console.log("Shipping Cost:", shippingCost);
        console.log("Discount Amount:", discountAmount);
        console.log("Cart Total:", subtotal);
        console.log("Total Amount:", total);
        
        res.render("checkout2", { 
            cart: checkoutData.cart,
            user: req.user,
            walletBalance: user.wallet?.balance || 0,
            shippingCost: shippingCost,
            isCODAllowed,
            selectedAddress: checkoutData.selectedAddress,
            shippingMethod: checkoutData.shippingMethod,
            couponCode: checkoutData.couponCode || '',
            discountAmount: discountAmount,
            totalAmount: total,
            cartTotal: subtotal
        });

        req.session.checkoutData.step = 2;
    } catch (error) {
        console.error("Error loading checkout2:", error);
        res.status(500).render("page-404");
    }
};
// Load Checkout Step 3
const loadCheckout3 = async (req, res) => {
    try {
        if (!req.session.checkoutData || req.session.checkoutData.step < 2) {
            return res.redirect("/checkout1");
        }

        req.session.checkoutData.step = 3;

        const checkoutData = req.session.checkoutData;
        const userId = req.user._id;
        
        // Get complete product details with current prices
        const populatedItems = await Promise.all(
            checkoutData.cart.items.map(async (item) => {
                const product = await Product.findById(item.product)
                    .populate('category');
                
                return {
                    product: {
                        _id: product._id,
                        productName: product.productName,
                        productImage: product.productImage?.[0]?.replace(/\\/g, '/').replace('public/', '/'),
                        price: item.price // Use the price stored in session
                    },
                    size: item.size,
                    quantity: item.quantity,
                    price: item.price,
                    itemTotal: item.price * item.quantity
                };
            })
        );

        // Calculate totals
        const shippingCost = Number(checkoutData.shippingCost) || 100;
        const discountAmount = Number(checkoutData.discountAmount) || 0;
        const cartTotal = populatedItems.reduce((sum, item) => sum + item.itemTotal, 0);
        const totalAmount = cartTotal + shippingCost - discountAmount;


       


        res.render("checkout3", {
            orderItems: populatedItems,
            user: req.user,
            shippingCost: shippingCost,
            shippingAddress: checkoutData.selectedAddress,
            shippingMethod: checkoutData.shippingMethod,
            paymentMethod: checkoutData.paymentMethod,
            couponCode: checkoutData.couponCode || '',
            discountAmount: discountAmount,
            totalAmount: totalAmount,
            cartTotal: cartTotal,
            checkoutData: checkoutData ,
  
        
        });

    } catch (error) {
        console.error("Error loading checkout3:", error);
        res.status(500).render("page-404");
    }
};
// Save Checkout Step 1 Data
const saveCheckout1 = async (req, res) => {
    try {
        const { selectedAddress, shippingMethod, shippingCost, couponCode, discountAmount } = req.body;

console.log(couponCode)


        if (!req.session.checkoutData) {
            return res.status(400).json({ success: false, message: "Session expired" });
        }

        // Validate address
        const address = await Address.findById(selectedAddress);
        if (!address) {
            return res.status(400).json({ success: false, message: "Invalid address" });
        }

        // Update session data
        req.session.checkoutData.selectedAddress = address;
        req.session.checkoutData.shippingMethod = shippingMethod || 'Standard'; // Fallback to 'Standard'
        req.session.checkoutData.shippingCost = Number(shippingCost) || 100; // Fallback to 100
        req.session.checkoutData.couponCode = couponCode || null,
        req.session.checkoutData.discountAmount = Number(discountAmount) || 0,
        req.session.checkoutData.step = 1;

        res.json({ success: true });
    } catch (error) {
        console.error("Error saving checkout1:", error);
        res.status(500).json({ success: false, message: "Failed to save checkout data" });
    }
};






// // Validate and Apply Coupon
// const validateCoupon = async (req, res) => {
//     try {
//         const { couponCode } = req.body;
//         const userId = req.user._id;
        
//         if (!req.session.checkoutData) {
//             return res.status(400).json({ valid: false, message: "Session expired" });
//         }

//         const cartTotal = req.session.checkoutData.cart.total;
//         const shippingCost = req.session.checkoutData.shippingCost || 100;
//         const totalAmount = cartTotal + shippingCost;

//         // Find the coupon
//         const coupon = await Coupon.findOne({ 
//             code: couponCode.toUpperCase()

//         });


// console.log("coupon")
// console.log(coupon)



//         if (!coupon) {
//             return res.json({ 
//                 valid: false, 
//                 message: 'Invalid or expired coupon code' 
//             });
//         }

//         // Check if user already used this coupon
//         const existingOrder = await Order.findOne({ 
//             user: userId, 
//             couponCode: coupon.code,
//             paymentStatus: 'Completed'
//         });

//         if (existingOrder) {
//             return res.json({
//                 valid: false,
//                 message: 'You have already used this coupon'
//             });
//         }

//         // Check minimum purchase
//         if (totalAmount < coupon.minPurchase) {
//             return res.json({
//                 valid: false,
//                 message: `Minimum purchase of ₹${coupon.minPurchase} required for this coupon`
//             });
//         }

//         // Calculate discount amount
//         const discountAmount = (totalAmount * coupon.discountPercentage) / 100;

//         // Update session with coupon data
//         req.session.checkoutData.couponCode = coupon.code;
//         req.session.checkoutData.discountAmount = discountAmount;

//         console.log({
//             couponCode: coupon.code,
//             totalAmount,
//             discountPercentage: coupon.discountPercentage,
//             discountAmount
//         });




//         res.json({
//             valid: true,
//             message: 'Coupon applied successfully',
//             discountAmount: discountAmount,
//             couponCode: coupon.code
//         });

//     } catch (error) {
//         console.error('Error validating coupon:', error);
//         res.status(500).json({
//             valid: false,
//             message: 'Error validating coupon'
//         });
//     }
// };


const saveCheckout2 = async (req, res) => {
    try {
        const { paymentMethod } = req.body;

        if (!req.session.checkoutData) {
            return res.status(400).json({ success: false, message: "Session expired" });
        }

        // Validate payment method
        if (!['CashOnDelivery', 'Wallet', 'Razorpay'].includes(paymentMethod)) {
            return res.status(400).json({ success: false, message: "Invalid payment method" });
        }

        // Update session
        req.session.checkoutData.paymentMethod = paymentMethod;
        req.session.checkoutData.step = 2;

        // Special handling for wallet - check balance immediately
        if (paymentMethod === 'Wallet') {
            const user = await User.findById(req.user._id);
            const totalAmount = req.session.checkoutData.cart.total + 
                              req.session.checkoutData.shippingCost - 
                              (req.session.checkoutData.discountAmount || 0);
            
            if (user.wallet.balance < totalAmount) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Insufficient wallet balance. Available: ₹${user.wallet.balance.toFixed(2)}, Required: ₹${totalAmount.toFixed(2)}`
                });
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Error saving checkout2:", error);
        res.status(500).json({ success: false, message: "Failed to save payment method" });
    }
};





// Final Order Validation and Placement
const validateAndPlaceOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        if (!req.session.checkoutData) {
            throw new Error("Session expired. Please restart checkout.");
        }

        const checkoutData = req.session.checkoutData;
        const userId = req.user._id;

        // Calculate final amount
        const subtotal = checkoutData.cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shippingCost = Number(checkoutData.shippingCost) || 100;
        const discountAmount = Number(checkoutData.discountAmount) || 0;
        const totalAmount = subtotal + shippingCost - discountAmount;

        // Update session with calculated total
        req.session.checkoutData.totalAmount = totalAmount;
        
        // Validate cart items
        const validItems = [];
        for (const item of checkoutData.cart.items) {
            const product = await Product.findById(item.product)
                .populate('category')
                .session(session);
                
                if (!product || !product.isListed || product.isDeleted) {
                    const productName = product?.productName || 'a product';
                    throw new Error(`"${productName}" is no longer available`);
                }

            const sizeObj = product.sizes.find(s => s.size === item.size);
            if (!sizeObj || sizeObj.stock < item.quantity) {
                throw new Error(`Insufficient stock for ${product.productName} (Size: ${item.size})`);
            }

            validItems.push(item);
        }

        if (validItems.length === 0) {
            throw new Error("No valid items in your order");
        }

        // If payment method is Wallet, validate balance
        if (checkoutData.paymentMethod === 'Wallet') {
            const user = await User.findById(userId).session(session);
            if (user.wallet.balance < totalAmount) {
                throw new Error(`Insufficient wallet balance. Available: ₹${user.wallet.balance.toFixed(2)}, Required: ₹${totalAmount.toFixed(2)}`);
            }
        }

        await session.commitTransaction();

        res.json({
            success: true,
            paymentMethod: checkoutData.paymentMethod,
            totalAmount: totalAmount
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Order validation error:", error);
        res.status(400).json({
            success: false,
            message: error.message,
            redirect: '/cart'
        });
    } finally {
        session.endSession();
    }
};



module.exports = {
    loadCheckout1,
    loadCheckout2,
    loadCheckout3,
    saveCheckout1,
    saveCheckout2,
  
    validateAndPlaceOrder,
    removeCoupon
};