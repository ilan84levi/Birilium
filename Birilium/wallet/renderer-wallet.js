// Birilium Wallet - Browser/Electron Compatible Version
// This version works in the Electron renderer process

// Load crypto-js for encryption
const CryptoJS = require('crypto-js');
const QRCode = require('qrcode');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const SHA256 = require('crypto-js/sha256');

class BiriliumBlockchainWallet {
    constructor() {
        this.nodeUrl = 'http://localhost:3001';
        this.walletAddress = null;
        this.privateKey = null;
        this.balance = 0;
        this.transactions = [];
        this.isMining = false;
        this.miningInterval = null;
        this.hasSubscription = false;
        this.subscriptionId = null;
        this.subscriptionStartDate = null;
        this.isLocked = true;
        this.password = null;
        this.isNodeConnected = false;
        this.nodeConnectionRetries = 0;
        this.maxRetries = 10;

        // Check if terms were accepted
        this.checkTermsAcceptance();

        this.checkWalletStatus();
        this.initializeEventListeners();
        this.updateUI();

        // Wait for node to be ready before syncing
        this.waitForNodeConnection();

        console.log('Birilium Wallet initialized successfully');
    }

    // Wait for node connection with retry logic
    async waitForNodeConnection() {
        console.log('Waiting for blockchain node connection...');
        const checkConnection = async () => {
            try {
                const response = await fetch(`${this.nodeUrl}/api/stats`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(5000) // 5 second timeout
                });

                if (response.ok) {
                    this.isNodeConnected = true;
                    console.log('✓ Connected to blockchain node');

                    // Start syncing now that we're connected
                    this.syncWithBlockchain();
                    setInterval(() => this.syncWithBlockchain(), 5000);

                    // Update global supply
                    this.updateGlobalSupply();
                    setInterval(() => this.updateGlobalSupply(), 10000);

                    return true;
                }
            } catch (error) {
                // Connection failed, will retry
                console.log(`Node connection attempt ${this.nodeConnectionRetries + 1}/${this.maxRetries} failed`);
            }

            this.nodeConnectionRetries++;

            if (this.nodeConnectionRetries < this.maxRetries) {
                // Retry after 3 seconds
                setTimeout(checkConnection, 3000);
            } else {
                console.warn('⚠️ Could not connect to blockchain node after multiple attempts');
                console.warn('Some features may not work until the node is running');
                // Show warning to user
                this.showNodeConnectionWarning();
            }
        };

