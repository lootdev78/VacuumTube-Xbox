[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Repository,
    [ValidateSet('public', 'private')]
    [string]$Visibility = 'public'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'git wurde nicht gefunden.'
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI (gh) wurde nicht gefunden. Installiere sie und führe gh auth login aus.'
}

& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI ist nicht angemeldet. Führe gh auth login aus.' }

if (-not (Test-Path '.git')) {
    & git init -b main
    & git add .
    & git commit -m 'Initial Xbox WebView2 port with Debug APPX workflow'
}

& gh repo create $Repository "--$Visibility" --source . --remote origin --push
if ($LASTEXITCODE -ne 0) { throw 'Repository konnte nicht erstellt oder gepusht werden.' }

Write-Host "Repository veröffentlicht: $Repository"
Write-Host 'Der Workflow Xbox Debug App startet beim Push auf main automatisch.'
