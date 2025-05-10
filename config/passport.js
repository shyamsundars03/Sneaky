const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
const { generateReferralCode } = require('../services/referralService');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    passReqToCallback: true // Important for accessing session
}, async (req, accessToken, refreshToken, profile, done) => {
    try {
        const email = profile._json.email;
        
        // Check if user exists
        let user = await User.findOne({ email });
        
        if (user) {
            // Update Google ID if missing
            if (!user.googleId) {
                user.googleId = profile.id;
                await user.save();
            }
            return done(null, user);
        }
        
        // Create new user with referral code
        const referralCode = await generateReferralCode();
        const referredBy = req.session.referralCode || null;
        
        user = new User({
            name: profile.displayName,
            email: email,
            googleId: profile.id,
            profileImage: profile.photos[0].value,
            referralCode: referralCode,
            referredBy: referredBy,
            wallet: {
                balance: referredBy ? 50 : 0,
                transactions: referredBy ? [{
                    type: 'referral',
                    amount: 50,
                    description: 'Welcome bonus from referral',
                    date: new Date()
                }] : []
            }
        });
        
        await user.save();
        
        // Apply bonus to referrer if exists
        if (referredBy) {
            const referrer = await User.findOne({ referralCode: referredBy });
            if (referrer) {
                referrer.wallet.balance += 50;
                referrer.wallet.transactions.push({
                    type: 'referral',
                    amount: 50,
                    description: `Referral bonus for ${email}`,
                    date: new Date()
                });
                referrer.referralCount += 1;
                await referrer.save();
            }
        }
        
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));

// Keep existing serialize/deserialize
passport.serializeUser((user, done) => {
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