// Production-ready TLS certificate generation for P2P WebSocket encryption
// Supports both self-signed and CA-signed certificates (mTLS)

const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

// ========== CERTIFICATE AUTHORITY MANAGEMENT ==========

/**
 * Generate a private Certificate Authority (CA) for production networks
 * Use this to sign all node certificates in your network
 */
function generateCA(commonName = 'Birilium-CA', organizationName = 'Birilium Network') {
    console.log('[CA] Generating Certificate Authority...');

    // Generate key pair (RSA 4096 for CA)
    const keys = forge.pki.rsa.generateKeyPair(4096);

    // Create self-signed CA certificate
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + Math.floor(Math.random() * 10000000000);
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10); // 10 years

    // Set subject and issuer (self-signed CA)
    const attrs = [
        { name: 'commonName', value: commonName },
        { name: 'countryName', value: 'US' },
        { shortName: 'ST', value: 'California' },
        { name: 'localityName', value: 'San Francisco' },
        { name: 'organizationName', value: organizationName },
        { shortName: 'OU', value: 'Certificate Authority' }
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    // Set CA extensions
    cert.setExtensions([
        {
            name: 'basicConstraints',
            cA: true,
            pathLenConstraint: 0 // No intermediate CAs
        },
        {
            name: 'keyUsage',
            keyCertSign: true,
            cRLSign: true,
            digitalSignature: true
        },
        {
            name: 'extKeyUsage',
            serverAuth: true,
            clientAuth: true
        }
    ]);

    // Self-sign
    cert.sign(keys.privateKey, forge.md.sha256.create());

    // Convert to PEM
    const pemCert = forge.pki.certificateToPem(cert);
    const pemKey = forge.pki.privateKeyToPem(keys.privateKey);

    return { cert: pemCert, key: pemKey };
}

/**
 * Generate a node certificate signed by a CA (for mTLS)
 */
function generateSignedNodeCertificate(nodeId, caCert, caKey, sanList = []) {
    console.log(`[CA] Generating node certificate for ${nodeId}...`);

    // Generate node key pair (RSA 2048)
    const nodeKeys = forge.pki.rsa.generateKeyPair(2048);

    // Create certificate signing request (CSR)
    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = nodeKeys.publicKey;

    // Set subject
    const attrs = [
        { name: 'commonName', value: nodeId },
        { name: 'organizationName', value: 'Birilium Network' },
        { shortName: 'OU', value: 'P2P Node' }
    ];
    csr.setSubject(attrs);

    // Sign CSR
    csr.sign(nodeKeys.privateKey, forge.md.sha256.create());

    // Create certificate signed by CA
    const nodeCert = forge.pki.createCertificate();
    nodeCert.publicKey = csr.publicKey;
    nodeCert.serialNumber = '02' + Math.floor(Math.random() * 10000000000);
    nodeCert.validity.notBefore = new Date();
    nodeCert.validity.notAfter = new Date();
    nodeCert.validity.notAfter.setFullYear(nodeCert.validity.notBefore.getFullYear() + 1); // 1 year

    // Set subject from CSR
    nodeCert.setSubject(csr.subject.attributes);

    // Set issuer to CA
    const caAttrs = caCert.issuer.attributes;
    nodeCert.setIssuer(caAttrs);

    // Build Subject Alt Names (SAN)
    const defaultAltNames = [
        { type: 2, value: 'localhost' },      // DNS
        { type: 7, ip: '127.0.0.1' },         // IPv4
        { type: 7, ip: '::1' }                // IPv6
    ];

    // Add custom SAN entries
    if (sanList && sanList.length > 0) {
        sanList.forEach(san => {
            if (san.type === 'dns') {
                defaultAltNames.push({ type: 2, value: san.value });
            } else if (san.type === 'ip') {
                defaultAltNames.push({ type: 7, ip: san.value });
            }
        });
    }

    // Set extensions
    nodeCert.setExtensions([
        {
            name: 'basicConstraints',
            cA: false
        },
        {
            name: 'keyUsage',
            digitalSignature: true,
            keyEncipherment: true
        },
        {
            name: 'extKeyUsage',
            serverAuth: true,
            clientAuth: true
        },
        {
            name: 'subjectAltName',
            altNames: defaultAltNames
        },
        {
            name: 'authorityKeyIdentifier',
            keyIdentifier: caCert.publicKey
        }
    ]);

    // Sign certificate with CA key
    nodeCert.sign(caKey, forge.md.sha256.create());

    // Convert to PEM
    const pemCert = forge.pki.certificateToPem(nodeCert);
    const pemKey = forge.pki.privateKeyToPem(nodeKeys.privateKey);

    return { cert: pemCert, key: pemKey };
}

