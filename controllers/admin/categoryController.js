const Category = require("../../models/categorySchema");

const loadCategoryManagement = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
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
            totalPages: totalPages,
            totalCategories: totalCategories
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

const addCategory = async (req, res) => {
    try {
        const { name, description } = req.body;
        
        if (!name || !description) {
            return res.status(400).json({ error: "Name and description are required" });
        }

        const existingCategory = await Category.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (existingCategory) {
            return res.status(400).json({ error: "Category already exists" });
        }

        const newCategory = new Category({
            name,
            description,
            stock: 0,
            availability: "Available",
            isListed: true
        });

        await newCategory.save();
        res.status(201).json({ 
            message: "Category added successfully",
            category: newCategory 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
};

const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, isListed } = req.body;

        if (!name || !description) {
            return res.status(400).json({ error: "Name and description are required" });
        }

        const existingCategory = await Category.findOne({
            name: { $regex: new RegExp(`^${name}$`, 'i') },
            _id: { $ne: id }
        });

        if (existingCategory) {
            return res.status(400).json({ error: "Category name already exists" });
        }

        const updatedCategory = await Category.findByIdAndUpdate(
            id,
            {
                name,
                description,
                isListed: Boolean(isListed)
            },
            { new: true }
        );

        if (!updatedCategory) {
            return res.status(404).json({ error: "Category not found" });
        }

        res.json({ 
            message: "Category updated successfully",
            category: updatedCategory 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await Category.findByIdAndDelete(id);

        if (!category) {
            return res.status(404).json({ error: "Category not found" });
        }

        res.json({ message: "Category deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
};

const toggleCategoryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await Category.findById(id);

        if (!category) {
            return res.status(404).json({ error: "Category not found" });
        }

        category.isListed = !category.isListed;
        await category.save();

        res.json({ 
            message: "Category status updated successfully",
            isListed: category.isListed 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
};

module.exports = {
    loadCategoryManagement,
    addCategory,
    updateCategory,
    deleteCategory,
    toggleCategoryStatus
};