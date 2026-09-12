import assert from 'node:assert/strict'
import { parseDuration } from './duration.js'

assert.equal(parseDuration(1500), 1500)
assert.equal(parseDuration('20m'), 20 * 60 * 1000)
assert.equal(parseDuration('30s'), 30_000)
assert.equal(parseDuration('2h'), 2 * 60 * 60 * 1000)
assert.throws(() => parseDuration('nope' as never))
console.log('duration ok')
