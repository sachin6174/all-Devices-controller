const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

console.log('--------------------------------------------------');
console.log(' OmniShell Universal Cross-Platform Build & Deploy');
console.log('--------------------------------------------------');

// 1. Auto-increment version in package.json
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const currentVersion = packageJson.version;

const parts = currentVersion.split('.').map(n => parseInt(n, 10));
if (currentVersion !== '2.0.0') {
  parts[1] = parts[1] + 1;
  parts[2] = 0;
}
const newVersion = parts.join('.');
packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4));

console.log(`Status: Version set to ${newVersion} (from ${currentVersion})`);

// 2. Encrypt config
console.log('Status: Encrypting config for shipping...');
try {
  execSync('node encrypt_config.js', { stdio: 'inherit', cwd: __dirname });
} catch (e) {
  console.error('Error: Config encryption failed!');
  process.exit(1);
}

// 3. Set code signing environment if certificate exists
const certPath = path.join(__dirname, 'build', 'certificate.pfx');
const env = { ...process.env };
if (fs.existsSync(certPath)) {
  env.CSC_LINK = 'build/certificate.pfx';
  env.CSC_KEY_PASSWORD = 'password123';
}

// 4. Compile with electron-builder
console.log(`Status: Packaging OmniShell v${newVersion} for ${process.platform}...`);
try {
  execSync('npx electron-builder', { stdio: 'inherit', cwd: __dirname, env });
  console.log('Success: Packaging completed cleanly!');
} catch (e) {
  console.error('Error: electron-builder failed!');
  process.exit(1);
}

// 5. Deploy encrypted config to home directory
const configSrc = path.join(__dirname, 'sachin-person.cfg');
const configDst = path.join(os.homedir(), 'sachin-person.cfg');
if (fs.existsSync(configSrc)) {
  fs.copyFileSync(configSrc, configDst);
  console.log(`Success: Encrypted config deployed to ${configDst}`);
}

// 6. Launch compiled application cross-platform
let execPath = '';
if (process.platform === 'win32') {
  execPath = path.join(__dirname, 'dist', 'win-unpacked', 'OmniShell.exe');
} else if (process.platform === 'darwin') {
  execPath = path.join(__dirname, 'dist', 'mac', 'OmniShell.app');
} else {
  execPath = path.join(__dirname, 'dist', 'linux-unpacked', 'omnishell');
}

if (fs.existsSync(execPath)) {
  console.log(`Status: Launching compiled application (${execPath})...`);
  if (process.platform === 'darwin') {
    spawn('open', [execPath], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn(execPath, [], { detached: true, stdio: 'ignore' }).unref();
  }
} else {
  console.log(`Status: Output generated at dist/`);
}
