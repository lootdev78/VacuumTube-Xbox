# VacuumTube Xbox 1.1.0 – konsolidierter Xbox-One-Dev-Mode-Port

Dieses Projekt ist der refaktorierte Xbox-Port. Die bereitgestellten Projekte VacuumTube 1.8.2, youtube-webos 0.5.3 und TizenTube 1.14.7 wurden **funktional verglichen**. Fehlende, auf Xbox sinnvoll ausführbare Funktionen wurden in die gemeinsame WebView2-/UWP-Laufzeit übertragen.

Das Paket enthält keine vollständigen Upstream-Quellkopien. Enthalten sind nur der konsolidierte Port, die Builddateien, Tests, Feature-Matrix und Lizenzhinweise.

## Wichtigste integrierte Bereiche

- SponsorBlock mit Kategorien, manuellen Sprüngen, Highlight und Rückgängig.
- DeArrow-Titel und -Thumbnails.
- Return YouTube Dislike im Player.
- Anzeigen-, Shorts-, Endscreen-, „Noch da?“- und Sign-in-Nudge-Filter.
- HQ-Thumbnails, Video-Vorschauen, watched filter und alphabetische Abos.
- Kapitelmarkierungen, lokale Queue, A-Long-Press, vorherige/nächste und Speed-Buttons.
- zusätzliche Untertitelsprachen und Spracheinstellungs-Fix.
- Konto-Autoselect und „Wer schaut?“-Optionen.
- Bildschirm während echter Wiedergabe aktiv halten (native `DisplayRequest`-Adaption des webOS-Screensaver-Fixes).
- Sprachsuche mit auf YouTube begrenzter WebView2-Mikrofonfreigabe.
- Startziel, Dimming, Player-Uhr, Audio-only, Pause bei Suspend und native Bildschirmschoner-Sperre während der Wiedergabe.
- native DIAL-Implementierung.
- ausschließlich native Xbox-Controller-Steuerung über `Windows.Gaming.Input.Gamepad`.
- VacuumTube-Einstellungen innerhalb der YouTube-TV-Oberfläche.
- lokale Diagnose mit automatischer Löschung nach drei Tagen.

Die vollständige Zuordnung steht in [Docs/FEATURE-MATRIX.md](Docs/FEATURE-MATRIX.md).

## Xbox-Controller

- A: bestätigen; lange halten = fokussiertes Video zur Queue.
- B: zurück.
- D-Pad/linker Stick: Navigation.
- LB/RB: Tabs.
- Menü: originale YouTube-TV-Einstellungen.
- X: Wiedergabe/Pause.
- Y: Untertitel.
- View: nächster Queue-Eintrag.
- rechter Stick drücken: Geschwindigkeit wechseln.
- LT/RT: Lautstärke.

Browser-Gamepads, PlayStation-/Nintendo-Profile und das Bildschirm-D-Pad sind im Xbox-Host deaktiviert. Eigene VacuumTube-Tastatursteuerung akzeptiert dort nur intern markierte Xbox-Ereignisse.

## Projektaufbau

```text
VacuumTubeXbox/
  Assets/ExtensionRuntime/   integrierte Leanback-/Mod-Laufzeit
  Services/                  Storage, APIs, DIAL, Controller und WebView-Bridge
  Certificates/              Debug-Zertifikat für Sideloading
Docs/
  FEATURE-MATRIX.md          kompletter Vergleich und Übernahmestatus
  UPSTREAM-MAP.md            technische Zuordnung
  ARCHITECTURE.md            Laufzeit und Sicherheitsgrenzen
Tests/
  xbox-shim.test.js
  feature-refactor.test.js
Scripts/
  Verify-Environment.ps1
  Build-Debug-MSIX.ps1
  Deploy-Xbox-DevMode.ps1
```

## Build auf Windows

Benötigt:

- Windows 10 oder 11 x64.
- Visual Studio 2022.
- Workload **Universal Windows Platform development**.
- Windows 10 SDK 10.0.19041 oder neuer.
- NuGet-Zugriff beim ersten Restore.

PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Scripts\Verify-Environment.ps1
.\Scripts\Build-Debug-MSIX.ps1
```

Debug-Zertifikat:

- Publisher: `CN=VacuumTube Xbox Debug`
- PFX-Passwort: `VacuumTubeXboxDebug!`
- Thumbprint: siehe `VacuumTubeXbox/Certificates/THUMBPRINT.txt`

## Installation auf Xbox One/Series im Dev Mode

1. Xbox Developer Mode und Device Portal aktivieren.
2. Projekt auf einem Windows-PC bauen.
3. Im Device Portal **Add** wählen.
4. erzeugtes `.msix`/`.appx`, Abhängigkeiten und bei Bedarf `.cer` hinzufügen.
5. App starten.

Optional:

```powershell
.\Scripts\Deploy-Xbox-DevMode.ps1 -XboxIp 192.168.1.50 -Pin 123456
```

## Validierungsgrenze

Das Source-Kit wurde in einer Linux-Umgebung statisch und mit Node-Regressionstests geprüft. Visual Studio, UWP-MSBuild, Windows SDK und Xbox-Hardware standen dort nicht zur Verfügung. Deshalb ist kein als getestet ausgegebenes MSIX enthalten. Der abschließende Build und Live-Test muss auf Windows und der Ziel-Xbox erfolgen.

## Lizenz

GPL-3.0-or-later. Siehe `LICENSE` und `THIRD_PARTY_NOTICES.md`.
