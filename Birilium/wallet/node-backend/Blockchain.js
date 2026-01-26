const Block = require('./Block');
const Transaction = require('./Transaction');

class Blockchain {
    constructor(database = null) {
        this.chain = [this.createGenesisBlock()];
        this.difficulty = 4; // Mining difficulty
        this.pendingTransactions = [];
        this.miningReward = 10; // BRL per block
        this.maxSupply = 25000000000; // 25 billion BRL
        this.currentSupply = 0;
        this.transactionFee = 0.001; // 0.1% transaction fee
        this.minimumFee = 0.0001; // Minimum fee in BRL
        this.targetBlockTime = 30000; // Target 30 seconds per block in milliseconds
        this.difficultyAdjustmentInterval = 10; // Adjust difficulty every 10 blocks
        this.database = database; // MongoDB database instance

        // LWMA difficulty adjustment (testnet only)
        this.enableLWMA = process.env.ENABLE_LWMA === 'true'; // Feature flag for testnet
        this.lwmaAdjustWindow = 60; // LWMA adjustment window (60 blocks)

        // SECURITY: Mempool and block limits (Bitcoin-level safety)
        this.maxMempoolSize = 10000; // Max 10,000 pending transactions
        this.maxBlockSize = 1000; // Max 1,000 transactions per block
        this.maxBlockSizeBytes = 1024 * 1024; // 1 MB block size limit
        this.txExpirationTime = 3600000; // 1 hour transaction expiration

        // PERFORMANCE: Balance cache for Ethereum-like speed
        this.balanceCache = new Map(); // Address -> balance
        this.balanceCacheDirty = true; // Recalculate on next access

        // SECURITY: Account nonces for replay protection (Ethereum-style)
        this.accountNonces = new Map(); // Address -> nonce
        this.noncesCacheDirty = true; // Recalculate on next access
    }

    // Load blockchain from database
    async loadFromDatabase() {
        if (!this.database || !this.database.isConnected) {
            console.log('Database not available, using fresh blockchain');
            return false;
        }

        try {
            const blocks = await this.database.loadBlockchain();
            const state = await this.database.loadBlockchainState();

            if (blocks && blocks.length > 0) {
                this.chain = blocks.map((blockData, index) => {
                    const Block = require('./Block');
                    const block = new Block(
                        blockData.timestamp,
                        blockData.transactions,
                        blockData.previousHash,
                        blockData.index !== undefined ? blockData.index : index  // Use stored index or position
                    );
                    block.hash = blockData.hash;
                    block.nonce = blockData.nonce;
                    return block;
                });

                if (state) {
                    this.currentSupply = state.currentSupply || 0;
                    this.difficulty = state.difficulty || 4;
                }

                console.log(`✓ Blockchain loaded from database (${this.chain.length} blocks)`);
                return true;
            }

            return false;
        } catch (error) {
            console.error('Error loading blockchain from database:', error.message);
            return false;
        }
    }

    // Save blockchain state to database
    async saveToDatabase() {
        if (!this.database || !this.database.isConnected) {
            return false;
        }

        try {
            await this.database.saveBlockchainState({
                currentSupply: this.currentSupply,
                difficulty: this.difficulty
            });
            return true;
        } catch (error) {
            console.error('Error saving blockchain state:', error.message);
            return false;
        }
    }

