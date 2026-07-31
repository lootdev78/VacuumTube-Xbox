(() => {
  'use strict';
  const VTW = globalThis.VTW;
  if (!VTW || globalThis.__VTW_UPSTREAM_CONTENT__) return;
  globalThis.__VTW_UPSTREAM_CONTENT__ = true;

  const walk = (value, visitor, seen = new WeakSet(), depth = 0) => {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 14) return;
    seen.add(value);
    visitor(value, depth);
    if (Array.isArray(value)) {
      for (const item of value) walk(item, visitor, seen, depth + 1);
    } else {
      for (const item of Object.values(value)) walk(item, visitor, seen, depth + 1);
    }
  };

  const textOf = (value) => {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    if (typeof value.simpleText === 'string') return value.simpleText;
    if (Array.isArray(value.runs)) return value.runs.map((run) => run?.text || '').join('');
    return '';
  };

  const currentPage = () => {
    const hash = String(location.hash || '').toLowerCase();
    if (!hash || hash === '#/' || hash === '#') return 'home';
    if (hash.includes('/search')) return 'search';
    if (/subscriptions|feyp/i.test(hash)) return 'subscriptions';
    if (/library|mediathek|feyp/i.test(hash)) return 'library';
    return 'other';
  };

  const shouldHideWatchedOnPage = () => {
    if (!VTW.config.hide_watched_videos) return false;
    const page = currentPage();
    return (page === 'home' && VTW.config.hide_watched_home)
      || (page === 'search' && VTW.config.hide_watched_search)
      || (page === 'subscriptions' && VTW.config.hide_watched_subscriptions);
  };

  const progressPercent = (tile) => {
    const overlays = tile?.header?.tileHeaderRenderer?.thumbnailOverlays
      || tile?.thumbnailOverlays || [];
    const resume = overlays.find?.((overlay) => overlay?.thumbnailOverlayResumePlaybackRenderer)
      ?.thumbnailOverlayResumePlaybackRenderer;
    const value = Number(resume?.percentDurationWatched);
    return Number.isFinite(value) ? value : null;
  };

  const processItemArrays = (json, callback) => {
    walk(json, (node) => {
      for (const [key, value] of Object.entries(node)) {
        if (!Array.isArray(value) || !['items', 'contents', 'entries', 'tabs'].includes(key)) continue;
        try { callback(value, node, key); } catch (error) { VTW.log?.('warn', 'upstream', 'Listen-Adapter übersprungen', error); }
      }
    });
  };


  const isSigninReminderItem = (item) => Boolean(
    item?.feedNudgeRenderer || item?.alertWithActionsRenderer
    || item?.compactPromotedItemRenderer?.content?.feedNudgeRenderer
  );

  const isSidebarChannelItem = (item) => {
    const entry = item?.guideEntryRenderer;
    if (!entry) return false;
    // TizenTube identifies subscribed-channel guide entries by their thumbnail;
    // native service destinations use icon.iconType. Keep the main Subscriptions entry.
    const label = textOf(entry.title || entry.formattedTitle || entry.navigationEndpoint?.browseEndpoint?.browseId);
    if (/^(subscriptions|abos|abonnements)$/i.test(label.trim())) return false;
    return Boolean(entry.thumbnail || entry.thumbnailDetails || entry.presentationStyle === 'GUIDE_ENTRY_PRESENTATION_STYLE_CHANNEL');
  };

  const addPreview = (item) => {
    if (!VTW.config.enable_video_previews) return;
    const tile = item?.tileRenderer;
    if (!tile || tile.onFocusCommand || !tile.onSelectCommand) return;
    const endpoint = structuredCloneSafe(tile.onSelectCommand);
    tile.onFocusCommand = {
      startInlinePlaybackCommand: {
        blockAdoption: true,
        caption: false,
        delayMs: 1800,
        durationMs: 40000,
        muted: false,
        restartPlaybackBeforeSeconds: 10,
        resumeVideo: true,
        playbackEndpoint: endpoint
      }
    };
  };

  const structuredCloneSafe = (value) => {
    try { return typeof structuredClone === 'function' ? structuredClone(value) : VTW.nativeJsonParse(VTW.nativeJsonStringify(value)); }
    catch { return value; }
  };

  const markLongPress = (item) => {
    if (!VTW.config.enable_long_press) return;
    const tile = item?.tileRenderer;
    const videoId = tile?.contentId || tile?.onSelectCommand?.watchEndpoint?.videoId;
    if (!tile || !/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) return;
    tile.vtwLongPressData = {
      videoId,
      title: textOf(tile?.metadata?.tileMetadataRenderer?.title),
      watchEndpoint: structuredCloneSafe(tile.onSelectCommand?.watchEndpoint || {})
    };
  };

  const processContentModel = (json) => {
    if (!json || typeof json !== 'object') return json;
    let hiddenWatched = 0;
    processItemArrays(json, (items, owner, key) => {
      let current = items;
      if (!VTW.config.signin_reminder && key !== 'tabs') {
        const filtered = current.filter((item) => !isSigninReminderItem(item));
        if (filtered.length !== current.length) owner[key] = current = filtered;
      }
      if (VTW.config.disable_channels_on_sidebar && key === 'items') {
        const filtered = current.filter((item) => !isSidebarChannelItem(item));
        if (filtered.length !== current.length) owner[key] = current = filtered;
      }
      for (const item of current) {
        addPreview(item);
        markLongPress(item);
      }
      if (shouldHideWatchedOnPage() && key !== 'tabs') {
        const threshold = Math.max(1, Math.min(100, Number(VTW.config.hide_watched_threshold) || 90));
        const before = current.length;
        const filtered = current.filter((item) => {
          const tile = item?.tileRenderer || item?.lockupViewModel || item?.videoRenderer;
          const percent = progressPercent(tile);
          return percent == null || percent < threshold;
        });
        if (filtered.length !== before) {
          owner[key] = filtered;
          hiddenWatched += before - filtered.length;
        }
      }
    });

    if (VTW.config.sort_subscriptions_alphabetically) {
      walk(json, (node) => {
        const sections = node?.tvSecondaryNavRenderer?.sections;
        if (!Array.isArray(sections)) return;
        for (const sectionContainer of sections) {
          const tabs = sectionContainer?.tvSecondaryNavSectionRenderer?.tabs;
          if (!Array.isArray(tabs)) continue;
          tabs.sort((a, b) => {
            const ar = a?.tabRenderer || {};
            const br = b?.tabRenderer || {};
            if (ar.selected && !br.selected) return -1;
            if (!ar.selected && br.selected) return 1;
            return textOf(ar.title).localeCompare(textOf(br.title), undefined, { sensitivity: 'base' });
          });
        }
      });
    }

    if (hiddenWatched) {
      VTW.setStatus?.('upstream', { state: 'active', message: `${hiddenWatched} gesehene Videos ausgeblendet`, count: hiddenWatched });
    }
    return json;
  };

  const codecTokens = {
    avc: ['avc1', 'avc3', 'h264'],
    vp9: ['vp09', 'vp9'],
    av1: ['av01', 'av1']
  };

  const filterFormatsByCodec = (formats, preference) => {
    if (!Array.isArray(formats) || preference === 'any') return formats;
    const tokens = codecTokens[preference] || [];
    if (!tokens.length) return formats;
    const video = formats.filter((format) => String(format?.mimeType || '').startsWith('video/'));
    const preferred = video.filter((format) => tokens.some((token) => String(format?.mimeType || '').toLowerCase().includes(token)));
    if (!preferred.length) return formats; // fail open: never remove all video formats
    const audio = formats.filter((format) => String(format?.mimeType || '').startsWith('audio/'));
    const other = formats.filter((format) => !String(format?.mimeType || '').startsWith('video/') && !String(format?.mimeType || '').startsWith('audio/'));
    return [...preferred, ...audio, ...other];
  };

  const processPlayerModel = (json) => {
    if (!json || typeof json !== 'object') return json;
    if (!VTW.config.show_paid_promotion_overlay && json.paidContentOverlay) delete json.paidContentOverlay;
    if (VTW.config.remove_endscreen && json.endscreen) delete json.endscreen;
    if (VTW.config.hide_are_you_still_watching && Array.isArray(json.messages)) {
      json.messages = json.messages.filter((message) => !message?.youThereRenderer);
    }
    const preference = String(VTW.config.preferred_codec || 'any');
    if (preference !== 'any' && json.streamingData) {
      json.streamingData.adaptiveFormats = filterFormatsByCodec(json.streamingData.adaptiveFormats, preference);
      json.streamingData.formats = filterFormatsByCodec(json.streamingData.formats, preference);
    }
    return json;
  };

  VTW.addJsonModifier?.(processContentModel);
  VTW.addPlayerJsonModifier?.(processPlayerModel);

  // Resolve-command adapters from youtube-webos/TizenTube, guarded and fail-open.
  const getPrefs = () => {
    const value = String(document.cookie || '').split('; ').find((part) => part.startsWith('PREF='));
    return new URLSearchParams(value ? value.slice(5) : '');
  };

  const setLanguageCookie = (languageCode) => {
    if (!languageCode) return;
    const prefs = getPrefs();
    prefs.set('hl', String(languageCode));
    const expiry = new Date(Date.now() + 10 * 365 * 86400000).toUTCString();
    document.cookie = `PREF=${prefs.toString()}; Domain=.youtube.com; Path=/; expires=${expiry}; SameSite=Lax`;
  };

  const languageCodes = [
    'af','sq','am','ar','hy','az','eu','be','bn','bs','bg','my','ca','zh-CN','zh-TW','hr','cs','da','nl','en','et','fil','fi','fr','gl','ka','de','el','gu','he','hi','hu','is','id','ga','it','ja','kn','kk','km','ko','ky','lo','lv','lt','mk','ms','ml','mt','mr','mn','ne','no','fa','pl','pt','pa','ro','ru','sr','si','sk','sl','es','sw','sv','ta','te','th','tr','uk','ur','uz','vi','cy','yi','yo','zu'
  ];

  const displayName = (code) => {
    try { return new Intl.DisplayNames([document.documentElement.lang || navigator.language || 'en'], { type: 'language' }).of(code) || code; }
    catch { return code; }
  };

  const subtitleOption = (code) => ({
    compactLinkRenderer: {
      title: { simpleText: displayName(code) },
      serviceEndpoint: {
        commandExecutorCommand: {
          commands: [
            { selectSubtitlesTrackCommand: { translationLanguage: { languageCode: code, languageName: displayName(code) } } },
            { openClientOverlayAction: { type: 'CLIENT_OVERLAY_TYPE_CAPTIONS_LANGUAGE', updateAction: true } },
            { signalAction: { signal: 'POPUP_BACK' } }
          ]
        }
      },
      secondaryIcon: { iconType: 'RADIO_BUTTON_UNCHECKED' }
    }
  });

  const patchSubtitleCommand = (command) => {
    if (command?.openPopupAction?.uniqueId !== 'CLIENT_OVERLAY_TYPE_CAPTIONS_AUTO_TRANSLATE') return;
    if (!VTW.config.subtitle_user_language && !VTW.config.subtitle_all_languages) return;
    const items = command?.openPopupAction?.popup?.overlaySectionRenderer?.overlay
      ?.overlayTwoPanelRenderer?.actionPanel?.overlayPanelRenderer?.content
      ?.overlayPanelItemListRenderer?.items;
    if (!Array.isArray(items)) return;
    const existing = new Set();
    for (const item of items) {
      const lang = item?.compactLinkRenderer?.serviceEndpoint?.commandExecutorCommand?.commands?.[0]
        ?.selectSubtitlesTrackCommand?.translationLanguage;
      if (lang?.languageCode) existing.add(lang.languageCode);
    }
    const browserLanguage = String(document.documentElement.lang || navigator.language || 'en').split('-')[0];
    if (VTW.config.subtitle_user_language && !existing.has(browserLanguage)) {
      items.unshift(subtitleOption(browserLanguage));
      existing.add(browserLanguage);
    }
    if (VTW.config.subtitle_all_languages) {
      for (const code of languageCodes) if (!existing.has(code)) items.push(subtitleOption(code));
    }
    VTW.setStatus?.('subtitles', { state: 'active', message: 'Untertitelsprachen ergänzt', count: items.length });
  };

  VTW.addCommandInputModifier?.((command) => {
    try {
      if (VTW.config.fix_language_settings) {
        const data = command?.setClientSettingEndpoint?.settingDatas;
        if (Array.isArray(data)) {
          const language = data.find((entry) => entry?.clientSettingEnum?.item === 'I18N_LANGUAGE')?.stringValue;
          if (language) {
            setLanguageCookie(language);
            queueMicrotask(() => location.reload());
            return false;
          }
        }
      }
      patchSubtitleCommand(command);
      if (command?.requestAccountSelectorCommand?.identityActionContext?.eventTrigger === 'ACCOUNT_EVENT_TRIGGER_ON_EXIT'
          && !VTW.config.who_is_watching_on_exit) {
        return { signalAction: { signal: 'EXIT_APP' } };
      }
      if (VTW.config.hide_are_you_still_watching && command?.openPopupAction?.popup?.youThereRenderer) return false;
    } catch (error) {
      VTW.log?.('warn', 'upstream', 'Command-Adapter übersprungen', error);
    }
    return command;
  });

  const accountRecurringActionKey = 'yt.leanback.default::recurring_actions';
  const setWhoIsWatchingPreference = () => {
    try {
      const raw = localStorage.getItem(accountRecurringActionKey);
      if (!raw) return false;
      const state = VTW.nativeJsonParse(raw);
      const actions = state?.data?.data;
      if (!actions || typeof actions !== 'object') return false;
      const now = Date.now();
      const timestamp = VTW.config.who_is_watching_enabled ? now - 7 * 86400000 : now + 7 * 86400000;
      for (const key of ['startup-screen-account-selector-with-guest', 'whos_watching_fullscreen_zero_accounts', 'startup-screen-signed-out-welcome-back']) {
        if (actions[key] && typeof actions[key] === 'object') actions[key].lastFired = timestamp;
      }
      localStorage.setItem(accountRecurringActionKey, VTW.nativeJsonStringify(state));
      return true;
    } catch (error) {
      VTW.log?.('debug', 'upstream', 'Kontoauswahl-Zeitplan nicht verfügbar', error);
      return false;
    }
  };

  VTW.openWhoIsWatching = () => {
    try {
      const resolve = VTW.getResolveCommand?.();
      if (resolve) {
        resolve({
          requestAccountSelectorCommand: {
            identityActionContext: { eventTrigger: 'ACCOUNT_EVENT_TRIGGER_ON_EXIT' }
          }
        });
        return true;
      }
      const candidate = [...document.querySelectorAll('button,[role="button"],[tabindex="0"]')].find((node) => {
        const label = `${node.textContent || ''} ${node.getAttribute('aria-label') || ''}`;
        return /(switch account|change account|konto wechseln|konto auswählen|profile|profil)/i.test(label);
      });
      candidate?.click?.();
      return Boolean(candidate);
    } catch (error) {
      VTW.log?.('warn', 'upstream', 'Kontoauswahl konnte nicht geöffnet werden', error);
      return false;
    }
  };

  const findAccountChoice = () => {
    const candidates = [...document.querySelectorAll('button,[role="button"],[tabindex="0"]')];
    return candidates.find((node) => {
      const label = `${node.textContent || ''} ${node.getAttribute('aria-label') || ''}`.trim();
      return label && !/(konto hinzufügen|add account|gast|guest|abbrechen|cancel)/i.test(label)
        && node.closest('[class*="account" i],[id*="account" i],ytlr-who-is-watching-renderer');
    });
  };

  const applyDomOptions = () => {
    document.documentElement.toggleAttribute('data-vtw-hide-logo', Boolean(VTW.config.hide_youtube_logo));
    document.documentElement.toggleAttribute('data-vtw-audio-only', Boolean(VTW.config.audio_only_mode));
    document.documentElement.dataset.vtwFocusTheme = VTW.config.focus_theme || 'youtube';
    const video = document.querySelector('video');
    if (video) video.style.visibility = VTW.config.audio_only_mode ? 'hidden' : '';
    if (VTW.config.auto_account_select && !VTW.config.who_is_watching_enabled) {
      const choice = findAccountChoice();
      if (choice && choice.dataset.vtwAutoSelected !== 'true') {
        choice.dataset.vtwAutoSelected = 'true';
        setTimeout(() => choice.click?.(), 250);
      }
    }
    if (!VTW.config.signin_reminder) {
      for (const node of document.querySelectorAll('[class*="feed-nudge" i],[class*="signin" i]')) {
        const text = `${node.textContent || ''} ${node.getAttribute?.('aria-label') || ''}`;
        if (/(sign in|anmelden).*(watch|continue|personal)/i.test(text)) node.setAttribute('data-vtw-hidden-signin-reminder', 'true');
      }
    } else {
      document.querySelectorAll('[data-vtw-hidden-signin-reminder]').forEach((node) => node.removeAttribute('data-vtw-hidden-signin-reminder'));
    }
  };

  let dimTimer = null;
  const resetDimming = () => {
    document.documentElement.classList.remove('vtw-screen-dimmed');
    clearTimeout(dimTimer);
    if (!VTW.config.screen_dimming) return;
    const timeout = Math.max(15, Number(VTW.config.screen_dimming_timeout) || 120) * 1000;
    dimTimer = setTimeout(() => document.documentElement.classList.add('vtw-screen-dimmed'), timeout);
    document.documentElement.style.setProperty('--vtw-dim-opacity', String(Math.max(0.1, Math.min(0.9, Number(VTW.config.screen_dimming_opacity) || 0.55))));
  };

  for (const eventName of ['keydown', 'pointerdown', 'mousemove', 'touchstart']) addEventListener(eventName, resetDimming, { passive: true, capture: true });

  let startupApplied = false;
  const applyStartupDestination = () => {
    if (startupApplied || !VTW.configReady) return;
    startupApplied = true;
    setWhoIsWatchingPreference();
    const destination = String(VTW.config.startup_destination || 'none');
    if (destination === 'none') return;
    const hashes = {
      home: '#/',
      subscriptions: '#/browse?c=FEsubscriptions',
      library: '#/browse?c=FElibrary',
      live: '#/browse?c=FEtopics_live'
    };
    const target = hashes[destination];
    if (!target) return;
    if (VTW.config.reload_start_page || !location.hash || location.hash === '#/') location.hash = target;
    VTW.setStatus?.('startup', { state: 'active', message: `Startziel: ${destination}` });
  };

  const enablePreviewFlag = () => {
    try {
      for (const value of Object.values(window._yttv || {})) {
        const candidates = [value, value?.instance, value?.data];
        for (const candidate of candidates) {
          if (candidate instanceof Map && candidate.has('ENABLE_PREVIEWS_WITH_SOUND')) {
            candidate.set('ENABLE_PREVIEWS_WITH_SOUND', Boolean(VTW.config.enable_video_previews));
          }
        }
      }
    } catch {}
  };

  const scan = () => {
    applyDomOptions();
    enablePreviewFlag();
    applyStartupDestination();
  };

  const observer = new MutationObserver(() => requestAnimationFrame(scan));
  const start = () => {
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-label'] });
    scan();
    resetDimming();
    VTW.setStatus?.('upstream', { state: 'active', message: 'Zusammengeführte TV-Mods aktiv' });
  };
  if (document.documentElement) start(); else addEventListener('DOMContentLoaded', start, { once: true });
  VTW.on('config', () => { scan(); resetDimming(); });
})();
