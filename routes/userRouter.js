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
const walletController = require('../controllers/user/walletController');
const paymentController = require('../controllers/user/paymentController');
const { validateCoupon } = require('../controllers/user/couponController');
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
router.get("/change-email", userController.loadChangeEmail); 
router.post("/change-email", userController.changeEmail); 
router.post("/verify-otp", userController.verifyOtp2); 
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


// Address Routes
router.get("/address", userAuth, profileController.loadAddress);
router.post("/address/save", userAuth, profileController.saveAddress);
router.post("/address/delete/:id", userAuth, profileController.deleteAddress);

// Cart
router.get("/cart", userAuth, cartController.loadCart);
router.post("/cart/add", userAuth, cartController.addToCart);
router.post("/cart/update-quantity", userAuth, cartController.updateQuantity);
router.post("/cart/remove", userAuth, cartController.removeFromCart);
router.post("/cart/proceed-to-checkout", userAuth, cartController.proceedToCheckout);

//wishlist
router.get("/wishlist", userAuth, wishlistController.loadWishlist);
router.post("/wishlist/toggle", userAuth, wishlistController.toggleWishlist);
router.get("/wishlist/status", userAuth, wishlistController.getWishlistStatus);

// Order
router.get("/orders", userAuth, orderController.loadOrder);
router.get("/orders/:orderId",userAuth, orderController.loadSingleOrder);
router.get("/order-success/:orderId", userAuth, orderController.loadOrderSuccess);
router.post('/cancel-order', userAuth, orderController.cancelOrder);
router.post('/return-order', userAuth, orderController.returnOrder);
router.get('/download-invoice/:orderId',userAuth, orderController.downloadInvoice);
router.get('/order-failed/:orderId', userAuth, orderController.loadOrderFailed);
router.post('/retry-payment/:orderId', userAuth, paymentController.retryPayment);


// User routes
router.post('/cancel-order-item', userAuth, orderController.cancelOrderItem);
router.post('/return-order-item', userAuth, orderController.returnOrderItem);

// Error page
router.get("/pageNotFound", userController.pageNotFound);

// Checkout routes
router.get("/checkout1", userAuth, checkoutController.loadCheckout1);
router.get("/checkout2", userAuth, checkoutController.loadCheckout2);
router.get("/checkout3", userAuth, checkoutController.loadCheckout3);
router.post("/checkout1/save", userAuth, checkoutController.saveCheckout1);
router.post("/checkout2/save", userAuth, checkoutController.saveCheckout2);
router.post("/validate-and-place-order", userAuth, checkoutController.validateAndPlaceOrder);
router.post('/remove-coupon', checkoutController.removeCoupon);


// Payment routes
router.post('/process-cod', userAuth, paymentController.processCOD);
router.post('/process-wallet', userAuth, paymentController.processWallet);
router.post('/process-razorpay', userAuth, paymentController.processRazorpay);
router.post('/verify-razorpay', userAuth, paymentController.verifyRazorpay);
router.post('/validate-coupon', userAuth, paymentController.validateCoupon);
router.post('/save-failed-order', userAuth, paymentController.saveFailedOrder);
// In your routes file
router.post('/verify-retry-payment', userAuth, paymentController.verifyRetryPayment);






router.get('/auth/google', (req, res, next) => {
    if (req.query.ref) {
        req.session.referralCode = req.query.ref;
        req.session.save(err => {
            if (err) console.error('Session save error:', err);
            next();
        });
    } else {
        next();
    }
}, passport.authenticate('google', { scope: ['email', 'profile'], prompt: "select_account" }));

router.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/signin' }), 
    userController.googleCallback
);


// router.get('/debug/user', (req, res) => {
//     res.json({
//         session: req.session,
//         user: req.user,
//         sessionUser: req.session.user
//     });
// });


// Wallet routes
router.get("/wallet", userAuth, walletController.loadWallet)
router.post("/wallet/add-funds-razorpay", userAuth, walletController.addFundsRazorpay)
router.post("/wallet/verify-razorpay", userAuth, walletController.verifyRazorpayPayment)






module.exports = router;