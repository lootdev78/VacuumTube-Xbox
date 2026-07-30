# VacuumTube Xbox

UWP-/WinUI-2-Port von VacuumTube für **Xbox One** und **Xbox Series X|S**. Die App verwendet WebView2 als Leanback-Client und benötigt zur Laufzeit weder Node.js noch Electron.

## Was geändert wurde

- Electron, Electron IPC, `electron-updater`, Auto-Updater und Node-Laufzeit entfernt.
- Alle vorhandenen DOM-, JSON- und XHR-Modifikatoren werden als ein frühes WebView2-Skript eingebunden.
- Electron-Preload-Aufrufe wurden durch eine `chrome.webview`-Hostbrücke ersetzt.
- Xbox-Controller werden nativ über `Windows.Gaming.Input` gelesen und auf die bisherigen VacuumTube-Controllercodes abgebildet.
- DIAL/„Mit TV verbinden“ läuft über native UWP-UDP-/TCP-Sockets.
- Konfiguration wird in `ApplicationData.Current.LocalSettings` gespeichert.
- WebView2 verwendet wieder exakt die beiden ursprünglichen VacuumTube-PS4-/Cobalt-User-Agents: Cobalt/19 im Client und Cobalt/25 für `www.youtube.com`-Requests.
- Cookies, DOM Storage, IndexedDB und Berechtigungen verbleiben im persistenten Standard-WebView2-Profil; InPrivate wird abgewiesen.
- Google-/YouTube-Anmeldefenster bleiben im selben WebView2-Profil, statt in einen externen Browser mit getrennten Cookies zu wechseln.
- Userstyles/Custom-CSS sind vollständig entfernt; nur internes VacuumTube-UI-CSS bleibt enthalten.
- SponsorBlock nutzt einen lokalen WebView2-Adapter statt des Node-Pakets `sponsorblock-api`.
- DeArrow, SponsorBlock und Return YouTube Dislike können über einen nativen, auf bekannte Hosts begrenzten HTTP-Proxy arbeiten.

## Projektstruktur

- `VacuumTube.Xbox/` – UWP-/WinUI-2-WebView2-Host
- `src/preload/` – portierte VacuumTube-Mods
- `src/xbox/` – Browser-Shims, Hostbrücke und App-Metadaten
- `tools/build_bundle.py` – bundelt die Mods ohne Node/npm
- `docs/MOD_COMPATIBILITY.md` – Xbox-Kompatibilitätsanalyse je Mod
- `docs/SPONSORBLOCK.md` – SponsorBlock-Implementierung
- `docs/FINAL_AUDIT.md` – verbindlicher Status aller angeforderten Prüfungen
- `docs/XBOX_HARDWARE_TEST.md` – reproduzierbare Windows-/Xbox-Testcheckliste

## Bauen

Voraussetzungen auf Windows:

1. Visual Studio 2022 mit **Universal Windows Platform development**, **.NET desktop development**, **Desktop development with C++** und Windows 11 SDK 10.0.26100.
2. Zum validierten Release-Compile im Projektordner ausführen:

   ```powershell
   .\tools\Build-Xbox.ps1 -Configuration Release -Platform x64
   ```

3. Für ein signiertes Entwicklungs-Sideload-Paket:

   ```powershell
   .\tools\Build-Xbox.ps1 -Configuration Release -Platform x64 -Package `
     -GenerateTestCertificate -CertificatePassword 'NUR-FUER-ENTWICKLUNG'
   ```

   Alternativ `-CertificatePath` und `-CertificatePassword` für ein vorhandenes PFX verwenden.

4. Xbox in den Entwicklermodus versetzen und das Paket über Visual Studio oder Xbox Device Portal installieren. Die Hardwarecheckliste in `docs/XBOX_HARDWARE_TEST.md` auf Xbox One und Series X|S getrennt ausführen.

Für Store- oder Retail-Verteilung müssen Identität, Publisher-Zertifikat und Xbox-Partner-Center-Konfiguration ersetzt werden.

## Visual Studio Code

Das Projekt enthält `.vscode/tasks.json` für Bundle/Validierung, UWP-Release-Build und ein signiertes Sideload-Paket. Die nativen Tasks funktionieren nur unter Windows mit Visual Studio 2022 oder Visual Studio Build Tools, UWP-Komponenten und Windows SDK. Visual Studio Code allein enthält kein UWP-MSBuild.

## Lokale Prüfungen

```text
python tools/build_bundle.py
python tools/analyze_mods.py
python tools/validate_project.py
node tools/test_sponsorblock_adapter.js
python tools/test_bundle_runtime.py
```

Der Chromium-Laufzeittest benötigt Chromium und das Python-Paket `websocket-client`. Der aktuelle Stand enthält 29/29 verbleibende Mod-Einstiegspunkte und getesteten JSON-/XHR-Adblock. Details und ehrliche Einschränkungen stehen in `docs/FINAL_AUDIT.md` und `docs/TEST_REPORT.md`. Eine echte UWP-/Xbox-Kompilierung ist unter Linux nicht möglich und wurde nicht als bestanden ausgegeben.

## GitHub Actions: signierte Debug-App

Der Workflow **Xbox Debug App** unter `.github/workflows/xbox-debug-app.yml` läuft auf `windows-2022`, führt Bundle-Build, Mod-/Projektprüfung, echten MSBuild-NuGet-Restore sowie einen signierten x64-Debug-UWP-Paketbuild aus. Nach erfolgreichem Lauf steht das Artefakt **VacuumTube-Xbox-Debug-x64** zum Download bereit. Details stehen in `docs/GITHUB_ACTIONS.md`.

Ein neues GitHub-Repository kann auf einem angemeldeten Rechner mit GitHub CLI so erstellt und gepusht werden:

```powershell
.\tools\Publish-GitHub.ps1 -Repository OWNER/VacuumTube-Xbox-WebView2 -Visibility public
```
