const express = require("express");
const adminController = require("../controllers/admin/adminController");
const categoryController = require("../controllers/admin/categoryController");
const productController = require("../controllers/admin/productController");
const userController = require("../controllers/admin/userController");
const adminAuth = require('../middlewares/adminAuth');
const upload = require('../middlewares/multerConfig');
const router = express.Router();

router.get("/", adminController.loadLogin);
router.post("/login", adminController.verifyLogin);
router.get("/dashboard", adminAuth, adminController.loadDashboard);
router.get("/logout", adminController.logoutAdmin);



//category management
router.get("/categoryManagement", adminAuth,categoryController.loadCategoryManagement)
router.post("/category", adminAuth, categoryController.addCategory);
router.put("/category/:id", adminAuth, categoryController.updateCategory);
router.delete("/category/:id", adminAuth, categoryController.deleteCategory);
router.patch("/category/:id/toggle", adminAuth, categoryController.toggleCategoryStatus);


//product management

router.get('/productManagement',adminAuth, productController.loadProductManagement);
router.post('/product/add', adminAuth, upload.array('productImages', 4), productController.addProduct);
router.put('/product/:id', adminAuth, upload.array('productImages', 4), productController.updateProduct);
router.get('/product/:id', adminAuth, productController.getProductById);
router.delete('/product/:id', adminAuth, productController.deleteProduct);
router.patch('/product/toggle-status/:id', adminAuth, productController.toggleProductStatus);



//user management

router.get('/userManagement', userController.listUsers);
router.get('/userManagement/:id', userController.getUserById);
router.delete('/userManagement/:id', userController.deleteUser);
router.post('/userManagement/:id/toggle-status', userController.toggleUserStatus);








// router.get("/orderManagement", adminAuth,adminController.loadOrderManagement)
// router.get("/couponManagement", adminAuth,adminController.loadCouponManagement)
// router.get("/offerManagement", adminAuth,adminController.loadOfferManagement)
// router.get("/sales", adminAuth,adminController.loadSales)


module.exports = router;