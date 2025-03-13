const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const usercollection = require('../models/userSchema');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
    try {
 
        const user = await usercollection.findOne({ email: profile._json.email });

        if (user) {
            return done(null, user);
        } else {
            const newUser = {
                name: profile.displayName,
                email: profile._json.email,
                googleId: profile.id,
            };
            const createdUser = await usercollection.create(newUser);
            return done(null, createdUser);
        }
    } catch (err) {
        return done(err, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await usercollection.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

module.exports = passport;