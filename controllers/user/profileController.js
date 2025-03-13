// controllers/user/profileController.js

const loadProfile = (req, res) => {
    try {
        res.render("profile", {
            user: req.session.user, 
        });
    } catch (error) {
        console.error("Error loading profile page:", error);
        res.status(500).render("page-404"); // Render a 404 page or error page
    }
};


const loadAddress = (req, res) => {
    try {
        res.render("address", {
            user: req.session.user, 
        });
    } catch (error) {
        console.error("Error loading address page:", error);
        res.status(500).render("page-404"); // Render a 404 page or error page
    }
};




module.exports = {
    loadProfile,
    loadAddress
};