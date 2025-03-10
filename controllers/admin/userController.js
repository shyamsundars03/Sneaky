const User = require('../../models/userSchema');

// Helper function to validate user data
const validateUser = async (userData, userId = null) => {
    const errors = [];

    if (!userData.name?.trim()) {
        errors.push('Name is required');
    }

    if (!userData.email?.trim()) {
        errors.push('Email is required');
    } else {
        // Check for duplicate email
        const existingUser = await User.findOne({
            email: { $regex: new RegExp(`^${userData.email}$`, 'i') },
            _id: { $ne: userId },
            isDeleted: false
        });

        if (existingUser) {
            errors.push('Email already exists');
        }
    }

    if (!userData.phone?.trim()) {
        errors.push('Phone number is required');
    }

    return errors;
};

// Block/Unblock User
const toggleUserStatus = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        user.isActive = !user.isActive; // Toggle user status
        await user.save();

        res.json({
            success: true,
            message: `User ${user.isActive ? 'unblocked' : 'blocked'} successfully`
        });
    } catch (error) {
        console.error('Error in toggleUserStatus:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user status'
        });
    }
};

// Delete User (Soft Delete)
const deleteUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        user.isDeleted = true; // Soft delete the user
        await user.save();

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Error in deleteUser:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete user'
        });
    }
};

// Get User by ID
const getUserById = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);

        if (!user || user.isDeleted) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            user
        });
    } catch (error) {
        console.error('Error in getUserById:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load user data'
        });
    }
};

// List Users with Pagination and Search
const listUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10; // Number of users per page
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        // Validate page number
        if (page < 1) {
            return res.status(400).render('admin/userManagement', {
                error: 'Invalid page number',
                users: [],
                currentPage: 1,
                totalPages: 0,
                totalUsers: 0,
                searchQuery: search
            });
        }

        // Create search query
        const searchQuery = {
            ...(search && {
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { phone: { $regex: search, $options: 'i' } }
                ]
            })
        };

        // Debugging: Log the search query
        console.log('Search Query:', searchQuery);

        // Fetch users
        const users = await User.find(searchQuery)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        // Debugging: Log the fetched users
        console.log('Fetched Users:', users);

        const totalUsers = await User.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalUsers / limit);

        // Render the userManagement.ejs template with the data
        res.render('userManagement', {
            users,
            currentPage: page,
            totalPages,
            totalUsers,
            searchQuery: search
        });
    } catch (error) {
        console.error('Error in listUsers:', error);
        res.status(500).render('admin/userManagement', {
            error: 'Failed to load user data',
            users: [],
            currentPage: 1,
            totalPages: 0,
            totalUsers: 0,
            searchQuery: ''
        });
    }
};

module.exports = {
    validateUser,
    toggleUserStatus,
    deleteUser,
    getUserById,
    listUsers
};