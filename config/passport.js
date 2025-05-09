// config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
const { generateReferralCode } = require('../services/referralService');

console.log('Configuring passport with Google strategy');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    passReqToCallback: true // This allows us to access the session
}, async (req, accessToken, refreshToken, profile, done) => {
    try {
        console.log('Google auth callback in passport strategy');
        
        // Check if user exists by email
        let user = await User.findOne({ email: profile._json.email });
        
        if (user) {
            console.log('Existing user found:', user.email);
            
            // Update Google ID if not set
            if (!user.googleId) {
                user.googleId = profile.id;
                await user.save();
                console.log('Updated existing user with Google ID');
            }
            
            return done(null, user);
        } else {
            console.log('Creating new user from Google profile');
            
            // Generate a unique referral code
            const referralCode = await generateReferralCode();
            console.log('Generated referral code:', referralCode);
            
            // Get referral code from session if it exists
            const referredBy = req.session.referralCode || null;
            console.log('Referral from session:', referredBy);
            
            // Create new user with referral code
            const newUser = new User({
                name: profile.displayName,
                email: profile._json.email,
                googleId: profile.id,
                profileImage: profile.photos[0].value,
                referralCode: referralCode,
                referredBy: referredBy,
                wallet: {
                    balance: 0,
                    transactions: []
                },
                referralCount: 0
            });
            
            await newUser.save();
            console.log('New Google user created with referral code:', referralCode);
            
            return done(null, newUser);
        }
    } catch (err) {
        console.error('Error in Google strategy:', err);
        return done(err, null);
    }
}));

passport.serializeUser((user, done) => {
    console.log('Serializing user:', user._id);
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

module.exports = passport;