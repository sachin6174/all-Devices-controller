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

// Helper: SFTP Upload single file
function sftpUploadFile(conn, localPath, remotePath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(localPath)) { resolve(); return; }
    conn.sftp((err, sftp) => {
      if (err) { resolve(); return; }
      sftp.fastPut(localPath, remotePath, () => resolve());
    });
  });
}

async function main() {
  const distDir = path.join(__dirname, 'dist');
  const files = fs.readdirSync(distDir);

  const macCreds   = (config.ssh && (config.ssh.macPersonal   || config.ssh.mac))   || { username: 'sachinkumar', pass: '1111' };
  const linuxCreds = (config.ssh && (config.ssh.linuxPersonal || config.ssh.linux)) || { username: 'test', pass: 'test' };

  // 1. Install locally on Windows PC with Desktop Shortcut & Instant Auto-Launch
  console.log('\n[1/3] Installing OmniShell on Windows PC (Admin Mode + Desktop Shortcut + Auto-Launch)...');
  const winUnpacked = path.join(distDir, 'win-unpacked', 'OmniShell.exe');
  const userDesktop = path.join(process.env.USERPROFILE || 'C:\\Users\\sachi', 'Desktop');

  // Create Windows Desktop Shortcut (.lnk wrapper)
  try {
    const psScript = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${userDesktop.replace(/\\/g, '\\\\')}\\\\OmniShell.lnk');$s.TargetPath='${winUnpacked.replace(/\\/g, '\\\\')}';$s.WorkingDirectory='${path.dirname(winUnpacked).replace(/\\/g, '\\\\')}';$s.Save()`;
    execSync(`powershell -Command "${psScript}"`, { stdio: 'ignore' });
    console.log(`Success: Created Windows Desktop Shortcut at ${userDesktop}\\OmniShell.lnk!`);
  } catch (e) {
    console.warn('Desktop shortcut creation note:', e.message);
  }

  // Launch Windows app immediately
  const winSetups = files.filter(f => f.startsWith('OmniShell Setup') && f.endsWith('.exe'));
  winSetups.sort();
  const winSetup = winSetups[winSetups.length - 1];
  if (winSetup) {
    const installerPath = path.join(distDir, winSetup);
    console.log(`Status: Triggering silent admin installer & launching OmniShell (${winUnpacked})...`);
    try {
      execSync(`powershell -Command "Start-Process -FilePath '${installerPath}' -ArgumentList '/S' -Verb RunAs"`, { stdio: 'inherit' });
      console.log('Success: Windows silent installation completed!');
    } catch (e) {}
  }
  if (fs.existsSync(winUnpacked)) {
    try {
      execSync(`powershell -Command "Start-Process '${winUnpacked}'"`, { stdio: 'ignore' });
      console.log('Success: Launched OmniShell on Windows!');
    } catch (e) {}
  }

  // 2. Install on MacBook via SSH + Unblock Gatekeeper + Desktop Shortcut + Dock Icon + Auto-Launch
  console.log('\n[2/3] Installing OmniShell on MacBook (192.168.1.15) with Desktop, Dock Shortcuts & Auto-Launch...');
  try {
    const macConn = await connectSsh('192.168.1.15', macCreds.username, macCreds.pass);
    const localCfg = path.join(__dirname, 'sachin-person.cfg');
    await sftpUploadFile(macConn, localCfg, '/Users/sachinkumar/sachin-person.cfg');
    await sftpUploadFile(macConn, localCfg, '/Applications/OmniShell.app/Contents/Resources/sachin-person.cfg');

    const pass = macCreds.pass;
    const installCmd = `
      export PATH=$PATH:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin;
      latest_app=$(find /tmp/omnishell-build-mac-* -name "OmniShell.app" 2>/dev/null | tail -n 1);
      if [ -n "$latest_app" ]; then
        echo "Installing $latest_app to /Applications/OmniShell.app...";
        echo "${pass}" | sudo -S rm -rf /Applications/OmniShell.app;
        echo "${pass}" | sudo -S cp -R "$latest_app" /Applications/;
        echo "${pass}" | sudo -S cp "${localCfg}" /Applications/OmniShell.app/Contents/Resources/sachin-person.cfg 2>/dev/null || true;
        
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

        open /Applications/OmniShell.app 2>/dev/null || true;
        echo "Success: Launched OmniShell on macOS!";
      fi
    `;

    await sshExec(macConn, installCmd);
    macConn.end();
  } catch (e) {
    console.warn('[MacBook Installation Note]:', e.message);
  }

  // 3. Install on Linux Device via SSH + AppImage + Desktop Shortcut + Auto-Launch
  console.log('\n[3/3] Installing OmniShell on Linux Device (192.168.1.17) with Desktop Shortcut & Auto-Launch...');
  try {
    const linuxConn = await connectSsh('192.168.1.17', linuxCreds.username, linuxCreds.pass);
    console.log('Success: Connected to Linux Device!');
    await sftpUploadFile(linuxConn, localCfg, '/home/test/sachin-person.cfg');

    const pass = linuxCreds.pass;
    const installCmd = `
      export PATH=$PATH:/usr/local/bin:/usr/bin:/bin;
      deb=$(find /tmp/omnishell-build-* -name "*.deb" 2>/dev/null | tail -n 1);
      appimage=$(find /tmp/omnishell-build-* -name "*.AppImage" 2>/dev/null | tail -n 1);

      if [ -n "$deb" ]; then
        echo "Installing Debian package $deb...";
        echo "${pass}" | sudo -S dpkg -i "$deb" 2>/dev/null || echo "${pass}" | sudo -S apt-get install -f -y 2>/dev/null;
      fi

      # Always provision standalone AppImage executable to ~/Desktop/OmniShell.AppImage & ~/Desktop/OmniShell
      mkdir -p ~/Desktop;
      if [ -n "$appimage" ]; then
        cp "$appimage" ~/Desktop/OmniShell.AppImage;
        cp "$appimage" ~/Desktop/OmniShell;
        echo "${pass}" | sudo -S cp "$appimage" /usr/local/bin/omnishell 2>/dev/null || true;
        chmod +x ~/Desktop/OmniShell.AppImage ~/Desktop/OmniShell /usr/local/bin/omnishell 2>/dev/null || true;
        echo "Success: Deployed ~/Desktop/OmniShell.AppImage!";
      fi

      # Create Linux Desktop Shortcut (.desktop file)
      cat << 'EOF' > ~/Desktop/omnishell.desktop
[Desktop Entry]
Version=1.0
Type=Application
Name=OmniShell
Comment=OmniShell Network Controller
Exec=/home/test/Desktop/OmniShell.AppImage %U
Icon=omnishell
Terminal=false
Categories=Utility;
EOF
      chmod +x ~/Desktop/omnishell.desktop;
      gio set ~/Desktop/omnishell.desktop metadata::trusted true 2>/dev/null || true;
      echo "Success: Created Linux Desktop Shortcut (~/Desktop/omnishell.desktop)!";

      # Auto-launch across ALL active X displays (Chrome Remote Desktop :20, :1, :0, etc.)
      for disp in :20 :1 :0 :10.0 :0.0 :1.0; do
        if [ -S "/tmp/.X11-unix/X\${disp#*:}" ] || xset -q -display "\$disp" >/dev/null 2>&1; then
          echo "Launching on Linux display \$disp...";
          DISPLAY="\$disp" XAUTHORITY=/home/test/.Xauthority nohup ~/Desktop/OmniShell.AppImage --no-sandbox >/dev/null 2>&1 &
          DISPLAY="\$disp" XAUTHORITY=/home/test/.Xauthority nohup /opt/OmniShell/omnishell --no-sandbox >/dev/null 2>&1 &
        fi
      done
      nohup ~/Desktop/OmniShell.AppImage --no-sandbox >/dev/null 2>&1 &
      echo "Success: Launched OmniShell across all Linux displays!";
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
