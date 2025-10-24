# 🔒 Birilium Wallet - Production Security Checklist

**Version:** 1.0.7
**Last Updated:** October 24, 2025
**Status:** Ready for Production Deployment

---

## 📋 **Pre-Deployment Security Checklist**

Use this checklist before deploying Birilium Wallet to production environments.

---

## ✅ **CRITICAL - Must Complete Before Production**

### **1. Authentication & Credentials**

- [ ] **Change Admin Password**
  - Current: `Levi84SecureAdmin@2025!`
  - Required: Minimum 12 characters with uppercase, lowercase, numbers, symbols
  - Location: `Birilium/wallet/node-backend/.env`
  - Example: `ADMIN_PASSWORD=MyUn!qu3P@ssw0rd2025#Secure`

- [ ] **Generate Strong API Key**
  - Remove default API key
  - Generate new 32-byte random key
  - Command: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  - Update in `.env`: `API_KEY=<your_generated_key>`

- [ ] **Rotate PayPal Credentials**
  - If PayPal credentials were ever exposed, regenerate them
  - Update `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`
  - Test integration after rotation

- [ ] **Generate Node Private Key**
  - Create unique P2P node identity
  - Command: `node -e "const EC = require('elliptic').ec; const ec = new EC('secp256k1'); console.log(ec.genKeyPair().getPrivate('hex'))"`
  - Update in `.env`: `NODE_PRIVATE_KEY=<generated_key>`

---

### **2. Environment Configuration**

- [ ] **Set NODE_ENV to production**
  ```env
  NODE_ENV=production
  ```

