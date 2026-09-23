import assert from 'node:assert/strict'
import {
  buildJevCandidates,
  decisionsUrl,
  fillCatalog,
  isJevModel,
  issueEvidence,
  jevToolChoices,
  severityFromScore,
} from './jev.js'
import { createPersona } from '../persona.js'

assert.equal(isJevModel('~typesafe/jev-latest'), true)
assert.equal(isJevModel('typesafe/jev-1.13'), true)
assert.equal(isJevModel('deepseek/deepseek-v4-flash'), false)
assert.equal(isJevModel('openai/gpt-4o'), false)

assert.equal(decisionsUrl(), 'https://openrouter.ai/api/alpha/decisions')
assert.equal(
  decisionsUrl('https://openrouter.ai/api/v1'),
  'https://openrouter.ai/api/alpha/decisions',
)
assert.equal(
  decisionsUrl('https://openrouter.ai/api/v1/'),
  'https://openrouter.ai/api/alpha/decisions',
)
assert.equal(
  decisionsUrl('https://openrouter.ai/api/alpha/decisions'),
  'https://openrouter.ai/api/alpha/decisions',
)

assert.equal(severityFromScore(0.2), 'low')
assert.equal(severityFromScore(1), 'medium')
assert.equal(severityFromScore(2.4), 'high')
assert.equal(severityFromScore(2.6), 'critical')

const persona = createPersona({
  id: 'default',
  title: 'Default user',
  profile: 'Uses the product the way it was designed.',
})

const snapshot = `URL: https://demo.playwright.dev/todomvc/
Title: TodoMVC

- textbox "What needs to be done?"
- button "All"
- checkbox "Toggle Todo"
- combobox "Filter"
- option "Active"
- button "Choose File"

Network since last snapshot:
GET /api/todos 200 []

Storage:
local theme=light

Console since last snapshot:
[error] Uncaught TypeError

A11y scan:
button-name critical .save missing name
`

const tools = jevToolChoices(snapshot, persona, 'Explore adding todos.')
assert.ok(tools.click)
assert.ok(tools.fill)
assert.ok(tools.goBack)
assert.ok(tools.goto)
assert.ok(tools.press)
assert.ok(tools.hover)
assert.ok(tools.handleDialog)
assert.ok(tools.setNetwork)
assert.ok(tools.readStorage)
assert.ok(tools.writeStorage)
assert.ok(tools.emulateMedia)
assert.ok(tools.overrideRequest)
assert.ok(tools.pageFetch)
assert.ok(tools.selectOption)
assert.ok(tools.setInputFiles)
assert.ok(tools.checkOk)
assert.equal(tools.logIssue, undefined)

const fills = buildJevCandidates(snapshot, persona, 'Explore adding todos.', 'fill')
assert.ok(fills.some((candidate) => candidate.tool === 'fill'))
const fill = fills.find((candidate) => candidate.tool === 'fill')
assert.equal(fill?.args.value, 'Buy milk')
assert.equal(fill?.submit, true)

const clicks = buildJevCandidates(snapshot, persona, 'Explore adding todos.', 'click')
assert.ok(clicks.some((candidate) => candidate.args.name === 'All'))

const checks = buildJevCandidates(snapshot, persona, 'Explore adding todos.', 'check')
assert.ok(checks.some((candidate) => candidate.args.name === 'Toggle Todo'))

const overrides = buildJevCandidates(snapshot, persona, 'Explore adding todos.', 'overrideRequest')
assert.ok(overrides.some((candidate) => candidate.args.action === 'abort'))
assert.ok(overrides.some((candidate) => candidate.args.status === 500))

assert.equal(issueEvidence('console', snapshot), '[error] Uncaught TypeError')
assert.equal(issueEvidence('accessibility', snapshot), 'button-name critical .save missing name')
assert.equal(issueEvidence('functional', snapshot), 'What needs to be done?')

const hostile = fillCatalog('malicious', 'break it')
assert.equal(hostile[0]?.value, '')
assert.ok(hostile.some((entry) => entry.value.includes('script')))

console.log('jev ok')
