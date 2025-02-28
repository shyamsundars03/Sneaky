const Product = require('../../models/productSchema'); // Import the Product model
const Category = require('../../models/categorySchema');
const bcrypt = require('bcrypt')
const usercollection = require("../../models/userSchema");
const otpCollection = require("../../models/otpSchema");
const sendotp = require('../../helper/sendOtp')
const passport = require('passport');



async function encryptPassword(password) {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
}

async function comparePassword(enteredPassword, storedPassword) {
    const isMatch = await bcrypt.compare(enteredPassword, storedPassword);
    return isMatch;
}






const loadSignup = async (req, res) => {
    try {
        if(req.session.loginSession || req.session.signupSession){
            return res.redirect("/")
        } else {
            const signErr =  req.session.signError
            res.render("signup",{signErr})
        }
    } catch (error){
        console.log(error)
        next(new AppError('Sorry...Something went wrong', 500));
    }
};

const loadSignin = async (req, res) => {
    try {
        if(req.session.loginSession || req.session.signupSession){
            return res.redirect("/")
        } else {
            const logErr = req.session.logError
            res.render("/signin",{logErr})
        } 
    } catch (error){
        console.log(error)
        next(new AppError('Sorry...Something went wrong', 500));
    }
};


const otpSend = async(req,res)=>{
    req.session.otpSession = true
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString()
    req.session.otpError = null
    req.session.otpTime = 75; 
    console.log(generatedOtp)
    console.log(req.session.user)
    sendotp(generatedOtp,req.session.user.email)
    console.log("wefsdfdfdf")
    const hashedOtp = await encryptPassword(generatedOtp)
    console.log("annnbuu")
    await otpCollection.updateOne({email:req.session.user.email},{$set:{otp:hashedOtp}},{upsert:true})
    console.log("eeeeee")
    req.session.otpStartTime = null
    res.redirect("/otp")
}


const otpPost = async(req,res)=>{
    const findOtp = await otpCollection.findOne({email:req.session.user.email})
    console.log(findOtp) 
    console.log(await comparePassword(req.body.otp,findOtp.otp))
    if(await comparePassword(req.body.otp,findOtp.otp)){
        console.log("Hii")
        const user = new usercollection({
            name: req.session.user.name,
            email: req.session.user.email,
            phone: req.session.user.phone,
            password: req.session.user.password,
            isActive: true
        });
        console.log(user)
        await user.save();
        console.log("rgbedrs")
        req.session.signupSession = true
        res.status(200).send({ ok: true });
    } else {
        res.status(200).send({ ok: false });
    }
}
















const loadAbout = async (req, res) => {
    try {
        return res.render("about");
    } catch (error) {
        console.log("About page not found");
        res.status(500).send("Server error");
    }
};

