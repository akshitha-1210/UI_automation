import { test } from '@playwright/test';
import { loginWithValidCredentials } from './helpers';

test.only('debug login flow', async ({ page }) => {
  await loginWithValidCredentials(page);

  // Pause to inspect
  await page.pause();

  console.log('Final URL:', page.url());
});