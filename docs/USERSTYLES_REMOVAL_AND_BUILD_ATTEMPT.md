# Userstyles-Entfernung und nativer Buildversuch

Datum: 29. Juli 2026

## Ergebnis der gewünschten Änderung

Userstyles/Custom-CSS wurden vollständig aus der ausführbaren App entfernt:

- kein `userstyles`-Modul im Browser-Entry
- kein Userstyles-Tab in den VacuumTube-Einstellungen
- keine Konfigurationsschlüssel `userstyles` oder `disabled_userstyles`
- keine UWP-Dateiauswahl und kein `LocalFolder/Userstyles`
- keine Bridge-Kanäle `get-userstyles` oder `open-userstyles-folder`
- keine Userstyle-Texte in den Locale-Dateien
- kein Userstyle-Code im erzeugten WebView2-Bundle

Das interne CSS für das VacuumTube-Overlay, den Lautstärkebalken und notwendige Leanback-Korrekturen bleibt erhalten. Ohne dieses eingebaute CSS wäre die VacuumTube-Oberfläche nicht benutzbar.

## VacuumTube-Einstellungen auf der originalen Seite

Die Einstellungen sind in die originale `https://www.youtube.com/tv`-Seite integriert:

1. `leanback-settings.js` fügt eine VacuumTube-Kategorie mit `SETTINGS_CAT_VACUUMTUBE_OVERLAY` in die originale YouTube-TV-Einstellungsantwort ein.
2. Der dortige Button ruft `window.vtOpenSettingsOverlay()` auf.
3. `settings/index.js` hängt `#vt-settings-overlay-root` direkt an `document.body` der YouTube-TV-Seite.
4. Das Overlay kann außerdem über R3 beziehungsweise `Ctrl+O` geöffnet werden.

Der isolierte Chromium-Test bestätigte:

- `settingsOverlay: true`
- `settingsParentIsBody: true`
- `hasUserstylesTab: false`
- R3 öffnet das Overlay

## Verfügbare Tests

- JavaScript-Bundle: 55 Module, 216.961 Bytes
- verbleibende Top-Level-Mods: 29/29
- statische Projektprüfungen: 67/67
- SponsorBlock-Adapter: bestanden
- XHR-/JSON-Adblock: bestanden
- vollständige Controller-Keydown-/Keyup-Mappings: bestanden
- Chromium-Laufzeittest: keine Console- oder Promise-Fehler
- 10-Sekunden-Soaktest: bestanden, keine Console-Fehler

## Visual Studio Code und MSBuild

Die Installation wurde in der vorhandenen Debian-13-Umgebung tatsächlich versucht.

Ergebnisse:

- `apt-get install code`: Paket nicht auffindbar
- `apt-get install mono-devel msbuild nuget`: Pakete nicht auffindbar
- `apt-get update`: Repositoryzugriff lief in einen Timeout; aus der Containerumgebung war kein nutzbarer Internet-/DNS-Zugriff vorhanden
- offizieller VS-Code-Download wurde versucht, konnte von der isolierten Containerumgebung jedoch nicht als installierbares Paket abgerufen werden

Direkte Buildversuche:

- `msbuild ...`: Befehl fehlt, Exit 127
- `MSBuild.exe ...`: Befehl fehlt, Exit 127
- `dotnet restore`: Befehl fehlt, Exit 127
- `dotnet msbuild`: Befehl fehlt, Exit 127
- `pwsh tools/Build-Xbox.ps1 ...`: PowerShell fehlt, Exit 127

Das vorhandene `/usr/bin/signtool` stammt aus `libnss3-tools` und signiert JAR-Dateien. Es ist **nicht** das Windows-SDK-`signtool.exe` und kann kein APPX/MSIX signieren.

## Warum kein APPX erzeugt wurde

Dieses Projekt ist ein klassisches UWP-/WinUI-2-Projekt. Dafür werden unter Windows unter anderem benötigt:

- Visual Studio oder Visual Studio Build Tools
- UWP-/Windows-App-Workload
- Windows SDK 10.0.26100.0 entsprechend dem Projektziel
- UWP-XAML-MSBuild-Targets
- NuGet-Restore
- `MakeAppx.exe` und Windows-`SignTool.exe`

Visual Studio Code ist nur ein Editor und stellt diese Komponenten nicht bereit. Ein Linux-/Mono-MSBuild wäre selbst nach Installation kein Ersatz für die Windows-UWP-XAML- und Packaging-Toolchain.

## VS-Code-Projektintegration

Für einen Windows-Rechner wurden hinzugefügt:

- `.vscode/tasks.json`
- `.vscode/extensions.json`

Die Tasks führen das bestehende `tools/Build-Xbox.ps1` aus und können unter Windows einen Release-Build beziehungsweise ein signiertes Entwicklungspaket anstoßen, sobald Visual Studio 2022/Build Tools mit UWP-Komponenten installiert sind.

## Protokolle

- `artifacts/build-attempt/visual-studio-msbuild-attempt.log`
- `artifacts/build-attempt/apt-update.log`
- `artifacts/final-test/build-bundle.log`
- `artifacts/final-test/analyze-mods.log`
- `artifacts/final-test/validate-project.log`
- `artifacts/final-test/sponsorblock.log`
- `artifacts/final-test/runtime.log`
- `artifacts/final-test/runtime-soak-10s.log`
