const mongoose = require("mongoose");
const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const { generateInvoice } = require('../../services/invoiceService');

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

        const items = order.items.map(item => {
            const itemTotal = item.price * item.quantity;
            
            if (item.status === 'Cancelled') {
                cancelledAmount += itemTotal;
            } else if (item.status === 'Returned') {
                returnedAmount += itemTotal;
            } else {
                subTotal += itemTotal;
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
        const grandTotal = (
            subTotal + 
            shippingCost - 
            discountAmount
        ).toFixed(2);
        
        res.render("singleOrder", { 
            order: {
                ...order.toObject(),
                items,
                subtotal: (order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)), // Original subtotal
                cancelledAmount: cancelledAmount.toFixed(2),
                returnedAmount: returnedAmount.toFixed(2),
                shippingCost: shippingCost.toFixed(2),
                discountAmount: discountAmount.toFixed(2),
                grandTotal: grandTotal,
                hasDiscount: discountAmount > 0
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
        
        res.render('orderFailed', {
            orderId: order._id,
            transactionId: order.transactionId
        });
    } catch (error) {
        res.redirect('/orders');
    }
};

// Cancel Order
const cancelOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { orderId, reason } = req.body;
        
        if (!reason || reason.trim().length < 5) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: "Please provide a valid reason for cancellation (minimum 5 characters)." 
            });
        }
        
        // Verify order belongs to user
        const order = await Order.findOne({ 
            _id: orderId, 
            user: req.user._id 
        })
        .populate({
            path: 'items.product',
            select: '_id sizes'
        })
        .session(session);

        if (!order) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false, 
                message: "Order not found or unauthorized." 
            });
        }

        // Validate order can be cancelled
        const cancellableStatuses = ['Ordered', 'Processing', 'Shipped'];
        if (!cancellableStatuses.includes(order.status)) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: "Order can only be cancelled before delivery." 
            });
        }

        // Prevent duplicate refunds
        if (order.refundProcessed) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: "Refund already processed for this order." 
            });
        }

        // Restore product stock
        const bulkOps = order.items.map(item => ({
            updateOne: {
                filter: { 
                    _id: item.product._id,
                    "sizes.size": item.size
                },
                update: { 
                    $inc: { "sizes.$.stock": item.quantity }
                }
            }
        }));
        await Product.bulkWrite(bulkOps, { session });

        // Process refund to wallet (for ALL payment methods)
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
                        orderId: order._id
                    }
                }
            },
            { new: true, session }
        );
        
        if (!userUpdate) {
            throw new Error("Failed to update wallet");
        }

        // Update order status
        order.status = 'Cancelled';
        order.cancellationReason = reason;
        order.cancelledDate = new Date();
        order.refundProcessed = true;
        order.paymentStatus = 'Refunded';
        
        // Update all items status
        order.items.forEach(item => {
            item.status = 'Cancelled';
            item.cancelled = true;
            item.cancellationReason = reason;
        });

        await order.save({ session });
        await session.commitTransaction();

        return res.status(200).json({ 
            success: true, 
            message: `Order cancelled successfully. ₹${order.totalAmount} refunded to wallet.`
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Error cancelling order:", error);
        return res.status(500).json({ 
            success: false, 
            message: error.message || "Failed to cancel order." 
        });
    } finally {
        session.endSession();
    }
};

// Return Order
const returnOrder = async (req, res) => {
    const session = await mongoose.startSession()
    session.startTransaction()
  
    try {
      const { orderId, reason } = req.body
  
      if (!reason || reason.trim().length < 10) {
        await session.abortTransaction()
        return res.status(400).json({
          success: false,
          message: "Please provide a detailed reason for return (minimum 10 characters).",
        })
      }
  
      const order = await Order.findOne({
        _id: orderId,
        user: req.user._id,
        status: "Delivered", // Only delivered orders can be returned
      })
        .populate("items.product")
        .session(session)
  
      if (!order) {
        await session.abortTransaction()
        return res.status(404).json({
          success: false,
          message: "Order not found or not eligible for return.",
        })
      }
  
      // Update order status
      order.status = "Return Requested"
      order.returnReason = reason.trim()
  
      // Update all items status
      order.items.forEach((item) => {
        if (item.status === "Delivered") {
          // Only update delivered items
          item.status = "Return Requested"
          item.returnReason = reason.trim()
        }
      })
  
      await order.save({ session })
      await session.commitTransaction()
  
      res.status(200).json({
        success: true,
        message: "Return request submitted for admin verification.",
      })
    } catch (error) {
      await session.abortTransaction()
      console.error("Error returning order:", error)
      res.status(500).json({
        success: false,
        message: error.message || "Failed to submit return request.",
      })
    } finally {
      session.endSession()
    }
  }

