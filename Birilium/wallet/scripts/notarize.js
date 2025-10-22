/**
 * Birilium Wallet - macOS Notarization Script
 *
 * This script handles automatic notarization of macOS builds.
 * Notarization is required for apps to run on macOS 10.15+ without warnings.
 *
 * Setup:
 * 1. Install: npm install --save-dev @electron/notarize
 * 2. Set environment variables:
 *    - APPLE_ID: Your Apple ID email
 *    - APPLE_APP_SPECIFIC_PASSWORD: App-specific password from appleid.apple.com
 *    - APPLE_TEAM_ID: Your 10-character team ID from developer.apple.com
 * 3. Add to package.json: "afterSign": "scripts/notarize.js"
 */

const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization (not a macOS build)');
    return;
  }

  // Check for required environment variables
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn('⚠️  Skipping notarization: Missing environment variables');
    console.warn('   Required: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID');
    console.warn('   Set these in your environment or CI/CD pipeline');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`🔐 Notarizing ${appName}...`);
  console.log(`   App path: ${appPath}`);
  console.log(`   Apple ID: ${appleId}`);
  console.log(`   Team ID: ${teamId}`);

  try {
    await notarize({
      appBundleId: 'com.birilium.wallet',
      appPath: appPath,
      appleId: appleId,
      appleIdPassword: appleIdPassword,
      teamId: teamId
    });

    console.log('✅ Notarization successful!');
  } catch (error) {
    console.error('❌ Notarization failed:', error);
    throw error;
  }
};

/**
 * SETUP INSTRUCTIONS:
 *
 * 1. Enroll in Apple Developer Program ($99/year)
 *    https://developer.apple.com/programs/
 *
 * 2. Create an App-Specific Password:
 *    - Go to: https://appleid.apple.com/account/manage
 *    - Sign in with your Apple ID
 *    - Go to: Security > App-Specific Passwords
 *    - Click "Generate Password"
 *    - Label it "Birilium Wallet Notarization"
 *    - Save the generated password (you won't see it again)
 *
 * 3. Find your Team ID:
 *    - Go to: https://developer.apple.com/account
 *    - Your Team ID is displayed under your name (10-character code)
 *
 * 4. Set environment variables (don't commit these!):
 *    export APPLE_ID="your-email@example.com"
 *    export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
 *    export APPLE_TEAM_ID="XXXXXXXXXX"
 *
 * 5. For CI/CD (GitHub Actions), add as repository secrets:
 *    Settings > Secrets and variables > Actions > New repository secret
 *
 * 6. Install notarization dependency:
 *    npm install --save-dev @electron/notarize
 *
 * 7. Update package.json build config:
 *    {
 *      "build": {
 *        "afterSign": "scripts/notarize.js",
 *        "mac": {
 *          "identity": "Developer ID Application: Your Name (TEAM_ID)",
 *          "hardenedRuntime": true,
 *          "gatekeeperAssess": false,
 *          "entitlements": "build/entitlements.mac.plist",
 *          "entitlementsInherit": "build/entitlements.mac.plist"
 *        }
 *      }
 *    }
 *
 * 8. Build for macOS:
 *    npm run build:mac
 *
 * TROUBLESHOOTING:
 *
 * - "You must first sign the relevant contracts online"
 *   → Go to https://appstoreconnect.apple.com and accept agreements
 *
 * - "Invalid password for Apple ID"
 *   → Make sure you're using an app-specific password, not your Apple ID password
 *
 * - "Could not find app bundle"
 *   → Check that the app was built successfully before notarization
 *
 * - Notarization takes 5-15 minutes
 *   → This is normal, Apple's servers validate your app
 *
 * VERIFY NOTARIZATION:
 *
 * After successful notarization, verify:
 *   spctl -a -vv -t install "Birilium Wallet.app"
 *
 * Should show:
 *   "Birilium Wallet.app: accepted"
 *   "source=Notarized Developer ID"
 */
