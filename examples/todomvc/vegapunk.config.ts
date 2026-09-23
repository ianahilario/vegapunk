import { defineConfig } from 'vegapunk'

export default defineConfig({
  timebox: 120_000,
  allowedOrigins: ['https://demo.playwright.dev'],
  ai: {
    provider: 'openai-compatible',
    model: '~typesafe/jev-latest',
    apiKey: process.env.AI_API_KEY ?? '',
    baseURL: 'https://openrouter.ai/api/v1',
    temperature: 0.6,
  },
})
