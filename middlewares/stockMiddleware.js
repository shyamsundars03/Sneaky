const Order = require('../models/orderSchema');
const mongoose = require('mongoose');

const checkPendingStockRestorations = async () => {
    // Wait for connection if not ready
    if (mongoose.connection.readyState !== 1) {
        console.log('Waiting for DB connection...');
        await new Promise(resolve => {
            mongoose.connection.on('connected', resolve);
        });
    }

    try {
        const orders = await Order.find({
            $or: [
                { status: 'Cancelled', stockRestored: false },
                { status: 'Returned', stockRestored: false }
            ]
        }).populate('items.product');

        for (const order of orders) {
            try {
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
                    console.log(`Restored stock for cancelled order ${order._id}`);
                }
            } catch (error) {
                console.error(`Error processing order ${order._id}:`, error);
            }
        }
    } catch (error) {
        console.error('Error in stock restoration check:', error);
    }
};

// Self-initializing pattern
(async () => {
    await checkPendingStockRestorations(); // Initial run
    setInterval(checkPendingStockRestorations, 60 * 60 * 1000); // Hourly checks
})();

module.exports = { checkPendingStockRestorations };