const Order = require("../../models/orderSchema");
const Cart = require("../../models/cartSchema");
const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema");
const Product = require("../../models/productSchema");
// Load Checkout Step 1
const loadCheckout1 = async (req, res) => {
    try {
        const userId = req.user._id;
        const cart = await Cart.findOne({ user: userId }).populate("cartItems.product");

        if (!cart || cart.cartItems.length === 0) {
            return res.redirect("/cart");
        }
        // Fetch the user's addresses
        const addresses = await Address.find({ userId });
        
        // Calculate cart total
        const cartTotal = cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
        
        res.render("checkout1", { 
            cart, 
            addresses, 
            shippingCost:100,
            user: req.user, 
            cartTotal: cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0) 
        });
    } catch (error) {
        console.error("Error loading checkout1:", error);
        res.status(500).render("page-404");
    }
};

// Load Checkout Step 2
const loadCheckout2 = async (req, res) => {
    try {
        const userId = req.user._id;
        const cart = await Cart.findOne({ user: userId }).populate("cartItems.product");
        const user = await User.findById(userId);

        if (!cart || cart.cartItems.length === 0) {
            return res.redirect("/cart");
        }

        const walletBalance = user.wallet?.balance || 0;
        const cartTotal = cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
        const shippingCost = req.query.shippingCost ? Number(req.query.shippingCost) : 100;
        const totalAmount = cartTotal + shippingCost;

        // Calculate COD eligibility (max ₹7000)
        const isCODAllowed = totalAmount <= 7000;

        res.render("checkout2", { 
            cart, 
            user: req.user,
            walletBalance,
            cartTotal,
            shippingCost,
            isCODAllowed, // Pass this to the view
            totalAmount   // Pass total for client-side validation
        });
    } catch (error) {
        console.error("Error loading checkout2:", error);
        res.status(500).render("page-404");
    }
};

const loadCheckout3 = async (req, res) => {
    try {
        const userId = req.user._id;
        const cart = await Cart.findOne({ user: userId }).populate("cartItems.product");

        if (!cart || cart.cartItems.length === 0) {
            return res.redirect("/cart");
        }

        // Transform image paths for the frontend
        const filteredCartItems = cart.cartItems.map(item => {
            if (item.product.productImage && item.product.productImage[0]) {
                item.product.productImage[0] = item.product.productImage[0].replace(/\\/g, '/').replace('public/', '/');
            }
            return item;
        });


        // Retrieve data from query parameters
        const shippingCost = req.query.shippingCost || 100; // Default to 100 if not provided
        const shippingMethod = req.query.shippingMethod;
        const selectedAddress = JSON.parse(decodeURIComponent(req.query.selectedAddress || '{}'));
        const paymentMethod = req.query.paymentMethod;

        // Calculate cart total
        const cartTotal = cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0);

        res.render("checkout3", {
            cart: {
                cartItems: filteredCartItems,
                cartTotal: cartTotal,
            },
            user: req.user,
            cartTotal,
            shippingCost, // Pass shippingCost to the template
            shippingAddress: selectedAddress, // Pass selected address to the template
            shippingMethod, // Pass shipping method to the template
            paymentMethod, // Pass payment method to the template
        });
    } catch (error) {
        console.error("Error loading checkout3:", error);
        res.status(500).render("page-404");
    }
};

// Place Order
const placeOrder = async (req, res) => {
    try {
        const userId = req.user._id;
        const { shippingAddress, paymentMethod, shippingMethod, shippingCost } = req.body;

        // Retrieve the cart
        const cart = await Cart.findOne({ user: userId }).populate("cartItems.product");

        if (!cart || cart.cartItems.length === 0) {
            return res.status(400).json({ success: false, message: "Cart is empty." });
        }

        // Calculate total amount (products total + shipping cost)
        const productsTotal = cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
        const totalAmount = productsTotal + Number(shippingCost || 0);

        // Generate a unique transactionId
        const transactionId = `ORD${Math.floor(100000 + Math.random() * 900000)}`;


        // Create order
        const order = new Order({
            user: userId,
            items: cart.cartItems.map(item => ({
                product: item.product._id,
                quantity: item.quantity,
                price: item.price,
                size: item.size, // Include the size in the order item
            })),
            shippingAddress,
            paymentMethod,
            shippingMethod,
            shippingCost: Number(shippingCost || 0), // Save shipping cost
            totalAmount, // Save total amount (products total + shipping cost)
            transactionId,
        });

        // Save the order
        await order.save();

        // Update stock quantities in bulk for specific sizes
        const bulkOps = cart.cartItems.map(item => ({
            updateOne: {
                filter: { 
                    _id: item.product._id,
                    "sizes.size": item.size, // Match the specific size
                },
                update: { 
                    $inc: { "sizes.$.stock": -item.quantity }, // Decrease stock for the specific size
                },
            },
        }));
        await Product.bulkWrite(bulkOps);

        // Clear the cart
        await Cart.findOneAndDelete({ user: userId });

        // Redirect to order success page
        res.status(200).json({ success: true, orderId: order._id, transactionId });
    } catch (error) {
        console.error("Error placing order:", error);
        res.status(500).json({ success: false, message: "Failed to place order." });
    }
};

module.exports = {
    loadCheckout1,
    loadCheckout2,
    loadCheckout3,
    placeOrder,
};