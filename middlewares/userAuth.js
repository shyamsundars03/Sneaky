const usercollection = require("../models/userSchema");

module.exports = async function (req, res, next) {
    try {
        if (req.session.user) {
            const user = await usercollection.findOne({ _id: req.session.user._id });

            if (!user || user.isActive === false) {
                req.session.destroy((err) => {
                    if (err) {
                        console.error("Error destroying session:", err);
                    }
                    return res.redirect("/signin");
                });
            } else {
                req.user = user; 
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