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
        // || req.session.signupSession
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
        
        console.log("otpSend used");
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
                    purpose: 'signup'  // Track OTP purpose
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
        console.log("Session User:", req.session.user);

        // Check if we have a temp user (signup flow)
        if (!req.session.tempUser || !req.session.tempUser.email) {
            return res.status(400).json({ 
                ok: false,
                error: "Session expired or user not logged in" 
            });
        }

        // Find the OTP record
        const findOtp = await otpCollection.findOne({ 
            email: req.session.tempUser.email 
        });

        if (!findOtp) {
            return res.status(400).json({ 
                ok: false,
                error: "OTP not found" 
            });
        }

        // Check OTP expiration
        if (findOtp.expiresAt < new Date()) {
            return res.status(400).json({ 
                ok: false,
                error: "OTP has expired" 
            });
        }

        // Validate OTP
        const isOtpValid = await comparePassword(req.body.otp, findOtp.otp);
        if (!isOtpValid) {
            return res.status(400).json({ 
                ok: false,
                error: "Invalid OTP" 
            });
        }

        // Final check if user already exists
        const userExists = await usercollection.findOne({ 
            email: req.session.tempUser.email 
        });
        if (userExists) {
            return res.status(409).json({ 
                ok: false,
                error: "User already exists" 
            });
        }

        // Create new user
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

        // Handle referral bonus if applicable
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

        // Clean up
        await otpCollection.deleteMany({ email: req.session.tempUser.email });
        delete req.session.tempUser;

        // Set user session
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

        // Find the user by email
        const user = await usercollection.findOne({ email });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }


        if (!user.isActive) {
            return res.status(403).json({ success: false, message: "You have been blocked." });
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
    try {
        // Check if user already exists
        const userExists = await usercollection.findOne({ email: req.body.email });
        if (userExists) {
            return res.status(409).json({ 
                success: false,
                error: 'User already exists. Please sign in.'
            });
        }

        // Hash password and generate referral code
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const referralCode = await generateReferralCode();

        // Store ALL signup data in session
        req.session.tempUser = {
            name: req.body.username,
            email: req.body.email,
            phone: req.body.phone,
            password: hashedPassword,
            referralCode: referralCode,
            referredBy: req.body.referralCode || null,
            isSignupFlow: true  // Flag to identify signup flow
        };

        // Initialize OTP session
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



// controllers/user/userController.js - Fixed googleCallback
const googleCallback = async (req, res) => {
    try {
        console.log('Google callback controller executing');
        
        if (!req.user) {
            console.log('No user in request - redirecting to signin');
            return res.redirect('/signin');
        }
        
        console.log('Google user authenticated:', req.user.email);
        console.log('User data:', JSON.stringify({
            id: req.user._id,
            email: req.user.email,
            referralCode: req.user.referralCode,
            referredBy: req.user.referredBy
        }));
        
        // Process referral bonus if user was referred
        if (req.user.referredBy && !req.user.referralBonusApplied) {
            console.log('Processing referral bonus for:', req.user.referredBy);
            
            // Find referrer
            const referrer = await User.findOne({ referralCode: req.user.referredBy });
            
            if (referrer) {
                console.log('Found referrer:', referrer.email);
                
                // Initialize wallet if it doesn't exist
                if (!referrer.wallet) {
                    referrer.wallet = { balance: 0, transactions: [] };
                }
                
                // Add bonus to referrer's wallet
                referrer.wallet.balance += 50;
                referrer.wallet.transactions.push({
                    type: 'referral',
                    amount: 50,
                    description: `Referral bonus for ${req.user.email}`,
                    date: new Date()
                });
                referrer.referralCount = (referrer.referralCount || 0) + 1;
                await referrer.save();
                
                console.log('Added referral bonus to referrer wallet');
                
                // Initialize user's wallet if it doesn't exist
                if (!req.user.wallet) {
                    req.user.wallet = { balance: 0, transactions: [] };
                }
                
                // Add bonus to new user's wallet
                req.user.wallet.balance += 50;
                req.user.wallet.transactions.push({
                    type: 'referral',
                    amount: 50,
                    description: 'Welcome bonus from referral',
                    date: new Date()
                });
                req.user.referralBonusApplied = true;
                await req.user.save();
                
                console.log('Added welcome bonus to new user wallet');
            }
        }
        
        // Set session for authentication
        req.session.user = {
            _id: req.user._id,
            name: req.user.name,
            email: req.user.email
        };
        req.session.loginSession = true;
        
        console.log('Google auth complete - redirecting to home');
        res.redirect('/');
    } catch (error) {
        console.error('Error in Google callback:', error);
        res.redirect('/signin');
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


// Helper function to calculate final price
const calculateFinalPrice = (product, activeOffers) => {
    // Convert to plain object if it's a Mongoose document
    const productObj = product.toObject ? product.toObject() : product;
    
    let finalPrice = productObj.offerPrice;
    let hasCategoryOffer = false;
    let categoryDiscount = 0;

    // Check for active category offer
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
        // Extract query parameters
        const page = parseInt(req.query.page) || 1;
        const limit = 6;
        const skip = (page - 1) * limit;
        
        // Filtering parameters (support both GET and POST for AJAX)
        const categoryIds = req.query.category ? req.query.category.split(',') : 
                         (req.body.category || []);
        const selectedSizes = req.query.size ? req.query.size.split(',') : 
                           (req.body.size || []);
        const minPrice = parseFloat(req.query.minPrice || req.body.minPrice);
        const maxPrice = parseFloat(req.query.maxPrice || req.body.maxPrice);
        const searchTerm = req.query.search || req.body.search || '';
        const sortOption = req.query.sort || req.body.sort || 'bestMatch';
        const currentPage = req.query.page || req.body.page || 1;

        // Build the initial search query
        const searchQuery = {
            isDeleted: false,
            isListed: true
        };

        // Add category filter
        if (categoryIds.length > 0) {
            searchQuery.category = { $in: categoryIds };
        }

        // Add size filter
        if (selectedSizes.length > 0) {
            searchQuery['sizes.size'] = { $in: selectedSizes };
        }

        // Add search term filter
        if (searchTerm) {
            searchQuery.productName = { $regex: searchTerm, $options: 'i' };
        }

        // Get active offers
        const currentDate = new Date();
        const activeOffers = await Offer.find({
            startDate: { $lte: currentDate },
            endDate: { $gte: currentDate }
        }).populate('category');

        // First get all products matching the non-price filters
        let products = await Product.find(searchQuery)
            .populate('category')
            .lean();

        // Calculate final prices for all products
        products = products.map(product => 
            calculateFinalPrice(product, activeOffers)
        );

        // Apply price filtering based on finalPrice
        if (!isNaN(minPrice)) {
            products = products.filter(p => p.finalPrice >= minPrice);
        }
        if (!isNaN(maxPrice)) {
            products = products.filter(p => p.finalPrice <= maxPrice);
        }

        // Apply sorting
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

        // Get total count after all filtering
        const totalProducts = products.length;
        const totalPages = Math.ceil(totalProducts / limit);

        // Apply pagination
        const paginatedProducts = products.slice(skip, skip + limit);

        // Fix image paths
        const fixedProducts = paginatedProducts.map(product => {
            const fixedImages = product.productImage.map(img =>
                img.replace(/\\/g, '/').replace(/^public\//, '/')
            );
            return {
                ...product,
                productImage: fixedImages
            };
        });

        // Prepare response data
        const responseData = {
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

        // Handle AJAX requests
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.json(responseData);
        }

        // Regular request - render full page
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
        
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(500).json({ 
                error: 'Failed to load products',
                products: [],
                totalProducts: 0
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
            queryParams: {}
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
                searchTerm: '' // Add this
            });
        }

        if (!Array.isArray(product.size)) {
            product.size = []; 
        }

 // Get active offers
 const currentDate = new Date();
 const activeOffers = await Offer.find({
     startDate: { $lte: currentDate },
     endDate: { $gte: currentDate }
 }).populate('category');

 // Calculate final price
 product = calculateFinalPrice(product, activeOffers);

        // Get related products
        let relatedProducts = await Product.find({
            _id: { $ne: productId },
            category: product.category._id, // Use the category ID
            isDeleted: false,
            isListed: true
        }).populate('category').limit(4); // Limit to 4 related products

        // Calculate final prices for related products
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
    searchTerm: '' 
});
    } catch (error) {
        console.error('Error in loadSingleProduct:', error);
        res.status(500).render("shop", { 
            error: "Failed to load product", 
            user: req.session.user,
            searchTerm: '' // Add this
        });
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

        // Check if the new email already exists
        const emailExists = await usercollection.findOne({ email: newEmail });
        if (emailExists) {
            return res.status(409).json({ success: false, message: "Email already in use." });
        }

        // Generate OTP
        const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
        req.session.otpSession = true;
        req.session.otpError = null;
        req.session.otpTime = 75;
        req.session.otpStartTime = Date.now();

        // Send OTP to the new email
        sendotp(generatedOtp, newEmail);
        const hashedOtp = await encryptPassword(generatedOtp);
        await otpCollection.updateOne(
            { email: newEmail },
            { $set: { otp: hashedOtp, expiresAt: new Date(Date.now() + 75 * 1000) } },
            { upsert: true }
        );

        // Store the new email in session for verification
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