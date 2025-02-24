const express= require("express");
const router = express.Router()
const userController = require("../controllers/user/userController")


router.get("/", userController.loadHomepage );
router.get("/pageNotFound",userController.pageNotFound);

router.get("/signup", userController.loadSignup);
router.get("/signin", userController.loadSignin); 
router.get("/about", userController.loadAbout);   
router.get("/shop", userController.loadShop);     
router.get("/contact", userController.loadContact);











module.exports= router;