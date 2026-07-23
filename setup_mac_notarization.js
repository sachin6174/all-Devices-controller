const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');

console.log('==================================================');
console.log(' Apple Signing & Notarization Tester on MacBook');
console.log('==================================================');

const configPath = path.join(__dirname, 'sachin-person.config');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const cerFile = path.join(__dirname, 'developerID_application.cer');
const p8File  = path.join(__dirname, 'AuthKey_7V2V2Y7758.p8');

function connectSsh() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => resolve(conn));
    conn.on('error', err => reject(err));
    conn.connect({
      host: '192.168.1.15',
      port: 22,
      username: config.ssh.mac.username,
      password: config.ssh.mac.pass,
      readyTimeout: 10000
    });
  });
}

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '', errOut = '';
      stream.on('close', code => resolve({ code, out, errOut }));
      stream.on('data', d => { out += d.toString(); process.stdout.write(d.toString()); });
      stream.stderr.on('data', d => { errOut += d.toString(); process.stderr.write(d.toString()); });
    });
  });
}

function sftpUpload(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function main() {
  const conn = await connectSsh();
  console.log('Success: Connected to MacBook via SSH!');

  const remoteKeysDir = '/Users/sachinkumar/private_keys';
  
  await new Promise((resolve, reject) => {
    conn.sftp(async (err, sftp) => {
      if (err) return reject(err);
      try {
        await sshExec(conn, `mkdir -p "${remoteKeysDir}"`);
        if (fs.existsSync(cerFile)) {
          await sftpUpload(sftp, cerFile, `${remoteKeysDir}/developerID_application.cer`);
          console.log('Uploaded developerID_application.cer to MacBook!');
        }
        if (fs.existsSync(p8File)) {
          await sftpUpload(sftp, p8File, `${remoteKeysDir}/AuthKey_7V2V2Y7758.p8`);
          console.log('Uploaded AuthKey_7V2V2Y7758.p8 to MacBook!');
        }
        resolve();
      } catch(e) { reject(e); }
    });
  });

  const pass = config.ssh.mac.pass;
  console.log('\n--- Step 1: Checking Code Signing Identities on MacBook ---');
  await sshExec(conn, `security unlock-keychain -p "${pass}" ~/Library/Keychains/login.keychain-db; security add-certificates -k ~/Library/Keychains/login.keychain-db "${remoteKeysDir}/developerID_application.cer"; security find-identity -v -p codesigning`);

  console.log('\n--- Step 2: Testing Apple Notarization Connection via xcrun notarytool ---');
  const notaryCmd = `xcrun notarytool history --key "${remoteKeysDir}/AuthKey_7V2V2Y7758.p8" --key-id 7V2V2Y7758 --issuer 3208f1a5-5bce-4845-ae7c-d717abe01c20`;
  await sshExec(conn, notaryCmd);

  conn.end();
}

main().catch(err => console.error('Error:', err.message));
