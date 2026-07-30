(function(){
const platform = globalThis.__VACUUMTUBE_PLATFORM__ || {};
const chromeMatch = navigator.userAgent.match(/(?:Chrome|Edg)\/([0-9.]+)/);
globalThis.process = globalThis.process || { platform: 'win32', env: {}, versions: { chrome: chromeMatch ? chromeMatch[1] : (platform.webViewVersion || '0') } };
const __modules = {
"/src/preload/config.js": function(module, exports, require, __filename, __dirname){
const { ipcRenderer } = require('vacuumtube-host')

let config = ipcRenderer.sendSync('get-config')
let sharedConfig = { ...config }

ipcRenderer.on('config-update', (event, newConfig) => {
    for (let key in sharedConfig) delete sharedConfig[key]
    for (let key in newConfig) sharedConfig[key] = newConfig[key]
})

function get() {
    return sharedConfig;
}

function set(newConfig) {
    let updated = ipcRenderer.sendSync('set-config', newConfig) //hate to use sendSync since it's blocking, but i have no choice since youtube doesn't await stuff on ui calls
    for (let key in sharedConfig) delete sharedConfig[key]
    for (let key in updated) sharedConfig[key] = updated[key]
}

module.exports = {
    get,
    set
}
},
"/src/preload/modules/adblock.js": function(module, exports, require, __filename, __dirname){
//built in adblocker

const jsonMod = require('../util/jsonModifiers')
const xhrModifiers = require('../util/xhrModifiers')
const configManager = require('../config')
const config = configManager.get()

module.exports = () => {
    xhrModifiers.addResponseModifier((url, text) => {
        if (!config.adblock) return;

        if (
            !url.startsWith('/youtubei/v1/browse') &&
            !url.startsWith('/youtubei/v1/search')
        ) {
            return;
        }

        let json = JSON.parse(text)

        if (url.startsWith('/youtubei/v1/browse')) { //home feed ads (and giant banner ad that sometimes appears) (thank god ads only appear in home feed, go look at dearrow.js)
            let homeFeed = json.contents?.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer;
            if (!homeFeed || !homeFeed.contents) return;

            homeFeed.contents = homeFeed.contents.filter(r => !r.adSlotRenderer && !r.promoShelfRenderer && !r.shelfRenderer?.tvhtml5Metadata?.hideLogo/*only appears on premium upsells*/)

            for (let feed of homeFeed.contents) {
                let horizontal = feed?.shelfRenderer?.content?.horizontalListRenderer;
                if (!horizontal?.items) continue;

                horizontal.items = horizontal.items.filter(i => !i.adSlotRenderer)
            }
        } else if (url.startsWith('/youtubei/v1/search')) { //search feed ads
            let searchFeed = json.contents?.sectionListRenderer;
            if (!searchFeed || !searchFeed.contents) return;

            for (let feed of searchFeed.contents) {
                let horizontal = feed?.shelfRenderer?.content?.horizontalListRenderer;
                if (!horizontal?.items) continue;

                horizontal.items = horizontal.items.filter(i => !i.adSlotRenderer)
            }
        }

        return JSON.stringify(json);
    })

    //video ads
    jsonMod.addModifier((json) => {
        if (!config.adblock) return json;

        if (json?.adPlacements) {
            json.adPlacements = []
        }

        if (json?.adSlots) {
            json.adSlots = []
        }

        return json;
    })

    //shorts ads
    jsonMod.addModifier((json) => {
        if (!config.adblock) return json;

        if (json?.entries && Array.isArray(json.entries)) {
            json.entries = json.entries.filter(e => !e?.command?.reelWatchEndpoint?.adClientParams?.isAd)
        }

        return json;
    })
}
},
"/src/preload/modules/block-sign-in-popup.js": function(module, exports, require, __filename, __dirname){
const rcMod = require('../util/resolveCommandModifiers')

module.exports = () => {
    rcMod.addInputModifier((c) => {
        if (c.openPopupAction?.uniqueId === 'playback-cap') return false;
        return c;
    })
}
},
"/src/preload/modules/controller-support.js": function(module, exports, require, __filename, __dirname){
//controller support with console parity (normal leanback doesn't have this for some reason, not sure how the console apps do it...)

const { ipcRenderer } = require('vacuumtube-host')
const controller = require('../util/controller')
const ui = require('../util/ui')
const localeProvider = require('../util/localeProvider')
const configManager = require('../config')
const config = configManager.get()

module.exports = async () => {
    const gamepadKeyCodeMap = { //aiming to maintain parity with the console versions of leanback
        0:  13,   //a -> enter
        1:  27,   //b -> escape
        2:  170,  // X -> asterisk/search
        3:  32,   // Y -> play/pause
        4:  115,  //left bumper -> f4 (back)
        5:  116,  //right bumper -> f5 (forward)
        6:  113,  //left trigger -> f2 (seek backwards)
        7:  114,  //right trigger -> f3 (seek forwards)
        8:  189,  //select -> minus (vacuumtube volume down)
        9:  187,  //start -> equals (vacuumtube volume up)
        10: 77,   //l3 (vacuumtube mute)
        11: 'vt-settings', //r3 -> (vacuumtube settings)
        12: 38,   //dpad up -> arrow key up
        13: 40,   //dpad down -> arrow key down
        14: 37,   //dpad left -> arrow key left
        15: 39,   //dpad right -> arrow key right

        1012: 38,  //left stick up -> arrow key up
        1014: 40,  //left stick down -> arrow key down
        1011: 37,  //left stick left -> arrow key left
        1013: 39   //left stick right -> arrow key right
    }

    const fallbackKeyCode = 135; //f24, key isn't used by youtube but is picked up and brings up the menu thing (which all buttons do if they dont do anything else)
    let hasPressedAnyButton = false;

    let runningOnSteam = false
    if (runningOnSteam) {
        setTimeout(async () => {
            if (!hasPressedAnyButton) {
                await localeProvider.waitUntilAvailable()

                const locale = localeProvider.getLocale()
                ui.toast('VacuumTube', locale.general.steam_controller_notice)
            }
        }, 15000)
    }

    controller.on('down', (e) => {
        hasPressedAnyButton = true;

        let keyCode = gamepadKeyCodeMap[e.code]
        if (!keyCode) keyCode = fallbackKeyCode;

        simulateKeyDown(keyCode)
    })

    controller.on('up', (e) => {
        let keyCode = gamepadKeyCodeMap[e.code]
        if (!keyCode) keyCode = fallbackKeyCode;

        simulateKeyUp(keyCode)
    })

    function simulateKeyDown(keyCode) {
        if (!config.controller_support) return;

        if (keyCode === 'vt-settings') {
            if (window.vtToggleSettingsOverlay) {
                window.vtToggleSettingsOverlay()
            }

            return;
        }

        let event = new Event('keydown')
        event.keyCode = keyCode;
        document.dispatchEvent(event)
    }

    function simulateKeyUp(keyCode) {
        if (!config.controller_support) return;

        if (keyCode === 'vt-settings') {
            return;
        }

        let event = new Event('keyup')
        event.keyCode = keyCode;
        document.dispatchEvent(event)
    }
}
},
"/src/preload/modules/css.js": function(module, exports, require, __filename, __dirname){
//apply the css patches

const fs = require('fs')
const path = require('path')
const css = require('../util/css')

const cssPath = path.join(__dirname, '../', 'style.css')
const text = fs.readFileSync(cssPath, 'utf-8')

module.exports = () => {
    css.inject('patches', text)
}
},
"/src/preload/modules/dearrow.js": function(module, exports, require, __filename, __dirname){
//dearrow support (https://dearrow.ajay.app/)

const xhrModifiers = require('../util/xhrModifiers')
const configManager = require('../config')
const httpClient = require('../util/httpClient')
const config = configManager.get()

const cache = {}

async function getBranding(id) {
    if (id in cache) {
        return cache[id];
    }

    let res = await httpClient.request(`https://sponsor.ajay.app/api/branding?videoID=${encodeURIComponent(id)}`)
    if (res.status === 404) return null;

    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

    let data = await res.json()

    cache[id] = data;
    return data;
}

function getThumbnail(id) {
    return `https://dearrow-thumb.ajay.app/api/v1/getThumbnail?videoID=${id}`;
}

module.exports = () => {
    xhrModifiers.addResponseModifier(async (url, text) => {
        if (!config.dearrow) return;

        if (
            !url.startsWith('/youtubei/v1/browse') &&
            !url.startsWith('/youtubei/v1/search') &&
            !url.startsWith('/youtubei/v1/next')
        ) {
            return;
        }

        let json = JSON.parse(text)

        let items = []
        if (json.continuationContents?.horizontalListContinuation || json.continuationContents?.gridContinuation) { //simple continuations, consistent across requests
            if (json.continuationContents.horizontalListContinuation?.items) { //horizontal
                items = json.continuationContents.horizontalListContinuation.items;
            } else if (json.continuationContents.gridContinuation?.items) { //grid
                items = json.continuationContents.gridContinuation.items;
            }

            if (!items) return;
        } else {
            let contents = []

            if (url.startsWith('/youtubei/v1/browse')) { //feeds (home, subscription, etc, basically anything on the left bar) (i'm sorry for this code, but i tried my best to document it... i really hope it never breaks)
                if (json.contents?.tvBrowseRenderer?.content?.tvSecondaryNavRenderer?.sections) { //sectioned, i wrote this for subscriptions but i don't really know where else it applies
                    let tvSecondaryNavRenderer = json.contents.tvBrowseRenderer.content.tvSecondaryNavRenderer;
                    for (let section of tvSecondaryNavRenderer.sections) {
                        if (!section.tvSecondaryNavSectionRenderer?.tabs) continue;

                        let tab = section.tvSecondaryNavSectionRenderer.tabs[0] //the first tab is the one selected by default, the others have nothing and when they're selected, its a continuation
                        contents = tab.tabRenderer?.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents;
                    }
                } else if (json.contents?.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents) { //default horizontal feeds
                    contents = json.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents;
                } else if (json.contents?.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content?.gridRenderer) { //grid feeds
                    contents = [ json.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content ]
                } else if (json.continuationContents?.tvSurfaceContentContinuation?.content?.sectionListRenderer?.contents) { //continuation (except it doesn't fit the format of the other continuations up there)
                    contents = json.continuationContents.tvSurfaceContentContinuation.content.sectionListRenderer.contents;
                }
            } else if (url.startsWith('/youtubei/v1/search')) { //search results
                contents = json.contents?.sectionListRenderer?.contents;
            } else if (url.startsWith('/youtubei/v1/next')) { //recommended videos that appear under video you're watching
                contents = json.contents?.singleColumnWatchNextResults?.pivot?.sectionListRenderer?.contents;
            }

            if (!contents) return;

            for (let content of contents) {
                let someItems;
                if (content.shelfRenderer) { //regular horizontal feed
                    someItems = content.shelfRenderer.content.horizontalListRenderer?.items;
                } else if (content.gridRenderer) { //grid feed
                    someItems = content.gridRenderer.items;
                }

                if (!someItems) continue;

                items = [ ...items, ...someItems ]
            }
        }

        let promises = []

        for (let item of items) {
            if (!item.tileRenderer) continue;
            if (item.tileRenderer.contentType !== 'TILE_CONTENT_TYPE_VIDEO') continue; //this intentionally also blocks out shorts, i don't think dearrow does shorts

            let id = item.tileRenderer.contentId;
            promises.push((async () => {
                try {
                    if (!item.tileRenderer.metadata) return;

                    let branding = await getBranding(id)
                    if (!branding) return;

                    let duration = branding.videoDuration;
                    if (!duration) return;

                    let goodTitle = branding.titles.find(t => t.locked || t.votes >= 0)
                    if (goodTitle) {
                        let words = goodTitle.title.split(' ')
                        words = words.map(w => { //strip autoformatting characters (see https://wiki.sponsor.ajay.app/w/API_Docs/DeArrow)
                            if (w.startsWith('>')) {
                                w = w.slice(1)
                            }

                            return w;
                        })

                        let title = words.join(' ')
                        item.tileRenderer.metadata.tileMetadataRenderer.title.simpleText = title;
                    }

                    let newThumbnail = getThumbnail(id)
                    item.tileRenderer.header.tileHeaderRenderer.thumbnail.thumbnails[0].url = newThumbnail;
                } catch (err) {
                    console.error('getting and applying dearrow branding failed', err)
                }
            })())
        }

        if (promises.length > 0) {
            await Promise.all(promises)
        }

        return JSON.stringify(json);
    })
}
},
"/src/preload/modules/disable-direct-sign-in.js": function(module, exports, require, __filename, __dirname){
//"Sign in with your remote" is very buggy and broken in VacuumTube (sometimes breaks module injection, can't use controller, and also simply doesn't work in the end), so we disable it

const configOverrides = require('../util/configOverrides')

module.exports = async () => {
    configOverrides.tectonicConfigOverrides.push({
        featureSwitches: {
            enableDirectSignIn: false
        }
    })
}
},
"/src/preload/modules/encryption-notice.js": function(module, exports, require, __filename, __dirname){
const rcMod = require('../util/resolveCommandModifiers')
const localeProvider = require('../util/localeProvider')

module.exports = async () => {
    await localeProvider.waitUntilAvailable()

    let locale = localeProvider.getLocale()

    rcMod.addInputModifier((c) => {
        if (c.openPopupAction?.uniqueId === 'unknown-player-error') {
            return {
                openPopupAction: {
                    popupType: 'FULLSCREEN_OVERLAY',
                    uniqueId: 'vt-player-error',
                    popup: {
                        overlaySectionRenderer: {
                            overlay: {
                                overlayTwoPanelRenderer: {
                                    actionPanel: {
                                        overlayPanelRenderer: {
                                            header: {
                                                overlayPanelHeaderRenderer: {
                                                    title: {
                                                        simpleText: locale.general.encryption_error.title
                                                    },
                                                    subtitle: {
                                                        simpleText: locale.general.encryption_error.text
                                                    }
                                                }
                                            },
                                            footer: {
                                                overlayPanelItemListRenderer: {
                                                    items: [
                                                        {
                                                            compactLinkRenderer: {
                                                                title: {
                                                                    simpleText: locale.general.encryption_error.switch_accounts
                                                                },
                                                                serviceEndpoint: {
                                                                    commandExecutorCommand: {
                                                                        commands: [
                                                                            {
                                                                                clientActionEndpoint: {
                                                                                    action: { actionType: 'OPEN_SIGN_IN_PROMPT' }
                                                                                }
                                                                            }
                                                                        ]
                                                                    }
                                                                }
                                                            }
                                                        },
                                                        {
                                                            compactLinkRenderer: {
                                                                title: {
                                                                    simpleText: locale.general.encryption_error.okay
                                                                },
                                                                serviceEndpoint: {
                                                                    commandExecutorCommand: {
                                                                        commands: [
                                                                            { signalAction: { signal: 'HISTORY_BACK' } },
                                                                            { signalAction: { signal: 'CLOSE_POPUP' } }
                                                                        ]
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    },
                                    backButton: {
                                        buttonRenderer: {
                                            icon: { iconType: 'DISMISSAL' },
                                            command: {
                                                commandExecutorCommand: {
                                                    commands: [
                                                        { signalAction: { signal: 'HISTORY_BACK' } },
                                                        { signalAction: { signal: 'CLOSE_POPUP' } }
                                                    ]
                                                }
                                            }
                                        }
                                    }
                                }
                            },
                            dismissalCommand: {
                                commandExecutorCommand: {
                                    commands: [
                                        { signalAction: { signal: 'HISTORY_BACK' } },
                                        { signalAction: { signal: 'CLOSE_POPUP' } }
                                    ]
                                }
                            }
                        }
                    }
                }
            };
        }

        return c;
    })
}
},
"/src/preload/modules/fix-exit.js": function(module, exports, require, __filename, __dirname){
// Route YouTube's EXIT_APP command to the UWP host.
const { ipcRenderer } = require('vacuumtube-host')
const rcMod = require('../util/resolveCommandModifiers')
module.exports = () => {
    rcMod.addInputModifier(command => {
        const commands = command.commandExecutorCommand?.commands
        if (!commands?.some(item => item.signalAction?.signal === 'EXIT_APP')) return command
        ipcRenderer.invoke('exit-app')
        return false
    })
}

},
"/src/preload/modules/fix-reloads.js": function(module, exports, require, __filename, __dirname){
//when it sends a RELOAD_PAGE command, youtube's service worker can intercept it and break VacuumTube's preload injection. this script fixes that by telling the main process to reload through the native WebView2 host, bypassing the service worker

const { ipcRenderer } = require('vacuumtube-host')
const rcMod = require('../util/resolveCommandModifiers')

module.exports = () => {
    rcMod.addInputModifier((command) => {
        if (!command.signalAction || !command.signalAction.signal || command.signalAction.signal !== 'RELOAD_PAGE') return command;

        ipcRenderer.invoke('reload')
        return false;
    })
}
},
"/src/preload/modules/fix-voice.js": function(module, exports, require, __filename, __dirname){
//fix voice search

const { ipcRenderer } = require('vacuumtube-host')
const configOverrides = require('../util/configOverrides')
const functions = require('../util/functions')

let pendingAudioCapture = null;

function hasAudioConstraint(constraints) {
    if (!constraints || typeof constraints !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(constraints, 'audio')) return false;

    return constraints.audio !== false;
}

function createNotAllowedError(message) {
    if (typeof DOMException === 'function') {
        return new DOMException(message, 'NotAllowedError')
    }

    const error = new Error(message)
    error.name = 'NotAllowedError'
    return error;
}

async function getNativeMicrophoneStatus() {
    try {
        return await ipcRenderer.invoke('request-microphone-permission');
    } catch (err) {
        console.error('[Voice] Failed to request microphone permission:', err)
        return 'unknown';
    }
}

function guardGetUserMedia() {
    if (process.platform !== 'darwin' && !window.__VACUUMTUBE_XBOX__) return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    if (navigator.mediaDevices.getUserMedia.vtMicrophoneGuarded) return;

    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)

    const guardedGetUserMedia = (constraints) => {
        if (!hasAudioConstraint(constraints)) return originalGetUserMedia(constraints);
        if (pendingAudioCapture) return pendingAudioCapture;

        pendingAudioCapture = (async () => {
            const status = await getNativeMicrophoneStatus()
            if (status !== 'granted') {
                throw createNotAllowedError(`Microphone permission is ${status}`);
            }

            return originalGetUserMedia(constraints);
        })()
        .finally(() => {
            pendingAudioCapture = null;
        })

        return pendingAudioCapture;
    }

    guardedGetUserMedia.vtMicrophoneGuarded = true;

    try {
        navigator.mediaDevices.getUserMedia = guardedGetUserMedia;
    } catch {}

    if (navigator.mediaDevices.getUserMedia !== guardedGetUserMedia) {
        try {
            Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
                configurable: true,
                writable: true,
                value: guardedGetUserMedia
            })
        } catch (err) {
            console.error('[Voice] Failed to install getUserMedia guard:', err)
        }
    }
}

module.exports = () => {
    configOverrides.overrideEnv('env_enableMediaStreams', true)

    guardGetUserMedia()

    if (process.platform === 'darwin' || window.__VACUUMTUBE_XBOX__) {
        functions.waitForCondition(() => !!navigator.mediaDevices?.getUserMedia)
        .then(guardGetUserMedia)
    }
}
},
"/src/preload/modules/h264ify.js": function(module, exports, require, __filename, __dirname){
//code adapted from https://github.com/erkserkserks/h264ify
//Copyright (c) 2015 erkserkserks, The MIT License (MIT)

const configManager = require('../config')
const config = configManager.get()

module.exports = () => {
    if (!config.h264ify) return;

    let video = document.createElement('video')
    let canPlayType = video.canPlayType.bind(video)
    video.__proto__.canPlayType = makeModifiedTypeChecker()

    let mse = window.MediaSource;
    let isTypeSupported = mse.isTypeSupported.bind(mse)
    mse.isTypeSupported = makeModifiedTypeChecker(isTypeSupported)

    function makeModifiedTypeChecker() {
        return (type) => {
            if (config.h264ify_disable_webm && type.includes('webm') ||
                config.h264ify_disable_vp8 && type.includes('vp8') ||
                config.h264ify_disable_vp9 && type.includes('vp9') ||
                config.h264ify_disable_av1 && type.includes('av01')) {
                return '';
            }

            return canPlayType(type);
        };
    }
}
},
"/src/preload/modules/h5vcc/index.js": function(module, exports, require, __filename, __dirname){
// Xbox/WebView2 replacement for the Electron/Node DIAL server.
// The public h5vcc.dial.DialServer surface is retained; UDP/TCP networking is
// implemented by the UWP host because browser JavaScript cannot bind sockets.

const { ipcRenderer } = require('vacuumtube-host')
const configManager = require('../../config')
const packageInfo = require('../../../xbox/app-info.json')

const routes = []
let dialDevice = null

class DialServer {
    constructor(appName) {
        this.appName = appName
        this.basePath = `/apps/${appName}`
    }

    fullPath(path) {
        return (this.basePath + path).replace(/\/+$/, '') || '/'
    }

    register(method, path, callback) {
        const fullPath = this.fullPath(path)
        routes.push({ method, path: fullPath, basePath: this.basePath, callback })
        ipcRenderer.invoke('dial-register-route', method, fullPath).catch(error => {
            console.warn('[h5vcc] Native DIAL route registration failed', error)
        })
    }

    onGet(path, callback) { this.register('GET', path, callback) }
    onPost(path, callback) { this.register('POST', path, callback) }
    onDelete(path, callback) { this.register('DELETE', path, callback) }
}


async function startNativeDial() {
    if (!dialDevice) return false
    try {
        return await ipcRenderer.invoke('dial-start', dialDevice)
    } catch (error) {
        console.warn('[h5vcc] Native DIAL unavailable', error)
        return false
    }
}

ipcRenderer.on('host-resumed', () => {
    startNativeDial()
})

ipcRenderer.on('dial-request', async (_event, request) => {
    const route = routes.find(item => item.method === request.method && item.path === request.path)
    if (!route) {
        await ipcRenderer.invoke('dial-response', request.id, {
            responseCode: 404,
            headers: {},
            body: ''
        })
        return
    }

    const headers = {}
    const response = {
        responseCode: 200,
        mimeType: null,
        body: '',
        addHeader(key, value) { headers[key] = value }
    }

    try {
        const accepted = await route.callback({
            host: request.host,
            path: route.basePath,
            body: request.body || ''
        }, response)

        if (!accepted) response.responseCode = 400
    } catch (error) {
        console.error('[h5vcc] DIAL callback failed', error)
        response.responseCode = 500
        response.body = ''
    }

    if (response.mimeType) headers['Content-Type'] = response.mimeType
    await ipcRenderer.invoke('dial-response', request.id, {
        responseCode: response.responseCode || 200,
        headers,
        body: response.body || ''
    })
})

function getMaxResolution() {
    const resolutions = [ '256x144', '426x240', '640x360', '854x480', '1280x720', '1920x1080', '2560x1440', '3840x2160', '7680x4320' ]
    const screenWidth = Math.max(window.screen.width, window.screen.height)
    const screenHeight = Math.min(window.screen.width, window.screen.height)

    for (const resolution of resolutions) {
        const [ width, height ] = resolution.split('x').map(Number)
        if (screenWidth <= width && screenHeight <= height) return resolution
    }
    return `${screenWidth}x${screenHeight}`
}

function createDeviceId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()

    const bytes = new Uint8Array(16)
    if (globalThis.crypto?.getRandomValues) {
        globalThis.crypto.getRandomValues(bytes)
    } else {
        // Last-resort compatibility path for older WebView2 runtimes. This UUID is
        // only a local DIAL device identifier, not a security credential.
        for (let index = 0; index < bytes.length; index++) {
            bytes[index] = Math.floor(Math.random() * 256)
        }
    }

    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0'))
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

async function waitForDeviceId() {
    const started = Date.now()
    while ((Date.now() - started) < 10000) {
        try {
            const json = localStorage.getItem('yt.leanback.default::mdx-device-id')
            const id = JSON.parse(json)?.data
            if (id && typeof id === 'string') return id
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 50))
    }
    return createDeviceId()
}

module.exports = async () => {
    const config = configManager.get()
    const initialDeepLink = await ipcRenderer.invoke('get-deeplink')
    const maxResolution = getMaxResolution()

    window.h5vcc = {
        dial: { DialServer },
        runtime: { initialDeepLink },
        system: {
            getVideoContainerSizeOverride: () => config.unlock_resolution ? '7680x4320' : maxResolution
        }
    }

    if (config.device_discoverability) {
        const deviceId = await waitForDeviceId()
        dialDevice = {
            deviceId,
            friendlyName: `VacuumTube on ${(window.__VACUUMTUBE_PLATFORM__ || {}).deviceName || 'Xbox'}`,
            modelName: (window.__VACUUMTUBE_PLATFORM__ || {}).model || 'Xbox One / Series X|S',
            appVersion: packageInfo.version
        }
        await startNativeDial()
    }
}

},
"/src/preload/modules/hide-shorts.js": function(module, exports, require, __filename, __dirname){
//hide shorts from homepage

const xhrModifiers = require('../util/xhrModifiers')
const configManager = require('../config')
const config = configManager.get()

module.exports = () => {
    xhrModifiers.addResponseModifier(async (url, text) => {
        if (!config.hide_shorts) return;

        if (
            !url.startsWith('/youtubei/v1/browse')
        ) {
            return;
        }

        let json = JSON.parse(text)

        let sectionList = json.continuationContents?.sectionListContinuation || json.contents?.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer;
        if (!sectionList) return;

        sectionList.contents = sectionList.contents.filter(i => i?.shelfRenderer?.headerRenderer?.shelfHeaderRenderer?.avatarLockup?.avatarLockupRenderer?.title?.runs?.[0]?.text !== 'Shorts')

        return JSON.stringify(json);
    })
}
},
"/src/preload/modules/identification.js": function(module, exports, require, __filename, __dirname){
// Identify the Leanback client as the native Xbox YouTube-TV Cobalt shell.
// The UWP host applies the same Cobalt UA to documents, requests, service workers
// and Google/YouTube account pages. Authentication tokens, visitor data, cookies,
// delegated sessions and account IDs are deliberately left untouched.
const packageInfo = require('../../xbox/app-info.json')
const xhrModifiers = require('../util/xhrModifiers')
const configOverrides = require('../util/configOverrides')
const functions = require('../util/functions')

const platform = window.__VACUUMTUBE_PLATFORM__ || {}
const deviceModel = platform.userAgentModel || platform.model || 'Xbox Series X'
const osVersion = platform.osVersion || '10.0'
const cobaltVersion = platform.cobaltVersion || '25.lts.40.1035033'
const releaseVehicle = platform.cobaltReleaseVehicle || 'gold'
const starboardVersion = platform.starboardVersion || '15'

const identity = {
    platform: 'GAME_CONSOLE',
    platformDetail: 'XBOX',
    clientFormFactor: 'LARGE_FORM_FACTOR',
    deviceMake: 'Microsoft',
    deviceModel,
    browserName: 'Cobalt',
    browserVersion: cobaltVersion,
    osName: 'Xbox',
    osVersion,
    tvAppInfo: { releaseVehicle }
}

const playerDevice = {
    platform: 'GAME_CONSOLE',
    platformDetail: 'XBOX',
    brand: 'Microsoft',
    model: deviceModel,
    browser: 'Cobalt',
    browserVersion: cobaltVersion,
    os: 'Xbox',
    osVersion,
    cobaltReleaseVehicle: releaseVehicle
}

module.exports = () => {
    configOverrides.environmentOverrides.push({
        platform: 'GAME_CONSOLE',
        platform_detail: 'XBOX',
        brand: 'Microsoft',
        model: deviceModel,
        engine: 'Cobalt',
        browser_engine: 'Cobalt',
        browser_engine_version: cobaltVersion,
        browser: 'Cobalt',
        browser_version: cobaltVersion,
        os: 'Xbox',
        os_version: osVersion,
        feature_switches: {
            mdx_device_label: `VacuumTube ${packageInfo.version} on ${platform.deviceName || deviceModel}`,
            starboard_api_version: starboardVersion
        }
    })

    configOverrides.ytcfgOverrides.push({
        INNERTUBE_CONTEXT: { client: identity },
        WEB_PLAYER_CONTEXT_CONFIGS: {
            WEB_PLAYER_CONTEXT_CONFIG_ID_LIVING_ROOM_WATCH: {
                device: playerDevice
            }
        }
    })

    // Some requests are created before all config overrides have propagated.
    // Patch only the Xbox/Cobalt device identity. Account and session data stays
    // exactly as generated by YouTube and the persistent WebView2 profile.
    xhrModifiers.addRequestModifier((url, body) => {
        if (!String(url).includes('/youtubei/')) return body
        let json
        try { json = JSON.parse(body) } catch { return body }
        if (json?.context?.client) {
            functions.deepMerge(json.context.client, identity)
            body = JSON.stringify(json)
        }
        return body
    })

    xhrModifiers.addResponseModifier((url, text) => {
        if (!String(url).includes('/tv_config')) return
        try {
            const parts = text.split('\n')
            const index = parts.length - 1
            const json = JSON.parse(parts[index])
            const device = json?.webPlayerContextConfig?.WEB_PLAYER_CONTEXT_CONFIG_ID_LIVING_ROOM_WATCH?.device
            if (device) {
                functions.deepMerge(device, playerDevice)
                parts[index] = JSON.stringify(json)
                return parts.join('\n')
            }
        } catch (error) {
            console.warn('[Identification] Failed to patch tv_config', error)
        }
    })
}

},
"/src/preload/modules/keybinds.js": function(module, exports, require, __filename, __dirname){
//since leanback is made for tvs and consoles, there are some things you simply can't do, as well as things that are less desirable on keyboards

const ui = require('../util/ui')
const rcMod = require('../util/resolveCommandModifiers')
const patchFunction = require('../util/patchFunction')
const localeProvider = require('../util/localeProvider')

module.exports = async () => {
    await localeProvider.waitUntilAvailable()

    let locale = localeProvider.getLocale()

    //shift+enter to longpress
    let shiftHeld = false;
    let enterHeld = false;
    let shiftEnterHeld = false;

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Shift') shiftHeld = true;
        if (e.key === 'Enter') enterHeld = true;

        shiftEnterHeld = shiftHeld && enterHeld;
    }, true)

    document.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') shiftHeld = false;
        if (e.key === 'Enter') enterHeld = false;

        shiftEnterHeld = shiftHeld && enterHeld;
    }, true)

    patchFunction(window, 'setTimeout', function (setTimeout, callback, delay) {
        if (shiftEnterHeld && /^function\(\)\{[^.]+\.[^(]+\([^,]+,[^)]+\)\}$/.test(callback.toString())) { //very dumb, but it's "function(){x.x(x,x)}", this only is applied when shift and enter are held so it shouldn't cause any issues
            delay = 0;
        }

        return setTimeout(function(...args) {
            callback(...args)
        }, delay);
    })

    //ctrl+shift+c to copy video url
    let lastShortId = null;
    rcMod.addInputModifier((c) => {
        if (c.reelWatchEndpoint) {
            lastShortId = c.reelWatchEndpoint.videoId;
        }

        return c;
    })

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key?.toLowerCase() === 'c') {
            let url;

            let isShort = !!document.querySelector('ytlr-shorts-page')?.classList?.contains('zylon-focus')
            if (isShort && lastShortId) {
                url = `https://youtube.com/shorts/${lastShortId}`
            } else {
                let baseUri = window.yt?.player?.utils?.videoElement_?.baseURI;
                if (!baseUri || !baseUri.includes('/watch?v=')) return;

                let id = baseUri.split('/watch?v=')[1]?.slice(0, 11)
                if (!id) return;

                url = `https://youtu.be/${id}`
            }

            navigator.clipboard.writeText(url)
            ui.toast('VacuumTube', locale.general.video_copied)
        }
    })

    //c to toggle captions (like desktop)
    let captions = false;
    let captionSettings = { useDefaultTrack: true }

    rcMod.addInputModifier((c) => {
        if (c.selectSubtitlesTrackCommand) {
            if (Object.keys(c.selectSubtitlesTrackCommand).length === 0) {
                captions = false;
            } else {
                captions = true;
                captionSettings = c.selectSubtitlesTrackCommand;
            }
        }

        return c;
    })

    function toggleCaptions() { //doesn't actually change boolean value of captions variable because that's handled by the rcMod code above, which will hear these commands (as well as manual ones from toggling the button or changing track)
        if (captions) {
            rcMod.resolveCommand({
                commandMetadata: {
                    webCommandMetadata: {
                        clientAction: true
                    }
                },
                selectSubtitlesTrackCommand: {} //off
            })
        } else {
            rcMod.resolveCommand({
                commandMetadata: {
                    webCommandMetadata: {
                        clientAction: true
                    }
                },
                selectSubtitlesTrackCommand: captionSettings //last known caption settings or the default
            })
        }
    }

    document.addEventListener('keydown', (e) => {
        if (!document.body.classList.contains('WEB_PAGE_TYPE_WATCH') && !document.body.classList.contains('WEB_PAGE_TYPE_SHORTS')) return;
        if (!e.ctrlKey && !e.shiftKey && !e.metaKey && e.key?.toLowerCase() === 'c') {
            e.stopImmediatePropagation()
            e.stopPropagation()
            toggleCaptions()
        }
    }, true)
}
},
"/src/preload/modules/leanback-settings.js": function(module, exports, require, __filename, __dirname){
//injects custom VacuumTube settings button into the youtube settings page (and removes an irrelevant option from youtube settings)

const { shell } = require('vacuumtube-host')
const configManager = require('../config')
const jsonMod = require('../util/jsonModifiers')
const rcMod = require('../util/resolveCommandModifiers')
const localeProvider = require('../util/localeProvider')
const functions = require('../util/functions')

let config = configManager.get()

function createSettingButtonRenderer(title, summary, button, callback) {
    return {
        settingActionRenderer: {
            title: {
                runs: [ { text: title } ]
            },
            summary: {
                runs: [ { text: summary } ]
            },
            actionButton: {
                buttonRenderer: {
                    text: {
                        runs: [ { text: button } ]
                    },
                    navigationEndpoint: {
                        vtConfigOption: 'vt-button',
                        vtConfigValue: callback
                    }
                }
            }
        }
    };
}

function createSettingBooleanRenderer(title, summary, configName, dynamicFunction) { //unused since settings are now in custom menu, but just in case for future
    return {
        settingBooleanRenderer: {
            itemId: 'VOICE_AND_AUDIO_ACTIVITY', //this has to be here for it to listen to the 'enabled' flag, but it doesn't affect anything else
            enabled: config[configName],
            title: {
                runs: [
                    { text: title }
                ]
            },
            summary: {
                runs: [
                    { text: summary }
                ]
            },
            enableServiceEndpoint: {
                vtConfigOption: configName,
                vtConfigValue: true,
                dynamicFunction
            },
            disableServiceEndpoint: {
                vtConfigOption: configName,
                vtConfigValue: false,
                dynamicFunction
            }
        }
    };
}

module.exports = async () => {
    await localeProvider.waitUntilAvailable()
    await functions.waitForCondition(() => !!window.ytcfg)

    let isKids = window.ytcfg.data_.INNERTUBE_CLIENT_NAME === 'TVHTML5_FOR_KIDS' //if you enter/exit kids mode, the page reloads (and therefore, the preload modules re-inject), so this is fine to do non-dynamically
    let locale = localeProvider.getLocale()

    rcMod.addInputModifier((input) => { //unused since settings are now in custom menu, but just in case for future
        if (input.vtConfigOption) {
            if (input.vtConfigOption === 'vt-button') {
                input.vtConfigValue()
                return false;
            }

            let newConfig = {}
            newConfig[input.vtConfigOption] = input.vtConfigValue;
            configManager.set(newConfig)
            config = configManager.get()

            for (let key of Object.keys(configOptions)) {
                configOptions[key].settingBooleanRenderer.enabled = config[key] //it's actually reference based, you have to change the object itself when changing config for it to update (this took SO long to figure out, then it clicked...)
            }

            if (input.dynamicFunction) {
                input.dynamicFunction(input.vtConfigValue)
            }

            return false;
        }

        return input;
    })

    jsonMod.addModifier((json) => {
        if (json?.items?.[0]?.settingCategoryCollectionRenderer) {
            for (let item of json.items) {
                let category = item.settingCategoryCollectionRenderer;

                /*
                if you're on an in-house browser (like steel or cobalt), this shows the license for the browser
                in this case, it'd show cobalt's license since we use a ps4 user agent which uses the cobalt browser
                in situations where it runs outside of an in-house browser, it simply doesn't send the "Credits" button in the get_settings response
                since we can't change the user agent, we have to remove it manually
                */
                category.items = category.items.filter(c => c.settingReadOnlyItemRenderer?.itemId !== 'ABOUT_OPEN_SOURCE_LICENSES') //this line looks really bad out of context
            }

            if (isKids) return json; //don't show VacuumTube settings/donate in youtube kids

            json.items[0].settingCategoryCollectionRenderer.title = { //doesn't have a label by default
                runs: [
                    { text: 'YouTube' }
                ]
            }

            //VacuumTube entry point
            json.items.unshift(
                {
                    settingCategoryCollectionRenderer: {
                        categoryId: 'SETTINGS_CAT_VACUUMTUBE_OVERLAY',
                        focused: false,
                        items: [
                            createSettingButtonRenderer(
                                locale.settings.generic.title,
                                locale.settings.generic.description,
                                locale.settings.generic.button_label,
                                () => {
                                    if (window.vtOpenSettingsOverlay) {
                                        window.vtOpenSettingsOverlay()
                                    }
                                }
                            ),
                            /*
                            //don't yet have a way to receive donations
                            createSettingButtonRenderer(
                                locale.donate.setting.title,
                                locale.donate.setting.description,
                                locale.donate.setting.button_label,
                                () => {
                                    shell.openExternal('https://shy.rocks/donate')
                                }
                            )
                            */
                        ],
                        title: {
                            runs: [
                                { text: 'VacuumTube' }
                            ]
                        }
                    }
                }
            )
        }

        return json;
    })
}
},
"/src/preload/modules/low-memory-mode.js": function(module, exports, require, __filename, __dirname){
//force limited-memory if low_memory_mode is enabled

const configManager = require('../config')
const configOverrides = require('../util/configOverrides')

module.exports = () => {
    let config = configManager.get()

    if (config.low_memory_mode) {
        configOverrides.environmentOverrides.push({
            feature_switches: {
                enable_memory_saving_mode: true
            }
        })
    }
}
},
"/src/preload/modules/mouse.js": function(module, exports, require, __filename, __dirname){
//various mouse controls to improve desktop usability

module.exports = () => {
    const ESCAPE_KEYCODE = 27;

    let visible = true;
    let lastUse = 0;

    //block scroll events (enableTouchSupport in touch-support.js adds native scrollbars, which messes with scrollwheel)
    window.addEventListener('wheel', (e) => {
        e.preventDefault()
    }, { passive: false, capture: true })

    //right click to go back
    window.addEventListener('mousedown', (e) => {
        if (e.button === 2) {
            simulateKeyDown(ESCAPE_KEYCODE)
            setTimeout(() => simulateKeyUp(ESCAPE_KEYCODE), 50)
        }
    })

    function simulateKeyDown(keyCode) {
        let event = new Event('keydown')
        event.keyCode = keyCode;
        document.dispatchEvent(event)
    }

    function simulateKeyUp(keyCode) {
        let event = new Event('keyup')
        event.keyCode = keyCode;
        document.dispatchEvent(event)
    }

    //make mouse disappear after a bit of no movement
    setInterval(() => {
        if (!visible) return;
        if ((Date.now() - lastUse) >= 3000) {
            hideCursor()
        }
    }, 20)

    window.addEventListener('mousemove', () => {
        lastUse = Date.now()
        showCursor()
    })

    window.addEventListener('mousedown', () => {
        lastUse = Date.now()
        showCursor()
    })

    function showCursor() {
        document.documentElement.style.cursor = 'default'
        visible = true;
    }

    function hideCursor() {
        document.documentElement.style.cursor = 'none'
        visible = false;
    }
}
},
"/src/preload/modules/music-mode/index.js": function(module, exports, require, __filename, __dirname){
const { ipcRenderer } = require('vacuumtube-host')
const configManager = require('../../config')
const functions = require('../../util/functions')
const jsonModifiers = require('../../util/jsonModifiers')
const localeProvider = require('../../util/localeProvider')
const resolveCommandModifiers = require('../../util/resolveCommandModifiers')
const { enableAudioOnly, enableNativeMusicRenderer, isPlayerResponse } = require('./player-response')

const NO_VIDEO_SIGNAL = 'VT_MUSIC_MODE'
const QUALITY_OVERLAY_TYPE = 'CLIENT_OVERLAY_TYPE_VIDEO_QUALITY'
const PLAYBACK_QUALITY_SETTING = 'PLAYBACK_QUALITY'

let featureEnabled = false;
let enabled = false;
let lastThumbnail = null;
let qualityInjectionTimer = null;
let qualityMenuObserver = null;
let labels = {
    title: 'No Video',
    subtitle: 'Audio only'
}

function isFeatureEnabled(config) {
    return config.features_enabled === true && config.music_mode_feature === true;
}

function getPlayerResponses(json) {
    const candidates = [ json, json?.playerResponse ]
    return candidates.filter((candidate, index) =>
        isPlayerResponse(candidate) && candidates.indexOf(candidate) === index
    );
}

function getCommands(command) {
    const commands = [ command ]

    for (let index = 0; index < commands.length; index++) {
        const nested = commands[index]?.commandExecutorCommand?.commands
        if (Array.isArray(nested)) commands.push(...nested);
    }

    return commands.filter(Boolean);
}

function hasSignal(command, signal) {
    return getCommands(command).some((candidate) => candidate.signalAction?.signal === signal);
}

function opensQualityMenu(command) {
    return getCommands(command).some((candidate) =>
        candidate.openClientOverlayAction?.type === QUALITY_OVERLAY_TYPE
    );
}

function getPlaybackQuality(command) {
    for (const candidate of getCommands(command)) {
        const settingData = candidate.setClientSettingEndpoint?.settingDatas
        if (!Array.isArray(settingData)) continue;

        const playbackQuality = settingData.find((setting) =>
            setting.clientSettingEnum?.item === PLAYBACK_QUALITY_SETTING
        )
        if (!playbackQuality?.stringValue) continue;

        try {
            return JSON.parse(playbackQuality.stringValue).quality || null;
        } catch {
            return null;
        }
    }

    return null;
}

function createNoVideoItem() {
    return {
        compactLinkRenderer: {
            title: { simpleText: labels.title },
            subtitle: { simpleText: labels.subtitle },
            secondaryIcon: {
                iconType: enabled ? 'CHECK' : 'RADIO_BUTTON_UNCHECKED'
            },
            serviceEndpoint: {
                signalAction: { signal: NO_VIDEO_SIGNAL }
            }
        }
    };
}

function isNoVideoItem(item) {
    return hasSignal(item?.compactLinkRenderer?.serviceEndpoint, NO_VIDEO_SIGNAL);
}

function isQualityItem(item) {
    return !!getPlaybackQuality(item?.compactLinkRenderer?.serviceEndpoint);
}

function updateQualityPanel(instance, data, items, selectedIndex) {
    instance.props.data = { ...data, items, selectedIndex }
    const nextState = typeof instance.j === 'function' ? instance.j(items) : {};
    nextState.selectedIndex = selectedIndex;
    instance.K(nextState)
}

function syncQualityMenuItem() {
    const panels = document.querySelectorAll('ytlr-overlay-panel-item-list-renderer')
    const panel = [ ...panels ].find((candidate) =>
        candidate.__instance?.props?.data?.items?.some((item) => isQualityItem(item) || isNoVideoItem(item))
    )
    if (!panel) return false;

    const instance = panel.__instance
    const data = instance.props.data
    const existingNoVideoIndex = data.items.findIndex(isNoVideoItem)
    const nativeItems = data.items.filter((item) => !isNoVideoItem(item))

    if (!featureEnabled) {
        if (existingNoVideoIndex === -1) return true;

        const checkedNativeIndex = nativeItems.findIndex((item) =>
            item.compactLinkRenderer?.secondaryIcon?.iconType === 'CHECK'
        )
        const selectedIndex = checkedNativeIndex === -1 ? 0 : checkedNativeIndex;
        updateQualityPanel(instance, data, nativeItems, selectedIndex)
        return true;
    }

    if (existingNoVideoIndex !== -1) {
        const renderer = data.items[existingNoVideoIndex].compactLinkRenderer
        const expectedIcon = enabled ? 'CHECK' : 'RADIO_BUTTON_UNCHECKED';
        const nativeSelectionCleared = !enabled || data.items.every((item, index) =>
            index === existingNoVideoIndex || item.compactLinkRenderer?.secondaryIcon?.iconType !== 'CHECK'
        )
        const selectedIndexMatches = !enabled || data.selectedIndex === existingNoVideoIndex;

        if (
            renderer.title?.simpleText === labels.title &&
            renderer.subtitle?.simpleText === labels.subtitle &&
            renderer.secondaryIcon?.iconType === expectedIcon &&
            nativeSelectionCleared &&
            selectedIndexMatches
        ) {
            return true;
        }
    }

    const items = nativeItems.map((item) => {
        const renderer = item.compactLinkRenderer
        if (!enabled || renderer?.secondaryIcon?.iconType !== 'CHECK') return item;

        return {
            ...item,
            compactLinkRenderer: {
                ...renderer,
                secondaryIcon: { iconType: 'RADIO_BUTTON_UNCHECKED' }
            }
        };
    })

    const noVideoIndex = items.length;
    items.push(createNoVideoItem())
    updateQualityPanel(instance, data, items, enabled ? noVideoIndex : data.selectedIndex)

    return true;
}

function startQualityMenuObserver() {
    if (qualityMenuObserver || !document.documentElement) return;

    qualityMenuObserver = new MutationObserver((mutations) => {
        const qualityPanelChanged = mutations.some((mutation) => {
            if (mutation.target.closest?.('ytlr-overlay-panel-item-list-renderer')) return true;

            return [ ...mutation.addedNodes ].some((node) =>
                node.nodeType === 1 && (
                    node.matches?.('ytlr-overlay-panel-item-list-renderer') ||
                    node.querySelector?.('ytlr-overlay-panel-item-list-renderer')
                )
            );
        })

        if (qualityPanelChanged) scheduleQualityMenuSync();
    })

    qualityMenuObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
    })
}

