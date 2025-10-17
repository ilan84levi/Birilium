# Birilium Wallet - Security Guidelines

## 🔐 Critical Security Information

### Environment Variables (.env file)

**⚠️ WARNING: The `.env` file contains sensitive credentials and MUST NEVER be committed to version control!**

The `.env` file is already configured in `.gitignore` to prevent accidental commits.

### PayPal Credentials

The following credentials are stored in the `.env` file:

- `PAYPAL_CLIENT_ID` - Public client ID (safe to expose in browser)
- `PAYPAL_CLIENT_SECRET` - **NEVER expose this!** Keep it server-side only
- `PAYPAL_PLAN_ID` - Subscription plan identifier

#### Setup Instructions:

1. **Copy the example file:**
   ```bash
   cd node-backend
   cp .env.example .env
   ```

2. **Get your PayPal credentials:**
   - Go to https://developer.paypal.com/dashboard/
   - Navigate to: Apps & Credentials > Sandbox/Live
   - Create or select your app
   - Copy your Client ID and Secret

3. **Update `.env` file:**
   - Replace the placeholder values with your actual credentials
   - Set `PAYPAL_MODE=sandbox` for testing
   - Set `PAYPAL_MODE=live` for production

### API Architecture

The wallet now uses a secure architecture:

1. **Frontend** (`index.html`) - Loads PayPal config from backend API
2. **Backend** (`node.js`) - Serves PayPal Client ID via `/api/paypal-config`
3. **Environment** (`.env`) - Stores secret credentials server-side only

This prevents exposing sensitive API secrets in the frontend code.

### Connection Retry Logic

The wallet implements automatic connection retry:

- Attempts to connect to the blockchain node on startup
- Retries up to 10 times with 3-second intervals
- Shows warning if node is unreachable
- All critical operations use retry logic

### Before Deploying to Production:

1. ✅ Set `PAYPAL_MODE=live` in `.env`
2. ✅ Update `ADMIN_PASSWORD` in `.env`
3. ✅ Change default `API_KEY` in `.env`
4. ✅ Enable `ENABLE_P2P_TLS=true` for encrypted P2P traffic
5. ✅ Review and update `CORS_ORIGINS` for your domain
6. ✅ Never commit `.env` file to git
7. ✅ Use environment-specific `.env` files for different deployments
8. ✅ Regularly rotate API keys and passwords

### File Protection

The following files contain sensitive data and are protected:

- `node-backend/.env` - Environment variables with secrets
- `birilium-wallet-backup-*.json` - Wallet backups with private keys
- `node-backend/data/` - Blockchain database
- `node-backend/certs/` - TLS certificates with private keys
- `node-backend/logs/` - May contain sensitive debug information

All of these are included in `.gitignore`.

### Security Best Practices:

1. **Never share your `.env` file**
2. **Use different credentials for sandbox and live modes**
3. **Regularly review PayPal dashboard for suspicious activity**
4. **Keep your Node.js and dependencies updated**
5. **Use strong passwords for admin accounts**
6. **Enable rate limiting (already configured)**
7. **Monitor logs for unusual activity**
8. **Backup your database regularly**
9. **Use HTTPS for production deployments**
10. **Keep wallet backup files secure and offline**

### Incident Response:

If you suspect your credentials have been compromised:

1. Immediately rotate all API keys in `.env`
2. Change admin password
3. Regenerate PayPal Client Secret from dashboard
4. Review recent transactions in PayPal dashboard
5. Check logs for unauthorized access
6. Update deployed applications with new credentials

### Support:

For security concerns, please contact the development team immediately.
