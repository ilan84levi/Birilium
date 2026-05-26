// P2P Security Module - Message validation, rate limiting, ban scores
const { z } = require('zod');
const crypto = require('crypto');
const secp256k1 = require('@noble/secp256k1');
const { sha256 } = require('@noble/hashes/sha2.js');
const { hmac } = require('@noble/hashes/hmac.js');
const { bytesToHex, hexToBytes, utf8ToBytes } = require('@noble/hashes/utils.js');

// Configure hash functions for secp256k1 v3
secp256k1.hashes.sha256 = sha256;
secp256k1.hashes.hmacSha256 = (key, ...msgs) => hmac(sha256, key, ...msgs);

// ========== MESSAGE SCHEMAS (Zod Validation) ==========

const MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2,
    NEW_TRANSACTION: 3,
    NEW_BLOCK: 4,
    HANDSHAKE: 5,
    PONG: 6
};

// Transaction schema
const TransactionSchema = z.object({
    fromAddress: z.string().nullable(),
    toAddress: z.string().min(1),
    amount: z.number().positive(),
    fee: z.number().min(0).optional(),
    nonce: z.number().int().min(0).optional(),
    timestamp: z.number().int().positive(),
    signature: z.string().nullable()
});

// Block schema - use passthrough to allow extra fields (index, difficulty, etc.)
const BlockSchema = z.object({
    timestamp: z.number().int().positive(),
    transactions: z.array(TransactionSchema),
    previousHash: z.string(),
    hash: z.string(),
    nonce: z.number().int().min(0)
}).passthrough();

// Handshake schema
const HandshakeSchema = z.object({
    nodeId: z.string().length(130), // ECDSA public key (hex)
    timestamp: z.number().int().positive(),
    version: z.string(),
    signature: z.string()
});

// Message schemas
const MessageSchemas = {
    [MessageType.QUERY_LATEST]: z.object({
        type: z.literal(MessageType.QUERY_LATEST)
    }),
    [MessageType.QUERY_ALL]: z.object({
        type: z.literal(MessageType.QUERY_ALL)
    }),
    [MessageType.RESPONSE_BLOCKCHAIN]: z.object({
        type: z.literal(MessageType.RESPONSE_BLOCKCHAIN),
        data: z.array(BlockSchema)
    }),
    [MessageType.NEW_TRANSACTION]: z.object({
        type: z.literal(MessageType.NEW_TRANSACTION),
        data: TransactionSchema
    }),
    [MessageType.NEW_BLOCK]: z.object({
        type: z.literal(MessageType.NEW_BLOCK),
        data: BlockSchema
    }),
    [MessageType.HANDSHAKE]: z.object({
        type: z.literal(MessageType.HANDSHAKE),
        data: HandshakeSchema
    }),
    [MessageType.PONG]: z.object({
        type: z.literal(MessageType.PONG),
        timestamp: z.number().int().positive()
    })
};

// ========== MESSAGE VALIDATION ==========

const MAX_MESSAGE_SIZE = 10 * 1024 * 1024; // 10 MB

function validateMessage(data) {
    // Size check
    if (data.length > MAX_MESSAGE_SIZE) {
        throw new Error(`Message size ${data.length} exceeds limit ${MAX_MESSAGE_SIZE}`);
    }

    // Parse JSON
    let message;
    try {
        message = JSON.parse(data);
    } catch (err) {
        throw new Error('Invalid JSON: ' + err.message);
    }

    // Validate message type exists
    if (typeof message.type !== 'number') {
        throw new Error('Missing or invalid message type');
    }

    // Validate against schema
    const schema = MessageSchemas[message.type];
    if (!schema) {
        throw new Error(`Unknown message type: ${message.type}`);
    }

    const result = schema.safeParse(message);
    if (!result.success) {
        throw new Error('Schema validation failed: ' + result.error.message);
    }

    return result.data;
}

// ========== HANDSHAKE VERIFICATION ==========

function createHandshake(nodePrivateKey, version = '2.1.0') {
    const privateKeyBytes = hexToBytes(nodePrivateKey);
    const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, false); // uncompressed
    const nodeId = bytesToHex(publicKeyBytes);
    const timestamp = Date.now();

    // Sign handshake - @noble/secp256k1 v3 returns Uint8Array directly
    const message = nodeId + timestamp + version;
    const msgHash = sha256(utf8ToBytes(message));
    const sigBytes = secp256k1.sign(msgHash, privateKeyBytes);
    const signature = bytesToHex(sigBytes);

    return {
        nodeId,
        timestamp,
        version,
        signature
    };
}

function verifyHandshake(handshake, maxClockDrift = 300000) {
    // Validate timestamp (within 5 minutes)
    const now = Date.now();
    if (Math.abs(now - handshake.timestamp) > maxClockDrift) {
        throw new Error('Handshake timestamp too far from current time');
    }

    // Verify signature
    const message = handshake.nodeId + handshake.timestamp + handshake.version;
    const msgHash = sha256(utf8ToBytes(message));

    try {
        const sigBytes = hexToBytes(handshake.signature);
        const publicKeyBytes = hexToBytes(handshake.nodeId);
        // @noble/secp256k1 v3: verify accepts Uint8Array directly
        const valid = secp256k1.verify(sigBytes, msgHash, publicKeyBytes);
        if (!valid) {
            throw new Error('Invalid handshake signature');
        }
    } catch (err) {
        throw new Error('Handshake verification failed: ' + err.message);
    }

    return true;
}

// ========== RATE LIMITING ==========

