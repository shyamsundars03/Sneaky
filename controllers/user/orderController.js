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

const loadSingleOrder = async (req, res) => {
    try {
        if (!req.user) return res.redirect('/signin');

        const orderId = req.params.orderId;
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).render("page-404", { message: "Invalid order ID." });
        }

        const order = await Order.findOne({ 
            _id: orderId, 
            user: req.user._id 
        }).populate({
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

        // Calculate totals
        let subTotal = 0;
        let cancelledAmount = 0;
        let returnedAmount = 0;
        
        // Transform items and calculate amounts
        const items = order.items.map(item => {
            const itemTotal = item.price * item.quantity;
            
            if (item.cancelled) {
                cancelledAmount += itemTotal;
            } else if (item.returned) {
                returnedAmount += itemTotal;
            } else {
                subTotal += itemTotal;
            }
            
            // Fix image path if needed
            if (item.product?.productImage?.[0]) {
                item.product.productImage[0] = item.product.productImage[0]
                    .replace(/\\/g, '/')
                    .replace('public/', '/');
            }
            
            return {
                ...item.toObject(),
                itemTotal: itemTotal.toFixed(2)
            };
        });

        // Calculate final totals
        const shippingCost = order.shippingCost || 0;
        const discountAmount = order.discountAmount || 0;
        const grandTotal = order.totalAmount || (subTotal + shippingCost - discountAmount);

        res.render("singleOrder", { 
            order: {
                ...order.toObject(),
                items,
                subtotal: subTotal.toFixed(2),
                cancelledAmount: cancelledAmount.toFixed(2),
                returnedAmount: returnedAmount.toFixed(2),
                shippingCost: shippingCost.toFixed(2),
                discountAmount: discountAmount.toFixed(2),
                grandTotal: grandTotal.toFixed(2),
                hasDiscount: discountAmount > 0
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
        if (!order) return res.redirect('/orders');
        
        res.render('orderSuccess', {
            orderId: order._id,
            transactionId: order.transactionId
        });
    } catch (error) {
        res.redirect('/orders');
    }
};

const loadOrderFailed = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order) return res.redirect('/orders');
        
        res.render('orderFailed', {
            orderId: order._id,
            transactionId: order.transactionId
        });
    } catch (error) {
        res.redirect('/orders');
    }
};



// Cancel Order
const cancelOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { orderId, reason } = req.body;
        
        // Verify order belongs to user
        const order = await Order.findOne({ 
            _id: orderId, 
            user: req.user._id 
        })
        .populate({
            path: 'items.product',
            select: '_id sizes'
        })
        .session(session);

        if (!order) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false, 
                message: "Order not found or unauthorized." 
            });
        }

        // Validate order can be cancelled
        const cancellableStatuses = ['Ordered', 'Processing', 'Shipped'];
        if (!cancellableStatuses.includes(order.status)) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: "Order cannot be cancelled at this stage." 
            });
        }

        // Restore product stock (size-specific)
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
        await Product.bulkWrite(bulkOps, { session });

        // Process refund if payment was completed
        if (!order.refundProcessed && order.paymentStatus === 'COD') {
            const user = await User.findById(req.user._id).session(session);
            if (user) {
                user.wallet.balance += order.totalAmount;
                user.wallet.transactions.push({
                    type: 'refund',
                    amount: order.totalAmount,
                    description: `Refund for cancelled order #${order.transactionId}`,
                    date: new Date(),
                    orderId: order._id  
                });
                await user.save({ session });
                order.refundProcessed = true;
                order.paymentStatus = 'Refunded';
            }
        }
        console.log(user.wallet.transactions);
        // Update order status
        order.status = 'Cancelled';
        order.cancellationReason = reason;
        order.stockRestored = true;
        order.cancelledDate = new Date();
        await order.save({ session });

        await session.commitTransaction();

        return res.status(200).json({ 
            success: true, 
            message: "Order cancelled successfully." + 
                    (order.refundProcessed ? " Amount refunded to wallet." : "")
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Error cancelling order:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Failed to cancel order." 
        });
    } finally {
        session.endSession();
    }
};




