const mongoose = require("mongoose");
const { Schema } = mongoose;

const sizeDetailsSchema = new Schema({
    size: {
        type: String,
        enum: ['7', '8', '9', '10'],
        required: true
    },
    stock: {
        type: Number,
        required: true
    }
});

const productSchema = new Schema({
    productName: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: "Category",
        required: true
    },
    productImage: {
        type: [String],
        required: true
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    isListed: {
        type: Boolean,
        default: true
    },
    price: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    offerPrice: {
        type: Number,
        required: true
    },
    sizes: [sizeDetailsSchema] // Array of size-specific details
}, { timestamps: true });

const Product = mongoose.model("Product", productSchema);

module.exports = Product;