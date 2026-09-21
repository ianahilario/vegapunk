import type { Page } from '@playwright/test'

/**
 * Who the agent pretends to be during `explore()`.
 *
 * Build these with `createPersona()` and pass the object — not a string — as
 * `explore({ persona })`. `id` shows up in logs and the session report.
 *
 * @example
 * ```ts
 * import { createPersona } from 'vegapunk'
 *
 * export const Persona = {
 *   DEFAULT: createPersona({
 *     id: 'default',
 *     title: 'Default user',
 *     profile: 'Uses the product the way it was designed.',
 *   }),
 * }
 * ```
 */
export type Persona = {
  /** Stable slug used in logs (`[vegapunk - kai]`) and the report. Name it
   *  whatever you want.
   */
  id: string
  /** Short human label shown in the session report. */
  title: string
  /**
   * Instructions for how this person uses the product. The model reads this
   * every turn — write concrete habits, not a job title.
   */
  profile: string
}

/**
 * How long something may run, in milliseconds.
 *
 * Used by `parseDuration` for `timebox` values.
 */
export type Duration = number

/**
 * Arguments for one `vegapunk.explore()` call. `page`, `mission`, and
 * `persona` are required. `timebox` is optional and overrides the config
 * value for this call. Call it as many times as you want in a test; each
 * call has its own timebox. The test fails after the body if any call
 * logged an issue.
 *
 * @example
 * ```ts
 * await vegapunk.explore({
 *   page,
 *   mission: 'Explore adding, completing, and filtering todos.',
 *   persona: Persona.DEFAULT,
 * })
 * ```
 *
 * @example Override the model for a visual pass
 * ```ts
 * await vegapunk.explore({
 *   page,
 *   mission: 'Look for overlap, clip, contrast, and overflow.',
 *   persona: Persona.DEFAULT,
 *   visual: true,
 *   ai: { model: 'qwen/qwen3.5-27b' },
 * })
 * ```
 */
export type ExploreOptions = {
  /**
   * The Playwright page to drive. Setup with `page.goto` (and login) first.
   */
  page: Page
  /**
   * What to look at on the **current** Playwright page. Vegapunk does not
   * navigate for you — `page.goto()` first.
   *
   * @example
   * ```ts
   * mission: 'Explore adding, completing, and filtering todos.'
   * ```
   */
  mission: string
  /**
   * A `Persona` from `createPersona()`. Do not pass a string id.
   *
   * @example
   * ```ts
   * persona: Persona.DEFAULT
   * ```
   */
  persona: Persona
  /**
   * How long **this** agent call may run, in milliseconds. Overrides `timebox`
   * from `vegapunk.config.ts`. When the clock hits, the in-flight model call is
   * aborted and the session closes — no wrap-up turn.
   *
   * This is not Playwright’s test `timeout`. `timeout` covers setup + every
   * `explore()` + teardown.
   *
   * @example
   * ```ts
   * timebox: 120_000
   * ```
   */
  timebox?: number
  /**
   * Send a viewport JPEG each turn so the model can judge overlap, clip,
   * contrast, and overflow. Off by default (token cost). Needs a vision-capable
   * model — override `ai.model` if your config model is text-only.
   *
   * @example
   * ```ts
   * visual: true,
   * ai: { model: 'qwen/qwen3.5-27b' },
   * ```
   */
  visual?: boolean
  /**
   * Partial override of `ai` from `vegapunk.config.ts` for **this call only**.
   * Unspecified keys keep the config values.
   *
   * @example
   * ```ts
   * ai: { temperature: 0.3 }
   * ```
   *
   * @example
   * ```ts
   * ai: { model: 'qwen/qwen3.5-27b' }
   * ```
   */
  ai?: Partial<AiConfig>
}

/**
 * Drive a Playwright page with an AI agent until the timebox (config, or
 * `explore({ timebox })`), the model calls `done`, or it logs issues.
 * calls `done`, or it logs issues.
 *
 * Setup (`page.goto`, login) happens **before** this call. Issues from one
 * call do not skip later `vegapunk.explore()` calls or teardown. The test
 * fails at the end if any issue was logged.
 */
export type ExploreFn = (options: ExploreOptions) => Promise<void>

/** How bad a logged issue is. Used in the session report. */
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low'

/** Kind of product problem the agent filed. Used in the session report. */
export type IssueCategory =
  | 'visual'
  | 'functional'
  | 'ux'
  | 'content'
  | 'performance'
  | 'console'
  | 'accessibility'

export type ReproStep = {
  action: string
  screenshot?: string
}

/**
 * One problem the agent filed during `explore()`. Written to the session
 * report. The test fails after the body if any issue was logged.
 */
