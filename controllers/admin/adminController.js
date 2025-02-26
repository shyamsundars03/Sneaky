require('dotenv').config();

const loadLogin = (req, res) => {
    console.log("wefwef")
    try {
        if (req.session.admin) {
            res.redirect('/admin/dashboard');
        } else {
            res.render("admin", { message: null });
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

const verifyLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (email.trim().toLowerCase() === process.env.ADMIN_EMAIL && 
            password === process.env.ADMIN_PASSWORD) {
            req.session.admin = true;
            res.json({ 
                success: true, 
                redirect: '/admin/dashboard',
                message: 'Login successful'
            });
        } else {
            res.json({ 
                success: false, 
                message: 'Invalid credentials'
            });
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Internal Server Error' 
        });
    }
};

const loadDashboard = (req, res) => {
    try {
        if (req.session.admin) {
            res.render("dashboard");
        } else {
            res.redirect('/admin');
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

const logoutAdmin = (req, res) => {

        try {
            req.session.destroy();
            res.redirect('/admin');
        } catch (error) {
            console.log(error.message);
            res.redirect('/admin/dashboard');
        }
};







module.exports = {
    loadLogin,
    verifyLogin,
    loadDashboard,
    logoutAdmin,

};