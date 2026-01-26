/**
 * Blockchain Reset Script
 * Run this to clear the blockchain and start fresh with a valid genesis block
 *
 * Usage: node reset-blockchain.js
 */

require('dotenv').config();
const Database = require('./database');
const Blockchain = require('./Blockchain');

async function resetBlockchain() {
    console.log('=== Blockchain Reset Script ===\n');

    // Initialize database
    const dbPath = process.env.SQLITE_DB_PATH || './birilium.db';
    console.log(`Database path: ${dbPath}`);

    const database = new Database(dbPath);
    await database.connect();

    if (!database.isConnected) {
        console.error('Failed to connect to database');
        process.exit(1);
    }

    console.log('Connected to database\n');

    // Show current state
    const currentBlocks = await database.loadBlockchain();
    console.log(`Current blockchain has ${currentBlocks ? currentBlocks.length : 0} blocks`);

    if (currentBlocks && currentBlocks.length > 0) {
        console.log(`  Genesis hash: ${currentBlocks[0].hash}`);
        if (currentBlocks.length > 1) {
            console.log(`  Block 1 previousHash: ${currentBlocks[1].previousHash}`);
        }
    }

    // Create new blockchain with deterministic genesis
    console.log('\nCreating new blockchain with deterministic genesis...');
    const blockchain = new Blockchain(database);

    console.log(`  New genesis hash: ${blockchain.chain[0].hash}`);
    console.log(`  Genesis timestamp: ${blockchain.chain[0].timestamp}`);

    // Clear existing data
    console.log('\nClearing existing blockchain data...');

    // SQLite doesn't have drop methods, so we need to delete all rows
    const db = database.db;

    await new Promise((resolve, reject) => {
        db.run('DELETE FROM blocks', [], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
    console.log('  Cleared blocks table');

    await new Promise((resolve, reject) => {
        db.run('DELETE FROM blockchain_state', [], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
    console.log('  Cleared blockchain_state table');

    // Save new genesis block
    console.log('\nSaving new genesis block...');
    await database.saveBlock(blockchain.chain[0]);
    await blockchain.saveToDatabase();

    // Verify
    console.log('\nVerifying reset...');
    const newBlocks = await database.loadBlockchain();
    console.log(`  Blockchain now has ${newBlocks.length} blocks`);
    console.log(`  Genesis hash: ${newBlocks[0].hash}`);

    console.log('\n=== Blockchain Reset Complete ===');
    console.log('The node will now start with a fresh blockchain.');
    console.log('All previous blocks and balances have been cleared.');

    await database.close();
    process.exit(0);
}

resetBlockchain().catch(err => {
    console.error('Reset failed:', err);
    process.exit(1);
});
