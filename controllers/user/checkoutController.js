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

        res.render("checkout1", { 
            cart, 
            addresses, 
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

        if (!cart || cart.cartItems.length === 0) {
            return res.redirect("/cart");
        }

        const cartTotal = cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0);

        // Retrieve shipping cost from sessionStorage or default to 100
        const shippingCost = req.session.shippingCost || 100;




        res.render("checkout2", { 
            cart, 
            user: req.user, 
            cartTotal ,
            shippingCost,
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

        // Retrieve data from query parameters
        const shippingCost = req.query.shippingCost || 100; // Default to 100 if not provided
        const shippingMethod = req.query.shippingMethod;
        const selectedAddress = JSON.parse(decodeURIComponent(req.query.selectedAddress || '{}'));
        const paymentMethod = req.query.paymentMethod;

        // Calculate cart total
        const cartTotal = cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0);

        res.render("checkout3", {
            cart,
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
        const { shippingAddress, paymentMethod, shippingMethod } = req.body;

        // Retrieve the cart
        const cart = await Cart.findOne({ user: userId }).populate("cartItems.product");

        if (!cart || cart.cartItems.length === 0) {
            return res.status(400).json({ success: false, message: "Cart is empty." });
        }

        // Calculate total amount
        const totalAmount = cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0);

        // Create order
        const order = new Order({
            user: userId,
            items: cart.cartItems.map(item => ({
                product: item.product._id,
                quantity: item.quantity,
                price: item.price,
            })),
            shippingAddress,
            paymentMethod,
            shippingMethod,
            totalAmount,
        });

        // Save the order
        await order.save();

        // Generate transaction ID using the last 4 digits of the order's _id
        const transactionId = `PN${order._id.toString().slice(-4)}`;

        // Update the order with the transaction ID
        order.transactionId = transactionId;
        await order.save();

        // Update stock quantities in bulk
        const bulkOps = cart.cartItems.map(item => ({
            updateOne: {
                filter: { _id: item.product._id },
                update: { $inc: { stock: -item.quantity } },
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