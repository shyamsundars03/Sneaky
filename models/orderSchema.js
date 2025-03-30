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
    size: {  // Add size field for variant tracking
        type: String,
        required: true
    },

    status: {
        type: String,
        enum: ["Pending", "Shipped", "Delivered", "Cancelled", "Returned"],
        default: "Pending",
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
        enum: ["Razorpay", "Wallet", "CashOnDelivery"],
        required: true,
    },
    shippingMethod: {
        type: String,
        enum: ["Standard", "Premium"],
        required: true,
    },
    shippingCost: {
        type: Number,
        default: 0, 
    },
    totalAmount: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        enum: ["Payment Processing","Processing", "Pending", "Shipped", "Delivered", "Cancelled", "Return Requested", "Returned"],
        default: "Payment Processing"
    },
    transactionId: {
        type: String,
        unique: true, 
    },
    couponCode: {
        type: String
    },
    discountAmount: {
        type: Number,
        default: 0
    },
    paymentId: String,
    paymentStatus: {
        type: String,
        enum: ["Pending", "Completed", "Failed"],
        default: "Pending"
    },
    walletDetails: {
        amountDeducted: Number,
        transactionId: String,
        previousBalance: Number,
        newBalance: Number
    },
    cancellationReason: String,
    returnReason: String,
    returnVerified: {
        type: Boolean,
        default: false
    },
    refundProcessed: {
        type: Boolean,
        default: false
    },
    stockRestored: {
        type: Boolean,
        default: false
    },
    inventoryRestoreScheduled: {
        type: Boolean,
        default: false
    }

}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);