require('dotenv').config(); // Load environment variables

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const axios = require('axios'); // For PayPal API calls
const Blockchain = require('./Blockchain');
const Transaction = require('./Transaction');
const Database = require('./database');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

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

const app = express();
const HTTP_PORT = process.env.HTTP_PORT || 3001;
const P2P_PORT = process.env.P2P_PORT || 6001;
const API_KEY = process.env.API_KEY || null; // Optional API key
const ENABLE_P2P_TLS = process.env.ENABLE_P2P_TLS === 'true';
const P2P_TLS_REQUIRE_CLIENT_CERT = process.env.P2P_TLS_REQUIRE_CLIENT_CERT === 'true';
const P2P_TLS_CA_CERT = process.env.P2P_TLS_CA_CERT || path.join(__dirname, 'certs', 'ca-cert.pem');
const MAX_PEERS = parseInt(process.env.MAX_PEERS) || 32;

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
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

// Admin authentication middleware
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const authenticateAdmin = (req, res, next) => {
    const username = req.headers['x-admin-username'] || req.body.adminUsername || req.query.adminUsername;
    const password = req.headers['x-admin-password'] || req.body.adminPassword || req.query.adminPassword;

    if (!username || !password) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Missing admin credentials'
        });
    }

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid admin credentials'
        });
    }

    next();
};

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
initializeBlockchain().catch(console.error);

// P2P Security: Generate node identity
const nodePrivateKey = process.env.NODE_PRIVATE_KEY || ec.genKeyPair().getPrivate('hex');
const nodePublicKey = ec.keyFromPrivate(nodePrivateKey, 'hex').getPublic('hex');

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

// Get balance
app.get('/api/balance/:address', (req, res) => {
    const balance = biriliumChain.getBalanceOfAddress(req.params.address);
    res.json({ address: req.params.address, balance });
});

// Get transactions for address
app.get('/api/transactions/:address', (req, res) => {
    const txs = biriliumChain.getAllTransactionsForWallet(req.params.address);
    res.json(txs);
});

// Get pending transactions
app.get('/api/pending-transactions', (req, res) => {
    res.json(biriliumChain.pendingTransactions);
});

