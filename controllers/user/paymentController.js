const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Coupon = require("../../models/couponSchema");
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');

// Initialize Razorpay with proper error handling
let razorpay;
try {
    razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
} catch (error) {
    console.error("Failed to initialize Razorpay:", error);
}

// Process COD payment
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
            await session.abortTransaction();
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
            totalAmount: totalAmount,
            couponCode: checkoutData.couponCode,
            discountAmount: discountAmount,
            transactionId: `ORD${Math.floor(100000 + Math.random() * 900000)}`,
            status: 'Ordered',
            paymentStatus: 'Pending',
            orderedDate: new Date()
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
        await req.session.save();

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
            message: error.message || "Failed to process COD payment"
        });
    } finally {
        session.endSession();
    }
};

// Process wallet payment
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

        if (!user) {
            throw new Error("User not found");
        }

        // Calculate final amount
        const subtotal = checkoutData.cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shippingCost = Number(checkoutData.shippingCost) || 100;
        const discountAmount = Number(checkoutData.discountAmount) || 0;
        const totalAmount = subtotal + shippingCost - discountAmount;

        // Check wallet balance
        if (user.wallet.balance < totalAmount) {
            throw new Error(`Insufficient wallet balance. Available: ₹${user.wallet.balance.toFixed(2)}, Required: ₹${totalAmount.toFixed(2)}`);
        }

        // Create order
        const order = new Order({
            user: userId,
            items: checkoutData.cart.items,
            shippingAddress: checkoutData.selectedAddress,
            paymentMethod: 'Wallet',
            shippingMethod: checkoutData.shippingMethod,
            shippingCost: shippingCost,
            totalAmount: totalAmount,
            couponCode: checkoutData.couponCode,
            discountAmount: discountAmount,
            transactionId: `ORD${Math.floor(100000 + Math.random() * 900000)}`,
            status: 'Ordered',
            paymentStatus: 'Completed',
            orderedDate: new Date(),
            walletDetails: {
                amountDeducted: totalAmount,
                previousBalance: user.wallet.balance,
                newBalance: user.wallet.balance - totalAmount
            }
        });

        await order.save({ session });

        // Deduct from wallet
        const previousBalance = user.wallet.balance;
        user.wallet.balance -= totalAmount;
        user.wallet.transactions.push({
            type: 'debit',
            amount: totalAmount,
            description: `Payment for order ${order.transactionId}`,
            date: new Date(),
            orderId: order._id 
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
        await req.session.save();

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
            message: error.message || "Failed to process wallet payment"
        });
    } finally {
        session.endSession();
    }
};

// Process Razorpay payment
const processRazorpay = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        if (!req.session.checkoutData) {
            throw new Error("Session expired. Please restart checkout.");
        }


console.log(req.body)


        const checkoutData = req.session.checkoutData;
        const userId = req.user._id;

        // Calculate final amount
        const subtotal = checkoutData.cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shippingCost = Number(checkoutData.shippingCost) || 100;
        const discountAmount = Number(checkoutData.discountAmount) || 0;
        const totalAmount = subtotal + shippingCost - discountAmount;

        // Create order in database first
        const order = new Order({
            user: userId,
            items: checkoutData.cart.items,
            shippingAddress: checkoutData.selectedAddress,
            paymentMethod: 'Razorpay',
            shippingMethod: checkoutData.shippingMethod,
            shippingCost: shippingCost,
            totalAmount: totalAmount,
            couponCode: checkoutData.couponCode,
            discountAmount: discountAmount,
            transactionId: `ORD${Math.floor(100000 + Math.random() * 900000)}`,
            status: 'Payment Processing',
            paymentStatus: 'Pending'
        });

        await order.save({ session });

        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(totalAmount * 100), // Convert to paise
            currency: 'INR',
            receipt: `order_${order._id}`,
            notes: {
                orderId: order._id.toString()
            }
        });

        // Store order details in session
        req.session.pendingOrder = {
            orderId: order._id.toString(),
            razorpayOrderId: razorpayOrder.id,
            amount: totalAmount
        };
        
        await req.session.save();
        await session.commitTransaction();

        res.json({
            success: true,
            orderId: order._id,
            razorpayOrderId: razorpayOrder.id, 
            totalAmount: totalAmount
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Razorpay processing error:", error);
        res.status(400).json({
            success: false,
            message: error.message || "Failed to process Razorpay payment"
        });
    } finally {
        session.endSession();
    }
};

// Verify Razorpay payment
const verifyRazorpay = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Validate all required fields
        const requiredFields = ['razorpay_payment_id', 'razorpay_order_id', 'razorpay_signature', 'orderId'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        
        if (missingFields.length > 0) {
            throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }

        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, orderId } = req.body;

        // Verify signature
        const generatedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            throw new Error("Payment verification failed - signature mismatch");
        }

        // Find the order
        const order = await Order.findById(orderId).session(session);
        if (!order) {
            throw new Error("Order not found");
        }

        // Update order status
        order.status = 'Ordered';
        order.paymentStatus = 'Completed';
        order.paymentId = razorpay_payment_id;
        order.orderedDate = new Date();
        await order.save({ session });

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

        // Clear session data
        if (req.session.pendingOrder) {
            delete req.session.pendingOrder;
        }
        if (req.session.checkoutData) {
            delete req.session.checkoutData;
        }
        await req.session.save();

        await session.commitTransaction();

        return res.json({ 
            success: true,
            orderId: order._id
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Payment verification failed:", error);
        
        // Update order status to failed if orderId exists
        if (req.body && req.body.orderId) {
            try {
                await Order.findByIdAndUpdate(req.body.orderId, {
                    status: 'Payment Processing',
                    paymentStatus: 'Failed',
                    errorDetails: error.message
                });
            } catch (updateError) {
                console.error("Failed to update order status:", updateError);
            }
        }

        return res.status(400).json({ 
            success: false,
            message: error.message || "Payment verification failed",
            orderId: req.body.orderId
        });
    } finally {
        session.endSession();
    }
};

