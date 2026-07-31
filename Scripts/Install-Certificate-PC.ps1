[CmdletBinding(SupportsShouldProcess)]
param()
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$cer = Join-Path $root "VacuumTubeXbox\Certificates\VacuumTubeXbox_Debug.cer"
if (-not (Test-Path $cer)) { throw "Zertifikat fehlt: $cer" }
if ($PSCmdlet.ShouldProcess("LocalMachine\\TrustedPeople", "VacuumTube Xbox Debug certificate installieren")) {
    Import-Certificate -FilePath $cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null
    Write-Host "Debug-Zertifikat installiert." -ForegroundColor Green
}
