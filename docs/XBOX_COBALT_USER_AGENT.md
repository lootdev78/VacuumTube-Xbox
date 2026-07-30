# Xbox-YouTube-TV-Cobalt-Identität

Der WebView2-Host meldet sich gegenüber YouTube und Google nicht mehr als Desktop-Edge,
sondern im nativen Cobalt-Schema der YouTube-TV-App:

```text
Mozilla/5.0 (Xbox; <Modell>) Cobalt/25.lts.40.1035033-gold (unlike Gecko) Starboard/15, Microsoft_GAME_<Chipset>_<Jahr>/<Xbox-OS> (Microsoft, <Modell>)
```

Das Modell wird aus der Xbox-Geräteinformation übernommen. Bekannte Xbox-One- und
Series-X|S-Modelle erhalten passende Plattformtokens. Derselbe User-Agent gilt für
Dokumente, XHR/fetch, Service Worker und interne Google-/YouTube-Anmeldeseiten.

Innertube und `tv_config` werden konsistent als `GAME_CONSOLE`, `XBOX`, Microsoft,
Xbox-Modell und Browser `Cobalt` gemeldet. Cookies, Visitor Data, Konto-IDs,
Delegated Sessions und Authentifizierungstoken werden nicht verändert.

`disable-direct-sign-in` bleibt unverändert deaktiviert; der vorgesehene TV-Code-/QR-
Anmeldeweg und der Gastmodus bleiben davon unberührt.
