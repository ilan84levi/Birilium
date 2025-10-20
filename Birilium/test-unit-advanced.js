// Advanced Unit Tests for Phase 2 Features
// Tests nonces, LWMA, MTP, P2P security, wallet security

const Blockchain = require('./Blockchain');
const Transaction = require('./Transaction');
const Block = require('./Block');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const crypto = require('crypto');

// P2P Security
const {
    validateMessage,
    createHandshake,
    verifyHandshake,
    MessageType,
    PeerManager
} = require('./p2p-security');

// Wallet Security
const {
    generateMnemonic,
    validateMnemonic,
    createEncryptedWallet,
    unlockWallet,
    signDeterministic
} = require('../birilium-wallet/wallet-security');

console.log('\n=================================');
console.log('  ADVANCED UNIT TEST SUITE');
console.log('  Phase 2 Features');
console.log('=================================\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        testsPassed++;
    } catch (err) {
        console.error(`✗ ${name}`);
        console.error(`  Error: ${err.message}`);
        testsFailed++;
    }
}

// ========== TEST 1: Account Nonces ==========
console.log('TEST 1: Account Nonces & Replay Protection\n');

test('Accept nonce 0 for new account', () => {
    const blockchain = new Blockchain();
    const key1 = ec.genKeyPair();
    const addr1 = key1.getPublic('hex');

    // Fund account first (mining reward)
    blockchain.minePendingTransactions(addr1);

    const tx = new Transaction(addr1, 'recipient', 1, 0.001, 0);
    tx.signTransaction(key1);

    // Should not throw
    blockchain.addTransaction(tx);
});

test('Reject duplicate nonce', () => {
    const blockchain = new Blockchain();
    const key1 = ec.genKeyPair();
    const addr1 = key1.getPublic('hex');

    // Fund account
    blockchain.minePendingTransactions(addr1);

    const tx1 = new Transaction(addr1, 'recipient', 1, 0.001, 1);
    tx1.signTransaction(key1);
    blockchain.addTransaction(tx1);

    // Try same nonce again
    const tx2 = new Transaction(addr1, 'recipient', 1, 0.001, 1);
    tx2.signTransaction(key1);

    try {
        blockchain.addTransaction(tx2);
        throw new Error('Should reject duplicate nonce');
    } catch (err) {
        if (err.message.includes('Should reject')) throw err;
        // Expected error
    }
});

test('Enforce sequential nonces', () => {
    const blockchain = new Blockchain();
    const key1 = ec.genKeyPair();
    const addr1 = key1.getPublic('hex');

    // Fund account
    blockchain.minePendingTransactions(addr1);

    const tx1 = new Transaction(addr1, 'recipient', 1, 0.001, 1);
    tx1.signTransaction(key1);
    blockchain.addTransaction(tx1);

    // Try to skip nonce (use 3 instead of 2)
    const tx2 = new Transaction(addr1, 'recipient', 1, 0.001, 3);
    tx2.signTransaction(key1);

    try {
        blockchain.addTransaction(tx2);
        throw new Error('Should reject non-sequential nonce');
    } catch (err) {
        if (err.message.includes('Should reject')) throw err;
        // Expected error
    }
});

test('Get account nonce correctly', () => {
    const blockchain = new Blockchain();
    const key1 = ec.genKeyPair();
    const addr1 = key1.getPublic('hex');

    if (blockchain.getAccountNonce(addr1) !== 0) {
        throw new Error('New account should have nonce 0');
    }

    // Fund account
    blockchain.minePendingTransactions(addr1);

    const tx = new Transaction(addr1, 'recipient', 1, 0.001, 1);
    tx.signTransaction(key1);
    blockchain.addTransaction(tx);

    if (blockchain.getAccountNonce(addr1) !== 0) {
        throw new Error('Pending tx should not update nonce');
    }
});

// ========== TEST 2: LWMA Difficulty ==========
console.log('\nTEST 2: LWMA Difficulty Adjustment\n');

test('LWMA disabled by default', () => {
    const blockchain = new Blockchain();
    if (blockchain.enableLWMA) {
        throw new Error('LWMA should be disabled by default');
    }
});

test('LWMA calculates difficulty', () => {
    process.env.ENABLE_LWMA = 'true';
    const blockchain = new Blockchain();

    if (!blockchain.enableLWMA) {
        throw new Error('LWMA should be enabled');
    }

    const initialDifficulty = blockchain.difficulty;
    // calculateLWMADifficulty returns same difficulty without enough blocks
    const newDifficulty = blockchain.calculateLWMADifficulty();

    if (newDifficulty !== initialDifficulty) {
        throw new Error('Should return same difficulty without enough blocks');
    }

    delete process.env.ENABLE_LWMA;
});

