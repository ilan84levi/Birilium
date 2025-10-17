// Structured Logging Module (Phase 2.5)
// Pino logger with secret redaction and production-ready configuration

const pino = require('pino');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ========== CONFIGURATION ==========

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Use user's home directory for logs instead of app directory (fixes Windows permissions)
const defaultLogDir = path.join(os.homedir(), '.birilium', 'logs');
const LOG_FILE = process.env.LOG_FILE || path.join(defaultLogDir, 'node.log');
const NODE_ENV = process.env.NODE_ENV || 'development';

// Create logs directory if it doesn't exist
const logsDir = path.dirname(LOG_FILE);
try {
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
} catch (error) {
    console.error('Warning: Could not create logs directory:', error.message);
    console.error('Logs will only be written to console');
}

// ========== SECRET REDACTION ==========

const REDACT_PATHS = [
    'password',
    'privateKey',
    'encryptedPrivateKey',
    'signature',
    'apiKey',
    'API_KEY',
    'NODE_PRIVATE_KEY',
    'mnemonic',
    'seed',
    '*.password',
    '*.privateKey',
    '*.signature',
    '*.apiKey',
    'req.headers["x-api-key"]',
    'req.headers.authorization'
];

// ========== PINO CONFIGURATION ==========

const pinoConfig = {
    level: LOG_LEVEL,
    redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]'
    },
    formatters: {
        level: (label) => {
            return { level: label.toUpperCase() };
        },
        bindings: (bindings) => {
            return {
                pid: bindings.pid,
                hostname: bindings.hostname,
                node_version: process.version
            };
        }
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
        req: (req) => ({
            method: req.method,
            url: req.url,
            headers: {
                host: req.headers.host,
                'user-agent': req.headers['user-agent']
                // API key and authorization intentionally excluded
            },
            remoteAddress: req.socket?.remoteAddress,
            remotePort: req.socket?.remotePort
        }),
        res: (res) => ({
            statusCode: res.statusCode,
            headers: res.getHeaders ? res.getHeaders() : {}
        }),
        err: pino.stdSerializers.err
    }
};

// ========== TRANSPORT CONFIGURATION ==========

let transport;
let canWriteLogs = false;

// Test if we can write to the logs directory
try {
    if (fs.existsSync(logsDir)) {
        // Test write permissions
        const testFile = path.join(logsDir, '.test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        canWriteLogs = true;
    }
} catch (error) {
    // Cannot write to logs directory
    canWriteLogs = false;
}

if (NODE_ENV === 'development') {
    // Pretty print for development
    transport = {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname,node_version',
            singleLine: false,
            messageFormat: '{levelLabel} - {msg}'
        }
    };
} else {
    // File rotation for production (only if we can write logs)
    if (canWriteLogs) {
        transport = {
            targets: [
                {
                    target: 'pino/file',
                    options: {
                        destination: LOG_FILE,
                        mkdir: true
                    }
                },
                {
                    target: 'pino-pretty',
                    level: 'error',
                    options: {
                        colorize: true,
                        destination: 2 // stderr
                    }
                }
            ]
        };
    } else {
        // Console only if we can't write logs
        transport = {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                destination: 1 // stdout
            }
        };
    }
}

// ========== CREATE LOGGER ==========

const logger = pino(pinoConfig, pino.transport(transport));

// ========== CUSTOM LOG METHODS ==========

/**
 * Log blockchain event
 */
logger.blockchain = (event, data = {}) => {
    logger.info({
        event: 'blockchain',
        action: event,
        ...data
    }, `[BLOCKCHAIN] ${event}`);
};

/**
 * Log P2P event
 */
logger.p2p = (event, data = {}) => {
    logger.info({
        event: 'p2p',
        action: event,
        ...data
    }, `[P2P] ${event}`);
};

/**
 * Log transaction event
 */
logger.transaction = (event, data = {}) => {
    logger.info({
        event: 'transaction',
        action: event,
        txHash: data.hash,
        from: data.from ? data.from.substring(0, 16) + '...' : undefined,
        to: data.to ? data.to.substring(0, 16) + '...' : undefined,
        amount: data.amount,
        fee: data.fee
    }, `[TX] ${event}`);
};

/**
 * Log mining event
 */
logger.mining = (event, data = {}) => {
    logger.info({
        event: 'mining',
        action: event,
        ...data
    }, `[MINING] ${event}`);
};

/**
 * Log security event
 */
logger.security = (event, data = {}) => {
    logger.warn({
        event: 'security',
        action: event,
        ...data
    }, `[SECURITY] ${event}`);
};

/**
 * Log performance metrics
 */
logger.performance = (operation, duration, data = {}) => {
    logger.info({
        event: 'performance',
        operation,
        duration_ms: duration,
        ...data
    }, `[PERF] ${operation} took ${duration}ms`);
};

// ========== HELPER FUNCTIONS ==========

/**
 * Create child logger with context
 */
logger.child = (bindings) => {
    return pino(pinoConfig, pino.transport(transport)).child(bindings);
};

/**
 * Log startup information
 */
logger.startup = (config) => {
    logger.info({
        event: 'startup',
        config: {
            httpPort: config.httpPort,
            p2pPort: config.p2pPort,
            nodeEnv: config.nodeEnv,
            difficulty: config.difficulty,
            maxSupply: config.maxSupply
        }
    }, 'Birilium Node Starting');
};

/**
 * Log shutdown
 */
logger.shutdown = (reason) => {
    logger.info({
        event: 'shutdown',
        reason
    }, 'Birilium Node Shutting Down');
};

// ========== EXPORTS ==========

module.exports = logger;
