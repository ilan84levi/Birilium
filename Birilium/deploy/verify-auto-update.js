#!/usr/bin/env node
/**
 * Simulates what `electron-updater` does when the wallet checks for an
 * update. Reads latest.yml from the GitHub release page, resolves each
 * referenced asset URL, downloads the installer, and verifies the SHA512
 * matches what latest.yml claims. Fails noisily if any check breaks.
 *
 * Run:  node Birilium/deploy/verify-auto-update.js <tag>
 *       e.g. node Birilium/deploy/verify-auto-update.js v1.5.5
 *
 * Exit codes:
 *   0 — every asset referenced by latest*.yml resolves and hashes correctly
 *   1 — at least one mismatch (will be the cause of an auto-update 404
 *       or SHA failure in the field)
 */
const https = require('https');
const crypto = require('crypto');

const TAG = process.argv[2] || 'v1.5.5';
const BASE = `https://github.com/ilan84levi/Birilium/releases/download/${TAG}`;
const PLATFORMS = ['latest.yml', 'latest-mac.yml', 'latest-linux.yml'];

function fetchText(url) {
    return new Promise((resolve, reject) => {
        const get = (u) => https.get(u, { headers: { 'User-Agent': 'verify-auto-update' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return get(res.headers.location);
            }
            if (res.statusCode !== 200) return reject(new Error(`${u} -> HTTP ${res.statusCode}`));
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (c) => (data += c));
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function fetchBinary(url) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const get = (u) => https.get(u, { headers: { 'User-Agent': 'verify-auto-update' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return get(res.headers.location);
            }
            if (res.statusCode !== 200) return reject(new Error(`${u} -> HTTP ${res.statusCode}`));
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

function parseYml(text) {
    // Tiny YAML parser for the subset electron-builder writes: files[].url,
    // files[].sha512, files[].size, plus version and path.
    const lines = text.split('\n');
    const files = [];
    let current = null;
    let topVersion = null;
    for (const raw of lines) {
        const line = raw.replace(/\r$/, '');
        const v = line.match(/^version:\s*(\S+)/);
        if (v) { topVersion = v[1]; continue; }
        if (/^files:/.test(line)) continue;
        const newFile = line.match(/^\s*-\s+url:\s*(\S+)/);
        if (newFile) {
            current = { url: newFile[1] };
            files.push(current);
            continue;
        }
        const sha = line.match(/^\s+sha512:\s*(\S+)/);
        if (sha && current) { current.sha512 = sha[1]; continue; }
        const size = line.match(/^\s+size:\s*(\d+)/);
        if (size && current) { current.size = parseInt(size[1], 10); continue; }
    }
    return { version: topVersion, files };
}

async function checkAsset(base, file) {
    const url = `${base}/${file.url}`;
    process.stdout.write(`  ${file.url} ... `);
    let bytes;
    try {
        bytes = await fetchBinary(url);
    } catch (err) {
        console.log(`✗ ${err.message}`);
        return false;
    }
    if (file.size != null && bytes.length !== file.size) {
        console.log(`✗ size mismatch (yml=${file.size} got=${bytes.length})`);
        return false;
    }
    const got = crypto.createHash('sha512').update(bytes).digest('base64');
    if (file.sha512 && got !== file.sha512) {
        console.log(`✗ sha512 mismatch`);
        console.log(`    yml: ${file.sha512}`);
        console.log(`    got: ${got}`);
        return false;
    }
    console.log(`✓ ${bytes.length} bytes, sha512 ok`);
    return true;
}

(async function main() {
    let allOk = true;
    for (const ymlName of PLATFORMS) {
        const ymlUrl = `${BASE}/${ymlName}`;
        console.log(`[${ymlName}] ${ymlUrl}`);
        let text;
        try {
            text = await fetchText(ymlUrl);
        } catch (err) {
            console.log(`  ✗ could not fetch yml: ${err.message}`);
            allOk = false;
            continue;
        }
        const parsed = parseYml(text);
        if (!parsed.files.length) {
            console.log(`  ✗ no files referenced`);
            allOk = false;
            continue;
        }
        console.log(`  version: ${parsed.version}, files: ${parsed.files.length}`);
        for (const f of parsed.files) {
            const ok = await checkAsset(BASE, f);
            if (!ok) allOk = false;
        }
    }
    console.log('');
    console.log(allOk ? '✅ ALL UPDATE METADATA OK' : '❌ AUTO-UPDATE WILL FAIL FOR AT LEAST ONE PLATFORM');
    process.exit(allOk ? 0 : 1);
})();
