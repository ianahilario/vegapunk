import assert from 'node:assert/strict'
import { parseNetworkPaths, parseSnapshotControls, parseStorageKeys } from './targets.js'

const todomvc = `URL: https://demo.playwright.dev/todomvc/
Title: TodoMVC

- heading "todos" [level=1]
- textbox "What needs to be done?"
- list:
  - listitem:
    - checkbox "Toggle Todo" [checked]
    - generic: Buy milk
    - button "Delete"
- button "All" [pressed]
- button "Active"
- button "Completed"
- button "Clear completed"
- heading [level=2]: skipped yaml heading
`

const controls = parseSnapshotControls(todomvc)
assert.deepEqual(
  controls.map((control) => `${control.role}:${control.name}:${control.checked ? 1 : 0}`),
  [
    'textbox:What needs to be done?:0',
    'checkbox:Toggle Todo:1',
    'button:Delete:0',
    'button:All:0',
    'button:Active:0',
    'button:Completed:0',
    'button:Clear completed:0',
  ],
)

const yaml = `
- textbox: What needs to be done?
- button [pressed]: All
- checkbox [checked]: Toggle Todo
- button [disabled]: Hidden
`
const yamlControls = parseSnapshotControls(yaml)
assert.equal(yamlControls.length, 3)
assert.equal(yamlControls[0]?.role, 'textbox')
assert.equal(yamlControls[2]?.checked, true)

const net = parseNetworkPaths(`Network since last snapshot:
GET /api/todos 200 []
POST /api/todos 201 {}
GET /api/todos 200 []
`)
assert.deepEqual(net, [
  { method: 'GET', path: '/api/todos' },
  { method: 'POST', path: '/api/todos' },
])

const storage = parseStorageKeys(`Storage:
local theme=light
cookie session=abc
local (empty)
`)
assert.deepEqual(storage, [
  { kind: 'local', key: 'theme' },
  { kind: 'cookie', key: 'session' },
])

console.log('targets ok')
