const express = require("express");
const adminController = require("../controllers/admin/adminController");
const categoryController = require("../controllers/admin/categoryController");
const adminAuth = require('../middlewares/adminAuth');
const router = express.Router();

router.get("/", adminController.loadLogin);
router.post("/login", adminController.verifyLogin);
router.get("/dashboard", adminAuth, adminController.loadDashboard);
router.get("/logout", adminController.logoutAdmin);



router.get("/userManagement", adminAuth,adminController.loadUserManagement)
router.get("/productManagement", adminAuth,adminController.loadProductManagement)



//category management
router.get("/categoryManagement", adminAuth,categoryController.loadCategoryManagement)
router.get("/addCategory", adminAuth,categoryController.addCategory)




router.get("/orderManagement", adminAuth,adminController.loadOrderManagement)
router.get("/couponManagement", adminAuth,adminController.loadCouponManagement)
router.get("/offerManagement", adminAuth,adminController.loadOfferManagement)
router.get("/sales", adminAuth,adminController.loadSales)


module.exports = router;