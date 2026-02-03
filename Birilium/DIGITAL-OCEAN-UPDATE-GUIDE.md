# 🔄 Update Your Digital Ocean Server to v1.0.7

## Current Situation

- ✅ **Desktop Wallet**: Built with v1.0.7 + security fixes
- ⚠️ **Digital Ocean Server**: Running OLD version (37 days uptime)
- 🎯 **Goal**: Update server to match desktop wallet version

---

## Quick Decision Guide

### **Option A: Keep Current Server Running** (Safest)
Best if: Your server is working fine and you don't need the new features yet

**What to do:**
1. Test desktop wallet locally
2. Update server later when you have time

### **Option B: Update Server Now** (Recommended)
Best if: You want admin panel, SQLite, and security fixes on your server

**What to do:**
1. Test locally first (5 min)
2. Backup server data (2 min)
3. Deploy update (10 min)

### **Option C: Fresh Deploy to New Server**
Best if: You want a clean start with the latest version

**What to do:**
1. Create new Digital Ocean droplet
2. Deploy v1.0.7 from scratch
3. Switch DNS/peers to new server

---

## 🚀 RECOMMENDED: Quick Test & Update Process

### **Phase 1: Test Locally** (5 minutes)

```bash
# 1. Open terminal in your project
cd E:\birilium2claude\Birilium\wallet

# 2. Start the application
npm start
```

**In another terminal:**
```bash
# Test health endpoint
curl http://localhost:3001/health

# Test stats
curl http://localhost:3001/api/stats

# Test admin panel in browser
# Go to: http://localhost:3001/admin
# Login: admin_519cd57c / NgFsG1oQWw<*[b5T4?)[?cJY
```

**What to verify:**
- [ ] Node starts without errors
- [ ] Endpoints respond
- [ ] Admin panel loads
- [ ] Can login successfully
- [ ] Dashboard shows data

---

### **Phase 2: Push Changes to GitHub** (2 minutes)

Your deployment pulls from GitHub, so commit your changes first:

```bash
# Review what will be committed
git status

# Add changes
git add .gitignore
git add Birilium/wallet/node-backend/auth.js
git add Birilium/wallet/node-backend/audit.js
git add Birilium/wallet/node-backend/admin-websocket.js
git add Birilium/wallet/node-backend/admin-dashboard.html

# Commit
git commit -m "feat: Update to v1.0.7 with SQLite, admin panel, and security fixes

- Migrate from MongoDB to SQLite
- Add JWT authentication and admin panel
- Add audit logging system
- Add real-time WebSocket updates
- Fix security credential handling
- Update to electron 35.7.5

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to GitHub
git push origin main
```

---

### **Phase 3: Update Digital Ocean Server** (10 minutes)

#### **Method 1: Automated Update (Easiest)**

```bash
cd E:\birilium2claude\Birilium
bash deploy-digitalocean-sqlite.sh 159.65.96.82
```

This will:
- ✅ Backup old installation
- ✅ Install latest code from GitHub
- ✅ Install SQLite dependencies
- ✅ Generate new admin credentials
- ✅ Migrate from MongoDB to SQLite
- ✅ Restart the node

#### **Method 2: Manual Update (More Control)**

```bash
# 1. SSH into your server
ssh root@159.65.96.82

# 2. Backup current installation
cd ~/Birilium/wallet/node-backend
tar -czf ~/backup-$(date +%Y%m%d-%H%M%S).tar.gz data/ logs/ .env

# 3. Stop the node
pm2 stop birilium-node

# 4. Pull latest code
cd ~/Birilium
git pull origin main

# 5. Install dependencies
cd wallet/node-backend
npm install --production

# 6. Update .env file
nano .env

# Add these lines if not present:
# JWT_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
# JWT_EXPIRES_IN=1y
# JWT_REFRESH_EXPIRES_IN=1y
# ADMIN_PASSWORD_HASH=<your bcrypt hash>
# SQLITE_DB_PATH=./data/birilium.db

# 7. Restart the node
pm2 restart birilium-node

# 8. Check logs
pm2 logs birilium-node --lines 50
```

---

### **Phase 4: Verify Update** (2 minutes)

```bash
# Test from your local machine
curl http://159.65.96.82:3001/health

# Check version and stats
curl http://159.65.96.82:3001/api/stats

# Test admin panel
# Open browser: http://159.65.96.82:3001/admin
# Use the new credentials displayed during deployment
```

