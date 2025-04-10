const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const Order = require('../models/orderSchema');
const ejs = require('ejs');

/**
 * Generate an invoice for an order and save it as a PDF file.
 * @param {string} orderId - The ID of the order.
 * @returns {Promise<string>} - The file path of the generated invoice.
 */
const generateInvoice = async (orderId) => {
    try {
        const order = await Order.findById(orderId).populate('items.product');
        if (!order) throw new Error('Order not found.');

        const invoicesDir = path.join(__dirname, '../../public/invoices');
        if (!fs.existsSync(invoicesDir)) fs.mkdirSync(invoicesDir, { recursive: true });

        const filePath = path.join(invoicesDir, `${order.transactionId}.pdf`);
        const templatePath = path.join(__dirname, '../views/user/invoice.ejs');
        const template = fs.readFileSync(templatePath, 'utf8');

        const html = ejs.render(template, {
            order, // Pass the entire order object
            shippingAddress: order.shippingAddress,
            user: order.user,
            transactionId: order.transactionId,
            createdAt: order.createdAt.toLocaleDateString(),
            paymentMethod: order.paymentMethod,
            items: order.items.map(item => ({
                product: item.product,
                quantity: item.quantity,
                price: item.price,
                total: item.price * item.quantity,
            })),
            subTotal: order.totalAmount - (order.shippingCost || 0),
            shippingCost: order.shippingCost || 0,
            totalAmount: order.totalAmount
        });

        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.pdf({ path: filePath, format: 'A4' });
        await browser.close();

        return filePath;
    } catch (error) {
        console.error('Error generating invoice:', error);
        throw error;
    }
};

module.exports = { generateInvoice };