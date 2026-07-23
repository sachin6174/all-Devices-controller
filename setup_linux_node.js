const fs = require('fs');
const { Client } = require('ssh2');

const config = JSON.parse(fs.readFileSync('c:\\Users\\sachi\\Desktop\\all-Devices-controller\\sachin-person.config', 'utf8'));
const linuxCreds = config.ssh.linuxPersonal || config.ssh.linux;

const conn = new Client();
conn.on('ready', () => {
  console.log('Connected to Linux device! Installing nodejs & npm...');
  const pass = linuxCreds.pass;
  const cmd = `
    echo "${pass}" | sudo -S apt-get update -y &&
    echo "${pass}" | sudo -S apt-get install -y nodejs npm curl wget &&
    which node npm npx
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
