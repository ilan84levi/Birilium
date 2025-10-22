# 🚀 BIRILIUM SECURITY HARDENING IMPLEMENTATION GUIDE

**Quick Start Guide to Implement All Security Recommendations**

This guide provides step-by-step instructions to implement all security improvements identified in the audit.

---

## 📋 QUICK WINS (Do These First - 15 Minutes)

### 1. Fix Nodemailer Vulnerability
```bash
cd Birilium/wallet/node-backend
npm update nodemailer
npm audit --production
```

Expected: `found 0 vulnerabilities`

### 2. Enable CI/CD Security Pipeline
The workflow file has been created at `.github/workflows/security-ci.yml`.

```bash
git add .github/workflows/security-ci.yml
git commit -m "Add security CI/CD pipeline with dependency audits and vulnerability scanning"
git push
```

This will automatically:
- Run npm audit on every PR
- Scan for vulnerabilities with NodeSecure
- Check Electron-specific security with Electronegativity
- Scan for secrets with TruffleHog
- Run weekly scheduled security scans

---

## 🔐 CODE SIGNING SETUP (1-2 Days)

### Windows Code Signing

#### Step 1: Acquire Certificate
You need a Windows Authenticode certificate from a trusted CA:
- **DigiCert** (recommended): https://www.digicert.com/code-signing
- **Sectigo**: https://sectigo.com/ssl-certificates-tls/code-signing
- **SSL.com**: https://www.ssl.com/code-signing/

Cost: ~$200-500/year

#### Step 2: Store Certificate Securely
```bash
# Create certs directory (already in .gitignore)
mkdir -p Birilium/wallet/certs

# Copy your .pfx certificate file
cp /path/to/your/cert.pfx Birilium/wallet/certs/code-signing-cert.pfx

# NEVER commit this file!
```

#### Step 3: Update package.json
Add to `Birilium/wallet/package.json` under `build.win`:

```json
{
  "build": {
    "win": {
      "target": [{ "target": "nsis", "arch": ["x64"] }],
      "icon": "build/icon.png",
      "publisherName": "Birilium Team",
      "certificateFile": "certs/code-signing-cert.pfx",
      "certificatePassword": "${CSC_KEY_PASSWORD}",
      "signingHashAlgorithms": ["sha256"],
      "signAndEditExecutable": true,
      "verifyUpdateCodeSignature": true
    }
  }
}
```

#### Step 4: Build with Signing
```bash
# Set password environment variable
export CSC_KEY_PASSWORD="your-certificate-password"

# Or on Windows:
set CSC_KEY_PASSWORD=your-certificate-password

# Build
cd Birilium/wallet
npm run build:win
```

#### Step 5: Verify Signing
Right-click the .exe file > Properties > Digital Signatures tab
Should show your certificate and "This digital signature is OK"

---

### macOS Code Signing & Notarization

#### Step 1: Enroll in Apple Developer Program
- Go to: https://developer.apple.com/programs/
- Cost: $99/year
- Wait for approval (usually 24-48 hours)

#### Step 2: Create Certificates (on macOS only)
```bash
# Open Xcode
xcode-select --install

# Open Keychain Access
# Request a certificate: Keychain Access > Certificate Assistant > Request a Certificate from a Certificate Authority

# In Apple Developer portal:
# Go to: Certificates, Identifiers & Profiles
# Create new certificate: "Developer ID Application"
# Upload the certificate request
# Download and install the certificate
```

#### Step 3: Create App-Specific Password
1. Go to: https://appleid.apple.com/account/manage
2. Sign in with your Apple ID
3. Go to: Security > App-Specific Passwords
4. Click "Generate Password"
5. Label it: "Birilium Wallet Notarization"
6. **Save the password** (format: xxxx-xxxx-xxxx-xxxx)

#### Step 4: Find Your Team ID
- Go to: https://developer.apple.com/account
- Your Team ID is a 10-character code next to your name

#### Step 5: Set Environment Variables
```bash
export APPLE_ID="your-email@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"

# For permanent setup, add to ~/.bashrc or ~/.zshrc
```

