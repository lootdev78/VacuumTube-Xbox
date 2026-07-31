(() => {
  'use strict';
  if (location.hostname !== 'www.youtube.com' || !location.pathname.startsWith('/tv')) return;
  if (globalThis.__VTW_XBOX_CORE_ACTIVE__) return;
  globalThis.__VTW_XBOX_CORE_ACTIVE__ = true;

  const VTW = globalThis.VTW = globalThis.VTW || {};
  VTW.version = '1.1.0-xbox';
  VTW.defaults = {
    volume: 100,

    adblock: true,
    sponsorblock: true,
    dearrow: true,
    dislikes: true,
    remove_super_resolution: true,
    hide_shorts: true,
    unlock_resolution: false,
    controller_support: true,
    dial_enabled: true,
    remove_endscreen: false,
    high_quality_thumbnails: true,
    preferred_quality: 'auto',
    playback_rate: '1',
    playback_rate_increment: '0.25',
    player_clock: false,
    block_signin_popup: true,
    disable_direct_signin: true,
    voice_search: true,

    // Features merged from VacuumTube, youtube-webos and TizenTube.
    hide_youtube_logo: false,
    welcome_toast: true,
    auto_account_select: false,
    fix_language_settings: true,
    subtitle_user_language: true,
    subtitle_all_languages: false,
    enable_chapters: true,
    enable_long_press: true,
    show_previous_next_buttons: true,
    show_speed_button: true,
    show_mini_player_button: false,
    enable_video_previews: false,
    hide_watched_videos: false,
    hide_watched_threshold: '90',
    hide_watched_home: true,
    hide_watched_search: false,
    hide_watched_subscriptions: false,
    hide_are_you_still_watching: false,
    show_paid_promotion_overlay: true,
    sort_subscriptions_alphabetically: false,
    disable_channels_on_sidebar: false,
    screen_dimming: false,
    screen_dimming_timeout: '120',
    screen_dimming_opacity: '0.55',
    player_clock_12h: false,
    player_clock_seconds: false,
    audio_only_mode: false,
    pause_on_suspend: true,
    keep_screen_awake: true,
    preferred_codec: 'any',
    startup_destination: 'none',
    reload_start_page: false,
    who_is_watching_enabled: false,
    who_is_watching_on_exit: false,
    signin_reminder: false,
    sponsor_cat_highlight: true,
    sponsor_manual_intro: false,
    sponsor_manual_outro: false,
    sponsor_manual_filler: true,
    sponsor_manual_interaction: false,
    player_patch_enabled: true,
    fit_video_to_screen: true,
    focus_theme: 'youtube',

    sponsor_mode: 'skip',
    sponsor_cat_sponsor: true,
    sponsor_cat_intro: false,
    sponsor_cat_outro: false,
    sponsor_cat_selfpromo: false,
    sponsor_cat_interaction: false,
    sponsor_cat_preview: false,
    sponsor_cat_filler: false,
    sponsor_cat_music_offtopic: false,
    sponsor_show_duration: true,
    sponsor_allow_undo: true,

    dearrow_titles: true,
    dearrow_thumbnails: true,
    dearrow_original_hotkey: true,

    dislikes_mode: 'icon_count',

    settings_theme: 'original',
    player_show_controls: true,
    player_show_progress: true,
    player_show_title: true,
    player_show_time: true,
    player_show_buttons: true,
    player_show_captions_button: true,
    player_show_settings_button: true,
    player_show_dislikes: true,
    player_show_sponsor_markers: true,

    navigation_customization: true,
    nav_signin: true,
    nav_search: true,
    nav_home: true,
    nav_shorts: false,
    nav_subscriptions: true,
    nav_library: true,
    nav_music: true,
    nav_movies: true,
    nav_live: true,
    nav_gaming: true,
    nav_news: true,
    nav_sports: true,
    nav_podcasts: true,

    toasts_enabled: true,
    toast_system: true,
    toast_adblock: false,
    toast_sponsorblock: true,
    toast_dearrow: true,
    toast_dislikes: true,
    toast_shorts: true,
    toast_super_resolution: false,
    toast_navigation: false,
    toast_diagnostics: true,

    diagnostics_enabled: true
  };

  VTW.config = { ...VTW.defaults };
  VTW.configReady = false;
  VTW.configReadyPromise = new Promise((resolve) => { VTW.resolveConfigReady = resolve; });
  VTW.whenConfigReady = (timeout = 5000) => Promise.race([
    VTW.configReadyPromise,
    new Promise((resolve) => setTimeout(() => resolve({ ...VTW.config, timedOut: true }), timeout))
  ]);
  VTW.listeners = new Map();
  VTW.pendingApi = new Map();
  VTW.pendingAction = new Map();
  VTW.apiCounter = 0;
  VTW.actionCounter = 0;
  VTW.toastDedupe = new Map();
  VTW.toastElements = new Map();
  VTW.status = new Map();
  VTW.startedAt = Date.now();

  VTW.on = (name, fn) => {
    if (!VTW.listeners.has(name)) VTW.listeners.set(name, new Set());
    VTW.listeners.get(name).add(fn);
    return () => VTW.listeners.get(name)?.delete(fn);
  };

  VTW.emit = (name, value) => {
    for (const fn of VTW.listeners.get(name) || []) {
      try { fn(value); } catch (error) { console.error(`[VTW] ${name} listener failed`, error); }
    }
  };

  VTW.waitFor = (predicate, timeout = 10000, interval = 25) => new Promise((resolve, reject) => {
    const start = performance.now();
    const tick = () => {
      try {
        const value = predicate();
        if (value) return resolve(value);
      } catch {}
      if (performance.now() - start >= timeout) return reject(new Error('Zeitüberschreitung'));
      setTimeout(tick, interval);
    };
    tick();
  });

  VTW.deepMerge = (target, source) => {
    if (!target || !source || typeof target !== 'object' || typeof source !== 'object') return target;
    for (const [key, value] of Object.entries(source)) {
      if (value === '__DELETE__') delete target[key];
      else if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
        VTW.deepMerge(target[key], value);
      } else target[key] = value;
    }
    return target;
  };

  VTW.api = (operation, payload = {}, timeout = 8000) => new Promise((resolve, reject) => {
    const id = `vtw-api-${Date.now()}-${++VTW.apiCounter}`;
    const timer = setTimeout(() => {
      VTW.pendingApi.delete(id);
      reject(new Error(`${operation}: Zeitüberschreitung`));
    }, timeout);
    VTW.pendingApi.set(id, { resolve, reject, timer });
    window.postMessage({ source: 'vtw-page', type: 'VTW_API_REQUEST', id, operation, payload }, '*');
  });

  VTW.extensionAction = (action, payload = {}, timeout = 8000) => new Promise((resolve, reject) => {
    const id = `vtw-action-${Date.now()}-${++VTW.actionCounter}`;
    const timer = setTimeout(() => {
      VTW.pendingAction.delete(id);
      reject(new Error(`${action}: Zeitüberschreitung`));
    }, timeout);
    VTW.pendingAction.set(id, { resolve, reject, timer });
    window.postMessage({ source: 'vtw-page', type: 'VTW_EXTENSION_ACTION', id, action, payload }, '*');
  });

  VTW.saveConfig = (value) => VTW.extensionAction('setConfig', { value });
  VTW.getStoredConfig = () => VTW.extensionAction('getConfig');
  VTW.getStoredDiagnostics = () => VTW.extensionAction('getDiagnostics');

  const safeDetails = (value) => {
    if (value == null) return undefined;
    if (value instanceof Error) return { name: value.name, message: value.message, stack: String(value.stack || '').split('\n').slice(0, 5).join('\n') };
    if (typeof value === 'string') return value.slice(0, 1000);
    try {
      return JSON.parse(JSON.stringify(value, (key, item) => {
        if (/token|secret|password|authorization|cookie/i.test(key)) return '[entfernt]';
        if (typeof item === 'string' && item.length > 1000) return `${item.slice(0, 1000)}…`;
        return item;
      }));
    } catch {
      return String(value).slice(0, 1000);
    }
  };

  VTW.log = (level, module, message, details) => {
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'debug';
    console[method]?.(`[VTW:${module}] ${message}`, details ?? '');
    if (!VTW.config.diagnostics_enabled) return Promise.resolve(false);
    return VTW.extensionAction('appendLog', {
      entry: {
        timestamp: Date.now(),
        level: ['error', 'warn', 'info', 'debug'].includes(level) ? level : 'info',
        module: String(module || 'system').slice(0, 48),
        message: String(message || '').slice(0, 500),
        details: safeDetails(details),
        page: location.pathname
      }
    }, 3000).catch(() => false);
  };

  VTW.setStatus = (id, patch = {}) => {
    const previous = VTW.status.get(id) || { id, state: 'idle', message: 'Bereit', updatedAt: 0, count: 0 };
    const candidate = { ...previous, ...patch, id };
    const changed = previous.state !== candidate.state || previous.message !== candidate.message || previous.count !== candidate.count;
    if (!changed) return previous;
    const next = { ...candidate, updatedAt: Date.now() };
    VTW.status.set(id, next);
    VTW.emit('status', { id, status: next, all: VTW.getStatuses() });
    const level = next.state === 'error' ? 'error' : next.state === 'warning' ? 'warn' : 'info';
    VTW.log(level, id, next.message, { state: next.state, count: next.count }).catch(() => {});
    return next;
  };
  VTW.getStatus = (id) => VTW.status.get(id) || { id, state: 'idle', message: 'Bereit', updatedAt: 0, count: 0 };
  VTW.getStatuses = () => Object.fromEntries([...VTW.status.entries()].map(([key, value]) => [key, { ...value }]));

  for (const id of ['system', 'adblock', 'sponsorblock', 'dearrow', 'dislikes', 'shorts', 'super_resolution', 'navigation', 'controller', 'dial', 'diagnostics', 'network', 'settings', 'platform', 'upstream', 'chapters', 'subtitles', 'startup', 'screen', 'player_features']) {
    VTW.status.set(id, { id, state: 'idle', message: 'Bereit', updatedAt: Date.now(), count: 0 });
  }

  VTW.getVideoId = () => {
    const candidates = [location.hash.slice(1), location.href];
    for (const candidate of candidates) {
      try {
        const url = new URL(candidate || '/', location.origin);
        const id = url.searchParams.get('v');
        if (/^[A-Za-z0-9_-]{11}$/.test(id || '')) return id;
        const shortId = url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/)?.[1];
        if (shortId) return shortId;
      } catch {}
    }
    try {
      const data = document.querySelector('.html5-video-player')?.getVideoData?.() || {};
      const id = data.video_id || data.videoId;
      return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : null;
    } catch {
      return null;
    }
  };

  VTW.getResolveCommand = () => {
    try {
      if (typeof VTW.resolveCommand === 'function') return VTW.resolveCommand;
      for (const key in window._yttv || {}) {
        const instance = window._yttv[key]?.instance;
        if (typeof instance?.resolveCommand === 'function') return instance.resolveCommand.bind(instance);
      }
    } catch {}
    return null;
  };

  const ensureToastRoot = () => {
    let root = document.getElementById('vtw-toast-stack');
    if (!root) {
      root = document.createElement('div');
      root.id = 'vtw-toast-stack';
      root.setAttribute('aria-live', 'polite');
      (document.body || document.documentElement).appendChild(root);
    }
    return root;
  };

  const toastAllowed = (options) => {
    if (!VTW.config.toasts_enabled && !options.force) return false;
    const mod = options.mod || 'system';
    const key = `toast_${mod}`;
    if (Object.prototype.hasOwnProperty.call(VTW.config, key) && !VTW.config[key]) return false;
    return true;
  };

  VTW.toast = (title, subtitle = '', options = {}) => {
    if (!toastAllowed(options)) return null;
    const dedupeKey = options.dedupeKey || `${options.mod || 'system'}:${title}\n${subtitle}`;
    const dedupeMs = Number(options.dedupeMs ?? 1200);
    const now = Date.now();
    const existing = VTW.toastElements.get(dedupeKey);
    if (existing?.isConnected) {
      const count = Number(existing.dataset.count || 1) + 1;
      existing.dataset.count = String(count);
      let counter = existing.querySelector('.vtw-site-toast-counter');
      if (!counter) {
        counter = document.createElement('span');
        counter.className = 'vtw-site-toast-counter';
        existing.appendChild(counter);
      }
      counter.textContent = `×${count}`;
      return existing;
    }
    if (dedupeMs > 0 && now - (VTW.toastDedupe.get(dedupeKey) || 0) < dedupeMs) return null;
    VTW.toastDedupe.set(dedupeKey, now);

    const root = ensureToastRoot();
    const toast = document.createElement('div');
    toast.className = `vtw-site-toast vtw-toast-${options.type || 'info'}`;
    toast.dataset.count = '1';

    const icon = document.createElement('span');
    icon.className = 'vtw-site-toast-icon';
    icon.textContent = options.icon || (options.type === 'error' ? '!' : options.type === 'success' ? '✓' : options.type === 'action' ? '↪' : 'i');
    const copy = document.createElement('span');
    copy.className = 'vtw-site-toast-copy';
    const strong = document.createElement('strong');
    strong.textContent = title;
    const text = document.createElement('span');
    text.textContent = subtitle;
    copy.append(strong, text);
    toast.append(icon, copy);

    if (Array.isArray(options.actions) && options.actions.length) {
      const actions = document.createElement('span');
      actions.className = 'vtw-site-toast-actions';
      for (const item of options.actions.slice(0, 2)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = item.label;
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          try { item.onClick?.(); } catch (error) { VTW.log('error', 'toast', 'Toast-Aktion fehlgeschlagen', error); }
          if (item.close !== false) toast.remove();
        });
        actions.appendChild(button);
      }
      toast.appendChild(actions);
    }

    root.appendChild(toast);
    VTW.toastElements.set(dedupeKey, toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    const duration = Math.max(1600, Number(options.duration || 3400));
    const timer = setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 220);
    }, duration);
    const observer = new MutationObserver(() => {
      if (!toast.isConnected) {
        clearTimeout(timer);
        if (VTW.toastElements.get(dedupeKey) === toast) VTW.toastElements.delete(dedupeKey);
        observer.disconnect();
      }
    });
    observer.observe(root, { childList: true });
    return toast;
  };

  VTW.createDiagnostics = () => ({
    extension: `VacuumTube TV ${VTW.version}`,
    browser: navigator.userAgent,
    page: location.pathname,
    youtubeClient: window.ytcfg?.data_?.INNERTUBE_CLIENT_NAME || 'unbekannt',
    uptimeSeconds: Math.round((Date.now() - VTW.startedAt) / 1000),
    statuses: VTW.getStatuses(),
    diagnosticsEnabled: Boolean(VTW.config.diagnostics_enabled)
  });

  const requestConfig = () => {
    window.postMessage({ source: 'vtw-page', type: 'VTW_CONFIG_REQUEST' }, '*');
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'vtw-extension') return;

    if (data.type === 'VTW_CONFIG') {
      const previous = { ...VTW.config };
      VTW.config = { ...VTW.defaults, ...(data.config || {}) };
      VTW.configReady = true;
      VTW.resolveConfigReady?.({ ...VTW.config });
      VTW.resolveConfigReady = null;
      ensureToastRoot();
      VTW.emit('config', { ...VTW.config, previous });
    }

    if (data.type === 'VTW_API_RESPONSE') {
      const pending = VTW.pendingApi.get(data.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      VTW.pendingApi.delete(data.id);
      if (data.ok) pending.resolve(data.data);
      else pending.reject(new Error(data.error || 'API-Anfrage fehlgeschlagen'));
    }

    if (data.type === 'VTW_ACTION_RESPONSE') {
      const pending = VTW.pendingAction.get(data.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      VTW.pendingAction.delete(data.id);
      if (data.ok) pending.resolve(data.data);
      else pending.reject(new Error(data.error || 'Erweiterungsaktion fehlgeschlagen'));
    }

    if (data.type === 'VTW_PAGE_ACTION') {
      if (data.action === 'settings') VTW.openSettingsOverlay?.();
      if (data.action === 'diagnostics') VTW.openSettingsPanel?.('diagnostics');
    }
  });

  window.addEventListener('error', (event) => {
    if (!VTW.config.diagnostics_enabled) return;
    const source = String(event.filename || '');
    if (!source.includes('youtube.com') && !String(event.message || '').includes('VTW')) return;
    VTW.log('error', 'runtime', event.message || 'Unbekannter Laufzeitfehler', {
      source: source.split('?')[0], line: event.lineno, column: event.colno
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (!VTW.config.diagnostics_enabled || !String(reason?.stack || reason || '').includes('VTW')) return;
    VTW.log('error', 'runtime', reason?.message || String(reason), reason);
  });

  // Explicit handshake prevents a document_start race between the isolated bridge
  // and MAIN-world scripts. VacuumTube is initialized before YouTube renders its UI.
  requestConfig();
  const configHandshake = setInterval(() => {
    if (VTW.configReady) return clearInterval(configHandshake);
    requestConfig();
  }, 250);
  setTimeout(() => clearInterval(configHandshake), 6000);

  VTW.waitFor(() => document.documentElement).then(() => {
    setTimeout(() => {
      VTW.setStatus('system', { state: 'active', message: 'Kernmodule geladen' });
      if (VTW.config.welcome_toast) {
        VTW.toast('VacuumTube Xbox', `v${String(VTW.version || '').replace('-xbox', '')} · Mods geladen`, {
          type: 'success', mod: 'system', dedupeKey: 'extension-loaded', dedupeMs: 60000
        });
      }
    }, 900);
  }).catch(() => {});
})();
