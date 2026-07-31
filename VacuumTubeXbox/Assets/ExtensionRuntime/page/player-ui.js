(() => {
  'use strict';
  const VTW = globalThis.VTW;
  if (!VTW) return;

  const SELECTORS = {
    controls: ['.ytp-chrome-bottom', '.ytp-chrome-controls', '[class*="player-controls" i]', '[class*="controls-overlay" i]'],
    progress: ['.ytp-progress-bar-container', '.ytp-progress-bar', '[class*="progress-bar" i]', '[class*="scrubber" i]'],
    title: ['.ytp-title', '.ytp-title-text', '[class*="player-title" i]', '[class*="video-title" i]'],
    time: ['.ytp-time-display', '[class*="time-display" i]', '[class*="duration" i]'],
    buttons: ['.ytp-left-controls', '.ytp-right-controls', '[class*="control-buttons" i]'],
    captions: ['.ytp-subtitles-button', '[aria-label*="Untertitel" i]', '[aria-label*="captions" i]', '[aria-label*="subtitles" i]'],
    settings: ['.ytp-settings-button', '[aria-label*="Einstellungen" i]', '[aria-label*="settings" i]']
  };

  const mark = (selectors, hidden, name) => {
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (node.closest('#vt-settings-inline-root')) continue;
        node.classList.toggle('vtw-player-hidden', hidden);
        node.dataset.vtwPlayerPart = name;
      }
    }
  };

  const apply = () => {
    mark(SELECTORS.controls, !VTW.config.player_show_controls, 'controls');
    mark(SELECTORS.progress, !VTW.config.player_show_progress, 'progress');
    mark(SELECTORS.title, !VTW.config.player_show_title, 'title');
    mark(SELECTORS.time, !VTW.config.player_show_time, 'time');
    mark(SELECTORS.buttons, !VTW.config.player_show_buttons, 'buttons');
    mark(SELECTORS.captions, !VTW.config.player_show_captions_button, 'captions');
    mark(SELECTORS.settings, !VTW.config.player_show_settings_button, 'settings');
    document.documentElement.dataset.vtwTheme = VTW.config.settings_theme || 'original';
    document.documentElement.classList.toggle('vtw-hide-dislikes', !VTW.config.player_show_dislikes);
    document.documentElement.classList.toggle('vtw-hide-sponsor-markers', !VTW.config.player_show_sponsor_markers);
  };

  const observer = new MutationObserver(() => requestAnimationFrame(apply));
  const start = () => {
    apply();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.documentElement) start(); else addEventListener('DOMContentLoaded', start, { once: true });
  VTW.on('config', apply);
  setInterval(apply, 1200);
})();
