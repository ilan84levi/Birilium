# Birilium Seed Node Deployment Guide

## What is a Seed Node?

A seed node is a publicly accessible blockchain node that:
- Runs 24/7 on a cloud server
- Has a public IP address
- Allows other wallets to connect and sync the blockchain
- Broadcasts new transactions and blocks to the network
- Maintains the authoritative copy of the blockchain

## Where to Deploy Your Seed Node

You need to deploy your seed node on a **cloud server** (VPS). Here are recommended providers:

### Recommended Cloud Providers:

1. **DigitalOcean** (Easiest for beginners)
   - Cost: $6-12/month
   - Link: https://www.digitalocean.com/products/droplets

2. **AWS Lightsail**
   - Cost: $5-10/month
   - Link: https://aws.amazon.com/lightsail/

3. **Vultr**
   - Cost: $6/month
   - Link: https://www.vultr.com/

4. **Linode/Akamai**
   - Cost: $5-10/month
   - Link: https://www.linode.com/

### Minimum Server Requirements:

- **OS**: Ubuntu 22.04 LTS (recommended)
- **RAM**: 2GB minimum (4GB recommended)
- **CPU**: 1-2 cores
- **Storage**: 20GB SSD
- **Network**: Public IPv4 address

## Step-by-Step Deployment

### Step 1: Create a Cloud Server

1. Sign up for DigitalOcean (or your preferred provider)
2. Create a new Droplet:
   - **Image**: Ubuntu 22.04 LTS
   - **Plan**: Basic $12/month (2GB RAM, 1 CPU, 50GB SSD)
   - **Datacenter**: Choose closest to your target users
   - **Authentication**: SSH key (generate one if you don't have it)
3. Note down your server's **public IP address** (e.g., 142.93.123.45)

### Step 2: Connect to Your Server

```bash
# On your local machine, connect via SSH
ssh root@YOUR_SERVER_IP

# Example:
ssh root@142.93.123.45
```

### Step 3: Install Dependencies

```bash
# Update system packages
apt update && apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Install MongoDB (required for persistent blockchain storage)
curl -fsSL https://www.mongodb.org/static/pgp/server-6.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-archive-keyring.gpg
echo "deb [ signed-by=/usr/share/keyrings/mongodb-archive-keyring.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-6.0.list
apt update
apt install -y mongodb-org

# Start MongoDB
systemctl start mongod
systemctl enable mongod

# Install Git
apt install -y git

# Install PM2 (process manager to keep node running)
npm install -g pm2
```

### Step 4: Deploy Birilium Node

```bash
# Clone your GitHub repository
git clone https://github.com/YOUR_USERNAME/Birilium.git
cd Birilium/wallet/node-backend

# Install dependencies
npm install

# Copy the seed node configuration
cp .env.seednode .env

# Edit the configuration file
nano .env
```

### Step 5: Configure the Seed Node

Edit the `.env` file and set:

```bash
# Generate a secure API key
API_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Generate a secure admin password
ADMIN_PASSWORD=YourSecurePassword123!

# Generate node private key
NODE_PRIVATE_KEY=$(node -e "const EC = require('elliptic').ec; const ec = new EC('secp256k1'); console.log(ec.genKeyPair().getPrivate('hex'))")

# Configure MongoDB (should work with default settings)
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=birilium

# PayPal settings (if you want to accept payments)
PAYPAL_MODE=live
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
```

Save the file (Ctrl+X, then Y, then Enter).

### Step 6: Open Firewall Ports

```bash
# Allow HTTP port (for API)
ufw allow 3001/tcp

# Allow P2P port (for blockchain network)
ufw allow 6001/tcp

# Allow SSH (important!)
ufw allow 22/tcp

# Enable firewall
ufw enable
```

### Step 7: Start the Node

```bash
# Start the node with PM2 (keeps it running forever)
pm2 start node.js --name birilium-node

# Save PM2 configuration
pm2 save

# Set PM2 to start on system boot
pm2 startup

# Check if it's running
pm2 status
pm2 logs birilium-node
```

### Step 8: Verify the Node is Running

```bash
# Check node status
curl http://localhost:3001/health

# You should see JSON output with blockchain status
```

From your local computer, test external access:
```bash
curl http://YOUR_SERVER_IP:3001/health
```

## Your Seed Node Details

After deployment, note down:

- **Seed Node HTTP API**: `http://YOUR_SERVER_IP:3001`
- **Seed Node P2P**: `ws://YOUR_SERVER_IP:6001`

Example:
- HTTP API: `http://142.93.123.45:3001`
- P2P: `ws://142.93.123.45:6001`

## Updating the Wallet to Connect to Your Seed Node

Now you need to configure all wallets to connect to YOUR seed node by default.

Edit `Birilium/wallet/node-backend/.env.example` and add:

```bash
# Initial seed nodes (comma-separated WebSocket URLs)
PEERS=ws://YOUR_SERVER_IP:6001

# Example:
PEERS=ws://142.93.123.45:6001
```

This way, when users download and run the wallet, it will automatically connect to your seed node!

## Monitoring Your Seed Node

```bash
# View logs
pm2 logs birilium-node

# View status
pm2 status

# Restart node
pm2 restart birilium-node

# Stop node
pm2 stop birilium-node
```

## Setting Up Multiple Seed Nodes (Recommended)

For better reliability, deploy 2-3 seed nodes in different locations:

1. **Seed Node 1**: US East (e.g., New York)
2. **Seed Node 2**: Europe (e.g., London)
3. **Seed Node 3**: Asia (e.g., Singapore)

Then configure wallets to connect to all of them:

```bash
PEERS=ws://142.93.123.45:6001,ws://165.22.45.123:6001,ws://188.166.23.45:6001
```

## Security Best Practices

1. **Use strong passwords** for admin accounts
2. **Keep your server updated**: `apt update && apt upgrade` regularly
3. **Enable automatic security updates**
4. **Consider enabling TLS** for P2P connections (advanced)
5. **Monitor server resources** (CPU, RAM, disk space)
6. **Set up backups** for MongoDB database

## Costs

- **VPS Hosting**: $6-12/month per seed node
- **Bandwidth**: Usually included (1-2TB/month)
- **Domain** (optional): $10-15/year

Estimated total: **$10-15/month** for one seed node.

## Domain Name (Optional but Recommended)

Instead of using IP addresses, you can register a domain:

1. Register domain: `biriliumcoin.com`
2. Point DNS A record to your server IP
3. Update wallet config: `PEERS=ws://seed1.biriliumcoin.com:6001`

## Next Steps

After deploying your seed node:

1. Test that it's accessible from the internet
2. Update the wallet's default PEERS configuration
3. Commit and push changes to GitHub
4. Users downloading the wallet will auto-connect to your network!

## Troubleshooting

**Node won't start:**
```bash
pm2 logs birilium-node
# Check for errors in the logs
```

**Can't connect from outside:**
```bash
# Make sure firewall ports are open
ufw status
# Make sure PM2 process is running
pm2 status
```

**MongoDB connection issues:**
```bash
# Check MongoDB status
systemctl status mongod
# Restart MongoDB
systemctl restart mongod
```

## Support

For issues, check the logs:
```bash
pm2 logs birilium-node --lines 100
```
