const Coupon = require('../../models/couponSchema');
const AppError = require('../../utils/AppError');
const { STATUS, MSG } = require('../../utils/responseConstants');

const validateCoupon = (couponData) => {
    const errors = [];

    if (!couponData.code?.trim()) {
        errors.push('Coupon code is required');
    }

    if (!couponData.discountPercentage || couponData.discountPercentage <= 0 || couponData.discountPercentage > 100) {
        errors.push('Discount must be between 1% and 100%');
    }

    if (!couponData.minPurchase || couponData.minPurchase < 0) {
        errors.push('Minimum purchase must be 0 or more');
    }

    if (!couponData.startDate) {
        errors.push('Start date is required');
    }

    if (!couponData.endDate) {
        errors.push('End date is required');
    } else if (new Date(couponData.endDate) <= new Date(couponData.startDate)) {
        errors.push('End date must be after start date');
    }

    return errors;
};

const loadCouponManagement = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        const searchQuery = {
            ...(search && {
                code: { $regex: search, $options: 'i' }
            })
        };

        const coupons = await Coupon.find(searchQuery)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const totalCoupons = await Coupon.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalCoupons / limit);

        const existingCouponCodes = (await Coupon.find({}, 'code')).map(c => c.code);

        const currentDate = new Date();
        const enhancedCoupons = coupons.map(coupon => {
            const isActive = new Date(coupon.startDate) <= currentDate &&
                           new Date(coupon.endDate) >= currentDate;
            const isUpcoming = new Date(coupon.startDate) > currentDate;

            return {
                ...coupon.toObject(),
                status: isActive ? 'Active' : isUpcoming ? 'Upcoming' : 'Expired',
                statusClass: isActive ? 'active' : isUpcoming ? 'upcoming' : 'expired'
            };
        });

        res.render('couponManagement', {
            coupons: enhancedCoupons,
            currentPage: page,
            totalPages,
            totalCoupons,
            searchQuery: search,
            existingCouponCodes
        });
    } catch (error) {
        console.error('Error in loadCouponManagement:', error);
        next(new AppError(MSG.COUPON_LOAD_FAILED, STATUS.INTERNAL_ERROR));
    }
};

const addCoupon = async (req, res) => {
    try {
        const { code, discountPercentage, minPurchase, startDate, endDate, description } = req.body;

        const couponData = {
            code: code.toUpperCase(),
            discountPercentage: parseFloat(discountPercentage),
            minPurchase: parseFloat(minPurchase),
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            description: description || ''
        };

        const startDateObj = new Date(couponData.startDate);
        const endDateObj = new Date(couponData.endDate);
        const today = new Date();

        startDateObj.setHours(0, 0, 0, 0);
        endDateObj.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        if (startDateObj < today) {
            return res.status(STATUS.BAD_REQUEST).json({
                success: false,
                error: 'Start date cannot be in the past'
            });
        }

        if (endDateObj < startDateObj) {
            return res.status(STATUS.BAD_REQUEST).json({
                success: false,
                error: 'End date must be after start date'
            });
        }

        const errors = validateCoupon(couponData);
        if (errors.length > 0) {
            return res.status(STATUS.BAD_REQUEST).json({ success: false, error: errors[0] });
        }

        const existingCoupon = await Coupon.findOne({ code: couponData.code });
        if (existingCoupon) {
            return res.status(STATUS.CONFLICT).json({ success: false, error: MSG.COUPON_EXISTS });
        }

        const newCoupon = new Coupon(couponData);
        await newCoupon.save();

        res.status(STATUS.CREATED).json({ success: true, message: MSG.COUPON_ADDED });
    } catch (error) {
        console.error('Error in addCoupon:', error);
        res.status(STATUS.INTERNAL_ERROR).json({ success: false, error: MSG.COUPON_ADD_FAILED });
    }
};

const updateCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;

        if (!couponId) {
            return res.status(STATUS.BAD_REQUEST).json({
                success: false,
                error: MSG.MISSING_FIELDS
            });
        }

        const { code, discountPercentage, minPurchase, startDate, endDate, description } = req.body;

        const couponData = {
            code: code.toUpperCase(),
            discountPercentage: parseFloat(discountPercentage),
            minPurchase: parseFloat(minPurchase),
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            description: description || ''
        };

        const errors = validateCoupon(couponData);
        if (errors.length > 0) {
            return res.status(STATUS.BAD_REQUEST).json({ success: false, error: errors[0] });
        }

        const existingCoupon = await Coupon.findById(couponId);
        if (!existingCoupon) {
            return res.status(STATUS.NOT_FOUND).json({ success: false, error: MSG.COUPON_NOT_FOUND });
        }

        const duplicateCoupon = await Coupon.findOne({
            code: couponData.code,
            _id: { $ne: couponId }
        });
        if (duplicateCoupon) {
            return res.status(STATUS.CONFLICT).json({ success: false, error: MSG.COUPON_EXISTS });
        }

        const updatedCoupon = await Coupon.findByIdAndUpdate(couponId, couponData, { new: true });

        res.status(STATUS.OK).json({
            success: true,
            message: MSG.COUPON_UPDATED,
            coupon: updatedCoupon
        });
    } catch (error) {
        console.error('Error in updateCoupon:', error);
        res.status(STATUS.INTERNAL_ERROR).json({ success: false, error: MSG.COUPON_UPDATE_FAILED });
    }
};

const deleteCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;
        const coupon = await Coupon.findById(couponId);

        if (!coupon) {
            return res.status(STATUS.NOT_FOUND).json({ success: false, error: MSG.COUPON_NOT_FOUND });
        }

        await Coupon.findByIdAndDelete(couponId);

        res.status(STATUS.OK).json({ success: true, message: MSG.COUPON_DELETED });
    } catch (error) {
        console.error('Error in deleteCoupon:', error);
        res.status(STATUS.INTERNAL_ERROR).json({ success: false, error: MSG.COUPON_DELETE_FAILED });
    }
};

const getCouponById = async (req, res) => {
    try {
        const couponId = req.params.id;
        const coupon = await Coupon.findById(couponId);

        if (!coupon) {
            return res.status(STATUS.NOT_FOUND).json({ success: false, error: MSG.COUPON_NOT_FOUND });
        }

        res.status(STATUS.OK).json({ success: true, coupon });
    } catch (error) {
        console.error('Error in getCouponById:', error);
        res.status(STATUS.INTERNAL_ERROR).json({ success: false, error: MSG.COUPON_LOAD_FAILED });
    }
};

module.exports = {
    loadCouponManagement,
    addCoupon,
    updateCoupon,
    deleteCoupon,
    getCouponById,
    validateCoupon
};