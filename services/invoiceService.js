const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const Order = require('../models/orderSchema');
const ejs = require('ejs');

const generateInvoice = async (orderId) => {
    let browser;
    try {
        const order = await Order.findById(orderId)
            .populate("items.product")
            .populate("user");
        
        if (!order) {
            throw new Error("Order not found.");
        }

        // Ensure public directory exists
        const publicDir = path.join(process.cwd(), 'public');
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir);
        }

        // Create invoices directory if it doesn't exist
        const invoicesDir = path.join(publicDir, 'invoices');
        if (!fs.existsSync(invoicesDir)) {
            fs.mkdirSync(invoicesDir, { recursive: true });
        }

        const filePath = path.join(invoicesDir, `${order.transactionId}.pdf`);
        const templatePath = path.join(__dirname, '../views/user/invoice.ejs');

        // Read template file
        if (!fs.existsSync(templatePath)) {
            throw new Error("Invoice template not found.");
        }
        const template = fs.readFileSync(templatePath, "utf8");

        // Calculate totals
        let subTotal = 0;
        let cancelledAmount = 0;
        let returnedAmount = 0;

        const processedItems = order.items.map((item) => {
            const itemTotal = item.price * item.quantity;

            if (item.status === "Cancelled") {
                cancelledAmount += itemTotal;
            } else if (item.status === "Returned") {
                returnedAmount += itemTotal;
            } else {
                subTotal += itemTotal;
            }

            return {
                product: item.product,
                quantity: item.quantity,
                price: item.price,
                total: itemTotal,
                status: item.status,
            };
        });

        const shippingCost = order.shippingCost || 0;
        const discountAmount = order.discountAmount || 0;
        const totalAmount = subTotal + shippingCost - discountAmount;

        // Render HTML
        const html = ejs.render(template, {
            order,
            shippingAddress: order.shippingAddress,
            user: order.user,
            transactionId: order.transactionId,
            createdAt: order.createdAt.toLocaleDateString(),
            paymentMethod: order.paymentMethod,
            items: processedItems,
            subTotal,
            cancelledAmount,
            returnedAmount,
            shippingCost,
            discountAmount,
            totalAmount,
            orderStatus: order.status,
        });

        // Generate PDF
        browser = await puppeteer.launch({
            headless: "new",
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });
        await page.pdf({
            path: filePath,
            format: "A4",
            margin: {
                top: "20px",
                bottom: "20px",
                left: "20px",
                right: "20px"
            }
        });

        return filePath;
    } catch (error) {
        console.error("Error in generateInvoice:", error);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

module.exports = { generateInvoice };