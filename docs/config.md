# Config

Vegapunk and Playwright each have a config file.

- `vegapunk.config.ts` — model settings (`ai`), default `timebox`, and `allowedOrigins`
- `playwright.config.ts` — `timeout`, `use`, `projects`, `reporter`, `testDir`, `outputDir`

```ts
import { defineConfig } from 'vegapunk'

export default defineConfig({
  timebox: 10 * 60 * 1000,
  allowedOrigins: ['https://demo.playwright.dev'],
  ai: {
    provider: 'openai-compatible',
    model: 'deepseek/deepseek-v4-flash',
    apiKey: process.env.AI_API_KEY ?? '',
    baseURL: 'https://openrouter.ai/api/v1',
    temperature: 0.6,
  },
})
```

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './charters',
  timeout: 15 * 60 * 1000,
  outputDir: './test-results',
  use: {
    baseURL: 'https://demo.playwright.dev/todomvc/',
  },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['vegapunk/reporter', { open: 'never' }],
  ],
})
```

`ai.apiKey` is required. How you load the key is up to you.

Register `vegapunk/reporter` in `playwright.config.ts` so the Vegapunk index is rebuilt at the end of the run. `vegapunk.explore()` loads `vegapunk.config.ts` for the model, default timebox, and `allowedOrigins`. Run charters with `npx playwright test`.

Vegapunk writes into `test-results/vegapunk-report/` (Playwright’s `outputDir` plus that subfolder). Playwright’s HTML reporter stays at `playwright-report/` so the two `index.html` files never clash. Zip `test-results/` for traces and the Vegapunk report.

## Timebox vs timeout

- Put **`timebox` in `vegapunk.config.ts`**. That value is how long each agent call may run. Pass `timebox` on `vegapunk.explore()` only to override that call. At the deadline Vegapunk aborts the current model call and closes the session; it does not start a wrap-up turn.
- **`timeout`** is Playwright’s test duration limit (setup + every explore + teardown). Set it in `playwright.config.ts`, `{ timeout }` on the test, or `test.setTimeout()`.

Raise Playwright `timeout` when you have several `vegapunk.explore()` calls.

## `allowedOrigins`

Required. The agent may only look at these origins. `explore()` throws before it creates the model if the current page or Playwright `baseURL` is not on the list. It checks again each turn, after any tool that can change origin, and on `goto` (before and after the navigation), so a redirect to production never becomes a snapshot payload.

Strings are exact origins (normalized with `new URL(...).origin`). `RegExp` values — a literal or `new RegExp()` — match that origin string as a whole. They do not search the path or the full URL. Prefer exact strings unless the host really varies (preview URLs).

```ts
allowedOrigins: [
  'https://staging.example.com',
  'http://localhost:3000',
  /^https:\/\/pr-\d+\.preview\.example\.com$/,
]
```

`http://localhost:3000` and `http://127.0.0.1:3000` are different origins; list both if you use both. Production hostnames must not appear on this list. See [ai.md](ai.md) for the two-channel picture (Playwright talks to the provider; the browser talks only to allowlisted app hosts).

## `use` and projects

Playwright values, in `playwright.config.ts`. `baseURL` is for relative `page.goto` in the test body. `vegapunk.explore()` stays on the current page.

A path that starts with `/` is origin-absolute. `baseURL: 'https://demo.playwright.dev/todomvc'` plus `page.goto('/')` opens `https://demo.playwright.dev/`, not TodoMVC. Put a trailing slash on a subdirectory `baseURL` and go to `./`:

```ts
use: { baseURL: 'https://demo.playwright.dev/todomvc/' }
// ...
await page.goto('./')
```

Projects work like Playwright’s. Run one with `npx playwright test --project=chrome-desktop`.

There is no `personaFile` and no `--persona`.
