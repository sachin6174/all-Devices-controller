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

// Persistent SSH terminal drawer (outside tab system)
const sshTerminalDrawer = document.getElementById('ssh-terminal-drawer');
const terminalPanel    = sshTerminalDrawer; // alias for legacy code
const welcomePanel     = null;              // removed — no longer needed
const termHostTitle    = document.getElementById('term-host-title');
const termHostSub      = document.getElementById('term-host-sub');
const connectionSetup  = document.getElementById('connection-setup');
const terminalBody     = document.getElementById('terminal-body');
const terminalContainer = document.getElementById('terminal-container');
const btnLaunchSsh     = document.getElementById('btn-launch-ssh');
const sshUserInput     = document.getElementById('ssh-user-input');
const sshPassInput     = document.getElementById('ssh-pass-input');
const btnDisconnectTerm = document.getElementById('btn-disconnect-term');
const btnClearTerm     = document.getElementById('btn-clear-term');

const connStatusDot = document.getElementById('conn-status-dot-drawer');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadAppConfig();
  setupScanHandlers();
  setupSidebarScanBtn();
  setupTerminalWorkspaceHandlers();
  setupSshDrawerResize();
  setupCollapsibleHandlers();
  setupTabHandlers();
  setupUninstallerHandler();
  setupWebViewReloadHandlers();
  setupTitlebarHandlers();
  setupSidebarResizer();
  setupTerminalMaximizeHandler();
  setupRemoteDesktopSessionHandler();
  setupRdSidebarScraper();
  setupRouterAutoLogin();

  // Auto-scan on first launch
  setTimeout(() => {
    const scanBtn = document.getElementById('btn-scan-sidebar');
    if (scanBtn && !scanBtn.disabled) scanBtn.click();
  }, 800);
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

  // Show persistent SSH terminal drawer at bottom
  if (sshTerminalDrawer) {
    sshTerminalDrawer.style.display = 'flex';
    // Add bottom padding to main so content isn't hidden under drawer
    const main = document.querySelector('.main-content');
    if (main) main.style.paddingBottom = (sshTerminalDrawer.offsetHeight || 320) + 'px';
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
    currentTargetDevice = null;

    // Hide the persistent drawer
    if (sshTerminalDrawer) sshTerminalDrawer.style.display = 'none';
    const main = document.querySelector('.main-content');
    if (main) main.style.paddingBottom = '';

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

// Helper to activate a tab programmatically
function activateTab(tabName) {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  tabButtons.forEach(b => {
    if (b.dataset.tab === tabName) b.classList.add('active');
    else b.classList.remove('active');
  });
  tabContents.forEach(c => {
    if (c.id === `tab-content-${tabName}`) {
      c.style.display = 'flex';
      c.classList.add('active');
    } else {
      c.style.display = 'none';
      c.classList.remove('active');
    }
  });
}

// Global reference for mirror control
let stopMirrorGlobal = null;

// Remote Desktop session list click handler + Android embedded mirror
function setupRemoteDesktopSessionHandler() {
  const androidBtn   = document.getElementById('sidebar-android-card');
  const stopBtn      = document.getElementById('btn-stop-android-mirror');
  const webviewWrap  = document.getElementById('rd-webview-wrapper');
  const mirrorPanel  = document.getElementById('android-mirror-panel');
  const webview      = document.getElementById('wv-remote-desktop');
  const screenImg    = document.getElementById('android-screen-img');
  const connectState = document.getElementById('android-connecting-state');
  const deviceLabel  = document.getElementById('android-device-label');

  let androidDeviceInfo = null;   // { width, height } of device screen
  let frameUnsubscribe  = null;   // cleanup fn for android-frame listener

  // ── Show webview panel, hide mirror ──────────────────────────────────────
  function showWebview() {
    if (webviewWrap) webviewWrap.style.display = 'flex';
    if (mirrorPanel) mirrorPanel.style.display = 'none';
  }

  // ── Show mirror panel, hide webview ──────────────────────────────────────
  async function showMirror() {
    activateTab('remote-desktop');
    if (webviewWrap) webviewWrap.style.display = 'none';
    if (mirrorPanel) mirrorPanel.style.display = 'flex';
    if (screenImg)   { screenImg.style.display = 'none'; screenImg.src = ''; }
    if (connectState) connectState.style.display = 'block';
    if (deviceLabel)  deviceLabel.textContent = 'Connecting to device...';

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
  }
  stopMirrorGlobal = stopMirror;

  // ── Left Sidebar Android Card Click ──────────────────────────────────────
  if (androidBtn) {
    androidBtn.addEventListener('click', async () => {
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
      const relX = (e.clientX - rect.left)  / rect.width;
      const relY = (e.clientY - rect.top)   / rect.height;
      const deviceX = relX * androidDeviceInfo.width;
      const deviceY = relY * androidDeviceInfo.height;
      window.api.androidTap(deviceX, deviceY);
    });
  }
}

// ── Default Known Remote Desktop Sessions (rendered immediately on boot) ──────
const INITIAL_RD_SESSIONS = [
  { name: 'SACHIN-ART-MACINTOSH', sessionId: '8b87e43d-67c5-4867-83d8-e08dad50b049' },
  { name: 'SACHIN-ART-LINUX',     sessionId: '3cbd335a-73e9-ca99-2208-f6ce757df023' },
  { name: 'SACHIN-ART-WINDOWS',   sessionId: 'a228a061-18b5-0971-aadb-108c81833c49' }
];

// ── Chrome Remote Desktop session scraper (Deep Shadow DOM aware) ────────────
const RD_SCRAPE_SCRIPT = `
(function() {
  try {
    const knownMap = [
      { key: 'MACINTOSH', name: 'SACHIN-ART-MACINTOSH', sessionId: '8b87e43d-67c5-4867-83d8-e08dad50b049' },
      { key: 'LINUX',     name: 'SACHIN-ART-LINUX',     sessionId: '3cbd335a-73e9-ca99-2208-f6ce757df023' },
      { key: 'WINDOWS',   name: 'SACHIN-ART-WINDOWS',   sessionId: 'a228a061-18b5-0971-aadb-108c81833c49' }
    ];

    // Only scrape if on the access listing page
    if (!location.href.includes('/access') || location.href.includes('/access/session/')) {
      return JSON.stringify([]);
    }

    const results = [];
    const allElements = [];
    const queue = [document.body || document.documentElement];
    let count = 0;

    while (queue.length > 0 && count < 600) {
      const node = queue.shift();
      if (!node) continue;
      count++;
      allElements.push(node);
      if (node.children) {
        for (let i = 0; i < node.children.length; i++) {
          const child = node.children[i];
          queue.push(child);
          if (child.shadowRoot) queue.push(child.shadowRoot);
        }
      }
    }

    // Direct href session ID check
    allElements.forEach(el => {
      try {
        const href = el.href || el.getAttribute?.('href') || '';
        const m = href.match(/\\/access\\/session\\/([^/?#]+)/);
        if (m) {
          const sessionId = m[1];
          if (!results.some(r => r.sessionId === sessionId)) {
            const matchedKnown = knownMap.find(k => k.sessionId === sessionId);
            const name = matchedKnown ? matchedKnown.name : ((el.innerText || el.textContent || '').trim().split('\\n')[0].slice(0, 60) || 'Remote Host');
            results.push({ name, sessionId });
          }
        }
      } catch(e) {}
    });

    // Known hosts check
    knownMap.forEach(item => {
      if (!results.some(r => r.sessionId === item.sessionId)) {
        const found = allElements.some(el => {
          try {
            const text = (el.innerText || el.textContent || '').toUpperCase();
            return text.includes(item.key) && (text.includes('ONLINE') || text.includes('SACHIN'));
          } catch(e) { return false; }
        });
        if (found) {
          results.push({ name: item.name, sessionId: item.sessionId });
        }
      }
    });

    return JSON.stringify(results.length > 0 ? results : knownMap);
  } catch(e) {
    return JSON.stringify([]);
  }
})()
`;

function guessOsIcon(name) {
  const n = name.toLowerCase();
  if (n.includes('mac') || n.includes('apple') || n.includes('osx')) return '🍏';
  if (n.includes('linux') || n.includes('ubuntu') || n.includes('debian') || n.includes('arch')) return '🐧';
  if (n.includes('win') || n.includes('pc')) return '🪟';
  if (n.includes('android')) return '📱';
  if (n.includes('chrome')) return '💻';
  return '🖥️';
}

function renderRdSidebarSessions(sessions) {
  const sidebarList = document.getElementById('rd-sessions-sidebar-list');
  const webview = document.getElementById('wv-remote-desktop');
  const webviewWrap = document.getElementById('rd-webview-wrapper');
  const mirrorPanel = document.getElementById('android-mirror-panel');

  if (!sidebarList) return;

  const displaySessions = (sessions && sessions.length > 0) ? sessions : INITIAL_RD_SESSIONS;

  sidebarList.innerHTML = '';
  displaySessions.forEach(s => {
    const icon = guessOsIcon(s.name);
    const card = document.createElement('div');
    card.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:7px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);cursor:pointer;transition:all 0.18s;';
    card.innerHTML = `
      <span style="font-size:13px;flex-shrink:0;">${icon}</span>
      <div style="overflow:hidden;min-width:0;flex:1;">
        <div style="font-size:10px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.name}</div>
        <div style="font-size:8px;color:var(--text-muted);font-family:var(--font-mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.sessionId.slice(0,16)}</div>
      </div>`;

    card.addEventListener('mouseenter', () => { card.style.background = 'rgba(139,92,246,0.08)'; card.style.borderColor = 'rgba(139,92,246,0.25)'; });
    card.addEventListener('mouseleave', () => { card.style.background = 'rgba(255,255,255,0.02)'; card.style.borderColor = 'rgba(255,255,255,0.04)'; });

    card.addEventListener('click', async () => {
      activateTab('remote-desktop');
      if (stopMirrorGlobal) await stopMirrorGlobal();
      if (mirrorPanel) mirrorPanel.style.display = 'none';
      if (webviewWrap) webviewWrap.style.display = 'flex';
      if (webview) {
        webview.src = `https://remotedesktop.google.com/access/session/${s.sessionId}`;
      }
    });

    sidebarList.appendChild(card);
  });
}