function scheduleQualityMenuSync() {
    if (qualityInjectionTimer != null) clearTimeout(qualityInjectionTimer);

    let attempts = 0;
    const trySync = () => {
        qualityInjectionTimer = null;
        if (syncQualityMenuItem()) return;

        attempts++;
        if (attempts < 20) {
            qualityInjectionTimer = setTimeout(trySync, 25)
        }
    }

    qualityInjectionTimer = setTimeout(trySync, 0)
}

function reloadCurrentVideo() {
    const player = document.querySelector('.html5-video-player')
    if (!player?.loadVideoById) return false;

    const videoData = player.getVideoData?.() || {}
    const videoId = videoData.video_id || videoData.videoId;
    if (!videoId) return false;

    const currentTime = Number(player.getCurrentTime?.()) || 0;
    const wasPaused = player.getPlayerState?.() === 2;

    try {
        player.loadVideoById(videoId, Math.max(0, currentTime))
        if (wasPaused) setTimeout(() => player.pauseVideo?.(), 100);

        return true;
    } catch (err) {
        console.error('[Music Mode] Failed to reload the current video', err)
        return false;
    }
}

function closeQualityMenu() {
    try {
        resolveCommandModifiers.resolveCommand({
            signalAction: { signal: 'POPUP_BACK' }
        })
    } catch (err) {
        console.error('[Music Mode] Failed to close the quality menu', err)
    }
}

function enableMusicMode() {
    if (!featureEnabled) return;

    const changed = !enabled;
    enabled = true;
    configManager.set({ music_mode: true })

    setTimeout(() => {
        closeQualityMenu()
        if (changed) reloadCurrentVideo();
    }, 0)
}

function disableMusicMode({ reload = true } = {}) {
    if (!enabled) return;

    enabled = false;
    lastThumbnail = null;
    configManager.set({ music_mode: false })
    if (reload) setTimeout(reloadCurrentVideo, 0);
}

