// Wallet Security Module (Phase 2.4)
// Argon2id key derivation, BIP-39 mnemonics, BIP-32 HD wallets, RFC-6979 signatures

const crypto = require('crypto');
const argon2 = require('argon2');
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const ecc = require('tiny-secp256k1');
const bip32 = BIP32Factory(ecc);
const secp256k1 = require('@noble/secp256k1');
const { sha256 } = require('@noble/hashes/sha2.js');
const { hmac } = require('@noble/hashes/hmac.js');
const { bytesToHex, hexToBytes, utf8ToBytes } = require('@noble/hashes/utils.js');

// Configure hash functions for secp256k1 v3
secp256k1.hashes.sha256 = sha256;
secp256k1.hashes.hmacSha256 = (key, ...msgs) => hmac(sha256, key, ...msgs);

// ========== CONSTANTS ==========

const ARGON2_OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 65536,      // 64 MB
    timeCost: 3,            // 3 iterations
    parallelism: 4,         // 4 threads
    hashLength: 32          // 32 bytes output
};

const BIP44_PATH = "m/44'/714'/0'/0/0"; // 714 = Birilium coin type (placeholder)
const WALLET_VERSION = '2.0';

// ========== KEY DERIVATION ==========

/**
 * Derive encryption key from password using Argon2id
 * @param {string} password - User password
 * @param {Buffer} salt - 32-byte salt (generate with crypto.randomBytes(32))
 * @returns {Promise<Buffer>} - 32-byte derived key
 */
async function deriveKey(password, salt) {
    if (!Buffer.isBuffer(salt) || salt.length !== 32) {
        throw new Error('Salt must be a 32-byte Buffer');
    }

    const hash = await argon2.hash(password, {
        ...ARGON2_OPTIONS,
        salt,
        raw: true // Return raw hash, not encoded
    });

    return hash;
}

/**
 * Encrypt data using AES-256-GCM
 * @param {Buffer} plaintext - Data to encrypt
 * @param {Buffer} key - 32-byte encryption key
 * @returns {Object} - { ciphertext, iv, authTag }
 */
function encrypt(plaintext, key) {
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    return {
        ciphertext: ciphertext.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
    };
}

/**
 * Decrypt data using AES-256-GCM
 * @param {string} ciphertextHex - Encrypted data (hex)
 * @param {Buffer} key - 32-byte encryption key
 * @param {string} ivHex - IV (hex)
 * @param {string} authTagHex - Authentication tag (hex)
 * @returns {Buffer} - Decrypted plaintext
 */
function decrypt(ciphertextHex, key, ivHex, authTagHex) {
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
    ]);

    return plaintext;
}

// ========== BIP-39 MNEMONIC ==========

/**
 * Generate BIP-39 mnemonic (24 words, 256-bit entropy)
 * @returns {string} - Space-separated mnemonic phrase
 */
function generateMnemonic() {
    return bip39.generateMnemonic(256); // 24 words
}

/**
 * Validate BIP-39 mnemonic
 * @param {string} mnemonic - Space-separated mnemonic phrase
 * @returns {boolean}
 */
function validateMnemonic(mnemonic) {
    return bip39.validateMnemonic(mnemonic);
}

/**
 * Convert mnemonic to seed (512-bit)
 * @param {string} mnemonic - Space-separated mnemonic phrase
 * @param {string} passphrase - Optional BIP-39 passphrase
 * @returns {Buffer} - 64-byte seed
 */
function mnemonicToSeed(mnemonic, passphrase = '') {
    return bip39.mnemonicToSeedSync(mnemonic, passphrase);
}

// ========== BIP-32 HD WALLET ==========

/**
 * Derive HD wallet from seed
 * @param {Buffer} seed - 64-byte seed from mnemonic
 * @returns {Object} - { privateKey, publicKey, address, path }
 */
function deriveHDWallet(seed) {
    // Create master key
    const root = bip32.fromSeed(seed);

    // Derive BIP-44 path: m/44'/714'/0'/0/0
    const child = root.derivePath(BIP44_PATH);

    // Get ECDSA key pair
    const privateKeyBuffer = child.privateKey;
    const privateKeyHex = privateKeyBuffer.toString('hex');

    const publicKeyBytes = secp256k1.getPublicKey(hexToBytes(privateKeyHex), false);
    const publicKey = bytesToHex(publicKeyBytes);

    return {
        privateKey: privateKeyHex,
        publicKey: publicKey,
        address: publicKey, // In Birilium, address = public key
        path: BIP44_PATH
    };
}

