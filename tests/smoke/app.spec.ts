import { expect, test } from '@playwright/test'

test('the production build boots and a nested route reloads', async ({ page }) => {
  const failedAssets: string[] = []
  page.on('response', (response) => {
    const type = response.request().resourceType()
    if ((type === 'script' || type === 'stylesheet') && response.status() >= 400) {
      failedAssets.push(`${response.status()} ${response.url()}`)
    }
  })

  await page.goto('/login')
  await expect(page.locator('#root')).not.toBeEmpty()
  expect(new URL(page.url()).origin).toBe('http://127.0.0.1:8787')

  const reloaded = await page.goto('/timer')
  expect(reloaded?.status()).toBeLessThan(400)
  await page.reload()
  const next = new URL(page.url())
  expect(next.origin).toBe('http://127.0.0.1:8787')
  expect(next.pathname.split('/').filter(Boolean).length).toBeLessThan(4)
  expect(failedAssets).toEqual([])
})
