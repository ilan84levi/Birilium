/**
 * Configuration Module
 * Centralizes all application configuration with validation
 */

const path = require('path');

// Load and validate environment
const config = {
    // Server
    httpPort: parseInt(process.env.HTTP_PORT) || 3001,
    p2pPort: parseInt(process.env.P2P_PORT) || 6001,
    nodeEnv: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',

    // Security
    apiKey: process.env.API_KEY || null,
    jwtSecret: process.env.JWT_SECRET || null,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

    // Admin
    adminUsername: process.env.ADMIN_USERNAME || 'admin',
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || null,
    adminPassword: process.env.ADMIN_PASSWORD || null,

    // Database
    sqliteDbPath: process.env.SQLITE_DB_PATH || path.join(__dirname, 'data', 'birilium.db'),
    leveldbPath: process.env.LEVELDB_PATH || path.join(__dirname, 'data', 'chainstate'),

    // Blockchain
    maxMempoolSize: parseInt(process.env.MAX_MEMPOOL_SIZE) || 10000,
    maxBlockSize: parseInt(process.env.MAX_BLOCK_SIZE) || 1000,
    initialDifficulty: parseInt(process.env.INITIAL_DIFFICULTY) || 4,
    targetBlockTime: parseInt(process.env.TARGET_BLOCK_TIME) || 30000,
    enableLWMA: process.env.ENABLE_LWMA === 'true',

    // P2P
    peers: process.env.PEERS ? process.env.PEERS.split(',').filter(p => p.trim()) : [],
    maxPeers: parseInt(process.env.MAX_PEERS) || 32,
    enableP2PTLS: process.env.ENABLE_P2P_TLS === 'true',
    p2pTLSRequireClientCert: process.env.P2P_TLS_REQUIRE_CLIENT_CERT === 'true',
    p2pTLSCACert: process.env.P2P_TLS_CA_CERT || path.join(__dirname, 'certs', 'ca-cert.pem'),

    // PayPal
    paypalMode: process.env.PAYPAL_MODE || 'sandbox',
    paypalClientId: process.env.PAYPAL_CLIENT_ID || null,
    paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET || null,
    paypalPlanId: process.env.PAYPAL_PLAN_ID || null,

    // Email
    contactEmail: process.env.CONTACT_EMAIL || 'biriliumcoin@gmail.com',
    contactEmailPassword: process.env.CONTACT_EMAIL_PASSWORD || null,

    // Logging
    logLevel: process.env.LOG_LEVEL || 'info',
    logFile: process.env.LOG_FILE || path.join(__dirname, 'logs', 'node.log'),

    // Feature flags
    features: {
        darkMode: true,
        multiWallet: true,
        addressBook: true,
        transactionNotes: true,
        miningStats: true,
        priceFeeds: false, // Not implemented yet
        hardwareWallet: false, // Not implemented yet
        multiSig: false // Not implemented yet
    },

    // Rate limiting
    rateLimits: {
        general: {
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100
        },
        mining: {
            windowMs: 60 * 1000, // 1 minute
            max: 30
        },
        login: {
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 5 // 5 login attempts per 15 minutes
        }
    },

    // Version info
    version: '2.2.0',
    nodeVersion: process.version,
    buildDate: new Date().toISOString()
};

/**
 * Get configuration value
 * @param {string} key - Configuration key (dot notation supported)
 * @param {*} defaultValue - Default value if not found
 * @returns {*} Configuration value
 */
function get(key, defaultValue = null) {
    const keys = key.split('.');
    let value = config;

    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            return defaultValue;
        }
    }

    return value !== undefined ? value : defaultValue;
}

/**
 * Check if a feature is enabled
 * @param {string} feature - Feature name
 * @returns {boolean} True if enabled
 */
function isFeatureEnabled(feature) {
    return config.features[feature] === true;
}

/**
 * Get all configuration (for debugging)
 * @returns {object} Configuration object (with secrets redacted)
 */
function getAll() {
    const redacted = JSON.parse(JSON.stringify(config));

    // Redact sensitive values
    if (redacted.jwtSecret) redacted.jwtSecret = '[REDACTED]';
    if (redacted.apiKey) redacted.apiKey = '[REDACTED]';
    if (redacted.adminPasswordHash) redacted.adminPasswordHash = '[REDACTED]';
    if (redacted.adminPassword) redacted.adminPassword = '[REDACTED]';
    if (redacted.paypalClientSecret) redacted.paypalClientSecret = '[REDACTED]';
    if (redacted.contactEmailPassword) redacted.contactEmailPassword = '[REDACTED]';

    return redacted;
}

module.exports = {
    ...config,
    get,
    isFeatureEnabled,
    getAll
};
