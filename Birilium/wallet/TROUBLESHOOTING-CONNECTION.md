# Birilium Wallet - Connection Troubleshooting Guide

## Error: "Error connecting to blockchain. Make sure the blockchain node is running."

This error means the wallet frontend cannot connect to the blockchain node API at `http://localhost:3001`.

---

## Quick Fixes (Try These First)

### Fix 1: Use START-WALLET.bat

**This is the recommended way to run the wallet:**

1. Close all instances of the wallet
2. Navigate to: `D:\birilium2claude\Birilium`
3. Double-click `START-WALLET.bat`
4. Wait for the message: "✓ Blockchain node started successfully"
5. The wallet should open automatically

### Fix 2: Manual Start (2 Terminal Windows)

**Terminal 1 - Start Blockchain Node:**
```cmd
cd D:\birilium2claude\Birilium\wallet\node-backend
node node.js
```

Wait for these messages:
```
✓ Connected to MongoDB
✓ Blockchain loaded from database
HTTP API: http://localhost:3001
```

**Terminal 2 - Start Wallet:**
```cmd
cd D:\birilium2claude\Birilium\wallet
npm start
```

### Fix 3: Use Packaged App with Diagnostic

1. Close all instances of the wallet
2. Navigate to: `D:\birilium2claude\Birilium\wallet`
3. Double-click `DIAGNOSE-PACKAGED-APP.bat`
4. Check all diagnostics pass
5. Wallet will start automatically

---

## Common Issues & Solutions

### Issue 1: MongoDB Not Running

**Symptoms:**
- Node fails to start
- Error: "Cannot connect to MongoDB"

**Solution:**
```cmd
# Check if MongoDB is running
netstat -ano | findstr ":27017"

# If not running, start MongoDB service:
net start MongoDB

# Or start MongoDB manually:
mongod --dbpath "C:\data\db"
```

### Issue 2: Port 3001 Already in Use

**Symptoms:**
- Error: "EADDRINUSE: address already in use :::3001"
- Node won't start

**Solution:**
```cmd
# Find what's using port 3001
netstat -ano | findstr ":3001"

# Kill the process (replace PID with actual process ID)
taskkill /F /PID <PID>

# Or use a different port
set HTTP_PORT=3002
node node.js
```

### Issue 3: Packaged App Not Starting Node

**Symptoms:**
- Packaged app opens but shows connection error immediately
- No blockchain node console output

**Solution:**

**Option A - Use START-NODE-ONLY.bat:**
1. Navigate to: `D:\birilium2claude\Birilium\wallet`
2. Double-click `START-NODE-ONLY.bat`
3. Wait for node to start
4. Then run the packaged app: `dist\win-unpacked\Birilium Wallet.exe`

**Option B - Check Console:**
1. Open packaged app
2. Press `F12` to open Developer Console
3. Look for error messages
4. Check if retry messages appear
5. Share any error messages for help

### Issue 4: Can't Create Wallet

**Root Cause:** Blockchain node not running

**Solution:**
1. Make sure blockchain node is running (see Fix 1 or 2 above)
2. Wait for the wallet to show "✓ Connected to blockchain node"
3. Look for the connection retry messages in console (F12)
4. Once connected, try creating wallet again

### Issue 5: Can't Make Subscription

**Root Cause:** Either node not running OR PayPal config missing

**Solution:**
1. Ensure blockchain node is running
2. Check `.env` file exists:
   - Development: `D:\birilium2claude\Birilium\wallet\node-backend\.env`
   - Packaged: `D:\birilium2claude\Birilium\wallet\dist\win-unpacked\resources\app\node-backend\.env`
3. Verify PayPal credentials in `.env`:
   ```
   PAYPAL_MODE=sandbox
   PAYPAL_CLIENT_ID=your_client_id
   PAYPAL_CLIENT_SECRET=your_secret
   PAYPAL_PLAN_ID=your_plan_id
   ```
4. Restart the application

---

## Diagnostic Steps

### Step 1: Check MongoDB
```cmd
netstat -ano | findstr ":27017"
```
**Expected:** Should show `LISTENING` on port 27017
**If not:** Start MongoDB service

### Step 2: Check Blockchain Node
```cmd
netstat -ano | findstr ":3001"
```
**Expected:** Should show `LISTENING` on port 3001
**If not:** Start the node (see Quick Fixes)

### Step 3: Test API Manually
```cmd
curl http://localhost:3001/api/stats
```
**Expected:** Should return JSON with blockchain stats
**If error:** Node is not running or not responding

### Step 4: Check Browser Console