module.exports = () => {
    const config = configManager.get()
    featureEnabled = isFeatureEnabled(config)
    enabled = featureEnabled && config.music_mode === true;

    if (!featureEnabled && config.music_mode === true) {
        configManager.set({ music_mode: false })
    }

    functions.waitForCondition(() => !!document.documentElement).then(startQualityMenuObserver)

    jsonModifiers.addModifier((json) => {
        if (!featureEnabled || !enabled) return json;

        for (const playerResponse of getPlayerResponses(json)) {
            lastThumbnail = enableAudioOnly(playerResponse) || lastThumbnail;
        }

        enableNativeMusicRenderer(json, lastThumbnail)
        return json;
    })

    resolveCommandModifiers.addInputModifier((command) => {
        if (opensQualityMenu(command)) scheduleQualityMenuSync();

        if (hasSignal(command, NO_VIDEO_SIGNAL)) {
            enableMusicMode()
            return false;
        }

        if (getPlaybackQuality(command)) {
            disableMusicMode()
        }

        return command;
    })

    localeProvider.waitUntilAvailable().then(() => {
        const locale = localeProvider.getLocale()
        labels = {
            title: locale.music_mode?.title || labels.title,
            subtitle: locale.music_mode?.subtitle || labels.subtitle
        }
    })

    ipcRenderer.on('config-update', (event, nextConfig) => {
        const wasEnabled = enabled;
        featureEnabled = isFeatureEnabled(nextConfig)
        enabled = featureEnabled && nextConfig.music_mode === true;

        if (!featureEnabled && nextConfig.music_mode === true) {
            enabled = false;
            configManager.set({ music_mode: false })
        }

        if (wasEnabled && !enabled) {
            lastThumbnail = null;
            setTimeout(reloadCurrentVideo, 0)
        }

        syncQualityMenuItem()
    })
}
},
"/src/preload/modules/music-mode/player-response.js": function(module, exports, require, __filename, __dirname){
function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPlayerResponse(value) {
    return isObject(value) && isObject(value.streamingData) && isObject(value.videoDetails);
}

function getThumbnail(playerResponse) {
    const thumbnails = playerResponse.videoDetails?.thumbnail?.thumbnails
    if (Array.isArray(thumbnails)) {
        const largest = [ ...thumbnails ]
            .filter((thumbnail) => typeof thumbnail?.url === 'string' && thumbnail.url.length > 0)
            .sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)))[0]

        if (largest) return largest;
    }

    const videoId = playerResponse.videoDetails?.videoId
    if (typeof videoId === 'string' && videoId.length > 0) {
        return {
            url: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
            width: 480,
            height: 360
        };
    }

    return null;
}

function enableAudioOnly(playerResponse) {
    if (!isPlayerResponse(playerResponse)) return null;

    if (!isObject(playerResponse.playerConfig)) {
        playerResponse.playerConfig = {}
    }

    if (!isObject(playerResponse.playerConfig.audioConfig)) {
        playerResponse.playerConfig.audioConfig = {}
    }

    playerResponse.playerConfig.audioConfig.playAudioOnly = true;
    playerResponse.videoDetails.musicVideoType = 'MUSIC_VIDEO_TYPE_ATV';

    return getThumbnail(playerResponse);
}

function getWatchMetadataItem(json) {
    const contents = json.contents?.singleColumnWatchNextResults?.results?.results?.contents
    if (!Array.isArray(contents)) return null;

    for (const result of contents) {
        const items = result?.itemSectionRenderer?.contents
        if (!Array.isArray(items)) continue;

        const item = items.find((candidate) => candidate?.videoMetadataRenderer)
        if (item) return item;
    }

    return null;
}

function asThumbnailModel(currentVideoThumbnail, fallbackThumbnail) {
    if (Array.isArray(currentVideoThumbnail?.thumbnails) && currentVideoThumbnail.thumbnails.length > 0) {
        return { thumbnails: currentVideoThumbnail.thumbnails };
    }

    if (typeof fallbackThumbnail?.url === 'string') {
        return { thumbnails: [ fallbackThumbnail ] };
    }

    return null;
}

function enableNativeMusicRenderer(json, fallbackThumbnail = null) {
    if (!isObject(json)) return false;

    const metadataItem = getWatchMetadataItem(json)
    const videoMetadata = metadataItem?.videoMetadataRenderer
    if (!videoMetadata) return false;

    const currentVideoThumbnail = isObject(json.currentVideoThumbnail)
        ? json.currentVideoThumbnail
        : null;
    const thumbnailModel = asThumbnailModel(currentVideoThumbnail, fallbackThumbnail)
    const musicMetadata = {
        title: videoMetadata.title,
        byline: videoMetadata.owner?.videoOwnerRenderer?.title,
        secondaryTitle: videoMetadata.title,
        viewCountText: videoMetadata.viewCount?.videoViewCountRenderer?.shortViewCount,
        mayTruncateChannelName: true,
        trackingParams: videoMetadata.trackingParams
    }

    if (thumbnailModel) {
        musicMetadata.blurredBackgroundThumbnail = thumbnailModel;

        if (!currentVideoThumbnail) {
            json.currentVideoThumbnail = thumbnailModel;
        }
    }

    if (isObject(currentVideoThumbnail?.darkColorPalette)) {
        musicMetadata.darkColorPalette = currentVideoThumbnail.darkColorPalette;
    }

    for (const key of Object.keys(musicMetadata)) {
        if (musicMetadata[key] === undefined) delete musicMetadata[key];
    }

    delete metadataItem.videoMetadataRenderer;
    metadataItem.musicWatchMetadataRenderer = musicMetadata;
    return true;
}

module.exports = {
    enableAudioOnly,
    enableNativeMusicRenderer,
    getThumbnail,
    isPlayerResponse
}
},
"/src/preload/modules/no-f11.js": function(module, exports, require, __filename, __dirname){
//block youtube from seeing f11 being pressed so it doesn't impede the user trying to toggle fullscreen

module.exports = () => {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F11') {
            e.stopImmediatePropagation()
        }
    }, true)
}
},
"/src/preload/modules/pause-on-blur.js": function(module, exports, require, __filename, __dirname){
//pause video on blur (if enabled)
//originally, this module was made to not tell youtube when application is minimized, since stopping playback is undesirable usually
//i don't know if youtube still does this, so we still completely block their way of doing it, and implement our way of doing it as a setting

const { ipcRenderer } = require('vacuumtube-host')
const configManager = require('../config')
const rcMod = require('../util/resolveCommandModifiers')

module.exports = () => {
    let config = configManager.get()

    document.addEventListener('visibilitychange', (e) => {
        e.stopImmediatePropagation()
    })

    document.addEventListener('webkitvisibilitychange', (e) => {
        e.stopImmediatePropagation()
    })

    ipcRenderer.on('blur', () => {
        if (!config.pause_on_blur) return;

        rcMod.resolveCommand({
            commandMetadata: {
                webCommandMetadata: {
                    clientAction: true
                }
            },
            playerControlAction: {
                playerControlType: 'PLAYER_CONTROL_ACTION_TYPE_PAUSE',
                userInitiated: true
            }
        })
    })
}
},
"/src/preload/modules/remove-super-resolution.js": function(module, exports, require, __filename, __dirname){
//youtube added "super resolution", which is just ai upscaled qualities. very dumb...

const jsonMod = require('../util/jsonModifiers')
const configManager = require('../config')
const config = configManager.get()

module.exports = () => {
    jsonMod.addModifier((json) => {
        if (!config.remove_super_resolution) return json;
        if (!json?.streamingData?.adaptiveFormats) return json;

        json.streamingData.adaptiveFormats = json.streamingData.adaptiveFormats.filter(f => f.xtags !== 'CgcKAnNyEgEx') //i don't exactly know what that string means, but it does indicate that it's "Super resolution". hopefully the string doesn't change, i can't seem to figure out what script is responsible for determining if it's "Super resolution"

        return json;
    })
}
},
"/src/preload/modules/return-youtube-dislike.js": function(module, exports, require, __filename, __dirname){
//readds dislikes to youtube using returnyoutubedislike

const xhrModifiers = require('../util/xhrModifiers')
const localeProvider = require('../util/localeProvider')
const configManager = require('../config')
const httpClient = require('../util/httpClient')
const config = configManager.get()

async function fetchDislikes(videoId) {
    let res = await httpClient.request(`https://returnyoutubedislikeapi.com/Votes?videoId=${encodeURIComponent(videoId)}`)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

    let data = await res.json()
    return data;
}

module.exports = async () => {
    await localeProvider.waitUntilAvailable()

    let locale = localeProvider.getLocale()

    xhrModifiers.addResponseModifier(async (url, text) => {
        if (!config.dislikes) return;

        if (
            !url.startsWith('/youtubei/v1/next')
        ) {
            return;
        }

        let json = JSON.parse(text)

        let videoId = json.currentVideoEndpoint.watchEndpoint.videoId;

        let panel = json.engagementPanels.find(p => p.engagementPanelSectionListRenderer?.panelIdentifier === 'video-description-ep-identifier')
        if (!panel) return; //shouldn't happen

        let engagementActions = json.transportControls?.transportControlsRenderer?.engagementActions;
        let likesEngagement = engagementActions?.find(a => a.type === 'TRANSPORT_CONTROLS_BUTTON_TYPE_LIKE_BUTTON')

        let votes;
        try {
            votes = await fetchDislikes(videoId)
        } catch (err) {
            console.error(`fetching dislikes of ${videoId} failed`, err)
            return;
        }

        let dislikes = votes.dislikes;
        let abbreviatedDislikes = Intl.NumberFormat(undefined, {
            notation: 'compact',
            maximumFractionDigits: 1
        }).format(dislikes)

        panel.engagementPanelSectionListRenderer.content.structuredDescriptionContentRenderer.items[0].videoDescriptionHeaderRenderer.factoid.push({
            factoidRenderer: {
                value: {
                    simpleText: abbreviatedDislikes
                },
                label: {
                    simpleText: locale.general.dislikes
                }
            }
        })

        if (likesEngagement.button?.likeButtonRenderer) {
            likesEngagement.button.likeButtonRenderer.dislikeCountText.simpleText = abbreviatedDislikes;
            likesEngagement.button.likeButtonRenderer.dislikeCountWithUndislikeText.simpleText = abbreviatedDislikes;
        }

        return JSON.stringify(json);
    })
}
},
"/src/preload/modules/settings/dom.js": function(module, exports, require, __filename, __dirname){
//shared element builders for the settings overlay

const functions = require('../../util/functions')

const el = functions.el;

//a single on/off toggle switch bound to a config key
function createToggle(configKey, on) {
    return el('div', { className: `vt-toggle ${on ? 'vt-toggle-on' : ''}`, dataConfig: configKey }, [
        el('div', { className: 'vt-toggle-track' }, [
            el('div', { className: 'vt-toggle-thumb' })
        ])
    ]);
}

//a standard "title + description + toggle" settings row
function createSettingItem(configKey, title, description, on, focused = false) {
    return el('div', {
        className: `vt-setting-item ${focused ? 'vt-item-focused' : ''}`,
        dataSetting: configKey,
        dataIndex: '0'
    }, [
        el('div', { className: 'vt-setting-info' }, [
            el('span', { className: 'vt-setting-title', textContent: title }),
            el('span', { className: 'vt-setting-description', textContent: description })
        ]),
        el('div', { className: 'vt-setting-control' }, [
            createToggle(configKey, on)
        ])
    ]);
}

//a tab in the left-hand tab strip
function createTab(id, label, index, selected = false) {
    return el('div', {
        className: `vt-tab ${selected ? 'vt-tab-selected' : ''}`,
        dataTab: id,
        dataIndex: String(index)
    }, [
        el('span', { className: 'vt-tab-label', textContent: label })
    ]);
}

module.exports = {
    el,
    createToggle,
    createSettingItem,
    createTab
}
},
"/src/preload/modules/settings/index.js": function(module, exports, require, __filename, __dirname){
/*
notes for adding a new setting:

a plain on/off setting: add it to the `tabs` array as { id: (config key), hide?: (hide condition) }
the config and locale key should all match up with the id
hide can be used to make a setting conditional / platform specific

a setting with its own interface (a custom panel rather than a single toggle):
write a panel module under ./panels/ and add it to the `panelModules` array below
a panel module exports:
    id            - matches the tabs array entry
    init(ctx)     - optional, receives { locale }
    render()      - returns the panel's dom
    onShow()      - optional, called when the overlay opens or the tab is selected
    onFocusItem(el) - optional, called with the focused content element
    onActivate(el)  - optional, called when a non-setting/non-button item is activated
    setup()       - optional, one-time setup after the overlay dom is injected
    actions       - optional, map of data-action -> async handler for vt-button clicks

this is still a bit annoying to add to outside of boolean options, sorry
*/

const fs = require('fs')
const path = require('path')
const { ipcRenderer } = require('vacuumtube-host')
const configManager = require('../../config')
const css = require('../../util/css')
const localeProvider = require('../../util/localeProvider')
const functions = require('../../util/functions')
const controller = require('../../util/controller')
const { el, createSettingItem, createTab } = require('./dom')
const { updateViewportScroll, setupTouchScroll } = require('./scroll')

let locale = null; //gets set in exported function
let config = configManager.get()

let overlayVisible = false;
let currentTabIndex = 0;
let currentItemIndex = 0;
let focusArea = 'content' //'tabs', 'content', or 'close'

//settings
let tabs = [
    { id: 'adblock' },
    { id: 'sponsorblock' },
    { id: 'dearrow' },
    { id: 'dislikes' },
    { id: 'remove_super_resolution' },
    { id: 'hide_shorts' },
    { id: 'unlock_resolution' },
    { id: 'h264ify' },
    { id: 'hardware_decoding', hide: !!window.__VACUUMTUBE_XBOX__ },
    { id: 'wayland_hdr', hide: process.platform !== 'linux' || !!window.__VACUUMTUBE_XBOX__ },
    { id: 'low_memory_mode', },
    { id: 'fullscreen', hide: !!window.__VACUUMTUBE_XBOX__, func: (value) => ipcRenderer.invoke('set-fullscreen', value) },
    { id: 'no_window_decorations', hide: !!window.__VACUUMTUBE_XBOX__ },
    { id: 'keep_on_top', hide: !!window.__VACUUMTUBE_XBOX__, func: (value) => ipcRenderer.invoke('set-on-top', value) },
    { id: 'pause_on_blur' },
    { id: 'features' },
    { id: 'touch_overlay' },
    { id: 'controller_support' },
    { id: 'device_discoverability' },
    { id: 'mac_permissions', hide: process.platform !== 'darwin' && !window.__VACUUMTUBE_XBOX__ }
]

tabs = tabs.filter(t => !t.hide)

const dynamicFunction = {}
for (let item of tabs) {
    if (item.func) {
        dynamicFunction[item.id] = item.func;
    }
}

//custom panels (settings with their own interface instead of a single toggle), keyed by tab id
const panelModules = [
    require('./panels/features'),
    require('./panels/h264ify'),
    require('./panels/mac-permissions')
]

const panels = {}
for (const panel of panelModules) {
    panels[panel.id] = panel;
}

function createOverlayDOM() {
    const settingsTabs = tabs.map((tab, i) =>
        createTab(tab.id, locale.settings[tab.id].title, i, i === 0)
    )

    const settingsContent = tabs.map((tab, i) => {
        const panel = panels[tab.id]
        const content = panel
            ? panel.render()
            : createSettingItem(tab.id, locale.settings[tab.id].title, locale.settings[tab.id].description, config[tab.id], true)

        return el('div', { className: `vt-content-panel${i === 0 ? ' vt-panel-active' : ''}`, dataPanel: tab.id }, [
            content
        ]);
    })

    //building the overlay structure
    return el('div', {
        id: 'vt-settings-overlay-root',
        className: 'vt-settings-hidden',
        tabindex: '-1'
    }, [
        el('div', {
            className: 'vt-settings-backdrop'
        }),
        el('div', {
            className: 'vt-settings-container'
        }, [
            el('div', { className: 'vt-settings-header' }, [
                el('span', { className: 'vt-settings-title', textContent: locale.settings.generic.title }),
                el('span', { className: 'vt-settings-hint', textContent: locale.settings.generic.hint }),
                el('div', { className: 'vt-settings-close', dataAction: 'close' }, [
                    el('span', { textContent: '✕' })
                ])
            ]),
            el('div', { className: 'vt-settings-body' }, [
                el('div', { className: 'vt-tabs-viewport' }, [
                    el('div', { className: 'vt-settings-tabs', id: 'vt-settings-tabs' }, settingsTabs),
                    el('div', { className: 'vt-scrollbar vt-tabs-scrollbar', id: 'vt-tabs-scrollbar' }, [
                        el('div', { className: 'vt-scrollbar-thumb', id: 'vt-tabs-scrollbar-thumb' })
                    ])
                ]),
                // Content for settings pages
                el('div', { className: 'vt-settings-content' }, settingsContent)
            ])
        ])
    ]);
}

function getOverlay() {
    return document.getElementById('vt-settings-overlay-root');
}

//returns the active content panel's dom element
function getActivePanelElement() {
    return getOverlay()?.querySelector('.vt-content-panel.vt-panel-active') || null;
}

//returns the panel module for the active tab, or undefined for a plain toggle tab
function getActivePanel() {
    const panelElement = getActivePanelElement()
    return panelElement ? panels[panelElement.dataset.panel] : undefined;
}

function showOverlay() {
    const overlay = getOverlay()

    overlayVisible = Date.now()
    overlay.classList.remove('vt-settings-hidden')
    overlay.style.opacity = '1'
    overlay.style.pointerEvents = 'auto'
    overlay.focus()

    for (let panel of panelModules) {
        panel.onShow?.()
    }

    currentTabIndex = 0;
    currentItemIndex = 0;
    updateFocus('content')
}

function hideOverlay() {
    const overlay = getOverlay()
    if (!overlay) return;

    overlayVisible = false;
    overlay.classList.add('vt-settings-hidden')
    overlay.style.opacity = '0'
    overlay.style.pointerEvents = 'none'
    overlay.blur() //unfocus
}

function updateFocus(area) {
    const overlay = getOverlay()
    if (!overlay) return;

    overlay.querySelectorAll('.vt-tab-focused, .vt-item-focused, .vt-close-focused').forEach((node) => {
        node.classList.remove('vt-tab-focused', 'vt-item-focused', 'vt-close-focused')
    })

    focusArea = area;

    if (area === 'tabs') {
        const tab = overlay.querySelector(`.vt-tab[data-index="${currentTabIndex}"]`)
        if (tab) {
            tab.classList.add('vt-tab-focused')
            updateViewportScroll('.vt-tabs-viewport', '#vt-settings-tabs', tab, '#vt-tabs-scrollbar-thumb')
        }
    } else if (area === 'content') {
        const panel = getActivePanelElement()
        if (panel) {
            const focusedElement =
                panel.querySelector(`.vt-setting-item[data-index="${currentItemIndex}"]`)
                || panel.querySelector(`.vt-button[data-index="${currentItemIndex}"]`)

            if (focusedElement) {
                focusedElement.classList.add('vt-item-focused')
                panels[panel.dataset.panel]?.onFocusItem?.(focusedElement)
            }
        }
    } else if (area === 'close') {
        const closeBtn = overlay.querySelector('.vt-settings-close')
        if (closeBtn) closeBtn.classList.add('vt-close-focused')
    }
}

function selectTab(index) {
    const overlay = getOverlay()
    if (!overlay) return;

    currentTabIndex = index;
    currentItemIndex = 0;

    overlay.querySelectorAll('.vt-tab').forEach(tab => {
        tab.classList.remove('vt-tab-selected')
    })

    const selectedTab = overlay.querySelector(`.vt-tab[data-index="${index}"]`)
    if (!selectedTab) return;

    selectedTab.classList.add('vt-tab-selected')
    const tabId = selectedTab.dataset.tab

    overlay.querySelectorAll('.vt-content-panel').forEach(panel => {
        panel.classList.remove('vt-panel-active')
    })

    const activePanel = overlay.querySelector(`.vt-content-panel[data-panel="${tabId}"]`)
    if (activePanel) activePanel.classList.add('vt-panel-active')

    panels[tabId]?.onShow?.()
}

function toggleSetting(configKey) {
    const newValue = !config[configKey]
    configManager.set({ [configKey]: newValue })
    config = configManager.get()

    const overlay = getOverlay()
    if (overlay) {
        const toggle = overlay.querySelector(`.vt-toggle[data-config="${configKey}"]`)
        if (toggle) {
            toggle.classList.toggle('vt-toggle-on', newValue)
        }
    }

    if (dynamicFunction[configKey]) {
        dynamicFunction[configKey](newValue)
    }
}

//runs a vt-button's data-action against the active panel's action handlers
async function handleButtonAction(action) {
    const handler = getActivePanel()?.actions?.[action]
    if (!handler) return;

    try {
        await handler()
    } catch (err) {
        console.error(`[Settings Overlay] Failed to run button action ${action}:`, err)
    }
}

//activates whatever content item is currently focused
function activateFocusedItem() {
    const panel = getActivePanelElement()
    if (!panel) return;

    const focused = panel.querySelector('.vt-item-focused')
    if (!focused) return;

    if (focused.classList.contains('vt-setting-item')) {
        if (focused.classList.contains('vt-setting-item-inactive')) return;
        if (focused.dataset.setting) toggleSetting(focused.dataset.setting)
    } else if (focused.classList.contains('vt-button')) {
        handleButtonAction(focused.dataset.action)
    } else {
        panels[panel.dataset.panel]?.onActivate?.(focused)
    }
}

function getItemCount() {
    const panel = getActivePanelElement()
    if (!panel) return 0;

    const settingItems = panel.querySelectorAll('.vt-setting-item').length;
    const buttons = panel.querySelectorAll('.vt-button').length;

    return settingItems + buttons;
}

function handleKeyDown(e) {
    if (!overlayVisible) return;

    const key = e.key;

    //handle escape/back
    if (key === 'Escape' || key === 'Backspace') {
        e.preventDefault()
        e.stopPropagation()
        hideOverlay()
        return;
    }

    //handle navigation
    if (key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        if (focusArea === 'tabs') {
            if (currentTabIndex > 0) {
                currentTabIndex--;
                selectTab(currentTabIndex) //immediately switch tab
                updateFocus('tabs')
            }
        } else if (focusArea === 'content') {
            if (currentItemIndex > 0) {
                currentItemIndex--;
                updateFocus('content')
            } else {
                //move to close button when at top of content
                focusArea = 'close'
                updateFocus('close')
            }
        }
    } else if (key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        if (focusArea === 'close') {
            //move from close button to content
            focusArea = 'content'
            currentItemIndex = 0;
            updateFocus('content')
        } else if (focusArea === 'tabs') {
            if (currentTabIndex < tabs.length - 1) {
                currentTabIndex++;
                selectTab(currentTabIndex)
                updateFocus('tabs')
            }
        } else if (focusArea === 'content') {
            const maxIndex = getItemCount() - 1;
            if (currentItemIndex < maxIndex) {
                currentItemIndex++;
                updateFocus('content')
            }
        }
    } else if (key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        if (focusArea !== 'close') {
            focusArea = 'tabs'
            updateFocus('tabs')
        }
    } else if (key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        if (focusArea === 'tabs') {
            focusArea = 'content'
            updateFocus('content')
        } else if (focusArea === 'content') {
            //move to close button from content
            focusArea = 'close'
            updateFocus('close')
        }
    } else if (key === 'Enter' || key === ' ') {
        e.preventDefault()
        e.stopPropagation()
        if (focusArea === 'close') {
            hideOverlay()
        } else if (focusArea === 'tabs') {
            focusArea = 'content'
            updateFocus('content')
        } else if (focusArea === 'content') {
            activateFocusedItem()
        }
    }
}

const gamepadKeyMap = {
    0: 'Enter',        //a
    1: 'Escape',       //b
    12: 'ArrowUp',     //dpad up
    13: 'ArrowDown',   //dpad down
    14: 'ArrowLeft',   //dpad left
    15: 'ArrowRight',  //dpad right

    1012: 'ArrowUp',   //left stick up
    1014: 'ArrowDown', //left stick down
    1011: 'ArrowLeft', //left stick left
    1013: 'ArrowRight' //left stick right
}

function setupEventListeners() {
    //global hotkey to toggle settings (Ctrl+O)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'o') {
            e.preventDefault()
            e.stopPropagation()
            toggleSettingsOverlay()
            return;
        }
    }, true)

    //keyboard events
    //block ALL keyboard input when overlay is visible to prevent leanback from receiving it
    document.addEventListener('keydown', (e) => {
        if (overlayVisible) {
            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()
            handleKeyDown(e)
        }
    }, true)

    //block keyup events to prevent leanback from seeing them
    document.addEventListener('keyup', (e) => {
        if (overlayVisible) {
            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()
        }
    }, true)

    //mouse/touch events for the overlay
    document.addEventListener('click', (e) => {
        if ((Date.now() - overlayVisible) < 100) return;

        const overlay = getOverlay()
        if (!overlay) return;

        //click on backdrop to close
        if (e.target.classList.contains('vt-settings-backdrop')) {
            hideOverlay()
            return;
        }

        const closeBtn = e.target.closest('.vt-settings-close')
        if (closeBtn) {
            hideOverlay()
            return;
        }

        const tab = e.target.closest('.vt-tab')
        if (tab) {
            const index = parseInt(tab.dataset.index)
            selectTab(index)
            focusArea = 'content'
            updateFocus('content')

            return;
        }

        const item = e.target.closest('.vt-setting-item')
        if (item) {
            if (item.classList.contains('vt-setting-item-inactive')) return;
            const configKey = item.dataset.setting;
            if (configKey) toggleSetting(configKey)
            return;
        }

        const button = e.target.closest('.vt-button')
        if (button) {
            handleButtonAction(button.dataset.action)
            return;
        }
    }, true)

    controller.on('down', (e) => {
        if ((Date.now() - overlayVisible) < 100) return;

        let key = gamepadKeyMap[e.code]
        if (key) {
            handleKeyDown({ key, preventDefault: () => {}, stopPropagation: () => {} })
        }
    })
}

