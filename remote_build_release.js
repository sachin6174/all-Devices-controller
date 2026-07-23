const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const { Client } = require('ssh2');

console.log('==================================================');
console.log(' OmniShell Automated Remote Multi-Platform Build');
console.log(' & GitHub Release Publisher');
console.log('==================================================');

// 1. Read Configuration & Package Details
const configPath = path.join(__dirname, 'sachin-person.config');
if (!fs.existsSync(configPath)) {
  console.error('Error: sachin-person.config file not found!');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const version = packageJson.version;
const tag = `v${version}`;
const repo = 'sachin6174/all-Devices-controller';
const githubToken = config.github_token;

console.log(`Target Version: ${tag}`);
console.log(`GitHub Repository: ${repo}`);
console.log(`Mac Credentials: ${config.ssh.mac.username}@192.168.1.5`);
console.log(`Linux Credentials: ${config.ssh.linux.username}@192.168.1.10`);
console.log('--------------------------------------------------');

// Helper: Run remote SSH command with PATH environment resolution
function sshRunCommand(sshClient, cmd) {
  return new Promise((resolve, reject) => {
    const envPrefix = 'export PATH=$PATH:/Users/sachinkumar/nodejs/bin:/home/test/nodejs/bin:/usr/local/bin:/opt/homebrew/bin:~/.nvm/versions/node/$(ls ~/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:~/.local/bin:/usr/bin:/bin:/snap/bin; ';
    const escapedCmd = cmd.replace(/"/g, '\\"');
    const fullCmd = `bash -l -c "${envPrefix}${escapedCmd}"`;
    sshClient.exec(fullCmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
      });
      stream.on('data', data => {
        const text = data.toString();
        stdout += text;
        process.stdout.write(text);
      });
      stream.stderr.on('data', data => {
        const text = data.toString();
        stderr += text;
        process.stderr.write(text);
      });
    });
  });
}

// Helper: SFTP recursive directory upload
function sftpUploadDir(sftp, localDir, remoteDir) {
  return new Promise((resolve, reject) => {
    // Ensure remote directory exists
    sftp.mkdir(remoteDir, (err) => {
      // ignore EEXIST
      const items = fs.readdirSync(localDir);
      let count = items.length;
      if (count === 0) return resolve();

      let completed = 0;
      const checkDone = () => {
        completed++;
        if (completed === items.length) resolve();
      };

      for (const item of items) {
        if (item === 'node_modules' || item === '.git' || item === 'dist' || item === '.gemini') {
          checkDone();
          continue;
        }

        const localPath = path.join(localDir, item);
        const remotePath = `${remoteDir}/${item}`;
        const stat = fs.statSync(localPath);

        if (stat.isDirectory()) {
          sftpUploadDir(sftp, localPath, remotePath).then(checkDone).catch(reject);
        } else {
          sftp.fastPut(localPath, remotePath, (putErr) => {
            if (putErr) return reject(putErr);
            checkDone();
          });
        }
      }
    });
  });
}

// Helper: SFTP download single file
function sftpDownload(sftp, remotePath, localPath) {
  return new Promise((resolve, reject) => {
    sftp.fastGet(remotePath, localPath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Helper: Connect SSH
function connectSsh(host, username, password) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => resolve(conn));
    conn.on('error', err => reject(err));
    conn.connect({
      host,
      port: 22,
      username,
      password,
      readyTimeout: 10000
    });
  });
}

