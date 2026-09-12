import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './charters',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  timeout: 15 * 60 * 1000,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['@egghead/test/reporter', { open: 'never' }],
  ],
  use: {
    baseURL: 'https://demo.playwright.dev/todomvc/',
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chrome-desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'chrome-mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
      },
    },
  ],
})
