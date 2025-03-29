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
// In walletController.js
const addFunds = async (req, res) => {
    try {
        const userId = req.user._id;
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid amount" 
            });
        }

        // Update the wallet balance
        const user = await User.findByIdAndUpdate(
            userId,
            {
                $inc: { "wallet.balance": amount },
                $push: {
                    "wallet.transactions": {
                        type: "credit",
                        amount: amount,
                        description: "Funds added to wallet",
                        date: new Date()
                    }
                }
            },
            { new: true }
        );

        res.json({ 
            success: true, 
            balance: user.wallet.balance,
            message: `₹${amount} added to wallet successfully`
        });
    } catch (error) {
        console.error("Error adding funds:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to add funds" 
        });
    }
};

module.exports = { loadWallet, addFunds };