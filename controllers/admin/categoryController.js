const Category = require("../../models/categorySchema");

const loadCategoryManagement = async (req, res) => { // Added async keyword
    try {
        const page = parseInt(req.query.page) || 1; // Fixed req.query (had ,query)
        const limit = 4;
        const skip = (page - 1) * limit;

        const categoryData = await Category.find({})
            .sort({createdAt: -1})
            .skip(skip)
            .limit(limit);

        const totalCategories = await Category.countDocuments();
        const totalPages = Math.ceil(totalCategories / limit);

        res.render("categoryManagement", {
            cat: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalCategories: totalCategories
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


const addCategory = async (req,res) => {
    const {name, description}= req.body;
    try {
        const existingCategory = await Category.findOne({name});
        if(existingCategory){
            return res.status(400).json({error:"category already exists"})
        }
        const newCategory = new Category({
            name,
            description,
        }) 
        await newCategory.save();
        return res.json({message:"category added sucessfully"})
    } catch (error) {
        return res.status(500).json({error:"Internal server error"})
    }
}




module.exports = {
    loadCategoryManagement,
    addCategory
};