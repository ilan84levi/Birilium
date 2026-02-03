/**
 * Peer-to-Peer Node Synchronization
 * Enables multiple Birilium nodes to sync with each other
 */

const logger = require('./logger');

class PeerSync {
    constructor() {
        this.peers = [];           // List of peer node URLs
        this.blockchain = null;    // Reference to blockchain instance
        this.nodeId = null;        // This node's unique ID
        this.nodeUrl = null;       // This node's public URL
        this.syncInterval = null;
        this.issyncing = false;
    }

    /**
     * Initialize peer sync with configuration
     */
    initialize(blockchain, config = {}) {
        this.blockchain = blockchain;
        this.nodeId = config.nodeId || this.generateNodeId();
        this.nodeUrl = config.nodeUrl || null;
        this.peers = config.peers || [];

        logger.info({
            nodeId: this.nodeId,
            nodeUrl: this.nodeUrl,
            peerCount: this.peers.length
        }, 'Peer sync initialized');

        // Initial sync with peers
        if (this.peers.length > 0) {
            this.syncWithPeers();

            // Periodic sync every 30 seconds
            this.syncInterval = setInterval(() => {
                this.syncWithPeers();
            }, 30000);
        }

        return this;
    }

    /**
     * Generate a unique node ID
     */
    generateNodeId() {
        return 'node_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Add a peer node
     */
    addPeer(peerUrl) {
        if (!this.peers.includes(peerUrl) && peerUrl !== this.nodeUrl) {
            this.peers.push(peerUrl);
            logger.info({ peer: peerUrl }, 'Peer added');
            return true;
        }
        return false;
    }

    /**
     * Remove a peer node
     */
    removePeer(peerUrl) {
        const index = this.peers.indexOf(peerUrl);
        if (index > -1) {
            this.peers.splice(index, 1);
            logger.info({ peer: peerUrl }, 'Peer removed');
            return true;
        }
        return false;
    }

    /**
     * Get node info for peer discovery
     */
    getNodeInfo() {
        return {
            nodeId: this.nodeId,
            nodeUrl: this.nodeUrl,
            chainHeight: this.blockchain ? this.blockchain.chain.length : 0,
            peers: this.peers.length,
            version: '1.0.0'
        };
    }

    /**
     * Sync blockchain with all peers
     */
    async syncWithPeers() {
        if (this.issyncing || this.peers.length === 0) return;

        this.issyncing = true;
        logger.debug('Starting peer sync...');

        for (const peerUrl of this.peers) {
            try {
                await this.syncWithPeer(peerUrl);
            } catch (error) {
                logger.warn({ peer: peerUrl, error: error.message }, 'Failed to sync with peer');
            }
        }

        this.issyncing = false;
    }

    /**
     * Sync with a specific peer
     */
    async syncWithPeer(peerUrl) {
        try {
            // Get peer's chain height
            const response = await fetch(`${peerUrl}/api/node/info`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const peerInfo = await response.json();
            const ourHeight = this.blockchain.chain.length;
            const peerHeight = peerInfo.chainHeight;

            logger.debug({
                peer: peerUrl,
                ourHeight,
                peerHeight
            }, 'Comparing chain heights');

            // If peer has longer chain, get missing blocks
            if (peerHeight > ourHeight) {
                await this.downloadBlocks(peerUrl, ourHeight, peerHeight);
            }

            // Share our peers with the peer (peer discovery)
            if (this.nodeUrl) {
                await this.sharePeers(peerUrl);
            }

        } catch (error) {
            throw error;
        }
    }

    /**
     * Download blocks from peer
     */
    async downloadBlocks(peerUrl, fromHeight, toHeight) {
        logger.info({
            peer: peerUrl,
            from: fromHeight,
            to: toHeight
        }, 'Downloading blocks from peer');

        try {
            const response = await fetch(
                `${peerUrl}/api/node/blocks?from=${fromHeight}&to=${toHeight}`,
                {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    signal: AbortSignal.timeout(30000)
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const blocks = data.blocks;

            if (!blocks || blocks.length === 0) {
                return;
            }

            // Validate and add each block
            let added = 0;
            for (const block of blocks) {
                if (this.validateAndAddBlock(block)) {
                    added++;
                }
            }

            if (added > 0) {
                logger.info({ added, total: blocks.length }, 'Blocks added from peer');
            }

        } catch (error) {
            logger.error({ peer: peerUrl, error: error.message }, 'Failed to download blocks');
        }
    }

    /**
     * Validate and add a block from peer
     */
    validateAndAddBlock(block) {
        if (!this.blockchain) return false;

        try {
            const latestBlock = this.blockchain.getLatestBlock();

            // Check if block already exists
            if (block.index <= latestBlock.index) {
                return false;
            }

            // Check if block connects to our chain
            if (block.previousHash !== latestBlock.hash) {
                logger.warn({
                    blockIndex: block.index,
                    expected: latestBlock.hash,
                    got: block.previousHash
                }, 'Block does not connect to chain');
                return false;
            }

            // Validate block hash
            const calculatedHash = this.blockchain.calculateHash(
                block.index,
                block.previousHash,
                block.timestamp,
                block.transactions,
                block.nonce
            );

            if (calculatedHash !== block.hash) {
                logger.warn({ blockIndex: block.index }, 'Invalid block hash');
                return false;
            }

            // Validate proof of work
            const target = '0'.repeat(this.blockchain.difficulty);
            if (!block.hash.startsWith(target)) {
                logger.warn({ blockIndex: block.index }, 'Invalid proof of work');
                return false;
            }

            // Add block to chain
            this.blockchain.chain.push(block);

            // Update supply for mining rewards
            for (const tx of block.transactions) {
                if (tx.fromAddress === null) {
                    this.blockchain.currentSupply += tx.amount;
                }
            }

            // Save to database
            if (this.blockchain.db) {
                this.blockchain.db.prepare(`
                    INSERT OR REPLACE INTO blocks (block_index, hash, previous_hash, timestamp, nonce, data)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(
                    block.index,
                    block.hash,
                    block.previousHash,
                    block.timestamp,
                    block.nonce,
                    JSON.stringify(block.transactions)
                );
            }

            return true;

        } catch (error) {
            logger.error({ error: error.message }, 'Error validating block');
            return false;
        }
    }

    /**
     * Broadcast a new block to all peers
     */
    async broadcastBlock(block) {
        if (this.peers.length === 0) return;

        logger.info({
            blockIndex: block.index,
            peers: this.peers.length
        }, 'Broadcasting block to peers');

        const promises = this.peers.map(async (peerUrl) => {
            try {
                const response = await fetch(`${peerUrl}/api/node/block`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        block: block,
                        fromNode: this.nodeId
                    }),
                    signal: AbortSignal.timeout(10000)
                });

                if (response.ok) {
                    logger.debug({ peer: peerUrl }, 'Block broadcast successful');
                }
            } catch (error) {
                logger.warn({ peer: peerUrl, error: error.message }, 'Failed to broadcast block');
            }
        });

        await Promise.allSettled(promises);
    }

    /**
     * Receive a block from a peer
     */
    receiveBlock(block, fromNodeId) {
        if (fromNodeId === this.nodeId) {
            return { success: false, error: 'Received own block' };
        }

        const added = this.validateAndAddBlock(block);

        if (added) {
            // Broadcast to other peers (but not back to sender)
            this.broadcastBlockExcept(block, fromNodeId);
            return { success: true, message: 'Block accepted' };
        }

        return { success: false, error: 'Block rejected' };
    }

    /**
     * Broadcast block to all peers except one
     */
    async broadcastBlockExcept(block, excludeNodeId) {
        // For now, just use broadcastBlock
        // In a more sophisticated system, we'd track which node sent what
        // to avoid sending back to the originator
        await this.broadcastBlock(block);
    }

    /**
     * Share our peer list with another peer
     */
    async sharePeers(peerUrl) {
        if (!this.nodeUrl) return;

        try {
            await fetch(`${peerUrl}/api/node/peers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nodeUrl: this.nodeUrl,
                    peers: this.peers
                }),
                signal: AbortSignal.timeout(5000)
            });
        } catch (error) {
            // Ignore peer sharing errors
        }
    }

    /**
     * Get blocks in a range for peer sync
     */
    getBlocks(fromIndex, toIndex) {
        if (!this.blockchain) return [];

        const from = Math.max(0, fromIndex);
        const to = Math.min(toIndex, this.blockchain.chain.length);

        return this.blockchain.chain.slice(from, to);
    }

    /**
     * Stop peer sync
     */
    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        logger.info('Peer sync stopped');
    }
}

module.exports = new PeerSync();
