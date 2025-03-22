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

        // Fetch orders from the database and populate user details
        const orders = await Order.find({})
            .populate('user', 'name email') // Populate user details
            .populate('items.product', 'productName price') // Populate product details
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        // Filter out orders with missing or null user fields
        const validOrders = orders.filter(order => order.user !== null);

        // Count total number of orders for pagination
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
        res.status(500).render("page-404"); // Render a 404 page or error page
    }
};

// Load Single Admin Order Page
const loadSingleAdminOrder = async (req, res) => {
    try {
        const orderId = req.params.id; // Get the order ID from the URL

        // Validate orderId
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).render("page-404", { message: "Invalid order ID." });
        }

        // Fetch the order details from the database
        const order = await Order.findById(orderId)
            .populate('user', 'name email phone') // Populate user details
            .populate({
                path: 'items.product',
                select: 'productName productImage price', // Populate product details
            });

        if (!order) {
            return res.status(404).render("page-404", { message: "Order not found." });
        }

        // Transform image paths for the frontend
        order.items = order.items.map(item => {
            if (item.product.productImage && item.product.productImage[0]) {
                item.product.productImage[0] = item.product.productImage[0]
                    .replace(/\\/g, '/') // Replace backslashes with forward slashes
                    .replace('public/', '/'); // Remove the 'public/' prefix
            }
            return item;
        });

        // Debug: Log product image paths
        order.items.forEach(item => {
            console.log("Transformed Product Image Path:", item.product.productImage[0]);
        });

        // Calculate subtotal (sum of all items' prices)
        const subTotal = order.items.reduce((total, item) => {
            return total + (item.price * item.quantity); // Use item.price from the order, not product.price
        }, 0);

        // Use shippingCost from the order document
        const shippingCost = order.shippingCost || 0;

        // Use totalAmount from the order document
        const totalAmount = order.totalAmount || subTotal + shippingCost;

        // Add calculated fields to the order object
        order.subTotal = subTotal;
        order.shippingCost = shippingCost;
        order.totalAmount = totalAmount;


        // Render the single admin order view
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

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        // Update order status
        order.status = status;

        // If status is "Returned", refund the amount to the user's wallet
        if (status === 'Returned') {
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
        }

        // If status is "Cancelled" or "Returned", update product stock
        if (status === 'Cancelled' || status === 'Returned') {
            const bulkOps = order.items.map(item => ({
                updateOne: {
                    filter: { _id: item.product },
                    update: { $inc: { stock: item.quantity } }, // Increase stock
                },
            }));
            await Product.bulkWrite(bulkOps);
        }

        await order.save();

        res.status(200).json({ success: true, message: 'Order status updated successfully.' });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ success: false, message: 'Failed to update order status.' });
    }
};

// Cancel Order
const cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found.' });
        }

        // Update order status to "Cancelled"
        order.status = 'Cancelled';

        // Update product stock
        const bulkOps = order.items.map(item => ({
            updateOne: {
                filter: { _id: item.product },
                update: { $inc: { stock: item.quantity } }, // Increase stock
            },
        }));
        await Product.bulkWrite(bulkOps);

        await order.save();

        res.status(200).json({ success: true, message: 'Order cancelled successfully.' });
    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel order.' });
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

module.exports = {
    loadOrderManagement,
    loadSingleAdminOrder,
    updateOrderStatus,
    cancelOrder,
    verifyReturnRequest,
};