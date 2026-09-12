import { defineConfig } from 'vegapunk'

export default defineConfig({
  ai: {
    provider: 'openai-compatible',
    model: 'deepseek/deepseek-v4-flash',
    apiKey: process.env.AI_API_KEY ?? '',
    baseURL: 'https://openrouter.ai/api/v1',
    temperature: 0.6,
  },
})
