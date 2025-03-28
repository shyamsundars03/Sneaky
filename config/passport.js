const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const usercollection = require('../models/userSchema');

// Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Check if the user already exists in the database
        const user = await usercollection.findOne({ email: profile._json.email });

        if (user) {
            // If the user exists, update their googleId if it's not already set
            if (!user.googleId) {
                user.googleId = profile.id;
                await user.save();
            }
            return done(null, user);
        } else {
            // If the user doesn't exist, create a new user
            const newUser = {
                name: profile.displayName,
                email: profile._json.email,
                googleId: profile.id,
                profileImage: profile.photos[0].value, // Save the profile image from Google
            };
            const createdUser = await usercollection.create(newUser);
            return done(null, createdUser);
        }
    } catch (err) {
        return done(err, null);
    }
}));

// Serialize user
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user
passport.deserializeUser(async (id, done) => {
    try {
        const user = await usercollection.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

module.exports = passport;