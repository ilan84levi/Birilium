const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class DatabaseManager {
    constructor() {
        this.db = null;
        this.isConnected = false;

        // Database path - use environment variable or default to data folder
        const dbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, 'data', 'birilium.db');
        this.dbPath = dbPath;

        // Ensure data directory exists
        const dataDir = path.dirname(dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }

    async connect() {
        try {
            console.log('Connecting to SQLite database...');
            console.log('Database path:', this.dbPath);

            this.db = new Database(this.dbPath);
            this.isConnected = true;

            // Enable WAL mode for better performance
            this.db.pragma('journal_mode = WAL');

            // Create tables
            this.createTables();

            // Create indexes
            this.createIndexes();

            console.log(`✓ Connected to SQLite database: ${this.dbPath}`);
            return true;
        } catch (error) {
            console.error('SQLite connection failed:', error.message);
            console.log('Continuing without database persistence (memory-only mode)');
            this.isConnected = false;
            return false;
        }
    }

    createTables() {
        if (!this.isConnected) return;

        try {
            // Blocks table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS blocks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    block_index INTEGER UNIQUE NOT NULL,
                    timestamp INTEGER NOT NULL,
                    transactions TEXT NOT NULL,
                    previousHash TEXT NOT NULL,
                    hash TEXT NOT NULL,
                    nonce INTEGER NOT NULL,
                    createdAt INTEGER NOT NULL
                )
            `);

            // Transactions table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    txId TEXT,
                    fromAddress TEXT,
                    toAddress TEXT,
                    amount REAL,
                    timestamp INTEGER,
                    signature TEXT,
                    blockHash TEXT,
                    blockIndex INTEGER,
                    blockTimestamp INTEGER
                )
            `);

            // State table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS state (
                    type TEXT PRIMARY KEY,
                    currentSupply REAL,
                    difficulty INTEGER,
                    lastUpdated INTEGER
                )
            `);

            // PayPal subscriptions table (for admin features)
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS subscriptions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    subscriptionId TEXT UNIQUE NOT NULL,
                    walletAddress TEXT,
                    subscriberEmail TEXT,
                    planId TEXT NOT NULL,
                    amount REAL,
                    currency TEXT DEFAULT 'USD',
                    status TEXT NOT NULL,
                    startTime INTEGER NOT NULL,
                    nextBillingTime INTEGER,
                    cancelledAt INTEGER,
                    createdAt INTEGER NOT NULL
                )
            `);

            // Analytics table for tracking events
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS analytics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event TEXT NOT NULL,
                    walletAddress TEXT,
                    timestamp INTEGER NOT NULL,
                    metadata TEXT,
                    createdAt INTEGER NOT NULL
                )
            `);

            // Contact messages table
            this.db.exec(`
                CREATE TABLE IF NOT EXISTS contact_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    phone TEXT,
                    email TEXT NOT NULL,
                    message TEXT NOT NULL,
                    read INTEGER DEFAULT 0,
                    createdAt INTEGER NOT NULL
                )
            `);

            console.log('✓ Database tables created');
        } catch (error) {
            console.error('Error creating tables:', error.message);
        }
    }

    createIndexes() {
        if (!this.isConnected) return;

        try {
            // Index on block index for fast lookups
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_blocks_index ON blocks(block_index)');
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks(hash)');

            // Index on transaction addresses
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_tx_from ON transactions(fromAddress)');
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_tx_to ON transactions(toAddress)');
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON transactions(blockTimestamp DESC)');

            // Index on subscriptions
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_sub_email ON subscriptions(subscriberEmail)');
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_sub_status ON subscriptions(status)');
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_sub_wallet ON subscriptions(walletAddress)');

            // Index on analytics
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics(event)');
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_analytics_wallet ON analytics(walletAddress)');
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics(timestamp DESC)');

            // Index on contact messages
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_contact_created ON contact_messages(createdAt DESC)');
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_contact_read ON contact_messages(read)');

            console.log('✓ Database indexes created');
        } catch (error) {
            console.error('Error creating indexes:', error.message);
        }
    }

    async saveBlock(block, blockIndex) {
        if (!this.isConnected) return false;

        try {
            // Serialize transactions to JSON
            const transactionsJSON = JSON.stringify(block.transactions);

            // Prepare statements
            const blockStmt = this.db.prepare(`
                INSERT OR REPLACE INTO blocks (block_index, timestamp, transactions, previousHash, hash, nonce, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            const txStmt = this.db.prepare(`
                INSERT OR IGNORE INTO transactions
                (txId, fromAddress, toAddress, amount, timestamp, signature, blockHash, blockIndex, blockTimestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            // Use a database transaction for atomicity - either all or nothing
            const saveBlockTransaction = this.db.transaction(() => {
                // Save block
                blockStmt.run(
                    blockIndex,
                    block.timestamp,
                    transactionsJSON,
                    block.previousHash,
                    block.hash,
                    block.nonce,
                    Date.now()
                );

                // Save transactions separately for easier querying
                if (block.transactions && block.transactions.length > 0) {
                    for (const tx of block.transactions) {
                        txStmt.run(
                            tx.txId || null,
                            tx.fromAddress || null,
                            tx.toAddress,
                            tx.amount,
                            tx.timestamp,
                            tx.signature || null,
                            block.hash,
                            blockIndex,
                            block.timestamp
                        );
                    }
                }
            });

            // Execute the transaction
            saveBlockTransaction();

            return true;
        } catch (error) {
            console.error('Error saving block:', error.message);
            return false;
        }
    }

    async loadBlockchain() {
        if (!this.isConnected) return null;

        try {
            const stmt = this.db.prepare('SELECT * FROM blocks ORDER BY block_index ASC');
            const rows = stmt.all();

            if (rows.length === 0) {
                console.log('No blockchain data found in database');
                return null;
            }

            // Parse transactions JSON
            const blocks = rows.map(row => ({
                index: row.block_index,
                timestamp: row.timestamp,
                transactions: JSON.parse(row.transactions),
                previousHash: row.previousHash,
                hash: row.hash,
                nonce: row.nonce
            }));

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
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO state (type, currentSupply, difficulty, lastUpdated)
                VALUES ('blockchain', ?, ?, ?)
            `);

            stmt.run(state.currentSupply, state.difficulty, Date.now());
            return true;
        } catch (error) {
            console.error('Error saving blockchain state:', error.message);
            return false;
        }
    }

    async loadBlockchainState() {
        if (!this.isConnected) return null;

        try {
            const stmt = this.db.prepare("SELECT * FROM state WHERE type = 'blockchain'");
            const state = stmt.get();
            return state;
        } catch (error) {
            console.error('Error loading blockchain state:', error.message);
            return null;
        }
    }

    async getTransactionsByAddress(address, limit = 100) {
        if (!this.isConnected) return [];

        try {
            const stmt = this.db.prepare(`
                SELECT * FROM transactions
                WHERE fromAddress = ? OR toAddress = ?
                ORDER BY blockTimestamp DESC
                LIMIT ?
            `);

            const transactions = stmt.all(address, address, limit);
            return transactions;
        } catch (error) {
            console.error('Error getting transactions:', error.message);
            return [];
        }
    }

    async getStats() {
        if (!this.isConnected) return null;

        try {
            const blockCount = this.db.prepare('SELECT COUNT(*) as count FROM blocks').get().count;
            const txCount = this.db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;
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
            this.db.exec('DELETE FROM blocks');
            this.db.exec('DELETE FROM transactions');
            this.db.exec('DELETE FROM state');
            this.db.exec('DELETE FROM subscriptions');
            console.log('✓ Database cleared');
            return true;
        } catch (error) {
            console.error('Error clearing database:', error.message);
            return false;
        }
    }

    // PayPal subscription methods
    async saveSubscription(subscription) {
        if (!this.isConnected) return false;

        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO subscriptions
                (subscriptionId, subscriberEmail, planId, status, startTime, nextBillingTime, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run(
                subscription.id,
                subscription.subscriber?.email_address || '',
                subscription.plan_id,
                subscription.status,
                new Date(subscription.start_time).getTime(),
                subscription.billing_info?.next_billing_time ? new Date(subscription.billing_info.next_billing_time).getTime() : null,
                Date.now()
            );

            return true;
        } catch (error) {
            console.error('Error saving subscription:', error.message);
            return false;
        }
    }

    async getSubscriptions(status = null) {
        if (!this.isConnected) return [];

        try {
            let stmt;
            if (status) {
                stmt = this.db.prepare('SELECT * FROM subscriptions WHERE status = ? ORDER BY createdAt DESC');
                return stmt.all(status);
            } else {
                stmt = this.db.prepare('SELECT * FROM subscriptions ORDER BY createdAt DESC');
                return stmt.all();
            }
        } catch (error) {
            console.error('Error getting subscriptions:', error.message);
            return [];
        }
    }

    async saveContactMessage(contact) {
        if (!this.isConnected) return null;

        try {
            const stmt = this.db.prepare(`
                INSERT INTO contact_messages (name, phone, email, message, read, createdAt)
                VALUES (?, ?, ?, ?, 0, ?)
            `);

            const result = stmt.run(
                contact.name,
                contact.phone || null,
                contact.email,
                contact.message,
                Date.now()
            );

            return result.lastInsertRowid;
        } catch (error) {
            console.error('Error saving contact message:', error.message);
            return null;
        }
    }

    async getContactMessages(limit = 50, offset = 0) {
        if (!this.isConnected) return [];

        try {
            const stmt = this.db.prepare(`
                SELECT * FROM contact_messages
                ORDER BY createdAt DESC
                LIMIT ? OFFSET ?
            `);

            return stmt.all(limit, offset);
        } catch (error) {
            console.error('Error fetching contact messages:', error.message);
            return [];
        }
    }

    async getUnreadContactCount() {
        if (!this.isConnected) return 0;

        try {
            const stmt = this.db.prepare('SELECT COUNT(*) as count FROM contact_messages WHERE read = 0');
            return stmt.get().count;
        } catch (error) {
            return 0;
        }
    }

    async markContactRead(id) {
        if (!this.isConnected) return false;

        try {
            const stmt = this.db.prepare('UPDATE contact_messages SET read = 1 WHERE id = ?');
            stmt.run(id);
            return true;
        } catch (error) {
            return false;
        }
    }

    async close() {
        if (this.db) {
            this.db.close();
            this.isConnected = false;
            console.log('SQLite database connection closed');
        }
    }
}

module.exports = DatabaseManager;
