const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const mongoose = require('mongoose');

// Load Order Management Page
const loadOrderManagement = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;

        const orders = await Order.find({})
            .populate('user', 'name email')
            .populate('items.product', 'productName price')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

            const processedOrders = orders.map(order => {
                const orderObj = order.toObject();
                
                // Calculate active amounts (excluding cancelled and returned items)
                let activeAmount = 0;
                
                order.items.forEach(item => {
                    if (item.status !== 'Cancelled' && item.status !== 'Returned') {
                        activeAmount += (item.price * item.quantity);
                    }
                });
                
                // Add shipping cost and subtract discount
                const finalAmount = activeAmount + (order.shippingCost || 0) - (order.discountAmount || 0);
                
                return {
                    ...orderObj,
                    activeAmount: finalAmount
                };
            });




            const validOrders = processedOrders.filter(order => order.user !== null);
            const totalOrders = await Order.countDocuments({});
            const totalPages = Math.ceil(totalOrders / limit);
            
        res.render("orderManagement", {
            orders: validOrders,
            currentPage: page,
            totalPages,
            totalOrders,
        });
    } catch (error) {
        console.error("Error loading order management page:", error);
        res.status(500).render("page-404"); 
    }
};

const loadSingleAdminOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email phone')
            .populate({
                path: 'items.product',
                select: 'productName productImage price sizes'
            });

        if (!order) {
            return res.status(404).render("page-404", { message: "Order not found." });
        }

        // Transform order data
        const orderObj = order.toObject();
        
        // Calculate totals correctly
        // Subtotal should include ALL items regardless of status
        const subTotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        // Calculate cancelled and returned amounts separately
        const cancelledAmount = order.items
            .filter(item => item.status === 'Cancelled')
            .reduce((sum, item) => sum + (item.price * item.quantity), 0);
            
        const returnedAmount = order.items
            .filter(item => item.status === 'Returned')
            .reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        // Fix image paths
        orderObj.items = orderObj.items.map(item => {
            // Fix image path
            if (item.product?.productImage?.[0]) {
                item.product.productImage[0] = item.product.productImage[0]
                    .replace(/\\/g, '/')
                    .replace('public/', '/');
            }
            
            return item;
        });

        // Calculate grand total correctly
        const shippingCost = order.shippingCost || 0;
        const discountAmount = order.discountAmount || 0;
        
        // Grand total = subtotal - cancelled - returned + shipping - discount
        const grandTotal = subTotal - cancelledAmount - returnedAmount + shippingCost - discountAmount;

        res.render("singleAdminOrder", { 
            order: {
                ...orderObj,
                subTotal: subTotal.toFixed(2),
                cancelledAmount: cancelledAmount.toFixed(2),
                returnedAmount: returnedAmount.toFixed(2),
                shippingCost: shippingCost.toFixed(2),
                discountAmount: discountAmount.toFixed(2),
                totalAmount: grandTotal.toFixed(2)
            }
        });
    } catch (error) {
        console.error("Error loading admin order:", error);
        res.status(500).render("page-404", { message: "Failed to load order details." });
    }
};


// Update Order Status
const updateOrderStatus = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { orderId, status } = req.body;
        
        const order = await Order.findById(orderId)
            .populate('items.product')
            .session(session);

        if (!order) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found.' 
            });
        }

        // Validate status transition
        const validTransitions = {
            'Ordered': ['Processing', 'Shipped', 'Delivered', 'Cancelled'],
            'Processing': ['Shipped', 'Delivered', 'Cancelled'],
            'Shipped': ['Delivered', 'Cancelled'],
            'Delivered': ['Return Requested'],
            'Return Requested': ['Returned']
        };

        if (!validTransitions[order.status] || 
            !validTransitions[order.status].includes(status)) {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: `Invalid status transition from ${order.status} to ${status}.` 
            });
        }

        // Update status and dates
        order.status = status;
        const now = new Date();
        
        if (status === 'Shipped') order.shippedDate = now;
        if (status === 'Delivered') order.deliveredDate = now;
        if (status === 'Cancelled') order.cancelledDate = now;
        if (status === 'Returned') order.returnedDate = now;

        // Update item statuses
        order.items.forEach(item => {
            if (item.status !== 'Cancelled' && item.status !== 'Returned' && 
                item.status !== 'Return Requested') {
                item.status = status;
            }
        });

        await order.save({ session });
        await session.commitTransaction();
        
        res.status(200).json({ 
            success: true, 
            message: `Order status updated to ${status}.`
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Error updating order status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update order status.' 
        });
    } finally {
        session.endSession();
    }
};

