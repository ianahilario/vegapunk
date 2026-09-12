# Config

Vegapunk and Playwright each have a config file.

- `vegapunk.config.ts` — model settings (`ai`)
- `playwright.config.ts` — `timeout`, `use`, `projects`, `reporter`, `testDir`, `outputDir`

```ts
import { defineConfig } from 'vegapunk'

export default defineConfig({
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

Register `vegapunk/reporter` in `playwright.config.ts` so the Vegapunk index is rebuilt at the end of the run. `vegapunk.explore()` loads `vegapunk.config.ts` for the model. Run charters with `npx playwright test`.

Vegapunk writes into `test-results/vegapunk-report/` (Playwright’s `outputDir` plus that subfolder). Playwright’s HTML reporter stays at `playwright-report/` so the two `index.html` files never clash. Zip `test-results/` for traces and the Vegapunk report.

## Timebox vs timeout

- Put **`timebox` on `vegapunk.explore()`**. That value is how long that agent call may run. At the deadline Vegapunk aborts the current model call and closes the session; it does not start a wrap-up turn.
- **`timeout`** is Playwright’s test duration limit (setup + every explore + teardown). Set it in `playwright.config.ts`, `{ timeout }` on the test, or `test.setTimeout()`.

Raise Playwright `timeout` when you have several `vegapunk.explore()` calls.

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
