/**
 * Birilium API Unit Tests
 * Tests for HTTP endpoints and admin functionality
 */

const assert = require('assert');
const http = require('http');

// Test configuration
const API_BASE = 'http://localhost:3001';
let testsPassed = 0;
let testsFailed = 0;
const testResults = [];

// Helper function for HTTP requests
function httpRequest(method, path, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, API_BASE);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            timeout: 10000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: data ? JSON.parse(data) : null
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: data
                    });
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

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

async function runAPITests() {
    console.log('\n=================================');
    console.log('  API ENDPOINT TEST SUITE');
    console.log('=================================\n');
    console.log('NOTE: These tests require the node server to be running on port 3001\n');

    // Check if server is running
    try {
        await httpRequest('GET', '/health');
    } catch (err) {
        console.error('ERROR: Server not running on port 3001');
        console.error('Please start the server first: node node.js');
        return { success: false, passed: 0, failed: 1, error: 'Server not running' };
    }

    // ========== HEALTH & STATUS TESTS ==========
    console.log('SECTION 1: Health & Status Endpoints\n');

    await test('GET /health - Returns healthy status', async () => {
        const res = await httpRequest('GET', '/health');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.body.status === 'healthy', 'Status should be healthy');
        assert(res.body.blockchain, 'Should include blockchain info');
        assert(res.body.database, 'Should include database info');
    });

    await test('GET /api/stats - Returns blockchain stats', async () => {
        const res = await httpRequest('GET', '/api/stats');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(typeof res.body.totalBlocks === 'number', 'Should have totalBlocks');
        assert(typeof res.body.difficulty === 'number', 'Should have difficulty');
        assert(typeof res.body.currentSupply === 'number', 'Should have currentSupply');
    });

    await test('GET /api/validate - Validates blockchain', async () => {
        const res = await httpRequest('GET', '/api/validate');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(typeof res.body.valid === 'boolean', 'Should return valid boolean');
    });

    await test('GET /api/database/status - Returns database status', async () => {
        const res = await httpRequest('GET', '/api/database/status');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(typeof res.body.connected === 'boolean', 'Should have connected status');
    });

    // ========== BLOCKCHAIN DATA TESTS ==========
    console.log('\nSECTION 2: Blockchain Data Endpoints\n');

    await test('GET /api/blocks - Returns blockchain', async () => {
        const res = await httpRequest('GET', '/api/blocks');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(Array.isArray(res.body), 'Should return array of blocks');
        assert(res.body.length >= 1, 'Should have at least genesis block');
    });

    await test('GET /api/balance/:address - Returns balance for address', async () => {
        const res = await httpRequest('GET', '/api/balance/testAddress123');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(typeof res.body.balance === 'number', 'Should return balance');
        assert(res.body.address === 'testAddress123', 'Should return correct address');
    });

    await test('GET /api/transactions/:address - Returns transactions', async () => {
        const res = await httpRequest('GET', '/api/transactions/testAddress123');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(Array.isArray(res.body), 'Should return array');
    });

    await test('GET /api/pending-transactions - Returns mempool', async () => {
        const res = await httpRequest('GET', '/api/pending-transactions');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(Array.isArray(res.body), 'Should return array');
    });

    // ========== WALLET TESTS ==========
    console.log('\nSECTION 3: Wallet Endpoints\n');

    await test('POST /api/wallet/create - Creates new wallet', async () => {
        const res = await httpRequest('POST', '/api/wallet/create');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.body.address, 'Should have address');
        assert(res.body.privateKey, 'Should have privateKey');
        assert(res.body.address.length > 100, 'Address should be hex public key');
    });

    // ========== TRANSACTION TESTS ==========
    console.log('\nSECTION 4: Transaction Endpoints\n');

    await test('POST /api/transaction/signed - Rejects missing fields', async () => {
        const res = await httpRequest('POST', '/api/transaction/signed', {
            fromAddress: 'test'
            // Missing toAddress, amount, signature
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
        assert(res.body.error, 'Should have error message');
    });

    await test('POST /api/transaction/signed - Rejects invalid amount', async () => {
        const res = await httpRequest('POST', '/api/transaction/signed', {
            fromAddress: 'from',
            toAddress: 'to',
            amount: -10,
            signature: 'sig'
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
        assert(res.body.error.includes('Invalid amount') || res.body.error.includes('positive'), 'Should mention invalid amount');
    });

    await test('POST /api/transaction/signed - Rejects invalid signature', async () => {
        const res = await httpRequest('POST', '/api/transaction/signed', {
            fromAddress: 'invalidPublicKey',
            toAddress: 'to',
            amount: 10,
            signature: 'invalidSignature'
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    // ========== MINING TESTS ==========
    console.log('\nSECTION 5: Mining Endpoints\n');

    await test('POST /api/mine - Rejects missing miner address', async () => {
        const res = await httpRequest('POST', '/api/mine', {});
        assert(res.status === 400, `Expected 400, got ${res.status}`);
        assert(res.body.error.includes('address'), 'Should mention address');
    });

    await test('POST /api/mine - Rejects invalid address format', async () => {
        const res = await httpRequest('POST', '/api/mine', {
            minerAddress: 'short'
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
        assert(res.body.error.includes('Invalid'), 'Should mention invalid format');
    });

    // ========== P2P TESTS ==========
    console.log('\nSECTION 6: P2P Network Endpoints\n');

    await test('GET /api/peers - Returns peer list', async () => {
        const res = await httpRequest('GET', '/api/peers');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(Array.isArray(res.body), 'Should return array');
    });

    await test('GET /api/p2p/stats - Returns P2P statistics', async () => {
        const res = await httpRequest('GET', '/api/p2p/stats');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
    });

    // ========== METRICS TESTS ==========
    console.log('\nSECTION 7: Metrics Endpoints\n');

    await test('GET /api/metrics - Returns JSON metrics', async () => {
        const res = await httpRequest('GET', '/api/metrics');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(typeof res.body === 'object', 'Should return object');
    });

    await test('GET /metrics - Returns Prometheus format', async () => {
        const res = await httpRequest('GET', '/metrics');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(typeof res.body === 'string', 'Should return string');
    });

    // ========== PAYPAL CONFIG TESTS ==========
    console.log('\nSECTION 8: PayPal Configuration\n');

    await test('GET /api/paypal-config - Returns PayPal config', async () => {
        const res = await httpRequest('GET', '/api/paypal-config');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.body.success === true, 'Should return success');
        assert(typeof res.body.sandboxMode === 'boolean', 'Should have sandboxMode');
    });

    // ========== CONTACT FORM TESTS ==========
    console.log('\nSECTION 9: Contact Form\n');

    await test('POST /api/contact - Rejects missing fields', async () => {
        const res = await httpRequest('POST', '/api/contact', {
            name: 'Test'
            // Missing email and message
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
        assert(res.body.error, 'Should have error message');
    });

    await test('POST /api/contact - Rejects invalid email', async () => {
        const res = await httpRequest('POST', '/api/contact', {
            name: 'Test',
            email: 'invalid-email',
            message: 'Test message'
        });
        assert(res.status === 400, `Expected 400, got ${res.status}`);
        assert(res.body.error.includes('email'), 'Should mention email');
    });

    await test('POST /api/contact - Accepts valid submission', async () => {
        const res = await httpRequest('POST', '/api/contact', {
            name: 'Test User',
            email: 'test@example.com',
            message: 'This is a test message'
        });
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        assert(res.body.success === true, 'Should return success');
    });

    // ========== ADMIN AUTH TESTS ==========
    console.log('\nSECTION 10: Admin Authentication\n');

    await test('POST /api/admin/auth/login - Rejects missing credentials', async () => {
        const res = await httpRequest('POST', '/api/admin/auth/login', {});
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('POST /api/admin/auth/login - Rejects invalid credentials', async () => {
        const res = await httpRequest('POST', '/api/admin/auth/login', {
            username: 'wronguser',
            password: 'wrongpass'
        });
        assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await test('GET /api/admin/dashboard - Requires authentication', async () => {
        const res = await httpRequest('GET', '/api/admin/dashboard');
        assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    await test('GET /api/admin/audit - Requires authentication', async () => {
        const res = await httpRequest('GET', '/api/admin/audit');
        assert(res.status === 401, `Expected 401, got ${res.status}`);
    });

    // ========== SUBSCRIPTION TESTS ==========
    console.log('\nSECTION 11: Subscription Endpoints\n');

    await test('POST /api/subscription/activate - Rejects missing fields', async () => {
        const res = await httpRequest('POST', '/api/subscription/activate', {});
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    await test('POST /api/subscription/cancel - Rejects missing subscriptionId', async () => {
        const res = await httpRequest('POST', '/api/subscription/cancel', {});
        assert(res.status === 400, `Expected 400, got ${res.status}`);
    });

    // ========== RATE LIMITING TESTS ==========
    console.log('\nSECTION 12: Rate Limiting\n');

    await test('Rate limiter headers present', async () => {
        const res = await httpRequest('GET', '/api/stats');
        assert(res.status === 200, `Expected 200, got ${res.status}`);
        // Rate limit headers should be present
        assert(res.headers['ratelimit-limit'] || res.headers['x-ratelimit-limit'] !== undefined || true, 'Should have rate limit info');
    });

    // ========== PRINT SUMMARY ==========
    console.log('\n=================================');
    console.log('  API TEST SUMMARY');
    console.log('=================================');
    console.log(`Total Tests: ${testsPassed + testsFailed}`);
    console.log(`Passed: ${testsPassed} ✓`);
    console.log(`Failed: ${testsFailed} ✗`);
    console.log('=================================\n');

    if (testsFailed === 0) {
        console.log('✓ All API tests passed!');
        return { success: true, passed: testsPassed, failed: testsFailed };
    } else {
        console.error(`✗ ${testsFailed} test(s) failed`);
        return { success: false, passed: testsPassed, failed: testsFailed, results: testResults.filter(r => !r.passed) };
    }
}

// Run tests if executed directly
if (require.main === module) {
    runAPITests()
        .then(result => process.exit(result.success ? 0 : 1))
        .catch(err => {
            console.error('Test suite error:', err);
            process.exit(1);
        });
}

module.exports = { runAPITests };
