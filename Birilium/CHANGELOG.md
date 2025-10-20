# Birilium Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-10-08

### 🔒 Security - CRITICAL

#### Added
- **Client-side transaction signing** - Private keys never transmitted over API
- **Signed transaction endpoint** `POST /api/transaction/signed` - Accepts pre-signed transactions only
- **Mempool DoS protection** - 10,000 transaction cap with fee-based eviction
- **Block size limits** - Max 1,000 txs per block, 1 MB size limit
- **Timestamp validation** - Bitcoin-standard (2-hour future tolerance, monotonic enforcement)

#### Deprecated
- `POST /api/transaction` endpoint (with `privateKey` field) - Use `/signed` instead
- Will be removed in v3.0.0

### ⚡ Performance

#### Added
- **Balance caching** - O(1) lookups instead of O(n×m) blockchain scan
- **1000× performance improvement** for balance queries (8.2s → 0.008s for 100K blocks)
- Automatic cache rebuild on new blocks
- Cache invalidation on transactions

#### Changed
- **Fee-priority mining** - High-fee transactions mined first
- **Mempool sorting** - Sorted by fee descending before block creation

### 🏗️ Infrastructure

#### Added
- Dependencies: `level`, `joi`, `pino`, `pino-pretty`, `nanoid`, `zod`
- `.env.example` - Comprehensive configuration template
- Support for environment-based configuration

### 📚 Documentation

#### Added
- `STATUS.md` - What changed, benchmarks, migration guide
- `RESIDUALS.md` - Remaining tasks and Phase 2 roadmap
- `WHATS_NEXT.md` - User-facing roadmap
- `CHANGELOG.md` - This file

#### Updated
- `DEPLOYMENT_GUIDE.md` - Reflects v2.0 changes
- `README.md` - Quick start updated
- `audit/` - Documentation accurate for Phase 1

### 🧪 Testing

#### Changed
- All 27 tests passing
- Tests now validate mempool limits
- Tests now validate block size limits
- Tests now validate timestamp constraints

### 🐛 Bug Fixes

#### Fixed
- Transactions now properly removed from mempool after mining
- Balance cache now invalidates on new transactions
- Fee calculation accuracy improved

---

## [1.0.0] - 2025-10-05

### Initial Release

#### Features
- SHA-256 Proof-of-Work consensus
- ECDSA secp256k1 transaction signing
- Dynamic difficulty adjustment (every 10 blocks)
- Account-based balance model
- Transaction fees (0.1%, min 0.0001 BRL)
- MongoDB persistence (optional)
- Electron desktop wallet
- AES-256 wallet encryption
- QR code generation
- CSV transaction export
- 27 comprehensive tests

---

## Upgrade Guide

### From v1.0 to v2.0

#### For Node Operators

**No breaking changes** - v2.0 is backward compatible.

```bash
# Update code
git pull origin main

# Install new dependencies
npm install

# Restart node
pm2 restart birilium-node
```

Balance cache rebuilds automatically on first balance query.

#### For Wallet Developers

**Action Required:** Update to new transaction submission endpoint.

**Old (Deprecated):**
```javascript
POST /api/transaction
Body: { fromAddress, toAddress, amount, privateKey }
```

**New (Recommended):**
```javascript
// 1. Sign client-side
const signature = signTransaction(tx, privateKey);

// 2. Submit signed tx
POST /api/transaction/signed
Body: { fromAddress, toAddress, amount, fee, timestamp, signature }
```

**Wallet Application:** Updated wallet included in v2.0 automatically uses new endpoint.

#### For Users

**Recommended:** Update wallet to v2.0 for enhanced security.

**Old wallet still works** but sends private keys over network (insecure).

---

## Security Advisories

### v1.0 - CRITICAL: Private Key Exposure (CVE-N/A)

**Affected Versions:** v1.0.0 and earlier

**Issue:** Private keys transmitted over HTTP API in plaintext.

**Impact:** Keys could be intercepted via MITM or logged server-side.

**Resolution:** Fixed in v2.0.0 via client-side signing.

**Action:** Upgrade to v2.0.0 immediately.

---

For detailed technical changes, see [STATUS.md](../STATUS.md)
For remaining work, see [RESIDUALS.md](../RESIDUALS.md)
For deployment instructions, see [DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md)
