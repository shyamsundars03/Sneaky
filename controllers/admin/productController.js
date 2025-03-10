const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');

// Helper function to validate product data
const validateProduct = async (productData, productId = null) => {
    const errors = [];

    // Validate product name, category, etc.
    if (!productData.productName?.trim()) {
        errors.push('Product name is required');
    }

    if (!productData.category) {
        errors.push('Category is required');
    }

    // Validate size-specific data
    if (!productData.sizes || productData.sizes.length === 0) {
        errors.push('At least one size is required');
    } else {
        productData.sizes.forEach(size => {
            if (!size.price || size.price <= 0) {
                errors.push(`Price for size ${size.size} is invalid`);
            }
            if (size.stock < 0) {
                errors.push(`Stock for size ${size.size} cannot be negative`);
            }
        });
    }

    return errors;
};

// Load product management page
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
        const categories = await Category.find({ isDeleted: false });
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

// Add a new product
const addProduct = async (req, res) => {
    try {
        const { productName, description, category, isListed } = req.body;

        // Extract size-specific data
        const sizes = ['7', '8', '9', '10'].filter(size => req.body[`size_${size}_price`]);
        const sizeDetails = sizes.map(size => ({
            size,
            price: parseFloat(req.body[`size_${size}_price`]),
            discount: parseFloat(req.body[`size_${size}_discount`]) || 0,
            offerPrice: parseFloat(req.body[`size_${size}_offerPrice`]),
            stock: parseInt(req.body[`size_${size}_stock`])
        }));

        const productData = {
            productName,
            description,
            category,
            isListed: isListed === 'list',
            productImage: req.files.map(file => file.path),
            sizes: sizeDetails
        };

        // Validate product data
        const errors = await validateProduct(productData);
        if (errors.length > 0) {
            return res.status(400).json({ success: false, error: errors[0] });
        }

        const newProduct = new Product(productData);
        await newProduct.save();

        res.status(201).json({ success: true, message: 'Product added successfully' });
    } catch (error) {
        console.error('Error in addProduct:', error);
        res.status(500).json({ success: false, error: 'Failed to add product' });
    }
};

// Update an existing product
const updateProduct = async (req, res) => {
    try {
        const productId = req.params.id;

        if (!productId) {
            return res.status(400).json({
                success: false,
                error: 'Product ID is required'
            });
        }

        // Extract size-specific data
        const sizes = ['7', '8', '9', '10'].filter(size => req.body[`size_${size}_price`]);
        const sizeDetails = sizes.map(size => ({
            size,
            price: parseFloat(req.body[`size_${size}_price`]),
            discount: parseFloat(req.body[`size_${size}_discount`]) || 0,
            offerPrice: parseFloat(req.body[`size_${size}_offerPrice`]),
            stock: parseInt(req.body[`size_${size}_stock`])
        }));

        const productData = {
            productName: req.body.productName,
            description: req.body.description,
            category: req.body.category,
            isListed: req.body.isListed === 'list',
            sizes: sizeDetails
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
            productId,
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

// Delete a product
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

// Toggle product listing status
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

// Get product by ID
const getProductById = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId).populate('category');

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
    getProductById,
    validateProduct
};