export type Issue = {
  id: string
  title: string
  severity: IssueSeverity
  category: IssueCategory
  url: string
  description: string
  expected: string
  actual: string
  reproSteps: ReproStep[]
  screenshots: string[]
  video?: string | 'N/A'
  snapshot?: string
  exploreIndex: number
  mission: string
  persona: Pick<Persona, 'id' | 'title'>
}

export type JournalEntry = {
  at: string
  exploreIndex: number
  kind: 'orient' | 'action' | 'thought' | 'issue' | 'check' | 'wrap'
  message: string
}

export type CheckOk = {
  title: string
  url: string
  exploreIndex: number
}

/**
 * Who serves the model. `openai-compatible` is for OpenRouter and other
 * OpenAI-shaped endpoints — set `baseURL` too.
 */
export type AiProvider = 'openai' | 'anthropic' | 'google' | 'openai-compatible'

/**
 * Model settings for `explore()`. Required in `vegapunk.config.ts` as `ai`.
 * Pass a partial object to `explore({ ai })` to override keys for one call.
 *
 * @example Config
 * ```ts
 * ai: {
 *   provider: 'openai-compatible',
 *   model: 'deepseek/deepseek-v4-flash',
 *   apiKey: process.env.AI_API_KEY ?? '',
 *   baseURL: 'https://openrouter.ai/api/v1',
 *   temperature: 0.6,
 * }
 * ```
 */
export type AiConfig = {
  /**
   * API family. Use `openai-compatible` for OpenRouter and similar gateways.
   *
   * @example
   * ```ts
   * provider: 'openai-compatible'
   * ```
   */
  provider: AiProvider
  /**
   * Model id for that provider (or the gateway’s model slug).
   *
   * @example
   * ```ts
   * model: 'deepseek/deepseek-v4-flash'
   * ```
   */
  model: string
  /**
   * Provider / gateway key. Required.
   *
   * @example
   * ```ts
   * apiKey: process.env.AI_API_KEY ?? ''
   * ```
   */
  apiKey: string
  /**
   * Required for `openai-compatible` (e.g. `https://openrouter.ai/api/v1`).
   */
  baseURL?: string
  /**
   * Sampling temperature. Lower is more deterministic (good for careful
   * paths). Default is `0.6` when omitted.
   *
   * @example
   * ```ts
   * temperature: 0.3
   * ```
   */
  temperature?: number
}

/**
 * `vegapunk.config.ts` — Vegapunk-only keys. Timeout, `use`, projects,
 * `outputDir`, and reporters live in `playwright.config.ts`.
 *
 * @example
 * ```ts
 * import { defineConfig } from 'vegapunk'
 *
 * export default defineConfig({
 *   timebox: 120_000,
 *   allowedOrigins: ['https://staging.example.com', 'http://localhost:3000'],
 *   ai: {
 *     provider: 'openai-compatible',
 *     model: 'deepseek/deepseek-v4-flash',
 *     apiKey: process.env.AI_API_KEY ?? '',
 *     baseURL: 'https://openrouter.ai/api/v1',
 *   },
 * })
 * ```
 */
export type VegapunkConfig = {
  /**
   * How long each `vegapunk.explore()` may run by default, in milliseconds.
   * Override per call with `vegapunk.explore({ timebox })`.
   *
   * @example
   * ```ts
   * timebox: 120_000
   * ```
   */
  timebox: number
  /**
   * Origins the agent may look at. `explore()` throws before any model call
   * if the page (or Playwright `baseURL`) is not on this list, so a production
   * page is never sent to the provider.
   *
   * Strings are exact origins (`https://staging.example.com`). `RegExp` values
   * (literals or `new RegExp()`) match the origin only, as a whole string —
   * use those for preview hosts that change. Prefer exact strings when the
   * host is fixed.
   *
   * @example
   * ```ts
   * allowedOrigins: [
   *   'https://staging.example.com',
   *   'http://localhost:3000',
   *   /^https:\/\/pr-\d+\.preview\.example\.com$/,
   * ]
   * ```
   */
  allowedOrigins: (string | RegExp)[]
  /**
   * Default model for every `vegapunk.explore()`. Override per call with
   * `vegapunk.explore({ ai })`.
   */
  ai: AiConfig
}

/**
 * Optional second argument to `test()`, same idea as Playwright: tags,
 * annotations, and a per-test timeout.
 *
 * Put tags here — not in the title. Filter with `npx playwright test --grep=@todos`.
 *
 * @example
 * ```ts
 * test('a user can add, complete, and filter their items', { tag: ['@todos', '@filters'] }, async ({ page }) => {
 *   // ...
 * })
 * ```
 */
export type VegapunkTestDetails = {
  /** One tag or a list, e.g. `'@todos'` or `['@todos', '@filters']`. */
  tag?: string | string[]
  annotation?: { type: string; description?: string } | { type: string; description?: string }[]
  /** Playwright test duration limit for this test, in milliseconds. */
  timeout?: number
}
