import assert from 'node:assert/strict'
import { textInSnapshot, ungroundedClaim } from './issues.js'

const completed = `URL: https://demo.playwright.dev/todomvc/#/completed
Title: React • TodoMVC

- heading "todos" [level=1]
- textbox "What needs to be done?"
- checkbox "❯Mark all as complete"
- list
- strong: "1"
- text: item left
- list:
  - listitem:
    - link "Completed":
      - /url: "#/completed"`

const a11y = `${completed}
A11y scan:
color-contrast serious h1 — Element has insufficient color contrast of 1.26 (foreground color: #ebd7d7, background color: #f5f5f5, font size: 75.0pt (100px), font weight: normal). Expected contrast ratio of 3:1`

assert.equal(textInSnapshot(completed, 'Buy milk'), false)
assert.equal(textInSnapshot(completed, 'item left'), true)
assert.equal(
  textInSnapshot(
    a11y,
    'h1 — Element has insufficient color contrast of 1.26 (foreground color: #ebd7d7, background color: #f5f5f5)',
  ),
  true,
)

const invented = ungroundedClaim(completed, {
  evidence: 'item left',
  actual:
    'The list shows "Buy milk" checkbox with text "Buy milk" even though this item is not completed and the filter is set to "Completed".',
  category: 'functional',
  visual: true,
})
assert.match(invented ?? '', /Buy milk/)

assert.match(
  ungroundedClaim(completed, {
    evidence: 'Buy milk',
    actual: 'The incomplete todo is still displayed.',
    category: 'functional',
    visual: true,
  }) ?? '',
  /not in the current snapshot/,
)

assert.equal(
  ungroundedClaim(completed, {
    evidence: 'item left',
    actual: 'The Completed filter shows an empty list while the counter still says 1 item left.',
    category: 'functional',
    visual: true,
  }),
  undefined,
)

assert.equal(
  ungroundedClaim(completed, {
    evidence: 'The footer overlaps the filter row',
    actual: 'The footer covers the Completed filter.',
    category: 'visual',
    visual: true,
  }),
  undefined,
)

assert.match(
  ungroundedClaim(completed, {
    evidence: 'The row is clipped',
    actual: 'The "Buy milk" row is clipped by the footer.',
    category: 'visual',
    visual: true,
  }) ?? '',
  /Buy milk/,
)

assert.equal(
  ungroundedClaim(a11y, {
    evidence: 'insufficient color contrast of 1.26',
    actual:
      'A11y scan reports: "h1 — Element has insufficient color contrast of 1.26 (foreground color: #ebd7d7, background color: #f5f5f5, font size: 75.0pt (100px), font weight: normal)."',
    category: 'accessibility',
    visual: true,
  }),
  undefined,
)

assert.match(
  ungroundedClaim(completed, {
    evidence: '   ',
    actual: 'The list is empty.',
    category: 'functional',
  }) ?? '',
  /empty/,
)

console.log('issues ok')
