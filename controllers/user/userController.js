const Product = require('../../models/productSchema'); // Import the Product model

const loadSignup = async (req, res) => {
    try {
        return res.render("signup");
    } catch (error) {
        console.log("Signup page not found");
        res.status(500).send("Server error");
    }
};

const loadSignin = async (req, res) => {
    try {
        return res.render("signin");
    } catch (error) {
        console.log("Signin page not found");
        res.status(500).send("Server error");
    }
};

const loadAbout = async (req, res) => {
    try {
        return res.render("about");
    } catch (error) {
        console.log("About page not found");
        res.status(500).send("Server error");
    }
};

const loadShop = async (req, res) => {
    try {
        console.log("Rendering shop page..."); // Debugging log
        const page = parseInt(req.query.page) || 1;
        const limit = 6;
        const skip = (page - 1) * limit;

        const products = await Product.find({ isDeleted: false, isListed: true })
            .populate('category')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const totalProducts = await Product.countDocuments({ isDeleted: false, isListed: true });
        const totalPages = Math.ceil(totalProducts / limit);

        const fixedProducts = products.map(product => {
            const fixedImages = product.productImage.map(img =>
                img.replace(/\\/g, '/').replace(/^public\//, '/')
            );
            return {
                ...product.toObject(),
                productImage: fixedImages
            };
        });

        res.render("shop", {
            products: fixedProducts,
            currentPage: page,
            totalPages,
            totalProducts
        });
    } catch (error) {
        console.error('Error in loadShop:', error);
        res.render("shop", {
            error: 'Failed to load products',
            products: [],
            currentPage: 1,
            totalPages: 0,
            totalProducts: 0
        });
    }
};

const loadContact = async (req, res) => {
    try {
        return res.render("contact");
    } catch (error) {
        console.log("Contact page not found");
        res.status(500).send("Server error");
    }
};

const pageNotFound = async (req, res) => {
    try {
        res.render("page-404");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const loadHomepage = async (req, res) => {
    try {
        return res.render("home");
    } catch (error) {
        console.log("Homepage not found");
        res.status(500).send("Server error");
    }
};

const signupPost = async (req, res) => {
    try {
        console.log(req.body);
    } catch (error) {
        console.log(error);
    }
};

module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignup,
    loadSignin,
    loadContact,
    loadShop,
    loadAbout,
    signupPost
};