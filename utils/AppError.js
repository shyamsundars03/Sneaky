/**
 * Custom application error class.
 * Throw this anywhere in controllers/services to pass structured errors
 * down to the global error handler in app.js.
 *
 * Usage:
 *   throw new AppError('Product not found', 404);
 *   throw new AppError('Internal failure', 500, true);  // isOperational = true (default)
 */
class AppError extends Error {
    constructor(message, statusCode, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational; // true = known/expected error (show to user)
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
