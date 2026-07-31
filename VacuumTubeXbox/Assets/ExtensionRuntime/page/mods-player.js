(() => {
  'use strict';
  const VTW = globalThis.VTW;
  if (!VTW) return;

  const keyCodeMap = {
    Enter: 13, Escape: 27, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39,
    F2: 113, F3: 114, F4: 115, F5: 116, '*': 170, '-': 189, '+': 187, '=': 187, m: 77, o: 79, c: 67
  };
  const createKeyEvent = (type, key, code = key, extras = {}) => {
    const event = new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true, ...extras });
    try { Object.defineProperty(event, '__vtwXboxInternal', { configurable: true, value: true }); } catch {}
    const keyCode = extras.keyCode ?? keyCodeMap[key] ?? 0;
    for (const property of ['keyCode', 'which', 'charCode']) {
      try { Object.defineProperty(event, property, { configurable: true, get: () => keyCode }); } catch {}
    }
    return event;
  };
  const dispatchKey = (key, code = key, extras = {}) => {
    document.dispatchEvent(createKeyEvent('keydown', key, code, extras));
    setTimeout(() => document.dispatchEvent(createKeyEvent('keyup', key, code, extras)), 30);
  };

  const inputModifiers = VTW.commandInputModifiers = VTW.commandInputModifiers || [];
  VTW.addCommandInputModifier = (fn) => { inputModifiers.push(fn); return fn; };
  const patchedInstances = new WeakSet();

  const installResolveHook = () => {
    try {
      for (const key in window._yttv || {}) {
        const instance = window._yttv[key]?.instance;
        if (!instance || typeof instance.resolveCommand !== 'function' || patchedInstances.has(instance)) continue;
        const original = instance.resolveCommand;
        const callOriginal = (command) => original.call(instance, command);
        VTW.resolveCommand = callOriginal;
        const patched = function(command) {
          let next = command;
          for (const modifier of inputModifiers) {
            try {
              next = modifier(next);
              if (next === false) return true;
            } catch (error) {
              console.error('[VTW] command modifier failed', error);
            }
          }
          return original.call(this, next);
        };
        try { instance.resolveCommand = patched; patchedInstances.add(instance); }
        catch (error) { console.debug('[VTW] resolveCommand hook unavailable', error); }
      }
    } catch {}
  };
  installResolveHook();
  setInterval(installResolveHook, 250);

  const containsVacuumSettingsCommand = (value, seen = new WeakSet(), depth = 0) => {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 8) return false;
    seen.add(value);
    if (value.vtwOpenSettingsCommand === true || value.vtConfigOption === 'open-settings') return true;
    for (const item of Object.values(value)) {
      if (containsVacuumSettingsCommand(item, seen, depth + 1)) return true;
    }
    return false;
  };

  let captionsEnabled = false;
  let captionSettings = { useDefaultTrack: true };
  inputModifiers.push((command) => {
    if (containsVacuumSettingsCommand(command)) {
      queueMicrotask(() => VTW.openSettingsOverlay?.());
      return false;
    }
    if (command?.selectSubtitlesTrackCommand) {
      captionsEnabled = Object.keys(command.selectSubtitlesTrackCommand).length > 0;
      if (captionsEnabled) captionSettings = command.selectSubtitlesTrackCommand;
    }
    if (VTW.config.block_signin_popup && command?.openPopupAction?.uniqueId === 'playback-cap') return false;
    if (command?.signalAction?.signal === 'RELOAD_PAGE') {
      location.reload();
      return false;
    }
    const list = command?.commandExecutorCommand?.commands;
    if (Array.isArray(list) && list.some((item) => item?.signalAction?.signal === 'EXIT_APP')) {
      if (VTW.config.who_is_watching_on_exit && VTW.openWhoIsWatching?.()) return false;
      history.back();
      return false;
    }
    return command;
  });

  // SponsorBlock: isolated loading, configurable categories and skip/notify behavior.
  let sponsorSegments = [];
  let sponsorVideoId = null;
  let sponsorLoadingId = null;
  let attachedVideo = null;
  const handledSegments = new Set();

  const sponsorCategories = () => {
    const mapping = {
      sponsor_cat_sponsor: 'sponsor',
      sponsor_cat_intro: 'intro',
      sponsor_cat_outro: 'outro',
      sponsor_cat_selfpromo: 'selfpromo',
      sponsor_cat_interaction: 'interaction',
      sponsor_cat_preview: 'preview',
      sponsor_cat_filler: 'filler',
      sponsor_cat_music_offtopic: 'music_offtopic',
      sponsor_cat_highlight: 'poi_highlight'
    };
    const selected = Object.entries(mapping).filter(([key]) => VTW.config[key]).map(([, value]) => value);
    return selected.length ? selected : ['sponsor'];
  };

  const categoryLabel = (category) => ({
    sponsor: 'Sponsor', intro: 'Intro', outro: 'Outro', selfpromo: 'Eigenwerbung',
    interaction: 'Interaktionserinnerung', preview: 'Vorschau/Rückblick',
    filler: 'Füllmaterial', music_offtopic: 'Musik ohne Inhalt', poi_highlight: 'Highlight'
  }[category] || 'Segment');

  const sponsorManualCategories = () => {
    const mapping = {
      sponsor_manual_intro: 'intro',
      sponsor_manual_outro: 'outro',
      sponsor_manual_filler: 'filler',
      sponsor_manual_interaction: 'interaction'
    };
    return new Set(Object.entries(mapping).filter(([key]) => VTW.config[key]).map(([, value]) => value));
  };

  VTW.sponsorState = VTW.sponsorState || { videoId: null, segments: [], handled: handledSegments };

  const checkForSponsorSegment = () => {
    const video = attachedVideo;
    if (!VTW.config.sponsorblock || !video || video.paused || !sponsorSegments.length) return;
    const now = Number(video.currentTime) || 0;
    const segment = sponsorSegments
      .filter((item) => now >= item.startTime - 0.25 && now < item.endTime - 0.08)
      .sort((a, b) => a.startTime - b.startTime)[0];
    if (!segment) return;
    const key = `${sponsorVideoId}:${segment.startTime}:${segment.endTime}`;
    if (handledSegments.has(key)) return;
    handledSegments.add(key);

    const duration = Math.max(0, segment.endTime - segment.startTime);
    const durationText = VTW.config.sponsor_show_duration ? ` · ${duration.toFixed(duration < 10 ? 1 : 0)} s` : '';
    const label = `${categoryLabel(segment.category)}${durationText}`;

    if (sponsorManualCategories().has(segment.category)) {
      VTW.toast('SponsorBlock', `${label} kann übersprungen werden`, {
        type: 'action', mod: 'sponsorblock', dedupeKey: key, dedupeMs: 60000,
        actions: [{
          label: 'Überspringen',
          onClick: () => { video.currentTime = Math.max(video.currentTime, segment.endTime + 0.03); }
        }]
      });
      VTW.setStatus('sponsorblock', { state: 'active', message: `${label} wartet auf Bestätigung` });
      return;
    }

    if (VTW.config.sponsor_mode === 'notify' || segment.category === 'poi_highlight') {
      VTW.toast('SponsorBlock', `${label} erkannt`, {
        type: 'info', mod: 'sponsorblock', dedupeKey: key, dedupeMs: 60000
      });
      VTW.setStatus('sponsorblock', { state: 'active', message: `${label} erkannt` });
      return;
    }

    const previousTime = now;
    video.currentTime = Math.max(now, segment.endTime + 0.03);
    const actions = VTW.config.sponsor_allow_undo ? [{
      label: 'Rückgängig',
      onClick: () => {
        video.currentTime = Math.max(0, segment.startTime + 0.02);
        handledSegments.delete(key);
      }
    }] : undefined;
    VTW.toast('SponsorBlock', `${label} übersprungen`, {
      type: 'action', mod: 'sponsorblock', dedupeKey: key, dedupeMs: 60000, actions
    });
    VTW.setStatus('sponsorblock', { state: 'active', message: `${label} übersprungen`, count: sponsorSegments.length });
    VTW.log('info', 'sponsorblock', `${label} übersprungen`, { from: previousTime, to: segment.endTime });
  };

  const renderSponsorMarkers = () => {
    const video = attachedVideo;
    const host = document.querySelector('.html5-video-player, ytlr-player, #player, [class*="player-container" i]');
    if (!host || !video || !Number.isFinite(video.duration) || video.duration <= 0 || !VTW.config.sponsorblock) {
      document.getElementById('vtw-sponsor-markers')?.remove();
      return;
    }
    let root = document.getElementById('vtw-sponsor-markers');
    if (!root) {
      root = document.createElement('div');
      root.id = 'vtw-sponsor-markers';
    }
    if (root.parentElement !== host) host.appendChild(root);
    root.replaceChildren(...sponsorSegments.map((segment) => {
      const marker = document.createElement('span');
      marker.className = 'vtw-sponsor-marker';
      marker.title = categoryLabel(segment.category);
      marker.style.left = `${Math.max(0, Math.min(100, segment.startTime / video.duration * 100))}%`;
      marker.style.width = `${Math.max(.18, Math.min(100, (segment.endTime - segment.startTime) / video.duration * 100))}%`;
      return marker;
    }));
  };

  const attachSponsorVideo = () => {
    const video = document.querySelector('video');
    if (!video || video === attachedVideo) return;
    if (attachedVideo) {
      attachedVideo.removeEventListener('timeupdate', checkForSponsorSegment);
      attachedVideo.removeEventListener('durationchange', renderSponsorMarkers);
    }
    attachedVideo = video;
    video.addEventListener('timeupdate', checkForSponsorSegment);
    video.addEventListener('durationchange', renderSponsorMarkers);
    renderSponsorMarkers();
  };

  const refreshSponsorSegments = async (force = false) => {
    if (!VTW.config.sponsorblock) {
      sponsorSegments = [];
      sponsorVideoId = null;
      sponsorLoadingId = null;
      VTW.sponsorState.videoId = null;
      VTW.sponsorState.segments = [];
      handledSegments.clear();
      document.getElementById('vtw-sponsor-markers')?.remove();
      VTW.setStatus('sponsorblock', { state: 'disabled', message: 'Deaktiviert' });
      return;
    }
    const videoId = VTW.getVideoId();
    if (!videoId || (!force && (videoId === sponsorVideoId || videoId === sponsorLoadingId))) return;
    sponsorLoadingId = videoId;
    sponsorSegments = [];
    handledSegments.clear();
    VTW.setStatus('sponsorblock', { state: 'loading', message: 'Segmente werden geladen' });
    try {
      const data = await VTW.api('sponsorSegments', { videoId, categories: sponsorCategories() }, 6000);
      if (sponsorLoadingId !== videoId) return;
      sponsorVideoId = videoId;
      sponsorSegments = (Array.isArray(data) ? data : []).map((item) => ({
        startTime: Number(item.segment?.[0]),
        endTime: Number(item.segment?.[1]),
        category: item.category
      })).filter((item) => Number.isFinite(item.startTime) && Number.isFinite(item.endTime) && item.endTime > item.startTime);
      VTW.sponsorState.videoId = videoId;
      VTW.sponsorState.segments = sponsorSegments;
      VTW.setStatus('sponsorblock', {
        state: 'active',
        message: sponsorSegments.length ? `${sponsorSegments.length} Segmente gefunden` : 'Keine Segmente gefunden',
        count: sponsorSegments.length
      });
      renderSponsorMarkers();
      VTW.toast('SponsorBlock aktiv', sponsorSegments.length
        ? `${sponsorSegments.length} Segment${sponsorSegments.length === 1 ? '' : 'e'} gefunden`
        : 'Keine Segmente für dieses Video', {
        type: sponsorSegments.length ? 'success' : 'info', mod: 'sponsorblock',
        dedupeKey: `sponsor-loaded:${videoId}:${sponsorCategories().join(',')}`,
        dedupeMs: 60000
      });
    } catch (error) {
      if (sponsorLoadingId === videoId) sponsorVideoId = videoId;
      VTW.setStatus('sponsorblock', { state: 'error', message: `API-Fehler: ${error.message}` });
      VTW.toast('SponsorBlock nicht erreichbar', error.message, {
        type: 'error', mod: 'sponsorblock', dedupeKey: 'sponsor-error', dedupeMs: 30000
      });
      VTW.log('error', 'sponsorblock', 'SponsorBlock-Segmente konnten nicht geladen werden', error);
    } finally {
      if (sponsorLoadingId === videoId) sponsorLoadingId = null;
    }
  };

  setInterval(() => {
    attachSponsorVideo();
    refreshSponsorSegments();
  }, 500);
  addEventListener('hashchange', () => refreshSponsorSegments(true));
  VTW.on('config', () => refreshSponsorSegments(true));

  // Volume controls.
  let volume = Number(VTW.config.volume) || 100;
  let muted = false;
  let volumeTimer;

  const ensureVolumeUI = () => {
    let root = document.getElementById('vtw-volume');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'vtw-volume';
    root.innerHTML = '<span id="vtw-volume-icon">🔊</span><div id="vtw-volume-track"><div id="vtw-volume-fill"></div></div><span id="vtw-volume-text"></span>';
    (document.body || document.documentElement).appendChild(root);
    return root;
  };

  const applyVolume = () => {
    for (const video of document.querySelectorAll('video')) {
      video.volume = Math.max(0, Math.min(1, volume / 100));
      video.muted = muted;
    }
    for (const player of document.querySelectorAll('.html5-video-player')) {
      try { player.setVolume?.(muted ? 0 : volume); } catch {}
    }
  };

  const showVolume = () => {
    const root = ensureVolumeUI();
    const shown = muted ? 0 : volume;
    root.querySelector('#vtw-volume-fill').style.width = `${shown}%`;
    root.querySelector('#vtw-volume-text').textContent = `${shown}%`;
    root.querySelector('#vtw-volume-icon').textContent = muted || volume === 0 ? '🔇' : volume <= 50 ? '🔉' : '🔊';
    root.classList.add('visible');
    clearTimeout(volumeTimer);
    volumeTimer = setTimeout(() => root.classList.remove('visible'), 1500);
  };

  VTW.on('config', (config) => {
    if (Number.isFinite(Number(config.volume))) volume = Number(config.volume);
    applyVolume();
  });
  setInterval(applyVolume, 750);

  document.addEventListener('keydown', (event) => {
    if (globalThis.__VTW_XBOX_NATIVE__ && !event.__vtwXbox && !event.__vtwXboxInternal) return;
    const key = typeof event.key === 'string' ? event.key : '';
    if ((key === '+' || key === '=') && !event.ctrlKey && !event.metaKey) volume = Math.min(100, volume + 5);
    else if (key === '-' && !event.ctrlKey && !event.metaKey) volume = Math.max(0, volume - 5);
    else if ((key === 'm' || key === 'M') && !event.ctrlKey && !event.metaKey) muted = !muted;
    else if (event.ctrlKey && !event.shiftKey && key && key.toLowerCase() === 'o') {
      event.preventDefault();
      event.stopImmediatePropagation();
      VTW.toggleSettingsOverlay?.();
      return;
    } else if (!event.ctrlKey && !event.shiftKey && !event.metaKey && key && key.toLowerCase() === 'c') {
      const resolveCommand = VTW.getResolveCommand();
      if (resolveCommand) {
        event.preventDefault();
        event.stopImmediatePropagation();
        resolveCommand({
          commandMetadata: { webCommandMetadata: { clientAction: true } },
          selectSubtitlesTrackCommand: captionsEnabled ? {} : captionSettings
        });
      }
      return;
    } else return;

    event.preventDefault();
    event.stopImmediatePropagation();
    applyVolume();
    showVolume();
    VTW.saveConfig?.({ volume }).catch(() => {});
  }, true);

  // Browser gamepad fallback. Disabled in the Xbox native host; UWP Windows.Gaming.Input is the only controller source there.
  const gamepadState = new Map();
  const repeatDelay = 360;
  const repeatRate = 115;

  const controllerProfile = (gamepad) => {
    const id = String(gamepad.id || '').toLowerCase();
    if (/nintendo|switch|joy-con/.test(id)) return { confirm: 1, back: 0 };
    return { confirm: 0, back: 1 };
  };

  const actionPressed = (gamepad, action) => {
    const profile = controllerProfile(gamepad);
    const button = (index) => Boolean(gamepad.buttons[index]?.pressed || gamepad.buttons[index]?.value > 0.55);
    const axis = (index) => Number(gamepad.axes[index] || 0);
    if (action === 'confirm') return button(profile.confirm);
    if (action === 'back') return button(profile.back);
    if (action === 'up') return button(12) || axis(1) < -0.58 || axis(7) < -0.58;
    if (action === 'down') return button(13) || axis(1) > 0.58 || axis(7) > 0.58;
    if (action === 'left') return button(14) || axis(0) < -0.58 || axis(6) < -0.58;
    if (action === 'right') return button(15) || axis(0) > 0.58 || axis(6) > 0.58;
    if (action === 'previousTab') return button(4);
    if (action === 'nextTab') return button(5);
    if (action === 'openSettings') return button(9) || button(11);
    if (action === 'volumeDown') return button(8);
    if (action === 'volumeUp') return button(10);
    return false;
  };

  const dispatchControllerAction = (action) => {
    const menuVisible = Boolean(VTW.isSettingsOverlayVisible?.());
    const menuMap = {
      confirm: ['Enter', 'Enter', { keyCode: 13 }],
      back: ['Escape', 'Escape', { keyCode: 27 }],
      up: ['ArrowUp', 'ArrowUp', { keyCode: 38 }],
      down: ['ArrowDown', 'ArrowDown', { keyCode: 40 }],
      left: ['ArrowLeft', 'ArrowLeft', { keyCode: 37 }],
      right: ['ArrowRight', 'ArrowRight', { keyCode: 39 }],
      previousTab: ['PageUp', 'PageUp', { keyCode: 33 }],
      nextTab: ['PageDown', 'PageDown', { keyCode: 34 }]
    };
    if (action === 'openSettings') {
      VTW.openSettingsOverlay?.();
      return;
    }
    if (menuVisible && menuMap[action]) {
      dispatchKey(...menuMap[action]);
      return;
    }
    if (!VTW.config.controller_support) return;
    const pageMap = {
      confirm: ['Enter', 'Enter', { keyCode: 13 }],
      back: ['Escape', 'Escape', { keyCode: 27 }],
      up: ['ArrowUp', 'ArrowUp', { keyCode: 38 }],
      down: ['ArrowDown', 'ArrowDown', { keyCode: 40 }],
      left: ['ArrowLeft', 'ArrowLeft', { keyCode: 37 }],
      right: ['ArrowRight', 'ArrowRight', { keyCode: 39 }],
      previousTab: ['F4', 'F4', { keyCode: 115 }],
      nextTab: ['F5', 'F5', { keyCode: 116 }],
      volumeDown: ['-', 'Minus', { keyCode: 189 }],
      volumeUp: ['+', 'Equal', { keyCode: 187 }]
    };
    if (pageMap[action]) dispatchKey(...pageMap[action]);
  };

  const repeatableActions = new Set(['up', 'down', 'left', 'right']);
  const allActions = ['confirm', 'back', 'up', 'down', 'left', 'right', 'previousTab', 'nextTab', 'openSettings', 'volumeDown', 'volumeUp'];

  const pollGamepads = () => {
    const pads = navigator.getGamepads?.() || [];
    let connected = 0;
    const now = performance.now();
    for (const gamepad of pads) {
      if (!gamepad) continue;
      connected++;
      const previous = gamepadState.get(gamepad.index) || {};
      for (const action of allActions) {
        const pressed = actionPressed(gamepad, action);
        const state = previous[action] || { pressed: false, nextRepeat: 0 };
        if (pressed && !state.pressed) {
          dispatchControllerAction(action);
          state.nextRepeat = now + repeatDelay;
        } else if (pressed && repeatableActions.has(action) && now >= state.nextRepeat) {
          dispatchControllerAction(action);
          state.nextRepeat = now + repeatRate;
        }
        state.pressed = pressed;
        previous[action] = state;
      }
      gamepadState.set(gamepad.index, previous);
    }
    VTW.setStatus('controller', {
      state: connected ? 'active' : (VTW.config.controller_support ? 'idle' : 'disabled'),
      message: connected ? `${connected} Controller verbunden` : (VTW.config.controller_support ? 'Wartet auf Controller' : 'Seitennavigation deaktiviert'),
      count: connected
    });
    if (!globalThis.__VTW_XBOX_NATIVE__) requestAnimationFrame(pollGamepads);
  };
  if (!globalThis.__VTW_XBOX_NATIVE__) requestAnimationFrame(pollGamepads);

  if (!globalThis.__VTW_XBOX_NATIVE__) addEventListener('gamepadconnected', (event) => {
    VTW.toast('Controller verbunden', event.gamepad?.id || 'Gamepad erkannt', {
      type: 'success', mod: 'system', dedupeKey: `gamepad:${event.gamepad?.index}`, dedupeMs: 3000
    });
  });

  // Touch navigation overlay.
  let touchHideTimer = null;
  const ensureTouchOverlay = () => {
    if (globalThis.__VTW_XBOX_NATIVE__ || !VTW.config.touch_overlay) return null;
    let root = document.getElementById('vtw-touch');
    if (!root) {
      root = document.createElement('div');
      root.id = 'vtw-touch';
      const buttons = [
        ['up', '↑', 'ArrowUp'], ['left', '←', 'ArrowLeft'], ['ok', 'OK', 'Enter'],
        ['right', '→', 'ArrowRight'], ['down', '↓', 'ArrowDown'], ['back', '↩', 'Escape']
      ];
      for (const [className, label, key] of buttons) {
        const button = document.createElement('button');
        button.className = className;
        button.textContent = label;
        button.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          dispatchKey(key, key);
        });
        root.appendChild(button);
      }
      (document.body || document.documentElement).appendChild(root);
    }
    root.style.display = 'grid';
    clearTimeout(touchHideTimer);
    touchHideTimer = setTimeout(() => { if (root.isConnected) root.style.display = 'none'; }, 3000);
    return root;
  };
  addEventListener('touchstart', ensureTouchOverlay, { passive: true });
  VTW.on('config', (config) => {
    if (!config.touch_overlay) document.getElementById('vtw-touch')?.remove();
  });

  document.addEventListener('keydown', async (event) => {
    if (globalThis.__VTW_XBOX_NATIVE__) return; // No desktop clipboard shortcut in the Xbox build.
    if (event.ctrlKey && event.shiftKey && String(event.key || '').toLowerCase() === 'c') {
      const videoId = VTW.getVideoId();
      if (!videoId) return;
      try {
        await navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${videoId}`);
        VTW.toast('VacuumTube', 'Video-URL kopiert', { type: 'success' });
      } catch {}
    }
  }, true);
})();
