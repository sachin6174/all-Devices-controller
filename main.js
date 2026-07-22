const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const dns = require('dns').promises;
const { exec, spawn, execSync } = require('child_process');
const { Client } = require('ssh2');
const os = require('os');
const crypto = require('crypto');

// ── AES-256-GCM config decryptor ──────────────────────────────────────────────
const _SP = [79,109,110,105,83,104,101,108,108,95,67,111,114,101,95,50,48,50,52,95,83,101,99,114,101,116,95,75,101,121,95,86,50];
const _SK = Buffer.from(_SP).toString('utf8');
const _SS = Buffer.from('4f6d6e695368656c6c53616c7456', 'hex');
const _AK = crypto.pbkdf2Sync(_SK, _SS, 210000, 32, 'sha512');

function decryptConfig(base64Cipher) {
  try {
    const buf = Buffer.from(base64Cipher, 'base64');
    let offset = 0;
    const ivLen  = buf[offset++];
    const iv     = buf.slice(offset, offset + ivLen);  offset += ivLen;
    const tagLen = buf[offset++];
    const tag    = buf.slice(offset, offset + tagLen); offset += tagLen;
    const data   = buf.slice(offset);
    const decipher = crypto.createDecipheriv('aes-256-gcm', _AK, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  } catch (e) {
    console.error('Failed to decrypt config:', e.message);
    return null;
  }
}

let mainWindow;
let activeSshConn = null;
let activeSshStream = null;

// Common MAC OUI prefixes mapped to vendors (Offline fallbacks)
const OFFLINE_VENDORS = {
  "00:00:5E": "IANA",
  "00:05:CD": "Cisco",
  "00:0C:29": "VMware",
  "00:11:32": "Synology",
  "00:14:22": "Dell",
  "00:15:5D": "Microsoft (Hyper-V)",
  "00:1A:11": "Google",
  "00:1C:42": "Parallels",
  "00:25:90": "Supermicro",
  "00:90:F5": "CLEVO",
  "04:18:D6": "Ubiquiti",
  "04:D4:C4": "Intel",
  "04:D9:F5": "ASUS",
  "08:00:27": "VirtualBox",
  "08:60:6E": "ASUS",
  "10:7B:44": "ASUS",
  "18:B4:30": "Nest Labs",
  "1C:69:7A": "Dell",
  "24:4B:FE": "Intel",
  "28:D2:44": "Intel",
  "2C:F4:C5": "Espressif",
  "30:FD:38": "Espressif",
  "34:97:F6": "TP-Link",
  "3C:7C:3F": "Intel",
  "3C:D9:2B": "HP",
  "40:A3:6C": "Apple",
  "44:AF:28": "Intel",
  "48:2C:A0": "Intel",
  "50:9A:4C": "Intel",
  "50:C7:BF": "TP-Link",
  "54:AF:97": "Apple",
  "54:B2:03": "Intel",
  "54:E1:AD": "Intel",
  "60:F2:62": "Intel",
  "70:4D:7B": "Intel",
  "70:85:C2": "Intel",
  "70:CD:0D": "Intel",
  "70:EE:50": "Apple",
  "74:04:F1": "Apple",
  "74:0E:A4": "Apple",
  "74:83:C2": "Apple",
  "78:84:3C": "Intel",
  "7C:8B:CA": "Intel",
  "80:7A:BF": "Raspberry Pi",
  "80:A5:89": "Intel",
  "80:FA:5B": "Intel",
  "84:F3:EB": "Espressif",
  "8C:16:45": "Intel",
  "94:E9:79": "Intel",
  "A0:C5:89": "Intel",
  "A4:38:CC": "Intel",
  "A4:4E:31": "Intel",
  "A4:77:33": "Xiaomi",
  "A8:A1:59": "Intel",
  "B0:52:16": "Intel",
  "B4:B6:76": "Intel",
  "B8:27:EB": "Raspberry Pi",
  "B8:AE:ED": "Intel",
  "C0:2E:5F": "TP-Link",
  "C4:9E:C0": "Intel",
  "C8:D7:19": "TP-Link",
  "CC:96:E5": "Intel",
  "D4:3B:04": "Intel",
  "D8:3A:DD": "Raspberry Pi",
  "DC:A6:32": "Raspberry Pi",
  "E4:5F:01": "Raspberry Pi",
  "E4:A8:DF": "Intel",
  "F0:18:98": "Apple",
  "F4:4E:B4": "Gigabyte Technology",
  "F4:6A:DD": "TP-Link",
  "F8:75:A4": "Intel",
  "FC:F8:AE": "Intel"
};

function createWindow() {
  // Override User-Agent for Google session partition to prevent Google Sign-In secure browser blocks
  const googleSession = session.fromPartition('persist:google-session');
  const firefoxUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0';
  googleSession.setUserAgent(firefoxUserAgent);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    },
    titleBarStyle: 'hidden',
    backgroundColor: '#0F0E17'
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Helper: load config — prefers encrypted .cfg, falls back to plaintext .config
function loadConfigData() {
  // Encrypted .cfg search paths (preferred — shipped with app)
  const encryptedPaths = [
    path.join(path.dirname(process.execPath), 'sachin-person.cfg'),
    path.join(os.homedir(), 'sachin-person.cfg'),
    path.join(__dirname, 'sachin-person.cfg')
  ];

  for (const cfgPath of encryptedPaths) {
    try {
      if (fs.existsSync(cfgPath)) {
        const raw = fs.readFileSync(cfgPath, 'utf8');
        const data = decryptConfig(raw.trim());
        if (data) {
          console.log('Loaded encrypted config from:', cfgPath);
          return data;
        }
      }
    } catch (e) {
      console.error('Error reading encrypted config at:', cfgPath, e);
    }
  }

  // Fallback: plaintext .config (dev mode only)
  const plaintextPaths = [
    path.join(path.dirname(process.execPath), 'sachin-person.config'),
    path.join(os.homedir(), 'sachin-person.config'),
    path.join(__dirname, 'sachin-person.config')
  ];

  for (const configPath of plaintextPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8');
        console.log('[DEV] Loaded plaintext config from:', configPath);
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Error reading config at:', configPath, e);
    }
  }

  return null;
}

