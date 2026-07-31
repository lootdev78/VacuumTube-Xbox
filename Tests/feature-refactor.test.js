'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const runtime = path.join(root, 'VacuumTubeXbox/Assets/ExtensionRuntime');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function extractObject(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing marker ${marker}`);
  const brace = source.indexOf('{', start + marker.length);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return vm.runInNewContext(`(${source.slice(brace, i + 1)})`);
    }
  }
  throw new Error(`unterminated object after ${marker}`);
}

const coreSource = read('VacuumTubeXbox/Assets/ExtensionRuntime/page/core.js');
const bridgeSource = read('VacuumTubeXbox/Assets/ExtensionRuntime/content/bridge.js');
const settingsSource = read('VacuumTubeXbox/Assets/ExtensionRuntime/page/settings.js');
const coreDefaults = extractObject(coreSource, 'VTW.defaults =');
const bridgeDefaults = extractObject(bridgeSource, 'const defaults =');
assert.deepEqual(Object.keys(bridgeDefaults).sort(), Object.keys(coreDefaults).sort(), 'core and bridge defaults must stay identical');

const panelsBlock = settingsSource.slice(settingsSource.indexOf('const panels = ['), settingsSource.indexOf('const modStatusMap'));
const panelKeys = new Set();
for (const match of panelsBlock.matchAll(/\{\s*key:\s*'([a-z0-9_]+)'/g)) panelKeys.add(match[1]);
for (const match of panelsBlock.matchAll(/'([a-z][a-z0-9_]+)'/g)) {
  if (Object.prototype.hasOwnProperty.call(coreDefaults, match[1])) panelKeys.add(match[1]);
}
for (const key of panelKeys) assert.ok(Object.prototype.hasOwnProperty.call(coreDefaults, key), `settings key has no default: ${key}`);
for (const required of [
  'adblock', 'sponsorblock', 'dearrow', 'dislikes', 'hide_shorts',
  'enable_chapters', 'enable_long_press', 'show_previous_next_buttons',
  'show_speed_button', 'playback_rate_increment', 'disable_channels_on_sidebar',
  'subtitle_all_languages', 'screen_dimming', 'who_is_watching_enabled',
  'dial_enabled', 'controller_support', 'keep_screen_awake'
]) assert.ok(panelKeys.has(required), `merged feature missing from settings: ${required}`);


assert.equal(coreDefaults.unlock_resolution, false, '8K unlock must be opt-in on Xbox for playback safety');
assert.equal(coreDefaults.keep_screen_awake, true, 'screen-saver protection should be enabled while video plays');
const nativeBridgeSource = read('VacuumTubeXbox/Services/NativeBridgeService.cs');
const displayServiceSource = read('VacuumTubeXbox/Services/DisplayRequestService.cs');
const playerSource = read('VacuumTubeXbox/Assets/ExtensionRuntime/page/upstream-player.js');
assert.match(nativeBridgeSource, /displayKeepActive/, 'native bridge must expose display keep-active RPC');
assert.match(displayServiceSource, /DisplayRequest/, 'native DisplayRequest service must exist');
assert.match(playerSource, /playing[\s\S]*displayKeepActive|displayKeepActive[\s\S]*playing/, 'player must control native display request');

const runtimeService = read('VacuumTubeXbox/Services/ExtensionRuntimeService.cs');
for (const script of ['upstream-content.js', 'upstream-player.js', 'mods-content.js', 'mods-player.js', 'settings.js']) {
  assert.match(runtimeService, new RegExp(script.replace('.', '\\.')), `${script} must be injected`);
}
assert.equal(fs.existsSync(path.join(root, 'ThirdPartySources')), false, 'full upstream source dump must not be shipped');
assert.equal(fs.existsSync(path.join(root, 'VacuumTubeXbox/Assets/OriginalSources')), false, 'duplicate original source dump must not be shipped');

// Run the merged content adapter with minimal Leanback-compatible stubs.
const jsonModifiers = [];
const playerModifiers = [];
const commandModifiers = [];
const config = { ...coreDefaults,
  signin_reminder: false,
  disable_channels_on_sidebar: true,
  hide_watched_videos: true,
  hide_watched_home: true,
  hide_watched_threshold: '90',
  preferred_codec: 'av1',
  show_paid_promotion_overlay: false,
  remove_endscreen: true,
  hide_are_you_still_watching: true
};
const localStore = new Map();
const context = vm.createContext({
  console, WeakSet, Set, Map, Promise, Date, Math, Object, Array, String, Number, Boolean, RegExp,
  URLSearchParams, Intl,
  location: { hash: '#/', href: 'https://www.youtube.com/tv#/', pathname: '/tv' },
  navigator: { language: 'de-DE' },
  localStorage: { getItem: (key) => localStore.get(key) ?? null, setItem: (key, value) => localStore.set(key, String(value)) },
  document: {
    cookie: '', documentElement: { lang: 'de', toggleAttribute() {}, dataset: {}, classList: { add() {}, remove() {} }, style: { setProperty() {} } },
    querySelectorAll: () => [], querySelector: () => null
  },
  MutationObserver: class { observe() {} disconnect() {} },
  addEventListener() {},
  setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; },
  requestAnimationFrame(fn) { return fn(); },
  structuredClone: global.structuredClone,
  globalThis: null, window: null,
  VTW: {
    config, configReady: true,
    nativeJsonParse: JSON.parse.bind(JSON), nativeJsonStringify: JSON.stringify.bind(JSON),
    addJsonModifier(fn) { jsonModifiers.push(fn); },
    addPlayerJsonModifier(fn) { playerModifiers.push(fn); },
    addCommandInputModifier(fn) { commandModifiers.push(fn); },
    setStatus() {}, log() {}, toast() {}, on() {}, getResolveCommand() { return null; }
  }
});
context.globalThis = context;
context.window = context;
vm.runInContext(read('VacuumTubeXbox/Assets/ExtensionRuntime/page/upstream-content.js'), context, { filename: 'upstream-content.js' });
assert.equal(jsonModifiers.length, 1);
assert.equal(playerModifiers.length, 1);