        checkConnection();
    }

    // Show warning when node is not connected
    showNodeConnectionWarning() {
        const warningDiv = document.createElement('div');
        warningDiv.id = 'nodeWarning';
        warningDiv.style.cssText = `
            position: fixed;
            top: 60px;
            left: 50%;
            transform: translateX(-50%);
            background: #ff9800;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            z-index: 10000;
            font-weight: bold;
            text-align: center;
        `;
        warningDiv.innerHTML = `
            ⚠️ Blockchain node not connected<br>
            <small style="font-weight: normal;">Make sure START-WALLET.bat is running</small>
        `;
        document.body.appendChild(warningDiv);
    }

    // Fetch with retry logic
    async fetchWithRetry(url, options = {}, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, {
                    ...options,
                    signal: AbortSignal.timeout(10000) // 10 second timeout
                });
                return response;
            } catch (error) {
                if (i === retries - 1) throw error;
                console.log(`Fetch attempt ${i + 1} failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Progressive delay
            }
        }
    }

    // Check if user has accepted terms
    checkTermsAcceptance() {
        // FIXED: Always auto-accept terms (modal was causing issues)
        const termsAccepted = localStorage.getItem('biriliumTermsAccepted');
        if (!termsAccepted) {
            console.log('Auto-accepting terms...');
            localStorage.setItem('biriliumTermsAccepted', 'true');
        }
        // Terms modal disabled for better UX - users can read terms in documentation
    }

    // Show Terms of Use modal
    showTermsOfUse() {
        const termsOverlay = document.getElementById('termsOverlay');
        if (termsOverlay) {
            termsOverlay.style.display = 'flex';
        }
    }

    // Hide Terms of Use modal
    hideTermsOfUse() {
        const termsOverlay = document.getElementById('termsOverlay');
        if (termsOverlay) {
            termsOverlay.style.display = 'none';
        }
    }

    // Accept terms
    acceptTerms() {
        localStorage.setItem('biriliumTermsAccepted', 'true');
        this.hideTermsOfUse();
    }

    // Check if wallet exists and is locked
    checkWalletStatus() {
        const savedWallet = localStorage.getItem('biriliumBlockchainWallet');
        if (savedWallet) {
            const data = JSON.parse(savedWallet);
            if (data.encrypted) {
                this.isLocked = true;
                this.showUnlockScreen();
            } else {
                // Old unencrypted wallet - migrate it
                this.walletAddress = data.address;
                this.privateKey = data.privateKey;
                this.hasSubscription = data.hasSubscription || false;
                this.subscriptionId = data.subscriptionId || null;
                this.subscriptionStartDate = data.subscriptionStartDate || null;
                this.isLocked = false;
                this.syncWithBlockchain();
            }
        }
    }

    // Show unlock screen
    showUnlockScreen() {
        const unlockOverlay = document.getElementById('unlockOverlay');
        if (unlockOverlay) {
            unlockOverlay.classList.remove('hidden');

            // Display which wallet is locked
            const lockedWalletAddress = document.getElementById('lockedWalletAddress');
            if (lockedWalletAddress && this.walletAddress) {
                const shortAddress = this.walletAddress.substring(0, 10) + '...' + this.walletAddress.substring(this.walletAddress.length - 10);
                lockedWalletAddress.innerHTML = `<small style="color: #6c757d;">Wallet: ${shortAddress}</small>`;
            }
        }
    }

    // Hide unlock screen
    hideUnlockScreen() {
        const unlockOverlay = document.getElementById('unlockOverlay');
        if (unlockOverlay) {
            unlockOverlay.classList.add('hidden');
        }
    }

    // Encrypt private key
    encryptPrivateKey(privateKey, password) {
        return CryptoJS.AES.encrypt(privateKey, password).toString();
    }

    // Decrypt private key
    decryptPrivateKey(encryptedKey, password) {
        try {
            const bytes = CryptoJS.AES.decrypt(encryptedKey, password);
            return bytes.toString(CryptoJS.enc.Utf8);
        } catch (error) {
            return null;
        }
    }

    // Unlock wallet
    unlockWallet(password) {
        const savedWallet = localStorage.getItem('biriliumBlockchainWallet');
        if (!savedWallet) {
            return { success: false, message: 'No wallet found' };
        }

        const data = JSON.parse(savedWallet);
        if (!data.encrypted) {
            return { success: false, message: 'Wallet is not encrypted' };
        }

        const decryptedKey = this.decryptPrivateKey(data.encryptedPrivateKey, password);
        if (!decryptedKey) {
            return { success: false, message: 'Incorrect password' };
        }

        this.walletAddress = data.address;
        this.privateKey = decryptedKey;
        this.hasSubscription = data.hasSubscription || false;
        this.subscriptionId = data.subscriptionId || null;
        this.subscriptionStartDate = data.subscriptionStartDate || null;
        this.isLocked = false;
        this.password = password;

        this.hideUnlockScreen();
        this.syncWithBlockchain();
        this.updateUI();

        return { success: true, message: 'Wallet unlocked successfully' };
    }

    // Lock wallet
    lockWallet() {
        this.privateKey = null;
        this.password = null;
        this.isLocked = true;
        this.stopMining();
        this.showUnlockScreen();
        this.updateUI();
    }

    // Disconnect wallet (clear all data)
    disconnectWallet() {
        if (!confirm('Are you sure you want to disconnect this wallet?\n\nThis will clear all wallet data from this device. Make sure you have saved your backup!')) {
            return;
        }

        // Stop mining if active
        if (this.isMining) {
            this.stopMining();
        }

        // Clear all wallet data
        this.walletAddress = null;
        this.privateKey = null;
        this.balance = 0;
        this.transactions = [];
        this.hasSubscription = false;
        this.isLocked = false; // Set to false so user can create new wallet
        this.password = null;

        // Remove from localStorage
        localStorage.removeItem('biriliumBlockchainWallet');

        // Hide unlock screen if it's showing
        this.hideUnlockScreen();

        // Update UI
        this.updateUI();
        this.switchView('create');

        alert('Wallet disconnected successfully. All data has been cleared from this device.');
    }

    // Clear all data and start new session
    clearAllData() {
        const confirmed = confirm(
            '⚠️ CLEAR ALL DATA & START NEW SESSION\n\n' +
            'This will permanently remove:\n' +
            '• Current wallet data (address & encrypted key)\n' +
            '• All settings and preferences\n' +
            '• Terms acceptance status\n\n' +
            '⚠️ MAKE SURE YOU HAVE BACKED UP YOUR WALLET!\n\n' +
            'Your coins are safe on the blockchain, but you need your secret key to access them later.\n\n' +
            'Continue?'
        );

        if (!confirmed) {
            return;
        }

        // Double confirmation for safety
        const doubleConfirm = confirm(
            '⚠️ FINAL CONFIRMATION\n\n' +
            'Have you backed up your secret key?\n\n' +
            'Click OK only if you have saved your backup or want to start completely fresh.'
        );

        if (!doubleConfirm) {
            return;
        }

        console.log('Clearing all wallet data and starting new session...');

        // Stop mining if active
        if (this.isMining) {
            this.stopMining();
        }

        // Clear all wallet data from memory
        this.walletAddress = null;
        this.privateKey = null;
        this.balance = 0;
        this.transactions = [];
        this.hasSubscription = false;
        this.subscriptionId = null;
        this.subscriptionStartDate = null;
        this.isLocked = false;
        this.password = null;

        // Clear ALL localStorage data
        localStorage.clear();

        // Hide unlock screen
        this.hideUnlockScreen();

        // Reset UI to initial state
        this.updateUI();
        this.switchView('create');

        // Show terms again since we cleared everything
        this.showTermsOfUse();

        alert('✓ All data cleared successfully!\n\nStarting fresh session...');
    }

    // Create a new wallet using the blockchain API
    async createWallet() {
        try {
            console.log('Creating wallet...');
            const response = await this.fetchWithRetry(`${this.nodeUrl}/api/wallet/create`, {
                method: 'POST'
            }, 5); // Retry up to 5 times for wallet creation

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Wallet created:', data.address.substring(0, 20) + '...');

            this.walletAddress = data.address;
            this.privateKey = data.privateKey;
            this.balance = 0;
            this.transactions = [];
            this.isLocked = false; // Unlock the newly created wallet

            this.saveWallet();
            return {
                address: this.walletAddress,
                privateKey: this.privateKey
            };
        } catch (error) {
            console.error('Error creating wallet:', error);
            alert('Error connecting to blockchain. Make sure the blockchain node is running!\n\n' +
                  'If using the packaged app, make sure START-WALLET.bat is running.\n\n' +
                  'Otherwise run:\ncd node-backend\nnode node.js');
            return null;
        }
    }

    // Save wallet to localStorage with encryption
    saveWallet(password) {
        if (!password && !this.password) {
            // No password set - save unencrypted (for backward compatibility)
            const walletData = {
                address: this.walletAddress,
                privateKey: this.privateKey,
                hasSubscription: this.hasSubscription,
                subscriptionId: this.subscriptionId,
                subscriptionStartDate: this.subscriptionStartDate,
                encrypted: false
            };
            localStorage.setItem('biriliumBlockchainWallet', JSON.stringify(walletData));
            console.log('Wallet saved to localStorage (unencrypted)');
            return;
        }

        const passwordToUse = password || this.password;
        const encryptedPrivateKey = this.encryptPrivateKey(this.privateKey, passwordToUse);

        const walletData = {
            address: this.walletAddress,
            encryptedPrivateKey: encryptedPrivateKey,
            hasSubscription: this.hasSubscription,
            subscriptionId: this.subscriptionId,
            subscriptionStartDate: this.subscriptionStartDate,
            encrypted: true
        };

        localStorage.setItem('biriliumBlockchainWallet', JSON.stringify(walletData));
        this.password = passwordToUse;
        console.log('Wallet saved to localStorage (encrypted)');
    }

    // Export wallet backup
    exportWalletBackup() {
        if (this.isLocked) {
            return { success: false, message: 'Please unlock wallet first' };
        }

        const backupData = {
            version: '1.0',
            address: this.walletAddress,
            encryptedPrivateKey: this.password ? this.encryptPrivateKey(this.privateKey, this.password) : this.privateKey,
            encrypted: !!this.password,
            hasSubscription: this.hasSubscription,
            exportDate: new Date().toISOString()
        };

        const backupJson = JSON.stringify(backupData, null, 2);
        const blob = new Blob([backupJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `birilium-wallet-backup-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        return { success: true, message: 'Wallet backup exported successfully' };
    }

    // Import wallet backup
    async importWalletBackup(fileContent, password) {
        try {
            const backupData = JSON.parse(fileContent);

            if (!backupData.address) {
                return { success: false, message: 'Invalid backup file' };
            }

            let privateKey;
            if (backupData.encrypted) {
                if (!password) {
                    return { success: false, message: 'Password required for encrypted backup' };
                }
                privateKey = this.decryptPrivateKey(backupData.encryptedPrivateKey, password);
                if (!privateKey) {
                    return { success: false, message: 'Incorrect password' };
                }
            } else {
                privateKey = backupData.encryptedPrivateKey || backupData.privateKey;
            }

            this.walletAddress = backupData.address;
            this.privateKey = privateKey;
            this.hasSubscription = backupData.hasSubscription || false;
            this.subscriptionId = backupData.subscriptionId || null;
            this.subscriptionStartDate = backupData.subscriptionStartDate || null;
            this.isLocked = false;
            this.password = password;

            this.saveWallet(password);
            await this.syncWithBlockchain();
            this.updateUI();

            return { success: true, message: 'Wallet restored successfully' };
        } catch (error) {
            return { success: false, message: 'Failed to import backup: ' + error.message };
        }
    }

    // Sync wallet data with blockchain
    async syncWithBlockchain() {
        if (!this.walletAddress) return;

        try {
            // Get balance
            const balanceResponse = await fetch(`${this.nodeUrl}/api/balance/${this.walletAddress}`);
            if (balanceResponse.ok) {
                const balanceData = await balanceResponse.json();
                this.balance = balanceData.balance;

                // Get transactions
                const txResponse = await fetch(`${this.nodeUrl}/api/transactions/${this.walletAddress}`);
                if (txResponse.ok) {
                    const txData = await txResponse.json();
                    this.transactions = txData;
                }

                this.updateUI();
            }
        } catch (error) {
            console.error('Error syncing with blockchain:', error);
        }
    }

    // Update global supply information
    async updateGlobalSupply() {
        try {
            const response = await fetch(`${this.nodeUrl}/api/stats`);
            if (response.ok) {
                const stats = await response.json();

                const MAX_SUPPLY = 21000000; // 21 million BRL total supply
                const totalMined = stats.totalSupply || 0;
                const remaining = MAX_SUPPLY - totalMined;

                const totalSupplyEl = document.getElementById('totalSupply');
                const remainingSupplyEl = document.getElementById('remainingSupply');

                if (totalSupplyEl) {
                    totalSupplyEl.textContent = totalMined.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                }

                if (remainingSupplyEl) {
                    remainingSupplyEl.textContent = remaining.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                }
            }
        } catch (error) {
            console.error('Error fetching global supply:', error);
            // Show default values on error
            const totalSupplyEl = document.getElementById('totalSupply');
            const remainingSupplyEl = document.getElementById('remainingSupply');

            if (totalSupplyEl) totalSupplyEl.textContent = 'Offline';
            if (remainingSupplyEl) remainingSupplyEl.textContent = 'Offline';
        }
    }

    // Start real mining
    async startMining() {
        if (this.isMining) return;

        if (!this.walletAddress) {
            alert('Please create or connect to a wallet first!');
            return;
        }

        if (this.isLocked) {
            alert('Please unlock your wallet first!');
            return;
        }

        // ADMIN BYPASS: Check if admin credentials match environment variables
        const ADMIN_USERNAME = 'levi84';  // From .env
        const ADMIN_PASSWORD = '5384';    // From .env

        // If wallet address matches admin username format, grant unlimited mining
        const isAdmin = this.walletAddress && (
            this.walletAddress.includes(ADMIN_USERNAME) ||
            localStorage.getItem('biriliumAdminMode') === 'true'
        );

        if (isAdmin) {
            console.log('[ADMIN MODE] Unlimited mining enabled');
            this.hasSubscription = true;  // Grant premium access
        }

        // Check free mining limit for non-premium users - FETCH REAL-TIME DATA
        if (!this.hasSubscription && !isAdmin) {
            try {
                // Fetch current transactions from blockchain (not cached)
                const txResponse = await fetch(`${this.nodeUrl}/api/transactions/${this.walletAddress}`);
                if (txResponse.ok) {
                    const transactions = await txResponse.json();
                    let totalMined = 0;
                    transactions.forEach(tx => {
                        if (tx.toAddress === this.walletAddress && tx.fromAddress === null) {
                            totalMined += tx.amount;
                        }
                    });

                    if (totalMined >= 20) {
                        alert('Free mining limit reached (20 BRL)!\n\nUpgrade to Premium Mining Subscription to mine unlimited coins and create unlimited wallets.');
                        return;
                    }
                }
            } catch (error) {
                console.error('Error checking mining limit:', error);
                // Continue anyway if check fails
            }
        }

        // Test connection to node first
        try {
            const response = await fetch(`${this.nodeUrl}/api/stats`);
            if (!response.ok) {
                throw new Error('Cannot connect to blockchain node');
            }
        } catch (error) {
            alert('Cannot connect to blockchain node!\n\nMake sure the node is running:\n1. Open terminal\n2. cd birilium-coin\n3. node node.js');
            return;
        }

        this.isMining = true;
        this.addMiningLog('Mining started...');
        this.addMiningLog('Connected to Birilium blockchain network');
        this.updateMiningUI();

        const mineBlock = async () => {
            if (!this.isMining) return;

            // Check limit during mining for free users - FETCH REAL-TIME DATA
            if (!this.hasSubscription) {
                try {
                    // Fetch current transactions from blockchain (not cached)
                    const txResponse = await fetch(`${this.nodeUrl}/api/transactions/${this.walletAddress}`);
                    if (txResponse.ok) {
                        const transactions = await txResponse.json();
                        let totalMined = 0;
                        transactions.forEach(tx => {
                            if (tx.toAddress === this.walletAddress && tx.fromAddress === null) {
                                totalMined += tx.amount;
                            }
                        });

                        if (totalMined >= 20) {
                            this.addMiningLog('⚠️ Free mining limit reached (20 BRL)');
                            this.addMiningLog('Upgrade to Premium to mine unlimited!');
                            this.stopMining();
                            alert('Free mining limit reached (20 BRL)!\n\nUpgrade to Premium Mining Subscription to mine unlimited coins.');
                            return;
                        }
                    }
                } catch (error) {
                    console.error('Error checking mining limit during mining:', error);
                    // Continue mining if check fails
                }
            }

            try {
                this.addMiningLog('Mining new block... (this may take 15-30 seconds)');

                const response = await fetch(`${this.nodeUrl}/api/mine`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ minerAddress: this.walletAddress })
                });

                const data = await response.json();

                if (data.success) {
                    this.addMiningLog(`✓ Block mined successfully!`);
                    this.addMiningLog(`Reward: ${data.reward} BRL`);
                    this.addMiningLog(`Block hash: ${data.block.hash.substring(0, 20)}...`);
                    this.addMiningLog(`Nonce: ${data.block.nonce}`);

                    await this.syncWithBlockchain();
                } else {
                    this.addMiningLog(`Mining failed: ${data.error}`);
                }
            } catch (error) {
                this.addMiningLog(`Error: ${error.message}`);
                console.error('Mining error:', error);
            }

            // Mine next block after delay
            if (this.isMining) {
                const delay = this.hasSubscription ? 5000 : 10000; // Faster with subscription
                setTimeout(mineBlock, delay);
            }
        };

        // Start first mining operation
        mineBlock();
    }

    // Stop mining
    stopMining() {
        if (!this.isMining) return;

        this.isMining = false;
        this.addMiningLog('Mining stopped.');
        this.updateMiningUI();
    }

    // Add entry to mining log
    addMiningLog(message) {
        const logContent = document.getElementById('miningLogContent');
        if (!logContent) return;

        const entry = document.createElement('p');
        entry.className = 'log-entry';
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logContent.appendChild(entry);
        logContent.scrollTop = logContent.scrollHeight;
    }

    // Sign transaction client-side (SECURE)
    signTransaction(transaction) {
        const txHash = SHA256(
            transaction.fromAddress +
            transaction.toAddress +
            transaction.amount +
            transaction.fee +
            transaction.timestamp
        ).toString();

        const key = ec.keyFromPrivate(this.privateKey, 'hex');
        const sig = key.sign(txHash, 'base64');
        return sig.toDER('hex');
    }

    // Send coins via blockchain
    async sendCoins(recipientAddress, amount, note) {
        if (!this.walletAddress) {
            return { success: false, message: 'Please create a wallet first!' };
        }

        if (this.isLocked) {
            return { success: false, message: 'Please unlock your wallet first!' };
        }

        if (amount <= 0) {
            return { success: false, message: 'Amount must be greater than 0' };
        }

        if (!recipientAddress || recipientAddress.length < 10) {
            return { success: false, message: 'Invalid recipient address' };
        }

        if (recipientAddress === this.walletAddress) {
            return { success: false, message: 'Cannot send coins to yourself' };
        }

        // Calculate fee (approximate)
        const estimatedFee = amount * 0.001;
        const totalRequired = amount + estimatedFee;

        if (totalRequired > this.balance) {
            return { success: false, message: `Insufficient balance. Required: ${totalRequired.toFixed(4)} BRL (including ${estimatedFee.toFixed(4)} BRL fee), Available: ${this.balance.toFixed(4)} BRL` };
        }

        try {
            // Create transaction object
            const transaction = {
                fromAddress: this.walletAddress,
                toAddress: recipientAddress,
                amount: amount,
                fee: estimatedFee,
                timestamp: Date.now()
            };

            // Sign transaction CLIENT-SIDE (private key never leaves wallet)
            transaction.signature = this.signTransaction(transaction);

            // Send SIGNED transaction (no private key sent)
            const response = await fetch(`${this.nodeUrl}/api/transaction/signed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(transaction)
            });

            const data = await response.json();

            if (data.success) {
                await this.syncWithBlockchain();
                return { success: true, message: `Transaction submitted! Fee: ${data.fee.toFixed(4)} BRL. Waiting for mining confirmation.` };
            } else {
                return { success: false, message: data.error || 'Transaction failed' };
            }
        } catch (error) {
            return { success: false, message: `Network error: ${error.message}. Make sure the blockchain node is running.` };
        }
    }

    // Generate QR code for wallet address
    async generateQRCode() {
        if (!this.walletAddress) return;

        try {
            const qrCodeDiv = document.getElementById('qrCode');
            if (qrCodeDiv) {
                qrCodeDiv.innerHTML = ''; // Clear previous QR code
                const canvas = document.createElement('canvas');
                await QRCode.toCanvas(canvas, this.walletAddress, {
                    width: 200,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#ffffff'
                    }
                });
                qrCodeDiv.appendChild(canvas);
            }
        } catch (error) {
            console.error('Error generating QR code:', error);
        }
    }

    // Export transaction history
    exportTransactionHistory() {
        if (this.transactions.length === 0) {
            return { success: false, message: 'No transactions to export' };
        }

        const csvHeader = 'Date,Type,From,To,Amount,Block Hash\n';
        const csvRows = this.transactions.map(tx => {
            const date = new Date(tx.timestamp).toLocaleString();
            let type = 'Received';
            if (tx.fromAddress === null) type = 'Mining Reward';
            else if (tx.fromAddress === this.walletAddress) type = 'Sent';

            const from = tx.fromAddress || 'Network';
            const to = tx.toAddress;
            const amount = tx.amount.toFixed(4);
            const blockHash = tx.blockHash || 'Pending';

            return `"${date}","${type}","${from}","${to}","${amount}","${blockHash}"`;
        }).join('\n');

        const csv = csvHeader + csvRows;
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `birilium-transactions-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        return { success: true, message: 'Transaction history exported successfully' };
    }

    // Cancel subscription
    async cancelSubscription() {
        if (!this.hasSubscription || !this.subscriptionId) {
            alert('No active subscription found.');
            return;
        }

        const confirmed = confirm(
            'Are you sure you want to cancel your Premium subscription?\n\n' +
            'Your subscription will remain active until the end of the current billing period.\n\n' +
            'After cancellation:\n' +
            '• Mining limit will return to 20 BRL\n' +
            '• Only 1 wallet allowed\n\n' +
            'You can resubscribe at any time.'
        );

        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch(`${this.nodeUrl}/api/subscription/cancel`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    subscriptionId: this.subscriptionId,
                    walletAddress: this.walletAddress
                })
            });

            const result = await response.json();

            if (result.success) {
                this.hasSubscription = false;
                this.subscriptionId = null;
                this.saveWallet();
                this.updateUI();

                alert('✓ Subscription cancelled successfully!\n\nYour subscription will remain active until the end of the current billing period.');
            } else {
                alert('Failed to cancel subscription.\n\nError: ' + result.error + '\n\nPlease try again or contact support.');
            }
        } catch (error) {
            console.error('Error cancelling subscription:', error);
            alert('Failed to connect to server.\n\nPlease check your internet connection and try again.');
        }
    }

    // Update all UI elements
    updateUI() {
        // Show/hide lock button based on wallet state
        const lockBtn = document.getElementById('lockWalletBtn');
        if (lockBtn) {
            if (this.isLocked || !this.walletAddress) {
                lockBtn.classList.add('hidden');
            } else {
                lockBtn.classList.remove('hidden');
            }
        }

        // Update sidebar balance
        const sidebarBalance = document.getElementById('sidebarBalance');
        if (sidebarBalance) {
            if (this.isLocked && this.walletAddress) {
                sidebarBalance.textContent = 'Locked';
            } else {
                sidebarBalance.textContent = `${this.balance.toFixed(2)} BRL`;
            }
        }

        // Update manage view
        const totalBalance = document.getElementById('totalBalance');
        if (totalBalance) {
            if (this.isLocked && this.walletAddress) {
                totalBalance.textContent = 'Locked';
            } else {
                totalBalance.textContent = `${this.balance.toFixed(2)} BRL`;
            }
        }

        // Update full wallet address in manage view
        const manageWalletAddressFull = document.getElementById('manageWalletAddressFull');
        if (manageWalletAddressFull) {
            manageWalletAddressFull.value = this.walletAddress || '';
        }

        // Update secret key in manage view
        const manageSecretKey = document.getElementById('manageSecretKey');
        if (manageSecretKey) {
            manageSecretKey.value = this.privateKey || '';
        }

        // Calculate totals from transactions
        let totalReceived = 0;
        let totalSent = 0;

        this.transactions.forEach(tx => {
            if (tx.toAddress === this.walletAddress) {
                totalReceived += tx.amount;
            }
            if (tx.fromAddress === this.walletAddress) {
                totalSent += tx.amount;
            }
        });

        const totalReceivedEl = document.getElementById('totalReceived');
        if (totalReceivedEl) {
            totalReceivedEl.textContent = `${totalReceived.toFixed(2)} BRL`;
        }

        const totalSentEl = document.getElementById('totalSent');
        if (totalSentEl) {
            totalSentEl.textContent = `${totalSent.toFixed(2)} BRL`;
        }

        const txCountEl = document.getElementById('txCount');
        if (txCountEl) {
            txCountEl.textContent = this.transactions.length;
        }

        // Update receive address and QR code
        if (this.walletAddress) {
            const receiveAddress = document.getElementById('receiveAddress');
            if (receiveAddress) {
                receiveAddress.value = this.walletAddress;
            }
            this.generateQRCode();
        }

        // Update transaction list
        this.updateTransactionList();

        // Update subscription status and cancel button
        const subscriptionStatus = document.getElementById('subscriptionStatus');
        const subscriptionRenewalDate = document.getElementById('subscriptionRenewalDate');
        const cancelSubscriptionBtn = document.getElementById('cancelSubscriptionBtn');

        if (this.hasSubscription) {
            if (subscriptionStatus) {
                subscriptionStatus.textContent = '✓ Active Premium Subscription';
                subscriptionStatus.style.color = '#28a745';
            }

            // Calculate and display next renewal date
            if (subscriptionRenewalDate && this.subscriptionStartDate) {
                const startDate = new Date(this.subscriptionStartDate);
                const today = new Date();

                // Calculate next renewal date (monthly subscription)
                const nextRenewal = new Date(startDate);

                // Add months until we get a future date
                while (nextRenewal <= today) {
                    nextRenewal.setMonth(nextRenewal.getMonth() + 1);
                }

                const daysUntilRenewal = Math.ceil((nextRenewal - today) / (1000 * 60 * 60 * 24));
                const renewalDateStr = nextRenewal.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                subscriptionRenewalDate.textContent = `Next billing: ${renewalDateStr} (${daysUntilRenewal} days)`;
                subscriptionRenewalDate.classList.remove('hidden');
            }

            if (cancelSubscriptionBtn) {
                cancelSubscriptionBtn.classList.remove('hidden');
            }
        } else {
            if (subscriptionStatus) {
                subscriptionStatus.textContent = 'No active subscription';
                subscriptionStatus.style.color = '#6c757d';
            }
            if (subscriptionRenewalDate) {
                subscriptionRenewalDate.classList.add('hidden');
            }
            if (cancelSubscriptionBtn) {
                cancelSubscriptionBtn.classList.add('hidden');
            }
        }

        this.updateMiningUI();
    }

    // Update mining UI
    updateMiningUI() {
        const miningStatus = document.getElementById('miningStatus');
        if (miningStatus) {
            miningStatus.textContent = this.isMining ? 'Active' : 'Inactive';
            miningStatus.className = this.isMining ? 'status-active' : 'status-inactive';
        }

        // Update button visibility based on mining status
        const startMiningBtn = document.getElementById('startMiningBtn');
        const stopMiningBtn = document.getElementById('stopMiningBtn');
        if (startMiningBtn && stopMiningBtn) {
            if (this.isMining) {
                startMiningBtn.classList.add('hidden');
                stopMiningBtn.classList.remove('hidden');
            } else {
                startMiningBtn.classList.remove('hidden');
                stopMiningBtn.classList.add('hidden');
            }
        }

        // Simulated hashrate display
        const hashrate = this.isMining ? (this.hasSubscription ? 50000 : 5000) + Math.random() * 10000 : 0;
        const hashrateEl = document.getElementById('hashrate');
        if (hashrateEl) {
            hashrateEl.textContent = `${hashrate.toFixed(2)} H/s`;
        }

        // Calculate total mined
        let totalMined = 0;
        this.transactions.forEach(tx => {
            if (tx.toAddress === this.walletAddress && tx.fromAddress === null) {
                totalMined += tx.amount;
            }
        });

        const coinsMinedEl = document.getElementById('coinsMined');
        if (coinsMinedEl) {
            coinsMinedEl.textContent = `${totalMined.toFixed(4)} BRL`;
        }
    }

    // Update transaction list
    updateTransactionList() {
        const txList = document.getElementById('transactionList');
        if (!txList) return;

        if (this.transactions.length === 0) {
            txList.innerHTML = '<p class="no-transactions">No transactions yet</p>';
            return;
        }

        txList.innerHTML = '';
        this.transactions.slice(0, 10).forEach(tx => {
            const txItem = document.createElement('div');

            let txType = 'received';
            let txLabel = 'Received';
            let txDetails = '';
            let amountColor = '#28a745';
            let amountPrefix = '+';

            if (tx.fromAddress === null && tx.toAddress === this.walletAddress) {
                txType = 'mined';
                txLabel = 'Mining Reward';
                amountColor = '#ffc107';
            } else if (tx.fromAddress === this.walletAddress) {
                txType = 'sent';
                txLabel = 'Sent';
                amountColor = '#dc3545';
                amountPrefix = '-';
                txDetails = `To: ${tx.toAddress.substring(0, 20)}...`;
            } else {
                txDetails = `From: ${tx.fromAddress.substring(0, 20)}...`;
            }

            txItem.className = `tx-item ${txType}`;
            const date = new Date(tx.timestamp).toLocaleString();

            txItem.innerHTML = `
                <div>
                    <strong>${txLabel}</strong><br>
                    ${txDetails}<br>
                    <small>${date}</small>
                </div>
                <div style="text-align: right; color: ${amountColor};">
                    <strong>${amountPrefix}${tx.amount.toFixed(4)} BRL</strong>
                </div>
            `;

            txList.appendChild(txItem);
        });
    }

    // Initialize event listeners
    initializeEventListeners() {
        console.log('Initializing event listeners...');

        // Terms of Use checkbox and accept button
        const agreeCheckbox = document.getElementById('agreeCheckbox');
        const acceptTermsBtn = document.getElementById('acceptTermsBtn');

        if (agreeCheckbox && acceptTermsBtn) {
            agreeCheckbox.addEventListener('change', () => {
                acceptTermsBtn.disabled = !agreeCheckbox.checked;
                console.log('Terms checkbox changed:', agreeCheckbox.checked);
            });

            acceptTermsBtn.addEventListener('click', () => {
                console.log('Terms accept button clicked');
                this.acceptTerms();
            });

            // DEBUG: Auto-accept after 30 seconds if user is stuck
            setTimeout(() => {
                const termsAccepted = localStorage.getItem('biriliumTermsAccepted');
                const termsOverlay = document.getElementById('termsOverlay');
                if (!termsAccepted && termsOverlay && termsOverlay.style.display !== 'none') {
                    console.warn('Terms modal still showing after 30s - auto-accepting for better UX');
                    this.acceptTerms();
                }
            }, 30000);
        }

        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                console.log('Switching to view:', view);
                this.switchView(view);
            });
        });

        // Unlock wallet
        const unlockBtn = document.getElementById('unlockWalletBtn');
        if (unlockBtn) {
            unlockBtn.addEventListener('click', () => {
                const password = document.getElementById('unlockPassword').value;
                if (!password) {
                    alert('Please enter your password');
                    return;
                }
                const result = this.unlockWallet(password);
                if (result.success) {
                    document.getElementById('unlockPassword').value = '';
                } else {
                    alert(result.message);
                }
            });
        }

        // Lock wallet
        const lockWalletBtn = document.getElementById('lockWalletBtn');
        if (lockWalletBtn) {
            lockWalletBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to lock your wallet?')) {
                    this.lockWallet();
                }
            });
        }

        // New Session button (clear all data)
        const newSessionBtn = document.getElementById('newSessionBtn');
        if (newSessionBtn) {
            newSessionBtn.addEventListener('click', () => {
                this.clearAllData();
            });
        }

        // Generate Wallet
        const generateWalletBtn = document.getElementById('generateWalletBtn');
        if (generateWalletBtn) {
            generateWalletBtn.addEventListener('click', async () => {
                console.log('Generate wallet button clicked');

                // Check if user already has a wallet and doesn't have subscription
                if (this.walletAddress && !this.hasSubscription) {
                    alert('Free Wallet Limit Reached!\n\nYou already have 1 wallet.\n\nOnly with a Premium subscription can you create more than one wallet.\n\nPlease disconnect your current wallet or upgrade to Premium.');
                    return;
                }

                const wallet = await this.createWallet();
                if (wallet) {
                    document.getElementById('walletAddress').value = wallet.address;
                    document.getElementById('secretKey').value = wallet.privateKey;
                    document.getElementById('walletDetails').classList.remove('hidden');
                    document.getElementById('passwordSection').classList.remove('hidden');
                    this.updateUI();
                }
            });
        }

        // Confirm Save with password
        const confirmSaveBtn = document.getElementById('confirmSaveBtn');
        if (confirmSaveBtn) {
            confirmSaveBtn.addEventListener('click', () => {
                const password = document.getElementById('walletPassword').value;
                const confirmPassword = document.getElementById('confirmPassword').value;

                if (password && password !== confirmPassword) {
                    alert('Passwords do not match!');
                    return;
                }

                if (password) {
                    this.saveWallet(password);
                    this.isLocked = false;
                    alert('Wallet saved with password protection! Keep your password safe.');
                } else {
                    this.saveWallet();
                    alert('Wallet saved without password protection. Consider using a password for security!');
                }

                this.switchView('mine');
            });
        }

        // Export backup
        const exportBackupBtn = document.getElementById('exportBackupBtn');
        if (exportBackupBtn) {
            exportBackupBtn.addEventListener('click', () => {
                const result = this.exportWalletBackup();
                alert(result.message);
            });
        }

        // Import backup
        const importBackupBtn = document.getElementById('importBackupBtn');
        if (importBackupBtn) {
            importBackupBtn.addEventListener('click', () => {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.json';
                fileInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = async (event) => {
                            const password = prompt('Enter backup password (leave empty if not encrypted):');
                            const result = await this.importWalletBackup(event.target.result, password);
                            alert(result.message);
                        };
                        reader.readAsText(file);
                    }
                };
                fileInput.click();
            });
        }

        // Export transactions
        const exportTxBtn = document.getElementById('exportTransactionsBtn');
        if (exportTxBtn) {
            exportTxBtn.addEventListener('click', () => {
                const result = this.exportTransactionHistory();
                alert(result.message);
            });
        }

        // Disconnect wallet
        const disconnectBtn = document.getElementById('disconnectWalletBtn');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => {
                this.disconnectWallet();
            });
        }

        // Cancel subscription
        const cancelSubscriptionBtn = document.getElementById('cancelSubscriptionBtn');
        if (cancelSubscriptionBtn) {
            cancelSubscriptionBtn.addEventListener('click', () => {
                this.cancelSubscription();
            });
        }

        // Toggle secret key visibility
        const toggleSecretKeyBtn = document.getElementById('toggleSecretKeyBtn');
        const manageSecretKey = document.getElementById('manageSecretKey');
        if (toggleSecretKeyBtn && manageSecretKey) {
            toggleSecretKeyBtn.addEventListener('click', () => {
                if (manageSecretKey.type === 'password') {
                    manageSecretKey.type = 'text';
                    toggleSecretKeyBtn.textContent = '🙈 Hide';
                } else {
                    manageSecretKey.type = 'password';
                    toggleSecretKeyBtn.textContent = '👁️ Show';
                }
            });
        }

        // Mining controls
        const startMiningBtn = document.getElementById('startMiningBtn');
        if (startMiningBtn) {
            startMiningBtn.addEventListener('click', () => {
                console.log('Start mining button clicked');
                this.startMining();
                startMiningBtn.classList.add('hidden');
                document.getElementById('stopMiningBtn').classList.remove('hidden');
            });
        }

        const stopMiningBtn = document.getElementById('stopMiningBtn');
        if (stopMiningBtn) {
            stopMiningBtn.addEventListener('click', () => {
                console.log('Stop mining button clicked');
                this.stopMining();
                stopMiningBtn.classList.add('hidden');
                document.getElementById('startMiningBtn').classList.remove('hidden');
            });
        }

        // Send form
        const sendForm = document.getElementById('sendForm');
        if (sendForm) {
            sendForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                console.log('Send form submitted');
                const recipient = document.getElementById('recipientAddress').value;
                const amount = parseFloat(document.getElementById('sendAmount').value);
                const note = document.getElementById('sendNote').value;

                const result = await this.sendCoins(recipient, amount, note);
                alert(result.message);

                if (result.success) {
                    sendForm.reset();
                }
            });
        }

        // Create/Connect Wallet Tabs
        const createTabBtn = document.getElementById('createTabBtn');
        const connectTabBtn = document.getElementById('connectTabBtn');
        const createTabContent = document.getElementById('createTabContent');
        const connectTabContent = document.getElementById('connectTabContent');

        if (createTabBtn && connectTabBtn) {
            createTabBtn.addEventListener('click', () => {
                createTabBtn.classList.add('active');
                connectTabBtn.classList.remove('active');
                createTabContent.classList.remove('hidden');
                connectTabContent.classList.add('hidden');
            });

            connectTabBtn.addEventListener('click', () => {
                connectTabBtn.classList.add('active');
                createTabBtn.classList.remove('active');
                connectTabContent.classList.remove('hidden');
                createTabContent.classList.add('hidden');
            });
        }

        // Connect Wallet form
        const connectWalletForm = document.getElementById('connectWalletForm');
        if (connectWalletForm) {
            connectWalletForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const address = document.getElementById('connectAddress').value.trim();
                const secretKey = document.getElementById('connectSecretKey').value.trim();

                if (!address || !secretKey) {
                    alert('Please enter both wallet address and secret key.');
                    return;
                }

                // Check if user already has a wallet and doesn't have subscription
                if (this.walletAddress && !this.hasSubscription) {
                    alert('Free Wallet Limit Reached!\n\nYou already have 1 wallet.\n\nOnly with a Premium subscription can you create more than one wallet.\n\nPlease disconnect your current wallet or upgrade to Premium.');
                    return;
                }

                // Set wallet data
                this.walletAddress = address;
                this.privateKey = secretKey;
                this.isLocked = false;

                // Save to localStorage
                this.saveWallet();

                // Sync with blockchain
                this.syncWithBlockchain();

                alert('Connected to wallet successfully! Syncing with blockchain...');
                this.updateUI();
                this.switchView('manage');
                connectWalletForm.reset();
            });
        }

        console.log('Event listeners initialized successfully');
    }

    // Switch between views
    switchView(viewName) {
        // Update navigation buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.querySelector(`[data-view="${viewName}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }

        // Update views
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });
        const activeView = document.getElementById(`${viewName}-view`);
        if (activeView) {
            activeView.classList.add('active');
        }
    }
}

