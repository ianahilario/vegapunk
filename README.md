<p align="center">
  <img src="docs/egghead-icon.png" alt="Egghead" width="220" style="display: block; margin: 0 auto;">
</p>

<h1 align="center">Egghead</h1>

AI-assisted exploratory testing on top of Playwright. The package is **`@egghead/test`**.

Charters are ordinary Playwright tests. You write setup and teardown, then call `egghead.explore()` when you want an agent to wander the current page as a persona. Egghead reports what it did and any issues.

```bash
npm i -D @egghead/test
```

Add two configs next to each other:

- `egghead.config.ts` — model settings (`ai`)
- `playwright.config.ts` — `timeout`, `use`, `projects`, `outputDir`, and `@egghead/test/reporter`

Copy [examples/todomvc](examples/todomvc) if you want a working lab. Run charters with Playwright. `egghead.explore()` loads `egghead.config.ts` for the model.

`ai.apiKey` is required. How you load the key is up to you.

```ts
import { defineConfig } from '@egghead/test'

export default defineConfig({
  ai: {
    provider: 'openai-compatible',
    model: 'deepseek/deepseek-v4-flash',
    apiKey: process.env.AI_API_KEY ?? '',
    baseURL: 'https://openrouter.ai/api/v1',
  },
})
```

`timebox` on `egghead.explore()` is how long that agent call may run (milliseconds). `timeout` is Playwright’s limit for the whole test — set it in `playwright.config.ts`.

A persona is who is exploring and how they use the product. `egghead.explore({ persona })` takes a `Persona` from `createPersona()`, not a string.

```ts
import { createPersona } from '@egghead/test'

export const Persona = {
  DEFAULT: createPersona({
    id: 'default',
    title: 'Default user',
    profile:
      'Uses the product the way it was designed. Notices when a label, filter, or back button does not match the last action.',
  }),
}
```

```ts
import { test } from '@playwright/test'
import { egghead } from '@egghead/test'
import { Persona } from '../personas'

test('a user can add, complete, and filter their items', { tag: '@todos' }, async ({ page }) => {
  await page.goto('./')
  await egghead.explore({
    page,
    mission: 'Explore adding, completing, and filtering todos.',
    persona: Persona.DEFAULT,
    timebox: 10 * 60 * 1000,
  })
})
```

```bash
npx playwright test
npx playwright test --ui
```

The Egghead HTML report lands in Playwright’s `outputDir` under `egghead-report/` (default `test-results/egghead-report/index.html`). Playwright’s own HTML reporter stays at `playwright-report/`.

Pass `visual: true` on `egghead.explore()` when you want a viewport screenshot each turn. It is off by default because it costs tokens and needs a vision-capable model. Override config `ai` for that call when the default model cannot see images:

```ts
await egghead.explore({
  page,
  mission: 'Look for layout and contrast issues.',
  persona: Persona.DEFAULT,
  timebox: 10 * 60 * 1000,
  visual: true,
  ai: { model: 'qwen/qwen3.5-27b' },
})
```

If `egghead.explore()` logs any issue, the Playwright test fails at the end. The Egghead HTML report is the handoff (expected / actual, user-level repro steps).

Egghead calls your model provider directly. Anthropic, OpenAI, Google, and OpenAI-compatible endpoints (including OpenRouter) work. It does not call Cursor.

See [docs/](docs/) for charters, personas, config, AI setup, and reports.
