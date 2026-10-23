require('dotenv').config();
const AppError = require('../../utils/AppError');
const { STATUS, MSG } = require('../../utils/responseConstants');

const loadLogin = (req, res, next) => {
    try {
        if (req.session.admin) {
            res.redirect('/admin/dashboard');
        } else {
            res.render("admin", { message: null });
        }
    } catch (error) {
        console.error(error.message);
        next(new AppError(MSG.INTERNAL_ERROR, STATUS.INTERNAL_ERROR));
    }
};

const verifyLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (email.trim().toLowerCase() === process.env.ADMIN_EMAIL &&
            password === process.env.ADMIN_PASSWORD) {
            req.session.admin = true;
            res.status(STATUS.OK).json({
                success: true,
                redirect: '/admin/dashboard',
                message: MSG.ADMIN_LOGIN_SUCCESS
            });
        } else {
            res.status(STATUS.UNAUTHORIZED).json({
                success: false,
                message: MSG.ADMIN_LOGIN_FAILED
            });
        }
    } catch (error) {
        console.error(error.message);
        res.status(STATUS.INTERNAL_ERROR).json({
            success: false,
            message: MSG.INTERNAL_ERROR
        });
    }
};

const loadDashboard = (req, res, next) => {
    try {
        if (req.session.admin) {
            res.render("dashboard");
        } else {
            res.redirect('/admin');
        }
    } catch (error) {
        console.error(error.message);
        next(new AppError(MSG.INTERNAL_ERROR, STATUS.INTERNAL_ERROR));
    }
};

const logoutAdmin = (req, res) => {
    try {
        req.session.admin = false;
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