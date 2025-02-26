const Product = require('../../models/productSchema'); // Import the Product model
const Category = require('../../models/categorySchema');




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

        const page = parseInt(req.query.page) || 1;
        const limit = 6;
        const skip = (page - 1) * limit;

        const products = await Product.find({ isDeleted: false, isListed: true })
            .populate('category')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const categories = await Category.find({ isDeleted: false });
        console.log("Categories:", categories); // Debugging log


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
            categories,
            currentPage: page,
            totalPages,
            totalProducts
        });
    } catch (error) {
        console.error('Error in loadShop:', error);
        res.render("shop", {
            error: 'Failed to load products',
            products: [],
            categories: [], 
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
        // Fetch categories that are not deleted
        const categories = await Category.find({ isDeleted: false });
        console.log("Categories:", categories); // Debugging log

        // Render the home.ejs file with categories
        res.render("home", {
            categories // Pass categories to the view
        });
    } catch (error) {
        console.error('Error in loadHomepage:', error);
        res.render("home", {
            error: 'Failed to load homepage',
            categories: [] // Pass empty array in case of error
        });
    }
};

const signupPost = async (req, res) => {
    try {
        console.log(req.body);
    } catch (error) {
        console.log(error);
    }
};


const loadSingleProduct = async (req, res) => {
    try {
        const productId = req.params.id;

        // Fetch the product by ID
        const product = await Product.findById(productId).populate('category');
        if (!product || product.isDeleted) {
            return res.status(404).render("user/page-404", { error: "Product not found" });
        }

        // Fetch related products (excluding the current product)
        const relatedProducts = await Product.find({
            _id: { $ne: productId }, // Exclude the current product
            category: product.category, // Same category
            isDeleted: false,
            isListed: true
        }).limit(3); // Limit to 3 products

        // Fix image paths for rendering
        const fixedProduct = {
            ...product.toObject(),
            productImage: product.productImage.map(img =>
                img.replace(/\\/g, '/').replace(/^public\//, '/')
            )
        };

        const fixedRelatedProducts = relatedProducts.map(relatedProduct => {
            return {
                ...relatedProduct.toObject(),
                productImage: relatedProduct.productImage.map(img =>
                    img.replace(/\\/g, '/').replace(/^public\//, '/')
                )
            };
        });

        // Render the singleProduct.ejs file with product and related products
        res.render("singleProduct", {
            product: fixedProduct,
            relatedProducts: fixedRelatedProducts
        });
    } catch (error) {
        console.error('Error in loadSingleProduct:', error);
        res.status(500).render("shop", { error: "Failed to load product" });
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
    signupPost,
    loadSingleProduct,
};