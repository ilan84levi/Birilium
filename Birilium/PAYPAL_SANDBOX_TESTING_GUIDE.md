# PayPal Sandbox Testing Guide

**Complete guide to test the Premium Subscription feature without spending real money**

---

## 📋 Overview

The wallet is now configured with a **Sandbox Mode** that allows you to test PayPal subscriptions using fake test accounts and fake money. No real payments will be processed while in sandbox mode.

---

## 🎯 Step 1: Access PayPal Developer Dashboard

1. **Go to PayPal Developer Dashboard:**
   - Visit: https://developer.paypal.com/
   - Click **"Log in to Dashboard"** (top right)

2. **Log in with your PayPal account:**
   - Use your regular PayPal account credentials
   - If you don't have a PayPal account, create one at https://www.paypal.com/

3. **You're now in the Developer Dashboard!**
   - This is where you can create sandbox test accounts and get API credentials

---

## 🎯 Step 2: Get Your Sandbox Credentials

### A. Get Sandbox Client ID

1. **Navigate to "Apps & Credentials":**
   - In the Developer Dashboard, click **"Apps & Credentials"** in the top menu

2. **Switch to Sandbox:**
   - Make sure you're on the **"Sandbox"** tab (NOT "Live")

3. **Find your Default Application:**
   - You should see an app called **"Default Application"**
   - If you don't see it, click **"Create App"**:
     - App Name: "Birilium Wallet Sandbox"
     - App Type: Merchant
     - Click "Create App"

4. **Copy the Client ID:**
   - Click on your application name
   - Under **"Sandbox API Credentials"**, you'll see:
     - **Client ID** (starts with `AZ` or similar)
     - **Secret** (keep this private!)
   - **Copy the Client ID** - you'll need this soon!

### B. Create a Sandbox Subscription Plan

1. **Go to Sandbox Test Accounts:**
   - In Dashboard, click **"Testing Tools" → "Sandbox Accounts"** in left menu

2. **Find your Business Account:**
   - Look for an account with type **"Business"** (usually named like `sb-xxxxx-facilitator@business.example.com`)
   - Click the **three dots (⋯)** next to it → Click **"View/Edit Account"**
   - Note down the email and password - you'll need these!

3. **Log into Sandbox Business Account:**
   - Open a **new browser tab** (or incognito window)
   - Go to: https://www.sandbox.paypal.com/
   - Log in with the **business account** credentials you just noted

4. **Create a Subscription Plan:**
   - Once logged in, click your profile icon (top right)
   - Go to: **"Account Settings"** → **"Payment Preferences"** → **"Manage Automatic Payments"**
   - Or directly visit: https://www.sandbox.paypal.com/billing/plans
   - Click **"Create Plan"**

5. **Configure the Plan:**
   - **Plan Name:** "Birilium Premium Mining"
   - **Plan Description:** "Unlimited mining and unlimited wallets"
   - **Plan Type:** Regular
   - **Payment Interval:** Monthly
   - **Price:** $5.00 USD
   - Click **"Create Plan"**

6. **Copy the Plan ID:**
   - After creating, you'll see the plan in your list
   - Click on it to view details
   - **Copy the Plan ID** (starts with `P-` like `P-XXXXXXXXXXXXX`)

---

## 🎯 Step 3: Update Wallet Configuration

1. **Open the wallet file:**
   - Open: `D:\birilium2claude\Birilium\wallet\index.html`
   - Find lines 374-393 (the PayPal Configuration section)

2. **Replace the placeholder credentials:**

   **BEFORE (Lines 383-384):**
   ```javascript
   const PAYPAL_SANDBOX_CLIENT_ID = 'YOUR_SANDBOX_CLIENT_ID_HERE';
   const PAYPAL_SANDBOX_PLAN_ID = 'YOUR_SANDBOX_PLAN_ID_HERE';
   ```

   **AFTER (replace with your actual credentials):**
   ```javascript
   const PAYPAL_SANDBOX_CLIENT_ID = 'AZxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // ← Your Sandbox Client ID from Step 2A
   const PAYPAL_SANDBOX_PLAN_ID = 'P-XXXXXXXXXXXXXXXXXXXXX';           // ← Your Sandbox Plan ID from Step 2B
   ```

3. **Verify Sandbox Mode is enabled (Line 380):**
   ```javascript
   const PAYPAL_SANDBOX_MODE = true; // ← Should be true for testing
   ```

