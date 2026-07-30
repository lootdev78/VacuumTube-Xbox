// Identify the injected Leanback client as VacuumTube on Xbox while retaining
// the Cobalt-compatible network user agent used to access /tv reliably.
const packageInfo = require('../../xbox/app-info.json')
const xhrModifiers = require('../util/xhrModifiers')
const configOverrides = require('../util/configOverrides')
const functions = require('../util/functions')

const platform = window.__VACUUMTUBE_PLATFORM__ || {}
const browserVersion = process.versions.chrome || platform.webViewVersion || '0'
const deviceModel = platform.model || 'Xbox One / Series X|S'
const osVersion = platform.osVersion || '10.0'

const identity = {
    platform: 'GAME_CONSOLE',
    platformDetail: 'XBOX',
    clientFormFactor: 'UNKNOWN_FORM_FACTOR',
    deviceMake: 'Microsoft',
    deviceModel,
    browserName: 'Chrome',
    browserVersion,
    osName: 'Xbox',
    osVersion,
    tvAppInfo: { releaseVehicle: '__DELETE__' }
}

module.exports = () => {
    configOverrides.environmentOverrides.push({
        platform: 'GAME_CONSOLE',
        platform_detail: 'XBOX',
        brand: 'VacuumTube',
        model: `${packageInfo.version} (${deviceModel})`,
        engine: 'WebKit',
        browser_engine: 'WebKit',
        browser_engine_version: '537.36',
        browser: 'Chrome',
        browser_version: browserVersion,
        os: 'Xbox',
        os_version: osVersion,
        feature_switches: {
            mdx_device_label: `VacuumTube on ${platform.deviceName || 'Xbox'}`
        }
    })

    configOverrides.ytcfgOverrides.push({
        INNERTUBE_CONTEXT: { client: identity },
        WEB_PLAYER_CONTEXT_CONFIGS: {
            WEB_PLAYER_CONTEXT_CONFIG_ID_LIVING_ROOM_WATCH: {
                device: {
                    platform: 'GAME_CONSOLE',
                    platformDetail: 'XBOX',
                    brand: 'VacuumTube',
                    model: deviceModel,
                    browser: 'Chrome',
                    browserVersion,
                    os: 'Xbox',
                    osVersion,
                    cobaltReleaseVehicle: '__DELETE__'
                }
            }
        }
    })

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
                functions.deepMerge(device, {
                    platform: 'GAME_CONSOLE',
                    platformDetail: 'XBOX',
                    brand: 'VacuumTube',
                    model: deviceModel,
                    browser: 'Chrome',
                    browserVersion,
                    os: 'Xbox',
                    osVersion,
                    cobaltReleaseVehicle: '__DELETE__'
                })
                parts[index] = JSON.stringify(json)
                return parts.join('\n')
            }
        } catch (error) {
            console.warn('[Identification] Failed to patch tv_config', error)
        }
    })
}
