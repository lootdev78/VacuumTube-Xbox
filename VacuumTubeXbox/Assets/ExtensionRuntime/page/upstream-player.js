(() => {
  'use strict';
  const VTW = globalThis.VTW;
  if (!VTW || globalThis.__VTW_UPSTREAM_PLAYER__) return;
  globalThis.__VTW_UPSTREAM_PLAYER__ = true;

  VTW.xboxQueue = VTW.xboxQueue || [];

  const playerRoot = () => document.querySelector('.html5-video-player, ytlr-watch-player, ytlr-player, #movie_player, #player, [class*="player-container" i]');
  const videoElement = () => document.querySelector('video');

  const dispatchKey = (key, code = key, keyCode = 0) => {
    for (const type of ['keydown', 'keyup']) {
      const event = new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true });
      try { Object.defineProperty(event, '__vtwXboxInternal', { configurable: true, value: true }); } catch {}
      for (const name of ['keyCode', 'which']) {
        try { Object.defineProperty(event, name, { configurable: true, get: () => keyCode }); } catch {}
      }
      document.dispatchEvent(event);
    }
  };

  const getFocusedTile = () => {
    const active = document.activeElement;
    if (!active) return null;
    return active.closest?.('ytlr-tile-renderer,ytlr-video-tile-renderer,ytlr-lockup-view-model,[data-video-id],[class*="tile" i]') || active;
  };

  const videoIdFromElement = (element) => {
    if (!element) return null;
    const direct = element.getAttribute?.('data-video-id') || element.dataset?.videoId;
    if (/^[A-Za-z0-9_-]{11}$/.test(direct || '')) return direct;
    for (const link of element.matches?.('a[href]') ? [element] : [...(element.querySelectorAll?.('a[href]') || [])]) {
      try {
        const url = new URL(link.getAttribute('href') || '', location.origin);
        const id = url.searchParams.get('v') || url.pathname.match(/\/shorts\/([A-Za-z0-9_-]{11})/)?.[1];
        if (/^[A-Za-z0-9_-]{11}$/.test(id || '')) return id;
      } catch {}
    }
    const data = element.__data || element.data || element.data_ || element.__dataHost?.__data;
    const stack = [data];
    const seen = new WeakSet();
    while (stack.length) {
      const value = stack.pop();
      if (!value || typeof value !== 'object' || seen.has(value)) continue;
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        if (/videoId|contentId/i.test(key) && /^[A-Za-z0-9_-]{11}$/.test(String(child || ''))) return String(child);
        if (child && typeof child === 'object') stack.push(child);
      }
    }
    return null;
  };

  const titleFromElement = (element) => {
    const candidates = [...(element?.querySelectorAll?.('[title],[aria-label],[class*="title" i]') || [])];
    for (const node of candidates) {
      const text = node.getAttribute('title') || node.getAttribute('aria-label') || node.textContent || '';
      if (text.trim().length > 2) return text.trim().slice(0, 180);
    }
    return '';
  };

  const addFocusedToQueue = () => {
    const tile = getFocusedTile();
    const videoId = videoIdFromElement(tile);
    if (!videoId) {
      VTW.toast?.('Warteschlange', 'Kein Video am aktuellen Fokus erkannt.', { type: 'warning', mod: 'system' });
      return false;
    }
    if (!VTW.xboxQueue.some((item) => item.videoId === videoId)) {
      VTW.xboxQueue.push({ videoId, title: titleFromElement(tile), addedAt: Date.now() });
    }
    VTW.toast?.('Zur Warteschlange hinzugefügt', titleFromElement(tile) || videoId, { type: 'success', mod: 'system' });
    return true;
  };

  const playQueueItem = (direction) => {
    if (!VTW.xboxQueue.length) return false;
    const current = VTW.getVideoId?.();
    let index = VTW.xboxQueue.findIndex((item) => item.videoId === current);
    if (index < 0) index = direction > 0 ? -1 : 0;
    index = (index + direction + VTW.xboxQueue.length) % VTW.xboxQueue.length;
    const item = VTW.xboxQueue[index];
    if (!item) return false;
    location.href = `https://www.youtube.com/tv#/watch?v=${encodeURIComponent(item.videoId)}`;
    return true;
  };

  const previousVideo = () => {
    const player = playerRoot();
    try {
      if (typeof player?.previousVideo === 'function') { player.previousVideo(); return; }
    } catch {}
    if (!playQueueItem(-1)) dispatchKey('MediaTrackPrevious', 'MediaTrackPrevious', 177);
  };

  const nextVideo = () => {
    const player = playerRoot();
    try {
      if (typeof player?.nextVideo === 'function') { player.nextVideo(); return; }
    } catch {}
    if (!playQueueItem(1)) dispatchKey('MediaTrackNext', 'MediaTrackNext', 176);
  };

  const speedSteps = () => {
    const increment = [0.1, 0.25, 0.5].includes(Number(VTW.config.playback_rate_increment))
      ? Number(VTW.config.playback_rate_increment) : 0.25;
    const values = [];
    for (let value = 0.25; value <= 3.0001; value += increment) {
      const rounded = Math.round(value * 100) / 100;
      if (rounded >= 0.25 && rounded <= 3) values.push(rounded);
    }
    if (!values.includes(1)) values.push(1);
    return [...new Set(values)].sort((a, b) => a - b);
  };

  const cycleSpeed = () => {
    const video = videoElement();
    if (!video) return;
    const current = Number(video.playbackRate || 1);
    const steps = speedSteps();
    let next = steps.find((value) => value > current + 0.01);
    if (!next) next = 1;
    video.playbackRate = next;
    VTW.config.playback_rate = String(next);
    VTW.saveConfig?.({ playback_rate: String(next) }).catch(() => {});
    VTW.toast?.('Wiedergabegeschwindigkeit', `${next}×`, { type: 'info', mod: 'system', dedupeKey: 'speed' });
  };

  const jumpToHighlight = () => {
    const segment = VTW.sponsorState?.segments?.find?.((item) => item.category === 'poi_highlight');
    const video = videoElement();
    if (!segment || !video) return false;
    video.currentTime = Math.max(0, Number(segment.startTime) || 0);
    VTW.toast?.('SponsorBlock', 'Zum Highlight gesprungen', { type: 'action', mod: 'sponsorblock' });
    return true;
  };

  const buttonHost = () => {
    const root = playerRoot();
    if (!root) return null;
    const candidates = [...root.querySelectorAll('[role="toolbar"],[class*="transport" i],[class*="action" i],[class*="controls" i]')]
      .filter((node) => node.querySelector('button,[role="button"],[tabindex="0"]'));
    return candidates.sort((a, b) => b.querySelectorAll('button,[role="button"]').length - a.querySelectorAll('button,[role="button"]').length)[0] || null;
  };

  const makeButton = (id, label, icon, action) => {
    let button = document.getElementById(id);
    if (button) return button;
    button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.className = 'vtw-native-player-button';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<span aria-hidden="true">${icon}</span>`;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      action();
    });
    return button;
  };

  const ensurePlayerButtons = () => {
    const host = buttonHost();
    if (!host || !VTW.config.player_patch_enabled) {
      document.querySelectorAll('.vtw-native-player-button').forEach((node) => node.remove());
      return;
    }

    const controls = [
      ['vtw-player-previous', 'Vorheriges Video', '⏮', previousVideo, VTW.config.show_previous_next_buttons],
      ['vtw-player-next', 'Nächstes Video', '⏭', nextVideo, VTW.config.show_previous_next_buttons],
      ['vtw-player-speed', 'Wiedergabegeschwindigkeit', '1×', cycleSpeed, VTW.config.show_speed_button],
      ['vtw-player-highlight', 'Zum SponsorBlock-Highlight', '★', jumpToHighlight, VTW.config.sponsor_cat_highlight && Boolean(VTW.sponsorState?.segments?.some?.((item) => item.category === 'poi_highlight'))],
      ['vtw-player-mini', 'Mini Player', '▣', () => dispatchKey('i', 'KeyI', 73), VTW.config.show_mini_player_button]
    ];

    for (const [id, label, icon, action, enabled] of controls) {
      const existing = document.getElementById(id);
      if (!enabled) { existing?.remove(); continue; }
      const button = makeButton(id, label, icon, action);
      if (button.parentElement !== host) host.appendChild(button);
    }
  };

  const parseTimestamp = (raw) => {
    const parts = String(raw).split(':').map(Number);
    if (parts.some((part) => !Number.isFinite(part))) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  };

  const collectChapterText = () => {
    const selectors = [
      '[class*="description" i]', '[id*="description" i]',
      'ytlr-video-description-renderer', 'ytlr-watch-metadata-renderer'
    ];
    const text = selectors.flatMap((selector) => [...document.querySelectorAll(selector)])
      .map((node) => node.textContent || '').join('\n');
    return text.slice(0, 25000);
  };

  const parseChapters = (text, duration) => {
    const result = [];
    for (const line of String(text || '').split(/\r?\n/)) {
      const match = line.trim().match(/^(?:(\d{1,2}:)?\d{1,3}:\d{2})\s+(.{1,160})$/);
      if (!match) continue;
      const raw = match[0].match(/^(?:(?:\d{1,2}:)?\d{1,3}:\d{2})/)?.[0];
      const time = parseTimestamp(raw);
      if (time == null || time < 0 || time >= duration) continue;
      const title = line.trim().slice(raw.length).trim();
      if (!title) continue;
      result.push({ time, title });
    }
    result.sort((a, b) => a.time - b.time);
    return result.filter((item, index) => !index || item.time > result[index - 1].time + 1);
  };

  const progressHost = () => {
    const root = playerRoot();
    if (!root) return null;
    const candidates = [...root.querySelectorAll('[idomkey="progress-bar"],[class*="progress-bar" i],[class*="scrubber" i]')];
    return candidates[candidates.length - 1] || null;
  };

  let chapterSignature = '';
  const renderChapters = () => {
    const video = videoElement();
    const host = progressHost();
    if (!VTW.config.enable_chapters || !video || !host || !Number.isFinite(video.duration) || video.duration <= 0) {
      document.getElementById('vtw-chapter-markers')?.remove();
      return;
    }
    const chapters = parseChapters(collectChapterText(), video.duration);
    const signature = `${VTW.getVideoId?.() || ''}:${video.duration}:${chapters.map((item) => item.time).join(',')}`;
    if (signature === chapterSignature && document.getElementById('vtw-chapter-markers')) return;
    chapterSignature = signature;
    let root = document.getElementById('vtw-chapter-markers');
    if (!chapters.length) {
      root?.remove();
      VTW.setStatus?.('chapters', { state: 'idle', message: 'Keine Kapitel erkannt', count: 0 });
      return;
    }
    if (!root) {
      root = document.createElement('div');
      root.id = 'vtw-chapter-markers';
    }
    root.replaceChildren(...chapters.map((chapter) => {
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'vtw-chapter-marker';
      marker.style.left = `${Math.max(0, Math.min(100, chapter.time / video.duration * 100))}%`;
      marker.title = chapter.title;
      marker.setAttribute('aria-label', `${chapter.title}, ${Math.floor(chapter.time / 60)}:${String(Math.floor(chapter.time % 60)).padStart(2, '0')}`);
      marker.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        video.currentTime = chapter.time;
      });
      return marker;
    }));
    if (root.parentElement !== host) host.appendChild(root);
    VTW.setStatus?.('chapters', { state: 'active', message: `${chapters.length} Kapitel erkannt`, count: chapters.length });
  };

  const boundDisplayVideos = new WeakSet();
  let displayRequestActive = false;
  const setDisplayRequest = (active) => {
    const desired = Boolean(active && VTW.config.keep_screen_awake);
    if (desired === displayRequestActive) return;
    displayRequestActive = desired;
    globalThis.VTXboxNative?.rpc?.('displayKeepActive', { active: desired }, 4000).then((nativeActive) => {
      VTW.setStatus?.('screen', {
        state: nativeActive ? 'active' : 'idle',
        message: nativeActive ? 'Xbox-Bildschirm bleibt während der Wiedergabe aktiv' : 'Bildschirmschoner normal'
      });
    }).catch((error) => {
      displayRequestActive = false;
      VTW.log?.('warn', 'screen', 'Native DisplayRequest konnte nicht aktualisiert werden', error);
    });
  };

  const bindDisplayRequest = (video) => {
    if (!video || boundDisplayVideos.has(video)) return;
    boundDisplayVideos.add(video);
    const update = () => setDisplayRequest(!video.paused && !video.ended && video.readyState >= 2 && !document.hidden);
    for (const eventName of ['playing', 'play', 'pause', 'ended', 'emptied', 'abort', 'stalled']) {
      video.addEventListener(eventName, update, { passive: true });
    }
    update();
  };

  const applyVideoStyle = () => {
    const video = videoElement();
    if (!video) { setDisplayRequest(false); return; }
    bindDisplayRequest(video);
    if (VTW.config.fit_video_to_screen && document.body.classList.contains('WEB_PAGE_TYPE_WATCH')) {
      Object.assign(video.style, { width: '100vw', height: '100vh', left: '0px', top: '0px' });
    }
    video.style.visibility = VTW.config.audio_only_mode ? 'hidden' : '';
  };

  VTW.handleXboxAction = (action) => {
    if (action === 'longPress') return addFocusedToQueue();
    if (action === 'previousVideo') { previousVideo(); return true; }
    if (action === 'nextVideo') { nextVideo(); return true; }
    if (action === 'speed') { cycleSpeed(); return true; }
    if (action === 'queueNext') return playQueueItem(1);
    if (action === 'appSuspending') {
      setDisplayRequest(false);
      if (VTW.config.pause_on_suspend) videoElement()?.pause?.();
      return true;
    }
    if (action === 'appResumed') {
      applyVideoStyle();
      const video = videoElement();
      if (video) setDisplayRequest(!video.paused && !video.ended);
      return true;
    }
    return false;
  };

  const scan = () => {
    applyVideoStyle();
    ensurePlayerButtons();
    renderChapters();
  };

  const observer = new MutationObserver(() => requestAnimationFrame(scan));
  const start = () => {
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    scan();
    setInterval(scan, 1000);
    VTW.setStatus?.('player_features', { state: 'active', message: 'Zusammengeführte Player-Funktionen aktiv' });
  };
  if (document.documentElement) start(); else addEventListener('DOMContentLoaded', start, { once: true });
  VTW.on('config', scan);
  addEventListener('hashchange', () => { chapterSignature = ''; setTimeout(scan, 300); });
  addEventListener('visibilitychange', () => { const video = videoElement(); setDisplayRequest(Boolean(video && !video.paused && !video.ended && !document.hidden)); });
  addEventListener('pagehide', () => setDisplayRequest(false));
})();
