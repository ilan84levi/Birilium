# 🔐 WINDOWS CODE SIGNING GUIDE
## Complete Guide to Sign Birilium Wallet for Windows

**Date:** November 2, 2025
**Application:** Birilium Wallet v1.0.7
**Platform:** Windows 10/11

---

## 📋 TABLE OF CONTENTS

1. [Why Code Signing is Important](#why-code-signing)
2. [Types of Code Signing Certificates](#certificate-types)
3. [Where to Get a Certificate](#where-to-buy)
4. [How to Sign Your Code](#how-to-sign)
5. [Verification & Testing](#verification)
6. [Troubleshooting](#troubleshooting)
7. [Cost Breakdown](#costs)

---

## 🎯 WHY CODE SIGNING IS IMPORTANT {#why-code-signing}

### Without Code Signing:
❌ Windows SmartScreen warning: "Windows protected your PC"
❌ Users see "Unknown publisher"
❌ Downloads may be blocked by browsers
❌ Antivirus software flags as suspicious
❌ Lower user trust and installation rate
❌ Enterprise environments block unsigned software

### With Code Signing:
✅ No SmartScreen warnings (after reputation build)
✅ Shows your company/name as verified publisher
✅ Users trust the download
✅ Antivirus less likely to flag
✅ Professional appearance
✅ Required for Windows Store distribution

---

## 📜 CERTIFICATE TYPES {#certificate-types}

### 1. **Standard Code Signing Certificate (OV)**
- **Validation Level:** Organization Validation
- **Storage:** Software-based (file)
- **Price:** $100-300/year
- **Reputation Build:** Needs to build over time
- **SmartScreen:** Will show warnings initially until reputation built
- **Best For:** Individual developers, small projects

### 2. **EV (Extended Validation) Code Signing Certificate** ⭐ RECOMMENDED
- **Validation Level:** Extended Validation (strict identity verification)
- **Storage:** Hardware USB token (FIPS 140-2 Level 2)
- **Price:** $300-500/year
- **Reputation Build:** **Instant SmartScreen reputation**
- **SmartScreen:** NO warnings from day 1
- **Best For:** Commercial software, professional releases
- **Requirement:** Must use hardware token (cannot be exported)

**🎯 Recommendation:** Get an **EV Code Signing Certificate** for instant trust.

---

## 🛒 WHERE TO GET A CERTIFICATE {#where-to-buy}

### Trusted Certificate Authorities (CAs)

#### 1. **DigiCert** ⭐ MOST POPULAR
- **Website:** https://www.digicert.com/signing/code-signing-certificates
- **EV Price:** ~$400-500/year
- **OV Price:** ~$200-300/year
- **Pros:** Industry leader, best support, fastest issuance
- **Cons:** More expensive
- **Issuance Time:** EV: 3-5 days | OV: 1-3 days

#### 2. **Sectigo (formerly Comodo)**
- **Website:** https://www.sectigo.com/ssl-certificates-tls/code-signing
- **EV Price:** ~$300-400/year
- **OV Price:** ~$100-200/year
- **Pros:** More affordable, widely trusted
- **Cons:** Support slower than DigiCert
- **Issuance Time:** EV: 3-7 days | OV: 1-3 days

#### 3. **GlobalSign**
- **Website:** https://www.globalsign.com/en/code-signing-certificate
- **EV Price:** ~$350-450/year
- **OV Price:** ~$150-250/year
- **Pros:** Good balance of price and service
- **Cons:** Less popular than DigiCert/Sectigo
- **Issuance Time:** EV: 3-5 days | OV: 1-3 days

#### 4. **SSL.com**
- **Website:** https://www.ssl.com/certificates/ev-code-signing/
- **EV Price:** ~$300-400/year
- **OV Price:** ~$100-200/year
- **Pros:** Competitive pricing
- **Cons:** Smaller company
- **Issuance Time:** EV: 3-7 days | OV: 1-3 days

#### 5. **Entrust**
- **Website:** https://www.entrust.com/digital-security/code-signing-certificates
- **EV Price:** ~$400-500/year
- **OV Price:** ~$200-300/year
- **Pros:** Enterprise-grade, excellent security
- **Cons:** More expensive
- **Issuance Time:** EV: 3-5 days | OV: 1-3 days

### 🏆 **Best Choice for Birilium:**

**DigiCert EV Code Signing Certificate**
- Price: ~$474/year
- URL: https://www.digicert.com/signing/code-signing-certificates
- Instant SmartScreen reputation
- Hardware USB token included
- Best support in industry
- 3-5 day issuance

---

## 📝 CERTIFICATE APPLICATION PROCESS

### Documents You'll Need:

#### For Individual Developer (OV):
- Government-issued photo ID (passport/driver's license)
- Phone number for verification call
- Email address (will be verified)
- Proof of address (utility bill, bank statement)

#### For Company (OV/EV):
- Business registration documents
- Tax ID / EIN / Company registration number
- Proof of business address
- D&B D-U-N-S Number (for EV)
- Authorized representative ID
- Business bank account
- Business phone (must be listed publicly)
- Domain ownership (if applicable)

### Application Steps:

1. **Choose Certificate Authority** (e.g., DigiCert)
2. **Select Certificate Type** (EV or OV)
3. **Complete Online Application**
   - Company/personal details
   - Contact information
   - Billing information
4. **Submit Required Documents**
5. **Verification Process**
   - Phone verification call
   - Document review
   - Business verification (EV)
6. **Receive Certificate**
   - OV: Delivered as .pfx/.p12 file
   - EV: Delivered on USB hardware token
7. **Install Certificate**

**⏱️ Timeline:**
- OV: 1-3 business days
- EV: 3-7 business days (longer verification)

---

## 🔧 HOW TO SIGN YOUR CODE {#how-to-sign}

### Option 1: Sign During Build (Automated) ⭐ RECOMMENDED

Edit `Birilium/wallet/package.json` to include signing configuration:

```json
{
  "name": "birilium-wallet",
  "version": "1.0.7",
  "build": {
    "appId": "com.birilium.wallet",
    "productName": "Birilium Wallet",
    "win": {
      "target": ["nsis"],
      "icon": "build/icon.ico",
      "certificateFile": "path/to/certificate.pfx",
      "certificatePassword": "YOUR_CERT_PASSWORD",
      "signingHashAlgorithms": ["sha256"],
      "rfc3161TimeStampServer": "http://timestamp.digicert.com",
      "signDlls": true
    }
  }
}
```

**⚠️ SECURITY WARNING:** Never commit certificate password to git!

**Better approach - Use environment variables:**

```json
{
  "build": {
    "win": {
      "certificateFile": "${env.WINDOWS_CERT_FILE}",
      "certificatePassword": "${env.WINDOWS_CERT_PASSWORD}",
      "signingHashAlgorithms": ["sha256"],
      "rfc3161TimeStampServer": "http://timestamp.digicert.com"
    }
  }
}
```

Then build:
```bash
# Set environment variables
set WINDOWS_CERT_FILE=C:\path\to\cert.pfx
set WINDOWS_CERT_PASSWORD=your_password_here

# Build with signing
cd Birilium/wallet
npm run build:win
```

### Option 2: Sign After Build (Manual)

If you already have a built .exe file, sign it manually:

#### Using SignTool (Windows SDK)

**1. Install Windows SDK:**
- Download: https://developer.microsoft.com/windows/downloads/windows-sdk/
- Or install via Visual Studio Installer
- SignTool location: `C:\Program Files (x86)\Windows Kits\10\bin\{version}\x64\signtool.exe`

**2. Sign your .exe:**

```batch
:: For OV Certificate (file-based .pfx)
signtool sign /f "C:\path\to\certificate.pfx" /p "certificate_password" /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /v "Birilium Wallet Setup 1.0.7.exe"

:: For EV Certificate (USB hardware token)
signtool sign /n "Your Company Name" /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /v "Birilium Wallet Setup 1.0.7.exe"
```

**Explanation:**
- `/f` - Certificate file path (.pfx)
- `/p` - Certificate password
- `/n` - Certificate subject name (for hardware tokens)
- `/fd` - File digest algorithm (SHA256)
- `/tr` - Timestamp server URL (RFC 3161)
- `/td` - Timestamp digest algorithm
- `/v` - Verbose output

### Option 3: Using electron-builder with Hardware Token (EV)

For EV certificates on USB token:

```json
{
  "build": {
    "win": {
      "certificateSubjectName": "Your Company Name",
      "signingHashAlgorithms": ["sha256"],
      "rfc3161TimeStampServer": "http://timestamp.digicert.com"
    }
  }
}
```

The certificate subject name must match exactly what's in your EV certificate.

---

## 🔍 VERIFICATION & TESTING {#verification}

### 1. Verify Signature Locally

```batch
:: Check if file is signed
signtool verify /pa "Birilium Wallet Setup 1.0.7.exe"

:: Check detailed signature info
signtool verify /pa /v "Birilium Wallet Setup 1.0.7.exe"
```

**Expected output:**
```
Successfully verified: Birilium Wallet Setup 1.0.7.exe
```

### 2. Check Signature in Windows Explorer

1. Right-click the .exe file
2. Select "Properties"
3. Go to "Digital Signatures" tab
4. Should see your certificate info
5. Click "Details" → "View Certificate"
6. Verify:
   - ✅ Issued to: Your name/company
   - ✅ Issued by: DigiCert/Sectigo/etc
   - ✅ Valid dates
   - ✅ Status: "This certificate is OK"

### 3. Test SmartScreen Behavior

**For EV Certificates:**
- Download and run the installer
- Should install without any warnings
- No "Windows protected your PC" screen

**For OV Certificates:**
- Initial downloads will show SmartScreen warning
- After ~1000-10000 downloads from unique users, warnings disappear
- Can take weeks to months to build reputation

### 4. Upload to VirusTotal

Test how antivirus software sees your signed file:

1. Go to: https://www.virustotal.com
2. Upload your signed .exe
3. Check detection ratio
4. Signed files typically have lower false positive rate

---

## ⚙️ CONFIGURATION FILES

### Update package.json (Full Example)

```json
{
  "name": "birilium-wallet",
  "version": "1.0.7",
  "description": "Birilium Cryptocurrency Wallet",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder",
    "build:win": "electron-builder --win --x64",
    "build:win:unsigned": "electron-builder --win --x64 --config.win.sign=false"
  },
  "build": {
    "appId": "com.birilium.wallet",
    "productName": "Birilium Wallet",
    "directories": {
      "output": "dist",
      "buildResources": "build"
    },
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ],
      "icon": "build/icon.ico",
      "publisherName": "Birilium Technologies",
      "certificateSubjectName": "${env.WIN_CSC_NAME}",
      "certificateFile": "${env.WIN_CSC_LINK}",
      "certificatePassword": "${env.WIN_CSC_KEY_PASSWORD}",
      "signingHashAlgorithms": ["sha256"],
      "rfc3161TimeStampServer": "http://timestamp.digicert.com",
      "signDlls": true,
      "verifyUpdateCodeSignature": true
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "Birilium Wallet"
    }
  }
}
```

### Environment Variables (.env.build)

Create a `.env.build` file (DON'T commit to git):

```bash
# For OV Certificate (file-based)
WIN_CSC_LINK=C:\path\to\certificate.pfx
WIN_CSC_KEY_PASSWORD=your_certificate_password_here

# For EV Certificate (hardware token)
WIN_CSC_NAME=Your Company Name
```

### .gitignore (Add these lines)

```
# Code signing
*.pfx
*.p12
*.pem
.env.build
certificate.*
```

---

## 🚀 BUILD & SIGN WORKFLOW

### Complete Build Process:

```batch
@echo off
echo ==========================================
echo Building Birilium Wallet with Code Signing
echo ==========================================

:: 1. Set environment variables
set WIN_CSC_LINK=C:\path\to\certificate.pfx
set WIN_CSC_KEY_PASSWORD=your_password
set WIN_CSC_NAME=Your Company Name

:: 2. Clean previous builds
echo Cleaning previous builds...
cd Birilium\wallet
if exist dist rmdir /S /Q dist

:: 3. Install dependencies (if needed)
echo Checking dependencies...
call npm install

:: 4. Build with signing
echo Building and signing...
call npm run build:win

:: 5. Verify signature
echo Verifying signature...
cd dist
signtool verify /pa "Birilium Wallet Setup 1.0.7.exe"

echo ==========================================
echo Build complete! Check dist/ folder
echo ==========================================
pause
```

Save this as `build-signed.bat` in your project root.

---

## 🛠️ TROUBLESHOOTING {#troubleshooting}

### Common Issues:

#### 1. "SignTool Error: No certificates were found that met all the given criteria"

**Cause:** Certificate not installed or wrong subject name
**Solution:**
- For .pfx: Check file path is correct
- For hardware token: Install token software and drivers
- Verify certificate is installed: `certmgr.msc`
- Check exact subject name: `certutil -store My`

#### 2. "SignTool Error: The specified timestamp server either could not be reached or returned an invalid response"

**Cause:** Timestamp server unreachable
**Solution:**
- Try alternative timestamp servers:
  ```
  http://timestamp.digicert.com
  http://timestamp.sectigo.com
  http://timestamp.globalsign.com
  http://timestamp.comodoca.com
  ```
- Check your internet connection
- Check firewall/proxy settings

#### 3. "electron-builder: Cannot sign"

**Cause:** Environment variables not set or certificate issues
**Solution:**
- Verify environment variables are set
- Try signing manually first with SignTool
- Check certificate validity
- Ensure certificate is for code signing (not SSL)

#### 4. SmartScreen Still Shows Warning (EV Cert)

**Cause:** Rare, but possible
**Solution:**
- Verify certificate is truly EV (check with CA)
- Ensure timestamp is working
- Wait 24-48 hours for propagation
- Contact Microsoft SmartScreen support

#### 5. "The file's digital signature is not valid"

**Cause:** File was modified after signing
**Solution:**
- Re-sign the file
- Don't modify .exe after signing
- Check file wasn't corrupted during transfer

---

## 💰 COST BREAKDOWN {#costs}

### Complete Cost Analysis

#### Option 1: Standard (OV) Certificate
**Year 1:**
- Certificate: $100-300
- Windows SDK: Free
- Total: **$100-300**

**Yearly Renewal:** $100-300

**⚠️ Note:** Will show SmartScreen warnings until reputation built (can take months)

#### Option 2: Extended Validation (EV) Certificate ⭐ RECOMMENDED
**Year 1:**
- Certificate: $300-500
- USB Hardware Token: Included
- Windows SDK: Free
- Total: **$300-500**

**Yearly Renewal:** $300-500 (may not need new token)

**✅ Benefit:** Instant SmartScreen reputation, no warnings

#### Option 3: Multi-Year Purchase (Cost Saving)
Some CAs offer discounts for multi-year purchases:

**DigiCert EV 3-Year:**
- Year 1: $474
- Year 2: $427
- Year 3: $427
- **Total: $1,328** (Save ~$100)
- Average: **$443/year**

### ROI Consideration:

**Without Code Signing:**
- 30-50% of users abandon installation due to warnings
- Higher support costs (users reporting "virus")
- Damaged reputation

**With Code Signing:**
- Professional appearance
- Higher installation completion rate
- Reduced support tickets
- User trust

**Break-even:** If you expect >100 users, cost is justified.

---

## 📚 ADDITIONAL RESOURCES

### Official Documentation:
- **Microsoft SignTool:** https://docs.microsoft.com/windows/win32/seccrypto/signtool
- **electron-builder Signing:** https://www.electron.build/code-signing
- **Windows Code Signing:** https://docs.microsoft.com/windows/win32/secauthn/cryptography-tools

### Certificate Authorities:
- **DigiCert:** https://www.digicert.com
- **Sectigo:** https://sectigo.com
- **GlobalSign:** https://www.globalsign.com
- **SSL.com:** https://www.ssl.com

### Tools:
- **Windows SDK:** https://developer.microsoft.com/windows/downloads/windows-sdk/
- **certmgr:** Built into Windows (Certificate Manager)
- **signtool:** Included with Windows SDK

---

## ✅ QUICK START CHECKLIST

### Before You Start:
- [ ] Decide: EV or OV certificate?
- [ ] Choose Certificate Authority
- [ ] Prepare required documents
- [ ] Budget approved

### Purchase & Setup:
- [ ] Apply for certificate
- [ ] Complete verification process
- [ ] Receive certificate/token
- [ ] Install certificate
- [ ] Test signing with dummy file

### Configuration:
- [ ] Update package.json with signing config
- [ ] Set up environment variables
- [ ] Add certificate files to .gitignore
- [ ] Create build script

### Build & Test:
- [ ] Clean previous builds
- [ ] Build with signing
- [ ] Verify signature
- [ ] Test on clean Windows machine
- [ ] Check SmartScreen behavior
- [ ] Upload to VirusTotal

### Distribution:
- [ ] Sign all installer variants
- [ ] Sign auto-update files (if applicable)
- [ ] Update website with signed download
- [ ] Document signing in release notes

---

## 🎯 RECOMMENDED WORKFLOW FOR BIRILIUM

### Immediate (This Week):
1. **Apply for DigiCert EV Code Signing Certificate**
   - URL: https://www.digicert.com/signing/code-signing-certificates
   - Select: EV Code Signing Certificate
   - Cost: ~$474/year
   - Processing: 3-5 business days

2. **Prepare Documents**
   - Business registration
   - Tax ID/EIN
   - Proof of address
   - D-U-N-S Number (if you don't have, apply at dnb.com)

### Upon Receipt (Next Week):
3. **Install Certificate & Drivers**
   - Insert USB token
   - Install SafeNet Authentication Client
   - Verify certificate appears in certmgr

4. **Update Build Configuration**
   - Add signing config to package.json
   - Set WIN_CSC_NAME environment variable
   - Test build

### Before Release:
5. **Build Signed Installer**
   - Run: `npm run build:win`
   - Verify signature
   - Test on clean machine

6. **Verify No Warnings**
   - Test download from website
   - Confirm no SmartScreen warning
   - Test on multiple Windows versions

### Ongoing:
7. **Sign All Updates**
   - Every new version must be signed
   - Keep certificate renewed
   - Maintain code signing key security

---

## 📞 SUPPORT CONTACTS

### Certificate Authority Support:
- **DigiCert:** +1 (801) 701-9600 | support@digicert.com
- **Sectigo:** +1 (888) 266-6361 | support@sectigo.com
- **GlobalSign:** +1 (877) 775-4562 | support@globalsign.com

### Microsoft SmartScreen:
- **Feedback:** https://www.microsoft.com/wdsi/filesubmission
- **Support:** https://docs.microsoft.com/windows/security/threat-protection/windows-defender-smartscreen

---

## 🔐 SECURITY BEST PRACTICES

1. **Never share your certificate private key**
2. **Never commit certificate files to git**
3. **Use environment variables for passwords**
4. **Store certificates in secure location**
5. **Use hardware token for EV (more secure)**
6. **Revoke certificate if compromised**
7. **Set up certificate expiration reminders**
8. **Keep backup of certificate (encrypted)**
9. **Limit access to signing credentials**
10. **Use strong password for .pfx files**

---

## ✨ SUMMARY

### Quick Answer: **Where to sign your code?**

**Sign your code in these locations:**

1. **Build Configuration:** `Birilium/wallet/package.json`
   - Add `win.certificateFile` or `win.certificateSubjectName`
   - electron-builder will sign automatically during build

2. **After Build:** `Birilium/wallet/dist/`
   - Use SignTool to sign the .exe manually
   - Sign before distributing

3. **Both locations** for maximum flexibility

### Best Setup:
```
DigiCert EV Certificate ($474/year)
    ↓
Configure in package.json
    ↓
Build: npm run build:win
    ↓
Automatic signing during build
    ↓
Verify signature
    ↓
Distribute signed installer
```

**Result:** ✅ No Windows warnings, trusted by users, professional release

---

**Need Help?** Refer to sections above or contact your chosen Certificate Authority's support team.

**Ready to get started?** Apply for your certificate today and have signed installers within a week!