4. **Save the file**

---

## 🎯 Step 4: Create Sandbox Test Accounts (Buyer)

You need a **Personal/Buyer account** to test the subscription purchase.

1. **Go back to Developer Dashboard:**
   - Visit: https://developer.paypal.com/dashboard/accounts

2. **Check existing accounts:**
   - You should see at least 2 default sandbox accounts:
     - **Business** (seller/merchant) - you already used this
     - **Personal** (buyer/customer) - you'll use this now

3. **View Personal Account credentials:**
   - Find the account with type **"Personal"** (email like `sb-xxxxx-buyer@personal.example.com`)
   - Click the **three dots (⋯)** → **"View/Edit Account"**
   - **Write down the Email and Password** - you'll need these to test payments!

4. **(Optional) Create additional test accounts:**
   - Click **"Create Account"**
   - Choose:
     - **Account Type:** Personal
     - **Email:** (auto-generated)
     - **Password:** (auto-generated or set your own)
     - **Balance:** $5000 (fake money for testing)
   - Click **"Create"**

---

## 🎯 Step 5: Test the Subscription Flow

### Start the Wallet

1. **Open terminal in Birilium folder:**
   ```bash
   cd D:\birilium2claude\Birilium
   npm start
   ```

2. **Wait for wallet to open** - you should see:
   - ⚠️ **"SANDBOX MODE - Test payments only (no real money)"** banner
   - This confirms sandbox mode is active!

### Test the Purchase

