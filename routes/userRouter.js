const express= require("express");
const passport = require('passport')
const bodyParser = require('body-parser')
const router = express.Router()
const userController = require("../controllers/user/userController")
const userAuth = require('../middlewares/userAuth');


router.use(bodyParser.json());
router.use(bodyParser.urlencoded({extended:true}));



router.get("/", userController.loadHomepage );


router.get("/signup", userController.loadSignup);
router.get("/signin", userController.loadSignin); 
router.get("/about", userController.loadAbout);   
router.get("/shop", userController.loadShop);     
router.get("/contact", userController.loadContact);
router.get("/otpsend",userController.otpSend)
router.get("/otp",userController.otpPage)
router.get('/auth/google', passport.authenticate('google',{scope:['email','profile']}))
// router.get('/auth/google/callback', passport.authenticate('google',{failureRedirect:'http://localhost:3000/login'}),userController.googleCallback)
router.get("/blocked",userController.blockedUser)

router.post("/signup",userController.signupPost)
router.post("/signin", userController.signinPost); 
router.post("/otp",userController.otpPost)
router.post("/logout",userController.logout)





router.get("/pageNotFound",userController.pageNotFound);



// Shop page route
router.get('/shop', userController.loadShop); 
router.get("/product/:id", userController.loadSingleProduct);















module.exports= router;