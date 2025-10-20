const SHA256 = require('crypto-js/sha256');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

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
        // Check if the public key matches the fromAddress
        if (signingKey.getPublic('hex') !== this.fromAddress) {
            throw new Error('You cannot sign transactions for other wallets!');
        }

        const hashTx = this.calculateHash();
        const sig = signingKey.sign(hashTx, 'base64');
        this.signature = sig.toDER('hex');
    }

    isValid() {
        // Mining rewards and genesis transactions don't have fromAddress
        if (this.fromAddress === null) return true;

        if (!this.signature || this.signature.length === 0) {
            throw new Error('No signature in this transaction');
        }

        const publicKey = ec.keyFromPublic(this.fromAddress, 'hex');
        return publicKey.verify(this.calculateHash(), this.signature);
    }
}

module.exports = Transaction;
