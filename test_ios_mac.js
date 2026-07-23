const fs = require('fs');
const { Client } = require('ssh2');

const config = JSON.parse(fs.readFileSync('c:\\Users\\sachi\\Desktop\\all-Devices-controller\\sachin-person.config', 'utf8'));
const macCreds = config.ssh.macPersonal || config.ssh.mac;

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected to MacBook! Checking connected iOS hardware...');
  const cmd = `
    echo "--- USB Devices (iPhones/iPads) ---";
    system_profiler SPUSBDataType 2>/dev/null | grep -i -A 10 "iPhone\\|iPad\\|iPod";
    echo "--- xctrace list devices ---";
    xcrun xctrace list devices 2>/dev/null;
    echo "--- idevice_id ---";
    idevice_id -l 2>/dev/null || echo "idevice_id not installed";
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => process.stdout.write(d.toString()));
    stream.stderr.on('data', d => process.stderr.write(d.toString()));
    stream.on('close', () => conn.end());
  });
});
conn.connect({
  host: '192.168.1.15',
  port: 22,
  username: macCreds.username,
  password: macCreds.pass
});
