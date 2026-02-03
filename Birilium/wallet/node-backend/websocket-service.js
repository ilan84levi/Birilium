/**
 * WebSocket Service - Real-time updates for wallet clients
 * Provides push notifications for balance changes, new blocks, transactions
 */

const WebSocket = require('ws');
const logger = require('./logger');
const { invalidateOnChange } = require('./cache');

class WebSocketService {
    constructor() {
        this.wss = null;
        this.clients = new Map(); // Map<WebSocket, {address, subscriptions}>
        this.walletRegistry = new Map(); // Map<address, {ip, connectedAt, lastActivity, balance, txCount, miningRewards}>
        this.adminWebSocket = null; // Reference to admin WebSocket for notifications
        this.blockchain = null; // Reference to blockchain for balance lookups
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            messagesSent: 0,
            messagesReceived: 0
        };
    }

    /**
     * Set references to other services
     */
    setReferences(adminWebSocket, blockchain) {
        this.adminWebSocket = adminWebSocket;
        this.blockchain = blockchain;
    }

    /**
     * Initialize WebSocket server
     * @param {object} server - HTTP server instance
     * @param {string} path - WebSocket path
     */
    initialize(server, path = '/ws') {
        this.wss = new WebSocket.Server({
            server,
            path,
            maxPayload: 1024 * 1024, // 1 MB max message
            clientTracking: true
        });

        this.wss.on('connection', (ws, req) => {
            this._handleConnection(ws, req);
        });

        // Heartbeat interval
        setInterval(() => {
            this._heartbeat();
        }, 30000);

        logger.info({ path }, 'WebSocket service initialized');
    }

    /**
     * Handle new WebSocket connection
     * @param {WebSocket} ws - WebSocket connection
     * @param {object} req - HTTP request
     */
    _handleConnection(ws, req) {
        const clientId = this._generateClientId();
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        this.clients.set(ws, {
            id: clientId,
            ip: clientIp,
            subscriptions: new Set(),
            connectedAt: Date.now(),
            lastActivity: Date.now()
        });

        this.stats.totalConnections++;
        this.stats.activeConnections = this.clients.size;

        logger.info({ clientId, ip: clientIp }, 'WebSocket client connected');

        // Send welcome message
        this._send(ws, {
            type: 'connected',
            data: {
                clientId,
                serverTime: Date.now(),
                version: '1.0.0'
            }
        });

        // Handle messages
        ws.on('message', (data) => {
            this._handleMessage(ws, data);
        });

        // Handle close
        ws.on('close', () => {
            this._handleClose(ws);
        });

        // Handle errors
        ws.on('error', (error) => {
            logger.error({ clientId, error: error.message }, 'WebSocket error');
        });

        // Handle pong
        ws.on('pong', () => {
            const client = this.clients.get(ws);
            if (client) {
                client.lastActivity = Date.now();
            }
        });
    }

    /**
     * Handle incoming message
     * @param {WebSocket} ws - WebSocket connection
     * @param {Buffer} data - Message data
     */
    _handleMessage(ws, data) {
        const client = this.clients.get(ws);
        if (!client) return;

        this.stats.messagesReceived++;
        client.lastActivity = Date.now();

        try {
            const message = JSON.parse(data.toString());

            switch (message.type) {
                case 'subscribe':
                    this._handleSubscribe(ws, client, message.data);
                    break;

                case 'unsubscribe':
                    this._handleUnsubscribe(ws, client, message.data);
                    break;

                case 'ping':
                    this._send(ws, { type: 'pong', data: { timestamp: Date.now() } });
                    break;

                default:
                    logger.warn({ type: message.type }, 'Unknown WebSocket message type');
            }
        } catch (error) {
            logger.error({ error: error.message }, 'Failed to parse WebSocket message');
            this._send(ws, {
                type: 'error',
                data: { message: 'Invalid message format' }
            });
        }
    }

    /**
     * Handle subscription request
     * @param {WebSocket} ws - WebSocket connection
     * @param {object} client - Client data
     * @param {object} data - Subscription data
     */
    _handleSubscribe(ws, client, data) {
        const { channel, address } = data;

        const validChannels = ['blocks', 'transactions', 'balance', 'stats', 'mining'];

        if (!validChannels.includes(channel)) {
            this._send(ws, {
                type: 'error',
                data: { message: `Invalid channel: ${channel}` }
            });
            return;
        }

        // For balance channel, address is required
        if (channel === 'balance' && !address) {
            this._send(ws, {
                type: 'error',
                data: { message: 'Address required for balance subscription' }
            });
            return;
        }

        const subKey = address ? `${channel}:${address}` : channel;
        client.subscriptions.add(subKey);

        if (address) {
            client.address = address;
            // Register wallet in registry for admin tracking
            this._registerWallet(address, client.ip);
        }

        this._send(ws, {
            type: 'subscribed',
            data: { channel, address }
        });

        logger.debug({ clientId: client.id, channel, address }, 'Client subscribed');
    }

    /**
     * Register a wallet in the registry for admin tracking
     * @param {string} address - Wallet address
     * @param {string} ip - Client IP address
     */
    _registerWallet(address, ip) {
        const existingWallet = this.walletRegistry.get(address);
        const currentBalance = this.blockchain ? this.blockchain.getBalanceOfAddress(address) : 0;

        if (!existingWallet) {
            // New wallet connection
            const walletData = {
                address: address,
                ip: ip,
                connectedAt: Date.now(),
                lastActivity: Date.now(),
                balance: currentBalance,
                previousBalance: currentBalance,
                txCount: 0,
                miningRewards: 0
            };
            this.walletRegistry.set(address, walletData);

            // Notify admin of new wallet connection
            if (this.adminWebSocket) {
                this.adminWebSocket.onWalletConnected(walletData);
            }

            logger.info({ address: address.substring(0, 20) + '...', ip }, 'Wallet registered');
        } else {
            // Update existing wallet
            existingWallet.lastActivity = Date.now();
            existingWallet.balance = currentBalance;
        }
    }

    /**
     * Update wallet balance and notify admin
     * @param {string} address - Wallet address
     * @param {number} newBalance - New balance
     * @param {string} changeType - Type of change ('sent', 'received', 'mining')
     * @param {number} amount - Amount changed
     */
    updateWalletBalance(address, newBalance, changeType, amount) {
        const wallet = this.walletRegistry.get(address);
        if (wallet) {
            wallet.previousBalance = wallet.balance;
            wallet.balance = newBalance;
            wallet.lastActivity = Date.now();
            wallet.txCount++;

            if (changeType === 'mining') {
                wallet.miningRewards += amount;
            }

            // Notify admin of balance change
            if (this.adminWebSocket) {
                this.adminWebSocket.onWalletBalanceUpdate({
                    address: address,
                    balance: newBalance,
                    previousBalance: wallet.previousBalance,
                    changeType: changeType,
                    amount: amount,
                    txCount: wallet.txCount,
                    miningRewards: wallet.miningRewards
                });
            }
        }
    }

    /**
     * Handle unsubscription request
     * @param {WebSocket} ws - WebSocket connection
     * @param {object} client - Client data
     * @param {object} data - Unsubscription data
     */
    _handleUnsubscribe(ws, client, data) {
        const { channel, address } = data;
        const subKey = address ? `${channel}:${address}` : channel;

        client.subscriptions.delete(subKey);

        this._send(ws, {
            type: 'unsubscribed',
            data: { channel, address }
        });
    }

    /**
     * Handle connection close
     * @param {WebSocket} ws - WebSocket connection
     */
    _handleClose(ws) {
        const client = this.clients.get(ws);

        if (client) {
            logger.info({ clientId: client.id }, 'WebSocket client disconnected');

            // Check if this wallet should be unregistered
            if (client.address) {
                this._unregisterWallet(client.address, client.id);
            }
        }

        this.clients.delete(ws);
        this.stats.activeConnections = this.clients.size;
    }

    /**
     * Unregister a wallet when last connection closes
     * @param {string} address - Wallet address
     * @param {string} disconnectingClientId - ID of the disconnecting client
     */
    _unregisterWallet(address, disconnectingClientId) {
        // Check if any other clients are still connected with this address
        let otherClientsWithAddress = 0;
        for (const [ws, client] of this.clients.entries()) {
            if (client.address === address && client.id !== disconnectingClientId) {
                otherClientsWithAddress++;
            }
        }

        // Only unregister if no other clients with this address
        if (otherClientsWithAddress === 0) {
            const wallet = this.walletRegistry.get(address);
            if (wallet) {
                const duration = Date.now() - wallet.connectedAt;

                // Notify admin of wallet disconnection
                if (this.adminWebSocket) {
                    this.adminWebSocket.onWalletDisconnected({
                        address: address,
                        duration: duration,
                        finalBalance: wallet.balance,
                        txCount: wallet.txCount,
                        miningRewards: wallet.miningRewards
                    });
                }

                this.walletRegistry.delete(address);
                logger.info({ address: address.substring(0, 20) + '...' }, 'Wallet unregistered');
            }
        }
    }

    /**
     * Broadcast to all clients subscribed to a channel
     * @param {string} channel - Channel name
     * @param {object} data - Data to broadcast
     * @param {string} address - Optional address filter
     */
    broadcast(channel, data, address = null) {
        const subKey = address ? `${channel}:${address}` : channel;
        let sentCount = 0;

        for (const [ws, client] of this.clients.entries()) {
            if (ws.readyState !== WebSocket.OPEN) continue;

            // Check subscription
            const isSubscribed = client.subscriptions.has(subKey) ||
                client.subscriptions.has(channel);

            // For balance updates, also check if client's address matches
            if (channel === 'balance' && address) {
                const addressMatch = client.address === address ||
                    client.subscriptions.has(`balance:${address}`);
                if (!addressMatch) continue;
            } else if (!isSubscribed) {
                continue;
            }

            this._send(ws, {
                type: channel,
                data,
                timestamp: Date.now()
            });
            sentCount++;
        }

        if (sentCount > 0) {
            logger.debug({ channel, sentCount }, 'WebSocket broadcast');
        }
    }

    /**
     * Notify new block mined
     * @param {object} block - New block
     */
    notifyNewBlock(block) {
        this.broadcast('blocks', {
            hash: block.hash,
            index: block.index,
            transactions: block.transactions.length,
            timestamp: block.timestamp,
            difficulty: block.difficulty,
            nonce: block.nonce
        });

        // Invalidate caches
        invalidateOnChange('block_mined', block);

        // Track balance changes for registered wallets and notify
        for (const tx of block.transactions) {
            // Handle received amounts (including mining rewards)
            if (tx.toAddress) {
                const isMiningReward = tx.fromAddress === null;
                const newBalance = this.blockchain ? this.blockchain.getBalanceOfAddress(tx.toAddress) : 0;

                // Update wallet registry if this wallet is tracked
                if (this.walletRegistry.has(tx.toAddress)) {
                    this.updateWalletBalance(
                        tx.toAddress,
                        newBalance,
                        isMiningReward ? 'mining' : 'received',
                        tx.amount
                    );
                }

                this.broadcast('balance', {
                    address: tx.toAddress,
                    type: isMiningReward ? 'mining' : 'received',
                    amount: tx.amount,
                    newBalance: newBalance
                }, tx.toAddress);
            }

            // Handle sent amounts
            if (tx.fromAddress) {
                const newBalance = this.blockchain ? this.blockchain.getBalanceOfAddress(tx.fromAddress) : 0;

                // Update wallet registry if this wallet is tracked
                if (this.walletRegistry.has(tx.fromAddress)) {
                    this.updateWalletBalance(
                        tx.fromAddress,
                        newBalance,
                        'sent',
                        tx.amount + (tx.fee || 0)
                    );
                }

                this.broadcast('balance', {
                    address: tx.fromAddress,
                    type: 'sent',
                    amount: tx.amount + (tx.fee || 0),
                    newBalance: newBalance
                }, tx.fromAddress);
            }
        }
    }

    /**
     * Notify new transaction in mempool
     * @param {object} transaction - New transaction
     */
    notifyNewTransaction(transaction) {
        this.broadcast('transactions', {
            txId: transaction.calculateHash(),
            from: transaction.fromAddress,
            to: transaction.toAddress,
            amount: transaction.amount,
            fee: transaction.fee,
            status: 'pending'
        });

        // Invalidate caches
        invalidateOnChange('transaction_added', transaction);
    }

    /**
     * Notify blockchain stats update
     * @param {object} stats - Updated stats
     */
    notifyStatsUpdate(stats) {
        this.broadcast('stats', stats);
    }

    /**
     * Notify mining progress
     * @param {object} progress - Mining progress data
     */
    notifyMiningProgress(progress) {
        this.broadcast('mining', progress);
    }

    /**
     * Send message to specific client
     * @param {WebSocket} ws - WebSocket connection
     * @param {object} message - Message to send
     */
    _send(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(message));
                this.stats.messagesSent++;
            } catch (error) {
                logger.error({ error: error.message }, 'Failed to send WebSocket message');
            }
        }
    }

    /**
     * Heartbeat to keep connections alive and clean dead ones
     */
    _heartbeat() {
        const now = Date.now();
        const timeout = 60000; // 60 seconds

        for (const [ws, client] of this.clients.entries()) {
            if (now - client.lastActivity > timeout) {
                // Client timed out
                logger.debug({ clientId: client.id }, 'WebSocket client timed out');
                ws.terminate();
                this.clients.delete(ws);
            } else {
                // Send ping
                if (ws.readyState === WebSocket.OPEN) {
                    ws.ping();
                }
            }
        }

        this.stats.activeConnections = this.clients.size;
    }

    /**
     * Generate unique client ID
     * @returns {string} Client ID
     */
    _generateClientId() {
        return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get service statistics
     * @returns {object} Statistics
     */
    getStats() {
        return {
            ...this.stats,
            clients: Array.from(this.clients.values()).map(c => ({
                id: c.id,
                subscriptions: Array.from(c.subscriptions),
                connectedAt: new Date(c.connectedAt).toISOString(),
                address: c.address ? `${c.address.substring(0, 10)}...` : null
            }))
        };
    }

    /**
     * Get all registered wallets with their data
     * @returns {Array} Array of wallet data
     */
    getConnectedWallets() {
        const wallets = [];
        for (const [address, data] of this.walletRegistry.entries()) {
            // Get current balance from blockchain
            const currentBalance = this.blockchain ? this.blockchain.getBalanceOfAddress(address) : data.balance;
            wallets.push({
                address: address,
                addressShort: address.substring(0, 16) + '...',
                ip: data.ip,
                connectedAt: data.connectedAt,
                connectedDuration: Date.now() - data.connectedAt,
                lastActivity: data.lastActivity,
                balance: currentBalance,
                txCount: data.txCount,
                miningRewards: data.miningRewards
            });
        }
        return wallets;
    }

    /**
     * Get wallet count
     * @returns {number} Number of registered wallets
     */
    getWalletCount() {
        return this.walletRegistry.size;
    }
}

// Singleton instance
const wsService = new WebSocketService();

module.exports = wsService;
