(() => {
  'use strict';
  const VTW = globalThis.VTW;
  if (!VTW) return;

  const pathOf = (url) => {
    try { return new URL(url, location.origin).pathname; } catch { return String(url || '').split('?')[0]; }
  };
  const parseJson = (text) => {
    try { return VTW.nativeJsonParse(text); } catch { return null; }
  };
  const stringifyJson = (value) => VTW.nativeJsonStringify(value);

  const textFrom = (value) => {
    if (!value || typeof value !== 'object') return '';
    if (typeof value.simpleText === 'string') return value.simpleText;
    if (Array.isArray(value.runs)) return value.runs.map((run) => run?.text || '').join('');
    return '';
  };

  const walk = (value, visitor, seen = new WeakSet()) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    visitor(value);
    if (Array.isArray(value)) {
      for (const item of value) walk(item, visitor, seen);
    } else {
      for (const item of Object.values(value)) walk(item, visitor, seen);
    }
  };

  const pruneArrays = (value, shouldRemove, seen = new WeakSet()) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return 0;
    seen.add(value);
    let removed = 0;
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index--) {
        const item = value[index];
        if (shouldRemove(item)) {
          value.splice(index, 1);
          removed++;
        } else removed += pruneArrays(item, shouldRemove, seen);
      }
    } else {
      for (const item of Object.values(value)) removed += pruneArrays(item, shouldRemove, seen);
    }
    return removed;
  };

  const containsMarker = (value, predicate, maxDepth = 6, seen = new WeakSet(), depth = 0) => {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > maxDepth) return false;
    seen.add(value);
    if (predicate(value)) return true;
    for (const item of Object.values(value)) {
      if (containsMarker(item, predicate, maxDepth, seen, depth + 1)) return true;
    }
    return false;
  };

  const isAdNode = (node) => {
    if (!node || typeof node !== 'object') return false;
    const keys = Object.keys(node);
    if (keys.some((key) => /^(adSlotRenderer|displayAdRenderer|promotedSparklesWebRenderer|promotedVideoRenderer|inFeedAdLayoutRenderer)$/i.test(key))) return true;
    if (node.promoShelfRenderer) return true;
    if (node.shelfRenderer?.tvhtml5Metadata?.hideLogo) return true;
    if (node.command?.reelWatchEndpoint?.adClientParams?.isAd) return true;
    if (node.adClientParams?.isAd || node.isAd === true) return true;
    return false;
  };

  const isShortMarker = (node) => {
    if (!node || typeof node !== 'object') return false;
    const keys = Object.keys(node);
    if (keys.some((key) => /(?:^|_)(?:shorts?|reel)(?:$|[A-Z_])/i.test(key))) return true;
    const renderer = node.tileRenderer || node.lockupViewModel || node.compactVideoRenderer || node.videoRenderer;
    if (/SHORT|REEL/i.test(String(renderer?.contentType || renderer?.contentTypeEnum || ''))) return true;
    if (node.reelWatchEndpoint || node.navigationEndpoint?.reelWatchEndpoint || node.command?.reelWatchEndpoint) return true;
    const browseId = node.browseEndpoint?.browseId || node.navigationEndpoint?.browseEndpoint?.browseId;
    if (/shorts/i.test(String(browseId || ''))) return true;
    const url = node.commandMetadata?.webCommandMetadata?.url || node.webCommandMetadata?.url || node.canonicalBaseUrl;
    if (/\/shorts(?:\/|$)/i.test(String(url || ''))) return true;
    const targetId = node.targetId || node.shelfRenderer?.targetId;
    if (/shorts|reel/i.test(String(targetId || ''))) return true;
    const title = textFrom(node.title || node.headerRenderer?.shelfHeaderRenderer?.avatarLockup?.avatarLockupRenderer?.title);
    if (/^(shorts|kurzvideos)$/i.test(title.trim())) return true;
    return false;
  };

  const isShortNode = (node) => {
    if (!node || typeof node !== 'object') return false;
    if (isShortMarker(node)) return true;
    // Shelf wrappers often keep the Shorts marker a few levels below the array item.
    if (node.shelfRenderer || node.richShelfRenderer || node.itemSectionRenderer) {
      return containsMarker(node, isShortMarker, 7);
    }
    return false;
  };

  let adToastAt = 0;
  const reportAdsRemoved = (count) => {
    if (!count) return;
    VTW.setStatus('adblock', { state: 'active', message: `${count} Werbeelemente entfernt`, count });
    if (Date.now() - adToastAt > 10000) {
      adToastAt = Date.now();
      VTW.toast('Anzeigenblocker', `${count} Werbeelemente entfernt`, {
        type: 'success', mod: 'adblock', dedupeKey: 'adblock-filter', dedupeMs: 9000
      });
    }
  };

  const filterPlayerAds = (json) => {
    if (!VTW.config.adblock || !json || typeof json !== 'object') return json;
    let removed = 0;
    // Deliberately preserve streamingData, playabilityStatus, videoDetails,
    // signatures and media URLs. Only the known ad containers are cleared.
    for (const key of ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams', 'adBreakParams']) {
      if (!Object.prototype.hasOwnProperty.call(json, key)) continue;
      if (Array.isArray(json[key])) removed += json[key].length;
      else if (json[key] != null) removed++;
      json[key] = Array.isArray(json[key]) ? [] : undefined;
    }
    if (Array.isArray(json.entries)) {
      const before = json.entries.length;
      json.entries = json.entries.filter((entry) => !entry?.command?.reelWatchEndpoint?.adClientParams?.isAd);
      removed += before - json.entries.length;
    }
    if (removed) queueMicrotask(() => reportAdsRemoved(removed));
    return json;
  };

  VTW.addPlayerJsonModifier?.(filterPlayerAds);

  VTW.addJsonModifier((json) => {
    if (!VTW.config.adblock) return json;
    const removed = pruneArrays(json, isAdNode);
    if (removed) queueMicrotask(() => reportAdsRemoved(removed));
    return json;
  });

  VTW.addResponseModifier((url, text) => {
    if (!VTW.config.adblock || !pathOf(url).startsWith('/youtubei/')) return undefined;
    const json = parseJson(text);
    if (!json) return undefined;
    const before = stringifyJson(json);
    let removed = 0;
    for (const key of ['adPlacements', 'adSlots', 'playerAds']) {
      if (key in json) {
        if (Array.isArray(json[key])) removed += json[key].length;
        json[key] = [];
      }
    }
    removed += pruneArrays(json, isAdNode);
    const after = stringifyJson(json);
    if (removed) queueMicrotask(() => reportAdsRemoved(removed));
    return after === before ? undefined : after;
  });

  let superResolutionToastAt = 0;
  const filterSuperResolution = (json) => {
    let removed = 0;
    walk(json, (node) => {
      for (const key of ['formats', 'adaptiveFormats']) {
        if (!Array.isArray(node[key])) continue;
        const before = node[key].length;
        const filtered = node[key].filter((format) => format?.xtags !== 'CgcKAnNyEgEx' && !/super resolution/i.test(String(format?.qualityLabel || '')));
        // Never leave the player without a usable format. If every offered format
        // is marked as Super Resolution, preserve the original list and fail open.
        if (filtered.length > 0) {
          node[key] = filtered;
          removed += before - filtered.length;
        }
      }
    });
    if (removed) {
      VTW.setStatus('super_resolution', { state: 'active', message: `${removed} Super-Resolution-Formate entfernt`, count: removed });
      if (Date.now() - superResolutionToastAt > 12000) {
        superResolutionToastAt = Date.now();
        VTW.toast('Super Resolution entfernt', `${removed} Formate gefiltert`, {
          type: 'success', mod: 'super_resolution', dedupeKey: 'super-resolution-filter', dedupeMs: 11000
        });
      }
    }
    return removed;
  };

  VTW.addPlayerJsonModifier?.((json) => {
    if (VTW.config.remove_super_resolution) filterSuperResolution(json);
    return json;
  });

  let shortsToastAt = 0;
  const filterShortsJson = (json) => {
    const removed = pruneArrays(json, isShortNode);
    if (removed) VTW.setStatus('shorts', { state: 'active', message: `${removed} Shorts entfernt`, count: removed });
    if (removed && Date.now() - shortsToastAt > 8000) {
      shortsToastAt = Date.now();
      queueMicrotask(() => VTW.toast('Shorts ausgeblendet', `${removed} Einträge entfernt`, {
        type: 'success', mod: 'shorts', dedupeKey: 'shorts-filter', dedupeMs: 7500
      }));
    }
    return removed;
  };

  VTW.addJsonModifier((json) => {
    if (VTW.config.hide_shorts) filterShortsJson(json);
    return json;
  });

  VTW.addResponseModifier((url, text) => {
    if (!VTW.config.hide_shorts || !pathOf(url).startsWith('/youtubei/')) return undefined;
    const json = parseJson(text);
    if (!json) return undefined;
    const removed = filterShortsJson(json);
    return removed ? stringifyJson(json) : undefined;
  });

  const getTileAdapter = (tile) => {
    if (!tile || typeof tile !== 'object') return null;
    const videoId = tile.contentId || tile.videoId || tile.entityId || tile.contentIdString;
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) return null;
    const contentType = String(tile.contentType || tile.contentTypeEnum || '');
    if (contentType && !/VIDEO/i.test(contentType)) return null;

    const titleTargets = [];
    const thumbnailArrays = [];
    walk(tile, (node) => {
      if (node?.title && typeof node.title === 'object' && (typeof node.title.simpleText === 'string' || Array.isArray(node.title.runs))) titleTargets.push(node.title);
      if (Array.isArray(node?.thumbnails) && node.thumbnails.some((thumb) => typeof thumb?.url === 'string')) thumbnailArrays.push(node.thumbnails);
      if (Array.isArray(node?.sources) && node.sources.some((source) => /(?:ytimg\.com|ggpht\.com)/i.test(String(source?.url || '')))) thumbnailArrays.push(node.sources);
    });
    return { videoId, titleTargets, thumbnailArrays, tile };
  };

  const collectTiles = (json) => {
    const output = [];
    walk(json, (node) => {
      for (const candidate of [node.tileRenderer, node.lockupViewModel, node.videoRenderer, node.compactVideoRenderer]) {
        const adapter = getTileAdapter(candidate);
        if (!adapter) continue;
        output.push(adapter);
      }
    });
    return output;
  };

  const chooseDeArrowTitle = (branding) => {
    const title = branding?.titles?.find((item) => item?.locked || Number(item?.votes) >= 0)?.title;
    if (!title) return null;
    return title.split(' ').map((word) => word.startsWith('>') ? word.slice(1) : word).join(' ');
  };

  const applyBrandingToAdapter = (adapter, branding) => {
    if (!branding) return false;
    let changed = false;
    const title = VTW.config.dearrow_titles ? chooseDeArrowTitle(branding) : null;
    if (title) {
      for (const target of adapter.titleTargets.slice(0, 2)) {
        if ('simpleText' in target) target.simpleText = title;
        if (Array.isArray(target.runs)) target.runs = [{ text: title }];
        changed = true;
      }
    }
    if (VTW.config.dearrow_thumbnails) {
      const thumbnailUrl = `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=${encodeURIComponent(adapter.videoId)}`;
      for (const thumbnails of adapter.thumbnailArrays) {
        for (const thumbnail of thumbnails) {
          if (thumbnail && typeof thumbnail === 'object') thumbnail.url = thumbnailUrl;
        }
        changed = true;
      }
    }
    return changed;
  };

  let deArrowToastAt = 0;
  const deArrowDomCache = new Map();
  const deArrowDomPending = new Set();
  VTW.addResponseModifier((url, text) => {
    if (!VTW.config.dearrow) return undefined;
    const path = pathOf(url);
    if (!['/youtubei/v1/browse', '/youtubei/v1/search', '/youtubei/v1/next'].includes(path)) return undefined;
    const json = parseJson(text);
    if (!json) return undefined;
    const adapters = collectTiles(json).slice(0, 48);
    if (!adapters.length) return undefined;

    let changed = 0;
    const missing = new Set();
    for (const adapter of adapters) {
      if (deArrowDomCache.has(adapter.videoId)) {
        if (applyBrandingToAdapter(adapter, deArrowDomCache.get(adapter.videoId))) changed++;
      } else if (!deArrowDomPending.has(adapter.videoId)) missing.add(adapter.videoId);
    }

    const ids = [...missing].slice(0, 24);
    if (ids.length) VTW.setStatus('dearrow', { state: 'loading', message: `${ids.length} Community-Einträge werden geladen` });
    ids.forEach((id) => deArrowDomPending.add(id));
    if (ids.length) {
      VTW.api('dearrowBatch', { videoIds: ids }, 6500).then((result) => {
        for (const id of ids) deArrowDomCache.set(id, result?.branding?.[id] || null);
        scanDeArrowDom();
      }).catch((error) => {
        console.debug('[VTW] DeArrow background load failed', error);
        VTW.setStatus('dearrow', { state: 'error', message: `API-Fehler: ${error.message}` });
        VTW.toast('DeArrow nicht erreichbar', error.message, {
          type: 'error', mod: 'dearrow', dedupeKey: 'dearrow-error', dedupeMs: 30000
        });
        VTW.log('error', 'dearrow', 'DeArrow-Daten konnten nicht geladen werden', error);
      }).finally(() => ids.forEach((id) => deArrowDomPending.delete(id)));
    }

    if (changed) VTW.setStatus('dearrow', { state: 'active', message: `${changed} Videos angepasst`, count: changed });
    if (changed && Date.now() - deArrowToastAt > 9000) {
      deArrowToastAt = Date.now();
      queueMicrotask(() => VTW.toast('DeArrow aktiv', `${changed} Videos angepasst`, {
        type: 'success', mod: 'dearrow', dedupeKey: 'dearrow-applied', dedupeMs: 8500
      }));
    }
    return changed ? stringifyJson(json) : undefined;
  });

  const findCurrentVideoId = (json) => {
    let videoId = json?.currentVideoEndpoint?.watchEndpoint?.videoId || json?.videoDetails?.videoId;
    if (videoId) return videoId;
    walk(json, (node) => {
      if (!videoId && /^[A-Za-z0-9_-]{11}$/.test(node?.watchEndpoint?.videoId || '')) videoId = node.watchEndpoint.videoId;
    });
    return videoId;
  };

  const injectDislikes = (json, abbreviated) => {
    let changed = false;
    walk(json, (node) => {
      const likeButton = node.likeButtonRenderer;
      if (likeButton) {
        likeButton.dislikeCountText = { simpleText: abbreviated };
        likeButton.dislikeCountWithUndislikeText = { simpleText: abbreviated };
        changed = true;
      }
      const header = node.videoDescriptionHeaderRenderer;
      if (header) {
        if (!Array.isArray(header.factoid)) header.factoid = [];
        const exists = header.factoid.some((item) => /dislikes/i.test(textFrom(item?.factoidRenderer?.label)));
        if (!exists) {
          header.factoid.push({ factoidRenderer: { value: { simpleText: abbreviated }, label: { simpleText: 'Dislikes' } } });
          changed = true;
        }
      }
    });
    return changed;
  };

  const dislikeCache = new Map();
  const compactNumber = (value) => Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  const formatDislikeDisplay = (votes) => {
    const dislikes = Number(votes?.dislikes);
    const likes = Number(votes?.likes);
    if (!Number.isFinite(dislikes)) return null;
    if (VTW.config.dislikes_mode === 'hidden') return '';
    if (VTW.config.dislikes_mode === 'count') return compactNumber(dislikes);
    if (VTW.config.dislikes_mode === 'ratio' && Number.isFinite(likes) && likes + dislikes > 0) {
      return `👍 ${((likes / (likes + dislikes)) * 100).toFixed(1)} %`;
    }
    if (VTW.config.dislikes_mode === 'percent' && Number.isFinite(likes) && likes + dislikes > 0) {
      return `👎 ${((dislikes / (likes + dislikes)) * 100).toFixed(1)} %`;
    }
    return `👎 ${compactNumber(dislikes)}`;
  };

  VTW.addResponseModifier((url, text) => {
    if (!VTW.config.dislikes || pathOf(url) !== '/youtubei/v1/next') return undefined;
    const json = parseJson(text);
    if (!json) return undefined;
    const videoId = findCurrentVideoId(json);
    if (!videoId) return undefined;

    const cached = dislikeCache.get(videoId);
    const display = cached ? formatDislikeDisplay(cached) : null;
    if (cached && display) {
      const changed = injectDislikes(json, display);
      queueMicrotask(() => showDislikeBadge(videoId, cached));
      return changed ? stringifyJson(json) : undefined;
    }

    if (!cached) {
      VTW.setStatus('dislikes', { state: 'loading', message: 'Dislike-Daten werden geladen' });
      VTW.api('dislikes', { videoId }, 5000).then((votes) => {
        if (!votes || typeof votes.dislikes !== 'number') return;
        dislikeCache.set(videoId, votes);
        showDislikeBadge(videoId, votes);
      }).catch((error) => {
        VTW.setStatus('dislikes', { state: 'error', message: `API-Fehler: ${error.message}` });
        VTW.log('error', 'dislikes', 'Dislike-Daten konnten nicht geladen werden', error);
      });
    }
    return undefined;
  });

  const findNativeDislikeButton = () => {
    const player = document.querySelector('.html5-video-player, ytlr-player, #player, [class*="player-container" i]');
    if (!player) return null;
    const buttons = [...player.querySelectorAll('button,[role="button"],[tabindex="0"]')];
    return buttons.find((button) => {
      const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''} ${button.textContent || ''}`.toLowerCase();
      return /(dislike|gefällt mir nicht|mag ich nicht|daumen runter|thumbs down)/i.test(label);
    }) || null;
  };

  const findNativePlayerActionRow = () => {
    const player = document.querySelector('.html5-video-player, ytlr-player, #player, [class*="player-container" i]');
    if (!player) return null;
    const rows = [...player.querySelectorAll('[class*="action" i],[class*="button" i],[class*="control" i],[role="toolbar"]')]
      .filter((node) => node.querySelectorAll('button,[role="button"],[tabindex="0"]').length >= 2)
      .map((node) => ({ node, rect: node.getBoundingClientRect?.() }))
      .filter(({ rect }) => rect && rect.width > 120 && rect.height > 24 && rect.height < 180)
      .sort((a, b) => b.rect.bottom - a.rect.bottom);
    return rows[0]?.node || null;
  };

  const removeDislikeUi = () => {
    document.getElementById('vtw-dislike-badge')?.remove();
    document.getElementById('vtw-dislike-player-button')?.remove();
  };

  const showDislikeBadge = (videoId, votes) => {
    if (!VTW.config.dislikes || videoId !== VTW.getVideoId()) return;
    const display = formatDislikeDisplay(votes);
    if (!display || VTW.config.player_show_dislikes === false) {
      removeDislikeUi();
      VTW.setStatus('dislikes', { state: VTW.config.dislikes ? 'active' : 'disabled', message: 'Anzeige ausgeblendet' });
      return;
    }

    // Prefer YouTube TV's real thumbs-down action and only add the count to it.
    const nativeButton = findNativeDislikeButton();
    if (nativeButton) {
      document.getElementById('vtw-dislike-player-button')?.remove();
      let badge = document.getElementById('vtw-dislike-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.id = 'vtw-dislike-badge';
        badge.setAttribute('aria-hidden', 'true');
      }
      if (badge.parentElement !== nativeButton) nativeButton.appendChild(badge);
      badge.textContent = display;
      badge.title = `${Intl.NumberFormat().format(votes.dislikes)} Dislikes`;
      badge.classList.add('visible');
    } else {
      // Some TV experiments do not expose a dislike action until controls are open.
      // Insert a display-only action in the same native action row; never float it
      // in the page corner and never cover the video.
      removeDislikeUi();
      const row = findNativePlayerActionRow();
      if (!row) {
        removeDislikeUi();
        VTW.setStatus('dislikes', { state: 'loading', message: 'Warte auf Player-Steuerung' });
        return;
      }
      let button = document.getElementById('vtw-dislike-player-button');
      if (!button) {
        const template = row.querySelector('button,[role="button"],[tabindex="0"]');
        button = template ? template.cloneNode(false) : document.createElement('button');
        button.id = 'vtw-dislike-player-button';
        button.type = 'button';
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '-1');
        button.setAttribute('aria-disabled', 'true');
        button.classList.add('vtw-native-player-action');
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
        }, true);
        row.appendChild(button);
      }
      button.textContent = `👎 ${display.replace(/^👎\s*/, '')}`;
      button.title = `${Intl.NumberFormat().format(votes.dislikes)} Dislikes`;
    }

    VTW.setStatus('dislikes', { state: 'active', message: `${compactNumber(votes.dislikes)} Dislikes geladen`, count: votes.dislikes });
  };

  let dislikeVideoId = null;
  const refreshDislikeBadge = async () => {
    if (!VTW.config.dislikes) {
      dislikeVideoId = null;
      removeDislikeUi();
      VTW.setStatus('dislikes', { state: 'disabled', message: 'Deaktiviert' });
      return;
    }
    if (VTW.config.dislikes_mode === 'hidden') {
      removeDislikeUi();
      VTW.setStatus('dislikes', { state: 'active', message: 'Daten aktiv, Anzeige verborgen' });
      return;
    }
    const videoId = VTW.getVideoId();
    if (!videoId) {
      removeDislikeUi();
      return;
    }
    if (videoId === dislikeVideoId && dislikeCache.has(videoId)) {
      showDislikeBadge(videoId, dislikeCache.get(videoId));
      return;
    }
    dislikeVideoId = videoId;
    VTW.setStatus('dislikes', { state: 'loading', message: 'Dislike-Daten werden geladen' });
    try {
      let votes = dislikeCache.get(videoId);
      if (!votes) {
        votes = await VTW.api('dislikes', { videoId }, 5000);
        if (typeof votes?.dislikes === 'number') dislikeCache.set(videoId, votes);
      }
      if (typeof votes?.dislikes === 'number') showDislikeBadge(videoId, votes);
      else VTW.setStatus('dislikes', { state: 'warning', message: 'Keine Dislike-Daten verfügbar' });
    } catch (error) {
      VTW.setStatus('dislikes', { state: 'error', message: `API-Fehler: ${error.message}` });
      VTW.toast('Dislikes nicht erreichbar', error.message, {
        type: 'error', mod: 'dislikes', dedupeKey: 'dislikes-error', dedupeMs: 30000
      });
      VTW.log('error', 'dislikes', 'Dislike-Daten konnten nicht geladen werden', error);
    }
  };
  setInterval(refreshDislikeBadge, 900);
  VTW.on('config', () => {
    dislikeVideoId = null;
    refreshDislikeBadge();
  });

  const findVideoIdInData = (data) => {
    let result = null;
    const seen = new WeakSet();
    const visit = (value, depth = 0) => {
      if (result || !value || typeof value !== 'object' || seen.has(value) || depth > 7) return;
      seen.add(value);
      for (const key of ['videoId', 'contentId']) {
        if (/^[A-Za-z0-9_-]{11}$/.test(value[key] || '')) { result = value[key]; return; }
      }
      for (const item of Object.values(value)) visit(item, depth + 1);
    };
    visit(data);
    return result;
  };

  const getElementVideoId = (element) => {
    const attr = element.getAttribute?.('data-video-id');
    if (/^[A-Za-z0-9_-]{11}$/.test(attr || '')) return attr;
    const links = element.matches?.('a[href]') ? [element] : [...(element.querySelectorAll?.('a[href]') || [])];
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      try {
        const url = new URL(href, location.origin);
        const id = url.searchParams.get('v') || url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/)?.[1];
        if (/^[A-Za-z0-9_-]{11}$/.test(id || '')) return id;
      } catch {}
    }
    for (const data of [element.__data, element.data, element.__instance?.props?.data]) {
      const id = findVideoIdInData(data);
      if (id) return id;
    }
    return null;
  };

  const deArrowOriginalTitles = new WeakMap();
  const deArrowOriginalImages = new WeakMap();
  const deArrowOriginalBackgrounds = new WeakMap();
  const deArrowElements = new Set();
  let deArrowOriginalsVisible = false;

  const restoreBrandingElement = (element) => {
    if (!element?.isConnected) return;
    for (const node of element.querySelectorAll('[data-vtw-dearrow-title]')) {
      const original = deArrowOriginalTitles.get(node);
      if (original != null) node.textContent = original;
    }
    for (const image of element.querySelectorAll('img[data-vtw-dearrow-image]')) {
      const original = deArrowOriginalImages.get(image);
      if (original) {
        image.src = original.src;
        image.srcset = original.srcset;
      }
    }
    for (const node of element.querySelectorAll('[data-vtw-dearrow-background]')) {
      const original = deArrowOriginalBackgrounds.get(node);
      if (original != null) node.style.backgroundImage = original;
    }
  };

  const applyBrandingToElement = (element, videoId, branding) => {
    if (!branding || !element?.isConnected) return false;
    let changed = false;
    const title = VTW.config.dearrow_titles ? chooseDeArrowTitle(branding) : null;
    if (title) {
      const candidates = [...element.querySelectorAll('*')].filter((node) =>
        node.children.length === 0 && /title|headline|metadata/i.test(String(node.className || '')) && node.textContent.trim()
      ).slice(0, 4);
      for (const node of candidates) {
        if (!deArrowOriginalTitles.has(node)) deArrowOriginalTitles.set(node, node.textContent);
        node.dataset.vtwDearrowTitle = 'true';
        node.textContent = deArrowOriginalsVisible ? deArrowOriginalTitles.get(node) : title;
        changed = true;
      }
    }
    if (VTW.config.dearrow_thumbnails) {
      const thumbnailUrl = `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=${encodeURIComponent(videoId)}`;
      for (const image of element.querySelectorAll('img')) {
        if (!deArrowOriginalImages.has(image)) deArrowOriginalImages.set(image, { src: image.src, srcset: image.srcset });
        image.dataset.vtwDearrowImage = 'true';
        const original = deArrowOriginalImages.get(image);
        image.src = deArrowOriginalsVisible ? original.src : thumbnailUrl;
        image.srcset = deArrowOriginalsVisible ? original.srcset : '';
        changed = true;
      }
      for (const node of element.querySelectorAll('[style*="background-image"]')) {
        if (!deArrowOriginalBackgrounds.has(node)) deArrowOriginalBackgrounds.set(node, node.style.backgroundImage);
        node.dataset.vtwDearrowBackground = 'true';
        node.style.backgroundImage = deArrowOriginalsVisible
          ? deArrowOriginalBackgrounds.get(node)
          : `url("${thumbnailUrl}")`;
        changed = true;
      }
    }
    element.dataset.vtwDearrow = videoId;
    deArrowElements.add(element);
    return changed;
  };

  const setDeArrowOriginalsVisible = (value) => {
    deArrowOriginalsVisible = Boolean(value);
    for (const element of [...deArrowElements]) {
      if (!element.isConnected) {
        deArrowElements.delete(element);
        continue;
      }
      const videoId = element.dataset.vtwDearrow;
      const branding = deArrowDomCache.get(videoId);
      if (deArrowOriginalsVisible || !branding || !VTW.config.dearrow) restoreBrandingElement(element);
      else applyBrandingToElement(element, videoId, branding);
    }
    VTW.toast('DeArrow', deArrowOriginalsVisible ? 'Originale werden angezeigt' : 'Community-Darstellung wird angezeigt', {
      type: 'info', mod: 'dearrow', dedupeKey: `dearrow-originals:${deArrowOriginalsVisible}`, dedupeMs: 1000
    });
  };

  let deArrowScanTimer = null;
  const scanDeArrowDom = () => {
    clearTimeout(deArrowScanTimer);
    deArrowScanTimer = setTimeout(async () => {
      if (!VTW.config.dearrow) return;
      const selectors = [
        'ytlr-tile-renderer', 'ytlr-video-tile-renderer', 'ytlr-lockup-view-model',
        '[data-video-id]', 'a[href*="/watch?v="]'
      ].join(',');
      const raw = [...document.querySelectorAll(selectors)].slice(0, 160);
      const targets = new Map();
      for (const element of raw) {
        const root = element.closest?.('ytlr-tile-renderer,ytlr-video-tile-renderer,ytlr-lockup-view-model,[data-video-id]') || element;
        const videoId = getElementVideoId(root);
        if (!videoId || root.dataset?.vtwDearrow === videoId) continue;
        if (!targets.has(videoId)) targets.set(videoId, []);
        targets.get(videoId).push(root);
      }
      const missing = [...targets.keys()].filter((id) => !deArrowDomCache.has(id) && !deArrowDomPending.has(id)).slice(0, 24);
      if (missing.length) VTW.setStatus('dearrow', { state: 'loading', message: `${missing.length} sichtbare Videos werden geladen` });
      missing.forEach((id) => deArrowDomPending.add(id));
      if (missing.length) {
        try {
          const result = await VTW.api('dearrowBatch', { videoIds: missing }, 6500);
          for (const id of missing) deArrowDomCache.set(id, result?.branding?.[id] || null);
        } catch (error) {
          console.debug('[VTW] DeArrow DOM batch failed', error);
          VTW.setStatus('dearrow', { state: 'error', message: `API-Fehler: ${error.message}` });
          VTW.toast('DeArrow nicht erreichbar', error.message, {
            type: 'error', mod: 'dearrow', dedupeKey: 'dearrow-error', dedupeMs: 30000
          });
          VTW.log('error', 'dearrow', 'Sichtbare DeArrow-Daten konnten nicht geladen werden', error);
        } finally {
          missing.forEach((id) => deArrowDomPending.delete(id));
        }
      }
      let changed = 0;
      for (const [id, elements] of targets) {
        const branding = deArrowDomCache.get(id);
        if (!branding) continue;
        for (const element of elements) {
          if (applyBrandingToElement(element, id, branding)) changed++;
        }
      }
      if (changed) VTW.setStatus('dearrow', { state: 'active', message: `${changed} sichtbare Videos angepasst`, count: changed });
      if (changed && Date.now() - deArrowToastAt > 9000) {
        deArrowToastAt = Date.now();
        VTW.toast('DeArrow aktiv', `${changed} sichtbare Videos angepasst`, {
          type: 'success', mod: 'dearrow', dedupeKey: 'dearrow-dom', dedupeMs: 8500
        });
      }
    }, 180);
  };

  const markShortElement = (element) => {
    const root = element.closest?.(
      'ytlr-tile-renderer,ytlr-video-tile-renderer,ytlr-lockup-view-model,ytlr-shelf-renderer,ytlr-rich-shelf-renderer,[class*="shelf"],[class*="tile"]'
    ) || element;
    root.classList?.add('vtw-short-hidden');
  };

  const scanShortsDom = () => {
    if (!VTW.config.hide_shorts) {
      document.querySelectorAll('.vtw-short-hidden').forEach((node) => node.classList.remove('vtw-short-hidden'));
      VTW.setStatus('shorts', { state: 'disabled', message: 'Deaktiviert' });
      return;
    }
    VTW.setStatus('shorts', { state: 'active', message: 'Shorts-Filter aktiv' });
    document.querySelectorAll('ytlr-shorts-page,[class*="shorts"],[class*="Shorts"],[is-shorts],a[href*="/shorts/"]').forEach(markShortElement);
    document.querySelectorAll('h1,h2,h3,[class*="title"],[class*="Title"]').forEach((node) => {
      if (/^(shorts|kurzvideos)$/i.test(node.textContent.trim())) markShortElement(node);
    });
    if (/^#?\/shorts\//i.test(location.hash) || /\/shorts\//i.test(location.pathname)) {
      VTW.toast('Shorts ausgeblendet', 'Diese Shorts-Seite wurde blockiert', {
        type: 'info', mod: 'shorts', dedupeKey: 'shorts-route', dedupeMs: 6000
      });
      history.back();
    }
  };

  let domScanTimer = null;
  const scheduleDomScan = () => {
    clearTimeout(domScanTimer);
    domScanTimer = setTimeout(() => {
      scanShortsDom();
      scanDeArrowDom();
    }, 100);
  };

  VTW.waitFor(() => document.documentElement).then(() => {
    const observer = new MutationObserver(scheduleDomScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scheduleDomScan();
  }).catch(() => {});
  addEventListener('hashchange', scheduleDomScan);
  VTW.on('config', (config) => {
    if (!config.dearrow) {
      for (const element of [...deArrowElements]) restoreBrandingElement(element);
      VTW.setStatus('dearrow', { state: 'disabled', message: 'Deaktiviert' });
    } else {
      document.querySelectorAll('[data-vtw-dearrow]').forEach((node) => delete node.dataset.vtwDearrow);
      VTW.setStatus('dearrow', { state: 'active', message: 'Bereit' });
    }
    VTW.setStatus('adblock', { state: config.adblock ? 'active' : 'disabled', message: config.adblock ? 'Antwortfilter aktiv' : 'Deaktiviert' });
    VTW.setStatus('super_resolution', { state: config.remove_super_resolution ? 'active' : 'disabled', message: config.remove_super_resolution ? 'Qualitätsfilter aktiv' : 'Deaktiviert' });
    scheduleDomScan();
  });

  document.addEventListener('keydown', (event) => {
    if (globalThis.__VTW_XBOX_NATIVE__ && !event.__vtwXbox && !event.__vtwXboxInternal) return;
    if (!VTW.config.dearrow || !VTW.config.dearrow_original_hotkey || !event.shiftKey || String(event.key || '').toLowerCase() !== 'd') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setDeArrowOriginalsVisible(!deArrowOriginalsVisible);
  }, true);

  VTW.setStatus('adblock', { state: VTW.config.adblock ? 'active' : 'disabled', message: VTW.config.adblock ? 'Antwortfilter aktiv' : 'Deaktiviert' });
  VTW.setStatus('super_resolution', { state: VTW.config.remove_super_resolution ? 'active' : 'disabled', message: VTW.config.remove_super_resolution ? 'Qualitätsfilter aktiv' : 'Deaktiviert' });
})();
