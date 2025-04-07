const Order = require('../../models/orderSchema'); // Import the Order model
const User = require('../../models/userSchema'); // Import the User model
const Product = require('../../models/productSchema'); // Import the Product model
const mongoose = require('mongoose'); // Import mongoose


// Load Order Management Page
const loadOrderManagement = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; // Get the page number from the query
        const limit = 5; // Number of orders per page
        const skip = (page - 1) * limit;


        const orders = await Order.find({})
            .populate('user', 'name email') // Populate user details
            .populate('items.product', 'productName price') // Populate product details
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });


        const validOrders = orders.filter(order => order.user !== null);


        const totalOrders = await Order.countDocuments({});
        const totalPages = Math.ceil(totalOrders / limit);

        res.render("orderManagement", {
            orders: validOrders, // Pass only valid orders to the view
            currentPage: page,
            totalPages,
            totalOrders,
        });
    } catch (error) {
        console.error("Error loading order management page:", error);
        res.status(500).render("page-404"); 
    }
};


const loadSingleAdminOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email phone')
            .populate({
                path: 'items.product',
                select: 'productName productImage price sizes'
            });

        if (!order) {
            return res.status(404).render("page-404", { message: "Order not found." });
        }

        // Transform order data
        const orderObj = order.toObject();
        
        // Calculate totals
        let subTotal = 0;
        let cancelledAmount = 0;
        let returnedAmount = 0;
        
        orderObj.items = orderObj.items.map(item => {
            const itemTotal = item.price * item.quantity;
            
            if (item.cancelled) {
                cancelledAmount += itemTotal;
            } else if (item.returned) {
                returnedAmount += itemTotal;
            } else {
                subTotal += itemTotal;
            }
            
            // Fix image path
            if (item.product?.productImage?.[0]) {
                item.product.productImage[0] = item.product.productImage[0]
                    .replace(/\\/g, '/')
                    .replace('public/', '/');
            }
            
            return item;
        });

        res.render("singleAdminOrder", { 
            order: {
                ...orderObj,
                subTotal,
                cancelledAmount,
                returnedAmount,
                shippingCost: order.shippingCost || 0,
                discountAmount: order.discountAmount || 0,
                totalAmount: order.totalAmount
            }
        });
    } catch (error) {
        console.error("Error loading admin order:", error);
        res.status(500).render("page-404", { message: "Failed to load order details." });
    }
};

// Update Order Status
const updateOrderStatus = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { orderId, status } = req.body;
        const validStatuses = ["Processing", "Shipped", "Delivered", "Cancelled", "Returned"];

        if (!validStatuses.includes(status)) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status provided.' 
            });
        }

        const order = await Order.findById(orderId)
            .session(session)
            .populate('items.product');

        if (!order) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found.' 
            });
        }

        // Update all non-cancelled/returned items
        order.items.forEach(item => {
            if (!item.cancelled && !item.returned) {
                item.status = status;
            }
        });

        // Update order dates
        const now = new Date();
        if (status === 'Shipped') order.shippedDate = now;
        if (status === 'Delivered') order.deliveredDate = now;
        if (status === 'Cancelled') order.cancelledDate = now;
        if (status === 'Returned') order.returnedDate = now;

        order.status = status;
        await order.save({ session });

        await session.commitTransaction();
        
        res.status(200).json({ 
            success: true, 
            message: `Order status updated to ${status}.`,
            updatedOrder: order
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Error updating order status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update order status.' 
        });
    } finally {
        session.endSession();
    }
};




// Cancel Order
const cancelOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { orderId, reason } = req.body;
        
        const order = await Order.findOne({ _id: orderId })
            .populate('user')
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
        if (!order.refundProcessed && (order.paymentStatus === 'Completed' || order.paymentStatus === 'Paid')) {
            const user = await User.findById(order.user._id).session(session);
            if (user) {
                user.wallet.balance += order.totalAmount;
                user.wallet.transactions.push({
                    type: 'refund',
                    amount: order.totalAmount,
                    description: `Refund for cancelled order #${order.transactionId}`,
                    date: new Date()
                });
                await user.save({ session });
                order.refundProcessed = true;
                order.paymentStatus = 'Refunded';
            }
        }

        // Update order status and all items
        order.status = 'Cancelled';
        order.cancellationReason = reason || 'Admin cancelled';
        order.cancelledDate = new Date();
        
        // Mark all items as cancelled
        order.items.forEach(item => {
            item.cancelled = true;
            item.status = 'Cancelled';
        });

        await order.save({ session });
        await session.commitTransaction();

        res.status(200).json({ 
            success: true, 
            message: "Order cancelled successfully." + 
                    (order.refundProcessed ? " Amount refunded to customer's wallet." : "")
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Error cancelling order:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to cancel order." 
        });
    } finally {
        session.endSession();
    }
};