// IPC: load config
ipcMain.handle('load-config', () => {
  return loadConfigData();
});

// IPC: launch uninstaller
ipcMain.handle('launch-uninstaller', () => {
  const { exec } = require('child_process');
  
  // The uninstaller generated by NSIS is in the same directory as the executable
  const uninstallerPath = path.join(path.dirname(process.execPath), 'Uninstall OmniShell.exe');

  if (fs.existsSync(uninstallerPath)) {
    // Spawn uninstaller process detached and quit app immediately so files are not locked
    const child = exec(`"${uninstallerPath}"`, {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    app.quit();
    return true;
  } else {
    console.log('Uninstaller not found. Current path:', uninstallerPath);
    return false;
  }
});

// ── Embedded Android Mirror ────────────────────────────────────────────────
let androidMirrorActive = false;

// Helper: find ADB executable
function findAdb() {
  try {
    const result = execSync('where adb', { encoding: 'utf8', stdio: ['pipe','pipe','ignore'] }).trim().split('\n')[0];
    if (result && result.trim()) return result.trim();
  } catch {}
  // Check winget paths
  const wingetBase = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
  try {
    const walk = (dir, depth = 0) => {
      if (depth > 4) return null;
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        if (f === 'adb.exe') return full;
        try {
          if (fs.statSync(full).isDirectory()) {
            const found = walk(full, depth + 1);
            if (found) return found;
          }
        } catch {}
      }
      return null;
    };
    const found = walk(wingetBase);
    if (found) return found;
  } catch {}
  return 'adb'; // fallback
}

// Helper: ensure ADB device is connected
function ensureAdbConnected() {
  const adb = findAdb();
  try {
    const devicesOutput = execSync(`"${adb}" devices`, { encoding: 'utf8', stdio: ['pipe','pipe','ignore'] });
    if (!devicesOutput.includes('\tdevice')) {
      // Auto-connect to 192.168.1.5:5555
      execSync(`"${adb}" connect 192.168.1.5:5555`, { encoding: 'utf8', stdio: ['pipe','pipe','ignore'] });
    }
  } catch(e) {}
}

// IPC: start embedded Android screen mirror (sends frames via IPC push)
ipcMain.handle('start-android-mirror', async () => {
  androidMirrorActive = true;
  ensureAdbConnected();
  const adb = findAdb();

  const captureFrame = () => {
    if (!androidMirrorActive) return;
    const chunks = [];
    const proc = spawn(adb, ['exec-out', 'screencap', '-p'], { windowsHide: true });
    proc.stdout.on('data', chunk => chunks.push(chunk));
    proc.on('close', code => {
      if (code === 0 && chunks.length > 0) {
        const buf = Buffer.concat(chunks);
        if (buf.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('android-frame', buf.toString('base64'));
        }
      }
      if (androidMirrorActive) setTimeout(captureFrame, 350); // ~3 fps
    });
    proc.on('error', () => {
      if (androidMirrorActive) setTimeout(captureFrame, 1000);
    });
  };

  captureFrame();
  return { success: true };
});

// IPC: stop Android mirror
ipcMain.handle('stop-android-mirror', () => {
  androidMirrorActive = false;
  return { success: true };
});

// IPC: send tap input to Android device
ipcMain.handle('android-tap', (event, { deviceX, deviceY }) => {
  const adb = findAdb();
  exec(`"${adb}" shell input tap ${Math.round(deviceX)} ${Math.round(deviceY)}`, { windowsHide: true });
  return { success: true };
});

// IPC: send key event to Android device
ipcMain.handle('android-key', (event, keycode) => {
  const adb = findAdb();
  exec(`"${adb}" shell input keyevent ${keycode}`, { windowsHide: true });
  return { success: true };
});

// IPC: get Android device screen resolution
ipcMain.handle('get-android-info', () => {
  return new Promise(resolve => {
    const adb = findAdb();
    exec(`"${adb}" shell wm size`, { windowsHide: true }, (err, stdout) => {
      if (err) { resolve(null); return; }
      const m = stdout.match(/Physical size:\s*(\d+)x(\d+)/);
      if (m) resolve({ width: parseInt(m[1]), height: parseInt(m[2]) });
      else resolve(null);
    });
  });
});


// Helper: ping a host cross-platform
function pingHost(ip) {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32'
      ? `ping -n 1 -w 200 ${ip}`
      : `ping -c 1 -W 1 ${ip}`;
    exec(cmd, (err) => {
      resolve(!err);
    });
  });
}