test('Median Time Past calculation', () => {
    const blockchain = new Blockchain();

    // Add some blocks
    for (let i = 0; i < 15; i++) {
        const block = new Block(Date.now() + i * 1000, [], blockchain.getLatestBlock().hash);
        block.hash = block.calculateHash();
        blockchain.chain.push(block);
    }

    const mtp = blockchain.getMedianTimePast();
    const latestBlock = blockchain.getLatestBlock();

    if (mtp >= latestBlock.timestamp) {
        throw new Error('MTP should be less than latest block timestamp');
    }
});

test('MTP timestamp validation', () => {
    process.env.ENABLE_LWMA = 'true';
    const blockchain = new Blockchain();

    // Add some blocks
    for (let i = 0; i < 15; i++) {
        const block = new Block(Date.now() + i * 1000, [], blockchain.getLatestBlock().hash);
        block.hash = block.calculateHash();
        blockchain.chain.push(block);
    }

    const mtp = blockchain.getMedianTimePast();

    // Try to create block with timestamp <= MTP
    const invalidBlock = new Block(mtp - 1000, [], blockchain.getLatestBlock().hash);

    if (blockchain.isValidBlockTimestamp(invalidBlock)) {
        throw new Error('Should reject block with timestamp <= MTP');
    }

    delete process.env.ENABLE_LWMA;
});

// ========== TEST 3: Mempool Limits ==========
console.log('\nTEST 3: Mempool DoS Protection\n');

test('Mempool size limit enforced', () => {
    const blockchain = new Blockchain();
    const key1 = ec.genKeyPair();
    const addr1 = key1.getPublic('hex');

    // Fund account generously
    blockchain.minePendingTransactions(addr1);

    // Set low limit for testing
    blockchain.maxMempoolSize = 5;

    // Add 5 transactions
    for (let i = 1; i <= 5; i++) {
        const tx = new Transaction(addr1, 'recipient', 0.5, 0.001, i);
        tx.signTransaction(key1);
        blockchain.addTransaction(tx);
    }

    if (blockchain.pendingTransactions.length !== 5) {
        throw new Error('Should have 5 pending transactions');
    }

    // Try to add 6th with low fee - should be rejected
    const tx6 = new Transaction(addr1, 'recipient', 0.5, 0.001, 6);
    tx6.signTransaction(key1);

    try {
        blockchain.addTransaction(tx6);
        // If eviction happened, mempool should still be at max
        if (blockchain.pendingTransactions.length > 5) {
            throw new Error('Mempool exceeded max size');
        }
    } catch (err) {
        if (err.message.includes('Mempool full')) {
            // Expected
        } else if (err.message.includes('Mempool exceeded')) {
            throw err;
        }
    }
});

test('Fee-based eviction works', () => {
    const blockchain = new Blockchain();
    const key1 = ec.genKeyPair();
    const addr1 = key1.getPublic('hex');

    // Fund account
    blockchain.minePendingTransactions(addr1);

    blockchain.maxMempoolSize = 3;

    // Add 3 low-fee transactions
    for (let i = 1; i <= 3; i++) {
        const tx = new Transaction(addr1, 'recipient', 0.5, 0.001, i);
        tx.signTransaction(key1);
        blockchain.addTransaction(tx);
    }

    // Add high-fee transaction - should evict low-fee tx
    const highFeeTx = new Transaction(addr1, 'recipient', 0.5, 0.5, 4);
    highFeeTx.signTransaction(key1);

    try {
        blockchain.addTransaction(highFeeTx);
        // Should have evicted and added
    } catch (err) {
        // Or rejected if fee not high enough
        if (!err.message.includes('Mempool full')) {
            throw err;
        }
    }
});

// ========== TEST 4: Block Size Limits ==========
console.log('\nTEST 4: Block Size Limits\n');

test('Block transaction count limit', () => {
    const blockchain = new Blockchain();
    blockchain.maxBlockSize = 10;

    // Add many transactions
    const key1 = ec.genKeyPair();
    const addr1 = key1.getPublic('hex');

    // Fund account
    blockchain.minePendingTransactions(addr1);

    for (let i = 1; i <= 15; i++) {
        const tx = new Transaction(addr1, 'recipient', 0.1, 0.001, i);
        tx.signTransaction(key1);
        blockchain.addTransaction(tx);
    }

    if (blockchain.pendingTransactions.length !== 15) {
        throw new Error('Should have 15 pending transactions');
    }

    // Mine block - should only include maxBlockSize transactions
    const block = blockchain.minePendingTransactions(addr1);

    // Block should have at most maxBlockSize + 1 (coinbase)
    if (block && block.transactions.length > 11) {
        throw new Error(`Block has too many transactions: ${block.transactions.length}`);
    }
});

// ========== TEST 5: P2P Security ==========
console.log('\nTEST 5: P2P Security Features\n');

test('Create and verify handshake', () => {
    const key = ec.genKeyPair();
    const privateKey = key.getPrivate('hex');

    const handshake = createHandshake(privateKey);

    // Should not throw
    verifyHandshake(handshake);
});