const loadShop = async (req, res) => {
    try {

        const page = parseInt(req.query.page) || 1;
        const limit = 6;
        const skip = (page - 1) * limit;

        const products = await Product.find({ isDeleted: false, isListed: true })
            .populate('category')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const categories = await Category.find({ isDeleted: false });



        const totalProducts = await Product.countDocuments({ isDeleted: false, isListed: true });
        const totalPages = Math.ceil(totalProducts / limit);

        const fixedProducts = products.map(product => {
            const fixedImages = product.productImage.map(img =>
                img.replace(/\\/g, '/').replace(/^public\//, '/')
            );
            return {
                ...product.toObject(),
                productImage: fixedImages
            };
        });

        res.render("shop", {
            products: fixedProducts,
            categories,
            currentPage: page,
            totalPages,
            totalProducts
        });
    } catch (error) {
        console.error('Error in loadShop:', error);
        res.render("shop", {
            error: 'Failed to load products',
            products: [],
            categories: [], 
            currentPage: 1,
            totalPages: 0,
            totalProducts: 0
        });
    }
};

const loadContact = async (req, res) => {
    try {
        return res.render("contact");
    } catch (error) {
        console.log("Contact page not found");
        res.status(500).send("Server error");
    }
};

const pageNotFound = async (req, res) => {
    try {
        res.render("page-404");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const loadHomepage = async (req, res) => {
    try {

        const categories = await Category.find({ isDeleted: false });


        res.render("home", {
            categories 
        });
    } catch (error) {
        console.error('Error in loadHomepage:', error);
        res.render("home", {
            error: 'Failed to load homepage',
            categories: [] 
        });
    }
};


const signinPost = async (req, res) => {
    try{
        const userData = await usercollection.findOne({ email: req.body.email });
        console.log("Hi1")
        if (userData) {
            console.log("Hi2")
            if (userData.password && await comparePassword(req.body.password,userData.password)) {
                console.log("Hi3")
              req.session.loginSession = true;
              req.session.user = {
                email:req.body.email
              }
             
              return res.status(200).send({ success: true })
            } else {
                return res.status(208).send({ success: false })
            }
          } else {
            return res.status(208).send({ success: false })
          }
    } catch (error) {
        console.log(error);
        next(new AppError('Sorry...Something went wrong', 500));
    }
};



const signupPost = async (req, res) => {
    try{

        const userExists = await usercollection.findOne({ email: req.body.email });
        if (userExists) {
            return res.status(409).send({ success: false });
        } else {
            const hashedPassword = await encryptPassword(req.body.password)
            const user = new usercollection({
                name: req.body.username,
                email: req.body.email,
                phone: req.body.phone,
                password: hashedPassword
            });
            req.session.user=user
            return res.status(200).send({ success: true });
        }
    } catch (error){
        console.error("Signup error:", error);
        next(new AppError('Sorry...Something went wrong', 500));
    }
};







const googleCallback=async (req, res) => {
    try {
      const user = await usercollection.findOneAndUpdate(
        { email: req.user._json.email},
        { $set: { name: req.user.displayName} },
        { upsert: true, new :true }
      );
      const userId = await usercollection.findOne({ email:req.user._json.email })
      const walletData = await wallet.updateOne(
        {userId: userId._id},
        {$set: {userId: userId._id} },
        {upsert:true, new :true});

      req.session.user = {
        email:req.user._json.email
      }
      // Set the user session
      req.session.loginSession = true
      // Redirect to the homepage
      res.redirect('/');
    } catch (err) {
      console.error(err);
      next(new AppError('Sorry...Something went wrong', 500));
    }
  } 


  const blockedUser = async(req,res)=>{
    const user = await usercollection.findOne({ email: req.session.user.email })
    if(user.isActive == false){
        return res.render("user/blockedUser")
    } else {
        return res.redirect("/")
    }
}










const loadSingleProduct = async (req, res) => {
    try {
        const productId = req.params.id;

        const product = await Product.findById(productId).populate('category');
        if (!product || product.isDeleted) {
            return res.status(404).render("user/page-404", { error: "Product not found" });
        }

        if (!Array.isArray(product.size)) {
            product.size = []; 
        }


        const relatedProducts = await Product.find({
            _id: { $ne: productId }, 
            category: product.category, 
            isDeleted: false,
            isListed: true
        }).limit(3);

        const fixedProduct = {
            ...product.toObject(),
            productImage: product.productImage.map(img =>
                img.replace(/\\/g, '/').replace(/^public\//, '/')
            )
        };

        const fixedRelatedProducts = relatedProducts.map(relatedProduct => {
            return {
                ...relatedProduct.toObject(),
                productImage: relatedProduct.productImage.map(img =>
                    img.replace(/\\/g, '/').replace(/^public\//, '/')
                )
            };
        });

        res.render("singleProduct", {
            product: fixedProduct,
            relatedProducts: fixedRelatedProducts
        });
    } catch (error) {
        console.error('Error in loadSingleProduct:', error);
        res.status(500).render("shop", { error: "Failed to load product" });
    }
};

const otpPage = async(req,res)=>{
    if(req.session.otpSession){
        const otpError = req.session.otpError
        // If OTP time isn't set, set it
        if (!req.session.otpStartTime) {
            req.session.otpStartTime = Date.now();
        }
        const elapsedTime = Math.floor((Date.now() - req.session.otpStartTime) / 1000);
        const remainingTime = Math.max(req.session.otpTime - elapsedTime, 0);
        return res.render("otp",{otpError:otpError,time:remainingTime})
    } else {
        return res.redirect("/signin")
    }
} 



const logout = async(req,res)=>{
    req.session.loginSession = null
    req.session.signupSession = null
    req.session.user = null
    req.session.logError = null
    req.session.signError = null
    req.session.otp = null
    req.session.otpError = null
    req.session.checkOne = null
    req.session.firstName = null
    req.session.lastName = null
    req.session.phone = null
    req.session.email = null
    req.session.addressId = null
    req.session.doorNums = null
    req.session.street = null
    req.session.city = null
    req.session.district = null
    req.session.postcode = null
    return res.redirect('/')
}










module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignup,
    loadSignin,
    loadContact,
    loadShop,
    loadAbout,
    signinPost,
    signupPost,
    loadSingleProduct,
    logout,
    blockedUser,
    googleCallback,
    otpSend,
    otpPost,
    otpPage




};