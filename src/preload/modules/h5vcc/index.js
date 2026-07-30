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
