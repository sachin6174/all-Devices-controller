const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');

const config = JSON.parse(fs.readFileSync('c:\\Users\\sachi\\Desktop\\all-Devices-controller\\sachin-person.config', 'utf8'));
const linuxCreds = config.ssh.linuxPersonal || config.ssh.linux;

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected to Linux device!');
  const cmd = `
    ls -l /home/test/Desktop/OmniShell.AppImage;
    file /home/test/Desktop/OmniShell.AppImage;
    /home/test/Desktop/OmniShell.AppImage --appimage-extract-and-run --no-sandbox 2>&1 | head -n 30
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
});
conn.connect({
  host: '192.168.1.17',
  port: 22,
  username: linuxCreds.username,
  password: linuxCreds.pass
});
