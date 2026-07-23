const fs = require('fs');
const { Client } = require('ssh2');

const config = JSON.parse(fs.readFileSync('c:\\Users\\sachi\\Desktop\\all-Devices-controller\\sachin-person.config', 'utf8'));
const linuxCreds = config.ssh.linuxPersonal || config.ssh.linux;

const conn = new Client();
conn.on('ready', () => {
  const cmd = `
    export PATH=$PATH:/usr/local/bin:/usr/bin:/bin:/home/test/.nvm/versions/node/$(ls /home/test/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:/snap/bin;
    which node; which npm; which npx; node -v; npm -v
  `;
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('data', d => console.log('Linux Node/NPM:', d.toString()));
    stream.on('close', () => conn.end());
  });
});
conn.connect({
  host: '192.168.1.17',
  port: 22,
  username: linuxCreds.username,
  password: linuxCreds.pass
});
