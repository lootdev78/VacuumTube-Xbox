# Bekannte Grenzen

- Das Projekt wurde in dieser Umgebung nicht mit Visual Studio/UWP-MSBuild kompiliert und nicht auf Xbox-Hardware ausgeführt.
- YouTube Leanback wird serverseitig geändert. Renderer- und DOM-Adapter können später Wartung benötigen.
- Player-/Codec-Eingriffe sind fail-open, können aber bei einer zukünftigen YouTube-Struktur automatisch übersprungen werden.
- DIAL kann bei Router-Client-Isolation, blockiertem SSDP-Multicast oder belegten Ports ausfallen. DIAL ist kein Google Cast.
- UWP-WebView2 ist kein vollständiger Chrome-Extension-Host. Die benötigten Browser-APIs werden innerhalb der App emuliert.
- Es wird nur das Xbox-Gamepad-Modell über `Windows.Gaming.Input.Gamepad` ausgewertet. Andere Browser-Gamepad-Profile und Touch-D-Pads sind deaktiviert.
- SponsorBlock, DeArrow und Return YouTube Dislike hängen von externen Community-Diensten und deren Verfügbarkeit ab.
- DeArrow liefert nicht für jedes Video Community-Titel oder -Thumbnails.
- Das experimentelle Mini-Player-Kommando funktioniert nur, wenn die aktuelle Leanback-Version diesen internen Befehl unterstützt.
- Automatische Bildwiederholratenumschaltung, echtes PiP und Selbst-Updates sind im Xbox-Dev-Mode-Build nicht implementiert.

- Sprachsuche benötigt ein von Xbox/WebView2 erkanntes Mikrofon oder Headset; die App kann fehlende Hardware nicht ersetzen.
