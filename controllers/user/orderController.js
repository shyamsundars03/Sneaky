// controllers/user/orderController.js

const loadOrder = (req, res) => {
    try {
        res.render("orders", {
            user: req.session.user, 
        });
    } catch (error) {
        console.error("Error loading orders page:", error);
        res.status(500).render("page-404");
    }
};



const loadSingleOrder = (req, res) => {
    try {
        res.render("singleOrder", {
            user: req.session.user, 
        });
    } catch (error) {
        console.error("Error loading single order page:", error);
        res.status(500).render("page-404");
    }
};

module.exports = {
    loadOrder,
    loadSingleOrder,
};