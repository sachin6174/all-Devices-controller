// Global State
let appConfig = null;
let currentTargetDevice = null;
let xtermInstance = null;
let fitAddonInstance = null;
let lastFoundCount = 0;

// Cleanup listeners hooks
let unsubscribeSshOutput = null;
let unsubscribeSshState = null;

// DOM Elements
const cfgLinuxUser = document.getElementById('cfg-linux-user');
const cfgLinuxPass = document.getElementById('cfg-linux-pass');
const cfgMacUser = document.getElementById('cfg-mac-user');
const cfgMacPass = document.getElementById('cfg-mac-pass');
const cfgWindowsUser = document.getElementById('cfg-windows-user');
const cfgWindowsPass = document.getElementById('cfg-windows-pass');
const githubTokenPill = document.getElementById('github-token-pill');

const btnScan = document.getElementById('btn-scan');
const subnetLabel = document.getElementById('subnet-label');
const blipContainer = document.getElementById('blip-container');
const progressContainer = document.getElementById('progress-container');
const progressText = document.getElementById('progress-text');
const currentIpText = document.getElementById('current-ip-text');
const progressFill = document.getElementById('progress-fill');

const statScanned = document.getElementById('stat-scanned');
const statActive = document.getElementById('stat-active');
const statSsh = document.getElementById('stat-ssh');
const devicesCount = document.getElementById('devices-count');
const devicesList = document.getElementById('devices-list');

const terminalPanel = document.getElementById('terminal-panel');
const welcomePanel = document.getElementById('welcome-panel');
const termHostTitle = document.getElementById('term-host-title');
const termHostSub = document.getElementById('term-host-sub');
const connectionSetup = document.getElementById('connection-setup');
const terminalBody = document.getElementById('terminal-body');
const terminalContainer = document.getElementById('terminal-container');
const btnLaunchSsh = document.getElementById('btn-launch-ssh');
const sshUserInput = document.getElementById('ssh-user-input');
const sshPassInput = document.getElementById('ssh-pass-input');
const btnDisconnectTerm = document.getElementById('btn-disconnect-term');
const btnClearTerm = document.getElementById('btn-clear-term');

const connStatusDot = document.querySelector('.connection-status-dot');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadAppConfig();
  setupScanHandlers();
  setupTerminalWorkspaceHandlers();
  setupCollapsibleHandlers();
  setupTabHandlers();
  setupUninstallerHandler();
  setupWebViewReloadHandlers();
  setupTitlebarHandlers();
  setupSidebarResizer();
  setupTerminalMaximizeHandler();
  setupRemoteDesktopSessionHandler();
  setupRdSidebarScraper();
});

