#!/usr/bin/env python3
"""Static validation for the Xbox/UWP port.

This does not replace a Windows UWP build. It catches packaging, bridge, syntax-shape,
and accidental Electron/Node regressions before invoking Visual Studio/MSBuild.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "VacuumTube.Xbox"
SRC = ROOT / "src"
ERRORS: list[str] = []
CHECKS: list[str] = []

# Generated/cache directories may contain folders whose names end in .json
# (for example .nuget/packages/newtonsoft.json). They are not project inputs and
# must never be parsed or scanned as source files.
IGNORED_DIRECTORY_NAMES = {
    ".git", ".nuget", ".vs", ".idea",
    "artifacts", "bin", "obj", "node_modules", "packages",
}


def is_project_file(path: Path) -> bool:
    """Return True only for regular source files outside generated/cache trees."""
    if not path.is_file():
        return False
    try:
        relative = path.relative_to(ROOT)
    except ValueError:
        return False
    return not any(part.lower() in IGNORED_DIRECTORY_NAMES for part in relative.parts[:-1])


def project_files(pattern: str) -> list[Path]:
    return [path for path in ROOT.rglob(pattern) if is_project_file(path)]


def ok(message: str) -> None:
    CHECKS.append(message)
    print(f"[OK] {message}")


def fail(message: str) -> None:
    ERRORS.append(message)
    print(f"[FAIL] {message}")


def require(condition: bool, message: str) -> None:
    (ok if condition else fail)(message)


def strip_csharp_noncode(text: str) -> str:
    # Preserve line structure while removing comments and string/char contents.
    out: list[str] = []
    i = 0
    state = "code"
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if state == "code":
            if ch == '/' and nxt == '/':
                out.extend('  '); i += 2; state = "line_comment"; continue
            if ch == '/' and nxt == '*':
                out.extend('  '); i += 2; state = "block_comment"; continue
            if ch == '@' and nxt == '"':
                out.extend('  '); i += 2; state = "verbatim"; continue
            if ch == '$' and nxt == '"':
                out.extend('  '); i += 2; state = "string"; continue
            if ch == '$' and nxt == '@' and i + 2 < len(text) and text[i + 2] == '"':
                out.extend('   '); i += 3; state = "verbatim"; continue
            if ch == '@' and nxt == '$' and i + 2 < len(text) and text[i + 2] == '"':
                out.extend('   '); i += 3; state = "verbatim"; continue
            if ch == '"':
                out.append(' '); i += 1; state = "string"; continue
            if ch == "'":
                out.append(' '); i += 1; state = "char"; continue
            out.append(ch); i += 1; continue
        if state == "line_comment":
            if ch == '\n': out.append('\n'); state = "code"
            else: out.append(' ')
            i += 1; continue
        if state == "block_comment":
            if ch == '*' and nxt == '/': out.extend('  '); i += 2; state = "code"
            else: out.append('\n' if ch == '\n' else ' '); i += 1
            continue
        if state == "string":
            if ch == '\\': out.extend('  '); i += 2
            elif ch == '"': out.append(' '); i += 1; state = "code"
            else: out.append('\n' if ch == '\n' else ' '); i += 1
            continue
        if state == "verbatim":
            if ch == '"' and nxt == '"': out.extend('  '); i += 2
            elif ch == '"': out.append(' '); i += 1; state = "code"
            else: out.append('\n' if ch == '\n' else ' '); i += 1
            continue
        if state == "char":
            if ch == '\\': out.extend('  '); i += 2
            elif ch == "'": out.append(' '); i += 1; state = "code"
            else: out.append('\n' if ch == '\n' else ' '); i += 1
            continue
    return ''.join(out)


def balanced(text: str, pairs: dict[str, str]) -> bool:
    stack: list[str] = []
    closing = {v: k for k, v in pairs.items()}
    for ch in text:
        if ch in pairs: stack.append(ch)
        elif ch in closing:
            if not stack or stack.pop() != closing[ch]: return False
    return not stack


def main() -> int:
    require((ROOT / "VacuumTube.Xbox.sln").is_file(), "Solution vorhanden")
    require((PROJECT / "VacuumTube.Xbox.csproj").is_file(), "UWP-Projekt vorhanden")
    require((PROJECT / "Web/vacuumtube.bundle.js").stat().st_size > 100_000, "WebView2-Bundle vorhanden")

    # XML/XAML/manifest parse.
    xml_files = list(PROJECT.rglob("*.xaml")) + [PROJECT / "VacuumTube.Xbox.csproj", PROJECT / "Package.appxmanifest"]
    for path in xml_files:
        try: ET.parse(path)
        except Exception as exc: fail(f"XML/XAML ungültig: {path.relative_to(ROOT)}: {exc}")
    if not any(e.startswith("XML/XAML") for e in ERRORS): ok("XML, XAML und Manifest sind wohlgeformt")

    for path in project_files("*.json"):
        try: json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc: fail(f"JSON ungültig: {path.relative_to(ROOT)}: {exc}")
    if not any(e.startswith("JSON") for e in ERRORS): ok("Alle JSON-Dateien sind parsebar")

    csproj = (PROJECT / "VacuumTube.Xbox.csproj").read_text(encoding="utf-8")
    for package in ["Microsoft.NETCore.UniversalWindowsPlatform", "Microsoft.UI.Xaml", "Microsoft.Web.WebView2", "Newtonsoft.Json"]:
        require(f'PackageReference Include="{package}"' in csproj, f"NuGet-Referenz {package}")
    require("<TargetPlatformIdentifier>UAP</TargetPlatformIdentifier>" in csproj, "Zielplattform UAP")
    require("<PlatformTarget>x64</PlatformTarget>" in csproj, "Xbox-Zielarchitektur x64")
    require("<Prefer32Bit>true</Prefer32Bit>" not in csproj, "Prefer32Bit für x64 deaktiviert")
    require("{A5A43C5B-DE2A-4C0C-9213-0A381AF9435A}" in csproj, "Offizielle UWP-C#-Projekttyp-GUID")
    require("<RestoreProjectStyle>PackageReference</RestoreProjectStyle>" in csproj, "NuGet-Restoremodus PackageReference")
    require('Compile Include="Services\\MicrophonePermissionService.cs"' in csproj, "Mikrofonservice wird kompiliert")

    manifest = (PROJECT / "Package.appxmanifest").read_text(encoding="utf-8")
    for capability in ["internetClient", "internetClientServer", "privateNetworkClientServer", "microphone"]:
        require(f'Name="{capability}"' in manifest, f"Manifest-Capability {capability}")

    # Assets must exist and be non-empty.
    required_assets = ["StoreLogo.png", "Square44x44Logo.png", "Square150x150Logo.png", "Square310x310Logo.png", "Wide310x150Logo.png", "SplashScreen.png"]
    for asset in required_assets:
        path = PROJECT / "Assets" / asset
        require(path.is_file() and path.stat().st_size > 0, f"Asset {asset}")

    # No updater/Electron/Node runtime dependencies in executable source.
    scanned: list[Path] = []
    for suffix in ("*.js", "*.cs", "*.xaml", "*.csproj", "*.json"):
        scanned.extend(project_files(suffix))
    banned = {
        "electron-updater": re.compile(r"electron-updater", re.I),
        "Electron runtime": re.compile(r"(?:from|require\s*\()\s*['\"]electron['\"]", re.I),
        "Node dgram": re.compile(r"require\s*\(\s*['\"](?:node:)?dgram['\"]", re.I),
        "Node crypto": re.compile(r"require\s*\(\s*['\"](?:node:)?crypto['\"]", re.I),
    }
    all_text = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in scanned)
    for label, pattern in banned.items(): require(pattern.search(all_text) is None, f"Keine Abhängigkeit: {label}")

    # C# lexical shape and XAML event binding checks.
    cs_files = list(PROJECT.rglob("*.cs"))
    for path in cs_files:
        clean = strip_csharp_noncode(path.read_text(encoding="utf-8"))
        require(balanced(clean, {'{': '}', '(': ')', '[': ']'}), f"C# Klammerstruktur {path.relative_to(ROOT)}")

    main_cs = (PROJECT / "MainPage.xaml.cs").read_text(encoding="utf-8")
    main_xaml = (PROJECT / "MainPage.xaml").read_text(encoding="utf-8")
    handlers = set(re.findall(r'\b(?:Click|Loaded|Unloaded)="([A-Za-z_][A-Za-z0-9_]*)"', main_xaml))
    for handler in handlers:
        require(re.search(rf"\b{re.escape(handler)}\s*\(", main_cs) is not None, f"XAML-Handler {handler} implementiert")

    # Every direct JS native channel must exist in the host switch. get-config is synchronous/local only.
    js_text = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in SRC.rglob("*.js"))
    js_channels = set(re.findall(r"ipcRenderer\.(?:invoke|sendSync)\(\s*['\"]([^'\"]+)", js_text))
    host_channels = set(re.findall(r'case\s+"([^"]+)"\s*:', main_cs))
    local_channels = {"get-config"}
    missing = sorted(js_channels - host_channels - local_channels)
    require(not missing, "Alle direkten JS-Bridge-Kanäle im UWP-Host implementiert" + (f": {missing}" if missing else ""))

    # Hardened navigation/interception invariants.
    csp = (PROJECT / "Services/CspResponseInterceptor.cs").read_text(encoding="utf-8")
    require("ContinueUnmodifiedAsync" in csp and "Fetch.disable" in csp, "CSP-Interceptor kann pausierte Requests sicher fortsetzen")
    require("OnNavigationCompleted" in main_cs and "e.IsSuccess" in main_cs, "Navigationsfehler werden sichtbar behandelt")
    require("OnRetryClicked" in main_cs and "RetryButton" in main_xaml, "Startfehler besitzen Wiederholungsweg")

    # Functionality and lifecycle parity checks that were previously only claimed in docs.
    expected_mods = {
        "adblock", "block-sign-in-popup", "controller-support", "css", "dearrow",
        "disable-direct-sign-in", "encryption-notice", "fix-exit", "fix-reloads",
        "fix-voice", "h264ify", "h5vcc", "hide-shorts", "identification", "keybinds",
        "leanback-settings", "low-memory-mode", "mouse", "music-mode", "no-f11",
        "pause-on-blur", "remove-super-resolution", "return-youtube-dislike", "settings",
        "sponsorblock", "support-webp", "touch-support",
        "voice-privacy-notice", "volume-control"
    }
    entry = (SRC / "xbox/browser-entry.js").read_text(encoding="utf-8")
    loaded_mods = set(re.findall(r"""require\(['"]\.\./preload/modules/([^'"]+)['"]\)""", entry))
    require(loaded_mods == expected_mods,
            "Alle 29 verbleibenden Top-Level-Mods werden geladen" +
            (f" (fehlend={sorted(expected_mods-loaded_mods)}, extra={sorted(loaded_mods-expected_mods)})" if loaded_mods != expected_mods else ""))

    settings_js = (SRC / "preload/modules/settings/index.js").read_text(encoding="utf-8")
    leanback_settings = (SRC / "preload/modules/leanback-settings.js").read_text(encoding="utf-8")
    require("document.body.appendChild(overlayElement)" in settings_js,
            "Settings-Overlay wird in die originale YouTube-TV-DOM-Seite eingebettet")
    require("SETTINGS_CAT_VACUUMTUBE_OVERLAY" in leanback_settings and
            "json.items.unshift" in leanback_settings and "vtOpenSettingsOverlay" in leanback_settings,
            "VacuumTube-Eintrag wird in die originale YouTube-TV-Einstellungsseite eingefügt")

    adblock = (SRC / "preload/modules/adblock.js").read_text(encoding="utf-8")
    for marker, label in [
        ("adPlacements", "Video-Ad-Placements"),
        ("adSlots", "Video-Ad-Slots"),
        ("adSlotRenderer", "Feed-Ad-Slots"),
        ("promoShelfRenderer", "Promo-Shelves"),
        ("adClientParams?.isAd", "Shorts-Ads"),
    ]:
        require(marker in adblock, f"Adblock entfernt {label}")

    mic = (PROJECT / "Services/MicrophonePermissionService.cs").read_text(encoding="utf-8")
    require("DeviceAccessInformation.CreateFromDeviceClass(DeviceClass.AudioCapture)" in mic,
            "Mikrofonstatus wird über UWP-Gerätezugriff gelesen")
    require("MediaCapture" in mic and "InitializeAsync" in mic,
            "Mikrofonfreigabe wird real über MediaCapture angefordert")
    require('case "request-microphone-permission": return "granted"' not in main_cs,
            "Keine hartcodierte Mikrofonfreigabe")
    require("CoreWebView2PermissionKind.Microphone" in main_cs and "youtube.com" in main_cs,
            "WebView2-Mikrofonfreigabe ist auf YouTube begrenzt")

    app_cs = (PROJECT / "App.xaml.cs").read_text(encoding="utf-8")
    require("Suspending += OnSuspending" in app_cs and "Resuming += OnResuming" in app_cs,
            "UWP Suspend/Resume-Ereignisse sind verdrahtet")
    require("SuspendAsync" in main_cs and "ResumeAsync" in main_cs and 'SendEvent("host-resumed"' in main_cs,
            "Native Dienste werden bei Suspend/Resume gestoppt und neu gestartet")
    require("TrySuspendAsync()" in main_cs and "Browser.Visibility = Visibility.Collapsed" in main_cs,
            "WebView2 wird vor UWP-Suspend unsichtbar geschaltet und nativ suspendiert")
    require("CoreWebView2.Resume()" in main_cs and "Browser.Visibility = Visibility.Visible" in main_cs,
            "WebView2 wird beim UWP-Resume nativ fortgesetzt und wieder sichtbar")
    require("userstyles" not in js_text.lower() and "FileOpenPicker" not in main_cs and "Userstyles" not in main_cs,
            "Userstyles/Custom-CSS vollständig entfernt")
    require("msEdgeDevToolsWdpRemoteDebugging" in main_cs and "#if DEBUG" in main_cs,
            "Debug-Build ist für Xbox-WebView2-Remote-Debugging vorbereitet")
    require('case "get-runtime-diagnostics"' in main_cs and "MemoryManager.AppMemoryUsage" in main_cs,
            "Runtime-Diagnostik liefert Xbox-Speicherwerte")
    h5vcc = (SRC / "preload/modules/h5vcc/index.js").read_text(encoding="utf-8")
    require("function createDeviceId()" in h5vcc and "getRandomValues" in h5vcc,
            "DIAL-Geräte-ID besitzt WebView2-kompatiblen Web-Crypto-Fallback")

    build_ps = (ROOT / "tools/Build-Xbox.ps1").read_text(encoding="utf-8")
    require("'/restore'" in build_ps and "NoRestore" in build_ps, "Windows-Build unterstützt NuGet-Restore und separaten CI-Restore")
    require("/p:GenerateAppxPackageOnBuild=true" in build_ps, "Windows-Build erzeugt APPX-Paket")
    require("/p:AppxPackageSigningEnabled=true" in build_ps and "PackageCertificateKeyFile" in build_ps,
            "Windows-Build aktiviert Paketsignierung")
    require("New-SelfSignedCertificate" in build_ps and "CN=VacuumTube" in build_ps,
            "Entwicklungszertifikat stimmt mit Manifest-Publisher überein")

    workflow = (ROOT / ".github/workflows/xbox-debug-app.yml").read_text(encoding="utf-8")
    require("runs-on: windows-2022" in workflow and "Build-Xbox.ps1" in workflow,
            "Windows-CI nutzt den festen UWP-Buildrunner")
    require("actions/checkout@v6" in workflow,
            "GitHub-CI verwendet einen veröffentlichten Checkout-Major")
    require("actions/setup-python@v6" in workflow,
            "GitHub-CI verwendet einen veröffentlichten Setup-Python-Major")
    require("actions/cache@v5" in workflow,
            "GitHub-CI verwendet einen veröffentlichten Cache-Major")
    require("microsoft/setup-msbuild@v3" in workflow and "/t:Restore" in workflow,
            "GitHub-CI richtet MSBuild ein und führt echten NuGet-Restore aus")
    require("${{ runner.temp }}" not in workflow and "github.workspace" in workflow,
            "NuGet-Pfad verwendet einen im Job-Environment gültigen GitHub-Kontext")
    require("-Configuration $env:CONFIGURATION" in workflow and "CONFIGURATION: Debug" in workflow,
            "GitHub-CI erzeugt standardmäßig eine Debug-App")
    require("-GenerateTestCertificate" in workflow and "VT_CERT_PASSWORD" in workflow,
            "GitHub-CI erzeugt Zertifikat und Passwort automatisch")
    require("actions/upload-artifact@v7" in workflow and "VacuumTube-Xbox-Debug-x64" in workflow,
            "GitHub-CI veröffentlicht das Debug-Paket als Artefakt")

    removes_private_key = (
        "Remove-Item artifacts\\*.pfx" in workflow
        or "Remove-Item artifacts\\VacuumTube-Xbox-Development.pfx" in workflow
    )
    excludes_private_keys = all(
        f"!artifacts/GitHubDebugDrop/**/*.{extension}" in workflow
        for extension in ("pfx", "pvk", "key", "pem")
    )
    verifies_upload_directory = "Private signing material detected in the upload directory" in workflow
    require(removes_private_key and excludes_private_keys and verifies_upload_directory,
            "Privater CI-Signaturschlüssel wird nicht als Artefakt veröffentlicht")
    require("Existing certificate or license required: **no**" in workflow,
            "Debug-Build benötigt keine vorhandene Zertifikat- oder Lizenzdatei")

    print(f"\n{len(CHECKS)} Prüfungen bestanden, {len(ERRORS)} fehlgeschlagen.")
    if ERRORS:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
