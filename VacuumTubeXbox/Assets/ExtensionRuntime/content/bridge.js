(() => {
  'use strict';
  const api = globalThis.browser ?? globalThis.chrome;
  const LOG_KEY = 'vtwDiagnosticsLogs';
  const LOG_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
  const LOG_LIMIT = 400;

  const defaults = {
    volume: 100,
    adblock: true, sponsorblock: true, dearrow: true, dislikes: true,
    remove_super_resolution: true, hide_shorts: true, unlock_resolution: false,
    controller_support: true, dial_enabled: true, block_signin_popup: true,
    remove_endscreen: false, high_quality_thumbnails: true, preferred_quality: 'auto', playback_rate: '1', playback_rate_increment: '0.25', player_clock: false,
    disable_direct_signin: true, voice_search: true,
    hide_youtube_logo: false, welcome_toast: true, auto_account_select: false, fix_language_settings: true,
    subtitle_user_language: true, subtitle_all_languages: false, enable_chapters: true,
    enable_long_press: true, show_previous_next_buttons: true, show_speed_button: true,
    show_mini_player_button: false, enable_video_previews: false, hide_watched_videos: false,
    hide_watched_threshold: '90', hide_watched_home: true, hide_watched_search: false,
    hide_watched_subscriptions: false, hide_are_you_still_watching: false,
    show_paid_promotion_overlay: true, sort_subscriptions_alphabetically: false, disable_channels_on_sidebar: false,
    screen_dimming: false, screen_dimming_timeout: '120', screen_dimming_opacity: '0.55',
    player_clock_12h: false, player_clock_seconds: false, audio_only_mode: false,
    pause_on_suspend: true,
    keep_screen_awake: true, preferred_codec: 'any', startup_destination: 'none',
    reload_start_page: false, who_is_watching_enabled: false, who_is_watching_on_exit: false,
    signin_reminder: false, sponsor_cat_highlight: true, sponsor_manual_intro: false,
    sponsor_manual_outro: false, sponsor_manual_filler: true, sponsor_manual_interaction: false,
    player_patch_enabled: true, fit_video_to_screen: true, focus_theme: 'youtube',
    sponsor_mode: 'skip', sponsor_cat_sponsor: true, sponsor_cat_intro: false,
    sponsor_cat_outro: false, sponsor_cat_selfpromo: false, sponsor_cat_interaction: false,
    sponsor_cat_preview: false, sponsor_cat_filler: false, sponsor_cat_music_offtopic: false,
    sponsor_show_duration: true, sponsor_allow_undo: true,
    dearrow_titles: true, dearrow_thumbnails: true, dearrow_original_hotkey: true,
    dislikes_mode: 'icon_count',
    settings_theme: 'original',
    player_show_controls: true, player_show_progress: true, player_show_title: true,
    player_show_time: true, player_show_buttons: true, player_show_captions_button: true,
    player_show_settings_button: true, player_show_dislikes: true,
    player_show_sponsor_markers: true,
    navigation_customization: true, nav_signin: true, nav_search: true, nav_home: true,
    nav_shorts: false, nav_subscriptions: true, nav_library: true, nav_music: true,
    nav_movies: true, nav_live: true, nav_gaming: true, nav_news: true, nav_sports: true, nav_podcasts: true,
    toasts_enabled: true, toast_system: true, toast_adblock: false, toast_sponsorblock: true,
    toast_dearrow: true, toast_dislikes: true, toast_shorts: true,
    toast_super_resolution: false, toast_navigation: false, toast_diagnostics: true,
    diagnostics_enabled: true
  };

  const allowedKeys = new Set(Object.keys(defaults));
  const enums = {
    sponsor_mode: new Set(['skip', 'notify']),
    dislikes_mode: new Set(['count', 'icon_count', 'ratio', 'percent', 'hidden']),
    settings_theme: new Set(['original', 'custom']),
    preferred_quality: new Set(['auto', 'hd1080', 'hd1440', 'hd2160', 'highres']),
    playback_rate: new Set(['0.25', '0.5', '0.75', '1', '1.25', '1.5', '1.75', '2', '2.5', '3']),
    playback_rate_increment: new Set(['0.1', '0.25', '0.5']),
    hide_watched_threshold: new Set(['70', '80', '90', '95', '100']),
    screen_dimming_timeout: new Set(['30', '60', '120', '300', '600']),
    screen_dimming_opacity: new Set(['0.35', '0.55', '0.7', '0.85']),
    preferred_codec: new Set(['any', 'avc', 'vp9', 'av1']),
    startup_destination: new Set(['none', 'home', 'subscriptions', 'library', 'live']),
    focus_theme: new Set(['youtube', 'high-contrast', 'blue'])
  };

  const sanitizeValue = (key, raw) => {
    const fallback = defaults[key];
    if (key === 'volume') return Math.max(0, Math.min(100, Number(raw) || 0));
    if (enums[key]) return enums[key].has(String(raw)) ? String(raw) : fallback;
    if (typeof fallback === 'boolean') return Boolean(raw);
    if (typeof fallback === 'number') return Number.isFinite(Number(raw)) ? Number(raw) : fallback;
    return typeof raw === 'string' ? raw : fallback;
  };

  const sanitizeObject = (input) => {
    const next = {};
    if (!input || typeof input !== 'object') return next;
    for (const [key, raw] of Object.entries(input)) {
      if (allowedKeys.has(key)) next[key] = sanitizeValue(key, raw);
    }
    return next;
  };

  const sanitizeLogEntry = (entry) => {
    const timestamp = Number(entry?.timestamp) || Date.now();
    return {
      timestamp,
      level: ['error', 'warn', 'info', 'debug'].includes(entry?.level) ? entry.level : 'info',
      module: String(entry?.module || 'system').slice(0, 48),
      message: String(entry?.message || '').slice(0, 500),
      details: entry?.details == null ? undefined : entry.details,
      page: String(entry?.page || '/tv').split('?')[0].split('#')[0].slice(0, 160)
    };
  };

  const readConfig = async () => {
    const stored = await api.storage.sync.get(defaults);
    const config = { ...defaults, ...sanitizeObject(stored) };
    return config;
  };

  const purgeLogs = async () => {
    const now = Date.now();
    const stored = await api.storage.local.get({ [LOG_KEY]: [] });
    const logs = (Array.isArray(stored[LOG_KEY]) ? stored[LOG_KEY] : [])
      .map(sanitizeLogEntry)
      .filter((entry) => now - entry.timestamp < LOG_RETENTION_MS)
      .slice(-LOG_LIMIT);
    await api.storage.local.set({ [LOG_KEY]: logs });
    return logs;
  };

  const appendLog = async (entry) => {
    const config = await readConfig();
    if (!config.diagnostics_enabled) return false;
    const logs = await purgeLogs();
    logs.push(sanitizeLogEntry(entry));
    await api.storage.local.set({ [LOG_KEY]: logs.slice(-LOG_LIMIT) });
    return true;
  };

  const postConfig = async () => {
    try {
      const stored = await readConfig();
      window.postMessage({ source: 'vtw-extension', type: 'VTW_CONFIG', config: stored }, '*');
    } catch (error) {
      console.error('[VTW bridge] Einstellungen konnten nicht geladen werden', error);
      window.postMessage({ source: 'vtw-extension', type: 'VTW_CONFIG', config: defaults }, '*');
    }
  };

  const respondAction = (id, ok, data, error) => {
    window.postMessage({ source: 'vtw-extension', type: 'VTW_ACTION_RESPONSE', id, ok, data, error }, '*');
  };

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'vtw-page') return;

    if (data.type === 'VTW_CONFIG_REQUEST') {
      await postConfig();
      return;
    }

    if (data.type === 'VTW_API_REQUEST') {
      const { id, operation, payload } = data;
      try {
        const response = await api.runtime.sendMessage({ type: 'VTW_API_REQUEST', operation, payload });
        window.postMessage({
          source: 'vtw-extension', type: 'VTW_API_RESPONSE', id,
          ok: Boolean(response?.ok), data: response?.data, error: response?.error
        }, '*');
      } catch (error) {
        window.postMessage({
          source: 'vtw-extension', type: 'VTW_API_RESPONSE', id, ok: false,
          error: error?.message || String(error)
        }, '*');
      }
      return;
    }

    if (data.type !== 'VTW_EXTENSION_ACTION') return;
    const { id, action, payload = {} } = data;
    try {
      if (action === 'setConfig') {
        const next = sanitizeObject(payload.value);
        if (Object.keys(next).length) await api.storage.sync.set(next);
        if (next.diagnostics_enabled === false) await api.storage.local.set({ [LOG_KEY]: [] });
        respondAction(id, true, next);
        return;
      }
      if (action === 'getConfig') {
        respondAction(id, true, await readConfig());
        return;
      }
      if (action === 'appendLog') {
        respondAction(id, true, await appendLog(payload.entry));
        return;
      }
      if (action === 'getDiagnostics') {
        const config = await readConfig();
        const logs = config.diagnostics_enabled ? await purgeLogs() : [];
        respondAction(id, true, {
          enabled: config.diagnostics_enabled,
          retentionDays: 3,
          logs: logs.slice(-100).reverse()
        });
        return;
      }
      throw new Error(`Nicht unterstützte Aktion: ${action}`);
    } catch (error) {
      respondAction(id, false, null, error?.message || String(error));
    }
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') postConfig();
  });

  api.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== 'VTW_PAGE_ACTION') return;
    window.postMessage({ source: 'vtw-extension', type: 'VTW_PAGE_ACTION', action: message.action }, '*');
  });

  purgeLogs().catch(() => {});
  postConfig();
})();
