import type { EggheadConfig } from '../types.js'

/**
 * Type-check and return an `egghead.config.ts` object.
 *
 * Only Egghead keys: required `ai`. Playwright `timeout`, `use`,
 * `projects`, `outputDir`, and reporters go in `playwright.config.ts`.
 * The agent stop is always `egghead.explore({ timebox })`.
 *
 * @param config - Egghead config. `ai` is required.
 * @returns The same config object.
 *
 * @example
 * ```ts
 * import { defineConfig } from '@egghead/test'
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
export function defineConfig(config: EggheadConfig): EggheadConfig {
  return config
}
