const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/tmp/blocks.json', 'utf8'));

const nonces = new Map();
const balances = new Map();

data.forEach(block => {
    block.transactions.forEach(tx => {
        // Track nonces
        if (tx.fromAddress && tx.nonce !== undefined) {
            const current = nonces.get(tx.fromAddress) || 0;
            nonces.set(tx.fromAddress, Math.max(current, tx.nonce));
        }

        // Track balances
        if (tx.toAddress) {
            const bal = balances.get(tx.toAddress) || 0;
            balances.set(tx.toAddress, bal + tx.amount);
        }
        if (tx.fromAddress) {
            const bal = balances.get(tx.fromAddress) || 0;
            balances.set(tx.fromAddress, bal - tx.amount - (tx.fee || 0));
        }
    });
});

console.log('=== Address Nonces ===');
nonces.forEach((nonce, addr) => {
    console.log(addr.substring(0, 40) + '...');
    console.log('  Last used nonce:', nonce);
    console.log('  Next nonce should be:', nonce + 1);
    console.log('  Balance:', balances.get(addr) || 0, 'BRL');
    console.log();
});
