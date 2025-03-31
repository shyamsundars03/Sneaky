const mongoose = require("mongoose");
const { Schema } = mongoose;

const transactionSchema = new Schema({
    type: {
        type: String,
        enum: ['credit', 'debit', 'refund','referral'],  // Types of transactions
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
    referralCode: {
        type: String,
        unique: true,
        sparse: true // Allows null values but enforces uniqueness for non-null values
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