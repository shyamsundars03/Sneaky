const Product = require('../../models/productSchema'); 
const Category = require('../../models/categorySchema');
const Offer = require('../../models/offerSchema');
const bcrypt = require('bcrypt')
const usercollection = require("../../models/userSchema");
const otpCollection = require("../../models/otpSchema");
const sendotp = require('../../helper/sendOtp')
const passport = require('passport');
const { generateReferralCode, applyReferralBonus } = require('../../services/referralService');
const User = require('../../models/userSchema');

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
        if(req.session.loginSession ){
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
        // sessionn started
        if(req.session.loginSession ){
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
    try {
        if (!req.session.tempUser || !req.session.tempUser.isSignupFlow) {
            return res.status(400).json({ error: "Invalid signup flow" });
        }

        const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
        req.session.otpTime = 75; 
        req.session.otpStartTime = Date.now();

        await sendotp(generatedOtp, req.session.tempUser.email);
        
        sendotp(generatedOtp, req.session.tempUser .email).catch(err => {
            console.error("Error sending OTP:", err);
        });


        const hashedOtp = await encryptPassword(generatedOtp);
        await otpCollection.updateOne(
            { email: req.session.tempUser.email },
            { 
                $set: { 
                    otp: hashedOtp, 
                    expiresAt: new Date(Date.now() + 75 * 1000),
                    purpose: 'signup'  
                } 
            },
            { upsert: true }
        );

        res.redirect("/otp");
    } catch (error) {
        console.error("Error in otpSend:", error);
        res.status(500).json({ error: "Failed to send OTP" });
    }
};

const otpPost = async (req, res) => {
    try {

        if (!req.session.tempUser || !req.session.tempUser.email) {
            return res.status(400).json({ 
                ok: false,
                error: "Session expired or user not logged in" 
            });
        }

 
        const findOtp = await otpCollection.findOne({ 
            email: req.session.tempUser.email 
        });

        if (!findOtp) {
            return res.status(400).json({ 
                ok: false,
                error: "OTP not found" 
            });
        }


        if (findOtp.expiresAt < new Date()) {
            return res.status(400).json({ 
                ok: false,
                error: "OTP has expired" 
            });
        }

        const isOtpValid = await comparePassword(req.body.otp, findOtp.otp);
        if (!isOtpValid) {
            return res.status(400).json({ 
                ok: false,
                error: "Invalid OTP" 
            });
        }

  
        const userExists = await usercollection.findOne({ 
            email: req.session.tempUser.email 
        });
        if (userExists) {
            return res.status(409).json({ 
                ok: false,
                error: "User already exists" 
            });
        }

  
        const newUser = new usercollection({
            name: req.session.tempUser.name,
            email: req.session.tempUser.email,
            phone: req.session.tempUser.phone,
            password: req.session.tempUser.password,
            referralCode: req.session.tempUser.referralCode,
            referredBy: req.session.tempUser.referredBy,
            isActive: true
        });

        await newUser.save();

       
        if (req.session.tempUser.referredBy) {
            const referrer = await usercollection.findOne({ 
                referralCode: req.session.tempUser.referredBy 
            });
            if (referrer) {
                referrer.wallet.balance += 50;
                referrer.wallet.transactions.push({
                    type: 'referral',
                    amount: 50,
                    description: `Referral bonus for ${req.session.tempUser.email}`,
                    date: new Date()
                });
                referrer.referralCount += 1;
                await referrer.save();
            }
        }

        await otpCollection.deleteMany({ email: req.session.tempUser.email });
        delete req.session.tempUser;

        req.session.user = {
            _id: newUser._id,
            name: newUser.name,
            email: newUser.email
        };
        req.session.loginSession = true;

        return res.status(200).json({ 
            ok: true 
        });

    } catch (error) {
        console.error("Error in otpPost:", error);
        
        if (error.code === 11000) {
            return res.status(409).json({ 
                ok: false,
                error: "User already exists" 
            });
        }
        
        return res.status(500).json({ 
            ok: false,
            error: "An error occurred during OTP verification" 
        });
    }
};


const signinPost = async (req, res) => {
    try {
        const { email, password } = req.body;


        const user = await usercollection.findOne({ email });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }


        if (!user.isActive) {
            return res.status(403).json({ success: false, message: "You have been blocked." });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: "Invalid password." });
        }


        req.session.user = {
            _id: user._id,
            email: user.email,
            name: user.name,
        };

        console.log("Session after login:", req.session.user); 

        res.status(200).json({ success: true, message: "Login successful!" });
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
};