// Retry payment for failed orders
const retryPayment = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId).session(session);
        
        if (!order) {
            throw new Error("Order not found");
        }
        
        // Only allow retry for orders in Payment Processing or Failed status
        if (order.status !== "Payment Processing" && order.status !== "Failed") {
            throw new Error("This order cannot be retried");
        }

        // Convert amount to paise
        const amount = Math.round(order.totalAmount * 100);
        
        // Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: amount,
            currency: 'INR',
            receipt: order.transactionId || `retry_${orderId}`,
            notes: {
                orderId: orderId,
                isRetry: true
            }
        });

        // Update order with new Razorpay order ID
        order.paymentAttempts = (order.paymentAttempts || 0) + 1;
        order.razorpayOrderId = razorpayOrder.id;
        await order.save({ session });

        // Store in session for verification
        req.session.retryPayment = {
            orderId: orderId,
            razorpayOrderId: razorpayOrder.id
        };
        await req.session.save();

        await session.commitTransaction();

        // Return response
        res.json({
            success: true,
            orderId: order._id,
            razorpayOrderId: razorpayOrder.id,
            totalAmount: order.totalAmount,
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Retry Payment Error:", error);
        res.status(400).json({
            success: false,
            message: error.message || "Failed to retry payment"
        });
    } finally {
        session.endSession();
    }
};

// Verify retry payment
const verifyRetryPayment = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        // Validate all required fields
        const requiredFields = ['razorpay_payment_id', 'razorpay_order_id', 'razorpay_signature', 'orderId'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        
        if (missingFields.length > 0) {
            throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }

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
        const order = await Order.findById(orderId).session(session);
        if (!order) {
            throw new Error("Order not found");
        }

        order.status = 'Ordered';
        order.paymentStatus = 'Completed';
        order.paymentId = razorpay_payment_id;
        order.orderedDate = new Date();
        await order.save({ session });

        // Reduce stock if not already done
        if (!order.stockReduced) {
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
            order.stockReduced = true;
            await order.save({ session });
        }

        // Clear session data
        if (req.session.retryPayment) {
            delete req.session.retryPayment;
        }
        await req.session.save();

        await session.commitTransaction();

        res.json({ 
            success: true,
            orderId: order._id,
            redirectUrl: `/order-success/${order._id}`
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Retry Payment Verification Error:", error);
        
        // Update order status to failed
        if (req.body && req.body.orderId) {
            try {
                await Order.findByIdAndUpdate(req.body.orderId, {
                    status: 'Payment Processing',
                    paymentStatus: 'Failed',
                    errorDetails: error.message
                });
            } catch (updateError) {
                console.error("Failed to update order status:", updateError);
            }
        }

        res.status(400).json({ 
            success: false,
            message: error.message || "Payment verification failed",
            orderId: req.body.orderId
        });
    } finally {
        session.endSession();
    }
};

// Validate coupon
const validateCoupon = async (req, res) => {
    try {
        const { couponCode, totalAmount } = req.body;
        
        if (!couponCode || !totalAmount) {
            return res.json({ 
                valid: false, 
                message: "Coupon code and total amount are required" 
            });
        }

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
        const finalAmount = totalAmount - discountAmount;

        res.json({ 
            valid: true,
            discountAmount,
            finalAmount,
            message: `Coupon applied! You saved ₹${discountAmount.toFixed(2)}`
        });
    } catch (error) {
        console.error("Error in coupon validation:", error);
        res.status(500).json({ valid: false, message: "Error validating coupon" });
    }
};

// Save failed order
const saveFailedOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { orderId, errorDetails } = req.body;
        
        if (!orderId) {
            throw new Error("Order ID is required");
        }
        
        const order = await Order.findById(orderId).session(session);
        if (!order) {
            throw new Error("Order not found");
        }
        
        order.status ='Payment Processing';
        order.paymentStatus = 'Failed';
        order.errorDetails = errorDetails || 'Payment failed';
        await order.save({ session });
        
        await session.commitTransaction();
        
        res.json({ 
            success: true, 
            orderId: order._id,
            redirectUrl: `/order-failed/${order._id}`
        });
    } catch (error) {
        await session.abortTransaction();
        console.error("Error saving failed order:", error);
        res.status(500).json({ 
            success: false,
            message: error.message || "Failed to save order status"
        });
    } finally {
        session.endSession();
    }
};

// Cleanup failed orders (can be run as a scheduled job)
const cleanupFailedOrders = async () => {
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
        
        // Find orders that are stuck in "Payment Processing"
        const staleOrders = await Order.find({
            status: 'Payment Processing',
            paymentStatus: 'Pending',
            createdAt: { $lt: oneHourAgo } // Older than 1 hour
        });
        
        // Update them to Failed instead of deleting
        for (const order of staleOrders) {
            order.status = 'Failed';
            order.paymentStatus = 'Failed';
            order.errorDetails = 'Payment timed out';
            await order.save();
        }
        
        console.log(`🔄 Cleaned up ${staleOrders.length} stale orders`);
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
    cleanupFailedOrders
};