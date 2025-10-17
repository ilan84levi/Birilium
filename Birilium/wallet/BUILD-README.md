# Birilium Wallet - Build Instructions

This guide explains how to build distributable installers for the Birilium Wallet.

## Prerequisites

1. **Node.js** (v18 or higher)
2. **npm** (v9 or higher)
3. All dependencies installed: `npm install`

## Building the Wallet

### Build for Windows (64-bit and 32-bit)
```bash
npm run build:win
```

**Output:**
- `dist/Birilium Wallet Setup x.x.x.exe` - Windows installer
- Supports both 64-bit and 32-bit systems

### Build for macOS
```bash
npm run build:mac
```

**Output:**
- `dist/Birilium Wallet-x.x.x.dmg` - macOS disk image
- `dist/Birilium Wallet-x.x.x-mac.zip` - macOS application archive

**Note:** Building for macOS requires running on a Mac computer.

### Build for Linux
```bash
npm run build:linux
```

**Output:**
- `dist/Birilium Wallet-x.x.x.AppImage` - Universal Linux application
- `dist/birilium-wallet_x.x.x_amd64.deb` - Debian/Ubuntu package

### Build for All Platforms
```bash
npm run build:all
```

**Note:** Cross-platform building may have limitations. For best results, build on the target platform.

## Build Configuration

The build configuration is in `package.json` under the `"build"` section.

### Key Features:
- **Windows:** NSIS installer with custom install location
- **macOS:** DMG disk image with drag-to-Applications
- **Linux:** AppImage (portable) and DEB package

### Icons
Place custom icons in the `build/` directory:
- **Windows:** `icon.ico` (256x256 or higher)
- **macOS:** `icon.icns` (1024x1024 source)
- **Linux:** `icon.png` (512x512 or higher)

## Distribution

After building, the installers will be in the `dist/` directory.

### File Sizes (Approximate)
- Windows: ~100-150 MB
- macOS: ~120-170 MB
- Linux: ~100-150 MB

### Uploading for Users
1. Upload files to your website or GitHub Releases
2. Provide download links for each platform
3. Include SHA256 checksums for security verification

## Troubleshooting

### Windows Build Issues
- Ensure you have Windows Build Tools installed
- Run as Administrator if permission errors occur

### macOS Build Issues
- Code signing requires Apple Developer account
- For testing, use: `CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac`

### Linux Build Issues
- Install required dependencies: `sudo apt-get install -y rpm`
- For AppImage: Requires `fuse` to be installed

## Production Checklist

Before distributing to users:

- [ ] Update version number in `package.json`
- [ ] Test the built application on target platforms
- [ ] Verify PayPal integration works (LIVE mode)
- [ ] Check that blockchain node connection works
- [ ] Test mining functionality
- [ ] Test subscription cancellation
- [ ] Create release notes
- [ ] Generate SHA256 checksums: `certutil -hashfile "Birilium Wallet Setup.exe" SHA256`

## Advanced: Code Signing

### Windows
1. Obtain a code signing certificate
2. Set environment variables:
   ```bash
   set CSC_LINK=path/to/certificate.pfx
   set CSC_KEY_PASSWORD=your_password
   ```
3. Build: `npm run build:win`

### macOS
1. Enroll in Apple Developer Program
2. Create Developer ID certificate
3. Build: `npm run build:mac`

## Support

For build issues, check:
- electron-builder documentation: https://www.electron.build/
- GitHub Issues: https://github.com/electron-userland/electron-builder/issues
