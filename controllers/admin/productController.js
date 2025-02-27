const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const { CURSOR_FLAGS } = require('mongodb');

// Helper function to validate product data
const validateProduct = async (productData, productId = null) => {
    const errors = [];

    if (!productData.productName?.trim()) {
        errors.push('Product name is required');
    } else {
        // Check for duplicate product name
        const existingProduct = await Product.findOne({
            productName: { $regex: new RegExp(`^${productData.productName}$`, 'i') },
            _id: { $ne: productId },
            isDeleted: false
        });

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

    // Validate size
    if (!productData.size || !Array.isArray(productData.size) || productData.size.length === 0) {
        errors.push('At least one size is required');
    }

    if (!productData.description?.trim()) {
        errors.push('Description is required');
    }

    return errors;
};

const loadProductManagement = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        // Validate page number
        if (page < 1) {
            return res.status(400).render('productManagement', {
                error: 'Invalid page number',
                products: [],
                categories: [],
                currentPage: 1,
                totalPages: 0,
                totalProducts: 0
            });
        }

        // Create search query
        const searchQuery = {
            isDeleted: false,
            ...(search && {
                productName: { $regex: search, $options: 'i' }
            })
        };

        const products = await Product.find(searchQuery)
            .populate('category')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const totalProducts = await Product.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalProducts / limit);
        const categories = await Category.find({ isDeleted: false });

        // Fix image paths
        const fixedProducts = products.map(product => {
            const fixedImages = product.productImage.map(img =>
                img.replace(/\\/g, '/').replace(/^public\//, '/')
            );
            return {
                ...product.toObject(),
                productImage: fixedImages
            };
        });

        res.render('productManagement', {
            products: fixedProducts,
            currentPage: page,
            totalPages,
            totalProducts,
            categories,
            searchQuery: search
        });
    } catch (error) {
        console.error('Error in loadProductManagement:', error);
        res.render('productManagement', {
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
    try {
        const price = parseFloat(req.body.price);
        const discount = parseFloat(req.body.discount) || 0;

        const sizes = Array.isArray(req.body.size) ? req.body.size : [req.body.size];

        const productData = {
            productName: req.body.productName,
            description: req.body.description,
            category: req.body.category,
            price: price,
            discount: discount,
            offerPrice: price - (price * (discount / 100)), // Calculate offer price
            stock: parseInt(req.body.stock),
            isListed: req.body.isListed === 'list',
            size: sizes // Array of selected sizes
        };

        // Validate product data
        const errors = await validateProduct(productData);

        // Check for required images
        if (req.files && req.files.length > 0 && req.files.length !== 4) {
            errors.push('Exactly four product images are required');
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
    try {
        console.log("Request Params:", req.params); // Debugging line
        console.log("Request Body:", req.body); // Debugging line

        const productId = req.params.id;// Ensure productId is extracted from req.params
        console.log("Product ID:", productId);

        if (!productId) {
            return res.status(400).json({
                success: false,
                error: 'Product ID is required'
            });
        }

        const price = parseFloat(req.body.price);
        const discount = parseFloat(req.body.discount) || 0;

        // Get selected sizes as an array
        const sizes = Array.isArray(req.body.size) ? req.body.size : [req.body.size];

        const productData = {
            productName: req.body.productName,
            description: req.body.description,
            category: req.body.category,
            price: price,
            discount: discount,
            offerPrice: price - (price * (discount / 100)),
            stock: parseInt(req.body.stock),
            isListed: req.body.isListed === 'list',
            size: sizes // Array of selected sizes
        };

        // Validate product data
        const errors = await validateProduct(productData, productId);
        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: errors[0]
            });
        }

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
                return res.status(400).json({
                    success: false,
                    error: 'Exactly four product images are required'
                });
            } else {
                productData.productImage = req.files.map(file => file.path);
            }
        } else {
            productData.productImage = existingProduct.productImage;
        }

        const updatedProduct = await Product.findByIdAndUpdate(
            productId, // Ensure productId is used here
            productData,
            { new: true }
        );

        res.json({
            success: true,
            message: 'Product updated successfully',
            product: updatedProduct
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
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        product.isListed = !product.isListed;
        await product.save();

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