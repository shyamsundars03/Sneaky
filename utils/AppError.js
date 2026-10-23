
class AppError extends Error {
    constructor(message, statusCode, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational; // true = known/expected error (show to user)
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
