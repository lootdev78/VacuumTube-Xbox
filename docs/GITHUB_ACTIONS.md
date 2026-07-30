# GitHub Actions: Xbox Debug App

Der Workflow `.github/workflows/xbox-debug-app.yml` baut bei jedem Push auf `main`, bei Pull Requests und manuell über **Actions → Xbox Debug App → Run workflow**.

## Ausgabe

Der Windows-Runner erzeugt das Artefakt **VacuumTube-Xbox-Debug-x64** mit:

- signiertem x64-Debug-APPX/MSIX beziehungsweise dem erzeugten `_Test`-Sideload-Ordner,
- den vom UWP-Paketbuild ermittelten Abhängigkeiten,
- `VacuumTube-Xbox-Development.cer` als öffentlichem Entwicklungszertifikat,
- PDB-/Debugsymbolen,
- `SHA256SUMS.txt`.

Der private PFX-Schlüssel wird nur kurz auf dem ephemeren Runner erzeugt, nicht als GitHub-Artefakt veröffentlicht und vor dem Upload gelöscht.

## Installation auf Xbox

1. Xbox in den Entwicklermodus versetzen.
2. Das Artefakt **VacuumTube-Xbox-Debug-x64** aus dem erfolgreichen Workflow herunterladen und entpacken.
3. Im Xbox Device Portal zuerst das öffentliche `.cer` installieren, falls das Gerät dem Zertifikat noch nicht vertraut.
4. Das APPX/MSIX aus `AppxPackages` zusammen mit den dort erzeugten Abhängigkeiten installieren.
5. App starten und die Hardwaretests aus `docs/XBOX_HARDWARE_TEST.md` durchführen.

Das Zertifikat ist ausschließlich für Entwicklung/Sideloading gedacht. Für Microsoft Store oder Retail-Xbox muss die Paketidentität samt Publisher-Zertifikat durch die Partner-Center-Werte ersetzt werden.

## Runner

Der Workflow verwendet bewusst `windows-2022`. Dieses GitHub-Image enthält Visual Studio 2022 Enterprise, den UWP-Workload und Windows SDK 10.0.26100. Das fest gewählte Image verhindert unerwartete Wechsel von `windows-latest`.
