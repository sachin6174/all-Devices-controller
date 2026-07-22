# 1. Automatically increment the minor version (major.minor.patch)
$packageJsonPath = "package.json"
$packageJson = Get-Content -Raw -Path $packageJsonPath | ConvertFrom-Json
$currentVersion = $packageJson.version

# Parse semantic version numbers
$versionParts = $currentVersion.Split('.')
$major = [int]$versionParts[0]
$minor = [int]$versionParts[1]
$patch = [int]$versionParts[2]

# Increment minor version and reset patch to 0
$minor++
$patch = 0
$newVersion = "$major.$minor.$patch"

# Update package.json version
$packageJson.version = $newVersion
$packageJson | ConvertTo-Json -Depth 10 | Set-Content -Path $packageJsonPath

Write-Host "--------------------------------------------------" -ForegroundColor Cyan
Write-Host " OmniShell Build & Auto-Upgrade Utility" -ForegroundColor Cyan
Write-Host "--------------------------------------------------" -ForegroundColor Cyan
Write-Host "Status: Auto-incremented minor version from $currentVersion to $newVersion" -ForegroundColor Green
$currentVersion = $newVersion

# 2. Check and uninstall the older installed version
$installedUninstaller = "$env:USERPROFILE\AppData\Local\Programs\omnishell\Uninstall OmniShell.exe"
if (Test-Path -Path $installedUninstaller) {
    Write-Host "Status: Older OmniShell installation found. Force-uninstalling old files..." -ForegroundColor Yellow
    # Terminate any running app processes to release file locks
    taskkill /F /IM "OmniShell.exe" /T 2>$null
    Start-Sleep -Seconds 1
    
    # Run the uninstaller silently (/S) and wait for it to complete
    Start-Process -FilePath $installedUninstaller -ArgumentList "/S" -Wait
    Write-Host "Success: Prior version uninstalled." -ForegroundColor Green
} else {
    Write-Host "Status: No prior local installation detected." -ForegroundColor Gray
}

# 3. Encrypt slim config (only SSH fields, no github_token)
Write-Host "Status: Encrypting config for shipping..." -ForegroundColor Cyan
node encrypt_config.js
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Config encryption failed!" -ForegroundColor Red
    exit 1
}

# 4. Compile and sign the new distribution package
Write-Host "Status: Compiling and signing OmniShell version $currentVersion..." -ForegroundColor Cyan
$env:CSC_LINK = "build/certificate.pfx"
$env:CSC_KEY_PASSWORD = "password123"

# Run electron-builder packaging
npm run dist

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success: Build compiled and signed successfully!" -ForegroundColor Green
    
    # 5. Auto-deploy ENCRYPTED config to user home (so installed app can find it)
    $configSrc = Join-Path $PSScriptRoot "sachin-person.cfg"
    $configDst = "$env:USERPROFILE\sachin-person.cfg"
    if (Test-Path -Path $configSrc) {
        Copy-Item -Path $configSrc -Destination $configDst -Force
        Write-Host "Success: Encrypted config deployed to $configDst" -ForegroundColor Green
    }
    
    # 5. Launch the newly generated installer to install the new version
    $installerPath = "dist\OmniShell Setup $currentVersion.exe"
    if (Test-Path -Path $installerPath) {
        Write-Host "Status: Launching installer to set up the new version..." -ForegroundColor Green
        Start-Process -FilePath $installerPath
    }
} else {
    Write-Host "Error: Build process failed with exit code $LASTEXITCODE." -ForegroundColor Red
}