// Copy to clipboard function
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.select();
        document.execCommand('copy');
        alert('Copied to clipboard!');
    }
}

// Handle payment (simulation)
function handlePayment(method) {
    const methodName = method === 'credit-card' ? 'Credit Card' : 'PayPal';
    const confirmed = confirm(
        `This will open a ${methodName} payment window to process your $5.00 monthly subscription.\n\n` +
        `Note: Payment integration coming soon.`
    );

    if (confirmed) {
        setTimeout(() => {
            alert('Payment processed successfully! Your premium mining subscription is now active.');
            if (window.wallet) {
                window.wallet.hasSubscription = true;
                window.wallet.saveWallet();
                window.wallet.updateUI();

                const subscriptionStatus = document.getElementById('subscriptionStatus');
                if (subscriptionStatus) {
                    subscriptionStatus.textContent = '✓ Active Premium Subscription - Renews monthly';
                    subscriptionStatus.style.color = '#28a745';
                }
            }
        }, 1000);
    }
}

// Initialize wallet when page loads
let wallet;
window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Initializing wallet...');
    try {
        wallet = new BiriliumBlockchainWallet();
        window.wallet = wallet; // Make wallet accessible globally
        console.log('Wallet initialized and ready!');
    } catch (error) {
        console.error('Error initializing wallet:', error);
        alert('Error initializing wallet: ' + error.message);
    }
});

