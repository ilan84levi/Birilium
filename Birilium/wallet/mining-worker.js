/**
 * Mining Worker - Runs in a separate thread to avoid freezing the UI
 * Performs proof-of-work calculation for decentralized mining
 */

// Import crypto for hashing (Node.js environment in Electron)
const crypto = require('crypto');

// SHA256 hash function
function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

// Calculate block hash
function calculateBlockHash(previousHash, timestamp, transactions, nonce) {
    return sha256(
        previousHash +
        timestamp +
        JSON.stringify(transactions) +
        nonce
    );
}

// Mining state
let mining = false;
let hashCount = 0;
let startTime = 0;

// Handle messages from main thread
process.on('message', (message) => {
    switch (message.type) {
        case 'start':
            startMining(message.template);
            break;
        case 'stop':
            mining = false;
            break;
        case 'status':
            sendStatus();
            break;
    }
});

// Start mining
function startMining(template) {
    if (mining) {
        process.send({ type: 'error', message: 'Already mining' });
        return;
    }

    mining = true;
    hashCount = 0;
    startTime = Date.now();

    const { previousHash, timestamp, transactions, difficulty, index } = template;
    const target = '0'.repeat(difficulty);
    let nonce = 0;

    process.send({
        type: 'started',
        difficulty,
        target,
        blockIndex: index
    });

    // Mining loop with periodic status updates
    const batchSize = 10000; // Hashes per batch

    function mineBatch() {
        if (!mining) {
            process.send({ type: 'stopped', hashCount, elapsed: Date.now() - startTime });
            return;
        }

        for (let i = 0; i < batchSize; i++) {
            const hash = calculateBlockHash(previousHash, timestamp, transactions, nonce);
            hashCount++;

            if (hash.startsWith(target)) {
                // Found valid hash!
                mining = false;
                const elapsed = Date.now() - startTime;
                const hashRate = hashCount / (elapsed / 1000);

                process.send({
                    type: 'found',
                    block: {
                        index,
                        timestamp,
                        transactions,
                        previousHash,
                        nonce,
                        hash
                    },
                    stats: {
                        hashCount,
                        elapsed,
                        hashRate: Math.round(hashRate)
                    }
                });
                return;
            }

            nonce++;
        }

        // Send progress update every batch
        const elapsed = Date.now() - startTime;
        const hashRate = hashCount / (elapsed / 1000);

        process.send({
            type: 'progress',
            hashCount,
            hashRate: Math.round(hashRate),
            elapsed,
            nonce
        });

        // Continue mining (using setImmediate to allow message processing)
        setImmediate(mineBatch);
    }

    // Start mining
    mineBatch();
}

// Send current status
function sendStatus() {
    const elapsed = Date.now() - startTime;
    const hashRate = mining && elapsed > 0 ? hashCount / (elapsed / 1000) : 0;

    process.send({
        type: 'status',
        mining,
        hashCount,
        hashRate: Math.round(hashRate),
        elapsed
    });
}

// Signal ready
process.send({ type: 'ready' });
