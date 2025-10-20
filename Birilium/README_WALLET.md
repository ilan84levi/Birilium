# Birilium One-Click Mining Wallet

**🎉 Fully Decentralized & Public - No API Keys Required!**

**All-in-One Solution**: Wallet + Node + Mining = Ready to Go!

## 🌟 What's Special About Birilium

- ✅ **Truly Decentralized** - No registration, no API keys, no central authority
- ✅ **Public Mining** - Anyone can mine, no permission needed
- ✅ **Open Source** - Full transparency, inspect all code
- ✅ **One-Click Setup** - Download and start mining in minutes

## What's Included

This package includes EVERYTHING you need to start mining Birilium coins:

1. **Blockchain Node** - Full node that validates transactions and mines blocks (PUBLIC - no API key)
2. **Desktop Wallet** - Beautiful UI to manage your coins
3. **Integrated Mining** - Mine directly from the wallet with one click (PUBLIC - no API key)
4. **Auto-Start** - Node starts automatically when you open the wallet
5. **Global Supply Tracker** - See how many coins have been mined globally

## Quick Start (Windows)

### Option 1: Run from Source

1. **Install Requirements**
   - Download and install [Node.js 18+](https://nodejs.org/)
   - Restart your computer after installation

2. **Install Dependencies**
   ```bash
   # Open PowerShell or Command Prompt
   cd path\to\Birilium
   npm install
   ```

3. **Start the Wallet**
   ```bash
   npm start
   ```

4. **Start Mining!**
   - Create a new wallet (save your secret key!)
   - Click "Start Mining" button
   - Watch your balance grow!

### Option 2: Install from Package (Coming Soon)

Download `Birilium-Wallet-Setup.exe` and double-click to install.

## Features

### Wallet Features
- Create unlimited wallets
- Send and receive BRL coins
- View transaction history
- Export/import wallet with secret key
- Encrypted local storage

### Mining Features
- **One-click mining** - No complicated setup
- **Auto-mining** - Continuously mines in background
- **Real rewards** - Earn 10 BRL per block mined
- **Difficulty adjustment** - Network automatically balances
- **Mining stats** - See your hashrate and earnings

### Node Features (Runs Automatically)
- Full blockchain validation
- P2P networking with other nodes
- Mempool transaction management
- REST API for wallet communication
- Automatic blockchain sync

## Mining Rewards

| Action | Reward |
|--------|--------|
| Mine a block | 10 BRL |
| Transaction fee | 0.1% of amount |

**Free Mining Limit**: 20 BRL (then upgrade to Premium)

**Premium Subscription** ($5/month):
- ✅ **Mine Unlimited Coins** (Free users: 20 BRL limit)
- ✅ **Create Unlimited Wallets** (Free users: 1 wallet only)

## How Mining Works

1. **Your wallet creates a mining address**
2. **The node searches for valid blocks** (Proof of Work)
3. **When a block is found**, you get the reward (10 BRL)
4. **Blocks are added to the blockchain** every ~30 seconds
5. **Other nodes validate** your block

Mining difficulty automatically adjusts based on network hashrate to maintain consistent block times.

## Configuration

### Environment Variables

Create a `.env` file in the `Birilium` folder:

```bash
# Ports (change if already in use)
HTTP_PORT=3001
P2P_PORT=6001

# Connect to other nodes (optional)
PEERS=ws://node1.birilium.com:6001,ws://node2.birilium.com:6001

# Enable TLS for P2P (recommended for production)
ENABLE_P2P_TLS=false

# Admin credentials (for analytics dashboard only)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_this_password_in_production

# MongoDB (optional - for analytics)
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=birilium

# PayPal (optional - for premium subscriptions)
PAYPAL_CLIENT_SECRET=your_paypal_secret_here
```

**Note:** API keys are NOT required for mining or transactions! They're only used for admin dashboard access.

### Advanced: Run Node Separately

If you want to run the node on a server and wallet on your PC:

**On Server:**
```bash
cd Birilium
node node.js
```

**On PC (in wallet folder):**
```bash
# Edit renderer-wallet.js
# Change this line:
this.nodeUrl = 'http://localhost:3001';
# To:
this.nodeUrl = 'http://your-server-ip:3001';
```

## Troubleshooting

### Node Won't Start

**Error: "Port 3001 already in use"**
- Solution: Change `HTTP_PORT` in `.env` file
- Or close other apps using port 3001

**Error: "Cannot find module"**
- Solution: Run `npm install` again
- Make sure you're in the correct directory

### Mining Not Working

**"Failed to connect to blockchain"**
- Solution: Make sure the node started successfully
- Check the console for node startup messages
- Node should show "BIRILIUM BLOCKCHAIN NODE" when ready

**"Free mining limit reached (20 BRL)"**
- Solution: You've mined 20 BRL on the free plan
- Upgrade to Premium subscription to mine unlimited coins

### Wallet Issues

**"Wallet not syncing"**
- Solution: Check your internet connection
- Make sure node is running
- Wait a few seconds for blockchain sync

**"Lost my secret key"**
- ⚠️ **Cannot be recovered!** Always save your secret key
- Solution: Create a new wallet (old funds are lost)

## System Requirements

### Minimum (for mining)
- **CPU**: 2 cores, 2.0+ GHz
- **RAM**: 4 GB
- **Disk**: 10 GB free space
- **OS**: Windows 10+, macOS 10.14+, Linux (Ubuntu 20.04+)
- **Network**: Broadband internet

### Recommended (for better mining)
- **CPU**: 4+ cores, 3.0+ GHz
- **RAM**: 8+ GB
- **Disk**: 20+ GB SSD
- **Network**: 100+ Mbps

## Security

### Wallet Security
- ✅ Client-side transaction signing (private keys never leave your computer)
- ✅ Encrypted local storage
- ✅ Password protected (coming soon)
- ✅ HD wallet support (BIP-39 mnemonic phrases)

### Network Security
- ✅ **Public Access** - No API keys required for mining/transactions (truly decentralized!)
- ✅ **Rate Limiting** - 30 mining requests/min, 100 API requests per 15 min
- ✅ **P2P Message Validation** - All peer messages validated
- ✅ **TLS/SSL Support** - P2P connections can be encrypted
- ✅ **DDoS Protection** - Mempool limits, block size limits, rate limiting
- 🔒 **Admin Operations** - Protected with username/password (analytics only)

**Important**:
- NEVER share your secret key with anyone
- NEVER send your secret key over email/chat
- Always backup your secret key in a secure location
- Use Premium subscription for production use

## Building from Source

### Prerequisites
- Node.js 18+
- npm 9+
- Git

### Build Steps

```bash
# Clone repository
git clone https://github.com/your-org/birilium.git
cd birilium

# Install node dependencies
cd Birilium
npm install

# Install wallet dependencies
cd ../birilium-wallet
npm install

# Build wallet executable
npm run build

# Output will be in birilium-wallet/dist/
```

### Build Outputs
- **Windows**: `Birilium-Wallet-Setup.exe`
- **macOS**: `Birilium-Wallet.dmg`
- **Linux**: `Birilium-Wallet.AppImage`

## Network Information

### Mainnet (Production)
- **Status**: ⚠️ Not yet launched (in testnet phase)
- **Consensus**: Proof of Work (SHA-256)
- **Block Time**: ~30 seconds
- **Block Reward**: 10 BRL
- **Max Supply**: 25,000,000,000 BRL
- **Difficulty**: Auto-adjusting (LWMA algorithm)

### Testnet (Current)
- **Status**: ✅ Active
- **Purpose**: Testing and development
- **Coins**: Test coins (no real value)

## Developer API

If you want to build apps on top of Birilium:

### Get Balance
```bash
curl http://localhost:3001/api/balance/YOUR_ADDRESS
```

### Send Transaction (No API Key Required!)
```bash
curl -X POST http://localhost:3001/api/transaction/signed \
  -H "Content-Type: application/json" \
  -d '{
    "fromAddress": "...",
    "toAddress": "...",
    "amount": 10,
    "fee": 0.01,
    "timestamp": 1234567890,
    "signature": "..."
  }'
```

### Mine Block (No API Key Required!)
```bash
curl -X POST http://localhost:3001/api/mine \
  -H "Content-Type: application/json" \
  -d '{"minerAddress": "YOUR_ADDRESS"}'
```

**Note:** Mining and transactions are PUBLIC - no authentication required! This is how a truly decentralized cryptocurrency should work.

**Full API documentation**: See `API_REFERENCE.md`

## Support

### Documentation
- `README.md` - Project overview
- `API_REFERENCE.md` - Complete API reference
- `CONSENSUS_SPEC.md` - Blockchain consensus specification
- `DEPLOYMENT_GUIDE.md` - Production deployment guide

### Community
- **Discord**: https://discord.gg/birilium (coming soon)
- **Telegram**: https://t.me/birilium (coming soon)
- **GitHub Issues**: https://github.com/your-org/birilium/issues

### FAQ

**Q: Is this real money?**
A: Currently testnet only. Mainnet launch requires security audit.

**Q: Can I mine on multiple computers?**
A: Yes! Just install on each computer with same wallet address.

**Q: How much can I earn?**
A: Depends on network difficulty and your CPU power. Free users can mine up to 20 BRL, then upgrade to Premium for unlimited mining.

**Q: Do I need to keep wallet open to mine?**
A: Yes, mining only works when wallet is running.

**Q: Can I mine on a server?**
A: Yes! Run the node on a server and connect wallet remotely.

## Roadmap

### Phase 1 (Completed ✅)
- ✅ Core blockchain
- ✅ Proof of Work mining
- ✅ P2P networking
- ✅ Desktop wallet
- ✅ Transaction signing
- ✅ Mining from wallet

### Phase 2 (Current)
- ✅ Security hardening
- ✅ Performance optimization
- ✅ Premium subscriptions
- ⏳ Security audit
- ⏳ Mainnet launch

### Phase 3 (Future)
- Mobile wallet (iOS/Android)
- Hardware wallet support
- Lightning Network (Layer 2)
- Smart contracts
- Decentralized exchange

## License

MIT License - See LICENSE file for details

## Credits

Built with:
- Node.js
- Electron
- Express.js
- MongoDB
- PayPal SDK
- elliptic (secp256k1)
- Argon2id (key derivation)

---

**Ready to start mining?**

1. `npm install`
2. `npm start`
3. Create wallet
4. Click "Start Mining"
5. Earn BRL coins!

**Need help?** Join our Discord community or check the troubleshooting section above.

---

**⚠️ IMPORTANT SECURITY NOTICE**

This is TESTNET software. Do not use for real financial transactions until:
1. Professional security audit is completed
2. Mainnet is officially launched
3. Network has 100+ active nodes

Always backup your secret key! Lost keys = lost coins (permanently).

---

**Version**: 2.1.0
**Last Updated**: 2025-01-11
**Status**: Testnet Active | Mainnet Pending Audit
