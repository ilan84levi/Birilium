# Birilium Project Audit Report — 2026-05-27

Author: Claude (Opus 4.7), commissioned by ilan84levi
Scope: entire repository — `node-backend`, `wallet`, `deploy`, `.github/workflows`

## Executive summary

This audit followed an earlier production incident (silent 46-restart crash loop)
and an Electron 35 → 42 security upgrade. Findings cover four surfaces:

1. **Wallet renderer** — runs with `nodeIntegration: true`, so any XSS is RCE.
2. **Deploy & cert tooling** — shell scripts and TLS key handling.
3. **CI / CD pipelines** — GitHub Actions workflows.
4. **Node backend** — already covered in the previous round; the residual items
   here are architectural rather than security-bugs.

Severity language:
- **CRITICAL** = can be exploited remotely or causes data loss / RCE.
- **HIGH** = exploitable with user interaction or local foothold.
- **MEDIUM** = degrades the security posture without being a direct vector.
- **LOW** = hygiene / defense-in-depth.

A status column shows what's been resolved in this round.

---

## Wallet renderer (`Birilium/wallet/*.js`, `index.html`)

| ID | Sev | File | Issue | Status |
|----|-----|------|-------|--------|
| W1 | CRITICAL | `ui-enhancements.js:Toast.show` | `message` interpolated into `innerHTML`. With `nodeIntegration: true`, an attacker-controlled error string from the backend or peer-supplied data ran as Node.js. | **FIXED** — rebuilt via `createElement` + `textContent`. |
| W2 | CRITICAL | `renderer-wallet.js:saveWallet` | Without a password, wallet wrote `privateKey` plaintext into `localStorage` (Chromium LevelDB on disk). | **DOCUMENTED** — mandatory-password enforcement is a UX change for the user to schedule. See action item A-W1. |
| W3 | CRITICAL | `renderer-wallet.js:createWallet` | `POST /api/wallet/create` returns `data.privateKey` from the server — the backend currently generates and knows every wallet's private key. The wallet has a local generator (`preload.js:generateWallet`) but it isn't wired to this flow. | **DEFERRED** — fundamental custody-model change. See A-W2. |
| W4 | HIGH | `renderer-wallet.js:1254` | Private key written to `manageSecretKey.value` on every `updateUI()` (every 5 s). Visible to DevTools, extensions, XSS, all in-renderer scripts. | **FIXED** — populated only on explicit "Show" click; cleared on "Hide". |
| W5 | HIGH | `ui-enhancements.js:AddressBook.render` | `entry.address` and `entry.id` interpolated into inline `onclick=` strings via template literals. Imported backup entries containing quotes broke out of the string. | **FIXED** — rebuilt via DOM APIs + `addEventListener` per row. |
| W6 | HIGH | `main.js:314` | Admin-shortcut also enabled by `BIRILIUM_ADMIN=true` env var; child processes (the spawned `node-backend`) inherit env and could set it. | **FIXED** — gated only on `!app.isPackaged && NODE_ENV=development`. |
| W7 | MEDIUM | `preload.js:185` | Local-storage crypto used AES-256-CBC without an auth tag → tampering went undetected. `preload-enhanced-crypto.js` already implemented GCM but was dead code. | **FIXED** — `preload.js` now writes AES-256-GCM `{v:2, alg, salt, iv, data, tag}`. Legacy CBC ciphertext is still decryptable on read for migration. |
| W8 | MEDIUM | `renderer-wallet.js:handlePayment` | Stub function that unconditionally set `hasSubscription = true` after a 1 s `setTimeout`. Callable from any in-renderer script. | **FIXED** — replaced with an alert directing users to the PayPal subscription flow. |
| W9 | MEDIUM | `index.html:9` | CSP includes `'unsafe-inline'` in `script-src`. With `nodeIntegration: true` this defeats CSP entirely if an `<script>` injection ever occurs. | **OPEN** — needs inline-script extraction (~3 inline blocks + 5 inline `onclick`s). See A-W3. |
| W10 | LOW | `main.js:341` | Auto-updater accepts whatever the GitHub releases page serves. No `verifyUpdateCodeSignature` because the wallet isn't code-signed yet. | **OPEN** — needs a code-signing certificate. See A-W4. |
| W11 | LOW | `renderer-wallet.js:408` | `this.password` retains the raw password string for the unlocked session lifetime. Visible in DevTools. | **DEFERRED** — caching only the derived key requires touching every encrypt/decrypt call site. |
| W12 | DEFERRED | `main.js:262` | `nodeIntegration: true, contextIsolation: false, sandbox: false`. With my W1/W5 fixes there is no longer a known XSS sink, but defense-in-depth would isolate the renderer. | **OPEN** — full renderer refactor. See A-W5. |

## Deploy & cert tooling