#### Step 6: Install Notarization Dependency
```bash
cd Birilium/wallet
npm install --save-dev @electron/notarize
```

#### Step 7: Update package.json
The notarization script and entitlements have been created. Now update `package.json`:

```json
{
  "build": {
    "afterSign": "scripts/notarize.js",
    "mac": {
      "target": ["dmg", "zip"],
      "category": "public.app-category.finance",
      "icon": "build/icon.icns",
      "identity": "Developer ID Application: Your Name (TEAM_ID)",
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist"
    }
  }
}
```

Replace `"Your Name (TEAM_ID)"` with your actual certificate identity. Find it with:
```bash
security find-identity -v -p codesigning
```

#### Step 8: Build & Notarize
```bash
cd Birilium/wallet
npm run build:mac
```

Notarization takes 5-15 minutes. Watch the console for progress.

#### Step 9: Verify Notarization
```bash
spctl -a -vv -t install "dist/mac/Birilium Wallet.app"
```

Should show: `"source=Notarized Developer ID"`

---

## 🔄 AUTO-UPDATE SETUP (1 Day)

### Step 1: Install electron-updater
```bash
cd Birilium/wallet
npm install electron-updater
npm install electron-log  # For logging
```

### Step 2: Update package.json
Add publish configuration:

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "your-github-username",
      "repo": "Birilium",
      "private": false
    }
  }
}
```

For private repos or alternative hosting:
```json
{
  "build": {
    "publish": {
      "provider": "generic",
      "url": "https://your-update-server.com/releases"
    }
  }
}
```

### Step 3: Update main.js
Add at the top:
```javascript
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Configure auto-updater logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

// Auto-update configuration
autoUpdater.autoDownload = false;  // Ask user first
autoUpdater.autoInstallOnAppQuit = true;

// Check for updates after 10 seconds
app.on('ready', async () => {
  createWindow();

  setTimeout(() => {
    log.info('Checking for updates...');
    autoUpdater.checkForUpdates();
  }, 10000);
});
```

Add event handlers (after createWindow):
```javascript
// Update available
autoUpdater.on('update-available', (info) => {
  log.info('Update available:', info.version);
  mainWindow.webContents.send('update-available', {
    version: info.version,
    releaseNotes: info.releaseNotes
  });
});

// Update downloaded
autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded:', info.version);
  mainWindow.webContents.send('update-downloaded', info);
});

// Update error
autoUpdater.on('error', (err) => {
  log.error('Update error:', err);
  mainWindow.webContents.send('update-error', err.message);
});

