# 🚀 Birilium - Digital Ocean Quick Deployment

**Deploy your Birilium blockchain node to Digital Ocean in 10 minutes!**

---

## 📋 Prerequisites

1. **Digital Ocean Account** - https://www.digitalocean.com (First month free with promo codes)
2. **SSH Key** - You'll need this to connect to your server
3. **Git Bash** or terminal (Windows users: use Git Bash)

---

## ⚡ Quick Deploy (5 Steps)

### Step 1: Create Digital Ocean Droplet

1. Go to: https://cloud.digitalocean.com/droplets/new
2. Choose:
   - **Image:** Ubuntu 22.04 LTS
   - **Plan:** Basic $12/month (2GB RAM, 1 CPU)
   - **Datacenter:** Choose closest to you
   - **Authentication:** SSH keys (add yours)
   - **Hostname:** birilium-node
3. Click "Create Droplet"
4. **Save the IP address** (e.g., `142.93.123.45`)

### Step 2: Test SSH Connection

```bash
# Replace with YOUR server IP
ssh root@142.93.123.45
```

If it connects, you're ready! Type `exit` to disconnect.

### Step 3: Run Auto-Deploy Script

**On your local machine:**

```bash
cd D:\birilium2claude\Birilium
bash deploy-digitalocean.sh 142.93.123.45
```

Replace `142.93.123.45` with your actual server IP.

**This script will:**
- ✅ Install Node.js, MongoDB, PM2
- ✅ Clone your GitHub repository
- ✅ Configure environment variables
- ✅ Setup firewall
- ✅ Start the blockchain node
- ✅ Generate secure credentials

**Deployment takes 5-10 minutes.**

### Step 4: Verify It's Working

```bash
# Check node health (replace with your IP)
curl http://142.93.123.45:3001/health
```

You should see JSON with blockchain status!

### Step 5: Save Your Credentials

The script will display:
```
=================================
SAVE THESE CREDENTIALS:
=================================
Admin Username: admin
Admin Password: abc123def456...
API Key: xyz789...
=================================
```

**Save these somewhere safe!**

---

## ✅ You're Done!

Your seed node is now live at:
- **HTTP API:** `http://YOUR_IP:3001`
- **P2P Network:** `ws://YOUR_IP:6001`
- **Admin Panel:** `http://YOUR_IP:3001/api/admin`

---

## 🔧 Managing Your Node

### Check Node Status
```bash
ssh root@YOUR_IP
pm2 status
```

### View Logs
```bash
ssh root@YOUR_IP
pm2 logs birilium-node
```

### Restart Node
```bash
ssh root@YOUR_IP
pm2 restart birilium-node
```

### Stop Node
```bash
ssh root@YOUR_IP
pm2 stop birilium-node
```

### Update Node (pull latest code)
```bash
ssh root@YOUR_IP
cd Birilium
git pull
cd wallet/node-backend
npm install
pm2 restart birilium-node
```

---

## 🌐 Connect Wallets to Your Seed Node

Now you need to tell your wallet to connect to YOUR seed node instead of localhost.

### Option 1: Update Default Seed Node (Recommended)

Edit `wallet/node-backend/.env.example`:

```bash
# Add your seed node IP
PEERS=ws://142.93.123.45:6001
```

Commit and push to GitHub. All future wallet installations will connect to your seed node automatically!

### Option 2: Manual Configuration

Each user can edit their local `.env` file:

```bash
# In wallet/node-backend/.env
PEERS=ws://142.93.123.45:6001
```

---

## 💰 Configure PayPal (Optional)

If you want to accept subscription payments on your seed node:

```bash
ssh root@YOUR_IP
cd Birilium/wallet/node-backend
nano .env
```

Add:
```bash
PAYPAL_MODE=live
PAYPAL_CLIENT_ID=your_live_client_id
PAYPAL_CLIENT_SECRET=your_live_secret
PAYPAL_PLAN_ID=P-2AE31843879973003ND5UCTA
```

Save and restart:
```bash
pm2 restart birilium-node
```

---

## 🔒 Security Checklist

- [x] Firewall enabled (ports 22, 3001, 6001 only)
- [x] Strong admin password generated
- [x] API key authentication enabled
- [x] MongoDB secured (localhost only)
- [ ] Optional: Enable TLS for P2P (`ENABLE_P2P_TLS=true`)
- [ ] Optional: Setup domain name + SSL certificate
- [ ] Optional: Configure backup strategy

---

## 📊 Monitoring

### Check Blockchain Status
```bash
curl http://YOUR_IP:3001/api/stats
```

### Check Connected Peers
```bash
curl http://YOUR_IP:3001/api/peers
```

### View Latest Blocks
```bash
curl http://YOUR_IP:3001/api/blockchain
```

---

## 🆘 Troubleshooting

### Node not accessible?
```bash
# Check if node is running
ssh root@YOUR_IP "pm2 status"

# Check logs for errors
ssh root@YOUR_IP "pm2 logs birilium-node --lines 50"

# Check if ports are open
ssh root@YOUR_IP "ufw status"
```

### MongoDB issues?
```bash
ssh root@YOUR_IP "systemctl status mongod"
ssh root@YOUR_IP "systemctl restart mongod"
```

### Out of memory?
Upgrade to 4GB droplet: Digital Ocean > Droplets > Resize

---

## 💡 Tips

1. **Use a domain name** - Point a domain to your IP (e.g., node.birilium.net)
2. **Setup SSL** - Use Cloudflare or Let's Encrypt for HTTPS
3. **Enable backups** - Digital Ocean offers automatic backups ($2.40/month)
4. **Monitor uptime** - Use UptimeRobot (free) to monitor your node
5. **Scale up** - If you get many users, upgrade to 4GB RAM

---

## 📚 Additional Resources

- Full deployment guide: `wallet/SEED-NODE-DEPLOYMENT.md`
- Security audit: `wallet/SECURITY-AUDIT-REPORT.md`
- PayPal setup: `wallet/PAYPAL-SETUP.md`
- Digital Ocean Docs: https://docs.digitalocean.com/

---

## 🎉 Success!

Your Birilium blockchain is now live! Users can connect their wallets to your seed node and start transacting.

**Share your node details:**
```
Birilium Seed Node
HTTP API: http://YOUR_IP:3001
P2P: ws://YOUR_IP:6001
```

---

**Need help?** Check the logs or open an issue on GitHub!
