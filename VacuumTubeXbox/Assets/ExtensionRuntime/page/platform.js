(() => {
  'use strict';
  const VTW = globalThis.VTW;
  if (!VTW) return;

  const nativeH5vcc = window.h5vcc && typeof window.h5vcc === 'object' ? window.h5vcc : null;
  const nativeResolution = typeof nativeH5vcc?.system?.getVideoContainerSizeOverride === 'function'
    ? nativeH5vcc.system.getVideoContainerSizeOverride.bind(nativeH5vcc.system)
    : null;

  const screenResolution = () => {
    const width = Math.max(Number(screen?.width) || 1920, Number(screen?.height) || 1080);
    const height = Math.min(Number(screen?.width) || 1920, Number(screen?.height) || 1080);
    const candidates = [[256,144],[426,240],[640,360],[854,480],[1280,720],[1920,1080],[2560,1440],[3840,2160],[7680,4320]];
    const match = candidates.find(([w, h]) => width <= w && height <= h) || [width, height];
    return `${match[0]}x${match[1]}`;
  };

  const getResolutionOverride = () => {
    if (VTW.config.unlock_resolution) return '7680x4320';
    try { return nativeResolution?.() || screenResolution(); }
    catch { return screenResolution(); }
  };

  const ensureH5vccSystem = () => {
    try {
      const current = window.h5vcc && typeof window.h5vcc === 'object' ? window.h5vcc : {};
      current.runtime = current.runtime || { initialDeepLink: '' };
      current.system = current.system || {};
      if (current.system.getVideoContainerSizeOverride !== getResolutionOverride) {
        current.system.getVideoContainerSizeOverride = getResolutionOverride;
      }
      window.h5vcc = current;
    } catch (error) {
      VTW.log?.('warn', 'platform', 'Auflösungs-Workaround konnte nicht installiert werden', error);
    }
  };

  const applyVoiceFlag = () => {
    try {
      const url = new URL(location.href);
      const desired = VTW.config.voice_search === false ? 'false' : 'true';
      if (url.searchParams.get('env_enableMediaStreams') !== desired) {
        url.searchParams.set('env_enableMediaStreams', desired);
        history.replaceState(history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
      }
      if (window.environment && typeof window.environment === 'object') {
        window.environment.env_enableMediaStreams = desired === 'true';
      }
    } catch (error) {
      VTW.log?.('warn', 'platform', 'Sprachsuche-Flag konnte nicht aktualisiert werden', error);
    }
  };

  const applyTectonicSwitches = () => {
    try {
      if (!window.tectonicConfig || typeof window.tectonicConfig !== 'object') return;
      window.tectonicConfig.featureSwitches = window.tectonicConfig.featureSwitches || {};
      if (VTW.config.disable_direct_signin) window.tectonicConfig.featureSwitches.enableDirectSignIn = false;
      window.tectonicConfig.featureSwitches.enableTouchSupport = !globalThis.__VTW_XBOX_NATIVE__;
      window.tectonicConfig.featureSwitches.hasSamsungVoicePrivacyNotice = true;
    } catch (error) {
      VTW.log?.('warn', 'platform', 'Leanback-Schalter konnten nicht aktualisiert werden', error);
    }
  };

  const apply = () => {
    ensureH5vccSystem();
    applyVoiceFlag();
    applyTectonicSwitches();
    VTW.setStatus?.('platform', {
      state: 'active',
      message: VTW.config.unlock_resolution ? '8K-Auflösungsfreigabe aktiv' : 'Native Auflösungsgrenze'
    });
  };

  apply();
  VTW.on?.('config', apply);
  setInterval(apply, 1200);
})();