class RateLimiter {
    constructor(maxPerSecond = 100) {
        this.maxPerSecond = maxPerSecond;
        this.counters = new Map(); // peerId -> { count, resetAt }
    }

    checkLimit(peerId) {
        const now = Date.now();
        const counter = this.counters.get(peerId);

        if (!counter || now > counter.resetAt) {
            // New window
            this.counters.set(peerId, {
                count: 1,
                resetAt: now + 1000
            });
            return true;
        }

        if (counter.count >= this.maxPerSecond) {
            return false; // Rate limit exceeded
        }

        counter.count++;
        return true;
    }

    reset(peerId) {
        this.counters.delete(peerId);
    }
}

// ========== BAN SCORE SYSTEM ==========

class BanScoreManager {
    constructor(banThreshold = 100) {
        this.banThreshold = banThreshold;
        this.scores = new Map(); // peerId -> { score, lastIncrement }
        // peerId -> bannedAt ms. Was a Set; switched to Map so we can expire
        // bans after BAN_TTL_MS instead of accumulating forever (the Set had
        // no eviction, so it was an unbounded memory leak on a long-running
        // node).
        this.bannedPeers = new Map();
        this.BAN_TTL_MS = 24 * 60 * 60 * 1000; // 24h ban
        this.MAX_BANNED = 10000;               // hard cap as a defence-in-depth
        this.decayInterval = 60000; // Decay scores every minute
        this.decayAmount = 10; // Decay 10 points per minute

        // Start decay timer
        this.startDecayTimer();
    }

    isBanned(peerId) {
        const bannedAt = this.bannedPeers.get(peerId);
        if (bannedAt === undefined) return false;
        if (Date.now() - bannedAt > this.BAN_TTL_MS) {
            this.bannedPeers.delete(peerId);
            return false;
        }
        return true;
    }

    incrementScore(peerId, points = 10) {
        if (this.isBanned(peerId)) {
            return { banned: true, score: this.banThreshold };
        }

        const current = this.scores.get(peerId) || { score: 0, lastIncrement: Date.now() };
        current.score += points;
        current.lastIncrement = Date.now();
        this.scores.set(peerId, current);

        // Check if should ban
        if (current.score >= this.banThreshold) {
            // Cap the banned-peers Map size so a hostile network can't push
            // us into OOM by triggering tons of distinct peer-id bans.
            if (this.bannedPeers.size >= this.MAX_BANNED) {
                // Evict the oldest entry (Map preserves insertion order).
                const firstKey = this.bannedPeers.keys().next().value;
                if (firstKey !== undefined) this.bannedPeers.delete(firstKey);
            }
            this.bannedPeers.set(peerId, Date.now());
            console.log(`[BAN] Peer ${peerId} banned (score: ${current.score})`);
            return { banned: true, score: current.score };
        }

        return { banned: false, score: current.score };
    }

    // isBanned is defined above with TTL expiry — this duplicate is kept as
    // a delete to avoid an override conflict.
    unban(peerId) {
        this.bannedPeers.delete(peerId);
        this.scores.delete(peerId);
        console.log(`[UNBAN] Peer ${peerId} unbanned`);
    }

    startDecayTimer() {
        setInterval(() => {
            const now = Date.now();
            for (const [peerId, data] of this.scores.entries()) {
                // Decay if not incremented in last interval
                if (now - data.lastIncrement > this.decayInterval) {
                    data.score = Math.max(0, data.score - this.decayAmount);
                    if (data.score === 0) {
                        this.scores.delete(peerId);
                    }
                }
            }
        }, this.decayInterval);
    }

    getStats() {
        return {
            activePeers: this.scores.size,
            bannedPeers: this.bannedPeers.size,
            threshold: this.banThreshold
        };
    }
}

// ========== PEER MANAGER ==========

class PeerManager {
    constructor(maxPeers = 32) {
        this.maxPeers = maxPeers;
        this.peers = new Map(); // nodeId -> { ws, handshake, connectedAt }
        this.rateLimiter = new RateLimiter(100);
        this.banManager = new BanScoreManager(100);
    }

    addPeer(nodeId, ws, handshake) {
        if (this.peers.size >= this.maxPeers) {
            throw new Error('Max peers reached');
        }

        if (this.banManager.isBanned(nodeId)) {
            throw new Error('Peer is banned');
        }

        this.peers.set(nodeId, {
            ws,
            handshake,
            connectedAt: Date.now()
        });

        console.log(`[P2P] Peer ${nodeId.substring(0, 16)}... connected (${this.peers.size}/${this.maxPeers})`);
    }

    removePeer(nodeId) {
        this.peers.delete(nodeId);
        this.rateLimiter.reset(nodeId);
        console.log(`[P2P] Peer ${nodeId.substring(0, 16)}... disconnected (${this.peers.size}/${this.maxPeers})`);
    }

    getPeer(nodeId) {
        return this.peers.get(nodeId);
    }

    getAllPeers() {
        return Array.from(this.peers.values());
    }

    checkRateLimit(nodeId) {
        return this.rateLimiter.checkLimit(nodeId);
    }

    incrementBanScore(nodeId, points) {
        return this.banManager.incrementScore(nodeId, points);
    }

    isBanned(nodeId) {
        return this.banManager.isBanned(nodeId);
    }

    getStats() {
        return {
            connectedPeers: this.peers.size,
            maxPeers: this.maxPeers,
            ...this.banManager.getStats()
        };
    }
}

// ========== EXPORTS ==========

module.exports = {
    MessageType,
    validateMessage,
    createHandshake,
    verifyHandshake,
    RateLimiter,
    BanScoreManager,
    PeerManager,
    MAX_MESSAGE_SIZE
};
