import { Page, Locator } from '@playwright/test';

/**
 * Global helper to detect and recover from server errors (502/503/504)
 */
export async function handleServerErrors(page: Page, maxRetries = 4): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    if (page.isClosed()) return true;

    const errorDetected = await page.evaluate(() => {
      const text = document.body.innerText;
      const title = document.title;
      return text.includes('502') || text.includes('Bad Gateway') ||
        text.includes('503') || text.includes('Service Unavailable') ||
        text.includes('504') || text.includes('Gateway Timeout') ||
        text.includes('Bad gateway') || text.includes('Failed to fetch content') ||
        text.includes('404') || text.includes('Not Found') ||
        title.toLowerCase().includes('not found') || title.includes('404');
    }).catch(() => false);

    if (errorDetected) {
      console.warn(`Server Error (50x) detected. Attempt ${i + 1}/${maxRetries}. Refreshing in 10s...`);
      await page.waitForTimeout(10000).catch(() => { });
      if (page.isClosed()) return true;
      await page.reload({ waitUntil: 'load', timeout: 60000 }).catch(() => { });
    } else {
      return true;
    }
  }
  return false;
}

// Direct Keycloak OIDC login URL — always shows the login form reliably.
const KEYCLOAK_LOGIN_URL =
  'https://sandbox.sunbirded.org/auth/realms/sunbird/protocol/openid-connect/auth' +
  '?client_id=portal&state=7e84b3bd-ecd0-488e-82ec-ca3e476234ac' +
  '&redirect_uri=https%3A%2F%2Fsandbox.sunbirded.org%2Fresources%3Fauth_callback%3D1' +
  '&scope=openid&response_type=code&version=4';

/**
 * Handle Auth/Login by navigating directly to the Keycloak OIDC endpoint.
 * This guarantees the login form appears regardless of the current page state.
 */
export async function handleLogin(page: Page) {
  // Check if we're already on a login page
  const emailField = page.locator('#username, input[name="username"], input[type="email"]').first();
  const alreadyOnLoginPage = await emailField.isVisible().catch(() => false);

  if (!alreadyOnLoginPage) {
    console.log('Navigating directly to Keycloak login page...');
    await page.goto(KEYCLOAK_LOGIN_URL, { waitUntil: 'load', timeout: 30000 });
    await emailField.waitFor({ state: 'visible', timeout: 15000 });
  }

  console.log('Login form detected. Filling credentials...');
  await emailField.fill('user2@yopmail.com');

  const passField = page.locator('#password, input[name="password"], input[type="password"]').first();
  await passField.waitFor({ state: 'visible', timeout: 10000 });
  await passField.fill('User2@123');

  const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Log In"), button:has-text("Login"), button:has-text("Sign In")').first();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => { }),
    submitBtn.click(),
  ]);

  console.log('Login submitted. Current URL:', page.url());
  await page.waitForLoadState('networkidle').catch(() => { });
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-DISMISS: Autonomous popup / modal / banner handler
// Call `await setupAutoDismiss(page)` once at the start of any test.
// Playwright's addLocatorHandler fires automatically whenever the trigger
// element appears on screen, dismissing it before the test action resumes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers background handlers that automatically dismiss common UI
 * interruptions (popups, modals, cookie banners, onboarding flows, toasts).
 *
 * Call once at the start of each test — no further manual handling needed.
 */