const content = {
  items: [
    { feedNudgeRenderer: { message: 'Sign in' } },
    { guideEntryRenderer: { title: { simpleText: 'Channel A' }, thumbnail: { thumbnails: [] } } },
    { guideEntryRenderer: { title: { simpleText: 'Subscriptions' }, icon: { iconType: 'SUBSCRIPTIONS' } } },
    { tileRenderer: { contentId: 'abcdefghijk', thumbnailOverlays: [{ thumbnailOverlayResumePlaybackRenderer: { percentDurationWatched: 95 } }] } },
    { tileRenderer: { contentId: 'lmnopqrstuv', thumbnailOverlays: [{ thumbnailOverlayResumePlaybackRenderer: { percentDurationWatched: 30 } }] } }
  ]
};
jsonModifiers[0](content);
assert.equal(content.items.some((item) => item.feedNudgeRenderer), false, 'sign-in nudge should be removable');
assert.equal(content.items.some((item) => item.guideEntryRenderer?.title?.simpleText === 'Channel A'), false, 'sidebar channel should be removable');
assert.equal(content.items.some((item) => item.guideEntryRenderer?.title?.simpleText === 'Subscriptions'), true, 'Subscriptions destination must remain');
assert.equal(content.items.some((item) => item.tileRenderer?.contentId === 'abcdefghijk'), false, 'watched video should be removed');
assert.equal(content.items.some((item) => item.tileRenderer?.contentId === 'lmnopqrstuv'), true, 'partially watched video should remain');

const playerNoAv1 = {
  paidContentOverlay: {}, endscreen: {}, messages: [{ youThereRenderer: {} }],
  streamingData: { adaptiveFormats: [{ mimeType: 'video/mp4; codecs="avc1"' }, { mimeType: 'audio/mp4' }] }
};
playerModifiers[0](playerNoAv1);
assert.equal('paidContentOverlay' in playerNoAv1, false);
assert.equal('endscreen' in playerNoAv1, false);
assert.equal(playerNoAv1.messages.length, 0);
assert.equal(playerNoAv1.streamingData.adaptiveFormats.length, 2, 'codec filter must fail open when requested codec is absent');

const playerWithAv1 = {
  streamingData: { adaptiveFormats: [
    { mimeType: 'video/mp4; codecs="avc1"' }, { mimeType: 'video/webm; codecs="av01"' }, { mimeType: 'audio/webm; codecs="opus"' }
  ] }
};
playerModifiers[0](playerWithAv1);
assert.equal(playerWithAv1.streamingData.adaptiveFormats.some((format) => /avc1/.test(format.mimeType)), false);
assert.equal(playerWithAv1.streamingData.adaptiveFormats.some((format) => /av01/.test(format.mimeType)), true);
assert.equal(playerWithAv1.streamingData.adaptiveFormats.some((format) => /^audio/.test(format.mimeType)), true);

console.log('PASS merged feature defaults, source layout and Leanback adapters');
