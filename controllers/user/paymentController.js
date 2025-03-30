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

    const finalAmount = totalAmount - discountAmount;

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

// Cash on Delivery
const processCOD = async (req, res) => {
    try {
        const { shippingAddress, shippingMethod, shippingCost, couponCode } = req.body;
        const userId = req.user._id;

        // Get cart to calculate total
        const cart = await Cart.findOne({ user: userId }).populate("cartItems.product");
        if (!cart || cart.cartItems.length === 0) {
            return res.status(400).json({ success: false, message: "Cart is empty" });
        }

        // Calculate total amount
        const productsTotal = cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
        const totalAmount = productsTotal + Number(shippingCost || 0);
        
        // Apply coupon discount if exists
        let discountAmount = 0;
        if (couponCode) {
            const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
            if (coupon && totalAmount >= coupon.minPurchase) {
                discountAmount = (totalAmount * coupon.discountPercentage) / 100;
            }
        }

        const finalAmount = totalAmount - discountAmount;

        // Check COD limit (7000)
        if (finalAmount > 7000) {
            return res.status(400).json({ 
                success: false, 
                message: "Cash on Delivery available only for orders below ₹7000. Please choose another payment method.",
                limitExceeded: true
            });
        }

        // Proceed with order creation if within limit
        const order = await createOrder(userId, {
            shippingAddress,
            shippingMethod,
            shippingCost,
            paymentMethod: 'CashOnDelivery',
            couponCode
        });

        res.json({ 
            success: true, 
            orderId: order._id,
            transactionId: order.transactionId
        });
    } catch (error) {
        console.error("Error in COD processing:", error);
        res.status(500).json({ success: false, message: "Failed to place COD order" });
    }
};



