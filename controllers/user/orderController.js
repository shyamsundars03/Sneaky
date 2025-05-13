const mongoose = require("mongoose");
const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const { generateInvoice } = require('../../services/invoiceService');
const { generateUserInvoice } = require('../../services/invoice');
const fs = require('fs');
// Load orders page
const loadOrder = async (req, res) => {
    try {
        if (!req.user) return res.redirect('/signin');

        const userId = req.user._id;
        const searchTerm = req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 5; // Items per page

        // Build query
        const query = {
            user: userId,
            $or: [
                { transactionId: { $regex: searchTerm, $options: 'i' } },
                { status: { $regex: searchTerm, $options: 'i' } }
            ]
        };

        // Get total count
        const totalOrders = await Order.countDocuments(query);
        
        // Calculate pagination values
        const totalPages = Math.ceil(totalOrders / limit);
        const skip = (page - 1) * limit;

        // Get orders with pagination
        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("items.product");

// Process orders to calculate active quantities and amounts
const processedOrders = orders.map(order => {
    const orderObj = order.toObject();
    
    // Calculate active quantities (excluding cancelled and returned items)
    let activeQuantity = 0;
    let activeAmount = 0;
    
    order.items.forEach(item => {
        if (item.status !== 'Cancelled' && item.status !== 'Returned') {
            activeQuantity += item.quantity;
            activeAmount += (item.price * item.quantity);
        }
    });
    
    // Add shipping cost and subtract discount
    const finalAmount = activeAmount + (order.shippingCost || 0) - (order.discountAmount || 0);
    
    return {
        ...orderObj,
        activeQuantity,
        activeAmount: finalAmount
    };
});




        res.render("orders", {
            orders: processedOrders,
            user: req.user,
            searchTerm,
            currentPage: page,
            totalPages,
            totalOrders
        });
    } catch (error) {
        console.error("Error loading orders:", error);
        res.status(500).render("page-404");
    }
};

const loadSingleOrder = async (req, res) => {
    try {
        if (!req.user) return res.redirect('/signin');

        const orderIdParam = req.params.orderId;
        const isObjectId = mongoose.Types.ObjectId.isValid(orderIdParam);

        const order = await Order.findOne({ 
            [isObjectId ? '_id' : 'transactionId']: orderIdParam,
            user: req.user._id 
        }).populate({
            path: 'items.product',
            select: 'productName productImage price sizes category',
            populate: {
                path: 'category',
                select: 'name'
            }
        });

        if (!order) {
            return res.status(404).render("page-404", { message: "Order not found." });
        }

        // Calculate totals
        let subTotal = 0;
        let cancelledAmount = 0;
        let returnedAmount = 0;
        let activeItemsCount = 0;

        const items = order.items.map(item => {
            const itemTotal = item.price * item.quantity;
            
            if (item.status === 'Cancelled') {
                cancelledAmount += itemTotal;
            } else if (item.status === 'Returned') {
                returnedAmount += itemTotal;
            } else {
                subTotal += itemTotal;
                activeItemsCount++;
            }
            
            // Fix image path
            if (item.product?.productImage?.[0]) {
                item.product.productImage[0] = item.product.productImage[0]
                    .replace(/\\/g, '/')
                    .replace('public/', '/');
            }
            
            return {
                ...item.toObject(),
                itemTotal: itemTotal.toFixed(2)
            };
        });
        
        const shippingCost = order.shippingCost || 0;
        const discountAmount = order.discountAmount || 0;
        
        // If all items are cancelled or returned, set grand total to 0
        let grandTotal;
        if (activeItemsCount === 0) {
            grandTotal = 0;
        } else {
            grandTotal = (subTotal + shippingCost - discountAmount).toFixed(2);
        }
        
        res.render("singleOrder", { 
            order: {
                ...order.toObject(),
                items,
                subtotal: order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2), // Original subtotal
                cancelledAmount: cancelledAmount.toFixed(2),
                returnedAmount: returnedAmount.toFixed(2),
                shippingCost: shippingCost.toFixed(2),
                discountAmount: discountAmount.toFixed(2),
                grandTotal: grandTotal,
                hasDiscount: discountAmount > 0,
                activeItemsCount
            },
            user: req.user
        });
    } catch (error) {
        console.error("Error loading single order:", error);
        res.status(500).render("page-404", { message: "Failed to load order details." });
    }
};

