#!/bin/bash
#
# Birilium Node - Digital Ocean Auto-Deploy Script (SQLite Version)
# This script automates the deployment of a Birilium seed node with SQLite
#
# Usage: bash deploy-digitalocean-sqlite.sh YOUR_SERVER_IP
#

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Birilium Node - Digital Ocean Deploy${NC}"
echo -e "${BLUE}  Version: 1.0.7 (SQLite)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if IP provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Server IP address required${NC}"
    echo "Usage: bash deploy-digitalocean-sqlite.sh YOUR_SERVER_IP"
    echo "Example: bash deploy-digitalocean-sqlite.sh 159.65.96.82"
    exit 1
fi

SERVER_IP=$1
echo -e "${GREEN}Target Server: ${SERVER_IP}${NC}"
echo ""

# Check if we can connect
echo -e "${BLUE}Step 1: Testing SSH connection...${NC}"
ssh -o ConnectTimeout=10 root@${SERVER_IP} "echo 'SSH connection successful'" || {
    echo -e "${RED}Failed to connect to ${SERVER_IP}${NC}"
    echo "Make sure:"
    echo "1. Your server is running"
    echo "2. SSH key is configured"
    echo "3. You can access: ssh root@${SERVER_IP}"
    exit 1
}

echo -e "${GREEN}✓ SSH connection OK${NC}"
echo ""

# Deploy the node
echo -e "${BLUE}Step 2: Installing dependencies...${NC}"
ssh root@${SERVER_IP} << 'ENDSSH'
set -e

# Update system
echo "Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y

# Install Node.js 20.x
echo "Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Install build tools for native modules (required for better-sqlite3, argon2)
echo "Installing build tools..."
apt-get install -y build-essential python3 git

# Install PM2 globally
echo "Installing PM2..."
npm install -g pm2

echo "✓ Dependencies installed"
ENDSSH

echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Clone and setup
echo -e "${BLUE}Step 3: Cloning Birilium repository...${NC}"
ssh root@${SERVER_IP} << 'ENDSSH'
set -e

# Backup existing installation if exists
if [ -d "Birilium" ]; then
    echo "Backing up old installation..."
    mv Birilium Birilium.backup.$(date +%Y%m%d-%H%M%S)
fi

# Clone repository
echo "Cloning from GitHub..."
git clone https://github.com/ilan84levi/Birilium.git
cd Birilium/wallet/node-backend

# Install dependencies (production mode)
echo "Installing Node dependencies..."
npm install --production

echo "✓ Repository cloned and dependencies installed"
ENDSSH

echo -e "${GREEN}✓ Repository cloned${NC}"
echo ""

# Configure environment
echo -e "${BLUE}Step 4: Configuring environment...${NC}"
ssh root@${SERVER_IP} << 'ENDSSH'
set -e

cd Birilium/wallet/node-backend

# Generate secure credentials
echo "Generating secure credentials..."
API_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ADMIN_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(20).toString('base64'))")
NODE_PRIVATE_KEY=$(node -e "const EC = require('elliptic').ec; const ec = new EC('secp256k1'); console.log(ec.genKeyPair().getPrivate('hex'))")
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
ADMIN_USERNAME="admin_$(node -e "console.log(require('crypto').randomBytes(4).toString('hex'))")"

