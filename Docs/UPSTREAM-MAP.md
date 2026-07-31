# Upstream-Zuordnung und Refactor

Dieses Paket enthält **keine vollständigen Kopien** der hochgeladenen VacuumTube-, youtube-webos- oder TizenTube-Quellbäume. Sie wurden als Referenz analysiert. Die Xbox-App enthält nur die konsolidierte, Xbox-adaptierte Laufzeit und die erforderlichen Lizenzhinweise.

| Quelle | Analysierter Stand | In unseren Port überführte Bereiche |
|---|---:|---|
| VacuumTube | 1.8.2 | Leanback-Modelle, DIAL-Vertrag, Werbe-/Sponsor-/DeArrow-/RYD-Funktionen, Lautstärke, Audio-only, App-Lifecycle-Ideen |
| youtube-webos | 0.5.3 | HQ-Thumbnails, Endscreen, Uhr, Kontoauswahl, Spracheinstellung, Screensaver-Fix als native DisplayRequest-Adaption, sichere frühe Leanback-Injektion |
| TizenTube | 1.14.7 | Kapitel, Queue/Long-Press, Player-Buttons, manuelle Sponsor-Kategorien, Untertitelsprachen, Vorschauen, watched filter, Dimming, Sidebar-/Abo-Optionen, Startziel, Kontoauswahl |
| VacuumTube WebExtension | 0.8.0 | gemeinsame Config-/Storage-/Diagnosebasis, YouTube-TV-Settings-UI, Navigation, Player-UI, API-Adapter |

## Ausführbare Zielmodule

- `page/network.js`: begrenzte Fetch-/XHR-/JSON-Kompatibilitätsschicht.
- `page/mods-content.js`: Adblock, Shorts, Super Resolution, DeArrow, RYD-Inhaltsanpassungen.
- `page/mods-player.js`: SponsorBlock, RYD-Playerdarstellung, Lautstärke und Leanback-Commands.
- `page/upstream-content.js`: zusammengeführte webOS-/Tizen-Inhalts- und Konto-/Sprachfunktionen.
- `page/upstream-player.js`: Xbox-Queue, Long-Press, Kapitel und zusätzliche Player-Buttons.
- `xbox-extension-shim.js`: integrierte Extension-API und DIAL-/Controller-Bridge.
- C#-Services: WebView2-Host, Storage, Mod-APIs, DIAL und `Windows.Gaming.Input`.

Die detaillierte Funktionsentscheidung steht in `FEATURE-MATRIX.md`.
