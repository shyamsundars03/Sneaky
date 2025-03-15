const mongoose = require("mongoose");
const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');

// Load orders page
const loadOrder = async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect('/signin');
        }

        const userId = req.user._id;

        // Fetch orders for the logged-in user
        const orders = await Order.find({ user: userId })
            .sort({ createdAt: -1 }) // Sort by most recent orders first
            .populate("items.product"); // Populate product details in the order items

        // Render the orders page with the orders data
        res.render("orders", { orders, user: req.user });
    } catch (error) {
        console.error("Error loading orders:", error);
        res.status(500).render("page-404", { message: "Failed to load orders." });
    }
};

// Load single order page
const loadSingleOrder = async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect('/signin');
        }

        const orderId = req.params.orderId;

        // Validate orderId
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).render("page-404", { message: "Invalid order ID." });
        }

        // Find the order by ID and populate product details
        const order = await Order.findById(orderId).populate("items.product");

        if (!order) {
            return res.status(404).render("page-404", { message: "Order not found." });
        }

        // Render the single order page with the order data
        res.render("singleUserOrder", { order, user: req.user });
    } catch (error) {
        console.error("Error loading single order:", error);
        res.status(500).render("page-404", { message: "Failed to load order details." });
    }
};

// Load Order Success Page
const loadOrderSuccess = async (req, res) => {
    try {
        const orderId = req.params.orderId;

        // Validate orderId
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).render("page-404", { message: "Invalid order ID." });
        }

        // Find the order by ID
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).render("page-404", { message: "Order not found." });
        }

        // Render the order success page
        res.render("orderSuccess", {
            orderId: order._id,
            transactionId: order.transactionId, // Pass transactionId to the template
        });
    } catch (error) {
        console.error("Error loading order success page:", error);
        res.status(500).render("page-404", { message: "Internal server error." });
    }
};



module.exports = {
    loadOrder,
    loadSingleOrder,
    loadOrderSuccess,
};