# Generate password hash
ADMIN_PASSWORD_HASH=$(node -e "
const bcrypt = require('bcrypt');
bcrypt.hash('${ADMIN_PASSWORD}', 10).then(hash => console.log(hash));
")

# Create .env file with SQLite configuration
cat > .env << EOF
# ============================================
# SERVER CONFIGURATION
# ============================================
HTTP_PORT=3001
P2P_PORT=6001
NODE_ENV=production

# ============================================
# SECURITY - PRODUCTION KEYS
# ============================================
API_KEY=${API_KEY}
ADMIN_USERNAME=${ADMIN_USERNAME}

# ============================================
# DATABASE CONFIGURATION (SQLite)
# ============================================
SQLITE_DB_PATH=./data/birilium.db
LEVELDB_PATH=./data/chainstate

# ============================================
# BLOCKCHAIN PARAMETERS
# ============================================
MAX_MEMPOOL_SIZE=10000
TX_EXPIRATION_TIME=3600000
MAX_BLOCK_SIZE=1000
MAX_BLOCK_SIZE_BYTES=1048576
INITIAL_DIFFICULTY=4
TARGET_BLOCK_TIME=30000
DIFFICULTY_ADJUSTMENT_INTERVAL=10

# ============================================
# P2P NETWORK
# ============================================
PEERS=
MAX_PEERS=32
P2P_RATE_LIMIT=100
P2P_BAN_SCORE=100

# P2P TLS/WSS Encryption
ENABLE_P2P_TLS=false

# Node Identity
NODE_PRIVATE_KEY=${NODE_PRIVATE_KEY}

# ============================================
# LOGGING
# ============================================
LOG_LEVEL=info
LOG_FILE=./logs/node.log

# ============================================
# RATE LIMITING (API)
# ============================================
RATE_LIMIT_MAX=100
MINING_RATE_LIMIT_MAX=10

# ============================================
# CORS
# ============================================
CORS_ORIGINS=*

# ============================================
# MONITORING
# ============================================
METRICS_ENABLED=true
METRICS_PATH=/metrics

# ============================================
# JWT AUTHENTICATION (Admin Panel)
# ============================================
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=1y
JWT_REFRESH_EXPIRES_IN=1y

# Admin password hash (bcrypt)
ADMIN_PASSWORD_HASH=${ADMIN_PASSWORD_HASH}

# ============================================
# PAYPAL CONFIGURATION (Optional)
# ============================================
PAYPAL_MODE=live
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_PLAN_ID=

# Contact Form Email Configuration (Optional)
CONTACT_EMAIL=
CONTACT_EMAIL_PASSWORD=
EOF

# Create necessary directories
mkdir -p logs
mkdir -p data

echo "✓ Environment configured"
echo ""
echo "==================================="
echo "SAVE THESE CREDENTIALS:"
echo "==================================="
echo "Admin Username: ${ADMIN_USERNAME}"
echo "Admin Password: ${ADMIN_PASSWORD}"
echo "API Key: ${API_KEY}"
echo "==================================="
echo ""
echo "Admin Panel: http://${SERVER_IP}:3001/admin"
echo "==================================="
echo ""
ENDSSH

echo -e "${GREEN}✓ Environment configured${NC}"
echo ""

# Setup firewall
echo -e "${BLUE}Step 5: Configuring firewall...${NC}"
ssh root@${SERVER_IP} << 'ENDSSH'
set -e

# Check if UFW is already configured
if ufw status | grep -q "Status: active"; then
    echo "UFW already active, updating rules..."
else
    echo "Configuring UFW..."
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
fi

# Allow SSH (IMPORTANT!)
ufw allow 22/tcp

# Allow HTTP API
ufw allow 3001/tcp

# Allow P2P
ufw allow 6001/tcp

# Enable firewall
ufw --force enable

echo "✓ Firewall configured"
ENDSSH

echo -e "${GREEN}✓ Firewall configured${NC}"
echo ""

# Start the node
echo -e "${BLUE}Step 6: Starting Birilium node...${NC}"
ssh root@${SERVER_IP} << 'ENDSSH'
set -e

cd Birilium/wallet/node-backend

# Stop old process if running
pm2 delete birilium-node 2>/dev/null || true

# Start the node with PM2
pm2 start node.js --name birilium-node --time

# Save PM2 config
pm2 save

# Setup startup script (only if not already configured)
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo "✓ Node started with PM2"
ENDSSH

echo -e "${GREEN}✓ Node started${NC}"
echo ""

# Verify deployment
echo -e "${BLUE}Step 7: Verifying deployment...${NC}"
echo "Waiting for node to start..."
sleep 8

curl -s http://${SERVER_IP}:3001/health > /dev/null && {
    echo -e "${GREEN}✓ Node is accessible at http://${SERVER_IP}:3001${NC}"
    echo ""
    echo "Fetching node stats..."
    curl -s http://${SERVER_IP}:3001/api/stats | python3 -m json.tool 2>/dev/null || curl -s http://${SERVER_IP}:3001/api/stats
} || {
    echo -e "${RED}⚠ Node might not be accessible yet. Checking logs...${NC}"
    ssh root@${SERVER_IP} "pm2 logs birilium-node --lines 30 --nostream"
}

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   DEPLOYMENT COMPLETE! 🎉${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Your Birilium seed node is now running!"
echo ""
echo -e "${YELLOW}Node Details:${NC}"
echo "  HTTP API: http://${SERVER_IP}:3001"
echo "  P2P Port: ws://${SERVER_IP}:6001"
echo "  Health: http://${SERVER_IP}:3001/health"
echo "  Stats: http://${SERVER_IP}:3001/api/stats"
echo "  Admin Panel: http://${SERVER_IP}:3001/admin"
echo ""
echo -e "${YELLOW}Useful Commands:${NC}"
echo "  SSH: ssh root@${SERVER_IP}"
echo "  Logs: ssh root@${SERVER_IP} 'pm2 logs birilium-node'"
echo "  Restart: ssh root@${SERVER_IP} 'pm2 restart birilium-node'"
echo "  Status: ssh root@${SERVER_IP} 'pm2 status'"
echo ""
echo -e "${YELLOW}Test Your Node:${NC}"
echo "  curl http://${SERVER_IP}:3001/health"
echo "  curl http://${SERVER_IP}:3001/api/stats"
echo ""
echo "Credentials saved on server: ~/Birilium/wallet/node-backend/.env"
echo ""
