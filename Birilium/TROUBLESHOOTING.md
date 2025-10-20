# Birilium Wallet Troubleshooting Guide

## ❌ Issue: "npm start" Not Working

### Problem
When you run `npm start`, you get one of these errors:
- `Error: listen EADDRINUSE: address already in use :::3001`
- Port 3001 is already in use
- Wallet won't start

### Root Cause
There's already a blockchain node process running on port 3001. This happens when:
1. You previously started the wallet and it didn't close properly
2. You're running the node separately (`node node.js`)
3. The wallet crashed but the node process kept running

### Solution

#### Step 1: Kill the Process Using Port 3001

**Windows (PowerShell or CMD):**
```bash
# Find the process ID
netstat -ano | findstr :3001

# Look for the PID in the last column of the LISTENING line
# Example output: TCP  0.0.0.0:3001  0.0.0.0:0  LISTENING  33080
#                                                           ↑ This is the PID

# Kill the process (replace 33080 with your actual PID)
taskkill //F //PID 33080
```

**Alternative (Windows):**
```bash
# Kill all node.js processes (WARNING: This kills ALL Node processes!)
taskkill //F //IM node.exe
```

**Linux/Mac:**
```bash
# Find and kill the process
lsof -ti:3001 | xargs kill -9
```

#### Step 2: Start the Wallet

**Method 1 - Using Batch File (Recommended):**
```bash
cd D:\birilium2claude\Birilium
START-WALLET.bat
```

**Method 2 - Using npm:**
```bash
cd D:\birilium2claude\Birilium\wallet
npm start
```

**Method 3 - Using npm from main folder:**
```bash
cd D:\birilium2claude\Birilium
npm run start-wallet
```

### What Should Happen
You should see:
1. ✓ "Starting integrated blockchain node..."
2. ✓ "BIRILIUM BLOCKCHAIN NODE" banner
3. ✓ "HTTP API listening on port: 3001"
4. ✓ Wallet window opens automatically

---

## ❌ Issue: PayPal Sandbox Not Working

### Problem
- PayPal button doesn't show
- Clicking PayPal opens live site (www.paypal.com) instead of sandbox
- "Sandbox mode" banner doesn't appear
- Payment doesn't work in test mode

### Root Cause
1. Sandbox credentials not configured
2. Browser cached old PayPal SDK
3. Wallet not showing sandbox indicator

### Solution

#### Step 1: Verify Sandbox Credentials

Open `D:\birilium2claude\Birilium\wallet\index.html` and check lines 383-384:

```javascript
const PAYPAL_SANDBOX_CLIENT_ID = 'ASFp4RJKUHasmVqNxbr2YovPM7PJW86vtYrDdPVBaOCkAnsYywNhXAV7RLcfqaGxugBC8i7SWAUNpncE';
const PAYPAL_SANDBOX_PLAN_ID = 'P-4EJ466345X205604DNDYCD5Y';
```

**These should be YOUR sandbox credentials, not the placeholders!**

If they still say `YOUR_SANDBOX_CLIENT_ID_HERE`, follow the guide at:
`D:\birilium2claude\Birilium\PAYPAL_SANDBOX_TESTING_GUIDE.md`

#### Step 2: Verify Sandbox Mode is Enabled

Check line 380 in `index.html`:
```javascript
const PAYPAL_SANDBOX_MODE = true;  // ← Must be true for testing!
```

#### Step 3: Clear Cache and Restart

**Full restart:**
```bash
# 1. Close the wallet window
# 2. Kill node processes
taskkill //F //IM node.exe

# 3. Wait 5 seconds

# 4. Start wallet
cd D:\birilium2claude\Birilium
START-WALLET.bat
```

**In the wallet:**
1. Press **Ctrl + Shift + I** (opens Developer Tools)
2. Go to **"Network"** tab
3. Check **"Disable cache"**
4. Press **Ctrl + R** (reload page)

#### Step 4: Verify Sandbox Mode is Active

When you open the wallet:
1. Go to **"Mining Subscription"** tab
2. You should see a **yellow banner**: "⚠️ SANDBOX MODE - Test payments only (no real money)"
3. If you DON'T see this banner, sandbox mode is NOT active!

#### Step 5: Test PayPal Button

Click the PayPal button:
- ✅ **Correct**: Opens `www.sandbox.paypal.com`
- ❌ **Wrong**: Opens `www.paypal.com` (live site)