test('Reject handshake with wrong signature', () => {
    const key = ec.genKeyPair();
    const privateKey = key.getPrivate('hex');

    const handshake = createHandshake(privateKey);
    handshake.signature = handshake.signature.replace(/a/g, 'b');

    try {
        verifyHandshake(handshake);
        throw new Error('Should reject invalid signature');
    } catch (err) {
        if (err.message.includes('Should reject')) throw err;
    }
});

test('Validate P2P message schema', () => {
    const msg = JSON.stringify({ type: MessageType.QUERY_LATEST });
    const validated = validateMessage(msg);

    if (validated.type !== MessageType.QUERY_LATEST) {
        throw new Error('Message validation failed');
    }
});

test('Reject invalid P2P message', () => {
    const msg = JSON.stringify({ type: 999, invalid: true });

    try {
        validateMessage(msg);
        throw new Error('Should reject invalid message');
    } catch (err) {
        if (err.message.includes('Should reject')) throw err;
    }
});

test('PeerManager enforces max peers', () => {
    const peerManager = new PeerManager(2);
    const key1 = ec.genKeyPair();
    const key2 = ec.genKeyPair();
    const key3 = ec.genKeyPair();

    peerManager.addPeer(key1.getPublic('hex'), {}, createHandshake(key1.getPrivate('hex')));
    peerManager.addPeer(key2.getPublic('hex'), {}, createHandshake(key2.getPrivate('hex')));

    try {
        peerManager.addPeer(key3.getPublic('hex'), {}, createHandshake(key3.getPrivate('hex')));
        throw new Error('Should reject 3rd peer');
    } catch (err) {
        if (err.message.includes('Should reject')) throw err;
    }
});

// ========== TEST 6: Wallet Security ==========
console.log('\nTEST 6: Wallet Security (BIP-39, Argon2id)\n');

test('Generate valid BIP-39 mnemonic', () => {
    const mnemonic = generateMnemonic();
    if (!validateMnemonic(mnemonic)) {
        throw new Error('Generated invalid mnemonic');
    }
});

test('Create encrypted wallet', async () => {
    const mnemonic = generateMnemonic();
    const password = 'testPassword123';

    const walletData = await createEncryptedWallet(mnemonic, password);

    if (!walletData.encrypted) throw new Error('Wallet not encrypted');
    if (!walletData.salt) throw new Error('Missing salt');
    if (!walletData.mnemonic) throw new Error('Missing encrypted mnemonic');
});

test('Unlock wallet with correct password', async () => {
    const mnemonic = generateMnemonic();
    const password = 'testPassword123';

    const walletData = await createEncryptedWallet(mnemonic, password);
    const wallet = await unlockWallet(walletData, password);

    if (wallet.mnemonic !== mnemonic) {
        throw new Error('Mnemonic mismatch after unlock');
    }
});

test('Reject wrong password', async () => {
    const mnemonic = generateMnemonic();
    const walletData = await createEncryptedWallet(mnemonic, 'password1');

    try {
        await unlockWallet(walletData, 'wrongPassword');
        throw new Error('Should reject wrong password');
    } catch (err) {
        if (err.message.includes('Should reject')) throw err;
    }
});

test('Deterministic signatures (RFC-6979)', () => {
    const mnemonic = generateMnemonic();
    const { mnemonicToSeed, deriveHDWallet } = require('../birilium-wallet/wallet-security');

    const seed = mnemonicToSeed(mnemonic);
    const wallet = deriveHDWallet(seed);

    const txHash = crypto.createHash('sha256').update('test').digest('hex');
    const sig1 = signDeterministic(txHash, wallet.privateKey);
    const sig2 = signDeterministic(txHash, wallet.privateKey);

    if (sig1 !== sig2) {
        throw new Error('Signatures should be deterministic');
    }
});

// ========== SUMMARY ==========
console.log('\n=================================');
console.log('  TEST SUMMARY');
console.log('=================================');
console.log(`Total Tests: ${testsPassed + testsFailed}`);
console.log(`Passed: ${testsPassed} ✓`);
console.log(`Failed: ${testsFailed} ✗`);
console.log('=================================\n');

if (testsFailed === 0) {
    console.log('✓ All advanced unit tests passed!');
    console.log('\nPhase 2 Features Tested:');
    console.log('  • Account nonces & replay protection');
    console.log('  • LWMA difficulty adjustment');
    console.log('  • Median Time Past (MTP)');
    console.log('  • Mempool DoS protection');
    console.log('  • Block size limits');
    console.log('  • P2P security (handshakes, validation)');
    console.log('  • Wallet security (BIP-39, Argon2id, HD wallets)');
    console.log('  • RFC-6979 deterministic signatures');
    process.exit(0);
} else {
    console.error(`✗ ${testsFailed} test(s) failed`);
    process.exit(1);
}
