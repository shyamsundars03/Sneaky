const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const { CURSOR_FLAGS } = require('mongodb');

// Helper function to validate product data
const validateProduct = async (productData, productId = null) => {
    const errors = [];

    if (!Product.db) {
        console.error("Database connection issue: Product model is not connected to MongoDB.");
    }

    if (!productData.productName?.trim()) {
        errors.push('Product name is required');
    } else {
        // Check for duplicate product name
        const existingProduct = await Product.findOne({
            productName: { $regex: new RegExp(`^${productData.productName}$`, 'i') },
            _id: { $ne: productId },
            isDeleted: false
        });


        console.log("Existing Product for Validation:", existingProduct);



        if (existingProduct) {
            errors.push('Product name already exists');
        }
    }

    if (!productData.category) {
        errors.push('Category is required');
    }

    if (!productData.price || productData.price <= 0) {
        errors.push('Valid price is required');
    }

    if (productData.stock < 0) {
        errors.push('Stock cannot be negative');
    }


    if (!productData.size) {
        errors.push('Size is required');
    }


    if (!productData.description?.trim()) {
        errors.push('Description is required');
    }

    return errors;
};

const loadProductManagement = async (req, res) => {
    console.log("this is load porduct")
    try {

        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        // Create search query
        const searchQuery = {
            isDeleted: false,
            ...(search && {
                productName: { $regex: search, $options: 'i' }
            })
        };

        let products = await Product.find(searchQuery)
            .populate('category')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const totalProducts = await Product.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalProducts / limit);
        const categories = await Category.find({ isDeleted: false });

        // Fix image paths
        products = products.map(product => {
            const fixedImages = product.productImage.map(img =>
                img.replace(/\\/g, '/').replace(/^public\//, '/')
            );
            return {
                ...product.toObject(),
                productImage: fixedImages
            };
        });
        


        return res.render('productManagement', {
            products,
            currentPage: page,
            totalPages,
            totalProducts,
            categories,
            searchQuery: search
        });
    } catch (error) {
        console.error('Error in loadProductManagement:', error);
        return res.render('productManagement', {
            error: 'Failed to load product data',
            products: [],
            categories: [],
            currentPage: 1,
            totalPages: 0,
            totalProducts: 0
        });
    }
};

const addProduct = async (req, res) => {
    console.log("this is add porduct")
    console.log(req.body);
    
    try {
        const productData = {
            productName: req.body.productName,
            description: req.body.description,
            category: req.body.category,
            price: parseFloat(req.body.price),
            offerPrice: req.body.offerPrice ? parseFloat(req.body.offerPrice) : 0,
            stock: parseInt(req.body.stock),
            isListed: req.body.isListed === 'list',
            size: req.body.size  
        };

        // Validate product data
        const errors = await validateProduct(productData);

        // Check for required images
        if (!req.files || req.files.length < 4) {


            console.error("Validation Errors:", errors);



            errors.push('Four product images are required');
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: errors[0]
            });
        }

        // Add image paths
        productData.productImage = req.files.map(file => file.path);

        const newProduct = new Product(productData);
        await newProduct.save();



        console.log("Product Saved:", newProduct);
        console.log("this is  tryyy add porduct")





        res.status(201).json({
            success: true,
            message: 'Product added successfully'
        });
    } catch (error) {
        console.error('Error in addProduct:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add product'
        });
    }
};

const updateProduct = async (req, res) => {
    console.log("this is updatre porduct")
    try {
        const productId = req.params.id;
        const productData = {
            productName: req.body.productName,
            description: req.body.description,
            category: req.body.category,
            price: parseFloat(req.body.price),
            offerPrice: req.body.offerPrice ? parseFloat(req.body.offerPrice) : 0,
            stock: parseInt(req.body.stock),
            isListed: req.body.isListed === 'list',
            size: req.body.size  
        };





        console.log(productData)


        // Validate product data
        const errors = await validateProduct(productData, productId);

        // Handle image updates
        const existingProduct = await Product.findById(productId);
        if (!existingProduct) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        if (req.files && req.files.length > 0) {
            if (req.files.length < 4) {
                errors.push('Four product images are required');
            } else {
                productData.productImage = req.files.map(file => file.path);
            }
        } else {
            productData.productImage = existingProduct.productImage;
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: errors[0]
            });
        }

        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            productData,
            { new: true }
        );




        console.log("Updating Product:", productId, productData);
        console.log("this is try update porduct")





        res.json({
            success: true,
            message: 'Product updated successfully'
        });
    } catch (error) {
        console.error('Error in updateProduct:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update product'
        });
    }
};

const deleteProduct = async (req, res) => {
    console.log("this is delete porduct")
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        product.isDeleted = true;
        await product.save();



        const result = await Product.findByIdAndUpdate(productId, { isDeleted: true }, { new: true });
        console.log("Delete Result:", result);
        console.log("this is try dele porduct")


        res.json({
            success: true,
            message: 'Product deleted successfully'
        });
    } catch (error) {
        console.error('Error in deleteProduct:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete product'
        });
    }
};

const toggleProductStatus = async (req, res) => {


    console.log("this is toggle porduct")
    try {
        const productId = req.params.id;
        console.log(productId);
        const product = await Product.findById(productId);
        console.log(product);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        product.isListed = !product.isListed;
        await product.save();


        console.log("this is try togg porduct")

        res.json({
            success: true,
            message: `Product ${product.isListed ? 'listed' : 'unlisted'} successfully`
        });
    } catch (error) {
        console.error('Error in toggleProductStatus:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update product status'
        });
    }
};

const getProductById = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId);
        
        if (!product || product.isDeleted) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        
        // Fix image paths
        const fixedImages = product.productImage.map(img =>
            img.replace(/\\/g, '/').replace(/^public\//, '/')
        );
        
        const productData = {
            ...product.toObject(),
            productImage: fixedImages
        };
        
        res.json({
            success: true,
            product: productData
        });
    } catch (error) {
        console.error('Error in getProductById:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load product data'
        });
    }
};




















module.exports = {
    loadProductManagement,
    addProduct,
    updateProduct,
    deleteProduct,
    toggleProductStatus,
    validateProduct,
    getProductById 
};