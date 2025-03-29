const Wishlist = require("../../models/wishlistSchema");
const Product = require("../../models/productSchema");
const usercollection = require("../../models/userSchema");
const Offer = require("../../models/offerSchema"); 


// Load Wishlist Page
const loadWishlist = async (req, res) => {
    try {
        const userId = req.user._id;

        // Fetch the wishlist and populate product details
        const wishlist = await Wishlist.findOne({ user: userId }).populate({
            path: "wishlistItems.product",
            model: "Product",
            select: "productName productImage price sizes isListed",

        });



 // Transform wishlist items
        // Filter out unlisted products
        if (wishlist) {
            wishlist.wishlistItems = wishlist.wishlistItems.filter(item => 
                item.product && item.product.isListed
            );
            
            // Transform product images
            wishlist.wishlistItems.forEach(item => {
                if (item.product.productImage && item.product.productImage[0]) {
                    item.product.productImage[0] = item.product.productImage[0]
                        .replace(/\\/g, '/')
                        .replace('public/', '/');
                }
            });
        }

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

        // Get product with populated category
        const product = await Product.findById(productId).populate('category');
        if (!product) {
            return res.status(404).json({ 
                success: false, 
                message: "Product not found." 
            });
        }

        let wishlist = await Wishlist.findOne({ user: userId });
        let finalPrice = null; // Initialize finalPrice

        if (!wishlist) {
            wishlist = new Wishlist({
                user: userId,
                wishlistItems: [],
            });
        }

        const existingItemIndex = wishlist.wishlistItems.findIndex(
            item => item.product.toString() === productId
        );

        if (existingItemIndex !== -1) {
            // Remove the product from the wishlist
            wishlist.wishlistItems.splice(existingItemIndex, 1);
        } else {
            // Calculate final price only when adding to wishlist
            finalPrice = product.offerPrice || product.price;

            // Check for active category offers if product has a category
            if (product.category) {
                try {
                    const currentDate = new Date();
                    const activeOffers = await Offer.find({
                        startDate: { $lte: currentDate },
                        endDate: { $gte: currentDate }
                    }).populate('category');

                    const categoryOffer = activeOffers.find(offer => 
                        offer.category && offer.category._id.toString() === product.category._id.toString()
                    );

                    if (categoryOffer) {
                        const categoryOfferPrice = Math.round(product.price * (1 - categoryOffer.discountPercentage/100));
                        if (categoryOfferPrice < finalPrice) {
                            finalPrice = categoryOfferPrice;
                        }
                    }
                } catch (offerError) {
                    console.error("Error checking offers:", offerError);
                    // Continue with existing finalPrice if offer check fails
                }
            }

            // Add the product to the wishlist with the final price
            wishlist.wishlistItems.push({ 
                product: productId,
                price: finalPrice
            });
        }


        await wishlist.save();

        res.json({ 
            success: true, 
            message: existingItemIndex !== -1 ? "Removed from Wishlist!" : "Added to Wishlist!",
            price: existingItemIndex === -1 ? finalPrice : null // Only send price when adding
        });
    } catch (error) {
        console.error("Error toggling wishlist:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to update the wishlist.",
            error: error.message 
        });
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