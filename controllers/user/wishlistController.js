// controllers/user/wishlistController.js

const loadWishlist = (req, res) => {
    try {
        res.render("wishlist", {
            user: req.session.user, 
        });
    } catch (error) {
        console.error("Error loading wishlist page:", error);
        res.status(500).render("page-404"); 
    }
};

module.exports = {
    loadWishlist,
};