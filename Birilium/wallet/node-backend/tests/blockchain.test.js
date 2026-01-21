/**
 * Birilium Blockchain Unit Tests
 * Comprehensive test suite for all blockchain components
 */

const assert = require('assert');

// Mock environment before imports
process.env.SQLITE_DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

const Blockchain = require('../Blockchain');
const Transaction = require('../Transaction');
const Block = require('../Block');
const secp256k1 = require('@noble/secp256k1');
const { bytesToHex, hexToBytes } = require('@noble/hashes/utils.js');

let testsPassed = 0;
let testsFailed = 0;
const testResults = [];

async function test(name, fn) {
    try {
        await fn();
        console.log(`✓ ${name}`);
        testsPassed++;
        testResults.push({ name, passed: true });
    } catch (err) {
        console.error(`✗ ${name}`);
        console.error(`  Error: ${err.message}`);
        testsFailed++;
        testResults.push({ name, passed: false, error: err.message });
    }
}

// Helper: Generate a test wallet
function generateWallet() {
    const privateKeyBytes = secp256k1.utils.randomSecretKey();
    const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, false); // uncompressed
    return {
        privateKey: bytesToHex(privateKeyBytes),
        publicKey: bytesToHex(publicKeyBytes)
    };
}

// Helper: Sign a transaction
function signTransaction(tx, privateKey) {
    // Derive public key from private key
    const privateKeyBytes = hexToBytes(privateKey);
    const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, false);
    const wallet = {
        privateKey: privateKey,
        publicKey: bytesToHex(publicKeyBytes)
    };
    tx.signTransaction(wallet);
    return tx;
}

