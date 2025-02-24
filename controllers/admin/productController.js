// productController.js
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');

const loadProductManagement = async (req, res) => {

    try { 

        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        
        let products = await Product.find({ isDeleted: false })
            .populate('category')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
        const totalProducts = await Product.countDocuments({ isDeleted: false });
        const totalPages = Math.ceil(totalProducts / limit);
        const categories = await Category.find();

        for(let i=0;i<products.length;i++){
            products[i].productImage.map(img => img.replace(/\\/g, '/'));
        }
        

        products.map((product)=>{
            let img = product.productImage[0]
            img = img.slice(6)
            return product.productImage[0] = img
        })

        console.log(products);
        

        return res.render('productManagement', {
            products,
            currentPage: page,
            totalPages,
            totalProducts, 
            categories
        });
    } catch (error) {
        console.error('Error in loadProductManagement:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const addProduct = async (req, res) => {
    try {
        const {
            productName,
            description,
            category,
            price,
            offerPrice,
            stock,
            isListed
        } = req.body;

        // Handle image uploads
        const productImages = req.files.map(file => file.path);

        const newProduct = new Product({
            productName,
            description,
            category,
            price,
            offerPrice: offerPrice || 0,
            stock,
            productImage: productImages,
            isListed: isListed === 'list'
        });

        await newProduct.save();
        res.status(201).json({ success: true, message: 'Product added successfully' });
    } catch (error) {
        console.error('Error in addProduct:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const updateProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const {
            productName,
            description,
            category,
            price,
            offerPrice,
            stock,
            isListed
        } = req.body;

        const updateData = {
            productName,
            description,
            category,
            price,
            offerPrice: offerPrice || 0,
            stock,
            isListed: isListed === 'list'
        };

        // Handle image uploads if new images are provided
        if (req.files && req.files.length > 0) {
            updateData.productImage = req.files.map(file => file.path);
        }

        const updatedProduct = await Product.findByIdAndUpdate(
            productId,
            updateData,
            { new: true }
        );

        if (!updatedProduct) {
            return res.status(404).json({ error: 'Product not found' });
        }

        res.json({ success: true, message: 'Product updated successfully' });
    } catch (error) {
        console.error('Error in updateProduct:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const deleteProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const deletedProduct = await Product.findByIdAndUpdate(
            productId,
            { isDeleted: true },
            { new: true }
        );

        if (!deletedProduct) {
            return res.status(404).json({ error: 'Product not found' });
        }

        res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
        console.error('Error in deleteProduct:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

const toggleProductStatus = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }

        product.isListed = !product.isListed;
        await product.save();

        res.json({
            success: true,
            message: `Product ${product.isListed ? 'listed' : 'unlisted'} successfully`
        });
    } catch (error) {
        console.error('Error in toggleProductStatus:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    loadProductManagement,
    addProduct,
    updateProduct,
    deleteProduct,
    toggleProductStatus
};
