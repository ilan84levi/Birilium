# Birilium Wallet - Desktop Application

Desktop wallet for managing Birilium (BRL) cryptocurrency.

## What This Is

This is the **wallet application** that users download to interact with the Birilium blockchain. It provides:

- 💼 **Wallet Management** - Create and manage wallets
- 🔒 **Password Protection** - AES-256 encryption for private keys
- 🔑 **Key Storage** - Securely store encrypted private keys
- 📥 **Backup/Recovery** - Export and import wallet backups
- ⛏️ **Mining** - Mine Birilium coins with real-time stats
- 💸 **Transactions** - Send and receive BRL with fee calculation
- 📊 **Balance Tracking** - View real-time balance
- 📜 **History** - View and export transaction history
- 🎫 **QR Codes** - Automatic QR code generation for addresses
- ⭐ **Subscriptions** - Premium mining features

## Quick Start

### Installation

```bash
npm install
```

### Run Wallet

**Important:** Make sure a Birilium blockchain node is running first!

```bash
npm start
```

The wallet will open as a desktop application.

## Features

### 1. Create Wallet
- Generates cryptographically secure key pairs
- Provides public address (share this to receive coins)
- Provides private key (NEVER share this!)
- Uses secp256k1 elliptic curve cryptography

### 2. Mine Coins
- Connect to blockchain network
- Mine real blocks using proof-of-work
- Earn 10 BRL per block mined
- View mining stats in real-time

### 3. Manage Wallet
- View total balance
- See all transactions (sent/received/mined)
- Track wallet statistics
- Monitor network activity

### 4. Send & Receive
- Send BRL to any address
- Automatic fee calculation (0.1% + minimum 0.0001 BRL)
- Transactions are signed with your private key
- Share your address to receive coins
- QR code automatically generated for your address
- Export transaction history to CSV

### 5. Premium Mining
- Subscribe for $5/month
- Faster mining speed
- Priority transaction processing
- Reduced network fees

## Configuration

By default, the wallet connects to:
```
Blockchain Node: http://localhost:3001
```

To connect to a different node, edit `renderer-wallet.js`:
```javascript
this.nodeUrl = 'http://your-node-url:3001';
```

## Building Distribution Packages

### Windows
```bash
npm run build
```
Creates: `dist/Birilium Wallet Setup.exe`

### Mac
```bash
npm run build
```
Creates: `dist/Birilium Wallet.dmg`

### Linux
```bash
npm run build
```
Creates: `dist/Birilium Wallet.AppImage`

## Architecture

```
Wallet Application
├── Electron (Desktop framework)
├── UI Layer (HTML/CSS)
├── Business Logic (renderer-wallet.js)
└── API Communication
    └── Connects to blockchain node via HTTP
```

## Security

### What's Secure:
- ✅ Private keys generated using industry-standard crypto (secp256k1)
- ✅ AES-256 encryption for private keys
- ✅ Password protection with secure unlock mechanism
- ✅ Encrypted wallet backups
- ✅ Transactions signed locally (keys never transmitted)
- ✅ Cryptographic validation
- ✅ Wallet lock/unlock functionality
- ✅ Comprehensive error handling

### What Needs Improvement:
- ⚠️ No hardware wallet support
- ⚠️ No multi-signature support
- ⚠️ No biometric authentication

### For Production:
1. Add hardware wallet support (Ledger/Trezor)
2. Multi-signature wallet functionality
3. Biometric authentication (fingerprint/face)
4. Auto-lock timer
5. Code signing for distribution packages

## User Guide

### First Time Setup:

1. **Start Blockchain Node**
   ```bash
   cd ../birilium-coin
   node node.js
   ```

2. **Start Wallet**
   ```bash
   npm start
   ```

3. **Create Wallet**
   - Click "Create Wallet"
   - **IMPORTANT:** Copy and save your private key in a safe place!
   - Set a strong password (optional but recommended)
   - Never share your private key with anyone
   - If you lose it, you lose access to your coins forever
   - Use "Export Backup" to save an encrypted backup file

4. **Start Mining**
   - Click "Mine Coins"
   - Click "Start Mining"
   - Wait 15-30 seconds per block
   - Watch your balance grow!

5. **Send Coins**
   - Go to "Send & Receive"
   - Enter recipient address
   - Enter amount
   - Click "Send Coins"
   - Transaction will be confirmed in next block

### Tips:

- **Backup Your Keys**: Store private key offline in multiple secure locations
- **Test Small Amounts First**: Send small test transactions before large ones
- **Keep Node Running**: Wallet needs blockchain node to function
- **Monitor Balance**: Balance updates every 5 seconds

## Troubleshooting

### Wallet Won't Connect
- Ensure blockchain node is running on port 3001
- Check firewall settings
- Verify network connection

### Mining Not Working
- Ensure wallet is created first
- Check if blockchain node is responding
- Verify you have an active internet connection

### Balance Not Updating
- Wait for blockchain sync (5 second interval)
- Refresh the wallet
- Check node is online

## For Developers

### Project Structure:
```
birilium-wallet/
├── main.js                 # Electron main process
├── index.html              # UI structure
├── styles.css              # Styling
├── renderer-wallet.js      # Wallet logic
├── preload.js              # Electron preload script
└── package.json            # Dependencies
```

### Key Files:

- **main.js**: Creates Electron window
- **renderer-wallet.js**: Handles all wallet operations
- **index.html**: User interface
- **styles.css**: Visual design

### API Calls:

All blockchain interaction goes through REST API:
```javascript
// Create wallet
POST http://localhost:3001/api/wallet/create

// Mine block
POST http://localhost:3001/api/mine
Body: { minerAddress: "0x..." }

// Send transaction
POST http://localhost:3001/api/transaction
Body: { fromAddress, toAddress, amount, privateKey }

// Get balance
GET http://localhost:3001/api/balance/:address
```

## License

MIT
