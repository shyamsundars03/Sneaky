// controllers/admin/couponController.js

const loadCouponManagement = (req, res) => {
    try {
        res.render("couponManagement"); // Render the coupon management page
    } catch (error) {
        console.error("Error loading coupon management page:", error);
        res.status(500).render("page-404"); // Render a 404 page or error page
    }
};

module.exports = {
    loadCouponManagement,
};