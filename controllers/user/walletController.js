const User = require('../../models/userSchema');
const mongoose = require('mongoose');


// Load wallet page
const loadWallet = async (req, res) => {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = 3;

        const user = await User.findById(userId)
            .lean(); // Convert to plain JS object

        if (!user) {
            return res.status(404).render("page-404", { message: "User not found." });
        }

        // Manually sort transactions
        const sortedTransactions = user.wallet.transactions
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        const totalTransactions = sortedTransactions.length;
        const totalPages = Math.ceil(totalTransactions / limit);
        const paginatedTransactions = sortedTransactions.slice(
            (page - 1) * limit,
            page * limit
        );

        await updateWalletTransactions();
        
        res.render("wallet", {
            user: req.user,
            walletBalance: user.wallet.balance,
            transactions: paginatedTransactions,
            currentPage: page,
            totalPages,
            totalTransactions
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


// Function to extract orderId from transaction description
function extractOrderIdFromDescription(description) {
    const regex = /#(\w+)/; // Adjust this regex based on your description format
    const match = description.match(regex);
    return match ? match[1] : null; // Return the orderId if found
}

// Function to update wallet transactions
async function updateWalletTransactions() {
    try {
        const users = await User.find();

        for (const user of users) {
            for (const transaction of user.wallet.transactions) {
                // Logic to determine if the transaction should have an orderId
                if (transaction.type === 'refund' && !transaction.orderId) {
                    // Find the related order based on the description or other criteria
                    const orderId = extractOrderIdFromDescription(transaction.description);
                    if (orderId) {
                        transaction.orderId = orderId; // Set the orderId
                    }
                }
            }
            await user.save(); // Save the updated user
        }

        console.log('Wallet transactions updated successfully.');
    } catch (error) {
        console.error('Error updating wallet transactions:', error);
    }
}

// Example function to get wallet details
const getWalletDetails = async (req, res) => {
    try {
        const userId = req.user._id; // Assuming user is authenticated
        const user = await User.findById(userId);

        // Call the update function to ensure wallet transactions are up to date
        await updateWalletTransactions();

        res.render('wallet', {
            walletBalance: user.wallet.balance,
            transactions: user.wallet.transactions,
            // Add any other data you need for rendering
        });
    } catch (error) {
        console.error('Error fetching wallet details:', error);
        res.status(500).send('Internal Server Error');
    }
};






module.exports = { loadWallet, addFunds,    getWalletDetails,
    updateWalletTransactions, };