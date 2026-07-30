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
