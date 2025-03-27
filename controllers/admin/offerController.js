const Offer = require('../../models/offerSchema');
const Category = require('../../models/categorySchema');

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

const loadOfferManagement = async (req, res) => {
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

        // Get all categories for dropdown
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
        res.render('offerManagement', {
            error: 'Failed to load offer data',
            offers: [],
            currentPage: 1,
            totalPages: 0,
            totalOffers: 0,
            categories: []
        });
    }
};

const addOffer = async (req, res) => {
    try {
        const { category, discountPercentage, startDate, endDate } = req.body;



        const categoryExists = await Category.findOne({ _id: category, isListed: true });
        if (!categoryExists) {
            return res.status(400).json({ success: false, error: 'Category not found or unlisted' });
        }

        const offerData = {
            category,
            discountPercentage: parseFloat(discountPercentage),
            startDate: new Date(startDate),
            endDate: new Date(endDate)
        };

        const errors = validateOffer(offerData);
        if (errors.length > 0) {
            return res.status(400).json({ success: false, error: errors[0] });
        }

        // Check if offer already exists for this category
        const existingOffer = await Offer.findOne({ category: offerData.category });
        if (existingOffer) {
            return res.status(400).json({ success: false, error: 'Offer already exists for this category' });
        }

        const newOffer = new Offer(offerData);
        await newOffer.save();

        res.json({ success: true, message: 'Offer added successfully' });
    } catch (error) {
        console.error('Error in addOffer:', error);
        res.status(500).json({ success: false, error: 'Failed to add offer' });
    }
};

const updateOffer = async (req, res) => {
    try {
        const offerId = req.params.id;

        if (category) {
            const categoryExists = await Category.findOne({ _id: category, isListed: true });
            if (!categoryExists) {
                return res.status(400).json({ success: false, error: 'Category not found or unlisted' });
            }
        }

        if (!offerId) {
            return res.status(400).json({
                success: false,
                error: 'Offer ID is required'
            });
        }

        const { category, discountPercentage, startDate, endDate } = req.body;

        const offerData = {
            category,
            discountPercentage: parseFloat(discountPercentage),
            startDate: new Date(startDate),
            endDate: new Date(endDate)
        };

        const errors = validateOffer(offerData);
        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: errors[0]
            });
        }

        const existingOffer = await Offer.findById(offerId);
        if (!existingOffer) {
            return res.status(404).json({
                success: false,
                error: 'Offer not found'
            });
        }

        // Check if offer already exists for this category (excluding current offer)
        const duplicateOffer = await Offer.findOne({ 
            category: offerData.category,
            _id: { $ne: offerId }
        });
        if (duplicateOffer) {
            return res.status(400).json({
                success: false,
                error: 'Offer already exists for this category'
            });
        }

        const updatedOffer = await Offer.findByIdAndUpdate(
            offerId,
            offerData,
            { new: true }
        ).populate('category');

        res.json({
            success: true,
            message: 'Offer updated successfully',
            offer: updatedOffer
        });
    } catch (error) {
        console.error('Error in updateOffer:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update offer'
        });
    }
};

const deleteOffer = async (req, res) => {
    try {
        const offerId = req.params.id;
        const offer = await Offer.findById(offerId);

        if (!offer) {
            return res.status(404).json({
                success: false,
                error: 'Offer not found'
            });
        }

        await Offer.findByIdAndDelete(offerId);

        res.json({
            success: true,
            message: 'Offer deleted successfully'
        });
    } catch (error) {
        console.error('Error in deleteOffer:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete offer'
        });
    }
};

const getOfferById = async (req, res) => {
    try {
        const offerId = req.params.id;
        const offer = await Offer.findById(offerId).populate('category');

        if (!offer) {
            return res.status(404).json({
                success: false,
                error: 'Offer not found'
            });
        }

        res.json({
            success: true,
            offer: offer
        });
    } catch (error) {
        console.error('Error in getOfferById:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load offer data'
        });
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