const Coupon = require('../../models/couponSchema');
const Order = require('../../models/orderSchema');
const { STATUS, MSG } = require('../../utils/responseConstants');

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
            return res.status(STATUS.BAD_REQUEST).json({
                valid: false,
                message: MSG.COUPON_INVALID
            });
        }

      
        const existingOrder = await Order.findOne({ 
            user: userId, 
            couponCode: coupon.code,
            paymentStatus: 'Completed' 
        });

        if (existingOrder) {
            return res.status(STATUS.BAD_REQUEST).json({
                valid: false,
                message: MSG.COUPON_ALREADY_USED
            });
        }

      
        if (totalAmount < coupon.minPurchase) {
            return res.status(STATUS.BAD_REQUEST).json({
                valid: false,
                message: `${MSG.COUPON_MIN_PURCHASE} Minimum purchase: ₹${coupon.minPurchase}.`
            });
        }

        // Calculate discount amount
        const discountAmount = (totalAmount * coupon.discountPercentage) / 100;

        return res.status(STATUS.OK).json({
            valid: true,
            message: MSG.COUPON_APPLIED,
            discountAmount,
            couponCode: coupon.code
        });
    } catch (error) {
        console.error('Error validating coupon:', error);
        return res.status(STATUS.INTERNAL_ERROR).json({
            valid: false,
            message: MSG.INTERNAL_ERROR
        });
    }
};

module.exports = { validateCoupon };