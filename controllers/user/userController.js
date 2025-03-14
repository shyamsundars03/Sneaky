const Product = require('../../models/productSchema'); 
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
            res.render("signup", { signErr, user: req.session.user }); 
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
            res.render("signin", { logErr, user: req.session.user }); 
        } 
    } catch (error){
        console.log(error)
        next(new AppError('Sorry...Something went wrong', 500));
    }
};


const otpSend = async (req, res) => {
    req.session.otpSession = true;
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    req.session.otpError = null;
    req.session.otpTime = 75; 
    req.session.otpStartTime = Date.now(); 
    // console.log(generatedOtp);
    console.log("otpSend used");
    // console.log(req.session.user);
    sendotp(generatedOtp, req.session.user.email);
    const hashedOtp = await encryptPassword(generatedOtp);
    await otpCollection.updateOne(
        { email: req.session.user.email },
        { $set: { otp: hashedOtp, expiresAt: new Date(Date.now() + 75 * 1000) } }, 
        { upsert: true }
    );
    res.redirect("/otp");
};


const otpPost = async (req, res) => {
    try {
        console.log("Session User:", req.session.user);

        if (!req.session.user || !req.session.user.email) {
            return res.status(400).json({ error: "Session expired or user not logged in" });
        }

        const findOtp = await otpCollection.findOne({ email: req.session.user.email });
        // console.log(findOtp);

        if (!findOtp) {
            return res.status(400).json({ error: "OTP not found" });
        }


        if (findOtp.expiresAt < new Date()) {
            return res.status(400).json({ error: "OTP has expired" });
        }

        const isOtpValid = await comparePassword(req.body.otp, findOtp.otp);
        // console.log(isOtpValid);

        if (isOtpValid) {
            // console.log("Hii");


            const userData = new usercollection({
                name: req.session.user.name,
                email: req.session.user.email,
                phone: req.session.user.phone,
                password: req.session.user.password,
                isActive: true,
            });


            const user = new usercollection(userData);
            console.log("otpPost used");
            await user.save();
            console.log("user saved");


            req.session.user = {
                name: user.name,
                email: user.email,
            };
            req.session.signupSession = true;
            res.status(200).send({ ok: true });
        } else {
            res.status(200).send({ ok: false });
        }
    } catch (error) {
        console.error("Error in otpPost:", error);
        res.status(500).json({ error: "An error occurred during OTP verification." });
    }
};


const signinPost = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find the user by email
        const user = await usercollection.findOne({ email });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        // Check if the password matches
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: "Invalid password." });
        }

        // Set the user session
        req.session.user = {
            _id: user._id,
            email: user.email,
            name: user.name,
        };

        console.log("Session after login:", req.session.user); // Debug log

        res.status(200).json({ success: true, message: "Login successful!" });
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
};



const signupPost = async (req, res) => {
    try{

        const userExists = await usercollection.findOne({ email: req.body.email });
        if (userExists) {
            return res.status(409).send({ success: false });
        } else {
            const hashedPassword = await encryptPassword(req.body.password)
            const user = {
                name: req.body.username,
                email: req.body.email,
                phone: req.body.phone,
                password: hashedPassword,
            };


            req.session.user=user
            return res.status(200).send({ success: true });
        }
    } catch (error){
        console.error("Signup error:", error);
        next(new AppError('Sorry...Something went wrong', 500));
    }
};






const googleCallback = async (req, res, next) => {
    try {

        if (!req.user) {
            return res.redirect('/signin?error=Google authentication failed.');
        }

        req.session.user = {
            name: req.user.name,
            email: req.user.email,
        };
        req.session.loginSession = true;

        res.redirect('/');
    } catch (err) {
        console.error("Error in googleCallback:", err);
        next(new AppError('Sorry...Something went wrong', 500));
    }
};


const blockedUser = async (req, res) => {
    try {
        if (!req.session.user || !req.session.user.email) {
            return res.redirect('/signin'); // Redirect to signin if no session exists
        }

        const user = await usercollection.findOne({ email: req.session.user.email });
        if (user && user.isActive === false) {
           
        req.session.loginSession = false;

        
        req.session.user = null;

       
        res.redirect('/signin');
        } else {
            return res.redirect("/"); // Redirect to home if the user is not blocked
        }
    } catch (error) {
        console.error("Error in blockedUser:", error);
        res.status(500).send("Internal Server Error");
    }
};


const resendOtp = async (req, res) => {
    try {
        const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
        req.session.otpStartTime = Date.now(); 
        sendotp(generatedOtp, req.session.user.email);
        const hashedOtp = await encryptPassword(generatedOtp);
        await otpCollection.updateOne(
            { email: req.session.user.email },
            { $set: { otp: hashedOtp, expiresAt: new Date(Date.now() + 75 * 1000) } },
            { upsert: true }
        );
        console.log("resendOTP used");
        res.json({ success: true });
    } catch (error) {
        console.error("Error in resendOtp:", error);
        res.status(500).json({ success: false });
    }
};

