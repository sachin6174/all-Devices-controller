# Create build directory if it doesn't exist
If (!(Test-Path -Path "build")) {
    New-Item -ItemType Directory -Force -Path "build"
}

# Create a self-signed code signing certificate in Current User personal store
$cert = New-SelfSignedCertificate -Type CodeSigning -Subject "CN=OmniShell Developer" -CertStoreLocation "Cert:\CurrentUser\My"

# Export the certificate as a PFX file with password
$pwd = ConvertTo-SecureString "password123" -AsPlainText -Force
Export-PfxCertificate -Cert $cert -FilePath "build/certificate.pfx" -Password $pwd

Write-Output "PFX Certificate successfully generated at build/certificate.pfx!"
