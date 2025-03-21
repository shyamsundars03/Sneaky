const mongoose = require("mongoose");
const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const PDFDocument = require('pdfkit');
const fs = require('fs');

// Load orders page
const loadOrder = async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect('/signin');
        }

        const userId = req.user._id;
        const searchTerm = req.query.search || '';

        // Fetch orders for the logged-in user and populate product details
        const orders = await Order.find({
            user: userId,
            $or: [
                { transactionId: { $regex: searchTerm, $options: 'i' } },
                { status: { $regex: searchTerm, $options: 'i' } },
            ],
        })
            .sort({ createdAt: -1 }) // Sort by most recent orders first
            .populate("items.product"); // Populate product details in the order items

        // Render the orders page with the orders data
        res.render("orders", { orders, user: req.user, searchTerm });
    } catch (error) {
        console.error("Error loading orders:", error);
        res.status(500).render("page-404", { message: "Failed to load orders." });
    }
};

// Load single order page
const loadSingleOrder = async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect('/signin');
        }

        const orderId = req.params.orderId;

        // Validate orderId
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).render("page-404", { message: "Invalid order ID." });
        }

        // Find the order by ID and populate product details
        const order = await Order.findById(orderId).populate({
            path: 'items.product',
            select: 'productName productImage price', // Ensure productImage is included
        });

        if (!order) {
            return res.status(404).render("page-404", { message: "Order not found." });
        }

        // Transform image paths for the frontend
        order.items = order.items.map(item => {
            if (item.product.productImage && item.product.productImage[0]) {
                item.product.productImage[0] = item.product.productImage[0].replace(/\\/g, '/').replace('public/', '/');
            }
            return item;
        });

        // Debug: Log product image paths
        order.items.forEach(item => {
            console.log("Transformed Product Image Path:", item.product.productImage[0]);
        });

        // Render the single order page with the order data
        res.render("singleOrder", { order, user: req.user });
    } catch (error) {
        console.error("Error loading single order:", error);
        res.status(500).render("page-404", { message: "Failed to load order details." });
    }
};

// Load Order Success Page
const loadOrderSuccess = async (req, res) => {
    try {
        const orderId = req.params.orderId;

        // Validate orderId
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).render("page-404", { message: "Invalid order ID." });
        }

        // Find the order by ID
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).render("page-404", { message: "Order not found." });
        }

        // Render the order success page with the transactionId
        res.render("orderSuccess", {
            orderId: order._id,
            transactionId: order.transactionId, // Ensure this is passed correctly
        });
    } catch (error) {
        console.error("Error loading order success page:", error);
        res.status(500).render("page-404", { message: "Internal server error." });
    }
};

// Cancel Order
const cancelOrder = async (req, res) => {
    try {
        const { orderId, reason } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        // Check if the order can be cancelled
        if (order.status !== 'Pending' && order.status !== 'Shipped') {
            return res.status(400).json({ success: false, message: "Order cannot be cancelled." });
        }

        // Update order status
        order.status = 'Cancelled';
        order.cancellationReason = reason;

        // Update stock for each item (increase stock by the ordered quantity)
        const bulkOps = order.items.map(item => ({
            updateOne: {
                filter: { 
                    _id: item.product,
                    "sizes.size": item.size, // Match the specific size
                },
                update: { 
                    $inc: { "sizes.$.stock": +item.quantity }, // Increase stock for the specific size
                },
            },
        }));
        await Product.bulkWrite(bulkOps);

        await order.save();

        res.status(200).json({ success: true, message: "Order cancelled successfully." });
    } catch (error) {
        console.error("Error cancelling order:", error);
        res.status(500).json({ success: false, message: "Failed to cancel order." });
    }
};

// Return Order
const returnOrder = async (req, res) => {
    try {
        const { orderId, reason } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        // Check if the order can be returned
        if (order.status !== 'Delivered') {
            return res.status(400).json({ success: false, message: "Order cannot be returned." });
        }

        // Update order status
        order.status = 'Return Request';
        order.returnReason = reason;

        await order.save();

        res.status(200).json({ success: true, message: "Return request submitted successfully." });
    } catch (error) {
        console.error("Error returning order:", error);
        res.status(500).json({ success: false, message: "Failed to submit return request." });
    }
};

const searchOrders = async (req, res) => {
    try {
        const userId = req.user._id;
        const query = req.query.query;

        const orders = await Order.find({
            user: userId,
            $or: [
                { transactionId: { $regex: query, $options: 'i' } },
                { status: { $regex: query, $options: 'i' } },
            ],
        }).populate("items.product");

        res.render("orders", { orders, user: req.user });
    } catch (error) {
        console.error("Error searching orders:", error);
        res.status(500).render("page-404", { message: "Failed to search orders." });
    }
};

