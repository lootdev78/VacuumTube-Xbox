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
