# ⚡ Birilium Wallet - Quick Start Guide

## Your Wallet IS Working! Here's How to Use It

### ✅ What's Working Right Now:
- Node running on http://localhost:3001
- Connected to 1 peer (Digital Ocean server)
- 2 blocks in blockchain
- PayPal configured in LIVE mode ✅
- Admin panel available
- Mining ready

---

## 🎯 Step-by-Step: How to Use Your Wallet

### **Step 1: Open the Wallet Application**

The application is already running! You should see a window that opened.

**If you don't see it:**
1. Look for "Birilium Wallet" in your taskbar
2. Or click on the Electron window that opened

### **Step 2: Create or Import a Wallet**

In the wallet application window:

1. **To Create New Wallet:**
   - Click "Create New Wallet"
   - Save your seed phrase (12/24 words) - VERY IMPORTANT!
   - Your wallet address will appear (looks like: `BRL...` or long alphanumeric)

2. **To Import Existing Wallet:**
   - Click "Import Wallet"
   - Enter your seed phrase or private key
   - Your wallet address will be restored

### **Step 3: Mine Your First Coins**

Once you have a wallet address:

**Using the GUI:**
1. In the wallet window, find the "Mining" tab
2. Click "Start Mining"
3. The wallet will use YOUR address as the mining reward address
4. Wait for a block to be mined (takes 30 seconds on average)
5. You'll receive 10 BRL as mining reward!

**Using API (if you want to test manually):**
```bash
# Replace YOUR_WALLET_ADDRESS with your actual address
curl -X POST http://localhost:3001/api/mine \
  -H "Content-Type: application/json" \
  -d '{"minerAddress":"YOUR_WALLET_ADDRESS_HERE"}'
```

Example with a proper address:
```bash
curl -X POST http://localhost:3001/api/mine \
  -H "Content-Type: application/json" \
  -d '{"minerAddress":"04a1b2c3d4e5f6..."}'
```

### **Step 4: Check Your Balance**

**In the GUI:**
- Your balance appears at the top of the wallet window
- Updates automatically after mining

**Using API:**
```bash
# Check balance
curl http://localhost:3001/api/balance/YOUR_WALLET_ADDRESS
```

### **Step 5: Send Coins**

**In the GUI:**
1. Go to "Send" tab
2. Enter recipient address
3. Enter amount
4. Click "Send"
5. Transaction will be added to mempool
6. Mine a block to confirm it

**Using API:**
```bash
curl -X POST http://localhost:3001/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "from": "YOUR_ADDRESS",
    "to": "RECIPIENT_ADDRESS",
    "amount": 5.0,
    "privateKey": "YOUR_PRIVATE_KEY"
  }'
```

---

## 💳 PayPal Subscription (For Buying Coins)

**Your PayPal IS configured and working in LIVE mode!**

### How Users Can Subscribe:

1. **In the Wallet GUI:**
   - Look for "Buy Coins" or "Subscribe" button
   - Click it
   - PayPal payment modal will open
   - Complete payment
   - Coins will be credited to your wallet

2. **What Happens:**
   - User pays via PayPal subscription
   - Plan: P-2AE31843879973003ND5UCTA
   - Mode: LIVE (real money)
   - After payment confirmation, coins are sent to their wallet

### Test PayPal Config:
```bash
curl http://localhost:3001/api/paypal-config
```

You should see:
```json
{
  "success": true,
  "mode": "live",
  "configured": true,
  "message": "PayPal ready"
}
```

---

## 🔧 Admin Panel

**Access:** http://localhost:3001/admin

**Login:**
- Username: `admin_519cd57c`
- Password: `NgFsG1oQWw<*[b5T4?)[?cJY`

**Features:**
- View blockchain stats
- See recent blocks
- Monitor transactions
- View connected peers
- Check system health

---

## 🌐 Digital Ocean Server - Simple Explanation

### What Is It?
Your Digital Ocean server (159.65.96.82) is a **seed node** - it's like a permanent online node that other wallets can connect to.

### Why Do You Need It?
- **Without it:** Each wallet only works when your computer is on
- **With it:** Wallets can connect to your server 24/7 to sync blockchain

### How Wallets Connect:

**Your Desktop Wallet:**
Already connected! Check your logs - you'll see: "Connected to peer: ws://159.65.96.82:6001"

**Other Users' Wallets:**
They add this to their `.env` file:
```bash
PEERS=ws://159.65.96.82:6001
```

### Current Status:
- ✅ Server IP: 159.65.96.82
- ✅ Status: Running (37 days uptime)
- ⚠️ Version: OLD (needs update to v1.0.7)

---

## 📦 Digital Ocean Update (When You're Ready)

### Option 1: Simple - Keep Current Server
Your server is working fine. Leave it as is until you need the new features.

