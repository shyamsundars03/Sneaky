const Coupon = require('../../models/couponSchema');

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

const loadCouponManagement = async (req, res) => {
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

        // Get existing coupon codes for validation
        const existingCouponCodes = (await Coupon.find({}, 'code')).map(c => c.code);

        const currentDate = new Date();
        const enhancedCoupons = coupons.map(coupon => {
            const isActive = new Date(coupon.startDate) <= currentDate && 
                           new Date(coupon.endDate) >= currentDate;
            const isUpcoming = new Date(coupon.startDate) > currentDate;
            
            return {
                ...coupon.toObject(),
                status: isActive ? 'Active' : 
                       isUpcoming ? 'Upcoming' : 'Expired',
                statusClass: isActive ? 'active' : 
                           isUpcoming ? 'upcoming' : 'expired'
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
        res.render('couponManagement', {
            error: 'Failed to load coupon data',
            coupons: [],
            currentPage: 1,
            totalPages: 0,
            totalCoupons: 0
        });
    }
};

const addCoupon = async (req, res) => {
    try {
        const { code, discountPercentage, minPurchase, startDate, endDate, description } = req.body;
        console.log(startDate)
        const couponData = {
            code: code.toUpperCase(),
            discountPercentage: parseFloat(discountPercentage),
            minPurchase: parseFloat(minPurchase),
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            description: description || ''
        };

        // Additional validation for dates - use different variable names here
        const startDateObj = new Date(couponData.startDate);
        const endDateObj = new Date(couponData.endDate);
        const today = new Date();

        startDateObj.setHours(0, 0, 0, 0);
        endDateObj.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        if (startDateObj < today) {
            
            return res.status(400).json({ 
                success: false, 
                error: 'Start date cannot be in the past' 
            });
        }

        if (endDateObj < startDateObj) {
            return res.status(400).json({ 
                success: false, 
                error: 'End date must be after start date' 
            });
        }

        const errors = validateCoupon(couponData);
        if (errors.length > 0) {
            return res.status(400).json({ success: false, error: errors[0] });
        }

        // Check if coupon code already exists
        const existingCoupon = await Coupon.findOne({ code: couponData.code });
        if (existingCoupon) {
            return res.status(400).json({ success: false, error: 'Coupon code already exists' });
        }

        const newCoupon = new Coupon(couponData);
        await newCoupon.save();

        res.json({ success: true, message: 'Coupon added successfully' });
    } catch (error) {
        console.error('Error in addCoupon:', error);
        res.status(500).json({ success: false, error: 'Failed to add coupon' });
    }
};

const updateCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;

        if (!couponId) {
            return res.status(400).json({
                success: false,
                error: 'Coupon ID is required'
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
            return res.status(400).json({
                success: false,
                error: errors[0]
            });
        }

        const existingCoupon = await Coupon.findById(couponId);
        if (!existingCoupon) {
            return res.status(404).json({
                success: false,
                error: 'Coupon not found'
            });
        }

        // Check if coupon code already exists (excluding current coupon)
        const duplicateCoupon = await Coupon.findOne({ 
            code: couponData.code,
            _id: { $ne: couponId }
        });
        if (duplicateCoupon) {
            return res.status(400).json({
                success: false,
                error: 'Coupon code already exists'
            });
        }

        const updatedCoupon = await Coupon.findByIdAndUpdate(
            couponId,
            couponData,
            { new: true }
        );

        res.json({
            success: true,
            message: 'Coupon updated successfully',
            coupon: updatedCoupon
        });
    } catch (error) {
        console.error('Error in updateCoupon:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update coupon'
        });
    }
};

const deleteCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;
        const coupon = await Coupon.findById(couponId);

        if (!coupon) {
            return res.status(404).json({
                success: false,
                error: 'Coupon not found'
            });
        }

        await Coupon.findByIdAndDelete(couponId);

        res.json({
            success: true,
            message: 'Coupon deleted successfully'
        });
    } catch (error) {
        console.error('Error in deleteCoupon:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete coupon'
        });
    }
};

const getCouponById = async (req, res) => {
    try {
        const couponId = req.params.id;
        const coupon = await Coupon.findById(couponId);

        if (!coupon) {
            return res.status(404).json({
                success: false,
                error: 'Coupon not found'
            });
        }

        res.json({
            success: true,
            coupon: coupon
        });
    } catch (error) {
        console.error('Error in getCouponById:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load coupon data'
        });
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