/**
 * Generate a self-signed node certificate (for standalone/testnet)
 */
function generateSelfSignedNodeCertificate(nodeId = 'birilium-p2p-node', sanList = []) {
    console.log(`Generating self-signed TLS certificate for ${nodeId}...`);

    // Generate key pair
    const keys = forge.pki.rsa.generateKeyPair(2048);

    // Create certificate
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + Math.floor(Math.random() * 100000);
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1); // 1 year

    // Set subject and issuer (self-signed)
    const attrs = [
        { name: 'commonName', value: nodeId },
        { name: 'countryName', value: 'US' },
        { shortName: 'ST', value: 'California' },
        { name: 'localityName', value: 'San Francisco' },
        { name: 'organizationName', value: 'Birilium Network' },
        { shortName: 'OU', value: 'P2P Node' }
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    // Build Subject Alt Names
    const altNames = [
        { type: 2, value: 'localhost' },      // DNS
        { type: 7, ip: '127.0.0.1' },         // IPv4
        { type: 7, ip: '::1' }                // IPv6
    ];

    // Add custom SAN entries
    if (sanList && sanList.length > 0) {
        sanList.forEach(san => {
            if (san.type === 'dns') {
                altNames.push({ type: 2, value: san.value });
            } else if (san.type === 'ip') {
                altNames.push({ type: 7, ip: san.value });
            }
        });
    }

    // Set extensions for secure P2P
    cert.setExtensions([
        {
            name: 'basicConstraints',
            cA: false
        },
        {
            name: 'keyUsage',
            digitalSignature: true,
            keyEncipherment: true
        },
        {
            name: 'extKeyUsage',
            serverAuth: true,
            clientAuth: true
        },
        {
            name: 'subjectAltName',
            altNames: altNames
        }
    ]);

    // Sign certificate
    cert.sign(keys.privateKey, forge.md.sha256.create());

    // Convert to PEM
    const pemCert = forge.pki.certificateToPem(cert);
    const pemKey = forge.pki.privateKeyToPem(keys.privateKey);

    return { cert: pemCert, key: pemKey };
}

// ========== CERTIFICATE PERSISTENCE ==========

/**
 * Save certificates to disk with proper permissions
 */
function saveCertificates(cert, key, outputDir = './certs', filename = 'node') {
    // Create certs directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const certPath = path.join(outputDir, `${filename}-cert.pem`);
    const keyPath = path.join(outputDir, `${filename}-key.pem`);

    fs.writeFileSync(certPath, cert);
    // Create the key file with restrictive perms atomically. The previous
    // write+chmod sequence left a brief window where the key was readable
    // by the world (umask 022 -> 0o644). Pass mode to writeFileSync so the
    // file is created with 0o600 from the first byte.
    if (process.platform !== 'win32') {
        fs.writeFileSync(keyPath, key, { mode: 0o600 });
    } else {
        fs.writeFileSync(keyPath, key);
    }

    console.log(`✓ Certificate saved to: ${certPath}`);
    console.log(`✓ Private key saved to: ${keyPath}`);

    return { certPath, keyPath };
}

/**
 * Save CA certificate (read-only, safe to distribute)
 */
