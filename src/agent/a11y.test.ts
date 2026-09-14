import assert from 'node:assert/strict'
import { formatA11yViolations } from './a11y.js'

assert.deepEqual(formatA11yViolations([]), [])

const one = formatA11yViolations([
  {
    id: 'button-name',
    impact: 'critical',
    nodes: [
      {
        target: ['.save'],
        failureSummary: 'Fix any of the following:\n  Element does not have inner text that is visible to screen readers',
      },
    ],
  },
])
assert.equal(one.length, 1)
assert.match(one[0] ?? '', /button-name critical \.save/)
assert.match(one[0] ?? '', /does not have inner text/)

const many = formatA11yViolations(
  Array.from({ length: 20 }, (_, index) => ({
    id: `rule-${index}`,
    impact: 'serious',
    nodes: [{ target: [`#n${index}`], failureSummary: 'missing name' }],
  })),
)
assert.equal(many.length, 15)
assert.equal(many.at(-1), '…and 6 more')

assert.equal(
  formatA11yViolations([{ id: 'label', nodes: [{ target: [] }] }])[0],
  'label minor element',
)

console.log('a11y ok')