// Verify Return Request
const verifyReturnRequest = async (req, res) => {
    try {
        const { orderId, accept } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        if (accept) {
            // If return request is accepted, refund the amount to the user's wallet
            const user = await User.findById(order.user);
            if (user) {
                user.wallet.balance += order.totalAmount; // Refund the amount
                user.wallet.transactions.push({
                    type: 'refund',
                    amount: order.totalAmount,
                    description: 'Refund for returned order',
                });
                await user.save();
            }

            // Update product stock
            const bulkOps = order.items.map(item => ({
                updateOne: {
                    filter: { _id: item.product },
                    update: { $inc: { stock: item.quantity } }, // Increase stock
                },
            }));
            await Product.bulkWrite(bulkOps);

            // Update order status to "Returned"
            order.status = 'Returned';
            await order.save();

            res.status(200).json({ success: true, message: 'Return request accepted and amount refunded.' });
        } else {
            // If return request is rejected, update order status to "Delivered"
            order.status = 'Delivered';
            await order.save();

            res.status(200).json({ success: true, message: 'Return request rejected.' });
        }
    } catch (error) {
        console.error('Error verifying return request:', error);
        res.status(500).json({ success: false, message: 'Failed to verify return request.' });
    }
};


const verifyOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found.' 
            });
        }

        // Add any specific verification logic here
        // This is a generic endpoint for any verification needs

        res.status(200).json({ 
            success: true, 
            message: 'Order verified.', 
            order 
        });
    } catch (error) {
        console.error('Error verifying order:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify order.' 
        });
    }
};



const verifyReturn = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { orderId } = req.body;
        const order = await Order.findById(orderId)
            .populate('user')
            .populate('items.product')
            .session(session);

        if (!order) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found.' 
            });
        }

        if (order.status !== 'Return Requested') {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: 'Only return requested orders can be verified.' 
            });
        }

        // Process refund to wallet
        if (!order.refundProcessed) {
            const user = await User.findById(order.user._id).session(session);
            if (user) {
                user.wallet.balance += order.totalAmount;
                user.wallet.transactions.push({
                    type: 'refund',
                    amount: order.totalAmount,
                    description: `Refund for returned order #${order.transactionId}`,
                    date: new Date()
                });
                await user.save({ session });
                order.refundProcessed = true;
            }
        }

        // Restore product stock immediately
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

        // Update order status
        order.status = 'Returned';
        order.returnedDate = new Date();
        order.stockRestored = true;
        await order.save({ session });

        await session.commitTransaction();

        res.status(200).json({ 
            success: true, 
            message: 'Return verified. Refund processed and stock updated.' 
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Error verifying return:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify return.' 
        });
    } finally {
        session.endSession();
    }
};
const verifyItemReturn = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { orderId, itemId } = req.body;
        
        const order = await Order.findById(orderId)
            .populate('user')
            .populate({
                path: 'items.product',
                select: '_id sizes'
            })
            .session(session);

        if (!order) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found.' 
            });
        }

        const item = order.items.id(itemId);
        if (!item || !item.returnRequested) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: 'Item not found or not requested for return.' 
            });
        }

        // Calculate refund amount
        const refundAmount = item.price * item.quantity;

        // Process refund to wallet
        const user = await User.findById(order.user._id).session(session);
        if (user) {
            user.wallet.balance += refundAmount;
            user.wallet.transactions.push({
                type: 'refund',
                amount: refundAmount,
                description: `Refund for returned item in order #${order.transactionId}`,
                date: new Date()
            });
            await user.save({ session });
        }

        // Restore product stock
        await Product.updateOne(
            { 
                _id: item.product._id,
                "sizes.size": item.size
            },
            { $inc: { "sizes.$.stock": item.quantity } },
            { session }
        );

        // Update item status
        item.returned = true;
        item.status = "Returned";
        item.returnedDate = new Date();

        // Check if all items are returned
        const allReturned = order.items.every(i => i.returned || !i.returnRequested);
        if (allReturned) {
            order.status = 'Returned';
        }

        await order.save({ session });
        await session.commitTransaction();

        res.status(200).json({ 
            success: true, 
            message: 'Item return verified. Refund processed and stock updated.',
            updatedOrder: order
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Error verifying item return:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify item return.' 
        });
    } finally {
        session.endSession();
    }
};

module.exports = {
    loadOrderManagement,
    loadSingleAdminOrder,
    updateOrderStatus,
    cancelOrder,
    verifyReturnRequest,
    verifyOrder,
    verifyReturn,
    verifyItemReturn
};