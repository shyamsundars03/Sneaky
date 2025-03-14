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


// Set up multer for image uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/'); // Ensure this directory exists
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // Append timestamp to filename
    }
});

const upload = multer({ storage: storage });




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

// Profile
router.get("/profile", userAuth, profileController.loadProfile);
router.post("/profile/update", userAuth, profileController.updateProfile);
router.post("/profile/image", upload.single('profileImage'), profileController.updateProfileImage);
router.get("/address", profileController.loadAddress);
router.post("/address/add",  profileController.addAddress);
router.post("/address/update", profileController.updateAddress);
router.get("/address/delete/:id",  profileController.deleteAddress);
router.post("/logout", profileController.signOut);

// Cart
router.get("/cart", userAuth, cartController.loadCart);
router.post("/cart/add", userAuth, cartController.addToCart);
router.post("/cart/update-quantity", userAuth, cartController.updateQuantity);
router.post("/cart/remove", userAuth, cartController.removeFromCart);

router.get("/wishlist", userAuth, wishlistController.loadWishlist);
router.post("/wishlist/toggle", userAuth, wishlistController.toggleWishlist);
router.get("/wishlist/status", userAuth, wishlistController.getWishlistStatus);


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