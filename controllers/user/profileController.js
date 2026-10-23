const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const multer = require('multer');
const path = require('path');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../../config/cloudinary');
const AppError = require('../../utils/AppError');
const { STATUS, MSG } = require('../../utils/responseConstants');

// Initialize Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file) => {
    return {
      folder: 'sneaky/profile_images',
      allowed_formats: ['jpg', 'jpeg', 'png', 'svg'],
      transformation: [{ width: 500, height: 500, crop: 'limit' }],
      public_id: `user-${req.user._id}-${Date.now()}`
    };
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpe?g|png|svg/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only images (jpeg, jpg, png, svg) are allowed!'));
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
}).single('profileImage');

// Update profile image
const updateProfileImage = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(STATUS.UNAUTHORIZED).json({ success: false, message: MSG.NOT_AUTHENTICATED });
    }

    if (!req.file) {
      return res.status(STATUS.BAD_REQUEST).json({ success: false, message: MSG.PROFILE_IMAGE_REQUIRED });
    }

    const imageUrl = req.file.path;
    
    // Delete old image if it exists
    if (req.user.profileImage) {
      try {
        const publicId = req.user.profileImage.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`sneaky/profile_images/${publicId}`);
      } catch (error) {
        console.error("Error deleting old image:", error);
      }
    }

    await User.findByIdAndUpdate(req.user._id, { profileImage: imageUrl });

    // Update session
    req.user.profileImage = imageUrl;
    req.session.user.profileImage = imageUrl;

    return res.status(STATUS.OK).json({
      success: true,
      message: MSG.PROFILE_IMAGE_UPDATED,
      imageUrl
    });

  } catch (error) {
    console.error("Error updating profile image:", error);

    let errorMessage = MSG.INTERNAL_ERROR;
    if (error.message.includes('File too large')) {
      errorMessage = "Image size should be less than 5MB.";
    } else if (error.message.includes('Only images')) {
      errorMessage = "Only jpeg, jpg, png, and svg images are allowed.";
    }

    return res.status(STATUS.INTERNAL_ERROR).json({
      success: false,
      message: errorMessage,
      error: error.message
    });
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
        res.status(STATUS.INTERNAL_ERROR).render('page-404');
    }
};

// Update profile details
const updateProfile = async (req, res) => {
    try {
        const { username, phone } = req.body;
        const user = await User.findById(req.user._id);


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
                await req.session.save(); 
                
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
            return res.status(STATUS.OK).json({ success: false, message: MSG.PROFILE_NO_CHANGES });
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

        res.status(STATUS.OK).json({
            success: true,
            message: MSG.PROFILE_UPDATED,
            user: {
                name: updatedUser.name,
                phone: updatedUser.phone
            }
        });

    } catch (error) {
        console.error("Update error:", error);
        res.status(STATUS.INTERNAL_ERROR).json({
            success: false,
            message: MSG.INTERNAL_ERROR
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
        res.status(STATUS.INTERNAL_ERROR).render("page-404");
    }
};

// Add or update address
const saveAddress = async (req, res) => {
    try {
        const { id, name, street, city, state, zip, country } = req.body;
        const userId = req.user._id;

        if (id) {
       
            const updatedAddress = await Address.findByIdAndUpdate(
                id, 
                { name, street, city, state, zip, country },
                { new: true }
            );
            return res.status(STATUS.OK).json({
                success: true,
                message: MSG.ADDRESS_UPDATED,
                address: updatedAddress
            });
        } else {
            const newAddress = new Address({ userId, name, street, city, state, zip, country });
            await newAddress.save();
            return res.status(STATUS.CREATED).json({
                success: true,
                message: MSG.ADDRESS_ADDED,
                address: newAddress
            });
        }
    } catch (error) {
        console.error("Error saving address:", error);
        return res.status(STATUS.INTERNAL_ERROR).json({
            success: false,
            message: MSG.INTERNAL_ERROR
        });
    }
};

// Delete address
const deleteAddress = async (req, res) => {
    try {
        const addressId = req.params.id;
        const deletedAddress = await Address.findByIdAndDelete(addressId);
        if (!deletedAddress) {
            return res.status(STATUS.NOT_FOUND).json({
                success: false,
                message: MSG.ADDRESS_NOT_FOUND
            });
        }
        res.status(STATUS.OK).json({
            success: true,
            message: MSG.ADDRESS_DELETED,
            addressId
        });
    } catch (error) {
        console.error("Error deleting address:", error);
        res.status(STATUS.INTERNAL_ERROR).json({
            success: false,
            message: MSG.INTERNAL_ERROR
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