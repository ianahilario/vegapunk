import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import type { AiConfig } from '../types.js'

export function createModel(ai: AiConfig): LanguageModel {
  if (!ai.apiKey) {
    throw new Error('ai.apiKey is required in vegapunk.config.ts.')
  }

  if (ai.provider === 'anthropic') {
    const client = createAnthropic({ apiKey: ai.apiKey, baseURL: ai.baseURL })
    return client(ai.model)
  }

  if (ai.provider === 'google') {
    const client = createGoogleGenerativeAI({ apiKey: ai.apiKey, baseURL: ai.baseURL })
    return client(ai.model)
  }

  const client = createOpenAI({
    apiKey: ai.apiKey,
    baseURL: ai.baseURL,
    compatibility: ai.provider === 'openai-compatible' ? 'compatible' : 'strict',
  })
  return client(ai.model)
}
