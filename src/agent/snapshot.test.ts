import assert from 'node:assert/strict'
import { waitUntilStable } from './snapshot.js'

{
  let index = 0
  const trees = ['Buy milk', 'empty', 'empty']
  const tree = await waitUntilStable(
    async () => trees[Math.min(index, trees.length - 1)] ?? '',
    async () => {
      index += 1
    },
    1_000,
    () => 0,
  )
  assert.equal(tree, 'empty')
  assert.equal(index, 2)
}

{
  let index = 0
  let clock = 0
  const tree = await waitUntilStable(
    async () => 'same',
    async () => {
      index += 1
      clock = 100
    },
    1_000,
    () => clock,
    100,
  )
  assert.equal(tree, 'same')
  assert.equal(index, 1)
}

{
  let clock = 0
  const tree = await waitUntilStable(
    async () => `t${clock}`,
    async () => {
      clock = 1_000
    },
    500,
    () => clock,
    100,
  )
  assert.equal(tree, 't0')
}

console.log('snapshot ok')
