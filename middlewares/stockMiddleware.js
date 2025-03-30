const Order = require('../models/orderSchema');
const mongoose = require('mongoose');

const checkPendingStockRestorations = async () => {
    try {
        const orders = await Order.find({
            $or: [
                { status: 'Cancelled', stockRestored: false },
                { status: 'Returned', stockRestored: false }
            ]
        }).populate('items.product');

        for (const order of orders) {
            try {
                // For cancelled orders, restore immediately if not done
                if (order.status === 'Cancelled' && !order.stockRestored) {
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
                    await mongoose.model('Product').bulkWrite(bulkOps);
                    order.stockRestored = true;
                    await order.save();
                }
                
                // For returned orders, rely on the timeout in verifyReturn
            } catch (error) {
                console.error(`Error processing order ${order._id}:`, error);
            }
        }
    } catch (error) {
        console.error('Error in stock restoration check:', error);
    }
};

// Run every hour
setInterval(checkPendingStockRestorations, 60 * 60 * 1000);

// Initial run when server starts
checkPendingStockRestorations();

module.exports = { checkPendingStockRestorations };