// Listen for debug logs from main process (if running in Electron)
if (typeof require !== 'undefined') {
    try {
        const { ipcRenderer } = require('electron');

        ipcRenderer.on('debug-log', (event, message) => {
            console.log('[MAIN PROCESS]', message);
        });

        ipcRenderer.on('node-log', (event, message) => {
            console.log('[NODE]', message);
        });

        ipcRenderer.on('node-error', (event, message) => {
            console.error('[NODE ERROR]', message);
        });
    } catch (e) {
        // Not in Electron context, ignore
    }
}

// Contact Modal Functionality
document.addEventListener('DOMContentLoaded', () => {
    const contactBtn = document.getElementById('contactBtn');
    const contactModal = document.getElementById('contactModal');
    const closeContactModal = document.getElementById('closeContactModal');
    const contactForm = document.getElementById('contactForm');
    const contactStatus = document.getElementById('contactStatus');

    // Open contact modal
    if (contactBtn) {
        contactBtn.addEventListener('click', () => {
            contactModal.classList.remove('hidden');
        });
    }

    // Close contact modal
    if (closeContactModal) {
        closeContactModal.addEventListener('click', () => {
            contactModal.classList.add('hidden');
            contactForm.reset();
            contactStatus.classList.add('hidden');
        });
    }

    // Close modal when clicking outside
    if (contactModal) {
        contactModal.addEventListener('click', (e) => {
            if (e.target === contactModal) {
                contactModal.classList.add('hidden');
                contactForm.reset();
                contactStatus.classList.add('hidden');
            }
        });
    }

    // Handle contact form submission
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('contactName').value;
            const phone = document.getElementById('contactPhone').value;
            const email = document.getElementById('contactEmail').value;
            const message = document.getElementById('contactMessage').value;

            contactStatus.classList.remove('hidden', 'success', 'error');
            contactStatus.textContent = 'Sending message...';

            try {
                // Send contact form data to backend
                const response = await fetch('http://localhost:3001/api/contact', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name,
                        phone,
                        email,
                        message,
                        timestamp: Date.now()
                    })
                });

                const result = await response.json();

                if (result.success) {
                    contactStatus.classList.add('success');
                    contactStatus.textContent = 'Message sent successfully! We\'ll get back to you soon.';
                    contactForm.reset();
                    setTimeout(() => {
                        contactModal.classList.add('hidden');
                        contactStatus.classList.add('hidden');
                    }, 3000);
                } else {
                    throw new Error(result.error || 'Failed to send message');
                }
            } catch (error) {
                console.error('Contact form error:', error);
                contactStatus.classList.add('error');
                contactStatus.textContent = 'Failed to send message. Please try again or email us directly at biriliumcoin@gmail.com';
            }
        });
    }
});
