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
      const order = await Order.findById(orderId).populate("items.product").populate("user")
      if (!order) throw new Error("Order not found.")
  
      const invoicesDir = path.join(__dirname, "../public/invoices")
      if (!fs.existsSync(invoicesDir)) fs.mkdirSync(invoicesDir, { recursive: true })
  
      const filePath = path.join(invoicesDir, `${order.transactionId}.pdf`)
      const templatePath = path.join(__dirname, "../views/user/invoice.ejs")
      const template = fs.readFileSync(templatePath, "utf8")
  
      // Calculate totals correctly
      let subTotal = 0
      let cancelledAmount = 0
      let returnedAmount = 0
  
      const processedItems = order.items.map((item) => {
        const itemTotal = item.price * item.quantity
  
        // Track amounts by status
        if (item.status === "Cancelled") {
          cancelledAmount += itemTotal
        } else if (item.status === "Returned") {
          returnedAmount += itemTotal
        } else {
          subTotal += itemTotal
        }
  
        return {
          product: item.product,
          quantity: item.quantity,
          price: item.price,
          total: itemTotal,
          status: item.status,
        }
      })
  
      // Calculate final amounts
      const shippingCost = order.shippingCost || 0
      const discountAmount = order.discountAmount || 0
      const totalAmount = subTotal + shippingCost - discountAmount
  
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
      })
  
      const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      })
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: "networkidle0" })
      await page.pdf({ path: filePath, format: "A4" })
      await browser.close()
  
      return filePath
    } catch (error) {
      console.error("Error generating invoice:", error)
      throw error
    }
  }

module.exports = { generateInvoice };