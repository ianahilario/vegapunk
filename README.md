<p align="center">
  <img src="docs/vegapunk-icon.png" alt="Vegapunk" width="220" style="display: block; margin: 0 auto;">
</p>

<h1 align="center">Vegapunk</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/vegapunk">
    <img alt="npm downloads" src="https://img.shields.io/npm/d18m/vegapunk.svg">
  </a>
  <a href="https://www.npmjs.com/package/vegapunk">
    <img alt="npm downloads weekly" src="https://img.shields.io/npm/dw/vegapunk.svg">
  </a>
</p>

AI-assisted exploratory testing on top of Playwright. The package is **`vegapunk`**.

Charters are ordinary Playwright tests. You write setup and teardown, then call `vegapunk.explore()` when you want an agent to wander the current page as a persona. Vegapunk reports what it did and any issues.

```bash
npm i -D vegapunk
```

Add two configs next to each other:

- `vegapunk.config.ts` — model settings (`ai`) and default `timebox`
- `playwright.config.ts` — `timeout`, `use`, `projects`, `outputDir`, and `vegapunk/reporter`

Copy [examples/todomvc](examples/todomvc) if you want a working lab. Run charters with Playwright. `vegapunk.explore()` loads `vegapunk.config.ts` for the model and default timebox.

`ai.apiKey` is required. How you load the key is up to you.

```ts
import { defineConfig } from 'vegapunk'

export default defineConfig({
  timebox: 10 * 60 * 1000,
  ai: {
    provider: 'openai-compatible',
    model: 'deepseek/deepseek-v4-flash',
    apiKey: process.env.AI_API_KEY ?? '',
    baseURL: 'https://openrouter.ai/api/v1',
  },
})
```

`timebox` in `vegapunk.config.ts` is how long each agent call may run. Pass `timebox` on `vegapunk.explore()` only when that call should differ. `timeout` is Playwright’s limit for the whole test — set it in `playwright.config.ts`.

A persona is who is exploring and how they use the product. `vegapunk.explore({ persona })` takes a `Persona` from `createPersona()`, not a string.

```ts
import { createPersona } from 'vegapunk'

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
import { vegapunk } from 'vegapunk'
import { Persona } from '../personas'

test('a user can add, complete, and filter their items', { tag: '@todos' }, async ({ page }) => {
  await page.goto('./')
  await vegapunk.explore({
    page,
    mission: 'Explore adding, completing, and filtering todos.',
    persona: Persona.DEFAULT,
  })
})
```

```bash
npx playwright test
npx playwright test --ui
```

The Vegapunk HTML report lands in Playwright’s `outputDir` under `vegapunk-report/` (default `test-results/vegapunk-report/index.html`). Playwright’s own HTML reporter stays at `playwright-report/`.

Pass `visual: true` on `vegapunk.explore()` when you want a viewport screenshot each turn. It is off by default because it costs tokens and needs a vision-capable model. Override config `ai` for that call when the default model cannot see images:

```ts
await vegapunk.explore({
  page,
  mission: 'Look for layout and contrast issues.',
  persona: Persona.DEFAULT,
  visual: true,
  ai: { model: 'qwen/qwen3.5-27b' },
})
```

If `vegapunk.explore()` logs any issue, the Playwright test fails at the end. The Vegapunk HTML report is the handoff (expected / actual, user-level repro steps).

Vegapunk calls your model provider directly. Anthropic, OpenAI, Google, and OpenAI-compatible endpoints (including OpenRouter) work. It does not call Cursor.

See [docs/](docs/) for charters, personas, config, AI setup, and reports.