// In paymentController.js - update processWallet function
const processWallet = async (req, res) => {
    try {
        const { shippingAddress, shippingMethod, shippingCost, couponCode } = req.body;
        const userId = req.user._id;
        
        // Get user with wallet balance
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: "User not found" 
            });
        }

        // Get cart and calculate total
        const cart = await Cart.findOne({ user: userId }).populate("cartItems.product");
        if (!cart || cart.cartItems.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: "Cart is empty" 
            });
        }

        // Calculate amounts
        const productsTotal = cart.cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
        const totalAmount = productsTotal + Number(shippingCost || 0);
        
        // Apply coupon discount
        let discountAmount = 0;
        if (couponCode) {
            const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
            if (coupon && totalAmount >= coupon.minPurchase) {
                discountAmount = (totalAmount * coupon.discountPercentage) / 100;
            }
        }

        const finalAmount = totalAmount - discountAmount;

        // Check wallet balance
        if (user.wallet.balance < finalAmount) {
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient wallet balance. Available: ₹${user.wallet.balance.toFixed(2)}, Required: ₹${finalAmount.toFixed(2)}`,
                currentBalance: user.wallet.balance,
                requiredAmount: finalAmount
            });
        }

        // Create order
        const order = new Order({
            user: userId,
            items: cart.cartItems.map(item => ({
                product: item.product._id,
                quantity: item.quantity,
                price: item.price,
                size: item.size,
            })),
            shippingAddress,
            paymentMethod: 'Wallet',
            shippingMethod,
            shippingCost: Number(shippingCost || 0),
            totalAmount: finalAmount,
            couponCode,
            status: 'Pending',
            transactionId: `ORD${Math.floor(100000 + Math.random() * 900000)}`,
        });

        await order.save();

        // Deduct from wallet
        user.wallet.balance -= finalAmount;
        user.wallet.transactions.push({
            type: 'debit',
            amount: finalAmount,
            description: `Payment for order ${order.transactionId}`,
            date: new Date()
        });
        await user.save();

        // Update product stock
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

        res.json({ 
            success: true, 
            orderId: order._id,
            transactionId: order.transactionId,
            redirectUrl: `/order-success/${order._id}`,
            newBalance: user.wallet.balance
        });

    } catch (error) {
        console.error("Error in wallet processing:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to process wallet payment",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};



// Razorpay Payment
const processRazorpay = async (req, res) => {
    try {
        const { shippingAddress, shippingMethod, shippingCost, couponCode } = req.body;
        const userId = req.user._id;

        // Check for existing pending order
        const existingOrder = await Order.findOne({
            user: userId,
            status: 'Payment Processing',
            paymentStatus: 'Pending'
        }).sort({ createdAt: -1 });

        let order;
        
        if (existingOrder) {
            // Use existing order
            order = existingOrder;
        } else {
            // Create new order
            const cart = await Cart.findOne({ user: userId }).populate("cartItems.product");
            if (!cart || cart.cartItems.length === 0) {
                return res.status(400).json({ success: false, message: "Cart is empty" });
            }

            // Calculate amounts
            const productsTotal = cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
            const totalAmount = productsTotal + Number(shippingCost || 0);
            
            // Apply coupon discount
            let discountAmount = 0;
            if (couponCode) {
                const coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
                if (coupon && totalAmount >= coupon.minPurchase) {
                    discountAmount = (totalAmount * coupon.discountPercentage) / 100;
                }
            }

            const finalAmount = totalAmount - discountAmount;

            order = new Order({
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
                shippingCost: Number(shippingCost || 0),
                totalAmount: finalAmount,
                couponCode: couponCode || undefined,
                discountAmount: discountAmount,
                transactionId: `ORD${Math.floor(100000 + Math.random() * 900000)}`,
                paymentStatus: 'Pending',
                status: 'Payment Processing'
            });
            await order.save();
        }

        // Create Razorpay order
        const options = {
            amount: Math.round(order.totalAmount * 100),
            currency: 'INR',
            receipt: `order_${order._id}`
        };
        
        const razorpayOrder = await razorpay.orders.create(options);
        
        // Store minimal data in session
        req.session.razorpayOrder = {
            orderId: order._id,
            razorpayOrderId: razorpayOrder.id
        };

        res.json({ 
            success: true, 
            razorpayOrder,
            orderId: order._id
        });
    } catch (error) {
        console.error("Error in Razorpay processing:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to create Razorpay order",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Verify Razorpay Payment
const verifyRazorpay = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const sessionOrder = req.session.razorpayOrder;

        if (!sessionOrder) {
            return res.status(400).json({ success: false, message: "Session expired" });
        }

        // Verify signature
        const generated_signature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest('hex');

        // Find the existing order
        const order = await Order.findById(sessionOrder.orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        if (generated_signature !== razorpay_signature) {
            order.paymentStatus = 'Failed';
            await order.save();
            return res.json({ 
                success: false, 
                orderId: order._id,
                message: "Invalid payment signature" 
            });
        }

        // Verify payment with Razorpay
        const payment = await razorpay.payments.fetch(razorpay_payment_id);
        if (payment.status !== 'captured') {
            order.paymentStatus = 'Failed';
            await order.save();
            return res.json({ 
                success: false, 
                orderId: order._id,
                message: "Payment not captured" 
            });
        }

        // Payment successful
        order.paymentStatus = 'Completed';
        order.status = 'Pending'; // Change from 'Payment Processing' to 'Pending'
        order.paymentId = razorpay_payment_id;
        await order.save();

        // Clear cart
        await Cart.findOneAndDelete({ user: order.user });

        res.json({ 
            success: true, 
            orderId: order._id,
            transactionId: order.transactionId
        });
    } catch (error) {
        console.error("Error in Razorpay verification:", error);
        res.status(500).json({ success: false, message: "Failed to verify payment" });
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
        const finalAmount = totalAmount - discountAmount;

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
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId).populate('user');
        
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: "Order not found" 
            });
        }

        // Check if order is in retryable state
        // if (order.status !== 'Payment Processing' || order.paymentStatus !== 'Failed') {
        //     return res.status(400).json({ 
        //         success: false, 
        //         message: "This order cannot be retried" 
        //     });
        // }

        // Create new Razorpay order
        const options = {
            amount: Math.round(order.totalAmount * 100),
            currency: 'INR',
            receipt: `retry_${order._id}`
        };
        console.log("Razorpay options:", options); 
        const razorpayOrder = await razorpay.orders.create(options);
        console.log("Razorpay order created:", razorpayOrder.id)
        // Update order with retry information
        order.paymentAttempts = (order.paymentAttempts || 0) + 1;
        order.razorpayOrderId = razorpayOrder.id;
        await order.save();

        res.json({
            success: true,
            razorpayOrder,
            key: process.env.RAZORPAY_KEY_ID,
            orderId: order._id
        });

    } catch (error) {
        console.error("Retry Payment Error:", {
            message: error.message,
            stack: error.stack,
            razorpayError: error.error ? error.error.description : null
        });
        
        res.status(500).json({ 
            success: false,
            message: error.error?.description || "Payment initiation failed",
            debug: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
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