// ========== RFC-6979 DETERMINISTIC SIGNATURES ==========

/**
 * Sign transaction with RFC-6979 deterministic signature (low-S enforcement)
 * @param {string} txHash - Transaction hash (hex)
 * @param {string} privateKeyHex - Private key (hex)
 * @returns {string} - Compact signature (hex) - noble/secp256k1 uses RFC-6979 and low-S by default
 */
function signDeterministic(txHash, privateKeyHex) {
    // noble/secp256k1 uses RFC-6979 deterministic nonce and low-S by default
    const msgHash = sha256(utf8ToBytes(txHash));
    const sigBytes = secp256k1.sign(msgHash, hexToBytes(privateKeyHex));
    return bytesToHex(sigBytes);
}

// ========== WALLET ENCRYPTION ==========

/**
 * Create encrypted wallet from mnemonic
 * @param {string} mnemonic - BIP-39 mnemonic
 * @param {string} password - Encryption password
 * @returns {Promise<Object>} - Encrypted wallet data
 */
async function createEncryptedWallet(mnemonic, password) {
    if (!validateMnemonic(mnemonic)) {
        throw new Error('Invalid mnemonic phrase');
    }

    // Derive HD wallet
    const seed = mnemonicToSeed(mnemonic);
    const wallet = deriveHDWallet(seed);

    // Generate salt for Argon2id
    const salt = crypto.randomBytes(32);

    // Derive encryption key
    const key = await deriveKey(password, salt);

    // Encrypt mnemonic (more secure than encrypting private key alone)
    const encryptedMnemonic = encrypt(Buffer.from(mnemonic, 'utf8'), key);

    return {
        version: WALLET_VERSION,
        address: wallet.address,
        encrypted: true,
        salt: salt.toString('hex'),
        mnemonic: encryptedMnemonic,
        path: BIP44_PATH,
        createdAt: Date.now()
    };
}

/**
 * Unlock encrypted wallet
 * @param {Object} walletData - Encrypted wallet data
 * @param {string} password - Decryption password
 * @returns {Promise<Object>} - { privateKey, publicKey, address, mnemonic }
 */
async function unlockWallet(walletData, password) {
    if (!walletData.encrypted) {
        throw new Error('Wallet is not encrypted');
    }

    // Derive decryption key
    const salt = Buffer.from(walletData.salt, 'hex');
    const key = await deriveKey(password, salt);

    // Decrypt mnemonic
    let mnemonicBuffer;
    try {
        mnemonicBuffer = decrypt(
            walletData.mnemonic.ciphertext,
            key,
            walletData.mnemonic.iv,
            walletData.mnemonic.authTag
        );
    } catch (err) {
        throw new Error('Incorrect password or corrupted wallet');
    }

    const mnemonic = mnemonicBuffer.toString('utf8');

    // Validate mnemonic
    if (!validateMnemonic(mnemonic)) {
        throw new Error('Decrypted mnemonic is invalid');
    }

    // Derive HD wallet
    const seed = mnemonicToSeed(mnemonic);
    const wallet = deriveHDWallet(seed);

    return {
        ...wallet,
        mnemonic
    };
}

/**
 * Change wallet password
 * @param {Object} walletData - Current encrypted wallet data
 * @param {string} oldPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<Object>} - New encrypted wallet data
 */
async function changePassword(walletData, oldPassword, newPassword) {
    // Unlock with old password
    const decrypted = await unlockWallet(walletData, oldPassword);

    // Re-encrypt with new password
    return await createEncryptedWallet(decrypted.mnemonic, newPassword);
}

// ========== EXPORTS ==========

module.exports = {
    // Key derivation
    deriveKey,
    encrypt,
    decrypt,

    // BIP-39
    generateMnemonic,
    validateMnemonic,
    mnemonicToSeed,

    // BIP-32 HD wallet
    deriveHDWallet,

    // RFC-6979 signatures
    signDeterministic,

    // Wallet management
    createEncryptedWallet,
    unlockWallet,
    changePassword,

    // Constants
    ARGON2_OPTIONS,
    BIP44_PATH,
    WALLET_VERSION
};
