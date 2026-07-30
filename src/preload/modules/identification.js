// Identify the Leanback client consistently as an Xbox Series X running Edge.
// The host applies the same Xbox UA to documents, requests, workers, YouTube,
// and Google authentication pages. Keeping these values aligned avoids the
// PS4/Cobalt/Xbox mismatch that can break guest and account state transitions.
const packageInfo = require('../../xbox/app-info.json')
const xhrModifiers = require('../util/xhrModifiers')
const configOverrides = require('../util/configOverrides')
const functions = require('../util/functions')

const platform = window.__VACUUMTUBE_PLATFORM__ || {}
const browserVersion = process.versions.chrome || platform.webViewVersion || '0'
const deviceModel = platform.userAgentModel || platform.model || 'Xbox Series X'
const osVersion = platform.osVersion || '10.0'

const identity = {
    platform: 'GAME_CONSOLE',
    platformDetail: 'XBOX',
    clientFormFactor: 'LARGE_FORM_FACTOR',
    deviceMake: 'Microsoft',
    deviceModel,
    browserName: 'Edge',
    browserVersion,
    osName: 'Xbox',
    osVersion,
    tvAppInfo: { releaseVehicle: '__DELETE__' }
}

const playerDevice = {
    platform: 'GAME_CONSOLE',
    platformDetail: 'XBOX',
    brand: 'Microsoft',
    model: deviceModel,
    browser: 'Edge',
    browserVersion,
    os: 'Xbox',
    osVersion,
    cobaltReleaseVehicle: '__DELETE__'
}

module.exports = () => {
    configOverrides.environmentOverrides.push({
        platform: 'GAME_CONSOLE',
        platform_detail: 'XBOX',
        brand: 'Microsoft',
        model: deviceModel,
        engine: 'WebKit',
        browser_engine: 'WebKit',
        browser_engine_version: '537.36',
        browser: 'Edge',
        browser_version: browserVersion,
        os: 'Xbox',
        os_version: osVersion,
        feature_switches: {
            mdx_device_label: `VacuumTube ${packageInfo.version} on ${platform.deviceName || deviceModel}`
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
    // Patch only the device/client identity; authentication tokens, visitor data,
    // delegated-session IDs, account IDs, and cookies remain untouched.
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
