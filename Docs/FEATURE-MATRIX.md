# Feature-Matrix – VacuumTube Xbox 1.1.0

Verglichen wurden die vom Nutzer bereitgestellten Stände:

- VacuumTube 1.8.2
- youtube-webos 0.5.3
- TizenTube 1.14.7
- VacuumTube WebExtension 0.8.0 als bisherige gemeinsame Basis

Die Upstream-Bäume werden **nicht als vollständige Kopien mitgeliefert**. Die Tabelle dokumentiert, welche Funktionen in die Xbox-Laufzeit übertragen, nativ ersetzt oder bewusst nicht integriert wurden.

## Kernmods und Inhalte

| Funktion | Quelle(n) | Status in 1.1.0 | Xbox-Umsetzung |
|---|---|---:|---|
| Werbefilter | alle drei | Integriert | Begrenzte Leanback-JSON-/Fetch-/XHR-Adapter; Medien-URLs bleiben ausgeschlossen |
| SponsorBlock | alle drei | Integriert | Native API-Bridge, Kategorien, automatische und manuelle Sprünge, Rückgängig, Highlight |
| DeArrow Titel | VacuumTube, TizenTube | Integriert | API-Cache plus Leanback-Kachel-Adapter |
| DeArrow Thumbnails | VacuumTube, TizenTube | Integriert | API-Cache plus vorhandene Thumbnail-Strukturen |
| Return YouTube Dislike | VacuumTube | Integriert | API-Bridge, Anzeige in der erkannten Player-Aktionsleiste |
| Shorts entfernen | alle drei | Integriert | Daten- und DOM-Filter für Guide, Regale, Kacheln und Navigation |
| Super Resolution entfernen | VacuumTube | Integriert | Fail-open Qualitätsfilter |
| HQ-Thumbnails | youtube-webos, TizenTube | Integriert | sichere URL-Aufwertung und DeArrow-Fallback |
| Gesehene Videos ausblenden | TizenTube | Integriert | pro Seite und Prozentschwelle |
| Video-Vorschauen | TizenTube | Integriert | Leanback `startInlinePlaybackCommand`, nur wenn ein sicherer Endpunkt vorhanden ist |
| Abos alphabetisch sortieren | TizenTube | Integriert | sekundäre Abonnement-Tabs |
| Kanalverknüpfungen im Guide ausblenden | TizenTube | Integriert | nur `guideEntryRenderer` mit Kanal-Thumbnail; Hauptziel „Abos“ bleibt |
| Anmelde-Erinnerungen | TizenTube | Integriert | Feed-Nudge-/Alert-Filter plus DOM-Fallback |
| Paid-Promotion-Hinweis | TizenTube | Integriert | Player-Modell, ohne Streamdaten zu ändern |
| Endscreen entfernen | youtube-webos, TizenTube | Integriert | Modell- und CSS-Fallback |
| „Noch da?“-Hinweis | TizenTube | Integriert | Message-/Command-Filter |

## Player und Bedienung

| Funktion | Quelle(n) | Status in 1.1.0 | Xbox-Umsetzung |
|---|---|---:|---|
| Wiedergabegeschwindigkeit | TizenTube | Integriert | 0,25×–3×; Schritt 0,1/0,25/0,5 einstellbar |
| Lautstärkesteuerung | VacuumTube | Integriert | native Leanback-Playerlautstärke über Xbox LT/RT; keine Desktop-Lautstärke-HUD-Kopie |
| Erweiterte/Feste Player-UI | TizenTube | Integriert | Schaltflächen-Adapter sind separat deaktivierbar und werden nur an erkannte originale Player-Leisten montiert |
| Bevorzugte Qualität | youtube-webos, TizenTube | Integriert | vorhandene Player-API `setPlaybackQualityRange`, fail-open |
| Auflösungsfreigabe | VacuumTube, youtube-webos | Integriert, opt-in | 8K-Override ist aus Wiedergabesicherheitsgründen standardmäßig aus und kann im VacuumTube-Menü aktiviert werden |
| Bevorzugter Codec | VacuumTube, TizenTube | Integriert, optional | Filter nur bei vorhandenem Treffer; sonst bleiben alle Formate |
| Vorherige/Nächste Schaltflächen | TizenTube | Integriert | originale Player-Leiste oder lokale Queue als Fallback |
| Geschwindigkeits-Schaltfläche | TizenTube | Integriert | originale Player-Leiste |
| SponsorBlock-Highlight-Schaltfläche | TizenTube | Integriert | nur sichtbar, wenn Highlight-Daten existieren |
| Mini-Player-Schaltfläche | TizenTube | Experimentell | ruft nur YouTubes vorhandenen internen Befehl auf |
| Kapitel | TizenTube | Integriert | Zeitstempel aus sichtbarer Beschreibung, Marker auf erkannter Zeitleiste |
| Lokale Video-Queue | TizenTube | Integriert | A lang drücken; View-Taste springt zum nächsten Queue-Eintrag |
| Player-Uhr | youtube-webos, TizenTube | Integriert | 12/24 Stunden und Sekunden |
| Bildschirm aktiv halten | youtube-webos | Integriert | native UWP `DisplayRequest` nur während laufender Wiedergabe; Freigabe bei Pause, Ende, Suspend und Seitenwechsel |
| Nur-Audio | VacuumTube | Integriert | Videobild ausblenden, Stream nicht umschreiben |
| Pause bei App-Suspend | VacuumTube | Integriert | UWP-Lifecycle statt Desktop-Fokus-Hook |
| Player-Elemente ein-/ausblenden | VacuumTube-Port | Integriert | Controls, Zeitleiste, Titel, Zeit, Buttons, Captions, Settings, RYD, Sponsor-Marker |
| Xbox-Controller | VacuumTube, TizenTube | Integriert | ausschließlich `Windows.Gaming.Input.Gamepad` |
| Touch-D-Pad / Browser-Gamepads | VacuumTube | Nicht im Xbox-Build | im nativen Host hart deaktiviert |

