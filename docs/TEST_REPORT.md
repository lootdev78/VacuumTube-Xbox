# Build- und Testbericht

**Stand:** 29. Juli 2026  
**Ziel:** VacuumTube als UWP-/WinUI-2-WebView2-Client für Xbox One und Xbox Series X|S

## Ergebnis

Der Port ist nach den in dieser Umgebung möglichen Prüfungen **nicht als vollständig fehlerfrei zertifizierbar**. Adblock und alle 30 ursprünglichen Top-Level-Mods sind quellseitig enthalten und die JavaScript-/WebView-Schicht besteht die ausgeführten Tests. Ein echter UWP-x64-Build, Paketsignierung und Hardwaretests benötigen Windows/Visual Studio sowie eine erreichbare Xbox; diese Voraussetzungen stehen hier nicht zur Verfügung.

## Funktionsumfang

- Adblock: Video-Ad-Placements/-Slots, Feed-Ad-Slots, Promo-Shelves und Shorts-Ads implementiert und im Runtime-Mock getestet.
- Mods: 29/29 Top-Level-Module geladen.
- Desktop-only Funktionen ohne Xbox-Entsprechung sind absichtlich entfernt/ausgeblendet; Details in `MOD_COMPATIBILITY.md`.
- Hardwareabhängige Funktionen sind portiert, aber nicht auf Xbox bestätigt.

## Gefundene und behobene Probleme

1. CSP-Requests konnten bei Interceptorfehlern pausiert bleiben; sicherer Continue-/Disable-Fallback ergänzt.
2. Fehler in `EnsureCoreWebView2Async`, Bundle-Laden oder Navigation konnten unsichtbar bleiben; Fehleroverlay und Retry ergänzt.
3. UWP-Projekttyp-GUID korrigiert und x64-`Prefer32Bit` deaktiviert.
4. Paketbuild um `/restore`, `GenerateAppxPackageOnBuild`, Signierung und Entwicklungszertifikat ergänzt.
5. Hartcodierte Mikrofonfreigabe durch UWP-Status-/`MediaCapture`-Prüfung ersetzt.
6. Suspend/Resume um `TrySuspendAsync()`/`CoreWebView2.Resume()` und Dienstelifecycle ergänzt.
7. Der 120-Sekunden-Test fand `crypto.randomUUID is not a function`; Web-Crypto-/UUID-Fallback implementiert und Test wiederholt.

## Ausgeführte Tests

### JavaScript-Build und Syntax

- `python3 tools/build_bundle.py`
- Ergebnis: **57 Module**, Bundlegröße **230.544 Bytes**
- `node --check` für Bundle und sämtliche JavaScript-Quelldateien
- Ergebnis: **bestanden**

### Mod- und Projektvalidierung

- `python3 tools/analyze_mods.py`: **29/29** Top-Level-Mods, keine Electron-/Updater-/Node-Socket-/Node-Crypto-Abhängigkeit
- `python3 tools/validate_project.py`: **65/65 Prüfungen bestanden**
- XML/XAML, JSON und Python-Syntax: bestanden

Geprüft wurden unter anderem UWP-/WebView2-Referenzen, x64-Ziel, Manifest-Capabilities, Assets, JS→C#-Bridge, Adblockmarker, Mikrofonservice, CSP-Fallback, DIAL-UUID-Fallback, Remote-Debugging, Speicherdiagnostik, Suspend/Resume sowie Windows-Build-/Signierungseinstellungen.

### SponsorBlock

`node tools/test_sponsorblock_adapter.js`

- privater SHA-256-Präfix für `dQw4w9WgXcQ`: **`5f6b`**
- private und öffentliche Segmentantworten
- VacuumTube-Segmentmapping und nativer HTTPS-Proxy
- Ergebnis: **bestanden**

### Isolierter Chromium-Laufzeittest

`python3 tools/test_bundle_runtime.py`

Getestet mit simuliertem `chrome.webview`-Host und Xbox-Plattformdaten:

- Bundleinitialisierung
- Settings-DOM/CSS
- WebP und H5VCC
- alle 15 Xbox-Button-Mappings mit Keydown/Keyup
- R3 öffnet Settings
- JSON-Modifikatoren für Ads, Shorts und Super-Resolution
- XHR-Adblock für Browse-Antworten
- keine Console-Errors oder unbehandelten Promise-Fehler

### 120-Sekunden-Soak

- Dauer: **120 Sekunden**, **60 Messpunkte**
- RSS des gesamten Headless-Chromium-Prozessbaums:
  - Start: **711.839.744 Bytes**
  - Maximum: **745.455.616 Bytes**
  - Ende: **744.669.184 Bytes**
- Console-/Promise-Fehler: **keine**

Diese RSS-Werte sind weder WebView2- noch Xbox-AppMemoryUsage-Werte und reichen nicht für eine Aussage über Leckfreiheit oder Langzeitstabilität.

## Reale Buildversuche in dieser Umgebung

Folgende Befehle wurden tatsächlich versucht:

```text
msbuild VacuumTube.Xbox.sln /restore /p:Configuration=Release /p:Platform=x64
dotnet restore VacuumTube.Xbox.sln
pwsh -File tools/Build-Xbox.ps1 -Configuration Release -Platform x64 -Package -GenerateTestCertificate
powershell -File tools/Build-Xbox.ps1 ...
```

Ergebnis: jeweils vor Compiler-/Restorestart gescheitert, weil `msbuild`, `dotnet`, PowerShell/Visual Studio sowie Windows-SDK-Tools nicht installiert sind. Auch `MSBuild.exe`, `nuget.exe`, `makeappx.exe`, `signtool.exe`, Docker, Podman, QEMU und Wine sind nicht verfügbar. Deshalb wurde **kein APPX/MSIX erzeugt**.

## Xbox-/Netzwerkzugriff

Die Umgebung besitzt nur eine isolierte Container-Netzwerkschnittstelle und keine Xbox-/Device-Portal-Konfiguration. Installation, DIAL im realen Heimnetz, Mikrofon und Xbox-WebView2-Remote-Debugging waren daher nicht ausführbar.

Ein lokaler Navigationsversuch zu `https://www.youtube.com/tv` mit Headless Chromium lief in einen Umgebungs-/Policy-Timeout. Er ist kein Ersatz für Navigation im Xbox-WebView2-Runtime.

## Reproduzierbarer Windows-Build

Compile:

```powershell
.\tools\Build-Xbox.ps1 -Configuration Release -Platform x64
```

Entwicklungs-Sideload-Paket mit automatisch erzeugtem Testzertifikat:

```powershell
.\tools\Build-Xbox.ps1 -Configuration Release -Platform x64 -Package `
  -GenerateTestCertificate -CertificatePassword 'NUR-FUER-ENTWICKLUNG'
```

Für ein eigenes PFX:

```powershell
.\tools\Build-Xbox.ps1 -Configuration Release -Platform x64 -Package `
  -CertificatePath C:\Pfad\VacuumTube-Test.pfx `
  -CertificatePassword 'PASSWORT'
```

## Bewertung

- **Adblock:** implementiert und lokal getestet.
- **JS-/Mod-Port:** 29/29 Module vorhanden; verfügbare Tests bestanden.
- **UWP-Quellprojekt:** statisch plausibel und gehärtet, aber nicht nativ kompiliert.
- **Xbox-Hardwarefreigabe:** offen. Siehe `FINAL_AUDIT.md` und `XBOX_HARDWARE_TEST.md`.
