import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import dotenv from 'dotenv'
import { createJiti } from 'jiti'
import { z } from 'zod'
import type { EggheadConfig } from '../types.js'

const CONFIG_NAMES = ['egghead.config.ts', 'egghead.config.js', 'egghead.config.mts']

const aiSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google', 'openai-compatible']),
  model: z.string().min(1),
  apiKey: z.string().min(1, 'ai.apiKey is required'),
  baseURL: z.string().optional(),
  temperature: z.number().optional(),
})

export type LoadedConfig = {
  config: EggheadConfig
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
  const fromEnv = process.env.EGGHEAD_CONFIG
  const configFile = fromEnv && existsSync(fromEnv) ? fromEnv : findConfigFile(cwd)
  if (!configFile) {
    throw new Error(
      'Could not find egghead.config.ts. Put it next to playwright.config.ts, or set EGGHEAD_CONFIG.',
    )
  }

  dotenv.config({ path: resolve(dirname(configFile), '.env.secret') })

  const jiti = createJiti(import.meta.url)
  const mod = await jiti.import(configFile)
  const raw = (mod as { default?: EggheadConfig }).default ?? (mod as EggheadConfig)
  const config = validateConfig(raw)

  return {
    config,
    configFile,
    rootDir: dirname(configFile),
  }
}

export function validateConfig(raw: EggheadConfig): EggheadConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('egghead.config.ts must default-export a config object.')
  }
  aiSchema.parse(raw.ai)

  return raw
}
