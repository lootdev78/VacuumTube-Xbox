'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../VacuumTubeXbox/Assets/ExtensionRuntime/xbox-extension-shim.js'), 'utf8');
const nativeMessages = [];
const webListeners = [];
const keyboardEvents = [];
const clicked = [];

const fakeChrome = {
  webview: {
    postMessage(message) { nativeMessages.push(message); },
    addEventListener(type, listener) { if (type === 'message') webListeners.push(listener); }
  }
};

const context = vm.createContext({
  console,
  Map, Set, Promise, Date, Error, Object, Array, String, Number, Boolean, RegExp,
  URLSearchParams,
  setTimeout, clearTimeout,
  screen: { width: 1920, height: 1080 },
  location: { href: 'https://www.youtube.com/tv' },
  chrome: fakeChrome,
  KeyboardEvent: class {
    constructor(type, init) { this.type = type; Object.assign(this, init); }
  },
  document: {
    dispatchEvent(event) { keyboardEvents.push(event); return true; },
    querySelectorAll() {
      return [{ textContent: 'Einstellungen', getAttribute: () => '', click: () => clicked.push('settings') }];
    }
  },
  globalThis: null,
  window: null
});
context.globalThis = context;
context.window = context;

vm.runInContext(source, context, { filename: 'xbox-extension-shim.js' });
assert.equal(context.__VTW_XBOX_NATIVE__, true);
assert.equal(typeof context.chrome.storage.sync.get, 'function');
assert.equal(typeof context.chrome.runtime.sendMessage, 'function');
assert.equal(typeof context.h5vcc.dial.DialServer, 'function');

function receive(message) {
  for (const listener of webListeners) listener({ data: message });
}

async function completeNext(operation, data) {
  const index = nativeMessages.findIndex((message) => message.type === 'nativeRpc' && message.operation === operation);
  assert.notEqual(index, -1, `missing native RPC: ${operation}`);
  const request = nativeMessages.splice(index, 1)[0];
  receive({ type: 'nativeRpcResult', id: request.id, ok: true, data });
  await Promise.resolve();
  return request;
}

(async () => {
  const getPromise = context.chrome.storage.sync.get({ enabled: true });
  await completeNext('storageGet', { enabled: false, count: 2 });
  assert.deepEqual(await getPromise, { enabled: false });

  const apiPromise = context.chrome.runtime.sendMessage({
    type: 'VTW_API_REQUEST', operation: 'dislikes', payload: { videoId: 'abcdefghijk' }
  });
  const apiRequest = await completeNext('apiRequest', { ok: true, data: { dislikes: 42 } });
  assert.equal(apiRequest.payload.operation, 'dislikes');
  assert.equal((await apiPromise).data.dislikes, 42);

  receive({ type: 'xboxController', action: 'confirm' });
  assert.deepEqual(keyboardEvents.map((event) => event.type), ['keydown', 'keyup']);
  assert.equal(keyboardEvents[0].key, 'Enter');
  assert.equal(keyboardEvents[0].__vtwXbox, true, 'native controller events must be marked');

  receive({ type: 'xboxController', action: 'openYouTubeSettings' });
  assert.deepEqual(clicked, ['settings']);

  const server = new context.h5vcc.dial.DialServer('YouTube');
  const register = nativeMessages.find((message) => message.operation === 'dialRegister');
  assert.ok(register, 'DIAL registration RPC must be sent');
  receive({ type: 'nativeRpcResult', id: register.id, ok: true, data: { running: true } });
  server.onGet('', (request, response) => {
    response.responseCode = 200;
    response.mimeType = 'text/xml';
    response.body = '<service><state>running</state></service>';
    return true;
  });
  receive({ type: 'dialRequest', requestId: 'dial-1', appName: 'YouTube', method: 'GET', path: '/apps/YouTube', body: '', host: '192.168.1.2:56789' });
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  const dialResponse = nativeMessages.find((message) => message.type === 'dialResponse' && message.requestId === 'dial-1');
  assert.equal(dialResponse.responseCode, 200);
  assert.match(dialResponse.body, /running/);

  console.log('PASS Xbox shim: storage, API bridge, Xbox controller and DIAL routing');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
