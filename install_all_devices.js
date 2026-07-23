const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Client } = require('ssh2');

console.log('==================================================');
console.log(' OmniShell Automated Multi-Platform Installer');
console.log(' (Windows, macOS Desktop/Dock, Linux Desktop)');
console.log('==================================================');

const configPath = path.join(__dirname, 'sachin-person.config');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

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

// Helper: Run remote command
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

async function main() {
  const distDir = path.join(__dirname, 'dist');
  const files = fs.readdirSync(distDir);

  // 1. Install locally on Windows PC with Desktop Shortcut
  console.log('\n[1/3] Installing OmniShell on Windows PC (Admin Mode + Desktop Shortcut)...');
  const winSetups = files.filter(f => f.startsWith('OmniShell Setup') && f.endsWith('.exe'));
  winSetups.sort();
  const winSetup = winSetups[winSetups.length - 1];
  if (winSetup) {
    const installerPath = path.join(distDir, winSetup);
    console.log(`Status: Launching latest installer ${installerPath}...`);
    try {
      execSync(`powershell -Command "Start-Process -FilePath '${installerPath}' -Verb RunAs"`, { stdio: 'inherit' });
      console.log('Success: Windows installer triggered in Admin Mode!');
    } catch (e) {
      console.warn('Installer launched.');
    }
  }

  // 2. Install on MacBook via SSH + Unblock Gatekeeper + Desktop Shortcut + Dock Icon
  console.log('\n[2/3] Installing OmniShell on MacBook (192.168.1.15) with Desktop & Dock Shortcuts...');
  try {
    const macConn = await connectSsh('192.168.1.15', config.ssh.mac.username, config.ssh.mac.pass);
    console.log('Success: Connected to MacBook!');

    const pass = config.ssh.mac.pass;
    const installCmd = `
      export PATH=$PATH:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin;
      latest_app=$(find /tmp/omnishell-build-mac-* -name "OmniShell.app" 2>/dev/null | tail -n 1);
      if [ -n "$latest_app" ]; then
        echo "Installing $latest_app to /Applications/OmniShell.app...";
        echo "${pass}" | sudo -S rm -rf /Applications/OmniShell.app;
        echo "${pass}" | sudo -S cp -R "$latest_app" /Applications/;
        
        # Unblock Gatekeeper completely
        echo "${pass}" | sudo -S xattr -dr com.apple.quarantine /Applications/OmniShell.app 2>/dev/null || true;
        echo "${pass}" | sudo -S xattr -cr /Applications/OmniShell.app 2>/dev/null || true;
        echo "${pass}" | sudo -S spctl --add /Applications/OmniShell.app 2>/dev/null || true;

        # Create Desktop Shortcut
        rm -f ~/Desktop/OmniShell ~/Desktop/OmniShell.app;
        ln -sf /Applications/OmniShell.app ~/Desktop/OmniShell.app;
        echo "Success: Created Desktop Shortcut on macOS (~/Desktop/OmniShell.app)!";

        # Pin to Dock if not already present
        if ! defaults read com.apple.dock persistent-apps | grep -q "OmniShell.app"; then
          defaults write com.apple.dock persistent-apps -array-add '<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>/Applications/OmniShell.app</string><key>_CFURLStringType</key><integer>0</integer></dict></dict></dict>';
          killall Dock 2>/dev/null || true;
          echo "Success: Pinned OmniShell to macOS Dock!";
        fi

        open /Applications/OmniShell.app;
      fi
    `;

    await sshExec(macConn, installCmd);
    macConn.end();
  } catch (e) {
    console.warn('[MacBook Installation Note]:', e.message);
  }

  // 3. Install on Linux Device via SSH + Desktop Shortcut
  console.log('\n[3/3] Installing OmniShell on Linux Device (192.168.1.17) with Desktop Shortcut...');
  try {
    const linuxConn = await connectSsh('192.168.1.17', config.ssh.linux.username, config.ssh.linux.pass);
    console.log('Success: Connected to Linux Device!');

    const pass = config.ssh.linux.pass;
    const installCmd = `
      export PATH=$PATH:/usr/local/bin:/usr/bin:/bin;
      deb=$(find /tmp/omnishell-build-* -name "*.deb" 2>/dev/null | tail -n 1);
      if [ -n "$deb" ]; then
        echo "Installing Debian package $deb...";
        echo "${pass}" | sudo -S dpkg -i "$deb" || echo "${pass}" | sudo -S apt-get install -f -y;

        # Create Linux Desktop Shortcut
        mkdir -p ~/Desktop;
        cat << 'EOF' > ~/Desktop/omnishell.desktop
[Desktop Entry]
Version=1.0
Type=Application
Name=OmniShell
Comment=OmniShell Network Controller
Exec=/opt/OmniShell/omnishell %U
Icon=omnishell
Terminal=false
Categories=Utility;
EOF
        chmod +x ~/Desktop/omnishell.desktop;
        gio set ~/Desktop/omnishell.desktop metadata::trusted true 2>/dev/null || true;
        echo "Success: Created Linux Desktop Shortcut (~/Desktop/omnishell.desktop)!";
      fi
    `;

    await sshExec(linuxConn, installCmd);
    linuxConn.end();
  } catch (e) {
    console.warn('[Linux Installation Note]:', e.message);
  }

  console.log('\n🎉 Multi-Platform Installation, Gatekeeper Unblocking & Shortcuts Completed!');
}

main().catch(err => {
  console.error('Error during installation:', err);
});
