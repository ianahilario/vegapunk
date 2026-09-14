import assert from 'node:assert/strict'
import {
  formatStorageEntries,
  guessContentType,
  isTooBroadRoutePattern,
  prepareFetchUrl,
  prepareRoutePattern,
} from './route.js'

const here = new URL('https://shop.example/cart')

assert.equal(isTooBroadRoutePattern('**'), true)
assert.equal(isTooBroadRoutePattern('**/*'), true)
assert.equal(isTooBroadRoutePattern('*'), true)
assert.equal(isTooBroadRoutePattern('**/checkout**'), false)
assert.equal(isTooBroadRoutePattern('/api/orders'), false)

assert.equal(prepareRoutePattern('**/*', here).ok, false)
assert.equal(prepareRoutePattern('', here).ok, false)

const glob = prepareRoutePattern('**/checkout**', here)
assert.deepEqual(glob, { ok: true, pattern: '**/checkout**' })

const path = prepareRoutePattern('/api/checkout', here)
assert.deepEqual(path, { ok: true, pattern: 'https://shop.example/api/checkout**' })

const relative = prepareRoutePattern('api/orders', here)
assert.deepEqual(relative, { ok: true, pattern: 'https://shop.example/api/orders**' })

const absolute = prepareRoutePattern('https://shop.example/pay', here)
assert.deepEqual(absolute, { ok: true, pattern: 'https://shop.example/pay**' })

assert.equal(prepareRoutePattern('https://evil.example/checkout', here).ok, false)
assert.equal(prepareRoutePattern('https://evil.example/**', here).ok, false)

assert.equal(guessContentType('{"ok":true}'), 'application/json')
assert.equal(guessContentType('nope'), 'text/plain')

assert.equal(prepareFetchUrl('**/x', here).ok, false)
assert.equal(prepareFetchUrl('https://evil.example/orders/1', here).ok, false)
assert.deepEqual(prepareFetchUrl('/api/orders/124', here), {
  ok: true,
  href: 'https://shop.example/api/orders/124',
})

assert.deepEqual(formatStorageEntries('local', {}), ['local (empty)'])
assert.equal(formatStorageEntries('cookie', { session: 'abc' })[0], 'cookie session=abc')

console.log('route ok')
