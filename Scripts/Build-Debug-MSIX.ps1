[CmdletBinding()]
param(
    [string]$Configuration = "Debug",
    [ValidateSet("x64")][string]$Platform = "x64",
    [string]$CertificatePassword = "VacuumTubeXboxDebug!"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$solution = Join-Path $root "VacuumTubeXbox.sln"


$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vswhere)) {
    throw "vswhere.exe fehlt. Installiere Visual Studio 2022 mit 'Universal Windows Platform development' und Windows 10 SDK 19041 oder neuer."
}

$msbuild = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find MSBuild\**\Bin\MSBuild.exe | Select-Object -First 1
if (-not $msbuild) { throw "MSBuild wurde nicht gefunden." }

Write-Host "MSBuild: $msbuild"
Write-Host "Lösung:   $solution"

& $msbuild $solution /restore `
    /m `
    /p:Configuration=$Configuration `
    /p:Platform=$Platform `
    /p:GenerateAppxPackageOnBuild=true `
    /p:UapAppxPackageBuildMode=SideloadOnly `
    /p:AppxBundle=Never `
    /p:PackageCertificatePassword=$CertificatePassword

if ($LASTEXITCODE -ne 0) { throw "MSBuild ist mit Code $LASTEXITCODE fehlgeschlagen." }

$packages = Get-ChildItem (Join-Path $root "AppPackages") -Recurse -Include *.msix,*.appx,*.msixbundle,*.appxbundle -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
if (-not $packages) {
    throw "Build erfolgreich, aber unter AppPackages wurde kein MSIX/APPX gefunden. Öffne die Lösung in Visual Studio und nutze Publish > Create App Packages > Sideloading."
}

Write-Host "`nErzeugte Pakete:" -ForegroundColor Green
$packages | ForEach-Object { Write-Host $_.FullName }
