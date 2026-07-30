'use strict'

const assert = require('node:assert/strict')
const { SponsorBlock } = require('../src/xbox/shims/sponsorblock-api')

async function main() {
    const calls = []
    globalThis.vacuumTubeHost = {
        async request(options) {
            calls.push(options)
            const url = new URL(options.url)
            if (url.pathname === '/api/skipSegments/5f6b') {
                return {
                    status: 200,
                    statusText: 'OK',
                    headers: {},
                    body: JSON.stringify([{
                        videoID: 'dQw4w9WgXcQ',
                        segments: [{ UUID: 'segment-1', segment: [10, 20], category: 'sponsor', actionType: 'skip' }]
                    }])
                }
            }
            if (url.pathname === '/api/skipSegments') {
                return {
                    status: 200,
                    statusText: 'OK',
                    headers: {},
                    body: JSON.stringify([{ UUID: 'segment-2', segment: [30, 45], category: 'sponsor' }])
                }
            }
            return { status: 404, statusText: 'Not Found', headers: {}, body: '' }
        }
    }

    const client = new SponsorBlock('test-user')
    const privateSegments = await client.getSegmentsPrivately('dQw4w9WgXcQ', ['sponsor'])
    assert.equal(new URL(calls[0].url).pathname, '/api/skipSegments/5f6b')
    assert.deepEqual(privateSegments.map(x => [x.startTime, x.endTime, x.category]), [[10, 20, 'sponsor']])

    const publicSegments = await client.getSegments('abc123', ['sponsor'])
    const publicUrl = new URL(calls[1].url)
    assert.equal(publicUrl.pathname, '/api/skipSegments')
    assert.equal(publicUrl.searchParams.get('videoID'), 'abc123')
    assert.deepEqual(publicSegments.map(x => [x.startTime, x.endTime, x.actionType]), [[30, 45, 'skip']])

    console.log('SponsorBlock adapter: OK (SHA-256 prefix 5f6b, private/public mapping, native proxy)')
}

main().catch(error => {
    console.error(error)
    process.exitCode = 1
})
