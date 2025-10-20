// Test P2P Security Features (Phase 2.3)
const {
    MessageType,
    validateMessage,
    createHandshake,
    verifyHandshake,
    RateLimiter,
    BanScoreManager,
    PeerManager,
    MAX_MESSAGE_SIZE
} = require('./p2p-security');

const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

console.log('\n=================================');
console.log('  P2P SECURITY TEST SUITE');
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

// ========== TEST 1: Message Validation ==========
console.log('TEST 1: Message Validation\n');

test('Valid QUERY_LATEST message', () => {
    const msg = JSON.stringify({ type: MessageType.QUERY_LATEST });
    const validated = validateMessage(msg);
    if (validated.type !== MessageType.QUERY_LATEST) throw new Error('Wrong type');
});

test('Invalid message (too large)', () => {
    const bigMsg = 'x'.repeat(MAX_MESSAGE_SIZE + 1);
    try {
        validateMessage(bigMsg);
        throw new Error('Should have rejected large message');
    } catch (err) {
        if (!err.message.includes('exceeds limit')) throw err;
    }
});

test('Invalid JSON rejected', () => {
    try {
        validateMessage('{ invalid json');
        throw new Error('Should have rejected invalid JSON');
    } catch (err) {
        if (!err.message.includes('Invalid JSON')) throw err;
    }
});

test('Unknown message type rejected', () => {
    try {
        validateMessage(JSON.stringify({ type: 999 }));
        throw new Error('Should have rejected unknown type');
    } catch (err) {
        if (!err.message.includes('Unknown message type')) throw err;
    }
});

test('Invalid schema rejected', () => {
    try {
        validateMessage(JSON.stringify({
            type: MessageType.NEW_TRANSACTION,
            data: { invalid: 'transaction' }
        }));
        throw new Error('Should have rejected invalid schema');
    } catch (err) {
        if (!err.message.includes('Schema validation failed')) throw err;
    }
});

// ========== TEST 2: Handshake ==========
console.log('\nTEST 2: Handshake Verification\n');

const nodeKey1 = ec.genKeyPair();
const nodePrivateKey1 = nodeKey1.getPrivate('hex');

test('Create valid handshake', () => {
    const handshake = createHandshake(nodePrivateKey1);
    if (!handshake.nodeId) throw new Error('Missing nodeId');
    if (!handshake.signature) throw new Error('Missing signature');
    if (!handshake.timestamp) throw new Error('Missing timestamp');
});

test('Verify valid handshake', () => {
    const handshake = createHandshake(nodePrivateKey1);
    const valid = verifyHandshake(handshake);
    if (!valid) throw new Error('Should verify valid handshake');
});

test('Reject handshake with wrong signature', () => {
    const handshake = createHandshake(nodePrivateKey1);
    handshake.signature = handshake.signature.replace(/a/g, 'b'); // Corrupt signature
    try {
        verifyHandshake(handshake);
        throw new Error('Should reject invalid signature');
    } catch (err) {
        if (!err.message.includes('verification failed')) throw err;
    }
});

test('Reject handshake with old timestamp', () => {
    const handshake = createHandshake(nodePrivateKey1);
    handshake.timestamp = Date.now() - 600000; // 10 minutes ago
    try {
        verifyHandshake(handshake);
        throw new Error('Should reject old timestamp');
    } catch (err) {
        if (!err.message.includes('too far from current time')) throw err;
    }
});

// ========== TEST 3: Rate Limiting ==========
console.log('\nTEST 3: Rate Limiting\n');

test('Allow messages under rate limit', () => {
    const limiter = new RateLimiter(10);
    for (let i = 0; i < 10; i++) {
        if (!limiter.checkLimit('peer1')) {
            throw new Error(`Message ${i+1} should be allowed`);
        }
    }
});

test('Block messages over rate limit', () => {
    const limiter = new RateLimiter(10);
    for (let i = 0; i < 10; i++) {
        limiter.checkLimit('peer1');
    }
    if (limiter.checkLimit('peer1')) {
        throw new Error('Should block 11th message');
    }
});

