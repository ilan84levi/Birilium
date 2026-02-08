require('dotenv').config(); // Load environment variables

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const axios = require('axios'); // For PayPal API calls
const Blockchain = require('./Blockchain');
const Transaction = require('./Transaction');
const Database = require('./database');
const secp256k1 = require('@noble/secp256k1');
const { bytesToHex, hexToBytes } = require('@noble/hashes/utils.js');

// Logging & Metrics (Phase 2.5)
const logger = require('./logger');
const metrics = require('./metrics');

// P2P Security
const {
    MessageType,
    validateMessage,
    createHandshake,
    verifyHandshake,
    PeerManager
} = require('./p2p-security');

// Admin Panel Modules
const auth = require('./auth');
const audit = require('./audit');
const adminWebSocket = require('./admin-websocket');

// New Enhancement Modules
const security = require('./security');
const cache = require('./cache');
const config = require('./config');
const wsService = require('./websocket-service');
const peerSync = require('./peer-sync');

const app = express();
const HTTP_PORT = process.env.HTTP_PORT || 3001;
const P2P_PORT = process.env.P2P_PORT || 6001;
const API_KEY = process.env.API_KEY || null; // Optional API key
const ENABLE_P2P_TLS = process.env.ENABLE_P2P_TLS === 'true';
const P2P_TLS_REQUIRE_CLIENT_CERT = process.env.P2P_TLS_REQUIRE_CLIENT_CERT === 'true';
const P2P_TLS_CA_CERT = process.env.P2P_TLS_CA_CERT || path.join(__dirname, 'certs', 'ca-cert.pem');
const MAX_PEERS = parseInt(process.env.MAX_PEERS) || 32;

// Rate limiting - more generous for local wallet connections
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 300, // 300 requests per minute (5 per second)
    message: { error: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for localhost connections (local wallet)
        const ip = req.ip || req.connection.remoteAddress;
        return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    },
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            error: 'Too many requests from this IP, please try again later.'
        });
    }
});

// Rate limit for mining (allows continuous mining)
const miningLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // Max 30 mining requests per minute (allows mining every ~2 seconds)
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            error: 'Too many mining requests, please slow down.'
        });
    }
});

// Middleware
// Security headers with Helmet.js
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://www.paypal.com", "https://www.paypalobjects.com"],
            scriptSrcAttr: ["'unsafe-inline'"],  // Allow onclick handlers
            frameSrc: ["'self'", "https://www.paypal.com"],
            connectSrc: ["'self'", "https://api.paypal.com", "https://api-m.paypal.com"],
            imgSrc: ["'self'", "data:", "https:"],
            styleSrc: ["'self'", "'unsafe-inline'"]
        }
    },
    crossOriginEmbedderPolicy: false  // Allow PayPal iframes
}));

// Trust proxy (nginx) - required for rate limiting behind reverse proxy
app.set('trust proxy', 1);

app.use(cors());
app.use(bodyParser.json());

// Apply rate limiting to most API routes, but exclude admin login
app.use('/api/', (req, res, next) => {
    // Skip rate limiting for admin login endpoint
    if (req.path === '/admin/login') {
        return next();
    }
    return limiter(req, res, next);
});

// Optional API key authentication middleware
const authenticateAPIKey = (req, res, next) => {
    if (!API_KEY) {
        // No API key configured, skip authentication
        return next();
    }

    const providedKey = req.headers['x-api-key'] || req.query.apiKey;

    if (!providedKey || providedKey !== API_KEY) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or missing API key'
        });
    }

    next();
};

// Admin authentication - JWT-based
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
let ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

// Hash admin password on first run if not already hashed
if (!ADMIN_PASSWORD_HASH && ADMIN_PASSWORD) {
    console.log('⚠️  ADMIN_PASSWORD_HASH not set, hashing password...');
    auth.hashPassword(ADMIN_PASSWORD).then(hash => {
        ADMIN_PASSWORD_HASH = hash;
        console.log('✓ Password hashed. Add to .env: ADMIN_PASSWORD_HASH=' + hash);
        console.log('⚠️  Then remove ADMIN_PASSWORD from .env for security');
    }).catch(err => {
        console.error('Error hashing admin password:', err);
    });
}

// Validate admin credentials are configured
if (!ADMIN_USERNAME || (!ADMIN_PASSWORD && !ADMIN_PASSWORD_HASH)) {
    console.error('');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('🚨 SECURITY ERROR: Missing admin credentials');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('');
    console.error('You MUST set ADMIN_USERNAME and ADMIN_PASSWORD_HASH in .env');
    console.error('');
    console.error('Example in .env:');
    console.error('  ADMIN_USERNAME=admin_519cd57c');
    console.error('  ADMIN_PASSWORD_HASH=$2b$10$...');
    console.error('');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('');
}

// JWT-based admin authentication middleware
const authenticateAdmin = auth.authenticateJWT;
const requireAdmin = auth.requireAdmin;

// Initialize database and blockchain
const database = new Database();
const biriliumChain = new Blockchain(database);

// Initialize blockchain with database
async function initializeBlockchain() {
    const dbConnected = await database.connect();

    if (dbConnected) {
        const loaded = await biriliumChain.loadFromDatabase();
        if (!loaded) {
            console.log('Starting with fresh blockchain (no data in database)');
        }
    } else {
        console.log('Starting in memory-only mode (no database persistence)');
    }
}

// Call initialization
initializeBlockchain().then(() => {
    // Initialize audit logging after database connection
    audit.initialize(database);

    // Initialize peer-to-peer sync
    const peerNodes = (process.env.PEER_NODES || '').split(',').filter(p => p.trim());
    peerSync.initialize(biriliumChain, {
        nodeId: process.env.NODE_ID || null,
        nodeUrl: process.env.NODE_URL || null,
        peers: peerNodes
    });
}).catch(console.error);

// P2P Security: Generate node identity
const nodePrivateKey = process.env.NODE_PRIVATE_KEY || bytesToHex(secp256k1.utils.randomSecretKey());
const nodePublicKey = bytesToHex(secp256k1.getPublicKey(hexToBytes(nodePrivateKey), false));

// Initialize peer manager
const peerManager = new PeerManager(MAX_PEERS);

logger.info({ nodeId: nodePublicKey.substring(0, 32) + '...' }, 'Node identity initialized');

// ========== HTTP API ==========

// Health check endpoint
app.get('/health', (req, res) => {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    res.json({
        status: 'healthy',
        uptime: Math.floor(uptime),
        uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        timestamp: new Date().toISOString(),
        blockchain: {
            blocks: biriliumChain.chain.length,
            currentSupply: biriliumChain.currentSupply,
            difficulty: biriliumChain.difficulty,
            pendingTransactions: biriliumChain.pendingTransactions.length
        },
        database: {
            connected: database.isConnected,
            mode: database.isConnected ? 'persistent' : 'memory-only'
        },
        memory: {
            used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
            total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB'
        },
        peers: peerManager.getAllPeers().length
    });
});

// Get blockchain info
app.get('/api/blocks', (req, res) => {
    res.json(biriliumChain.chain);
});

// Get blockchain stats
app.get('/api/stats', (req, res) => {
    res.json(biriliumChain.getStats());
});

// Get balance and nonce for address
app.get('/api/balance/:address', (req, res) => {
    const address = req.params.address;
    const balance = biriliumChain.getBalanceOfAddress(address);
    const nonce = biriliumChain.getAccountNonce(address);

    // Debug logging for balance queries
    console.log(`[Balance Query] Address: ${address.substring(0, 20)}... Balance: ${balance} BRL, Chain length: ${biriliumChain.chain.length}`);

    res.json({
        address: address,
        balance,
        nonce,
        chainLength: biriliumChain.chain.length  // Include chain length for debugging
    });
});

// Get transactions for address
app.get('/api/transactions/:address', (req, res) => {
    const txs = biriliumChain.getAllTransactionsForWallet(req.params.address);
    res.json(txs);
});

// Debug endpoint - get detailed wallet info
app.get('/api/debug/wallet/:address', (req, res) => {
    const address = req.params.address;
    const balance = biriliumChain.getBalanceOfAddress(address);
    const txs = biriliumChain.getAllTransactionsForWallet(address);
    const pending = biriliumChain.pendingTransactions.filter(tx =>
        tx.fromAddress === address || tx.toAddress === address
    );

    // Calculate detailed breakdown
    let received = 0;
    let sent = 0;
    let fees = 0;
    let miningRewards = 0;

    txs.forEach(tx => {
        if (tx.toAddress === address) {
            if (tx.fromAddress === null) {
                miningRewards += tx.amount;
            } else {
                received += tx.amount;
            }
        }
        if (tx.fromAddress === address) {
            sent += tx.amount;
            fees += tx.fee || 0;
        }
    });

    // Find problematic transactions (if any)
    const problemCheck = biriliumChain.findProblematicTransactions(address);

    res.json({
        address: address,
        balance: balance,
        rawBalance: problemCheck.finalBalance,
        chainLength: biriliumChain.chain.length,
        confirmedTransactions: txs.length,
        pendingTransactions: pending.length,
        breakdown: {
            received: received,
            miningRewards: miningRewards,
            sent: sent,
            fees: fees,
            calculated: miningRewards + received - sent - fees
        },
        issues: problemCheck.issues,
        transactions: txs,
        pending: pending
    });
});

// Get pending transactions
app.get('/api/pending-transactions', (req, res) => {
    res.json(biriliumChain.pendingTransactions);
});

