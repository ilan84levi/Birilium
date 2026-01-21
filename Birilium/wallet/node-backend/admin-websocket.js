/**
 * Admin WebSocket Server
 * Provides real-time updates to admin dashboard
 */

const WebSocket = require('ws');
const { verifyToken } = require('./auth');
const logger = require('./logger');

class AdminWebSocketServer {
    constructor() {
        this.wss = null;
        this.clients = new Set();
        this.blockchain = null;
    }

    /**
     * Initialize WebSocket server
     * @param {object} server - HTTP server instance
     * @param {object} blockchain - Blockchain instance
     */
    initialize(server, blockchain) {
        this.blockchain = blockchain;

        // Create WebSocket server on /admin-ws path
        this.wss = new WebSocket.Server({
            noServer: true,
            path: '/admin-ws'
        });

        // Handle upgrade requests
        server.on('upgrade', (request, socket, head) => {
            if (request.url === '/admin-ws') {
                this.handleUpgrade(request, socket, head);
            }
        });

        this.wss.on('connection', (ws, request) => {
            this.handleConnection(ws, request);
        });

        logger.info('✓ Admin WebSocket server initialized');
    }

    /**
     * Handle WebSocket upgrade with authentication
     */
    handleUpgrade(request, socket, head) {
        // Extract token from query string or header
        const url = new URL(request.url, 'http://localhost');
        const token = url.searchParams.get('token') ||
                      request.headers['sec-websocket-protocol'];

        // Verify JWT token
        const decoded = verifyToken(token);

        if (!decoded) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        // Attach user info to request
        request.user = {
            username: decoded.username,
            role: decoded.role
        };

        // Complete the WebSocket handshake
        this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.wss.emit('connection', ws, request);
        });
    }

    /**
     * Handle new WebSocket connection
     */
    handleConnection(ws, request) {
        const clientInfo = {
            username: request.user.username,
            role: request.user.role,
            connectedAt: Date.now()
        };

        ws.clientInfo = clientInfo;
        this.clients.add(ws);

        logger.info({
            username: clientInfo.username,
            role: clientInfo.role
        }, 'Admin WebSocket client connected');

        // Send welcome message
        this.sendToClient(ws, 'connection', {
            message: 'Connected to Birilium Admin WebSocket',
            user: clientInfo,
            timestamp: new Date().toISOString()
        });

        // Send initial state
        this.sendInitialState(ws);

        // Handle messages from client
        ws.on('message', (message) => {
            this.handleMessage(ws, message);
        });

        // Handle disconnect
        ws.on('close', () => {
            this.clients.delete(ws);
            logger.info({
                username: clientInfo.username
            }, 'Admin WebSocket client disconnected');
        });

        // Handle errors
        ws.on('error', (error) => {
            logger.error({
                error: error.message,
                username: clientInfo.username
            }, 'Admin WebSocket error');
        });
    }

    /**
     * Send initial state to newly connected client
     */
    sendInitialState(ws) {
        if (!this.blockchain) return;

        const state = {
            chain: {
                height: this.blockchain.chain.length - 1,
                difficulty: this.blockchain.difficulty,
                currentSupply: this.blockchain.currentSupply,
                latestBlock: this.blockchain.getLatestBlock()
            },
            mempool: {
                pendingTx: this.blockchain.pendingTransactions.length
            }
        };

        this.sendToClient(ws, 'initial-state', state);
    }

    /**
     * Handle message from client
     */
    handleMessage(ws, message) {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'ping':
                    this.sendToClient(ws, 'pong', { timestamp: Date.now() });
                    break;

                case 'subscribe':
                    // Client wants to subscribe to specific events
                    ws.subscriptions = data.events || [];
                    this.sendToClient(ws, 'subscribed', { events: ws.subscriptions });
                    break;

                default:
                    logger.warn({ type: data.type }, 'Unknown WebSocket message type');
            }
        } catch (error) {
            logger.error({ error: error.message }, 'Error parsing WebSocket message');
        }
    }

    /**
     * Send message to specific client
     */
    sendToClient(ws, event, data) {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({
                    event: event,
                    data: data,
                    timestamp: new Date().toISOString()
                }));
            } catch (error) {
                logger.error({ error: error.message }, 'Error sending to WebSocket client');
            }
        }
    }

    /**
     * Broadcast message to all connected clients
     */
    broadcast(event, data) {
        const message = JSON.stringify({
            event: event,
            data: data,
            timestamp: new Date().toISOString()
        });

        let sentCount = 0;
        this.clients.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(message);
                    sentCount++;
                } catch (error) {
                    logger.error({ error: error.message }, 'Error broadcasting to client');
                }
            }
        });

        if (sentCount > 0) {
            logger.debug({ event, clients: sentCount }, 'Broadcast to admin clients');
        }
    }

    /**
     * Event: New block added to chain
     */
    onNewBlock(block, height) {
        this.broadcast('chain.newBlock', {
            height: height,
            hash: block.hash,
            previousHash: block.previousHash,
            timestamp: block.timestamp,
            txCount: block.transactions.length,
            difficulty: this.blockchain?.difficulty
        });
    }

    /**
     * Event: Transaction added to mempool
     */
    onMempoolUpdate(pendingCount, addedTxIds = [], removedTxIds = []) {
        this.broadcast('mempool.update', {
            pendingCount: pendingCount,
            addedTxIds: addedTxIds,
            removedTxIds: removedTxIds
        });
    }

    /**
     * Event: Peer connected or disconnected
     */
    onPeerUpdate(connected, disconnected, total) {
        this.broadcast('peer.update', {
            connected: connected,
            disconnected: disconnected,
            total: total
        });
    }

    /**
     * Event: Critical alert
     */
    onAlert(level, code, message) {
        this.broadcast('alert', {
            level: level,
            code: code,
            message: message
        });
    }

    /**
     * Event: Node status change
     */
    onNodeStatus(status) {
        this.broadcast('node.status', status);
    }

    /**
     * Get number of connected clients
     */
    getClientCount() {
        return this.clients.size;
    }

    /**
     * Get connected client info
     */
    getClients() {
        const clients = [];
        this.clients.forEach((ws) => {
            if (ws.clientInfo) {
                clients.push({
                    username: ws.clientInfo.username,
                    role: ws.clientInfo.role,
                    connectedAt: ws.clientInfo.connectedAt,
                    subscriptions: ws.subscriptions || []
                });
            }
        });
        return clients;
    }

    /**
     * Close all connections and shut down
     */
    close() {
        if (this.wss) {
            this.clients.forEach((ws) => {
                ws.close();
            });
            this.wss.close();
            logger.info('Admin WebSocket server closed');
        }
    }
}

// Export singleton instance
module.exports = new AdminWebSocketServer();
