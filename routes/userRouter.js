// routes/userRouter.js

const express = require("express");
const passport = require('passport');
const bodyParser = require('body-parser');
const router = express.Router();
const userController = require("../controllers/user/userController");
const cartController = require("../controllers/user/cartController");
const profileController = require("../controllers/user/profileController");
const checkoutController = require("../controllers/user/checkoutController");
const wishlistController = require("../controllers/user/wishlistController");
const orderController = require("../controllers/user/orderController");
const userAuth = require('../middlewares/userAuth');

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));

// Home and static pages
router.get("/", userController.loadHomepage);
router.get("/about", userController.loadAbout);
router.get("/contact", userController.loadContact);
router.get("/shop", userController.loadShop);
router.get("/product/:id", userController.loadSingleProduct);

// Authentication
router.get("/signup", userController.loadSignup);
router.get("/signin", userController.loadSignin);
router.post("/signup", userController.signupPost);
router.post("/signin", userController.signinPost);
router.post("/logout", userController.logout);
router.get("/blocked", userController.blockedUser);

// OTP
router.get("/otpsend", userController.otpSend);
router.get("/otp", userController.otpPage);
router.post("/otp", userController.otpPost);
router.get("/otp-time", userController.otpTime);
router.post("/otp-send", userController.resendOtp);

// Cart
router.get("/cart", cartController.loadCart);

// Profile
router.get("/profile", profileController.loadProfile);
router.get("/address", profileController.loadAddress);

// Wishlist
router.get("/wishlist", wishlistController.loadWishlist);

// Order
router.get("/orders", orderController.loadOrder);
router.get("/orders/:id", orderController.loadSingleOrder);


// Error page
router.get("/pageNotFound", userController.pageNotFound);

//Checkout
router.get("/checkout1", checkoutController.loadCheckout1);
router.get("/checkout2", checkoutController.loadCheckout2);
router.get("/checkout3", checkoutController.loadCheckout3);




// Google authentication
router.get('/auth/google', passport.authenticate('google', { scope: ['email', 'profile'] }));
router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/signin' }), userController.googleCallback);

module.exports = router;