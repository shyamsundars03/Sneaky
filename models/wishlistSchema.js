const mongoose = require("mongoose");

const wishlistSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    wishlistItems: [
        {
            product: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Product",
                required: true,
            },
            price: { 
                type: Number,
                required: true
            }

        },
    ],
}, { timestamps: true ,versionKey: false });

const Wishlist = mongoose.model("Wishlist", wishlistSchema);

module.exports = Wishlist;