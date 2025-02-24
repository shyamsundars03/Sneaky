require('dotenv').config();

const loadLogin = (req, res) => {
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




const loadUserManagement = (req, res) => {
    try {
        if (req.session.admin) {
            res.render("userManagement");
        } else {
            res.redirect('/admin/dashboard');
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

const loadProductManagement = (req, res) => {
    try {
        if (req.session.admin) {
            res.render("productManagement");
        } else {
            res.redirect('/admin/dashboard');
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


// const loadCategoryManagement = (req, res) => {
//     try {
//         if (req.session.admin) {
//             res.render("categoryManagement");
//         } else {
//             res.redirect('/admin');
//         }
//     } catch (error) {
//         console.error(error.message);
//         res.status(500).json({ error: "Internal Server Error" });
//     }
// };

const loadOrderManagement = (req, res) => {
    try {
        if (req.session.admin) {
            res.render("orderManagement");
        } else {
            res.redirect('/admin/dashboard');
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
const loadCouponManagement = (req, res) => {
    try {
        if (req.session.admin) {
            res.render("couponManagement");
        } else {
            res.redirect('/admin/dashboard');
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
const loadOfferManagement = (req, res) => {
    try {
        if (req.session.admin) {
            res.render("offerManagement");
        } else {
            res.redirect('/admin/dashboard');
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};


const loadSales = (req, res) => {
    try {
        if (req.session.admin) {
            res.render("sales");
        } else {
            res.redirect('/admin/dashboard');
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};



module.exports = {
    loadLogin,
    verifyLogin,
    loadDashboard,
    logoutAdmin,
    loadUserManagement,
    loadProductManagement,
    // loadCategoryManagement,
    loadOrderManagement,
    loadCouponManagement,
    loadOfferManagement,
    loadSales
};