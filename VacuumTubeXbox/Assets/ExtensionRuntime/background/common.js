'use strict';

const ext = globalThis.browser ?? globalThis.chrome;
const cache = new Map();
const pending = new Map();

function cacheGet(key, maxAgeMs) {
  const item = cache.get(key);
  if (!item) return undefined;
  if (Date.now() - item.time > maxAgeMs) {
    cache.delete(key);
    return undefined;
  }
  return item.value;
}

function cacheSet(key, value) {
  cache.set(key, { time: Date.now(), value });
  return value;
}

async function fetchJson(url, { timeout = 4500 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function cachedFetch(key, maxAgeMs, loader) {
  const cached = cacheGet(key, maxAgeMs);
  if (cached !== undefined) return cached;
  if (pending.has(key)) return pending.get(key);
  const task = Promise.resolve()
    .then(loader)
    .then((value) => cacheSet(key, value))
    .finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}

function validVideoId(value) {
  const id = String(value || '');
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('Invalid video ID');
  return id;
}

async function getDeArrowBranding(videoId) {
  const id = validVideoId(videoId);
  return cachedFetch(`dearrow:${id}`, 6 * 60 * 60 * 1000, () =>
    fetchJson(`https://sponsor.ajay.app/api/branding?videoID=${encodeURIComponent(id)}`)
  );
}

async function getDislikes(videoId) {
  const id = validVideoId(videoId);
  return cachedFetch(`dislikes:${id}`, 20 * 60 * 1000, () =>
    fetchJson(`https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(id)}`)
  );
}

async function getSponsorSegments(videoId, categories) {
  const id = validVideoId(videoId);
  const safeCategories = Array.isArray(categories) && categories.length
    ? categories.filter((value) => typeof value === 'string').slice(0, 8)
    : ['sponsor'];
  const key = `sponsor:${id}:${safeCategories.join(',')}`;
  return cachedFetch(key, 30 * 60 * 1000, async () => {
    const params = new URLSearchParams({ videoID: id, categories: JSON.stringify(safeCategories) });
    return await fetchJson(`https://sponsor.ajay.app/api/skipSegments?${params}`) || [];
  });
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const output = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      try { output[index] = await mapper(values[index]); }
      catch (error) { output[index] = { __error: error?.message || String(error) }; }
    }
  });
  await Promise.all(workers);
  return output;
}

async function handleApi(operation, payload = {}) {
  if (operation === 'dearrowBranding') return getDeArrowBranding(payload.videoId);
  if (operation === 'dislikes') return getDislikes(payload.videoId);
  if (operation === 'sponsorSegments') return getSponsorSegments(payload.videoId, payload.categories);

  if (operation === 'dearrowBatch') {
    const ids = [...new Set((Array.isArray(payload.videoIds) ? payload.videoIds : [])
      .map(String)
      .filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id)))]
      .slice(0, 36);
    const results = await mapWithConcurrency(ids, 6, async (id) => getDeArrowBranding(id));
    const branding = {};
    const errors = {};
    ids.forEach((id, index) => {
      if (results[index]?.__error) errors[id] = results[index].__error;
      else branding[id] = results[index];
    });
    return { branding, errors };
  }

  throw new Error('Unsupported operation');
}

ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'VTW_API_REQUEST') return false;
  handleApi(message.operation, message.payload)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
