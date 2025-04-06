const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');


const validateProduct = async (productData, productId = null) => {
    const errors = [];

    if (!productData.productName?.trim()) {
        errors.push('Product name is required');
    }

    if (!productData.category) {
        errors.push('Category is required');
    }

    if (!productData.price || productData.price <= 0) {
        errors.push('Price is required and must be greater than 0');
    }

    if (productData.discount) {
        if (productData.discount < 0 || productData.discount > 100) {
            errors.push('Discount must be between 0% and 100%');
        }
    }

    // Only validate offerPrice if discount is provided
    if (productData.discount && productData.offerPrice) {
        if (productData.offerPrice >= productData.price) {
            errors.push('Offer price must be less than the regular price');
        }
    }

    if (!productData.sizes || productData.sizes.length === 0) {
        errors.push('At least one size is required');
    } else {
        productData.sizes.forEach(size => {
            if (size.stock < 0) {
                errors.push(`Stock for size ${size.size} cannot be negative`);
            }
        });
    }

    return errors;
};


const loadProductManagement = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

      
        if (page < 1) {
            return res.status(400).render('productManagement', {
                error: 'Invalid page number',
                products: [],
                categories: [],
                currentPage: 1,
                totalPages: 0,
                totalProducts: 0,
                product: null 
            });
        }

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


        const fixedProducts = products.map(product => {
            const fixedImages = product.productImage.map(img =>
                img.replace(/\\/g, '/').replace(/^public\//, '/')
            );
            return {
                ...product.toObject(),
                productImage: fixedImages
            };
        });
        const categories = await Category.find({ isDeleted: false , isListed: true });
        res.render('productManagement', {
            products: fixedProducts,
            currentPage: page,
            totalPages,
            totalProducts,
            categories,
            searchQuery: search,
            product: null 
        });
    } catch (error) {
        console.error('Error in loadProductManagement:', error);
        res.render('productManagement', {
            error: 'Failed to load product data',
            products: [],
            categories: [],
            currentPage: 1,
            totalPages: 0,
            totalProducts: 0,
            product: null 
        });
    }
};

const addProduct = async (req, res) => {
    try {
        const { productName, description, category, isListed, price, discount } = req.body;

        // Validate required fields
        if (!productName || !description || !category || !price) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields' 
            });
        }

        // Process sizes and stock
        const sizes = ['7', '8', '9', '10'].filter(size => req.body[`size_${size}_stock`]);
        const sizeDetails = sizes.map(size => ({
            size,
            stock: parseInt(req.body[`size_${size}_stock`])
        }));

        // Validate at least one size is selected
        if (sizeDetails.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'At least one size is required' 
            });
        }

        // Process images - collect all 4 uploaded images
        const productImages = [];
        for (let i = 0; i < 4; i++) {
            const fileField = `productImages_${i}`;
            if (req.files[fileField] && req.files[fileField][0]) {
                const file = req.files[fileField][0];
                const relativePath = file.path.replace(/^public[\\/]/, '');
                productImages.push('/' + relativePath.replace(/\\/g, '/'));
            }
        }

        // Validate all 4 images are provided
        if (productImages.length < 4) {
            return res.status(400).json({ 
                success: false, 
                error: 'All 4 product images are required' 
            });
        }

        // Prepare product data
        const productData = {
            productName,
            description,
            category,
            isListed: isListed === 'list',
            productImage: productImages,
            price: parseFloat(price),
            discount: parseFloat(discount) || 0,
            sizes: sizeDetails
        };

        // Calculate offer price if discount is provided
        if (discount && !isNaN(discount) && discount > 0) {
            productData.offerPrice = Math.round(parseFloat(price) * (1 - parseFloat(discount)/100));
        }

        // Validate product data
        const errors = await validateProduct(productData);
        if (errors.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: errors[0] 
            });
        }

        // Create and save new product
        const newProduct = new Product(productData);
        await newProduct.save();

        res.status(201).json({ 
            success: true, 
            message: 'Product added successfully',
            productId: newProduct._id 
        });

    } catch (error) {
        console.error('Error in addProduct:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to add product',
            details: error.message 
        });
    }
};


const updateProduct = async (req, res) => {
    try {
        const productId = req.params.id;
       
        if (!productId) {
            return res.status(400).json({
                success: false,
                error: 'Product ID is required'
            });
        }

        const sizes = ['7', '8', '9', '10'].filter(size => req.body[`size_${size}_stock`]);
        const sizeDetails = sizes.map(size => ({
            size,
            stock: parseInt(req.body[`size_${size}_stock`])
        }));

        const productData = {
            productName: req.body.productName,
            description: req.body.description,
            category: req.body.category,
            isListed: req.body.isListed === 'list',
            price: parseFloat(req.body.price),
            discount: parseFloat(req.body.discount) || 0,
            sizes: sizeDetails
        };

        // Calculate offer price if discount is provided
        if (req.body.discount && !isNaN(req.body.discount)) {
            productData.offerPrice = Math.round(parseFloat(req.body.price) * (1 - parseFloat(req.body.discount)/100));
        } else {
            productData.offerPrice = undefined;
        }

        const errors = await validateProduct(productData, productId);
        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: errors[0]
            });
        }

        const existingProduct = await Product.findById(productId);
        if (!existingProduct) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        // Handle image updates
        const updatedImages = [...existingProduct.productImage];
        
        // Process new uploaded files
        for (let i = 0; i < 4; i++) {
            const fileField = `productImages_${i}`;
            if (req.files && req.files[fileField] && req.files[fileField][0]) {
                const file = req.files[fileField][0];
                const relativePath = file.path.replace(/^public[\\/]/, '');
                updatedImages[i] = '/' + relativePath.replace(/\\/g, '/');
            }
        }
        
        // Handle removed images
        if (req.body.removedImages) {
            const removedIndexes = Array.isArray(req.body.removedImages) 
                ? req.body.removedImages.map(Number) 
                : [Number(req.body.removedImages)];
                
            removedIndexes.forEach(index => {
                if (index >= 0 && index < 4) {
                    updatedImages[index] = '';
                }
            });
        }

        productData.productImage = updatedImages.filter(img => img !== '');

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
        console.log('Fetching product with ID:', productId); // Debugging

        const product = await Product.findById(productId).populate('category');

        if (!product || product.isDeleted) {
            console.log('Product not found or deleted:', productId); // Debugging
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        const fixedImages = product.productImage.map(img =>
            img.replace(/\\/g, '/').replace(/^public\//, '/')
        );

        const productData = {
            ...product.toObject(),
            productImage: fixedImages
        };

        console.log('Product data:', productData); // Debugging

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