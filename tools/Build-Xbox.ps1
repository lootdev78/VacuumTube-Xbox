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
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$OutputPath,

        [Parameter(Mandatory = $true)]
        [string]$Password
    )

    if (-not (Get-Command New-SelfSignedCertificate -ErrorAction SilentlyContinue)) {
        throw 'New-SelfSignedCertificate ist nicht verfügbar. Führe das Skript unter Windows PowerShell aus.'
    }

    if ([string]::IsNullOrWhiteSpace($Password)) {
        throw 'Für das temporäre Entwicklungszertifikat ist ein nichtleeres Passwort erforderlich.'
    }

    $outputDirectory = Split-Path -Parent $OutputPath
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

    $securePassword = ConvertTo-SecureString `
        -String $Password `
        -AsPlainText `
        -Force

    $certificate = $null

    try {
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
            -NotAfter (Get-Date).AddDays(7) `
            -TextExtension @(
                '2.5.29.37={text}1.3.6.1.5.5.7.3.3'
            )

        Export-PfxCertificate `
            -Cert $certificate `
            -FilePath $OutputPath `
            -Password $securePassword | Out-Null

        $publicCertificatePath = [IO.Path]::ChangeExtension(
            $OutputPath,
            '.cer'
        )

        Export-Certificate `
            -Cert $certificate `
            -FilePath $publicCertificatePath | Out-Null
    }
    finally {
        if ($certificate) {
            Remove-Item `
                -Path "Cert:\CurrentUser\My\$($certificate.Thumbprint)" `
                -Force `
                -ErrorAction SilentlyContinue
        }
    }

    $publicCertificatePath = [IO.Path]::ChangeExtension(
        $OutputPath,
        '.cer'
    )

    if (-not (Test-Path $OutputPath)) {
        throw "PFX-Zertifikat wurde nicht erzeugt: $OutputPath"
    }

    if (-not (Test-Path $publicCertificatePath)) {
        throw "Öffentliches Zertifikat wurde nicht erzeugt: $publicCertificatePath"
    }

    return $OutputPath
}


function Find-MSBuild {
    $pathCommand = Get-Command msbuild -ErrorAction SilentlyContinue

    if ($pathCommand) {
        return $pathCommand.Source
    }

    $vswhere = Join-Path `
        ${env:ProgramFiles(x86)} `
        'Microsoft Visual Studio\Installer\vswhere.exe'

    if (-not (Test-Path $vswhere)) {
        throw 'vswhere.exe fehlt. Installiere Visual Studio 2022 mit dem UWP-Workload und Windows SDK 26100.'
    }

    $path = & $vswhere `
        -latest `
        -products * `
        -requires Microsoft.Component.MSBuild `
        -find 'MSBuild\**\Bin\amd64\MSBuild.exe' |
            Select-Object -First 1

    if (-not $path) {
        $path = & $vswhere `
            -latest `
            -products * `
            -requires Microsoft.Component.MSBuild `
            -find 'MSBuild\**\Bin\MSBuild.exe' |
                Select-Object -First 1
    }

    if (-not $path) {
        throw 'MSBuild wurde nicht gefunden.'
    }

    return $path
}


if (-not (Test-Path $Solution)) {
    throw "Solution wurde nicht gefunden: $Solution"
}

if (Get-Command python -ErrorAction SilentlyContinue) {
    & python (Join-Path $PSScriptRoot 'build_bundle.py')

    if ($LASTEXITCODE -ne 0) {
        throw 'JavaScript-Bundle-Build fehlgeschlagen.'
    }

    & python (Join-Path $PSScriptRoot 'validate_project.py')

    if ($LASTEXITCODE -ne 0) {
        throw 'Projektvalidierung fehlgeschlagen.'
    }
}
else {
    Write-Warning 'Python wurde nicht gefunden; das vorhandene Bundle wird verwendet.'
}

New-Item -ItemType Directory -Force -Path $Artifacts | Out-Null

$msbuild = Find-MSBuild
$msbuildArgs = @(
    $Solution,
    '/m',
    "/p:Configuration=$Configuration",
    "/p:Platform=$Platform",
    '/verbosity:minimal'
)

if ($env:NUGET_PACKAGES) {
    $msbuildArgs += "/p:RestorePackagesPath=$env:NUGET_PACKAGES"
}

if (-not $NoRestore) {
    $msbuildArgs += '/restore'
}

if ($Package) {
    if ($GenerateTestCertificate -and -not $CertificatePath) {
        if ([string]::IsNullOrWhiteSpace($CertificatePassword)) {
            $CertificatePassword = 'VacuumTube-Dev-Only'
        }

        $CertificatePath = Join-Path `
            $Artifacts `
            'VacuumTube-Xbox-Development.pfx'

        New-VacuumTubeTestCertificate `
            -OutputPath $CertificatePath `
            -Password $CertificatePassword | Out-Null
    }

    if (-not $CertificatePath) {
        throw 'Für ein auf Xbox installierbares Paket ist -CertificatePath oder -GenerateTestCertificate erforderlich.'
    }

    if (-not (Test-Path $CertificatePath)) {
        throw "Zertifikat wurde nicht gefunden: $CertificatePath"
    }

    $resolvedCert = (Resolve-Path $CertificatePath).Path
    $packageDir = Join-Path $Artifacts 'AppxPackages\'

    if (Test-Path $packageDir) {
        Remove-Item $packageDir -Recurse -Force
    }

    New-Item -ItemType Directory -Force -Path $packageDir | Out-Null

    $msbuildArgs += @(
        '/p:AppxBundle=Never',
        "/p:AppxBundlePlatforms=$Platform",
        "/p:AppxPackageDir=$packageDir",
        '/p:UapAppxPackageBuildMode=SideloadOnly',
        '/p:GenerateAppInstallerFile=false',
        '/p:GenerateAppxPackageOnBuild=true',
        '/p:AppxPackageSigningEnabled=true',
        '/p:PackageCertificateThumbprint=',
        "/p:PackageCertificateKeyFile=$resolvedCert",
        "/p:PackageCertificatePassword=$CertificatePassword"
    )
}

Write-Host "MSBuild: $msbuild"
Write-Host "Konfiguration: $Configuration|$Platform"
Write-Host "NuGet-Ordner: $env:NUGET_PACKAGES"

& $msbuild @msbuildArgs

if ($LASTEXITCODE -ne 0) {
    throw "MSBuild fehlgeschlagen (Exitcode $LASTEXITCODE)."
}

Write-Host "Build erfolgreich: $Configuration|$Platform"

if ($Package) {
    $packages = Get-ChildItem `
        -Path (Join-Path $Artifacts 'AppxPackages') `
        -Recurse `
        -File `
        -Include *.appx,*.msix,*.appxbundle,*.msixbundle `
        -ErrorAction SilentlyContinue

    if (-not $packages) {
        throw 'MSBuild war erfolgreich, hat aber kein APPX/MSIX-Paket erzeugt.'
    }

    Write-Host "Paket-Ausgabe: $Artifacts\AppxPackages"

    foreach ($packageFile in $packages) {
        Write-Host "Paket: $($packageFile.FullName)"
    }
}
