const AppError = require('../utils/AppError');
const { STATUS, MSG } = require('../utils/responseConstants');

/**
 * Global error handler — must be the LAST middleware registered in app.js.
 *
 * Handles:
 *  - AppError instances (operational errors with known status + message)
 *  - Mongoose CastError (invalid ObjectId)
 *  - Mongoose ValidationError
 *  - Mongoose duplicate key error (code 11000)
 *  - JWT errors (if used in the future)
 *  - Unexpected / programming errors
 *
 * For API requests (JSON accepted) it returns a JSON body.
 * For page requests it renders an appropriate error page or redirects.
 */
const errorHandler = (err, req, res, next) => {
    // ── Normalise unknown errors into AppError ──────────────────────────────
    let error = err;

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        error = new AppError('Resource not found.', STATUS.NOT_FOUND);
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue || {}).join(', ');
        error = new AppError(
            `Duplicate value for field: ${field}.`,
            STATUS.CONFLICT
        );
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(e => e.message).join('. ');
        error = new AppError(messages, STATUS.BAD_REQUEST);
    }

    // Ensure statusCode is set
    const statusCode = error.statusCode || STATUS.INTERNAL_ERROR;
    const message = error.isOperational
        ? error.message
        : MSG.INTERNAL_ERROR;

    // ── Log non-operational (unexpected) errors ──────────────────────────────
    if (!error.isOperational) {
        console.error('UNEXPECTED ERROR ──────────────────────────');
        console.error(err);
        console.error('────────────────────────────────────────────');
    }

    // ── Determine if the client expects JSON ─────────────────────────────────
    const isAjax =
        req.xhr ||
        req.headers['x-requested-with'] === 'XMLHttpRequest' ||
        (req.headers.accept && req.headers.accept.includes('application/json'));

    if (isAjax) {
        return res.status(statusCode).json({
            success: false,
            message
        });
    }

    // ── Render error page for browser requests ───────────────────────────────
    if (statusCode === STATUS.NOT_FOUND) {
        return res.status(404).render('page-404', {
            user: req.session?.user || null,
            message
        });
    }

    // Generic server error page fallback
    try {
        return res.status(statusCode).render('page-404', {
            user: req.session?.user || null,
            message
        });
    } catch (_renderErr) {
        // Last resort if template itself fails
        return res.status(statusCode).send(`<h1>${statusCode}</h1><p>${message}</p>`);
    }
};

module.exports = errorHandler;
