# Privacy and Testing Guide

## Understanding Wallet Data Storage

### Where is wallet data stored?

The Birilium Wallet uses Electron's localStorage, which stores data in:
- **Windows**: `%APPDATA%\Birilium Wallet\`
- **macOS**: `~/Library/Application Support/Birilium Wallet/`
- **Linux**: `~/.config/Birilium Wallet/`

This includes:
- Wallet addresses and encrypted private keys
- User preferences and settings
- Cached blockchain data
- Terms acceptance status

### Is my wallet data included in the installer?

**NO!** The installer (`Birilium Wallet Setup 1.0.0.exe`) is completely clean and contains:
- Application code only
- No personal data
- No wallet information
- No private keys

When users download and install your wallet:
1. They get a fresh, clean installation
2. No pre-existing wallets or data
3. They must create or import their own wallet

## Why does my test show an old wallet?

If you're seeing your old wallet after reinstalling, it's because:
1. **You're testing on the same computer/user account**
2. **User data persists in AppData between installations** (by design, to protect users from accidental data loss)

This is **EXPECTED BEHAVIOR** and is actually a security feature to prevent users from losing their wallets if they reinstall.

## Testing Clean Installations

### Option 1: Clean User Data (Recommended for Testing)

Run the cleanup script before testing:
```bash
CLEAN-WALLET-DATA.bat
```

This will:
- Close the wallet application
- Delete all user data from AppData
- Give you a clean slate for testing

### Option 2: Test on a Different Windows User Account

1. Create a new Windows user account
2. Install the wallet on that account
3. You'll see a completely fresh installation

### Option 3: Test in a Virtual Machine

1. Use VirtualBox or VMware
2. Install Windows in a VM
3. Test the installer in the VM

### Option 4: Manual Cleanup

Delete the user data folder manually:
```
%APPDATA%\Birilium Wallet
```

Or navigate to:
```
C:\Users\[YourUsername]\AppData\Roaming\Birilium Wallet
```

## Uninstaller Behavior

The uninstaller is now configured to:
- **Delete application files** ✓
- **Delete user data (AppData)** ✓ (Changed from false to true)

This means:
- When users uninstall, their wallet data will be deleted
- Users should be warned to backup their wallets before uninstalling
- This makes testing easier but requires user awareness

### Important Warning for Users

Users should **ALWAYS backup their wallet** before:
- Uninstalling the application
- Updating to a new version
- Reinstalling Windows
- Changing computers

## For Production Distribution

### Current Configuration

```json
"deleteAppDataOnUninstall": true
```

**This means**: User data will be deleted on uninstall

### Considerations

**Pros:**
- Cleaner uninstall
- No leftover data
- Better for testing

**Cons:**
- Users might lose wallets if they forget to backup
- Not typical for crypto wallets

### Alternative Configuration (More Conservative)

If you want to protect users who forget to backup:

```json
"deleteAppDataOnUninstall": false
```

This would:
- Keep wallet data on uninstall
- Safer for users
- Requires manual cleanup for testing

## Best Practices

1. **Always backup your private keys** to a JSON file
2. **Test in isolated environments** (different user accounts or VMs)
3. **Use CLEAN-WALLET-DATA.bat** for testing fresh installations
4. **Educate users** about wallet backups in the application
5. **Consider adding a backup reminder** before allowing uninstall

## Verification

To verify the distributed installer is clean:

1. Extract the installer on a different computer
2. Check the `app.asar` file (should only contain code)
3. Test installation on a fresh Windows user account
4. Confirm no pre-existing wallets appear

## Summary

✓ **Your distribution is safe** - No personal data in installer
✓ **Fresh users get clean installs** - No pre-existing wallets
✓ **Testing requires cleanup** - Use CLEAN-WALLET-DATA.bat
✓ **Uninstall now deletes data** - Users should backup first
