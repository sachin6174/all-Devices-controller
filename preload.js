const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Config loading
  loadConfig: () => ipcRenderer.invoke('load-config'),

  // Network Scanning
  scanNetwork: () => ipcRenderer.send('scan-network'),
  onScanStatus: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('scan-status', listener);
    return () => ipcRenderer.removeListener('scan-status', listener);
  },
  onScanProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('scan-progress', listener);
    return () => ipcRenderer.removeListener('scan-progress', listener);
  },
  onScanComplete: (callback) => {
    const listener = (event, devices) => callback(devices);
    ipcRenderer.on('scan-complete', listener);
    return () => ipcRenderer.removeListener('scan-complete', listener);
  },
  onScanError: (callback) => {
    const listener = (event, errorMsg) => callback(errorMsg);
    ipcRenderer.on('scan-error', listener);
    return () => ipcRenderer.removeListener('scan-error', listener);
  },

  // SSH Connection
  sshConnect: (ip, osType, username, password) => {
    ipcRenderer.send('ssh-connect', { ip, osType, username, password });
  },
  sshDisconnect: () => ipcRenderer.send('ssh-disconnect'),
  sshData: (data) => ipcRenderer.send('ssh-data', data),
  sshResize: (cols, rows) => ipcRenderer.send('ssh-resize', { cols, rows }),
  
  onSshState: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('ssh-state', listener);
    return () => ipcRenderer.removeListener('ssh-state', listener);
  },
  onSshOutput: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('ssh-output', listener);
    return () => ipcRenderer.removeListener('ssh-output', listener);
  },
  launchUninstaller: () => ipcRenderer.invoke('launch-uninstaller'),

  // Android embedded mirror
  startAndroidMirror: () => ipcRenderer.invoke('start-android-mirror'),
  stopAndroidMirror:  () => ipcRenderer.invoke('stop-android-mirror'),
  androidTap:  (deviceX, deviceY) => ipcRenderer.invoke('android-tap', { deviceX, deviceY }),
  androidKey:  (keycode)          => ipcRenderer.invoke('android-key', keycode),
  getAndroidInfo: ()              => ipcRenderer.invoke('get-android-info'),
  onAndroidFrame: (callback) => {
    const listener = (event, base64) => callback(base64);
    ipcRenderer.on('android-frame', listener);
    return () => ipcRenderer.removeListener('android-frame', listener);
  },

  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow:    () => ipcRenderer.send('window-close')
});