// Helper: TCP port connect check
function checkTcpPort(ip, port, timeout = 200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.connect(port, ip, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// Heuristic to check if a host is active
async function isHostActive(ip) {
  const pingOk = await pingHost(ip);
  if (pingOk) return true;

  // Fallback to TCP checks for common ports (in case ICMP is blocked)
  const ports = [22, 80, 443, 445];
  for (const port of ports) {
    if (await checkTcpPort(ip, port, 100)) {
      return true;
    }
  }
  return false;
}

// Helper: run cross-platform arp -a and parse results
function getArpTable() {
  return new Promise((resolve) => {
    exec('arp -a', (err, stdout) => {
      const arpMap = {};
      if (err || !stdout) {
        resolve(arpMap);
        return;
      }
      
      const lines = stdout.split('\n');
      const ipRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
      const macRegex = /([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}/;

      for (const line of lines) {
        const ipMatch = line.match(ipRegex);
        const macMatch = line.match(macRegex);
        if (ipMatch && macMatch) {
          const ip = ipMatch[0];
          const mac = macMatch[0].toUpperCase().replace(/-/g, ':');
          arpMap[ip] = mac;
        }
      }
      resolve(arpMap);
    });
  });
}

// Helper: Fetch SSH Banner
function getSshBanner(ip, port = 22) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    let banner = '';
    socket.connect(port, ip, () => {});
    socket.on('data', (data) => {
      banner = data.toString().trim().split('\n')[0];
      socket.destroy();
      resolve(banner);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(null);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
  });
}

// Helper: Get vendor by MAC address using offline OUI mapper
function getMacVendor(mac) {
  if (!mac || mac === '-') return 'Unknown Vendor';
  const secondChar = mac[1]?.toUpperCase();
  if (['2', '3', '6', '7', 'A', 'B', 'E', 'F'].includes(secondChar)) {
    return 'Private/Randomized MAC';
  }
  const oui = mac.substring(0, 8).toUpperCase();
  return OFFLINE_VENDORS[oui] || 'Unknown Vendor';
}

// Helper: reverse DNS lookup
async function getHostname(ip) {
  try {
    const names = await dns.reverse(ip);
    return names[0] || 'Unknown Device';
  } catch {
    return 'Unknown Device';
  }
}

// OS Classification based on banner, hostname, and vendor
function classifyOS(hostname, vendor, banner) {
  const combined = `${hostname} ${vendor} ${banner || ''}`.toLowerCase();
  
  if (combined.includes('ubuntu') || combined.includes('debian') || combined.includes('linux') || combined.includes('raspbian') || combined.includes('centos')) {
    return 'linux';
  }
  if (combined.includes('mac') || combined.includes('apple') || combined.includes('darwin') || combined.includes('ipad') || combined.includes('iphone')) {
    return 'mac';
  }
  if (combined.includes('windows') || combined.includes('microsoft')) {
    return 'windows';
  }
  
  // Extra fallbacks based on specific keywords
  if (vendor.toLowerCase().includes('apple')) return 'mac';
  if (vendor.toLowerCase().includes('microsoft')) return 'windows';
  
  if (banner) {
    if (banner.toLowerCase().includes('openssh')) {
      // Default to Linux if SSH open and brand unspecified, but standard
      return 'linux';
    }
  }
  return 'unknown';
}

// Main Network Scanner Logic
ipcMain.on('scan-network', async (event) => {
  try {
    const interfaces = os.networkInterfaces();
    const subnets = [];
    
    // Find active non-internal IPv4 interfaces
    for (const devName of Object.keys(interfaces)) {
      for (const iface of interfaces[devName]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          subnets.push(iface);
        }
      }
    }

    if (subnets.length === 0) {
      event.reply('scan-error', 'No active local network interfaces found.');
      return;
    }

    // Process first subnet (or multiple if applicable, usually focus on primary)
    const primaryNet = subnets[0];
    const ipParts = primaryNet.address.split('.').map(Number);
    const baseSubnet = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
    
    event.reply('scan-status', { status: 'starting', subnet: `${baseSubnet}.0/24`, localIp: primaryNet.address });

    // Generate list of 254 host IPs to sweep
    const targetIps = [];
    for (let i = 1; i <= 254; i++) {
      targetIps.push(`${baseSubnet}.${i}`);
    }

    // Ping sweep & TCP checks with concurrency limit of 40
    const activeIps = [];
    const concurrency = 45;
    let completedCount = 0;
    
    const worker = async () => {
      while (targetIps.length > 0) {
        const ip = targetIps.shift();
        if (!ip) break;

        const isActive = await isHostActive(ip);
        if (isActive) {
          activeIps.push(ip);
        }
        completedCount++;
        event.reply('scan-progress', {
          completed: completedCount,
          total: 254,
          currentIp: ip,
          foundCount: activeIps.length
        });
      }
    };

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, targetIps.length); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    event.reply('scan-status', { status: 'resolving', activeCount: activeIps.length });

    // Read ARP cache to get MAC addresses
    const arpMap = await getArpTable();
    
    // Resolve detailed info for active devices
    const devices = [];
    for (const ip of activeIps) {
      // Local IP self-ARP bypass
      let mac = arpMap[ip];
      if (!mac && ip === primaryNet.address) {
        // Find local MAC
        mac = primaryNet.mac ? primaryNet.mac.toUpperCase() : '-';
      }
      mac = mac || '-';

      const vendor = getMacVendor(mac);
      const hostname = await getHostname(ip);
      const isSshOpen = await checkTcpPort(ip, 22, 350);
      const banner = isSshOpen ? await getSshBanner(ip, 22) : '';
      const osType = classifyOS(hostname, vendor, banner);

      devices.push({
        ip,
        mac,
        vendor,
        name: hostname === 'Unknown Device' ? (ip === primaryNet.address ? 'Local Machine' : 'Unknown Device') : hostname,
        extra: banner ? `SSH: ${banner}` : (isSshOpen ? 'SSH Open' : 'SSH Closed'),
        sshOpen: isSshOpen,
        os: osType,
        isLocal: ip === primaryNet.address
      });
    }

    event.reply('scan-complete', devices);
  } catch (error) {
    console.error('Scan error:', error);
    event.reply('scan-error', `Scan failed: ${error.message}`);
  }
});