export async function setupAutoDismiss(page: Page): Promise<void> {

  // Helper: try a list of locators in order and click the first visible one.
  async function tryClick(...locators: Locator[]): Promise<boolean> {
    for (const loc of locators) {
      try {
        if (await loc.isVisible({ timeout: 500 })) {
          await loc.click({ force: true, timeout: 3000 });
          console.log(`[AutoDismiss] Clicked: ${await loc.evaluate(el => el.outerHTML.slice(0, 80))}`);
          return true;
        }
      } catch { /* ignore and try next */ }
    }
    return false;
  }

  // ── 1. Generic modal / dialog ─────────────────────────────────────────────
  // Triggered whenever any [role="dialog"] or .sb-modal appears.
  // NOTE: The onboarding/welcome modal is handled explicitly by handleOnboarding();
  //       this handler only targets other generic dialogs.
  await page.addLocatorHandler(
    page.locator('[role="dialog"], .sb-modal-main-container, .sb-popup-content').first(),
    async (modal) => {
      console.log('[AutoDismiss] Modal detected — attempting to dismiss...');

      // Skip if this looks like the onboarding role-selection modal — let
      // the explicit handleOnboarding() function deal with it instead.
      const modalText = await modal.innerText({ timeout: 2000 }).catch(() => '');
      if (/welcome|discover content|teacher|student|parent/i.test(modalText)) {
        console.log('[AutoDismiss] Looks like the onboarding modal — skipping auto-dismiss.');
        return;
      }

      // Priority 1: explicit close / X button
      const closed = await tryClick(
        modal.locator('button[aria-label*="close" i], button[aria-label*="dismiss" i], .icon-close, .close, [class*="close-btn"]').first(),
        modal.locator('mat-icon:has-text("close"), sb-icon:has-text("close")').first(),
        modal.locator('button').filter({ hasText: /^✕$|^×$|^X$|close/i }).first(),
      );

      if (!closed) {
        // Priority 2: action buttons — Continue > OK > Done > Submit > Skip
        await tryClick(
          modal.locator('button').filter({ hasText: /Continue|Next/i }).first(),
          modal.locator('button').filter({ hasText: /^OK$|Accept|Got it/i }).first(),
          modal.locator('button').filter({ hasText: /Done|Finish/i }).first(),
          modal.locator('button').filter({ hasText: /Submit/i }).first(),
          modal.locator('button').filter({ hasText: /Skip|Not now|Dismiss/i }).first(),
        );
      }
    },
    // times: limit retries to prevent infinite loops on modals we can't dismiss
    { times: 3, noWaitAfter: false }
  ).catch(() => { /* addLocatorHandler may not be supported in older Playwright */ });

  // ── 2. Cookie / Privacy banner ────────────────────────────────────────────
  await page.addLocatorHandler(
    page.locator('#cookie-banner, .cookie-banner, .cookie-consent, [class*="cookie"]').first(),
    async () => {
      console.log('[AutoDismiss] Cookie banner detected — dismissing...');
      await tryClick(
        page.locator('button').filter({ hasText: /Accept|Accept all|OK|Got it/i }).first(),
        page.locator('button').filter({ hasText: /Decline|Reject|Close/i }).first(),
      );
    }
  ).catch(() => { });

  // ── 3. Toast / Snackbar notifications ────────────────────────────────────
  await page.addLocatorHandler(
    page.locator('.sb-toast, .snackbar, [class*="toast"], [role="alert"]').first(),
    async (toast) => {
      console.log('[AutoDismiss] Toast/snackbar detected — dismissing...');
      await tryClick(
        toast.locator('button[aria-label*="close" i], .close, button').first(),
      );
    }
  ).catch(() => { });

  // ── 4. Onboarding / Welcome modal ────────────────────────────────────────
  // Handles the role-selection + location slides autonomously.
  await page.addLocatorHandler(
    page.locator('.sb-modal-main-container, [class*="onboarding"]').first(),
    async (modal) => {
      console.log('[AutoDismiss] Onboarding modal detected — auto-completing...');

      // Slide 1: Pick a role if role cards are present
      const roles = ['Teacher', 'Student', 'Parent', 'Other'];
      for (const role of roles) {
        const roleCard = modal.locator(`text=${role}`).first();
        if (await roleCard.isVisible({ timeout: 500 }).catch(() => false)) {
          await roleCard.click({ force: true }).catch(() => { });
          console.log(`[AutoDismiss] Selected role: ${role}`);
          break;
        }
      }

      // Click Continue / Next if available
      await tryClick(
        modal.locator('button').filter({ hasText: /Continue|Next/i }).first(),
      );

      // Small pause for slide animation
      await page.waitForTimeout(1500).catch(() => { });

      // Slide 2: Click Submit / Done / Finish
      await tryClick(
        modal.locator('button').filter({ hasText: /Submit|Done|Finish/i }).first(),
        modal.locator('button').last(), // fallback: last button in modal
      );
    }
  ).catch(() => { });

  // ── 5. Consent / Data sharing popup ──────────────────────────────────────
  await page.addLocatorHandler(
    page.locator('.sb-modal, .sb-modal-container').filter({ hasText: /consent|share|data|information/i }).first(),
    async (modal) => {
      console.log('[AutoDismiss] Consent popup detected — auto-handling...');
      // Tick the checkbox if present
      const checkbox = modal.locator('input[type="checkbox"], [role="checkbox"]').first();
      if (await checkbox.isVisible({ timeout: 500 }).catch(() => false)) {
        await checkbox.click({ force: true }).catch(() => { });
        await page.waitForTimeout(300);
      }
      // Then click Share / Confirm / Continue
      await tryClick(
        modal.locator('button').filter({ hasText: /Share|Confirm|Continue|OK/i }).first(),
      );
    }
  ).catch(() => { });

  // ── 6. "Update available" / App update banners ────────────────────────────
  await page.addLocatorHandler(
    page.locator('[class*="update-banner"], [class*="app-update"]').first(),
    async () => {
      console.log('[AutoDismiss] Update banner — dismissing...');
      await tryClick(
        page.locator('button').filter({ hasText: /Later|Dismiss|Close|Skip/i }).first(),
      );
    }
  ).catch(() => { });

  console.log('[AutoDismiss] Background popup handlers registered ✅');
}

