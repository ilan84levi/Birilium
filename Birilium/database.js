const { MongoClient } = require('mongodb');

class Database {
    constructor() {
        this.client = null;
        this.db = null;
        this.isConnected = false;

        // Default connection string (can be overridden via environment variable)
        this.connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017';
        this.dbName = process.env.MONGODB_DB || 'birilium';
    }

    async connect() {
        try {
            console.log('Connecting to MongoDB...');
            this.client = new MongoClient(this.connectionString);
            await this.client.connect();
            this.db = this.client.db(this.dbName);
            this.isConnected = true;
            console.log(`✓ Connected to MongoDB: ${this.dbName}`);

            // Create indexes for better performance
            await this.createIndexes();

            return true;
        } catch (error) {
            console.error('MongoDB connection failed:', error.message);
            console.log('Continuing without database persistence (memory-only mode)');
            this.isConnected = false;
            return false;
        }
    }

    async createIndexes() {
        if (!this.isConnected) return;

        try {
            // Index on block index for fast lookups
            await this.db.collection('blocks').createIndex({ index: 1 }, { unique: true });

            // Index on block hash
            await this.db.collection('blocks').createIndex({ hash: 1 });

            // Index on transaction addresses
            await this.db.collection('transactions').createIndex({ fromAddress: 1 });
            await this.db.collection('transactions').createIndex({ toAddress: 1 });
            await this.db.collection('transactions').createIndex({ timestamp: -1 });

            console.log('✓ Database indexes created');
        } catch (error) {
            console.error('Error creating indexes:', error.message);
        }
    }

    async saveBlock(block, blockIndex) {
        if (!this.isConnected) return false;

        try {
            const blockData = {
                index: blockIndex,
                timestamp: block.timestamp,
                transactions: block.transactions,
                previousHash: block.previousHash,
                hash: block.hash,
                nonce: block.nonce,
                createdAt: new Date()
            };

            await this.db.collection('blocks').updateOne(
                { index: blockIndex },
                { $set: blockData },
                { upsert: true }
            );

            // Save transactions separately for easier querying
            if (block.transactions && block.transactions.length > 0) {
                const txDocs = block.transactions.map(tx => ({
                    ...tx,
                    blockHash: block.hash,
                    blockIndex: blockIndex,
                    blockTimestamp: block.timestamp
                }));

                await this.db.collection('transactions').insertMany(txDocs, { ordered: false }).catch(() => {
                    // Ignore duplicate key errors
                });
            }

            return true;
        } catch (error) {
            console.error('Error saving block:', error.message);
            return false;
        }
    }

    async loadBlockchain() {
        if (!this.isConnected) return null;

        try {
            const blocks = await this.db.collection('blocks')
                .find({})
                .sort({ index: 1 })
                .toArray();

            if (blocks.length === 0) {
                console.log('No blockchain data found in database');
                return null;
            }

            console.log(`✓ Loaded ${blocks.length} blocks from database`);
            return blocks;
        } catch (error) {
            console.error('Error loading blockchain:', error.message);
            return null;
        }
    }

    async saveBlockchainState(state) {
        if (!this.isConnected) return false;

        try {
            await this.db.collection('state').updateOne(
                { type: 'blockchain' },
                {
                    $set: {
                        currentSupply: state.currentSupply,
                        difficulty: state.difficulty,
                        lastUpdated: new Date()
                    }
                },
                { upsert: true }
            );

            return true;
        } catch (error) {
            console.error('Error saving blockchain state:', error.message);
            return false;
        }
    }

    async loadBlockchainState() {
        if (!this.isConnected) return null;

        try {
            const state = await this.db.collection('state').findOne({ type: 'blockchain' });
            return state;
        } catch (error) {
            console.error('Error loading blockchain state:', error.message);
            return null;
        }
    }

    async getTransactionsByAddress(address, limit = 100) {
        if (!this.isConnected) return [];

        try {
            const transactions = await this.db.collection('transactions')
                .find({
                    $or: [
                        { fromAddress: address },
                        { toAddress: address }
                    ]
                })
                .sort({ blockTimestamp: -1 })
                .limit(limit)
                .toArray();

            return transactions;
        } catch (error) {
            console.error('Error getting transactions:', error.message);
            return [];
        }
    }

    async getStats() {
        if (!this.isConnected) return null;

        try {
            const blockCount = await this.db.collection('blocks').countDocuments();
            const txCount = await this.db.collection('transactions').countDocuments();
            const state = await this.loadBlockchainState();

            return {
                blocks: blockCount,
                transactions: txCount,
                currentSupply: state?.currentSupply || 0,
                difficulty: state?.difficulty || 4,
                connected: true
            };
        } catch (error) {
            console.error('Error getting stats:', error.message);
            return null;
        }
    }

    async clearDatabase() {
        if (!this.isConnected) return false;

        try {
            await this.db.collection('blocks').deleteMany({});
            await this.db.collection('transactions').deleteMany({});
            await this.db.collection('state').deleteMany({});
            console.log('✓ Database cleared');
            return true;
        } catch (error) {
            console.error('Error clearing database:', error.message);
            return false;
        }
    }

    async close() {
        if (this.client) {
            await this.client.close();
            this.isConnected = false;
            console.log('MongoDB connection closed');
        }
    }
}

module.exports = Database;