// SSH Core Connection Handlers
ipcMain.on('ssh-connect', (event, { ip, osType, username, password }) => {
  // If connection is already open, close it first
  if (activeSshConn) {
    try {
      activeSshConn.end();
    } catch (e) {}
    activeSshConn = null;
    activeSshStream = null;
  }

  const conn = new Client();
  activeSshConn = conn;

  event.reply('ssh-state', { state: 'connecting', ip });

  conn.on('ready', () => {
    event.reply('ssh-state', { state: 'connected', ip });
    
    conn.shell({ term: 'xterm-color', cols: 80, rows: 24 }, (err, stream) => {
      if (err) {
        event.reply('ssh-state', { state: 'error', error: `Shell creation failed: ${err.message}` });
        conn.end();
        return;
      }
      activeSshStream = stream;

      stream.on('data', (data) => {
        event.reply('ssh-output', data.toString());
      });

      stream.on('close', () => {
        event.reply('ssh-state', { state: 'disconnected' });
        conn.end();
        // Only clear shared state if this connection is still the active one -
        // a newer ssh-connect call may have already replaced it.
        if (activeSshConn === conn) {
          activeSshConn = null;
          activeSshStream = null;
        }
      });
    });
  });

  conn.on('error', (err) => {
    event.reply('ssh-state', { state: 'error', error: err.message });
    if (activeSshConn === conn) {
      activeSshConn = null;
      activeSshStream = null;
    }
  });

  conn.on('end', () => {
    event.reply('ssh-state', { state: 'disconnected' });
    if (activeSshConn === conn) {
      activeSshConn = null;
      activeSshStream = null;
    }
  });

  // Attempt connection with parameters
  try {
    conn.connect({
      host: ip,
      port: 22,
      username: username,
      password: password,
      readyTimeout: 10000,
      keepaliveInterval: 5000
    });
  } catch (err) {
    event.reply('ssh-state', { state: 'error', error: err.message });
    if (activeSshConn === conn) {
      activeSshConn = null;
      activeSshStream = null;
    }
  }
});

// IPC: write input characters to active SSH shell stream
ipcMain.on('ssh-data', (event, data) => {
  if (activeSshStream) {
    activeSshStream.write(data);
  }
});

// IPC: resize remote shell window
ipcMain.on('ssh-resize', (event, { cols, rows }) => {
  if (activeSshStream) {
    activeSshStream.setWindow(rows, cols, 480, 640);
  }
});

// IPC: manual disconnect
ipcMain.on('ssh-disconnect', () => {
  if (activeSshConn) {
    activeSshConn.end();
    activeSshConn = null;
    activeSshStream = null;
  }
});

// IPC: window action controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});
ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});
