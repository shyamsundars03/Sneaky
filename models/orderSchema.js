const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
});

const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    items: [orderItemSchema],
    shippingAddress: {
        name: String,
        street: String,
        city: String,
        state: String,
        zip: String,
        country: String,
    },
    paymentMethod: {
        type: String,
        enum: ["PayPal", "Wallet", "CashOnDelivery"],
        required: true,
    },
    shippingMethod: {
        type: String,
        enum: ["Standard", "Premium"],
        required: true,
    },
    totalAmount: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        enum: ["Pending", "Shipped", "Delivered", "Cancelled"],
        default: "Pending",
    },
}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);