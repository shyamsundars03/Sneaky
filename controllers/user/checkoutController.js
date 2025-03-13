// controllers/user/checkoutController.js

const loadCheckout1 = (req, res) => {
    try {
        res.render("checkout1", {
            user: req.session.user, 
        });
    } catch (error) {
        console.error("Error loading cart page:", error);
        res.status(500).render("page-404"); // Render a 404 page or error page
    }
};
const loadCheckout2 = (req, res) => {
    try {
        res.render("checkout2", {
            user: req.session.user, 
        });
    } catch (error) {
        console.error("Error loading cart page:", error);
        res.status(500).render("page-404"); // Render a 404 page or error page
    }
};
const loadCheckout3 = (req, res) => {
    try {
        res.render("checkout3", {
            user: req.session.user, 
        });
    } catch (error) {
        console.error("Error loading cart page:", error);
        res.status(500).render("page-404"); // Render a 404 page or error page
    }
};

module.exports = {
    loadCheckout1,
    loadCheckout2,
    loadCheckout3,
};