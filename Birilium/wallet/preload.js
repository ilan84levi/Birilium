// Preload script for Electron
const { contextBridge } = require('electron');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('biriliumAPI', {
    // Generate a new wallet key pair
    generateKeyPair: () => {
        const key = ec.genKeyPair();
        return {
            publicKey: key.getPublic('hex'),
            privateKey: key.getPrivate('hex')
        };
    },

    // Verify this is available
    isAvailable: () => true
});
