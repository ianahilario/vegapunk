# Charters

A charter is an ordinary Playwright test. Import `test` from `@playwright/test` and `vegapunk` from `vegapunk`.

Anything before `vegapunk.explore()` is your setup. Anything after is teardown. Vegapunk only runs when you call it.

```ts
import { test } from '@playwright/test'
import { vegapunk } from 'vegapunk'
import { Persona } from '../personas'

test('a user can review settings then leave signed out', { tag: '@settings' }, async ({ page }) => {
  await page.goto('/settings')
  await vegapunk.explore({
    page,
    mission: 'Explore settings.',
    persona: Persona.DEFAULT,
  })
  await page.getByRole('button', { name: 'Log out' }).click()
  await vegapunk.explore({
    page,
    mission: 'Explore signed-out screens.',
    persona: Persona.ELDERLY,
    timebox: 5 * 60 * 1000,
  })
})
```

## `vegapunk.explore(options)`

Required:

- `page` — the Playwright page (already on the screen you want explored)
- `mission`
- `persona` — a `Persona` from `createPersona()`, not a string

Optional:

- `timebox` — overrides config `timebox` for this call, in milliseconds
- `ai` — partial override of config `ai` for this call (`provider`, `model`, `apiKey`, `baseURL`, `temperature`)
- `visual` — `true` sends a viewport screenshot each turn so the agent can judge overlap, contrast, clip, and overflow. Off by default (token cost). Needs a vision-capable model.

```ts
await vegapunk.explore({
  page,
  mission: 'Look for layout and contrast issues.',
  persona: Persona.DEFAULT,
  visual: true,
  ai: { model: 'qwen/qwen3.5-27b' },
})
```

You may call `vegapunk.explore()` more than once. Each call uses config `timebox` unless you pass one. Issues from the first call do not skip later calls or teardown. The test fails **at the end** if any issue was logged.

The agent can call `overrideRequest` to abort, mock, or tamper with same-origin XHR/fetch (checkout, pay, delete). Routes are removed when that `explore()` ends. Snapshots include recent Network lines so it can learn URLs. Charter-level `page.route()` still works for setup; the agent cannot see those routes, only the traffic.

`scanA11y` runs axe (WCAG 2.2 AA tags) on the current page. Findings show up on the next snapshot as A11y scan lines the agent can quote. `tab` moves focus and returns the focused role and name — use that for keyboard order, not `press` with Tab.

Other agent tools: `pageFetch` (same-origin, cookie-authenticated IDOR/hidden APIs), `readStorage` / `writeStorage`, `hover`, `setInputFiles`, `handleDialog` (register before the click), `emulateMedia`, and `setNetwork` (`offline` / `slow3g` / `fast3g` / `online`). Fetch, Storage, and Conditions lines are quoted like Network. `setNetwork` throttle needs Chromium. Routes, dialogs, media, and network profile are reset when that `explore()` ends.

## Timebox vs timeout

- Config **`timebox`** — Vegapunk’s default exploration stop. `vegapunk.explore({ timebox })` overrides it for that call. When the clock hits, the in-flight model call is aborted and the session closes immediately. There is no extra wrap-up turn.
- `timeout` — Playwright’s test duration limit (setup + every explore + teardown). Set it in `playwright.config.ts`, `{ timeout }` on the test, or `test.setTimeout()`.

Raise Playwright `timeout` when you have several `vegapunk.explore()` calls so the 30-second default does not kill a long explore.

## Tags

Use Playwright `{ tag: '@todos' }` or `{ tag: ['@todos', '@filters'] }`. Do not put `@tags` in the title.

The TodoMVC lab’s `todos.spec.ts` also shows `visual`, `ai`, and an `@a11y` auditor pass. Run the vision one with `--grep=@visual` and a vision-capable model. Run the scan with `--grep=@a11y`.
