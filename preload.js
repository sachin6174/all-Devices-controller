const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Config loading & Version
  loadConfig: () => ipcRenderer.invoke('load-config'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

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

  // Multi-Session Keyed SSH Connection
  sshConnect: (sessionId, ip, osType, username, password) => {
    if (typeof sessionId === 'object') {
      ipcRenderer.send('ssh-connect', sessionId);
    } else {
      ipcRenderer.send('ssh-connect', { sessionId, ip, osType, username, password });
    }
  },
  sshDisconnect: (sessionId) => ipcRenderer.send('ssh-disconnect', { sessionId }),
  sshData: (sessionId, data) => {
    if (typeof sessionId === 'object') {
      ipcRenderer.send('ssh-data', sessionId);
    } else {
      ipcRenderer.send('ssh-data', { sessionId, data });
    }
  },
  sshResize: (sessionId, cols, rows) => {
    if (typeof sessionId === 'object') {
      ipcRenderer.send('ssh-resize', sessionId);
    } else {
      ipcRenderer.send('ssh-resize', { sessionId, cols, rows });
    }
  },
  
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
  androidTap:   (deviceX, deviceY) => ipcRenderer.invoke('android-tap', { deviceX, deviceY }),
  androidSwipe: (x1, y1, x2, y2, duration) => ipcRenderer.invoke('android-swipe', { x1, y1, x2, y2, duration }),
  androidKey:   (keycode)          => ipcRenderer.invoke('android-key', keycode),
  getAndroidInfo: ()              => ipcRenderer.invoke('get-android-info'),
  onAndroidFrame: (callback) => {
    const listener = (event, base64) => callback(base64);
    ipcRenderer.on('android-frame', listener);
    return () => ipcRenderer.removeListener('android-frame', listener);
  },
  onAndroidInputError: (callback) => {
    const listener = (event, msg) => callback(msg);
    ipcRenderer.on('android-input-error', listener);
    return () => ipcRenderer.removeListener('android-input-error', listener);
  },

  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow:    () => ipcRenderer.send('window-close')
});
