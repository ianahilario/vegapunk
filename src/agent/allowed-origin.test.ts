import assert from 'node:assert/strict'
import {
  assertAllowedOrigin,
  isOriginAllowed,
  isOriginRefusedError,
  OriginRefusedError,
  parseAllowedOrigins,
  refusedOriginMessage,
} from './allowed-origin.js'

const staging = parseAllowedOrigins(['https://staging.example.com'])

assert.equal(isOriginAllowed('https://staging.example.com', staging), true)
assert.equal(isOriginAllowed('https://staging.example.com/', staging), true)
assert.equal(isOriginAllowed('https://staging.example.com:443/app', staging), true)
assert.equal(isOriginAllowed('https://staging.example.com/settings?x=1', staging), true)
assert.equal(isOriginAllowed('http://localhost:3000', staging), false)
assert.equal(isOriginAllowed('https://prod.example.com', staging), false)
assert.equal(isOriginAllowed('https://notstaging.example.com', staging), false)
assert.equal(isOriginAllowed('about:blank', staging), false)
assert.equal(isOriginAllowed('https://evil.example/https://staging.example.com', staging), false)

assert.doesNotThrow(() => assertAllowedOrigin('https://staging.example.com/app', staging))
assert.throws(
  () => assertAllowedOrigin('https://prod.example.com', staging),
  (error: unknown) => {
    assert.equal(error instanceof OriginRefusedError, true)
    assert.match(String(error), /not on allowedOrigins.*production data is not sent to the model/)
    return true
  },
)
assert.equal(
  isOriginRefusedError(new OriginRefusedError(refusedOriginMessage('https://prod.example.com', staging))),
  true,
)
assert.equal(isOriginRefusedError(new Error('Error executing tool: not on allowedOrigins')), true)
assert.equal(isOriginRefusedError(new Error('timeout')), false)

const slash = parseAllowedOrigins(['https://staging.example.com/'])
assert.equal(slash[0]?.display, 'https://staging.example.com')
assert.equal(isOriginAllowed('https://staging.example.com', slash), true)

assert.throws(() => parseAllowedOrigins([]))
assert.throws(() => parseAllowedOrigins(['^https://staging\\.example\\.com$']))
assert.throws(() => parseAllowedOrigins(['staging.example.com']))

const previewLiteral = parseAllowedOrigins([/^https:\/\/pr-\d+\.preview\.example\.com$/])
assert.equal(isOriginAllowed('https://pr-12.preview.example.com', previewLiteral), true)
assert.equal(isOriginAllowed('https://pr-12.preview.example.com/app', previewLiteral), true)
assert.equal(isOriginAllowed('https://prod.example.com', previewLiteral), false)
assert.equal(isOriginAllowed('https://pr-12.preview.example.com.evil.example', previewLiteral), false)

const previewCtor = parseAllowedOrigins([
  new RegExp('^https://pr-\\d+\\.preview\\.example\\.com$'),
])
assert.equal(isOriginAllowed('https://pr-12.preview.example.com', previewCtor), true)
assert.equal(isOriginAllowed('https://prod.example.com', previewCtor), false)

const substring = parseAllowedOrigins([/staging\.example\.com/])
assert.equal(isOriginAllowed('https://notstaging.example.com', substring), false)
assert.equal(isOriginAllowed('https://staging.example.com', substring), false)

const mixed = parseAllowedOrigins([
  'http://localhost:3000',
  /^https:\/\/pr-\d+\.preview\.example\.com$/,
])
assert.equal(isOriginAllowed('http://localhost:3000/todos', mixed), true)
assert.equal(isOriginAllowed('https://pr-1.preview.example.com', mixed), true)
assert.equal(isOriginAllowed('https://prod.example.com', mixed), false)

const message = refusedOriginMessage('https://prod.example.com/secret', mixed)
assert.match(message, /Origin https:\/\/prod\.example\.com/)
assert.match(message, /http:\/\/localhost:3000/)
assert.match(message, /pr-\\d\+/)

console.log('allowed-origin ok')