function openSettingsOverlay() {
    let isKids = window.ytcfg.data_.INNERTUBE_CLIENT_NAME === 'TVHTML5_FOR_KIDS'
    if (isKids) return;

    showOverlay()
}

function toggleSettingsOverlay() {
    if (overlayVisible) {
        hideOverlay()
    } else {
        let isKids = window.ytcfg.data_.INNERTUBE_CLIENT_NAME === 'TVHTML5_FOR_KIDS'
        if (isKids) return;

        showOverlay()
    }
}

module.exports = async () => {
    await localeProvider.waitUntilAvailable()
    await functions.waitForCondition(() => !!document.body)

    locale = localeProvider.getLocale()

    //let custom panels grab what they need
    for (const panel of panelModules) {
        panel.init?.({ locale })
    }

    //inject settings css
    const cssPath = path.join(__dirname, 'style.css')
    const text = fs.readFileSync(cssPath, 'utf-8')

    css.inject('settings', text)

    //create overlay
    const overlayElement = createOverlayDOM()
    document.body.appendChild(overlayElement)

    //setup touch scrolling for the tab strip, then let panels set up their own viewports
    setupTouchScroll('.vt-tabs-viewport', '#vt-settings-tabs', '#vt-tabs-scrollbar-thumb')
    for (const panel of panelModules) {
        panel.setup?.()
    }

    //setup event listeners
    setupEventListeners()

    ipcRenderer.on('config-update', (event, newConfig) => {
        config = newConfig;
        const overlay = getOverlay()
        if (overlay) {
            overlay.querySelectorAll('.vt-toggle').forEach(toggle => {
                const configKey = toggle.dataset.config;
                if (configKey && config[configKey] !== undefined) {
                    toggle.classList.toggle('vt-toggle-on', config[configKey])
                }
            })

            for (const panel of panelModules) {
                panel.onConfigUpdate?.(config)
            }
        }
    })

    window.vtOpenSettingsOverlay = openSettingsOverlay;
    window.vtToggleSettingsOverlay = toggleSettingsOverlay;
}

module.exports.openSettingsOverlay = openSettingsOverlay;

},
"/src/preload/modules/settings/panels/features.js": function(module, exports, require, __filename, __dirname){
const { el, createSettingItem } = require('../dom')
const scroll = require('../scroll')
const configManager = require('../../../config')

const viewport = scroll.bindViewport('features')

let locale = null;

function updateFeatureState(config = configManager.get()) {
    const root = document.querySelector('.vt-content-panel[data-panel="features"]')
    if (!root) return;

    const musicModeItem = root.querySelector('.vt-setting-item[data-setting="music_mode_feature"]')
    if (!musicModeItem) return;

    const enabled = config.features_enabled === true;
    musicModeItem.classList.toggle('vt-setting-item-inactive', !enabled)
    musicModeItem.setAttribute('aria-disabled', enabled ? 'false' : 'true')
}

module.exports = {
    id: 'features',

    init(ctx) {
        locale = ctx.locale
    },

    render() {
        const config = configManager.get()
        const enableFeaturesItem = createSettingItem(
            'features_enabled',
            locale.settings.features.enable_title,
            locale.settings.features.enable_description,
            config.features_enabled,
            true
        )
        const musicModeItem = createSettingItem(
            'music_mode_feature',
            locale.settings.features.music_mode_title,
            locale.settings.features.music_mode_description,
            config.music_mode_feature
        )

        musicModeItem.dataset.index = '1';
        musicModeItem.classList.toggle('vt-setting-item-inactive', config.features_enabled !== true)
        musicModeItem.setAttribute('aria-disabled', config.features_enabled === true ? 'false' : 'true')

        return el('div', { className: 'vt-features-section' }, [
            el('div', { className: 'vt-features-viewport' }, [
                el('div', { className: 'vt-features-list', id: 'vt-features-list' }, [
                    el('div', { className: 'vt-features-notice' }, [
                        el('span', {
                            className: 'vt-features-notice-icon',
                            textContent: '!',
                            ariaHidden: 'true'
                        }),
                        el('div', { className: 'vt-features-notice-copy' }, [
                            el('span', {
                                className: 'vt-features-notice-title',
                                textContent: locale.settings.features.notice_title
                            }),
                            el('p', {
                                className: 'vt-features-notice-description',
                                textContent: locale.settings.features.notice_description
                            })
                        ])
                    ]),
                    enableFeaturesItem,
                    musicModeItem
                ]),
                el('div', { className: 'vt-scrollbar', id: 'vt-features-scrollbar' }, [
                    el('div', {
                        className: 'vt-scrollbar-thumb',
                        id: 'vt-features-scrollbar-thumb'
                    })
                ])
            ])
        ])
    },

    setup() {
        viewport.setup()
    },

    onShow() {
        viewport.reset()
        updateFeatureState()
    },

    onFocusItem(element) {
        viewport.scrollTo(element)
    },

    onConfigUpdate(config) {
        updateFeatureState(config)
    }
}

},
"/src/preload/modules/settings/panels/h264ify.js": function(module, exports, require, __filename, __dirname){
const { el, createToggle } = require('../dom')
const scroll = require('../scroll')
const configManager = require('../../../config')

const viewport = scroll.bindViewport('h264ify')

let locale = null;

function getConfig() {
    return configManager.get()
}

function updateInactiveState() {
    const root = document.querySelector('.vt-content-panel[data-panel="h264ify"]')
    if (!root) return;

    const isEnabled = !!getConfig().h264ify

    root.querySelectorAll('.vt-setting-item[data-h264ify-codec="true"]').forEach((item) => {
        item.classList.toggle('vt-setting-item-inactive', !isEnabled)
        item.setAttribute('aria-disabled', isEnabled ? 'false' : 'true')
    })
}

module.exports = {
    id: 'h264ify',

    init(ctx) {
        locale = ctx.locale
    },

    render() {
        const config = getConfig()

        return el('div', { className: 'vt-h264ify-section' }, [
            el('div', { className: 'vt-h264ify-viewport' }, [
                el('div', { className: 'vt-h264ify-list', id: 'vt-h264ify-list' }, [
                    el('div', {
                        className: 'vt-setting-item',
                        dataSetting: 'h264ify',
                        dataIndex: '0'
                    }, [
                        el('div', { className: 'vt-setting-info' }, [
                            el('span', { className: 'vt-setting-title', textContent: locale.settings.h264ify.enable_title }),
                            el('span', { className: 'vt-setting-description', textContent: locale.settings.h264ify.enable_description })
                        ]),
                        el('div', { className: 'vt-setting-control' }, [
                            createToggle('h264ify', config.h264ify)
                        ])
                    ]),
                    el('div', {
                        className: `vt-setting-item ${config.h264ify ? '' : 'vt-setting-item-inactive'}`.trim(),
                        dataSetting: 'h264ify_disable_webm',
                        dataH264ifyCodec: 'true',
                        dataIndex: '1',
                        ariaDisabled: config.h264ify ? 'false' : 'true'
                    }, [
                        el('div', { className: 'vt-setting-info' }, [
                            el('span', { className: 'vt-setting-title', textContent: locale.settings.h264ify.disable_codec_title.replaceAll('{codec}', 'WebM') }),
                            el('span', { className: 'vt-setting-description', textContent: locale.settings.h264ify.disable_codec_description.replaceAll('{codec}', 'WebM') })
                        ]),
                        el('div', { className: 'vt-setting-control' }, [
                            createToggle('h264ify_disable_webm', config.h264ify_disable_webm)
                        ])
                    ]),
                    el('div', {
                        className: `vt-setting-item ${config.h264ify ? '' : 'vt-setting-item-inactive'}`.trim(),
                        dataSetting: 'h264ify_disable_vp8',
                        dataH264ifyCodec: 'true',
                        dataIndex: '2',
                        ariaDisabled: config.h264ify ? 'false' : 'true'
                    }, [
                        el('div', { className: 'vt-setting-info' }, [
                            el('span', { className: 'vt-setting-title', textContent: locale.settings.h264ify.disable_codec_title.replaceAll('{codec}', 'VP8') }),
                            el('span', { className: 'vt-setting-description', textContent: locale.settings.h264ify.disable_codec_description.replaceAll('{codec}', 'VP8') })
                        ]),
                        el('div', { className: 'vt-setting-control' }, [
                            createToggle('h264ify_disable_vp8', config.h264ify_disable_vp8)
                        ])
                    ]),
                    el('div', {
                        className: `vt-setting-item ${config.h264ify ? '' : 'vt-setting-item-inactive'}`.trim(),
                        dataSetting: 'h264ify_disable_vp9',
                        dataH264ifyCodec: 'true',
                        dataIndex: '3',
                        ariaDisabled: config.h264ify ? 'false' : 'true'
                    }, [
                        el('div', { className: 'vt-setting-info' }, [
                            el('span', { className: 'vt-setting-title', textContent: locale.settings.h264ify.disable_codec_title.replaceAll('{codec}', 'VP9') }),
                            el('span', { className: 'vt-setting-description', textContent: locale.settings.h264ify.disable_codec_description.replaceAll('{codec}', 'VP9') })
                        ]),
                        el('div', { className: 'vt-setting-control' }, [
                            createToggle('h264ify_disable_vp9', config.h264ify_disable_vp9)
                        ])
                    ]),
                    el('div', {
                        className: `vt-setting-item ${config.h264ify ? '' : 'vt-setting-item-inactive'}`.trim(),
                        dataSetting: 'h264ify_disable_av1',
                        dataH264ifyCodec: 'true',
                        dataIndex: '4',
                        ariaDisabled: config.h264ify ? 'false' : 'true'
                    }, [
                        el('div', { className: 'vt-setting-info' }, [
                            el('span', { className: 'vt-setting-title', textContent: locale.settings.h264ify.disable_codec_title.replaceAll('{codec}', 'AV1') }),
                            el('span', { className: 'vt-setting-description', textContent: locale.settings.h264ify.disable_codec_description.replaceAll('{codec}', 'AV1') })
                        ]),
                        el('div', { className: 'vt-setting-control' }, [
                            createToggle('h264ify_disable_av1', config.h264ify_disable_av1)
                        ])
                    ])
                ]),
                el('div', { className: 'vt-scrollbar', id: 'vt-h264ify-scrollbar' }, [
                    el('div', { className: 'vt-scrollbar-thumb', id: 'vt-h264ify-scrollbar-thumb' })
                ])
            ])
        ])
    },

    setup() {
        viewport.setup()
    },

    onShow() {
        viewport.reset()
        updateInactiveState()
    },

    onFocusItem(element) {
        viewport.scrollTo(element)
    },

    onConfigUpdate(config) {
        if (!config) return;

        if (config.h264ify === undefined) return;

        updateInactiveState()
    }
}

},
"/src/preload/modules/settings/panels/mac-permissions.js": function(module, exports, require, __filename, __dirname){
//panel for macOS permissions

const { ipcRenderer } = require('vacuumtube-host')
const { el } = require('../dom')
const scroll = require('../scroll')

const viewport = scroll.bindViewport('permissions')

let locale = null;
let microphonePermissionStatus = 'unknown'

function getLabel(status) {
    return locale.settings.mac_permissions.statuses[status] || locale.settings.mac_permissions.statuses.unknown || status;
}

function formatStatus(status) {
    return `${locale.settings.mac_permissions.status_label}: ${getLabel(status)}`;
}

function setStatus(status) {
    microphonePermissionStatus = status || 'unknown'

    const statusElement = document.getElementById('vt-microphone-status')
    if (!statusElement) return;

    statusElement.textContent = formatStatus(microphonePermissionStatus)
    statusElement.dataset.status = microphonePermissionStatus;
}

function setLoading() {
    const statusElement = document.getElementById('vt-microphone-status')
    if (!statusElement) return;

    statusElement.textContent = locale.settings.mac_permissions.status_loading;
    delete statusElement.dataset.status;
}

function setMessage(message, type = 'info') {
    const messageElement = document.getElementById('vt-microphone-message')
    if (!messageElement) return;

    messageElement.textContent = message || ''
    messageElement.dataset.type = type;
}

function setRequestMessage(status) {
    if (status === 'granted') {
        setMessage(locale.settings.mac_permissions.request_granted, 'success')
    } else if (status === 'not-determined') {
        setMessage(locale.settings.mac_permissions.request_not_determined, 'warning')
    } else if (status === 'denied' || status === 'restricted') {
        setMessage(locale.settings.mac_permissions.request_denied_help, 'warning')
    } else {
        setMessage(locale.settings.mac_permissions.request_failed, 'warning')
    }
}

async function refresh() {
    if (process.platform !== 'darwin' && !window.__VACUUMTUBE_XBOX__) return;

    const statusElement = document.getElementById('vt-microphone-status')
    if (!statusElement) return;

    setLoading()

    try {
        setStatus(await ipcRenderer.invoke('get-microphone-permission-status'))
    } catch (err) {
        console.error('[Settings Overlay] Failed to load microphone permission status:', err)
        setStatus('unknown')
    }
}

module.exports = {
    id: 'mac_permissions',

    init(ctx) {
        locale = ctx.locale;
    },

    render() {
        //description + status card are a fixed header, only the action buttons scroll
        return el('div', { className: 'vt-permissions-section' }, [
            el('p', { className: 'vt-permissions-description', textContent: locale.settings.mac_permissions.description }),
            el('div', { className: 'vt-permission-card' }, [
                el('div', { className: 'vt-setting-info' }, [
                    el('span', { className: 'vt-setting-title', textContent: locale.settings.mac_permissions.microphone_title }),
                    el('span', { className: 'vt-setting-description', textContent: locale.settings.mac_permissions.microphone_description }),
                    el('span', {
                        className: 'vt-permission-status',
                        id: 'vt-microphone-status',
                        textContent: formatStatus(microphonePermissionStatus)
                    }),
                    el('span', {
                        className: 'vt-permission-note',
                        textContent: locale.settings.mac_permissions.restart_required
                    }),
                    el('span', {
                        className: 'vt-permission-message',
                        id: 'vt-microphone-message'
                    })
                ])
            ]),
            el('div', { className: 'vt-permissions-viewport' }, [
                el('div', { className: 'vt-permissions-list', id: 'vt-permissions-list' }, [
                    el('div', { className: 'vt-button', dataAction: 'request-microphone-permission', dataIndex: '0' }, [
                        el('span', { textContent: locale.settings.mac_permissions.request_microphone })
                    ]),
                    el('div', { className: 'vt-button', dataAction: 'open-microphone-privacy-settings', dataIndex: '1' }, [
                        el('span', { textContent: locale.settings.mac_permissions.open_microphone_settings })
                    ]),
                    ...(!window.__VACUUMTUBE_XBOX__ ? [
                        el('div', { className: 'vt-button', dataAction: 'reset-microphone-permission', dataIndex: '2' }, [
                            el('span', { textContent: locale.settings.mac_permissions.reset_microphone })
                        ]),
                        el('div', { className: 'vt-button', dataAction: 'relaunch-app', dataIndex: '3' }, [
                            el('span', { textContent: locale.settings.mac_permissions.relaunch_app })
                        ])
                    ] : [])
                ]),
                el('div', { className: 'vt-scrollbar', id: 'vt-permissions-scrollbar' }, [
                    el('div', { className: 'vt-scrollbar-thumb', id: 'vt-permissions-scrollbar-thumb' })
                ])
            ])
        ]);
    },

    setup() {
        viewport.setup()
    },

    onShow() {
        viewport.reset()
        refresh()
    },

    onFocusItem(element) {
        viewport.scrollTo(element)
    },

    actions: {
        'request-microphone-permission': async () => {
            setLoading()
            setMessage('')

            try {
                const status = await ipcRenderer.invoke('request-microphone-permission')
                setStatus(status)
                setRequestMessage(status)
            } catch (err) {
                console.error('[Settings Overlay] Failed to request microphone permission:', err)
                setStatus('unknown')
            }
        },
        'reset-microphone-permission': async () => {
            setLoading()
            setMessage(locale.settings.mac_permissions.resetting_microphone)

            await ipcRenderer.invoke('reset-microphone-permission')
            const status = await ipcRenderer.invoke('request-microphone-permission')
            setStatus(status)
            setRequestMessage(status)
        },
        'open-microphone-privacy-settings': async () => {
            await ipcRenderer.invoke('open-microphone-privacy-settings')
        },
        'relaunch-app': async () => {
            await ipcRenderer.invoke('relaunch-app')
        }
    }
}
},
"/src/preload/modules/settings/scroll.js": function(module, exports, require, __filename, __dirname){
//transform-based scrolling for the settings overlay's viewports
//used instead of native scrolling to bypass leanback's scroll interception

const scrollOffsets = {}

function resolve(selector) {
    return document.querySelector(selector) || document.getElementById(selector.replace('#', ''));
}

function updateScrollbar(viewport, list, scrollOffset, thumbSelector) {
    if (!thumbSelector) return;

    const thumb = resolve(thumbSelector)
    const scrollbar = thumb?.parentElement;
    if (!thumb || !scrollbar) return;

    const viewportHeight = viewport.clientHeight;
    const listHeight = list.scrollHeight;

    //hide scrollbar if content fits
    if (listHeight <= viewportHeight) {
        scrollbar.classList.remove('vt-scrollbar-visible')
        return;
    }

    scrollbar.classList.add('vt-scrollbar-visible')

    //calculate thumb size (proportional to visible area)
    const thumbHeight = Math.max(30, (viewportHeight / listHeight) * viewportHeight)
    thumb.style.height = `${thumbHeight}px`

    //calculate thumb position
    const maxScroll = listHeight - viewportHeight;
    const scrollPercent = maxScroll > 0 ? scrollOffset / maxScroll : 0;
    const maxThumbTop = viewportHeight - thumbHeight;
    const thumbTop = scrollPercent * maxThumbTop;

    thumb.style.transform = `translateY(${thumbTop}px)`
}

/**
 * Updates transform-based scrolling for a viewport/list pair, scrolling the
 * focused element into view.
 *
 * @param {string} viewportSelector - CSS selector for the viewport (overflow:hidden container)
 * @param {string} listSelector - CSS selector or id for the scrollable list inside viewport
 * @param {HTMLElement} focusedElement - The element to scroll into view
 * @param {string} [scrollbarThumbSelector] - Optional CSS selector for custom scrollbar thumb
 */
function updateViewportScroll(viewportSelector, listSelector, focusedElement, scrollbarThumbSelector) {
    const viewport = document.querySelector(viewportSelector)
    const list = resolve(listSelector)
    if (!list || !viewport) return;

    const scrollId = listSelector;

    if (scrollOffsets[scrollId] === undefined) {
        scrollOffsets[scrollId] = 0;
    }

    if (!list.contains(focusedElement)) {
        list.style.transform = 'translateY(0px)'
        scrollOffsets[scrollId] = 0;
        updateScrollbar(viewport, list, 0, scrollbarThumbSelector)
        return;
    }

    const viewportHeight = viewport.clientHeight;
    const itemTop = focusedElement.offsetTop;
    const itemHeight = focusedElement.offsetHeight;
    const itemBottom = itemTop + itemHeight;

    if (itemBottom - scrollOffsets[scrollId] > viewportHeight) {
        scrollOffsets[scrollId] = itemBottom - viewportHeight + 10;
    } else if (itemTop < scrollOffsets[scrollId]) {
        scrollOffsets[scrollId] = Math.max(0, itemTop - 10)
    }

    list.style.transform = `translateY(-${scrollOffsets[scrollId]}px)`
    updateScrollbar(viewport, list, scrollOffsets[scrollId], scrollbarThumbSelector)
}

/**
 * Touch drag scrolling for a viewport/list pair. Call once per viewport after the DOM is ready.
 *
 * @param {string} viewportSelector - CSS selector for the viewport container
 * @param {string} listSelector - CSS selector or id for the scrollable list
 * @param {string} [scrollbarThumbSelector] - Optional CSS selector for scrollbar thumb
 */
function setupTouchScroll(viewportSelector, listSelector, scrollbarThumbSelector) {
    const viewport = document.querySelector(viewportSelector)
    const list = resolve(listSelector)
    if (!viewport || !list) return;

    const scrollId = listSelector;
    let touchStartY = 0;
    let startScrollOffset = 0;
    let isDragging = false;

    viewport.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        touchStartY = e.touches[0].clientY;
        startScrollOffset = scrollOffsets[scrollId] || 0;
        isDragging = true;
        list.style.transition = 'none'
    }, { passive: true })

    viewport.addEventListener('touchmove', (e) => {
        if (!isDragging || e.touches.length !== 1) return;

        const touchY = e.touches[0].clientY;
        const deltaY = touchStartY - touchY;

        const viewportHeight = viewport.clientHeight;
        const listHeight = list.scrollHeight;
        const maxScroll = Math.max(0, listHeight - viewportHeight)

        let newOffset = startScrollOffset + deltaY;
        newOffset = Math.max(0, Math.min(maxScroll, newOffset))

        scrollOffsets[scrollId] = newOffset;
        list.style.transform = `translateY(-${newOffset}px)`
        updateScrollbar(viewport, list, newOffset, scrollbarThumbSelector)
    }, { passive: true })

    const endDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        list.style.transition = ''
    }

    viewport.addEventListener('touchend', endDrag, { passive: true })
    viewport.addEventListener('touchcancel', endDrag, { passive: true })
}

/**
 * Resets the scroll position for a viewport/list pair.
 *
 * @param {string} listSelector - CSS selector or id for the scrollable list
 * @param {string} [scrollbarThumbSelector] - Optional CSS selector for custom scrollbar thumb
 */
function resetViewportScroll(listSelector, scrollbarThumbSelector) {
    const list = resolve(listSelector)
    if (list) {
        list.style.transform = 'translateY(0px)'
    }

    scrollOffsets[listSelector] = 0;

    //reset scrollbar thumb position
    if (scrollbarThumbSelector) {
        const thumb = resolve(scrollbarThumbSelector)
        if (thumb) {
            thumb.style.transform = 'translateY(0px)'
        }
    }
}

/**
 * Binds the scroll helpers to a single named viewport, following the id/class
 * convention `.vt-<name>-viewport` / `#vt-<name>-list` / `#vt-<name>-scrollbar-thumb`.
 * Lets a panel wire up scrolling without repeating selector strings.
 */
function bindViewport(name) {
    const viewport = `.vt-${name}-viewport`
    const list = `#vt-${name}-list`
    const thumb = `#vt-${name}-scrollbar-thumb`

    return {
        setup: () => setupTouchScroll(viewport, list, thumb),
        scrollTo: (element) => updateViewportScroll(viewport, list, element, thumb),
        reset: () => resetViewportScroll(list, thumb)
    };
}