- [ ] **Enable HTTPS/TLS**
  - Obtain SSL/TLS certificates (Let's Encrypt, commercial CA)
  - Update server configuration to use HTTPS
  - Redirect HTTP → HTTPS

- [ ] **Configure CORS Properly**
  ```env
  CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
  ```
  - Remove wildcard (`*`) origins
  - List only authorized domains

- [ ] **Enable P2P TLS Encryption**
  ```env
  ENABLE_P2P_TLS=true
  P2P_TLS_REQUIRE_CLIENT_CERT=true
  ```
  - Generate certificates: `node generate-certs.js`
  - Distribute CA cert to authorized nodes only

- [ ] **Configure Rate Limiting**
  ```env
  RATE_LIMIT_MAX=100
  MINING_RATE_LIMIT_MAX=10
  ```
  - Adjust based on expected traffic
  - Consider DDoS protection service (Cloudflare, AWS Shield)

---

### **3. File & Directory Permissions**

- [ ] **Verify .env is NOT in Git**
  ```bash
  git ls-files | grep "\.env$"
  ```
  - Should return nothing
  - If found, remove immediately and rotate all secrets

- [ ] **Check .gitignore Coverage**
  - Ensure `.env`, `*.pem`, `*.key`, `certs/` are ignored
  - Verify with: `cat .gitignore`

- [ ] **Set Secure File Permissions** (Linux/Mac)
  ```bash
  chmod 600 .env
  chmod 600 certs/*.pem
  chmod 700 data/
  chmod 700 logs/
  ```

- [ ] **Disable Directory Listing**
  - Configure web server to prevent directory browsing
  - Nginx: `autoindex off;`
  - Apache: `Options -Indexes`

---

### **4. Database Security**

- [ ] **Enable MongoDB Authentication**
  ```env
  MONGODB_URI=mongodb://admin:password@localhost:27017/birilium?authSource=admin
  ```

- [ ] **Create Database User with Limited Permissions**
  ```javascript
  use birilium
  db.createUser({
    user: "birilium_app",
    pwd: "strong_password_here",
    roles: [{ role: "readWrite", db: "birilium" }]
  })
  ```

- [ ] **Enable MongoDB Access Control**
  - Start MongoDB with `--auth` flag
  - Configure firewall to block external MongoDB access (port 27017)

- [ ] **Regular Backups**
  - Automated daily backups
  - Encrypted backup storage
  - Test restore procedure

---

### **5. Network Security**

- [ ] **Configure Firewall Rules**
  - **Allow:** 3001 (HTTP API), 6001 (P2P), 443 (HTTPS)
  - **Block:** 27017 (MongoDB), 22 (SSH - except from specific IPs)

  Example (UFW):
  ```bash
  ufw allow 443/tcp
  ufw allow 3001/tcp
  ufw allow 6001/tcp
  ufw deny 27017/tcp
  ufw enable
  ```

- [ ] **Implement Reverse Proxy** (Nginx/Apache)
  - Terminate SSL at proxy
  - Add additional security headers
  - Enable request logging
  - Rate limiting at proxy level

- [ ] **DDoS Protection**
  - Use Cloudflare, AWS Shield, or similar
  - Configure rate limiting
  - Implement CAPTCHA for sensitive endpoints

---

## ⚠️ **HIGH PRIORITY - Strongly Recommended**

### **6. Application Security**

- [ ] **Security Headers Verified**
  - Test with: `curl -I https://yourapp.com/api/stats`
  - Should see: CSP, HSTS, X-Frame-Options, X-Content-Type-Options

- [ ] **Input Validation**
  - All API endpoints use Joi schema validation
  - Review schemas in `node-backend/node.js`
  - Add validation where missing

- [ ] **Remove Debug Logs in Production**
  ```env
  LOG_LEVEL=info  # Not 'debug' or 'verbose'
  ```

- [ ] **Secure Cookie Settings** (if using cookies)
  - Set `Secure` flag (HTTPS only)
  - Set `HttpOnly` flag (prevent XSS)
  - Set `SameSite=Strict` (prevent CSRF)

---

### **7. Monitoring & Logging**

- [ ] **Enable Metrics Collection**
  ```env
  METRICS_ENABLED=true
  METRICS_PATH=/metrics
  ```

- [ ] **Set Up Log Aggregation**
  - Centralized logging (ELK stack, Splunk, CloudWatch)
  - Monitor error rates
  - Alert on anomalies

- [ ] **Security Event Monitoring**
  - Failed authentication attempts
  - Unusual mining activity
  - Abnormal transaction patterns
  - Rate limit violations

- [ ] **Uptime Monitoring**
  - External monitoring service (UptimeRobot, Pingdom)
  - Alert on downtime
  - Monitor response times

---

### **8. Code Security**

- [ ] **Dependency Audit**
  ```bash
  npm audit
  npm audit fix
  ```
  - Run before each deployment
  - Review and update outdated packages

- [ ] **Remove Development Dependencies in Production**
  ```bash
  npm install --production
  ```

- [ ] **Code Review**
  - Peer review security-sensitive code
  - Check for hardcoded secrets
  - Verify input sanitization

---

## 🔍 **MEDIUM PRIORITY - Before Public Release**

### **9. Advanced Security**

- [ ] **Implement JWT Authentication**
  - Replace basic auth with JWT tokens
  - Add token expiration
  - Implement refresh tokens

- [ ] **Password Hashing**
  - Use bcrypt for admin passwords
  - Salt all passwords
  - Implement password rotation policy

- [ ] **Two-Factor Authentication (2FA)**
  - Optional for admin access
  - TOTP-based (Google Authenticator compatible)

- [ ] **Session Management**
  - Implement session timeouts
  - Secure session storage
  - Session revocation capability

---

### **10. Compliance & Legal**

- [ ] **Privacy Policy**
  - GDPR compliance (if serving EU users)
  - CCPA compliance (if serving California users)
  - Clear data retention policies

- [ ] **Terms of Service**
  - Liability disclaimers
  - User responsibilities
  - Service limitations

- [ ] **Security Disclosure Policy**
  - Responsible disclosure process
  - Security contact email
  - Bug bounty program (optional)

- [ ] **Audit Trail**
  - Log all admin actions
  - Track wallet creations
  - Monitor large transactions

---

### **11. Incident Response**

- [ ] **Incident Response Plan**
  - Define security incident procedures
  - Escalation path
  - Communication templates

- [ ] **Backup & Recovery**
  - Document recovery procedures
  - Test recovery process quarterly
  - Off-site backup storage

- [ ] **Emergency Contacts**
  - Security team contacts
  - Hosting provider support
  - Legal counsel (if needed)

---

## 🧪 **Testing & Validation**

### **12. Security Testing**

- [ ] **Penetration Testing**
  - Hire security professional
  - Test authentication bypass
  - Test injection vulnerabilities
  - Test privilege escalation

- [ ] **Vulnerability Scanning**
  - OWASP ZAP
  - Burp Suite
  - Nessus

- [ ] **Load Testing**
  - Simulate high traffic
  - Test rate limiting
  - Verify graceful degradation

- [ ] **Disaster Recovery Test**
  - Simulate server failure
  - Test backup restore
  - Verify redundancy

---

## 📊 **Production Deployment Checklist**

### **Final Pre-Launch Checklist**

- [ ] All CRITICAL items completed
- [ ] All HIGH PRIORITY items completed
- [ ] Security audit passed
- [ ] Penetration test completed
- [ ] Backup procedures tested
- [ ] Monitoring configured
- [ ] Incident response plan documented
- [ ] Team trained on security procedures

### **Post-Launch Monitoring (First 48 Hours)**

- [ ] Monitor error logs continuously
- [ ] Watch authentication attempts
- [ ] Track resource usage (CPU, RAM, disk)
- [ ] Verify backups running
- [ ] Check external monitoring alerts

---

## 🚨 **Known Security Improvements (Completed)**

✅ **v1.0.7 Security Fixes (October 2025):**
- Removed hardcoded admin credentials from client
- Enforced strong admin password validation
- Fixed XSS vulnerabilities in transaction display
- Added Helmet.js security headers
- Updated Electron to 35.7.5
- Removed .env files from Git history

---

## 📞 **Security Contacts**

**Report Security Issues:**
- Email: security@birilium.com (placeholder - update with real contact)
- GitHub: Create private security advisory
- Response Time: 24 hours for critical issues

**Emergency Contacts:**
- Development Lead: [Your Contact]
- Security Team: [Your Contact]
- Hosting Provider: [Support Number]

---

## 📚 **Additional Resources**

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Electron Security Checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [PayPal Integration Security](https://developer.paypal.com/docs/api-basics/security/)

---

## 📝 **Changelog**

| Date | Version | Changes |
|------|---------|---------|
| 2025-10-24 | 1.0.7 | Critical security fixes implemented |
| 2025-10-24 | 1.0.6 | Initial security audit completed |

---

**Remember:** Security is an ongoing process, not a one-time task. Review this checklist quarterly and update as needed.

🔒 **Stay Secure!**