// Create a new wallet
app.post('/api/wallet/create', (req, res) => {
    try {
        const key = ec.genKeyPair();
        const publicKey = key.getPublic('hex');
        const privateKey = key.getPrivate('hex');

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
        const { fromAddress, toAddress, amount, fee, timestamp, signature } = req.body;

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

        // Create transaction object
        const tx = new Transaction(fromAddress, toAddress, parsedAmount, fee || 0);
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

        // Broadcast to network
        broadcast(responseNewTransactionMsg(tx));

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

// OLD ENDPOINT (DEPRECATED - kept for backward compatibility, will be removed, PUBLIC)
app.post('/api/transaction', (req, res) => {
    console.warn('DEPRECATED: /api/transaction endpoint used. Use /api/transaction/signed instead.');
    try {
        const { fromAddress, toAddress, amount, privateKey } = req.body;

        // Validate inputs
        if (!fromAddress || !toAddress || !amount || !privateKey) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: fromAddress, toAddress, amount, and privateKey are required'
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

        // Calculate fee
        const fee = biriliumChain.calculateTransactionFee(parsedAmount);

        // Create transaction with fee
        const tx = new Transaction(fromAddress, toAddress, parsedAmount, fee);

        // Sign transaction
        try {
            const key = ec.keyFromPrivate(privateKey, 'hex');
            tx.signTransaction(key);
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: 'Invalid private key format'
            });
        }

        // Add to blockchain
        biriliumChain.addTransaction(tx);

        // Broadcast to network
        broadcast(responseNewTransactionMsg(tx));

        res.json({
            success: true,
            message: 'Transaction added to pending pool',
            transaction: tx,
            fee: fee
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

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

        // Broadcast new block
        broadcast(responseNewBlockMsg(block));

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

// Admin dashboard - accessible via CTRL+ALT+A in wallet
app.get('/api/admin', (req, res) => {
    // Simple HTML admin dashboard
    const adminDashboard = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Birilium Admin Panel</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
            h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
            .section { margin: 20px 0; padding: 15px; background: #f9f9f9; border-left: 4px solid #007bff; }
            .stat { display: inline-block; margin-right: 30px; }
            .stat-value { font-size: 24px; font-weight: bold; color: #007bff; }
            .stat-label { color: #666; }
            button { padding: 8px 15px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
            button:hover { background: #0056b3; }
            input { padding: 8px; margin: 5px; border: 1px solid #ddd; border-radius: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background: #f5f5f5; font-weight: bold; }
            .error { color: #d32f2f; }
            .success { color: #388e3c; }
        </style>
        <script>
            async function loadStats() {
                try {
                    const health = await fetch('http://localhost:3001/health').then(r => r.json());
                    const stats = await fetch('http://localhost:3001/api/stats').then(r => r.json());

                    document.getElementById('blocks').textContent = health.blockchain.blocks;
                    document.getElementById('difficulty').textContent = health.blockchain.difficulty;
                    document.getElementById('pending').textContent = health.blockchain.pendingTransactions;
                    document.getElementById('peers').textContent = health.peers;
                    document.getElementById('memoryUsed').textContent = health.memory.used;
                    document.getElementById('uptime').textContent = health.uptimeFormatted;

                    document.getElementById('supply').textContent = (stats.currentSupply / 1e8).toFixed(2) + ' BRL';
                    document.getElementById('miningReward').textContent = stats.miningReward + ' BRL';
                } catch (e) {
                    document.getElementById('error').textContent = 'Error loading stats: ' + e.message;
                }
            }

            async function getPeers() {
                try {
                    const peers = await fetch('http://localhost:3001/api/peers').then(r => r.json());
                    let html = '<table><tr><th>Node ID</th><th>Version</th><th>Connected</th></tr>';
                    peers.forEach(p => {
                        html += '<tr><td>' + p.nodeId + '</td><td>' + p.version + '</td><td>' + p.connectedAt + '</td></tr>';
                    });
                    html += '</table>';
                    document.getElementById('peersList').innerHTML = html;
                } catch (e) {
                    document.getElementById('peersList').innerHTML = '<span class="error">Error: ' + e.message + '</span>';
                }
            }

            function goBack() {
                window.close();
            }

            window.onload = function() {
                loadStats();
                getPeers();
                setInterval(loadStats, 5000);
            };
        </script>
    </head>
    <body>
        <div class="container">
            <h1>Birilium Admin Panel</h1>
            <span id="error" class="error"></span>

            <div class="section">
                <h2>Blockchain Status</h2>
                <div class="stat">
                    <div class="stat-value" id="blocks">--</div>
                    <div class="stat-label">Total Blocks</div>
                </div>
                <div class="stat">
                    <div class="stat-value" id="difficulty">--</div>
                    <div class="stat-label">Difficulty</div>
                </div>
                <div class="stat">
                    <div class="stat-value" id="pending">--</div>
                    <div class="stat-label">Pending TX</div>
                </div>
                <div class="stat">
                    <div class="stat-value" id="peers">--</div>
                    <div class="stat-label">Connected Peers</div>
                </div>
            </div>

            <div class="section">
                <h2>Network Stats</h2>
                <div class="stat">
                    <div class="stat-value" id="supply">--</div>
                    <div class="stat-label">Current Supply</div>
                </div>
                <div class="stat">
                    <div class="stat-value" id="miningReward">--</div>
                    <div class="stat-label">Mining Reward</div>
                </div>
                <div class="stat">
                    <div class="stat-value" id="memoryUsed">--</div>
                    <div class="stat-label">Memory Used</div>
                </div>
                <div class="stat">
                    <div class="stat-value" id="uptime">--</div>
                    <div class="stat-label">Uptime</div>
                </div>
            </div>

            <div class="section">
                <h2>Connected Peers</h2>
                <div id="peersList">Loading...</div>
            </div>

            <div class="section">
                <button onclick="goBack()">Close Admin Panel</button>
            </div>
        </div>
    </body>
    </html>
    `;
    res.send(adminDashboard);
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
        const PAYPAL_PLAN_ID = 'P-57Y69741R9575314SNDUCLPY'; // Premium Mining Plan

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

// Admin login endpoint
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            error: 'Username and password required'
        });
    }

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        res.json({
            success: true,
            message: 'Admin authentication successful'
        });
    } else {
        res.status(401).json({
            success: false,
            error: 'Invalid admin credentials'
        });
    }
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

        // Store subscription in database
        const subscription = {
            walletAddress,
            subscriptionId,
            planId,
            amount: parseFloat(amount),
            currency: currency || 'USD',
            startDate: new Date(timestamp || Date.now()),
            status: 'active',
            cancelledAt: null,
            createdAt: new Date()
        };

        await database.db.collection('subscriptions').insertOne(subscription);

        // Store analytics event
        const analyticsEvent = {
            event: 'subscription_activated',
            walletAddress,
            timestamp: new Date(timestamp || Date.now()),
            metadata: {
                subscriptionId,
                planId,
                amount: parseFloat(amount),
                currency: currency || 'USD'
            }
        };

        await database.db.collection('analytics').insertOne(analyticsEvent);

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
        const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || 'AQWyciyninNqul8a60qGjkbez7hCmJ9GHXd7FMKZuXYn6AK_O2KbnFnqogFcWZaRWE4wwFREnlm7EaYe';
        const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
        const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox'; // 'sandbox' or 'live'

        if (!PAYPAL_CLIENT_SECRET) {
            return res.status(500).json({
                success: false,
                error: 'PayPal API not configured. Set PAYPAL_CLIENT_SECRET environment variable.'
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

        // Step 3: Update database if connected
        if (database && database.isConnected) {
            await database.db.collection('subscriptions').updateOne(
                { subscriptionId },
                {
                    $set: {
                        status: 'cancelled',
                        cancelledAt: new Date()
                    }
                }
            );

            // Store analytics event
            const analyticsEvent = {
                event: 'subscription_cancelled',
                walletAddress: walletAddress || 'unknown',
                timestamp: new Date(),
                metadata: { subscriptionId }
            };

            await database.db.collection('analytics').insertOne(analyticsEvent);
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

        // Count total wallet creation events
        const totalWallets = await database.db.collection('analytics').countDocuments({
            event: 'wallet_created'
        });

        // Count active subscriptions
        const activeSubscriptions = await database.db.collection('subscriptions').countDocuments({
            status: 'active'
        });

        // Calculate monthly revenue (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentSubscriptions = await database.db.collection('subscriptions').find({
            startDate: { $gte: thirtyDaysAgo },
            status: { $in: ['active', 'cancelled'] }
        }).toArray();

        const monthlyRevenue = recentSubscriptions.reduce((sum, sub) => sum + (sub.amount || 0), 0);

        // Calculate total revenue (all time)
        const allSubscriptions = await database.db.collection('subscriptions').find({
            status: { $in: ['active', 'cancelled'] }
        }).toArray();

        const totalRevenue = allSubscriptions.reduce((sum, sub) => sum + (sub.amount || 0), 0);

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

        // Fetch all active subscriptions, sorted by most recent first
        const subscriptions = await database.db.collection('subscriptions')
            .find({ status: 'active' })
            .sort({ startDate: -1 })
            .limit(100)
            .toArray();

        // Format for frontend display
        const formatted = subscriptions.map(sub => ({
            walletAddress: sub.walletAddress,
            subscriptionId: sub.subscriptionId,
            planId: sub.planId,
            amount: sub.amount,
            currency: sub.currency,
            startDate: sub.startDate,
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

        // Store analytics event if database is connected
        if (database && database.isConnected) {
            const analyticsEvent = {
                event: 'wallet_created',
                walletAddress,
                timestamp: new Date(timestamp || Date.now()),
                metadata: {}
            };

            await database.db.collection('analytics').insertOne(analyticsEvent);
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
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            console.log('Appending received block to chain');
            biriliumChain.chain.push(latestBlockReceived);
            broadcast(responseLatestMsg());
        } else if (receivedBlocks.length === 1) {
            console.log('Query full chain from peers');
            broadcast(queryAllMsg());
        } else {
            console.log('Received blockchain is longer than current');
            replaceChain(receivedBlocks);
        }
    } else if (latestBlockReceived.index < latestBlockHeld.index) {
        console.log(`Peer blockchain is behind. Local: ${latestBlockHeld.index} blocks, Peer: ${latestBlockReceived.index} blocks. Sending our chain.`);
        // Send our longer chain to the peer
        write(ws, responseChainMsg());
    } else {
        console.log(`Blockchains are synced at block ${latestBlockHeld.index}`);
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

const handleNewBlock = (block, peerId) => {
    try {
        const latestBlock = biriliumChain.getLatestBlock();
        if (block.previousHash === latestBlock.hash && block.timestamp > latestBlock.timestamp) {
            biriliumChain.chain.push(block);
            console.log('[P2P] New block added to chain');
        } else {
            console.warn(`[P2P] Invalid block from ${peerId.substring(0, 16)}...`);
            peerManager.incrementBanScore(peerId, 5);
        }
    } catch (error) {
        console.error(`[P2P] Block handling error: ${error.message}`);
        peerManager.incrementBanScore(peerId, 5);
    }
};

const replaceChain = (newBlocks) => {
    // Validate new chain
    const tempChain = Object.assign(Object.create(Object.getPrototypeOf(biriliumChain)), biriliumChain);
    tempChain.chain = newBlocks;

    if (tempChain.isChainValid() && newBlocks.length > biriliumChain.chain.length) {
        console.log('Replacing chain with new longer valid chain');
        biriliumChain.chain = newBlocks;
        broadcast(responseLatestMsg());
    } else {
        console.log('Received invalid chain');
    }
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
    console.log('  BIRILIUM BLOCKCHAIN NODE v2.1');
    console.log('=================================');
    console.log(`HTTP API: http://localhost:${HTTP_PORT}`);
    console.log(`P2P Port: ${P2P_PORT}`);
    console.log(`Metrics: http://localhost:${HTTP_PORT}/metrics`);
    console.log('=================================');
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
