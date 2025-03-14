const Wishlist = require("../../models/wishlistSchema");
const Product = require("../../models/productSchema");
const usercollection = require("../../models/userSchema");

// Load Wishlist Page
const loadWishlist = async (req, res) => {
    try {
        const userId = req.user._id;

        const wishlist = await Wishlist.findOne({ user: userId }).populate({
            path: "wishlistItems.product",
            model: "Product",
        });

        res.render("wishlist", {
            user: req.user,
            wishlist: wishlist || { wishlistItems: [] },
        });
    } catch (error) {
        console.error("Error loading wishlist page:", error);
        res.status(500).render("page-404");
    }
};

// Toggle Product in Wishlist
const toggleWishlist = async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.user._id;

        let wishlist = await Wishlist.findOne({ user: userId });

        if (!wishlist) {
            wishlist = new Wishlist({
                user: userId,
                wishlistItems: [],
            });
        }

        const existingItemIndex = wishlist.wishlistItems.findIndex(item => item.product.toString() === productId);

        if (existingItemIndex !== -1) {
            // Remove the product from the wishlist
            wishlist.wishlistItems.splice(existingItemIndex, 1);
        } else {
            // Add the product to the wishlist
            wishlist.wishlistItems.push({ product: productId });
        }

        // Save the wishlist and handle VersionError
        let retries = 3; // Number of retries
        while (retries > 0) {
            try {
                await wishlist.save();
                break; // Exit the loop if save is successful
            } catch (error) {
                if (error.name === 'VersionError') {
                    // Fetch the latest version of the document
                    wishlist = await Wishlist.findOne({ user: userId });
                    retries--;
                } else {
                    throw error; // Re-throw other errors
                }
            }
        }

        if (retries === 0) {
            throw new Error("Failed to update wishlist after multiple retries.");
        }

        res.json({ success: true, message: existingItemIndex !== -1 ? "Removed from Wishlist!" : "Added to Wishlist!" });
    } catch (error) {
        console.error("Error toggling wishlist:", error);
        res.status(500).json({ success: false, message: "Failed to update the wishlist." });
    }
};

// Get Wishlist Status
const getWishlistStatus = async (req, res) => {
    try {
        const userId = req.user._id;

        const wishlist = await Wishlist.findOne({ user: userId });

        if (!wishlist) {
            return res.json({ success: true, wishlistItems: [] });
        }

        const wishlistItems = wishlist.wishlistItems.map(item => item.product.toString());
        res.json({ success: true, wishlistItems });
    } catch (error) {
        console.error("Error fetching wishlist status:", error);
        res.status(500).json({ success: false, message: "Failed to fetch wishlist status." });
    }
};

module.exports = {
    loadWishlist,
    toggleWishlist,
    getWishlistStatus,
};