// Load configuration
async function loadAppConfig() {
  try {
    appConfig = await window.api.loadConfig();
    const configJsonDisplay = document.getElementById('config-json-display');

    if (appConfig) {
      if (appConfig.ssh) {
        if (appConfig.ssh.linux && cfgLinuxUser && cfgLinuxPass) {
          cfgLinuxUser.textContent = appConfig.ssh.linux.username || '-';
          cfgLinuxPass.textContent = '••••';
        }
        if (appConfig.ssh.mac && cfgMacUser && cfgMacPass) {
          cfgMacUser.textContent = appConfig.ssh.mac.username || '-';
          cfgMacPass.textContent = '••••';
        }
        if (appConfig.ssh.windows && cfgWindowsUser && cfgWindowsPass) {
          cfgWindowsUser.textContent = appConfig.ssh.windows.username || '-';
          cfgWindowsPass.textContent = '••••';
        }
      }
      if (githubTokenPill) {
        if (appConfig.github_token) {
          githubTokenPill.textContent = 'Loaded';
          githubTokenPill.classList.add('active');
        } else {
          githubTokenPill.textContent = 'Missing';
          githubTokenPill.classList.remove('active');
        }
      }

      // Display raw JSON in the configuration tab
      if (configJsonDisplay) {
        configJsonDisplay.textContent = JSON.stringify(appConfig, null, 2);
        configJsonDisplay.style.color = ''; // reset color
      }
    } else {
      if (configJsonDisplay) {
        configJsonDisplay.textContent = JSON.stringify({
          "status": "error",
          "message": "Configuration file 'sachin-person.config' was not found.",
          "searched_directories": [
            "1. Installation directory (next to OmniShell.exe)",
            "2. User Home directory (C:\\Users\\sachi\\sachin-person.config)",
            "3. Local project workspace directory (for development)"
          ],
          "fix_action": "Please copy or create your 'sachin-person.config' file in any of the above paths, then reload the application."
        }, null, 2);
        configJsonDisplay.style.color = '#ef4444'; // Highlight in red
      }
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

// Setup network scanner handlers
function setupScanHandlers() {
  btnScan.addEventListener('click', () => {
    // Clear state
    blipContainer.innerHTML = '';
    progressFill.style.width = '0%';
    progressContainer.style.display = 'flex';
    document.querySelector('.radar-panel').classList.add('scanning');
    btnScan.disabled = true;
    btnScan.querySelector('.btn-text').textContent = 'Scanning...';

    // Start IPC Scan
    window.api.scanNetwork();
  });

  window.api.onScanStatus((data) => {
    if (data.status === 'starting') {
      subnetLabel.textContent = `Scanning Subnet: ${data.subnet} | Local IP: ${data.localIp}`;
      statScanned.textContent = '0';
      statActive.textContent = '0';
      statSsh.textContent = '0';
      lastFoundCount = 0;
    } else if (data.status === 'resolving') {
      subnetLabel.textContent = `Resolving hostnames and port details for ${data.activeCount} active devices...`;
    }
  });

  window.api.onScanProgress((data) => {
    const percent = Math.floor((data.completed / data.total) * 100);
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `Scanning: ${data.completed}/${data.total}`;
    currentIpText.textContent = `Active host found at: ${data.currentIp}`;

    statScanned.textContent = data.completed;

    // Plot a dynamic blip on the radar screen for each newly discovered device.
    // Must compare against the previous count BEFORE overwriting the stat text,
    // otherwise this check is always false (foundCount vs. itself).
    if (data.foundCount > lastFoundCount) {
      addRadarBlip(data.currentIp);
      lastFoundCount = data.foundCount;
    }

    statActive.textContent = data.foundCount;
  });

  window.api.onScanComplete((devices) => {
    btnScan.disabled = false;
    btnScan.querySelector('.btn-text').textContent = 'Scan Subnet';
    document.querySelector('.radar-panel').classList.remove('scanning');
    progressContainer.style.display = 'none';
    subnetLabel.textContent = 'Scan complete.';

    renderDevices(devices);
  });

  window.api.onScanError((errorMsg) => {
    btnScan.disabled = false;
    btnScan.querySelector('.btn-text').textContent = 'Scan Subnet';
    document.querySelector('.radar-panel').classList.remove('scanning');
    progressContainer.style.display = 'none';
    subnetLabel.textContent = `Error: ${errorMsg}`;
    alert(errorMsg);
  });
}

// Draw animated blip inside circular radar screen
function addRadarBlip(ip) {
  const blip = document.createElement('div');
  blip.className = 'radar-blip';

  // Calculate polar position centered on radar screen
  // Random radius between 10% and 90% from center, and random angle
  const angle = Math.random() * Math.PI * 2;
  const radius = 10 + Math.random() * 70; // percent

  const x = 50 + Math.cos(angle) * radius;
  const y = 50 + Math.sin(angle) * radius;

  blip.style.left = `${x}%`;
  blip.style.top = `${y}%`;
  blipContainer.appendChild(blip);
}

// Escape untrusted text before it is placed into innerHTML.
// Device names come from reverse-DNS/NetBIOS lookups on the local network,
// so a hostile device could otherwise inject HTML/script via its hostname.
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// Render dynamic discovered devices in the sidebar list
function renderDevices(devices) {
  devicesList.innerHTML = '';
  devicesCount.textContent = `${devices.length} Online`;

  // Count devices with SSH open
  const sshCount = devices.filter(d => d.sshOpen).length;
  statSsh.textContent = sshCount;

  if (devices.length === 0) {
    devicesList.innerHTML = `
      <div class="empty-state-side">
        <span>No hosts found</span>
      </div>
    `;
    return;
  }

  devices.forEach(device => {
    const row = document.createElement('div');
    row.className = `device-list-item ${device.os} ${device.sshOpen ? 'ssh-open' : 'ssh-closed'} ${device.isLocal ? 'local-host' : ''}`;
    row.dataset.ip = device.ip;

    let osIcon = '❓';
    if (device.os === 'linux') osIcon = '🐧';
    else if (device.os === 'mac') osIcon = '🍏';
    else if (device.os === 'windows') osIcon = '🪟';

    row.innerHTML = `
      <div class="device-icon-side" title="${device.os.toUpperCase()}">${osIcon}</div>
      <div class="device-details-side">
        <span class="device-name-side">${escapeHtml(device.name)}</span>
        <span class="device-ip-side">${escapeHtml(device.ip)}</span>
      </div>
      <span class="status-dot-side"></span>
    `;

    // Click to connect directly
    if (device.sshOpen) {
      row.addEventListener('click', () => {
        // Highlight selection
        document.querySelectorAll('.device-list-item').forEach(item => item.classList.remove('selected'));
        row.classList.add('selected');

        connectDeviceInstantly(device);
      });
    }

    devicesList.appendChild(row);
  });
}

// Global state for tracking active connection
let sshConnected = false;

// Automatically connect using profile credentials on click
function connectDeviceInstantly(device) {
  // If already connected to this device, keep terminal active and focus it
  if (sshConnected && currentTargetDevice && currentTargetDevice.ip === device.ip) {
    if (xtermInstance) {
      xtermInstance.focus();
    }
    return;
  }

  currentTargetDevice = device;

  // Toggle visible workspace panels
  welcomePanel.style.display = 'none';
  terminalPanel.style.display = 'flex';

  // Auto-collapse radar panel to maximize terminal workspace height
  const radarPanel = document.getElementById('radar-panel');
  if (radarPanel) {
    radarPanel.classList.add('collapsed');
  }

  termHostTitle.textContent = `Remote Control Session: ${device.name}`;
  termHostSub.textContent = `Pre-authenticating to ${device.ip} (OS: ${device.os.toUpperCase()})`;

  // Lookup profile credentials from loaded config
  let defaultUser = '';
  let defaultPass = '';

  if (appConfig && appConfig.ssh) {
    const credProfile = appConfig.ssh[device.os];
    if (credProfile) {
      defaultUser = credProfile.username || '';
      defaultPass = credProfile.pass || '';
    }
  }

  // Auto-connect if profile loaded
  if (defaultUser && defaultPass) {
    connectionSetup.style.display = 'none';
    startSshSession(device.ip, device.os, defaultUser, defaultPass);
  } else {
    // Show credentials override form in terminal area
    sshUserInput.value = defaultUser;
    sshPassInput.value = defaultPass;
    connectionSetup.style.display = 'flex';

    btnLaunchSsh.onclick = () => {
      connectionSetup.style.display = 'none';
      startSshSession(device.ip, device.os, sshUserInput.value, sshPassInput.value);
    };
  }
}

function startSshSession(ip, osType, username, password) {
  // Reset previous instances
  destroyTerminalInstance();

  // Create terminal
  xtermInstance = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: varString('--font-mono'),
    theme: {
      background: '#0c0a18',
      foreground: '#d2cde6',
      cursor: '#8b5cf6',
      black: '#19152b',
      red: '#ef4444',
      green: '#10b981',
      yellow: '#f59e0b',
      blue: '#3b82f6',
      magenta: '#8b5cf6',
      cyan: '#06b6d4',
      white: '#ece9f2'
    }
  });

  fitAddonInstance = new FitAddon.FitAddon();
  xtermInstance.loadAddon(fitAddonInstance);
  xtermInstance.open(terminalContainer);

  // Auto-copy highlighted text in the terminal to clipboard
  xtermInstance.onSelectionChange(() => {
    const selection = xtermInstance.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection);
    }
  });

  // Fit on load
  setTimeout(() => {
    if (fitAddonInstance) {
      fitAddonInstance.fit();
      const dims = fitAddonInstance.proposeDimensions();
      if (dims) {
        window.api.sshResize(dims.cols, dims.rows);
      }
    }
  }, 100);

  // Pipe terminal input to IPC backend
  xtermInstance.onData((chunk) => {
    window.api.sshData(chunk);
  });

  // Listen to terminal output from main process
  unsubscribeSshOutput = window.api.onSshOutput((data) => {
    if (xtermInstance) {
      xtermInstance.write(data);
    }
  });

  // Listen to session state changes
  unsubscribeSshState = window.api.onSshState((data) => {
    if (data.state === 'connecting') {
      connStatusDot.className = 'connection-status-dot connecting';
      termHostSub.textContent = `Connecting to ${ip} as ${username}...`;
      sshConnected = false;
    } else if (data.state === 'connected') {
      connStatusDot.className = 'connection-status-dot active';
      termHostSub.textContent = `Connected to ${ip} as ${username}`;
      xtermInstance.writeln('\x1b[1;36m[System] SSH Terminal Established. Ready to execute.\x1b[0m\r\n');
      xtermInstance.focus();
      sshConnected = true;
    } else if (data.state === 'disconnected') {
      connStatusDot.className = 'connection-status-dot';
      termHostSub.textContent = 'Disconnected';
      sshConnected = false;
      if (xtermInstance) {
        xtermInstance.writeln('\r\n\x1b[1;31m[System] Session Terminated by host or client.\x1b[0m');
      }
    } else if (data.state === 'error') {
      connStatusDot.className = 'connection-status-dot';
      termHostSub.textContent = `Error: ${data.error}`;
      sshConnected = false;
      if (xtermInstance) {
        xtermInstance.writeln(`\r\n\x1b[1;31m[System Error] ${data.error}\x1b[0m`);
      }
    }
  });

  // Launch connection
  window.api.sshConnect(ip, osType, username, password);
}