// Cancel single item
const cancelOrderItem = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { orderId, itemId, reason } = req.body;
        
        if (!reason || reason.trim().length < 5) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: "Please provide a valid reason for cancellation (minimum 5 characters)." 
            });
        }
        
        if (!req.user || !req.user._id) {
            await session.abortTransaction();
            return res.status(401).json({ 
                success: false, 
                message: "User not authenticated." 
            });
        }

        const order = await Order.findOne({ 
            _id: orderId, 
            user: req.user._id 
        })
        .populate({
            path: 'items.product',
            select: '_id sizes productName price'
        })
        .session(session);

        if (!order) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false, 
                message: "Order not found." 
            });
        }

        const item = order.items.id(itemId);
        if (!item) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false, 
                message: "Item not found in order." 
            });
        }

        // Prevent duplicate cancellations/refunds
        if (item.status === 'Cancelled' || item.status === 'Returned') {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: `Item already ${item.status.toLowerCase()}.` 
            });
        }

        // Validate item can be cancelled
        const cancellableStatuses = ['Ordered', 'Processing', 'Shipped'];
        if (!cancellableStatuses.includes(item.status)) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: "Item can only be cancelled before delivery." 
            });
        }

        // Restore stock
        await Product.updateOne(
            { 
                _id: item.product._id,
                "sizes.size": item.size
            },
            { $inc: { "sizes.$.stock": item.quantity } },
            { session }
        );

        // Calculate refund amount
        const refundAmount = item.price * item.quantity;

        // Process refund to wallet
        const userUpdate = await User.findByIdAndUpdate(
            req.user._id,
            {
                $inc: { "wallet.balance": refundAmount },
                $push: {
                    "wallet.transactions": {
                        type: "refund",
                        amount: refundAmount,
                        description: `Refund for ${item.product.productName} from ${order.paymentMethod} order #${order.transactionId}`,
                        date: new Date(),
                        orderId: order._id
                    }
                }
            },
            { new: true, session }
        );
        
        if (!userUpdate) {
            throw new Error("Failed to update wallet");
        }

        // Update item status
        item.status = 'Cancelled';
        item.cancelled = true;
        item.cancellationReason = reason;
        item.cancelledDate = new Date();
        item.refundProcessed = true;
        
        // Check if all items are cancelled
        const allItemsCancelled = order.items.every(i => i.status === 'Cancelled');
        if (allItemsCancelled) {
            order.status = 'Cancelled';
            order.cancellationReason = 'All items cancelled';
            order.cancelledDate = new Date();
        }
        
        await order.save({ session });
        await session.commitTransaction();

        res.json({ 
            success: true, 
            message: `Item cancelled successfully.`,
            refundAmount: refundAmount
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Error cancelling item:", error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to cancel item.' 
        });
    } finally {
        session.endSession();
    }
};

// Return single item
const returnOrderItem = async (req, res) => {
    const session = await mongoose.startSession()
    session.startTransaction()
  
    try {
      const { orderId, itemIndex, reason } = req.body
  
      if (!reason || reason.trim().length < 10) {
        await session.abortTransaction()
        return res.status(400).json({
          success: false,
          message: "Please provide a detailed reason for return (minimum 10 characters).",
        })
      }
  
      const order = await Order.findOne({
        _id: orderId,
        user: req.user._id,
      })
        .populate({
          path: "items.product",
          select: "_id sizes productName",
        })
        .session(session)
  
      if (!order || itemIndex >= order.items.length) {
        await session.abortTransaction()
        return res.status(404).json({
          success: false,
          message: "Order or item not found.",
        })
      }
  
      // Validate order is delivered
      if (order.status !== "Delivered") {
        await session.abortTransaction()
        return res.status(400).json({
          success: false,
          message: "Only delivered orders can be returned.",
        })
      }
  
      const item = order.items[itemIndex]
  
      // Validate item can be returned
      if (item.status !== "Delivered") {
        await session.abortTransaction()
        return res.status(400).json({
          success: false,
          message: `Item is ${item.status.toLowerCase()}, cannot be returned.`,
        })
      }
  
      // Update item status
      item.status = "Return Requested"
      item.returnReason = reason
  
      // Update order status if not already
      if (order.status !== "Return Requested") {
        order.status = "Return Requested"
        order.returnReason = `Return requested for ${item.product.productName}: ${reason}`
      }
  
      await order.save({ session })
      await session.commitTransaction()
  
      res.json({
        success: true,
        message: "Return request submitted for admin approval",
        returnedItem: item,
      })
    } catch (error) {
      await session.abortTransaction()
      console.error("Error returning item:", error)
      res.status(500).json({
        success: false,
        message: error.message || "Failed to submit return request.",
      })
    } finally {
      session.endSession()
    }
  }

const downloadInvoice = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const filePath = await generateInvoice(orderId);

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
    downloadInvoice,
    loadOrderFailed,
    returnOrderItem,
    cancelOrderItem
};