function setupRdSidebarScraper() {
  const webview    = document.getElementById('wv-remote-desktop');
  const refreshBtn = document.getElementById('btn-refresh-rd-sessions');

  // Render initial default sessions immediately on boot
  renderRdSidebarSessions(INITIAL_RD_SESSIONS);

  if (!webview) return;

  async function scrape() {
    if (refreshBtn) { refreshBtn.style.opacity = '0.4'; refreshBtn.disabled = true; }
    let scraped = [];
    try {
      const json = await webview.executeJavaScript(RD_SCRAPE_SCRIPT);
      scraped = JSON.parse(json) || [];
    } catch (e) {
      scraped = [];
    }
    if (refreshBtn) { refreshBtn.style.opacity = ''; refreshBtn.disabled = false; }
    if (scraped.length > 0) {
      renderRdSidebarSessions(scraped);
    }
  }

  webview.addEventListener('dom-ready', () => {
    setTimeout(scrape, 2000);
    setTimeout(scrape, 5000);
  });

  if (refreshBtn) refreshBtn.addEventListener('click', scrape);
}

// ── Sidebar Scan Button ──────────────────────────────────────────────────────
function setupSidebarScanBtn() {
  const btn      = document.getElementById('btn-scan-sidebar');
  const iconEl   = document.getElementById('scan-sidebar-icon');
  const progress = document.getElementById('scan-sidebar-progress');
  const bar      = document.getElementById('scan-sidebar-bar');
  const txt      = document.getElementById('scan-sidebar-txt');

  if (!btn) return;

  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    blipContainer && (blipContainer.innerHTML = '');
    progressFill && (progressFill.style.width = '0%');
    btn.disabled = true;
    if (iconEl) iconEl.textContent = '⏳';
    if (progress) { progress.style.display = 'block'; bar.style.width = '0%'; txt.textContent = 'Scanning...'; }
    window.api.scanNetwork();
  });

  // Mirror progress into sidebar bar
  window.api.onScanProgress((data) => {
    const pct = Math.floor((data.completed / data.total) * 100);
    if (bar) bar.style.width = `${pct}%`;
    if (txt) txt.textContent = `${data.completed} / ${data.total}`;
  });

  const onDone = () => {
    btn.disabled = false;
    if (iconEl) iconEl.textContent = '⟳';
    if (progress) progress.style.display = 'none';
  };
  window.api.onScanComplete(onDone);
  window.api.onScanError(onDone);
}

