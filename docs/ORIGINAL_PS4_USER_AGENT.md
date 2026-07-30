# Originaler VacuumTube-PS4-User-Agent

Der Xbox-WebView2-Port verwendet wieder exakt die beiden User-Agent-Werte aus
dem ursprünglichen VacuumTube 1.8.1:

```text
Mozilla/5.0 (PS4; Leanback Shell) Cobalt/19.lts.0-qa; compatible; VacuumTube/1.8.1
Mozilla/5.0 (PS4; Leanback Shell) Cobalt/25.lts.40.1035033; compatible; VacuumTube/1.8.1
```

Der erste Wert wird über `CoreWebView2Settings.UserAgent` als Client- bzw.
`navigator.userAgent`-Identität gesetzt. Für ausgehende Requests an
`www.youtube.com` wird wie im Original der zweite Wert gesetzt. Andere Hosts
erhalten den ursprünglichen transparenten Wert `VacuumTube/1.8.1`.

Die persistente WebView2-Profil-, Cookie- und Sitzungslogik bleibt unverändert.
`disable-direct-sign-in` bleibt ebenfalls unverändert.
