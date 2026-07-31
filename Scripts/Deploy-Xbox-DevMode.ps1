[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$XboxIp,
    [string]$Package,
    [string]$Pin
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $Package) {
    $Package = Get-ChildItem (Join-Path $root "AppPackages") -Recurse -Include *.msix,*.appx -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Package -or -not (Test-Path $Package)) { throw "Kein Paket gefunden. Zuerst Scripts\\Build-Debug-MSIX.ps1 ausführen." }

$deploy = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter WinAppDeployCmd.exe -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $deploy) { throw "WinAppDeployCmd.exe fehlt. Installiere das Windows 10/11 SDK." }

$args = @('install','-file',$Package,'-ip',$XboxIp)
if ($Pin) { $args += @('-pin',$Pin) }
Write-Host "Deploy: $Package -> $XboxIp"
& $deploy @args
if ($LASTEXITCODE -ne 0) {
    throw "Deployment fehlgeschlagen. Alternativ im Xbox Device Portal unter Home > My games & apps > Add das Paket plus Abhängigkeiten installieren."
}
