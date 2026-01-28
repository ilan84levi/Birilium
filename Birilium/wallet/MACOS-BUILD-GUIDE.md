# Birilium Wallet - macOS Build Guide

This guide explains how to build the Birilium Wallet for macOS.

## Quick Start (Using GitHub Actions)

The easiest way to build for macOS is using GitHub Actions, which runs on actual macOS hardware.

### 1. Push to GitHub

```bash
git add .
git commit -m "Add macOS build configuration"
git push origin main
```

### 2. Trigger a Build

**Option A: Manual trigger (unsigned build)**
1. Go to your GitHub repository
2. Click **Actions** tab
3. Select **Build macOS** workflow
4. Click **Run workflow**
5. Set `sign_and_notarize` to `false`
6. Click **Run workflow**

**Option B: Create a release tag (for signed builds)**
```bash
git tag v1.4.2
git push origin v1.4.2
```

### 3. Download the Build

1. Go to **Actions** > Select the completed workflow run
2. Scroll to **Artifacts**
3. Download `Birilium-Wallet-macOS-dmg` or `Birilium-Wallet-macOS-zip`

## Build Outputs

The build produces:
- `Birilium Wallet-1.4.2-arm64.dmg` - For Apple Silicon Macs (M1/M2/M3/M4)
- `Birilium Wallet-1.4.2-x64.dmg` - For Intel Macs
- `Birilium Wallet-1.4.2-arm64-mac.zip` - Archive for Apple Silicon
- `Birilium Wallet-1.4.2-x64-mac.zip` - Archive for Intel Macs

## Building on a Mac Locally

If you have access to a Mac:

### Prerequisites

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Node.js 20+ (using Homebrew)
brew install node@20
```

### Build Commands

```bash
cd Birilium/wallet

# Install dependencies
npm install
cd node-backend && npm install && cd ..

# Build for your Mac's architecture
npm run build:mac

# Or build for specific architecture:
npm run build:mac:arm64    # Apple Silicon only
npm run build:mac:x64      # Intel only
npm run build:mac:universal # Both (larger file size)
```

### Unsigned Build (for testing)

If you don't have an Apple Developer account:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac
```

This creates a working DMG, but users will see a security warning on first launch. They can bypass it via:
- Right-click the app > Open (first time only)
- Or: System Settings > Privacy & Security > Open Anyway

## Code Signing & Notarization (Production)

For distribution without security warnings, you need:

### 1. Apple Developer Account

- Enroll at https://developer.apple.com/programs/ ($99/year)
- Create a "Developer ID Application" certificate

### 2. Export Certificate

1. Open **Keychain Access** on your Mac
2. Find your "Developer ID Application" certificate
3. Right-click > Export
4. Save as `.p12` file with a password
5. Convert to base64: `base64 -i certificate.p12 | pbcopy`

### 3. Create App-Specific Password

1. Go to https://appleid.apple.com/account/manage
2. Security > App-Specific Passwords
3. Generate new password, label it "Birilium Notarization"

### 4. Set Up GitHub Secrets

Add these secrets in your GitHub repository (Settings > Secrets > Actions):

| Secret | Description |
|--------|-------------|
| `MACOS_CERTIFICATE` | Base64-encoded .p12 certificate |
| `MACOS_CERTIFICATE_PASSWORD` | Password for the .p12 file |
| `KEYCHAIN_PASSWORD` | Any random password (for temporary keychain) |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | The app-specific password |
| `APPLE_TEAM_ID` | Your 10-character Team ID |

### 5. Build Signed Version

Either:
- Push a version tag: `git tag v1.4.3 && git push origin v1.4.3`
- Or manually trigger with `sign_and_notarize: true`

## Troubleshooting

### "App is damaged and can't be opened"

This happens with unsigned apps downloaded from the internet. Fix:

```bash
# Remove quarantine attribute
xattr -d com.apple.quarantine "/Applications/Birilium Wallet.app"
```

### Build fails with native module errors

Native modules (better-sqlite3, bcrypt, argon2) need to compile for macOS:

```bash
# Clear node_modules and rebuild
rm -rf node_modules node-backend/node_modules
npm install
cd node-backend && npm install
```

### "Cannot be opened because the developer cannot be verified"

For unsigned builds:
1. System Settings > Privacy & Security
2. Scroll down to find the blocked app
3. Click "Open Anyway"

### Notarization fails

1. Ensure you accepted all agreements at https://appstoreconnect.apple.com
2. Verify app-specific password is correct (not your Apple ID password)
3. Check Team ID is exactly 10 characters

## File Structure

```
Birilium/wallet/
├── build/
│   ├── icon.png                    # App icon (auto-converts to .icns)
│   └── entitlements.mac.plist      # macOS security permissions
├── scripts/
│   └── notarize.js                 # Notarization automation
├── .github/workflows/
│   └── build-macos.yml             # GitHub Actions workflow
├── dist/                           # Build output
│   ├── Birilium Wallet-x.x.x-arm64.dmg
│   ├── Birilium Wallet-x.x.x-x64.dmg
│   └── ...
└── package.json                    # Build configuration
```

## Distribution

### Direct Download

Upload the DMG files to your website or GitHub Releases.

### Homebrew Cask (Optional)

Create a Homebrew cask for easy installation:

```ruby
cask "birilium-wallet" do
  version "1.4.2"
  sha256 "YOUR_SHA256_HERE"

  url "https://github.com/your-org/birilium/releases/download/v#{version}/Birilium.Wallet-#{version}-arm64.dmg"
  name "Birilium Wallet"
  homepage "https://birilium.com"

  app "Birilium Wallet.app"
end
```

## System Requirements

- macOS 10.15 (Catalina) or later
- Apple Silicon (M1/M2/M3/M4) or Intel processor
- 4 GB RAM minimum
- 500 MB disk space
