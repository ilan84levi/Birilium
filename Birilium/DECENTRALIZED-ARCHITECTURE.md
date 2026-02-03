# Birilium Decentralized Architecture

## Overview

This document explains the decentralized architecture implemented for Birilium cryptocurrency, including client-side mining and multi-node support.

---

## What Was Built

### 1. Decentralized Mining (Client-Side Proof-of-Work)

**Problem Solved:** Previously, mining happened on the server. If 1000 users mined simultaneously, the server would crash.

**Solution:** Mining now happens on each user's computer. The server only validates and records blocks.

#### How It Works:

```
USER'S COMPUTER                              SERVER
┌─────────────────────┐                    ┌─────────────────┐
│   Birilium Wallet   │                    │  Birilium Node  │
│                     │                    │                 │
│ 1. Request template │ ─────────────────► │                 │
│                     │ ◄───────────────── │ 2. Send template│
│                     │                    │    (prevHash,   │
│ 3. Mine locally     │                    │     difficulty) │
│    (find nonce)     │                    │                 │
│                     │                    │                 │
│ 4. Found block!     │ ─────────────────► │ 5. Validate     │
│    Submit to server │                    │    block        │
│                     │ ◄───────────────── │ 6. Add to chain │
│ 7. Receive reward   │                    │    Send reward  │
└─────────────────────┘                    └─────────────────┘
```

#### Files Changed:

| File | Changes |
|------|---------|
| `node-backend/node.js` | Added `/api/mining/template`, `/api/mining/submit`, `/api/mining/stats` endpoints |
| `wallet/renderer-wallet.js` | Replaced server mining with local CPU mining |
| `wallet/mining-worker.js` | Mining worker module (created but using in-process mining instead) |

#### API Endpoints:

**GET `/api/mining/template?minerAddress=XXX`**
Returns block template for mining:
```json
{
  "index": 150,
  "previousHash": "0000abc123...",
  "timestamp": 1706400000000,
  "transactions": [...],
  "difficulty": 4,
  "target": "0000",
  "miningReward": 50
}
```

**POST `/api/mining/submit`**
Submit a mined block:
```json
{
  "block": {
    "index": 150,
    "timestamp": 1706400000000,
    "transactions": [...],
    "previousHash": "0000abc123...",
    "nonce": 12345,
    "hash": "0000def456..."
  },
  "minerAddress": "BRL1abc..."
}
```

**GET `/api/mining/stats`**
Returns current mining statistics.

---

### 2. Multi-Node Architecture (Node-to-Node Sync)

**Problem Solved:** Single server = single point of failure. If your server dies, the entire network stops.

**Solution:** Multiple nodes that sync with each other. If one dies, others continue.

#### Architecture:

```
                    ┌─────────────┐
                    │   Node 1    │
                    │ (Primary)   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  Node 2  │ │  Node 3  │ │  Node 4  │
        │ (Backup) │ │ (Backup) │ │(Community)│
        └──────────┘ └──────────┘ └──────────┘
              ▲            ▲            ▲
              │            │            │
              └────────────┼────────────┘
                           │
                    ┌──────┴──────┐
                    │   Wallets   │
                    │ (connect to │
                    │  any node)  │
                    └─────────────┘
```

#### Files Created/Changed:

| File | Purpose |
|------|---------|
| `node-backend/peer-sync.js` | **NEW** - Node-to-node sync module |
| `node-backend/node.js` | Added peer sync initialization and API endpoints |
| `node-backend/.env.example` | Added peer configuration options |
| `wallet/renderer-wallet.js` | Added multi-node fallback support |

#### New API Endpoints (Node-to-Node):

**GET `/api/node/info`**
Returns node information:
```json
{
  "nodeId": "node1",
  "nodeUrl": "https://api.birilium.com",
  "chainHeight": 150,
  "peers": 2,
  "version": "1.0.0"
}
```

**GET `/api/node/blocks?from=X&to=Y`**
Get blocks in range for sync:
```json
{
  "from": 100,
  "to": 150,
  "blocks": [...],
  "hasMore": false
}
```

**POST `/api/node/block`**
Receive block from peer node:
```json
{
  "block": {...},
  "fromNode": "node2"
}
```

**GET `/api/node/peers`**
Get list of known peers.

**POST `/api/node/peers`**
Share peer information.

---

### 3. Wallet Multi-Node Fallback

**Problem Solved:** If the server the wallet connects to goes down, the wallet stops working.

**Solution:** Wallet has a list of known nodes and automatically switches if one fails.

#### How It Works:

```javascript
// Wallet's known nodes list
this.knownNodes = [
    { url: 'http://localhost:3001', name: 'Local Node', priority: 1 },
    { url: 'https://api.birilium.com', name: 'Main Server', priority: 2 },
    // Add more nodes as network grows:
    // { url: 'https://node2.birilium.com', name: 'Node 2', priority: 3 },
];
```

#### Fallback Flow:

1. Wallet tries to connect to nodes in priority order
2. If connected node fails during operation, wallet automatically tries next node
3. User sees which node they're connected to in status bar
4. Mining and transactions continue seamlessly

