const Coupon = require('../../models/couponSchema');
const Order = require('../../models/orderSchema');

const validateCoupon = async (req, res) => {
    try {
        const { couponCode, totalAmount, userId } = req.body;
        const currentDate = new Date();

        // Find the coupon
        const coupon = await Coupon.findOne({ 
            code: couponCode.toUpperCase(),
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate }
        }).lean();

 console.log(coupon)



        if (!coupon) {
            return res.json({ 
                valid: false, 
                message: 'Invalid or expired coupon code' 
            });
        }

      
        const existingOrder = await Order.findOne({ 
            user: userId, 
            couponCode: coupon.code,
            paymentStatus: 'Completed' 
        });

        if (existingOrder) {
            return res.json({
                valid: false,
                message: 'You have already used this coupon'
            });
        }

      
        if (totalAmount < coupon.minPurchase) {
            return res.json({
                valid: false,
                message: `Minimum purchase of ₹${coupon.minPurchase} required for this coupon`
            });
        }

        // Calculate discount amount
        const discountAmount = (totalAmount * coupon.discountPercentage) / 100;

        return res.json({
            valid: true,
            message: 'Coupon applied successfully',
            discountAmount: discountAmount,
            couponCode: coupon.code
        });

    } catch (error) {
        console.error('Error validating coupon:', error);
        return res.status(500).json({
            valid: false,
            message: 'Error validating coupon'
        });
    }
};

module.exports = { validateCoupon };