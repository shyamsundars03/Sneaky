const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Coupon = require("../../models/couponSchema");
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Common order creation function
const createOrder = async (userId, orderData) => {
    const cart = await Cart.findOne({ user: userId }).populate("cartItems.product");
    
    if (!cart || cart.cartItems.length === 0) {
        throw new Error("Cart is empty");
    }

    const productsTotal = cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
    const totalAmount = productsTotal + Number(orderData.shippingCost || 0);
    
    // Apply coupon discount if exists
    let discountAmount = 0;
    if (orderData.couponCode) {
        const coupon = await Coupon.findOne({ code: orderData.couponCode.toUpperCase() });
        if (coupon && totalAmount >= coupon.minPurchase) {
            discountAmount = (totalAmount * coupon.discountPercentage) / 100;
        }
    }

    const finalAmount = totalAmount - discountAmount

    const order = new Order({
        user: userId,
        items: cart.cartItems.map(item => ({
            product: item.product._id,
            quantity: item.quantity,
            price: item.price,
            size: item.size,
        })),
        shippingAddress: orderData.shippingAddress,
        paymentMethod: orderData.paymentMethod,
        shippingMethod: orderData.shippingMethod,
        shippingCost: Number(orderData.shippingCost || 0),
        totalAmount: finalAmount,
        couponCode: orderData.couponCode,
        discountAmount: discountAmount,
        transactionId: `ORD${Math.floor(100000 + Math.random() * 900000)}`,
        status: orderData.paymentMethod === 'CashOnDelivery' ? 'Pending' : 'Processing'
    });

    await order.save();
    
    // Update stock
    const bulkOps = cart.cartItems.map(item => ({
        updateOne: {
            filter: { 
                _id: item.product._id,
                "sizes.size": item.size,
            },
            update: { 
                $inc: { "sizes.$.stock": -item.quantity },
            },
        },
    }));
    await Product.bulkWrite(bulkOps);

    // Clear cart
    await Cart.findOneAndDelete({ user: userId });

    return order;
};



const processCOD = async (req, res) => {
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

        // Check COD limit (7000)
        if (totalAmount > 7000) {
            return res.status(400).json({ 
                success: false, 
                message: "Cash on Delivery available only for orders below ₹7000",
                limitExceeded: true
            });
        }

        // Create order
        const order = new Order({
            user: userId,
            items: checkoutData.cart.items,
            shippingAddress: checkoutData.selectedAddress,
            paymentMethod: 'CashOnDelivery',
            shippingMethod: checkoutData.shippingMethod,
            shippingCost: shippingCost,
            totalAmount: totalAmount, // Make sure this is set
            couponCode: checkoutData.couponCode,
            discountAmount: discountAmount,
            transactionId: `ORD${Math.floor(100000 + Math.random() * 900000)}`,
            status: 'Ordered',
            paymentStatus: 'Pending'
        });

        await order.save({ session });

        // Update stock
        const bulkOps = checkoutData.cart.items.map(item => ({
            updateOne: {
                filter: { 
                    _id: item.product,
                    "sizes.size": item.size
                },
                update: { 
                    $inc: { "sizes.$.stock": -item.quantity }
                }
            }
        }));
        await Product.bulkWrite(bulkOps, { session });

        // Clear cart
        await Cart.findOneAndDelete({ user: userId }).session(session);

        // Clear checkout session
        delete req.session.checkoutData;

        await session.commitTransaction();

        res.json({
            success: true,
            orderId: order._id,
            redirectUrl: `/order-success/${order._id}`
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("COD processing error:", error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    } finally {
        session.endSession();
    }
};

const processWallet = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        if (!req.session.checkoutData) {
            throw new Error("Session expired. Please restart checkout.");
        }

        const checkoutData = req.session.checkoutData;
        const userId = req.user._id;
        const user = await User.findById(userId).session(session);

        // Check wallet balance
        if (user.wallet.balance < checkoutData.totalAmount) {
            throw new Error(`Insufficient wallet balance. Available: ₹${user.wallet.balance.toFixed(2)}, Required: ₹${checkoutData.totalAmount.toFixed(2)}`);
        }

        // Create order
        const order = new Order({
            user: userId,
            items: checkoutData.cart.items,
            shippingAddress: checkoutData.selectedAddress,
            paymentMethod: 'Wallet',
            shippingMethod: checkoutData.shippingMethod,
            shippingCost: checkoutData.shippingCost,
            totalAmount: checkoutData.totalAmount,
            couponCode: checkoutData.couponCode,
            discountAmount: checkoutData.discountAmount,
            transactionId: `ORD${Math.floor(100000 + Math.random() * 900000)}`,
            status: 'Ordered',
            paymentStatus: 'Completed'
        });

        await order.save({ session });

        // Deduct from wallet
        user.wallet.balance -= checkoutData.totalAmount;
        user.wallet.transactions.push({
            type: 'debit',
            amount: checkoutData.totalAmount,
            description: `Payment for order ${order.transactionId}`,
            date: new Date()
        });
        await user.save({ session });

        // Update stock
        const bulkOps = checkoutData.cart.items.map(item => ({
            updateOne: {
                filter: { 
                    _id: item.product,
                    "sizes.size": item.size
                },
                update: { 
                    $inc: { "sizes.$.stock": -item.quantity }
                }
            }
        }));
        await Product.bulkWrite(bulkOps, { session });

        // Clear cart
        await Cart.findOneAndDelete({ user: userId }).session(session);

        // Clear checkout session
        delete req.session.checkoutData;

        await session.commitTransaction();

        res.json({
            success: true,
            orderId: order._id,
            redirectUrl: `/order-success/${order._id}`
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Wallet processing error:", error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    } finally {
        session.endSession();
    }
};

const processRazorpay = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        if (!req.session.checkoutData) {
            throw new Error("Session expired. Please restart checkout.");
        }

        const checkoutData = req.session.checkoutData;
        const userId = req.user._id;

        // Create order in database first
        const order = new Order({
            user: userId,
            items: checkoutData.cart.items,
            shippingAddress: checkoutData.selectedAddress,
            paymentMethod: 'Razorpay',
            shippingMethod: checkoutData.shippingMethod,
            shippingCost: checkoutData.shippingCost,
            totalAmount: checkoutData.totalAmount,
            couponCode: checkoutData.couponCode,
            discountAmount: checkoutData.discountAmount,
            transactionId: `ORD${Math.floor(100000 + Math.random() * 900000)}`,
            status: 'Payment Processing',
            paymentStatus: 'Pending'
        });

        await order.save({ session });

        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(checkoutData.totalAmount * 100),
            currency: 'INR',
            receipt: `order_${order._id}`
        });

        // Store minimal data in session
        req.session.razorpayOrder = {
            orderId: order._id,
            razorpayOrderId: razorpayOrder.id
        };

        await session.commitTransaction();

        res.json({
            success: true,
            orderId: order._id,
            razorpayOrderId: razorpayOrder.id, 
            totalAmount: checkoutData.totalAmount
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Razorpay processing error:", error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    } finally {
        session.endSession();
    }
};

