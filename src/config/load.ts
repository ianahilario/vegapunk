import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import dotenv from 'dotenv'
import { createJiti } from 'jiti'
import { z } from 'zod'
import { parseAllowedOrigins } from '../agent/allowed-origin.js'
import { parseDuration } from '../duration.js'
import type { VegapunkConfig } from '../types.js'

const CONFIG_NAMES = ['vegapunk.config.ts', 'vegapunk.config.js', 'vegapunk.config.mts']

const aiSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google', 'openai-compatible']),
  model: z.string().min(1),
  apiKey: z.string().min(1, 'ai.apiKey is required'),
  baseURL: z.string().optional(),
  temperature: z.number().optional(),
})

const allowedOriginsSchema = z
  .array(z.union([z.string(), z.instanceof(RegExp)]))
  .min(1, 'allowedOrigins must list at least one origin string or RegExp')

export type LoadedConfig = {
  config: VegapunkConfig
  configFile: string
  rootDir: string
}

function configIn(dir: string): string | undefined {
  for (const name of CONFIG_NAMES) {
    const candidate = resolve(dir, name)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

export function findConfigFile(cwd = process.cwd()): string | undefined {
  let dir = cwd
  while (true) {
    const here = configIn(dir)
    if (here) return here
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return undefined
}

export async function loadConfig(cwd = process.cwd()): Promise<LoadedConfig> {
  const fromEnv = process.env.VEGAPUNK_CONFIG
  const configFile = fromEnv && existsSync(fromEnv) ? fromEnv : findConfigFile(cwd)
  if (!configFile) {
    throw new Error(
      'Could not find vegapunk.config.ts. Put it next to playwright.config.ts, or set VEGAPUNK_CONFIG.',
    )
  }

  dotenv.config({ path: resolve(dirname(configFile), '.env.secret') })

  const jiti = createJiti(import.meta.url)
  const mod = await jiti.import(configFile)
  const raw = (mod as { default?: VegapunkConfig }).default ?? (mod as VegapunkConfig)
  const config = validateConfig(raw)

  return {
    config,
    configFile,
    rootDir: dirname(configFile),
  }
}

export function validateConfig(raw: VegapunkConfig): VegapunkConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('vegapunk.config.ts must default-export a config object.')
  }
  aiSchema.parse(raw.ai)
  if (raw.timebox === undefined) {
    throw new Error(
      'vegapunk.config.ts requires timebox in milliseconds (e.g. 120_000). Override per call with explore({ timebox }).',
    )
  }
  parseDuration(raw.timebox)
  if (raw.allowedOrigins === undefined) {
    throw new Error(
      'vegapunk.config.ts requires allowedOrigins (at least one origin string or RegExp). The model is not called until the page origin matches.',
    )
  }
  allowedOriginsSchema.parse(raw.allowedOrigins)
  parseAllowedOrigins(raw.allowedOrigins)

  return raw
}