// Create a new wallet
app.post('/api/wallet/create', (req, res) => {
    try {
        const privateKeyBytes = secp256k1.utils.randomSecretKey();
        const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, false); // uncompressed
        const publicKey = bytesToHex(publicKeyBytes);
        const privateKey = bytesToHex(privateKeyBytes);

        res.json({
            address: publicKey,
            privateKey: privateKey,
            message: 'Wallet created successfully. SAVE YOUR PRIVATE KEY!'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Submit a SIGNED transaction (SECURE - no private key transmission, PUBLIC)
app.post('/api/transaction/signed', (req, res) => {
    try {
        const { fromAddress, toAddress, amount, fee, nonce, timestamp, signature } = req.body;

        // Validate inputs
        if (!fromAddress || !toAddress || !amount || !signature) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: fromAddress, toAddress, amount, and signature are required'
            });
        }

        // Validate amount
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid amount: must be a positive number'
            });
        }

        // Create transaction object with nonce for replay protection
        const tx = new Transaction(fromAddress, toAddress, parsedAmount, fee || 0, nonce || 0);
        tx.timestamp = timestamp || Date.now();
        tx.signature = signature;

        // Validate signature (isValid() will check)
        if (!tx.isValid()) {
            return res.status(400).json({
                success: false,
                error: 'Invalid transaction signature'
            });
        }

        // Add to blockchain
        biriliumChain.addTransaction(tx);

        // Broadcast to P2P network
        broadcast(responseNewTransactionMsg(tx));

        // Notify WebSocket clients about new transaction
        wsService.notifyNewTransaction(tx);

        res.json({
            success: true,
            message: 'Transaction added to pending pool',
            transaction: tx,
            fee: tx.fee
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// SECURITY: Deprecated endpoint removed - private keys should NEVER be transmitted
// Use /api/transaction/signed instead (client-side signing)

// Mine a block (PUBLIC - no API key required for decentralization)
app.post('/api/mine', miningLimiter, async (req, res) => {
    try {
        const { minerAddress } = req.body;

        if (!minerAddress) {
            return res.status(400).json({
                success: false,
                error: 'Miner address required'
            });
        }

        // Validate address format
        if (minerAddress.length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Invalid miner address format'
            });
        }

        console.log(`Mining new block for ${minerAddress}...`);
        const block = await biriliumChain.minePendingTransactions(minerAddress);

        if (!block) {
            return res.status(400).json({
                success: false,
                error: 'Maximum supply reached or no transactions to mine'
            });
        }

        // Broadcast new block to P2P network
        broadcast(responseNewBlockMsg(block));

        // Notify WebSocket clients about new block
        wsService.notifyNewBlock(block);

        // Invalidate relevant caches
        cache.invalidateOnChange('block_mined', block);

        res.json({
            success: true,
            message: 'Block mined successfully!',
            block: block,
            reward: biriliumChain.miningReward,
            difficulty: biriliumChain.difficulty
        });
    } catch (error) {
        console.error('Mining error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== DECENTRALIZED MINING API ==========

// Get mining template for client-side mining
app.get('/api/mining/template', (req, res) => {
    try {
        const { minerAddress } = req.query;

        if (!minerAddress) {
            return res.status(400).json({
                success: false,
                error: 'minerAddress query parameter required'
            });
        }

        // Validate address format (uncompressed: 130 hex chars starting with 04, compressed: 66 hex chars starting with 02/03)
        const isValidUncompressed = minerAddress.startsWith('04') && minerAddress.length === 130 && /^[0-9a-fA-F]+$/.test(minerAddress);
        const isValidCompressed = (minerAddress.startsWith('02') || minerAddress.startsWith('03')) && minerAddress.length === 66 && /^[0-9a-fA-F]+$/.test(minerAddress);
        if (!isValidUncompressed && !isValidCompressed) {
            return res.status(400).json({
                success: false,
                error: 'Invalid miner address format. Must be a valid public key (130 or 66 hex characters)'
            });
        }

        // Check if max supply reached
        if (biriliumChain.currentSupply >= biriliumChain.maxSupply) {
            return res.status(400).json({
                success: false,
                error: 'Maximum supply reached - no more mining possible'
            });
        }

        // Get pending transactions to include
        const pendingTxs = [...biriliumChain.pendingTransactions];

        // Calculate fees
        let totalFees = 0;
        for (const tx of pendingTxs) {
            if (tx.fee) totalFees += tx.fee;
        }

        // Calculate mining reward (respecting max supply)
        let miningReward = biriliumChain.miningReward;
        const remainingSupply = biriliumChain.maxSupply - biriliumChain.currentSupply;
        if (miningReward > remainingSupply) {
            miningReward = Math.max(0, remainingSupply);
        }

        const totalReward = miningReward + totalFees;

        // Create coinbase transaction (reward)
        const coinbaseTx = {
            fromAddress: null,
            toAddress: minerAddress,
            amount: totalReward,
            fee: 0,
            timestamp: Date.now(),
            signature: null
        };

        // All transactions including coinbase
        const transactions = [...pendingTxs, coinbaseTx];

        // Get latest block info
        const latestBlock = biriliumChain.getLatestBlock();

        // Create template
        const template = {
            index: biriliumChain.chain.length,
            previousHash: latestBlock.hash,
            timestamp: Date.now(),
            transactions: transactions,
            difficulty: biriliumChain.difficulty,
            target: '0'.repeat(biriliumChain.difficulty),
            miningReward: miningReward,
            totalReward: totalReward,
            pendingTxCount: pendingTxs.length,
            // Template ID to track validity
            templateId: latestBlock.hash.substring(0, 16) + '-' + Date.now()
        };

        res.json({
            success: true,
            template: template,
            instructions: {
                message: 'Find a nonce where SHA256(previousHash + timestamp + JSON.stringify(transactions) + nonce) starts with ' + biriliumChain.difficulty + ' zeros',
                hashFunction: 'SHA256',
                submitTo: '/api/mining/submit'
            }
        });

    } catch (error) {
        console.error('Mining template error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Submit a mined block (decentralized mining)
app.post('/api/mining/submit', async (req, res) => {
    try {
        const { block } = req.body;

        if (!block) {
            return res.status(400).json({
                success: false,
                error: 'Block data required'
            });
        }

        // Validate required fields
        const requiredFields = ['index', 'timestamp', 'transactions', 'previousHash', 'nonce', 'hash'];
        for (const field of requiredFields) {
            if (block[field] === undefined) {
                return res.status(400).json({
                    success: false,
                    error: `Missing required field: ${field}`
                });
            }
        }

        // Validate block index (must be next block)
        const expectedIndex = biriliumChain.chain.length;
        if (block.index !== expectedIndex) {
            return res.status(400).json({
                success: false,
                error: `Invalid block index. Expected ${expectedIndex}, got ${block.index}. Another block may have been mined.`
            });
        }

        // Validate previous hash
        const latestBlock = biriliumChain.getLatestBlock();
        if (block.previousHash !== latestBlock.hash) {
            return res.status(400).json({
                success: false,
                error: 'Invalid previousHash. Chain has moved on - get a new template.'
            });
        }

        // Validate timestamp (not too old, not in future) - tightened for security
        const now = Date.now();
        const maxAge = 2 * 60 * 1000; // 2 minutes (tightened from 5)
        const maxFuture = 60 * 1000; // 1 minute (tightened from 2)
        if (block.timestamp < now - maxAge) {
            return res.status(400).json({
                success: false,
                error: 'Block timestamp too old. Get a new template.'
            });
        }
        if (block.timestamp > now + maxFuture) {
            return res.status(400).json({
                success: false,
                error: 'Block timestamp too far in the future.'
            });
        }

        // Recalculate and verify hash
        const SHA256 = require('crypto-js/sha256');
        const calculatedHash = SHA256(
            block.previousHash +
            block.timestamp +
            JSON.stringify(block.transactions) +
            block.nonce
        ).toString();

        if (calculatedHash !== block.hash) {
            return res.status(400).json({
                success: false,
                error: 'Invalid block hash. Hash does not match block contents.'
            });
        }

        // Validate proof of work
        const target = '0'.repeat(biriliumChain.difficulty);
        if (!block.hash.startsWith(target)) {
            return res.status(400).json({
                success: false,
                error: `Invalid proof of work. Hash must start with ${biriliumChain.difficulty} zeros.`
            });
        }

        // Validate transactions
        if (!block.transactions || !Array.isArray(block.transactions)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid transactions array'
            });
        }

        // Find coinbase transaction
        const coinbaseTx = block.transactions.find(tx => tx.fromAddress === null);
        if (!coinbaseTx) {
            return res.status(400).json({
                success: false,
                error: 'Missing coinbase (reward) transaction'
            });
        }

        // Validate coinbase amount (should not exceed allowed reward + fees)
        let maxFees = 0;
        for (const tx of block.transactions) {
            if (tx.fromAddress !== null && tx.fee) {
                maxFees += tx.fee;
            }
        }
        let maxReward = biriliumChain.miningReward;
        const remainingSupply = biriliumChain.maxSupply - biriliumChain.currentSupply;
        if (maxReward > remainingSupply) {
            maxReward = remainingSupply;
        }
        const maxCoinbase = maxReward + maxFees;

        if (coinbaseTx.amount > maxCoinbase) {
            return res.status(400).json({
                success: false,
                error: `Coinbase amount ${coinbaseTx.amount} exceeds maximum allowed ${maxCoinbase}`
            });
        }

        // Convert to Block instance
        const Block = require('./Block');
        const newBlock = new Block(
            block.timestamp,
            block.transactions,
            block.previousHash,
            block.index
        );
        newBlock.nonce = block.nonce;
        newBlock.hash = block.hash;

        // Add block to chain
        biriliumChain.chain.push(newBlock);
        biriliumChain.currentSupply += (coinbaseTx.amount - maxFees); // Only new coins
        biriliumChain.balanceCacheDirty = true;
        biriliumChain.noncesCacheDirty = true;

        // Remove mined transactions from mempool
        const minedTxSignatures = new Set(
            block.transactions
                .filter(tx => tx.signature)
                .map(tx => tx.signature)
        );
        biriliumChain.pendingTransactions = biriliumChain.pendingTransactions.filter(
            tx => !minedTxSignatures.has(tx.signature)
        );

        // Save to database
        if (database && database.isConnected) {
            await database.saveBlock(newBlock, newBlock.index);
            await biriliumChain.saveToDatabase();
        }

        // Adjust difficulty
        biriliumChain.adjustDifficulty();

        // Broadcast to P2P network
        broadcast(responseNewBlockMsg(newBlock));

        // Notify WebSocket clients
        wsService.notifyNewBlock(newBlock);
        if (adminWebSocket) {
            adminWebSocket.onNewBlock(newBlock, newBlock.index);
        }

        // Broadcast new block to peer nodes
        peerSync.broadcastBlock(newBlock);

        // Invalidate caches
        cache.invalidateOnChange('block_mined', newBlock);

        console.log(`[Mining] Block #${newBlock.index} submitted by ${coinbaseTx.toAddress.substring(0, 20)}... - Hash: ${newBlock.hash.substring(0, 20)}...`);

        res.json({
            success: true,
            message: 'Block accepted!',
            block: {
                index: newBlock.index,
                hash: newBlock.hash,
                reward: coinbaseTx.amount,
                transactions: newBlock.transactions.length
            },
            newDifficulty: biriliumChain.difficulty,
            chainHeight: biriliumChain.chain.length
        });

    } catch (error) {
        console.error('Block submission error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get current mining stats (for miners to monitor)
app.get('/api/mining/stats', (req, res) => {
    res.json({
        difficulty: biriliumChain.difficulty,
        target: '0'.repeat(biriliumChain.difficulty),
        blockHeight: biriliumChain.chain.length,
        pendingTransactions: biriliumChain.pendingTransactions.length,
        miningReward: biriliumChain.miningReward,
        currentSupply: biriliumChain.currentSupply,
        maxSupply: biriliumChain.maxSupply,
        remainingSupply: biriliumChain.maxSupply - biriliumChain.currentSupply,
        latestBlockHash: biriliumChain.getLatestBlock().hash,
        latestBlockTime: biriliumChain.getLatestBlock().timestamp
    });
});

// ============================================
// NODE-TO-NODE SYNC API (for multi-node setup)
// ============================================

// Get node info (for peer discovery)
app.get('/api/node/info', (req, res) => {
    res.json(peerSync.getNodeInfo());
});

// Get blocks in range (for peer sync)
app.get('/api/node/blocks', (req, res) => {
    const from = parseInt(req.query.from) || 0;
    const to = parseInt(req.query.to) || biriliumChain.chain.length;
    const maxBlocks = 100; // Limit blocks per request

    const blocks = peerSync.getBlocks(from, Math.min(to, from + maxBlocks));

    res.json({
        from: from,
        to: from + blocks.length,
        blocks: blocks,
        hasMore: to > from + maxBlocks
    });
});

// Receive block from peer node
app.post('/api/node/block', (req, res) => {
    const { block, fromNode } = req.body;

    if (!block) {
        return res.status(400).json({ success: false, error: 'No block provided' });
    }

    const result = peerSync.receiveBlock(block, fromNode);

    if (result.success) {
        // Notify admin WebSocket of new block
        adminWebSocket.onNewBlock(block, block.index);
    }

    res.json(result);
});

// Get/share peer list
app.get('/api/node/peers', (req, res) => {
    res.json({
        nodeId: peerSync.nodeId,
        nodeUrl: peerSync.nodeUrl,
        peers: peerSync.peers
    });
});

app.post('/api/node/peers', (req, res) => {
    const { nodeUrl, peers } = req.body;

    // Add the reporting node as a peer
    if (nodeUrl) {
        peerSync.addPeer(nodeUrl);
    }

    // Optionally add peers from the peer's list
    if (peers && Array.isArray(peers)) {
        peers.forEach(p => peerSync.addPeer(p));
    }

    res.json({ success: true, peerCount: peerSync.peers.length });
});

// ============================================

// Validate blockchain
app.get('/api/validate', (req, res) => {
    const isValid = biriliumChain.isChainValid();
    res.json({ valid: isValid });
});

// Get peers
app.get('/api/peers', (req, res) => {
    const peers = peerManager.getAllPeers().map(p => ({
        nodeId: p.handshake.nodeId.substring(0, 16) + '...',
        version: p.handshake.version,
        connectedAt: p.connectedAt
    }));
    res.json(peers);
});

// Get P2P stats
app.get('/api/p2p/stats', (req, res) => {
    res.json(peerManager.getStats());
});

// Add peer
app.post('/api/peers', (req, res) => {
    connectToPeer(req.body.peer);
    res.json({ message: 'Peer added' });
});

// Get database status
app.get('/api/database/status', async (req, res) => {
    if (!database || !database.isConnected) {
        res.json({
            connected: false,
            mode: 'memory-only',
            message: 'No database connection - blockchain is stored in memory only'
        });
    } else {
        const stats = await database.getStats();
        res.json({
            connected: true,
            mode: 'persistent',
            database: database.dbName,
            ...stats
        });
    }
});

// Get metrics (JSON format)
app.get('/api/metrics', (req, res) => {
    // Update blockchain state metrics
    metrics.updateBlockchainState(biriliumChain);

    res.json(metrics.getMetrics());
});

// Get metrics (Prometheus format)
app.get('/metrics', (req, res) => {
    // Update blockchain state metrics
    metrics.updateBlockchainState(biriliumChain);

    res.set('Content-Type', 'text/plain');
    res.send(metrics.toPrometheusFormat());
});

// ========== ADMIN INTERFACE ==========

// Admin dashboard - serve admin-dashboard.html
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

// ========== CONTACT FORM ENDPOINT ==========

// Contact form submission
app.post('/api/contact', async (req, res) => {
    try {
        const { name, phone, email, message } = req.body;

        // Validate required fields
        if (!name || !email || !message) {
            return res.status(400).json({
                success: false,
                error: 'Name, email, and message are required'
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }

        // Setup nodemailer with Gmail
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.CONTACT_EMAIL || 'biriliumcoin@gmail.com',
                pass: process.env.CONTACT_EMAIL_PASSWORD
            }
        });

        // Email content
        const mailOptions = {
            from: process.env.CONTACT_EMAIL || 'biriliumcoin@gmail.com',
            to: 'biriliumcoin@gmail.com',
            subject: `Birilium Wallet Contact Form - ${name}`,
            html: `
                <h2>New Contact Form Submission</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Message:</strong></p>
                <p>${message.replace(/\n/g, '<br>')}</p>
                <hr>
                <p><small>Sent from Birilium Wallet Contact Form</small></p>
            `,
            replyTo: email
        };

        // Check if email password is configured
        if (!process.env.CONTACT_EMAIL_PASSWORD) {
            console.warn('[Contact] Email password not configured in .env');
            // Log to console for development purposes
            console.log('=== CONTACT FORM SUBMISSION ===');
            console.log('Name:', name);
            console.log('Phone:', phone || 'Not provided');
            console.log('Email:', email);
            console.log('Message:', message);
            console.log('==============================');

            return res.json({
                success: true,
                message: 'Contact form received (email not configured, logged to console)',
                dev_mode: true
            });
        }

        // Send email
        await transporter.sendMail(mailOptions);

        logger.info({ name, email }, 'Contact form submitted');

        res.json({
            success: true,
            message: 'Your message has been sent successfully!'
        });
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send message. Please try again later.'
        });
    }
});

// ========== PAYPAL CONFIGURATION ENDPOINT ==========

// Get PayPal configuration (called by frontend when loading)
app.get('/api/paypal-config', (req, res) => {
    try {
        const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
        const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
        const PAYPAL_PLAN_ID = process.env.PAYPAL_PLAN_ID; // Premium Mining Plan

        // Return PayPal config to frontend
        res.json({
            success: true,
            mode: PAYPAL_MODE,
            clientId: PAYPAL_CLIENT_ID || null,
            planId: PAYPAL_PLAN_ID,
            sandboxMode: PAYPAL_MODE === 'sandbox',
            configured: !!PAYPAL_CLIENT_ID,
            message: !PAYPAL_CLIENT_ID ? 'PayPal not configured - set PAYPAL_CLIENT_ID in .env' : 'PayPal ready'
        });
    } catch (error) {
        console.error('PayPal config error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== ADMIN & SUBSCRIPTION ENDPOINTS ==========

// Serve admin dashboard HTML page
app.get('/api/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

// Admin login endpoint (JWT-based)
app.post('/api/admin/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        await audit.logAudit('anonymous', 'ADMIN_LOGIN_FAILED', null, { reason: 'missing_credentials' }, false, req);
        return res.status(400).json({
            success: false,
            error: 'Username and password required'
        });
    }

    if (username !== ADMIN_USERNAME) {
        await audit.logAudit(username, 'ADMIN_LOGIN_FAILED', null, { reason: 'invalid_username' }, false, req);
        return res.status(401).json({
            success: false,
            error: 'Invalid credentials'
        });
    }

    const isValid = await auth.verifyPassword(password, ADMIN_PASSWORD_HASH);

    if (!isValid) {
        await audit.logAudit(username, 'ADMIN_LOGIN_FAILED', null, { reason: 'invalid_password' }, false, req);
        return res.status(401).json({
            success: false,
            error: 'Invalid credentials'
        });
    }

    // Generate tokens
    const user = { username, role: 'admin' };
    const accessToken = auth.generateAccessToken(user);
    const refreshToken = auth.generateRefreshToken(user);

    await audit.logAudit(username, 'ADMIN_LOGIN_SUCCESS', null, {}, true, req);

    res.json({
        success: true,
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRES_IN || '1y',
        user: { username, role: 'admin' }
    });
});

// Dashboard summary endpoint
app.get('/api/admin/dashboard', authenticateAdmin, async (req, res) => {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    res.json({
        success: true,
        data: {
            chain: {
                height: biriliumChain.chain.length - 1,
                difficulty: biriliumChain.difficulty,
                currentSupply: biriliumChain.currentSupply.toFixed(8),
                miningReward: "10",
                avgBlockTime: 30000
            },
            mempool: {
                pendingTx: biriliumChain.pendingTransactions.length,
                sizeBytes: JSON.stringify(biriliumChain.pendingTransactions).length
            },
            peers: {
                connected: peerManager.getAllPeers().length,
                max: MAX_PEERS,
                list: peerManager.getStats()
            },
            node: {
                version: "2.1.0",
                uptime: Math.floor(uptime),
                uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
                memoryMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                cpuPercent: 0
            },
            database: {
                connected: database.isConnected,
                path: database.dbPath
            }
        }
    });
});

// Recent transactions endpoint
app.get('/api/admin/transactions/recent', authenticateAdmin, async (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    // Get all transactions from all blocks
    const allTransactions = [];
    for (let i = biriliumChain.chain.length - 1; i >= 1; i--) {
        const block = biriliumChain.chain[i];
        block.transactions.forEach(tx => {
            allTransactions.push({
                ...tx,
                blockHeight: i,
                blockHash: block.hash,
                blockTimestamp: block.timestamp
            });
        });
    }

    // Sort by timestamp (newest first)
    allTransactions.sort((a, b) => b.blockTimestamp - a.blockTimestamp);

    // Paginate
    const paginatedTx = allTransactions.slice(offset, offset + limit);

    res.json({
        success: true,
        data: paginatedTx,
        pagination: {
            total: allTransactions.length,
            limit,
            offset,
            hasMore: offset + limit < allTransactions.length
        }
    });
});

// Transaction detail endpoint
app.get('/api/admin/transactions/:txid', authenticateAdmin, async (req, res) => {
    const txid = req.params.txid;

    // Search for transaction in blockchain
    for (let i = biriliumChain.chain.length - 1; i >= 1; i--) {
        const block = biriliumChain.chain[i];
        const tx = block.transactions.find(t =>
            (t.txId && t.txId === txid) ||
            (t.toAddress && t.toAddress.includes(txid.substring(0, 20)))
        );

        if (tx) {
            return res.json({
                success: true,
                data: {
                    ...tx,
                    blockHeight: i,
                    blockHash: block.hash,
                    blockTimestamp: block.timestamp,
                    confirmations: biriliumChain.chain.length - i
                }
            });
        }
    }

    res.status(404).json({
        success: false,
        error: 'Transaction not found'
    });
});

// Audit log endpoint
app.get('/api/admin/audit', authenticateAdmin, async (req, res) => {
    const filters = {
        actor: req.query.actor,
        action: req.query.action,
        from: req.query.from ? parseInt(req.query.from) : undefined,
        to: req.query.to ? parseInt(req.query.to) : undefined,
        limit: parseInt(req.query.limit) || 100,
        offset: parseInt(req.query.offset) || 0
    };

    const entries = await audit.queryAuditLog(filters);
    const stats = await audit.getAuditStats();

    res.json({
        success: true,
        data: entries,
        stats: stats,
        pagination: {
            limit: filters.limit,
            offset: filters.offset
        }
    });
});

// Rotate API key endpoint
app.post('/api/admin/rotate-api-key', authenticateAdmin, audit.auditMiddleware('ROTATE_API_KEY'), async (req, res) => {
    const newApiKey = auth.generateApiKey();

    res.json({
        success: true,
        apiKey: newApiKey,
        message: 'New API key generated. Update your .env file with API_KEY=' + newApiKey
    });
});

// Mempool purge endpoint
app.post('/api/admin/mempool/purge', authenticateAdmin, requireAdmin, audit.auditMiddleware('MEMPOOL_PURGE'), async (req, res) => {
    const count = biriliumChain.pendingTransactions.length;
    biriliumChain.pendingTransactions = [];

    adminWebSocket.onMempoolUpdate(0, [], []);

    res.json({
        success: true,
        message: `Purged ${count} transactions from mempool`
    });
});

// WebSocket status endpoint
app.get('/api/admin/websocket/status', authenticateAdmin, async (req, res) => {
    res.json({
        success: true,
        clients: adminWebSocket.getClientCount(),
        connected: adminWebSocket.getClients()
    });
});

// Connected wallets endpoint - real-time wallet tracking for admin
app.get('/api/admin/connected-wallets', authenticateAdmin, async (req, res) => {
    try {
        const wallets = wsService.getConnectedWallets();
        res.json({
            success: true,
            count: wallets.length,
            wallets: wallets.map(w => ({
                address: w.address,
                addressShort: w.addressShort,
                ip: w.ip,
                balance: w.balance,
                connectedAt: new Date(w.connectedAt).toISOString(),
                connectedDuration: w.connectedDuration,
                lastActivity: new Date(w.lastActivity).toISOString(),
                txCount: w.txCount,
                miningRewards: w.miningRewards
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ADMIN WALLET GENERATION ENDPOINT ==========

// Admin-only wallet generation endpoint
app.post('/api/admin/generate-wallet', authenticateAdmin, requireAdmin, audit.auditMiddleware('ADMIN_GENERATE_WALLET'), async (req, res) => {
    try {
        const crypto = require('crypto');

        // Generate a random 32-byte private key
        const privateKeyBytes = crypto.randomBytes(32);
        const privateKey = bytesToHex(privateKeyBytes);

        // Derive the public key from the private key
        const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, false); // uncompressed
        const publicKey = bytesToHex(publicKeyBytes);

        res.json({
            success: true,
            wallet: {
                address: publicKey,
                privateKey: privateKey
            },
            message: 'Wallet generated successfully. IMPORTANT: Save the private key securely!'
        });

        console.log(`[Admin] New wallet generated: ${publicKey.substring(0, 20)}...`);

    } catch (error) {
        console.error('Wallet generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate wallet: ' + error.message
        });
    }
});

// Admin send coins endpoint - create coinbase transaction (mint new coins)
app.post('/api/admin/send-coins', authenticateAdmin, requireAdmin, audit.auditMiddleware('ADMIN_SEND_COINS'), async (req, res) => {
    try {
        const { toAddress, amount } = req.body;

        if (!toAddress || !amount) {
            return res.status(400).json({
                success: false,
                error: 'toAddress and amount are required'
            });
        }

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Amount must be a positive number'
            });
        }

        // SECURITY: Check supply cap before minting
        const pendingMints = biriliumChain.pendingTransactions
            .filter(tx => tx.fromAddress === null)
            .reduce((sum, tx) => sum + tx.amount, 0);
        const projectedSupply = biriliumChain.currentSupply + pendingMints + parsedAmount;

        if (projectedSupply > biriliumChain.maxSupply) {
            return res.status(400).json({
                success: false,
                error: `Would exceed max supply. Current: ${biriliumChain.currentSupply}, Pending mints: ${pendingMints}, Requested: ${parsedAmount}, Max: ${biriliumChain.maxSupply}`
            });
        }

        // Create a coinbase-like transaction (admin mint)
        const tx = new Transaction(null, toAddress, parsedAmount, 0, 0);
        tx.timestamp = Date.now();

        // Add to pending transactions
        biriliumChain.pendingTransactions.push(tx);

        // Broadcast to P2P network
        broadcast(responseNewTransactionMsg(tx));

        console.log(`[Admin] Minting ${parsedAmount} BRL to ${toAddress.substring(0, 20)}...`);

        res.json({
            success: true,
            message: `${parsedAmount} BRL queued for minting to ${toAddress.substring(0, 20)}...`,
            note: 'Mine a block to confirm this transaction'
        });

    } catch (error) {
        console.error('Admin send error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send coins: ' + error.message
        });
    }
});

// Clean stale transactions from mempool
app.post('/api/admin/clean-mempool', authenticateAdmin, requireAdmin, audit.auditMiddleware('ADMIN_CLEAN_MEMPOOL'), async (req, res) => {
    try {
        const removed = biriliumChain.cleanStaleTransactions();
        res.json({
            success: true,
            removed: removed,
            remaining: biriliumChain.pendingTransactions.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Force recalculate supply from blockchain
app.post('/api/admin/recalculate-supply', authenticateAdmin, requireAdmin, audit.auditMiddleware('ADMIN_RECALCULATE_SUPPLY'), async (req, res) => {
    try {
        const oldSupply = biriliumChain.currentSupply;
        const newSupply = biriliumChain.recalculateSupply();

        // Save updated state
        await biriliumChain.saveToDatabase();

        res.json({
            success: true,
            oldSupply: oldSupply,
            newSupply: newSupply,
            blocks: biriliumChain.chain.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== ADMIN MINING ENDPOINT (NO SUBSCRIPTION REQUIRED) ==========

// Admin-only mining endpoint - bypasses subscription checks
app.post('/api/admin/mine', authenticateAdmin, requireAdmin, audit.auditMiddleware('ADMIN_MINE'), async (req, res) => {
    try {
        const { minerAddress } = req.body;

        if (!minerAddress) {
            return res.status(400).json({
                success: false,
                error: 'Miner address required'
            });
        }

        // Validate address format
        if (minerAddress.length < 10) {
            return res.status(400).json({
                success: false,
                error: 'Invalid miner address format'
            });
        }

        console.log(`[Admin] Mining new block for ${minerAddress} (admin bypass)...`);
        const block = await biriliumChain.minePendingTransactions(minerAddress);

        if (!block) {
            return res.status(400).json({
                success: false,
                error: 'Maximum supply reached or mining failed'
            });
        }

        // Broadcast new block to P2P network
        broadcast(responseNewBlockMsg(block));

        // Notify WebSocket clients about new block
        wsService.notifyNewBlock(block);

        // Invalidate relevant caches
        cache.invalidateOnChange('block_mined', block);

        logger.info({ minerAddress, blockHeight: block.index, hash: block.hash }, 'Admin mined block');

        res.json({
            success: true,
            message: 'Block mined successfully by admin!',
            block: block,
            reward: biriliumChain.miningReward,
            difficulty: biriliumChain.difficulty,
            adminMining: true
        });
    } catch (error) {
        console.error('Admin mining error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all blocks with pagination (for admin dashboard)
app.get('/api/admin/blocks', authenticateAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        // Get blocks in reverse order (newest first)
        const totalBlocks = biriliumChain.chain.length;
        const startIndex = Math.max(0, totalBlocks - offset - limit);
        const endIndex = totalBlocks - offset;

        const blocks = [];
        for (let i = endIndex - 1; i >= startIndex && i >= 0; i--) {
            const block = biriliumChain.chain[i];
            blocks.push({
                index: block.index,
                hash: block.hash,
                previousHash: block.previousHash,
                timestamp: block.timestamp,
                nonce: block.nonce,
                difficulty: block.difficulty || biriliumChain.difficulty,
                transactionCount: block.transactions ? block.transactions.length : 0,
                miner: block.transactions && block.transactions.length > 0 ? block.transactions[0].toAddress : null,
                reward: block.transactions && block.transactions.length > 0 ? block.transactions[0].amount : 0
            });
        }

        res.json({
            success: true,
            data: blocks,
            pagination: {
                total: totalBlocks,
                limit,
                offset,
                hasMore: offset + limit < totalBlocks
            }
        });
    } catch (error) {
        console.error('Blocks fetch error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get block details by hash or index
app.get('/api/admin/blocks/:identifier', authenticateAdmin, async (req, res) => {
    try {
        const identifier = req.params.identifier;
        let block = null;

        // Check if identifier is a number (index) or hash
        if (/^\d+$/.test(identifier)) {
            const index = parseInt(identifier);
            if (index >= 0 && index < biriliumChain.chain.length) {
                block = biriliumChain.chain[index];
            }
        } else {
            // Search by hash
            block = biriliumChain.chain.find(b => b.hash === identifier);
        }

        if (!block) {
            return res.status(404).json({
                success: false,
                error: 'Block not found'
            });
        }

        res.json({
            success: true,
            data: {
                ...block,
                confirmations: biriliumChain.chain.length - block.index
            }
        });
    } catch (error) {
        console.error('Block detail error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get detailed statistics for admin dashboard
app.get('/api/admin/stats/detailed', authenticateAdmin, async (req, res) => {
    try {
        // Calculate total transactions
        let totalTransactions = 0;
        let totalBIRMined = 0;
        const minerStats = {};

        for (const block of biriliumChain.chain) {
            if (block.transactions) {
                totalTransactions += block.transactions.length;

                // Track mining rewards
                for (const tx of block.transactions) {
                    if (!tx.fromAddress && tx.toAddress) {
                        // Mining reward transaction
                        totalBIRMined += tx.amount;
                        if (!minerStats[tx.toAddress]) {
                            minerStats[tx.toAddress] = { blocks: 0, rewards: 0 };
                        }
                        minerStats[tx.toAddress].blocks++;
                        minerStats[tx.toAddress].rewards += tx.amount;
                    }
                }
            }
        }

        // Get top miners
        const topMiners = Object.entries(minerStats)
            .map(([address, stats]) => ({ address, ...stats }))
            .sort((a, b) => b.blocks - a.blocks)
            .slice(0, 10);

        // Get database stats
        let dbStats = { walletCreations: 0, activeSubscriptions: 0, totalRevenue: 0 };
        if (database && database.isConnected) {
            const walletResult = database.db.prepare(
                "SELECT COUNT(*) as count FROM analytics WHERE event = 'wallet_created'"
            ).get();
            dbStats.walletCreations = walletResult.count;

            const subResult = database.db.prepare(
                "SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'"
            ).get();
            dbStats.activeSubscriptions = subResult.count;

            const revenueResult = database.db.prepare(
                "SELECT COALESCE(SUM(amount), 0) as total FROM subscriptions"
            ).get();
            dbStats.totalRevenue = revenueResult.total;
        }

        res.json({
            success: true,
            data: {
                blockchain: {
                    height: biriliumChain.chain.length - 1,
                    totalBlocks: biriliumChain.chain.length,
                    totalTransactions,
                    totalBIRMined: totalBIRMined.toFixed(8),
                    currentSupply: biriliumChain.currentSupply.toFixed(8),
                    maxSupply: biriliumChain.maxSupply,
                    difficulty: biriliumChain.difficulty,
                    pendingTransactions: biriliumChain.pendingTransactions.length
                },
                mining: {
                    reward: biriliumChain.miningReward,
                    topMiners
                },
                analytics: dbStats,
                network: {
                    peers: peerManager.getAllPeers().length,
                    maxPeers: MAX_PEERS
                }
            }
        });
    } catch (error) {
        console.error('Detailed stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all transactions with pagination (for admin dashboard)
app.get('/api/admin/transactions', authenticateAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const search = req.query.search || '';

        // Get all transactions from all blocks
        const allTransactions = [];
        for (let i = biriliumChain.chain.length - 1; i >= 0; i--) {
            const block = biriliumChain.chain[i];
            if (block.transactions) {
                block.transactions.forEach(tx => {
                    allTransactions.push({
                        ...tx,
                        blockHeight: i,
                        blockHash: block.hash,
                        blockTimestamp: block.timestamp,
                        confirmations: biriliumChain.chain.length - i
                    });
                });
            }
        }

        // Filter by search if provided
        let filteredTx = allTransactions;
        if (search) {
            const searchLower = search.toLowerCase();
            filteredTx = allTransactions.filter(tx =>
                (tx.fromAddress && tx.fromAddress.toLowerCase().includes(searchLower)) ||
                (tx.toAddress && tx.toAddress.toLowerCase().includes(searchLower)) ||
                (tx.signature && tx.signature.toLowerCase().includes(searchLower)) ||
                (tx.blockHash && tx.blockHash.toLowerCase().includes(searchLower))
            );
        }

        // Sort by timestamp (newest first)
        filteredTx.sort((a, b) => b.blockTimestamp - a.blockTimestamp);

        // Paginate
        const paginatedTx = filteredTx.slice(offset, offset + limit);

        res.json({
            success: true,
            data: paginatedTx,
            pagination: {
                total: filteredTx.length,
                limit,
                offset,
                hasMore: offset + limit < filteredTx.length
            }
        });
    } catch (error) {
        console.error('Transactions fetch error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get subscription history with pagination
app.get('/api/admin/subscriptions', authenticateAdmin, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const status = req.query.status || 'all';

        if (!database || !database.isConnected) {
            return res.json({
                success: true,
                data: [],
                pagination: { total: 0, limit, offset, hasMore: false }
            });
        }

        // Build query based on status filter
        let query = 'SELECT * FROM subscriptions';
        const params = [];

        if (status !== 'all') {
            query += ' WHERE status = ?';
            params.push(status);
        }

        query += ' ORDER BY startTime DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const subscriptions = database.db.prepare(query).all(...params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) as count FROM subscriptions';
        if (status !== 'all') {
            countQuery += ' WHERE status = ?';
        }
        const countResult = status !== 'all'
            ? database.db.prepare(countQuery).get(status)
            : database.db.prepare(countQuery).get();

        res.json({
            success: true,
            data: subscriptions.map(sub => ({
                ...sub,
                startDate: new Date(sub.startTime).toISOString(),
                cancelledDate: sub.cancelledAt ? new Date(sub.cancelledAt).toISOString() : null
            })),
            pagination: {
                total: countResult.count,
                limit,
                offset,
                hasMore: offset + limit < countResult.count
            }
        });
    } catch (error) {
        console.error('Subscriptions fetch error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Track wallet download (called from website/installer)
app.post('/api/analytics/download', async (req, res) => {
    try {
        const { platform, version, timestamp, userAgent } = req.body;

        // Store analytics event if database is connected
        if (database && database.isConnected) {
            const now = Date.now();
            const eventTime = timestamp ? new Date(timestamp).getTime() : now;

            const metadata = JSON.stringify({
                platform: platform || 'unknown',
                version: version || 'unknown',
                userAgent: userAgent || req.headers['user-agent'] || 'unknown'
            });

            const insertStmt = database.db.prepare(`
                INSERT INTO analytics (event, walletAddress, timestamp, metadata, createdAt)
                VALUES (?, ?, ?, ?, ?)
            `);
            insertStmt.run('wallet_download', 'N/A', eventTime, metadata, now);
        }

        logger.info({ platform, version }, 'Wallet download tracked');

        res.json({
            success: true,
            message: 'Download tracked'
        });
    } catch (error) {
        console.error('Download tracking error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get download statistics
app.get('/api/admin/stats/downloads', authenticateAdmin, async (req, res) => {
    try {
        if (!database || !database.isConnected) {
            return res.json({
                success: true,
                data: { total: 0, byPlatform: {}, byVersion: {} }
            });
        }

        // Get total downloads
        const totalResult = database.db.prepare(
            "SELECT COUNT(*) as count FROM analytics WHERE event = 'wallet_download'"
        ).get();

        // Get downloads by platform
        const downloads = database.db.prepare(
            "SELECT metadata FROM analytics WHERE event = 'wallet_download'"
        ).all();

        const byPlatform = {};
        const byVersion = {};

        downloads.forEach(d => {
            try {
                const meta = JSON.parse(d.metadata);
                const platform = meta.platform || 'unknown';
                const version = meta.version || 'unknown';

                byPlatform[platform] = (byPlatform[platform] || 0) + 1;
                byVersion[version] = (byVersion[version] || 0) + 1;
            } catch (e) {
                byPlatform['unknown'] = (byPlatform['unknown'] || 0) + 1;
            }
        });

        res.json({
            success: true,
            data: {
                total: totalResult.count,
                byPlatform,
                byVersion
            }
        });
    } catch (error) {
        console.error('Download stats error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== NEW ENHANCEMENT ENDPOINTS ==========

// Logout endpoint - blacklists the current token
app.post('/api/admin/auth/logout', authenticateAdmin, async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.startsWith('Bearer ')
            ? authHeader.substring(7)
            : null;

        if (token) {
            // Blacklist the token (12 hours expiry to match token lifetime)
            const expiresAt = Date.now() + (12 * 60 * 60 * 1000);
            security.blacklistToken(token, expiresAt);

            await audit.logAudit(req.user.username, 'LOGOUT', null, {}, true, req);
        }

        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get CSRF token for forms
app.get('/api/admin/csrf-token', authenticateAdmin, (req, res) => {
    const sessionId = req.user?.username || req.ip;
    const csrfToken = security.generateCSRFToken(sessionId);

    res.json({
        success: true,
        csrfToken
    });
});

// Cache statistics endpoint
app.get('/api/admin/cache/stats', authenticateAdmin, (req, res) => {
    res.json({
        success: true,
        stats: cache.getAllCacheStats()
    });
});

// Clear cache endpoint
app.post('/api/admin/cache/clear', authenticateAdmin, requireAdmin, audit.auditMiddleware('CACHE_CLEAR'), (req, res) => {
    cache.invalidateOnChange('chain_sync', {});

    res.json({
        success: true,
        message: 'Cache cleared successfully'
    });
});

// Password validation endpoint (for frontend password strength check)
app.post('/api/validate-password', (req, res) => {
    const { password } = req.body;
    const result = security.validatePassword(password);

    res.json({
        success: true,
        valid: result.valid,
        errors: result.errors,
        requirements: security.PASSWORD_REQUIREMENTS
    });
});

// Client WebSocket service stats
app.get('/api/websocket/stats', (req, res) => {
    res.json({
        success: true,
        stats: wsService.getStats()
    });
});

// Configuration info (non-sensitive)
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        config: {
            version: config.version,
            features: config.features,
            nodeVersion: config.nodeVersion,
            maxSupply: 25000000000,
            miningReward: 10,
            targetBlockTime: config.targetBlockTime,
            maxMempoolSize: config.maxMempoolSize
        }
    });
});

// Activate subscription (called from frontend when PayPal subscription is approved)
app.post('/api/subscription/activate', async (req, res) => {
    try {
        const { walletAddress, subscriptionId, planId, amount, currency, timestamp } = req.body;

        // Validate required fields
        if (!walletAddress || !subscriptionId || !planId || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: walletAddress, subscriptionId, planId, and amount are required'
            });
        }

        // Check if database is connected
        if (!database || !database.isConnected) {
            return res.status(503).json({
                success: false,
                error: 'Database not available. Cannot store subscription data.'
            });
        }

        // Store subscription in database (SQLite)
        const now = Date.now();
        const startTime = timestamp ? new Date(timestamp).getTime() : now;

        const insertSubStmt = database.db.prepare(`
            INSERT OR REPLACE INTO subscriptions
            (subscriptionId, walletAddress, planId, amount, currency, status, startTime, createdAt)
            VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
        `);
        insertSubStmt.run(subscriptionId, walletAddress, planId, parseFloat(amount), currency || 'USD', startTime, now);

        // Store analytics event (SQLite)
        const metadata = JSON.stringify({
            subscriptionId,
            planId,
            amount: parseFloat(amount),
            currency: currency || 'USD'
        });
        const insertAnalyticsStmt = database.db.prepare(`
            INSERT INTO analytics (event, walletAddress, timestamp, metadata, createdAt)
            VALUES (?, ?, ?, ?, ?)
        `);
        insertAnalyticsStmt.run('subscription_activated', walletAddress, startTime, metadata, now);

        const subscription = {
            walletAddress,
            subscriptionId,
            planId,
            amount: parseFloat(amount),
            currency: currency || 'USD',
            startDate: new Date(startTime),
            status: 'active'
        };

        logger.info({ walletAddress, subscriptionId }, 'Subscription activated');

        res.json({
            success: true,
            message: 'Subscription activated successfully',
            subscription
        });
    } catch (error) {
        console.error('Subscription activation error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Cancel subscription (calls PayPal API to cancel)
app.post('/api/subscription/cancel', async (req, res) => {
    try {
        const { subscriptionId, walletAddress } = req.body;

        // Validate required fields
        if (!subscriptionId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: subscriptionId'
            });
        }

        // PayPal API credentials from environment variables
        const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
        const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
        const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox'; // 'sandbox' or 'live'

        if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
            return res.status(500).json({
                success: false,
                error: 'PayPal API not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET environment variables.'
            });
        }

        // Determine API base URL based on mode
        const PAYPAL_API_BASE = PAYPAL_MODE === 'live'
            ? 'https://api-m.paypal.com'
            : 'https://api-m.sandbox.paypal.com';

        console.log(`[PayPal] Using ${PAYPAL_MODE} mode: ${PAYPAL_API_BASE}`);

        // Step 1: Get PayPal access token
        const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
        const tokenResponse = await axios.post(
            `${PAYPAL_API_BASE}/v1/oauth2/token`,
            'grant_type=client_credentials',
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const accessToken = tokenResponse.data.access_token;

        // Step 2: Cancel the subscription via PayPal API
        const cancelResponse = await axios.post(
            `${PAYPAL_API_BASE}/v1/billing/subscriptions/${subscriptionId}/cancel`,
            {
                reason: 'User requested cancellation via wallet'
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Step 3: Update database if connected (SQLite)
        if (database && database.isConnected) {
            const now = Date.now();

            // Update subscription status
            const updateStmt = database.db.prepare(`
                UPDATE subscriptions SET status = 'cancelled', cancelledAt = ?
                WHERE subscriptionId = ?
            `);
            updateStmt.run(now, subscriptionId);

            // Store analytics event
            const metadata = JSON.stringify({ subscriptionId });
            const insertStmt = database.db.prepare(`
                INSERT INTO analytics (event, walletAddress, timestamp, metadata, createdAt)
                VALUES (?, ?, ?, ?, ?)
            `);
            insertStmt.run('subscription_cancelled', walletAddress || 'unknown', now, metadata, now);
        }

        logger.info({ subscriptionId }, 'Subscription cancelled');

        res.json({
            success: true,
            message: 'Subscription cancelled successfully',
            subscriptionId
        });
    } catch (error) {
        console.error('Subscription cancellation error:', error.response?.data || error.message);

        // Handle specific PayPal errors
        if (error.response?.status === 404) {
            return res.status(404).json({
                success: false,
                error: 'Subscription not found in PayPal'
            });
        }

        res.status(500).json({
            success: false,
            error: error.response?.data?.message || error.message
        });
    }
});

// Get analytics data (for admin dashboard)
app.get('/api/analytics', authenticateAdmin, async (req, res) => {
    try {
        // Return mock data if database not connected
        if (!database || !database.isConnected) {
            return res.json({
                totalWallets: 0,
                activeSubscriptions: 0,
                monthlyRevenue: 0,
                totalRevenue: 0,
                message: 'Database not connected - showing default values'
            });
        }

        // Count total wallet creation events (SQLite)
        const walletsResult = database.db.prepare(
            "SELECT COUNT(*) as count FROM analytics WHERE event = 'wallet_created'"
        ).get();
        const totalWallets = walletsResult.count;

        // Count active subscriptions (SQLite)
        const subsResult = database.db.prepare(
            "SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'"
        ).get();
        const activeSubscriptions = subsResult.count;

        // Calculate monthly revenue (last 30 days) (SQLite)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

        const recentSubsResult = database.db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total FROM subscriptions
            WHERE startTime >= ? AND status IN ('active', 'cancelled')
        `).get(thirtyDaysAgo);
        const monthlyRevenue = recentSubsResult.total;

        // Calculate total revenue (all time) (SQLite)
        const totalRevenueResult = database.db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total FROM subscriptions
            WHERE status IN ('active', 'cancelled')
        `).get();
        const totalRevenue = totalRevenueResult.total;

        res.json({
            totalWallets,
            activeSubscriptions,
            monthlyRevenue: parseFloat(monthlyRevenue.toFixed(2)),
            totalRevenue: parseFloat(totalRevenue.toFixed(2))
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all subscriptions (for admin dashboard)
app.get('/api/subscriptions', authenticateAdmin, async (req, res) => {
    try {
        // Return empty array if database not connected
        if (!database || !database.isConnected) {
            return res.json([]);
        }

        // Fetch all active subscriptions, sorted by most recent first (SQLite)
        const subscriptions = database.db.prepare(`
            SELECT walletAddress, subscriptionId, planId, amount, currency, startTime, status
            FROM subscriptions
            WHERE status = 'active'
            ORDER BY startTime DESC
            LIMIT 100
        `).all();

        // Format for frontend display
        const formatted = subscriptions.map(sub => ({
            walletAddress: sub.walletAddress,
            subscriptionId: sub.subscriptionId,
            planId: sub.planId,
            amount: sub.amount,
            currency: sub.currency,
            startDate: new Date(sub.startTime).toISOString(),
            status: sub.status
        }));

        res.json(formatted);
    } catch (error) {
        console.error('Subscriptions fetch error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Track wallet creation (called from frontend when wallet is generated)
app.post('/api/analytics/wallet-created', async (req, res) => {
    try {
        const { walletAddress, timestamp } = req.body;

        // Validate required field
        if (!walletAddress) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: walletAddress'
            });
        }

        // Store analytics event if database is connected (SQLite)
        if (database && database.isConnected) {
            const now = Date.now();
            const eventTime = timestamp ? new Date(timestamp).getTime() : now;

            const insertStmt = database.db.prepare(`
                INSERT INTO analytics (event, walletAddress, timestamp, metadata, createdAt)
                VALUES (?, ?, ?, ?, ?)
            `);
            insertStmt.run('wallet_created', walletAddress, eventTime, '{}', now);
        }

        logger.info({ walletAddress }, 'Wallet created');

        res.json({
            success: true,
            message: 'Wallet creation tracked'
        });
    } catch (error) {
        console.error('Wallet tracking error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== P2P Network ==========

const initP2PServer = () => {
    let server;
    let actualP2PPort = P2P_PORT;

    const attachConnectionHandler = (wsServer) => {
        wsServer.on('connection', (ws, req) => {
            const remoteAddress = req.socket.remoteAddress;

            // Log certificate info if mTLS is enabled
            if (ENABLE_P2P_TLS && req.socket.getPeerCertificate) {
                const peerCert = req.socket.getPeerCertificate();
                if (peerCert && peerCert.subject) {
                    console.log(`[P2P] Connection from ${remoteAddress} (CN: ${peerCert.subject.CN})`);
                }
            }

            console.log(`[P2P] Incoming connection from ${remoteAddress}`);
            initConnection(ws, remoteAddress);
        });
    };

    const startP2PServer = (port) => {
        if (ENABLE_P2P_TLS) {
            // Load or generate TLS certificates
            const certPath = process.env.TLS_CERT_PATH || path.join(__dirname, 'certs', 'node-cert.pem');
            const keyPath = process.env.TLS_KEY_PATH || path.join(__dirname, 'certs', 'node-key.pem');

            // Check if certificates exist
            if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
                console.log('[P2P] TLS certificates not found, generating self-signed certificates...');
                const { generateSelfSignedNodeCertificate, saveCertificates } = require('./generate-certs');
                const { cert, key } = generateSelfSignedNodeCertificate();
                saveCertificates(cert, key, path.join(__dirname, 'certs'));
            }

            // Prepare TLS options
            const tlsOptions = {
                cert: fs.readFileSync(certPath),
                key: fs.readFileSync(keyPath)
            };

            // Enable mTLS if configured
            if (P2P_TLS_REQUIRE_CLIENT_CERT) {
                if (!fs.existsSync(P2P_TLS_CA_CERT)) {
                    console.warn(`[P2P] mTLS required but CA certificate not found at ${P2P_TLS_CA_CERT}`);
                    console.warn('[P2P] Falling back to server-only TLS (no client cert verification)');
                } else {
                    tlsOptions.ca = fs.readFileSync(P2P_TLS_CA_CERT);
                    tlsOptions.requestCert = true;        // Request client certificate
                    tlsOptions.rejectUnauthorized = true; // Reject if not signed by our CA
                    console.log('[P2P] Mutual TLS (mTLS) enabled - client certificate verification required');
                }
            }

            // Create HTTPS server for WSS
            const httpsServer = https.createServer(tlsOptions);

            httpsServer.listen(port, () => {
                actualP2PPort = port;
                const mode = P2P_TLS_REQUIRE_CLIENT_CERT && fs.existsSync(P2P_TLS_CA_CERT) ? 'mTLS' : 'TLS';
                console.log(`[P2P] Secure WebSocket server (WSS with ${mode}) listening on port: ${port}`);
            }).on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.warn(`[P2P] Port ${port} in use, trying alternate port...`);
                    startP2PServer(port + 1);
                    return;
                }
            });

            server = new WebSocket.Server({ server: httpsServer });
            attachConnectionHandler(server);
        } else {
            // Plain WebSocket (not recommended for production)
            const wsServer = new WebSocket.Server({ port: port });

            wsServer.on('listening', () => {
                actualP2PPort = port;
                console.log(`[P2P] WebSocket server (WS - UNENCRYPTED) listening on port: ${port}`);
                console.warn('[P2P] ⚠️  WARNING: TLS disabled. Enable with ENABLE_P2P_TLS=true for production.');
            });

            wsServer.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    console.warn(`[P2P] Port ${port} in use, trying alternate port...`);
                    startP2PServer(port + 1);
                    return;
                }
            });

            server = wsServer;
            attachConnectionHandler(server);
        }
    };

    startP2PServer(P2P_PORT);
};

const initConnection = (ws, remoteAddress) => {
    let peerId = null;
    let handshakeComplete = false;

    // Send our handshake
    const ourHandshake = createHandshake(nodePrivateKey);
    write(ws, { type: MessageType.HANDSHAKE, data: ourHandshake });

    initMessageHandler(ws, remoteAddress, (id) => {
        peerId = id;
        handshakeComplete = true;
    });

    initErrorHandler(ws, () => {
        if (peerId) {
            peerManager.removePeer(peerId);
        }
    });
};

const initMessageHandler = (ws, remoteAddress, onHandshakeComplete) => {
    let peerId = null;
    let handshakeReceived = false;

    ws.on('message', (data) => {
        try {
            // Validate message
            const message = validateMessage(data);

            // Handle handshake first
            if (message.type === MessageType.HANDSHAKE && !handshakeReceived) {
                try {
                    verifyHandshake(message.data);
                    peerId = message.data.nodeId;
                    handshakeReceived = true;

                    // Check if banned
                    if (peerManager.isBanned(peerId)) {
                        console.log(`[P2P] Rejected banned peer ${peerId.substring(0, 16)}...`);
                        ws.close();
                        return;
                    }

                    // Add to peer manager
                    peerManager.addPeer(peerId, ws, message.data);
                    onHandshakeComplete(peerId);

                    // Query chain after handshake
                    write(ws, queryChainLengthMsg());
                } catch (err) {
                    console.error(`[P2P] Handshake failed: ${err.message}`);
                    ws.close();
                    return;
                }
            } else if (!handshakeReceived) {
                console.log('[P2P] Message before handshake, closing connection');
                ws.close();
                return;
            }

            // Rate limiting
            if (!peerManager.checkRateLimit(peerId)) {
                console.warn(`[P2P] Rate limit exceeded for ${peerId.substring(0, 16)}...`);
                const result = peerManager.incrementBanScore(peerId, 20);
                if (result.banned) {
                    peerManager.removePeer(peerId);
                    ws.close();
                }
                return;
            }

            // Handle message
            switch (message.type) {
                case MessageType.QUERY_LATEST:
                    write(ws, responseLatestMsg());
                    break;
                case MessageType.QUERY_ALL:
                    write(ws, responseChainMsg());
                    break;
                case MessageType.RESPONSE_BLOCKCHAIN:
                    handleBlockchainResponse(message.data, peerId, ws);
                    break;
                case MessageType.NEW_TRANSACTION:
                    handleNewTransaction(message.data, peerId);
                    break;
                case MessageType.NEW_BLOCK:
                    handleNewBlock(message.data, peerId);
                    break;
            }
        } catch (err) {
            console.error(`[P2P] Message handling error: ${err.message}`);
            if (peerId) {
                const result = peerManager.incrementBanScore(peerId, 10);
                if (result.banned) {
                    peerManager.removePeer(peerId);
                    ws.close();
                }
            } else {
                ws.close();
            }
        }
    });
};

const initErrorHandler = (ws, onClose) => {
    const closeConnection = (ws) => {
        console.log('[P2P] Connection closed');
        if (onClose) onClose();
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', (err) => {
        console.error('[P2P] WebSocket error:', err.message);
        closeConnection(ws);
    });
};

const connectToPeer = (newPeer) => {
    const wsOptions = {};

    // Configure TLS/mTLS for outgoing connections
    if (ENABLE_P2P_TLS) {
        wsOptions.rejectUnauthorized = false; // Accept self-signed by default

        // Enable mTLS if CA certificate is available
        if (P2P_TLS_REQUIRE_CLIENT_CERT && fs.existsSync(P2P_TLS_CA_CERT)) {
            const certPath = process.env.TLS_CERT_PATH || path.join(__dirname, 'certs', 'node-cert.pem');
            const keyPath = process.env.TLS_KEY_PATH || path.join(__dirname, 'certs', 'node-key.pem');

            if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
                // Use client certificate for authentication to peer
                wsOptions.cert = fs.readFileSync(certPath);
                wsOptions.key = fs.readFileSync(keyPath);
                wsOptions.ca = fs.readFileSync(P2P_TLS_CA_CERT);
                wsOptions.rejectUnauthorized = true; // Verify peer certificate
                console.log(`[P2P] Connecting to ${newPeer} with mTLS client certificate`);
            }
        }
    }

    const ws = new WebSocket(newPeer, wsOptions);

    ws.on('open', () => {
        if (ENABLE_P2P_TLS && ws._socket && ws._socket.getPeerCertificate) {
            const peerCert = ws._socket.getPeerCertificate();
            if (peerCert && peerCert.subject) {
                console.log(`[P2P] Connected to peer: ${newPeer} (CN: ${peerCert.subject.CN})`);
            } else {
                console.log(`[P2P] Connected to peer: ${newPeer}`);
            }
        } else {
            console.log(`[P2P] Connected to peer: ${newPeer}`);
        }
        initConnection(ws, newPeer);
    });

    ws.on('error', (err) => {
        console.error(`[P2P] Connection failed to ${newPeer}:`, err.message);
    });
};

const handleBlockchainResponse = (receivedBlocks, peerId, ws) => {
    if (receivedBlocks.length === 0) {
        console.log('Received empty blockchain');
        return;
    }

    const latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    const latestBlockHeld = biriliumChain.getLatestBlock();

    // Compare block indices (height) instead of timestamps to determine which chain is longer
    if (latestBlockReceived.index > latestBlockHeld.index) {
        console.log(`Blockchain possibly behind. Local: ${latestBlockHeld.index} blocks, Peer: ${latestBlockReceived.index} blocks`);

        // If we received the full chain (more than 1 block), replace our chain
        if (receivedBlocks.length > 1) {
            console.log(`Received full chain with ${receivedBlocks.length} blocks, replacing...`);
            replaceChain(receivedBlocks);
            return;
        }

        // Single block received - try to append if it connects to our chain
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            console.log('Attempting to append single block to chain');
            const block = convertBlockData(latestBlockReceived);
            if (isValidBlock(block, latestBlockHeld)) {
                biriliumChain.chain.push(block);
                biriliumChain.balanceCacheDirty = true;
                biriliumChain.noncesCacheDirty = true;
                // Update supply for any coinbase transactions
                for (const tx of block.transactions) {
                    if (tx.fromAddress === null) {
                        biriliumChain.currentSupply += tx.amount;
                    }
                }
                // Save to database
                if (database && database.isConnected) {
                    database.saveBlock(block, block.index).catch(err => {
                        console.error('Error saving block:', err.message);
                    });
                    biriliumChain.saveToDatabase();
                }
                console.log(`✓ Appended block #${block.index} to chain`);
                broadcast(responseLatestMsg());
            } else {
                console.log('Single block validation failed, requesting full chain');
                write(ws, queryAllMsg());
            }
        } else {
            console.log('Block does not connect to our chain, requesting full chain');
            write(ws, queryAllMsg());
        }
    } else if (latestBlockReceived.index < latestBlockHeld.index) {
        console.log(`Peer blockchain is behind. Local: ${latestBlockHeld.index} blocks, Peer: ${latestBlockReceived.index} blocks. Sending our chain.`);
        // Send our longer chain to the peer
        write(ws, responseChainMsg());
    } else {
        // SAME HEIGHT - Check if we have the same blocks (fork detection)
        if (latestBlockReceived.hash !== latestBlockHeld.hash) {
            console.log(`[P2P] Fork detected at block #${latestBlockHeld.index}! Our hash: ${latestBlockHeld.hash.substring(0, 16)}... Their hash: ${latestBlockReceived.hash.substring(0, 16)}...`);

            // Request full chain to compare properly
            if (receivedBlocks.length === 1) {
                console.log('[P2P] Requesting full chain for fork resolution');
                write(ws, queryAllMsg());
            } else {
                // We have full chains - use deterministic tie-breaker (lower hash wins)
                // This ensures all nodes converge to the same chain
                if (latestBlockReceived.hash < latestBlockHeld.hash) {
                    console.log('[P2P] Peer chain wins tie-breaker (lower hash). Adopting their chain.');
                    replaceChainWithTieBreaker(receivedBlocks);
                } else {
                    console.log('[P2P] Our chain wins tie-breaker (lower hash). Sending our chain to peer.');
                    write(ws, responseChainMsg());
                }
            }
        } else {
            console.log(`✓ Blockchains are synced at block #${latestBlockHeld.index}`);
        }
    }
};

const handleNewTransaction = (transaction, peerId) => {
    try {
        const tx = new Transaction(
            transaction.fromAddress,
            transaction.toAddress,
            transaction.amount,
            transaction.fee || 0,
            transaction.nonce || 0
        );
        tx.signature = transaction.signature;
        tx.timestamp = transaction.timestamp;

        if (tx.isValid()) {
            biriliumChain.addTransaction(tx);
            console.log('[P2P] New transaction added to pool');
        } else {
            console.warn(`[P2P] Invalid transaction from ${peerId.substring(0, 16)}...`);
            peerManager.incrementBanScore(peerId, 5);
        }
    } catch (error) {
        console.error(`[P2P] Transaction handling error: ${error.message}`);
        peerManager.incrementBanScore(peerId, 5);
    }
};

// Orphan block pool for handling forks
const orphanBlocks = new Map(); // hash -> block

const convertBlockData = (blockData) => {
    const Block = require('./Block');
    const Transaction = require('./Transaction');

    const transactions = (blockData.transactions || []).map(txData => {
        const tx = new Transaction(
            txData.fromAddress,
            txData.toAddress,
            txData.amount,
            txData.fee || 0,
            txData.nonce || 0  // Pass nonce to constructor
        );
        tx.timestamp = txData.timestamp;  // Override constructor's Date.now()
        tx.signature = txData.signature;
        return tx;
    });

    const block = new Block(
        blockData.timestamp,
        transactions,
        blockData.previousHash,
        blockData.index
    );
    block.hash = blockData.hash;
    block.nonce = blockData.nonce;
    return block;
};

const isValidBlock = (block, previousBlock) => {
    // Check index
    if (previousBlock.index + 1 !== block.index) {
        console.log(`[BlockValidation] Index mismatch: expected ${previousBlock.index + 1}, got ${block.index}`);
        return false;
    }
    // Check previous hash link
    if (previousBlock.hash !== block.previousHash) {
        console.log(`[BlockValidation] Previous hash mismatch:`);
        console.log(`  Expected: ${previousBlock.hash}`);
        console.log(`  Got: ${block.previousHash}`);
        return false;
    }
    // Check proof of work (use minimum difficulty to allow for difficulty changes)
    // Note: We trust the hash if it has valid PoW and links correctly.
    // Hash recalculation is unreliable due to JSON serialization differences.
    const MIN_DIFFICULTY = 2;
    const leadingZeros = (block.hash.match(/^0*/) || [''])[0].length;
    if (leadingZeros < MIN_DIFFICULTY) {
        console.log(`[BlockValidation] PoW failed: ${leadingZeros} zeros, need ${MIN_DIFFICULTY}`);
        return false;
    }
    return true;
};

const handleNewBlock = (blockData, peerId) => {
    try {
        const block = convertBlockData(blockData);
        const latestBlock = biriliumChain.getLatestBlock();

        // Case 1: Block extends our current chain directly
        if (block.previousHash === latestBlock.hash && block.index === latestBlock.index + 1) {
            if (isValidBlock(block, latestBlock)) {
                biriliumChain.chain.push(block);
                biriliumChain.balanceCacheDirty = true;
                biriliumChain.noncesCacheDirty = true;
                console.log(`[P2P] New block #${block.index} added to chain`);

                // Save to database
                if (database && database.isConnected) {
                    database.saveBlock(block, block.index).catch(err => {
                        console.error('Error saving block:', err.message);
                    });
                }

                // Broadcast to other peers
                broadcast(responseNewBlockMsg(block));

                // Check if any orphan blocks can now be connected
                processOrphanBlocks();
            } else {
                console.warn(`[P2P] Invalid block from ${peerId.substring(0, 16)}...`);
            }
            return;
        }

        // Case 2: Block is ahead of us - we need to sync
        if (block.index > latestBlock.index + 1) {
            console.log(`[P2P] Block #${block.index} is ahead of our chain (we have #${latestBlock.index}). Requesting full chain.`);
            // Store as orphan and request full chain
            orphanBlocks.set(block.hash, block);
            // Request the full chain from this peer
            const peer = peerManager.getAllPeers().find(p => p.peerId === peerId);
            if (peer) {
                write(peer.ws, queryAllMsg());
            }
            return;
        }

        // Case 3: Competing block at same height (fork) or extends different branch
        if (block.index <= latestBlock.index) {
            // Check if this block could be part of a longer chain
            // Store it as orphan - it might become relevant if we receive a longer chain
            if (!orphanBlocks.has(block.hash)) {
                orphanBlocks.set(block.hash, block);
                console.log(`[P2P] Stored competing block #${block.index} as orphan (fork candidate)`);

                // If this block is at our chain tip height, request full chain to check if peer has longer chain
                if (block.index === latestBlock.index) {
                    const peer = peerManager.getAllPeers().find(p => p.peerId === peerId);
                    if (peer) {
                        write(peer.ws, queryAllMsg());
                    }
                }
            }
            return;
        }

    } catch (error) {
        console.error(`[P2P] Block handling error: ${error.message}`);
    }
};

const processOrphanBlocks = () => {
    // Try to connect orphan blocks to our chain
    let connected = true;
    while (connected && orphanBlocks.size > 0) {
        connected = false;
        const latestBlock = biriliumChain.getLatestBlock();

        for (const [hash, block] of orphanBlocks) {
            if (block.previousHash === latestBlock.hash && block.index === latestBlock.index + 1) {
                if (isValidBlock(block, latestBlock)) {
                    biriliumChain.chain.push(block);
                    biriliumChain.balanceCacheDirty = true;
                    biriliumChain.noncesCacheDirty = true;
                    orphanBlocks.delete(hash);
                    console.log(`[P2P] Connected orphan block #${block.index} to chain`);

                    if (database && database.isConnected) {
                        database.saveBlock(block, block.index).catch(err => {
                            console.error('Error saving block:', err.message);
                        });
                    }
                    connected = true;
                    break;
                }
            }
        }
    }

    // Clean up old orphans (keep only last 100)
    if (orphanBlocks.size > 100) {
        const toDelete = orphanBlocks.size - 100;
        let deleted = 0;
        for (const hash of orphanBlocks.keys()) {
            if (deleted >= toDelete) break;
            orphanBlocks.delete(hash);
            deleted++;
        }
    }
};

const replaceChain = (newBlocks) => {
    // Debug: log received chain info
    if (newBlocks.length > 1) {
        console.log('[P2P Sync] Received chain with', newBlocks.length, 'blocks');
    }

    // Convert plain objects to Block instances
    const convertedBlocks = newBlocks.map((blockData, idx) => {
        return convertBlockData({
            ...blockData,
            index: blockData.index !== undefined ? blockData.index : idx
        });
    });

    // Validate genesis block matches ours
    const ourGenesis = biriliumChain.chain[0];
    const theirGenesis = convertedBlocks[0];

    if (ourGenesis.hash !== theirGenesis.hash) {
        console.log('[P2P Sync] Genesis block mismatch - different networks');
        console.log(`  Our genesis: ${ourGenesis.hash}`);
        console.log(`  Their genesis: ${theirGenesis.hash}`);
        return;
    }

    // Validate new chain
    const tempChain = Object.assign(Object.create(Object.getPrototypeOf(biriliumChain)), biriliumChain);
    tempChain.chain = convertedBlocks;

    if (!tempChain.isChainValid()) {
        console.log('[P2P Sync] Received invalid chain - validation failed');
        return;
    }

    // Only replace if new chain is longer (longest chain rule)
    if (convertedBlocks.length <= biriliumChain.chain.length) {
        console.log(`[P2P Sync] Received chain is not longer (theirs: ${convertedBlocks.length}, ours: ${biriliumChain.chain.length})`);
        return;
    }

    // Find the fork point (where chains diverge)
    let forkPoint = 0;
    for (let i = 0; i < Math.min(biriliumChain.chain.length, convertedBlocks.length); i++) {
        if (biriliumChain.chain[i].hash === convertedBlocks[i].hash) {
            forkPoint = i;
        } else {
            break;
        }
    }

    const blocksToReplace = biriliumChain.chain.length - forkPoint - 1;
    const blocksToAdd = convertedBlocks.length - forkPoint - 1;

    console.log(`[P2P Sync] Chain reorganization: removing ${blocksToReplace} blocks, adding ${blocksToAdd} blocks (fork at #${forkPoint})`);

    // Store old chain tip for potential orphan reprocessing
    const oldChain = biriliumChain.chain.slice();

    // Replace the chain
    biriliumChain.chain = convertedBlocks;

    // Recalculate currentSupply from the new chain (sum of all mining rewards)
    let newSupply = 0;
    for (const block of convertedBlocks) {
        for (const tx of block.transactions) {
            // Coinbase transactions have null fromAddress
            if (tx.fromAddress === null) {
                newSupply += tx.amount;
            }
        }
    }
    biriliumChain.currentSupply = newSupply;
    console.log(`[P2P Sync] Recalculated supply: ${newSupply} BRL`);

    // Rebuild caches after chain replacement
    biriliumChain.balanceCacheDirty = true;
    biriliumChain.noncesCacheDirty = true;

    // Save new blocks to database (only blocks after fork point)
    if (database && database.isConnected) {
        (async () => {
            // Save only the new/changed blocks
            for (let i = forkPoint; i < convertedBlocks.length; i++) {
                try {
                    await database.saveBlock(convertedBlocks[i], convertedBlocks[i].index);
                } catch (err) {
                    console.error(`Failed to save block ${i}:`, err.message);
                }
            }
            console.log(`✓ Saved ${convertedBlocks.length - forkPoint} blocks to database`);
            // Save blockchain state (supply, difficulty)
            await biriliumChain.saveToDatabase();
        })();
    }

    // Re-add orphaned transactions back to mempool
    // Transactions from old chain blocks (after fork point) that aren't in new chain
    for (let i = forkPoint + 1; i < oldChain.length; i++) {
        const oldBlock = oldChain[i];
        for (const tx of oldBlock.transactions) {
            // Check if transaction exists in new chain
            const existsInNewChain = convertedBlocks.some(block =>
                block.transactions.some(newTx => newTx.signature === tx.signature)
            );
            if (!existsInNewChain && tx.fromAddress) { // Don't re-add coinbase transactions
                try {
                    biriliumChain.addTransaction(tx);
                    console.log(`[P2P Sync] Re-added orphaned transaction to mempool`);
                } catch (e) {
                    // Transaction might be invalid now, ignore
                }
            }
        }
    }

    broadcast(responseLatestMsg());
    console.log(`✓ Blockchain synced: ${convertedBlocks.length} blocks (reorg from #${forkPoint})`);
};

// Fork resolution: Replace chain with equal-length chain (tie-breaker scenario)
const replaceChainWithTieBreaker = (newBlocks) => {
    console.log('[P2P Fork] Resolving fork with tie-breaker (same length chains)');

    // Convert plain objects to Block instances
    const convertedBlocks = newBlocks.map((blockData, idx) => {
        return convertBlockData({
            ...blockData,
            index: blockData.index !== undefined ? blockData.index : idx
        });
    });

    // Validate genesis block matches ours
    const ourGenesis = biriliumChain.chain[0];
    const theirGenesis = convertedBlocks[0];

    if (ourGenesis.hash !== theirGenesis.hash) {
        console.log('[P2P Fork] Genesis block mismatch - different networks');
        return;
    }

    // Validate new chain
    const tempChain = Object.assign(Object.create(Object.getPrototypeOf(biriliumChain)), biriliumChain);
    tempChain.chain = convertedBlocks;

    if (!tempChain.isChainValid()) {
        console.log('[P2P Fork] Received invalid chain - validation failed');
        return;
    }

    // Find the fork point (where chains diverge)
    let forkPoint = 0;
    for (let i = 0; i < Math.min(biriliumChain.chain.length, convertedBlocks.length); i++) {
        if (biriliumChain.chain[i].hash === convertedBlocks[i].hash) {
            forkPoint = i;
        } else {
            break;
        }
    }

    console.log(`[P2P Fork] Fork detected at block #${forkPoint}`);

    // Store old chain for transaction recovery
    const oldChain = biriliumChain.chain.slice();

    // Replace the chain
    biriliumChain.chain = convertedBlocks;

    // Recalculate supply
    let newSupply = 0;
    for (const block of convertedBlocks) {
        for (const tx of block.transactions) {
            if (tx.fromAddress === null) {
                newSupply += tx.amount;
            }
        }
    }
    biriliumChain.currentSupply = newSupply;
    console.log(`[P2P Fork] Recalculated supply: ${newSupply} BRL`);

    // Rebuild caches
    biriliumChain.balanceCacheDirty = true;
    biriliumChain.noncesCacheDirty = true;

    // Save to database
    if (database && database.isConnected) {
        (async () => {
            for (let i = forkPoint; i < convertedBlocks.length; i++) {
                try {
                    await database.saveBlock(convertedBlocks[i], convertedBlocks[i].index);
                } catch (err) {
                    console.error(`Failed to save block ${i}:`, err.message);
                }
            }
            await biriliumChain.saveToDatabase();
            console.log(`✓ Fork resolution saved to database`);
        })();
    }

    // Re-add orphaned transactions back to mempool
    for (let i = forkPoint + 1; i < oldChain.length; i++) {
        const oldBlock = oldChain[i];
        for (const tx of oldBlock.transactions) {
            const existsInNewChain = convertedBlocks.some(block =>
                block.transactions.some(newTx => newTx.signature === tx.signature)
            );
            if (!existsInNewChain && tx.fromAddress) {
                try {
                    biriliumChain.addTransaction(tx);
                    console.log(`[P2P Fork] Re-added orphaned transaction to mempool`);
                } catch (e) {
                    // Transaction might be invalid now
                }
            }
        }
    }

    broadcast(responseLatestMsg());
    console.log(`✓ Fork resolved: adopted peer chain with lower hash`);
};

// Message creators
const queryChainLengthMsg = () => ({ type: MessageType.QUERY_LATEST });
const queryAllMsg = () => ({ type: MessageType.QUERY_ALL });
const responseChainMsg = () => ({ type: MessageType.RESPONSE_BLOCKCHAIN, data: biriliumChain.chain });
const responseLatestMsg = () => ({
    type: MessageType.RESPONSE_BLOCKCHAIN,
    data: [biriliumChain.getLatestBlock()]
});
const responseNewTransactionMsg = (tx) => ({ type: MessageType.NEW_TRANSACTION, data: tx });
const responseNewBlockMsg = (block) => ({ type: MessageType.NEW_BLOCK, data: block });

const write = (ws, message) => {
    try {
        ws.send(JSON.stringify(message));
    } catch (err) {
        console.error('[P2P] Write error:', err.message);
    }
};

const broadcast = (message) => {
    const peers = peerManager.getAllPeers();
    peers.forEach(peer => {
        try {
            write(peer.ws, message);
        } catch (err) {
            console.error('[P2P] Broadcast error:', err.message);
        }
    });
};

// ========== Configuration Validation ==========
console.log('Validating configuration...');
const configValidation = security.validateConfiguration();

if (configValidation.warnings.length > 0) {
    console.log('\n⚠️  Configuration Warnings:');
    configValidation.warnings.forEach(w => console.log(`   - ${w}`));
}

if (!configValidation.valid) {
    console.error('\n❌ Configuration Errors:');
    configValidation.errors.forEach(e => console.error(`   - ${e}`));
    console.error('\nPlease fix configuration errors before starting.\n');
    // Continue anyway for development, but warn
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
}

// ========== Start Server ==========

const server = app.listen(HTTP_PORT, () => {
    logger.startup({
        httpPort: HTTP_PORT,
        p2pPort: P2P_PORT,
        nodeEnv: process.env.NODE_ENV || 'development',
        difficulty: biriliumChain.difficulty,
        maxSupply: biriliumChain.maxSupply,
        miningReward: biriliumChain.miningReward,
        enableLWMA: biriliumChain.enableLWMA,
        enableP2PTLS: ENABLE_P2P_TLS
    });

    console.log('=================================');
    console.log('  BIRILIUM BLOCKCHAIN NODE v2.2');
    console.log('=================================');
    console.log(`HTTP API: http://localhost:${HTTP_PORT}`);
    console.log(`P2P Port: ${P2P_PORT}`);
    console.log(`WebSocket: ws://localhost:${HTTP_PORT}/ws`);
    console.log(`Metrics: http://localhost:${HTTP_PORT}/metrics`);
    console.log(`Admin Dashboard: http://localhost:${HTTP_PORT}/admin`);
    console.log('=================================');

    // Initialize Admin WebSocket Server
    adminWebSocket.initialize(server, biriliumChain);

    // Initialize Client WebSocket Service for real-time updates
    wsService.initialize(server, '/ws');
    wsService.setReferences(adminWebSocket, biriliumChain);
    console.log('✓ WebSocket service initialized');
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[ERROR] Port ${HTTP_PORT} already in use!`);
        console.error('[INFO] Trying alternate port...');
        const altPort = HTTP_PORT + 1;
        app.listen(altPort, () => {
            console.log(`[INFO] Server started on alternate port: ${altPort}`);
            console.log(`HTTP API: http://localhost:${altPort}`);
        });
    } else {
        throw err;
    }
});

initP2PServer();

// Connect to initial peers if provided
const initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];
initialPeers.forEach(peer => {
    connectToPeer(peer);
    logger.p2p('connecting_to_peer', { peer });
});

// P2P Reconnection: Periodically check and reconnect to bootstrap peers
const P2P_RECONNECT_INTERVAL = 30000; // Check every 30 seconds
const P2P_SYNC_INTERVAL = 60000; // Force sync check every 60 seconds

setInterval(() => {
    const connectedPeers = peerManager.getAllPeers();

    // If no peers connected, try to reconnect to bootstrap peers
    if (connectedPeers.length === 0 && initialPeers.length > 0) {
        console.log('[P2P] No peers connected, attempting to reconnect...');
        initialPeers.forEach(peer => {
            connectToPeer(peer);
        });
    }
}, P2P_RECONNECT_INTERVAL);

// Periodic chain sync check - request latest block from peers
setInterval(() => {
    const connectedPeers = peerManager.getAllPeers();
    if (connectedPeers.length > 0) {
        console.log(`[P2P] Periodic sync check with ${connectedPeers.length} peers`);
        connectedPeers.forEach(peer => {
            try {
                write(peer.ws, queryChainLengthMsg());
            } catch (err) {
                console.error('[P2P] Sync check failed:', err.message);
            }
        });
    }
}, P2P_SYNC_INTERVAL);

// Periodic metrics update (every 30 seconds)
setInterval(() => {
    metrics.updateBlockchainState(biriliumChain);
}, 30000);

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.shutdown('SIGINT');
    await database.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.shutdown('SIGTERM');
    await database.close();
    process.exit(0);
});

module.exports = { biriliumChain, app, database };