1. Open wallet application
2. Press `F12` to open Developer Tools
3. Go to "Console" tab
4. Look for these messages:
   - ✓ Good: "✓ Connected to blockchain node"
   - ✓ Good: "Wallet initialized successfully"
   - ⚠️ Warning: "Node connection attempt X/10 failed"
   - ❌ Error: "⚠️ Could not connect to blockchain node after multiple attempts"

### Step 5: Check Network Tab

1. Press `F12` → Go to "Network" tab
2. Look for requests to `http://localhost:3001`
3. Check if they return HTTP 200 (success) or error

---

## Which Version Are You Running?

### Development Mode (via START-WALLET.bat or npm start)
**Files used:**
- `D:\birilium2claude\Birilium\wallet\node-backend\node.js`
- `D:\birilium2claude\Birilium\wallet\index.html`
- `D:\birilium2claude\Birilium\wallet\renderer-wallet.js`

**Pros:**
- Easy to debug
- Can see all console output
- Changes reflect immediately

**Cons:**
- Requires 2 terminal windows (or START-WALLET.bat)
- Need Node.js installed

### Packaged App (dist/win-unpacked/Birilium Wallet.exe)
**Files used:**
- `dist/win-unpacked/resources/app.asar` (frontend)
- `dist/win-unpacked/resources/app/node-backend/node.js` (backend)

**Pros:**
- Single executable
- Blockchain node starts automatically
- Looks professional

**Cons:**
- Harder to debug
- Need to rebuild after changes
- Console output hidden

---

## Connection Retry Logic

The wallet now has automatic retry logic:

1. **On startup:** Wallet tries to connect 10 times (every 3 seconds)
2. **Shows messages:** You'll see "Node connection attempt X/10 failed"
3. **If node starts late:** Wallet will connect automatically
4. **If all retries fail:** Shows warning banner with instructions

**To see retry in action:**
1. Start wallet FIRST (without node running)
2. Watch console for retry messages
3. Start blockchain node (within 30 seconds)
4. Wallet should connect automatically

---

## Still Having Issues?

### Collect This Information:

1. **Which version are you running?**
   - [ ] Development (START-WALLET.bat / npm start)
   - [ ] Packaged app (Birilium Wallet.exe)

2. **MongoDB status:**
   ```cmd
   netstat -ano | findstr ":27017"
   ```
   (Copy output here)

3. **Blockchain node status:**
   ```cmd
   netstat -ano | findstr ":3001"
   ```
   (Copy output here)

4. **Console errors:** (Press F12 in wallet)
   - Copy any red error messages
   - Look for messages about "blockchain node"

5. **Terminal output:** (if using START-WALLET.bat)
   - Copy all output from the terminal window

### Quick Test Script

Run this to test everything:

```cmd
cd D:\birilium2claude\Birilium\wallet
DIAGNOSE-PACKAGED-APP.bat
```

This will check:
- ✓ MongoDB running
- ✓ Port availability
- ✓ Packaged app files
- ✓ Node backend files
- ✓ Dependencies installed

---

## Workaround: External Node

If the integrated node won't start, you can run it separately:

**Terminal 1:**
```cmd
cd D:\birilium2claude\Birilium\wallet\node-backend
node node.js
```

**Terminal 2:**
```cmd
cd D:\birilium2claude\Birilium\wallet\dist\win-unpacked
"Birilium Wallet.exe"
```

The wallet will connect to the external node automatically.

---

## Prevention: Always Start Properly

**Development:**
```cmd
cd D:\birilium2claude\Birilium
START-WALLET.bat
```

**Production:**
```cmd
cd D:\birilium2claude\Birilium\wallet
DIAGNOSE-PACKAGED-APP.bat
```

---

## Files Created to Help You:

1. `START-WALLET.bat` - In `D:\birilium2claude\Birilium\` - Recommended way to start
2. `START-NODE-ONLY.bat` - In `D:\birilium2claude\Birilium\wallet\` - Start just the node
3. `DIAGNOSE-PACKAGED-APP.bat` - In `D:\birilium2claude\Birilium\wallet\` - Check everything
4. `TROUBLESHOOTING-CONNECTION.md` - This file - Complete guide

**Recommended startup order:**
1. Make sure MongoDB is running
2. Use START-WALLET.bat (from Birilium folder)
3. Wait for "✓ Blockchain node started successfully"
4. Wallet opens automatically
5. Wait for "✓ Connected to blockchain node" (check console)
6. Now you can create wallets and make subscriptions

---

**Last Updated:** 2025-10-16
