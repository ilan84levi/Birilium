/**
 * Security Module - Comprehensive security utilities
 * Includes CSRF protection, token blacklist, password validation, rate limiting
 */

const crypto = require('crypto');
const logger = require('./logger');

// ============== TOKEN BLACKLIST (For Logout) ==============
// In-memory blacklist with expiration (use Redis in production for multi-instance)
const tokenBlacklist = new Map();
const TOKEN_BLACKLIST_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

/**
 * Add a token to the blacklist (on logout)
 * @param {string} token - JWT token to blacklist
 * @param {number} expiresAt - Unix timestamp when token expires
 */
function blacklistToken(token, expiresAt) {
    // Store token hash (not full token) for security
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    tokenBlacklist.set(tokenHash, expiresAt);
    logger.info({ tokenHash: tokenHash.substring(0, 16) }, 'Token blacklisted');
}

/**
 * Check if a token is blacklisted
 * @param {string} token - JWT token to check
 * @returns {boolean} True if blacklisted
 */
function isTokenBlacklisted(token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    return tokenBlacklist.has(tokenHash);
}

/**
 * Cleanup expired tokens from blacklist
 */
function cleanupBlacklist() {
    const now = Date.now();
    let cleaned = 0;

    for (const [hash, expiresAt] of tokenBlacklist.entries()) {
        if (expiresAt < now) {
            tokenBlacklist.delete(hash);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        logger.debug({ cleaned }, 'Cleaned expired tokens from blacklist');
    }
}

// Periodic cleanup
setInterval(cleanupBlacklist, TOKEN_BLACKLIST_CLEANUP_INTERVAL);


// ============== CSRF PROTECTION ==============
const csrfTokens = new Map();
const CSRF_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour

/**
 * Generate a CSRF token for a session
 * @param {string} sessionId - Session identifier
 * @returns {string} CSRF token
 */
function generateCSRFToken(sessionId) {
    const token = crypto.randomBytes(32).toString('hex');
    csrfTokens.set(token, {
        sessionId,
        createdAt: Date.now()
    });
    return token;
}

/**
 * Validate a CSRF token
 * @param {string} token - CSRF token to validate
 * @param {string} sessionId - Session identifier
 * @returns {boolean} True if valid
 */
function validateCSRFToken(token, sessionId) {
    const data = csrfTokens.get(token);
    if (!data) return false;

    // Check expiry
    if (Date.now() - data.createdAt > CSRF_TOKEN_EXPIRY) {
        csrfTokens.delete(token);
        return false;
    }

    // Check session match
    if (data.sessionId !== sessionId) {
        return false;
    }

    // Token is valid - delete it (one-time use)
    csrfTokens.delete(token);
    return true;
}

/**
 * CSRF protection middleware for state-changing operations
 */
function csrfMiddleware(req, res, next) {
    // Skip for GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    const csrfToken = req.headers['x-csrf-token'] || req.body._csrf;
    const sessionId = req.user?.username || req.ip;

    if (!csrfToken || !validateCSRFToken(csrfToken, sessionId)) {
        logger.warn({ ip: req.ip, method: req.method, path: req.path }, 'CSRF validation failed');
        return res.status(403).json({
            success: false,
            error: 'Invalid or missing CSRF token',
            code: 'CSRF_INVALID'
        });
    }

    next();
}


// ============== PASSWORD VALIDATION ==============
const PASSWORD_REQUIREMENTS = {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: true,
    specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
function validatePassword(password) {
    const errors = [];

    if (!password || typeof password !== 'string') {
        return { valid: false, errors: ['Password is required'] };
    }

    if (password.length < PASSWORD_REQUIREMENTS.minLength) {
        errors.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`);
    }

    if (password.length > PASSWORD_REQUIREMENTS.maxLength) {
        errors.push(`Password must not exceed ${PASSWORD_REQUIREMENTS.maxLength} characters`);
    }

    if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }

    if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }

    if (PASSWORD_REQUIREMENTS.requireNumber && !/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }

    if (PASSWORD_REQUIREMENTS.requireSpecial) {
        const specialRegex = new RegExp(`[${PASSWORD_REQUIREMENTS.specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`);
        if (!specialRegex.test(password)) {
            errors.push('Password must contain at least one special character (!@#$%^&*...)');
        }
    }

    // Check for common passwords (basic check)
    const commonPasswords = ['password', '12345678', 'qwerty123', 'admin123', 'letmein'];
    if (commonPasswords.includes(password.toLowerCase())) {
        errors.push('Password is too common, please choose a stronger password');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}


// ============== CONFIGURATION VALIDATION ==============
const REQUIRED_ENV_VARS = [
    'ADMIN_USERNAME',
    'JWT_SECRET'
];

const RECOMMENDED_ENV_VARS = [
    'ADMIN_PASSWORD_HASH',
    'PAYPAL_CLIENT_ID',
    'PAYPAL_CLIENT_SECRET',
    'CONTACT_EMAIL_PASSWORD'
];

/**
 * Validate environment configuration on startup
 * @returns {{valid: boolean, errors: string[], warnings: string[]}} Validation result
 */
function validateConfiguration() {
    const errors = [];
    const warnings = [];

    // Check required variables
    for (const varName of REQUIRED_ENV_VARS) {
        if (!process.env[varName]) {
            // ADMIN_USERNAME has a default, so only warn
            if (varName === 'ADMIN_USERNAME') {
                warnings.push(`${varName} not set, using default value`);
            } else if (varName === 'JWT_SECRET') {
                warnings.push(`${varName} not set, using randomly generated secret (tokens will invalidate on restart)`);
            } else {
                errors.push(`Required environment variable ${varName} is not set`);
            }
        }
    }

    // Check recommended variables
    for (const varName of RECOMMENDED_ENV_VARS) {
        if (!process.env[varName]) {
            warnings.push(`Recommended: Set ${varName} for full functionality`);
        }
    }

    // Check password configuration
    if (!process.env.ADMIN_PASSWORD_HASH && !process.env.ADMIN_PASSWORD) {
        errors.push('Either ADMIN_PASSWORD_HASH or ADMIN_PASSWORD must be set');
    }

    // Warn about plain text password
    if (process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH) {
        warnings.push('ADMIN_PASSWORD is set in plain text. Generate a hash and use ADMIN_PASSWORD_HASH instead.');
    }

    // Check ports
    const httpPort = parseInt(process.env.HTTP_PORT || '3001');
    const p2pPort = parseInt(process.env.P2P_PORT || '6001');

    if (isNaN(httpPort) || httpPort < 1 || httpPort > 65535) {
        errors.push('HTTP_PORT must be a valid port number (1-65535)');
    }

    if (isNaN(p2pPort) || p2pPort < 1 || p2pPort > 65535) {
        errors.push('P2P_PORT must be a valid port number (1-65535)');
    }

    if (httpPort === p2pPort) {
        errors.push('HTTP_PORT and P2P_PORT cannot be the same');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}


// ============== STANDARDIZED ERROR CODES ==============
const ERROR_CODES = {
    // Authentication errors (1xxx)
    AUTH_REQUIRED: { code: 1001, message: 'Authentication required', status: 401 },
    AUTH_INVALID_TOKEN: { code: 1002, message: 'Invalid or expired token', status: 401 },
    AUTH_INVALID_CREDENTIALS: { code: 1003, message: 'Invalid credentials', status: 401 },
    AUTH_TOKEN_BLACKLISTED: { code: 1004, message: 'Token has been revoked', status: 401 },
    AUTH_INSUFFICIENT_PERMISSIONS: { code: 1005, message: 'Insufficient permissions', status: 403 },

    // Validation errors (2xxx)
    VALIDATION_REQUIRED_FIELD: { code: 2001, message: 'Required field missing', status: 400 },
    VALIDATION_INVALID_FORMAT: { code: 2002, message: 'Invalid format', status: 400 },
    VALIDATION_INVALID_AMOUNT: { code: 2003, message: 'Invalid amount', status: 400 },
    VALIDATION_INVALID_ADDRESS: { code: 2004, message: 'Invalid address format', status: 400 },
    VALIDATION_INVALID_SIGNATURE: { code: 2005, message: 'Invalid transaction signature', status: 400 },
    VALIDATION_PASSWORD_WEAK: { code: 2006, message: 'Password does not meet requirements', status: 400 },

    // Transaction errors (3xxx)
    TX_INSUFFICIENT_BALANCE: { code: 3001, message: 'Insufficient balance', status: 400 },
    TX_INVALID_NONCE: { code: 3002, message: 'Invalid nonce (replay protection)', status: 400 },
    TX_MEMPOOL_FULL: { code: 3003, message: 'Mempool full, increase fee', status: 503 },
    TX_EXPIRED: { code: 3004, message: 'Transaction expired', status: 400 },

    // Blockchain errors (4xxx)
    CHAIN_MAX_SUPPLY: { code: 4001, message: 'Maximum supply reached', status: 400 },
    CHAIN_INVALID_BLOCK: { code: 4002, message: 'Invalid block', status: 400 },
    CHAIN_SYNC_ERROR: { code: 4003, message: 'Blockchain sync error', status: 500 },

    // System errors (5xxx)
    SYSTEM_DATABASE_ERROR: { code: 5001, message: 'Database error', status: 500 },
    SYSTEM_INTERNAL_ERROR: { code: 5002, message: 'Internal server error', status: 500 },
    SYSTEM_NOT_CONFIGURED: { code: 5003, message: 'Service not configured', status: 503 },

    // Rate limiting (6xxx)
    RATE_LIMIT_EXCEEDED: { code: 6001, message: 'Rate limit exceeded', status: 429 },

    // CSRF (7xxx)
    CSRF_INVALID: { code: 7001, message: 'Invalid CSRF token', status: 403 }
};

/**
 * Create a standardized error response
 * @param {string} errorKey - Key from ERROR_CODES
 * @param {string} details - Additional details
 * @returns {object} Error response object
 */
function createError(errorKey, details = null) {
    const error = ERROR_CODES[errorKey] || ERROR_CODES.SYSTEM_INTERNAL_ERROR;
    return {
        success: false,
        error: {
            code: error.code,
            message: error.message,
            details: details
        },
        status: error.status
    };
}

/**
 * Send standardized error response
 * @param {object} res - Express response object
 * @param {string} errorKey - Key from ERROR_CODES
 * @param {string} details - Additional details
 */
function sendError(res, errorKey, details = null) {
    const errorResponse = createError(errorKey, details);
    res.status(errorResponse.status).json({
        success: false,
        error: errorResponse.error
    });
}


// ============== INPUT SANITIZATION ==============

/**
 * Sanitize HTML to prevent XSS
 * @param {string} input - Input string
 * @returns {string} Sanitized string
 */
function sanitizeHTML(input) {
    if (typeof input !== 'string') return input;

    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize object recursively
 * @param {object} obj - Object to sanitize
 * @returns {object} Sanitized object
 */
function sanitizeObject(obj) {
    if (typeof obj === 'string') {
        return sanitizeHTML(obj);
    }

    if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
    }

    if (obj && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            sanitized[sanitizeHTML(key)] = sanitizeObject(value);
        }
        return sanitized;
    }

    return obj;
}


module.exports = {
    // Token blacklist
    blacklistToken,
    isTokenBlacklisted,

    // CSRF
    generateCSRFToken,
    validateCSRFToken,
    csrfMiddleware,

    // Password validation
    validatePassword,
    PASSWORD_REQUIREMENTS,

    // Configuration
    validateConfiguration,

    // Error handling
    ERROR_CODES,
    createError,
    sendError,

    // Sanitization
    sanitizeHTML,
    sanitizeObject
};
