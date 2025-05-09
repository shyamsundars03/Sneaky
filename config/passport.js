// config/passport.js - Complete fixed version
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
const { generateReferralCode } = require('../services/referralService');

console.log('Configuring passport with Google strategy');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    passReqToCallback: true // Add this to access the session
}, async (req, accessToken, refreshToken, profile, done) => {
    try {
        console.log('Google strategy executing for:', profile.displayName);
        
        // Check if user exists by email
        const existingUser = await User.findOne({ email: profile.emails[0].value });
        
        if (existingUser) {
            console.log('Existing user found:', existingUser.email);
            
            // Update Google ID if needed
            if (!existingUser.googleId) {
                existingUser.googleId = profile.id;
                await existingUser.save();
                console.log('Updated existing user with Google ID');
            }
            
            return done(null, existingUser);
        } else {
            console.log('Creating new user from Google profile');
            
            // Generate referral code
            const referralCode = await generateReferralCode();
            console.log('Generated referral code for new user:', referralCode);
            
            // Create new user with referral code
            const newUser = new User({
                name: profile.displayName,
                email: profile.emails[0].value,
                googleId: profile.id,
                profileImage: profile.photos[0].value,
                referralCode: referralCode,
                wallet: {
                    balance: 0,
                    transactions: []
                },
                referralCount: 0
            });
            
            // Process referral if exists in session
            if (req.session && req.session.referralCode) {
                console.log('Found referral code in session:', req.session.referralCode);
                newUser.referredBy = req.session.referralCode;
            }
            
            await newUser.save();
            console.log('New Google user created with ID:', newUser._id);
            console.log('User referral code:', newUser.referralCode);
            
            return done(null, newUser);
        }
    } catch (error) {
        console.error('Error in Google strategy:', error);
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => {
    console.log('Serializing user:', user._id);
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        console.log('Deserializing user ID:', id);
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        console.error('Error deserializing user:', error);
        done(error, null);
    }
});

module.exports = passport;