module.exports = {
    updateViewportScroll,
    setupTouchScroll,
    resetViewportScroll,
    bindViewport
}
},
"/src/preload/modules/sponsorblock.js": function(module, exports, require, __filename, __dirname){
const { SponsorBlock } = require('sponsorblock-api')
const ui = require('../util/ui')
const localeProvider = require('../util/localeProvider')
const configManager = require('../config')
const config = configManager.get()

module.exports = async () => {
    await localeProvider.waitUntilAvailable()
    let locale = localeProvider.getLocale()

    let sponsorBlock = new SponsorBlock(config.sponsorblock_uuid)
    let sponsorBlockSegments = []

    let activeVideoId = 0;
    let attachVideoTimeout = null;
    let activeVideo = null;
    const attachToVideo = function () {
        clearTimeout(attachVideoTimeout)
        attachVideoTimeout = null;

        activeVideo = document.querySelector('video')
        if (!activeVideo) {
            attachVideoTimeout = setTimeout(attachToVideo, 100)
            return;
        }

        console.log('[SponsorBlock] Attached to video ID', activeVideoId)

        activeVideo.addEventListener('timeupdate', checkForSponsorSkip)
    }

    const checkForSponsorSkip = function () {
        if (!config.sponsorblock || !activeVideo || sponsorBlockSegments.length === 0) return;

        if (activeVideo.paused) return;

        let matchingSegment = sponsorBlockSegments.filter((v) => {
            // Only skip if at the start of the segment - if the user jumped into the segment
            // they probably want to watch it for whatever reason
            return activeVideo.currentTime > v.startTime
                && activeVideo.currentTime < v.startTime + 2
                && activeVideo.currentTime < v.endTime;
        }).sort((x, y) => x.startTime - y.startTime)

        if (matchingSegment.length === 0) return;

        console.log('[SponsorBlock] Skipping sponsor segment')

        activeVideo.currentTime = matchingSegment[0].endTime;

        ui.toast('VacuumTube', locale.sponsorblock.sponsor_skipped)
    }

    window.addEventListener('hashchange', () => {
        if (!config.sponsorblock) return;

        const pageUrl = new URL(location.hash.substring(1), location.href)

        if (pageUrl.pathname === '/watch') {
            const videoId = pageUrl.searchParams.get('v')

            // TODO: Full SponsorBlock config so you can choose what categories to skip/show
            const categories = ['sponsor']
            sponsorBlock.getSegmentsPrivately(videoId, categories).then((segments) => {
                // Ignore a late response if navigation already moved to another video.
                const currentUrl = new URL(location.hash.substring(1), location.href)
                if (currentUrl.pathname !== '/watch' || currentUrl.searchParams.get('v') !== videoId) return

                sponsorBlockSegments = segments
                activeVideoId = videoId
                attachToVideo()
            }).catch((error) => {
                console.warn('[SponsorBlock] Segment request failed', error)
                sponsorBlockSegments = []
            })
        } else {
            activeVideo = null;
            activeVideoId = 0;
            sponsorBlockSegments = []
            if (attachVideoTimeout != null) {
                clearTimeout(attachVideoTimeout)
                attachVideoTimeout = null;
            }
        }
    })
}
},
"/src/preload/modules/support-webp.js": function(module, exports, require, __filename, __dirname){
//advertise webp support (disabled by default for ps4 ua)

const configOverrides = require('../util/configOverrides')

module.exports = () => {
    configOverrides.ytcfgOverrides.push({
        INNERTUBE_CONTEXT: {
            client: {
                webpSupport: true
            }
        }
    })
}
},
"/src/preload/modules/touch-support.js": function(module, exports, require, __filename, __dirname){
//onscreen touch controls + native scrollbars

const configOverrides = require('../util/configOverrides')
const configManager = require('../config')
const config = configManager.get()

module.exports = () => {
    configOverrides.tectonicConfigOverrides.push({
        featureSwitches: {
            enableTouchSupport: true //native scrollbars
        }
    })

    //fix native scrollbars causing space to jump the page down and break everything
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault()
        }
    })

    window.addEventListener('load', () => {
        const touchKeyCodeMap = {
            'back':   27, //escape
            'select': 13, //enter
            'up':     38,
            'down':   40,
            'left':   37,
            'right':  39
        }

        function simulateKeyDown(keyCode) {
            let event = new Event('keydown')
            event.keyCode = keyCode;
            document.dispatchEvent(event)
        }

        function simulateKeyUp(keyCode) {
            let event = new Event('keyup')
            event.keyCode = keyCode;
            document.dispatchEvent(event)
        }

        let zIndex = 999;
        let controls = document.createElement('div')

        let bottomLeft = document.createElement('div')
        bottomLeft.style.position = 'absolute'
        bottomLeft.style.bottom = '5vh'
        bottomLeft.style.left = '5vh'
        bottomLeft.style.zIndex = zIndex.toString()
        controls.appendChild(bottomLeft)

        let bottomRight = document.createElement('div')
        bottomRight.style.position = 'absolute'
        bottomRight.style.bottom = '5vh'
        bottomRight.style.right = '5vh'
        bottomRight.style.zIndex = zIndex.toString()
        controls.appendChild(bottomRight)

        function createCircularButton(text, keyCode, margin, ytIcon) {
            let button = document.createElement('div')
            button.style.display = 'inline-flex'
            button.style.justifyContent = 'center'
            button.style.alignItems = 'center'
            button.style.width = '10vw'
            button.style.height = '10vw'
            button.style.backgroundColor = '#272727'
            button.style.opacity = '0.9'
            button.style.borderRadius = '50%'
            button.style.color = 'white'
            button.style.fontWeight = 'bold'
            button.style.userSelect = 'none'
            button.style.verticalAlign = 'middle'
            button.style.zIndex = (zIndex + 1).toString()
            button.textContent = text;

            button.addEventListener('touchstart', () => simulateKeyDown(keyCode))
            button.addEventListener('touchend', () => simulateKeyUp(keyCode))

            if (margin) {
                button.style.marginLeft = '1vw'
            }

            if (ytIcon) {
                button.style.fontFamily = 'YouTube Icons Outlined'
                button.style.fontSize = '5vw'
            }

            return button;
        }

        let left = createCircularButton('\ue5de', touchKeyCodeMap.left, true, true)
        bottomLeft.appendChild(left)

        let right = createCircularButton('\ue5df', touchKeyCodeMap.right, true, true)
        bottomLeft.appendChild(right)

        let up = createCircularButton('\ue5de', touchKeyCodeMap.up, true, true)
        up.style.transform = 'rotate(90deg)' //up arrow, youtube icons dont have one
        bottomLeft.appendChild(up)

        let down = createCircularButton('\ue5de', touchKeyCodeMap.down, true, true)
        down.style.transform = 'rotate(-90deg)' //down arrow, youtube icons dont have one
        bottomLeft.appendChild(down)

        let back = createCircularButton('◦', touchKeyCodeMap.back, true)
        back.style.fontSize = '7vw'
        bottomRight.appendChild(back)

        let select = createCircularButton('·', touchKeyCodeMap.select, true)
        select.style.fontSize = '12vw'
        bottomRight.appendChild(select)

        document.body.appendChild(controls)

        let visible = true;
        let lastTouch = 0;

        function hide() {
            controls.style.display = 'none'
            visible = false;
        }

        function show() {
            controls.style.display = ''
            visible = true;
        }

        hide()

        setInterval(() => {
            if (!visible) return;
            if ((Date.now() - lastTouch) >= 3000 || !config.touch_overlay) {
                hide()
            }
        }, 20)

        window.addEventListener('touchstart', (e) => {
            if (!config.touch_overlay) return;

            lastTouch = Date.now()

            if (!visible) {
                e.preventDefault()
                show()
            }
        })
    })
}
},
"/src/preload/modules/voice-privacy-notice.js": function(module, exports, require, __filename, __dirname){
//enables a switch that adds a Microphone Access button to settings, and tells the user about the privacy policy when first enabling it

const configOverrides = require('../util/configOverrides')

module.exports = () => {
    if (process.platform === 'darwin') return;

    configOverrides.tectonicConfigOverrides.push({
        featureSwitches: {
            hasSamsungVoicePrivacyNotice: true
        }
    })
}
},
"/src/preload/modules/volume-control/index.js": function(module, exports, require, __filename, __dirname){
const fs = require('fs')
const path = require('path')
const rcMod = require('../../util/resolveCommandModifiers')
const css = require('../../util/css')
const functions = require('../../util/functions')
const configManager = require('../../config')

const config = configManager.get()

module.exports = async () => {
    const el = functions.el;

    await functions.waitForCondition(() => !!document.body)

    const cssPath = path.join(__dirname, 'style.css')
    const text = fs.readFileSync(cssPath, 'utf-8')

    css.inject('volume-control', text)

    let volume = config.volume || 100;
    let muted = false;
    let volumeTimeout;

    function createVolumeIndicator() {
        return el('div', { id: 'vt-volume-indicator' }, [
            el('div', { id: 'vt-volume-icon', className: 'vt-volume-icon' }),
            el('div', { className: 'vt-volume-bar-container' }, [
                el('div', { id: 'vt-volume-bar', className: 'vt-volume-bar' })
            ]),
            el('span', { id: 'vt-volume-text', className: 'vt-volume-text' })
        ]);
    }

    const volumeIndicatorElement = createVolumeIndicator()
    document.body.appendChild(volumeIndicatorElement)

    function showVolumeIndicator() {
        const indicator = document.getElementById('vt-volume-indicator')
        const bar = document.getElementById('vt-volume-bar')
        const text = document.getElementById('vt-volume-text')
        const icon = document.getElementById('vt-volume-icon')
        if (!indicator || !bar || !text || !icon) return;

        let userFacingVolume = muted ? 0 : volume;

        bar.style.width = `${userFacingVolume}%`
        text.textContent = `${userFacingVolume}%`

        //update icon based on volume level
        if (volume === 0 || muted) {
            icon.className = 'vt-volume-icon vt-volume-muted'
        } else if (volume <= 50) {
            icon.className = 'vt-volume-icon vt-volume-low'
        } else {
            icon.className = 'vt-volume-icon vt-volume-high'
        }

        indicator.classList.add('visible')

        clearTimeout(volumeTimeout)
        volumeTimeout = setTimeout(() => {
            indicator.classList.remove('visible')
        }, 1500)
    }

    function setVolume(interval) {
        if (interval && config.volume !== volume) {
            configManager.set({ volume })
        }

        let players = document.querySelectorAll('.html5-video-player')
        for (let player of players) {
            if (!player?.setVolume) continue;

            if (muted) {
                player.setVolume(0)
            } else {
                player.setVolume(volume)
            }
        }
    }

    function isWatching() {
        let isShort = !!document.querySelector('ytlr-shorts-page')?.classList?.contains('zylon-focus')
        if (isShort) { //very dumb, don't like it, but there doesn't seem to be a better way
            return true;
        } else {
            let baseUri = window.yt?.player?.utils?.videoElement_?.baseURI;
            if (!baseUri || !baseUri.includes('/watch?v=')) return false;

            let id = baseUri.split('/watch?v=')[1]?.slice(0, 11)
            if (!id) return false;

            return true;
        }
    }

    //volume controls
    document.addEventListener('keydown', (e) => {
        const key = e.key || e.keyCode; 
        if (!key || !isWatching()) return;

        const volumeStep = 5;

        if (key === '+' || key === '=' || key === 187) {
            volume = Math.min(100, volume + volumeStep)
        } else if (key === '-' || key === 189) {
            volume = Math.max(0, volume - volumeStep)
        } else if (key === 'm' || key === 'M' || key === 77) {
            muted = !muted;
        } else {
            return;
        }

        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        showVolumeIndicator()
        setVolume()
    }, true)

    //cast allows you to control the volume, but it uses a different (VERY OLD LOOKING) ui, so we hook it up to our new one instead
    rcMod.addInputModifier((c) => {
        if (!c.volumeControlAction) return c;

        let action = c.volumeControlAction;
        let type = action.volumeControlType;

        if (type === 'VOLUME_CONTROL_ACTION_TYPE_MUTE') {
            muted = true;
        } else if (type === 'VOLUME_CONTROL_ACTION_TYPE_UNMUTE') {
            muted = false;
        } else if (type === 'VOLUME_CONTROL_ACTION_TYPE_SET_ABSOLUTE') {
            volume = action.volumeControlValue;
        }

        showVolumeIndicator()
        setVolume()

        return false;
    })

    //player can change sometimes
    setInterval(() => {
        setVolume(true)
    }, 100)
}
},
"/src/preload/util/configOverrides.js": function(module, exports, require, __filename, __dirname){
//helper functions for overriding internal youtube configs (env, ytcfg, window.environment, and tectonicConfig)

const functions = require('./functions')

const ytcfgOverrides = []
const environmentOverrides = []
const tectonicConfigOverrides = []

function overrideEnv(key, value) {
    let params = new URLSearchParams(window.location.search)

    key = String(key)
    value = String(value)

    let existing = params.has(key)
    if (existing) {
        if (value === existing) return;
        params.delete(key)
    }

    params.set(key, value)

    let newUrl = window.location.pathname + '?' + params.toString()
    history.replaceState(null, '', newUrl)
}

let ytcfgInterval = setInterval(() => {
    if (!window.ytcfg) return;
    if (ytcfgOverrides.length === 0) return;

    while (ytcfgOverrides.length > 0) {
        let override = ytcfgOverrides.shift()
        functions.deepMerge(window.ytcfg.data_, override)
        window.ytcfg.set(window.ytcfg.data_)
    }
})

let environmentInterval = setInterval(() => {
    if (!window.environment) return;
    if (environmentOverrides.length === 0) return;

    while (environmentOverrides.length > 0) {
        let override = environmentOverrides.shift()
        functions.deepMerge(window.environment, override)
    }
})

let tectonicConfigInterval = setInterval(() => {
    if (!window.tectonicConfig) return;
    if (tectonicConfigOverrides.length === 0) return;

    while (tectonicConfigOverrides.length > 0) {
        let override = tectonicConfigOverrides.shift()
        functions.deepMerge(window.tectonicConfig, override)
    }
})

module.exports = {
    overrideEnv,
    ytcfgOverrides,
    environmentOverrides,
    tectonicConfigOverrides
}
},
"/src/preload/util/controller.js": function(module, exports, require, __filename, __dirname){
/* Controller abstraction for browser Gamepad API plus Windows.Gaming.Input bridge. */
const { ipcRenderer } = require('vacuumtube-host')
const { EventEmitter } = require('tseep/lib/ee-safe')
const emitter = new EventEmitter()

const buttonRepeatInterval = 100
const buttonRepeatDelay = 500
const pressedButtons = {}
let buttonRepeatTimer = null
let focused = true
let nativeGamepads = []

ipcRenderer.on('focus', () => { focused = true })
ipcRenderer.on('blur', () => { focused = false })
ipcRenderer.on('xbox-gamepad-state', (_event, state) => {
    nativeGamepads = state ? [state] : []
})

requestAnimationFrame(pollGamepads)

function pollGamepads() {
    let gamepads = nativeGamepads
    if (!gamepads.length) {
        try { gamepads = Array.from(navigator.getGamepads?.() || []) } catch { gamepads = [] }
    }

    for (const index in pressedButtons) {
        if (!gamepads.find(gamepad => gamepad && String(gamepad.index) === String(index))) delete pressedButtons[index]
    }

    for (const gamepad of gamepads) {
        if (gamepad?.connected !== false) handleGamepad(gamepad)
    }
    requestAnimationFrame(pollGamepads)
}

function handleGamepad(gamepad) {
    const index = gamepad.index || 0
    if (!pressedButtons[index]) pressedButtons[index] = { buttons: {}, axes: {} }
    const state = pressedButtons[index]

    for (let i = 0; i < (gamepad.buttons || []).length; i++) {
        const button = gamepad.buttons[i]
        const isPressed = typeof button === 'number' ? button > 0.5 : !!button.pressed
        const wasPressed = !!state.buttons[i]
        if (isPressed && !wasPressed) {
            state.buttons[i] = true
            buttonDown(i)
            startRepeat(i)
        } else if (!isPressed && wasPressed) {
            state.buttons[i] = false
            buttonUp(i)
            stopRepeat()
        }
    }

    const axes = gamepad.axes || []
    const axisCodes = [
        [1011, 1013], // left X: negative/positive
        [1012, 1014], // left Y: negative/positive
        [1015, 1017], // right X
        [1016, 1018]  // right Y
    ]

    for (let i = 0; i < Math.min(axes.length, axisCodes.length); i++) {
        const value = axes[i]
        const nextCode = value < -0.5 ? axisCodes[i][0] : value > 0.5 ? axisCodes[i][1] : null
        const previousCode = state.axes[i] || null
        if (nextCode === previousCode) continue
        if (previousCode !== null) buttonUp(previousCode)
        state.axes[i] = nextCode
        stopRepeat()
        if (nextCode !== null) {
            buttonDown(nextCode)
            startRepeat(nextCode)
        }
    }
}

function buttonDown(code) { if (focused) emitter.emit('down', { code }) }
function buttonUp(code) { if (focused && code !== null) emitter.emit('up', { code }) }
function startRepeat(code) {
    stopRepeat()
    buttonRepeatTimer = setTimeout(() => {
        buttonRepeatTimer = setInterval(() => buttonDown(code), buttonRepeatInterval)
    }, buttonRepeatDelay)
}
function stopRepeat() {
    clearTimeout(buttonRepeatTimer)
    clearInterval(buttonRepeatTimer)
    buttonRepeatTimer = null
}

module.exports = emitter

},
"/src/preload/util/css.js": function(module, exports, require, __filename, __dirname){
const functions = require('../util/functions')

let injectedStyles = {}
let ready = false;
let observer;

async function injectStyle(id, text) {
    await functions.waitForCondition(() => ready)

    const styleId = `vt-${id}`

    const existingStyle = document.getElementById(styleId)
    if (existingStyle) {
        existingStyle.remove()
    }

    const style = document.createElement('style')
    style.id = styleId;
    style.type = 'text/css'
    style.textContent = text;

    injectedStyles[id] = style;

    reinjectStylesheets()
}

function deleteStyle(id) {
    const styleId = `vt-${id}`
    const style = document.getElementById(styleId)

    delete injectedStyles[id];

    if (style) {
        style.remove()
    }
}

function reinjectStylesheets() {
    observer.disconnect() //so we don't pick up our own changes

    for (let style of Object.values(injectedStyles)) {
        document.head.appendChild(style) //if it's already in there, it just gets moved to the bottom
    }

    observer.observe(document.head, { childList: true })
}

async function main() {
    await functions.waitForCondition(() => !!document.head)

    observer = new MutationObserver(() => {
        reinjectStylesheets()
    })

    observer.observe(document.head, { childList: true }) //any time a new element is added to head, reinject everything so that stylesheets are constantly taking priority over ones added by youtube

    ready = true;
}

main()

module.exports = {
    inject: injectStyle,
    delete: deleteStyle
}
},
"/src/preload/util/functions.js": function(module, exports, require, __filename, __dirname){
function el(tag, attrs = {}, children = []) {
    const element = document.createElement(tag)
    for (const [ key, value ] of Object.entries(attrs)) {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'textContent') {
            element.textContent = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(element.style, value)
        } else if (key.startsWith('data')) {
            element.setAttribute(key.replace(/([A-Z])/g, '-$1').toLowerCase(), value)
        } else {
            element.setAttribute(key, value)
        }
    }

    for (const child of children) {
        if (child) element.appendChild(child)
    }

    return element;
}

async function waitForSelector(selector) {
    return new Promise((resolve) => {
        let observer = new MutationObserver(() => {
            let el = document.querySelector(selector)
            if (el) {
                resolve(el)
                observer.disconnect()
            }
        })

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        })

        let el = document.querySelector(selector)
        if (el) {
            resolve(el)
            observer.disconnect()
        }
    });
}

async function waitForCondition(func) {
    return await new Promise((resolve) => {
        if (func()) return resolve();

        let interval = setInterval(() => {
            if (!func()) return;

            clearInterval(interval)
            resolve()
        }, 10)
    });
}

function deepMerge(current, updates) {
    for (let key of Object.keys(updates)) {
        if (!current.hasOwnProperty(key) || typeof updates[key] !== 'object') {
            if (updates[key] === '__DELETE__') {
                delete current[key];
            } else {
                current[key] = updates[key]
            }
        } else {
            deepMerge(current[key], updates[key])
        }
    }

    return current;
}

