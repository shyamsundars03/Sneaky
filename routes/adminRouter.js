// routes/adminRouter.js

const express = require("express");
const adminController = require("../controllers/admin/adminController");
const categoryController = require("../controllers/admin/categoryController");
const productController = require("../controllers/admin/productController");
const userController = require("../controllers/admin/userController");
const orderController = require("../controllers/admin/orderController");
const couponController = require("../controllers/admin/couponController");
const offerController = require("../controllers/admin/offerController");
const salesController = require("../controllers/admin/salesController");
const adminAuth = require('../middlewares/adminAuth');
const upload = require('../middlewares/multerConfig');
const router = express.Router();

router.get("/", adminController.loadLogin);
router.post("/login", adminController.verifyLogin);
router.get("/dashboard", adminAuth, adminController.loadDashboard);
router.get("/logout", adminController.logoutAdmin);

// Category management
router.get("/categoryManagement", adminAuth, categoryController.loadCategoryManagement);
router.post("/category", adminAuth, categoryController.addCategory);
router.put("/category/:id", adminAuth, categoryController.updateCategory);
router.delete("/category/:id", adminAuth, categoryController.deleteCategory);
router.patch("/category/:id/toggle", adminAuth, categoryController.toggleCategoryStatus);

// Product management
router.get('/productManagement', adminAuth, productController.loadProductManagement);
router.post('/product/add', adminAuth, upload.array('productImages', 4), productController.addProduct);
router.put('/product/:id', adminAuth, upload.array('productImages', 4), productController.updateProduct);
router.get('/product/:id', adminAuth, productController.getProductById);
router.delete('/product/:id', adminAuth, productController.deleteProduct);
router.patch('/product/toggle-status/:id', adminAuth, productController.toggleProductStatus);

// User management
router.get('/userManagement', adminAuth, userController.listUsers);
router.get('/userManagement/:id', adminAuth, userController.getUserById);
router.delete('/userManagement/:id', adminAuth, userController.deleteUser);
router.post('/userManagement/:id/toggle-status', adminAuth, userController.toggleUserStatus);

// Order management
router.get("/orderManagement", adminAuth, orderController.loadOrderManagement); // Load order management page
router.get("/orderManagement/:id", adminAuth, orderController.loadSingleAdminOrder); // Load single order details
router.get('/order/:id', adminAuth, orderController.loadSingleAdminOrder); // Alternative route for single order
router.post('/update-order-status', adminAuth, orderController.updateOrderStatus); // Update order status
router.post('/cancel-order', adminAuth, orderController.cancelOrder); // Cancel order
router.post('/verify-return-request', adminAuth, orderController.verifyReturnRequest);
router.post('/admin/verify-return', adminAuth, orderController.verifyReturn);
router.post('/verify-order', adminAuth, orderController.verifyOrder);


// Coupon management
router.get("/couponManagement", adminAuth, couponController.loadCouponManagement);
router.post("/coupon/add", adminAuth, couponController.addCoupon);
router.put("/coupon/:id", adminAuth, couponController.updateCoupon);
router.delete("/coupon/:id", adminAuth, couponController.deleteCoupon);
router.get("/coupon/:id", adminAuth, couponController.getCouponById);


// Offer management
router.get("/offerManagement", adminAuth, offerController.loadOfferManagement);
router.post("/offer/add", adminAuth, offerController.addOffer);
router.put("/offer/:id", adminAuth, offerController.updateOffer);
router.delete("/offer/:id", adminAuth, offerController.deleteOffer);
router.get("/offer/:id", adminAuth, offerController.getOfferById);
// Sales management
router.get("/sales", adminAuth, salesController.loadSales);

module.exports = router;