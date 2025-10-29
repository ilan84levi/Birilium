# 🚀 Starting Wallet with Production Settings

## ✅ Production Configuration Complete!

All production security settings have been applied successfully:
- ✅ API Key generated and configured
- ✅ Admin password secured
- ✅ Node private key generated
- ✅ NODE_ENV set to production
- ✅ CORS configured for https://birilium.com
- ✅ Backup created: `.env.backup-20251024`

---

## 🔄 To Start the Wallet

### Option 1: Restart Your Computer (Recommended)
This will clear all lingering processes.

```bash
# After reboot:
cd Birilium/wallet
npm start
```

### Option 2: Manual Cleanup & Start
```bash
# 1. Open Task Manager (Ctrl+Shift+Esc)
# 2. End all "node.exe" processes
# 3. End all "electron.exe" processes
# 4. Then start:

cd Birilium/wallet
npm start
```

### Option 3: Use Batch Script (Windows)
```bash
cd Birilium/wallet
CLEAN-AND-START.bat
```

---

## ✅ What Was Configured

### Production Security Keys:
```
API_KEY: fe1df23d235e4bff0ce7a06d2426deda3a000ffff4720a030fa17d717411db4d
ADMIN_PASSWORD: Xj3wijWLnQpC2ES^=@TN
NODE_PRIVATE_KEY: a5fb7fee043c0b1d7472f5f2d942ffd1cf90a513b8381d5fa6eaef7bf078a1af
```

### Production Settings:
```
NODE_ENV: production
CORS_ORIGINS: https://birilium.com,https://www.birilium.com,http://localhost:*
```

---

## 📋 Verification Checklist

Once the wallet starts, verify:

1. **Check NODE_ENV**:
   - The wallet should be running in production mode
   
2. **Check Ports**:
   - HTTP API should be on port 3001 (or 30011 if 3001 is in use)
   - P2P should be on port 6001 (or 60011 if 6001 is in use)

3. **Check MongoDB**:
   - Should connect and load existing blocks

4. **Check P2P**:
   - Should connect to peer: ws://159.65.96.82:6001

5. **Check CORS**:
   - Configured for birilium.com domains

---

## 🔧 Troubleshooting

### "Port already in use" Error

```bash
# Windows - Kill processes on specific ports:
netstat -ano | findstr :3001
taskkill /PID <PID_FROM_ABOVE> /F

netstat -ano | findstr :6001
taskkill /PID <PID_FROM_ABOVE> /F
```

### Restore Previous Settings

If you need to revert:
```bash
cd Birilium/wallet/node-backend
cp .env.backup-20251024 .env
```

---

## 🔐 Security Reminders

1. ✅ Keep `.env` file secure - never commit to Git
2. ✅ Update CORS if you add more domains
3. ✅ Consider enabling TLS after generating certificates
4. ✅ Rotate keys quarterly or if exposed

---

**Status:** Ready for Production Testing
**Date:** 2025-10-24
**Version:** 1.0.7
