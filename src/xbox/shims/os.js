const platform = window.__VACUUMTUBE_PLATFORM__ || {}
module.exports = {
    platform: () => 'win32',
    release: () => platform.osVersion || '10.0',
    hostname: () => platform.deviceName || 'Xbox',
    type: () => 'Xbox',
    arch: () => 'x64'
}