// ─────────────────────────────────────────────────────────────────────────────
// BUG DETECTOR: Real-time console error / network failure monitor
// ─────────────────────────────────────────────────────────────────────────────

interface BugReport {
  consoleErrors: string[];
  failedRequests: string[];
  jsExceptions: string[];
}

/**
 * Attaches listeners to capture console errors, JS exceptions, and failed
 * network requests throughout the test. Call once per test at the start.
 *
 * Returns a `getBugReport()` function you can call at any time to see what
 * was caught, and a `assertNoBugs()` function that fails the test if bugs found.
 *
 * Usage:
 *   const { getBugReport, assertNoBugs } = setupBugDetector(page);
 *   // ... run your test ...
 *   await assertNoBugs(page);  // call at the end, or at key checkpoints
 */
export function setupBugDetector(page: Page) {
  const report: BugReport = {
    consoleErrors: [],
    failedRequests: [],
    jsExceptions: [],
  };

  // Capture browser console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filter out noisy but harmless browser messages
      const isNoise = /favicon|ResizeObserver|Non-passive event|net::ERR_ABORTED/i.test(text);
      if (!isNoise) {
        report.consoleErrors.push(`[Console Error] ${text}`);
        console.warn(`🐛 Console error detected: ${text.slice(0, 120)}`);
      }
    }
  });

  // Capture uncaught JS exceptions
  page.on('pageerror', (err) => {
    report.jsExceptions.push(`[JS Exception] ${err.message}`);
    console.warn(`💥 JS Exception: ${err.message.slice(0, 120)}`);
  });

  // Capture failed network requests (4xx / 5xx, excluding auth redirects)
  page.on('requestfailed', (request) => {
    const url = request.url();
    const failure = request.failure()?.errorText ?? 'unknown';
    // Skip expected auth redirects and aborted requests
    if (!/auth\/realms|ERR_ABORTED|ERR_CANCELED/.test(url + failure)) {
      report.failedRequests.push(`[Failed Request] ${request.method()} ${url} — ${failure}`);
      console.warn(`🌐 Request failed: ${url.slice(0, 100)} (${failure})`);
    }
  });

  page.on('response', async (response) => {
    const status = response.status();
    const url = response.url();
    // Flag 4xx/5xx responses for API calls (not page navigations)
    if (status >= 400 && url.includes('/api/')) {
      report.failedRequests.push(`[HTTP ${status}] ${url}`);
      console.warn(`🌐 API returned ${status}: ${url.slice(0, 100)}`);
    }
  });

  function getBugReport(): BugReport {
    return { ...report };
  }

  /**
   * Takes a labeled screenshot and logs the current bug report.
   * Does NOT throw — use `assertNoBugs` to fail the test.
   */
  async function checkpointReport(page: Page, label: string): Promise<void> {
    const r = getBugReport();
    const hasIssues = r.consoleErrors.length + r.failedRequests.length + r.jsExceptions.length > 0;

    console.log(`\n📊 Bug report @ "${label}":`);
    if (r.jsExceptions.length > 0) console.warn('  JS Exceptions:\n  ' + r.jsExceptions.join('\n  '));
    if (r.consoleErrors.length > 0) console.warn('  Console Errors:\n  ' + r.consoleErrors.join('\n  '));
    if (r.failedRequests.length > 0) console.warn('  Failed Requests:\n  ' + r.failedRequests.join('\n  '));
    if (!hasIssues) console.log('  ✅ No issues detected.');
  }

  /**
   * Throws an error listing all detected bugs — use at test end or key checkpoint.
   * Set `strict: false` to just log without failing.
   */
  async function assertNoBugs(page: Page, strict = true): Promise<void> {
    await checkpointReport(page, 'assertNoBugs');
    const r = getBugReport();
    const allIssues = [...r.jsExceptions, ...r.consoleErrors, ...r.failedRequests];
    if (strict && allIssues.length > 0) {
      throw new Error(
        `❌ ${allIssues.length} UI bug(s) detected:\n` + allIssues.slice(0, 10).join('\n')
      );
    }
  }

  return { getBugReport, checkpointReport, assertNoBugs };
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECKPOINT SCREENSHOT: Annotated screenshots at key moments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Takes a named screenshot and attaches it to the test report.
 * Screenshots are saved in test-results/ and visible in the HTML report.
 *
 * Usage:
 *   await takeCheckpoint(page, testInfo, 'after-login');
 *   await takeCheckpoint(page, testInfo, 'course-joined');
 */