// No update available
autoUpdater.on('update-not-available', (info) => {
  log.info('Update not available');
});
```

Add IPC handlers:
```javascript
ipcMain.handle('check-for-updates', async () => {
  try {
    return await autoUpdater.checkForUpdates();
  } catch (error) {
    log.error('Check for updates error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    return await autoUpdater.downloadUpdate();
  } catch (error) {
    log.error('Download update error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('install-update', () => {
  log.info('Installing update...');
  autoUpdater.quitAndInstall(false, true);
});
```

### Step 4: Update preload.js
Add to the `walletAPI` object:
```javascript
contextBridge.exposeInMainWorld('walletAPI', {
  // ... existing APIs ...

  /**
   * Auto-update APIs
   */
  updates: {
    check: () => ipcRenderer.invoke('check-for-updates'),
    download: () => ipcRenderer.invoke('download-update'),
    install: () => ipcRenderer.invoke('install-update'),
    onAvailable: (callback) => ipcRenderer.on('update-available', (_, info) => callback(info)),
    onDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_, info) => callback(info)),
    onError: (callback) => ipcRenderer.on('update-error', (_, error) => callback(error))
  }
});
```

### Step 5: Add Update UI (in renderer)
Add this to your `renderer-wallet.js` or similar:

```javascript
// Listen for update events
if (window.walletAPI && window.walletAPI.updates) {
  // Update available
  window.walletAPI.updates.onAvailable((info) => {
    const shouldUpdate = confirm(
      `New version ${info.version} available!\n\n` +
      `Current version: ${require('electron').remote.app.getVersion()}\n\n` +
      `Would you like to download it now?`
    );

    if (shouldUpdate) {
      window.walletAPI.updates.download();
    }
  });

  // Update downloaded
  window.walletAPI.updates.onDownloaded((info) => {
    const shouldInstall = confirm(
      `Update downloaded successfully!\n\n` +
      `Version ${info.version} is ready to install.\n\n` +
      `Install now? (App will restart)`
    );

    if (shouldInstall) {
      window.walletAPI.updates.install();
    }
  });

  // Update error
  window.walletAPI.updates.onError((error) => {
    console.error('Update error:', error);
  });
}
```

### Step 6: Build and Publish
```bash
# Build all platforms with publish config
npm run build

# This will create installers AND update manifests (latest.yml, latest-mac.yml, etc.)
```

### Step 7: Create GitHub Release
```bash
# Tag the release
git tag v1.0.7
git push origin v1.0.7

# Create release on GitHub
gh release create v1.0.7 \
  --title "Birilium Wallet v1.0.7" \
  --notes "Release notes here" \
  Birilium/wallet/dist/*.exe \
  Birilium/wallet/dist/*.dmg \
  Birilium/wallet/dist/*.AppImage \
  Birilium/wallet/dist/*.yml \
  Birilium/wallet/dist/*.json
```

Or use GitHub web interface:
1. Go to: https://github.com/your-username/Birilium/releases/new
2. Tag: v1.0.7
3. Upload files from `dist/` folder
4. Publish release

### Step 8: Test Updates
1. Install v1.0.6 on a test machine
2. Publish v1.0.7 release
3. Open the app
4. Should prompt for update within 10 seconds

---

## 🔒 ENHANCED ENCRYPTION (Optional - 2 Hours)

The enhanced crypto module has been created at `preload-enhanced-crypto.js`.

### Benefits:
- **scrypt** instead of PBKDF2 (memory-hard, GPU-resistant)
- **AES-256-GCM** instead of AES-256-CBC (authenticated encryption)
- **Backward compatible** (can decrypt old PBKDF2 wallets)
- **Migration helper** (re-encrypt old data with new algorithm)

### Step 1: Copy the Module
The file is already created: `Birilium/wallet/preload-enhanced-crypto.js`

### Step 2: Update preload.js
Replace the crypto section:

```javascript
// At the top of preload.js
const enhancedCrypto = require('./preload-enhanced-crypto');

// In contextBridge.exposeInMainWorld('walletAPI', { ... })
crypto: {
  encrypt: enhancedCrypto.encrypt,
  decrypt: enhancedCrypto.decrypt,
  migrate: enhancedCrypto.migrate,
  randomBytes: enhancedCrypto.randomBytes,
  hash: enhancedCrypto.hash,
  checkPasswordStrength: enhancedCrypto.checkPasswordStrength
}
```

### Step 3: Test Migration
The new crypto automatically detects old vs new format. Old wallets will still work!

To manually migrate a wallet:
```javascript
// In renderer
const oldEncrypted = localStorage.getItem('encryptedWallet');
const password = 'user-password';

const result = await window.walletAPI.crypto.migrate(oldEncrypted, password);
if (result.success) {
  localStorage.setItem('encryptedWallet', result.newEncrypted);
  console.log('✓ Wallet migrated to enhanced encryption');
}
```

---

## 🛡️ ADDITIONAL SECURITY IMPROVEMENTS (Optional)

### 1. Disable DevTools in Production
In `main.js`, update the webPreferences:

```javascript
webPreferences: {
  // ... existing config ...
  devTools: process.env.NODE_ENV === 'development'
}
```

### 2. Remove Admin Keyboard Shortcut
In `main.js`, comment out or remove lines 247-254:

```javascript
// REMOVED: Security risk
// require('electron').globalShortcut.register('Control+Alt+A', () => {
//   ...
// });
```

### 3. Use Electron safeStorage API
For storing the wallet password in memory:

```javascript
// In main.js
const { safeStorage } = require('electron');

// When storing password
if (safeStorage.isEncryptionAvailable()) {
  const encrypted = safeStorage.encryptString(password);
  // Store encrypted buffer instead of plaintext
}

// When retrieving password
const decrypted = safeStorage.decryptString(encrypted);
```

### 4. Add Password Strength Indicator
Use the new `checkPasswordStrength` function:

```javascript
// In renderer
const passwordInput = document.getElementById('walletPassword');
const strengthIndicator = document.getElementById('strengthIndicator');

passwordInput.addEventListener('input', async () => {
  const strength = await window.walletAPI.crypto.checkPasswordStrength(passwordInput.value);

  strengthIndicator.textContent = `Strength: ${strength.strength}`;
  strengthIndicator.className = `strength-${strength.strength}`;

  if (strength.feedback.length > 0) {
    console.log('Password feedback:', strength.feedback);
  }
});
```

---

## 🧪 TESTING CHECKLIST

After implementing all changes, test:

### Electron Security:
- [ ] F12 doesn't open DevTools in production build
- [ ] Cannot navigate to external URLs
- [ ] Cannot open new windows
- [ ] Context bridge works (wallet functions available)
- [ ] No Node.js APIs exposed to renderer

### Code Signing:
- [ ] Windows: Right-click .exe > Properties > Digital Signatures shows valid signature
- [ ] macOS: `spctl -a -vv -t install "app.app"` shows "accepted" and "Notarized"
- [ ] No SmartScreen warnings on Windows
- [ ] No Gatekeeper warnings on macOS

### Auto-Updates:
- [ ] App checks for updates on startup
- [ ] Update notification appears when new version available
- [ ] Download progress works
- [ ] Install and restart works
- [ ] Old version is replaced with new version

### Encryption:
- [ ] New wallets use scrypt + GCM
- [ ] Old wallets still decrypt correctly
- [ ] Migration works without data loss
- [ ] Wrong password is rejected

### CI/CD:
- [ ] Security workflow runs on every PR
- [ ] npm audit fails on critical vulnerabilities
- [ ] Secret scanning catches committed secrets

---

## 📞 SUPPORT & TROUBLESHOOTING

### Common Issues:

**"electron-updater not found"**
```bash
npm install electron-updater electron-log
```

**"Certificate not found" (Windows)**
- Verify certificate file exists: `Birilium/wallet/certs/code-signing-cert.pfx`
- Check password is set: `echo $CSC_KEY_PASSWORD`

**"You must first sign the relevant contracts" (macOS)**
- Go to: https://appstoreconnect.apple.com
- Accept all pending agreements

**"Invalid app-specific password" (macOS)**
- Regenerate at: https://appleid.apple.com/account/manage
- Make sure it's the app-specific password, not your Apple ID password

**"Update not available" (testing updates)**
- Make sure version in package.json is LOWER than the published release
- Check that latest.yml exists in the release assets
- Verify publish provider is configured correctly

---

## 🎯 PRIORITY ORDER

Implement in this order:

1. **🔴 CRITICAL (Do First):**
   - Fix nodemailer vulnerability (5 min)
   - Enable CI/CD pipeline (5 min)
   - Setup code signing (1-2 days)

2. **🟡 HIGH (Do Next):**
   - Implement auto-updates (1 day)
   - Test everything thoroughly

3. **🟢 OPTIONAL (Nice to Have):**
   - Enhanced encryption migration
   - Additional hardening (DevTools, admin shortcut)
   - Password strength indicator

---

## ✅ COMPLETION CHECKLIST

Once everything is implemented:

- [ ] Nodemailer updated to 7.0.9+
- [ ] CI/CD security pipeline running
- [ ] Windows builds are code-signed
- [ ] macOS builds are code-signed + notarized
- [ ] Auto-update system working end-to-end
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Team trained on update process

**You're done!** 🎉

Your Birilium Wallet now has production-grade security!

---

*Need help? Review the detailed SECURITY-AUDIT-REPORT.md for more context.*
