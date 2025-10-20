# Birilium P2P Network - Production TLS Setup Guide

This guide walks you through enabling Mutual TLS (mTLS) for your Birilium blockchain network going production. mTLS encrypts all P2P traffic and ensures only authorized nodes can join your network.

---

## Quick Start (2 Steps)

### Step 1: Generate Your Certificate Authority (CA)
```bash
cd Birilium
node generate-certs.js ca
```

**Output:**
- `certs/ca-cert.pem` - Share with all nodes
- `certs/ca-key.pem` - ⚠️ KEEP SECURE (store in vault/HSM)

### Step 2: Generate Node Certificates
For each node, run:
```bash
# node1 with DNS name and IP
node generate-certs.js signed node1 node1.birilium.net 203.0.113.10

# node2 with different DNS/IP
node generate-certs.js signed node2 node2.birilium.net 203.0.113.11

# Multiple DNS names/IPs (comma-separated)
node generate-certs.js signed seed1 seed1.birilium.net,seed1-backup.birilium.net 203.0.113.20,203.0.113.21
```

**Output for each node:**
- `certs/node{N}-cert.pem` - Node's public certificate
- `certs/node{N}-key.pem` - Node's private key

---

## Production Deployment Checklist

### ✅ Infrastructure Setup

```bash
# 1. Deploy 3 stable seed nodes (bootstrap nodes)
# Seed nodes should have:
# - Static IPs or stable DNS (no dynamic IPs)
# - Firewall rules allowing P2P port 6001
# - Uptime monitoring and automatic restart
# - Regular backup of blockchain state

# 2. Example: Deploy seed nodes across 3 different regions
Seed Node 1: seed1.birilium.net (US East)
Seed Node 2: seed2.birilium.net (Europe)
Seed Node 3: seed3.birilium.net (Asia-Pacific)
```

### ✅ Certificate Installation

**On each node server:**

```bash
# Copy your .env configuration
cp .env.example .env

# Add your seed nodes to PEERS (step 4 below)
PEERS=wss://seed1.birilium.net:6001,wss://seed2.birilium.net:6001,wss://seed3.birilium.net:6001

# Copy generated certificates to secure location
mkdir -p /etc/birilium/tls
chmod 700 /etc/birilium/tls

# Copy CA certificate (public - distribute to all)
cp certs/ca-cert.pem /etc/birilium/tls/ca-cert.pem
chmod 644 /etc/birilium/tls/ca-cert.pem

# Copy node certificate and key
cp certs/node1-cert.pem /etc/birilium/tls/node-cert.pem
cp certs/node1-key.pem /etc/birilium/tls/node-key.pem
chmod 600 /etc/birilium/tls/node-key.pem
chmod 644 /etc/birilium/tls/node-cert.pem
```

### ✅ Environment Configuration

**Production .env settings:**

```bash
# ========== ENABLE PRODUCTION TLS ==========
ENABLE_P2P_TLS=true

# Certificate paths (absolute paths recommended)
TLS_CERT_PATH=/etc/birilium/tls/node-cert.pem
TLS_KEY_PATH=/etc/birilium/tls/node-key.pem

# CA certificate path (for mTLS peer verification)
P2P_TLS_CA_CERT=/etc/birilium/tls/ca-cert.pem

# Enable mutual TLS (verify peer certificates)
# Set to true for mainnet, false for testnet
P2P_TLS_REQUIRE_CLIENT_CERT=true

# ========== NETWORK CONFIGURATION ==========
HTTP_PORT=3001
P2P_PORT=6001

# Bootstrap seed nodes (comma-separated, wss:// for TLS)
PEERS=wss://seed1.birilium.net:6001,wss://seed2.birilium.net:6001,wss://seed3.birilium.net:6001

# Network parameters
MAX_PEERS=32
P2P_RATE_LIMIT=100
P2P_BAN_SCORE=100

# ========== SECURITY ==========
# Generate strong API key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
API_KEY=your_strong_random_key_here

# Change admin credentials
ADMIN_USERNAME=your_admin_user
ADMIN_PASSWORD=your_strong_admin_password

# ========== LOGGING & MONITORING ==========
LOG_LEVEL=info
LOG_FILE=/var/log/birilium/node.log
METRICS_ENABLED=true
METRICS_PATH=/metrics
```