const loadOrderSuccess = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order) return res.redirect('/orders');
        
        // Clear checkout session data
        if (req.session.checkoutData) {
            delete req.session.checkoutData;
        }
        if (req.session.pendingOrder) {
            delete req.session.pendingOrder;
        }
        await req.session.save();
        
        res.render('orderSuccess', {
            orderId: order._id,
            transactionId: order.transactionId
        });
    } catch (error) {
        res.redirect('/orders');
    }
};

const loadOrderFailed = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order) return res.redirect('/orders');
        
        // Clear checkout session data but keep cart intact
        if (req.session.checkoutData) {
            delete req.session.checkoutData;
        }
        if (req.session.pendingOrder) {
            delete req.session.pendingOrder;
        }
        await req.session.save();
        
        res.render('orderFailed', {
            orderId: order._id,
            transactionId: order.transactionId
        });
    } catch (error) {
        res.redirect('/cart');
    }
};

// Cancel Order
const cancelOrder = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { orderId, reason } = req.body

    if (!reason || reason.trim().length < 5) {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        message: "Please provide a valid reason for cancellation (minimum 5 characters).",
      })
    }

    // Verify order belongs to user
    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
    })
      .populate({
        path: "items.product",
        select: "_id sizes",
      })
      .session(session)

    if (!order) {
      await session.abortTransaction()
      return res.status(404).json({
        success: false,
        message: "Order not found or unauthorized.",
      })
    }

    // Validate order can be cancelled - include 'Pending' status
    const cancellableStatuses = ["Pending", "Ordered", "Processing", "Shipped"]
    if (!cancellableStatuses.includes(order.status)) {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        message: "Order can only be cancelled before delivery.",
      })
    }

    // Prevent duplicate refunds
    if (order.refundProcessed) {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        message: "Refund already processed for this order.",
      })
    }

    // Restore product stock
    const bulkOps = order.items.map((item) => ({
      updateOne: {
        filter: {
          _id: item.product._id,
          "sizes.size": item.size,
        },
        update: {
          $inc: { "sizes.$.stock": item.quantity },
        },
      },
    }))
    await Product.bulkWrite(bulkOps, { session })

    // Process refund to wallet ONLY for non-COD orders
    // For COD orders, ONLY process refund if the order was already delivered
    // This ensures we don't refund money that hasn't been collected yet
    const shouldProcessRefund =
      order.paymentMethod !== "COD" || (order.paymentMethod === "COD" && order.status === "Delivered")

    // For COD orders that haven't been delivered yet, NEVER process a refund
    if (order.paymentMethod === "COD" && order.status !== "Delivered") {
      console.log(`No refund processed for COD order ${order.transactionId} - payment not yet collected`)
    }

    if (shouldProcessRefund) {
      const userUpdate = await User.findByIdAndUpdate(
        req.user._id,
        {
          $inc: { "wallet.balance": order.totalAmount },
          $push: {
            "wallet.transactions": {
              type: "refund",
              amount: order.totalAmount,
              description: `Refund for cancelled ${order.paymentMethod} order #${order.transactionId}`,
              date: new Date(),
              orderId: order._id,
            },
          },
        },
        { new: true, session },
      )

      if (!userUpdate) {
        throw new Error("Failed to update wallet")
      }

      order.refundProcessed = true
      order.paymentStatus = "Refunded"
    }

    // Update order status
    order.status = "Cancelled"
    order.cancellationReason = reason
    order.cancelledDate = new Date()

    // Update all items status
    order.items.forEach((item) => {
      item.status = "Cancelled"
      item.cancelled = true
      item.cancellationReason = reason
    })

    // Set grand total to 0 if all items are cancelled
    if (order.items.every((item) => item.status === "Cancelled")) {
      order.grandTotal = 0
    }

    await order.save({ session })
    await session.commitTransaction()

    let message = "Order cancelled successfully. Stock has been restored."
    if (shouldProcessRefund) {
      message += ` ₹${order.totalAmount} refunded to wallet.`
    }

    return res.status(200).json({
      success: true,
      message,
    })
  } catch (error) {
    await session.abortTransaction()
    console.error("Error cancelling order:", error)
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to cancel order.",
    })
  } finally {
    session.endSession()
  }
}

