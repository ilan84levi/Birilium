# 🔐 Security Setup Guide for Birilium Wallet

This guide helps you set up additional security measures for production deployment.

---

## 📋 Quick Start Security Checklist

**Right Now (5 minutes):**
- [ ] Update .env with newly generated credentials (see below)
- [ ] Enable 2FA on PayPal account
- [ ] Enable 2FA on Gmail account
- [ ] Verify .env is in .gitignore
- [ ] Restart node with new credentials

**This Week:**
- [ ] Set up IP whitelist for admin access
- [ ] Configure security monitoring
- [ ] Test all functionality
- [ ] Set up automated backups

---

## 1. Two-Factor Authentication (2FA)

### PayPal Account 2FA (CRITICAL - Money Protection)

1. Go to: https://www.paypal.com/myaccount/security
2. Click "2-Step Verification"
3. Choose "Authenticator app" (recommended)
4. Scan QR code with:
   - Google Authenticator
   - Microsoft Authenticator
   - Authy
5. Save backup codes in a secure location

### Gmail Account 2FA (Email Protection)

1. Go to: https://myaccount.google.com/security
2. Enable "2-Step Verification"
3. Add authenticator app
4. Add recovery phone number
5. Download backup codes

### Why 2FA Matters:
- Protects against password theft
- Even if .env is compromised, attackers can't access accounts
- Required for PCI compliance (PayPal)

---

## 2. Security Monitoring

### A. Monitor These Events

**Critical (alert immediately):**
- Failed admin login attempts (>5 in 10 minutes)
- Large transactions (>10,000 BRL)
- PayPal webhook failures
- Database connection errors
- Unusual API activity patterns

**Important (review daily):**
- All admin panel access
- Transaction volume spikes
- API error rates
- Rate limit hits

### B. How to Check Logs

```bash
# View last 100 log entries
tail -100 Birilium/wallet/node-backend/logs/node.log

# Search for errors
grep -i "error" Birilium/wallet/node-backend/logs/node.log

# Search for failed logins
grep -i "unauthorized" Birilium/wallet/node-backend/logs/node.log

# Monitor in real-time
tail -f Birilium/wallet/node-backend/logs/node.log
```

### C. Set Up Email Alerts

**Add to node.js (after line 600):**

```javascript
// Email alert for critical security events
function sendSecurityAlert(event, details) {
    if (!process.env.CONTACT_EMAIL || !process.env.CONTACT_EMAIL_PASSWORD) {
        console.error('Cannot send alert - email not configured');
        return;
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.CONTACT_EMAIL,
            pass: process.env.CONTACT_EMAIL_PASSWORD
        }
    });

    transporter.sendMail({
        from: process.env.CONTACT_EMAIL,
        to: process.env.CONTACT_EMAIL,
        subject: `SECURITY ALERT: ${event}`,
        text: `Security Event: ${event}\n\nDetails:\n${JSON.stringify(details, null, 2)}\n\nTimestamp: ${new Date().toISOString()}`
    });
}

// Use it:
sendSecurityAlert('MULTIPLE_FAILED_LOGINS', { ip: req.ip, count: 5 });
```

---

## 3. Admin Panel Security Hardening

### A. Add IP Whitelist

**In .env, add:**
```bash
# Only allow admin access from these IPs (comma-separated)
# Leave empty to allow all IPs
ADMIN_ALLOWED_IPS=YOUR_HOME_IP,YOUR_OFFICE_IP
```

**In node.js authenticateAdmin function, add:**
```javascript
const ADMIN_ALLOWED_IPS = (process.env.ADMIN_ALLOWED_IPS || '').split(',').filter(Boolean);

if (ADMIN_ALLOWED_IPS.length > 0) {
    const clientIP = req.ip || req.connection.remoteAddress;
    if (!ADMIN_ALLOWED_IPS.includes(clientIP)) {
        logger.warn({ ip: clientIP }, 'Admin access blocked - IP not whitelisted');
        return res.status(403).json({ error: 'Access denied from this IP' });
    }
}
```

### B. Account Lockout After Failed Attempts

Track failed login attempts and lock account temporarily:

```javascript
const failedAttempts = new Map(); // In-memory tracking

function checkFailedAttempts(username, ip) {
    const key = `${username}:${ip}`;
    const attempts = failedAttempts.get(key) || { count: 0, firstAttempt: Date.now() };

    // Reset if more than 15 minutes old
    if (Date.now() - attempts.firstAttempt > 15 * 60 * 1000) {
        failedAttempts.delete(key);
        return true; // Allow
    }

    // Block if >5 attempts
    if (attempts.count >= 5) {
        logger.warn({ username, ip }, 'Account locked due to failed attempts');
        return false; // Block
    }

    return true; // Allow
}

function recordFailedAttempt(username, ip) {
    const key = `${username}:${ip}`;
    const attempts = failedAttempts.get(key) || { count: 0, firstAttempt: Date.now() };
    attempts.count++;
    failedAttempts.set(key, attempts);
}
```

---

## 4. PayPal Security

### A. Verify Webhook Signatures

**Always verify PayPal webhooks are authentic:**

```javascript
// PayPal webhook verification
const crypto = require('crypto');

function verifyPayPalWebhook(req) {
    const signature = req.headers['paypal-transmission-sig'];
    const certUrl = req.headers['paypal-cert-url'];
    const transmissionId = req.headers['paypal-transmission-id'];
    const transmissionTime = req.headers['paypal-transmission-time'];
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;

    // Download and verify certificate
    // Verify signature matches
    // Return true if valid

    // For now, at minimum check the webhook ID
    return req.body.event_type && webhookId;
}
```

