// Prometheus Metrics Module (Phase 2.5)
// Production-grade metrics for monitoring and alerting

// ========== IN-MEMORY METRICS STORE ==========
// Using simple in-memory implementation for now
// For production, consider prom-client library

class MetricsCollector {
    constructor() {
        // Counters (monotonically increasing)
        this.counters = {
            blocks_mined_total: 0,
            transactions_processed_total: 0,
            transactions_rejected_total: 0,
            p2p_messages_received_total: 0,
            p2p_messages_sent_total: 0,
            p2p_connections_total: 0,
            p2p_bans_total: 0,
            chain_reorgs_total: 0,
            mining_attempts_total: 0,
            api_requests_total: {}  // by endpoint
        };

        // Gauges (can go up or down)
        this.gauges = {
            chain_length: 0,
            difficulty: 0,
            mempool_size: 0,
            mempool_bytes: 0,
            connected_peers: 0,
            banned_peers: 0,
            current_supply: 0,
            balance_cache_size: 0,
            nonce_cache_size: 0
        };

        // Histograms (track distribution)
        this.histograms = {
            block_time_seconds: [],
            transaction_confirmation_time_seconds: [],
            mining_duration_seconds: [],
            api_response_time_ms: [],
            block_size_bytes: [],
            block_transaction_count: []
        };

        // Summary (track time windows)
        this.summaries = {
            last_block_time: null,
            last_mined_block: null,
            avg_block_time_5m: 0,
            avg_mempool_size_5m: 0,
            avg_peers_5m: 0
        };

        // Time series data (last 100 entries)
        this.timeSeries = {
            blockTimes: [],
            mempoolSizes: [],
            peerCounts: [],
            difficulties: []
        };

        this.maxTimeSeriesLength = 100;
    }

    // ========== COUNTERS ==========

    incrementCounter(name, value = 1) {
        if (this.counters.hasOwnProperty(name)) {
            this.counters[name] += value;
        }
    }

    incrementAPIRequest(endpoint) {
        if (!this.counters.api_requests_total[endpoint]) {
            this.counters.api_requests_total[endpoint] = 0;
        }
        this.counters.api_requests_total[endpoint]++;
    }

    // ========== GAUGES ==========

    setGauge(name, value) {
        if (this.gauges.hasOwnProperty(name)) {
            this.gauges[name] = value;
        }
    }

    incrementGauge(name, value = 1) {
        if (this.gauges.hasOwnProperty(name)) {
            this.gauges[name] += value;
        }
    }

    decrementGauge(name, value = 1) {
        if (this.gauges.hasOwnProperty(name)) {
            this.gauges[name] = Math.max(0, this.gauges[name] - value);
        }
    }

    // ========== HISTOGRAMS ==========

    recordHistogram(name, value) {
        if (this.histograms.hasOwnProperty(name)) {
            this.histograms[name].push(value);
            // Keep only last 1000 values
            if (this.histograms[name].length > 1000) {
                this.histograms[name].shift();
            }
        }
    }

    // ========== TIME SERIES ==========

    recordTimeSeries(name, value) {
        if (this.timeSeries.hasOwnProperty(name)) {
            this.timeSeries[name].push({
                value,
                timestamp: Date.now()
            });
            // Keep only last N entries
            if (this.timeSeries[name].length > this.maxTimeSeriesLength) {
                this.timeSeries[name].shift();
            }
        }
    }

    // ========== CALCULATIONS ==========

    calculatePercentile(values, percentile) {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[index];
    }