const signupPost = async (req, res) => {
    try {
 
        const userExists = await usercollection.findOne({ email: req.body.email });
        if (userExists) {
            return res.status(409).json({ 
                success: false,
                error: 'User already exists. Please sign in.'
            });
        }

        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const referralCode = await generateReferralCode();

 
        req.session.tempUser = {
            name: req.body.username,
            email: req.body.email,
            phone: req.body.phone,
            password: hashedPassword,
            referralCode: referralCode,
            referredBy: req.body.referralCode || null,
            isSignupFlow: true  
        };

        req.session.otpSession = true;
        req.session.otpError = null;

        return res.status(200).json({ 
            success: true,
            redirect: '/otpsend'
        });

    } catch (error) {
        console.error("Signup error:", error);
        return res.status(500).json({ 
            success: false,
            error: 'Something went wrong during signup'
        });
    }
};



const googleCallback = async (req, res) => {
    try {
        if (!req.user) return res.redirect('/signin');
        
  
        req.session.user = {
            _id: req.user._id,
            name: req.user.name,
            email: req.user.email
        };
        req.session.loginSession = true;
        
 
        if (req.session.referralCode) {
            delete req.session.referralCode;
        }
        
        res.redirect('/');
    } catch (error) {
        console.error('Google callback error:', error);
        res.redirect('/signin');
    }
};


const blockedUser = async (req, res) => {
    try {
        if (!req.session.user || !req.session.user.email) {
            return res.redirect('/signin'); 
        }

        const user = await usercollection.findOne({ email: req.session.user.email });
        if (user && user.isActive === false) {
           
        req.session.loginSession = false;
 
        req.session.user = null;

        res.redirect('/signin');
        } else {
            return res.redirect("/"); 
        }
    } catch (error) {
        console.error("Error in blockedUser:", error);
        res.status(500).send("Internal Server Error");
    }
};


