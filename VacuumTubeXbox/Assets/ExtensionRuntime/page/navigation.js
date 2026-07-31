(() => {
  'use strict';
  const VTW = globalThis.VTW;
  if (!VTW) return;

  const entries = {
    signin: {
      labels: ['anmelden', 'sign in', 'connexion', 'iniciar sesión', 'accedi'],
      tokens: ['signin', 'sign_in', 'accountsignin']
    },
    search: {
      labels: ['suchen', 'search', 'rechercher', 'buscar', 'cerca'],
      tokens: ['search', 'query']
    },
    home: {
      labels: ['startseite', 'home', 'accueil', 'inicio'],
      tokens: ['home', 'what_to_watch', 'fewhat_to_watch']
    },
    shorts: {
      labels: ['shorts', 'kurzvideos'],
      tokens: ['shorts', 'reel']
    },
    subscriptions: {
      labels: ['abos', 'abonnements', 'subscriptions', 'suscripciones', 'iscrizioni'],
      tokens: ['subscriptions', 'fesubscriptions']
    },
    library: {
      labels: ['mediathek', 'library', 'bibliothek', 'bibliothèque', 'biblioteca'],
      tokens: ['library', 'felibrary']
    },
    music: {
      labels: ['musik', 'music', 'musique', 'música'],
      tokens: ['music', 'femusic']
    },
    movies: {
      labels: ['filme & shows', 'filme und shows', 'movies & shows', 'films et séries', 'películas y programas'],
      tokens: ['movies', 'shows', 'storefront', 'festorefront']
    },
    live: {
      labels: ['live', 'livestreams'],
      tokens: ['live', 'felive']
    },
    gaming: {
      labels: ['gaming', 'spiele'],
      tokens: ['gaming', 'fegaming']
    },
    news: {
      labels: ['nachrichten', 'news', 'actualités', 'noticias'],
      tokens: ['news', 'fenews']
    },
    sports: {
      labels: ['sport', 'sports'],
      tokens: ['sports', 'fesports']
    },
    podcasts: {
      labels: ['podcasts', 'podcast'],
      tokens: ['podcast', 'podcasts', 'fepodcasts']
    }
  };

  const normalize = (value) => String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const isVisible = (key) => {
    if (key === 'shorts' && VTW.config.hide_shorts) return false;
    if (!VTW.config.navigation_customization) return true;
    return VTW.config[`nav_${key}`] !== false;
  };

  const collectNodeStrings = (node, depth = 0, output = [], seen = new WeakSet()) => {
    if (!node || typeof node !== 'object' || depth > 5 || seen.has(node)) return output;
    seen.add(node);
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string' && /text|title|label|url|browseId|targetId|iconType/i.test(key)) output.push(value);
      else if (value && typeof value === 'object') collectNodeStrings(value, depth + 1, output, seen);
    }
    return output;
  };

  const classifyStrings = (strings) => {
    const normalized = normalize(strings.join(' '));
    for (const [key, entry] of Object.entries(entries)) {
      if (entry.labels.some((label) => {
        const value = normalize(label);
        return normalized === value || normalized.startsWith(`${value} `) || normalized.endsWith(` ${value}`) || normalized.includes(` ${value} `);
      })) return key;
      if (entry.tokens.some((token) => normalized.includes(normalize(token)))) return key;
    }
    return null;
  };

  const classifyDataItem = (item) => {
    if (!item || typeof item !== 'object') return null;
    const keys = Object.keys(item).join(' ');
    const rendererLike = /guide|navigation|menuitem|compactlink|pivot|sidebar|browseentry/i.test(keys);
    if (!rendererLike) return null;
    return classifyStrings(collectNodeStrings(item));
  };

  const pruneNavigationArrays = (value, seen = new WeakSet()) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return 0;
    seen.add(value);
    let removed = 0;
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index--) {
        const key = classifyDataItem(value[index]);
        if (key && !isVisible(key)) {
          value.splice(index, 1);
          removed++;
        } else removed += pruneNavigationArrays(value[index], seen);
      }
    } else {
      for (const item of Object.values(value)) removed += pruneNavigationArrays(item, seen);
    }
    return removed;
  };

  VTW.addJsonModifier((json) => {
    const removed = pruneNavigationArrays(json);
    if (removed) VTW.setStatus('navigation', { state: 'active', message: `${removed} Navigationseinträge gefiltert`, count: removed });
    return json;
  });


  // Fetch-response path used by the production-safe network layer. This avoids
  // touching player responses while still filtering guide/browse navigation data.
  VTW.addResponseModifier((url, text) => {
    let path = '';
    try { path = new URL(url, location.origin).pathname; } catch { path = String(url || '').split('?')[0]; }
    if (!['/youtubei/v1/guide', '/youtubei/v1/browse', '/youtubei/v1/account/account_menu'].includes(path)) return undefined;
    let json;
    try { json = VTW.nativeJsonParse(text); } catch { return undefined; }
    const removed = pruneNavigationArrays(json);
    if (!removed) return undefined;
    VTW.setStatus('navigation', { state: 'active', message: `${removed} Navigationseinträge gefiltert`, count: removed });
    return VTW.nativeJsonStringify(json);
  });

  const candidateSelector = [
    'ytlr-guide-entry-renderer', 'ytlr-guide-section-renderer', 'ytlr-menu-item-renderer',
    'ytlr-navigation-item-renderer', '[role="navigation"] [role="menuitem"]',
    '[role="navigation"] a', '[role="menuitem"]', 'nav a',
    '[class*="guide"] a', '[class*="sidebar"] a', '[class*="navigation"] a',
    'a[href]'
  ].join(',');

  const elementStrings = (element) => {
    const values = [
      element.textContent,
      element.getAttribute?.('href'),
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('data-browse-id'),
      element.getAttribute?.('data-target-id'),
      element.id,
      element.className
    ];
    for (const data of [element.__data, element.data, element.__instance?.props?.data]) {
      if (data && typeof data === 'object') values.push(...collectNodeStrings(data));
    }
    return values.filter(Boolean);
  };

  const classifyElement = (element) => {
    const text = normalize(element.textContent);
    for (const [key, entry] of Object.entries(entries)) {
      if (entry.labels.some((label) => text === normalize(label))) return key;
    }
    return classifyStrings(elementStrings(element));
  };

  const findHideRoot = (element) => element.closest?.([
    'ytlr-guide-entry-renderer', 'ytlr-navigation-item-renderer', 'ytlr-menu-item-renderer',
    '[role="menuitem"]', '[role="listitem"]', 'li', 'a[href]'
  ].join(',')) || element;

  const isLikelySideNavigation = (element) => {
    const root = findHideRoot(element);
    const navAncestor = root.closest?.('nav,[role="navigation"],[class*="guide" i],[id*="guide" i],[class*="sidebar" i],[id*="sidebar" i],[class*="navigation" i],[id*="navigation" i]');
    if (navAncestor) return true;
    const rect = root.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    if (rect.left > innerWidth * 0.45 || rect.width > innerWidth * 0.55 || rect.height > 130) return false;
    const parent = root.parentElement;
    if (!parent) return false;
    const peers = [...parent.children].filter((child) => {
      const box = child.getBoundingClientRect?.();
      return box && box.height > 18 && box.height < 140;
    });
    return peers.length >= 4;
  };

  let lastSignature = '';
  let scanTimer = null;
  const scanNavigation = () => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      for (const node of document.querySelectorAll('[data-vtw-nav-key]')) {
        node.classList.remove('vtw-nav-hidden');
        node.removeAttribute('data-vtw-nav-hidden');
      }

      const found = new Map();
      for (const candidate of document.querySelectorAll(candidateSelector)) {
        if (!candidate.isConnected || !isLikelySideNavigation(candidate)) continue;
        const key = classifyElement(candidate);
        if (!key) continue;
        const root = findHideRoot(candidate);
        root.dataset.vtwNavKey = key;
        if (!found.has(key)) found.set(key, new Set());
        found.get(key).add(root);
      }

      let hidden = 0;
      const hiddenKeys = [];
      for (const [key, roots] of found) {
        const shouldHide = !isVisible(key);
        for (const root of roots) {
          root.classList.toggle('vtw-nav-hidden', shouldHide);
          root.dataset.vtwNavHidden = String(shouldHide);
          if (shouldHide) hidden++;
        }
        if (shouldHide) hiddenKeys.push(key);
      }

      const signature = hiddenKeys.sort().join(',');
      VTW.setStatus('navigation', {
        state: VTW.config.navigation_customization || VTW.config.hide_shorts ? 'active' : 'disabled',
        message: hidden ? `${hidden} Einträge ausgeblendet` : 'Keine Navigationseinträge ausgeblendet',
        count: hidden
      });
      if (signature && signature !== lastSignature) {
        VTW.toast('Navigation angepasst', `${hidden} Einträge ausgeblendet`, {
          type: 'success', mod: 'navigation', dedupeKey: `navigation:${signature}`, dedupeMs: 3000
        });
      }
      lastSignature = signature;
    }, 80);
  };

  VTW.waitFor(() => document.documentElement).then(() => {
    const observer = new MutationObserver(scanNavigation);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'aria-label'] });
    scanNavigation();
  }).catch(() => {});

  addEventListener('hashchange', scanNavigation);
  addEventListener('popstate', scanNavigation);
  VTW.on('config', scanNavigation);
  setInterval(scanNavigation, 1800);
})();
