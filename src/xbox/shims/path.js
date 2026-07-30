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
