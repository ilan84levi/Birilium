# Birilium Quick Start Guide

Get mining in 5 minutes!

## Step 1: Install Node.js

Download and install Node.js 18+ from: https://nodejs.org/

**Windows**: Download the `.msi` installer and run it
**Mac**: Download the `.pkg` installer and run it
**Linux**: Use your package manager: `sudo apt install nodejs npm`

**Verify installation:**
```bash
node --version  # Should show v18.x.x or higher
npm --version   # Should show 9.x.x or higher
```

## Step 2: Install Dependencies

Open terminal/command prompt in the `Birilium` folder:

```bash
cd path/to/Birilium
npm install
```

This will download all required packages (~150 MB).

## Step 3: Start Mining!

### Option A: Double-Click (Windows)

Double-click `start-mining.bat`

### Option B: Command Line

```bash
# In Birilium folder
cd ..\birilium-wallet
npm install  # First time only
npm start
```

## Step 4: Create Wallet & Mine

1. **Wait for node to start** - Look for "Blockchain node started successfully" message
2. **Click "Create Wallet"** button
3. **IMPORTANT**: Save your secret key! Write it down or copy to a secure location
4. **Click "Start Mining"** button
5. **Watch your balance grow!** You'll earn 10 BRL per block mined

## Mining Tips

- **Free Plan**: Mine up to 10 BRL for free
- **Premium Plan** ($5/month): Unlimited mining + 2× speed
- **Keep wallet open**: Mining only works when wallet is running
- **First block**: Takes 15-30 seconds (depends on your CPU)
- **CPU usage**: Mining uses 100% of one CPU core

## Troubleshooting

### "Node won't start"

**Problem**: Port 3001 already in use

**Solution**:
1. Close other apps using port 3001
2. Or change port in `.env` file:
   ```
   HTTP_PORT=3002
   ```

### "Cannot find module"

**Problem**: Dependencies not installed

**Solution**:
```bash
cd Birilium
npm install
cd ../birilium-wallet
npm install
```

### "Mining not working"

**Problem**: Node not connected

**Solution**:
1. Check console for "BIRILIUM BLOCKCHAIN NODE" message
2. Wait 10-15 seconds for node startup
3. Restart wallet if needed

## Next Steps

- **Send coins**: Go to "Send" tab and transfer BRL to friends
- **View transactions**: Check "Manage" tab for transaction history
- **Upgrade to Premium**: Mine unlimited coins for $5/month
- **Run on server**: See `DEPLOYMENT_GUIDE.md` for production setup

## Security Reminders

⚠️ **NEVER share your secret key with anyone!**
⚠️ **Always backup your secret key before mining!**
⚠️ **Lost secret key = lost coins (permanently)**

## System Requirements

**Minimum**:
- CPU: 2 cores, 2 GHz
- RAM: 4 GB
- Disk: 10 GB free
- Internet: Broadband

**Recommended**:
- CPU: 4+ cores, 3 GHz
- RAM: 8+ GB
- Disk: 20+ GB SSD
- Internet: 100+ Mbps

## Support

- **Documentation**: See `README_WALLET.md`
- **API Reference**: See `API_REFERENCE.md`
- **Discord**: https://discord.gg/birilium (coming soon)

---

**Happy Mining!**

*Version 2.1.0 - Last updated: 2025-01-11*