// Update Individual Item Status
const updateItemStatus = async (req, res) => {
    const session = await mongoose.startSession()
    session.startTransaction()
  
    try {
      const { orderId, itemId, status } = req.body
  
      const order = await Order.findById(orderId).session(session)
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
  
      // Validate status transition
      const validTransitions = {
        Pending: ["Processing", "Shipped", "Delivered", "Cancelled"],
        Ordered: ["Processing", "Shipped", "Delivered", "Cancelled"],
        Processing: ["Shipped", "Delivered", "Cancelled"],
        Shipped: ["Delivered", "Cancelled"],
        Delivered: ["Return Requested"],
        "Return Requested": ["Returned"],
      }
  
      if (!validTransitions[item.status] || !validTransitions[item.status].includes(status)) {
        await session.abortTransaction()
        return res.status(400).json({
          success: false,
          message: `Invalid status transition from ${item.status} to ${status}.`,
        })
      }
  
      // Update item status
      item.status = status
      const now = new Date()
  
      if (status === "Shipped") item.shippedDate = now
      if (status === "Delivered") item.deliveredDate = now
      if (status === "Cancelled") {
        item.cancelledDate = now
        item.cancelled = true
  
        // Restore stock for cancelled item
        await Product.updateOne(
          {
            _id: item.product,
            "sizes.size": item.size,
          },
          { $inc: { "sizes.$.stock": item.quantity } },
          { session },
        )
      }
      if (status === "Returned") {
        item.returnedDate = now
        item.returned = true
      }
  
      // Check if all items have the same status to update the overall order status
      const allItemsHaveSameStatus = order.items.every((i) => i.status === status)
      if (allItemsHaveSameStatus) {
        order.status = status
      }
  
      await order.save({ session })
      await session.commitTransaction()
  
      res.status(200).json({
        success: true,
        message: `Item status updated to ${status}.`,
      })
    } catch (error) {
      await session.abortTransaction()
      console.error("Error updating item status:", error)
      res.status(500).json({
        success: false,
        message: "Failed to update item status.",
      })
    } finally {
      session.endSession()
    }
  }

// Cancel Order
const cancelOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { orderId, reason } = req.body;
        
        const order = await Order.findOne({ _id: orderId })
            .populate('user')
            .populate({
                path: 'items.product',
                select: '_id sizes'
            })
            .session(session);

        if (!order) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false, 
                message: "Order not found." 
            });
        }

        // Restore product stock (size-specific)
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

        // Process refund if payment was completed
        if (!order.refundProcessed && (order.paymentStatus === 'Completed' || order.paymentStatus === 'Paid')) {
            const user = await User.findById(order.user._id).session(session);
            if (user) {
                user.wallet.balance += order.totalAmount;
                user.wallet.transactions.push({
                    type: 'refund',
                    amount: order.totalAmount,
                    description: `Refund for cancelled order #${order.transactionId}`,
                    date: new Date(),
                    orderId: order._id
                });
                await user.save({ session });
                order.refundProcessed = true;
                order.paymentStatus = 'Refunded';
            }
        }

        // Update order status and all items
        order.status = 'Cancelled';
        order.cancellationReason = reason || 'Admin cancelled';
        order.cancelledDate = new Date();
        
        // Mark all items as cancelled
        order.items.forEach(item => {
            item.status = 'Cancelled';
            item.cancelled = true;
            item.cancellationReason = reason || 'Admin cancelled order';
        });

        await order.save({ session });
        await session.commitTransaction();

        res.status(200).json({ 
            success: true, 
            message: "Order cancelled successfully." + 
                    (order.refundProcessed ? " Amount refunded to customer's wallet." : "")
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Error cancelling order:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to cancel order." 
        });
    } finally {
        session.endSession();
    }
};

// Cancel Individual Item
const cancelOrderItem = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { orderId, itemId, reason } = req.body;
        
        const order = await Order.findById(orderId)
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

        // Prevent cancelling already cancelled or returned items
        if (item.status === 'Cancelled' || item.status === 'Returned') {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: `Item is already ${item.status.toLowerCase()}.` 
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
        const user = await User.findById(order.user._id).session(session);
        if (user) {
            user.wallet.balance += refundAmount;
            user.wallet.transactions.push({
                type: 'refund',
                amount: refundAmount,
                description: `Refund for cancelled item ${item.product.productName} from order #${order.transactionId}`,
                date: new Date(),
                orderId: order._id
            });
            await user.save({ session });
        }

        // Update item status
        item.status = 'Cancelled';
        item.cancelled = true;
        item.cancellationReason = reason;
        item.cancelledDate = new Date();
        item.refundProcessed = true;

        // Check if all items are cancelled to update the overall order status
        const allItemsCancelled = order.items.every(i => i.status === 'Cancelled');
        if (allItemsCancelled) {
            order.status = 'Cancelled';
            order.cancellationReason = 'All items cancelled';
            order.cancelledDate = new Date();
        }

        await order.save({ session });
        await session.commitTransaction();

        res.status(200).json({ 
            success: true, 
            message: `Item cancelled successfully. ₹${refundAmount} refunded to customer's wallet.`
        });

    } catch (error) {
        await session.abortTransaction();
        console.error("Error cancelling item:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to cancel item." 
        });
    } finally {
        session.endSession();
    }
};

