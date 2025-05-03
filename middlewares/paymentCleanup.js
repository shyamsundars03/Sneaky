// In middlewares/paymentCleanup.js

const paymentCleanup = (req, res, next) => {
    // Add a cleanup function to the response object
    res.cleanupCheckoutSession = async () => {
        req.session.checkoutData = null;
        req.session.pendingOrder = null;
        req.session.couponCode = null;
        req.session.discountAmount = null;
        req.session.finalAmount = null;
        
        // Force session save
        await new Promise((resolve, reject) => {
            req.session.save(err => {
                if (err) reject(err);
                else resolve();
            });
        });
    };
    
    next();
};

module.exports = paymentCleanup;