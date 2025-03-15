const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const multer = require('multer');
const path = require('path');

// Multer configuration for image upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    },
});

const upload = multer({ storage: storage }).single('profileImage');

// Update profile image
const updateProfileImage = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: "User not authenticated." });
        }

        if (req.file) {
            const imageUrl = `/uploads/${req.file.filename}`;
            await User.findByIdAndUpdate(req.user._id, { profileImage: imageUrl });

            // Update the session with the new profile image
            req.user.profileImage = imageUrl;
            req.session.user.profileImage = imageUrl;

            return res.json({ success: true, message: "Profile image uploaded successfully!" });
        }
        return res.status(400).json({ success: false, message: "No file uploaded." });
    } catch (error) {
        console.error("Error updating profile image:", error);
        return res.status(500).json({ success: false, message: "Error updating profile image." });
    }
};

// Load profile page
const loadProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.render("profile", { user });
    } catch (error) {
        console.error("Error loading profile page:", error);
        res.status(500).render("page-404");
    }
};

// Update profile details
const updateProfile = async (req, res) => {
    try {
        const { username, email, phone } = req.body;
        await User.findByIdAndUpdate(req.user._id, { name: username, email, phone });
        req.user.name = username; // Update session
        res.redirect('/profile');
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).render("page-404");
    }
};


// Load address page
const loadAddress = async (req, res) => {
    try {
        const userId = req.user._id;
        const addresses = await Address.find({ userId });
        res.render("address", { addresses, user: req.user });
    } catch (error) {
        console.error("Error loading addresses:", error);
        res.status(500).render("page-404");
    }
};

// Add or update address
const saveAddress = async (req, res) => {
    try {
        const { id, name, street, city, state, zip, country } = req.body;
        const userId = req.user._id;

        if (id) {
            // Update existing address
            await Address.findByIdAndUpdate(id, { name, street, city, state, zip, country });
        } else {
            // Add new address
            const newAddress = new Address({
                userId,
                name,
                street,
                city,
                state,
                zip,
                country,
            });
            await newAddress.save();
        }

        res.json({ success: true, message: "Address saved successfully!" });
    } catch (error) {
        console.error("Error saving address:", error);
        res.status(500).json({ success: false, message: "Failed to save address." });
    }
};

// Delete address
const deleteAddress = async (req, res) => {
    try {
        const addressId = req.params.id;
        await Address.findByIdAndDelete(addressId);
        res.json({ success: true, message: "Address deleted successfully!" });
    } catch (error) {
        console.error("Error deleting address:", error);
        res.status(500).json({ success: false, message: "Failed to delete address." });
    }
};





module.exports = {
    loadProfile,
    updateProfile,
    updateProfileImage,
    upload,
    loadAddress,
    saveAddress,
    deleteAddress,
};