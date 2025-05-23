const mongoose = require("mongoose");
const { Schema } = mongoose;

const transactionSchema = new Schema({
    type: {
        type: String,
        enum: ['credit', 'debit', 'refund','referral'],  
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        default: Date.now,
        index: -1
    },
    description: {
        type: String,
        default: "",
    },
    paymentId: {
        type: String,
        default: null
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        default: null
    },
});

const userSchema = new Schema({
    name: {
        type: String,
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    phone: {
        type: String,
        default: null,
    },
    password: {
        type: String,
        default: null,
    },
    profileImage: {
        type: String,
        default: null,
    },
    googleId: {
        type: String,
        default: null,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    wallet: {
        balance: {
            type: Number,
            default: 0, 
        },
        transactions: [transactionSchema], 
    },
    referralCode: {
        type: String,
        unique: true,
        sparse: true 
    },
    referredBy: {
        type: String,
        default: null
    },
    referralCount: {
        type: Number,
        default: 0
    },

}, {
    timestamps: true,
});

const User = mongoose.model("User", userSchema);

module.exports = User;