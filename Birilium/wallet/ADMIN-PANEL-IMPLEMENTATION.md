# 🚀 Admin Panel Implementation Guide

**Status:** Modules Created ✅ | Integration Pending ⏳

---

## ✅ What's Been Created

### **1. Authentication Module** (`auth.js`)
- ✅ JWT token generation and verification
- ✅ Bcrypt password hashing
- ✅ Role-based access control (RBAC)
- ✅ Middleware for protecting routes
- ✅ API key generation

### **2. Audit Logging** (`audit.js`)
- ✅ Database table creation for audit logs
- ✅ Automatic logging of all admin actions
- ✅ Query and statistics functions
- ✅ Middleware for automatic audit trails

### **3. Admin WebSocket** (`admin-websocket.js`)
- ✅ Real-time updates to dashboard
- ✅ JWT authentication for WebSocket
- ✅ Event broadcasting (blocks, peers, alerts)
- ✅ Client management

---

## 📝 Integration Steps

### **Step 1: Update `.env` File**

Add these new environment variables:

```bash
# JWT Configuration
JWT_SECRET=your-very-long-random-secret-min-64-chars
JWT_EXPIRES_IN=12h
JWT_REFRESH_EXPIRES_IN=7d

# Use your generated credentials:
ADMIN_USERNAME=admin_YOUR_RANDOM_ID
ADMIN_PASSWORD_HASH=  # Will be generated on first run
```

### **Step 2: Integrate into `node.js`**

Add these imports at the top of `node.js` (after line 30):

```javascript
// Admin Panel Modules
const auth = require('./auth');
const audit = require('./audit');
const adminWebSocket = require('./admin-websocket');
```

**After database initialization** (around line 177), add:

```javascript
// Initialize audit logging
audit.initialize(database);

// Hash admin password on first run
const bcrypt = require('bcrypt');
let ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

if (!ADMIN_PASSWORD_HASH && ADMIN_PASSWORD) {
    console.log('Hashing admin password for first time...');
    ADMIN_PASSWORD_HASH = await auth.hashPassword(ADMIN_PASSWORD);
    console.log('Add to .env: ADMIN_PASSWORD_HASH=' + ADMIN_PASSWORD_HASH);
    console.log('Then remove ADMIN_PASSWORD from .env for security');
}
```

**Replace the old `authenticateAdmin` function** (line 137-156) with:

```javascript
// JWT-based admin authentication
const authenticateAdmin = auth.authenticateJWT;
const requireAdmin = auth.requireAdmin;
```

**Add new admin endpoints** (after line 1000):

```javascript
// ========== ADMIN PANEL API ==========

// Admin login endpoint (JWT)
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
        expiresIn: '12h',
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
                connected: peerManager.getActivePeersCount(),
                max: MAX_PEERS,
                list: peerManager.getPeerStats()
            },
            node: {
                version: "2.1.0",
                uptime: Math.floor(uptime),
                uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
                memoryMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                cpuPercent: 0 // Would need additional library
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

// Node restart endpoint (requires admin role)
app.post('/api/admin/node/restart', authenticateAdmin, requireAdmin, audit.auditMiddleware('NODE_RESTART'), async (req, res) => {
    res.json({
        success: true,
        message: 'Node restart initiated',
        warning: 'This endpoint would restart the node in production. Disabled for safety in this version.'
    });

    // In production:
    // setTimeout(() => process.exit(0), 1000);
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
```

**Initialize Admin WebSocket** (after HTTP server starts, around line 1100):

```javascript
// Initialize Admin WebSocket Server
const httpServer = app.listen(HTTP_PORT, () => {
    console.log(`HTTP API: http://localhost:${HTTP_PORT}`);
});

adminWebSocket.initialize(httpServer, biriliumChain);
```

**Add WebSocket event triggers:**

When a new block is mined (in mining endpoint or block sync), add:

```javascript
adminWebSocket.onNewBlock(newBlock, biriliumChain.chain.length - 1);
```

When mempool changes:

```javascript
adminWebSocket.onMempoolUpdate(biriliumChain.pendingTransactions.length, [txId], []);
```

---

## 📦 Files Created

```
Birilium/wallet/node-backend/
├── auth.js                    ✅ JWT authentication module
├── audit.js                   ✅ Audit logging system
├── admin-websocket.js         ✅ Real-time WebSocket server
└── node.js                    ⏳ Needs integration (see above)
```

---

## 🎨 Dashboard Frontend (Next Step)

I'll create a simple, functional HTML dashboard that uses all these APIs and WebSocket.

Would you like me to:
1. **Create the complete integration patch** for node.js
2. **Build the dashboard frontend** (HTML/CSS/JS)
3. **Test everything together**

The dashboard will include:
- Login page with JWT
- Real-time KPI cards
- Recent blocks/transactions tables
- Peer management
- Live WebSocket updates
- Audit log viewer

**Which should I prioritize?**
