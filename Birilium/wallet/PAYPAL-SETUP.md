# 💳 PayPal Subscription Setup Guide

## Problem: PayPal Buttons Not Showing

If you don't see the PayPal subscription buttons in the "Mining Subscription" tab, you're missing the `PAYPAL_PLAN_ID` in your `.env` file.

## ✅ Quick Fix

Add this line to `wallet/node-backend/.env`:

```bash
PAYPAL_PLAN_ID=P-2AE31843879973003ND5UCTA
```

## 📋 Complete PayPal Configuration

Your `.env` file should have these PayPal settings:

```bash
# PAYPAL CONFIGURATION
PAYPAL_MODE=live                    # 'sandbox' for testing, 'live' for production
PAYPAL_CLIENT_ID=your_client_id     # From PayPal dashboard
PAYPAL_CLIENT_SECRET=your_secret    # From PayPal dashboard
PAYPAL_PLAN_ID=your_plan_id         # Subscription plan ID
```

## 🔧 How to Get PayPal Credentials

### 1. Create PayPal Developer Account
- Go to: https://developer.paypal.com/
- Sign in or create account

### 2. Get Client ID & Secret
1. Go to: https://developer.paypal.com/dashboard/
2. Click "Apps & Credentials"
3. Switch to "Live" (for production) or "Sandbox" (for testing)
4. Click your app or "Create App"
5. Copy:
   - **Client ID** → `PAYPAL_CLIENT_ID`
   - **Secret** (click "Show") → `PAYPAL_CLIENT_SECRET`

### 3. Create Subscription Plan
1. Go to: https://www.paypal.com/businessprofile/settings
2. Click "Payment buttons" > "Create button"
3. Choose "Subscription"
4. Set:
   - Name: "Premium Mining Plan"
   - Price: $5.00
   - Billing cycle: Monthly
5. Click "Create button"
6. Copy the **Plan ID** (format: `P-XXXXXXXXXXXXX`) → `PAYPAL_PLAN_ID`

### 4. Update .env File
```bash
cd wallet/node-backend
nano .env   # or use your text editor
```

Add the three PayPal variables, then restart the wallet.

## 🧪 Test in Sandbox Mode

For testing without real money:

```bash
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_secret
PAYPAL_PLAN_ID=your_sandbox_plan_id
```

Use PayPal sandbox test accounts: https://developer.paypal.com/dashboard/accounts

## ✅ Verify It Works

1. Restart the wallet: `npm start`
2. Go to "Mining Subscription" tab
3. You should see the blue PayPal button
4. Click it to test (sandbox mode won't charge real money)

## 🔒 Security Notes

- **NEVER commit `.env` to git** (it's already in .gitignore)
- **Keep `PAYPAL_CLIENT_SECRET` private**
- Use sandbox mode for testing
- Use live mode only in production

## 🐛 Troubleshooting

**Buttons still not showing?**
1. Check browser console (F12) for errors
2. Verify all 3 PayPal env vars are set
3. Restart the wallet completely
4. Check `http://localhost:3001/api/paypal-config` returns valid data

**"Invalid credentials" error?**
- Make sure you're using the right mode (sandbox vs live)
- Regenerate your secret from PayPal dashboard
- Check for typos in Client ID/Secret

**Subscription doesn't activate?**
- Check the subscription endpoint: `POST /api/subscription/activate`
- Verify Plan ID matches your PayPal plan
- Check MongoDB connection (subscriptions are stored there)

## 📚 More Info

- PayPal Developer Docs: https://developer.paypal.com/docs/subscriptions/
- Birilium Security Guide: `wallet/SECURITY.md`