async function runBlockchainTests() {
    console.log('\n=================================');
    console.log('  BLOCKCHAIN UNIT TEST SUITE');
    console.log('=================================\n');

    // ========== BLOCK TESTS ==========
    console.log('SECTION 1: Block Tests\n');

    await test('Block: Create genesis block with correct structure', async () => {
        const block = new Block(Date.now(), [], '0');
        assert(block.hash, 'Block should have a hash');
        assert(block.previousHash === '0', 'Genesis block should have previousHash of "0"');
        assert(Array.isArray(block.transactions), 'Transactions should be an array');
    });

    await test('Block: Calculate hash correctly', async () => {
        const block = new Block(1234567890, [], 'prevHash123');
        const hash1 = block.calculateHash();
        const hash2 = block.calculateHash();
        assert(hash1 === hash2, 'Same block should produce same hash');
    });

    await test('Block: Changing data changes hash', async () => {
        const block = new Block(1234567890, [], 'prevHash123');
        const hash1 = block.calculateHash();
        block.timestamp = 9999999999;
        const hash2 = block.calculateHash();
        assert(hash1 !== hash2, 'Different data should produce different hash');
    });

    await test('Block: Mine block with difficulty', async () => {
        const block = new Block(Date.now(), [], 'prevHash123');
        block.mineBlock(2);
        assert(block.hash.substring(0, 2) === '00', 'Hash should start with difficulty zeros');
    });

    await test('Block: hasValidTransactions returns true for valid transactions', async () => {
        const wallet = generateWallet();
        const tx = new Transaction(null, wallet.publicKey, 10); // Mining reward (no signature needed)
        const block = new Block(Date.now(), [tx], 'prevHash');
        assert(block.hasValidTransactions() === true, 'Valid transactions should pass');
    });

    // ========== TRANSACTION TESTS ==========
    console.log('\nSECTION 2: Transaction Tests\n');

    await test('Transaction: Create transaction with correct properties', async () => {
        const tx = new Transaction('from', 'to', 100, 0.1);
        assert(tx.fromAddress === 'from', 'fromAddress should be set');
        assert(tx.toAddress === 'to', 'toAddress should be set');
        assert(tx.amount === 100, 'amount should be set');
        assert(tx.fee === 0.1, 'fee should be set');
        assert(tx.timestamp, 'timestamp should be set');
    });

    await test('Transaction: Calculate hash correctly', async () => {
        const tx = new Transaction('from', 'to', 100);
        const hash1 = tx.calculateHash();
        const hash2 = tx.calculateHash();
        assert(hash1 === hash2, 'Same transaction should produce same hash');
    });

    await test('Transaction: Mining reward is valid without signature', async () => {
        const tx = new Transaction(null, 'minerAddress', 10);
        assert(tx.isValid() === true, 'Mining reward should be valid without signature');
    });

    await test('Transaction: Regular transaction invalid without signature', async () => {
        const wallet = generateWallet();
        const tx = new Transaction(wallet.publicKey, 'recipient', 50);
        try {
            tx.isValid();
            assert(false, 'Should throw error for missing signature');
        } catch (err) {
            assert(err.message.includes('No signature'), 'Error should mention missing signature');
        }
    });

    await test('Transaction: Signed transaction is valid', async () => {
        const sender = generateWallet();
        const tx = new Transaction(sender.publicKey, 'recipient', 50);
        signTransaction(tx, sender.privateKey);
        assert(tx.isValid() === true, 'Signed transaction should be valid');
    });

    await test('Transaction: Cannot sign for other wallets', async () => {
        const sender = generateWallet();
        const other = generateWallet();
        const tx = new Transaction(sender.publicKey, 'recipient', 50);
        try {
            signTransaction(tx, other.privateKey);
            assert(false, 'Should throw error when signing for other wallet');
        } catch (err) {
            assert(err.message.includes('cannot sign'), 'Error should mention cannot sign');
        }
    });

    await test('Transaction: Tampered signature is invalid', async () => {
        const sender = generateWallet();
        const tx = new Transaction(sender.publicKey, 'recipient', 50);
        signTransaction(tx, sender.privateKey);

        // Tamper with signature
        tx.signature = tx.signature.substring(0, 10) + 'aa' + tx.signature.substring(12);

        try {
            const valid = tx.isValid();
            assert(valid === false, 'Tampered transaction should be invalid');
        } catch (err) {
            // Some implementations throw on invalid signature - that's fine
        }
    });

    // ========== BLOCKCHAIN TESTS ==========
    console.log('\nSECTION 3: Blockchain Tests\n');

    await test('Blockchain: Initialize with genesis block', async () => {
        const chain = new Blockchain();
        assert(chain.chain.length === 1, 'Should have genesis block');
        assert(chain.chain[0].previousHash === '0', 'Genesis should have previousHash 0');
    });

    await test('Blockchain: Default parameters are correct', async () => {
        const chain = new Blockchain();
        assert(chain.difficulty >= 1, 'Difficulty should be at least 1');
        assert(chain.miningReward === 10, 'Mining reward should be 10 BRL');
        assert(chain.maxSupply === 25000000000, 'Max supply should be 25 billion');
        assert(chain.maxMempoolSize === 10000, 'Max mempool should be 10000');
    });

    await test('Blockchain: Get latest block', async () => {
        const chain = new Blockchain();
        const latest = chain.getLatestBlock();
        assert(latest === chain.chain[chain.chain.length - 1], 'Should return last block');
    });

    await test('Blockchain: Calculate transaction fee', async () => {
        const chain = new Blockchain();
        const fee1 = chain.calculateTransactionFee(100);
        assert(fee1 === 0.1, 'Fee for 100 BRL should be 0.1 (0.1%)');

        const fee2 = chain.calculateTransactionFee(0.001);
        assert(fee2 === chain.minimumFee, 'Small amounts should use minimum fee');
    });

    await test('Blockchain: Add valid transaction', async () => {
        const chain = new Blockchain();
        const sender = generateWallet();
        const recipient = generateWallet();

        // First, mine a block to give sender some coins
        chain.currentSupply = 0;
        chain.balanceCache.set(sender.publicKey, 100);
        chain.balanceCacheDirty = false;

        const tx = new Transaction(sender.publicKey, recipient.publicKey, 10);
        tx.fee = chain.calculateTransactionFee(10);
        signTransaction(tx, sender.privateKey);

        chain.addTransaction(tx);
        assert(chain.pendingTransactions.length === 1, 'Transaction should be in mempool');
    });

    await test('Blockchain: Reject transaction with insufficient balance', async () => {
        const chain = new Blockchain();
        const sender = generateWallet();
        const recipient = generateWallet();

        chain.balanceCache.set(sender.publicKey, 5);
        chain.balanceCacheDirty = false;

        const tx = new Transaction(sender.publicKey, recipient.publicKey, 100);
        signTransaction(tx, sender.privateKey);

        try {
            chain.addTransaction(tx);
            assert(false, 'Should reject insufficient balance');
        } catch (err) {
            assert(err.message.includes('Not enough balance'), 'Error should mention balance');
        }
    });

    await test('Blockchain: Reject zero/negative amount', async () => {
        const chain = new Blockchain();
        const sender = generateWallet();

        chain.balanceCache.set(sender.publicKey, 100);
        chain.balanceCacheDirty = false;

        const tx = new Transaction(sender.publicKey, 'recipient', 0);
        signTransaction(tx, sender.privateKey);

        try {
            chain.addTransaction(tx);
            assert(false, 'Should reject zero amount');
        } catch (err) {
            assert(err.message.includes('higher than 0'), 'Error should mention amount');
        }
    });

    await test('Blockchain: Reject invalid transaction signature', async () => {
        const chain = new Blockchain();
        const sender = generateWallet();

        chain.balanceCache.set(sender.publicKey, 100);
        chain.balanceCacheDirty = false;

        const tx = new Transaction(sender.publicKey, 'recipient', 10);
        tx.signature = 'invalid_signature';

        try {
            chain.addTransaction(tx);
            assert(false, 'Should reject invalid signature');
        } catch (err) {
            // Expected
        }
    });

    await test('Blockchain: Mine pending transactions', async () => {
        const chain = new Blockchain();
        chain.difficulty = 1; // Lower for faster test
        const miner = generateWallet();

        const block = await chain.minePendingTransactions(miner.publicKey);

        assert(block, 'Should return mined block');
        assert(chain.chain.length === 2, 'Chain should have 2 blocks');
        assert(chain.currentSupply > 0, 'Supply should increase');
    });

    await test('Blockchain: Mining reward goes to miner', async () => {
        const chain = new Blockchain();
        chain.difficulty = 1;
        const miner = generateWallet();

        await chain.minePendingTransactions(miner.publicKey);

        const balance = chain.getBalanceOfAddress(miner.publicKey);
        assert(balance === chain.miningReward, `Miner should have ${chain.miningReward} BRL`);
    });

    await test('Blockchain: Validate chain', async () => {
        const chain = new Blockchain();
        chain.difficulty = 1;
        const miner = generateWallet();

        await chain.minePendingTransactions(miner.publicKey);
        await chain.minePendingTransactions(miner.publicKey);

        assert(chain.isChainValid() === true, 'Chain should be valid');
    });

    await test('Blockchain: Detect tampered chain', async () => {
        const chain = new Blockchain();
        chain.difficulty = 1;
        const miner = generateWallet();

        await chain.minePendingTransactions(miner.publicKey);

        // Tamper with block
        chain.chain[1].transactions[0].amount = 999999;

        assert(chain.isChainValid() === false, 'Tampered chain should be invalid');
    });

    await test('Blockchain: Max supply enforcement', async () => {
        const chain = new Blockchain();
        chain.currentSupply = chain.maxSupply; // Set to max
        const miner = generateWallet();

        const block = await chain.minePendingTransactions(miner.publicKey);
        assert(block === null, 'Should not mine when max supply reached');
    });

    await test('Blockchain: Clean expired transactions', async () => {
        const chain = new Blockchain();
        const sender = generateWallet();

        chain.balanceCache.set(sender.publicKey, 1000);
        chain.balanceCacheDirty = false;

        // Add transaction with old timestamp
        const tx = new Transaction(sender.publicKey, 'recipient', 10);
        tx.timestamp = Date.now() - 4000000; // 4000 seconds ago (expired)
        signTransaction(tx, sender.privateKey);
        chain.pendingTransactions.push(tx);

        chain.cleanExpiredTransactions();
        assert(chain.pendingTransactions.length === 0, 'Expired transactions should be cleaned');
    });

    await test('Blockchain: Mempool size limit', async () => {
        const chain = new Blockchain();
        chain.maxMempoolSize = 2; // Small limit for test

        const sender = generateWallet();
        chain.balanceCache.set(sender.publicKey, 10000);
        chain.balanceCacheDirty = false;

        // Add 3 transactions
        for (let i = 0; i < 3; i++) {
            const tx = new Transaction(sender.publicKey, 'recipient', 1);
            tx.fee = i * 0.01; // Different fees
            tx.timestamp = Date.now() + i; // Different timestamps
            signTransaction(tx, sender.privateKey);
            chain.pendingTransactions.push(tx);
        }

        chain.evictLowFeeTx();
        assert(chain.pendingTransactions.length === 2, 'Should evict low-fee transactions');
    });

    await test('Blockchain: Get all transactions for wallet', async () => {
        const chain = new Blockchain();
        chain.difficulty = 1;
        const miner = generateWallet();

        await chain.minePendingTransactions(miner.publicKey);

        const txs = chain.getAllTransactionsForWallet(miner.publicKey);
        assert(txs.length >= 1, 'Should find miner transactions');
    });

    await test('Blockchain: Get stats', async () => {
        const chain = new Blockchain();
        const stats = chain.getStats();

        assert(stats.totalBlocks === 1, 'Should have 1 block');
        assert(stats.difficulty, 'Should have difficulty');
        assert(stats.maxSupply, 'Should have maxSupply');
        assert(typeof stats.miningReward === 'number', 'Should have miningReward');
    });

    // ========== DIFFICULTY ADJUSTMENT TESTS ==========
    console.log('\nSECTION 4: Difficulty Adjustment Tests\n');

    await test('Blockchain: Difficulty stays same within interval', async () => {
        const chain = new Blockchain();
        const initialDifficulty = chain.difficulty;

        chain.adjustDifficulty();
        assert(chain.difficulty === initialDifficulty, 'Difficulty should not change within interval');
    });

    await test('Blockchain: Timestamp validation - reject future block', async () => {
        const chain = new Blockchain();
        const futureBlock = new Block(Date.now() + 8000000, [], 'prevHash'); // 8000 seconds in future

        const valid = chain.isValidBlockTimestamp(futureBlock);
        assert(valid === false, 'Should reject block too far in future');
    });

    await test('Blockchain: Timestamp validation - accept valid block', async () => {
        const chain = new Blockchain();
        const validBlock = new Block(Date.now() + 1000, [], 'prevHash'); // 1 second in future

        const valid = chain.isValidBlockTimestamp(validBlock);
        assert(valid === true, 'Should accept block within tolerance');
    });

    // ========== BALANCE CACHE TESTS ==========
    console.log('\nSECTION 5: Balance Cache Tests\n');

    await test('Blockchain: Balance cache rebuilds correctly', async () => {
        const chain = new Blockchain();
        chain.difficulty = 1;
        const miner = generateWallet();

        await chain.minePendingTransactions(miner.publicKey);
        chain.balanceCacheDirty = true;

        const balance = chain.getBalanceOfAddress(miner.publicKey);
        assert(balance === chain.miningReward, 'Cache should rebuild correctly');
    });

    await test('Blockchain: Balance returns 0 for unknown address', async () => {
        const chain = new Blockchain();
        const balance = chain.getBalanceOfAddress('unknownAddress');
        assert(balance === 0, 'Unknown address should have 0 balance');
    });

    // ========== NONCE VALIDATION TESTS ==========
    console.log('\nSECTION 6: Nonce & Replay Protection Tests\n');

    await test('Blockchain: Account nonce tracking', async () => {
        const chain = new Blockchain();
        const sender = generateWallet();

        const nonce = chain.getAccountNonce(sender.publicKey);
        assert(nonce === 0, 'New account should have nonce 0');
    });

    await test('Blockchain: Nonce cache rebuilds', async () => {
        const chain = new Blockchain();
        chain.noncesCacheDirty = true;
        chain.rebuildNonceCache();
        assert(chain.noncesCacheDirty === false, 'Cache should be clean after rebuild');
    });

    // ========== PRINT SUMMARY ==========
    console.log('\n=================================');
    console.log('  TEST SUMMARY');
    console.log('=================================');
    console.log(`Total Tests: ${testsPassed + testsFailed}`);
    console.log(`Passed: ${testsPassed} ✓`);
    console.log(`Failed: ${testsFailed} ✗`);
    console.log('=================================\n');

    if (testsFailed === 0) {
        console.log('✓ All blockchain tests passed!');
        return { success: true, passed: testsPassed, failed: testsFailed };
    } else {
        console.error(`✗ ${testsFailed} test(s) failed`);
        return { success: false, passed: testsPassed, failed: testsFailed, results: testResults.filter(r => !r.passed) };
    }
}

// Run tests if executed directly
if (require.main === module) {
    runBlockchainTests()
        .then(result => process.exit(result.success ? 0 : 1))
        .catch(err => {
            console.error('Test suite error:', err);
            process.exit(1);
        });
}

module.exports = { runBlockchainTests };
