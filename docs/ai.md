# AI providers

`ai.apiKey` is your **provider** key. Vegapunk calls that provider directly.

Cursor is not a Vegapunk backend. Built-in Cursor subscription models cannot be used here. If you already pasted a provider key in Cursor Settings → Models, use that same key as `ai.apiKey`. You are not connecting Vegapunk to Cursor.

## OpenRouter (sample)

OpenRouter is OpenAI-compatible. Use `provider: 'openai-compatible'` and set `baseURL` to the `/v1` prefix.

```ts
ai: {
  provider: 'openai-compatible',
  model: 'deepseek/deepseek-v4-flash',
  apiKey: process.env.AI_API_KEY ?? '',
  baseURL: 'https://openrouter.ai/api/v1',
}
```

Set `ai.apiKey` to your OpenRouter key.

`baseURL` is the prefix only (include `/v1`, do not append `/chat/completions`). Model IDs are OpenRouter slugs (`vendor/model`).

The sample uses DeepSeek because Anthropic, OpenAI, and Gemini are unavailable in some regions (including Hong Kong). A slug that usually works there for text and vision: `qwen/qwen3.5-27b`.

`vegapunk.explore({ visual: true })` sends a viewport JPEG each turn. The model must accept images. Only the latest screenshot stays in context. If your default model is text-only, override for that call:

```ts
ai: { model: 'qwen/qwen3.5-27b' }
```

## Anthropic

Leave `baseURL` unset.

```ts
ai: {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  apiKey: process.env.AI_API_KEY ?? '',
}
```

Set `ai.apiKey` to your Anthropic key.

## OpenAI

```ts
ai: {
  provider: 'openai',
  model: 'gpt-4o',
  apiKey: process.env.AI_API_KEY ?? '',
}
```

## Other OpenAI-compatible endpoints

Azure-compatible, local servers, and similar hosts use the same provider as OpenRouter:

```ts
ai: {
  provider: 'openai-compatible',
  model: 'your-model-id',
  apiKey: process.env.AI_API_KEY ?? '',
  baseURL: process.env.AI_BASE_URL,
}
```

## Production isolation

The provider runs only in the Playwright process — the Node job that executes `npx playwright test`. The production app never imports Vegapunk and should never hold a provider key.

`allowedOrigins` is the guard on the other channel: the browser page. `explore()` throws **before** any model call if `page.url()` or Playwright `baseURL` is not on that list, and again after any tool that can change origin if that action left the list. A production hostname must not appear there. Regex entries match the **origin** only (`https://host:port`), as a whole string — never the path or the full URL.

```ts
allowedOrigins: [
  'https://staging.example.com',
  'http://localhost:3000',
  /^https:\/\/pr-\d+\.preview\.example\.com$/,
]
```

Prefer exact origin strings when the host is fixed. Use a `RegExp` literal or `new RegExp()` when preview hosts change. A string that looks like a pattern is not compiled; it must be an absolute URL.

This stops the **environment**. A staging database cloned from production can still contain PII — that is org data handling, not this guard. Snapshots, `visual: true` JPEGs, and tool output go to the model only after the origin check passes.
