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
        const orderId = req.params.id; 


        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).render("page-404", { message: "Invalid order ID." });
        }


        const order = await Order.findById(orderId)
            .populate('user', 'name email phone') 
            .populate({
                path: 'items.product',
                select: 'productName productImage price', 
            });

        if (!order) {
            return res.status(404).render("page-404", { message: "Order not found." });
        }


        order.items = order.items.map(item => {
            if (item.product.productImage && item.product.productImage[0]) {
                item.product.productImage[0] = item.product.productImage[0]
                    .replace(/\\/g, '/') 
                    .replace('public/', '/');
            }
            return item;
        });


        order.items.forEach(item => {
            console.log("Transformed Product Image Path:", item.product.productImage[0]);
        });


        const subTotal = order.items.reduce((total, item) => {
            return total + (item.price * item.quantity); 
        }, 0);


        const shippingCost = order.shippingCost || 0;


        const totalAmount = order.totalAmount || subTotal + shippingCost;


        order.subTotal = subTotal;
        order.shippingCost = shippingCost;
        order.totalAmount = totalAmount;

        res.render("singleAdminOrder", { order });
    } catch (error) {
        console.error("Error loading single admin order page:", error);
        res.status(500).render("page-404", { message: "Failed to load order details." });
    }
};

// Update Order Status
const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;
        const validStatuses = ["Pending", "Shipped", "Delivered", "Cancelled", "Returned"];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status provided.' 
            });
        }

        const order = await Order.findByIdAndUpdate(
            orderId,
            { status },
            { new: true }
        );

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found.' 
            });
        }

        res.status(200).json({ 
            success: true, 
            message: `Order status updated to ${status}.` 
        });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update order status.' 
        });
    }
};

// Cancel Order
const cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        const order = await Order.findByIdAndUpdate(
            orderId,
            { 
                status: 'Cancelled',
                cancellationReason: req.body.reason || 'Admin cancelled' 
            },
            { new: true }
        );

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found.' 
            });
        }

        // Restore product stock
        const bulkOps = order.items.map(item => ({
            updateOne: {
                filter: { _id: item.product },
                update: { $inc: { stock: item.quantity } },
            },
        }));
        await Product.bulkWrite(bulkOps);

        res.status(200).json({ 
            success: true, 
            message: 'Order cancelled successfully.' 
        });
    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to cancel order.' 
        });
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
    try {
        const { orderId } = req.body;
        const order = await Order.findById(orderId)
            .populate('user')
            .populate('items.product');

        if (!order) {
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found.' 
            });
        }

        if (order.status !== 'Return Requested') {
            return res.status(400).json({ 
                success: false, 
                message: 'Only return requested orders can be verified.' 
            });
        }

        // 1. Process refund to wallet regardless of payment method
        if (!order.refundProcessed) {
            const user = await User.findById(order.user._id);
            if (user) {
                user.wallet.balance += order.totalAmount;
                user.wallet.transactions.push({
                    type: 'refund',
                    amount: order.totalAmount,
                    description: `Refund for returned order #${order.transactionId}`,
                    date: new Date()
                });
                await user.save();
                order.refundProcessed = true;
            }
        }

        // 2. Schedule stock update after 1 day if not already scheduled
        if (!order.inventoryRestoreScheduled) {
            setTimeout(async () => {
                try {
                    const updatedOrder = await Order.findById(orderId).populate('items.product');
                    if (updatedOrder && !updatedOrder.stockRestored) {
                        const bulkOps = updatedOrder.items.map(item => ({
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
                        updatedOrder.stockRestored = true;
                        await updatedOrder.save();
                    }
                } catch (error) {
                    console.error('Error in scheduled stock restoration:', error);
                }
            }, 24 * 60 * 60 * 1000); // 24 hours delay
            
            order.inventoryRestoreScheduled = true;
        }

        // Update order status
        order.status = 'Returned';
        await order.save();

        res.status(200).json({ 
            success: true, 
            message: 'Return verified. Refund processed to wallet and stock will be updated within 24 hours.' 
        });

    } catch (error) {
        console.error('Error verifying return:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify return.' 
        });
    }
};


module.exports = {
    loadOrderManagement,
    loadSingleAdminOrder,
    updateOrderStatus,
    cancelOrder,
    verifyReturnRequest,
    verifyOrder,
    verifyReturn
};