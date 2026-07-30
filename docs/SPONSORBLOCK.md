# SponsorBlock auf Xbox/WebView2

## Warum das npm-Paket nicht direkt importiert wird

Das von VacuumTube zuvor verwendete Repository `origeva/node-sponsorblock-api` ist ein Node-Wrapper. Seine dokumentierte CommonJS-Verwendung (`require('sponsorblock-api')`) ist für Electron korrekt, aber nicht für eine reine WebView2-Laufzeit. Das Paket zieht Axios ein und seine Implementierung verwendet Node-spezifische APIs.

## Xbox-Implementierung

`src/xbox/shims/sponsorblock-api.js` stellt dieselbe für VacuumTube benötigte Oberfläche bereit:

- `new SponsorBlock(userID, options)`
- `getSegments(videoID, categories)`
- `getSegmentsPrivately(videoID, categories)`
- `ResponseError`

Die private Abfrage:

1. hasht die Video-ID mit Web Crypto (`SHA-256`),
2. sendet nur die ersten vier Hex-Zeichen an `/api/skipSegments/{prefix}`,
3. filtert die Antwort lokal nach der ursprünglichen Video-ID,
4. bildet `segment: [start, end]` auf `startTime` und `endTime` ab.

HTTP läuft bevorzugt über die native UWP-Hostbrücke (`http-request`). Dadurch hängt SponsorBlock nicht von YouTubes CSP oder Browser-CORS ab. Der Host akzeptiert nur HTTPS-Ziele aus einer festen Allowlist.

`src/preload/modules/sponsorblock.js` verwendet `getSegmentsPrivately`, verwirft verspätete Antworten nach einem Videowechsel und fängt Netzwerkfehler ab.