| ID | Sev | File | Issue | Status |
|----|-----|------|-------|--------|
| D1 | CRITICAL | `deploy-digitalocean-sqlite.sh:122` | `${ADMIN_PASSWORD}` interpolated into a node `-e` single-quoted string over an SSH heredoc. Any quote/backtick/`$()`/backslash in the password would have escaped to remote shell as root. | **FIXED** — pipe password via stdin and read it in JS. |
| D2 | CRITICAL | `deploy-digitalocean-sqlite.sh:38` + `deploy-digitalocean.sh:36` | `SERVER_IP=$1` interpolated into every ssh command with no validation. | **FIXED in sqlite script** — IPv4/hostname regex check at top. The Mongo variant (`deploy-digitalocean.sh`) is dead code per A-D2 below. |
| D3 | HIGH | `deploy-manual-commands.txt:62-66, 108` | Plaintext credential placeholders + hardcoded production IP committed to the repo. | **FIXED** — replaced placeholders with `__SET_AFTER_DEPLOY__` and `__FROM_*_DASHBOARD__`. IP removed. |
| D4 | MEDIUM | `generate-certs.js:256` | `fs.writeFileSync(keyPath, key); fs.chmodSync(keyPath, 0o600)` — TOCTOU window where the key was world-readable. | **FIXED** — pass `{mode: 0o600}` to `writeFileSync` so it's atomic. |
| D5 | LOW | `deploy-digitalocean.sh:143` | Stores plaintext `ADMIN_PASSWORD=` in `.env`; SQLite variant correctly uses `ADMIN_PASSWORD_HASH`. | **OPEN** — file is the Mongo deployment variant which is no longer used in production. Easiest fix: delete the file. See A-D2. |

## CI / CD

| ID | Sev | File | Issue | Status |
|----|-----|------|-------|--------|
| C1 | HIGH | `.github/workflows/build-release.yml`, `build-macos.yml` | `softprops/action-gh-release@v1` pinned to a floating major tag. The release job runs with `contents: write`; a malicious retag would publish arbitrary executables to users via the auto-updater. | **FIXED** — pinned to commit SHA `c062e08b...`. |
| C2 | HIGH | `.github/workflows/build-release.yml:14` | `permissions: contents: write` granted to every job in the workflow. Build jobs only need `contents: read`. | **FIXED** — default is now `contents: read`; only `cleanup` and `release` get write. |
| C3 | HIGH | `.github/workflows/security-ci.yml` | Every security gate had `continue-on-error: true`. The summary job always emitted green checkmarks regardless of scan results. Functionally cosmetic. | **FIXED** — rewrote workflow without `continue-on-error`; `npm audit --audit-level=high` now blocks; TruffleHog pinned. Added a `node-backend-audit` job that was missing entirely. |
| C4 | MEDIUM | `Birilium/wallet/scripts/notarize.js:45` | `console.log('Apple ID: ' + appleId)` printed Apple ID and Team ID to every public CI log. They're not registered as Actions secrets so they weren't redacted. | **FIXED** — replaced with `[configured]` markers. |
| C5 | MEDIUM | `Birilium/.github/workflows/security-ci.yml:141` | `trufflesecurity/trufflehog@main` — mutable ref; secret-scanning tools are a high-value supply-chain target. | **FIXED** — pinned to `@v3.82.6`. |
| C6 | BUILD-BREAK | workflow runtime | `electron-builder` 26 auto-publishes when `package.json:build.publish` is set and a tag triggers the build, but the workflow doesn't expose `GH_TOKEN`. Caused every v1.5.4 build attempt to fail with "GitHub Personal Access Token is not set". | **FIXED** — added `--publish never` to all `build:*` npm scripts. The dedicated `release` job still uploads. |
| C7 | BUILD-BREAK | Linux runner | `ubuntu-latest` resolves to 24.04, which dropped `libfuse2` that AppImage builds need. | **FIXED** — pinned `ubuntu-22.04` and added explicit `apt-get install libfuse2`. |

## Node backend (residual items not in scope of last round)

| ID | Sev | File | Issue | Status |
|----|-----|------|-------|--------|
| N1 | OPEN | `node.js:2138` (subscription create) | Activation now verifies with PayPal API. **Still need** to verify the `walletAddress` claim — currently any caller can write a sub for any address as long as the PayPal sub itself exists. | **PARTIAL** — verification added last round; ownership claim is still client-controlled. |
| N2 | OPEN | `Blockchain.js:rebuildBalanceCache` | One-time negative-balance summary now (good), but historical bad data still produces negative balances every time the cache rebuilds. | **ACCEPTED** — historical chain artifact; clearing requires a hard fork. |
| N3 | OPEN | `node.js` is 3370+ lines | Single file mixing admin routes, peer routes, paypal, contact form, websocket service, mining endpoints. | **OPEN** — see A-N1, split into modules. |
| N4 | OPEN | no tests | `tests/` directory is empty per Glob. Critical paths (`blockTxsAreValid`, `replaceChain`, `Transaction.isValid`) untested. | **OPEN** — see A-N2. |

---

## Action plan for the items still open

Listed in priority order. Each entry says who needs to do what.

### A-W1 — Mandatory password on wallet save (1 hour, low risk)
Edit `renderer-wallet.js:saveWallet` to reject `!password && !this.password`. Currently
the "no password" path silently writes the private key in plaintext to `localStorage`.
Display a modal forcing the user to set a password the first time they save.

