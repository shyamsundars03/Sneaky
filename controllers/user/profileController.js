const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const multer = require('multer');
const path = require('path');

// Set up multer for image uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage }).single('profileImage');

const updateProfileImage = async (req, res) => {
    try {
        if (req.file) {
            const imageUrl = `/uploads/${req.file.filename}`;
            await User.findByIdAndUpdate(req.user._id, { profileImage: imageUrl });
            req.user.profileImage = imageUrl;
            return res.json({ success: true, message: "Profile image uploaded successfully!" });
        }
        return res.status(400).json({ success: false, message: "No file uploaded." });
    } catch (error) {
        console.error("Error updating profile image:", error);
        return res.status(500).json({ success: false, message: "Error updating profile image." });
    }
};

const loadProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.render("profile", { user });
    } catch (error) {
        console.error("Error loading profile page:", error);
        res.status(500).render("page-404");
    }
};

const updateProfile = async (req, res) => {
    try {
        const { username, email, phone } = req.body;
        await User.findByIdAndUpdate(req.user._id, { username, email, phone });
        req.user.username = username;
        res.redirect('/profile');
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).render("page-404");
    }
};

const loadAddress = async (req, res) => {
    try {
        const addresses = await Address.find({ userId: req.user._id });
        res.render("address", { addresses, user: req.user });
    } catch (error) {
        console.error("Error loading addresses:", error);
        res.status(500).render("page-404");
    }
};

const addAddress = async (req, res) => {
    try {
        const { name, street, city, state, zip, country } = req.body;
        const newAddress = new Address({ userId: req.user._id, name, street, city, state, zip, country });
        await newAddress.save();
        res.redirect('/address');
    } catch (error) {
        console.error("Error adding address:", error);
        res.status(500).render("page-404");
    }
};

const updateAddress = async (req, res) => {
    try {
        const { id, name, street, city, state, zip, country } = req.body;
        await Address.findByIdAndUpdate(id, { name, street, city, state, zip, country });
        res.redirect('/address');
    } catch (error) {
        console.error("Error updating address:", error);
        res.status(500).render("page-404");
    }
};

const deleteAddress = async (req, res) => {
    try {
        await Address.findByIdAndDelete(req.params.id);
        res.redirect('/address');
    } catch (error) {
        console.error("Error deleting address:", error);
        res.status(500).render("page-404");
    }
};

const signOut = (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error("Error signing out:", err);
            return res.status(500).render("page-404");
        }
        req.session.destroy();
        res.redirect('/signin');
    });
};

module.exports = {
    loadProfile,
    updateProfile,
    loadAddress,
    addAddress,
    updateAddress,
    deleteAddress,
    signOut,
    updateProfileImage,
    upload,
};