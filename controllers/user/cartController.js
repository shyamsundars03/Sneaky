// controllers/user/cartController.js

const loadCart = (req, res) => {
    try {
        res.render("cart", {
            user: req.session.user, 
        });
    } catch (error) {
        console.error("Error loading cart page:", error);
        res.status(500).render("page-404"); // Render a 404 page or error page
    }
};

module.exports = {
    loadCart,
};