function destroyTerminalInstance() {
  if (unsubscribeSshOutput) { unsubscribeSshOutput(); unsubscribeSshOutput = null; }
  if (unsubscribeSshState) { unsubscribeSshState(); unsubscribeSshState = null; }

  if (xtermInstance) {
    xtermInstance.dispose();
    xtermInstance = null;
  }
  fitAddonInstance = null;
  terminalContainer.innerHTML = '';
}

function setupTerminalWorkspaceHandlers() {
  btnDisconnectTerm.addEventListener('click', () => {
    window.api.sshDisconnect();
    destroyTerminalInstance();
    sshConnected = false;

    // Hide terminal and show welcome screen
    terminalPanel.style.display = 'none';
    welcomePanel.style.display = 'flex';

    // Auto-expand radar panel back to standard layout
    const radarPanel = document.getElementById('radar-panel');
    if (radarPanel) {
      radarPanel.classList.remove('collapsed');
    }

    // Deselect list items
    document.querySelectorAll('.device-list-item').forEach(item => item.classList.remove('selected'));
  });

  // Focus terminal when clicking inside the black container body
  terminalBody.addEventListener('click', () => {
    if (xtermInstance) {
      xtermInstance.focus();
    }
  });

  btnClearTerm.addEventListener('click', () => {
    if (xtermInstance) {
      xtermInstance.clear();
      xtermInstance.focus();
    }
  });

  // Right-click inside the terminal to paste clipboard text
  terminalContainer.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    if (!xtermInstance) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        window.api.sshData(text);
      }
    } catch (err) {
      console.error('Failed to paste to terminal:', err);
    }
  });

  // Auto-resize on window resize event
  window.addEventListener('resize', () => {
    if (xtermInstance && fitAddonInstance && terminalPanel.style.display !== 'none') {
      fitAddonInstance.fit();
      const dims = fitAddonInstance.proposeDimensions();
      if (dims) {
        window.api.sshResize(dims.cols, dims.rows);
      }
    }
  });
}

