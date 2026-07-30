# Abschließende Implementierungs- und Hardwareaudit

**Stand:** 29. Juli 2026  
**Projekt:** VacuumTube Xbox – UWP/WinUI 2/WebView2, x64

## Verbindliches Ergebnis

- **Adblock ist implementiert und lokal getestet.** Die JSON-/XHR-Modifikatoren entfernen Video-Ad-Placements, Video-Ad-Slots, Feed-Ad-Slots, Promo-Shelves und Shorts-Anzeigen.
- **Alle 30 ursprünglichen Top-Level-Mods werden geladen.** Ihre JavaScript-Einstiegspunkte, Hostbridge-Kanäle und browserseitigen Workarounds sind vorhanden.
- **Nicht alle ursprünglichen Desktopfunktionen sind 1:1 auf Xbox abbildbar.** Updater, Keep-on-top, Fensterdekorationen, Wayland-HDR und Electron-Command-Line-Schalter wurden bewusst entfernt oder ausgeblendet. DIAL, Netzwerkzugriffe und Hostfunktionen verwenden UWP-/WebView2-Ersatzimplementierungen.
- **Eine Freigabe als fehlerfrei oder Xbox-zertifiziert ist nicht möglich.** In der Testumgebung fehlen Windows, Visual Studio/UWP-MSBuild, Windows SDK und eine erreichbare Xbox.

## Status der angeforderten Prüfungen

| Prüfung | Status | Tatsächlich ausgeführt / Ergebnis |
|---|---|---|
| C#-/XAML-Kompilierung mit UWP-MSBuild | **Versucht, nicht ausführbar** | `msbuild` und `MSBuild.exe` aufgerufen/gesucht; Toolchain fehlt, Exit 127 vor Compilerstart. C# wurde nur lexikalisch/statisch geprüft. |
| NuGet-Restore unter Visual Studio | **Versucht, nicht ausführbar** | `msbuild /restore` und `dotnet restore` versucht; `msbuild`, `dotnet`, Visual Studio und `nuget.exe` fehlen. |
| Signiertes APPX/MSIX | **Nicht erzeugt** | Buildskript besitzt Paket- und Testzertifikatpfad, aber `makeappx.exe`, `signtool.exe` und UWP-MSBuild fehlen. Es existiert kein behauptetes Installationspaket. |
| Installation auf Xbox One | **Nicht ausführbar** | Keine Xbox, keine Device-Portal-Adresse und keine Anmeldedaten in der Umgebung. |
| Installation auf Xbox Series X\|S | **Nicht ausführbar** | Keine Xbox, keine Device-Portal-Adresse und keine Anmeldedaten in der Umgebung. |
| Echte Navigation zu YouTube TV | **Lokal versucht, Xbox offen** | Headless Chromium gegen `https://www.youtube.com/tv` lief in einen Netzwerk-/Policy-Timeout. Das ist kein WebView2-/Xbox-Test. |
| CSP-Manipulation im Xbox-WebView2-Runtime | **Quellseitig implementiert, Hardwaretest offen** | CDP-Fetch-Interceptor mit Continue-/Disable-Fallback statisch geprüft. Echte Header-Manipulation benötigt WebView2 auf Xbox und Remote-DevTools. |
| DIAL-Multicast im realen Heimnetz | **Quellseitig implementiert, Hardwaretest offen** | UWP `DatagramSocket`/`StreamSocketListener`, Lifecycle und JS-Brücke geprüft. Kein Zugriff auf Xbox oder reales Heimnetz. |
| Mikrofon und Sprachsuche | **Berechtigung implementiert, Hardwaretest offen** | Manifest-Capability, `DeviceAccessInformation`, `MediaCapture.InitializeAsync` und YouTube-begrenzte WebView2-Permission implementiert. Kein Mikrofon-/Xbox-Laufzeittest. |
| Suspend/Resume | **Implementiert, Hardwaretest offen** | UWP-Ereignisse, Dienstestopp/-start, WebView-Ausblendung, `TrySuspendAsync()` und `CoreWebView2.Resume()` statisch geprüft. |
| Speicher-/Langzeittest | **Teilweise bestanden** | 120 Sekunden isoliertes Headless Chromium, 60 Messpunkte, keine Console-/Promise-Fehler; RSS 711.839.744 → max. 745.455.616 → 744.669.184 Bytes. Kein Xbox-Speichertest und keine Aussage über Langzeit-Leckfreiheit. |

## Gefundene und behobene Fehler

1. UWP-C#-Projekttyp-GUID auf den offiziellen UWP-Projekttyp korrigiert.
2. Paketbuild ergänzt um Restore, `GenerateAppxPackageOnBuild`, x64 und Paketsignierung.
3. Hartcodierte Mikrofonfreigabe durch echte UWP-Gerätezugriffs-/`MediaCapture`-Prüfung ersetzt.
4. CSP-Interceptor so gehärtet, dass pausierte Requests bei Fehlern unverändert fortgesetzt werden.
5. Fehler in WebView2-Start und Navigation erhalten sichtbaren Retry-Pfad.
6. `Prefer32Bit` für das x64-Xbox-Ziel deaktiviert.
7. UWP Suspend/Resume ruft nun `TrySuspendAsync()` und `Resume()` auf und stoppt/startet DIAL sowie Gamepad-Brücke.
8. `crypto.randomUUID()`-Annahme durch kompatiblen Web-Crypto-Fallback ersetzt; dieser Fehler wurde erst im 120-Sekunden-Laufzeittest gefunden.

## Verfügbare lokale Testergebnisse

- JavaScript-Bundle: **57 Module**, **230.544 Bytes**
- Top-Level-Mods: **29/29 geladen**
- Statische Projektvalidierung: **65/65 bestanden**
- SponsorBlock-Adapter: öffentliche/private Abfrage, Proxy und SHA-256-Präfix `5f6b` bestanden
- JavaScript-Syntax: alle Quellen und Bundle bestanden
- Chromium-Runtime: DOM/CSS, WebP, H5VCC, JSON-/XHR-Adblock, alle Controller-Mappings und Settings-Shortcut bestanden
- 120-Sekunden-Soak: keine Console- oder Promise-Fehler

## Was für eine echte Freigabe noch zwingend ausgeführt werden muss

Die Schritte stehen reproduzierbar in `docs/XBOX_HARDWARE_TEST.md`. Eine Freigabe sollte erst erfolgen, wenn mindestens ein Windows-Releasebuild, ein signiertes Sideload-Paket und Tests auf **Xbox One sowie Xbox Series X|S** dokumentiert sind.
