# Xbox-Anmeldung, Gastmodus und Sitzungspersistenz

## Behobene Ursachen

- Der Host verwendete bisher PS4/Cobalt-User-Agents und überschrieb Anfragen außerhalb von `www.youtube.com` mit `VacuumTube-Xbox/1.8.1`. Dadurch erhielten Google-Konto- und YouTube-Nebenhosts eine andere Browseridentität als die Hauptseite.
- Neue YouTube-/Google-Fenster wurden im externen Edge geöffnet. Dessen Cookies gehören nicht zum WebView2-Profil der App.
- Die Innertube-Identität mischte Xbox, PS4/Cobalt, Chrome und die Marke VacuumTube.

## Neuer Stand

- Die spätere Xbox-UA-Änderung wurde zurückgenommen; der Host verwendet wieder die beiden originalen PS4-/Cobalt-User-Agents aus VacuumTube 1.8.1.
- YouTube-/Google-Anmeldedomains bleiben im selben WebView2.
- Das standardmäßige persistente UWP-WebView2-Profil wird verwendet; InPrivate führt zu einem sichtbaren Startfehler.
- Tracking Prevention wird auf `Basic` gesetzt, damit Konto- und Sitzungscookies nicht unnötig blockiert werden.
- User-Data-Folder, Profilname, Profilpfad und InPrivate-Status erscheinen in den Runtime-Diagnosen.
- `disable-direct-sign-in.js` bleibt unverändert und setzt weiterhin `enableDirectSignIn: false`. Anmeldung erfolgt daher über den von YouTube-TV angebotenen Code-/QR-Weg.
- Die Innertube-Identität ist konsistent: `GAME_CONSOLE`, `XBOX`, Microsoft, Xbox Series X, Cobalt. Konto- und Sitzungstoken werden nicht verändert.

## Upgrade

Die Paketversion wurde anschließend auf `1.8.1.3` erhöht, damit Windows und Xbox den korrigierten Debug-Build als Update installieren können.
