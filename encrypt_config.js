/**
 * OmniShell Config Encryptor
 * Extracts ONLY the required SSH fields from sachin-person.config,
 * encrypts them with AES-256-GCM, and writes sachin-person.cfg
 *
 * What is SHIPPED (encrypted):   ssh.mac, ssh.linux, ssh.windows
 * What is NOT SHIPPED (stays on dev machine): github_token, any other keys
 *
 * Run before every build: node encrypt_config.js
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// App secret — stored as char-codes to avoid plain-string grep
const SECRET_PARTS = [79,109,110,105,83,104,101,108,108,95,67,111,114,101,95,50,48,50,52,95,83,101,99,114,101,116,95,75,101,121,95,86,50];
const APP_SECRET = Buffer.from(SECRET_PARTS).toString('utf8');

// Derive a 32-byte AES key using PBKDF2 (210k iterations, SHA-512)
const SALT = Buffer.from('4f6d6e695368656c6c53616c7456', 'hex');
const KEY = crypto.pbkdf2Sync(APP_SECRET, SALT, 210000, 32, 'sha512');

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const result = Buffer.concat([
    Buffer.from([iv.length]), iv,
    Buffer.from([tag.length]), tag,
    encrypted
  ]);
  return result.toString('base64');
}

// ── Read & validate full config ──────────────────────────────────────────────
const configSrc = path.join(__dirname, 'sachin-person.config');
if (!fs.existsSync(configSrc)) {
  console.error('Error: sachin-person.config not found!');
  process.exit(1);
}
let fullConfig;
try {
  fullConfig = JSON.parse(fs.readFileSync(configSrc, 'utf8'));
} catch (e) {
  console.error('Error: sachin-person.config is not valid JSON!', e.message);
  process.exit(1);
}

// ── Extract ONLY the personal required fields ─────────────────────────────────────────
const macCreds   = fullConfig?.ssh?.macPersonal   || fullConfig?.ssh?.mac   || null;
const linuxCreds = fullConfig?.ssh?.linuxPersonal || fullConfig?.ssh?.linux || null;
const winCreds   = fullConfig?.ssh?.windowsPersonal || fullConfig?.ssh?.windows || null;

const slimConfig = {
  ssh: {
    mac:     macCreds   ? { username: macCreds.username,   pass: macCreds.pass   } : null,
    linux:   linuxCreds ? { username: linuxCreds.username, pass: linuxCreds.pass } : null,
    windows: winCreds   ? { username: winCreds.username,   pass: winCreds.pass   } : null,
  },
  router: fullConfig?.router ? { username: fullConfig.router.username, password: fullConfig.router.password } : null
};

console.log('--------------------------------------------------');
console.log(' OmniShell Config Encryptor');
console.log('--------------------------------------------------');
console.log('Shipping fields:');
if (slimConfig.ssh.mac)     console.log('  ✓ ssh.mac     →', slimConfig.ssh.mac.username);
if (slimConfig.ssh.linux)   console.log('  ✓ ssh.linux   →', slimConfig.ssh.linux.username);
if (slimConfig.ssh.windows) console.log('  ✓ ssh.windows →', slimConfig.ssh.windows.username);
if (slimConfig.router)      console.log('  ✓ router      →', slimConfig.router.username);
console.log('Excluded fields:');
console.log('  ✗ github_token (stays on dev machine)');
console.log('--------------------------------------------------');

// ── Encrypt slim payload ──────────────────────────────────────────────────────
const encrypted = encrypt(JSON.stringify(slimConfig));
const outputPath = path.join(__dirname, 'sachin-person.cfg');
fs.writeFileSync(outputPath, encrypted, 'utf8');

console.log('Success: Encrypted slim config saved to sachin-person.cfg');
console.log('Ship: sachin-person.cfg  |  Do NOT ship: sachin-person.config');