---

## Firewall Configuration

**Allow only necessary ports:**

```bash
# Linux (iptables)
iptables -A INPUT -p tcp --dport 6001 -m state --state NEW,ESTABLISHED -j ACCEPT  # P2P
iptables -A INPUT -p tcp --dport 3001 -s 127.0.0.1 -j ACCEPT                      # HTTP API (localhost only)

# Alternatively with ufw
ufw allow 6001/tcp comment "Birilium P2P"
ufw allow from 127.0.0.1 to 127.0.0.1 port 3001 comment "Birilium API"

# Windows Firewall
netsh advfirewall firewall add rule name="Birilium P2P" dir=in action=allow protocol=tcp localport=6001
```

---

## Certificate Rotation (Annual)

Certificates expire after 1 year. Plan for rotation:

```bash
# 30 days before expiration, generate new certificates
node generate-certs.js signed node1 node1.birilium.net 203.0.113.10 > new-cert.pem
mv new-cert.pem certs/node1-cert.pem

# In a rolling update:
# 1. Update one node with new cert
# 2. Wait 5 minutes (let it reconnect to all peers)
# 3. Update next node
# 4. Repeat until all nodes updated
```

---

## Testing Your Setup

### Test 1: Verify Certificates

```bash
# Check CA certificate validity
openssl x509 -in certs/ca-cert.pem -text -noout

# Check node certificate
openssl x509 -in certs/node1-cert.pem -text -noout

# Verify cert chain
openssl verify -CAfile certs/ca-cert.pem certs/node1-cert.pem
```

### Test 2: Local Connection Test (2 nodes)

**Terminal 1 (Node 1):**
```bash
export ENABLE_P2P_TLS=true
export P2P_TLS_REQUIRE_CLIENT_CERT=true
npm start
```

**Terminal 2 (Node 2):**
```bash
export ENABLE_P2P_TLS=true
export P2P_TLS_REQUIRE_CLIENT_CERT=true
export P2P_PORT=6002  # Different port
export PEERS=wss://localhost:6001
npm start
```

Expected logs:
```
[P2P] Secure WebSocket server (WSS with mTLS) listening on port: 6001
[P2P] Connected to peer: wss://localhost:6001 (CN: node1)
```

### Test 3: Health Check Endpoint

```bash
curl http://localhost:3001/health

# Should show:
{
  "status": "healthy",
  "peers": 1,  # Should increase as peers connect
  "blockchain": { ... },
  ...
}
```

### Test 4: Peer Information

```bash
curl http://localhost:3001/api/peers

# Should show connected peers:
[
  {
    "nodeId": "abc123def...",
    "version": "2.1.0",
    "connectedAt": "2025-10-17T10:30:00Z"
  }
]
```

---

## Monitoring & Operations

### Key Monitoring Points

1. **Certificate Expiration** (30 days before)
   ```bash
   # Check certificate dates
   openssl x509 -in /etc/birilium/tls/node-cert.pem -noout -dates

   # Set calendar alert for rotation
   ```

2. **P2P Network Health**
   ```bash
   # Via API endpoint
   curl http://localhost:3001/api/p2p/stats

   # Via Prometheus metrics
   curl http://localhost:3001/metrics | grep p2p
   ```

3. **TLS Connection Logs**
   ```bash
   # Monitor P2P connections
   tail -f /var/log/birilium/node.log | grep P2P

   # Look for mTLS certificate validation
   tail -f /var/log/birilium/node.log | grep "CN:"
   ```

### Log Examples

**Successful mTLS Connection:**
```
[P2P] Secure WebSocket server (WSS with mTLS) listening on port: 6001
[P2P] Connection from 203.0.113.15 (CN: seed2)
[P2P] Incoming connection from 203.0.113.15
```

**Certificate Verification Failure:**
```
[P2P] Connection failed to wss://untrusted.node:6001:
     CERTIFICATE_VERIFY_FAILED: self signed certificate
```

**Ban Score System:**
```
[P2P] Rate limit exceeded for abc123def...
[P2P] Peer banned: abc123def... (ban score: 150)
```

---

## Security Best Practices

### ✅ DO