module.exports = {
    el,
    waitForSelector,
    waitForCondition,
    deepMerge
}
},
"/src/preload/util/httpClient.js": function(module, exports, require, __filename, __dirname){
/**
 * Cross-origin request helper for WebView2.
 * Uses the native UWP allowlisted proxy when available, then falls back to fetch.
 */
async function request(url, options = {}) {
    if (globalThis.vacuumTubeHost?.request) {
        const nativeResponse = await globalThis.vacuumTubeHost.request({
            method: options.method || 'GET',
            url: String(url),
            headers: options.headers || { Accept: 'application/json' },
            body: options.body,
            contentType: options.contentType
        })

        const body = typeof nativeResponse?.body === 'string'
            ? nativeResponse.body
            : JSON.stringify(nativeResponse?.body ?? null)

        return {
            ok: nativeResponse.status >= 200 && nativeResponse.status < 300,
            status: Number(nativeResponse.status || 0),
            statusText: nativeResponse.statusText || '',
            headers: nativeResponse.headers || {},
            text: async () => body,
            json: async () => body ? JSON.parse(body) : null
        }
    }

    return fetch(url, options)
}

module.exports = { request }

},
"/src/preload/util/jsonModifiers.js": function(module, exports, require, __filename, __dirname){
//overriding json.parse so that when it parses innertube responses, we can manipulate it to remove ads and similar purposes

const modifiers = []
const jsonParse = JSON.parse;

JSON.parse = (...args) => {
    let json = jsonParse.apply(this, args)

    try {
        if (typeof json === 'object') {
            for (let modifier of modifiers) {
                json = modifier(json)
            }
        }

        return json;
    } catch (err) {
        console.error('a json modifier failed', err)
        return json; //just to be safe, return what we have
    }
}

function addModifier(func) {
    modifiers.push(func)
}

module.exports = {
    addModifier
}
},
"/src/preload/util/localeProvider.js": function(module, exports, require, __filename, __dirname){
const fs = require('fs')
const path = require('path')
const functions = require('./functions')

const localeFolder = path.join(__dirname, '../', '../', '../', 'locale')

let locale;

functions.waitForCondition(() => !!window.ytcfg)
.then(async () => {
    const lang = window.ytcfg.data_.HL;
    const broadLang = lang.split('-')[0]

    const localeFiles = await fs.promises.readdir(localeFolder)

    const baseLocaleStr = await fs.promises.readFile(path.join(localeFolder, 'en.json'), 'utf-8')
    const baseLocale = JSON.parse(baseLocaleStr)

    let langFile = `${lang}.json`
    if (!localeFiles.includes(langFile)) langFile = `${broadLang}.json`
    if (!localeFiles.includes(langFile)) langFile = 'en.json'

    const str = await fs.promises.readFile(path.join(localeFolder, langFile), 'utf-8')
    const partialLocale = JSON.parse(str)

    locale = functions.deepMerge(baseLocale, partialLocale)
})

async function waitUntilAvailable() {
    await functions.waitForCondition(() => !!locale)
}

function getLocale() {
    return locale;
}

module.exports = {
    waitUntilAvailable,
    getLocale
}
},
"/src/preload/util/patchFunction.js": function(module, exports, require, __filename, __dirname){
//generic function patcher

function patchFunction(obj, func, modifier) {
    let originalFunc = obj[func]

    let patched = function(...args) {
        return modifier.call(this, originalFunc, ...args);
    }

    obj[func] = patched;
}

module.exports = patchFunction;
},
"/src/preload/util/resolveCommandModifiers.js": function(module, exports, require, __filename, __dirname){
//overriding youtube's resolveCommand so we can have unlimited power (mainly for hooking into settings and ui)

const inputModifiers = []
const outputModifiers = []

let globalResolveCommand;

let interval = setInterval(() => { //try over and over again to find it (shouldn't take long)
    for (let key in window._yttv) {
        if (window._yttv[key]?.instance?.resolveCommand) {
            let resolveCommand = window._yttv[key].instance.resolveCommand;
            globalResolveCommand = (command) => { //for some reason, this function doesn't work unless i do it like this (instead of just setting it directly to the actual function)
                return window._yttv[key].instance.resolveCommand(command);
            }

            window._yttv[key].instance.resolveCommand = function (command) {
                for (let modifier of inputModifiers) {
                    command = modifier(command)
                    if (command === false) return true; //blocking, doesn't allow internal handler to get to it
                }

                let output = resolveCommand.apply(this, [ command ])

                for (let modifier of outputModifiers) {
                    output = modifier(output)
                }

                return output;
            }

            clearInterval(interval)
            return;
        }
    }
}, 100)

function addInputModifier(func) {
    inputModifiers.push(func)
}

function addOutputModifier(func) {
    outputModifiers.push(func)
}

module.exports = {
    resolveCommand: (command) => {
        if (globalResolveCommand) {
            return globalResolveCommand(command);
        } else {
            throw new Error('resolveCommand doesn\'t exist yet, probably called too early');
        }
    },
    addInputModifier,
    addOutputModifier
}
},
"/src/preload/util/ui.js": function(module, exports, require, __filename, __dirname){
const rcMod = require('./resolveCommandModifiers')

/**
 * Creates a toast in the top right using YouTube UI
 * @param {string} title - The title (top text) of the toast
 * @param {string} subtitle - The subtitle (bottom text) of the toast
 * @returns {void}
 */
function toast(title, subtitle) {
    let toastCommand = {
        openPopupAction: {
            popupType: 'TOAST',
            popup: {
                overlayToastRenderer: {
                    title: {
                        simpleText: title
                    },
                    subtitle: {
                        simpleText: subtitle
                    }
                }
            }
        }
    };

    rcMod.resolveCommand(toastCommand)
}

/**
 * Creates a popup menu configuration object for YouTube UI rendering
 * @param {Object} options - The options for the popup menu
 * @param {string} options.title - The title text to display in the popup header
 * @param {Array} options.items - Array of menu items to display in the popup
 * @param {number} [options.selectedIndex=0] - The index of the initially selected item (defaults to 0)
 * @returns {Object} A nested object structure containing the popup menu configuration
 */
function popupMenu(options) {
    return {
        openPopupAction: {
            popup: {
                overlaySectionRenderer: {
                    dismissalCommand: {
                        signalAction: {
                            signal: 'POPUP_BACK'
                        }
                    },
                    overlay: {
                        overlayTwoPanelRenderer: {
                            actionPanel: {
                                overlayPanelRenderer: {
                                    header: {
                                        overlayPanelHeaderRenderer: {
                                            title: {
                                                simpleText: options.title
                                            }
                                        }
                                    },
                                    content: {
                                        overlayPanelItemListRenderer: {
                                            selectedIndex: options.selectedIndex || 0,
                                            items: options.items,
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    };
}

/**
 * Creates a link object with specified configuration for a compact link renderer
 * @param {Object} options - Configuration options for the link
 * @param {string} options.title - The title text to display for the link
 * @param {string} [options.icon] - Optional icon type to display as secondary icon
 * @param {boolean} [options.closeMenu] - If true, adds a command to close popup menu
 * @param {Function} [options.callback] - Optional callback function to execute when link is clicked
 * @param {Function} [options.createSubMenu] - Optional function that returns submenu configuration
 * @returns {Object} Link configuration object with compactLinkRenderer structure
 */
function link(options) {
    return {
        compactLinkRenderer: {
            title: {
                simpleText: options.title
            },
            secondaryIcon: options.icon ? { iconType: options.icon } : undefined,
            serviceEndpoint: {
                commandExecutorCommand: {
                    get commands() {
                        return [
                            options.closeMenu
                                ? {
                                    signalAction: {
                                        signal: 'POPUP_BACK'
                                    }
                                }
                                : undefined,
                            options.callback
                                ? {
                                    signalAction: {
                                        get signal() {
                                            options.callback()
                                            return 'UNKNOWN';
                                        }
                                    }
                                }
                                : undefined,
                            options.createSubMenu
                                ? options.createSubMenu()
                                : undefined
                        ].filter(Boolean)
                    }
                }
            }
        }
    };
}

module.exports = {
    toast,
    popupMenu,
    link
}
},
"/src/preload/util/xhrModifiers.js": function(module, exports, require, __filename, __dirname){
//overrides xmlhttprequest to be able to modify responses, used for dearrow support (the benefit to this over jsonModifiers is that since you're doing it from the response itself, you can use async stuff)

const functions = require('./functions')

const responseModifiers = []
const requestModifiers = []
const OriginalXMLHttpRequest = window.XMLHttpRequest;

let blocked = false;

window.XMLHttpRequest = function () { //i've lost track of what's going on in here at this point, but it works
    const xhr = new OriginalXMLHttpRequest()
    const originalOpen = xhr.open;
    const originalSend = xhr.send;

    xhr.open = async function (method, url) {
        this._method = method;
        this._url = url;

        if (blocked) {
            await functions.waitForCondition(() => !blocked)
        }

        return originalOpen.apply(this, arguments);
    }

    xhr.send = async function (body) {
        if (blocked) {
            await functions.waitForCondition(() => !blocked)
        }

        for (let modifier of requestModifiers) {
            try {
                let modified = await modifier(xhr._url, body)
                body = modified;
            } catch (err) {
                console.error('an xhr request modifier failed', err)
                continue;
            }
        }

        return originalSend.apply(this, [ body ]);
    }

    let readyStateHandler = null;
    let loadHandler = null;

    async function modifyResponse() {
        if (xhr.responseType !== '' && xhr.responseType !== 'text') return;

        if (xhr._modifiedAlready || xhr.readyState !== 4) return;
        xhr._modifiedAlready = true;

        let modifiedText = xhr.responseText;

        for (let modifier of responseModifiers) {
            try {
                let modified = await modifier(xhr._url, modifiedText)
                if (modified === undefined) continue;

                modifiedText = modified;
            } catch (err) {
                console.error('an xhr response modifier failed', err)
                continue;
            }
        }

        Object.defineProperty(xhr, 'responseText', {
            get() {
                return modifiedText;
            }
        })

        Object.defineProperty(xhr, 'response', {
            get() {
                return modifiedText;
            }
        })
    }

    Object.defineProperty(xhr, 'onreadystatechange', {
        get() {
            return readyStateHandler;
        },
        set(handler) {
            readyStateHandler = async function () {
                if (xhr.readyState === 4) {
                    await modifyResponse()
                }

                handler.apply(xhr, arguments)
            }

            xhr.addEventListener('readystatechange', readyStateHandler)
        }
    })

    Object.defineProperty(xhr, 'onload', {
        get() {
            return loadHandler;
        },
        set(handler) {
            loadHandler = async function () {
                await modifyResponse()
                handler.apply(xhr, arguments)
            }

            xhr.addEventListener('load', loadHandler)
        }
    })

    const originalAddEventListener = xhr.addEventListener;
    xhr.addEventListener = function (type, listener) {
        if (type === 'load') {
            let wrapped = async function () {
                await modifyResponse()
                listener.apply(xhr, arguments)
            }

            return originalAddEventListener.call(this, type, wrapped);
        }

        return originalAddEventListener.apply(this, arguments);
    }

    return xhr;
}

function addResponseModifier(func) {
    responseModifiers.push(func)
}

function addRequestModifier(func) {
    requestModifiers.push(func)
}

function block() {
    blocked = true;
}

function unblock() {
    blocked = false;
}

module.exports = {
    addResponseModifier,
    addRequestModifier,
    block,
    unblock
}
},
"/src/xbox/app-info.json": function(module, exports, require, __filename, __dirname){
module.exports = {"name": "VacuumTube-Xbox", "version": "1.8.1-xbox.4", "runtime": "UWP WinUI 2 WebView2", "target": "Xbox One and Xbox Series X|S"};
},
"/src/xbox/browser-entry.js": function(module, exports, require, __filename, __dirname){
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

},
"/src/xbox/generated/resources.js": function(module, exports, require, __filename, __dirname){
module.exports = {"/locale/bs.json": "{\n    \"general\": {\n        \"video_copied\": \"Link videa kopiran u međuspremnik\",\n        \"dislikes\": \"Palac dole\"\n    },\n    \"settings\": {\n        \"adblock\": {\n            \"title\": \"Bloker Reklama\",\n            \"description\": \"Besprijekorno blokira video i feed oglase, ne podliježe YouTubeovim metodama za sprječavanje blokatora\"\n        },\n        \"sponsorblock_full_unused\": {\n            \"title\": \"Sponzorski blokator\",\n            \"description\": \"Preskače segmente sponzora u YouTube videozapisima koristeći bazu podataka prikupljenu od strane korisnika. Također podržava preskakanje uvoda, završetaka i podsjetnika za pretplatu\"\n        },\n        \"dearrow\": {\n            \"title\": \"DeArrow\",\n            \"description\": \"Zamjenjuje naslove i sličice tačnijim, manje senzacionalističkim verzijama iz javne baze podataka prikupljenim sa strane korisnika. Usporava učitavanje, jer mora preuzeti informacije sa servera\"\n        },\n        \"dislikes\": {\n            \"title\": \"Vratite donji palac\",\n            \"description\": \"Koristi YouTube API za vraćanje palca prema dolje (returnyoutubedislike.com) za ponovno dodavanje oznake 'nesviđa mi se' na YouTube. Usporava učitavanje videa jer mora preuzeti informacije sa servera\"\n        },\n        \"hardware_decoding\": {\n            \"title\": \"Hardversko Dekodiranje\",\n            \"description\": \"Koristi vašu grafičku karticu za dekodiranje videa kada je to moguće. Onemogućavanje ove opcije može riješiti probleme s reprodukcijom, ali može uzrokovati kašnjenje ovisno o vašem procesoru. Ponovo pokrenite nakon prebacivanja.\"\n        },\n        \"low_memory_mode\": {\n            \"title\": \"Režim za Nisku Memoriju\",\n            \"description\": \"Uputuje YouTube-u da omogući način rada s malo memorije, što može poboljšati pokretanje na sporijim uređajima, ali na štetu nekih izglednih efekata. Ponovo pokrenite nakon prebacivanja.\"\n        },\n        \"fullscreen\": {\n            \"title\": \"Cijeli Ekran\",\n            \"description\": \"Omogućava cijeli ekran i čini da se VacuumTube uvijek pokrene u punom ekranu.\"\n        },\n        \"keep_on_top\": {\n            \"title\": \"Ostani na vrhu\",\n            \"description\": \"Omogućava opciju \\\"Ostani na vrhu\\\" i pokreće VacuumTube s prozorom zakačenim preko svakog drugog prozora.\"\n        }\n    }\n}\n", "/locale/de.json": "{\n    \"general\": {\n        \"video_copied\": \"Videolink in die Zwischenablage kopiert\",\n        \"dislikes\": \"Abneigungsknöpfe\"\n    },\n    \"settings\": {\n        \"adblock\": {\n            \"title\": \"Anzeigenblocker\",\n            \"description\": \"Blockiert nahtlos Video- und Feed-Werbung und unterliegt nicht den Methoden von YouTube zur Verhinderung von Blockern\"\n        },\n        \"sponsorblock_full_unused\": {\n            \"title\": \"SponsorBlock\",\n            \"description\": \"Überspringt Sponsorensegmente in YouTube-Videos mithilfe einer Crowdsourcing-Datenbank. Unterstützt auch das Überspringen von Intros, Outros und Aufforderungen zum Abonnieren. Nach dem Umschalten neu starten.\"\n        },\n        \"dearrow\": {\n            \"title\": \"DeArrow\",\n            \"description\": \"Ersetzt Titel und Vorschaubilder durch genauere, weniger sensationslüsterne Versionen aus einer öffentlichen Crowdsourced-Datenbank. Verlangsamt das Laden, da es Informationen vom Server abrufen muss\"\n        },\n        \"dislikes\": {\n            \"title\": \"Abneigungen zurückgeben\",\n            \"description\": \"Verwendet die YouTube Abneigungen zurückgeben API (returnyoutubedislike.com), um Abneigungsknöpfe wieder zu YouTube hinzuzufügen. Verlangsamt das Laden von Videos, da Informationen vom Server abgerufen werden müssen\"\n        },\n        \"hardware_decoding\": {\n            \"title\": \"Hardware-Dekodierung\",\n            \"description\": \"Verwendet Ihren Grafikprozessor zur Dekodierung von Videos, wenn möglich. Die Deaktivierung dieser Funktion kann Wiedergabeprobleme beheben, kann aber je nach CPU zu Verzögerungen führen. Starten Sie nach dem Umschalten neu.\"\n        },\n        \"low_memory_mode\": {\n            \"title\": \"Wenigspeichermodus\",\n            \"description\": \"Weist YouTube an, den Modus für geringen Speicherbedarf zu aktivieren, was die Leistung auf langsameren Geräten auf Kosten einiger visueller Effekte verbessern kann. Starten Sie nach dem Umschalten neu.\"\n        },\n        \"fullscreen\": {\n            \"title\": \"Vollbildschirm\",\n            \"description\": \"Aktiviert den Vollbildmodus und lässt VacuumTube immer im Vollbildmodus starten.\"\n        },\n        \"keep_on_top\": {\n            \"title\": \"Oben halten\",\n            \"description\": \"Aktiviert „Oben halten“ und sorgt dafür, dass VacuumTube so gestartet wird, dass das Fenster über allen anderen Fenstern angeheftet ist.\"\n        },\n        \"mac_permissions\": {\n            \"title\": \"Berechtigungen\",\n            \"description\": \"Verwalte die von VacuumTube verwendete Mikrofonberechtigung.\",\n            \"microphone_title\": \"Mikrofon\",\n            \"microphone_description\": \"Wird nur verwendet, wenn du die YouTube-Sprachsuche startest.\",\n            \"status_label\": \"Status\",\n            \"status_loading\": \"Mikrofonberechtigung wird geprüft …\",\n            \"request_microphone\": \"Mikrofonzugriff anfordern\",\n            \"open_microphone_settings\": \"Mikrofon-Datenschutzeinstellungen öffnen\",\n            \"reset_microphone\": \"Berechtigungsabfrage zurücksetzen\",\n            \"relaunch_app\": \"VacuumTube neu laden\",\n            \"restart_required\": \"Änderungen an den Datenschutzeinstellungen können ein Neuladen von VacuumTube erfordern.\",\n            \"request_granted\": \"Mikrofonzugriff ist erlaubt.\",\n            \"request_not_determined\": \"Über den Mikrofonzugriff wurde noch nicht entschieden. Fordere Zugriff an und bestätige die Systemabfrage.\",\n            \"request_denied_help\": \"Mikrofonzugriff ist verweigert. Aktiviere ihn in den Datenschutzeinstellungen der Konsole und lade VacuumTube neu.\",\n            \"request_failed\": \"VacuumTube konnte den Mikrofonzugriff nicht anfordern. Prüfe, ob ein Mikrofon angeschlossen und erlaubt ist.\",\n            \"resetting_microphone\": \"Gespeicherte Mikrofonentscheidung wird zurückgesetzt …\",\n            \"statuses\": {\n                \"not-determined\": \"Nicht angefordert\",\n                \"granted\": \"Erlaubt\",\n                \"denied\": \"Verweigert\",\n                \"restricted\": \"Eingeschränkt\",\n                \"unknown\": \"Unbekannt\",\n                \"unsupported\": \"Nicht unterstützt\"\n            }\n        }\n    }\n}\n", "/locale/en.json": "{\n    \"general\": {\n        \"video_copied\": \"Video link copied to clipboard\",\n        \"dislikes\": \"Dislikes\",\n        \"steam_controller_notice\": \"External controller isn't detected? Try the steamdeck-input-disabler plugin from Decky.\",\n        \"encryption_error\": {\n            \"title\": \"Something went wrong\",\n            \"text\": \"This video couldn't be decoded. Movies aren't supported in VacuumTube due to encryption. If this happens on other videos, try logging in or switching accounts.\",\n            \"switch_accounts\": \"Switch Accounts\",\n            \"okay\": \"Okay\"\n        }\n    },\n    \"music_mode\": {\n        \"title\": \"No Video\",\n        \"subtitle\": \"Audio only\"\n    },\n    \"settings\": {\n        \"generic\": {\n            \"title\": \"Settings\",\n            \"description\": \"Opens the VacuumTube settings overlay. You can access this overlay anywhere by pressing Ctrl+O on your keyboard, or R3 on your controller\",\n            \"button_label\": \"Open VacuumTube Settings\",\n            \"hint\": \"Use arrow keys to navigate\"\n        },\n        \"adblock\": {\n            \"title\": \"Ad Block\",\n            \"description\": \"Seamlessly blocks video and feed ads, not subject to YouTube's methods of preventing blockers\"\n        },\n        \"sponsorblock\": {\n            \"title\": \"SponsorBlock\",\n            \"description\": \"Skips sponsor segments in YouTube videos using a crowdsourced database. Currently only supports skipping sponsors\"\n        },\n        \"dearrow\": {\n            \"title\": \"DeArrow\",\n            \"description\": \"Replaces titles and thumbnails with more accurate, less sensationalized versions from a public crowdsourced database. Slows down loading, as it has to fetch info from the server\"\n        },\n        \"dislikes\": {\n            \"title\": \"Return Dislikes\",\n            \"description\": \"Uses community data from the Return YouTube Dislike API (returnyoutubedislike.com) to show rough dislike counts. Slows down video loading, as it has to fetch info from the server\"\n        },\n        \"remove_super_resolution\": {\n            \"title\": \"Remove Super Resolution\",\n            \"description\": \"Remove \\\"Super resolution\\\" (AI upscaled) qualities from low quality videos\"\n        },\n        \"hide_shorts\": {\n            \"title\": \"Hide Shorts\",\n            \"description\": \"Hides YouTube Shorts from the homepage\"\n        },\n        \"unlock_resolution\": {\n            \"title\": \"Unlock Resolution\",\n            \"description\": \"Removes monitor resolution cap and allows you to watch videos at any resolution. Relaunch after toggling\"\n        },\n        \"h264ify\": {\n            \"title\": \"Filter Video Codecs\",\n            \"description\": \"Codec filtering options. Relaunch after toggling any of the options.\",\n            \"enable_title\": \"Enable codec filter (h264ify)\",\n            \"enable_description\": \"Enables the codec filter. This can help with performance and battery life on slower devices, but may reduce the available resolutions.\",\n            \"disable_codec_title\": \"Disable {codec}\",\n            \"disable_codec_description\": \"Block {codec} streams.\"\n        },\n        \"hardware_decoding\": {\n            \"title\": \"Hardware Decoding\",\n            \"description\": \"Uses your GPU to decode videos when possible. Disabling this may fix playback issues, but can cause lag depending on your CPU. Relaunch after toggling\"\n        },\n        \"wayland_hdr\": {\n            \"title\": \"Wayland HDR\",\n            \"description\": \"Enables HDR when using Wayland, but can cause desaturated colors on unsupported platforms. Relaunch after toggling\"\n        },\n        \"low_memory_mode\": {\n            \"title\": \"Low Memory Mode\",\n            \"description\": \"Tells YouTube to enable low memory mode, which may improve performance on slower devices at the cost of some visual effects. Relaunch after toggling\"\n        },\n        \"fullscreen\": {\n            \"title\": \"Fullscreen\",\n            \"description\": \"Enables fullscreen, and makes VacuumTube always launch in fullscreen\"\n        },\n        \"no_window_decorations\": {\n            \"title\": \"No Window Decorations\",\n            \"description\": \"Disables window decorations, including the title bar and window border. Relaunch after toggling\"\n        },\n        \"keep_on_top\": {\n            \"title\": \"Keep on Top\",\n            \"description\": \"Enables Keep on Top, and makes VacuumTube launch with the window pinned on top of every other window\"\n        },\n        \"pause_on_blur\": {\n            \"title\": \"Pause on Blur\",\n            \"description\": \"Pause current video when VacuumTube loses focus (e.g. tabbing out or minimizing the window)\"\n        },\n        \"features\": {\n            \"title\": \"Features\",\n            \"notice_title\": \"Not part of the default experience\",\n            \"notice_description\": \"These optional features extend VacuumTube beyond the standard TV YouTube experience. Enable them below to acknowledge that they rely on internal YouTube behavior and may change or stop working without notice.\",\n            \"enable_title\": \"Enable optional features\",\n            \"enable_description\": \"I understand that these features are outside VacuumTube's default experience and may change or break.\",\n            \"music_mode_title\": \"Music Mode\",\n            \"music_mode_description\": \"Adds a No Video option to the quality selector for audio-only playback using YouTube's native music view.\"\n        },\n        \"touch_overlay\": {\n            \"title\": \"Touch Overlay\",\n            \"description\": \"Enables on-screen touch controls for easier navigation when touch input is detected\"\n        },\n        \"controller_support\": {\n            \"title\": \"Controller Support\",\n            \"description\": \"Enables support for game controllers, including navigation and video playback controls. Requires an external controller, such as an Xbox controller\"\n        },\n        \"device_discoverability\": {\n            \"title\": \"Device Discoverability\",\n            \"description\": \"Allows VacuumTube to be discovered by the YouTube mobile app on devices within the same local network. Relaunch after toggling\"\n        },\n        \"mac_permissions\": {\n            \"title\": \"Permissions\",\n            \"description\": \"Manage microphone permission used by VacuumTube.\",\n            \"microphone_title\": \"Microphone\",\n            \"microphone_description\": \"Used only when you start YouTube voice search.\",\n            \"status_label\": \"Status\",\n            \"status_loading\": \"Checking microphone permission...\",\n            \"request_microphone\": \"Request Microphone Access\",\n            \"open_microphone_settings\": \"Open microphone privacy settings\",\n            \"reset_microphone\": \"Troubleshooting: Reset Permission Prompt\",\n            \"relaunch_app\": \"Relaunch VacuumTube\",\n            \"restart_required\": \"Privacy-setting changes can require reloading VacuumTube.\",\n            \"request_granted\": \"Microphone access is allowed. No permission prompt is needed.\",\n            \"request_not_determined\": \"The microphone permission has not been decided yet. Request access and confirm the system prompt.\",\n            \"request_denied_help\": \"Microphone access is denied. Enable it in the console privacy settings, then reload VacuumTube.\",\n            \"request_failed\": \"VacuumTube could not request microphone access. Check that a microphone is connected and permitted.\",\n            \"resetting_microphone\": \"Resetting the saved microphone decision...\",\n            \"statuses\": {\n                \"not-determined\": \"Not Requested\",\n                \"granted\": \"Allowed\",\n                \"denied\": \"Denied\",\n                \"restricted\": \"Restricted\",\n                \"unknown\": \"Unknown\",\n                \"unsupported\": \"Unsupported\"\n            }\n        }\n    },\n    \"sponsorblock\": {\n        \"sponsor_skipped\": \"Sponsor skipped\"\n    },\n    \"donate\": {\n        \"setting\": {\n            \"title\": \"Donate\",\n            \"description\": \"Support VacuumTube's development by making a donation! You can donate by visiting shy.rocks/donate, or by pressing the button below to open the donation page in your browser\",\n            \"button_label\": \"Donate\"\n        }\n    }\n}\n", "/locale/hr.json": "{\n    \"general\": {\n        \"video_copied\": \"Link videa kopiran u međuspremnik\",\n        \"dislikes\": \"Palac dolje\"\n    },\n    \"settings\": {\n        \"adblock\": {\n            \"title\": \"Bloker Reklama\",\n            \"description\": \"Besprijekorno blokira video i feed oglase, ne podliježe YouTubeovim metodama protiv blokiranja\"\n        },\n        \"sponsorblock_full_unused\": {\n            \"title\": \"Sponzorski blokator\",\n            \"description\": \"Preskače segmente sponzora u YouTube videozapisima koristeći bazu podataka prikupljenu od mnoštva korisnika. Također podržava preskakanje uvoda, završetaka i podsjetnika za pretplatu\"\n        },\n        \"dearrow\": {\n            \"title\": \"DeArrow\",\n            \"description\": \"Zamjenjuje naslove i sličice točnijim, manje senzacionalističkim verzijama iz javne baze podataka koju prikupljaju korisnici. Usporava učitavanje jer mora dohvaćati informacije s poslužitelja\"\n        },\n        \"dislikes\": {\n            \"title\": \"Vratite donji palac\",\n            \"description\": \"Koristi YouTube API za vraćanje palca prema dolje (returnyoutubedislike.com) za ponovno dodavanje oznake 'nesviđa mi se' na YouTube. Usporava učitavanje videozapisa jer mora dohvaćati informacije s poslužitelja\"\n        },\n        \"hardware_decoding\": {\n            \"title\": \"Hardversko Dekodiranje\",\n            \"description\": \"Koristi vašu grafičku karticu za dekodiranje videa kada je to moguće. Onemogućavanje ove opcije može riješiti probleme s reprodukcijom, ali može uzrokovati kašnjenje ovisno o vašem procesoru. Ponovno pokrenite nakon prebacivanja.\"\n        },\n        \"low_memory_mode\": {\n            \"title\": \"Režim za Nisku Memoriju\",\n            \"description\": \"Uputuje YouTube-u da omogući način rada s malo memorije, što može poboljšati pokretanje na sporijim uređajima, ali na štetu nekih vizualnih efekata. Ponovno pokrenite nakon prebacivanja.\"\n        },\n        \"fullscreen\": {\n            \"title\": \"Cijeli Zaslon\",\n            \"description\": \"Omogućava cijeli zaslon i čini da se VacuumTube uvijek pokrene u punom zaslonu.\"\n        },\n        \"keep_on_top\": {\n            \"title\": \"Ostani na vrhu\",\n            \"description\": \"Omogućuje opciju \\\"Ostani na vrhu\\\" i pokreće VacuumTube s prozorom usidrenim preko svakog drugog prozora.\"\n        }\n    }\n}\n", "/locale/id.json": "{\n    \"general\": {\n        \"video_copied\": \"Tautan video disalin ke papan klip\",\n        \"dislikes\": \"Tidak Suka\",\n        \"steam_controller_notice\": \"Pengontrol eksternal tidak terdeteksi? Coba plugin steamdeck-input-disabler dari Decky.\"\n    },\n    \"settings\": {\n        \"generic\": {\n            \"title\": \"Pengaturan\",\n            \"description\": \"Buka menu pengaturan VacuumTube. Akses menu ini dengan menekan Ctrl+O pada papan ketik atau tombol R3 pada pengontrol konsol.\",\n            \"button_label\": \"Buka Pengaturan VacuumTube\",\n            \"hint\": \"Gunakan tombol panah untuk menjelajah\"\n        },\n        \"adblock\": {\n            \"title\": \"Blokir Iklan\",\n            \"description\": \"Blokir iklan beranda dan video, tanpa perlu khawatir terdeteksi YouTube\"\n        },\n        \"sponsorblock\": {\n            \"title\": \"SponsorBlock\",\n            \"description\": \"Lewati segmen sponsor pada video YouTube berdasarkan basis data publik. Saat ini hanya mendukung fitur lewati sponsor.\"\n        },\n        \"dearrow\": {\n            \"title\": \"DeArrow\",\n            \"description\": \"Mengganti judul dan gambar pratinjau video yang lebih akurat dan tidak sensasional dari basis data publik yang dihimpun bersama. Proses pengambilan informasi akan memperlambat pemuatan aplikasi VacuumTube.\"\n        },\n        \"dislikes\": {\n            \"title\": \"Kembalikan 'Tidak Suka'\",\n            \"description\": \"Gunakan API Return YouTube Dislike (returnyoutubedislike.com) untuk mengembalikan fitur info jumlah 'Tidak Suka' pada video YouTube. Proses pengambilan info ini akan memperlambat pemuatan video.\"\n        },\n        \"remove_super_resolution\": {\n            \"title\": \"Hapus Resolusi Super\",\n            \"description\": \"Hapus pilihan kualitas \\\"Resolusi super\\\" (pembesaran AI) dari video beresolusi rendah\"\n        },\n        \"hide_shorts\": {\n            \"title\": \"Sembunyikan Shorts\",\n            \"description\": \"Sembunyikan Shorts YouTube dari halaman utama\"\n        },\n        \"hardware_decoding\": {\n            \"title\": \"Optimasi Grafis\",\n            \"description\": \"Gunakan kartu grafis (GPU) untuk mengurai pemutaran video jika sanggup. Mematikan opsi ini mungkin dapat menyelesaikan sebagian masalah pemutaran, namun dapat menghambat video jika prosesor tidak memadai. Luncurkan ulang setelah mengubah.\"\n        },\n        \"low_memory_mode\": {\n            \"title\": \"Optimasi Memori\",\n            \"description\": \"Lakukan optimasi untuk perangkat bermemori rendah dengan mengurangi beberapa efek visual. Luncurkan ulang setelah mengubah.\"\n        },\n        \"fullscreen\": {\n            \"title\": \"Mode Layar Penuh\",\n            \"description\": \"Memastikan VacuumTube selalu masuk dalam mode layar penuh setelah diluncurkan.\"\n        },\n        \"keep_on_top\": {\n            \"title\": \"Tetap di Atas\",\n            \"description\": \"Memastikan jendela VacuumTube selalu berada di atas jendela aplikasi lain.\"\n        },\n        \"controller_support\": {\n            \"title\": \"Dukungan Pengontrol\",\n            \"description\": \"Mengaktifkan dukungan untuk pengontrol konsol eksternal, termasuk kontrol navigasi halaman dan pemutaran video.\"\n        }\n    },\n    \"sponsorblock\": {\n        \"sponsor_skipped\": \"Sponsor dilewati\"\n    },\n    \"donate\": {\n        \"setting\": {\n            \"title\": \"Mari Berdonasi\",\n            \"description\": \"Dukung pengembangan VacuumTube dengan berdonasi ke shy.rocks/donate. Tekan tombol berikut untuk membuka situs donasi di peramban Anda.\",\n            \"button_label\": \"Beri Donasi\"\n        }\n    }\n}\n", "/locale/nl.json": "{\n    \"general\": {\n        \"video_copied\": \"Videolink naar klembord gekopieerd\",\n        \"dislikes\": \"Afkeerknoppen\"\n    },\n    \"settings\": {\n        \"adblock\": {\n            \"title\": \"Ad-blokker\",\n            \"description\": \"Blokkeert naadloos video- en feed-advertenties en is niet onderhevig aan de blokkeermethoden van YouTube\"\n        },\n        \"sponsorblock_full_unused\": {\n            \"title\": \"Sponsorblok\",\n            \"description\": \"Slaat sponsorsegmenten in YouTube-video's over met behulp van een crowdsourced database. Ondersteunt ook het overslaan van intro's, outro's en herinneringen om je te abonneren\"\n        },\n        \"dearrow\": {\n            \"title\": \"DeArrow\",\n            \"description\": \"Vervangt titels en miniaturen door nauwkeurigere, minder sensationele versies uit een openbare, crowdsourcedatabase. Vertraagt het laden, omdat het info moet ophalen van de server\"\n        },\n        \"dislikes\": {\n            \"title\": \"Afkeren teruggeven\",\n            \"description\": \"Gebruikt de Return YouTube Dislike API (returnyoutubedislike.com) om afkeerknoppen opnieuw toe te voegen aan YouTube. Vertraagt het laden van video's, omdat het informatie van de server moet ophalen\"\n        },\n        \"hardware_decoding\": {\n            \"title\": \"Hardwaredecodering\",\n            \"description\": \"Gebruikt waar mogelijk uw GPU om video's te decoderen. Als u dit uitschakelt, kunnen afspeelproblemen worden opgelost, maar kan er vertraging optreden, afhankelijk van uw CPU. Herstart na het omschakelen.\"\n        },\n        \"low_memory_mode\": {\n            \"title\": \"Laaggeheugenmodus\",\n            \"description\": \"Vertelt YouTube om de modus met laag geheugen in te schakelen, wat de prestaties op langzamere apparaten kan verbeteren ten koste van sommige visuele effecten. Herstart na het omschakelen.\"\n        },\n        \"fullscreen\": {\n            \"title\": \"Vollescherm\",\n            \"description\": \"Schakelt volledig scherm in en zorgt ervoor dat VacuumTube altijd opstart in volledig scherm.\"\n        },\n        \"keep_on_top\": {\n            \"title\": \"Bovenaan houden\",\n            \"description\": \"Schakelt \\\"Bovenaan houden\\\" in en zorgt ervoor dat VacuumTube wordt gestart met het venster boven elk ander venster vastgepind.\"\n        }\n    }\n}\n", "/locale/sr-Latn.json": "{\n    \"general\": {\n        \"video_copied\": \"Link videa kopiran u međuspremnik\",\n        \"dislikes\": \"Palac dole\"\n    },\n    \"settings\": {\n        \"adblock\": {\n            \"title\": \"Blokator Oglasa\",\n            \"description\": \"Besprekorno blokira video i fid oglase, nije podložan YouTube metodama protiv blokiranja\"\n        },\n        \"sponsorblock_full_unused\": {\n            \"title\": \"Sponzorski blokator\",\n            \"description\": \"Preskače segmente sponzora u YouTube video snimcima koristeći bazu podataka prikupljenu od strane korisnika. Takođe podržava preskakanje uvoda, završetaka i podsetnika za pretplatu\"\n        },\n        \"dearrow\": {\n            \"title\": \"DeArrow\",\n            \"description\": \"Zamenjuje naslove i sličice tačnijim, manje senzacionalističkim verzijama iz javne baze podataka koju su prikupili korisnici. Usporava učitavanje, jer mora da preuzme informacije sa servera\"\n        },\n        \"dislikes\": {\n            \"title\": \"Vratite donji palac\",\n            \"description\": \"Koristi YouTube API za vraćanje palca prema dole (returnyoutubedislike.com) za ponovno dodavanje oznake 'nesviđa mi se' na YouTube. Usporava učitavanje videa, jer mora da preuzme informacije sa servera\"\n        },\n        \"hardware_decoding\": {\n            \"title\": \"Hardversko Dekodiranje\",\n            \"description\": \"Koristi vašu grafičku karticu za dekodiranje videa kada je to moguće. Onemogućavanje ove opcije može rešiti probleme sa reprodukcijom, ali može izazvati kašnjenje u zavisnosti od vašeg procesora. Ponovo pokrenite sistem nakon prebacivanja.\"\n        },\n        \"low_memory_mode\": {\n            \"title\": \"Režim za Nisku Memoriju\",\n            \"description\": \"Nalaže YouTube-u da omogući režim sa malo memorije, što može poboljšati reprodukciju na sporijim uređajima, ali na štetu nekih vizuelnih efekata. Ponovo pokrenite sistem nakon prebacivanja.\"\n        },\n        \"fullscreen\": {\n            \"title\": \"Ceo Ekran\",\n            \"description\": \"Omogućava ceo ekran i čini da VacuumTube uvek radi u režimu celog ekrana.\"\n        },\n        \"keep_on_top\": {\n            \"title\": \"Ostani na vrhu\",\n            \"description\": \"Omogućava opciju „Ostani na vrhu“ i pokreće VacuumTube sa prozorom pričvršćenim preko svakog drugog prozora.\"\n        }\n    }\n}\n", "/locale/sv.json": "{\n    \"general\": {\n        \"video_copied\": \"Videolänk kopierad till urklipp\",\n        \"dislikes\": \"Ogillat\"\n    },\n    \"settings\": {\n        \"adblock\": {\n            \"title\": \"Reklamblockering\",\n            \"description\": \"Blockerar sömlöst reklam i videor och flödet. Påverkas ej av YouTube:s metoder för att förhindra reklamblockering\"\n        },\n        \"sponsorblock_full_unused\": {\n            \"title\": \"SponsorBlock\",\n            \"description\": \"Hoppar över sponsrade segment i YouTube-videor med hjälp av en crowdsourcad databas. Kan även hoppa över vinjetter (in och ut) samt prenumerationsuppmaningar\"\n        },\n        \"dearrow\": {\n            \"title\": \"DeArrow\",\n            \"description\": \"Ersätter titlar och indexbilder med mer korrekta och mindre sensationella varianter från en publikt crowdsourcad databas. Saktar ner sidladdning, eftersom att DeArrow måste hämta informationen från servern\"\n        },\n        \"dislikes\": {\n            \"title\": \"Återinför Ogillningar\",\n            \"description\": \"Använder Return YouTube Dislike API (returnyoutubedislike.com) för att återinföra ogillningar till YouTube. Saktar ner videoladdning, eftersom information måste hämtas från servern\"\n        },\n        \"hardware_decoding\": {\n            \"title\": \"Hårdvaruavkodning\",\n            \"description\": \"Använder din enhets grafikkort för att avkoda videor när det är möjligt. Att avaktivera den här funktionen kan hjälpa med uppspelningsproblem, men kan orsaka lagg beroende på din processor. Starta om appen efter du har ändrat inställningen.\"\n        },\n        \"low_memory_mode\": {\n            \"title\": \"Begränsat minne\",\n            \"description\": \"Säger till YouTube att aktivera läget för begränsat minne, vilket kan förbättra prestanda på längsammare enheter i utbyte mot borttagning av vissa visuella effekter. Starta om appen efter du har ändrat inställningen.\"\n        },\n        \"fullscreen\": {\n            \"title\": \"Helskärm\",\n            \"description\": \"Aktiverar helskärm och ser till att VacuumTube alltid startar i helskärmsläge.\"\n        },\n        \"keep_on_top\": {\n            \"title\": \"Fäst högst upp\",\n            \"description\": \"Aktiverar \\\"fäst högst upp\\\", och startar VacuumTube med sitt fönster fäst ovanför alla andra fönster.\"\n        }\n    }\n}\n", "/locale/tr.json": "{\n    \"general\": {\n        \"video_copied\": \"Video bağlantısı panoya kopyalandı\",\n        \"dislikes\": \"Beğenmeyenler\"\n    },\n    \"settings\": {\n        \"adblock\": {\n            \"title\": \"Reklam Engelleyici\",\n            \"description\": \"Video ve yayıncı reklamlarını engeller, YouTube engelleyicileri engelleme yöntemlerine tabi değildir\"\n        },\n        \"sponsorblock_full_unused\": {\n            \"title\": \"Sponsor Engelleyici\",\n            \"description\": \"Kitlesel veritabanı kullanarak YouTube videolarındaki sponsor bölümlerini atlar. Ayrıca girişleri, çıkışları ve abonelik hatırlatıcılarını atlamayı da destekler\"\n        },\n        \"dearrow\": {\n            \"title\": \"DeArrow\",\n            \"description\": \"Başlıkları ve küçük resimleri, herkese açık veritabanından alınan daha doğru ve daha az sansasyonel sürümlerle değiştirir. Sunucudan bilgi alması gerektiğinden yüklemeyi yavaşlatır\"\n        },\n        \"dislikes\": {\n            \"title\": \"Beğenmemeleri Göster\",\n            \"description\": \"YouTube beğenmeyenleri göstermek için YouTube Beğenmeme API (returnyoutubedislike.com) kullanır. Sunucudan bilgi alması gerektiğinden video yüklemesini yavaşlatır\"\n        },\n        \"hardware_decoding\": {\n            \"title\": \"Donanımsal Kod Çözücü\",\n            \"description\": \"Mümkünse videoları çözmek için GPU kullanır. Bu özelliği devre dışı bırakmak oynatma sorunlarını çözebilir, ancak CPU üstünde gecikmeye neden olabilir. Değiştirdikten sonra yeniden başlatın.\"\n        },\n        \"low_memory_mode\": {\n            \"title\": \"Düşük Bellek Modu\",\n            \"description\": \"YouTube düşük bellek modu etkinleştirmesini sağlar. Bazı görsel efektlerden ödün vererek daha yavaş cihazlarda performansı artırabilir. Değiştirdikten sonra yeniden başlatın.\"\n        },\n        \"fullscreen\": {\n            \"title\": \"Tam Ekran\",\n            \"description\": \"Tam ekran özelliğini etkinleştirir ve VacuumTube her zaman tam ekranda başlatılır.\"\n        },\n        \"keep_on_top\": {\n            \"title\": \"Üstte Tut\",\n            \"description\": \"Üstte Tutmayı etkinleştirir ve VacuumTube tüm pencerelerin üstüne sabitlenerek başlatılır.\"\n        }\n    }\n}\n", "/src/preload/modules/settings/style.css": "/*settings overlay*/\n\n#vt-settings-overlay-root {\n    position: fixed;\n    top: 0;\n    left: 0;\n    width: 100%;\n    height: 100%;\n    z-index: 99999;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    transition: opacity 0.2s ease;\n}\n\n#vt-settings-overlay-root.vt-settings-hidden {\n    opacity: 0;\n    pointer-events: none;\n}\n\n.vt-settings-backdrop {\n    position: absolute;\n    top: 0;\n    left: 0;\n    width: 100%;\n    height: 100%;\n    background: rgba(0, 0, 0, 0.85);\n}\n\n.vt-settings-container {\n    position: relative;\n    width: 100%;\n    max-width: 75vw;\n    height: 100%;\n    max-height: 75vh;\n    background: #212121;\n    border-radius: 16px;\n    display: flex;\n    flex-direction: column;\n    overflow: hidden;\n    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);\n}\n\n.vt-settings-header {\n    display: flex;\n    align-items: center;\n    padding: 24px 32px;\n    background: #212121;\n}\n\n.vt-settings-title {\n    font-size: 28px;\n    font-weight: 500;\n    color: #fff;\n}\n\n.vt-settings-hint {\n    font-size: 14px;\n    color: #aaa;\n    margin-left: auto;\n    margin-right: 24px;\n}\n\n.vt-settings-close {\n    width: 40px;\n    height: 40px;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    cursor: pointer;\n    border-radius: 50%;\n    font-size: 20px;\n    color: #aaa;\n    transition: background 0.15s ease, color 0.15s ease;\n}\n\n.vt-settings-close:hover,\n.vt-settings-close.vt-close-focused {\n    background: #333;\n    color: #fff;\n    outline: 2px solid #fff;\n    outline-offset: 2px;\n}\n\n.vt-settings-body {\n    display: flex;\n    flex: 1;\n    overflow: hidden;\n}\n\n.vt-tabs-viewport {\n    width: 280px;\n    height: calc(100% - 50px);\n    background: #212121;\n    overflow: hidden;\n    position: relative;\n}\n\n.vt-settings-tabs {\n    padding: 16px;\n    transition: transform 0.15s ease-out;\n}\n\n.vt-tabs-scrollbar {\n    right: 4px;\n}\n\n.vt-tab {\n    display: flex;\n    align-items: center;\n    padding: 14px 20px;\n    cursor: pointer;\n    transition: background 0.15s ease, color 0.15s ease;\n    border-radius: 8px;\n    margin-bottom: 4px;\n}\n\n.vt-tab:hover {\n    background: #333;\n}\n\n.vt-tab.vt-tab-selected {\n    background: #fff;\n}\n\n.vt-tab.vt-tab-selected .vt-tab-label {\n    color: #212121;\n}\n\n.vt-tab.vt-tab-focused {\n    outline: 2px solid #fff;\n    outline-offset: 2px;\n}\n\n.vt-tab-label {\n    font-size: 18px;\n    color: #fff;\n}\n\n.vt-settings-content {\n    flex: 1;\n    padding: 24px 32px;\n    overflow: hidden;\n    background: #212121;\n    display: flex;\n    flex-direction: column;\n}\n\n.vt-content-panel {\n    display: none;\n}\n\n.vt-content-panel.vt-panel-active {\n    display: flex;\n    flex-direction: column;\n    flex: 1;\n    min-height: 0;\n    overflow: hidden;\n}\n\n.vt-setting-item {\n    display: flex;\n    align-items: center;\n    justify-content: space-between;\n    padding: 20px 24px;\n    background: #2a2a2a;\n    border-radius: 12px;\n    margin-bottom: 12px;\n    transition: background 0.15s ease;\n    cursor: pointer;\n    flex-shrink: 0;\n}\n\n.vt-features-notice {\n    display: flex;\n    gap: 14px;\n    margin: 0 0 12px;\n    padding: 12px 14px;\n    border: 1px solid #6f5a25;\n    border-radius: 12px;\n    background: #332b18;\n}\n\n.vt-features-notice-icon {\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    flex: 0 0 26px;\n    width: 26px;\n    height: 26px;\n    border-radius: 50%;\n    background: #f5c451;\n    color: #212121;\n    font-size: 18px;\n    font-weight: 700;\n}\n\n.vt-features-notice-copy {\n    display: flex;\n    flex-direction: column;\n    min-width: 0;\n}\n\n.vt-features-notice-title {\n    margin-bottom: 4px;\n    color: #fff;\n    font-size: 16px;\n    font-weight: 500;\n}\n\n.vt-features-notice-description {\n    margin: 0;\n    color: #d2c6a7;\n    font-size: 14px;\n    line-height: 1.4;\n}\n\n.vt-features-section {\n    display: flex;\n    flex-direction: column;\n    flex: 1;\n    min-height: 0;\n    overflow: hidden;\n}\n\n.vt-features-viewport {\n    flex: 1;\n    min-height: 0;\n    overflow: hidden;\n    position: relative;\n}\n\n.vt-features-list {\n    padding-right: 16px;\n    transition: transform 0.15s ease-out;\n}\n\n.vt-features-list .vt-setting-item {\n    margin-bottom: 10px;\n    padding: 16px 20px;\n}\n\n.vt-features-list .vt-setting-title {\n    margin-bottom: 4px;\n}\n\n.vt-setting-item:hover {\n    background: #333;\n}\n\n.vt-setting-item.vt-item-focused {\n    background: #3a3a3a;\n    outline: 2px solid #fff;\n    outline-offset: -2px;\n}\n\n.vt-setting-item.vt-setting-item-inactive {\n    opacity: 0.55;\n    cursor: default;\n}\n\n.vt-setting-item.vt-setting-item-inactive:hover {\n    background: #2a2a2a;\n}\n\n.vt-setting-info {\n    display: flex;\n    flex-direction: column;\n    flex: 1;\n    margin-right: 24px;\n}\n\n.vt-setting-title {\n    font-size: 20px;\n    font-weight: 500;\n    color: #fff;\n    margin-bottom: 8px;\n}\n\n.vt-setting-description {\n    font-size: 14px;\n    color: #aaa;\n    line-height: 1.4;\n}\n\n.vt-setting-control {\n    flex-shrink: 0;\n}\n\n.vt-toggle {\n    width: 56px;\n    height: 32px;\n    cursor: pointer;\n}\n\n.vt-toggle-track {\n    width: 100%;\n    height: 100%;\n    background: #555;\n    border-radius: 16px;\n    position: relative;\n    transition: background 0.2s ease;\n}\n\n.vt-toggle.vt-toggle-on .vt-toggle-track {\n    background: #fff;\n}\n\n.vt-toggle-thumb {\n    position: absolute;\n    top: 4px;\n    left: 4px;\n    width: 24px;\n    height: 24px;\n    background: #fff;\n    border-radius: 50%;\n    transition: transform 0.2s ease;\n}\n\n.vt-toggle.vt-toggle-on .vt-toggle-thumb {\n    transform: translateX(24px);\n    background: #212121;\n}\n\n.vt-placeholder {\n    display: flex;\n    flex-direction: column;\n    align-items: center;\n    justify-content: center;\n    height: 100%;\n    min-height: 300px;\n}\n\n.vt-placeholder-icon {\n    font-size: 64px;\n    margin-bottom: 24px;\n}\n\n.vt-placeholder-text {\n    font-size: 18px;\n    color: #888;\n    text-align: center;\n}\n\n.vt-permissions-section,\n.vt-h264ify-section {\n    display: flex;\n    flex-direction: column;\n    flex: 1;\n    min-height: 0;\n    overflow: hidden;\n}\n\n.vt-permissions-viewport,\n.vt-h264ify-viewport {\n    flex: 1;\n    min-height: 0;\n    overflow: hidden;\n    position: relative;\n}\n\n.vt-permissions-list,\n.vt-h264ify-list {\n    transition: transform 0.15s ease-out;\n    padding-right: 16px;\n}\n\n.vt-permissions-description {\n    font-size: 14px;\n    color: #aaa;\n    margin-bottom: 20px;\n    line-height: 1.5;\n    flex-shrink: 0;\n}\n\n.vt-permission-card {\n    display: flex;\n    padding: 20px 24px;\n    background: #2a2a2a;\n    border-radius: 12px;\n    margin-bottom: 12px;\n    flex-shrink: 0;\n}\n\n.vt-permission-status {\n    display: inline-flex;\n    align-items: center;\n    width: fit-content;\n    margin-top: 14px;\n    padding: 6px 10px;\n    border-radius: 6px;\n    background: #3a3a3a;\n    color: #fff;\n    font-size: 14px;\n}\n\n.vt-permission-status[data-status=\"granted\"] {\n    background: #1f5f3a;\n}\n\n.vt-permission-status[data-status=\"denied\"],\n.vt-permission-status[data-status=\"restricted\"] {\n    background: #703030;\n}\n\n.vt-permission-note {\n    margin-top: 12px;\n    color: #aaa;\n    font-size: 14px;\n    line-height: 1.4;\n}\n\n.vt-permission-message {\n    margin-top: 12px;\n    color: #aaa;\n    font-size: 14px;\n    line-height: 1.4;\n}\n\n.vt-permission-message[data-type=\"success\"] {\n    color: #9ee0b5;\n}\n\n.vt-permission-message[data-type=\"warning\"] {\n    color: #ffc777;\n}\n\n.vt-permissions-section .vt-button {\n    margin-bottom: 12px;\n}\n\n\n.vt-scrollbar {\n    position: absolute;\n    top: 0;\n    right: 0;\n    width: 6px;\n    height: 100%;\n    background: rgba(255, 255, 255, 0.1);\n    border-radius: 3px;\n    opacity: 0;\n    transition: opacity 0.2s ease;\n}\n\n.vt-permissions-viewport:hover .vt-scrollbar,\n.vt-h264ify-viewport:hover .vt-scrollbar,\n.vt-features-viewport:hover .vt-scrollbar,\n.vt-scrollbar.vt-scrollbar-visible {\n    opacity: 1;\n}\n\n.vt-scrollbar-thumb {\n    position: absolute;\n    top: 0;\n    left: 0;\n    width: 100%;\n    min-height: 30px;\n    background: rgba(255, 255, 255, 0.5);\n    border-radius: 3px;\n    transition: transform 0.15s ease-out, background 0.15s ease;\n}\n\n.vt-scrollbar-thumb:hover {\n    background: rgba(255, 255, 255, 0.7);\n}\n\n\n.vt-button {\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    padding: 16px 24px;\n    background: #2a2a2a;\n    border-radius: 8px;\n    cursor: pointer;\n    transition: background 0.15s ease;\n    font-size: 16px;\n    color: #fff;\n    flex-shrink: 0;\n}\n\n.vt-button:hover {\n    background: #333;\n}\n\n.vt-button.vt-item-focused {\n    background: #3a3a3a;\n    outline: 2px solid #fff;\n    outline-offset: -2px;\n}\n", "/src/preload/modules/volume-control/style.css": "div[idomkey=\"lazy-mdx-volume\"] { /*hide ugly legacy volume indicator that appears when setVolume is called on player*/\n    display: none;\n}\n\n#vt-volume-indicator {\n    position: fixed;\n    bottom: 80px;\n    left: 50%;\n    transform: translateX(-50%);\n    background-color: rgba(0, 0, 0, 0.5);\n    color: white;\n    padding: 12px 24px;\n    border-radius: 1.5rem;\n    display: flex;\n    align-items: center;\n    z-index: 999999;\n    opacity: 0;\n    transition: opacity 0.3s ease-in-out;\n    pointer-events: none;\n}\n\n#vt-volume-indicator.visible {\n    opacity: 1;\n}\n\n.vt-volume-icon {\n    width: 24px;\n    height: 24px;\n    margin-right: 16px;\n    font-size: 24px;\n    font-family: 'YouTube Icons Outlined';\n}\n\n.vt-volume-icon.vt-volume-high::before {\n    content: '\\ed89';\n}\n\n.vt-volume-icon.vt-volume-low::before {\n    content: '\\ed8a';\n}\n\n.vt-volume-icon.vt-volume-muted::before {\n    content: '\\e04e';\n}\n\n.vt-volume-bar-container {\n    width: 200px;\n    height: 8px;\n    background-color: rgba(255, 255, 255, 0.3);\n    border-radius: 4px;\n    overflow: hidden;\n}\n\n.vt-volume-bar {\n    height: 100%;\n    width: 50%;\n    background-color: white;\n    border-radius: 4px;\n    transition: width 0.1s linear;\n}\n\n.vt-volume-text {\n    font-size: 18px;\n    font-weight: 500;\n    min-width: 55px;\n    text-align: right;\n    margin-left: 16px;\n}", "/src/preload/style.css": "/*css patches*/\n\n::-webkit-scrollbar { /*hide native scrollbars from enableTouchSupport in touch-support.js*/\n    display: none;\n}\n\nbody {\n    user-select: none; /*without this, you can accidentally ctrl+a and select everything, have to refresh to fix*/\n}"}

},
"/src/xbox/shims/event-emitter.js": function(module, exports, require, __filename, __dirname){
class EventEmitter {
    constructor() { this.listeners = new Map() }
    on(name, fn) {
        const list = this.listeners.get(name) || []
        list.push(fn)
        this.listeners.set(name, list)
        return this
    }
    off(name, fn) {
        const list = this.listeners.get(name) || []
        this.listeners.set(name, list.filter(item => item !== fn))
        return this
    }
    once(name, fn) {
        const wrapped = (...args) => { this.off(name, wrapped); fn(...args) }
        return this.on(name, wrapped)
    }
    emit(name, ...args) {
        for (const fn of [...(this.listeners.get(name) || [])]) {
            try { fn(...args) } catch (error) { console.error('[VacuumTube Xbox] event listener failed', error) }
        }
        return true
    }
}
module.exports = { EventEmitter }

},
"/src/xbox/shims/fs.js": function(module, exports, require, __filename, __dirname){
const resources = require('../generated/resources')
function key(path) { return String(path).replace(/\\/g, '/').replace(/\/+/g, '/') }
function lookup(path) {
    const normalized = key(path)
    if (Object.prototype.hasOwnProperty.call(resources, normalized)) return resources[normalized]
    const found = Object.keys(resources).find(resource => normalized.endsWith(resource))
    if (found) return resources[found]
    throw new Error(`Embedded resource not found: ${path}`)
}
function readFileSync(path, encoding) {
    const value = lookup(path)
    return encoding ? value : new TextEncoder().encode(value)
}
function readdirSync(path) {
    const normalized = key(path).replace(/\/$/, '') + '/'
    return Object.keys(resources)
        .filter(resource => resource.startsWith(normalized))
        .map(resource => resource.slice(normalized.length).split('/')[0])
        .filter((value, index, array) => value && array.indexOf(value) === index)
}
module.exports = {
    readFileSync,
    readdirSync,
    existsSync: path => { try { lookup(path); return true } catch { return false } },
    promises: {
        readFile: async (path, encoding) => readFileSync(path, encoding),
        readdir: async path => readdirSync(path)
    }
}

},
"/src/xbox/shims/host-bridge.js": function(module, exports, require, __filename, __dirname){
const { EventEmitter } = require('./event-emitter')
const emitter = new EventEmitter()
const pending = new Map()
let nextId = 1
let config = { ...(window.__VACUUMTUBE_BOOTSTRAP_CONFIG__ || {}) }

function post(payload) {
    if (window.chrome?.webview?.postMessage) window.chrome.webview.postMessage(payload)
    else console.warn('[VacuumTube Xbox] native bridge unavailable', payload)
}

function emitConfig(next) {
    config = { ...config, ...(next || {}) }
    emitter.emit('config-update', {}, config)
}

if (window.chrome?.webview) {
    window.chrome.webview.addEventListener('message', event => {
        const message = event.data || {}
        if (message.type === 'reply') {
            const entry = pending.get(message.id)
            if (!entry) return
            pending.delete(message.id)
            if (message.error) entry.reject(new Error(message.error))
            else entry.resolve(message.result)
        } else if (message.type === 'event') {
            if (message.channel === 'config-update') emitConfig(message.args?.[0])
            else emitter.emit(message.channel, {}, ...(message.args || []))
        }
    })
}

const ipcRenderer = {
    sendSync(channel, value) {
        if (channel === 'get-config') return config
        if (channel === 'set-config') {
            emitConfig(value)
            post({ type: 'invoke', id: 0, channel, args: [value] })
            return config
        }
        return null
    },
    invoke(channel, ...args) {
        const id = nextId++
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject })
            post({ type: 'invoke', id, channel, args })
            setTimeout(() => {
                if (!pending.has(id)) return
                pending.delete(id)
                reject(new Error(`Native request timed out: ${channel}`))
            }, 15000)
        })
    },
    on(channel, callback) { emitter.on(channel, callback); return ipcRenderer },
    removeListener(channel, callback) { emitter.off(channel, callback); return ipcRenderer }
}

const shell = {
    openExternal: url => ipcRenderer.invoke('open-external', String(url)),
    openPath: path => ipcRenderer.invoke('open-path', String(path))
}

const vacuumTubeHost = {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    request: options => ipcRenderer.invoke('http-request', options || {}),
    getConfig: () => ({ ...config }),
    platform: window.__VACUUMTUBE_PLATFORM__ || {}
}

window.__vtBridge = { ipcRenderer, emitter, post, getConfig: () => config }
window.vacuumTubeHost = vacuumTubeHost
module.exports = { ipcRenderer, shell, vacuumTubeHost }

},
"/src/xbox/shims/path.js": function(module, exports, require, __filename, __dirname){
function normalize(value) {
    const absolute = String(value).startsWith('/')
    const output = []
    for (const part of String(value).replace(/\\/g, '/').split('/')) {
        if (!part || part === '.') continue
        if (part === '..') output.pop()
        else output.push(part)
    }
    return (absolute ? '/' : '') + output.join('/')
}
function join(...parts) { return normalize(parts.filter(Boolean).join('/')) }
function basename(value) { const parts = normalize(value).split('/'); return parts[parts.length - 1] || '' }
function dirname(value) { const parts = normalize(value).split('/'); parts.pop(); return parts.join('/') || '.' }
module.exports = { join, basename, dirname, normalize, sep: '/' }

},
"/src/xbox/shims/sponsorblock-api.js": function(module, exports, require, __filename, __dirname){
/**
 * Browser/WebView2-compatible subset of `sponsorblock-api`.
 *
 * API shape intentionally matches the upstream Node package used by VacuumTube:
 *   Load the exported SponsorBlock class through the local bundler alias.
 *   const client = new SponsorBlock(userID)
 *   await client.getSegments(videoID, ['sponsor'])
 *
 * Upstream reference: https://github.com/origeva/node-sponsorblock-api
 * SponsorBlock API: https://sponsor.ajay.app/api/
 */

const DEFAULT_OPTIONS = Object.freeze({
    baseURL: 'https://sponsor.ajay.app',
    hashPrefixLength: 4,
    service: 'YouTube',
    userAgent: 'VacuumTube-Xbox-WebView2'
})

class ResponseError extends Error {
    constructor(status, message, body = null) {
        super(message || `SponsorBlock request failed (${status})`)
        this.name = 'ResponseError'
        this.status = status
        this.body = body
    }
}

function normalizeBaseURL(value) {
    return String(value || DEFAULT_OPTIONS.baseURL).replace(/\/+$/, '')
}

function mapSegment(item) {
    if (!item || !Array.isArray(item.segment)) return null

    return {
        UUID: item.UUID,
        startTime: Number(item.segment[0]),
        endTime: Number(item.segment[1]),
        category: item.category,
        actionType: item.actionType || 'skip',
        videoDuration: Number(item.videoDuration || 0),
        locked: item.locked,
        votes: item.votes,
        description: item.description
    }
}

async function sha256Hex(value) {
    const cryptoObject = globalThis.crypto
    if (!cryptoObject || !cryptoObject.subtle) {
        throw new Error('[SponsorBlock] Web Crypto is unavailable in this WebView2 runtime')
    }

    const bytes = new TextEncoder().encode(String(value))
    const digest = await cryptoObject.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

class SponsorBlock {
    constructor(userID, options = {}) {
        this.userID = userID
        this.options = {
            ...DEFAULT_OPTIONS,
            ...options,
            baseURL: normalizeBaseURL(options.baseURL)
        }
    }

    async _request(path, query = {}) {
        const url = new URL(`${this.options.baseURL}${path}`)
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null || value === '') continue
            url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value))
        }

        // The native Xbox host can proxy requests when page CSP/CORS blocks fetch.
        if (globalThis.vacuumTubeHost && typeof globalThis.vacuumTubeHost.request === 'function') {
            const response = await globalThis.vacuumTubeHost.request({
                method: 'GET',
                url: url.toString(),
                headers: { Accept: 'application/json' }
            })

            const status = Number(response && response.status)
            if (status === 404) return []
            if (status < 200 || status >= 300) {
                throw new ResponseError(status, response && response.statusText, response && response.body)
            }

            if (typeof response.body === 'string') return JSON.parse(response.body)
            return response.body
        }

        const response = await fetch(url.toString(), {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-store',
            headers: { Accept: 'application/json' }
        })

        if (response.status === 404) return []

        let body = null
        const text = await response.text()
        if (text) {
            try {
                body = JSON.parse(text)
            } catch {
                body = text
            }
        }

        if (!response.ok) {
            const message = body && typeof body === 'object'
                ? body.message || body.error
                : response.statusText
            throw new ResponseError(response.status, message, body)
        }

        return body
    }

    async getSegments(videoID, categories = ['sponsor'], ...requiredSegments) {
        const data = await this._request('/api/skipSegments', {
            videoID,
            service: this.options.service,
            categories,
            requiredSegments: requiredSegments.length ? requiredSegments : undefined
        })

        return (Array.isArray(data) ? data : []).map(mapSegment).filter(Boolean)
    }

    async getSegmentsPrivately(videoID, categories = ['sponsor'], ...requiredSegments) {
        const hash = await sha256Hex(videoID)
        const prefix = hash.slice(0, this.options.hashPrefixLength)
        const data = await this._request(`/api/skipSegments/${prefix}`, {
            service: this.options.service,
            categories,
            requiredSegments: requiredSegments.length ? requiredSegments : undefined
        })

        const match = (Array.isArray(data) ? data : []).find((item) => item && item.videoID === videoID)
        if (!match || !Array.isArray(match.segments)) return []
        return match.segments.map(mapSegment).filter(Boolean)
    }
}

module.exports = {
    SponsorBlock,
    ResponseError,
    defaultOptions: DEFAULT_OPTIONS
}

},
};
const __deps = {"/src/xbox/browser-entry.js": {"../preload/util/xhrModifiers": "/src/preload/util/xhrModifiers.js", "../preload/modules/adblock": "/src/preload/modules/adblock.js", "../preload/modules/block-sign-in-popup": "/src/preload/modules/block-sign-in-popup.js", "../preload/modules/controller-support": "/src/preload/modules/controller-support.js", "../preload/modules/css": "/src/preload/modules/css.js", "../preload/modules/dearrow": "/src/preload/modules/dearrow.js", "../preload/modules/disable-direct-sign-in": "/src/preload/modules/disable-direct-sign-in.js", "../preload/modules/encryption-notice": "/src/preload/modules/encryption-notice.js", "../preload/modules/fix-exit": "/src/preload/modules/fix-exit.js", "../preload/modules/fix-reloads": "/src/preload/modules/fix-reloads.js", "../preload/modules/fix-voice": "/src/preload/modules/fix-voice.js", "../preload/modules/h264ify": "/src/preload/modules/h264ify.js", "../preload/modules/h5vcc": "/src/preload/modules/h5vcc/index.js", "../preload/modules/hide-shorts": "/src/preload/modules/hide-shorts.js", "../preload/modules/identification": "/src/preload/modules/identification.js", "../preload/modules/keybinds": "/src/preload/modules/keybinds.js", "../preload/modules/leanback-settings": "/src/preload/modules/leanback-settings.js", "../preload/modules/low-memory-mode": "/src/preload/modules/low-memory-mode.js", "../preload/modules/mouse": "/src/preload/modules/mouse.js", "../preload/modules/music-mode": "/src/preload/modules/music-mode/index.js", "../preload/modules/no-f11": "/src/preload/modules/no-f11.js", "../preload/modules/pause-on-blur": "/src/preload/modules/pause-on-blur.js", "../preload/modules/remove-super-resolution": "/src/preload/modules/remove-super-resolution.js", "../preload/modules/return-youtube-dislike": "/src/preload/modules/return-youtube-dislike.js", "../preload/modules/settings": "/src/preload/modules/settings/index.js", "../preload/modules/sponsorblock": "/src/preload/modules/sponsorblock.js", "../preload/modules/support-webp": "/src/preload/modules/support-webp.js", "../preload/modules/touch-support": "/src/preload/modules/touch-support.js", "../preload/modules/voice-privacy-notice": "/src/preload/modules/voice-privacy-notice.js", "../preload/modules/volume-control": "/src/preload/modules/volume-control/index.js"}, "/src/preload/util/xhrModifiers.js": {"./functions": "/src/preload/util/functions.js"}, "/src/preload/util/functions.js": {}, "/src/preload/modules/adblock.js": {"../util/jsonModifiers": "/src/preload/util/jsonModifiers.js", "../util/xhrModifiers": "/src/preload/util/xhrModifiers.js", "../config": "/src/preload/config.js"}, "/src/preload/util/jsonModifiers.js": {}, "/src/preload/config.js": {"vacuumtube-host": "/src/xbox/shims/host-bridge.js"}, "/src/xbox/shims/host-bridge.js": {"./event-emitter": "/src/xbox/shims/event-emitter.js"}, "/src/xbox/shims/event-emitter.js": {}, "/src/preload/modules/block-sign-in-popup.js": {"../util/resolveCommandModifiers": "/src/preload/util/resolveCommandModifiers.js"}, "/src/preload/util/resolveCommandModifiers.js": {}, "/src/preload/modules/controller-support.js": {"vacuumtube-host": "/src/xbox/shims/host-bridge.js", "../util/controller": "/src/preload/util/controller.js", "../util/ui": "/src/preload/util/ui.js", "../util/localeProvider": "/src/preload/util/localeProvider.js", "../config": "/src/preload/config.js"}, "/src/preload/util/controller.js": {"vacuumtube-host": "/src/xbox/shims/host-bridge.js", "tseep/lib/ee-safe": "/src/xbox/shims/event-emitter.js"}, "/src/preload/util/ui.js": {"./resolveCommandModifiers": "/src/preload/util/resolveCommandModifiers.js"}, "/src/preload/util/localeProvider.js": {"fs": "/src/xbox/shims/fs.js", "path": "/src/xbox/shims/path.js", "./functions": "/src/preload/util/functions.js"}, "/src/xbox/shims/fs.js": {"../generated/resources": "/src/xbox/generated/resources.js"}, "/src/xbox/generated/resources.js": {}, "/src/xbox/shims/path.js": {}, "/src/preload/modules/css.js": {"fs": "/src/xbox/shims/fs.js", "path": "/src/xbox/shims/path.js", "../util/css": "/src/preload/util/css.js"}, "/src/preload/util/css.js": {"../util/functions": "/src/preload/util/functions.js"}, "/src/preload/modules/dearrow.js": {"../util/xhrModifiers": "/src/preload/util/xhrModifiers.js", "../config": "/src/preload/config.js", "../util/httpClient": "/src/preload/util/httpClient.js"}, "/src/preload/util/httpClient.js": {}, "/src/preload/modules/disable-direct-sign-in.js": {"../util/configOverrides": "/src/preload/util/configOverrides.js"}, "/src/preload/util/configOverrides.js": {"./functions": "/src/preload/util/functions.js"}, "/src/preload/modules/encryption-notice.js": {"../util/resolveCommandModifiers": "/src/preload/util/resolveCommandModifiers.js", "../util/localeProvider": "/src/preload/util/localeProvider.js"}, "/src/preload/modules/fix-exit.js": {"vacuumtube-host": "/src/xbox/shims/host-bridge.js", "../util/resolveCommandModifiers": "/src/preload/util/resolveCommandModifiers.js"}, "/src/preload/modules/fix-reloads.js": {"vacuumtube-host": "/src/xbox/shims/host-bridge.js", "../util/resolveCommandModifiers": "/src/preload/util/resolveCommandModifiers.js"}, "/src/preload/modules/fix-voice.js": {"vacuumtube-host": "/src/xbox/shims/host-bridge.js", "../util/configOverrides": "/src/preload/util/configOverrides.js", "../util/functions": "/src/preload/util/functions.js"}, "/src/preload/modules/h264ify.js": {"../config": "/src/preload/config.js"}, "/src/preload/modules/h5vcc/index.js": {"vacuumtube-host": "/src/xbox/shims/host-bridge.js", "../../config": "/src/preload/config.js", "../../../xbox/app-info.json": "/src/xbox/app-info.json"}, "/src/xbox/app-info.json": {}, "/src/preload/modules/hide-shorts.js": {"../util/xhrModifiers": "/src/preload/util/xhrModifiers.js", "../config": "/src/preload/config.js"}, "/src/preload/modules/identification.js": {"../../xbox/app-info.json": "/src/xbox/app-info.json", "../util/xhrModifiers": "/src/preload/util/xhrModifiers.js", "../util/configOverrides": "/src/preload/util/configOverrides.js", "../util/functions": "/src/preload/util/functions.js"}, "/src/preload/modules/keybinds.js": {"../util/ui": "/src/preload/util/ui.js", "../util/resolveCommandModifiers": "/src/preload/util/resolveCommandModifiers.js", "../util/patchFunction": "/src/preload/util/patchFunction.js", "../util/localeProvider": "/src/preload/util/localeProvider.js"}, "/src/preload/util/patchFunction.js": {}, "/src/preload/modules/leanback-settings.js": {"vacuumtube-host": "/src/xbox/shims/host-bridge.js", "../config": "/src/preload/config.js", "../util/jsonModifiers": "/src/preload/util/jsonModifiers.js", "../util/resolveCommandModifiers": "/src/preload/util/resolveCommandModifiers.js", "../util/localeProvider": "/src/preload/util/localeProvider.js", "../util/functions": "/src/preload/util/functions.js"}, "/src/preload/modules/low-memory-mode.js": {"../config": "/src/preload/config.js", "../util/configOverrides": "/src/preload/util/configOverrides.js"}, "/src/preload/modules/mouse.js": {}, "/src/preload/modules/music-mode/index.js": {"vacuumtube-host": "/src/xbox/shims/host-bridge.js", "../../config": "/src/preload/config.js", "../../util/functions": "/src/preload/util/functions.js", "../../util/jsonModifiers": "/src/preload/util/jsonModifiers.js", "../../util/localeProvider": "/src/preload/util/localeProvider.js", "../../util/resolveCommandModifiers": "/src/preload/util/resolveCommandModifiers.js", "./player-response": "/src/preload/modules/music-mode/player-response.js"}, "/src/preload/modules/music-mode/player-response.js": {}, "/src/preload/modules/no-f11.js": {}, "/src/preload/modules/pause-on-blur.js": {"vacuumtube-host": "/src/xbox/shims/host-bridge.js", "../config": "/src/preload/config.js", "../util/resolveCommandModifiers": "/src/preload/util/resolveCommandModifiers.js"}, "/src/preload/modules/remove-super-resolution.js": {"../util/jsonModifiers": "/src/preload/util/jsonModifiers.js", "../config": "/src/preload/config.js"}, "/src/preload/modules/return-youtube-dislike.js": {"../util/xhrModifiers": "/src/preload/util/xhrModifiers.js", "../util/localeProvider": "/src/preload/util/localeProvider.js", "../config": "/src/preload/config.js", "../util/httpClient": "/src/preload/util/httpClient.js"}, "/src/preload/modules/settings/index.js": {"fs": "/src/xbox/shims/fs.js", "path": "/src/xbox/shims/path.js", "vacuumtube-host": "/src/xbox/shims/host-bridge.js", "../../config": "/src/preload/config.js", "../../util/css": "/src/preload/util/css.js", "../../util/localeProvider": "/src/preload/util/localeProvider.js", "../../util/functions": "/src/preload/util/functions.js", "../../util/controller": "/src/preload/util/controller.js", "./dom": "/src/preload/modules/settings/dom.js", "./scroll": "/src/preload/modules/settings/scroll.js", "./panels/features": "/src/preload/modules/settings/panels/features.js", "./panels/h264ify": "/src/preload/modules/settings/panels/h264ify.js", "./panels/mac-permissions": "/src/preload/modules/settings/panels/mac-permissions.js"}, "/src/preload/modules/settings/dom.js": {"../../util/functions": "/src/preload/util/functions.js"}, "/src/preload/modules/settings/scroll.js": {}, "/src/preload/modules/settings/panels/features.js": {"../dom": "/src/preload/modules/settings/dom.js", "../scroll": "/src/preload/modules/settings/scroll.js", "../../../config": "/src/preload/config.js"}, "/src/preload/modules/settings/panels/h264ify.js": {"../dom": "/src/preload/modules/settings/dom.js", "../scroll": "/src/preload/modules/settings/scroll.js", "../../../config": "/src/preload/config.js"}, "/src/preload/modules/settings/panels/mac-permissions.js": {"vacuumtube-host": "/src/xbox/shims/host-bridge.js", "../dom": "/src/preload/modules/settings/dom.js", "../scroll": "/src/preload/modules/settings/scroll.js"}, "/src/preload/modules/sponsorblock.js": {"sponsorblock-api": "/src/xbox/shims/sponsorblock-api.js", "../util/ui": "/src/preload/util/ui.js", "../util/localeProvider": "/src/preload/util/localeProvider.js", "../config": "/src/preload/config.js"}, "/src/xbox/shims/sponsorblock-api.js": {}, "/src/preload/modules/support-webp.js": {"../util/configOverrides": "/src/preload/util/configOverrides.js"}, "/src/preload/modules/touch-support.js": {"../util/configOverrides": "/src/preload/util/configOverrides.js", "../config": "/src/preload/config.js"}, "/src/preload/modules/voice-privacy-notice.js": {"../util/configOverrides": "/src/preload/util/configOverrides.js"}, "/src/preload/modules/volume-control/index.js": {"fs": "/src/xbox/shims/fs.js", "path": "/src/xbox/shims/path.js", "../../util/resolveCommandModifiers": "/src/preload/util/resolveCommandModifiers.js", "../../util/css": "/src/preload/util/css.js", "../../util/functions": "/src/preload/util/functions.js", "../../config": "/src/preload/config.js"}};
const __cache = {};
function __require(id){
  if (__cache[id]) return __cache[id].exports;
  const factory = __modules[id]; if (!factory) throw new Error("Module not found: " + id);
  const module = { exports: {} }; __cache[id] = module;
  const dirname = id.slice(0, id.lastIndexOf("/")) || "/";
  const localRequire = spec => { const target = (__deps[id] || {})[spec]; if (!target) throw new Error(`Cannot require ${spec} from ${id}`); return __require(target); };
  factory(module, module.exports, localRequire, id, dirname);
  return module.exports;
}
__require("/src/xbox/browser-entry.js");
})();
