const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Coupon = require("../../models/couponSchema");
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { STATUS, MSG } = require('../../utils/responseConstants');
const AppError = require('../../utils/AppError');

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
            throw new AppError(MSG.CHECKOUT_SESSION_EXPIRED, STATUS.BAD_REQUEST);
        }

        const checkoutData = req.session.checkoutData;
        const userId = req.user._id;

        // Calculate final amount
        const subtotal = checkoutData.cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shippingCost = Number(checkoutData.shippingCost) || 100;
        const discountAmount = Number(checkoutData.discountAmount) || 0;
        const totalAmount = subtotal + shippingCost - discountAmount;

  
        if (totalAmount > 7000) {
            await session.abortTransaction();
            return res.status(STATUS.BAD_REQUEST).json({ 
                success: false, 
                message: MSG.COD_LIMIT_EXCEEDED,
                limitExceeded: true
            });
        }

  
        if (req.session.pendingOrder) {

            const existingOrder = await Order.findById(req.session.pendingOrder.orderId);
            
            if (existingOrder && existingOrder.status === 'Payment Processing') {
                // Update the existing order to COD
                existingOrder.paymentMethod = 'CashOnDelivery';
                existingOrder.status = 'Ordered';
                existingOrder.paymentStatus = 'Pending';
                existingOrder.orderedDate = new Date();
                await existingOrder.save({ session });
                
              
                delete req.session.pendingOrder;
                delete req.session.checkoutData;
                await req.session.save();
                
         
                await Cart.findOneAndDelete({ user: userId }).session(session);
                
                await session.commitTransaction();
                
                return res.json({
                    success: true,
                    orderId: existingOrder._id,
                    redirectUrl: `/order-success/${existingOrder._id}`
                });
            }
        }

        // new order if no pending order exists
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

     
        delete req.session.checkoutData;
        delete req.session.pendingOrder; 
        await req.session.save();

        await session.commitTransaction();

        res.status(STATUS.OK).json({
            success: true,
            orderId: order._id,
            redirectUrl: `/order-success/${order._id}`
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("COD processing error:", error);
        res.status(STATUS.BAD_REQUEST).json({
            success: false,
            message: error.message || MSG.COD_PROCESSING_FAILED
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
            throw new AppError(MSG.CHECKOUT_SESSION_EXPIRED, STATUS.BAD_REQUEST);
        }

        const checkoutData = req.session.checkoutData;
        const userId = req.user._id;
        const user = await User.findById(userId).session(session);

        if (!user) {
            throw new AppError(MSG.USER_NOT_FOUND, STATUS.NOT_FOUND);
        }

        // Calculate final amount
        const subtotal = checkoutData.cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shippingCost = Number(checkoutData.shippingCost) || 100;
        const discountAmount = Number(checkoutData.discountAmount) || 0;
        const totalAmount = subtotal + shippingCost - discountAmount;

        // Check wallet balance
        if (user.wallet.balance < totalAmount) {
            throw new AppError(MSG.WALLET_INSUFFICIENT, STATUS.BAD_REQUEST);
        }

        // order
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

        // Deduct
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

        res.status(STATUS.OK).json({
            success: true,
            orderId: order._id,
            redirectUrl: `/order-success/${order._id}`
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Wallet processing error:", error);
        res.status(STATUS.BAD_REQUEST).json({
            success: false,
            message: error.message || MSG.WALLET_PAYMENT_FAILED
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
            throw new AppError(MSG.CHECKOUT_SESSION_EXPIRED, STATUS.BAD_REQUEST);
        }

        const checkoutData = req.session.checkoutData;
        const userId = req.user._id;

        // Calculate final amount
        const subtotal = checkoutData.cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shippingCost = Number(checkoutData.shippingCost) || 100;
        const discountAmount = Number(checkoutData.discountAmount) || 0;
        const totalAmount = subtotal + shippingCost - discountAmount;


        if (req.session.pendingOrder) {
     
            const existingOrder = await Order.findById(req.session.pendingOrder.orderId);
            
            if (existingOrder && existingOrder.status === 'Payment Processing') {
        
                const razorpayOrder = await razorpay.orders.create({
                    amount: Math.round(totalAmount * 100), 
                    currency: 'INR',
                    receipt: `order_${existingOrder._id}`,
                    notes: {
                        orderId: existingOrder._id.toString()
                    }
                });
                
                // Update session with new Razorpay order ID
                req.session.pendingOrder.razorpayOrderId = razorpayOrder.id;
                await req.session.save();
                
                await session.commitTransaction();
                
                return res.json({
                    success: true,
                    orderId: existingOrder._id,
                    razorpayOrderId: razorpayOrder.id, 
                    totalAmount: totalAmount
                });
            }
        }


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

    
        const razorpayOrder = await razorpay.orders.create({
            amount: Math.round(totalAmount * 100), 
            receipt: `order_${order._id}`,
            notes: {
                orderId: order._id.toString()
            }
        });


        req.session.pendingOrder = {
            orderId: order._id.toString(),
            razorpayOrderId: razorpayOrder.id,
            amount: totalAmount
        };
        
        await req.session.save();
        await session.commitTransaction();

        res.status(STATUS.OK).json({
            success: true,
            orderId: order._id,
            razorpayOrderId: razorpayOrder.id, 
            totalAmount: totalAmount
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Razorpay processing error:", error);
        res.status(STATUS.BAD_REQUEST).json({
            success: false,
            message: error.message || MSG.RAZORPAY_PROCESSING_FAILED
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
      
        const requiredFields = ['razorpay_payment_id', 'razorpay_order_id', 'razorpay_signature', 'orderId'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        
        if (missingFields.length > 0) {
            throw new AppError(MSG.PAYMENT_FIELDS_MISSING, STATUS.BAD_REQUEST);
        }

        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, orderId } = req.body;

        // Verify signature
        const generatedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            throw new AppError(MSG.PAYMENT_SIGNATURE_MISMATCH, STATUS.BAD_REQUEST);
        }

        // Find the order
        const order = await Order.findById(orderId).session(session);
        if (!order) {
            throw new AppError(MSG.ORDER_NOT_FOUND, STATUS.NOT_FOUND);
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

        return res.status(STATUS.OK).json({ 
            success: true,
            orderId: order._id
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Payment verification failed:", error);
     
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

        return res.status(STATUS.BAD_REQUEST).json({ 
            success: false,
            message: error.message || MSG.PAYMENT_VERIFY_FAILED,
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
            throw new AppError(MSG.ORDER_NOT_FOUND, STATUS.NOT_FOUND);
        }
        
        // Only allow retry for orders in Payment Processing or Failed status
        if (order.status !== "Payment Processing" && order.status !== "Failed") {
            throw new AppError(MSG.PAYMENT_RETRY_NOT_ALLOWED, STATUS.BAD_REQUEST);
        }


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

        //  for verification
        req.session.retryPayment = {
            orderId: orderId,
            razorpayOrderId: razorpayOrder.id
        };
        await req.session.save();

        await session.commitTransaction();

      
        res.status(STATUS.OK).json({
            success: true,
            orderId: order._id,
            razorpayOrderId: razorpayOrder.id,
            totalAmount: order.totalAmount,
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Retry Payment Error:", error);
        res.status(STATUS.BAD_REQUEST).json({
            success: false,
            message: error.message || MSG.PAYMENT_RETRY_FAILED
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
     
        const requiredFields = ['razorpay_payment_id', 'razorpay_order_id', 'razorpay_signature', 'orderId'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        
        if (missingFields.length > 0) {
            throw new AppError(MSG.PAYMENT_FIELDS_MISSING, STATUS.BAD_REQUEST);
        }

        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, orderId } = req.body;
        
   
        const generatedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            throw new AppError(MSG.PAYMENT_SIGNATURE_MISMATCH, STATUS.BAD_REQUEST);
        }

    
        const order = await Order.findById(orderId).session(session);
        if (!order) {
            throw new AppError(MSG.ORDER_NOT_FOUND, STATUS.NOT_FOUND);
        }

        order.status = 'Ordered';
        order.paymentStatus = 'Completed';
        order.paymentId = razorpay_payment_id;
        order.orderedDate = new Date();
        await order.save({ session });

      
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

        res.status(STATUS.OK).json({ 
            success: true,
            orderId: order._id,
            redirectUrl: `/order-success/${order._id}`
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Retry Payment Verification Error:", error);
        
        
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

        res.status(STATUS.BAD_REQUEST).json({ 
            success: false,
            message: error.message || MSG.PAYMENT_VERIFY_FAILED,
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
        const userId = req.user._id; 
        
        if (!couponCode || !totalAmount) {
            return res.status(STATUS.BAD_REQUEST).json({ 
                valid: false, 
                message: MSG.MISSING_FIELDS
            });
        }

        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });

        if (!coupon) {
            return res.status(STATUS.NOT_FOUND).json({ 
                valid: false, 
                message: MSG.COUPON_INVALID
            });
        }

        const currentDate = new Date();
        if (currentDate < coupon.startDate || currentDate > coupon.endDate) {
            return res.status(STATUS.BAD_REQUEST).json({ 
                valid: false, 
                message: MSG.COUPON_INVALID
            });
        }

 
        const existingOrder = await Order.findOne({ 
            user: userId, 
            couponCode: coupon.code,
            paymentStatus: { $in: ['Completed', 'Pending'] } 
        });

        if (existingOrder) {
            return res.status(STATUS.BAD_REQUEST).json({
                valid: false,
                message: MSG.COUPON_ALREADY_USED
            });
        }

        if (totalAmount < coupon.minPurchase) {
            return res.status(STATUS.BAD_REQUEST).json({ 
                valid: false, 
                message: MSG.COUPON_MIN_PURCHASE
            });
        }

        const discountAmount = (totalAmount * coupon.discountPercentage) / 100;
        const finalAmount = totalAmount - discountAmount;

        // Update session with coupon data
        if (req.session.checkoutData) {
            req.session.checkoutData.couponCode = coupon.code;
            req.session.checkoutData.discountAmount = discountAmount;
            await req.session.save();
        }

        res.status(STATUS.OK).json({ 
            valid: true,
            discountAmount,
            finalAmount,
            message: MSG.COUPON_APPLIED
        });
    } catch (error) {
        console.error("Error in coupon validation:", error);
        res.status(STATUS.INTERNAL_ERROR).json({ 
            valid: false, 
            message: MSG.COUPON_VALIDATION_FAILED
        });
    }
};

// Save failed order
const saveFailedOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { orderId, errorDetails } = req.body;
        
        if (!orderId) {
            throw new AppError(MSG.ORDER_NOT_FOUND, STATUS.NOT_FOUND);
        }
        
        const order = await Order.findById(orderId).session(session);
        if (!order) {
            throw new AppError(MSG.ORDER_NOT_FOUND, STATUS.NOT_FOUND);
        }
        
        order.status ='Payment Processing';
        order.paymentStatus = 'Failed';
        order.errorDetails = errorDetails || 'Payment failed';
        await order.save({ session });
        
        await session.commitTransaction();
        
        res.status(STATUS.OK).json({ 
            success: true, 
            orderId: order._id,
            redirectUrl: `/order-failed/${order._id}`
        });
    } catch (error) {
        await session.abortTransaction();
        console.error("Error saving failed order:", error);
        res.status(STATUS.INTERNAL_ERROR).json({ 
            success: false,
            message: error.message || MSG.PAYMENT_STATUS_UPDATE_FAILED
        });
    } finally {
        session.endSession();
    }
};

// Cleanup failed orders 
const cleanupFailedOrders = async () => {
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); 
        
        
        const staleOrders = await Order.find({
            status: 'Payment Processing',
            paymentStatus: 'Pending',
            createdAt: { $lt: oneHourAgo } 
        });
        
  
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