- ✅ Store `ca-key.pem` in an HSM or vault (HashiCorp Vault, AWS KMS)
- ✅ Use strong admin credentials (32+ character random)
- ✅ Rotate certificates annually
- ✅ Monitor peer connections for unusual activity
- ✅ Keep private keys with 0600 permissions (Unix) / encrypted (Windows)
- ✅ Use DNS names instead of IP addresses (easier rotation)
- ✅ Isolate P2P networks from public internet (VPN or private networks)

### ❌ DON'T

- ❌ Commit `ca-key.pem` to version control
- ❌ Share node private keys across nodes
- ❌ Use self-signed certificates for production mainnet
- ❌ Expose API ports to the internet without authentication
- ❌ Disable certificate verification in production
- ❌ Use default admin credentials

---

## Troubleshooting

### Issue: "CERTIFICATE_VERIFY_FAILED"

**Cause:** Peer certificate not signed by your CA

**Solution:**
```bash
# Regenerate peer certificate with your CA
node generate-certs.js signed node1 node1.birilium.net 203.0.113.10

# Verify the peer cert is signed by your CA
openssl verify -CAfile certs/ca-cert.pem certs/node1-cert.pem
# Should output: certs/node1-cert.pem: OK
```

### Issue: Peers not connecting

**Troubleshooting steps:**
```bash
# 1. Check if P2P port is accessible
netcat -zv seed1.birilium.net 6001

# 2. Check certificate format
openssl x509 -in certs/node-cert.pem -text -noout

# 3. Check node is listening
netstat -tlnp | grep 6001

# 4. Enable debug logging
LOG_LEVEL=debug npm start
```

### Issue: Certificate expiration warnings

**Prevention:**
```bash
# Set monitoring alert (example with Prometheus)
ALERT CertificateExpiring
  IF (certificate_expiry_time - time()) < 2592000  # 30 days
  THEN alert: "Certificate expires in 30 days"

# Manual check
openssl x509 -in /etc/birilium/tls/node-cert.pem -noout -dates
```

---

## Production Deployment Steps

### Phase 1: Staging (Week 1-2)
1. Generate CA and test certificates
2. Deploy 3 test nodes with mTLS enabled
3. Monitor for 1 week - verify stability
4. Run network stress tests
5. Verify peer rotation and ban system

### Phase 2: Testnet (Week 3-4)
1. Deploy public testnet with 3 seed nodes
2. Open to community participation
3. Test node onboarding and certificate validation
4. Gather feedback on peer discovery

### Phase 3: Mainnet (Week 5+)
1. Generate production CA (offline storage)
2. Deploy 3-5 stable seed nodes across regions
3. Publish CA certificate and seed node addresses
4. Enable `P2P_TLS_REQUIRE_CLIENT_CERT=true`
5. Monitor network health continuously

---

## Reference: Command Reference

```bash
# Certificate Generation
node generate-certs.js ca                                              # Generate CA
node generate-certs.js signed node1 dns.name 203.0.113.10              # Generate node cert

# Certificate Inspection
openssl x509 -in certs/ca-cert.pem -text -noout                       # View CA cert
openssl x509 -in certs/node1-cert.pem -noout -dates                   # View expiration
openssl verify -CAfile certs/ca-cert.pem certs/node1-cert.pem        # Verify chain

# Network Testing
curl http://localhost:3001/health                                      # Health check
curl http://localhost:3001/api/peers                                   # List peers
curl http://localhost:3001/api/p2p/stats                               # P2P stats
curl http://localhost:3001/metrics                                     # Prometheus metrics

# Server Management
npm start                                                               # Start node
npm test                                                                # Run tests
node generate-certs.js self-signed                                     # Dev cert

# Port Testing
netstat -tlnp | grep 6001                                              # Check if listening
netcat -zv seed1.birilium.net 6001                                     # Test connectivity
```

---

## Support & Documentation

- **Security Issues:** Report to security@birilium.net
- **Deployment Help:** Check logs in `./logs/node.log`
- **Network Issues:** Enable `LOG_LEVEL=debug` for detailed output
- **Source Code:** `./node.js` - P2P initialization (line 791)

---

**Version:** 2.1.0
**Last Updated:** 2025-10-17
**Status:** Production Ready
