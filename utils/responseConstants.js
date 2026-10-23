

// ─── HTTP Status Codes ────────────────────────────────────────────────────────
const STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_ERROR: 500
};

// ─── Response Messages ────────────────────────────────────────────────────────
const MSG = {
    // ── Generic ──────────────────────────────────────────────────────────────
    INTERNAL_ERROR:         'Something went wrong. Please try again.',
    MISSING_FIELDS:         'Required fields are missing.',
    INVALID_INPUT:          'Invalid input provided.',
    SESSION_EXPIRED:        'Session expired. Please restart.',

    // ── Auth ─────────────────────────────────────────────────────────────────
    LOGIN_SUCCESS:          'Login successful.',
    LOGIN_INVALID_PASSWORD: 'Invalid password.',
    LOGOUT_SUCCESS:         'Logged out successfully.',
    SIGNUP_SUCCESS:         'Account created successfully.',
    USER_ALREADY_EXISTS:    'User already exists. Please sign in.',
    USER_NOT_FOUND:         'User not found.',
    USER_BLOCKED:           'Your account has been blocked.',
    NOT_AUTHENTICATED:      'You must be logged in to do that.',

    // ── OTP ──────────────────────────────────────────────────────────────────
    OTP_SENT:               'OTP sent successfully.',
    OTP_SEND_FAILED:        'Failed to send OTP.',
    OTP_INVALID:            'Invalid OTP.',
    OTP_EXPIRED:            'OTP has expired.',
    OTP_VERIFIED:           'OTP verified successfully.',

    // ── Password ──────────────────────────────────────────────────────────────
    PASSWORD_UPDATED:       'Password updated successfully.',
    PASSWORD_RESET:         'Password reset successfully.',
    PASSWORD_MISMATCH:      'Passwords do not match.',
    PASSWORD_OLD_WRONG:     'Old password is incorrect.',

    // ── Email ──────────────────────────────────────────────────────────────
    EMAIL_UPDATED:          'Email updated successfully.',
    EMAIL_IN_USE:           'This email is already in use.',

    // ── Profile ──────────────────────────────────────────────────────────────
    PROFILE_UPDATED:        'Profile updated successfully.',
    PROFILE_NO_CHANGES:     'No changes were made.',
    PROFILE_IMAGE_UPDATED:  'Profile image uploaded successfully.',
    PROFILE_IMAGE_REQUIRED: 'No file uploaded.',

    // ── Address ──────────────────────────────────────────────────────────────
    ADDRESS_ADDED:          'Address added successfully.',
    ADDRESS_UPDATED:        'Address updated successfully.',
    ADDRESS_DELETED:        'Address deleted successfully.',
    ADDRESS_NOT_FOUND:      'Address not found.',
    ADDRESS_INVALID:        'Invalid address selected.',

    // ── Products ─────────────────────────────────────────────────────────────
    PRODUCT_ADDED:          'Product added successfully.',
    PRODUCT_UPDATED:        'Product updated successfully.',
    PRODUCT_DELETED:        'Product deleted successfully.',
    PRODUCT_NOT_FOUND:      'Product not found.',
    PRODUCT_UNAVAILABLE:    'This product is no longer available.',
    PRODUCT_LOAD_FAILED:    'Failed to load product data.',

    // ── Category ─────────────────────────────────────────────────────────────
    CATEGORY_ADDED:         'Category added successfully.',
    CATEGORY_UPDATED:       'Category updated successfully.',
    CATEGORY_DELETED:       'Category deleted successfully.',
    CATEGORY_NOT_FOUND:     'Category not found.',
    CATEGORY_EXISTS:        'Category already exists.',
    CATEGORY_LOAD_FAILED:   'Failed to load category data.',

    // ── Cart ─────────────────────────────────────────────────────────────────
    CART_NOT_FOUND:         'Cart not found.',
    CART_EMPTY:             'Your cart is empty.',
    CART_ITEM_ADDED:        'Product added to cart.',
    CART_ITEM_REMOVED:      'Item removed from cart.',
    CART_ITEM_NOT_FOUND:    'Item not found in cart.',
    CART_ITEM_ID_REQUIRED:  'Item ID is required.',
    CART_QUANTITY_UPDATED:  'Cart quantity updated.',
    CART_LOAD_FAILED:       'Failed to load cart.',

    // ── Stock ─────────────────────────────────────────────────────────────────
    INSUFFICIENT_STOCK:     'Insufficient stock for the requested quantity.',
    OUT_OF_STOCK:           'This item is out of stock.',
    SIZE_UNAVAILABLE:       'Selected size is not available.',
    SIZE_INVALID:           'Selected size is invalid.',
    EXCEEDS_STOCK:          'Cannot add more than the available stock. Please check your cart.',

    // ── Checkout ─────────────────────────────────────────────────────────────
    CHECKOUT_SESSION_EXPIRED: 'Session expired. Please restart checkout.',
    CHECKOUT_LOAD_FAILED:   'Failed to load checkout page.',
    CHECKOUT_SAVE_FAILED:   'Failed to save checkout data.',
    PAYMENT_INVALID:        'Invalid payment method selected.',
    COD_LIMIT_EXCEEDED:     'Cash on Delivery is only available for orders below ₹7,000.',
    WALLET_INSUFFICIENT:    'Insufficient wallet balance.',
    PAYMENT_VERIFY_FAILED:  'Payment verification failed.',
    PAYMENT_FIELDS_MISSING: 'Required payment fields are missing.',

    // ── Orders ────────────────────────────────────────────────────────────────
    ORDER_PLACED:           'Order placed successfully.',
    ORDER_NOT_FOUND:        'Order not found.',
    ORDER_LOAD_FAILED:      'Failed to load orders.',
    ORDER_CANCEL_SUCCESS:   'Order cancelled successfully. Stock has been restored.',
    ORDER_CANCEL_FAILED:    'Failed to cancel the order.',
    ORDER_RETURN_REQUESTED: 'Return request submitted for admin verification.',
    ORDER_RETURN_FAILED:    'Failed to submit return request.',
    ORDER_RETURN_REASON:    'Please provide a detailed reason for return (minimum 10 characters).',
    ORDER_CANCEL_REASON:    'Please provide a valid cancellation reason (minimum 5 characters).',
    ORDER_ALREADY_CANCELLED:'Order has already been cancelled.',
    ORDER_ONLY_BEFORE_DELIVERY: 'Order can only be cancelled before delivery.',
    ORDER_INVALID_TRANSITION: 'Invalid order status transition.',
    ORDER_STATUS_UPDATED:   'Order status updated successfully.',
    ORDER_REFUND_PROCESSED: 'Refund already processed for this order.',
    ITEM_NOT_FOUND:         'Item not found in the order.',
    ITEM_CANCEL_SUCCESS:    'Item cancelled successfully. Stock has been restored.',
    ITEM_RETURN_VERIFIED:   'Item return verified. Refund processed and stock updated.',

    // ── Coupon ────────────────────────────────────────────────────────────────
    COUPON_ADDED:           'Coupon added successfully.',
    COUPON_UPDATED:         'Coupon updated successfully.',
    COUPON_DELETED:         'Coupon deleted successfully.',
    COUPON_NOT_FOUND:       'Coupon not found.',
    COUPON_EXISTS:          'Coupon code already exists.',
    COUPON_APPLIED:         'Coupon applied successfully.',
    COUPON_REMOVED:         'Coupon removed successfully.',
    COUPON_INVALID:         'Invalid or expired coupon code.',
    COUPON_ALREADY_USED:    'You have already used this coupon.',
    COUPON_MIN_PURCHASE:    'Minimum purchase amount not met for this coupon.',
    COUPON_LOAD_FAILED:     'Failed to load coupon data.',
    COUPON_ADD_FAILED:      'Failed to add coupon.',
    COUPON_UPDATE_FAILED:   'Failed to update coupon.',
    COUPON_DELETE_FAILED:   'Failed to delete coupon.',

    // ── Offers ────────────────────────────────────────────────────────────────
    OFFER_ADDED:            'Offer added successfully.',
    OFFER_UPDATED:          'Offer updated successfully.',
    OFFER_DELETED:          'Offer deleted successfully.',
    OFFER_NOT_FOUND:        'Offer not found.',
    OFFER_EXISTS:           'An offer already exists for this category.',
    OFFER_LOAD_FAILED:      'Failed to load offer data.',
    OFFER_ADD_FAILED:       'Failed to add offer.',
    OFFER_UPDATE_FAILED:    'Failed to update offer.',
    OFFER_DELETE_FAILED:    'Failed to delete offer.',

    // ── Wallet ────────────────────────────────────────────────────────────────
    WALLET_LOAD_FAILED:     'Failed to load wallet.',
    WALLET_TOPUP_SUCCESS:   'Funds added to wallet successfully.',
    WALLET_TOPUP_FAILED:    'Failed to add funds to wallet.',
    WALLET_VERIFY_FAILED:   'Failed to verify payment.',
    WALLET_MIN_AMOUNT:      'Minimum top-up amount is ₹1.',
    WALLET_MAX_AMOUNT:      'Maximum top-up amount is ₹20,000.',

    // ── Wishlist ──────────────────────────────────────────────────────────────
    WISHLIST_ADDED:         'Added to wishlist.',
    WISHLIST_REMOVED:       'Removed from wishlist.',
    WISHLIST_LOAD_FAILED:   'Failed to load wishlist.',
    WISHLIST_UPDATE_FAILED: 'Failed to update wishlist.',

    // ── Admin ─────────────────────────────────────────────────────────────────
    ADMIN_LOGIN_SUCCESS:    'Admin login successful.',
    ADMIN_LOGIN_FAILED:     'Invalid admin credentials.',
    ADMIN_LOGOUT_SUCCESS:   'Admin logged out.',
    USER_BLOCKED_SUCCESS:   'User blocked successfully.',
    USER_UNBLOCKED_SUCCESS: 'User unblocked successfully.',
    USER_DELETED:           'User deleted successfully.',
    USER_LOAD_FAILED:       'Failed to load user data.',
    RETURN_VERIFIED:        'Return verified. Refund processed and stock updated.',
    RETURN_VERIFY_FAILED:   'Failed to verify return.',
};

module.exports = { STATUS, MSG };
