# 🚀 Deploy Birilium to Digital Ocean - Super Easy!

## What You Need:
1. Digital Ocean account ($12/month)
2. 10 minutes of your time

## Quick Steps:

### 1. Create Server
Go to Digital Ocean → Create Droplet → Ubuntu 22.04 → $12/month plan

**Save your server IP!** (e.g., `142.93.123.45`)

### 2. Run This One Command:
```bash
cd D:\birilium2claude\Birilium
bash deploy-digitalocean.sh 142.93.123.45
```
*(Replace with YOUR IP)*

### 3. Done! ✅
Your blockchain node is now live at:
- API: `http://142.93.123.45:3001`
- P2P: `ws://142.93.123.45:6001`

## That's It!

**Full Guide:** [DIGITALOCEAN-QUICKSTART.md](DIGITALOCEAN-QUICKSTART.md)

**Deploy Script:** [deploy-digitalocean.sh](deploy-digitalocean.sh)

---

The script does everything automatically:
- ✅ Installs Node.js, MongoDB, PM2
- ✅ Clones your code from GitHub
- ✅ Generates secure passwords
- ✅ Configures firewall
- ✅ Starts the node
- ✅ Sets up auto-restart

Just run one command and you're live! 🎉
