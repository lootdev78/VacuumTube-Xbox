# Architektur – VacuumTube Xbox 1.1.0

## Startpfad

1. UWP/WinUI 2 initialisiert WebView2.
2. `ExtensionRuntimeService` registriert CSS und alle Skripte über `AddScriptToExecuteOnDocumentCreatedAsync`.
3. Der Xbox-Shim emuliert den für den Port benötigten Teil von `chrome.storage` und `chrome.runtime`.
4. Die Content-Bridge lädt validierte Einstellungen aus dem nativen App-Speicher.
5. Die Leanback-Module starten vor der sichtbaren YouTube-TV-Oberfläche.

## Sicherheitsgrenzen

- `googlevideo.com`, `/videoplayback` und `/get_video_info` werden nie umgeschrieben.
- Content-Adapter sind auf bekannte `youtubei`-Pfade begrenzt.
- Player-Modifikatoren sind synchron, isoliert und fail-open.
- Bevorzugte Codecs werden nur gefiltert, wenn mindestens ein passendes Videoformat existiert.
- Ein einzelner Mod-Fehler wird geloggt und darf andere Module nicht abbrechen.

## Native Dienste

- `JsonStorageService`: Einstellungen und dreitägige Diagnoselogs.
- `ModApiService`: SponsorBlock-, DeArrow- und RYD-HTTP-Zugriffe samt Cache.
- `DialService`: SSDP/DIAL-Server und App-Routen.
- `XboxControllerService`: einzige Controllerquelle; Xbox-Tastenlayout.
- `NativeBridgeService`: RPC zwischen WebView und UWP.
- `DisplayRequestService`: native Bildschirmschoner-Sperre, exakt an Play/Pause/Ende/Suspend gekoppelt.

## WebView-Berechtigungen

Mikrofonfreigaben werden nur für HTTPS-Ursprünge von YouTube/Google erteilt. Andere Berechtigungsarten werden von VacuumTube nicht automatisch freigegeben.

## Oberfläche

VacuumTube wird innerhalb von `youtube.com/tv` ausgeführt. Die Einstellungsansicht wird in die vorhandene YouTube-TV-Einstellungsfläche montiert. Es gibt kein Browser-Extension-Popup und kein sichtbares D-Pad im Xbox-Build.
