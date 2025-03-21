const mongoose = require("mongoose");
const { Schema } = mongoose;

const transactionSchema = new Schema({
    type: {
        type: String,
        enum: ["cashback", "refund", "purchase"], // Types of transactions
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    description: {
        type: String,
        default: "",
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
            default: 0, // Default wallet balance is 0
        },
        transactions: [transactionSchema], // Array of transactions
    },
}, {
    timestamps: true,
});

const User = mongoose.model("User", userSchema);

module.exports = User;