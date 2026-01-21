/**
 * Cache Module - In-memory caching for performance
 * Caches blocks, balances, and frequently accessed data
 */

const logger = require('./logger');

class LRUCache {
    constructor(maxSize = 1000, ttlMs = 5 * 60 * 1000) {
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0
        };
    }

    /**
     * Get value from cache
     * @param {string} key - Cache key
     * @returns {*} Cached value or undefined
     */
    get(key) {
        const item = this.cache.get(key);

        if (!item) {
            this.stats.misses++;
            return undefined;
        }

        // Check TTL
        if (Date.now() > item.expiresAt) {
            this.cache.delete(key);
            this.stats.misses++;
            return undefined;
        }

        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, item);

        this.stats.hits++;
        return item.value;
    }

    /**
     * Set value in cache
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttlMs - Custom TTL in milliseconds (optional)
     */
    set(key, value, ttlMs = null) {
        // Remove oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
            this.stats.evictions++;
        }

        this.cache.set(key, {
            value,
            expiresAt: Date.now() + (ttlMs || this.ttlMs)
        });
    }

    /**
     * Delete from cache
     * @param {string} key - Cache key
     */
    delete(key) {
        this.cache.delete(key);
    }

    /**
     * Clear entire cache
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Get cache statistics
     * @returns {object} Statistics
     */
    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0
            ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
            : 0;

        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.stats.hits,
            misses: this.stats.misses,
            evictions: this.stats.evictions,
            hitRate: `${hitRate}%`
        };
    }
}

// Specialized caches
const blockCache = new LRUCache(100, 10 * 60 * 1000); // 100 blocks, 10 min TTL
const balanceCache = new LRUCache(10000, 30 * 1000); // 10k addresses, 30 sec TTL
const transactionCache = new LRUCache(1000, 60 * 1000); // 1k transactions, 1 min TTL
const statsCache = new LRUCache(10, 5 * 1000); // Stats, 5 sec TTL

/**
 * Cache middleware for Express routes
 * @param {string} cacheKey - Cache key prefix
 * @param {number} ttlMs - TTL in milliseconds
 * @returns {function} Express middleware
 */
function cacheMiddleware(cacheKey, ttlMs = 5000) {
    return (req, res, next) => {
        const key = `${cacheKey}:${req.originalUrl}`;
        const cached = statsCache.get(key);

        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json(cached);
        }

        // Store original json method
        const originalJson = res.json.bind(res);

        // Override json method to cache response
        res.json = (data) => {
            statsCache.set(key, data, ttlMs);
            res.set('X-Cache', 'MISS');
            return originalJson(data);
        };

        next();
    };
}

/**
 * Invalidate related caches when blockchain changes
 * @param {string} event - Event type ('block_mined', 'transaction_added')
 * @param {object} data - Event data
 */
function invalidateOnChange(event, data) {
    switch (event) {
        case 'block_mined':
            // Invalidate block and stats caches
            blockCache.clear();
            statsCache.clear();
            balanceCache.clear(); // Balances change on new block
            logger.debug('Cache invalidated: block_mined');
            break;

        case 'transaction_added':
            // Invalidate transaction-related caches
            transactionCache.clear();
            statsCache.clear();
            if (data?.fromAddress) {
                balanceCache.delete(`balance:${data.fromAddress}`);
            }
            if (data?.toAddress) {
                balanceCache.delete(`balance:${data.toAddress}`);
            }
            logger.debug('Cache invalidated: transaction_added');
            break;

        case 'chain_sync':
            // Invalidate all caches on chain sync
            blockCache.clear();
            balanceCache.clear();
            transactionCache.clear();
            statsCache.clear();
            logger.debug('Cache invalidated: chain_sync');
            break;
    }
}

/**
 * Get all cache statistics
 * @returns {object} All cache stats
 */
function getAllCacheStats() {
    return {
        blocks: blockCache.getStats(),
        balances: balanceCache.getStats(),
        transactions: transactionCache.getStats(),
        stats: statsCache.getStats()
    };
}

module.exports = {
    LRUCache,
    blockCache,
    balanceCache,
    transactionCache,
    statsCache,
    cacheMiddleware,
    invalidateOnChange,
    getAllCacheStats
};
