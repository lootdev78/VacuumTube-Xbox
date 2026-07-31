(() => {
  'use strict';
  const VTW = globalThis.VTW;
  if (!VTW) return;

  const nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  const nativeParse = JSON.parse.bind(JSON);
  const nativeStringify = JSON.stringify.bind(JSON);
  const NativeXHR = window.XMLHttpRequest;

  VTW.nativeJsonParse = nativeParse;
  VTW.nativeJsonStringify = nativeStringify;
  VTW.jsonModifiers = [];
  VTW.playerJsonModifiers = [];
  VTW.responseModifiers = [];
  VTW.requestModifiers = [];

  VTW.addJsonModifier = (fn) => {
    if (typeof fn === 'function') VTW.jsonModifiers.push(fn);
    return fn;
  };
  VTW.addPlayerJsonModifier = (fn) => {
    if (typeof fn === 'function') VTW.playerJsonModifiers.push(fn);
    return fn;
  };
  VTW.addResponseModifier = (fn) => {
    if (typeof fn === 'function') VTW.responseModifiers.push(fn);
    return fn;
  };
  VTW.addRequestModifier = (fn) => {
    if (typeof fn === 'function') VTW.requestModifiers.push(fn);
    return fn;
  };

  const SAFE_CONTENT_PATHS = new Set([
    '/youtubei/v1/browse',
    '/youtubei/v1/search',
    '/youtubei/v1/guide',
    '/youtubei/v1/next',
    '/youtubei/v1/account/account_menu',
    '/youtubei/v1/get_settings',
    '/youtubei/v1/settings/get_settings',
    '/youtubei/v1/settings'
  ]);
  const PLAYER_PATHS = new Set(['/youtubei/v1/player']);
  const ABSOLUTE_EXCLUDES = /(?:googlevideo\.com|\/videoplayback(?:\?|$)|\/get_video_info(?:\?|$))/i;

  const pathOf = (url) => {
    try { return new URL(String(url || ''), location.origin).pathname; }
    catch { return String(url || '').split('?')[0]; }
  };
  const isExcludedMediaUrl = (url) => ABSOLUTE_EXCLUDES.test(String(url || ''));
  const isSafeContentUrl = (url) => SAFE_CONTENT_PATHS.has(pathOf(url));
  const isPlayerUrl = (url) => PLAYER_PATHS.has(pathOf(url));

  const findSettingsCollections = (value, output = [], seen = new WeakSet(), depth = 0) => {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 9) return output;
    seen.add(value);
    if (Array.isArray(value)) {
      const categoryCount = value.filter((item) => item?.settingCategoryCollectionRenderer).length;
      if (categoryCount > 0 && categoryCount >= Math.min(2, value.length)) output.push(value);
      for (const item of value) findSettingsCollections(item, output, seen, depth + 1);
      return output;
    }
    for (const item of Object.values(value)) findSettingsCollections(item, output, seen, depth + 1);
    return output;
  };
  VTW.findSettingsCollections = findSettingsCollections;

  const isPlayerModel = (json) => Boolean(json && typeof json === 'object' && (
    json.streamingData || json.playabilityStatus || (json.videoDetails && json.responseContext)
  ));

  const isContentModel = (json) => {
    if (!json || typeof json !== 'object' || isPlayerModel(json)) return false;
    if (findSettingsCollections(json).length) return true;
    return Boolean(
      json.contents || json.continuationContents || json.items || json.entries ||
      json.actions || json.onResponseReceivedActions || json.onResponseReceivedEndpoints ||
      json.transportControls || json.engagementPanels
    );
  };

  const applySyncModifiers = (json, scope, context = {}) => {
    const list = scope === 'player' ? VTW.playerJsonModifiers : VTW.jsonModifiers;
    let next = json;
    for (const modifier of list) {
      try {
        const changed = modifier(next, context);
        // JSON.parse must remain synchronous. Async modifiers are ignored here and
        // continue to run through the Fetch response pipeline instead.
        if (changed && typeof changed.then === 'function') continue;
        if (changed !== undefined) next = changed;
      } catch (error) {
        VTW.log?.('error', 'network', `${scope}-JSON-Modifikator fehlgeschlagen`, error);
      }
    }
    return next;
  };

  const applyResponseModifiers = async (url, text, scope) => {
    let next = text;
    let json = null;
    try { json = nativeParse(next); } catch {}
    if (json && ((scope === 'player' && isPlayerModel(json)) || (scope === 'content' && isContentModel(json)))) {
      const changed = applySyncModifiers(json, scope, { url, source: 'response' });
      try { next = nativeStringify(changed); } catch { next = text; }
    }
    if (scope !== 'content') return next;
    for (const modifier of VTW.responseModifiers) {
      try {
        const changed = await modifier(url, next);
        if (typeof changed === 'string') next = changed;
      } catch (error) {
        VTW.log?.('error', 'network', 'Antwort-Modifikator fehlgeschlagen', error);
      }
    }
    return next;
  };

  const applyRequestModifiers = async (url, body) => {
    let next = body;
    for (const modifier of VTW.requestModifiers) {
      try {
        const changed = await modifier(url, next);
        if (changed !== undefined) next = changed;
      } catch (error) {
        VTW.log?.('error', 'network', 'Anfrage-Modifikator fehlgeschlagen', error);
      }
    }
    return next;
  };

  // Narrow JSON.parse compatibility hook. It only touches strongly identified
  // Leanback settings/content models or player models. Everything else is returned
  // byte-for-byte equivalent to the native parser result.
  JSON.parse = function(...args) {
    const parsed = nativeParse(...args);
    try {
      if (isPlayerModel(parsed)) return applySyncModifiers(parsed, 'player', { source: 'json-parse' });
      if (isContentModel(parsed)) return applySyncModifiers(parsed, 'content', { source: 'json-parse' });
    } catch (error) {
      VTW.log?.('warn', 'network', 'JSON-Kompatibilitätshook wurde übersprungen', error);
    }
    return parsed;
  };

  if (nativeFetch) {
    window.fetch = async function(input, init) {
      const requestUrl = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
      if (isExcludedMediaUrl(requestUrl)) return nativeFetch(input, init);
      const contentRequest = isSafeContentUrl(requestUrl);
      const playerRequest = isPlayerUrl(requestUrl);
      if (!contentRequest && !playerRequest) return nativeFetch(input, init);

      let nextInput = input;
      let nextInit = init;
      if (contentRequest) {
        try {
          if (init?.body !== undefined) {
            nextInit = { ...init, body: await applyRequestModifiers(requestUrl, init.body) };
          } else if (typeof Request !== 'undefined' && input instanceof Request && !['GET', 'HEAD'].includes(input.method)) {
            const body = await input.clone().text();
            nextInput = new Request(input, { body: await applyRequestModifiers(requestUrl, body) });
          }
        } catch (error) {
          VTW.log?.('warn', 'network', 'Anfrage wird unverändert weitergeleitet', error);
          nextInput = input;
          nextInit = init;
        }
      }

      const response = await nativeFetch(nextInput, nextInit);
      if (!response?.ok) return response;
      try {
        const type = response.headers?.get?.('content-type') || '';
        if (type && !/(?:json|javascript|text\/plain)/i.test(type)) return response;
        const originalText = await response.clone().text();
        const changedText = await applyResponseModifiers(requestUrl, originalText, playerRequest ? 'player' : 'content');
        if (changedText === originalText || typeof changedText !== 'string') return response;
        return new Response(changedText, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (error) {
        VTW.log?.('warn', 'network', 'Fetch-Antwort wird unverändert verwendet', error);
        return response;
      }
    };
  }

  // Targeted XHR compatibility path for Leanback builds that do not use Fetch for
  // settings/guide responses. The patch is fail-open and never handles media URLs.
  if (typeof NativeXHR === 'function') {
    const nativeOpen = NativeXHR.prototype.open;
    const nativeSend = NativeXHR.prototype.send;
    const responseTextGetter = Object.getOwnPropertyDescriptor(NativeXHR.prototype, 'responseText')?.get;
    const responseGetter = Object.getOwnPropertyDescriptor(NativeXHR.prototype, 'response')?.get;

    NativeXHR.prototype.open = function(method, url, ...rest) {
      this.__vtwUrl = String(url || '');
      this.__vtwMethod = String(method || 'GET');
      return nativeOpen.call(this, method, url, ...rest);
    };

    NativeXHR.prototype.send = function(body) {
      const url = this.__vtwUrl || '';
      const contentRequest = isSafeContentUrl(url);
      const playerRequest = isPlayerUrl(url);
      if (!contentRequest && !playerRequest || isExcludedMediaUrl(url)) return nativeSend.call(this, body);

      let prepared = false;
      this.addEventListener('readystatechange', () => {
        if (prepared || this.readyState !== 4) return;
        prepared = true;
        try {
          if (this.responseType && this.responseType !== 'text') return;
          const originalText = responseTextGetter ? responseTextGetter.call(this) : String(responseGetter?.call(this) || '');
          if (!originalText) return;
          let parsed;
          try { parsed = nativeParse(originalText); } catch { return; }
          const scope = playerRequest ? 'player' : 'content';
          if (scope === 'player' && !isPlayerModel(parsed)) return;
          if (scope === 'content' && !isContentModel(parsed)) return;
          const changed = applySyncModifiers(parsed, scope, { url, source: 'xhr' });
          const changedText = nativeStringify(changed);
          if (changedText === originalText) return;
          Object.defineProperty(this, 'responseText', { configurable: true, get: () => changedText });
          Object.defineProperty(this, 'response', { configurable: true, get: () => changedText });
        } catch (error) {
          VTW.log?.('warn', 'network', 'XHR-Antwort wird unverändert verwendet', error);
        }
      });
      return nativeSend.call(this, body);
    };
  }

  VTW.setStatus?.('network', { state: 'active', message: 'Abgesicherte Leanback-Hooks aktiv' });
})();
