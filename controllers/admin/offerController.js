// controllers/admin/offerController.js

const loadOfferManagement = (req, res) => {
    try {
        res.render("offerManagement"); // Render the offer management page
    } catch (error) {
        console.error("Error loading offer management page:", error);
        res.status(500).render("page-404"); // Render a 404 page or error page
    }
};

module.exports = {
    loadOfferManagement,
};