// Helper: read CSS Variable values
function varString(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

// Setup expand/collapse handlers for sidebar and cards
function setupCollapsibleHandlers() {
  const sidebar = document.getElementById('sidebar');

  // Credential Cards Toggle
  const credCards = document.querySelectorAll('.cred-card.expandable');
  credCards.forEach(card => {
    const header = card.querySelector('.cred-card-header');
    if (header) {
      header.addEventListener('click', () => {
        // Prevent collapsing if sidebar is collapsed
        if (sidebar && sidebar.classList.contains('collapsed')) return;

        card.classList.toggle('collapsed');
      });
    }
  });

  // Radar Scan Panel Toggle
  const radarPanel = document.getElementById('radar-panel');
  const radarTitleGroup = document.getElementById('radar-title-group');
  if (radarTitleGroup && radarPanel) {
    radarTitleGroup.addEventListener('click', () => {
      radarPanel.classList.toggle('collapsed');

      // Trigger terminal resize since the container height changes
      setTimeout(() => {
        if (xtermInstance && fitAddonInstance && terminalPanel.style.display !== 'none') {
          fitAddonInstance.fit();
          const dims = fitAddonInstance.proposeDimensions();
          if (dims) {
            window.api.sshResize(dims.cols, dims.rows);
          }
        }
      }, 310); // Wait for transition (300ms) to complete
    });
  }
}

// Workspace Tab Navigation handler
function setupTabHandlers() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabTarget = btn.dataset.tab;

      // 1. Highlight active button
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 2. Display corresponding content
      tabContents.forEach(content => {
        if (content.id === `tab-content-${tabTarget}`) {
          content.style.display = 'flex';
          content.classList.add('active');
        } else {
          content.style.display = 'none';
          content.classList.remove('active');
        }
      });

      // 3. Auto-fit terminal if switching back to console and terminal is active
      if (tabTarget === 'console' && xtermInstance && fitAddonInstance && terminalPanel.style.display !== 'none') {
        setTimeout(() => {
          fitAddonInstance.fit();
          const dims = fitAddonInstance.proposeDimensions();
          if (dims) {
            window.api.sshResize(dims.cols, dims.rows);
          }
        }, 100);
      }
    });
  });
}

