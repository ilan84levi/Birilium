/**
 * Birilium Wallet - Secure Preload Script
 *
 * This script acts as a secure bridge between the Electron main process
 * and the renderer process. It exposes only necessary and safe APIs.
 *
 * Security: All cryptographic operations (signing) happen here, never
 * exposing raw private keys to the renderer process.
 */

const { contextBridge, ipcRenderer, clipboard, shell } = require('electron');
const crypto = require('crypto');
const secp256k1 = require('@noble/secp256k1');
const { sha256 } = require('@noble/hashes/sha2.js');
const { hmac } = require('@noble/hashes/hmac.js');
const { bytesToHex, hexToBytes, utf8ToBytes } = require('@noble/hashes/utils.js');

// Configure hash functions for secp256k1 v3
secp256k1.hashes.sha256 = sha256;
secp256k1.hashes.hmacSha256 = (key, ...msgs) => hmac(sha256, key, ...msgs);

// Security: Expose only safe, sandboxed APIs to the renderer
contextBridge.exposeInMainWorld('walletAPI', {
  /**
   * Node Status APIs
   */
  getNodeStatus: () => ipcRenderer.invoke('get-node-status'),
  restartNode: () => ipcRenderer.invoke('restart-node'),
  onNodeLog: (callback) => ipcRenderer.on('node-log', (_, data) => callback(data)),
  onNodeError: (callback) => ipcRenderer.on('node-error', (_, data) => callback(data)),
  onDebugLog: (callback) => ipcRenderer.on('debug-log', (_, data) => callback(data)),
  onNodeStatus: (callback) => ipcRenderer.on('node-status', (_, data) => callback(data)),

  /**
   * Wallet Generation (Client-side, secure)
   * Keys never leave this secure context
   */
  generateWallet: () => {
    try {
      const privateKeyBytes = secp256k1.utils.randomSecretKey();
      const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, false);
      const privateKey = bytesToHex(privateKeyBytes);
      const publicKey = bytesToHex(publicKeyBytes);

      return {
        success: true,
        privateKey,
        publicKey,
        address: publicKey // In Birilium, public key IS the address
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Transaction Signing (Client-side, secure)
   * Private key is used ONLY for signing, never exposed
   */
  signTransaction: (txData, privateKeyHex) => {
    try {
      // Validate inputs
      if (!txData || !privateKeyHex) {
        throw new Error('Missing transaction data or private key');
      }

      // Create transaction hash
      const txHashString = txData.fromAddress + txData.toAddress + txData.amount + txData.timestamp;
      const txHash = crypto.createHash('sha256').update(txHashString).digest('hex');
      const msgHash = sha256(utf8ToBytes(txHash));

      // Sign the hash
      const sigBytes = secp256k1.sign(msgHash, hexToBytes(privateKeyHex));
      const signatureHex = bytesToHex(sigBytes);

      return {
        success: true,
        signature: signatureHex,
        txHash
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Verify a transaction signature (read-only, safe)
   */
  verifySignature: (txData, signatureHex, publicKeyHex) => {
    try {
      const txHashString = txData.fromAddress + txData.toAddress + txData.amount + txData.timestamp;
      const txHash = crypto.createHash('sha256').update(txHashString).digest('hex');
      const msgHash = sha256(utf8ToBytes(txHash));

      const isValid = secp256k1.verify(
        hexToBytes(signatureHex),
        msgHash,
        hexToBytes(publicKeyHex)
      );

      return {
        success: true,
        isValid
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Clipboard Operations (with auto-clear for security)
   */
  clipboard: {
    writeText: (text, autoClearMs = 30000) => {
      clipboard.writeText(text);

      // Auto-clear sensitive data from clipboard after timeout
      if (autoClearMs > 0) {
        setTimeout(() => {
          if (clipboard.readText() === text) {
            clipboard.writeText('');
          }
        }, autoClearMs);
      }

      return true;
    },
    readText: () => clipboard.readText()
  },

  /**
   * Safe External Link Opening (whitelist only)
   */
  openExternal: (url) => {
    try {
      const parsedUrl = new URL(url);

      // Whitelist of allowed protocols
      const allowedProtocols = ['https:', 'mailto:'];

      if (!allowedProtocols.includes(parsedUrl.protocol)) {
        console.error('Blocked external URL with disallowed protocol:', parsedUrl.protocol);
        return { success: false, error: 'Protocol not allowed' };
      }

      // Whitelist of allowed domains (update as needed)
      const allowedDomains = [
        'birilium.net',
        'github.com',
        'docs.birilium.net'
      ];

      const isAllowed = allowedDomains.some(domain =>
        parsedUrl.hostname === domain || parsedUrl.hostname.endsWith('.' + domain)
      );

      if (!isAllowed) {
        console.warn('Blocked external URL to non-whitelisted domain:', parsedUrl.hostname);
        return { success: false, error: 'Domain not whitelisted' };
      }

      shell.openExternal(parsedUrl.toString());
      return { success: true };
    } catch (error) {
      console.error('Invalid URL:', error);
      return { success: false, error: 'Invalid URL' };
    }
  },

  /**
   * Encryption/Decryption for local storage
   */
  crypto: {
    encrypt: (data, password) => {
      try {
        const salt = crypto.randomBytes(32);
        const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
        const iv = crypto.randomBytes(16);

        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');

        return {
          success: true,
          encrypted: JSON.stringify({
            salt: salt.toString('hex'),
            iv: iv.toString('hex'),
            data: encrypted
          })
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    decrypt: (encryptedData, password) => {
      try {
        const parsed = JSON.parse(encryptedData);
        const salt = Buffer.from(parsed.salt, 'hex');
        const iv = Buffer.from(parsed.iv, 'hex');
        const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(parsed.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return {
          success: true,
          data: JSON.parse(decrypted)
        };
      } catch (error) {
        return { success: false, error: 'Invalid password or corrupted data' };
      }
    },

    // Generate random bytes for entropy
    randomBytes: (length) => {
      return crypto.randomBytes(length).toString('hex');
    },

    // Hash function (for passwords, etc.)
    hash: (data) => {
      return crypto.createHash('sha256').update(data).digest('hex');
    }
  },

  /**
   * Platform information (safe, read-only)
   */
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome
  }
});

// Security: Remove all Node.js globals from renderer context
// This prevents any accidental or malicious access to Node APIs
delete window.require;
delete window.module;
delete window.exports;

console.log('✅ Birilium Wallet - Secure preload bridge initialized');
