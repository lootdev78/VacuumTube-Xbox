#!/usr/bin/env python3
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / 'src/xbox/browser-entry.js'
OUTPUT = ROOT / 'VacuumTube.Xbox/Web/vacuumtube.bundle.js'
GENERATED = ROOT / 'src/xbox/generated/resources.js'

ALIASES = {
    'vacuumtube-host': ROOT / 'src/xbox/shims/host-bridge.js',
    'fs': ROOT / 'src/xbox/shims/fs.js',
    'path': ROOT / 'src/xbox/shims/path.js',
    'os': ROOT / 'src/xbox/shims/os.js',
    'tseep/lib/ee-safe': ROOT / 'src/xbox/shims/event-emitter.js',
    'sponsorblock-api': ROOT / 'src/xbox/shims/sponsorblock-api.js',
}
REQUIRE_RE = re.compile(r"require\(\s*(['\"])([^'\"]+)\1\s*\)")


def make_resources() -> None:
    resources: dict[str, str] = {}
    for path in sorted((ROOT / 'locale').glob('*.json')):
        resources[f'/locale/{path.name}'] = path.read_text(encoding='utf-8')
    for path in sorted((ROOT / 'src/preload').rglob('*.css')):
        resources['/' + path.relative_to(ROOT).as_posix()] = path.read_text(encoding='utf-8')
    GENERATED.parent.mkdir(parents=True, exist_ok=True)
    GENERATED.write_text('module.exports = ' + json.dumps(resources, ensure_ascii=False) + '\n', encoding='utf-8')


def resolve(spec: str, parent: Path) -> Path:
    if spec in ALIASES:
        return ALIASES[spec]
    if not spec.startswith('.'):
        raise RuntimeError(f'Unsupported package import {spec!r} in {parent.relative_to(ROOT)}')
    base = (parent.parent / spec)
    candidates = [base, base.with_suffix('.js'), base.with_suffix('.json'), base / 'index.js']
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    raise FileNotFoundError(f'Cannot resolve {spec!r} from {parent}')


def module_name(path: Path) -> str:
    return '/' + path.resolve().relative_to(ROOT).as_posix()


def collect(path: Path, modules: dict[str, dict]) -> str:
    path = path.resolve()
    name = module_name(path)
    if name in modules:
        return name
    if path.suffix == '.json':
        source = 'module.exports = ' + json.dumps(json.loads(path.read_text(encoding='utf-8')), ensure_ascii=False) + ';'
        modules[name] = {'source': source, 'deps': {}}
        return name

    source = path.read_text(encoding='utf-8')
    deps: dict[str, str] = {}
    modules[name] = {'source': source, 'deps': deps}
    for match in REQUIRE_RE.finditer(source):
        spec = match.group(2)
        target = resolve(spec, path)
        deps[spec] = collect(target, modules)
    return name


def js_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def build() -> None:
    make_resources()
    modules: dict[str, dict] = {}
    entry_id = collect(ENTRY, modules)
    chunks = [
        '(function(){',
        "const platform = globalThis.__VACUUMTUBE_PLATFORM__ || {};",
        "const chromeMatch = navigator.userAgent.match(/(?:Chrome|Edg)\\/([0-9.]+)/);",
        "globalThis.process = globalThis.process || { platform: 'win32', env: {}, versions: { chrome: chromeMatch ? chromeMatch[1] : (platform.webViewVersion || '0') } };",
        'const __modules = {',
    ]
    for name in sorted(modules):
        item = modules[name]
        chunks.append(f'{js_string(name)}: function(module, exports, require, __filename, __dirname){{\n{item["source"]}\n}},')
    chunks += ['};', 'const __deps = ' + json.dumps({name: item['deps'] for name, item in modules.items()}, ensure_ascii=False) + ';']
    chunks += [
        'const __cache = {};',
        'function __require(id){',
        '  if (__cache[id]) return __cache[id].exports;',
        '  const factory = __modules[id]; if (!factory) throw new Error("Module not found: " + id);',
        '  const module = { exports: {} }; __cache[id] = module;',
        '  const dirname = id.slice(0, id.lastIndexOf("/")) || "/";',
        '  const localRequire = spec => { const target = (__deps[id] || {})[spec]; if (!target) throw new Error(`Cannot require ${spec} from ${id}`); return __require(target); };',
        '  factory(module, module.exports, localRequire, id, dirname);',
        '  return module.exports;',
        '}',
        f'__require({js_string(entry_id)});',
        '})();\n'
    ]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text('\n'.join(chunks), encoding='utf-8')
    print(f'Built {OUTPUT.relative_to(ROOT)} with {len(modules)} modules ({OUTPUT.stat().st_size} bytes)')

if __name__ == '__main__':
    build()
