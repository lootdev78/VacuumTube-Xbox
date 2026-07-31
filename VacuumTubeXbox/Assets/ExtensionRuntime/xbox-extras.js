(() => {
  'use strict';
  const VTW = globalThis.VTW;
  if (!VTW || globalThis.__VTW_XBOX_EXTRAS__) return;
  globalThis.__VTW_XBOX_EXTRAS__ = true;

  const applyVideoOptions = () => {
    const video = document.querySelector('video');
    if (!video) return;
    const rate = Number(VTW.config.playback_rate || 1);
    if (Number.isFinite(rate) && rate >= 0.25 && rate <= 3 && Math.abs(video.playbackRate - rate) > 0.001) video.playbackRate = rate;
  };

  const findPlayer = () => document.querySelector('.html5-video-player, ytlr-watch-player, #movie_player');
  const applyPreferredQuality = () => {
    const player = findPlayer();
    if (!player || typeof player.setPlaybackQualityRange !== 'function') return;
    const quality = String(VTW.config.preferred_quality || 'auto');
    if (quality === 'auto') return;
    try { player.setPlaybackQualityRange(quality, quality); } catch {}
  };

  const improveThumbnail = (img) => {
    if (!VTW.config.high_quality_thumbnails || !(img instanceof HTMLImageElement)) return;
    const src = img.currentSrc || img.src || '';
    if (!/i\.ytimg\.com|yt3\.ggpht\.com/.test(src)) return;
    const next = src
      .replace(/\/(?:default|mqdefault|hqdefault|sddefault)\.(jpg|webp)(\?.*)?$/i, '/maxresdefault.$1$2')
      .replace(/=w\d+-h\d+[^&]*/i, '=w1280-h720');
    if (next !== src) img.src = next;
  };

  const ensureClock = () => {
    let clock = document.getElementById('vt-xbox-player-clock');
    if (!VTW.config.player_clock) { clock?.remove(); return; }
    const player = findPlayer();
    if (!player) return;
    const controls = player.querySelector('[class*="control" i], [class*="transport" i], [role="toolbar"]') || player;
    if (!clock) {
      clock = document.createElement('span');
      clock.id = 'vt-xbox-player-clock';
      clock.className = 'vt-xbox-native-player-item';
      controls.appendChild(clock);
    }
    clock.textContent = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: VTW.config.player_clock_seconds ? '2-digit' : undefined,
      hour12: Boolean(VTW.config.player_clock_12h)
    }).format(new Date());
  };

  const applyEndscreen = () => {
    document.documentElement.toggleAttribute('data-vt-xbox-hide-endscreen', Boolean(VTW.config.remove_endscreen));
  };

  const scan = () => {
    applyVideoOptions();
    applyPreferredQuality();
    ensureClock();
    applyEndscreen();
    if (VTW.config.high_quality_thumbnails) document.querySelectorAll('img').forEach(improveThumbnail);
  };

  const updateDial = async () => {
    try {
      const result = await globalThis.VTXboxNative?.rpc?.('dialSetEnabled', { enabled: VTW.config.dial_enabled !== false });
      VTW.setStatus('dial', {
        state: result?.running ? 'active' : (VTW.config.dial_enabled === false ? 'disabled' : 'warning'),
        message: result?.running ? `DIAL aktiv · ${result.location || ''}` : (result?.error || 'DIAL nicht aktiv')
      });
    } catch (error) {
      VTW.setStatus('dial', { state: 'error', message: String(error?.message || error) });
    }
  };

  VTW.on('config', () => { scan(); updateDial(); });
  const observer = new MutationObserver(scan);
  const start = () => {
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class'] });
    scan(); updateDial();
    setInterval(scan, 1000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