1. **Create a wallet** (if you haven't already):
   - Click "Create New Wallet"
   - Save your secret key
   - Click "I Have Saved My Secret Key"

2. **Navigate to "Mining Subscription" tab** (left sidebar)

3. **Click the Blue PayPal Button:**
   - A PayPal window will open
   - **IMPORTANT:** The URL should be `www.sandbox.paypal.com` (NOT `www.paypal.com`)
   - If you see `www.paypal.com` (live), stop! Your sandbox mode isn't working.

4. **Log in with your Sandbox Personal Account:**
   - Use the **Personal account** credentials from Step 4
   - Email: `sb-xxxxx-buyer@personal.example.com`
   - Password: (the one you noted)

5. **Review and Confirm Subscription:**
   - You'll see: "Birilium Premium Mining - $5.00/month"
   - Review the details
   - Click **"Agree & Subscribe"**

6. **Subscription Activated!**
   - You should see: "🎉 Premium subscription activated successfully!"
   - Your wallet now has:
     - ✓ Unlimited mining
     - ✓ Unlimited wallets

### Test Mining with Premium

1. **Go to "Mine Coins" tab**
2. **Click "Start Mining"**
3. **Mine more than 20 BRL** - you should NOT be stopped!
4. **Verify unlimited mining works** ✓

### Test Multiple Wallets

1. **Go to "Manage Wallet" tab**
2. **Click "Disconnect Wallet"** (red button at bottom)
3. **Create a new wallet** - should work without errors!
4. **Create a 3rd wallet** - should also work! ✓

---

## 🎯 Step 6: Verify Subscription in PayPal

1. **Log into Sandbox Business Account:**
   - Go to: https://www.sandbox.paypal.com/
   - Log in with your **Business account** credentials (the merchant)

2. **View Subscriptions:**
   - Go to: https://www.sandbox.paypal.com/billing/subscriptions
   - You should see the active subscription from your test buyer

3. **Check Transaction:**
   - Go to: **"Activity"** page
   - You should see a $5.00 payment from the personal account

---

## 🎯 Step 7: Test Subscription Management

### Cancel Subscription (Test)

1. **Log into Personal Account:**
   - Go to: https://www.sandbox.paypal.com/
   - Log in with **Personal account** (the buyer)

2. **Go to Subscriptions:**
   - Click profile icon → **"Settings"** → **"Payments"** → **"Manage automatic payments"**
   - You'll see "Birilium Premium Mining"

3. **Cancel the subscription:**
   - Click on it → Click **"Cancel"**
   - Confirm cancellation

4. **Test in wallet:**
   - The subscription should still work until the end of the billing period
   - After cancellation date, mining should be limited to 20 BRL again

---

## 🎯 Step 8: Switch to Live Mode (Production)

**ONLY do this when you're ready to accept real payments!**

1. **Get Live Credentials:**
   - Go to: https://developer.paypal.com/dashboard/applications/live
   - Create a **Live App** (NOT Sandbox)
   - Get your **Live Client ID**
   - Create a **Live Subscription Plan** at https://www.paypal.com/billing/plans
   - Get the **Live Plan ID**

2. **Update Configuration (Line 380 & 387-388):**
   ```javascript
   const PAYPAL_SANDBOX_MODE = false; // ← Change to false

   // Update these with your LIVE credentials
   const PAYPAL_LIVE_CLIENT_ID = 'AYxxxxx_your_live_client_id_xxxxx';
   const PAYPAL_LIVE_PLAN_ID = 'P-xxxxx_your_live_plan_id_xxxxx';
   ```

3. **Test with a real PayPal account:**
   - The PayPal button will now process **real payments**
   - Make a real $5 payment to test
   - Verify subscription activates correctly

4. **You're live!** 🎉

---

## ❓ Troubleshooting

### "PayPal button not showing"
- **Check browser console** (F12) for errors
- Verify Client ID is correct (no spaces, no quotes)
- Make sure you saved the `index.html` file

### "Invalid Client ID"
- Double-check you copied the **Sandbox Client ID** (NOT the Secret!)
- Make sure there are no spaces or line breaks
- Verify you're using the **Sandbox** credentials (not Live)

### "Plan not found"
- Verify the Plan ID starts with `P-`
- Make sure you created the plan in the **Sandbox Business account**
- Log into https://www.sandbox.paypal.com/ with business account and check plans

### "Subscription succeeds but not activated in wallet"
- Check if the blockchain node is running (`node.js` must be active)
- Verify the node is accessible at `http://localhost:3001`
- Check browser console for error messages
- Verify `/api/subscription/activate` endpoint exists in `node.js`

### "Sandbox mode banner not showing"
- Verify `PAYPAL_SANDBOX_MODE = true` (Line 380)
- Clear browser cache and reload
- Check if `#paypal-button-container-P-2AE31843879973003ND5UCTA` element exists

### "PayPal redirects to live site (www.paypal.com)"
- This means Sandbox mode is NOT active
- Verify `PAYPAL_SANDBOX_MODE = true`
- Make sure you're using **Sandbox** credentials, not Live
- Clear browser cache and restart wallet

---

## 📊 Test Checklist

Use this checklist to verify everything works:

- [ ] Sandbox credentials configured correctly
- [ ] Sandbox mode banner shows in wallet
- [ ] PayPal button appears in "Mining Subscription" tab
- [ ] Clicking button opens `www.sandbox.paypal.com` (NOT live)
- [ ] Can log in with sandbox personal account
- [ ] Can complete subscription payment (fake money)
- [ ] Wallet shows success message
- [ ] Can mine more than 20 BRL without limit
- [ ] Can create multiple wallets (more than 1)
- [ ] Subscription appears in sandbox business account
- [ ] Transaction appears in business account "Activity"
- [ ] Can cancel subscription from personal account

---

## 🔒 Security Notes

### Sandbox Credentials
- **Sandbox credentials are safe to share** (they only work in test environment)
- Never commit **Live credentials** to git/GitHub
- Keep your **PayPal Secret** private (both sandbox and live)

### Production Checklist
Before switching to live mode:
- [ ] Change `PAYPAL_SANDBOX_MODE` to `false`
- [ ] Update to Live Client ID and Live Plan ID
- [ ] Test with a real PayPal payment ($5.00)
- [ ] Verify subscription activation works
- [ ] Set up webhook for subscription renewals/cancellations
- [ ] Monitor the `/api/subscription/activate` endpoint for errors

---

## 📚 Additional Resources

- **PayPal Developer Docs:** https://developer.paypal.com/docs/subscriptions/
- **Sandbox Testing Guide:** https://developer.paypal.com/tools/sandbox/
- **Subscription Plans:** https://developer.paypal.com/docs/subscriptions/integrate/
- **Test Credit Cards:** https://developer.paypal.com/tools/sandbox/card-testing/

---

## 🆘 Need Help?

If you encounter issues:

1. **Check browser console** (F12 → Console tab)
2. **Check node.js logs** (terminal where node is running)
3. **Verify all credentials** are correct
4. **Test in incognito mode** (eliminates cache issues)
5. **Review this guide step-by-step**

---

**Version:** 1.0
**Last Updated:** 2025-01-16
**Status:** Ready for Testing ✅
