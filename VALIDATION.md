# Validierung – VacuumTube Xbox 1.1.0

Stand: 31. Juli 2026

## Ergebnis

Der refaktorierte Quellbaum wurde als Xbox-One/Series-Dev-Mode-Source-Kit statisch geprüft. Die drei bereitgestellten Projekte wurden nicht als vollständige Quellkopien beigelegt; ihre Xbox-tauglichen Funktionen wurden in die gemeinsame UWP-/WebView2-Laufzeit übertragen und in `Docs/FEATURE-MATRIX.md` zugeordnet.

Ein echter UWP-/MSIX-Build und ein Hardwaretest waren in dieser Linux-Umgebung nicht möglich, weil Visual Studio, UWP-MSBuild, Windows SDK und eine Xbox-Dev-Mode-Laufzeit fehlen. Das Paket enthält deshalb bewusst kein als getestet ausgegebenes MSIX.

## Bestandene Prüfungen

### JavaScript-Laufzeit

- Alle JavaScript-Dateien unter `VacuumTubeXbox/Assets/ExtensionRuntime` und `Tests` bestehen `node --check`.
- `Tests/xbox-shim.test.js` besteht:
  - emuliertes `chrome.storage`
  - native Mod-API-Bridge
  - markierte Xbox-Controller-Ereignisse
  - DIAL-Routenregistrierung und Antwortweiterleitung
- `Tests/feature-refactor.test.js` besteht:
  - identische Default-Schlüssel in Core und Storage-Bridge
  - alle zusammengeführten Funktionen sind im VacuumTube-Menü erreichbar
  - 8K-Auflösungsfreigabe ist aus Wiedergabesicherheitsgründen standardmäßig aus
  - native `DisplayRequest`-Anbindung ist vorhanden
  - Sign-in-, Sidebar-, Watched-, Paid-Promotion-, Endscreen- und „Noch da?“-Filter
  - Codec-Filter bleibt fail-open, wenn der gewünschte Codec nicht verfügbar ist
  - keine vollständigen Upstream-Quellbäume im Ausgabepaket

### Projektstruktur

- `VacuumTubeXbox.csproj`, `Package.appxmanifest`, `App.xaml` und `MainPage.xaml` sind valides XML.
- Alle expliziten Projektverweise existieren.
- Alle sechs Manifest-Logo-/Splashscreen-Dateien existieren und haben die erwarteten Abmessungen.
- Alle 13 document-start Runtime-Skripte und beide CSS-Dateien sind vorhanden.
- Alle C#-Dateien bestehen einen lexikalischen Klammer-/Delimiter-Scan.
- Versionsangaben sind auf `1.1.0` beziehungsweise `1.1.0.0` synchronisiert.

### YouTube-TV-Einstellungen und Eingabe

- Das Extension-Icon/Browser-Popup ist nicht Bestandteil der Xbox-App.
- VacuumTube wird ausschließlich als genau eine DOM-Zeile in die sichtbare originale YouTube-TV-Einstellungsliste eingesetzt.
- Eine generische Settings-JSON-Injektion ist deaktiviert, damit kein zweiter Hauptnavigationseintrag „Einstellungen“ entsteht.
- Die VacuumTube-Inhalte werden im vorhandenen rechten YouTube-TV-Einstellungsbereich montiert.
- Eigene Einstellungen akzeptieren im Xbox-Host nur intern markierte Xbox-Ereignisse.
- Browser-Gamepad-Schleifen und Touch-/Bildschirm-D-Pad sind im Xbox-Build deaktiviert.
- Die native Eingabeschicht verwendet ausschließlich `Windows.Gaming.Input.Gamepad` und das Xbox-Tastenlayout.

### Wiedergabe- und Netzwerksicherheit

- `googlevideo.com`, `/videoplayback` und `/get_video_info` sind in der Netzwerkebene absolut ausgeschlossen.
- Fetch/XHR-Adapter sind auf bekannte Leanback-Inhalts- und Player-Endpunkte begrenzt und arbeiten fail-open.
- Player-Modifikatoren ersetzen keine Signaturen, Tokens oder Medien-URLs.
- Adblock entfernt nur bekannte Werbecontainer.
- Codec- und Super-Resolution-Filter erhalten die Originalformate, falls sonst kein nutzbarer Treffer übrig bliebe.
- Die maximale 8K-Auflösungsmeldung ist standardmäßig deaktiviert und bleibt optional.
- Alle bekannten Tastaturzugriffe behandeln fehlendes `event.key` defensiv.

### Aus youtube-webos/TizenTube nativ übernommene Plattformfunktionen

- Der webOS-Screensaver-Fix wurde als native UWP-`DisplayRequest`-Steuerung umgesetzt.
- Die Anzeige wird nur während tatsächlicher Videowiedergabe aktiv gehalten und bei Pause, Ende, Seitenwechsel, App-Suspend oder deaktivierter Einstellung wieder freigegeben.
- Sprachsuche besitzt eine Mikrofon-Capability; WebView2-Mikrofonfreigaben werden nur für erlaubte YouTube-/Google-HTTPS-Ursprünge erteilt.
- App-Suspend/Resume wird an die integrierte Player-Laufzeit weitergegeben.

### DIAL

- SSDP-/DIAL-Quellpfade, HTTP-Routing und WebView-Bridge wurden statisch geprüft.
- HTTP-Port-Fallback erzeugt pro Versuch einen frischen `StreamSocketListener`.
- Start/Stop wird durch eine Lifecycle-Sperre serialisiert.
- Netzwerkcallbacks übertragen WebView-Nachrichten auf den UI-Dispatcher.
- DIAL ist als YouTube-Empfänger implementiert; es ist kein Google-Cast-Ersatz.

### Debug-Zertifikat

- Subject und Publisher: `CN=VacuumTube Xbox Debug`
- SHA-1: `5248EC8A97A9D3F100CF08573D4AF3AD26106D4B`
- Gültig: 31.07.2026 bis 30.07.2031
- 2048-Bit RSA, Digital Signature, Code-Signing-EKU
- Das PFX lässt sich mit dem dokumentierten Passwort öffnen und enthält einen gültigen privaten Schlüssel.

## Nicht in dieser Umgebung prüfbar

- NuGet-Restore von `Microsoft.UI.Xaml`/WebView2.
- C#-/XAML-Kompilierung mit UWP-MSBuild.
- Erzeugung und Signierung einer realen `.msix`/`.appx`.
- Installation über Xbox Device Portal.
- WebView2-Verhalten der konkreten Xbox-Systemversion.
- SSDP-Multicast und DIAL im realen lokalen Netzwerk.
- Anmeldung, Sprachsuche und Live-Wiedergabe gegen die aktuell serverseitig ausgelieferte Fassung von `youtube.com/tv`.
- Live-Kompatibilität aller internen YouTube-TV-Renderer und Player-Schaltflächen.

## Erforderlicher Abschluss auf Windows/Xbox

1. `Scripts\Verify-Environment.ps1` ausführen.
2. `Scripts\Build-Debug-MSIX.ps1` ausführen.
3. Paket und erzeugte Abhängigkeiten über Xbox Device Portal installieren.
4. Anmeldung, Wiedergabe, VacuumTube-Eintrag, Mods, Xbox-Controller und DIAL auf der Zielkonsole testen.
5. Bei einer abweichenden YouTube-TV-Renderer-Version Remote-Debugging verwenden und nur den betroffenen Leanback-Adapter anpassen.
