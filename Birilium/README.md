# Birilium Wallet - Desktop Cryptocurrency Wallet

A secure desktop wallet for the Birilium cryptocurrency with integrated blockchain node and mining capabilities.

## Features

- **Integrated Blockchain Node** - Run your own full node directly from the wallet
- **Secure Wallet Management** - Create and manage multiple wallets with BIP39 mnemonic support
- **Built-in Mining** - Mine Birilium coins directly from the wallet interface
- **Transaction Management** - Send and receive BRL with secure transaction signing
- **Real-time Balance Updates** - Monitor your wallet balance and transaction history
- **P2P Network** - Connect to the Birilium network and sync the blockchain
- **Optional MongoDB Support** - Persistent blockchain storage (falls back to memory-only mode)

## System Requirements

### Required
- **Node.js** v16.0.0 or higher ([Download here](https://nodejs.org/))
- **Operating System**: Windows 10/11, macOS 10.13+, or Linux
- **RAM**: Minimum 2GB (4GB+ recommended)
- **Disk Space**: 500MB+ for wallet and dependencies

### Optional
- **MongoDB** v4.0+ for persistent blockchain storage (wallet works without it in memory-only mode)

## Quick Start

### Windows

1. **Download** the Birilium wallet from GitHub
2. **Extract** the ZIP file to your desired location
3. **Run** `START-WALLET.bat`
4. The wallet will:
   - Check if Node.js is installed
   - Automatically install all dependencies
   - Start the integrated blockchain node
   - Open the wallet interface

That's it! The wallet is ready to use.

### macOS / Linux

1. **Download** and extract the Birilium wallet
2. **Open Terminal** in the wallet directory
3. **Make the script executable** (first time only):
   ```bash
   chmod +x START-WALLET.sh
   ```
4. **Run the wallet**:
   ```bash
   ./START-WALLET.sh
   ```

## First Time Setup

### What Happens Automatically

The first time you run `START-WALLET.bat`, it will automatically:

1. ✅ Check for Node.js installation
2. ✅ Install wallet dependencies (`npm install` in `wallet/`)
3. ✅ Install blockchain node dependencies (`npm install` in `wallet/node-backend/`)
4. ✅ Start the integrated blockchain node
5. ✅ Launch the wallet interface

**Total setup time**: ~2-5 minutes depending on your internet speed

### Manual Installation (Advanced Users)

If you prefer to install dependencies manually:

```bash
# Install wallet dependencies
cd wallet
npm install

# Install node-backend dependencies
cd node-backend
npm install
cd ../..

# Start the wallet
cd wallet
npm start
```

## Configuration (Optional)

The wallet works out-of-the-box with default settings. For advanced configuration:

1. Navigate to `wallet/node-backend/`
2. Copy `.env.example` to `.env`
3. Edit `.env` to customize:
   - API ports
   - MongoDB connection (if using persistent storage)
   - PayPal credentials (if using subscription features)
   - Network peers
   - Security settings

### Example Configuration

```env
# Server Configuration
HTTP_PORT=3001
P2P_PORT=6001

# Database (Optional - leave blank for memory-only mode)
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=birilium

# Security
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password_here
```

## Using the Wallet

### Creating a New Wallet

1. Click **"Create New Wallet"**
2. **Save your recovery phrase** (12/24 words) - This is crucial!
3. Set a strong password
4. Your wallet address will be generated

⚠️ **IMPORTANT**: Store your recovery phrase in a safe place. If you lose it, you cannot recover your funds!

### Receiving Birilium

1. Click **"Receive"**
2. Copy your wallet address or scan the QR code
3. Share it with the sender

### Sending Birilium

1. Click **"Send"**
2. Enter recipient address
3. Enter amount
4. Review transaction details
5. Confirm and sign the transaction

### Mining

1. Click **"Mine"** tab
2. Enter your wallet address
3. Click **"Start Mining"**
4. Mining rewards will be sent to your address

## Troubleshooting

### Node.js Not Found

**Error**: "Node.js is not installed!"

**Solution**: Download and install Node.js from https://nodejs.org/

### Port Already in Use

**Error**: "address already in use :::3001"

**Solution**: 
1. Close any other instances of the wallet
2. Check if another application is using port 3001
3. Or change the port in `wallet/node-backend/.env`

### MongoDB Connection Failed

**Error**: "MongoDB connection failed"

**Solution**: This is normal if you don't have MongoDB installed. The wallet will automatically run in memory-only mode.

To install MongoDB (optional):
- Windows: https://www.mongodb.com/try/download/community
- macOS: `brew install mongodb-community`
- Linux: `sudo apt-get install mongodb`

### Dependencies Installation Failed

**Error**: "Failed to install dependencies"

**Solution**:
1. Check your internet connection
2. Manually run: `cd wallet && npm install`
3. Then run: `cd node-backend && npm install`

## Security Best Practices

1. ✅ **Never share your private key or recovery phrase**
2. ✅ **Use strong, unique passwords**
3. ✅ **Keep your wallet software updated**
4. ✅ **Backup your recovery phrase in multiple secure locations**
5. ✅ **Don't store large amounts on a single wallet**
6. ✅ **Enable 2FA if available**
7. ✅ **Verify recipient addresses before sending**

## Network Information

- **Blockchain Explorer**: (Coming soon)
- **P2P Port**: 6001
- **HTTP API**: http://localhost:3001
- **Block Time**: ~30 seconds
- **Mining Difficulty**: Adjusts automatically

## Building from Source (Developers)

### Build Executable

To create distributable executables:

```bash
cd wallet

# Build for current platform
npm run build

# Build for specific platform
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux

# Build for all platforms
npm run build:all
```

Executables will be in `wallet/dist/`

## Support & Community

- **GitHub Issues**: Report bugs and request features
- **Documentation**: (Link to docs)
- **Community Discord**: (Link to Discord)
- **Email Support**: support@birilium.com

## License

MIT License - See LICENSE file for details

## Contributing

Contributions are welcome! Please read CONTRIBUTING.md for guidelines.

## Changelog

### Version 1.0.0
- Initial release
- Integrated blockchain node
- Wallet creation and management
- Send/receive transactions
- Built-in mining
- P2P network support
- Optional MongoDB persistence

---

**Made with ❤️ by the Birilium Team**
