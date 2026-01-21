/**
 * Authentication Module with JWT
 * Provides secure authentication for admin panel
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Get JWT configuration from environment
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Warn if using default JWT secret
if (!process.env.JWT_SECRET) {
    console.warn('⚠️  WARNING: JWT_SECRET not set in .env. Using randomly generated secret.');
    console.warn('   Add to .env: JWT_SECRET=' + JWT_SECRET);
}

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password) {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against a hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} True if password matches
 */
async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

/**
 * Generate JWT access token
 * @param {object} user - User object {username, role}
 * @returns {string} JWT token
 */
function generateAccessToken(user) {
    return jwt.sign(
        {
            username: user.username,
            role: user.role || 'admin',
            type: 'access'
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

/**
 * Generate JWT refresh token
 * @param {object} user - User object {username}
 * @returns {string} JWT refresh token
 */
function generateRefreshToken(user) {
    return jwt.sign(
        {
            username: user.username,
            type: 'refresh'
        },
        JWT_SECRET,
        { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );
}

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token
 * @returns {object|null} Decoded token payload or null if invalid
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

/**
 * Middleware to authenticate JWT token
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Next middleware
 */
function authenticateJWT(req, res, next) {
    // Get token from Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.substring(7)
        : null;

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Missing authentication token',
            code: 'NO_TOKEN'
        });
    }

    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token',
            code: 'INVALID_TOKEN'
        });
    }

    if (decoded.type !== 'access') {
        return res.status(401).json({
            success: false,
            error: 'Invalid token type',
            code: 'INVALID_TOKEN_TYPE'
        });
    }

    // Attach user info to request
    req.user = {
        username: decoded.username,
        role: decoded.role
    };

    next();
}

/**
 * Middleware to require specific role
 * @param {string} requiredRole - Required role (admin, viewer, etc.)
 * @returns {function} Express middleware
 */
function requireRole(requiredRole) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Not authenticated',
                code: 'NOT_AUTHENTICATED'
            });
        }

        // Admin role can access everything
        if (req.user.role === 'admin') {
            return next();
        }

        // Check if user has required role
        if (req.user.role !== requiredRole) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions',
                code: 'INSUFFICIENT_PERMISSIONS',
                details: `Required role: ${requiredRole}, your role: ${req.user.role}`
            });
        }

        next();
    };
}

/**
 * Middleware to require admin role
 */
const requireAdmin = requireRole('admin');

/**
 * Generate a secure random API key
 * @returns {string} Random API key
 */
function generateApiKey() {
    return crypto.randomBytes(32).toString('hex');
}

module.exports = {
    hashPassword,
    verifyPassword,
    generateAccessToken,
    generateRefreshToken,
    verifyToken,
    authenticateJWT,
    requireRole,
    requireAdmin,
    generateApiKey,
    JWT_SECRET
};
