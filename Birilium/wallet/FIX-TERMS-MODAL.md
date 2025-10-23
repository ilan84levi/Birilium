# 🔧 Fix Terms Modal Issue

## Problem
The Terms of Use modal appears but you can't check the checkbox or click "Accept & Continue".

## Quick Fixes (Choose One)

### Fix #1: Use Browser Console (Easiest - 30 seconds)
1. Start the wallet: `npm start`
2. When the Terms modal appears, press **F12** (or Ctrl+Shift+I)
3. Click the **Console** tab
4. Copy and paste this command:
   ```javascript
   localStorage.setItem('biriliumTermsAccepted', 'true'); location.reload();
   ```
5. Press **Enter**
6. The wallet will reload and skip the terms modal

### Fix #2: Clear localStorage and Try Again
1. Press **F12** to open DevTools
2. Go to **Application** tab (or Storage tab)
3. Expand **Local Storage** on the left
4. Click on `file://` entry
5. Right-click → **Clear**
6. Close DevTools
7. Restart the wallet
8. Try accepting terms again

### Fix #3: Test the Checkbox Separately
1. Open this file in your browser:
   ```
   D:\birilium2claude\Birilium\wallet\debug-terms.html
   ```
2. Test if checkboxes and buttons work
3. If they work here, the issue is with the main app styling

### Fix #4: Bypass Terms for Testing
1. Close the wallet if running
2. Double-click: `D:\birilium2claude\Birilium\wallet\BYPASS-TERMS.bat`
3. This will start the wallet with terms pre-accepted

---

## Debugging Steps

### Step 1: Check Console for Errors
When the modal appears:
1. Press **F12**
2. Look for red error messages in the Console tab
3. Tell me what errors you see (if any)

### Step 2: Test the Checkbox
With DevTools open (F12):
1. Click the **Elements** tab (or Inspector)
2. Find the checkbox element (`<input type="checkbox" id="agreeCheckbox">`)
3. Try clicking it in the actual modal
4. Watch the Console - does it log "Checkbox changed: true"?

### Step 3: Test the Button
1. In Console, run:
   ```javascript
   document.getElementById('acceptTermsBtn').disabled
   ```
2. If it says `true`, run:
   ```javascript
   document.getElementById('acceptTermsBtn').disabled = false
   ```
3. Try clicking the button now

---

## Possible Causes

### 1. **CSS/Z-Index Issue**
Something might be covering the modal. Try:
```javascript
// Run in Console
document.getElementById('termsOverlay').style.zIndex = '999999';
```

### 2. **Event Listener Not Attached**
Check if listeners are attached:
```javascript
// Run in Console
const checkbox = document.getElementById('agreeCheckbox');
console.log('Checkbox found:', !!checkbox);
console.log('Has listeners:', checkbox._events || 'unknown');
```

### 3. **localStorage Conflict**
Clear and test:
```javascript
// Run in Console
localStorage.clear();
location.reload();
```

---

## If Nothing Works

Run this complete diagnostic in the Console:
```javascript
// Diagnostic script
console.log('=== TERMS MODAL DIAGNOSTIC ===');
console.log('Modal element:', !!document.getElementById('termsOverlay'));
console.log('Checkbox element:', !!document.getElementById('agreeCheckbox'));
console.log('Button element:', !!document.getElementById('acceptTermsBtn'));
console.log('localStorage terms:', localStorage.getItem('biriliumTermsAccepted'));
console.log('Button disabled:', document.getElementById('acceptTermsBtn')?.disabled);

// Try to fix automatically
console.log('\n=== ATTEMPTING AUTO-FIX ===');
const checkbox = document.getElementById('agreeCheckbox');
const button = document.getElementById('acceptTermsBtn');

if (checkbox && button) {
    checkbox.checked = true;
    button.disabled = false;
    console.log('✓ Checkbox checked and button enabled');
    console.log('Now try clicking the "Accept & Continue" button');
} else {
    console.log('✗ Could not find checkbox or button elements');
}
```

Copy the output and send it to me - I'll help debug further!

---

## Permanent Fix

Once we identify the root cause, I'll create a proper fix. For now, use Fix #1 (console command) to get past the modal and test the wallet.
