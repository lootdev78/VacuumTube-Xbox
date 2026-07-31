(() => {
  'use strict';
  if (globalThis.__VTW_XBOX_SHIM__) return;
  globalThis.__VTW_XBOX_SHIM__ = true;
  globalThis.__VTW_XBOX_NATIVE__ = true;

  const pending = new Map();
  const storageListeners = new Set();
  const runtimeListeners = new Set();
  let counter = 0;

  const postNative = (message) => {
    if (!globalThis.chrome?.webview?.postMessage) throw new Error('WebView2 bridge unavailable');
    globalThis.chrome.webview.postMessage(message);
  };

  const rpc = (operation, payload = {}, timeout = 12000) => new Promise((resolve, reject) => {
    const id = `vt-xbox-${Date.now()}-${++counter}`;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${operation}: native timeout`));
    }, timeout);
    pending.set(id, { resolve, reject, timer });
    postNative({ type: 'nativeRpc', id, operation, payload });
  });

  const objectOnly = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const selectStorageKeys = (all, keys) => {
    const source = objectOnly(all);
    if (keys == null) return { ...source };
    if (typeof keys === 'string') return Object.prototype.hasOwnProperty.call(source, keys) ? { [keys]: source[keys] } : {};
    if (Array.isArray(keys)) return Object.fromEntries(keys.filter((key) => Object.prototype.hasOwnProperty.call(source, key)).map((key) => [key, source[key]]));
    if (typeof keys === 'object') return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, Object.prototype.hasOwnProperty.call(source, key) ? source[key] : fallback]));
    return {};
  };

  const makeStorageArea = (area) => ({
    async get(keys = null) { return selectStorageKeys(await rpc('storageGet', { area }), keys); },
    async set(items) {
      const next = objectOnly(items);
      const before = await rpc('storageGet', { area });
      await rpc('storageSet', { area, items: next });
      const changes = {};
      for (const [key, newValue] of Object.entries(next)) changes[key] = { oldValue: before?.[key], newValue };
      for (const listener of storageListeners) {
        try { listener(changes, area); } catch (error) { console.error('[VT Xbox storage]', error); }
      }
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      await rpc('storageRemove', { area, keys: list.filter(Boolean).map(String) });
    },
    async clear() { await rpc('storageClear', { area }); }
  });

  const extensionApi = {
    storage: {
      sync: makeStorageArea('sync'),
      local: makeStorageArea('local'),
      onChanged: {
        addListener(listener) { if (typeof listener === 'function') storageListeners.add(listener); },
        removeListener(listener) { storageListeners.delete(listener); }
      }
    },
    runtime: {
      async sendMessage(message) {
        if (message?.type === 'VTW_API_REQUEST') return await rpc('apiRequest', { operation: message.operation, payload: message.payload });
        return await rpc('runtimeMessage', { message });
      },
      onMessage: {
        addListener(listener) { if (typeof listener === 'function') runtimeListeners.add(listener); },
        removeListener(listener) { runtimeListeners.delete(listener); }
      },
      getURL(path = '') { return `ms-appx-web:///Assets/ExtensionRuntime/${String(path).replace(/^\/+/, '')}`; }
    }
  };

  // Keep WebView2's chrome.webview object and add the browser-extension subset around it.
  const nativeChrome = globalThis.chrome || {};
  globalThis.chrome = Object.assign(nativeChrome, extensionApi);
  globalThis.browser = globalThis.chrome;
  globalThis.VTXboxNative = { rpc };

  const dialServers = new Map();
  class DialServer {
    constructor(appName) {
      this.appName = String(appName || 'YouTube');
      this.basePath = `/apps/${this.appName}`;
      this.routes = { GET: new Map(), POST: new Map(), DELETE: new Map() };
      dialServers.set(this.appName, this);
      rpc('dialRegister', { appName: this.appName }).catch(() => {});
    }
    normalize(path) { return `${this.basePath}${String(path || '')}`.replace(/\/+$/, '') || '/'; }
    onGet(path, callback) { this.routes.GET.set(this.normalize(path), callback); }
    onPost(path, callback) { this.routes.POST.set(this.normalize(path), callback); }
    onDelete(path, callback) { this.routes.DELETE.set(this.normalize(path), callback); }
  }

  const initialDeepLink = '';
  globalThis.h5vcc = globalThis.h5vcc || {};
  globalThis.h5vcc.dial = { ...(globalThis.h5vcc.dial || {}), DialServer };
  globalThis.h5vcc.runtime = { ...(globalThis.h5vcc.runtime || {}), initialDeepLink };
  globalThis.h5vcc.system = {
    ...(globalThis.h5vcc.system || {}),
    getVideoContainerSizeOverride: () => globalThis.VTW?.config?.unlock_resolution === false ? `${screen.width}x${screen.height}` : '7680x4320'
  };

  const dispatchXboxAction = (action) => {
    if (globalThis.VTW?.config?.controller_support === false
        && !['openYouTubeSettings', 'appSuspending', 'appResumed'].includes(action)) return;
    try {
      if (globalThis.VTW?.handleXboxAction?.(action) === true) return;
    } catch (error) {
      globalThis.VTW?.log?.('warn', 'controller', `Xbox-Aktion ${action} wurde übersprungen`, error);
    }
    const keyMap = {
      confirm: ['Enter', 'Enter', 13], back: ['Escape', 'Escape', 27],
      up: ['ArrowUp', 'ArrowUp', 38], down: ['ArrowDown', 'ArrowDown', 40],
      left: ['ArrowLeft', 'ArrowLeft', 37], right: ['ArrowRight', 'ArrowRight', 39],
      previousTab: ['F4', 'F4', 115], nextTab: ['F5', 'F5', 116],
      playPause: ['k', 'KeyK', 75], captions: ['c', 'KeyC', 67],
      volumeDown: ['-', 'Minus', 189], volumeUp: ['+', 'Equal', 187]
    };
    if (action === 'openYouTubeSettings') {
      const labels = /^(settings|einstellungen)$/i;
      const candidate = [...document.querySelectorAll('button,[role="button"],[tabindex="0"],a')]
        .find((node) => labels.test((node.textContent || '').trim()) || labels.test(node.getAttribute('aria-label') || ''));
      candidate?.click?.();
      return;
    }
    const mapping = keyMap[action];
    if (!mapping) return;
    const [key, code, keyCode] = mapping;
    for (const type of ['keydown', 'keyup']) {
      const event = new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true });
      try { Object.defineProperty(event, '__vtwXbox', { configurable: true, value: true }); } catch {}
      for (const property of ['keyCode', 'which']) {
        try { Object.defineProperty(event, property, { configurable: true, get: () => keyCode }); } catch {}
      }
      document.dispatchEvent(event);
    }
  };

  const invokeDialRoute = async (message) => {
    const method = String(message.method || 'GET').toUpperCase();
    const path = String(message.path || '/');
    const appName = String(message.appName || path.split('/')[2] || 'YouTube');
    const server = dialServers.get(appName);
    const callback = server?.routes?.[method]?.get(path);
    if (!callback) {
      postNative({ type: 'dialResponse', requestId: message.requestId, handled: false });
      return;
    }
    const headers = {};
    const data = {
      responseCode: 200, mimeType: '', body: '',
      addHeader(key, value) { headers[String(key)] = String(value); }
    };
    try {
      const accepted = await callback({ host: message.host, path: server.basePath, body: message.body || '' }, data);
      postNative({
        type: 'dialResponse', requestId: message.requestId, handled: accepted !== false,
        responseCode: Number(data.responseCode) || 200, mimeType: String(data.mimeType || ''),
        body: String(data.body || ''), headers
      });
    } catch (error) {
      postNative({ type: 'dialResponse', requestId: message.requestId, handled: true, responseCode: 500, body: String(error?.message || error) });
    }
  };

  globalThis.chrome.webview.addEventListener('message', (event) => {
    const message = event.data || {};
    if (message.type === 'nativeRpcResult') {
      const task = pending.get(message.id);
      if (!task) return;
      clearTimeout(task.timer);
      pending.delete(message.id);
      if (message.ok) task.resolve(message.data);
      else task.reject(new Error(message.error || 'Native operation failed'));
      return;
    }
    if (message.type === 'storageChanged') {
      for (const listener of storageListeners) {
        try { listener(message.changes || {}, message.area || 'sync'); } catch {}
      }
      return;
    }
    if (message.type === 'runtimeMessage') {
      for (const listener of runtimeListeners) {
        try { listener(message.message, {}, () => {}); } catch {}
      }
      return;
    }
    if (message.type === 'xboxController') {
      dispatchXboxAction(message.action);
      return;
    }
    if (message.type === 'appLifecycle') {
      dispatchXboxAction(message.state === 'suspending' ? 'appSuspending' : 'appResumed');
      return;
    }
    if (message.type === 'xboxControllerStatus') {
      globalThis.VTW?.setStatus?.('controller', {
        state: message.connected ? 'active' : (globalThis.VTW?.config?.controller_support === false ? 'disabled' : 'idle'),
        message: message.connected ? `${message.count || 1} Xbox-Controller verbunden` : 'Wartet auf Xbox-Controller',
        count: Number(message.count || 0)
      });
      return;
    }
    if (message.type === 'dialLaunch') {
      try {
        const params = new URLSearchParams(String(message.body || ''));
        const videoId = params.get('v') || params.get('videoId');
        if (/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) location.href = `https://www.youtube.com/tv#/watch?v=${videoId}`;
      } catch {}
      return;
    }
    if (message.type === 'dialRequest') invokeDialRoute(message);
  });
})();
