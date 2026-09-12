import assert from 'node:assert/strict'
import { validateConfig } from './load.js'

const ai = {
  provider: 'openai' as const,
  model: 'gpt-4o',
  apiKey: 'sk-test',
}

assert.equal(validateConfig({ timebox: 120_000, ai }).timebox, 120_000)
assert.throws(() => validateConfig({ ai } as never))
assert.throws(() => validateConfig({ timebox: -1, ai }))
console.log('config ok')