const resendOtp = async (req, res) => {
    try {

        if (!req.session.tempUser || !req.session.tempUser.email) {
            return res.status(400).json({ success: false, message: "User data not found in session." });
        }

        const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
        req.session.otpStartTime = Date.now(); 
        sendotp(generatedOtp, req.session.tempUser.email);
        const hashedOtp = await encryptPassword(generatedOtp);
        await otpCollection.updateOne(
            { email: req.session.tempUser.email },
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


const calculateFinalPrice = (product, activeOffers) => {

    const productObj = product.toObject ? product.toObject() : product;
    
    let finalPrice = productObj.offerPrice;
    let hasCategoryOffer = false;
    let categoryDiscount = 0;

    // active category offer
    const categoryOffer = activeOffers.find(offer => 
        offer.category._id.toString() === productObj.category._id.toString()
    );

    if (categoryOffer) {
        const categoryOfferPrice = Math.round(productObj.price * (1 - categoryOffer.discountPercentage/100));
        if (categoryOfferPrice < finalPrice) {
            finalPrice = categoryOfferPrice;
            hasCategoryOffer = true;
            categoryDiscount = categoryOffer.discountPercentage;
        }
    }

    return {
        ...productObj,
        finalPrice,
        hasCategoryOffer,
        categoryDiscount
    };
};

const loadShop = async (req, res) => {
    try {

        const isAjax = req.xhr || 
        req.headers['x-requested-with'] === 'XMLHttpRequest' || 
        req.headers.accept?.includes('application/json');

        // Extract query parameters
        const page = parseInt(req.query.page) || 1;
        const limit = 6;
        const skip = (page - 1) * limit;

        const categoryIds = req.query.category ? req.query.category.split(',') : 
                         (req.body.category || []);
        const selectedSizes = req.query.size ? req.query.size.split(',') : 
                           (req.body.size || []);
        const minPrice = parseFloat(req.query.minPrice || req.body.minPrice);
        const maxPrice = parseFloat(req.query.maxPrice || req.body.maxPrice);
        const searchTerm = req.query.search || req.body.search || '';
        const sortOption = req.query.sort || req.body.sort || 'bestMatch';
        
        const searchQuery = {
            isDeleted: false,
            isListed: true
        };


        if (categoryIds.length > 0) {
            searchQuery.category = { $in: categoryIds };
        }

   
        if (selectedSizes.length > 0) {
            searchQuery['sizes.size'] = { $in: selectedSizes };
        }

  
        if (searchTerm) {
            searchQuery.productName = { $regex: searchTerm, $options: 'i' };
        }

 
        const currentDate = new Date();
        const activeOffers = await Offer.find({
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate }
        }).populate('category');

 
        let products = await Product.find(searchQuery)
            .populate('category')
            .lean();

 
        products = products.map(product => 
            calculateFinalPrice(product, activeOffers)
        );

     
        if (!isNaN(minPrice)) {
            products = products.filter(p => p.finalPrice >= minPrice);
        }
        if (!isNaN(maxPrice)) {
            products = products.filter(p => p.finalPrice <= maxPrice);
        }

        switch (sortOption) {
            case 'nameAsc':
                products.sort((a, b) => a.productName.localeCompare(b.productName));
                break;
            case 'nameDesc':
                products.sort((a, b) => b.productName.localeCompare(a.productName));
                break;
            case 'priceLow':
                products.sort((a, b) => a.finalPrice - b.finalPrice);
                break;
            case 'priceHigh':
                products.sort((a, b) => b.finalPrice - a.finalPrice);
                break;
            default:
                products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }


        const totalProducts = products.length;
        const totalPages = Math.ceil(totalProducts / limit);

        const paginatedProducts = products.slice(skip, skip + limit);

     
        const fixedProducts = paginatedProducts.map(product => {
            const fixedImages = product.productImage.map(img => {
                // valid image path
                if (!img) return '/images/placeholder.jpg';
                
                // relative and absolute path
                if (img.startsWith('http')) return img;
                return img.replace(/\\/g, '/').replace(/^public\//, '/');
            });
            
            return {
                ...product,
                productImage: fixedImages
            };
        });

        //  response data obj
        const responseData = {
            success: true,
            products: fixedProducts,
            currentPage: page,
            totalPages,
            totalProducts,
            queryParams: {
                category: categoryIds,
                size: selectedSizes,
                minPrice: minPrice || '',
                maxPrice: maxPrice || '',
                search: searchTerm,
                sort: sortOption
            }
        };


        if (isAjax) {
            return res.json(responseData);
        }

   
        const categories = await Category.find({ isDeleted: false });
        
        res.render("shop", {
            ...responseData,
            categories,
            user: req.session.user,
            buildQueryString: (params) => {
                const searchParams = new URLSearchParams();
                for (const [key, value] of Object.entries(params)) {
                    if (value !== undefined && value !== null && value !== '') {
                        if (Array.isArray(value)) {
                            value.forEach(v => searchParams.append(key, v));
                        } else {
                            searchParams.set(key, value);
                        }
                    }
                }
                return searchParams.toString();
            },
            selectedCategory: categoryIds,
            selectedSizes: selectedSizes,
            minPrice: minPrice || '',
            maxPrice: maxPrice || '',
            searchTerm: searchTerm || '',
            sortOption
        });

    } catch (error) {
        console.error('Error in loadShop:', error);
        
    
       if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(500).json({ 
                success: false,
                error: 'Failed to load products',
                message: error.message || 'Unknown error'
            });
        }
        
        res.render("shop", {
            error: 'Failed to load products',
            products: [],
            categories: [],
            currentPage: 1,
            totalPages: 0,
            totalProducts: 0,
            user: req.session.user,
            buildQueryString: () => '',
            queryParams: {},
            selectedCategory: [],
            selectedSizes: [],
            minPrice: '',
            maxPrice: '',
            searchTerm: '',
            sortOption: 'bestMatch'
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

        let product = await Product.findById(productId).populate('category');
        if (!product || product.isDeleted) {
            return res.status(404).render("user/page-404", { 
                error: "Product not found", 
                user: req.session.user,
                
            });
        }

        if (!Array.isArray(product.size)) {
            product.size = []; 
        }

 // active offers
 const currentDate = new Date();
 const activeOffers = await Offer.find({
     startDate: { $lte: currentDate },
     endDate: { $gte: currentDate }
 }).populate('category');

 // final price
 product = calculateFinalPrice(product, activeOffers);

        // related products
        let relatedProducts = await Product.find({
            _id: { $ne: productId },
            category: product.category._id, 
            isDeleted: false,
            isListed: true
        }).populate('category').limit(4); 

        // final prices for related products
        relatedProducts = relatedProducts.map(relatedProduct => 
            calculateFinalPrice(relatedProduct, activeOffers)
        );


 const fixedProduct = {
    ...product,
    productImage: product.productImage.map(img =>
        img.replace(/\\/g, '/').replace(/^public\//, '/')
    )
};

const fixedRelatedProducts = relatedProducts.map(relatedProduct => {
    return {
        ...relatedProduct,
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
        res.status(500).render("shop", { 
            error: "Failed to load product", 
            user: req.session.user,
            searchTerm: '' 
        });
    }
};


const logout = async (req, res) => {
    try {
     
        req.session.loginSession = false;

        req.session.user = null;

        res.redirect('/');
    } catch (error) {
        console.error("Error in logout:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
};


const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await usercollection.findOne({ email });

        if (!user) {
            return res.status(404).json({ success: false, message: "User  not found." });
        }

        req.session.user = { email: user.email };
        const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
        req.session.otpSession = true;
        req.session.otpError = null;
        req.session.otpTime = 75;
        req.session.otpStartTime = Date.now();

        sendotp(generatedOtp, user.email);
        const hashedOtp = await encryptPassword(generatedOtp);
        await otpCollection.updateOne(
            { email: user.email },
            { $set: { otp: hashedOtp, expiresAt: new Date(Date.now() + 75 * 1000) } },
            { upsert: true }
        );

        res.status(200).json({ success: true, message: "OTP sent successfully." });
    } catch (error) {
        console.error("Error in forgotPassword:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
};


const loadChangeEmail = async (req, res) => {
    try {
        res.render("change-email", { user: req.session.user });
    } catch (error) {
        console.error("Error in loadChangeEmail:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
};

const changeEmail = async (req, res) => {
    try {
        const { newEmail } = req.body;
        const user = await usercollection.findOne({ email: req.session.user.email });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        const emailExists = await usercollection.findOne({ email: newEmail });
        if (emailExists) {
            return res.status(409).json({ success: false, message: "Email already in use." });
        }

        const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
        req.session.otpSession = true;
        req.session.otpError = null;
        req.session.otpTime = 75;
        req.session.otpStartTime = Date.now();


        sendotp(generatedOtp, newEmail);
        const hashedOtp = await encryptPassword(generatedOtp);
        await otpCollection.updateOne(
            { email: newEmail },
            { $set: { otp: hashedOtp, expiresAt: new Date(Date.now() + 75 * 1000) } },
            { upsert: true }
        );

        req.session.tempEmail = newEmail;

        res.status(200).json({ success: true, message: "OTP sent successfully.", redirectUrl: `/verify-otp?scenario=change-email` });
    } catch (error) {
        console.error("Error in changeEmail:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
};

const loadChangePassword = async (req, res) => {
    try {
        res.render("change-password", { user: req.session.user });
    } catch (error) {
        console.error("Error in loadChangePassword:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
};

const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = await usercollection.findOne({ email: req.session.user.email });

        if (!user) {
            return res.status(404).json({ success: false, message: "User  not found." });
        }

        // Verify the old password
        const isOldPasswordValid = await comparePassword(oldPassword, user.password);
        if (!isOldPasswordValid) {
            return res.status(400).json({ success: false, message: "Old password is incorrect." });
        }

        // Update the password
        const hashedNewPassword = await encryptPassword(newPassword);
        await usercollection.updateOne(
            { email: req.session.user.email },
            { $set: { password: hashedNewPassword } }
        );

        res.status(200).json({ success: true, message: "Password updated successfully." });
    } catch (error) {
        console.error("Error in changePassword:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
};

const verifyOtp2 = async (req, res) => {
    try {
        const { otp } = req.body;
        const email = req.session.tempEmail || req.session.user.email; // Handle both scenarios
        const findOtp = await otpCollection.findOne({ email });

        if (!findOtp || findOtp.expiresAt < new Date()) {
            return res.status(400).json({ success: false, message: "OTP has expired." });
        }

        const isOtpValid = await comparePassword(otp, findOtp.otp);

        if (!isOtpValid) {
            return res.status(400).json({ success: false, message: "Invalid OTP." });
        }

        // Handle change email scenario
        if (req.session.tempEmail) {
            await usercollection.updateOne(
                { email: req.session.user.email },
                { $set: { email: req.session.tempEmail } }
            );
            req.session.user.email = req.session.tempEmail; // Update session email
            delete req.session.tempEmail;
            return res.status(200).json({ success: true, message: "Email updated successfully." });
        }

        // Handle forgot password scenario
        res.status(200).json({ success: true, message: "OTP verified successfully." });
    } catch (error) {
        console.error("Error in verifyOtp2:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { newPassword, confirmPassword } = req.body;

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: "Passwords do not match." });
        }

        const hashedPassword = await encryptPassword(newPassword);
        await usercollection.updateOne(
            { email: req.session.user.email },
            { $set: { password: hashedPassword } }
        );

        req.session.destroy();
        res.status(200).json({ success: true, message: "Password reset successfully." });
    } catch (error) {
        console.error("Error in resetPassword:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
};


const loadForgotPassword = async (req, res) => {
    try {

        res.render("forgot-password"); 

    } catch (error){
        console.log(error)
        next(new AppError('Sorry...Something went wrong', 500));
    }
};
const loadVerifyotp2 = async (req, res) => {
    try {
        const scenario = req.query.scenario || 'forgot-password'; // Default to 'forgot-password' if scenario is not provided

        // Calculate remaining time
        const otpStartTime = req.session.otpStartTime || Date.now();
        const elapsedTime = Math.floor((Date.now() - otpStartTime) / 1000);
        const remainingTime = Math.max(req.session.otpTime - elapsedTime, 0);

        res.render("otp2", { scenario, remainingTime, user: req.session.user });
    } catch (error) {
        console.error("Error in loadVerifyotp2:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
};

const loadResetPassword = async (req, res) => {
    try {

        res.render("reset-password"); 

    } catch (error){
        console.log(error)
        next(new AppError('Sorry...Something went wrong', 500));
    }
};

const otp2Time = (req, res) => {
    try {
        if (req.session.otpStartTime) {
            const elapsedTime = Math.floor((Date.now() - req.session.otpStartTime) / 1000);
            const remainingTime = Math.max(req.session.otpTime - elapsedTime, 0);
            res.status(200).json({ success: true, remainingTime });
        } else {
            res.status(200).json({ success: true, remainingTime: 0 });
        }
        console.log("otp2Time used");
    } catch (error) {
        console.error("Error in otp2Time:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const resendOtp2 = async (req, res) => {
    try {
        const email = req.session.tempEmail || req.session.user.email; // Handle both scenarios
        if (!email) {
            return res.status(400).json({ success: false, message: "User  data not found in session." });
        }

        const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
        req.session.otpStartTime = Date.now(); // Update the start time in session
        sendotp(generatedOtp, email); // Ensure this function is working correctly
        const hashedOtp = await encryptPassword(generatedOtp);
        await otpCollection.updateOne(
            { email },
            { $set: { otp: hashedOtp, expiresAt: new Date(Date.now() + 75 * 1000) } },
            { upsert: true }
        );

        res.status(200).json({ success: true, message: "OTP resent successfully." });
    } catch (error) {
        console.error("Error in resendOtp2:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
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
    resendOtp2,
    otpTime,
    otp2Time,
    forgotPassword,
    resetPassword,
    verifyOtp2,
    loadForgotPassword,
    loadResetPassword,
    loadVerifyotp2,
    loadChangeEmail,
    changeEmail,
    changePassword,
    loadChangePassword,



   

};