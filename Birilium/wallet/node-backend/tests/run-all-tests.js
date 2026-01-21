/**
 * Birilium Test Runner
 * Runs all test suites and generates a summary report
 */

const { runBlockchainTests } = require('./blockchain.test');
const { runAPITests } = require('./api.test');

async function runAllTests() {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║          BIRILIUM WALLET - COMPLETE TEST SUITE            ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const results = {
        blockchain: null,
        api: null,
        timestamp: new Date().toISOString()
    };

    // Run blockchain tests (don't require server)
    console.log('\n▶ Running Blockchain Core Tests...\n');
    try {
        results.blockchain = await runBlockchainTests();
    } catch (err) {
        results.blockchain = { success: false, error: err.message };
    }

    // Run API tests (require server to be running)
    console.log('\n\n▶ Running API Endpoint Tests...\n');
    try {
        results.api = await runAPITests();
    } catch (err) {
        results.api = { success: false, error: err.message };
    }

    // Print final summary
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    FINAL TEST REPORT                       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const totalPassed = (results.blockchain?.passed || 0) + (results.api?.passed || 0);
    const totalFailed = (results.blockchain?.failed || 0) + (results.api?.failed || 0);
    const totalTests = totalPassed + totalFailed;

    console.log(`📊 Test Summary:`);
    console.log(`   ├── Blockchain Tests: ${results.blockchain?.passed || 0} passed, ${results.blockchain?.failed || 0} failed`);
    console.log(`   ├── API Tests:        ${results.api?.passed || 0} passed, ${results.api?.failed || 0} failed`);
    console.log(`   └── Total:            ${totalPassed}/${totalTests} passed (${((totalPassed/totalTests)*100).toFixed(1)}%)`);

    if (totalFailed === 0) {
        console.log('\n✅ ALL TESTS PASSED!\n');
    } else {
        console.log(`\n❌ ${totalFailed} TEST(S) FAILED\n`);

        if (results.blockchain?.results) {
            console.log('Failed blockchain tests:');
            results.blockchain.results.forEach(r => console.log(`  - ${r.name}: ${r.error}`));
        }
        if (results.api?.results) {
            console.log('Failed API tests:');
            results.api.results.forEach(r => console.log(`  - ${r.name}: ${r.error}`));
        }
    }

    return totalFailed === 0;
}

runAllTests()
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
        console.error('Test runner error:', err);
        process.exit(1);
    });