---

## Configuration

### Node Configuration (`.env`)

```bash
# Node Identity
NODE_ID=node1
NODE_URL=https://api.birilium.com

# Peer Nodes (comma-separated)
PEER_NODES=https://node2.birilium.com,https://node3.birilium.com
```

### Adding a New Node

**Step 1: Set up new server**
- Any VPS works ($5-10/month)
- Install Node.js 18+
- Clone the node-backend code

**Step 2: Configure the new node's `.env`**
```bash
NODE_ID=node2
NODE_URL=https://node2.birilium.com
PEER_NODES=https://api.birilium.com
```

**Step 3: Configure existing node to know about new node**
```bash
# On Node 1's .env
PEER_NODES=https://node2.birilium.com
```

**Step 4: Update wallet's known nodes**
```javascript
// In renderer-wallet.js
this.knownNodes = [
    { url: 'http://localhost:3001', name: 'Local Node', priority: 1 },
    { url: 'https://api.birilium.com', name: 'Main Server', priority: 2 },
    { url: 'https://node2.birilium.com', name: 'Node 2', priority: 3 },
];
```

**Step 5: Rebuild wallet and distribute**

---

## How Sync Works

### Initial Sync (New Node Joins)

```
New Node                           Existing Node
    │                                    │
    │  GET /api/node/info               │
    │ ──────────────────────────────────►│
    │                                    │
    │  { chainHeight: 500 }             │
    │ ◄──────────────────────────────────│
    │                                    │
    │  GET /api/node/blocks?from=0&to=100│
    │ ──────────────────────────────────►│
    │                                    │
    │  { blocks: [...] }                │
    │ ◄──────────────────────────────────│
    │                                    │
    │  (repeat until caught up)         │
    │                                    │
```

### Block Propagation (New Block Mined)

```
Miner Wallet          Node 1              Node 2              Node 3
     │                   │                   │                   │
     │ Submit block      │                   │                   │
     │ ─────────────────►│                   │                   │
     │                   │                   │                   │
     │                   │ POST /api/node/block                  │
     │                   │ ─────────────────►│                   │
     │                   │                   │                   │
     │                   │ POST /api/node/block                  │
     │                   │ ─────────────────────────────────────►│
     │                   │                   │                   │
     │ Success + Reward  │                   │                   │
     │ ◄─────────────────│                   │                   │
```

---

## Comparison: Before vs After

| Aspect | Before | After |
|--------|--------|-------|
| Mining location | Server (centralized) | User's computer (decentralized) |
| Server CPU usage | Very high during mining | Low (only validation) |
| Scalability | ~10-50 miners max | Unlimited miners |
| Single point of failure | Yes (one server) | No (multiple nodes) |
| Network resilience | Server down = network down | One node down = others continue |
| User requirements | None | CPU for mining (any modern computer) |

---

## Version History

| Version | Changes |
|---------|---------|
| 1.4.0 | Admin panel, wallet tracking |
| 1.4.1 | Decentralized mining (client-side) |
| 1.4.2 | Multi-node architecture, auto-failover |

---

## Files Summary

### New Files Created

| File | Purpose |
|------|---------|
| `node-backend/peer-sync.js` | Node-to-node synchronization module |
| `DECENTRALIZED-ARCHITECTURE.md` | This documentation |

### Modified Files

| File | Changes |
|------|---------|
| `node-backend/node.js` | Added mining APIs, peer sync APIs, peer broadcast |
| `node-backend/.env.example` | Added NODE_ID, NODE_URL, PEER_NODES config |
| `wallet/renderer-wallet.js` | Client-side mining, multi-node fallback |
| `wallet/package.json` | Version bumped to 1.4.2 |

---

## Deployment Checklist

### To Deploy Updated Server:

1. Upload `node-backend/node.js` to server
2. Upload `node-backend/peer-sync.js` to server
3. Update `.env` with peer configuration (if adding nodes)
4. Restart: `pm2 restart birilium-node`

### To Deploy Updated Wallet:

1. Upload to GitHub releases:
   - `Birilium Wallet Setup 1.4.2.exe`
   - `Birilium-Wallet-1.4.2-Portable-Win64.zip`
2. Update download links on website

---

## Future Improvements

1. **Automatic peer discovery** - Nodes find each other without manual configuration
2. **DHT (Distributed Hash Table)** - Decentralized peer discovery like BitTorrent
3. **Light node mode** - Run a node without full blockchain storage
4. **Mobile wallet** - iOS/Android apps connecting to public nodes

---

## Technical Details

### Mining Algorithm
- SHA256 proof-of-work
- Difficulty adjusts based on block time
- Target: `0` repeated `difficulty` times (e.g., difficulty 4 = "0000")

### Block Validation
1. Check block index is sequential
2. Check previousHash matches latest block
3. Recalculate hash and verify it matches
4. Verify proof-of-work (hash starts with target)
5. Verify coinbase transaction doesn't exceed reward

### Sync Conflict Resolution
- Longest valid chain wins
- If peer has longer chain, download and validate blocks
- Invalid blocks are rejected
