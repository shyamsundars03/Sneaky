const usercollection = require("../models/userSchema");

module.exports = async function (req, res, next) {
    try {
        if (req.session.loginSession || req.session.signupSession) {
            const user = await usercollection.findOne({ email: req.session.user.email });
            if (!user || user.isActive === false) {
                // Destroy the session if the user is blocked
                req.session.destroy((err) => {
                    if (err) {
                        console.error("Error destroying session:", err);
                    }
                    return res.redirect("/page-404");
                });
            } else {
                next();
            }
        } else {
            return res.redirect('/signin');
        }
    } catch (err) {
        console.log("Middleware error:", err);
        res.status(500).send("Internal Server Error");
    }
};