// Uninstaller trigger handler
function setupUninstallerHandler() {
  const btnUninstallApp = document.getElementById('btn-uninstall-app');
  if (btnUninstallApp) {
    btnUninstallApp.addEventListener('click', async () => {
      const confirmUninstall = confirm('Are you sure you want to completely uninstall OmniShell from your system?');
      if (confirmUninstall) {
        const launched = await window.api.launchUninstaller();
        if (!launched) {
          alert('Uninstaller not found. (Note: The uninstaller is only available after installing the packaged app, not in development mode).');
        }
      }
    });
  }
}

// WebView Reload event handler
function setupWebViewReloadHandlers() {
  const reloadButtons = document.querySelectorAll('.btn-reload-webview');
  reloadButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const wvId = btn.dataset.webviewId;
      const webview = document.getElementById(wvId);
      if (webview) {
        webview.reload();

        // Force layout repaint/reflow to prevent the WebView from going blank or shrinking
        const origDisplay = webview.style.display;
        webview.style.display = 'none';
        webview.offsetHeight; // Forces a Blink reflow
        setTimeout(() => {
          webview.style.display = origDisplay || '';
        }, 50);
      }
    });
  });
}

// Window Titlebar action buttons handler
function setupTitlebarHandlers() {
  const btnMin = document.getElementById('btn-minimize');
  const btnMax = document.getElementById('btn-maximize');
  const btnClose = document.getElementById('btn-close');

  if (btnMin) btnMin.addEventListener('click', () => window.api.minimizeWindow());
  if (btnMax) btnMax.addEventListener('click', () => window.api.maximizeWindow());
  if (btnClose) btnClose.addEventListener('click', () => window.api.closeWindow());
}