function saveCA(caCert, caKey, outputDir = './certs') {
    // Create certs directory
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const caCertPath = path.join(outputDir, 'ca-cert.pem');
    const caKeyPath = path.join(outputDir, 'ca-key.pem');

    // Save CA certificate (distribute to all nodes)
    fs.writeFileSync(caCertPath, caCert);
    console.log(`✓ CA certificate saved to: ${caCertPath}`);

    // Save CA key (KEEP SECURE - HSM recommended for production)
    fs.writeFileSync(caKeyPath, caKey);
    if (process.platform !== 'win32') {
        fs.chmodSync(caKeyPath, 0o600);
    }
    console.log(`✓ CA private key saved to: ${caKeyPath}`);
    console.log('⚠️  CRITICAL: Protect ca-key.pem! Store in HSM or vault for production.');

    return { caCertPath, caKeyPath };
}

// ========== CLI INTERFACE ==========

// Run if called directly
if (require.main === module) {
    const command = process.argv[2] || 'self-signed';
    const args = process.argv.slice(3);

    switch (command) {
        case 'ca':
            console.log('\n=== Generating Certificate Authority ===\n');
            const { cert: caCert, key: caKey } = generateCA();
            saveCA(caCert, caKey);
            console.log('\nNext step: Run `node generate-certs.js signed node1 <dns1,dns2> <ip1,ip2>`');
            console.log('Example:  node generate-certs.js signed node1 node1.birilium.net 203.0.113.10\n');
            break;

        case 'signed':
            console.log('\n=== Generating CA-Signed Node Certificate ===\n');
            const nodeId = args[0] || 'node1';
            const dnsNames = (args[1] || '').split(',').filter(x => x);
            const ipAddrs = (args[2] || '').split(',').filter(x => x);

            // Load CA
            const caCertPath = './certs/ca-cert.pem';
            const caKeyPath = './certs/ca-key.pem';

            if (!fs.existsSync(caCertPath) || !fs.existsSync(caKeyPath)) {
                console.error('❌ CA certificate not found. Run `node generate-certs.js ca` first.');
                process.exit(1);
            }

            const caCertPem = fs.readFileSync(caCertPath, 'utf8');
            const caKeyPem = fs.readFileSync(caKeyPath, 'utf8');
            const loadedCACert = forge.pki.certificateFromPem(caCertPem);
            const loadedCAKey = forge.pki.privateKeyFromPem(caKeyPem);

            // Build SAN list
            const sanList = [
                ...dnsNames.map(dns => ({ type: 'dns', value: dns })),
                ...ipAddrs.map(ip => ({ type: 'ip', value: ip }))
            ];

            const { cert, key } = generateSignedNodeCertificate(nodeId, loadedCACert, loadedCAKey, sanList);
            saveCertificates(cert, key, './certs', nodeId);
            console.log('\n✅ Node certificate created and ready for deployment.\n');
            break;

        case 'self-signed':
        default:
            console.log('\n=== Generating Self-Signed Node Certificate (Development/Testnet) ===\n');
            const selfNodeId = args[0] || 'birilium-p2p-node';
            const selfDnsNames = (args[1] || '').split(',').filter(x => x);
            const selfIpAddrs = (args[2] || '').split(',').filter(x => x);

            const selfSanList = [
                ...selfDnsNames.map(dns => ({ type: 'dns', value: dns })),
                ...selfIpAddrs.map(ip => ({ type: 'ip', value: ip }))
            ];

            const { cert: selfCert, key: selfKey } = generateSelfSignedNodeCertificate(selfNodeId, selfSanList);
            saveCertificates(selfCert, selfKey);
            console.log('\n⚠️  Self-signed certificate generated (development only).');
            console.log('For production, use: node generate-certs.js ca');
            console.log('Then:                node generate-certs.js signed <nodeId> <dns> <ip>\n');
            break;
    }
}

module.exports = {
    generateCA,
    generateSignedNodeCertificate,
    generateSelfSignedNodeCertificate,
    saveCertificates,
    saveCA
};
