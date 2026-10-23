const Category = require("../../models/categorySchema");
const AppError = require("../../utils/AppError");
const { STATUS, MSG } = require("../../utils/responseConstants");

const loadCategoryManagement = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const categoryData = await Category.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCategories = await Category.countDocuments();
        const totalPages = Math.ceil(totalCategories / limit);

        res.render("categoryManagement", {
            categories: categoryData,
            currentPage: page,
            totalPages,
            totalCategories
        });
    } catch (error) {
        console.error(error.message);
        next(new AppError(MSG.CATEGORY_LOAD_FAILED, STATUS.INTERNAL_ERROR));
    }
};

const addCategory = async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name || !description) {
            return res.status(STATUS.BAD_REQUEST).json({ success: false, error: MSG.MISSING_FIELDS });
        }

        const existingCategory = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (existingCategory) {
            return res.status(STATUS.CONFLICT).json({ success: false, error: MSG.CATEGORY_EXISTS });
        }

        const newCategory = new Category({
            name,
            description,
            stock: 0,
            availability: "Available",
            isListed: true
        });

        await newCategory.save();
        res.status(STATUS.CREATED).json({
            success: true,
            message: MSG.CATEGORY_ADDED,
            category: newCategory
        });
    } catch (error) {
        console.error(error);
        res.status(STATUS.INTERNAL_ERROR).json({ success: false, error: MSG.INTERNAL_ERROR });
    }
};

const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, isListed } = req.body;

        if (!name || !description) {
            return res.status(STATUS.BAD_REQUEST).json({ success: false, error: MSG.MISSING_FIELDS });
        }

        const existingCategory = await Category.findOne({
            name: { $regex: new RegExp(`^${name}$`, 'i') },
            _id: { $ne: id }
        });

        if (existingCategory) {
            return res.status(STATUS.CONFLICT).json({ success: false, error: MSG.CATEGORY_EXISTS });
        }

        const updatedCategory = await Category.findByIdAndUpdate(
            id,
            { name, description, isListed: Boolean(isListed) },
            { new: true }
        );

        if (!updatedCategory) {
            return res.status(STATUS.NOT_FOUND).json({ success: false, error: MSG.CATEGORY_NOT_FOUND });
        }

        res.status(STATUS.OK).json({
            success: true,
            message: MSG.CATEGORY_UPDATED,
            category: updatedCategory
        });
    } catch (error) {
        console.error(error);
        res.status(STATUS.INTERNAL_ERROR).json({ success: false, error: MSG.INTERNAL_ERROR });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await Category.findByIdAndDelete(id);

        if (!category) {
            return res.status(STATUS.NOT_FOUND).json({ success: false, error: MSG.CATEGORY_NOT_FOUND });
        }

        res.status(STATUS.OK).json({ success: true, message: MSG.CATEGORY_DELETED });
    } catch (error) {
        console.error(error);
        res.status(STATUS.INTERNAL_ERROR).json({ success: false, error: MSG.INTERNAL_ERROR });
    }
};

const toggleCategoryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await Category.findById(id);

        if (!category) {
            return res.status(STATUS.NOT_FOUND).json({ success: false, error: MSG.CATEGORY_NOT_FOUND });
        }

        category.isListed = !category.isListed;
        await category.save();

        res.status(STATUS.OK).json({
            success: true,
            message: MSG.CATEGORY_UPDATED,
            isListed: category.isListed
        });
    } catch (error) {
        console.error(error);
        res.status(STATUS.INTERNAL_ERROR).json({ success: false, error: MSG.INTERNAL_ERROR });
    }
};

module.exports = {
    loadCategoryManagement,
    addCategory,
    updateCategory,
    deleteCategory,
    toggleCategoryStatus
};