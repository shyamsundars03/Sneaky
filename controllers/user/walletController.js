const User = require('../../models/userSchema');

// Load wallet page
const loadWallet = async (req, res) => {
    try {
        const userId = req.user._id;

        // Fetch the user with wallet details
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).render("page-404", { message: "User not found." });
        }

        // Render the wallet page with user's wallet data
        res.render("wallet", {
            user: req.user,
            walletBalance: user.wallet.balance,
            transactions: user.wallet.transactions,
        });
    } catch (error) {
        console.error("Error loading wallet:", error);
        res.status(500).render("page-404", { message: "Failed to load wallet." });
    }
};

// Add funds to wallet (optional)
const addFunds = async (req, res) => {
    try {
        const userId = req.user._id;
        const { amount } = req.body;

        // Update the wallet balance
        const user = await User.findByIdAndUpdate(
            userId,
            {
                $inc: { "wallet.balance": amount }, // Increase wallet balance
                $push: {
                    "wallet.transactions": {
                        type: "cashback",
                        amount: amount,
                        description: "Funds added to wallet",
                    },
                },
            },
            { new: true }
        );

        res.status(200).json({ success: true, balance: user.wallet.balance });
    } catch (error) {
        console.error("Error adding funds to wallet:", error);
        res.status(500).json({ success: false, message: "Failed to add funds." });
    }
};

module.exports = { loadWallet, addFunds };