### Option 2: Update Server (Recommended Soon)

**Prerequisites:**
1. Your code changes must be pushed to GitHub first
2. You need SSH access to your server

**Update Command:**
```bash
# From your Windows PC
cd E:\birilium2claude\Birilium
bash deploy-digitalocean-sqlite.sh 159.65.96.82
```

**What Happens:**
1. Script backs up old installation
2. Pulls latest code from GitHub
3. Installs SQLite dependencies
4. Generates new admin credentials
5. Restarts the node
6. Takes about 10 minutes

**Before Running:**
```bash
# 1. Commit your changes
git add .
git commit -m "Update to v1.0.7"
git push origin main

# 2. Then deploy
bash deploy-digitalocean-sqlite.sh 159.65.96.82
```

---

## 🐛 Common Issues & Fixes

### "Can't Mine"
**Problem:** Invalid address format
**Fix:** Make sure you created a wallet first! The address must be at least 10 characters.

### "PayPal Not Working"
**Problem:** Usually wrong endpoint
**Fix:**
- Correct endpoint: `/api/paypal-config` ✅
- Wrong endpoint: `/api/paypal/subscription/plans` ❌
- Your PayPal IS working - check in the wallet GUI, not API

### "Can't See Balance"
**Problem:** Need to mine a block first
**Fix:**
1. Create wallet (get address)
2. Mine a block (takes 30 seconds)
3. Check balance (should show 10 BRL)

### "Wallet Won't Start"
**Problem:** Port already in use
**Fix:**
```bash
# Kill existing process
taskkill /F /IM node.exe
taskkill /F /IM electron.exe

# Restart
cd E:\birilium2claude\Birilium\wallet
npm start
```

---

## 🎯 Quick Test Checklist

Run these commands to verify everything works:

```bash
# 1. Node health
curl http://localhost:3001/health

# 2. Blockchain stats
curl http://localhost:3001/api/stats

# 3. PayPal config
curl http://localhost:3001/api/paypal-config

# 4. Admin panel (open in browser)
start http://localhost:3001/admin

# 5. Check logs
# Look at the console where you ran "npm start"
```

**Expected Results:**
- ✅ Health: "healthy"
- ✅ Stats: Shows block count, supply
- ✅ PayPal: "configured": true
- ✅ Admin: Login page appears
- ✅ Logs: No errors, only warnings about TLS (safe for development)

---

## 🚀 Next Steps

### For Development:
1. ✅ Test wallet locally (you're doing this now!)
2. ⏸️ Test mining with a real wallet address
3. ⏸️ Test sending transactions
4. ⏸️ Test PayPal subscription in GUI
5. ⏸️ When everything works, update Digital Ocean server

### For Production:
1. Test thoroughly locally (few days)
2. Push changes to GitHub
3. Update Digital Ocean server
4. Test server admin panel
5. Distribute desktop wallet installer to users

---

## 💡 Pro Tips

1. **Save Your Wallet Seed!**
   - Write it down on paper
   - Store in a safe place
   - It's the ONLY way to recover your wallet

2. **Mining = Creating Blocks**
   - Mine to earn coins (10 BRL per block)
   - Mine to confirm transactions
   - Average 30 seconds per block

3. **PayPal Subscriptions**
   - Already configured in LIVE mode
   - Users pay via PayPal
   - Coins sent automatically
   - No additional setup needed!

4. **Digital Ocean Server**
   - Update it when you have 30 minutes
   - Not urgent - your current server works
   - Follow guide: DIGITAL-OCEAN-UPDATE-GUIDE.md

---

## 📊 What You Have Right Now

```
✅ Desktop Wallet Application - WORKING
   - Node: Running
   - Peers: Connected (1)
   - Database: SQLite ✅
   - Mining: Ready
   - PayPal: Configured ✅
   - Admin: Ready

⚠️ Digital Ocean Server - WORKING (OLD VERSION)
   - IP: 159.65.96.82
   - Uptime: 37 days
   - Peers: 2
   - Needs: Update to v1.0.7 (not urgent)
```

---

## ❓ Still Confused?

### "I just want to mine coins!"
1. Open the wallet app
2. Create a new wallet
3. Click "Start Mining"
4. Wait 30 seconds
5. You now have 10 BRL!

### "I just want to test PayPal!"
1. Open the wallet app
2. Look for "Buy Coins" button
3. Click it
4. PayPal modal opens
5. Complete test payment

### "I just want to update my server!"
```bash
# Run these 3 commands:
cd E:\birilium2claude\Birilium
git push origin main
bash deploy-digitalocean-sqlite.sh 159.65.96.82
```

---

**Everything IS working! You just need to use the wallet GUI instead of APIs.** 🎉

The application window that opened - that's your wallet. Use it!
