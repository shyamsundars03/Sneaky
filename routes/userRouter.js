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
const multer = require('multer');
const path = require('path');


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

//forgot && reset
router.get("/forgotPassword", userController.loadForgotPassword);
router.get("/reset-password", userController.loadResetPassword);
router.post("/forgot-password", userController.forgotPassword);
router.post("/reset-password", userController.resetPassword);

// New routes for change email flow
router.get("/change-email", userController.loadChangeEmail); // Render change-email.ejs
router.post("/change-email", userController.changeEmail); // Handle email change request
router.post("/verify-otp", userController.verifyOtp2); // Reuse OTP verification
router.get("/verify-otp", userController.loadVerifyotp2); 
router.post("/resend-otp2", userController.resendOtp2);
// OTP
router.get("/otpsend", userController.otpSend);
router.get("/otp", userController.otpPage);
router.post("/otp", userController.otpPost);
router.get("/otp-time", userController.otpTime);
router.post("/otp-send", userController.resendOtp);

// Chnage-Password

router.get("/change-password", userController.loadChangePassword);
router.post("/change-password", userController.changePassword); 


// Profile Routes
router.get("/profile", userAuth, profileController.loadProfile);
router.post("/profile/update", userAuth, profileController.updateProfile);
router.post("/profile/image", userAuth, profileController.upload, profileController.updateProfileImage);
// router.post("/update-profile",userAuth, profileController.updateProfile);

// Address Routes
router.get("/address", userAuth, profileController.loadAddress);
router.post("/address/save", userAuth, profileController.saveAddress);
router.post("/address/delete/:id", userAuth, profileController.deleteAddress);

// Cart
router.get("/cart", userAuth, cartController.loadCart);
router.post("/cart/add", userAuth, cartController.addToCart);
router.post("/cart/update-quantity", userAuth, cartController.updateQuantity);
router.post("/cart/remove", userAuth, cartController.removeFromCart);

//wishlist
router.get("/wishlist", userAuth, wishlistController.loadWishlist);
router.post("/wishlist/toggle", userAuth, wishlistController.toggleWishlist);
router.get("/wishlist/status", userAuth, wishlistController.getWishlistStatus);

// Order
router.get("/orders", userAuth, orderController.loadOrder);
router.get("/orders/:id", orderController.loadSingleOrder);
router.get("/order-success/:orderId", userAuth, orderController.loadOrderSuccess);

// Error page
router.get("/pageNotFound", userController.pageNotFound);

//Checkout
router.get("/checkout1", userAuth, checkoutController.loadCheckout1);
router.get("/checkout2", userAuth, checkoutController.loadCheckout2);
router.get("/checkout3", userAuth, checkoutController.loadCheckout3);
router.post("/place-order", userAuth, checkoutController.placeOrder);




// Google authentication
router.get('/auth/google', passport.authenticate('google', { scope: ['email', 'profile'] }));
router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/signin' }), userController.googleCallback);










module.exports = router;