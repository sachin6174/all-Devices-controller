# ── OmniShell Dev Certificate Generator ─────────────────────────────────────
# Run this ONCE locally to create a self-signed code-signing certificate.
# The generated build/certificate.pfx is listed in .gitignore — never commit it.
#
# USAGE:
#   $env:CERT_PASS = "your-strong-password"
#   powershell -ExecutionPolicy Bypass -File create_cert.ps1
#
# Or just run without env var — it will prompt you interactively.
# ─────────────────────────────────────────────────────────────────────────────

# Create build directory if it doesn't exist
If (!(Test-Path -Path "build")) {
    New-Item -ItemType Directory -Force -Path "build"
}

# Read password from environment variable or prompt interactively
$certPassword = $env:CERT_PASS
if (-not $certPassword) {
    $secPwd = Read-Host "Enter certificate password" -AsSecureString
} else {
    $secPwd = ConvertTo-SecureString $certPassword -AsPlainText -Force
}

# Create a self-signed code signing certificate in Current User personal store
$cert = New-SelfSignedCertificate `
    -Type CodeSigning `
    -Subject "CN=OmniShell Developer" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(3)

# Export as PFX — this file stays LOCAL (see .gitignore)
Export-PfxCertificate -Cert $cert -FilePath "build/certificate.pfx" -Password $secPwd

Write-Output ""
Write-Output "✅ PFX Certificate generated at build/certificate.pfx"
Write-Output "⚠️  Keep this file SECRET — it is excluded from git."
