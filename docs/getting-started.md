# Getting started

## Install

```bash
npm i -D vegapunk
```

Copy [examples/todomvc](../examples/todomvc) or add `vegapunk.config.ts`, `playwright.config.ts`, `personas.ts`, and a charter yourself. Gitignore `test-results/` and `playwright-report/`.

`vegapunk.config.ts` needs `ai`, `timebox`, and `allowedOrigins` (the hosts the agent may look at — staging, local, preview; not production). See [config.md](config.md).

Register `vegapunk/reporter` in `playwright.config.ts`.

## API key

Set `ai.apiKey` in `vegapunk.config.ts`. How you load the key is up to you.

The sample config talks to OpenRouter. See [ai.md](ai.md) for Anthropic, OpenAI, and other OpenAI-compatible providers.

## First session

The example charter uses Playwright TodoMVC (`https://demo.playwright.dev/todomvc`).

```bash
npx playwright test
```

Open `test-results/vegapunk-report/index.html` after the run. Use Playwright UI with:

```bash
npx playwright test --ui
```
