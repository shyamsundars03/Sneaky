const User = require("../../models/userSchema")
const mongoose = require("mongoose")
const Razorpay = require("razorpay")
const crypto = require("crypto")

// Initialize Razorpay with your test keys
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
})

// Load wallet page
const loadWallet = async (req, res) => {
  try {
    const userId = req.user._id
    const page = Number.parseInt(req.query.page) || 1
    const limit = 4

    const user = await User.findById(userId).lean()

    if (!user) {
      return res.status(404).render("page-404", { message: "User not found." })
    }

    // Manually sort transactions
    const sortedTransactions = user.wallet.transactions.sort((a, b) => new Date(b.date) - new Date(a.date))

    const totalTransactions = sortedTransactions.length
    const totalPages = Math.ceil(totalTransactions / limit)
    const paginatedTransactions = sortedTransactions.slice((page - 1) * limit, page * limit)

// Import your extract function if needed (you already defined it in the same file)
const transactionsWithOrderId = paginatedTransactions.map(transaction => {
  const extractedOrderId = extractOrderIdFromDescription(transaction.description);
  return {
    ...transaction,
    extractedOrderId
  };
});




    res.render("wallet", {
      user: req.user,
      walletBalance: user.wallet.balance,
      transactions: transactionsWithOrderId, 
      currentPage: page,
      totalPages,
      totalTransactions,
    })
  } catch (error) {
    console.error("Error loading wallet:", error)
    res.status(500).render("page-404", { message: "Failed to load wallet." })
  }
}

// Add funds to wallet (manual addition - can be used for admin purposes)
const addFunds = async (req, res) => {
  try {
    const userId = req.user._id
    const { amount } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      })
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $inc: { "wallet.balance": amount },
        $push: {
          "wallet.transactions": {
            type: "credit",
            amount: amount,
            description: "Funds added to wallet",
            date: new Date(),
          },
        },
      },
      { new: true },
    )

    res.json({
      success: true,
      balance: user.wallet.balance,
      message: `₹${amount} added to wallet successfully`,
    })
  } catch (error) {
    console.error("Error adding funds:", error)
    res.status(500).json({
      success: false,
      message: "Failed to add funds",
    })
  }
}

// Initialize Razorpay payment for wallet top-up
// walletController.js - Update the addFundsRazorpay function
const addFundsRazorpay = async (req, res) => {
    try {
      const { amount } = req.body;
      const userId = req.user._id;
  
      if (!amount || amount < 1) {
        return res.status(400).json({
          success: false,
          message: "Minimum amount is ₹1"
        });
      }
  
      // Create a shorter receipt ID (max 40 chars)
      const receiptId = `w${Date.now().toString().slice(-8)}`;
  
      // Create Razorpay order with additional options to restrict international cards
      const options = {
        amount: Math.round(amount * 100), // Convert to paise
        currency: "INR",
        receipt: receiptId,
        payment_capture: 1, // Auto-capture payment
        notes: {
          userId: userId.toString(),
          purpose: "wallet_topup"
        },
        method: {
          netbanking: true,
          card: true,
          upi: true,
          wallet: true,
          emi: false // Disable EMI if not needed
        }
      };
  
      const razorpayOrder = await razorpay.orders.create(options);
  
      res.json({
        success: true,
        key_id: process.env.RAZORPAY_KEY_ID,
        order_id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        name: "The Sneaky Club",
        description: "Wallet Top-up",
        prefill: {
          name: req.user.name || "",
          email: req.user.email || "",
          contact: req.user.phone || "",
        },
        theme: {
          color: "#3399cc"
        }
      });
    } catch (error) {
      console.error("Error creating Razorpay order:", error);
      res.status(500).json({
        success: false,
        message: "Failed to initialize payment: " + error.message,
        userMessage: "We only accept Indian payment methods. Please use an Indian card, UPI, or netbanking."
      });
    }
  };

// Verify Razorpay payment and add funds to wallet
const verifyRazorpayPayment = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, amount } = req.body
    const userId = req.user._id

    console.log("Verifying payment:", { razorpay_payment_id, razorpay_order_id, razorpay_signature })

    // Verify signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex")

    if (generatedSignature !== razorpay_signature) {
      await session.abortTransaction()
      console.error("Signature verification failed")
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      })
    }

    // Update user's wallet
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $inc: { "wallet.balance": amount },
        $push: {
          "wallet.transactions": {
            type: "credit",
            amount: amount,
            description: "Wallet top-up via Razorpay",
            date: new Date(),
            paymentId: razorpay_payment_id,
          },
        },
      },
      { new: true, session },
    )

    await session.commitTransaction()
    console.log("Payment verified and wallet updated")

    res.json({
      success: true,
      balance: user.wallet.balance,
      message: `₹${amount} added to wallet successfully`,
    })
  } catch (error) {
    await session.abortTransaction()
    console.error("Error verifying payment:", error)
    res.status(500).json({
      success: false,
      message: "Failed to verify payment: " + error.message,
    })
  } finally {
    session.endSession()
  }
}

// Function to extract orderId from transaction description
function extractOrderIdFromDescription(description) {
    if (!description) return null;
    
    // Try different patterns to extract order ID
    const patterns = [
        /order\s*[#:]?\s*([a-zA-Z0-9]{8,})/i,  // Matches "Order #ABC123XYZ"
        /(?:order|transaction)\s*ID:\s*(\w+)/i, // Matches "Order ID: ABC123"
        /#([a-f0-9]{24})/i,                     // Matches MongoDB ObjectId
        /([A-Z0-9]{8,})/                        // Generic alphanumeric
    ];
    
    for (const pattern of patterns) {
        const match = description.match(pattern);
        if (match && match[1]) {
            // If it looks like an ObjectId, verify format
            if (/^[a-f0-9]{24}$/i.test(match[1])) {
                return match[1];
            }
            // Otherwise take first 8+ character match
            return match[1].substring(0, 24);
        }
    }
    return null;
}

// Function to update wallet transactions
async function updateWalletTransactions() {
  try {
    const users = await User.find()

    for (const user of users) {
      for (const transaction of user.wallet.transactions) {
        // Logic to determine if the transaction should have an orderId
        if (transaction.type === "refund" && !transaction.orderId) {
          // Find the related order based on the description or other criteria
          const orderId = extractOrderIdFromDescription(transaction.description)
          if (orderId) {
            transaction.orderId = orderId // Set the orderId
          }
        }
      }
      await user.save() // Save the updated user
    }

    console.log("Wallet transactions updated successfully.")
  } catch (error) {
    console.error("Error updating wallet transactions:", error)
  }
}

module.exports = {
  loadWallet,
  addFunds,
  addFundsRazorpay,
  verifyRazorpayPayment,
  updateWalletTransactions,
}