// Cancel single item
const cancelOrderItem = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { orderId, itemId, reason } = req.body

    if (!reason || reason.trim().length < 5) {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        message: "Please provide a valid reason for cancellation (minimum 5 characters).",
      })
    }

    if (!req.user || !req.user._id) {
      await session.abortTransaction()
      return res.status(401).json({
        success: false,
        message: "User not authenticated.",
      })
    }

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
    })
      .populate({
        path: "items.product",
        select: "_id sizes productName price",
      })
      .session(session)

    if (!order) {
      await session.abortTransaction()
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      })
    }

    const item = order.items.id(itemId)
    if (!item) {
      await session.abortTransaction()
      return res.status(404).json({
        success: false,
        message: "Item not found in order.",
      })
    }

    // Prevent duplicate cancellations/refunds
    if (item.status === "Cancelled" || item.status === "Returned") {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        message: `Item already ${item.status.toLowerCase()}.`,
      })
    }

    // Validate item can be cancelled - include 'Pending' status
    const cancellableStatuses = ["Pending", "Ordered", "Processing", "Shipped"]
    if (!cancellableStatuses.includes(item.status)) {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        message: "Item can only be cancelled before delivery.",
      })
    }

    // Restore stock
    await Product.updateOne(
      {
        _id: item.product._id,
        "sizes.size": item.size,
      },
      { $inc: { "sizes.$.stock": item.quantity } },
      { session },
    )

    // Calculate refund amount
    const itemAmount = item.price * item.quantity

    // Check if this is the last active item in the order
    const activeItems = order.items.filter(
      (i) => i.status !== "Cancelled" && i.status !== "Returned" && i._id.toString() !== itemId,
    )

    const isLastItem = activeItems.length === 0

    // Process refund to wallet ONLY for non-COD orders
    // For COD orders, ONLY process refund if the order was already delivered
    // This ensures we don't refund money that hasn't been collected yet
    const shouldProcessRefund =
      order.paymentMethod !== "COD" || (order.paymentMethod === "COD" && order.status === "Delivered")

    // For COD orders that haven't been delivered yet, NEVER process a refund
    if (order.paymentMethod === "COD" && order.status !== "Delivered") {
      console.log(`No refund processed for COD order ${order.transactionId} - payment not yet collected`)
    }

    if (shouldProcessRefund) {
      let refundAmount = itemAmount
      let refundDescription = `Refund for ${item.product.productName} from ${order.paymentMethod} order #${order.transactionId}`

      // If this is the last item, include shipping cost in refund
      if (isLastItem) {
        refundAmount += order.shippingCost || 0
        refundDescription = `Refund for cancelled order #${order.transactionId} (including shipping)`
      }

      const userUpdate = await User.findByIdAndUpdate(
        req.user._id,
        {
          $inc: { "wallet.balance": refundAmount },
          $push: {
            "wallet.transactions": {
              type: "refund",
              amount: refundAmount,
              description: refundDescription,
              date: new Date(),
              orderId: order._id,
            },
          },
        },
        { new: true, session },
      )

      if (!userUpdate) {
        throw new Error("Failed to update wallet")
      }

      item.refundProcessed = true
      console.log(`Processed refund of ₹${refundAmount} for ${order.paymentMethod} order ${order.transactionId}`)
    } else {
      // No refund processed - either COD order not delivered yet or other reason
      console.log(
        `No refund processed for item in order ${order.transactionId} - shouldProcessRefund: ${shouldProcessRefund}`,
      )
      console.log(`Payment method: ${order.paymentMethod}, Order status: ${order.status}`)
    }

    // Update item status
    item.status = "Cancelled"
    item.cancelled = true
    item.cancellationReason = reason
    item.cancelledDate = new Date()

    // Update order status if all items are cancelled
    if (isLastItem) {
      order.status = "Cancelled"
      order.cancellationReason = "All items cancelled"
      order.cancelledDate = new Date()

      // Set grand total to 0 if all items are cancelled or returned
      order.grandTotal = 0

      if (shouldProcessRefund) {
        order.refundProcessed = true
        order.paymentStatus = "Refunded"
      }
    } else {
      // Recalculate grand total
      const activeItemsTotal = activeItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
      order.grandTotal = activeItemsTotal + order.shippingCost - (order.discountAmount || 0)
    }

    await order.save({ session })
    await session.commitTransaction()

    let responseMessage = `Item cancelled successfully. Stock has been restored.`
    let refundAmount = 0

    if (shouldProcessRefund) {
      refundAmount = isLastItem ? itemAmount + (order.shippingCost || 0) : itemAmount
      responseMessage += ` ₹${refundAmount} refunded to wallet.`
    }

    res.json({
      success: true,
      message: responseMessage,
      refundAmount: refundAmount,
    })
  } catch (error) {
    await session.abortTransaction()
    console.error("Error cancelling item:", error)
    res.status(500).json({
      success: false,
      message: error.message || "Failed to cancel item.",
    })
  } finally {
    session.endSession()
  }
}