// Verify Return
const verifyReturn = async (req, res) => {
    const session = await mongoose.startSession()
    session.startTransaction()
  
    try {
      const { orderId } = req.body
  
      const order = await Order.findById(orderId).populate("user").populate("items.product").session(session)
  
      if (!order || order.status !== "Return Requested") {
        await session.abortTransaction()
        return res.status(400).json({
          success: false,
          message: "Order not found or not in Return Requested status.",
        })
      }
  
      // Process refund to wallet
      if (!order.refundProcessed) {
        const user = await User.findById(order.user._id).session(session)
        if (user) {
          // Calculate refund amount based on returned items only
          const refundAmount = order.items.reduce((total, item) => {
            if (item.status === "Return Requested") {
              return total + item.price * item.quantity
            }
            return total
          }, 0)
  
          user.wallet.balance += refundAmount
          user.wallet.transactions.push({
            type: "refund",
            amount: refundAmount,
            description: `Refund for returned items in order #${order.transactionId}`,
            date: new Date(),
            orderId: order._id,
          })
          await user.save({ session })
          order.refundProcessed = true
          order.paymentStatus = "Refunded"
        }
      }
  
      // Restore product stock for returned items
      const bulkOps = order.items
        .map((item) => {
          if (item.status === "Return Requested") {
            return {
              updateOne: {
                filter: {
                  _id: item.product._id,
                  "sizes.size": item.size,
                },
                update: {
                  $inc: { "sizes.$.stock": item.quantity },
                },
              },
            }
          }
          return null
        })
        .filter((op) => op !== null)
  
      if (bulkOps.length > 0) {
        await Product.bulkWrite(bulkOps, { session })
      }
  
      // Update order status
      order.status = "Returned"
      order.returnedDate = new Date()
      order.returnVerified = true
  
      // Update items status
      order.items.forEach((item) => {
        if (item.status === "Return Requested") {
          item.status = "Returned"
          item.returnedDate = new Date()
        }
      })
  
      await order.save({ session })
      await session.commitTransaction()
  
      res.status(200).json({
        success: true,
        message: "Return verified. Refund processed and stock updated.",
      })
    } catch (error) {
      await session.abortTransaction()
      console.error("Error verifying return:", error)
      res.status(500).json({
        success: false,
        message: "Failed to verify return.",
      })
    } finally {
      session.endSession()
    }
  }


// Verify Individual Item Return
const verifyItemReturn = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { orderId, itemId } = req.body;
        
        const order = await Order.findById(orderId)
            .populate('user')
            .populate({
                path: 'items.product',
                select: '_id sizes productName price'
            })
            .session(session);

        if (!order) {
            await session.abortTransaction();
            return res.status(404).json({ 
                success: false, 
                message: 'Order not found.' 
            });
        }

        const item = order.items.id(itemId);
        if (!item || item.status !== 'Return Requested') {
            await session.abortTransaction();
            return res.status(400).json({ 
                success: false, 
                message: 'Item not found or not requested for return.' 
            });
        }

        // Calculate refund amount
        const refundAmount = item.price * item.quantity;

        // Process refund to wallet
        const user = await User.findById(order.user._id).session(session);
        if (user) {
            user.wallet.balance += refundAmount;
            user.wallet.transactions.push({
                type: 'refund',
                amount: refundAmount,
                description: `Refund for returned item ${item.product.productName} from order #${order.transactionId}`,
                date: new Date(),
                orderId: order._id
            });
            await user.save({ session });
        }

        // Restore product stock
        await Product.updateOne(
            { 
                _id: item.product._id,
                "sizes.size": item.size
            },
            { $inc: { "sizes.$.stock": item.quantity } },
            { session }
        );

        // Update item status
        item.status = 'Returned';
        item.returned = true;
        item.returnedDate = new Date();
        item.returnVerified = true;

        // Check if all items are now either Returned or Cancelled
        const allItemsReturnedOrCancelled = order.items.every(i => 
            i.status === 'Returned' || i.status === 'Cancelled'
        );
        
        // Only update order status if ALL items are returned or cancelled
        if (allItemsReturnedOrCancelled) {
            // If all items are returned (none are cancelled), set status to Returned
            const allItemsReturned = order.items.every(i => i.status === 'Returned');
            if (allItemsReturned) {
                order.status = 'Returned';
                order.returnedDate = new Date();
                order.returnVerified = true;
            } 
            // If some items are cancelled and some returned, keep as Return Requested
            // This is a mixed state that might need special handling in your UI
        }

        await order.save({ session });
        await session.commitTransaction();

        res.status(200).json({ 
            success: true, 
            message: `Item return verified. ₹${refundAmount} refunded to customer's wallet.`
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Error verifying item return:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to verify item return.' 
        });
    } finally {
        session.endSession();
    }
};

module.exports = {
    loadOrderManagement,
    loadSingleAdminOrder,
    updateOrderStatus,
    updateItemStatus,
    cancelOrder,
    cancelOrderItem,
    verifyReturn,
    verifyItemReturn
};