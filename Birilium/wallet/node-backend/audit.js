/**
 * Audit Logging System
 * Tracks all admin actions for security and compliance
 */

const logger = require('./logger');

let database = null;

/**
 * Initialize audit logging with database connection
 * @param {object} db - Database instance
 */
function initialize(db) {
    database = db;

    // Create audit_log table if it doesn't exist
    if (database && database.isConnected) {
        try {
            database.db.exec(`
                CREATE TABLE IF NOT EXISTS audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp INTEGER NOT NULL,
                    actor TEXT NOT NULL,
                    action TEXT NOT NULL,
                    target TEXT,
                    metadata TEXT,
                    ipAddress TEXT,
                    userAgent TEXT,
                    success INTEGER NOT NULL DEFAULT 1
                )
            `);

            // Create indexes for performance
            database.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
                CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);
                CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
            `);

            console.log('✓ Audit logging initialized');
        } catch (error) {
            console.error('Error initializing audit log table:', error.message);
        }
    }
}

/**
 * Log an audit event
 * @param {string} actor - Username of the user performing the action
 * @param {string} action - Action being performed (e.g., 'LOGIN', 'RESTART_NODE')
 * @param {string} target - Target of the action (optional)
 * @param {object} metadata - Additional metadata (optional)
 * @param {boolean} success - Whether the action succeeded
 * @param {object} req - Express request object (optional)
 * @returns {Promise<boolean>} True if logged successfully
 */
async function logAudit(actor, action, target = null, metadata = {}, success = true, req = null) {
    const entry = {
        timestamp: Date.now(),
        actor: actor,
        action: action,
        target: target,
        metadata: JSON.stringify(metadata),
        ipAddress: req?.ip || req?.connection?.remoteAddress || null,
        userAgent: req?.headers?.['user-agent'] || null,
        success: success ? 1 : 0
    };

    try {
        // Log to database if available
        if (database && database.isConnected) {
            const stmt = database.db.prepare(`
                INSERT INTO audit_log
                (timestamp, actor, action, target, metadata, ipAddress, userAgent, success)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                entry.timestamp,
                entry.actor,
                entry.action,
                entry.target,
                entry.metadata,
                entry.ipAddress,
                entry.userAgent,
                entry.success
            );
        }

        // Always log to application logs
        const logData = {
            audit: true,
            actor: entry.actor,
            action: entry.action,
            target: entry.target,
            success: entry.success,
            ip: entry.ipAddress
        };

        if (entry.success) {
            logger.info(logData, `Audit: ${action} by ${actor}`);
        } else {
            logger.warn(logData, `Audit (FAILED): ${action} by ${actor}`);
        }

        return true;
    } catch (error) {
        logger.error({ error: error.message }, 'Failed to log audit entry');
        return false;
    }
}

/**
 * Query audit log
 * @param {object} filters - Query filters {actor, action, from, to, limit, offset}
 * @returns {Promise<Array>} Array of audit log entries
 */
async function queryAuditLog(filters = {}) {
    if (!database || !database.isConnected) {
        return [];
    }

    try {
        let query = 'SELECT * FROM audit_log WHERE 1=1';
        const params = [];

        // Filter by actor
        if (filters.actor) {
            query += ' AND actor = ?';
            params.push(filters.actor);
        }

        // Filter by action
        if (filters.action) {
            query += ' AND action = ?';
            params.push(filters.action);
        }

        // Filter by date range
        if (filters.from) {
            query += ' AND timestamp >= ?';
            params.push(filters.from);
        }

        if (filters.to) {
            query += ' AND timestamp <= ?';
            params.push(filters.to);
        }

        // Filter by success/failure
        if (filters.success !== undefined) {
            query += ' AND success = ?';
            params.push(filters.success ? 1 : 0);
        }

        // Order by timestamp descending (newest first)
        query += ' ORDER BY timestamp DESC';

        // Pagination
        const limit = filters.limit || 100;
        const offset = filters.offset || 0;
        query += ' LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const stmt = database.db.prepare(query);
        const entries = stmt.all(...params);

        // Parse metadata JSON
        return entries.map(entry => ({
            ...entry,
            metadata: entry.metadata ? JSON.parse(entry.metadata) : {},
            success: entry.success === 1,
            timestamp: new Date(entry.timestamp).toISOString()
        }));
    } catch (error) {
        logger.error({ error: error.message }, 'Failed to query audit log');
        return [];
    }
}

/**
 * Get audit log statistics
 * @returns {Promise<object>} Statistics about audit log
 */
async function getAuditStats() {
    if (!database || !database.isConnected) {
        return null;
    }

    try {
        const stats = {};

        // Total entries
        const total = database.db.prepare('SELECT COUNT(*) as count FROM audit_log').get();
        stats.totalEntries = total.count;

        // Entries by action (top 10)
        const byAction = database.db.prepare(`
            SELECT action, COUNT(*) as count
            FROM audit_log
            GROUP BY action
            ORDER BY count DESC
            LIMIT 10
        `).all();
        stats.topActions = byAction;

        // Entries by actor (top 10)
        const byActor = database.db.prepare(`
            SELECT actor, COUNT(*) as count
            FROM audit_log
            GROUP BY actor
            ORDER BY count DESC
            LIMIT 10
        `).all();
        stats.topActors = byActor;

        // Success rate
        const successRate = database.db.prepare(`
            SELECT
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
            FROM audit_log
        `).get();
        stats.successRate = {
            successful: successRate.successful || 0,
            failed: successRate.failed || 0,
            percentage: successRate.successful
                ? (successRate.successful / (successRate.successful + successRate.failed) * 100).toFixed(2)
                : 0
        };

        // Recent activity (last 24 hours)
        const yesterday = Date.now() - (24 * 60 * 60 * 1000);
        const recent = database.db.prepare(`
            SELECT COUNT(*) as count
            FROM audit_log
            WHERE timestamp >= ?
        `).get(yesterday);
        stats.last24Hours = recent.count;

        return stats;
    } catch (error) {
        logger.error({ error: error.message }, 'Failed to get audit stats');
        return null;
    }
}

/**
 * Middleware to automatically log admin actions
 * @param {string} action - Action name
 * @returns {function} Express middleware
 */
function auditMiddleware(action) {
    return async (req, res, next) => {
        // Store original send function
        const originalSend = res.send;

        // Override send to capture response
        res.send = function(data) {
            // Determine success based on status code
            const success = res.statusCode >= 200 && res.statusCode < 400;

            // Log the audit entry
            logAudit(
                req.user?.username || 'anonymous',
                action,
                req.params?.id || req.body?.target || null,
                {
                    method: req.method,
                    url: req.originalUrl,
                    body: req.body,
                    statusCode: res.statusCode
                },
                success,
                req
            );

            // Call original send
            originalSend.call(this, data);
        };

        next();
    };
}

module.exports = {
    initialize,
    logAudit,
    queryAuditLog,
    getAuditStats,
    auditMiddleware
};