// Return Order
const returnOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
  
    try {
        const { orderId, reason } = req.body;
  
        if (!reason || reason.trim().length < 10) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: "Please provide a detailed reason for return (minimum 10 characters).",
            });
        }
  
        const order = await Order.findOne({
            _id: orderId,
            user: req.user._id,
            status: "Delivered", // Only delivered orders can be returned
        })
        .populate("items.product")
        .session(session);
  
        if (!order) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: "Order not found or not eligible for return.",
            });
        }
  
        // Update order status
        order.status = "Return Requested";
        order.returnReason = reason.trim();
  
        // Update all items status
        order.items.forEach((item) => {
            if (item.status === "Delivered") {
                // Only update delivered items
                item.status = "Return Requested";
                item.returnReason = reason.trim();
            }
        });
  
        await order.save({ session });
        await session.commitTransaction();
  
        res.status(200).json({
            success: true,
            message: "Return request submitted for admin verification.",
        });
    } catch (error) {
        await session.abortTransaction();
        console.error("Error returning order:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to submit return request.",
        });
    } finally {
        session.endSession();
    }
};

// Return single item
const returnOrderItem = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
  
    try {
        const { orderId, itemIndex, reason } = req.body;
  
        if (!reason || reason.trim().length < 10) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: "Please provide a detailed reason for return (minimum 10 characters).",
            });
        }
  
        const order = await Order.findOne({
            _id: orderId,
            user: req.user._id,
        })
        .populate({
            path: "items.product",
            select: "_id sizes productName",
        })
        .session(session);
  
        if (!order || itemIndex >= order.items.length) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: "Order or item not found.",
            });
        }
  
        // Validate order is delivered
        if (order.status !== "Delivered") {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: "Only delivered orders can be returned.",
            });
        }
  
        const item = order.items[itemIndex];
  
        // Validate item can be returned
        if (item.status !== "Delivered") {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: `Item is ${item.status.toLowerCase()}, cannot be returned.`,
            });
        }
  
        // Update item status
        item.status = "Return Requested";
        item.returnReason = reason;
  
        // Update order status if not already
        if (order.status !== "Return Requested") {
            order.status = "Return Requested";
            order.returnReason = `Return requested for ${item.product.productName}: ${reason}`;
        }
  
        await order.save({ session });
        await session.commitTransaction();
  
        res.json({
            success: true,
            message: "Return request submitted for admin approval",
            returnedItem: item,
        });
    } catch (error) {
        await session.abortTransaction();
        console.error("Error returning item:", error);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to submit return request.",
        });
    } finally {
        session.endSession();
    }
};

// const downloadInvoice = async (req, res) => {
//     try {
//         const orderId = req.params.orderId;
//         const filePath = await generateInvoice(orderId);

//         // Send the file for download
//         res.download(filePath);
//     } catch (error) {
//         console.error("Error generating invoice:", error);
//         res.status(500).render("page-404", { message: "Failed to generate invoice." });
//     }
// };

const downloadInvoice = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        
        // Check if user is authorized to download this invoice
        if (!req.user) {
            return res.redirect('/signin');
        }
        
        // Verify the order belongs to the user
        const order = await Order.findOne({ 
            _id: orderId,
            user: req.user._id
        });
        
        if (!order) {
            return res.status(404).render("page-404", { 
                message: "Order not found or unauthorized." 
            });
        }
        
        const filePath = await generateUserInvoice(orderId);

        // Send the file for download
        res.download(filePath, `SNEAKY-Invoice-${order.transactionId}.pdf`, (err) => {
            if (err) {
                console.error('Error sending invoice:', err);
                if (!res.headersSent) {
                    res.status(500).render("page-404", { 
                        message: "Failed to download invoice." 
                    });
                }
            }
            
            // Optionally delete the file after sending
            // Uncomment if you want to delete the file after download
            /*
            setTimeout(() => {
                fs.unlink(filePath, (unlinkErr) => {
                    if (unlinkErr) console.error('Error deleting invoice file:', unlinkErr);
                });
            }, 1000);
            */
        });
    } catch (error) {
        console.error("Error generating invoice:", error);
        res.status(500).render("page-404", { 
            message: "Failed to generate invoice." 
        });
    }
};


module.exports = {
    loadOrder,
    loadSingleOrder,
    loadOrderSuccess,
    cancelOrder,
    returnOrder,
    downloadInvoice,
    loadOrderFailed,
    returnOrderItem,
    cancelOrderItem
};