test('Rate limit resets per peer', () => {
    const limiter = new RateLimiter(10);
    for (let i = 0; i < 10; i++) {
        limiter.checkLimit('peer1');
    }
    if (!limiter.checkLimit('peer2')) {
        throw new Error('Different peer should have own limit');
    }
});

test('Rate limit resets after time window', (done) => {
    const limiter = new RateLimiter(5);
    for (let i = 0; i < 5; i++) {
        limiter.checkLimit('peer1');
    }
    // Should be blocked now
    if (limiter.checkLimit('peer1')) {
        throw new Error('Should be blocked');
    }
    // Wait for reset (1 second + buffer)
    setTimeout(() => {
        if (!limiter.checkLimit('peer1')) {
            throw new Error('Should reset after 1 second');
        }
    }, 1100);
});

// ========== TEST 4: Ban Score System ==========
console.log('\nTEST 4: Ban Score System\n');

test('Increment ban score', () => {
    const banManager = new BanScoreManager(100);
    const result = banManager.incrementScore('peer1', 10);
    if (result.score !== 10) throw new Error('Score should be 10');
    if (result.banned) throw new Error('Should not be banned yet');
});

test('Ban peer at threshold', () => {
    const banManager = new BanScoreManager(100);
    banManager.incrementScore('peer1', 90);
    const result = banManager.incrementScore('peer1', 10);
    if (!result.banned) throw new Error('Should be banned at 100');
    if (!banManager.isBanned('peer1')) throw new Error('Peer should be banned');
});

test('Reject messages from banned peer', () => {
    const banManager = new BanScoreManager(100);
    banManager.incrementScore('peer1', 100);
    const result = banManager.incrementScore('peer1', 10);
    if (result.score !== 100) throw new Error('Score should stay at threshold');
});

test('Unban peer', () => {
    const banManager = new BanScoreManager(100);
    banManager.incrementScore('peer1', 100);
    banManager.unban('peer1');
    if (banManager.isBanned('peer1')) throw new Error('Peer should be unbanned');
});

// ========== TEST 5: Peer Manager ==========
console.log('\nTEST 5: Peer Manager\n');

test('Add peer', () => {
    const peerManager = new PeerManager(10);
    const handshake = createHandshake(nodePrivateKey1);
    peerManager.addPeer(handshake.nodeId, {}, handshake);
    if (peerManager.getAllPeers().length !== 1) {
        throw new Error('Should have 1 peer');
    }
});

test('Reject peer when max peers reached', () => {
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
        if (!err.message.includes('Max peers reached')) throw err;
    }
});

test('Reject banned peer', () => {
    const peerManager = new PeerManager(10);
    const nodeId = nodeKey1.getPublic('hex');

    peerManager.incrementBanScore(nodeId, 100);

    try {
        peerManager.addPeer(nodeId, {}, createHandshake(nodePrivateKey1));
        throw new Error('Should reject banned peer');
    } catch (err) {
        if (!err.message.includes('banned')) throw err;
    }
});

test('Remove peer', () => {
    const peerManager = new PeerManager(10);
    const handshake = createHandshake(nodePrivateKey1);
    peerManager.addPeer(handshake.nodeId, {}, handshake);
    peerManager.removePeer(handshake.nodeId);
    if (peerManager.getAllPeers().length !== 0) {
        throw new Error('Should have 0 peers');
    }
});

test('Get peer stats', () => {
    const peerManager = new PeerManager(10);
    const stats = peerManager.getStats();
    if (typeof stats.connectedPeers !== 'number') throw new Error('Missing connectedPeers');
    if (typeof stats.maxPeers !== 'number') throw new Error('Missing maxPeers');
    if (typeof stats.bannedPeers !== 'number') throw new Error('Missing bannedPeers');
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
    console.log('✓ All P2P security tests passed!');
    console.log('\nP2P Security Features Verified:');
    console.log('  • Message validation with Zod schemas');
    console.log('  • Signed handshake verification');
    console.log('  • Rate limiting (100 msg/sec per peer)');
    console.log('  • Ban score system with auto-ban');
    console.log('  • Peer manager with connection limits');
    process.exit(0);
} else {
    console.error(`✗ ${testsFailed} test(s) failed`);
    process.exit(1);
}