// Helper: Create GitHub Release and Upload Assets
async function publishGithubRelease(token, repoPath, tagName, releaseName, bodyText, assetFiles) {
  console.log(`\nStatus: Creating GitHub Release ${tagName}...`);

  const postData = JSON.stringify({
    tag_name: tagName,
    target_commitish: 'master',
    name: releaseName,
    body: bodyText,
    draft: false,
    prerelease: false
  });

  const options = {
    hostname: 'api.github.com',
    path: `/repos/${repoPath}/releases`,
    method: 'POST',
    headers: {
      'User-Agent': 'OmniShell-Release-Engine',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const releaseRes = await new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`GitHub Release API returned status ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  console.log(`Success: Release created! ID: ${releaseRes.id}`);
  const uploadUrlTemplate = releaseRes.upload_url.split('{')[0];

  for (const file of assetFiles) {
    if (!fs.existsSync(file)) {
      console.warn(`Warning: Asset file not found on disk, skipping: ${file}`);
      continue;
    }
    const fileName = path.basename(file);
    console.log(`Status: Uploading release asset: ${fileName}...`);
    const fileData = fs.readFileSync(file);

    const uploadUrl = new URL(`${uploadUrlTemplate}?name=${encodeURIComponent(fileName)}`);

    const uploadOpts = {
      hostname: uploadUrl.hostname,
      path: `${uploadUrl.pathname}${uploadUrl.search}`,
      method: 'POST',
      headers: {
        'User-Agent': 'OmniShell-Release-Engine',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileData.length
      }
    };

    await new Promise((resolve, reject) => {
      const req = https.request(uploadOpts, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`Success: Asset uploaded ${fileName}`);
            resolve(JSON.parse(data));
          } else {
            console.error(`Asset upload failed for ${fileName} (${res.statusCode}): ${data}`);
            resolve(null);
          }
        });
      });
      req.on('error', err => {
        console.error(`Upload request error for ${fileName}:`, err.message);
        resolve(null);
      });
      req.write(fileData);
      req.end();
    });
  }

  console.log(`\n🎉 GitHub Release ${tagName} Published Successfully!`);
  console.log(`URL: ${releaseRes.html_url}`);
}

async function main() {
  const localDistDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(localDistDir)) fs.mkdirSync(localDistDir, { recursive: true });

  // Auto-increment minor version in package.json
  const pkgPath = path.join(__dirname, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const oldVer = pkg.version;
  const parts = oldVer.split('.').map(n => parseInt(n, 10));
  parts[1] = parts[1] + 1;
  parts[2] = 0;
  const version = parts.join('.');
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4));

  const tag = `v${version}`;
  console.log(`\n==================================================`);
  console.log(` Launching Multi-Platform Release Engine for ${tag}`);
  console.log(`==================================================`);

  // Create git commit & tag locally
  try {
    execSync('git add .', { cwd: __dirname });
    execSync(`git commit -m "Release ${tag}"`, { cwd: __dirname });
    execSync(`git tag ${tag}`, { cwd: __dirname });
    console.log(`Success: Created Git Tag ${tag}`);
  } catch(e) {}

  // ── Step 1: Local Windows Build ─────────────────────────────────────────────
  console.log('\n[1/4] Building Windows Production Binaries Locally...');
  try {
    execSync('npx electron-builder --win', { stdio: 'inherit', cwd: __dirname });
    console.log('Success: Local Windows binaries built!');
  } catch (e) {
    console.error('Error building Windows package:', e.message);
  }

  // ── Step 2: Remote macOS Build ──────────────────────────────────────────────
  const macIps = ['192.168.1.15', '192.168.1.5'];
  let macConn = null;
  let activeMacIp = null;
  console.log('\n[2/4] Connecting to MacBook via SSH for macOS Build...');
  for (const ip of macIps) {
    try {
      macConn = await connectSsh(ip, config.ssh.mac.username, config.ssh.mac.pass);
      activeMacIp = ip;
      console.log(`Success: SSH connected to MacBook at ${ip}!`);
      break;
    } catch(e) {}
  }

  if (macConn) {
    try {
      const macRemoteDir = `/tmp/omnishell-build-mac-${Date.now()}`;
      console.log(`Status: Syncing project source to MacBook at ${macRemoteDir}...`);

      await new Promise((resolve, reject) => {
        macConn.sftp((err, sftp) => {
          if (err) return reject(err);
          sftpUploadDir(sftp, __dirname, macRemoteDir).then(() => resolve(sftp)).catch(reject);
        });
      });

      console.log('Status: Executing macOS electron-builder on MacBook...');
      await sshRunCommand(macConn, `cd "${macRemoteDir}" && npm install && npx electron-builder --mac`);
      console.log('Success: macOS binaries compiled on MacBook!');

      // Download macOS DMG and ZIP
      console.log('Status: Downloading macOS binaries from MacBook to local dist/...');
      await new Promise((resolve) => {
        macConn.sftp(async (err, sftp) => {
          if (err) { resolve(); return; }
          try {
            const remoteDmg = `${macRemoteDir}/dist/OmniShell-${version}.dmg`;
            const remoteZip = `${macRemoteDir}/dist/OmniShell-${version}-mac.zip`;
            const localDmg  = path.join(localDistDir, `OmniShell-${version}.dmg`);
            const localZip  = path.join(localDistDir, `OmniShell-${version}-mac.zip`);

            try { await sftpDownload(sftp, remoteDmg, localDmg); console.log(`Downloaded: ${localDmg}`); } catch(e){}
            try { await sftpDownload(sftp, remoteZip, localZip); console.log(`Downloaded: ${localZip}`); } catch(e){}
          } catch(e){}
          resolve();
        });
      });

      macConn.end();
    } catch (e) {
      console.warn(`[macOS Remote Build Error]: ${e.message}`);
    }
  } else {
    console.warn('[macOS Remote Build Skipped]: Could not connect to MacBook via SSH');
  }

  // ── Step 3: Remote Linux Build ──────────────────────────────────────────────
  const linuxIps = ['192.168.1.17', '192.168.1.10'];
  let linuxConn = null;
  let activeLinuxIp = null;
  console.log('\n[3/4] Connecting to Linux Device via SSH for Linux Build...');
  for (const ip of linuxIps) {
    try {
      linuxConn = await connectSsh(ip, config.ssh.linux.username, config.ssh.linux.pass);
      activeLinuxIp = ip;
      console.log(`Success: SSH connected to Linux Device at ${ip}!`);
      break;
    } catch(e) {}
  }

  if (linuxConn) {
    try {
      const linuxRemoteDir = `/tmp/omnishell-build-linux-${Date.now()}`;
      console.log(`Status: Syncing project source to Linux Device at ${linuxRemoteDir}...`);

      await new Promise((resolve, reject) => {
        linuxConn.sftp((err, sftp) => {
          if (err) return reject(err);
          sftpUploadDir(sftp, __dirname, linuxRemoteDir).then(() => resolve(sftp)).catch(reject);
        });
      });

      console.log('Status: Executing Linux electron-builder on Linux device...');
      await sshRunCommand(linuxConn, `cd "${linuxRemoteDir}" && npm install && npx electron-builder --linux`);
      console.log('Success: Linux binaries compiled on Linux device!');

      // Download Linux AppImage and DEB
      console.log('Status: Downloading Linux binaries to local dist/...');
      await new Promise((resolve) => {
        linuxConn.sftp(async (err, sftp) => {
          if (err) { resolve(); return; }
          try {
            const remoteAppImage = `${linuxRemoteDir}/dist/OmniShell-${version}.AppImage`;
            const remoteDeb      = `${linuxRemoteDir}/dist/omnishell_${version}_amd64.deb`;
            const localAppImage  = path.join(localDistDir, `OmniShell-${version}.AppImage`);
            const localDeb       = path.join(localDistDir, `omnishell_${version}_amd64.deb`);

            try { await sftpDownload(sftp, remoteAppImage, localAppImage); console.log(`Downloaded: ${localAppImage}`); } catch(e){}
            try { await sftpDownload(sftp, remoteDeb, localDeb); console.log(`Downloaded: ${localDeb}`); } catch(e){}
          } catch(e){}
          resolve();
        });
      });

      linuxConn.end();
    } catch (e) {
      console.warn(`[Linux Remote Build Error]: ${e.message}`);
    }
  } else {
    console.warn('[Linux Remote Build Skipped]: Could not connect to Linux device via SSH');
  }

  // ── Step 4: Publish GitHub Release with Multi-Platform Binaries ────────────
  console.log('\n[4/4] Collecting All Multi-Platform Artifacts for GitHub Release...');
  const assetCandidates = [
    path.join(localDistDir, `OmniShell Setup ${version}.exe`),
    path.join(localDistDir, `OmniShell-${version}-win.zip`),
    path.join(localDistDir, `OmniShell-${version}.dmg`),
    path.join(localDistDir, `OmniShell-${version}-mac.zip`),
    path.join(localDistDir, `OmniShell-${version}.AppImage`),
    path.join(localDistDir, `omnishell_${version}_amd64.deb`)
  ];

  const existingAssets = assetCandidates.filter(f => fs.existsSync(f));
  console.log(`Found ${existingAssets.length} production assets:`, existingAssets.map(f => path.basename(f)));

  if (githubToken) {
    await publishGithubRelease(
      githubToken,
      repo,
      tag,
      `OmniShell Release ${tag}`,
      `## 🚀 OmniShell Multi-Platform Release ${tag}\n\nAutomated production release featuring cross-platform builds for Windows, macOS, and Linux.\n\n### 📦 Artifacts Included:\n${existingAssets.map(a => `- \`${path.basename(a)}\``).join('\n')}`,
      existingAssets
    );
  } else {
    console.warn('Warning: github_token not found in config. Skipping GitHub Release upload.');
  }
}

main().catch(err => {
  console.error('Fatal Error during Multi-Platform Remote Build Pipeline:', err);
});