export async function takeCheckpoint(
  page: Page,
  testInfo: { attach: Function; title: string },
  label: string
): Promise<void> {
  if (page.isClosed()) return;
  try {
    const safeName = label.replace(/[^a-z0-9_-]/gi, '_');
    const screenshotBytes = await page.screenshot({ fullPage: false });
    await testInfo.attach(`📸 ${label}`, {
      body: screenshotBytes,
      contentType: 'image/png',
    });
    console.log(`📸 Screenshot taken: "${label}" (URL: ${page.url()})`);
  } catch (e) {
    console.warn(`Could not take checkpoint screenshot "${label}": ${e}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI HEALTH CHECKS: Proactive bug detection for common UI issues
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runs a suite of proactive UI health checks on the current page.
 * Catches common bugs like broken images, missing headings, layout issues.
 *
 * Usage:
 *   const issues = await runUIHealthChecks(page);
 *   if (issues.length > 0) console.warn('UI issues:', issues);
 */
export async function runUIHealthChecks(page: Page): Promise<string[]> {
  const issues: string[] = [];
  if (page.isClosed()) return issues;

  console.log('🔍 Running UI health checks...');

  try {
    const result = await page.evaluate(() => {
      const problems: string[] = [];

      // ── 1. Broken images ────────────────────────────────────────────────
      const allImages = Array.from(document.querySelectorAll('img'));
      const brokenImgs = allImages.filter(img =>
        !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0
      );
      if (brokenImgs.length > 0) {
        brokenImgs.slice(0, 5).forEach(img =>
          problems.push(`🖼️  Broken image: ${img.src || img.getAttribute('src') || '(no src)'}`)
        );
      }

      // ── 2. Missing page title ────────────────────────────────────────────
      if (!document.title || document.title.trim().length < 2) {
        problems.push('📄 Page has no title tag');
      }

      // ── 3. Missing h1 ────────────────────────────────────────────────────
      const h1s = document.querySelectorAll('h1');
      if (h1s.length === 0) {
        problems.push('📝 No <h1> heading found on this page');
      } else if (h1s.length > 1) {
        problems.push(`📝 Multiple <h1> tags found (${h1s.length}) — should be only 1`);
      }

      // ── 4. Visible "undefined" / "null" / template literals ──────────────
      const bodyText = document.body.innerText;
      if (/\bundefined\b/.test(bodyText)) {
        // Narrow it down — only count if visible in a meaningful context
        const matches = bodyText.match(/\bundefined\b/g);
        if (matches && matches.length > 2) {
          problems.push(`⚠️  "undefined" appears ${matches.length} times in page text — possible rendering bug`);
        }
      }
      if (/\bnull\b/.test(bodyText)) {
        const matches = bodyText.match(/\bnull\b/g);
        if (matches && matches.length > 3) {
          problems.push(`⚠️  "null" appears ${matches.length} times in page text — possible data bug`);
        }
      }

      // ── 5. Buttons with no label ─────────────────────────────────────────
      const buttons = Array.from(document.querySelectorAll('button'));
      const unlabelledBtns = buttons.filter(
        b => !b.innerText.trim() && !b.getAttribute('aria-label') && !b.title
      );
      if (unlabelledBtns.length > 0) {
        problems.push(`♿ ${unlabelledBtns.length} button(s) have no visible text or aria-label (accessibility bug)`);
      }

      // ── 6. Elements overflowing viewport ─────────────────────────────────
      const overflowing = Array.from(document.querySelectorAll('*')).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.right > window.innerWidth + 5 && rect.width > 10 && rect.height > 10;
      });
      if (overflowing.length > 0) {
        problems.push(`📐 ${overflowing.length} element(s) overflow the page width — possible layout bug`);
      }

      // ── 7. Empty containers that should have content ──────────────────────
      const courseCards = document.querySelectorAll('.sb-course-card, .sb-card, .course-card');
      if (courseCards.length === 0 && document.location.href.includes('/learn')) {
        problems.push('📭 Course page loaded but no course cards found — possible data/API issue');
      }

      return problems;
    }).catch(() => [] as string[]);

    issues.push(...result);
  } catch (e) {
    console.warn('UI health check evaluation failed:', e);
  }

  if (issues.length > 0) {
    console.warn(`\n⚠️  UI Health Check Results (${issues.length} issue(s)):`);
    issues.forEach(i => console.warn('  ' + i));
  } else {
    console.log('  ✅ All UI health checks passed.');
  }

  return issues;
}