// Return Order
const returnOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { orderId, reason } = req.body;

        // Verify order belongs to user
        const order = await Order.findOne({ 
            _id: orderId, 
            user: req.user._id 
        }).session(session);

        if (!order) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false, 
                message: "Order not found or unauthorized." 
            });
        }

        if (order.status !== 'Delivered') {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: "Only delivered orders can be returned." 
            });
        }

        if (!reason || reason.trim().length < 10) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: "Valid return reason (min 10 chars) is required." 
            });
        }

        // Update order status
        order.status = 'Return Requested';
        order.returnReason = reason.trim();
        await order.save({ session });

        await session.commitTransaction();

        res.status(200).json({ 
            success: true, 
            message: 'Return request submitted for admin verification.' 
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Error returning order:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to submit return request.' 
        });
    } finally {
        session.endSession();
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


// Cancel single item
const cancelOrderItem = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { orderId, itemId, reason } = req.body;
        
        const order = await Order.findOne({ 
            _id: orderId, 
            user: req.user._id 
        })
        .populate({
            path: 'items.product',
            select: '_id sizes'
        })
        .session(session);

        if (!order) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false, 
                message: "Order not found." 
            });
        }

        // Find the item by its _id
        const item = order.items.find(i => i._id.toString() === itemId);
        if (!item) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false, 
                message: "Item not found in order." 
            });
        }

        // Validate item can be cancelled
        if (item.cancelled) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: "Item already cancelled." 
            });
        }

        // Restore stock for this item
        await Product.updateOne(
            { 
                _id: item.product._id,
                "sizes.size": item.size
            },
            { $inc: { "sizes.$.stock": item.quantity } },
            { session }
        );

        // Calculate amount to refund
        const refundAmount = item.price * item.quantity;
        
        // Process refund if payment was completed
        if (order.paymentStatus === 'Completed' || order.paymentStatus === 'Paid') {
            const user = await User.findById(req.user._id).session(session);
            if (user) {
                user.wallet.balance += refundAmount;
                user.wallet.transactions.push({
                    type: 'refund',
                    amount: refundAmount,
                    description: `Refund for cancelled item in order #${order.transactionId}`,
                    date: new Date(),
                    orderId: order._id 
                });
                await user.save({ session });
            }
        }
        console.log(user.wallet.transactions);
        // Update item status
        item.cancelled = true;
        item.status = "Cancelled";
        item.cancellationReason = reason;
        item.cancelledDate = new Date();
        
        // Update order totals
        order.totalAmount -= refundAmount;
        order.cancelledAmount = (order.cancelledAmount || 0) + refundAmount;
        
        // Check if all items are cancelled
        const allCancelled = order.items.every(i => i.cancelled);
        if (allCancelled) {
            order.status = 'Cancelled';
            order.cancellationReason = 'All items cancelled';
        }
        
        await order.save({ session });
        await session.commitTransaction();

        res.json({ 
            success: true, 
            message: 'Item cancelled successfully',
            refundAmount: refundAmount
        });
    } catch (error) {
        await session.abortTransaction();
        console.error("Error cancelling item:", error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    } finally {
        session.endSession();
    }
};




// Enhanced returnOrderItem function
const returnOrderItem = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { orderId, itemIndex, reason } = req.body;
        
        const order = await Order.findOne({ 
            _id: orderId, 
            user: req.user._id,
            status: 'Delivered'
        })
        .populate({
            path: 'items.product',
            select: '_id sizes productName'
        })
        .session(session);

        if (!order || itemIndex >= order.items.length) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false, 
                message: "Order or item not found." 
            });
        }

        const item = order.items[itemIndex];
        
        // Validate item can be returned
        if (item.returnRequested || item.returned) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: "Item already has return request." 
            });
        }

        // Update item status
        order.items[itemIndex].returnRequested = true;
        order.items[itemIndex].returnReason = `${item.product.productName}: ${reason}`;
        order.items[itemIndex].status = "Return Requested";
        
        // Update order status if not already
        if (order.status !== 'Return Requested') {
            order.status = 'Return Requested';
        }
        
        await order.save({ session });
        await session.commitTransaction();

        res.json({ 
            success: true, 
            message: 'Return request submitted for admin approval',
            returnedItem: order.items[itemIndex]
        });
    } catch (error) {
        await session.abortTransaction();
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    } finally {
        session.endSession();
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
    returnOrderItem,
    cancelOrderItem


};