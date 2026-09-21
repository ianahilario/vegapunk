import assert from 'node:assert/strict'
import { validateConfig } from './load.js'

const ai = {
  provider: 'openai' as const,
  model: 'gpt-4o',
  apiKey: 'sk-test',
}

const allowedOrigins = ['https://staging.example.com']

assert.equal(validateConfig({ timebox: 120_000, ai, allowedOrigins }).timebox, 120_000)
assert.throws(() => validateConfig({ ai } as never))
assert.throws(() => validateConfig({ timebox: -1, ai, allowedOrigins }))
assert.throws(() => validateConfig({ timebox: 120_000, ai } as never))
assert.throws(() => validateConfig({ timebox: 120_000, ai, allowedOrigins: [] }))
assert.throws(() =>
  validateConfig({ timebox: 120_000, ai, allowedOrigins: ['^https://staging\\.example\\.com$'] }),
)

const mixed = validateConfig({
  timebox: 120_000,
  ai,
  allowedOrigins: [
    'https://staging.example.com',
    /^https:\/\/pr-\d+\.preview\.example\.com$/,
    new RegExp('^https://pr-\\d+\\.preview\\.example\\.com$'),
  ],
})
assert.equal(mixed.allowedOrigins.length, 3)

console.log('config ok')
