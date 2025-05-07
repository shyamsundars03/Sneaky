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
        const user = await User.findById(req.user._id).lean();
        res.render('profile', { 
            user,
            referralLink: user.referralCode 
                ? `${req.protocol}://${req.get('host')}/signup?ref=${user.referralCode}`
                : null
        });
    } catch (error) {
        console.error('Error loading profile:', error);
        res.status(500).render('page-404');
    }
};

// Update profile details
const updateProfile = async (req, res) => {
    try {
        const { username, phone } = req.body;
        const user = await User.findById(req.user._id);

        // Google user handling
        if (user.googleId) {
            if (phone !== user.phone) {
                const updatedUser = await User.findByIdAndUpdate(
                    req.user._id,
                    { phone },
                    { new: true, runValidators: true }
                );
                console.log('Google user updated:', updatedUser);
                
                // Update session
                req.session.user.phone = updatedUser.phone;
                await req.session.save(); // Explicitly save session
                
                return res.json({ 
                    success: true, 
                    message: "Phone number updated!",
                    user: { phone: updatedUser.phone }
                });
            }
            return res.json({ success: false, message: "No changes made" });
        }

        // Regular user handling
        const updateData = {};
        if (username !== user.name) updateData.name = username;
        if (phone !== user.phone) updateData.phone = phone;

        if (Object.keys(updateData).length === 0) {
            return res.json({ success: false, message: "No changes made" });
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            updateData,
            { new: true, runValidators: true }
        );

        // Update session
        req.session.user = {
            ...req.session.user,
            name: updatedUser.name,
            phone: updatedUser.phone
        };
        await req.session.save();

        res.json({ 
            success: true,
            message: "Profile updated!",
            user: {
                name: updatedUser.name,
                phone: updatedUser.phone
            }
        });

    } catch (error) {
        console.error("Update error:", error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
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
            const updatedAddress = await Address.findByIdAndUpdate(
                id, 
                { name, street, city, state, zip, country },
                { new: true }
            );
            return res.json({ 
                success: true, 
                message: "Address updated successfully!",
                address: updatedAddress
            });
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
            return res.json({ 
                success: true, 
                message: "Address added successfully!",
                address: newAddress
            });
        }
    } catch (error) {
        console.error("Error saving address:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Failed to save address.",
            error: error.message 
        });
    }
};

// Delete address
const deleteAddress = async (req, res) => {
    try {
        const addressId = req.params.id;
        const deletedAddress = await Address.findByIdAndDelete(addressId);
        if (!deletedAddress) {
            return res.status(404).json({ 
                success: false, 
                message: "Address not found." 
            });
        }
        res.json({ 
            success: true, 
            message: "Address deleted successfully!",
            addressId: addressId
        });
    } catch (error) {
        console.error("Error deleting address:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to delete address.",
            error: error.message 
        });
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