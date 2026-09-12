import type { VegapunkConfig } from '../types.js'

/**
 * Type-check and return a `vegapunk.config.ts` object.
 *
 * Only Vegapunk keys: required `ai`. Playwright `timeout`, `use`,
 * `projects`, `outputDir`, and reporters go in `playwright.config.ts`.
 * The agent stop is always `vegapunk.explore({ timebox })`.
 *
 * @param config - Vegapunk config. `ai` is required.
 * @returns The same config object.
 *
 * @example
 * ```ts
 * import { defineConfig } from 'vegapunk'
 *
 * export default defineConfig({
 *   ai: {
 *     provider: 'openai-compatible',
 *     model: 'deepseek/deepseek-v4-flash',
 *     apiKey: process.env.AI_API_KEY ?? '',
 *     baseURL: 'https://openrouter.ai/api/v1',
 *     temperature: 0.6,
 *   },
 * })
 * ```
 */
export function defineConfig(config: VegapunkConfig): VegapunkConfig {
  return config
}
