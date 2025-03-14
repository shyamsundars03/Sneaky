const Cart = require("../../models/cartSchema");
const Product = require("../../models/productSchema");
const usercollection = require("../../models/userSchema");

// Load Cart Page
const loadCart = async (req, res) => {
    try {
        const userId = req.user._id;

        const cart = await Cart.findOne({ user: userId }).populate({
            path: "cartItems.product",
            model: "Product",
        });

        let cartTotal = 0;
        if (cart) {
            cartTotal = cart.cartItems.reduce((total, item) => {
                return total + item.price * item.quantity;
            }, 0);
        }

        res.render("cart", {
            user: req.user,
            cart: cart || { cartItems: [], cartTotal: 0 },
            cartTotal,
        });
    } catch (error) {
        console.error("Error loading cart page:", error);
        res.status(500).render("page-404");
    }
};

// Add Product to Cart
const addToCart = async (req, res) => {
    try {
        const { productId, size, quantity = 1 } = req.body; // Default quantity is 1
        const userId = req.user._id;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        // Find the selected size and its stock
        const selectedSize = product.sizes.find(s => s.size === size);
        if (!selectedSize) {
            return res.status(400).json({ success: false, message: "Selected size not available." });
        }

        // Check if the requested quantity exceeds the stock
        if (quantity > selectedSize.stock) {
            return res.status(400).json({ success: false, message: "Quantity exceeds available stock." });
        }


        let cart = await Cart.findOne({ user: userId });

        if (!cart) {
            cart = new Cart({
                user: userId,
                cartItems: [],
            });
        }

        const existingItem = cart.cartItems.find(item => item.product.toString() === productId && item.size === size);

        if (existingItem) {
            // Check if the new quantity exceeds the stock
            if (existingItem.quantity + quantity > selectedSize.stock) {
                return res.status(400).json({ success: false, message: "Quantity exceeds available stock." });
            }
            existingItem.quantity += quantity;
        } else {
            cart.cartItems.push({
                product: productId,
                size, // Include the size field
                quantity,
                price: product.offerPrice || product.price,
            });
        }

        cart.cartTotal = cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
        await cart.save();

        res.json({ success: true, message: "Product added to cart!" });
    } catch (error) {
        console.error("Error adding to cart:", error);
        res.status(500).json({ success: false, message: "Failed to add the product to the cart." });
    }
};

// Update Product Quantity in Cart
const updateQuantity = async (req, res) => {
    try {
        const { productId, action } = req.body;
        const userId = req.user._id;

        const cart = await Cart.findOne({ user: userId }).populate('cartItems.product');

        if (!cart) {
            return res.status(404).json({ success: false, message: "Cart not found." });
        }

        const item = cart.cartItems.find(item => item.product._id.toString() === productId);

        if (!item) {
            return res.status(404).json({ success: false, message: "Product not found in cart." });
        }


        // Find the product and its stock for the selected size
        const product = await Product.findById(productId);
        const selectedSize = product.sizes.find(s => s.size === item.size);

        if (!selectedSize) {
            return res.status(400).json({ success: false, message: "Selected size not available." });
        }




        if (action === 'increase') {
            // Check if the new quantity exceeds the stock
            if (item.quantity + 1 > selectedSize.stock) {
                return res.status(400).json({ success: false, message: "Quantity exceeds available stock." });
            }
            item.quantity += 1;
        } else if (action === 'decrease' && item.quantity > 1) {
            item.quantity -= 1;
        }

        cart.cartTotal = cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
        await cart.save();

        res.json({
            success: true,
            newQuantity: item.quantity,
            newPrice: item.price * item.quantity,
            newSubtotal: cart.cartTotal,
            newTotal: cart.cartTotal,
        });
    } catch (error) {
        console.error("Error updating quantity:", error);
        res.status(500).json({ success: false, message: "Failed to update the quantity." });
    }
};

// Remove Product from Cart
const removeFromCart = async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.user._id;

        const cart = await Cart.findOne({ user: userId });

        if (!cart) {
            return res.status(404).json({ success: false, message: "Cart not found." });
        }

        cart.cartItems = cart.cartItems.filter(item => item.product.toString() !== productId);
        cart.cartTotal = cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
        await cart.save();

        res.json({ success: true, message: "Product removed from cart!" });
    } catch (error) {
        console.error("Error removing from cart:", error);
        res.status(500).json({ success: false, message: "Failed to remove the product from the cart." });
    }
};

module.exports = {
    loadCart,
    addToCart,
    updateQuantity,
    removeFromCart,
};