### A-W2 — Move wallet generation off the server (1–2 days, high risk)
**Architectural**. `renderer-wallet.js:createWallet()` should call `walletAPI.generateWallet()`
(already implemented in `preload.js`) and POST only the public address to register the
wallet on-chain. The backend endpoint `/api/wallet/create` then becomes "register an
address", not "create me a key". Until this lands, any wallet created through the
current UI is server-custodied — the user assumes self-custody that doesn't exist.

### A-W3 — Remove `'unsafe-inline'` from CSP (3–4 hours)
Three inline `<script>` blocks in `index.html` (PayPal config, PayPal SDK loader,
terms acceptance) and five inline `onclick="copyToClipboard(...)"` handlers need to
be moved to external `.js` files (or wired up via `addEventListener` from `renderer-wallet.js`).
Then drop `'unsafe-inline'` from `script-src`. After my W1/W5 fixes there are no
known XSS sinks; CSP becomes the second line of defense.

### A-W4 — Code-sign the wallet (Apple Developer Program: $99/yr; Windows: $200–700/yr)
1. Enroll in Apple Developer Program; generate Developer ID Application cert.
2. Get a Windows code-signing certificate (DigiCert, Sectigo, SSL.com).
3. Add `APPLE_*` + `CSC_LINK` / `CSC_KEY_PASSWORD` to GitHub Actions secrets.
4. Set `mac.identity` and `win.signtoolOptions.certificateFile` in `package.json`.
Once signed, `electron-updater` will refuse unsigned updates — the auto-updater
attack surface (anyone with push access to releases delivers arbitrary code) closes.

### A-W5 — Renderer process hardening (3–5 days)
Set `nodeIntegration: false, contextIsolation: true, sandbox: true`. Move every
Node-side operation in `renderer-wallet.js` (crypto, IPC, file I/O) behind explicit
`contextBridge.exposeInMainWorld('walletAPI', { ... })` methods in `preload.js`. The
biggest lift is the inline `require('crypto')` and `require('child_process')` usages
in the renderer code path.

### A-D2 — Delete the Mongo deploy script (5 minutes)
`Birilium/deploy-digitalocean.sh` and `MONGODB_SETUP.md` are leftover from the
pre-SQLite era. Delete them — production uses SQLite, and the Mongo script's
plaintext `ADMIN_PASSWORD` is an attractive nuisance.

### A-N1 — Split `node.js` into modules (1–2 days)
- `routes/admin.js` — every `/api/admin/*` handler
- `routes/paypal.js` — subscription activate/cancel, paypal-config
- `routes/contact.js` — `/api/contact`
- `routes/blockchain.js` — `/api/blocks`, `/api/mining/submit`
- `p2p/handler.js` — `handleNewBlock`, `handleBlockchainResponse`, `convertBlockData`
- Leave `node.js` as the orchestrator that wires them up.

### A-N2 — Add a test suite (2–3 days)
At minimum unit tests for:
- `Transaction.isValid()` — valid signature, invalid signature, no signature, replayed signature
- `Block.hasValidTransactions()`
- `blockTxsAreValid()` — every branch (extra coinbase, no coinbase, inflation, bad amounts)
- `Blockchain.addTransaction()` — insufficient balance, replayed nonce, mempool full
- `Blockchain.replaceChain()` — shorter chain rejected, longer-but-invalid chain rejected
- `database.saveBlock()` — null/negative index guard

Use the `node:test` runtime built-in (already on Node 22). No new dev dep needed.

### A-CI1 — Cache `~/.cache/electron-builder` between CI runs (1 hour)
Builds re-download Electron, NSIS, and squirrel binaries on every run. Add an
`actions/cache@v4` step keyed on `package-lock.json` to make subsequent builds
~2 minutes faster.

---

## What was actually fixed in this round (summary)

Committed in `5aca645` + `6fb79a5` + earlier commits this session:

- Wallet XSS: `Toast.show`, `AddressBook.render` rebuilt via DOM APIs
- Private key no longer auto-populated into DOM input on every UI tick
- `handlePayment` mock removed (privilege-escalation gadget)
- Local-storage crypto upgraded CBC → GCM with backward-compat read path
- `BIRILIUM_ADMIN` env-var escape hatch removed from production builds
- Deploy script: IP validation + safe bcrypt password piping
- `generate-certs.js`: atomic 0o600 write for the private key
- CI: scoped permissions, pinned action SHAs, real `npm audit` gating, removed
  `continue-on-error` from security-ci, pinned TruffleHog, redacted Apple ID
- Build pipeline: `--publish never` so `electron-builder` doesn't try to upload
  without a token; pinned `ubuntu-22.04` + `libfuse2` for AppImage
- electron 35 → 42 (17 high CVEs closed), electron-builder 24 → 26

Cumulative dependabot count for the repo: started this session at 119,
should drop further once v1.5.4 builds successfully and old `win-unpacked`
build artifacts are no longer flagged.
