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

  // Platform Detection for Native Styling (macOS, Windows, Linux)
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('mac')) {
    document.body.classList.add('platform-mac');
  } else if (userAgent.includes('linux')) {
    document.body.classList.add('platform-linux');
  } else {
    document.body.classList.add('platform-windows');
  }

  // Display App Version in Top Titlebar
  if (window.api && window.api.getAppVersion) {
    window.api.getAppVersion().then(ver => {
      const verEl = document.getElementById('app-version-display');
      if (verEl && ver) verEl.textContent = `v${ver}`;
    });
  }

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
      // NOTE: The old per-OS credential cards were removed from the sidebar in
      // favor of the "Configuration JSON" tab. The loaded SSH profiles are now
      // rendered from `configJsonDisplay` below — do not reference the removed
      // cfg* elements here (undeclared references would throw and abort the
      // rest of this function, leaving the pill and JSON view un-rendered).
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

// ── Multi-Session Keyed Terminal Manager ──────────────────────────────────────
const activeSshSessionsMap = new Map(); // sessionId -> { sessionId, ip, osType, username, xterm, fitAddon, containerEl, status }
let activeSshSessionId = null;

function renderTerminalTabs() {
  const tabsBar = document.getElementById('terminal-tabs-bar');
  if (!tabsBar) return;
  tabsBar.innerHTML = '';

  activeSshSessionsMap.forEach((sess, sessId) => {
    const tab = document.createElement('div');
    tab.className = `session-tab-item ${sessId === activeSshSessionId ? 'active' : ''}`;
    
    const icon = sess.osType === 'mac' ? '🍎' : sess.osType === 'windows' ? '🪟' : '🐧';
    tab.innerHTML = `
      <span>${icon}</span>
      <span class="session-tab-title">${sess.ip} (${sess.username})</span>
      <span class="session-tab-close" title="Close Session">×</span>
    `;

    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('session-tab-close')) {
        e.stopPropagation();
        closeSshSession(sessId);
      } else {
        switchSshSession(sessId);
      }
    });

    tabsBar.appendChild(tab);
  });
}

function switchSshSession(sessId) {
  if (!activeSshSessionsMap.has(sessId)) return;
  activeSshSessionId = sessId;

  activeSshSessionsMap.forEach((sess, id) => {
    if (id === sessId) {
      sess.containerEl.style.display = 'block';
      termHostTitle.textContent = `SSH Terminal - ${sess.ip}`;
      termHostSub.textContent = `User: ${sess.username} | OS: ${sess.osType}`;
      if (sess.fitAddon) {
        setTimeout(() => {
          sess.fitAddon.fit();
          const dims = sess.fitAddon.proposeDimensions();
          if (dims) window.api.sshResize(sessId, dims.cols, dims.rows);
        }, 50);
      }
      if (sess.xterm) sess.xterm.focus();
    } else {
      sess.containerEl.style.display = 'none';
    }
  });

  renderTerminalTabs();

  // Show persistent drawer
  if (sshTerminalDrawer) sshTerminalDrawer.style.display = 'flex';
  const main = document.querySelector('.main-content');
  if (main) main.style.paddingBottom = '330px';
}

function closeSshSession(sessId) {
  if (!activeSshSessionsMap.has(sessId)) return;
  const sess = activeSshSessionsMap.get(sessId);

  window.api.sshDisconnect(sessId);

  if (sess.xterm) {
    try { sess.xterm.dispose(); } catch(e) {}
  }
  if (sess.containerEl && sess.containerEl.parentNode) {
    sess.containerEl.parentNode.removeChild(sess.containerEl);
  }

  activeSshSessionsMap.delete(sessId);

  if (activeSshSessionId === sessId) {
    const remaining = Array.from(activeSshSessionsMap.keys());
    if (remaining.length > 0) {
      switchSshSession(remaining[remaining.length - 1]);
    } else {
      activeSshSessionId = null;
      if (sshTerminalDrawer) sshTerminalDrawer.style.display = 'none';
      const main = document.querySelector('.main-content');
      if (main) main.style.paddingBottom = '';
    }
  }

  renderTerminalTabs();
}

