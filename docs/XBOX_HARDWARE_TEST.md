# Reproduzierbarer Windows-/Xbox-Hardwaretest

Diese Checkliste beschreibt die noch nicht in der Linux-Auditumgebung ausführbaren Prüfungen. Sie ist kein Beleg, dass die Tests bereits durchgeführt wurden.

## 1. Windows-Build und NuGet-Restore

Voraussetzungen:

- Windows 10/11 x64
- Visual Studio 2022
- Workloads: Universal Windows Platform development, .NET desktop development, Desktop development with C++
- passendes Windows SDK
- Python 3 und Node.js für die Vorabtests

Ausführen:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\tools\Build-Xbox.ps1 -Configuration Release -Platform x64 -Package `
  -GenerateTestCertificate -CertificatePassword 'NUR-FUER-ENTWICKLUNG'
```

Erwartet:

- NuGet-Restore ohne Fehler
- C#-/XAML-Compile ohne Warnungen/Fehler
- Ausgabe unter `artifacts\AppxPackages`
- `.appx`/`.msix` oder passender Paketordner, `.cer` und Abhängigkeiten
- Signaturprüfung mit Windows-Pakettools erfolgreich

Das automatisch erzeugte Zertifikat ist nur für Entwicklung/Sideloading. Für Store-/Retail-Verteilung müssen Paketidentität und Publisher mit Partner Center übereinstimmen.

## 2. Deployment auf beide Xbox-Generationen

Für **Xbox One** und **Xbox Series X|S** getrennt dokumentieren:

1. Entwicklermodus aktivieren.
2. Rechner und Xbox in dasselbe vertrauenswürdige Testnetz bringen.
3. Entwicklungszertifikat auf dem Zielgerät vertrauen beziehungsweise über den vorgesehenen Deploymentweg installieren.
4. Paket mit Visual Studio oder Xbox Device Portal bereitstellen.
5. App mindestens dreimal kalt starten und dreimal aus Resume starten.
6. Buildnummer, Xbox-Modell, OS-Version und WebView2-Runtime dokumentieren.

## 3. YouTube-TV und CSP/WebView2

Debug-Build erstellen. Das Projekt setzt vor Erstellung von `CoreWebView2` das Remote-Debugging-Argument. Danach:

1. App auf Xbox starten.
2. Im Desktop-Edge `edge://inspect` öffnen.
3. Mit `https://<XBOX-IP>:11443` verbinden.
4. WebView inspizieren.
5. Prüfen:
   - `https://www.youtube.com/tv` lädt vollständig.
   - Anmeldung, Browse, Suche, Wiedergabe und Videowechsel funktionieren.
   - Bundle wird vor Seitenskripten ausgeführt.
   - keine CSP-/CORS-Fehler für gebündelte Styles, SponsorBlock, DeArrow und RYD verbleiben.
   - bei künstlich verursachtem CSP-Interceptor-Fehler bleibt Navigation möglich.
   - keine unbehandelten Exceptions oder Promise-Rejections.

## 4. Adblock- und Mod-Regression

Mindestens folgende Seiten/Antworttypen prüfen:

- Home/Browse mit Feed-Ad-Slots
- Suche mit Promo-/Premium-Shelves
- Videoantwort mit `adPlacements`/`adSlots`
- Shorts mit `adClientParams.isAd`
- SponsorBlock öffentlich und privat
- DeArrow-Titel/Thumbnails
- Return YouTube Dislike
- Hide Shorts, Music Mode, H264ify, Low-memory mode, WebP, Super-resolution-Filter
- Settings-Overlay

Bei YouTube-API-Änderungen können Feldnamen wechseln; deshalb Response-Snapshots und Datum archivieren.

## 5. Controller

Mit mindestens einem Xbox-Wireless-Controller testen:

- A/B/X/Y
- D-Pad
- LB/RB, LT/RT
- View/Menu
- L3/R3
- Halten/Repeat, Keydown/Keyup, Fokuswechsel
- R3 öffnet Settings
- kein Doppelinput zwischen `Windows.Gaming.Input` und Browser-Gamepad-Fallback
- Controller trennen/verbinden während Wiedergabe

## 6. DIAL im realen Heimnetz

Mit einem zweiten Gerät im gleichen Netz:

1. SSDP/DIAL-Suche senden und Antwort der Xbox-App erfassen.
2. `LOCATION`-URL öffnen und Device-Description validieren.
3. DIAL-App starten, Payload/YouTube-Video übergeben und Status abfragen.
4. App stoppen und Statuswechsel prüfen.
5. Router/AP-Isolation, IPv4-Multicast, Firewall und Portkonflikte separat testen.
6. Suspend/Resume während aktiver DIAL-Session testen.

## 7. Mikrofon und Sprachsuche

- Mikrofon angeschlossen/aktiviert
- Erststart ohne Berechtigung: Systemdialog erscheint
- Erlauben: YouTube-TV-Sprachsuche nimmt Audio an
- Ablehnen: App bleibt stabil und zeigt sinnvollen Zustand
- Berechtigung in Xbox-Systemeinstellungen ändern und App neu starten
- Mikrofon trennen/wieder verbinden
- mindestens Deutsch und Englisch prüfen

Die App kann eine vom Benutzer verweigerte Datenschutzentscheidung nicht programmgesteuert zurücksetzen; der Reset verweist deshalb auf Systemeinstellungen.

## 8. Suspend/Resume, Speicher und Langzeit

Je Xbox-Modell:

- 20 Suspend/Resume-Zyklen während Home, Suche und Wiedergabe
- nach Resume: WebView sichtbar, Audio korrekt, Controller aktiv, DIAL neu gestartet
- 2 Stunden Browse-/Videowechseltest
- 8 Stunden Wiedergabe-/Idle-Test
- AppMemoryUsage regelmäßig über den Bridge-Kanal `get-runtime-diagnostics` protokollieren
- Abstürze, Termination, Audioverlust, Fokusverlust und monotones Speicherwachstum dokumentieren
- zusätzlich Netzwerkverlust und Wiederverbindung testen

## Freigabekriterium

Keine Freigabe als „fehlerfrei“. Vertretbar ist eine Release-Kandidatenfreigabe erst, wenn:

- Windows-UWP-Releasebuild und Signatur erfolgreich sind,
- Installation auf Xbox One und Series X|S erfolgreich ist,
- alle obigen Hardwaretests mit Logs/Screenshots dokumentiert sind,
- keine reproduzierbaren Blocker oder kritischen Speicher-/Lifecycle-Probleme bestehen.
