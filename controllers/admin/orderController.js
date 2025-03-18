
const Order = require('../../models/orderSchema'); // Import the Order model

// Load Order Management Page
const loadOrderManagement = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; // Get the page number from the query
        const limit = 10; // Number of orders per page
        const skip = (page - 1) * limit;

        // Fetch orders from the database
        const orders = await Order.find({})
            .populate('user', 'name email') // Populate user details
            .populate('items.product', 'productName price') // Populate product details
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        // Count total number of orders for pagination
        const totalOrders = await Order.countDocuments({});
        const totalPages = Math.ceil(totalOrders / limit);

        res.render("orderManagement", {
            orders,
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

        // Fetch the order details from the database
        const order = await Order.findById(orderId)
            .populate('user', 'name email phone') // Populate user details
            .populate('items.product', 'productName price productImage'); // Populate product details

        if (!order) {
            return res.status(404).render("page-404"); // Render a 404 page if order not found
        }

        // Calculate subtotal (sum of all items' prices)
        const subTotal = order.items.reduce((total, item) => {
            return total + (item.product.price * item.quantity);
        }, 0);

        // Calculate shipping cost (example logic)
        const shippingCost = order.shippingMethod === "Premium" ? 100 : 50;

        // Calculate total amount
        const totalAmount = subTotal + shippingCost;

        // Add calculated fields to the order object
        order.subTotal = subTotal;
        order.shippingCost = shippingCost;
        order.totalAmount = totalAmount;

        // Render the single admin order view
        res.render("singleAdminOrder", { order });
    } catch (error) {
        console.error("Error loading single admin order page:", error);
        res.status(500).render("page-404"); // Render a 404 page or error page
    }
};





module.exports = {
    loadOrderManagement,
    loadSingleAdminOrder,
};