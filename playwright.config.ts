import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:8787',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'wrangler dev --port 8787 --ip 127.0.0.1 --local --show-interactive-dev-session=false',
    url: 'http://127.0.0.1:8787',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
