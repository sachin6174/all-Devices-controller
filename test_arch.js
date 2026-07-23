const fs = require('fs');
const { Client } = require('ssh2');

const config = JSON.parse(fs.readFileSync('c:\\Users\\sachi\\Desktop\\all-Devices-controller\\sachin-person.config', 'utf8'));
const linuxCreds = config.ssh.linuxPersonal || config.ssh.linux;

const conn = new Client();
conn.on('ready', () => {
  conn.exec('uname -m; dpkg --print-architecture', (err, stream) => {
    if (err) throw err;
    stream.on('data', d => console.log('Architecture:', d.toString()));
    stream.on('close', () => conn.end());
  });
});
conn.connect({
  host: '192.168.1.17',
  port: 22,
  username: linuxCreds.username,
  password: linuxCreds.pass
});
