// controllers/admin/salesController.js

const loadSales = (req, res) => {
    try {
        res.render("sales"); // Render the sales page
    } catch (error) {
        console.error("Error loading sales page:", error);
        res.status(500).render("page-404"); // Render a 404 page or error page
    }
};

module.exports = {
    loadSales,
};