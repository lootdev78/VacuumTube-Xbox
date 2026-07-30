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
