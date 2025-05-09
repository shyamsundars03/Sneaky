const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
const { generateReferralCode } = require('../services/referralService');

   passport.use(new GoogleStrategy({
       clientID: process.env.GOOGLE_CLIENT_ID,
       clientSecret: process.env.GOOGLE_CLIENT_SECRET,
       callbackURL: process.env.GOOGLE_CALLBACK_URL,
       passReqToCallback: true
   }, async (req, accessToken, refreshToken, profile, done) => {
       try {
           let user = await User.findOne({ email: profile._json.email });

           if (user) {
               // Update Google ID if not set
               if (!user.googleId) {
                   user.googleId = profile.id;
                   await user.save();
               }
               return done(null, user); // Ensure user has an _id field
           } else {
               // Create a new user
               const referralCode = await generateReferralCode();
               const referredBy = req.session.referralCode || null;

               const newUser  = new User({
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

               await newUser .save();
               return done(null, newUser ); // Ensure newUser  has an _id field
           }
       } catch (err) {
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