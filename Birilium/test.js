const Blockchain = require('./Blockchain');
const Transaction = require('./Transaction');
const secp256k1 = require('@noble/secp256k1');
const { sha256 } = require('@noble/hashes/sha2.js');
const { hmac } = require('@noble/hashes/hmac.js');
const { bytesToHex, hexToBytes, utf8ToBytes } = require('@noble/hashes/utils.js');

// Configure hash functions for secp256k1 v3
secp256k1.hashes.sha256 = sha256;
secp256k1.hashes.hmacSha256 = (key, ...msgs) => hmac(sha256, key, ...msgs);

// Helper: Generate wallet
function generateWallet() {
    const privateKeyBytes = secp256k1.utils.randomSecretKey();
    const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, false);
    return {
        privateKey: bytesToHex(privateKeyBytes),
        publicKey: bytesToHex(publicKeyBytes)
    };
}

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName) {
    if (condition) {
        console.log(`  ✓ ${testName}`);
        testsPassed++;
    } else {
        console.log(`  ✗ ${testName}`);
        testsFailed++;
    }
}

async function runTests() {

console.log('=================================');
console.log('  BIRILIUM BLOCKCHAIN TEST SUITE');
console.log('=================================\n');

// Test 1: Blockchain Creation
console.log('TEST 1: Blockchain Creation');
const birilium = new Blockchain();
assert(birilium.chain.length === 1, 'Genesis block created');
assert(birilium.difficulty === 4, 'Difficulty set correctly');
assert(birilium.miningReward === 10, 'Mining reward set correctly');
assert(birilium.maxSupply === 25000000000, 'Max supply set correctly');
assert(birilium.transactionFee === 0.001, 'Transaction fee set correctly');
console.log();

// Test 2: Wallet Creation
console.log('TEST 2: Wallet Creation');
const walletObj1 = generateWallet();
const wallet1 = walletObj1.publicKey;
const walletObj2 = generateWallet();
const wallet2 = walletObj2.publicKey;
assert(wallet1.length > 0, 'Wallet 1 created');
assert(wallet2.length > 0, 'Wallet 2 created');
assert(wallet1 !== wallet2, 'Wallets are unique');
console.log();

// Test 3: Mining
console.log('TEST 3: Mining');
await birilium.minePendingTransactions(wallet1);
const balance1 = birilium.getBalanceOfAddress(wallet1);
assert(balance1 === 10, `Wallet 1 received mining reward (${balance1} BRL)`);
assert(birilium.chain.length === 2, 'Block added to chain');
console.log();

// Test 4: Transaction Fees
console.log('TEST 4: Transaction Fees');
const fee = birilium.calculateTransactionFee(100);
assert(fee >= birilium.minimumFee, 'Fee meets minimum requirement');
assert(fee === 0.1, `Fee calculated correctly (${fee} BRL for 100 BRL)`);
console.log();

// Test 5: Transactions
console.log('TEST 5: Transactions');
const tx1 = new Transaction(wallet1, wallet2, 5);
assert(tx1.amount === 5, 'Transaction amount set correctly');
tx1.signTransaction(walletObj1);
assert(tx1.signature !== null, 'Transaction signed');
assert(tx1.isValid(), 'Transaction signature is valid');
birilium.addTransaction(tx1);
assert(birilium.pendingTransactions.length === 1, 'Transaction added to pending pool');
console.log();

// Test 6: Transaction with Fees
console.log('TEST 6: Mining Transaction with Fees');
await birilium.minePendingTransactions(wallet2);
const balance1After = birilium.getBalanceOfAddress(wallet1);
const balance2After = birilium.getBalanceOfAddress(wallet2);
assert(balance1After < 5, `Sender balance reduced by amount + fee (${balance1After} BRL)`);
assert(balance2After > 5, `Receiver got amount (${balance2After} BRL) + mining reward`);
console.log();

// Test 7: Insufficient Balance
console.log('TEST 7: Insufficient Balance Protection');
let errorThrown = false;
try {
    const tx2 = new Transaction(wallet1, wallet2, 1000);
    tx2.signTransaction(walletObj1);
    birilium.addTransaction(tx2);
} catch (error) {
    errorThrown = error.message.includes('Not enough balance');
}
assert(errorThrown, 'Rejects transaction with insufficient balance');
console.log();

// Test 8: Invalid Transaction
console.log('TEST 8: Invalid Transaction Protection');
let invalidTxBlocked = false;
try {
    const tx3 = new Transaction(wallet1, wallet2, 1);
    // Don't sign it
    birilium.addTransaction(tx3);
} catch (error) {
    invalidTxBlocked = error.message.includes('signature');
}
assert(invalidTxBlocked, 'Rejects unsigned transaction');
console.log();

// Test 9: Blockchain Validation
console.log('TEST 9: Blockchain Validation');

// Test tampering detection
const blockToTest = birilium.chain[2];
const originalHash = blockToTest.hash;

// Try to tamper with transaction amount (without recalculating hash)
blockToTest.transactions[0].amount = 999;
const isTamperedValid = birilium.isChainValid();
assert(!isTamperedValid, 'Detects tampered transaction');

// Restore
blockToTest.transactions[0].amount = 5;
blockToTest.hash = originalHash;

// Test hash tampering
blockToTest.hash = '0000fakehash';
const isHashTamperedValid = birilium.isChainValid();
assert(!isHashTamperedValid, 'Detects tampered hash');

// Restore
blockToTest.hash = originalHash;

console.log();

// Test 10: Dynamic Difficulty
console.log('TEST 10: Dynamic Difficulty Adjustment');
const initialDifficulty = birilium.difficulty;
// Mine several blocks
for (let i = 0; i < 10; i++) {
    await birilium.minePendingTransactions(wallet1);
}
assert(birilium.chain.length > 10, 'Multiple blocks mined');
// Difficulty may change based on timing
console.log(`  Initial difficulty: ${initialDifficulty}, Current: ${birilium.difficulty}`);
console.log();

// Test 11: Transaction History
console.log('TEST 11: Transaction History');
const wallet1Txs = birilium.getAllTransactionsForWallet(wallet1);
assert(wallet1Txs.length > 0, 'Wallet 1 has transaction history');
console.log(`  Wallet 1 has ${wallet1Txs.length} transactions`);
console.log();

// Test 12: Stats
console.log('TEST 12: Blockchain Stats');
const stats = birilium.getStats();
assert(stats.totalBlocks > 1, 'Stats show correct block count');
assert(stats.currentSupply > 0, 'Stats show current supply');
assert(stats.hasOwnProperty('transactionFee'), 'Stats include fee information');
console.log(`  Total Blocks: ${stats.totalBlocks}`);
console.log(`  Current Supply: ${stats.currentSupply} BRL`);
console.log(`  Difficulty: ${stats.difficulty}`);
console.log();

// Summary
console.log('=================================');
console.log('  TEST SUMMARY');
console.log('=================================');
console.log(`Total Tests: ${testsPassed + testsFailed}`);
console.log(`Passed: ${testsPassed} ✓`);
console.log(`Failed: ${testsFailed} ✗`);
console.log('=================================\n');

if (testsFailed === 0) {
    console.log('✓ All tests passed!');
    process.exit(0);
} else {
    console.log('✗ Some tests failed!');
    process.exit(1);
}

}

// Run tests
runTests().catch(error => {
    console.error('Test error:', error);
    process.exit(1);
});
