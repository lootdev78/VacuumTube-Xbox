[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root 'VacuumTubeXbox\VacuumTubeXbox.csproj'
$manifest = Join-Path $root 'VacuumTubeXbox\Package.appxmanifest'
$pfx = Join-Path $root 'VacuumTubeXbox\Certificates\VacuumTubeXbox_Debug.pfx'

function Require-Path([string]$Path, [string]$Description) {
    if (-not (Test-Path $Path)) { throw "$Description fehlt: $Path" }
    Write-Host "OK  $Description" -ForegroundColor Green
}

Require-Path $project 'UWP-Projekt'
Require-Path $manifest 'AppX-Manifest'
Require-Path $pfx 'Debug-PFX'

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
Require-Path $vswhere 'vswhere.exe'

$msbuild = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find MSBuild\**\Bin\MSBuild.exe | Select-Object -First 1
if (-not $msbuild) { throw 'MSBuild wurde nicht gefunden.' }
Write-Host "OK  MSBuild: $msbuild" -ForegroundColor Green

$uwp = & $vswhere -latest -products * -requires Microsoft.VisualStudio.ComponentGroup.UWP.VC -property installationPath
if (-not $uwp) {
    Write-Warning "Die UWP-Komponenten konnten nicht eindeutig erkannt werden. Installiere die Workload 'Universal Windows Platform development' inklusive C++ UWP tools."
} else {
    Write-Host 'OK  UWP-Workload erkannt' -ForegroundColor Green
}

$sdkRoot = Join-Path "${env:ProgramFiles(x86)}" 'Windows Kits\10'
Require-Path $sdkRoot 'Windows SDK'

$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2
$cert.Import($pfx, 'VacuumTubeXboxDebug!', [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable)
if ($cert.Subject -ne 'CN=VacuumTube Xbox Debug') { throw "Unerwartetes Zertifikat: $($cert.Subject)" }
if (-not $cert.HasPrivateKey) { throw 'Das PFX enthält keinen privaten Schlüssel.' }
Write-Host "OK  Zertifikat: $($cert.Thumbprint)" -ForegroundColor Green

Write-Host "`nUmgebung ist für den Restore/Build vorbereitet." -ForegroundColor Cyan
Write-Host '.\Scripts\Build-Debug-MSIX.ps1'
