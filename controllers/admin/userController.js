const User = require('../../models/userSchema');
const AppError = require('../../utils/AppError');
const { STATUS, MSG } = require('../../utils/responseConstants');

const validateUser = async (userData, userId = null) => {
    const errors = [];

    if (!userData.name?.trim()) {
        errors.push('Name is required');
    }

    if (!userData.email?.trim()) {
        errors.push('Email is required');
    } else {
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

const toggleUserStatus = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(STATUS.NOT_FOUND).json({ success: false, error: MSG.USER_NOT_FOUND });
        }

        user.isActive = !user.isActive;
        await user.save();

        const message = user.isActive ? MSG.USER_UNBLOCKED_SUCCESS : MSG.USER_BLOCKED_SUCCESS;

        res.status(STATUS.OK).json({ success: true, message });
    } catch (error) {
        console.error('Error in toggleUserStatus:', error);
        res.status(STATUS.INTERNAL_ERROR).json({ success: false, error: MSG.INTERNAL_ERROR });
    }
};

const deleteUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(STATUS.NOT_FOUND).json({ success: false, error: MSG.USER_NOT_FOUND });
        }

        user.isDeleted = true;
        await user.save();

        res.status(STATUS.OK).json({ success: true, message: MSG.USER_DELETED });
    } catch (error) {
        console.error('Error in deleteUser:', error);
        res.status(STATUS.INTERNAL_ERROR).json({ success: false, error: MSG.INTERNAL_ERROR });
    }
};

const getUserById = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findById(userId);

        if (!user || user.isDeleted) {
            return res.status(STATUS.NOT_FOUND).json({ success: false, error: MSG.USER_NOT_FOUND });
        }

        res.status(STATUS.OK).json({ success: true, user });
    } catch (error) {
        console.error('Error in getUserById:', error);
        res.status(STATUS.INTERNAL_ERROR).json({ success: false, error: MSG.USER_LOAD_FAILED });
    }
};

const listUsers = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        if (page < 1) {
            return res.status(STATUS.BAD_REQUEST).render('admin/userManagement', {
                error: MSG.INVALID_INPUT,
                users: [],
                currentPage: 1,
                totalPages: 0,
                totalUsers: 0,
                searchQuery: search
            });
        }

        const searchQuery = {
            ...(search && {
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { phone: { $regex: search, $options: 'i' } }
                ]
            })
        };

        const users = await User.find(searchQuery)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const totalUsers = await User.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalUsers / limit);

        res.render('userManagement', {
            users,
            currentPage: page,
            totalPages,
            totalUsers,
            searchQuery: search
        });
    } catch (error) {
        console.error('Error in listUsers:', error);
        next(new AppError(MSG.USER_LOAD_FAILED, STATUS.INTERNAL_ERROR));
    }
};

module.exports = {
    validateUser,
    toggleUserStatus,
    deleteUser,
    getUserById,
    listUsers
};