If it opens the live site, your sandbox mode isn't working!

### Common Issues

**Issue**: "PayPal button not appearing at all"
- **Solution**: Open Developer Console (F12), check for JavaScript errors
- Look for errors like "Invalid Client ID" or "PayPal SDK failed to load"

**Issue**: "Sandbox mode banner shows, but button opens live site"
- **Solution**: Clear browser cache completely, restart wallet
- Make sure `PAYPAL_SANDBOX_MODE = true` (line 380)

**Issue**: "Can't log into sandbox PayPal"
- **Solution**: You need a sandbox PERSONAL account (buyer account)
- Create one at: https://developer.paypal.com/dashboard/accounts
- Don't use your real PayPal credentials!

---

## ✅ How to Properly Start the Wallet

### The Correct Way

1. **Make sure no other instances are running:**
   ```bash
   taskkill //F //IM node.exe
   ```

2. **Wait 5 seconds** (let ports release)

3. **Start the wallet:**
   ```bash
   cd D:\birilium2claude\Birilium
   START-WALLET.bat
   ```

4. **Wait for the node to start** (you'll see console messages)

5. **Wallet window opens automatically** (wait 5-10 seconds)

### What You Should See

**In the console window:**
```
Starting integrated blockchain node...
[Node] BIRILIUM BLOCKCHAIN NODE
[Node] HTTP API listening on port: 3001
[Node] P2P WebSocket server listening on port: 6001
✓ Blockchain node started successfully
```

**In the wallet window:**
- Terms of Use modal (first time only - click Accept)
- "Create Your Birilium Wallet" screen
- No error messages

---

##❓ Common Questions

### Q: Can I run the node separately from the wallet?

**A:** Yes, but not recommended for normal use.

**To run separately:**
```bash
# Terminal 1 - Start node
cd D:\birilium2claude\Birilium
node node.js

# Terminal 2 - Start wallet (after node is running)
cd D:\birilium2claude\Birilium\wallet
npm start
```

### Q: How do I know if sandbox mode is working?

**A:** Look for these signs:
1. Yellow "SANDBOX MODE" banner in Mining Subscription tab
2. PayPal button opens `www.sandbox.paypal.com` (not `www.paypal.com`)
3. You can log in with sandbox test account (not your real PayPal)

### Q: What if I get "MongoDB connection failed"?

**A:** MongoDB is optional! The wallet works without it.
- MongoDB is only for analytics/admin dashboard
- Mining, transactions, and subscriptions work fine without MongoDB

### Q: The wallet crashes when I mine

**A:** Make sure:
1. You've created a wallet (can't mine without a wallet address)
2. The blockchain node is running (check console)
3. You haven't exceeded the 20 BRL free limit (unless you have premium)

### Q: How do I test the premium subscription?

**A:** Follow these steps:
1. Make sure sandbox mode is enabled (see PayPal section above)
2. Get sandbox credentials from https://developer.paypal.com/
3. Create a wallet in the app
4. Go to "Mining Subscription" tab
5. Click PayPal button (should open sandbox.paypal.com)
6. Log in with sandbox PERSONAL account (not your real PayPal!)
7. Complete fake payment
8. Subscription activates → You can now mine unlimited coins!

---

## 🆘 Still Having Issues?

### Get Detailed Logs

1. **Open Developer Console** (F12 in wallet window)
2. Go to **"Console"** tab
3. Look for red error messages
4. Copy the error and check:
   - PayPal SDK errors → Sandbox configuration issue
   - Network errors → Node not running
   - CORS errors → Node firewall issue

### Check Node is Running

```bash
# Test if node is responding
curl http://localhost:3001/health

# Should return: {"status":"healthy","uptime":...}
```

If this fails, the node isn't running!

### Clean Restart (Nuclear Option)

```bash
# 1. Kill everything
taskkill //F //IM node.exe
taskkill //F //IM electron.exe

# 2. Clear Node modules and reinstall
cd D:\birilium2claude\Birilium
rmdir /s /q node_modules
npm install

cd wallet
rmdir /s /q node_modules
npm install

# 3. Wait 10 seconds

# 4. Start fresh
cd ..
START-WALLET.bat
```

---

**Version:** 1.0
**Last Updated:** 2025-01-16
**For more help:** Check PAYPAL_SANDBOX_TESTING_GUIDE.md
