# Rebuilding the Birilium Wallet Distribution

## Overview

The `dist` folder contains the packaged application. When you make changes to the source files, you need to rebuild to update the distribution.

## What's Updated

The following fixes have been applied to the source files:

1. **Connection Retry Logic** - `renderer-wallet.js`
2. **PayPal Config API** - `node-backend/node.js`
3. **Secure Credentials** - `index.html` and `.env`
4. **Git Protection** - `.gitignore`

## Files in dist/win-unpacked

- `app.asar` - Contains packaged app files (index.html, renderer-wallet.js, main.js, etc.)
- `resources/app/node-backend/` - Contains backend Node.js server
- `.env` file - **IMPORTANT**: Must be manually created/updated in packaged app!

## Quick Rebuild (Recommended)

To rebuild the entire application with all updates:

```bash
cd D:\birilium2claude\Birilium\wallet
npm run build:win
```

This will:
- Package all frontend files into `app.asar`
- Copy node-backend files to `resources/app/node-backend/`
- Create new installer exe
- Update `win-unpacked` folder

## Manual Update (Quick Fix)

If you just need to update the backend without rebuilding:

### Already Done:
```bash
# Backend files have been copied
cp node-backend/node.js dist/win-unpacked/resources/app/node-backend/node.js
cp node-backend/.env dist/win-unpacked/resources/app/node-backend/.env
cp node-backend/.env.example dist/win-unpacked/resources/app/node-backend/.env.example
```

### Still Needed - Update app.asar:
The frontend files (index.html, renderer-wallet.js) are in `app.asar` and need a full rebuild.

## Important Notes

### 1. .env File in Packaged App

**The .env file is NOT automatically included in the build!**

After building, you must manually create it:

```bash
# Option 1: Copy from source
cp node-backend/.env dist/win-unpacked/resources/app/node-backend/.env

# Option 2: Create from example
cp dist/win-unpacked/resources/app/node-backend/.env.example dist/win-unpacked/resources/app/node-backend/.env
# Then edit with your credentials
```

### 2. What Gets Packaged

From `package.json` build config:
- ✅ All files except those in exclusion list
- ✅ node-backend folder (via extraResources)
- ❌ `.env` files (excluded by default for security)
- ❌ `data/` and `logs/` folders (excluded)

### 3. Testing After Rebuild

1. **Check backend has new endpoint:**
   ```bash
   # Start the packaged app
   cd dist/win-unpacked
   ./Birilium\ Wallet.exe

   # Test the new endpoint
   curl http://localhost:3001/api/paypal-config
   ```

2. **Check frontend loads config:**
   - Open Developer Tools in the app
   - Look for network request to `/api/paypal-config`
   - Verify PayPal button loads

3. **Test connection retry:**
   - Close the app
   - Stop the blockchain node if running
   - Start the app
   - Watch console for retry messages
   - Start the blockchain node
   - Verify app connects automatically

## Build Commands Reference

```bash
# Full rebuild for Windows
npm run build:win

# Build for all platforms
npm run build:all

# Run in development mode (no rebuild)
npm start
```

## Distribution

After building, these files can be distributed:

1. **Installer**: `dist/Birilium Wallet Setup 1.0.0.exe`
   - Full installer with NSIS
   - Users can choose install location
   - Creates desktop shortcut

2. **Portable**: `dist/win-unpacked/`
   - No installation required
   - Just run `Birilium Wallet.exe`
   - **Requires manual .env setup!**

## Troubleshooting

### App doesn't have new features after rebuild

1. Delete `dist` folder completely
2. Run `npm run build:win` again
3. Verify `.env` file is in the right location

### PayPal button doesn't show

1. Check `.env` file exists in `dist/win-unpacked/resources/app/node-backend/`
2. Check console for `/api/paypal-config` request
3. Verify `PAYPAL_MODE` is set in `.env`

### Connection retry doesn't work

1. Verify you're running the rebuilt app, not the old one
2. Check browser console for retry messages
3. Frontend files are in `app.asar` - must rebuild to update them

## Post-Build Checklist

After running `npm run build:win`:

- [ ] `.env` file created in `dist/win-unpacked/resources/app/node-backend/`
- [ ] `PAYPAL_MODE` set to `sandbox` or `live`
- [ ] All PayPal credentials in `.env`
- [ ] Test `/api/paypal-config` endpoint
- [ ] Test connection retry logic
- [ ] Test PayPal subscription flow
- [ ] Check that wallet connects to node after retries

## Security Reminder

**Never distribute the installer with your production `.env` file!**

For distribution:
1. Include `.env.example`
2. Provide setup instructions
3. Let users create their own `.env` file

---

**Current Status:**
- ✅ Backend files updated in `dist/win-unpacked`
- ⚠️ Frontend files (HTML/JS) still need full rebuild
- ⚠️ `.env` file in place but users should use their own credentials

**Next Step:** Run `npm run build:win` to complete the update.