// Drag & click sidebar layout resizer handler
function setupSidebarResizer() {
  const sidebar = document.getElementById('sidebar');
  const resizer = document.getElementById('sidebar-resizer');

  if (!sidebar || !resizer) return;

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault(); // Prevent text highlight
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX;
    let newWidth = startWidth + deltaX;

    if (newWidth < 80) {
      newWidth = 60;
      sidebar.classList.add('collapsed');
    } else {
      if (newWidth > 450) newWidth = 450;
      sidebar.classList.remove('collapsed');
      sidebar.style.width = `${newWidth}px`;
    }

    // Fit terminal immediately during drag
    if (xtermInstance && fitAddonInstance && terminalPanel.style.display !== 'none') {
      fitAddonInstance.fit();
      const dims = fitAddonInstance.proposeDimensions();
      if (dims) {
        window.api.sshResize(dims.cols, dims.rows);
      }
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // If clientX movement is extremely small, treat as a toggle click
    const deltaX = Math.abs(e.clientX - startX);
    if (deltaX < 4) {
      const isCollapsed = sidebar.classList.contains('collapsed');
      if (isCollapsed) {
        sidebar.classList.remove('collapsed');
        sidebar.style.width = '280px';
      } else {
        sidebar.classList.add('collapsed');
        sidebar.style.width = '';
      }

      // Fit terminal after CSS transition finishes
      setTimeout(() => {
        if (xtermInstance && fitAddonInstance && terminalPanel.style.display !== 'none') {
          fitAddonInstance.fit();
          const dims = fitAddonInstance.proposeDimensions();
          if (dims) {
            window.api.sshResize(dims.cols, dims.rows);
          }
        }
      }, 310);
    }
  });
}

// Terminal Fullscreen height toggle handler
function setupTerminalMaximizeHandler() {
  const btnMaximizeTerm = document.getElementById('btn-maximize-term');
  if (btnMaximizeTerm) {
    btnMaximizeTerm.addEventListener('click', () => {
      const radarPanel = document.getElementById('radar-panel');
      if (radarPanel) {
        const isCollapsed = radarPanel.classList.contains('collapsed');
        if (isCollapsed) {
          radarPanel.classList.remove('collapsed');
          btnMaximizeTerm.textContent = 'Expand View';
        } else {
          radarPanel.classList.add('collapsed');
          btnMaximizeTerm.textContent = 'Restore View';
        }

        // Fit terminal after layout transition completes
        setTimeout(() => {
          if (xtermInstance && fitAddonInstance && terminalPanel.style.display !== 'none') {
            fitAddonInstance.fit();
            const dims = fitAddonInstance.proposeDimensions();
            if (dims) {
              window.api.sshResize(dims.cols, dims.rows);
            }
          }
        }, 310);
      }
    });
  }
}

