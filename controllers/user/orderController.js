const mongoose = require("mongoose");
const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { generateInvoice } = require('../../services/invoiceService');

// Load orders page
const loadOrder = async (req, res) => {
    try {
        if (!req.user) return res.redirect('/signin');

        const userId = req.user._id;
        const searchTerm = req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 5; // Items per page

        // Build query
        const query = {
            user: userId,
            $or: [
                { transactionId: { $regex: searchTerm, $options: 'i' } },
                { status: { $regex: searchTerm, $options: 'i' } }
            ]
        };

        // Get total count
        const totalOrders = await Order.countDocuments(query);
        
        // Calculate pagination values
        const totalPages = Math.ceil(totalOrders / limit);
        const skip = (page - 1) * limit;

        // Get orders with pagination
        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("items.product");

        res.render("orders", {
            orders,
            user: req.user,
            searchTerm,
            currentPage: page,
            totalPages,
            totalOrders
        });
    } catch (error) {
        console.error("Error loading orders:", error);
        res.status(500).render("page-404");
    }
};

// Load single order page
const loadSingleOrder = async (req, res) => {
    try {
        if (!req.user) return res.redirect('/signin');

        const orderId = req.params.orderId;
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).render("page-404", { message: "Invalid order ID." });
        }

        const order = await Order.findById(orderId).populate({
            path: 'items.product',
            select: 'productName productImage price sizes category',
            populate: {
                path: 'category',
                select: 'name'
            }
        });

        if (!order) {
            return res.status(404).render("page-404", { message: "Order not found." });
        }

        // Calculate subtotal and transform data
        const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const hasDiscount = order.discountAmount > 0;
        const discountPercentage = hasDiscount ? 
            Math.round((order.discountAmount / (subtotal + order.shippingCost)) * 100) : 0;

        // Transform image paths
        order.items = order.items.map(item => {
            if (item.product?.productImage?.[0]) {
                item.product.productImage[0] = item.product.productImage[0]
                    .replace(/\\/g, '/')
                    .replace('public/', '/');
            }
            return item;
        });

        res.render("singleOrder", { 
            order: {
                ...order.toObject(),
                subtotal: subtotal,
                hasDiscount: hasDiscount,
                discountPercentage: discountPercentage,
                grandTotal: order.totalAmount
            },
            user: req.user
        });
    } catch (error) {
        console.error("Error loading single order:", error);
        res.status(500).render("page-404", { message: "Failed to load order details." });
    }
};

const loadOrderSuccess = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order) return res.status(404).render("page-404");
        res.render("orderSuccess", {
            orderId: order._id,
            transactionId: order.transactionId
        });
    } catch (error) {
        console.error(error);
        res.status(500).render("page-404");
    }
};

const loadOrderFailed = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order) return res.status(404).render("page-404");
        res.render("orderFailed", {
            orderId: order._id,
            transactionId: order.transactionId
        });
    } catch (error) {
        console.error(error);
        res.status(500).render("page-404");
    }
};



// Cancel Order
const cancelOrder = async (req, res) => {
    try {
        const { orderId, reason } = req.body;
        const order = await Order.findById(orderId)
            .populate('user')
            .populate('items.product');

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: "Order not found." 
            });
        }

        // Validate order can be cancelled
        if (!['Pending', 'Shipped', 'Processing'].includes(order.status)) {
            return res.status(400).json({ 
                success: false, 
                message: "Order cannot be cancelled at this stage." 
            });
        }

        // 1. Update stock for each item (size-specific)
        const bulkOps = order.items.map(item => ({
            updateOne: {
                filter: { 
                    _id: item.product._id,
                    "sizes.size": item.size
                },
                update: { 
                    $inc: { "sizes.$.stock": item.quantity } 
                }
            }
        }));
        await mongoose.model('Product').bulkWrite(bulkOps);

        // 2. Process refund to wallet regardless of payment method
        if (!order.refundProcessed) {
            const user = await User.findById(order.user._id);
            if (user) {
                user.wallet.balance += order.totalAmount;
                user.wallet.transactions.push({
                    type: 'refund',
                    amount: order.totalAmount,
                    description: `Refund for cancelled order #${order.transactionId}`,
                    date: new Date()
                });
                await user.save();
                order.refundProcessed = true;
            }
        }

        // Update order status
        order.status = 'Cancelled';
        order.cancellationReason = reason;
        order.stockRestored = true;
        order.cancelledDate = new Date(); 
        await order.save();

        res.status(200).json({ 
            success: true, 
            message: "Order cancelled successfully. Amount refunded to wallet." 
        });

    } catch (error) {
        console.error("Error cancelling order:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to cancel order." 
        });
    }
};

// Return Order
const returnOrder = async (req, res) => {
    try {
        const { orderId, reason } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found.' 
            });
        }

        if (order.status !== 'Delivered') {
            return res.status(400).json({ 
                success: false, 
                message: 'Only delivered orders can be returned.' 
            });
        }

        if (!reason) {
            return res.status(400).json({ 
                success: false, 
                message: 'Return reason is required.' 
            });
        }

        order.status = 'Return Requested';
        order.returnReason = reason;
        await order.save();

        res.status(200).json({ 
            success: true, 
            message: 'Return request submitted successfully.' 
        });
    } catch (error) {
        console.error('Error returning order:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to submit return request.' 
        });
    }
};


const downloadInvoice = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const filePath = await generateInvoice(orderId);

        // Send the file for download
        res.download(filePath);
    } catch (error) {
        console.error("Error generating invoice:", error);
        res.status(500).render("page-404", { message: "Failed to generate invoice." });
    }
};


module.exports = {
    loadOrder,
    loadSingleOrder,
    loadOrderSuccess,
    cancelOrder,
    returnOrder,
    downloadInvoice,
    loadOrderFailed,


};