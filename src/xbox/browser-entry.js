(() => {
    if (location.host !== 'www.youtube.com' || location.pathname !== '/tv') return;
    if (window.__VACUUMTUBE_XBOX_LOADED__) return;
    window.__VACUUMTUBE_XBOX_LOADED__ = true;
    window.__VACUUMTUBE_XBOX__ = true;

    const xhrModifiers = require('../preload/util/xhrModifiers')
    xhrModifiers.block()

    const modules = [
        require('../preload/modules/adblock'),
        require('../preload/modules/block-sign-in-popup'),
        require('../preload/modules/controller-support'),
        require('../preload/modules/css'),
        require('../preload/modules/dearrow'),
        require('../preload/modules/disable-direct-sign-in'),
        require('../preload/modules/encryption-notice'),
        require('../preload/modules/fix-exit'),
        require('../preload/modules/fix-reloads'),
        require('../preload/modules/fix-voice'),
        require('../preload/modules/h264ify'),
        require('../preload/modules/h5vcc'),
        require('../preload/modules/hide-shorts'),
        require('../preload/modules/identification'),
        require('../preload/modules/keybinds'),
        require('../preload/modules/leanback-settings'),
        require('../preload/modules/low-memory-mode'),
        require('../preload/modules/mouse'),
        require('../preload/modules/music-mode'),
        require('../preload/modules/no-f11'),
        require('../preload/modules/pause-on-blur'),
        require('../preload/modules/remove-super-resolution'),
        require('../preload/modules/return-youtube-dislike'),
        require('../preload/modules/settings'),
        require('../preload/modules/sponsorblock'),
        require('../preload/modules/support-webp'),
        require('../preload/modules/touch-support'),
        require('../preload/modules/voice-privacy-notice'),
        require('../preload/modules/volume-control')
    ]

    for (const load of modules) {
        try {
            const result = load()
            if (result?.catch) result.catch(err => console.error('[VacuumTube Xbox] async module failed', err))
        } catch (err) {
            console.error('[VacuumTube Xbox] module failed while loading', err)
        }
    }

    xhrModifiers.unblock()
})()