    calculateAverage(values) {
        if (values.length === 0) return 0;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    // ========== BLOCKCHAIN METRICS ==========

    recordBlockMined(block, miningDuration) {
        this.incrementCounter('blocks_mined_total');
        this.incrementCounter('mining_attempts_total');
        this.setGauge('chain_length', this.gauges.chain_length + 1);
        this.setGauge('difficulty', block.difficulty || this.gauges.difficulty);

        const blockTime = block.timestamp - (this.summaries.last_block_time || block.timestamp);
        if (this.summaries.last_block_time) {
            this.recordHistogram('block_time_seconds', blockTime / 1000);
            this.recordTimeSeries('blockTimes', blockTime / 1000);
        }
        this.summaries.last_block_time = block.timestamp;
        this.summaries.last_mined_block = Date.now();

        this.recordHistogram('mining_duration_seconds', miningDuration / 1000);
        this.recordHistogram('block_size_bytes', JSON.stringify(block).length);
        this.recordHistogram('block_transaction_count', block.transactions.length);

        this.incrementCounter('transactions_processed_total', block.transactions.length);
    }

    recordTransactionAdded(tx) {
        this.incrementGauge('mempool_size');
        this.setGauge('mempool_bytes', this.gauges.mempool_bytes + JSON.stringify(tx).length);
        this.recordTimeSeries('mempoolSizes', this.gauges.mempool_size);
    }

    recordTransactionRejected(reason) {
        this.incrementCounter('transactions_rejected_total');
    }

    recordChainReorg(oldLength, newLength) {
        this.incrementCounter('chain_reorgs_total');
        this.setGauge('chain_length', newLength);
    }

    // ========== P2P METRICS ==========

    recordPeerConnected() {
        this.incrementCounter('p2p_connections_total');
        this.incrementGauge('connected_peers');
        this.recordTimeSeries('peerCounts', this.gauges.connected_peers);
    }

    recordPeerDisconnected() {
        this.decrementGauge('connected_peers');
        this.recordTimeSeries('peerCounts', this.gauges.connected_peers);
    }

    recordPeerBanned() {
        this.incrementCounter('p2p_bans_total');
        this.incrementGauge('banned_peers');
    }

    recordMessageReceived() {
        this.incrementCounter('p2p_messages_received_total');
    }

    recordMessageSent() {
        this.incrementCounter('p2p_messages_sent_total');
    }

    // ========== API METRICS ==========

    recordAPIRequest(endpoint, duration) {
        this.incrementAPIRequest(endpoint);
        this.recordHistogram('api_response_time_ms', duration);
    }

    // ========== STATE UPDATES ==========

    updateBlockchainState(blockchain) {
        this.setGauge('chain_length', blockchain.chain.length);
        this.setGauge('difficulty', blockchain.difficulty);
        this.setGauge('mempool_size', blockchain.pendingTransactions.length);
        this.setGauge('current_supply', blockchain.currentSupply);
        this.setGauge('balance_cache_size', blockchain.balanceCache.size);
        this.setGauge('nonce_cache_size', blockchain.accountNonces.size);

        // Calculate mempool bytes
        let mempoolBytes = 0;
        for (const tx of blockchain.pendingTransactions) {
            mempoolBytes += JSON.stringify(tx).length;
        }
        this.setGauge('mempool_bytes', mempoolBytes);

        this.recordTimeSeries('difficulties', blockchain.difficulty);
    }

    // ========== EXPORT METRICS ==========

    getMetrics() {
        return {
            counters: this.counters,
            gauges: this.gauges,
            histograms: this.getHistogramStats(),
            summaries: this.getSummaries()
        };
    }

    getHistogramStats() {
        const stats = {};
        for (const [name, values] of Object.entries(this.histograms)) {
            if (values.length === 0) {
                stats[name] = { count: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
            } else {
                stats[name] = {
                    count: values.length,
                    avg: this.calculateAverage(values),
                    p50: this.calculatePercentile(values, 50),
                    p95: this.calculatePercentile(values, 95),
                    p99: this.calculatePercentile(values, 99),
                    min: Math.min(...values),
                    max: Math.max(...values)
                };
            }
        }
        return stats;
    }

    getSummaries() {
        // Calculate 5-minute averages
        const now = Date.now();
        const fiveMinutesAgo = now - 5 * 60 * 1000;

        const recentBlockTimes = this.timeSeries.blockTimes
            .filter(entry => entry.timestamp > fiveMinutesAgo)
            .map(entry => entry.value);

        const recentMempoolSizes = this.timeSeries.mempoolSizes
            .filter(entry => entry.timestamp > fiveMinutesAgo)
            .map(entry => entry.value);

        const recentPeerCounts = this.timeSeries.peerCounts
            .filter(entry => entry.timestamp > fiveMinutesAgo)
            .map(entry => entry.value);

        return {
            ...this.summaries,
            avg_block_time_5m: this.calculateAverage(recentBlockTimes),
            avg_mempool_size_5m: this.calculateAverage(recentMempoolSizes),
            avg_peers_5m: this.calculateAverage(recentPeerCounts),
            time_since_last_block: this.summaries.last_mined_block
                ? (now - this.summaries.last_mined_block) / 1000
                : null
        };
    }

    // ========== PROMETHEUS FORMAT ==========

    toPrometheusFormat() {
        const lines = [];
        const timestamp = Date.now();

        // Counters
        for (const [name, value] of Object.entries(this.counters)) {
            if (typeof value === 'object') {
                for (const [endpoint, count] of Object.entries(value)) {
                    lines.push(`# TYPE birilium_${name} counter`);
                    lines.push(`birilium_${name}{endpoint="${endpoint}"} ${count} ${timestamp}`);
                }
            } else {
                lines.push(`# TYPE birilium_${name} counter`);
                lines.push(`birilium_${name} ${value} ${timestamp}`);
            }
        }

        // Gauges
        for (const [name, value] of Object.entries(this.gauges)) {
            lines.push(`# TYPE birilium_${name} gauge`);
            lines.push(`birilium_${name} ${value} ${timestamp}`);
        }

        // Histogram stats
        const histStats = this.getHistogramStats();
        for (const [name, stats] of Object.entries(histStats)) {
            lines.push(`# TYPE birilium_${name} summary`);
            lines.push(`birilium_${name}{quantile="0.5"} ${stats.p50} ${timestamp}`);
            lines.push(`birilium_${name}{quantile="0.95"} ${stats.p95} ${timestamp}`);
            lines.push(`birilium_${name}{quantile="0.99"} ${stats.p99} ${timestamp}`);
            lines.push(`birilium_${name}_count ${stats.count} ${timestamp}`);
        }

        return lines.join('\n');
    }
}

// ========== SINGLETON INSTANCE ==========

const metrics = new MetricsCollector();

// ========== EXPORTS ==========

module.exports = metrics;