// Verify Razorpay
const verifyRazorpay = async (req, res) => {
    // Validate all required fields
    const requiredFields = ['razorpay_payment_id', 'razorpay_order_id', 'razorpay_signature', 'orderId'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
        console.error('Missing required fields:', missingFields);
        return res.status(400).json({
            success: false,
            message: `Missing required fields: ${missingFields.join(', ')}`,
            orderId: req.body.orderId
        });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, orderId } = req.body;

        // Verify signature
        const generatedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            throw new Error("Payment verification failed - signature mismatch");
        }

        // Update order status
        const order = await Order.findByIdAndUpdate(orderId, {
            status: 'Ordered',
            paymentStatus: 'Completed',
            paymentId: razorpay_payment_id
        }, { new: true, session });

        if (!order) {
            throw new Error("Order not found");
        }

        // Reduce stock
        const bulkOps = order.items.map(item => ({
            updateOne: {
                filter: { 
                    _id: item.product,
                    "sizes.size": item.size
                },
                update: { 
                    $inc: { "sizes.$.stock": -item.quantity }
                }
            }
        }));
        await Product.bulkWrite(bulkOps, { session });

        // Clear cart
        await Cart.findOneAndDelete({ user: order.user }).session(session);

        await session.commitTransaction();

        return res.json({ 
            success: true,
            orderId: order._id
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Payment verification failed:", error);
        
        // Update order status to failed
        if (req.body.orderId) {
            await Order.findByIdAndUpdate(req.body.orderId, {
                status: 'Payment Processing',
                paymentStatus: 'Failed',
                errorDetails: error.message
            });
        }

        return res.json({ 
            success: false,
            message: error.message || "Payment verification failed",
            orderId: req.body.orderId
        });
    } finally {
        session.endSession();
    }
};