const generateInvoice = async (order) => {
    const doc = new PDFDocument();
    const filePath = `./public/invoices/${order.transactionId}.pdf`;
    doc.pipe(fs.createWriteStream(filePath));

    doc.fontSize(25).text('Invoice', 100, 80);
    doc.fontSize(15).text(`Order ID: ${order.transactionId}`, 100, 120);
    doc.text(`Date: ${order.createdAt.toLocaleDateString()}`, 100, 140);
    doc.text(`Total Amount: ₹${order.totalAmount}`, 100, 160);

    doc.end();
    return filePath;
};

// Add this in orderController.js
const downloadInvoice = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findById(orderId).populate('items.product');

        if (!order) {
            return res.status(404).render("page-404", { message: "Order not found." });
        }

        // Generate PDF invoice
        const PDFDocument = require('pdfkit');
        const fs = require('fs');
        const path = require('path');

        // Ensure the invoices directory exists
        const invoicesDir = path.join(__dirname, '../../public/invoices');
        if (!fs.existsSync(invoicesDir)) {
            fs.mkdirSync(invoicesDir, { recursive: true });
        }

        const filePath = path.join(invoicesDir, `${order.transactionId}.pdf`);
        const doc = new PDFDocument();
        doc.pipe(fs.createWriteStream(filePath));

        // Add header
        doc.fontSize(20).text('SNEAKY', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text('No 11, Ram Nagar', { align: 'center' });
        doc.text('Ghandhipuram, Coimbatore, Tamil Nadu', { align: 'center' });
        doc.text('Phone: +91 8148413021 | Email: sneaky@gmail.com', { align: 'center' });
        doc.moveDown();

        // Add bill to section
        doc.fontSize(14).text('BILL TO', { underline: true });
        doc.fontSize(12).text(order.shippingAddress.name);
        doc.text(order.shippingAddress.street);
        doc.text(`${order.shippingAddress.city}, ${order.shippingAddress.state}, ${order.shippingAddress.zip}`);
        doc.text(`Phone: ${order.user.phone || 'N/A'} | Email: ${order.user.email}`);
        doc.moveDown();

        // Add invoice details
        doc.fontSize(14).text('INVOICE DETAILS', { underline: true });
        doc.fontSize(12).text(`Invoice No: ${order.transactionId}`);
        doc.text(`Invoice Date: ${order.createdAt.toLocaleDateString()}`);
        doc.text(`Due Date: ${order.createdAt.toLocaleDateString()}`);
        doc.text(`Payment Method: ${order.paymentMethod}`);
        doc.moveDown();

        // Add product table
        doc.fontSize(14).text('PRODUCTS', { underline: true });
        const tableTop = doc.y;
        doc.fontSize(12);
        doc.text('Product Name', 50, tableTop);
        doc.text('Quantity', 250, tableTop);
        doc.text('Unit Price', 350, tableTop);
        doc.text('Total', 450, tableTop);

        let y = tableTop + 20;
        order.items.forEach((item, index) => {
            doc.text(item.product.productName, 50, y);
            doc.text(item.quantity.toString(), 250, y);
            doc.text(`₹${item.price}`, 350, y);
            doc.text(`₹${item.price * item.quantity}`, 450, y);
            y += 20;
        });

        // Add summary
        const summaryTop = y + 20;
        doc.text('Sub Total', 350, summaryTop);
        doc.text(`₹${order.totalAmount - (order.shippingCost || 0)}`, 450, summaryTop);

        doc.text('Delivery', 350, summaryTop + 20);
        doc.text(`₹${order.shippingCost || 0}`, 450, summaryTop + 20);

        doc.text('GST (18%)', 350, summaryTop + 40);
        const gst = (order.totalAmount * 0.18).toFixed(2);
        doc.text(`₹${gst}`, 450, summaryTop + 40);

        doc.text('Coupon', 350, summaryTop + 60);
        doc.text('₹0', 450, summaryTop + 60);

        doc.font('Helvetica-Bold').text('Total', 350, summaryTop + 80);
        const total = (order.totalAmount + Number(gst)).toFixed(2);
        doc.text(`₹${total}`, 450, summaryTop + 80);

        // Add footer
        doc.moveDown(2);
        doc.fontSize(12).text('Thank you for your business!', { align: 'center' });

        doc.end();

        // Send the file for download
        res.download(filePath);
    } catch (error) {
        console.error("Error generating invoice:", error);
        res.status(500).render("page-404", { message: "Failed to generate invoice." });
    }
};

module.exports = {
    loadOrder,
    loadSingleOrder,
    loadOrderSuccess,
    cancelOrder,
    returnOrder,
    searchOrders,
    downloadInvoice,
    generateInvoice,

};