const Offer = require('../../models/offerSchema');
const Category = require('../../models/categorySchema');
const AppError = require('../../utils/AppError');
const { STATUS, MSG } = require('../../utils/responseConstants');

const validateOffer = (offerData) => {
    const errors = [];

    if (!offerData.category) {
        errors.push('Category is required');
    }

    if (!offerData.discountPercentage || offerData.discountPercentage <= 0 || offerData.discountPercentage > 100) {
        errors.push('Discount must be between 1% and 100%');
    }

    if (!offerData.startDate) {
        errors.push('Start date is required');
    }

    if (!offerData.endDate) {
        errors.push('End date is required');
    } else if (new Date(offerData.endDate) <= new Date(offerData.startDate)) {
        errors.push('End date must be after start date');
    }

    return errors;
};

const loadOfferManagement = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        const searchQuery = {
            ...(search && {
                'category.name': { $regex: search, $options: 'i' }
            })
        };

        const offers = await Offer.find(searchQuery)
            .populate('category')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const totalOffers = await Offer.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalOffers / limit);

        const categories = await Category.find({ isListed: true }, 'name');

        res.render('offerManagement', {
            offers,
            currentPage: page,
            totalPages,
            totalOffers,
            searchQuery: search,
            categories
        });
    } catch (error) {
        console.error('Error in loadOfferManagement:', error);
        next(new AppError(MSG.OFFER_LOAD_FAILED, STATUS.INTERNAL_ERROR));
    }
};

const addOffer = async (req, res) => {
    try {
        const { category, discountPercentage, startDate, endDate } = req.body;

        const categoryExists = await Category.findOne({ _id: category, isListed: true });
        if (!categoryExists) {
            return res.status(STATUS.NOT_FOUND).json({ success: false, error: MSG.CATEGORY_NOT_FOUND });
        }

        const offerData = {
            category,
            discountPercentage: parseFloat(discountPercentage),
            startDate: new Date(startDate),
            endDate: new Date(endDate)
        };

        const errors = validateOffer(offerData);
        if (errors.length > 0) {
            return res.status(STATUS.BAD_REQUEST).json({ success: false, error: errors[0] });
        }

        const existingOffer = await Offer.findOne({ category: offerData.category });
        if (existingOffer) {
            return res.status(STATUS.CONFLICT).json({ success: false, error: MSG.OFFER_EXISTS });
        }

        const newOffer = new Offer(offerData);
        await newOffer.save();

        res.status(STATUS.CREATED).json({ success: true, message: MSG.OFFER_ADDED });
    } catch (error) {
        console.error('Error in addOffer:', error);
        res.status(STATUS.INTERNAL_ERROR).json({ success: false, error: MSG.OFFER_ADD_FAILED });
    }
};

const updateOffer = async (req, res) => {
    try {
        const offerId = req.params.id;
        const { category, discountPercentage, startDate, endDate } = req.body;

        if (!offerId) {
            return res.status(STATUS.BAD_REQUEST).json({ success: false, error: MSG.MISSING_FIELDS });
        }

        if (category) {
            const categoryExists = await Category.findOne({ _id: category, isListed: true });
            if (!categoryExists) {
                return res.status(STATUS.NOT_FOUND).json({ success: false, error: MSG.CATEGORY_NOT_FOUND });
            }
        }

        const offerData = {
            ...(category && { category }),
            discountPercentage: parseFloat(discountPercentage),
            startDate: new Date(startDate),
            endDate: new Date(endDate)
        };

        const errors = validateOffer(offerData);
        if (errors.length > 0) {
            return res.status(STATUS.BAD_REQUEST).json({ success: false, error: errors[0] });
        }

        const existingOffer = await Offer.findById(offerId);
        if (!existingOffer) {
            return res.status(STATUS.NOT_FOUND).json({ success: false, error: MSG.OFFER_NOT_FOUND });
        }

        if (category) {
            const duplicateOffer = await Offer.findOne({
                category: offerData.category,
                _id: { $ne: offerId }
            });
            if (duplicateOffer) {
                return res.status(STATUS.CONFLICT).json({ success: false, error: MSG.OFFER_EXISTS });
            }
        }

        const updatedOffer = await Offer.findByIdAndUpdate(offerId, offerData, { new: true }).populate('category');

        res.status(STATUS.OK).json({
            success: true,
            message: MSG.OFFER_UPDATED,
            offer: updatedOffer
        });
    } catch (error) {
        console.error('Error in updateOffer:', error);
        res.status(STATUS.INTERNAL_ERROR).json({ success: false, error: MSG.OFFER_UPDATE_FAILED });
    }
};

const deleteOffer = async (req, res) => {
    try {
        const offerId = req.params.id;
        const offer = await Offer.findById(offerId);

        if (!offer) {
            return res.status(STATUS.NOT_FOUND).json({ success: false, error: MSG.OFFER_NOT_FOUND });
        }

        await Offer.findByIdAndDelete(offerId);

        res.status(STATUS.OK).json({ success: true, message: MSG.OFFER_DELETED });
    } catch (error) {
        console.error('Error in deleteOffer:', error);
        res.status(STATUS.INTERNAL_ERROR).json({ success: false, error: MSG.OFFER_DELETE_FAILED });
    }
};

const getOfferById = async (req, res) => {
    try {
        const offerId = req.params.id;
        const offer = await Offer.findById(offerId).populate('category');

        if (!offer) {
            return res.status(STATUS.NOT_FOUND).json({ success: false, error: MSG.OFFER_NOT_FOUND });
        }

        res.status(STATUS.OK).json({ success: true, offer });
    } catch (error) {
        console.error('Error in getOfferById:', error);
        res.status(STATUS.INTERNAL_ERROR).json({ success: false, error: MSG.OFFER_LOAD_FAILED });
    }
};

module.exports = {
    loadOfferManagement,
    addOffer,
    updateOffer,
    deleteOffer,
    getOfferById,
    validateOffer
};