// ── SSH Drawer Drag-to-Resize ────────────────────────────────────────────────
function setupSshDrawerResize() {
  const drawer  = document.getElementById('ssh-terminal-drawer');
  const resizer = document.getElementById('ssh-drawer-resizer');
  const main    = document.querySelector('.main-content');
  if (!drawer || !resizer) return;

  let dragging = false, startY = 0, startH = 0;

  resizer.addEventListener('mousedown', e => {
    dragging = true; startY = e.clientY; startH = drawer.offsetHeight;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newH = Math.max(120, Math.min(window.innerHeight * 0.85, startH + (startY - e.clientY)));
    drawer.style.height = `${newH}px`;
    if (main) main.style.paddingBottom = `${newH}px`;
    if (fitAddonInstance) {
      fitAddonInstance.fit();
      const dims = fitAddonInstance.proposeDimensions();
      if (dims) window.api.sshResize(dims.cols, dims.rows);
    }
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  });
}

// ── Router Gateway Auto-Login handler (http://192.168.1.1/) ──────────────────
function setupRouterAutoLogin() {
  const webview = document.getElementById('wv-router-portal');
  if (!webview) return;

  const doAutoLogin = async () => {
    if (!appConfig || !appConfig.router) return;
    const { username, password } = appConfig.router;
    if (!username || !password) return;

    const script = `
    (function() {
      const u = ${JSON.stringify(username)};
      const p = ${JSON.stringify(password)};

      function attemptFill() {
        const userInput = document.querySelector('input[name*="user" i], input[id*="user" i], input[name*="login" i], input[type="text"], input[name="username"]');
        const passInput = document.querySelector('input[type="password"], input[name*="pass" i], input[id*="pass" i]');

        if (userInput && passInput) {
          userInput.value = u;
          passInput.value = p;
          userInput.dispatchEvent(new Event('input', { bubbles: true }));
          userInput.dispatchEvent(new Event('change', { bubbles: true }));
          passInput.dispatchEvent(new Event('input', { bubbles: true }));
          passInput.dispatchEvent(new Event('change', { bubbles: true }));

          setTimeout(() => {
            const submitBtn = document.querySelector('button[type="submit"], input[type="submit"], button[id*="login" i], input[id*="login" i], .login-btn, #btnLogin, #btn_login, #loginBtn, button');
            if (submitBtn) submitBtn.click();
            else if (userInput.form) userInput.form.submit();
          }, 350);
          return true;
        }
        return false;
      }

      if (!attemptFill()) {
        setTimeout(attemptFill, 1000);
      }
    })()
    `;

    try {
      await webview.executeJavaScript(script);
    } catch(e) {}
  };

  webview.addEventListener('dom-ready', () => {
    setTimeout(doAutoLogin, 600);
  });
}
