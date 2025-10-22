/**
 * ENHANCED CRYPTOGRAPHY MODULE FOR BIRILIUM WALLET
 *
 * This is an IMPROVED version of the crypto functions in preload.js
 * that uses scrypt instead of PBKDF2 and AES-256-GCM instead of AES-256-CBC.
 *
 * TO USE: Replace the crypto section in preload.js with this implementation
 */

const crypto = require('crypto');

/**
 * Enhanced encryption using scrypt + AES-256-GCM
 *
 * Improvements over current implementation:
 * - scrypt (memory-hard) instead of PBKDF2 (resistant to GPU attacks)
 * - AES-256-GCM (authenticated encryption) instead of AES-256-CBC
 * - Auth tag prevents tampering/manipulation attacks
 * - Backward compatible format (can detect old vs new format)
 */
const enhancedCrypto = {
  /**
   * Encrypt data with password using scrypt + AES-256-GCM
   * @param {any} data - Data to encrypt (will be JSON stringified)
   * @param {string} password - User password
   * @returns {Object} { success: boolean, encrypted?: string, error?: string }
   */
  encrypt: (data, password) => {
    try {
      // Generate random salt (32 bytes)
      const salt = crypto.randomBytes(32);

      // Derive key using scrypt (memory-hard, GPU-resistant)
      // N=16384, r=8, p=1 provides strong security while remaining performant
      const key = crypto.scryptSync(password, salt, 32, {
        N: 16384,  // CPU/memory cost parameter (2^14)
        r: 8,      // Block size parameter
        p: 1,      // Parallelization parameter
        maxmem: 32 * 1024 * 1024  // 32 MB max memory
      });

      // Generate random IV (12 bytes for GCM)
      const iv = crypto.randomBytes(12);

      // Create cipher with AES-256-GCM (authenticated encryption)
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

      // Encrypt data
      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag (prevents tampering)
      const authTag = cipher.getAuthTag();

      // Return encrypted bundle with all necessary components
      return {
        success: true,
        encrypted: JSON.stringify({
          version: 2,  // Version 2 = scrypt + GCM
          algorithm: 'scrypt-aes-256-gcm',
          salt: salt.toString('hex'),
          iv: iv.toString('hex'),
          authTag: authTag.toString('hex'),
          data: encrypted,
          scryptParams: {
            N: 16384,
            r: 8,
            p: 1
          }
        })
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Decrypt data with password (supports both old PBKDF2 and new scrypt formats)
   * @param {string} encryptedData - Encrypted data bundle
   * @param {string} password - User password
   * @returns {Object} { success: boolean, data?: any, error?: string }
   */
  decrypt: (encryptedData, password) => {
    try {
      const parsed = JSON.parse(encryptedData);

      // Detect format version
      const version = parsed.version || 1;

      if (version === 2) {
        // New format: scrypt + AES-256-GCM
        return decryptV2(parsed, password);
      } else {
        // Old format: PBKDF2 + AES-256-CBC (backward compatibility)
        return decryptV1(parsed, password);
      }
    } catch (error) {
      return { success: false, error: 'Invalid password or corrupted data' };
    }
  }
};

/**
 * Decrypt version 2 format (scrypt + AES-256-GCM)
 * @private
 */
function decryptV2(parsed, password) {
  try {
    const salt = Buffer.from(parsed.salt, 'hex');
    const iv = Buffer.from(parsed.iv, 'hex');
    const authTag = Buffer.from(parsed.authTag, 'hex');
    const scryptParams = parsed.scryptParams || { N: 16384, r: 8, p: 1 };

    // Derive key using same scrypt parameters
    const key = crypto.scryptSync(password, salt, 32, {
      N: scryptParams.N,
      r: scryptParams.r,
      p: scryptParams.p,
      maxmem: 32 * 1024 * 1024
    });

    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);

    // Set authentication tag (this will verify data integrity)
    decipher.setAuthTag(authTag);

    // Decrypt data
    let decrypted = decipher.update(parsed.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return {
      success: true,
      data: JSON.parse(decrypted)
    };
  } catch (error) {
    // Auth tag verification failure = wrong password or tampered data
    return { success: false, error: 'Invalid password or corrupted data' };
  }
}

/**
 * Decrypt version 1 format (PBKDF2 + AES-256-CBC) - backward compatibility
 * @private
 */
function decryptV1(parsed, password) {
  try {
    const salt = Buffer.from(parsed.salt, 'hex');
    const iv = Buffer.from(parsed.iv, 'hex');

    // Derive key using PBKDF2 (old format)
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    // Decrypt data
    let decrypted = decipher.update(parsed.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return {
      success: true,
      data: JSON.parse(decrypted)
    };
  } catch (error) {
    return { success: false, error: 'Invalid password or corrupted data' };
  }
}

/**
 * Migration helper: Re-encrypt old data with new algorithm
 * @param {string} oldEncryptedData - Data encrypted with PBKDF2
 * @param {string} password - User password
 * @returns {Object} { success: boolean, newEncrypted?: string, error?: string }
 */
enhancedCrypto.migrate = (oldEncryptedData, password) => {
  // Decrypt with old format
  const decryptResult = enhancedCrypto.decrypt(oldEncryptedData, password);

  if (!decryptResult.success) {
    return { success: false, error: 'Failed to decrypt old data: ' + decryptResult.error };
  }

  // Re-encrypt with new format
  return enhancedCrypto.encrypt(decryptResult.data, password);
};

/**
 * Generate cryptographically secure random bytes
 * @param {number} length - Number of bytes to generate
 * @returns {string} Hex-encoded random bytes
 */
enhancedCrypto.randomBytes = (length) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash function using SHA-256
 * @param {string} data - Data to hash
 * @returns {string} Hex-encoded hash
 */
enhancedCrypto.hash = (data) => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Secure password strength checker
 * @param {string} password - Password to check
 * @returns {Object} { score: number, feedback: string[] }
 */
enhancedCrypto.checkPasswordStrength = (password) => {
  const feedback = [];
  let score = 0;

  // Length check
  if (password.length < 8) {
    feedback.push('Password should be at least 8 characters');
  } else if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;

  // Complexity checks
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) {
    score++;
  } else {
    feedback.push('Use both uppercase and lowercase letters');
  }

  if (/\d/.test(password)) {
    score++;
  } else {
    feedback.push('Include numbers');
  }

  if (/[^a-zA-Z0-9]/.test(password)) {
    score++;
  } else {
    feedback.push('Include special characters (!@#$%^&*)');
  }

  // Common patterns
  if (/^[0-9]+$/.test(password)) {
    feedback.push('Avoid using only numbers');
    score = Math.max(0, score - 2);
  }

  if (/(.)\1{2,}/.test(password)) {
    feedback.push('Avoid repeating characters');
    score = Math.max(0, score - 1);
  }

  // Score interpretation
  let strength = 'weak';
  if (score >= 5) strength = 'strong';
  else if (score >= 3) strength = 'medium';

  return {
    score,
    strength,
    feedback: feedback.length > 0 ? feedback : ['Password strength is good']
  };
};

// Export for use in preload.js
module.exports = enhancedCrypto;

/**
 * USAGE IN PRELOAD.JS:
 *
 * Replace the existing crypto section with:
 *
 * const enhancedCrypto = require('./preload-enhanced-crypto');
 *
 * contextBridge.exposeInMainWorld('walletAPI', {
 *   // ... other APIs ...
 *
 *   crypto: {
 *     encrypt: enhancedCrypto.encrypt,
 *     decrypt: enhancedCrypto.decrypt,
 *     migrate: enhancedCrypto.migrate,
 *     randomBytes: enhancedCrypto.randomBytes,
 *     hash: enhancedCrypto.hash,
 *     checkPasswordStrength: enhancedCrypto.checkPasswordStrength
 *   }
 * });
 */
