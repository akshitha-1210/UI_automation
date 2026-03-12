import { test, expect } from '@playwright/test';
import { handleServerErrors, handleLogin, setupAutoDismiss } from './helpers';

const START_URL =
  'https://sandbox.sunbirded.org/resources?board=CBSE&medium=English&gradeLevel=Class%201&subject=English&id=NCF&selectedTab=home';

test('Login + Onboarding', async ({ page }) => {
  test.setTimeout(5 * 60 * 1000);

  // ── 1. Navigate to the app ────────────────────────────────────────────────
  console.log('Navigating to start URL...');
  await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await handleServerErrors(page);

  // ── 2. Login ──────────────────────────────────────────────────────────────
  await handleLogin(page);
  await page.waitForLoadState('networkidle').catch(() => { });
  await handleServerErrors(page);

  console.log('Post-login URL:', page.url());

  // ── 3. Handle the onboarding "Welcome to sunbird" modal FIRST ─────────────
  // Do this BEFORE setupAutoDismiss so the modal handler doesn't conflict.
  await handleOnboarding(page);

  // ── 4. Register background auto-dismiss for subsequent popups ─────────────
  await setupAutoDismiss(page);

  // ── 5. Wait for navigation away from any login URL ────────────────────────
  try {
    await page.waitForURL((url) => !url.href.includes('/login'), { timeout: 30000 });
  } catch {
    console.warn('waitForURL (not /login) timed out — current URL:', page.url());
  }

  console.log('Final URL before assertion:', page.url());

  // ── 6. Assert we are NOT on the login page ────────────────────────────────
  await expect(page).not.toHaveURL(/login/, { timeout: 15000 });

  // ── 7. Save auth state ────────────────────────────────────────────────────
  await page.context().storageState({ path: 'tests/user_consumption/auth.json' });
  console.log('Done! Auth saved to auth.json');
});

// ─────────────────────────────────────────────────────────────────────────────
// Explicit onboarding handler for the "Welcome to sunbird" Material dialog
// ─────────────────────────────────────────────────────────────────────────────
async function handleOnboarding(page) {
  console.log('Checking for onboarding modal...');
  await page.screenshot({ path: 'pre-onboarding.png' });

  // The modal is a mat-dialog-container — target it directly
  const modal = page.locator('mat-dialog-container, [role="dialog"]').first();

  const modalVisible = await modal.waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false);

  if (!modalVisible) {
    console.log('No onboarding modal found — skipping onboarding step.');
    return;
  }

  // Debug: log text content
  const text = await modal.innerText().catch(() => '');
  console.log('Modal text (first 300 chars):', text.slice(0, 300).replace(/\n/g, ' '));

  await page.screenshot({ path: 'onboarding-modal-visible.png' });

  // ── Slide 1: Role Selection ────────────────────────────────────────────────
  // The role cards contain an image and a label. Click the first available role.
  const roles = ['Teacher', 'Student', 'Parent', 'Other'];
  let roleClicked = false;

  for (const role of roles) {
    // Try multiple selector strategies
    const selectors = [
      modal.locator(`text="${role}"`).first(),
      modal.locator(`[class*="card"]:has-text("${role}")`).first(),
      modal.locator(`li:has-text("${role}")`).first(),
      modal.locator(`span:has-text("${role}")`).first(),
    ];

    for (const sel of selectors) {
      const visible = await sel.isVisible({ timeout: 1000 }).catch(() => false);
      if (visible) {
        console.log(`Clicking role "${role}" via selector`);
        await sel.click({ force: true });
        roleClicked = true;
        break;
      }
    }
    if (roleClicked) break;
  }

  if (!roleClicked) {
    // Last resort: click the first visible child element in the modal
    console.warn('Could not find a role card by text — clicking first child element...');
    await page.screenshot({ path: 'onboarding-role-not-found.png' });
    const firstEl = modal.locator('[class*="card"], li, .tile, img').first();
    if (await firstEl.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstEl.click({ force: true });
      roleClicked = true;
    }
  }

  // Wait for UI to react (button enable animation)
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'onboarding-after-role-click.png' });

  // ── Continue / Next button ─────────────────────────────────────────────────
  // Scroll to bottom of modal first in case the button is off-screen
  await modal.evaluate(el => el.scrollTop = el.scrollHeight).catch(() => { });
  await page.waitForTimeout(300);

  // Try to find Continue button anywhere on the page (not just in modal)
  // because Angular sometimes renders dialog actions outside the container
  const continueBtn = page.locator('button').filter({ hasText: /^(Continue|Next)$/i }).first();
  const continueBtnVisible = await continueBtn.isVisible({ timeout: 5000 }).catch(() => false);

  if (continueBtnVisible) {
    await continueBtn.click({ force: true });
    console.log('Clicked Continue/Next.');
    await page.waitForTimeout(2000); // wait for slide animation
  } else {
    console.warn('Continue button not found. Trying generic button approach...');
    await page.screenshot({ path: 'onboarding-no-continue-btn.png' });
    // Try clicking the last button visible in the modal
    const lastBtn = modal.locator('button:visible').last();
    if (await lastBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await lastBtn.click({ force: true });
      await page.waitForTimeout(2000);
    }
  }

  // ── Slide 2: Submit / Finish (if it appears) ──────────────────────────────
  await page.screenshot({ path: 'onboarding-slide2.png' });

  const submitBtn = page.locator('button').filter({ hasText: /Submit|Finish|Done/i }).first();
  const submitVisible = await submitBtn.isVisible({ timeout: 5000 }).catch(() => false);

  if (submitVisible) {
    await submitBtn.click({ force: true });
    console.log('Clicked Submit/Finish.');
  } else {
    // Maybe there's another Continue on slide 2
    const cont2 = page.locator('button').filter({ hasText: /Continue|Next/i }).first();
    if (await cont2.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cont2.click({ force: true });
      console.log('Clicked second Continue/Next (slide 2 fallback).');
    }
  }

  // ── Wait for modal to close ────────────────────────────────────────────────
  await modal.waitFor({ state: 'hidden', timeout: 20000 })
    .then(() => console.log('Onboarding modal closed ✅'))
    .catch(async () => {
      console.warn('Modal did not close — taking diagnostic screenshot...');
      await page.screenshot({ path: 'onboarding-stuck.png' });
    });
}