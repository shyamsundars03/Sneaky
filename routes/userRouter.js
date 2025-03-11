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
    
router.get("/contact", userController.loadContact);
router.get("/otpsend",userController.otpSend)
router.get("/otp",userController.otpPage)
router.get('/auth/google', passport.authenticate('google', { scope: ['email', 'profile'] }));
router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/signin' }), userController.googleCallback);
router.get("/blocked",userController.blockedUser)

router.post("/signup",userController.signupPost)
router.post("/signin", userController.signinPost); 
router.post("/otp",userController.otpPost)
router.post("/logout",userController.logout)

router.get('/otp-time', (req, res) => {
    if (req.session.otpStartTime) {
        const elapsedTime = Math.floor((Date.now() - req.session.otpStartTime) / 1000);
        const remainingTime = Math.max(req.session.otpTime - elapsedTime, 0);
        res.json({ remainingTime });
    } else {
        res.json({ remainingTime: 0 });
    }
});
router.post('/otp-send', userController.resendOtp);






router.get("/pageNotFound",userController.pageNotFound);



// Shop page route
router.get('/shop', userController.loadShop); 
router.get("/product/:id", userController.loadSingleProduct);















module.exports= router;