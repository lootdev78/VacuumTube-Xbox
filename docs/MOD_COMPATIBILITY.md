# Xbox-Kompatibilitätsanalyse der VacuumTube-Mods

**Wichtig:** „Implementiert“ bedeutet hier, dass Quellcode, Bundle und Hostbrücke vorhanden sind. Es bedeutet nicht automatisch, dass die Funktion bereits auf Xbox-Hardware validiert wurde.

Legende: **Direkt** = Browserlogik weitgehend unverändert; **Adaptiert** = gleiche Nutzerfunktion mit WebView2-/UWP-Brücke; **Workaround** = native Ersatzimplementierung; **Desktop-only** = auf Xbox ohne gleichwertige Entsprechung entfernt/ausgeblendet.

| Mod | Portstatus | Lokaler Test | Xbox-Hardwaretest | Umsetzung |
|---|---|---|---|---|
| Adblock | Direkt | Bestanden | Offen | JSON-/XHR-Filter für `adPlacements`, `adSlots`, Feed-/Promo-Shelves und Shorts-Ads. |
| Block sign-in popup | Direkt | Modul geladen | Offen | Leanback-Command-/DOM-Modifikation. |
| Controller support | Adaptiert | Alle 15 Mappings bestanden | Offen | `Windows.Gaming.Input`; Browser-Gamepad als Fallback. |
| CSS patches | Direkt | Bestanden | Offen | CSS aus gebündeltem virtuellem Dateisystem. |
| DeArrow | Adaptiert | Modul/Bridge geprüft | Offen | JSON-/XHR-Manipulation; API über nativen HTTPS-Fallback. |
| Disable direct sign-in | Direkt | Modul geladen | Offen | Konfigurationsoverride. |
| Encryption notice | Direkt | Modul geladen | Offen | DOM-/Command-Modifikation. |
| Exit fix | Adaptiert | Bridge geprüft | Offen | Electron-Exit durch UWP-App-Exit. |
| Reload fixes | Adaptiert | Bridge geprüft | Offen | Reload/Relaunch über Hostbridge. |
| Voice fix | Adaptiert | Quelle/Permissionpfad geprüft | Offen | Manifest, UWP-Mikrofonstatus, `MediaCapture` und WebView2-Permission. |
| h264ify | Direkt | Modul geladen | Offen | Stream-/Codecfilterung in JavaScript. |
| h5vcc / DIAL | Workaround | JS-Oberfläche/UUID bestanden | Offen | UWP `DatagramSocket`/`StreamSocketListener`; kein Node-`dgram`/`http`. |
| Hide Shorts | Direkt | Modul geladen | Offen | XHR-Antwortmodifikation. |
| Identification | Adaptiert | Modul geladen | Offen | Gerätefelder auf Xbox/Microsoft/WebView2. |
| Keybinds | Direkt | Controllerpfad bestanden | Offen | Keyboard-/Command-Resolver bleibt erhalten. |
| Leanback settings | Adaptiert | DOM/Bridge geprüft | Offen | Externe Links über UWP Launcher. |
| Low-memory mode | Direkt | Modul geladen | Offen | Environment-Override; echte Xbox-Wirkung noch messen. |
| Mouse | Direkt | Modul geladen | Offen | DOM-Mauslogik. |
| Music mode | Adaptiert | Modul/Bridge geprüft | Offen | Player-/JSON-Modifikation; Hostaktionen über WebView2. |
| No F11 | Direkt | Modul geladen | Offen | Keyboard-Handler. |
| Pause on blur | Adaptiert | Bridge geprüft | Offen | UWP-Fokusstatus an JavaScript. |
| Remove super resolution | Direkt | JSON-Test bestanden | Offen | JSON-Modifikation. |
| Return YouTube Dislike | Adaptiert | Modul/Bridge geprüft | Offen | XHR-Modifikation und nativer HTTPS-Fallback. |
| Settings overlay | Adaptiert | DOM/Controller bestanden | Offen | Xbox-Navigation; Desktop-only Schalter ausgeblendet. |
| SponsorBlock | Adaptiert | Adaptertests bestanden | Offen | Web Crypto, private Präfixabfrage und Hostproxy. |
| WebP support | Direkt | Bestanden | Offen | Konfigurationsoverride. |
| Touch support | Direkt | Modul geladen | Offen | Touch-Overlay; auf Xbox standardmäßig aus. |
| Voice privacy notice | Direkt | Modul geladen | Offen | Konfigurationsoverride. |
| Volume control | Direkt | Modul geladen | Offen | DOM-/Video-/Controllerlogik. |

## Adblock-Abdeckung

Der Port enthält und testet aktuell folgende Filterpfade:

- Videoantworten: `adPlacements`, `adSlots`
- Home/Browse/Search: `adSlotRenderer`, `promoShelfRenderer`
- Premium-/Upsell-Shelves über vorhandene Rendererfilter
- Shorts: `adClientParams.isAd`

Die Filter sind implementiert. Da YouTube private Response-Strukturen jederzeit ändern kann, muss die Wirkung auf echter `youtube.com/tv`-Navigation regressionsgetestet werden.

## Funktionen ohne echte 1:1-Entsprechung

- **Auto-Updater:** absichtlich vollständig entfernt. Updates erfolgen über Store/Partner Center oder neues Sideload-Paket.
- **Keep on top / Fensterdekorationen:** auf einer Xbox-Vollbild-App nicht sinnvoll.
- **Wayland HDR:** Linux-spezifisch.
- **Hardware-decoding-Schalter:** Electron-Command-Line-Flag ist in WebView2/Xbox nicht gleichwertig steuerbar; Decoderpipeline bleibt systemverwaltet.
- **Userstyles/Custom-CSS:** auf Wunsch vollständig entfernt.
- **Mikrofon-Reset:** eine Benutzerentscheidung kann nicht programmgesteuert zurückgesetzt werden; App meldet `unsupported` und erfordert Xbox-Systemeinstellungen.
- **DIAL/CSP:** funktionale UWP-/WebView2-Ersatzpfade sind vorhanden, aber erst im realen Heimnetz beziehungsweise Xbox-WebView2-Runtime beweisbar.

## Gesamturteil

Alle 29 verbleibenden Mod-Einstiegspunkte sind im Xbox-Bundle vorhanden. Die Aussage „alle VacuumTube-Funktionen 1:1 vollständig bestätigt“ wäre dennoch falsch: Desktop-only Funktionen sind bewusst nicht portiert, mehrere Funktionen verwenden Plattform-Workarounds, und sämtliche hardware-/netzwerkabhängigen Pfade warten noch auf echte Xbox-Validierung.
