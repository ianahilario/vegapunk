import assert from 'node:assert/strict'
import { parseDuration } from './duration.js'

assert.equal(parseDuration(1500), 1500)
assert.equal(parseDuration(120_000), 120_000)
assert.throws(() => parseDuration(-1))
assert.throws(() => parseDuration(Number.NaN))
console.log('duration ok')