// Remote Desktop session list click handler + Android embedded mirror
function setupRemoteDesktopSessionHandler() {
  const sessionItems = document.querySelectorAll('.rd-session-item:not(.rd-android-item)');
  const androidBtn = document.getElementById('btn-launch-android-scrcpy');
  const stopBtn = document.getElementById('btn-stop-android-mirror');
  const webviewWrap = document.getElementById('rd-webview-wrapper');
  const mirrorPanel = document.getElementById('android-mirror-panel');
  const webview = document.getElementById('wv-remote-desktop');
  const screenImg = document.getElementById('android-screen-img');
  const connectState = document.getElementById('android-connecting-state');
  const deviceLabel = document.getElementById('android-device-label');

  let androidDeviceInfo = null;   // { width, height } of device screen
  let frameUnsubscribe = null;   // cleanup fn for android-frame listener

  // ── Show webview panel, hide mirror ──────────────────────────────────────
  function showWebview() {
    if (webviewWrap) webviewWrap.style.display = 'flex';
    if (mirrorPanel) mirrorPanel.style.display = 'none';
  }

  // ── Show mirror panel, hide webview ──────────────────────────────────────
  async function showMirror() {
    if (webviewWrap) webviewWrap.style.display = 'none';
    if (mirrorPanel) mirrorPanel.style.display = 'flex';
    if (screenImg) { screenImg.style.display = 'none'; screenImg.src = ''; }
    if (connectState) connectState.style.display = 'block';
    if (deviceLabel) deviceLabel.textContent = 'Connecting to device...';

    // Get device resolution for coordinate scaling
    androidDeviceInfo = await window.api.getAndroidInfo();
    if (androidDeviceInfo && deviceLabel) {
      deviceLabel.textContent = `${androidDeviceInfo.width} × ${androidDeviceInfo.height} · ADB`;
    } else if (deviceLabel) {
      deviceLabel.textContent = 'Device found — streaming...';
    }

    // Subscribe to frame pushes
    if (frameUnsubscribe) frameUnsubscribe();
    frameUnsubscribe = window.api.onAndroidFrame(base64 => {
      const src = `data:image/png;base64,${base64}`;
      if (screenImg) {
        screenImg.src = src;
        if (screenImg.style.display === 'none') {
          screenImg.style.display = 'block';
          if (connectState) connectState.style.display = 'none';
        }
      }
    });

    // Start frame capture loop
    window.api.startAndroidMirror();
  }

  // ── Stop mirror and go back to webview ───────────────────────────────────
  async function stopMirror() {
    await window.api.stopAndroidMirror();
    if (frameUnsubscribe) { frameUnsubscribe(); frameUnsubscribe = null; }
    if (screenImg) { screenImg.src = ''; screenImg.style.display = 'none'; }
    showWebview();
    sessionItems.forEach(s => s.classList.remove('selected'));
    if (sessionItems[0]) sessionItems[0].classList.add('selected');
  }

  // ── WebView-based sessions ────────────────────────────────────────────────
  if (sessionItems[0]) sessionItems[0].classList.add('selected');
  showWebview();

  sessionItems.forEach(item => {
    item.addEventListener('click', async () => {
      // If mirror is active, stop it first
      if (mirrorPanel && mirrorPanel.style.display !== 'none') {
        await window.api.stopAndroidMirror();
        if (frameUnsubscribe) { frameUnsubscribe(); frameUnsubscribe = null; }
      }
      sessionItems.forEach(s => s.classList.remove('selected'));
      androidBtn && androidBtn.classList.remove('selected');
      item.classList.add('selected');
      showWebview();

      const url = item.dataset.url;
      if (url && webview) {
        webview.src = url;
        webviewWrap.style.display = 'none';
        webview.offsetHeight;
        setTimeout(() => { webviewWrap.style.display = 'flex'; }, 50);
      }
    });
  });

  // ── Android card ──────────────────────────────────────────────────────────
  if (androidBtn) {
    androidBtn.addEventListener('click', async () => {
      sessionItems.forEach(s => s.classList.remove('selected'));
      androidBtn.classList.add('selected');
      await showMirror();
    });
  }

  // ── Stop button ───────────────────────────────────────────────────────────
  if (stopBtn) {
    stopBtn.addEventListener('click', () => stopMirror());
  }

  // ── Android key buttons ───────────────────────────────────────────────────
  document.querySelectorAll('.android-key-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (key) window.api.androidKey(parseInt(key));
    });
  });

  // ── Click-to-tap on screen image ─────────────────────────────────────────
  if (screenImg) {
    screenImg.addEventListener('click', e => {
      if (!androidDeviceInfo) return;
      const rect = screenImg.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      const relY = (e.clientY - rect.top) / rect.height;
      const deviceX = relX * androidDeviceInfo.width;
      const deviceY = relY * androidDeviceInfo.height;
      window.api.androidTap(deviceX, deviceY);
    });
  }
}


