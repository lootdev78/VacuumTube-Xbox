[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release',
    [ValidateSet('x64')]
    [string]$Platform = 'x64',
    [switch]$Package,
    [switch]$GenerateTestCertificate,
    [switch]$NoRestore,
    [string]$CertificatePath,
    [string]$CertificatePassword = ''
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Solution = Join-Path $Root 'VacuumTube.Xbox.sln'
$Artifacts = Join-Path $Root 'artifacts'


function New-VacuumTubeTestCertificate {
    param([string]$OutputPath, [string]$Password)

    if (-not (Get-Command New-SelfSignedCertificate -ErrorAction SilentlyContinue)) {
        throw 'New-SelfSignedCertificate ist nicht verfügbar. Führe das Skript unter Windows PowerShell aus.'
    }

    $securePassword = ConvertTo-SecureString -String $Password -AsPlainText -Force
    $certificate = New-SelfSignedCertificate `
        -Type Custom `
        -Subject 'CN=VacuumTube' `
        -FriendlyName 'VacuumTube Xbox Development' `
        -KeyUsage DigitalSignature `
        -KeyExportPolicy Exportable `
        -KeyAlgorithm RSA `
        -KeyLength 2048 `
        -HashAlgorithm SHA256 `
        -CertStoreLocation 'Cert:\CurrentUser\My' `
        -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3')

    Export-PfxCertificate -Cert $certificate -FilePath $OutputPath -Password $securePassword | Out-Null
    Export-Certificate -Cert $certificate -FilePath ([IO.Path]::ChangeExtension($OutputPath, '.cer')) | Out-Null
    return $OutputPath
}

function Find-MSBuild {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (-not (Test-Path $vswhere)) {
        throw 'vswhere.exe fehlt. Installiere Visual Studio 2022 mit UWP-, .NET-Desktop- und C++-Desktop-Workloads.'
    }
    $path = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe' | Select-Object -First 1
    if (-not $path) { throw 'MSBuild wurde nicht gefunden.' }
    return $path
}

if (Get-Command python -ErrorAction SilentlyContinue) {
    & python (Join-Path $PSScriptRoot 'build_bundle.py')
    if ($LASTEXITCODE -ne 0) { throw 'JavaScript-Bundle-Build fehlgeschlagen.' }
    & python (Join-Path $PSScriptRoot 'validate_project.py')
    if ($LASTEXITCODE -ne 0) { throw 'Projektvalidierung fehlgeschlagen.' }
} else {
    Write-Warning 'Python wurde nicht gefunden; das vorhandene Bundle wird verwendet.'
}

New-Item -ItemType Directory -Force -Path $Artifacts | Out-Null
$msbuild = Find-MSBuild
$msbuildArgs = @(
    $Solution,
    '/m',
    "/p:Configuration=$Configuration",
    "/p:Platform=$Platform"
)
if (-not $NoRestore) { $msbuildArgs += '/restore' }

if ($Package) {
    if ($GenerateTestCertificate -and -not $CertificatePath) {
        if (-not $CertificatePassword) { $CertificatePassword = 'VacuumTube-Dev-Only' }
        $CertificatePath = Join-Path $Artifacts 'VacuumTube-Xbox-Development.pfx'
        New-VacuumTubeTestCertificate -OutputPath $CertificatePath -Password $CertificatePassword | Out-Null
    }
    if (-not $CertificatePath) {
        throw 'Für ein auf Xbox installierbares Paket ist -CertificatePath oder -GenerateTestCertificate erforderlich.'
    }
    $resolvedCert = (Resolve-Path $CertificatePath).Path
    $packageDir = Join-Path $Artifacts 'AppxPackages\'
    $msbuildArgs += @(
        '/p:AppxBundle=Never',
        "/p:AppxBundlePlatforms=$Platform",
        "/p:AppxPackageDir=$packageDir",
        '/p:UapAppxPackageBuildMode=SideloadOnly',
        '/p:GenerateAppxPackageOnBuild=true',
        '/p:AppxPackageSigningEnabled=true',
        '/p:PackageCertificateThumbprint=',
        "/p:PackageCertificateKeyFile=$resolvedCert",
        "/p:PackageCertificatePassword=$CertificatePassword"
    )
}

& $msbuild @msbuildArgs
if ($LASTEXITCODE -ne 0) { throw "MSBuild fehlgeschlagen (Exitcode $LASTEXITCODE)." }

Write-Host "Build erfolgreich: $Configuration|$Platform"
if ($Package) { Write-Host "Paket-Ausgabe: $Artifacts\AppxPackages" }