---

## 🔍 What Changed in v1.0.7?

### **Major Changes:**
1. **Database**: MongoDB → SQLite (embedded, no separate server needed)
2. **Admin Panel**: New JWT-authenticated dashboard
3. **Security**: Password hashing, audit logging, improved credential management
4. **Electron**: Updated to 35.7.5 (security patches)

### **Breaking Changes:**
- ⚠️ MongoDB no longer used (data will need migration if you have important data)
- ⚠️ New admin authentication (JWT instead of basic auth)
- ⚠️ New .env variables required (JWT_SECRET, ADMIN_PASSWORD_HASH)

### **Data Migration:**
If you have important blockchain data on MongoDB:
```bash
# On server
ssh root@159.65.96.82

# Export MongoDB data
mongoexport --db birilium --collection blocks --out blocks.json
mongoexport --db birilium --collection transactions --out transactions.json

# Import to SQLite (requires custom import script)
# Note: For a seed node with 1 genesis block, fresh start is recommended
```

---

## 📊 Comparison: Old vs New

| Feature | Old Version | New Version (1.0.7) |
|---------|-------------|---------------------|
| Database | MongoDB | SQLite |
| Admin Auth | Basic | JWT + bcrypt |
| Admin Panel | Basic | Full dashboard |
| Audit Logging | No | Yes |
| Real-time Updates | No | WebSocket |
| Security | Basic | Enhanced |
| Electron | 28.0.0 | 35.7.5 |
| Uptime | 37 days | Fresh start |

---

## ⚠️ Important Notes

### **Before Updating:**
1. Your current server has 37 days uptime - decide if that matters
2. You only have 1 block (genesis) - no critical data to lose
3. Make sure to save new admin credentials after deployment

### **After Updating:**
1. Update desktop wallet .env to point to server:
   ```bash
   # In desktop wallet: Birilium/wallet/node-backend/.env
   PEERS=ws://159.65.96.82:6001
   ```

2. Test admin panel on server:
   - URL: http://159.65.96.82:3001/admin
   - Use credentials from deployment output

3. Monitor logs for first hour:
   ```bash
   ssh root@159.65.96.82 'pm2 logs birilium-node'
   ```

---

## 🆘 Rollback Plan (If Something Goes Wrong)

```bash
# SSH into server
ssh root@159.65.96.82

# Stop current node
pm2 stop birilium-node

# Restore backup
cd ~
tar -xzf backup-YYYYMMDD-HHMMSS.tar.gz -C Birilium/wallet/node-backend/

# Switch back to old code
cd Birilium
git checkout <previous-commit-hash>

# Restart
pm2 restart birilium-node
```

---

## 🎯 Recommended Action Plan

**Right Now:**
1. ✅ Test wallet locally (already have secure build)
2. ✅ Commit and push security fixes to GitHub
3. ⏸️ WAIT - Test thoroughly before updating production

**This Week:**
1. Run local wallet for a few days
2. Verify all features work
3. Update Digital Ocean server when confident

**After Update:**
1. Test admin panel on server
2. Update desktop wallets to connect to server
3. Monitor server for 24 hours

---

## 🤔 Still Not Sure What to Do?

### **Start Here:**
```bash
# Just test locally first
cd E:\birilium2claude\Birilium\wallet
npm start

# Open http://localhost:3001/admin in browser
# Play with the admin panel
# If it works well, then update the server
```

### **Questions?**
- **Q: Will I lose data?** A: Server only has 1 block, nothing critical to lose
- **Q: Can I rollback?** A: Yes, backup is created automatically
- **Q: What if it breaks?** A: Server backup + rollback script available
- **Q: How long is downtime?** A: 2-3 minutes during restart

---

## 📞 Quick Commands Reference

```bash
# Test local wallet
cd E:\birilium2claude\Birilium\wallet && npm start

# Deploy to server (automated)
cd E:\birilium2claude\Birilium
bash deploy-digitalocean-sqlite.sh 159.65.96.82

# Check server status
curl http://159.65.96.82:3001/health
ssh root@159.65.96.82 'pm2 status'

# View server logs
ssh root@159.65.96.82 'pm2 logs birilium-node --lines 100'

# Restart server
ssh root@159.65.96.82 'pm2 restart birilium-node'
```

---

**Next Step:** Test locally first! 🚀
