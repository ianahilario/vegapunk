import type { VegapunkConfig } from '../types.js'

/**
 * Type-check and return a `vegapunk.config.ts` object.
 *
 * Only Vegapunk keys: required `ai`, `timebox`, and `allowedOrigins`.
 * Playwright `timeout`, `use`, `projects`, `outputDir`, and reporters go in
 * `playwright.config.ts`. `explore({ timebox })` overrides config `timebox`
 * for that call.
 *
 * @param config - Vegapunk config. `ai`, `timebox`, and `allowedOrigins` are required.
 * @returns The same config object.
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
 *     temperature: 0.6,
 *   },
 * })
 * ```
 */
export function defineConfig(config: VegapunkConfig): VegapunkConfig {
  return config
}
