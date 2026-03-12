import { test } from '@playwright/test';

const USER_EMAIL = 'user2@yopmail.com';
const USER_PASSWORD = 'User2@123';

// Direct Keycloak OIDC login URL — navigating here always shows the login form reliably.
const LOGIN_URL =
  'https://sandbox.sunbirded.org/auth/realms/sunbird/protocol/openid-connect/auth' +
  '?client_id=portal&state=7e84b3bd-ecd0-488e-82ec-ca3e476234ac' +
  '&redirect_uri=https%3A%2F%2Fsandbox.sunbirded.org%2Fresources%3Fauth_callback%3D1' +
  '&scope=openid&response_type=code&version=4';

test('save auth storageState', async ({ browser }) => {
  test.setTimeout(60_000);

  // Create a fresh context (no stored state) so we always get the login form
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating directly to Keycloak login page...');
  await page.goto(LOGIN_URL, { waitUntil: 'load', timeout: 30000 });

  // The Keycloak login page should show username + password fields
  const usernameField = page.locator('#username, input[name="username"], input[type="email"]').first();
  await usernameField.waitFor({ state: 'visible', timeout: 15000 });

  console.log('Filling credentials...');
  await usernameField.fill(USER_EMAIL);

  const passwordField = page.locator('#password, input[name="password"], input[type="password"]').first();
  await passwordField.waitFor({ state: 'visible', timeout: 10000 });
  await passwordField.fill(USER_PASSWORD);

  console.log('Submitting login form...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => { }),
    page.locator('button[type="submit"], input[type="submit"], button:has-text("Log In"), button:has-text("Login"), button:has-text("Sign In")').first().click(),
  ]);

  // Verify we landed back on the portal (the redirect_uri after successful auth)
  const currentUrl = page.url();
  console.log('Post-login URL:', currentUrl);

  if (currentUrl.includes('/auth/realms/')) {
    throw new Error(`Login failed — still on Keycloak page. Check credentials. URL: ${currentUrl}`);
  }

  // Wait for the portal to fully settle after callback
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => { });

  // Persist storage state to a file that other tests can consume
  await context.storageState({ path: 'auth.json' });
  console.log('✅ Saved auth storageState to auth.json — re-run course tests to use it.');

  await context.close();
});

