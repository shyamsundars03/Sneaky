const User = require("../../models/userSchema");
const mongoose = require("mongoose");
const Razorpay = require("razorpay");
const crypto = require("crypto");

// Initialize Razorpay with proper error handling
let razorpay;
try {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
} catch (error) {
  console.error("Failed to initialize Razorpay:", error);
}

// Load wallet page
const loadWallet = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = Number.parseInt(req.query.page) || 1;
    const limit = 4;

    const user = await User.findById(userId).lean();

    if (!user) {
      return res.status(404).render("page-404", { message: "User not found." });
    }

    // Ensure wallet exists
    if (!user.wallet) {
      user.wallet = { balance: 0, transactions: [] };
    }

    // Manually sort transactions
    const sortedTransactions = user.wallet.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalTransactions = sortedTransactions.length;
    const totalPages = Math.ceil(totalTransactions / limit);
    const paginatedTransactions = sortedTransactions.slice((page - 1) * limit, page * limit);

    // Process transactions to extract order IDs
    const transactionsWithOrderId = paginatedTransactions.map(transaction => {
      const extractedOrderId = extractOrderIdFromDescription(transaction.description);
      return {
        ...transaction,
        extractedOrderId: transaction.orderId || extractedOrderId
      };
    });

    res.render("wallet", {
      user: req.user,
      walletBalance: user.wallet.balance,
      transactions: transactionsWithOrderId, 
      currentPage: page,
      totalPages,
      totalTransactions,
    });
  } catch (error) {
    console.error("Error loading wallet:", error);
    res.status(500).render("page-404", { message: "Failed to load wallet." });
  }
};

// Initialize Razorpay payment for wallet top-up
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
    if (amount > 20000) {
      return res.status(400).json({
        success: false,
        message: "Maximum amount allowed is ₹20,000"
      });
    }
    
    // Create a unique receipt ID
    const receiptId = `wallet_${userId.toString().slice(-6)}_${Date.now().toString().slice(-8)}`;

    // Create Razorpay order
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: "INR",
      receipt: receiptId,
      payment_capture: 1, // Auto-capture payment
      notes: {
        userId: userId.toString(),
        purpose: "wallet_topup",
        amount: amount.toString()
      }
    };

    const razorpayOrder = await razorpay.orders.create(options);

    // Store in session for verification
    req.session.walletTopup = {
      amount: amount,
      razorpayOrderId: razorpayOrder.id
    };
    await req.session.save();

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
      message: "Failed to initialize payment: " + error.message
    });
  }
};

// Verify Razorpay payment and add funds to wallet
const verifyRazorpayPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, amount } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      throw new Error("Missing payment verification details");
    }

    // Get amount from session if not provided in request
    let paymentAmount = amount;
    if (!paymentAmount && req.session.walletTopup) {
      paymentAmount = req.session.walletTopup.amount;
    }

    if (!paymentAmount) {
      throw new Error("Payment amount not found");
    }

    // Verify signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      throw new Error("Payment verification failed - signature mismatch");
    }

    // Update user's wallet
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error("User not found");
    }

    // Ensure wallet exists
    if (!user.wallet) {
      user.wallet = { balance: 0, transactions: [] };
    }

    // Add funds to wallet
    const previousBalance = user.wallet.balance || 0;
    user.wallet.balance = previousBalance + Number(paymentAmount);
    
    // Add transaction record
    user.wallet.transactions.push({
      type: "credit",
      amount: Number(paymentAmount),
      description: `Wallet top-up via Razorpay (Payment ID: ${razorpay_payment_id})`,
      date: new Date(),
      paymentId: razorpay_payment_id
    });

    await user.save({ session });

    // Clear session data
    if (req.session.walletTopup) {
      delete req.session.walletTopup;
      await req.session.save();
    }

    await session.commitTransaction();

    res.json({
      success: true,
      balance: user.wallet.balance,
      message: `₹${paymentAmount} added to wallet successfully`
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error verifying payment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify payment: " + error.message
    });
  } finally {
    session.endSession();
  }
};

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

module.exports = {
  loadWallet,
  addFundsRazorpay,
  verifyRazorpayPayment
};