// Validate Coupon
const validateCoupon = async (req, res) => {
    try {
        const { couponCode, totalAmount } = req.body;
        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

        if (!coupon) {
            return res.json({ valid: false, message: "Invalid coupon code" });
        }

        const currentDate = new Date();
        if (currentDate < coupon.startDate || currentDate > coupon.endDate) {
            return res.json({ valid: false, message: "Coupon has expired" });
        }

        if (totalAmount < coupon.minPurchase) {
            return res.json({ 
                valid: false, 
                message: `Minimum purchase of ₹${coupon.minPurchase} required` 
            });
        }

        const discountAmount = (totalAmount * coupon.discountPercentage) / 100;
        const finalAmount = totalAmount - discountAmount

        res.json({ 
            valid: true,
            discountAmount,
            finalAmount,
            message: `Coupon applied! You saved ₹${discountAmount}`
        });
    } catch (error) {
        console.error("Error in coupon validation:", error);
        res.status(500).json({ valid: false, message: "Error validating coupon" });
    }
};


const saveFailedOrder = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, shippingAddress, shippingMethod, shippingCost, couponCode } = req.body;
        const userId = req.user._id;
        
        const cart = await Cart.findOne({ user: userId }).populate("cartItems.product");
        if (!cart) throw new Error("Cart not found");

        const order = new Order({
            user: userId,
            items: cart.cartItems.map(item => ({
                product: item.product._id,
                quantity: item.quantity,
                price: item.price,
                size: item.size
            })),
            shippingAddress,
            paymentMethod: 'Razorpay',
            shippingMethod,
            shippingCost,
            totalAmount: cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0) + Number(shippingCost),
            transactionId: `ORD${Math.floor(100000 + Math.random() * 900000)}`,
            paymentStatus: 'Failed',
            status: 'Payment Processing',
            paymentId: razorpay_payment_id
        });

        await order.save();
        res.json({ success: true, orderId: order._id });
    } catch (error) {
        console.error("Error saving failed order:", error);
        res.status(500).json({ success: false });
    }
};

const handlePaymentSuccess = async (order, res) => {
    order.paymentStatus = 'Completed';
    order.status = 'Pending'; // Change from 'Payment Processing' to 'Pending'
    await order.save();
    
    // Clear cart if exists
    await Cart.findOneAndDelete({ user: order.user });
    
    return res.json({ 
        success: true, 
        orderId: order._id,
        transactionId: order.transactionId
    });
};

const handlePaymentFailure = async (order, res) => {
    order.paymentStatus = 'Failed';
    order.status = 'Payment Processing';
    await order.save();
    
    return res.json({ 
        success: false, 
        orderId: order._id,
        transactionId: order.transactionId,
        message: 'Payment failed but order was saved'
    });
};

const retryPayment = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId).session(session);
        
        if (!order) throw new Error("Order not found");
        if (order.status !== "Payment Processing") throw new Error("Cannot retry this order");

        // Create Razorpay order
        const options = {
            amount: Math.round(order.totalAmount * 100),
            currency: 'INR',
            receipt: `retry_${order._id}`
        };
        
        const razorpayOrder = await razorpay.orders.create(options);
        
        // Update order with retry info
        order.paymentAttempts = (order.paymentAttempts || 0) + 1;
        order.razorpayOrderId = razorpayOrder.id;
        await order.save({ session });

        await session.commitTransaction();

        res.json({
            success: true,
            razorpayOrder,
            key: process.env.RAZORPAY_KEY_ID,
            orderId: order._id
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Retry Payment Error:", error);
        res.status(400).json({ 
            success: false,
            message: error.message
        });
    } finally {
        session.endSession();
    }
};




const verifyRetryPayment = async (req, res) => {
    try {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, orderId } = req.body;
        
        // 1. Verify signature
        const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid payment signature" 
            });
        }

        // 2. Update order status
        const order = await Order.findByIdAndUpdate(orderId, {
            status: 'Pending',
            paymentStatus: 'Completed',
            paymentId: razorpay_payment_id,
            $unset: { paymentAttempts: 1 }
        }, { new: true });

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: "Order not found" 
            });
        }

        res.json({ 
            success: true,
            orderId: order._id
        });

    } catch (error) {
        console.error("Verify Payment Error:", error);
        res.status(500).json({ 
            success: false,
            message: "Payment verification failed"
        });
    }
};


const cleanupFailedOrders = async () => {
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
        
        // Delete orders that are stuck in "Payment Processing"
        const result = await Order.deleteMany({
            status: 'Payment Processing',
            paymentStatus: 'Pending',
            createdAt: { $lt: oneHourAgo } // Older than 1 hour
        });
        
        console.log(`🔄 Cleaned up ${result.deletedCount} stale orders`);
    } catch (error) {
        console.error('❌ Error cleaning up failed orders:', error);
    }
};





module.exports = {
    processCOD,
    processWallet,
    processRazorpay,
    verifyRazorpay,
    validateCoupon,
    saveFailedOrder,
    retryPayment,
    verifyRetryPayment,
    handlePaymentFailure ,
    handlePaymentSuccess,
    cleanupFailedOrders
};