### Xbox-Tastenbelegung

| Taste | Aktion |
|---|---|
| A | bestätigen; 650 ms halten = fokussiertes Video zur Queue |
| B | zurück |
| D-Pad / linker Stick | Navigation |
| LB / RB | vorheriger / nächster Tab |
| Menü | originale YouTube-TV-Einstellungen öffnen |
| X | Wiedergabe/Pause |
| Y | Untertitel |
| View | nächster Queue-Eintrag |
| rechter Stick drücken | Geschwindigkeit wechseln |
| LT / RT | Lautstärke leiser / lauter |

Alle von VacuumTube erzeugten Tastaturereignisse sind intern als Xbox-Ereignisse markiert. Die eigene Einstellungs- und Mod-Steuerung ignoriert im Xbox-Host normale PC-Tastatureingaben.

## Konto, Sprache und Plattform

| Funktion | Quelle(n) | Status in 1.1.0 | Xbox-Umsetzung |
|---|---|---:|---|
| Konto automatisch auswählen | youtube-webos | Integriert | klickt nur eine erkannte Kontokachel |
| „Wer schaut?“ beim Start | TizenTube | Integriert | kompatible Leanback-Recurring-Actions, fail-open |
| „Wer schaut?“ beim Beenden | TizenTube | Integriert | `requestAccountSelectorCommand` oder sichtbarer Konto-Wechsel-Fallback |
| Sprachsuche | VacuumTube | Integriert | Mikrofon-Capability plus WebView2-Freigabe ausschließlich für erlaubte YouTube-/Google-HTTPS-Ursprünge |
| Spracheinstellungs-Fix | youtube-webos | Integriert | YouTube-PREF-Cookie, anschließend Reload |
| Zusätzliche Untertitelsprachen | TizenTube | Integriert | vorhandenes Auto-Übersetzen-Menü wird erweitert |
| Startziel | TizenTube | Integriert | Home, Abos, Mediathek oder Live |
| Startseite bei Wiederaufnahme neu laden | TizenTube | Integriert | optionales erneutes Anwenden des gewählten Startziels auf wiederhergestellte Sitzungen |
| Bildschirm dimmen | TizenTube | Integriert | WebView-CSS-Overlay nach Xbox-Inaktivität |
| Fokus-Theme | TizenTube | Integriert | YouTube-TV, hoher Kontrast oder blau |
| DIAL | VacuumTube | Nativ integriert | SSDP, DIAL-HTTP, JS-Routen und Launch-Bridge |
| Diagnose/Logs | VacuumTube-Port | Integriert | App-local storage, automatische Löschung nach drei Tagen |

## Durch Xbox/UWP ersetzt

| Upstream-Funktion | Ersatz in der Xbox-App |
|---|---|
| Vollbild | UWP-App startet nativ im Vollbild |
| Fensterdekorationen / Always-on-top | auf Xbox nicht anwendbar |
| Hardware-Decoding-Schalter | Xbox/WebView2 entscheidet nativ; kein unsicherer Chromium-Flag |
| Low-Memory-Flag | Xbox-App-Lifecycle und WebView2-Speicherverwaltung |
| Pause bei Blur | UWP Suspend/Resume |
| User-Agent-Spoofing für alle Requests | nicht global; die App lädt direkt `/tv`, Player/Streams behalten konsistente WebView-Daten |

## Nicht integriert, weil auf Xbox Dev Mode nicht sicher oder nicht verfügbar

- TizenTube Auto-Frame-Rate: eine WebView kann den Xbox-Ausgabemodus nicht zuverlässig pro Video umschalten.
- TizenTube Selbst-Updater: Dev-Mode-Pakete werden über Device Portal/Visual Studio aktualisiert; die App ersetzt ihr eigenes signiertes Paket nicht.
- Picture-in-Picture / Mini-Player-Tausch: Xbox-UWP-WebView2 bietet dafür keinen verlässlich unterstützten TV-Fenstermodus. Der vorhandene YouTube-Mini-Player-Befehl bleibt experimentell.
- Super-Thanks- und AI-Ask-Schaltflächen: die benötigten YouTube-Servicebefehle werden auf Leanback/Xbox nicht konsistent ausgeliefert; es werden keine funktionslosen Buttons erzeugt.
- VacuumTube HDR-, Wayland-, Fenster- und Chromium-Startflags: Electron-/Desktop-spezifisch.
- Userstyles: auf ausdrücklichen Wunsch nicht enthalten.
