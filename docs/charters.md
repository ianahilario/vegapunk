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
    timebox: 15 * 60 * 1000,
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
- `timebox` — how long this agent call may run (milliseconds, or `"20m"` / `"30s"`)

Optional:

- `ai` — partial override of config `ai` for this call (`provider`, `model`, `apiKey`, `baseURL`, `temperature`)
- `visual` — `true` sends a viewport screenshot each turn so the agent can judge overlap, contrast, clip, and overflow. Off by default (token cost). Needs a vision-capable model.

```ts
await vegapunk.explore({
  page,
  mission: 'Look for layout and contrast issues.',
  persona: Persona.DEFAULT,
  timebox: '10m',
  visual: true,
  ai: { model: 'qwen/qwen3.5-27b' },
})
```

You may call `vegapunk.explore()` more than once. Each call has its own timebox. Issues from the first call do not skip later calls or teardown. The test fails **at the end** if any issue was logged.

## Timebox vs timeout

- `vegapunk.explore({ timebox })` — Vegapunk’s exploration stop for **that call**. When the clock hits, the in-flight model call is aborted and the session closes immediately. There is no extra wrap-up turn.
- `timeout` — Playwright’s test duration limit (setup + every explore + teardown). Set it in `playwright.config.ts`, `{ timeout }` on the test, or `test.setTimeout()`.

Raise Playwright `timeout` when you have several `vegapunk.explore()` calls so the 30-second default does not kill a long explore.

## Tags

Use Playwright `{ tag: '@todos' }` or `{ tag: ['@todos', '@filters'] }`. Do not put `@tags` in the title.

The TodoMVC lab’s `todos.spec.ts` also shows `visual` and `ai`. Run the vision one with `--grep=@visual` and a vision-capable model.
