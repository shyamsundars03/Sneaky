const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');

// Load orders page
const loadOrder = async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect('/signin');
        }

        const userId = req.user._id;
        const orders = await Order.find({ userId }).populate('items.product');
        res.render("orders", { orders, user: req.user });
    } catch (error) {
        console.error("Error loading orders:", error);
        res.status(500).render("page-404");
    }
};

// Load single order page
const loadSingleOrder = async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect('/signin');
        }
        const orderId = req.params.id;
        const order = await Order.findById(orderId).populate('items.product');
        res.render("singleOrder", { order, user: req.user });
    } catch (error) {
        console.error("Error loading single order:", error);
        res.status(500).render("page-404");
    }
};

module.exports = {
    loadOrder,
    loadSingleOrder,
};