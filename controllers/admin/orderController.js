// controllers/admin/orderController.js

const loadOrderManagement = (req, res) => {
    try {
        res.render("orderManagement"); // Render the order management page
    } catch (error) {
        console.error("Error loading order management page:", error);
        res.status(500).render("page-404"); // Render a 404 page or error page
    }
};

const loadSingleAdminOrder = (req, res) => {
    try {
        const orderId = req.params.id; // Get the order ID from the URL
        res.render("singleAdminOrder", { orderId }); // Render the single admin order page with order ID
    } catch (error) {
        console.error("Error loading single admin order page:", error);
        res.status(500).render("page-404"); // Render a 404 page or error page
    }
};

module.exports = {
    loadOrderManagement,
    loadSingleAdminOrder,
};