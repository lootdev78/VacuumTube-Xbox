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