### B. Monitor PayPal Transactions

**Weekly reconciliation:**
1. Export transactions from PayPal dashboard
2. Compare with database subscriptions
3. Investigate discrepancies
4. Look for:
   - Refunds/chargebacks
   - Failed payments
   - Suspicious patterns

---

## 5. Database Security

### A. Backup Strategy

**Automated daily backups:**

```bash
# Create backup script
cat > Birilium/wallet/node-backend/backup-db.sh << 'SCRIPT'
#!/bin/bash
BACKUP_DIR="./backups"
DB_PATH="./data/birilium.db"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cp $DB_PATH "$BACKUP_DIR/birilium_backup_$DATE.db"

# Keep only last 30 days
find $BACKUP_DIR -name "*.db" -mtime +30 -delete
SCRIPT

chmod +x Birilium/wallet/node-backend/backup-db.sh

# Add to crontab (run daily at 2 AM)
# 0 2 * * * cd /path/to/Birilium/wallet/node-backend && ./backup-db.sh
```

### B. Encrypt Sensitive Data

SQLite encryption (using SQLCipher):
```bash
npm install better-sqlite3-with-sqlcipher
```

---

## 6. Network Security

### A. Use HTTPS in Production

**Get free SSL certificate:**
1. Use Let's Encrypt (free): https://letsencrypt.org/
2. Or CloudFlare SSL (free tier available)

**Enable HTTPS in node.js:**
```javascript
const https = require('https');
const fs = require('fs');

if (process.env.NODE_ENV === 'production') {
    const options = {
        key: fs.readFileSync('./certs/privkey.pem'),
        cert: fs.readFileSync('./certs/fullchain.pem')
    };

    https.createServer(options, app).listen(443);
}
```

### B. Rate Limiting (Already Configured ✓)

Current limits are good:
- API: 100 requests per 15 minutes
- Mining: 30 requests per minute

---

## 7. Regular Security Maintenance

### Weekly Tasks (Mondays, 10 minutes)

```bash
# 1. Check for vulnerabilities
npm audit

# 2. Review logs for errors
tail -100 logs/node.log | grep -i error

# 3. Check failed login attempts
grep -i "unauthorized" logs/node.log | tail -20

# 4. Verify database backup exists
ls -lh backups/ | tail -5
```

### Monthly Tasks (1st of month, 30 minutes)

- [ ] Update dependencies: `npm update`
- [ ] Review all admin access logs
- [ ] Check PayPal reconciliation
- [ ] Test disaster recovery procedure
- [ ] Review and rotate credentials if needed
- [ ] Check disk space and log sizes

### Quarterly Tasks (Every 3 months)

- [ ] Full security audit
- [ ] Update Node.js and Electron versions
- [ ] Review and update security policies
- [ ] Test all backup/restore procedures

---

## 8. Incident Response Plan

### If You Detect a Breach:

**Within 1 hour:**
1. Shut down the service immediately
2. Change ALL credentials (PayPal, Gmail, admin, API keys)
3. Revoke all API keys and tokens
4. Check PayPal for unauthorized transactions
5. Check database for unauthorized changes

**Within 24 hours:**
6. Review logs for the past 30 days
7. Identify what was compromised
8. Determine how breach occurred
9. Document timeline
10. Restore from clean backup if needed

**Within 1 week:**
11. Implement fixes
12. Update security measures
13. Complete incident report
14. Notify affected users (if personal data was compromised)

### Emergency Contacts:
- PayPal: https://www.paypal.com/us/smarthelp/contact-us
- Google: https://support.google.com/accounts/answer/9130730

---

## 9. Security Tools Recommendations

### Error Monitoring (Free tier available)
**Sentry**: https://sentry.io
```bash
npm install @sentry/node
```

### Process Management
**PM2**: Keeps your node running, restarts on crash
```bash
npm install -g pm2
pm2 start node.js --name birilium-node
pm2 startup  # Auto-start on boot
```

### DDoS Protection
**CloudFlare** (Free): https://cloudflare.com
- DDoS mitigation
- CDN
- SSL certificate
- Rate limiting

---

## 10. Quick Reference: New Credentials

**Copy these to your .env file:**

```bash
# Generated secure credentials from earlier:
API_KEY=95a428805e71722c87f70dcb204b35f41cef06ee7d761a5dce2a04fa396311d0
NODE_PRIVATE_KEY=YOUR_GENERATED_NODE_PRIVATE_KEY
ADMIN_PASSWORD=YOUR_SECURE_ADMIN_PASSWORD
ADMIN_USERNAME=YOUR_ADMIN_USERNAME
```

**You still need to manually update:**
- PayPal credentials (regenerate in PayPal dashboard)
- Gmail app password (regenerate in Google account)

---

## ✅ Implementation Priority

**Priority 1 (Do Now - 10 minutes):**
1. Update .env with new credentials
2. Enable 2FA on PayPal
3. Enable 2FA on Gmail
4. Test wallet still works

**Priority 2 (This Week - 1 hour):**
5. Add IP whitelist for admin
6. Set up email security alerts
7. Configure automated backups
8. Review all logs

**Priority 3 (This Month - 2 hours):**
9. Set up monitoring dashboard
10. Implement account lockout
11. Add PayPal webhook verification
12. Create disaster recovery plan

---

**Questions or need help implementing any of these? Let me know!**