function startSshSession(ip, osType, username, password) {
  const sessionId = `ssh_${ip}_${username}`;

  // If session already exists, switch to it immediately!
  if (activeSshSessionsMap.has(sessionId)) {
    switchSshSession(sessionId);
    return;
  }

  // Create per-session container wrapper
  const containerEl = document.createElement('div');
  containerEl.className = 'term-session-wrapper';
  containerEl.style.cssText = 'width:100%;height:100%;display:none;';
  terminalContainer.appendChild(containerEl);

  const xterm = new Terminal({
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

  const fitAddon = new FitAddon.FitAddon();
  xterm.loadAddon(fitAddon);
  xterm.open(containerEl);

  xterm.onSelectionChange(() => {
    const selection = xterm.getSelection();
    if (selection) navigator.clipboard.writeText(selection);
  });

  xterm.onData((chunk) => {
    window.api.sshData(sessionId, chunk);
  });

  const sessObj = { sessionId, ip, osType, username, xterm, fitAddon, containerEl, status: 'connecting' };
  activeSshSessionsMap.set(sessionId, sessObj);

  switchSshSession(sessionId);

  // Connect via API with sessionId
  window.api.sshConnect(sessionId, ip, osType, username, password);
}

// Global SSH Listeners
if (window.api && window.api.onSshOutput) {
  window.api.onSshOutput((payload) => {
    const sessionId = typeof payload === 'object' ? payload.sessionId : activeSshSessionId;
    const data = typeof payload === 'object' ? payload.data : payload;
    const sess = activeSshSessionsMap.get(sessionId);
    if (sess && sess.xterm) {
      sess.xterm.write(data);
    }
  });

  window.api.onSshState((payload) => {
    const sessionId = typeof payload === 'object' ? payload.sessionId : activeSshSessionId;
    const state = typeof payload === 'object' ? payload.state : payload;
    const sess = activeSshSessionsMap.get(sessionId);
    if (!sess) return;

    sess.status = state;
    if (sessionId === activeSshSessionId) {
      if (state === 'connecting') {
        connStatusDot.className = 'connection-status-dot connecting';
        termHostSub.textContent = `Connecting to ${sess.ip} as ${sess.username}...`;
      } else if (state === 'connected') {
        connStatusDot.className = 'connection-status-dot active';
        termHostSub.textContent = `Connected to ${sess.ip} as ${sess.username}`;
        if (sess.xterm) sess.xterm.writeln('\x1b[1;36m[System] SSH Session Established.\x1b[0m\r\n');
      } else if (state === 'disconnected') {
        connStatusDot.className = 'connection-status-dot';
        termHostSub.textContent = 'Disconnected';
        if (sess.xterm) sess.xterm.writeln('\r\n\x1b[1;31m[System] Session Terminated.\x1b[0m');
      } else if (state === 'error') {
        connStatusDot.className = 'connection-status-dot';
        termHostSub.textContent = `Error: ${payload.error || 'Connection Failed'}`;
        if (sess.xterm) sess.xterm.writeln(`\r\n\x1b[1;31m[System Error] ${payload.error}\x1b[0m`);
      }
    }
  });
}

function destroyTerminalInstance() {
  if (activeSshSessionId) {
    closeSshSession(activeSshSessionId);
  }
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

      // 4. Ensure webview content is restored if blank when switching tabs
      if (tabTarget === 'router-portal') {
        const wv = document.getElementById('wv-router-portal');
        if (wv && (!wv.src || wv.src === 'about:blank' || wv.src === '')) {
          wv.src = 'http://192.168.1.1/';
        }
      } else if (tabTarget === 'remote-desktop') {
        const wv = document.getElementById('wv-remote-desktop');
        if (wv && (!wv.src || wv.src === 'about:blank' || wv.src === '')) {
          wv.src = 'https://remotedesktop.google.com/access';
        }
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

// WebView Reload & Failure Auto-Recovery event handler
function setupWebViewReloadHandlers() {
  const configs = [
    { id: 'wv-router-portal', defaultUrl: 'http://192.168.1.1/' },
    { id: 'wv-remote-desktop', defaultUrl: 'https://remotedesktop.google.com/access' }
  ];

  configs.forEach(({ id, defaultUrl }) => {
    const webview = document.getElementById(id);
    if (!webview) return;

    const ensureValidUrl = () => {
      try {
        const url = webview.getURL ? webview.getURL() : webview.src;
        if (!url || url === 'about:blank' || url === '') {
          webview.src = defaultUrl;
        }
      } catch (e) {
        webview.src = defaultUrl;
      }
    };

    webview.addEventListener('render-process-gone', () => {
      console.warn(`[Webview Recovery ${id}]: Render process gone. Reloading...`);
      setTimeout(() => {
        ensureValidUrl();
        webview.reload();
      }, 300);
    });

    webview.addEventListener('did-fail-load', (e) => {
      if (e.errorCode === -3) return; // ignore user cancelled loads
      console.warn(`[Webview Recovery ${id}]: Load failed. Restoring...`);
      setTimeout(() => {
        ensureValidUrl();
      }, 500);
    });
  });

  const reloadButtons = document.querySelectorAll('.btn-reload-webview');
  reloadButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const wvId = btn.dataset.webviewId;
      const webview = document.getElementById(wvId);
      if (webview) {
        try {
          const currentUrl = webview.getURL ? webview.getURL() : webview.src;
          if (!currentUrl || currentUrl === 'about:blank') {
            const fallback = wvId === 'wv-router-portal' ? 'http://192.168.1.1/' : 'https://remotedesktop.google.com/access';
            webview.src = fallback;
          } else {
            webview.reload();
          }
        } catch (e) {
          webview.reload();
        }
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

    const id = 'android_mirror_session';
    if (!activeRemoteSessionsMap.has(id)) {
      const sessObj = { id, name: 'Android Mirror', icon: '📱', type: 'android', containerEl: mirrorPanel };
      activeRemoteSessionsMap.set(id, sessObj);
    }
    switchRemoteSession(id);

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

  // ── Surface adb input failures so control problems are actually visible ───
  if (window.api.onAndroidInputError) {
    window.api.onAndroidInputError(msg => {
      if (!deviceLabel) return;
      deviceLabel.textContent = 'Input error: ' + msg;
      deviceLabel.style.color = '#f87171';
      clearTimeout(deviceLabel._errTimer);
      deviceLabel._errTimer = setTimeout(() => {
        deviceLabel.style.color = '';
        if (androidDeviceInfo) deviceLabel.textContent = `${androidDeviceInfo.width} × ${androidDeviceInfo.height} · ADB`;
      }, 2600);
    });
  }

  // Map a viewport (client) point to real device pixels. The device coordinate
  // space is the *frame's own* natural size — exactly what `adb screencap`
  // produced and what `adb input tap` expects — so this stays correct across
  // rotation, object-fit letterboxing, and any display-resolution override.
  function mapToDevice(clientX, clientY) {
    if (!screenImg) return null;
    const rect = screenImg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const natW = screenImg.naturalWidth  || (androidDeviceInfo && androidDeviceInfo.width)  || 1080;
    const natH = screenImg.naturalHeight || (androidDeviceInfo && androidDeviceInfo.height) || 2340;
    // Rectangle the image actually occupies inside the element box (contain fit).
    const scale = Math.min(rect.width / natW, rect.height / natH);
    const dispW = natW * scale, dispH = natH * scale;
    const offX  = rect.left + (rect.width  - dispW) / 2;
    const offY  = rect.top  + (rect.height - dispH) / 2;
    let relX = (clientX - offX) / dispW;
    let relY = (clientY - offY) / dispH;
    // Reject clicks that fall in the letterbox bars, but tolerate a hair of
    // sub-pixel overshoot at the very edges (so edge/corner taps still register).
    const EPS = 0.02;
    if (relX < -EPS || relX > 1 + EPS || relY < -EPS || relY > 1 + EPS) return null;
    relX = Math.max(0, Math.min(1, relX));
    relY = Math.max(0, Math.min(1, relY));
    return { x: Math.round(relX * natW), y: Math.round(relY * natH) };
  }

  // Small on-screen ripple so a tap is visibly acknowledged.
  function showTapRipple(clientX, clientY) {
    const dot = document.createElement('div');
    dot.style.cssText =
      'position:fixed;left:' + clientX + 'px;top:' + clientY + 'px;width:16px;height:16px;' +
      'margin:-8px 0 0 -8px;border-radius:50%;background:rgba(74,222,128,0.55);' +
      'border:2px solid #4ade80;pointer-events:none;z-index:9999;' +
      'transition:transform .35s ease-out, opacity .35s ease-out;';
    document.body.appendChild(dot);
    requestAnimationFrame(() => { dot.style.transform = 'scale(2.6)'; dot.style.opacity = '0'; });
    setTimeout(() => dot.remove(), 400);
  }

  // ── Mouse Click & Drag/Swipe control on the Android screen image ──────────
  if (screenImg) {
    let mDown = false, downX = 0, downY = 0, downT = 0;

    // Images are draggable by default; that native drag swallows the mouse
    // events and breaks tapping. Disable it.
    screenImg.draggable = false;
    screenImg.addEventListener('dragstart', e => e.preventDefault());

    screenImg.addEventListener('mousedown', e => {
      mDown = true; downX = e.clientX; downY = e.clientY; downT = Date.now();
      e.preventDefault();
    });

    // Listen on window so a swipe that ends *outside* the image still completes.
    window.addEventListener('mouseup', e => {
      if (!mDown) return;
      mDown = false;

      const start = mapToDevice(downX, downY);
      if (!start) return;                 // press started in the letterbox — ignore

      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved < 8) {
        window.api.androidTap(start.x, start.y);
        showTapRipple(downX, downY);
      } else {
        const end = mapToDevice(e.clientX, e.clientY) || start;
        const duration = Math.min(1200, Math.max(120, Date.now() - downT));
        window.api.androidSwipe(start.x, start.y, end.x, end.y, duration);
      }
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

// ── Multi-Session Remote Desktop & Android Tab Manager ─────────────────────
const activeRemoteSessionsMap = new Map(); // id -> { id, name, icon, type, containerEl, webview }
let activeRemoteSessId = null;

function renderRemoteTabs() {
  const tabsBar = document.getElementById('rd-tabs-bar');
  if (!tabsBar) return;
  tabsBar.innerHTML = '';

  activeRemoteSessionsMap.forEach((sess, id) => {
    const tab = document.createElement('div');
    tab.className = `session-tab-item ${id === activeRemoteSessId ? 'active' : ''}`;
    tab.innerHTML = `
      <span>${sess.icon}</span>
      <span class="session-tab-title">${sess.name}</span>
      <span class="session-tab-close" title="Close Remote Session">×</span>
    `;

    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('session-tab-close')) {
        e.stopPropagation();
        closeRemoteSession(id);
      } else {
        switchRemoteSession(id);
      }
    });

    tabsBar.appendChild(tab);
  });
}

function switchRemoteSession(id) {
  if (!activeRemoteSessionsMap.has(id)) return;
  activeRemoteSessId = id;

  const defaultWrapper = document.getElementById('rd-webview-wrapper');
  const mirrorPanel = document.getElementById('android-mirror-panel');
  if (defaultWrapper) defaultWrapper.style.display = 'none';
  if (mirrorPanel) mirrorPanel.style.display = 'none';

  activeRemoteSessionsMap.forEach((sess, sessId) => {
    if (sessId === id) {
      sess.containerEl.style.display = 'flex';
      if (sess.type === 'android' && mirrorPanel) {
        mirrorPanel.style.display = 'flex';
      }
    } else {
      sess.containerEl.style.display = 'none';
    }
  });

  renderRemoteTabs();
}

function closeRemoteSession(id) {
  if (!activeRemoteSessionsMap.has(id)) return;
  const sess = activeRemoteSessionsMap.get(id);

  if (sess.type === 'android' && stopMirrorGlobal) {
    try { stopMirrorGlobal(); } catch(e) {}
  }

  if (sess.containerEl && sess.containerEl.parentNode) {
    sess.containerEl.parentNode.removeChild(sess.containerEl);
  }

  activeRemoteSessionsMap.delete(id);

  if (activeRemoteSessId === id) {
    const remaining = Array.from(activeRemoteSessionsMap.keys());
    if (remaining.length > 0) {
      switchRemoteSession(remaining[remaining.length - 1]);
    } else {
      activeRemoteSessId = null;
      const defaultWrapper = document.getElementById('rd-webview-wrapper');
      if (defaultWrapper) defaultWrapper.style.display = 'flex';
    }
  }

  renderRemoteTabs();
}

function openRemoteDesktopSession(sessionData) {
  const { name, sessionId } = sessionData;
  const id = `rd_${sessionId}`;
  const icon = guessOsIcon(name);
  const targetUrl = `https://remotedesktop.google.com/access/session/${sessionId}`;

  if (activeRemoteSessionsMap.has(id)) {
    switchRemoteSession(id);
    return;
  }

  const wrapperParent = document.getElementById('tab-content-remote-desktop');
  const containerEl = document.createElement('div');
  containerEl.className = 'rd-session-container';
  containerEl.style.cssText = 'flex:1;min-width:0;border-radius:12px;overflow:hidden;background:#0c0a18;box-shadow:0 8px 32px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.05);display:flex;flex-direction:column;';

  const webview = document.createElement('webview');
  webview.src = targetUrl;
  webview.setAttribute('partition', 'persist:google-session');
  webview.setAttribute('useragent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0');
  webview.style.cssText = 'width:100%;height:100%;border:none;background:#0c0a18;';

  containerEl.appendChild(webview);
  wrapperParent.appendChild(containerEl);

  const sessObj = { id, name, icon, type: 'rd', containerEl, webview, url: targetUrl };
  activeRemoteSessionsMap.set(id, sessObj);

  switchRemoteSession(id);
}

function renderRdSidebarSessions(sessions) {
  const sidebarList = document.getElementById('rd-sessions-sidebar-list');
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
      openRemoteDesktopSession(s);
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

  const statusPill = document.getElementById('router-auto-login-status');
  let loginSucceeded = false;

  // Surface the injected auto-login script's diagnostics into the app console
  // and reflect the outcome in the status pill, so failures are actually visible
  // instead of silently doing nothing.
  webview.addEventListener('console-message', (e) => {
    const m = (e && e.message) || '';
    if (!m.startsWith('[OmniShell-AutoLogin]')) return;
    console.log(m);
    const idx = m.indexOf('RESULT ');
    if (idx === -1 || !statusPill) return;
    try {
      const info = JSON.parse(m.slice(idx + 7));
      // Once a login has succeeded, don't let a later dashboard scan (which has
      // no login form) flip the pill back to a warning.
      if (!info.ok && loginSucceeded) return;
      if (info.ok) loginSucceeded = true;
      statusPill.textContent      = (info.ok ? '✓ ' : '⚠ ') + info.msg;
      statusPill.style.color       = info.ok ? '#4ade80' : '#fbbf24';
      statusPill.style.background   = info.ok ? 'rgba(61,220,132,0.12)' : 'rgba(251,191,36,0.12)';
      statusPill.style.borderColor  = info.ok ? 'rgba(61,220,132,0.25)' : 'rgba(251,191,36,0.30)';
    } catch (err) {}
  });

  const doAutoLogin = async () => {
    // Once we've already submitted a login this session, don't keep re-injecting
    // on later page loads (avoids poking post-login pages / repeated submits).
    if (loginSucceeded) return;
    if (!appConfig || !appConfig.router) return;
    const { username, password } = appConfig.router;
    if (!username && !password) return;

    const script = `
    (function() {
      // Don't run twice in the same page context (avoid double submits / lockouts)
      if (window.__omniAutoLoginDone) return 'already-done';

      try {
        window.alert   = function(msg) { console.log('[OmniShell-AutoLogin] alert suppressed:', msg); };
        window.confirm = function() { return true; };
      } catch (e) {}

      const u = ${JSON.stringify(username || 'admin')};
      const p = ${JSON.stringify(password || '')};

      function log(msg) { try { console.log('[OmniShell-AutoLogin] ' + msg); } catch (e) {} }
      function result(ok, msg) {
        try { console.log('[OmniShell-AutoLogin] RESULT ' + JSON.stringify({ ok: ok, msg: msg })); } catch (e) {}
      }

      // Is the element actually usable & on-screen? Skip hidden decoy fields.
      function isVisible(el) {
        if (!el) return false;
        try {
          if (el.disabled || el.readOnly || el.type === 'hidden') return false;
          const win = (el.ownerDocument && el.ownerDocument.defaultView) || window;
          const st = win.getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return false;
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) return false;
        } catch (e) { return true; }
        return true;
      }

      // Collect document + every open shadow root + same-origin frames.
      function collectRoots() {
        const roots = [];
        const seen = new Set();
        (function walk(root) {
          if (!root || seen.has(root)) return;
          seen.add(root);
          roots.push(root);
          let all;
          try { all = root.querySelectorAll('*'); } catch (e) { return; }
          for (const el of all) {
            if (el.shadowRoot) walk(el.shadowRoot);
            if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') {
              try {
                const doc = el.contentDocument || (el.contentWindow && el.contentWindow.document);
                if (doc) walk(doc);
              } catch (e) {}
            }
          }
        })(document);
        return roots;
      }

      function allOf(roots, sel) {
        let list = [];
        for (const r of roots) {
          try { list = list.concat(Array.from(r.querySelectorAll(sel))); } catch (e) {}
        }
        return list;
      }

      function tag(i) {
        return ((i.name || '') + ' ' + (i.id || '') + ' ' +
                (i.getAttribute('placeholder') || '') + ' ' +
                (i.getAttribute('aria-label') || '')).toLowerCase();
      }

      function pickFields(roots) {
        const inputs = allOf(roots, 'input');
        const passwords = inputs.filter(function (i) { return i.type === 'password'; });

        // Prefer a VISIBLE password field; only fall back to a hidden one if
        // nothing visible exists.
        let passInput = passwords.filter(isVisible)[0] ||
                        inputs.filter(function (i) { return isVisible(i) && tag(i).indexOf('pass') !== -1; })[0] ||
                        passwords[0] || null;

        const textish = inputs.filter(function (i) {
          return i !== passInput && isVisible(i) &&
                 (i.type === 'text' || i.type === 'email' || i.type === 'tel' || i.type === 'search' || i.type === '');
        });
        let userInput = textish.filter(function (i) { return /user|login|name|account|admin|email/.test(tag(i)); })[0] ||
                        textish[0] || null;

        // Single visible input → treat it as the secret field
        if (!passInput) {
          const vis = inputs.filter(isVisible);
          if (vis.length === 1) passInput = vis[0];
        }
        return { userInput: userInput, passInput: passInput };
      }

      function setVal(el, val) {
        if (!el) return;
        try { el.focus(); } catch (e) {}
        try {
          const proto = Object.getPrototypeOf(el);
          const desc = Object.getOwnPropertyDescriptor(proto, 'value');
          if (desc && desc.set) desc.set.call(el, val);
          else el.value = val;
        } catch (e) { try { el.value = val; } catch (e2) {} }
        try {
          el.dispatchEvent(new Event('input',  { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup',   { bubbles: true }));
          el.dispatchEvent(new Event('blur',   { bubbles: true }));
        } catch (e) {}
      }

      function findLoginButton(roots) {
        let c = allOf(roots,
          'button, input[type=submit], input[type=button], input[type=image], a, [role=button], [onclick], .btn, .button, .login, #loginBtn, #btnLogin');
        c = c.filter(isVisible);
        const rx = /(log\\s*in|log\\s*on|sign\\s*in|submit|enter|apply|连接|登录|登入|进入|确定)/i;
        let t = c.filter(function (b) {
          const s = (b.innerText || '') + ' ' + (b.value || '') + ' ' +
                    (b.getAttribute('aria-label') || '') + ' ' + (b.title || '');
          return rx.test(s);
        })[0];
        if (!t) t = c.filter(function (b) { return (b.type || '').toLowerCase() === 'submit'; })[0];
        if (!t) t = c[0];
        return t;
      }

      let attempts = 0;
      function runLogin() {
        if (window.__omniAutoLoginDone) return;
        attempts++;
        const roots = collectRoots();
        const f = pickFields(roots);

        if (f.passInput) {
          if (f.userInput) setVal(f.userInput, u);
          setVal(f.passInput, p);
          log('filled user=' + !!f.userInput + ' pass=' + !!f.passInput);

          setTimeout(function () {
            if (window.__omniAutoLoginDone) return;
            // Some pages wipe fields on re-render — re-assert the values.
            if (f.passInput.value !== p) setVal(f.passInput, p);
            if (f.userInput && f.userInput.value !== u) setVal(f.userInput, u);

            if (p.length < 1) { result(false, 'Password empty in config'); return; }

            const btn = findLoginButton(collectRoots());
            const label = btn ? String(btn.innerText || btn.value || btn.id || btn.className || 'login').trim().slice(0, 30) : '';
            window.__omniAutoLoginDone = true;
            if (btn) {
              try { btn.click(); } catch (e) {}
              result(true, 'Filled + clicked: ' + (label || 'login'));
            } else if (f.passInput.form) {
              try { f.passInput.form.requestSubmit ? f.passInput.form.requestSubmit() : f.passInput.form.submit(); } catch (e) {}
              result(true, 'Filled + submitted form');
            } else {
              try {
                f.passInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                f.passInput.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
              } catch (e) {}
              result(true, 'Filled + pressed Enter');
            }
          }, 450);
          return;
        }

        if (attempts < 15) setTimeout(runLogin, 600);
        else result(false, 'Login form not found');
      }

      runLogin();
      return 'started';
    })()
    `;

    try {
      await webview.executeJavaScript(script);
    } catch(e) {}
  };

  webview.addEventListener('dom-ready', () => {
    setTimeout(doAutoLogin, 500);
    setTimeout(doAutoLogin, 2500);
  });

  webview.addEventListener('did-finish-load', () => {
    setTimeout(doAutoLogin, 500);
  });
}