const otpPage = async(req,res)=>{
    if(req.session.otpSession){
        const otpError = req.session.otpError

        if (!req.session.otpStartTime) {
            req.session.otpStartTime = Date.now();
        }
        const elapsedTime = Math.floor((Date.now() - req.session.otpStartTime) / 1000);
        const remainingTime = Math.max(req.session.otpTime - elapsedTime, 0);
        console.log("otpPage used");
        return res.render("otp",{otpError:otpError,time:remainingTime, user: req.session.user})
    } else {
        return res.redirect("/signin")
    }
} 

const otpTime = (req, res) => {
    try {
        if (req.session.otpStartTime) {
            const elapsedTime = Math.floor((Date.now() - req.session.otpStartTime) / 1000);
            const remainingTime = Math.max(req.session.otpTime - elapsedTime, 0);
            res.status(200).json({ success: true, remainingTime });
        } else {
            res.status(200).json({ success: true, remainingTime: 0 });
        }
        console.log("otptime used");
    } catch (error) {
        console.error("Error in otpTime:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const loadAbout = async (req, res) => {
    try {
        return res.render("about", { user: req.session.user }); 
    } catch (error) {
        console.log("About page not found");
        res.status(500).send("Server error");
    }
};

const loadShop = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; // Get the page number from the query parameter
        const limit = 6; // Number of products per page
        const skip = (page - 1) * limit; // Calculate the number of documents to skip
        const categoryId = req.query.category; // Get the category ID from the query parameter

        // Build the search query
        const searchQuery = {
            isDeleted: false,
            isListed: true,
            ...(categoryId && { category: categoryId }) // Add category filter if categoryId exists
        };

        // Fetch products based on the search query
        const products = await Product.find(searchQuery)
            .populate('category')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        // Fetch all categories for the sidebar
        const categories = await Category.find({ isDeleted: false });

        // Count total products matching the search query
        const totalProducts = await Product.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalProducts / limit);

        // Fix image paths for the products
        const fixedProducts = products.map(product => {
            const fixedImages = product.productImage.map(img =>
                img.replace(/\\/g, '/').replace(/^public\//, '/')
            );
            return {
                ...product.toObject(),
                productImage: fixedImages
            };
        });

        // Render the shop page with the filtered products and other data
        res.render("shop", {
            products: fixedProducts,
            categories,
            currentPage: page,
            totalPages,
            totalProducts,
            selectedCategory: categoryId, // Pass the selected category ID to the view
            user: req.session.user,
        });
    } catch (error) {
        console.error('Error in loadShop:', error);
        res.render("shop", {
            error: 'Failed to load products',
            products: [],
            categories: [],
            currentPage: 1,
            totalPages: 0,
            totalProducts: 0,
            selectedCategory: null, // No category selected in case of an error
            user: req.session.user,
        });
    }
};

const loadContact = async (req, res) => {
    try {
        return res.render("contact", { user: req.session.user }); 
    } catch (error) {
        console.log("Contact page not found");
        res.status(500).send("Server error");
    }
};

const pageNotFound = async (req, res) => {
    try {
        res.render("page-404", { user: req.session.user });
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const loadHomepage = async (req, res) => {
    try {

        const categories = await Category.find({ isListed: true  });


        res.render("home", {
            categories,
            user: req.session.user, 
        });
    } catch (error) {
        console.error('Error in loadHomepage:', error);
        res.render("home", {
            error: 'Failed to load homepage',
            categories: [] ,
            user: req.session.user, 
        });
    }
};


const loadSingleProduct = async (req, res) => {
    try {
        const productId = req.params.id;

        const product = await Product.findById(productId).populate('category');
        if (!product || product.isDeleted) {
            return res.status(404).render("user/page-404", { error: "Product not found", user: req.session.user  });
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
            relatedProducts: fixedRelatedProducts,
            user: req.session.user,
        });
    } catch (error) {
        console.error('Error in loadSingleProduct:', error);
        res.status(500).render("shop", { error: "Failed to load product", user: req.session.user });
    }
};


const logout = async (req, res) => {
    try {
        // Set loginSession to false instead of destroying the session
        req.session.loginSession = false;

        // Optionally, you can also clear the user data from the session
        req.session.user = null;

        // Redirect to the home page
        res.redirect('/');
    } catch (error) {
        console.error("Error in logout:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
};







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
    otpPage,
    resendOtp,
    otpTime

};