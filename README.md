# 🚀 OmniShell

**Modern All-in-One Controller & Remote Gateway Management Platform**

OmniShell is a unified desktop control center built with Electron and Node.js. It consolidates local network discovery, SSH terminal management, Chrome Remote Desktop sessions, Android wireless/USB screen mirroring, and router gateway management into a single window.

---

## 🚨 MANDATORY DEVELOPMENT & TESTING RULE

> [!IMPORTANT]
> **NEVER RUN `npm start` OR USE UNPACKAGED DEBUG MODE.**
>
> **ALWAYS USE THE PRODUCTION BUILD SCRIPT TO TEST OR RELEASE:**
> ```powershell
> powershell -ExecutionPolicy Bypass -File build_dist.ps1
> ```

### Why is this rule mandatory?
Running `build_dist.ps1` enforces the complete production pipeline:
1. **Config Encryption**: Filters `sachin-person.config` and encrypts secrets into `sachin-person.cfg` using AES-256-GCM.
2. **Version Incrementation**: Auto-increments the minor build version.
3. **Production Compilation**: Packages native dependencies, `ssh2`, and Electron `asar`.
4. **Binary Code Signing**: Signs `OmniShell.exe` and `OmniShell Setup.exe` with the developer certificate.
5. **Real Production Launch**: Installs the actual packaged app (`OmniShell Setup.exe`) and opens the compiled app for authentic testing.

---

## ✨ Key Features

### 🌐 1. Router Gateway Main Screen (`http://192.168.1.1/`)
- Default active screen on app launch.
- Auto-injects router credentials (`username: admin`, `password: MACosagent1@#`) and logs in automatically.
- Dedicated reload control bar for quick gateway management.

### 📱 2. Embedded Android (ADB) Screen Mirroring
- Streams live screen capture (`192.168.1.5:5555`) directly inside the Electron app (`#android-mirror-panel`).
- **No External Popups**: Native `scrcpy` pop-up windows are completely disabled.
- **Interactive Mouse Controls**: Click directly on the embedded phone image to send `adb shell input tap X Y`.
- **Hardware Navigation Bar**: Embedded controls for `◀ Back`, `⌂ Home`, `⧉ Recent Apps`, `🔊 Volume Up`, `🔉 Volume Down`, and `⏻ Power`.

### 🖥️ 3. Chrome Remote Desktop Session Sync
- **Deep Shadow-DOM Scraper**: Recursively inspects Shadow DOM boundaries in the webview to extract active remote hosts.
- **Instant Leftmost Panel Navigation**: `SACHIN-ART-MACINTOSH`, `SACHIN-ART-LINUX`, and `SACHIN-ART-WINDOWS` populate immediately upon boot.
- **1-Click Switching**: Clicking any remote host in the left panel routes directly to its exact Chrome Remote Desktop session URL.

### 🐚 4. Persistent SSH Terminal Drawer
- **Bottom Drawer**: VS Code-style terminal drawer situated outside the tab content hierarchy.
- **Navigation Persistence**: Active SSH connections survive tab switches—sessions remain alive until manually disconnected via the `⏻ Disconnect` button.
- **Drag-to-Resize**: Drag the top border to resize the terminal drawer with auto-fitting `xterm.js` text layout.

### 📡 5. Automated Local Subnet Scanner
- Automatically sweeps the local subnet (800ms after boot) for active IP addresses and open SSH ports (22).
- Animated circular radar screen visualization with live statistics.

### 🔒 6. AES-256-GCM Config Encryption
- Built-in encryption engine (`encrypt_config.js`) using PBKDF2 key derivation and AES-256-GCM authenticated encryption.
- Encrypts local SSH profiles and router credentials (`sachin-person.config` → `sachin-person.cfg`).
- Excludes developer keys (`github_token`) from shipped packages.

---

## 🛠️ Configuration Specification (`sachin-person.config`)

Create or update your local `sachin-person.config` file in the root directory:

```json
{
  "ssh": {
    "mac": {
      "username": "sachinkumar",
      "pass": "1111"
    },
    "linux": {
      "username": "test",
      "pass": "test"
    },
    "windows": {
      "username": "sachinkumar",
      "pass": "1111"
    }
  },
  "router": {
    "username": "admin",
    "password": "MACosagent1@#"
  },
  "github_token": "github_pat_EXAMPLE_TOKEN_STAYS_LOCAL"
}
```

> [!CAUTION]
> Never commit `sachin-person.config`, `sachin-person.cfg`, or `build/*.pfx` to Git. They are strictly excluded by `.gitignore`.

---

## 📦 Building & Releasing

To generate signed installer executables and portable zips:

```powershell
powershell -ExecutionPolicy Bypass -File build_dist.ps1
```

### Outputs generated in `dist/`:
- 📦 **Windows NSIS Installer**: `dist\OmniShell Setup <version>.exe`
- 📁 **Portable ZIP**: `dist\OmniShell-<version>-win.zip`
- 🔒 **Encrypted Production Config**: `C:\Users\sachi\sachin-person.cfg`

---

## 📁 Repository Architecture

```text
all-Devices-controller/
├── build_dist.ps1          # Master build, signing & auto-launch pipeline
├── encrypt_config.js       # AES-256-GCM config encryptor
├── create_cert.ps1         # Self-signed code signing certificate generator
├── main.js                 # Electron main process (IPC handlers, ADB spawn, SSH)
├── preload.js              # Secure IPC bridge (contextBridge)
├── renderer.js             # UI logic, webview scrapers, xterm.js, tab handlers
├── index.html              # App layout, webviews, drawer & left panel
├── index.css               # Modern glassmorphism CSS design system
├── scanner.py              # Multithreaded Python subnet scanner
├── build/
│   ├── certificate.pfx     # Code signing certificate (excluded from git)
│   └── icon.png            # Application icon
└── dist/                   # Packaging output directory (installer & zip)
```

---

## 📜 License & Disclaimer

OmniShell is developed for private network administration and remote device control. Ensure all target devices are authorized before establishing SSH or ADB connections.
