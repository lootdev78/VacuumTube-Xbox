#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / 'src/xbox/browser-entry.js'
BANNED = {
    'electron': r"require\(['\"]electron['\"]\)",
    'electron-updater': r'electron-updater|autoUpdater',
    'Node sockets': r"require\(['\"](?:dgram|http|https|net)['\"]\)",
    'Node crypto': r"require\(['\"]crypto['\"]\)",
}

source = ENTRY.read_text(encoding='utf-8')
mods = re.findall(r"require\(['\"]\.\./preload/modules/([^'\"]+)['\"]\)", source)
files = list((ROOT / 'src').rglob('*.js')) + list((ROOT / 'VacuumTube.Xbox').rglob('*.cs'))
combined = '\n'.join(p.read_text(encoding='utf-8', errors='replace') for p in files)

print(f'Loaded mods in browser entry: {len(mods)}')
for name in mods:
    candidate = ROOT / 'src/preload/modules' / name
    exists = candidate.with_suffix('.js').is_file() or (candidate / 'index.js').is_file()
    print(f'  [{"OK" if exists else "MISSING"}] {name}')

failed = False
print('\nRuntime dependency audit:')
for label, pattern in BANNED.items():
    matches = re.findall(pattern, combined)
    ok = not matches
    failed |= not ok
    print(f'  [{"OK" if ok else "FOUND"}] {label}')

bundle = ROOT / 'VacuumTube.Xbox/Web/vacuumtube.bundle.js'
print(f'\nBundle: {bundle.stat().st_size if bundle.exists() else 0} bytes')
raise SystemExit(1 if failed else 0)
