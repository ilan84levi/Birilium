const SHA256 = require('crypto-js/sha256');
const secp256k1 = require('@noble/secp256k1');
const { sha256 } = require('@noble/hashes/sha2.js');
const { hmac } = require('@noble/hashes/hmac.js');
const { bytesToHex, hexToBytes, utf8ToBytes } = require('@noble/hashes/utils.js');

// Configure hash functions for secp256k1 v3
secp256k1.hashes.sha256 = sha256;
secp256k1.hashes.hmacSha256 = (key, ...msgs) => hmac(sha256, key, ...msgs);

class Transaction {
    constructor(fromAddress, toAddress, amount, fee = 0, nonce = 0) {
        this.fromAddress = fromAddress;
        this.toAddress = toAddress;
        this.amount = amount;
        this.fee = fee;
        this.nonce = nonce; // Account nonce for replay protection
        this.timestamp = Date.now();
        this.signature = null;
    }

    calculateHash() {
        return SHA256(
            this.fromAddress +
            this.toAddress +
            this.amount +
            this.fee +
            this.nonce +
            this.timestamp
        ).toString();
    }

    signTransaction(signingKey) {
        // signingKey should be { privateKey: hex, publicKey: hex }
        const publicKeyHex = typeof signingKey.getPublic === 'function'
            ? signingKey.getPublic('hex')
            : signingKey.publicKey;

        // Check if the public key matches the fromAddress
        if (publicKeyHex !== this.fromAddress) {
            throw new Error('You cannot sign transactions for other wallets!');
        }

        const hashTx = this.calculateHash();
        const msgHash = sha256(utf8ToBytes(hashTx));

        const privateKeyHex = typeof signingKey.getPrivate === 'function'
            ? signingKey.getPrivate('hex')
            : signingKey.privateKey;

        // Sign returns 64-byte compact signature as Uint8Array
        const sigBytes = secp256k1.sign(msgHash, hexToBytes(privateKeyHex));
        this.signature = bytesToHex(sigBytes);
    }

    isValid() {
        // Mining rewards and genesis transactions don't have fromAddress
        if (this.fromAddress === null) return true;

        if (!this.signature || this.signature.length === 0) {
            throw new Error('No signature in this transaction');
        }

        const hashTx = this.calculateHash();
        const msgHash = sha256(utf8ToBytes(hashTx));

        // Convert hex signature back to bytes
        const sigBytes = hexToBytes(this.signature);
        const publicKeyBytes = hexToBytes(this.fromAddress);

        return secp256k1.verify(sigBytes, msgHash, publicKeyBytes);
    }
}

module.exports = Transaction;
