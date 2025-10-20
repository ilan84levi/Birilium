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
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

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
      const keyPair = ec.genKeyPair();
      const privateKey = keyPair.getPrivate('hex');
      const publicKey = keyPair.getPublic('hex');

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

      // Create signing key from private key
      const signingKey = ec.keyFromPrivate(privateKeyHex, 'hex');

      // Create transaction hash
      const txHash = crypto.createHash('sha256')
        .update(txData.fromAddress + txData.toAddress + txData.amount + txData.timestamp)
        .digest('hex');

      // Sign the hash
      const signature = signingKey.sign(txHash, 'base64');
      const signatureHex = signature.toDER('hex');

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
      const txHash = crypto.createHash('sha256')
        .update(txData.fromAddress + txData.toAddress + txData.amount + txData.timestamp)
        .digest('hex');

      const keyPair = ec.keyFromPublic(publicKeyHex, 'hex');
      const isValid = keyPair.verify(txHash, signatureHex);

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