    createGenesisBlock() {
        const genesisBlock = new Block(Date.now(), [], '0', 0);  // Index 0 for genesis
        genesisBlock.hash = genesisBlock.calculateHash();
        return genesisBlock;
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    // LWMA: Linearly Weighted Moving Average difficulty adjustment
    // Reference: Zawy's LWMA algorithm for better difficulty response
    calculateLWMADifficulty() {
        const n = this.lwmaAdjustWindow;

        // Need at least n+1 blocks for LWMA calculation
        if (this.chain.length <= n) {
            return this.difficulty;
        }

        let sumTarget = 0;
        let sumTime = 0;
        let weightedSum = 0;

        // Calculate weighted average of last n blocks
        for (let i = 1; i <= n; i++) {
            const currentBlock = this.chain[this.chain.length - i];
            const previousBlock = this.chain[this.chain.length - i - 1];

            const solveTime = Math.max(1, currentBlock.timestamp - previousBlock.timestamp);
            const weight = n - i + 1; // Linear weighting: newer blocks have higher weight

            sumTarget += this.difficulty * weight;
            sumTime += solveTime * weight;
            weightedSum += weight;
        }

        const avgTarget = sumTarget / weightedSum;
        const avgTime = sumTime / weightedSum;

        // Calculate new difficulty
        let newDifficulty = Math.round(avgTarget * this.targetBlockTime / avgTime);

        // SAFETY: Limit difficulty change to 4× per adjustment
        newDifficulty = Math.max(newDifficulty, this.difficulty / 4);
        newDifficulty = Math.min(newDifficulty, this.difficulty * 4);

        // SAFETY: Never go below difficulty 1
        newDifficulty = Math.max(1, newDifficulty);

        if (newDifficulty !== this.difficulty) {
            console.log(`[LWMA] Difficulty adjusted: ${this.difficulty} → ${newDifficulty} (avg time: ${Math.round(avgTime)}ms)`);
        }

        return newDifficulty;
    }

    // MTP: Median Time Past - more robust timestamp using median of last 11 blocks
    // Reference: Bitcoin BIP-113
    getMedianTimePast() {
        const last11 = this.chain.slice(-11);

        if (last11.length === 0) {
            return Date.now();
        }

        const times = last11.map(block => block.timestamp).sort((a, b) => a - b);
        return times[Math.floor(times.length / 2)];
    }

    // Adjust difficulty based on block time
    adjustDifficulty() {
        // TESTNET FEATURE FLAG: Use LWMA if enabled
        if (this.enableLWMA) {
            this.difficulty = this.calculateLWMADifficulty();
            return this.difficulty;
        }

        // LEGACY: Simple difficulty adjustment (mainnet)
        const latestBlock = this.getLatestBlock();

        // Only adjust every N blocks
        if (this.chain.length % this.difficultyAdjustmentInterval !== 0) {
            return this.difficulty;
        }

        // Need at least 2 intervals to calculate
        if (this.chain.length < this.difficultyAdjustmentInterval * 2) {
            return this.difficulty;
        }

        const prevAdjustmentBlock = this.chain[this.chain.length - this.difficultyAdjustmentInterval];
        const timeExpected = this.targetBlockTime * this.difficultyAdjustmentInterval;
        const timeTaken = latestBlock.timestamp - prevAdjustmentBlock.timestamp;

        // Adjust difficulty: if blocks are mined too fast, increase difficulty
        if (timeTaken < timeExpected / 2) {
            this.difficulty++;
            console.log(`Difficulty increased to ${this.difficulty}`);
        } else if (timeTaken > timeExpected * 2) {
            this.difficulty = Math.max(1, this.difficulty - 1);
            console.log(`Difficulty decreased to ${this.difficulty}`);
        }

        return this.difficulty;
    }

    async minePendingTransactions(miningRewardAddress) {
        // Check if max supply reached
        if (this.currentSupply >= this.maxSupply) {
            console.log('Maximum supply reached. No more coins can be mined.');
            return null;
        }

        // SECURITY: Sort transactions by fee (highest first) for miner revenue optimization
        this.pendingTransactions.sort((a, b) => b.fee - a.fee);

        // SECURITY: Limit transactions per block
        let txsToInclude = this.pendingTransactions.slice(0, this.maxBlockSize);

        // Calculate total transaction fees
        let totalFees = 0;
        for (const tx of txsToInclude) {
            if (tx.fee) {
                totalFees += tx.fee;
            }
        }

        // Calculate actual reward (don't exceed max supply)
        let actualReward = this.miningReward + totalFees;
        if (this.currentSupply + this.miningReward > this.maxSupply) {
            actualReward = this.maxSupply - this.currentSupply + totalFees;
        }

        // Create mining reward transaction
        const rewardTx = new Transaction(null, miningRewardAddress, actualReward);
        txsToInclude.push(rewardTx);

        // SECURITY: Validate block size in bytes
        const blockSizeBytes = JSON.stringify(txsToInclude).length;
        if (blockSizeBytes > this.maxBlockSizeBytes) {
            console.warn(`Block size ${blockSizeBytes} bytes exceeds limit, reducing transactions...`);
            while (JSON.stringify(txsToInclude).length > this.maxBlockSizeBytes && txsToInclude.length > 1) {
                txsToInclude.splice(txsToInclude.length - 2, 1); // Remove second-to-last (keep coinbase)
            }
        }

        // Create new block with selected transactions
        const block = new Block(
            Date.now(),
            txsToInclude,
            this.getLatestBlock().hash,
            this.chain.length  // Block index
        );

        console.log('Mining block...');
        block.mineBlock(this.difficulty);

        // SECURITY: Validate timestamp before accepting
        if (!this.isValidBlockTimestamp(block)) {
            throw new Error('Invalid block timestamp');
        }

        console.log('Block successfully mined!');
        this.chain.push(block);
        this.currentSupply += (actualReward - totalFees); // Only add new coins, not fees
        this.balanceCacheDirty = true; // Invalidate cache

        // Save block to database
        if (this.database && this.database.isConnected) {
            await this.database.saveBlock(block, this.chain.length - 1);
            await this.saveToDatabase();
        }

        // Adjust difficulty after adding block
        this.adjustDifficulty();

        // Remove mined transactions from mempool
        const minedTxHashes = new Set(txsToInclude.map(tx =>
            tx.fromAddress + tx.toAddress + tx.amount + tx.timestamp
        ));

        this.pendingTransactions = this.pendingTransactions.filter(tx => {
            const txHash = tx.fromAddress + tx.toAddress + tx.amount + tx.timestamp;
            return !minedTxHashes.has(txHash);
        });

        return block;
    }

    // SECURITY: Bitcoin-level timestamp validation
    isValidBlockTimestamp(block) {
        const now = Date.now();
        const maxFutureTime = now + 7200000; // 2 hours in future (clock drift tolerance)

        // Block can't be from future (beyond tolerance)
        if (block.timestamp > maxFutureTime) {
            console.error(`Block timestamp ${block.timestamp} too far in future (max ${maxFutureTime})`);
            return false;
        }

        // TESTNET FEATURE: Use MTP (Median Time Past) if LWMA enabled
        if (this.enableLWMA) {
            const medianTimePast = this.getMedianTimePast();

            // Block timestamp must be greater than median of last 11 blocks
            if (block.timestamp <= medianTimePast) {
                console.error(`Block timestamp ${block.timestamp} not greater than MTP ${medianTimePast}`);
                return false;
            }
        } else {
            // LEGACY: Block must be after previous block
            const previousBlock = this.getLatestBlock();
            if (previousBlock && block.timestamp < previousBlock.timestamp) {
                console.error(`Block timestamp ${block.timestamp} is before previous block ${previousBlock.timestamp}`);
                return false;
            }
        }

        return true;
    }

    // Calculate transaction fee
    calculateTransactionFee(amount) {
        const fee = amount * this.transactionFee;
        return Math.max(fee, this.minimumFee);
    }

    // Clean expired transactions from mempool
    cleanExpiredTransactions() {
        const now = Date.now();
        const beforeCount = this.pendingTransactions.length;

        this.pendingTransactions = this.pendingTransactions.filter(tx => {
            return (now - tx.timestamp) < this.txExpirationTime;
        });

        const removed = beforeCount - this.pendingTransactions.length;
        if (removed > 0) {
            console.log(`Cleaned ${removed} expired transactions from mempool`);
        }
    }

    // Evict lowest-fee transactions when mempool is full
    evictLowFeeTx() {
        if (this.pendingTransactions.length <= this.maxMempoolSize) {
            return;
        }

        // Sort by fee (lowest first)
        this.pendingTransactions.sort((a, b) => a.fee - b.fee);

        // Remove lowest-fee transactions
        const toRemove = this.pendingTransactions.length - this.maxMempoolSize;
        this.pendingTransactions.splice(0, toRemove);

        console.log(`Evicted ${toRemove} low-fee transactions (mempool full)`);
    }

    addTransaction(transaction) {
        if (!transaction.fromAddress || !transaction.toAddress) {
            throw new Error('Transaction must include from and to address');
        }

        if (!transaction.isValid()) {
            throw new Error('Cannot add invalid transaction to chain');
        }

        if (transaction.amount <= 0) {
            throw new Error('Transaction amount should be higher than 0');
        }

        // SECURITY: Validate nonce for replay protection (Ethereum-style)
        if (transaction.fromAddress) {
            const expectedNonce = this.getAccountNonce(transaction.fromAddress);
            const txNonce = transaction.nonce || 0;

            // For new accounts, accept nonce 0
            // For existing accounts, nonce must be exactly expectedNonce + 1
            if (expectedNonce > 0 && txNonce !== expectedNonce + 1) {
                throw new Error(`Invalid nonce. Expected ${expectedNonce + 1}, got ${txNonce}. This prevents replay attacks.`);
            }

            // For first transaction (nonce 0), also accept
            if (expectedNonce === 0 && txNonce !== 0 && txNonce !== 1) {
                throw new Error(`Invalid nonce for new account. Expected 0 or 1, got ${txNonce}.`);
            }
        }

        // Calculate fee if not set
        if (!transaction.fee) {
            transaction.fee = this.calculateTransactionFee(transaction.amount);
        }

        // Check if sender has enough balance (including fee)
        const senderBalance = this.getBalanceOfAddress(transaction.fromAddress);
        const totalRequired = transaction.amount + transaction.fee;

        if (senderBalance < totalRequired) {
            throw new Error(`Not enough balance. Required: ${totalRequired} BRL (including ${transaction.fee} BRL fee), Available: ${senderBalance} BRL`);
        }

        // SECURITY: Clean expired transactions before checking mempool size
        this.cleanExpiredTransactions();

        // SECURITY: Check mempool size limit
        if (this.pendingTransactions.length >= this.maxMempoolSize) {
            // Try to make room by evicting low-fee transactions
            this.evictLowFeeTx();

            // If still full, reject unless fee is higher than lowest
            if (this.pendingTransactions.length >= this.maxMempoolSize) {
                const lowestFee = Math.min(...this.pendingTransactions.map(tx => tx.fee));
                if (transaction.fee <= lowestFee) {
                    throw new Error(`Mempool full. Increase fee above ${lowestFee} BRL to prioritize transaction.`);
                }
            }
        }

        this.pendingTransactions.push(transaction);
        this.balanceCacheDirty = true; // Invalidate cache
        this.noncesCacheDirty = true; // Invalidate nonce cache
    }

    // Rebuild balance cache (Ethereum-like performance)
    rebuildBalanceCache() {
        this.balanceCache.clear();

        for (const block of this.chain) {
            for (const trans of block.transactions) {
                // Deduct from sender
                if (trans.fromAddress) {
                    const currentBalance = this.balanceCache.get(trans.fromAddress) || 0;
                    this.balanceCache.set(trans.fromAddress, currentBalance - trans.amount - (trans.fee || 0));
                }

                // Credit to recipient
                if (trans.toAddress) {
                    const currentBalance = this.balanceCache.get(trans.toAddress) || 0;
                    this.balanceCache.set(trans.toAddress, currentBalance + trans.amount);
                }
            }
        }

        this.balanceCacheDirty = false;
        console.log(`Balance cache rebuilt: ${this.balanceCache.size} addresses`);
    }

    // Rebuild nonce cache (Ethereum-style replay protection)
    rebuildNonceCache() {
        this.accountNonces.clear();

        for (const block of this.chain) {
            for (const trans of block.transactions) {
                // Only track nonces for sender accounts (not coinbase)
                if (trans.fromAddress && typeof trans.nonce === 'number') {
                    // Nonce should be monotonically increasing
                    const currentNonce = this.accountNonces.get(trans.fromAddress) || -1;
                    this.accountNonces.set(trans.fromAddress, Math.max(currentNonce, trans.nonce));
                }
            }
        }

        this.noncesCacheDirty = false;
        console.log(`Nonce cache rebuilt: ${this.accountNonces.size} accounts`);
    }

    // Get expected nonce for an address
    getAccountNonce(address) {
        if (this.noncesCacheDirty) {
            this.rebuildNonceCache();
        }
        return this.accountNonces.get(address) || 0;
    }

    getBalanceOfAddress(address) {
        // Use cache for O(1) lookup instead of O(n*m) blockchain scan
        if (this.balanceCacheDirty) {
            this.rebuildBalanceCache();
        }

        return this.balanceCache.get(address) || 0;
    }

    getAllTransactionsForWallet(address) {
        const txs = [];

        for (const block of this.chain) {
            for (const tx of block.transactions) {
                if (tx.fromAddress === address || tx.toAddress === address) {
                    txs.push({
                        ...tx,
                        blockHash: block.hash,
                        timestamp: block.timestamp
                    });
                }
            }
        }

        return txs;
    }

    isChainValid() {
        // Skip genesis block check as it's created with timestamp
        // Just check from block 1 onwards

        // Validate each block
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            // Validate transactions
            if (!currentBlock.hasValidTransactions()) {
                console.log(`[Validation] Block ${i}: Invalid transactions`);
                return false;
            }

            // Validate hash
            const calculatedHash = currentBlock.calculateHash();
            if (currentBlock.hash !== calculatedHash) {
                console.log(`[Validation] Block ${i}: Hash mismatch`);
                console.log(`  Stored: ${currentBlock.hash}`);
                console.log(`  Calculated: ${calculatedHash}`);
                return false;
            }

            // Validate chain link
            if (currentBlock.previousHash !== previousBlock.hash) {
                console.log(`[Validation] Block ${i}: Chain link broken`);
                console.log(`  Block ${i} previousHash: ${currentBlock.previousHash}`);
                console.log(`  Block ${i-1} hash: ${previousBlock.hash}`);
                return false;
            }

            // Validate proof of work
            if (currentBlock.hash.substring(0, this.difficulty) !== Array(this.difficulty + 1).join('0')) {
                console.log(`[Validation] Block ${i}: Invalid proof of work`);
                return false;
            }
        }

        return true;
    }

    getStats() {
        return {
            totalBlocks: this.chain.length,
            difficulty: this.difficulty,
            currentSupply: this.currentSupply,
            maxSupply: this.maxSupply,
            remainingSupply: this.maxSupply - this.currentSupply,
            pendingTransactions: this.pendingTransactions.length,
            miningReward: this.miningReward,
            transactionFee: this.transactionFee,
            minimumFee: this.minimumFee
        };
    }
}

module.exports = Blockchain;
