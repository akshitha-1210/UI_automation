import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 10 * 60 * 1000,
  workers: 1,
  /* Run tests in files in parallel */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry once on failures so we capture trace on the retry */
  retries: process.env.CI ? 2 : 1,

  /* ── Reporting ─────────────────────────────────────────────────────────── */
  reporter: [
    // Rich HTML report: open with `npx playwright show-report`
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    // Live terminal output with timestamps
    ['line'],
  ],

  /* ── Shared settings for all projects ────────────────────────────────── */
  use: {
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    navigationTimeout: 60000,

    /* 📸 Screenshots ──────────────────────────────────────────────────────
     * 'only-on-failure' → auto-screenshot when test fails
     * You can change to 'on' to capture on every step (verbose) */
    screenshot: 'only-on-failure',

    /* 🎬 Video recording ──────────────────────────────────────────────────
     * 'retain-on-failure' → keeps video only for failed tests (saves disk space)
     * Change to 'on' to always record */
    video: 'retain-on-failure',

    /* 🔍 Trace viewer ─────────────────────────────────────────────────────
     * 'on-first-retry' → full DOM/network/screenshot timeline on retry.
     * Open with: npx playwright show-trace trace.zip
     * Change to 'on' to always record traces */
    trace: 'on-first-retry',
  },

  /* ── Output folder for test artifacts ─────────────────────────────────── */
  outputDir: 'test-results',

  /* ── Browser projects ─────────────────────────────────────────────────── */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    // Uncomment to test in more browsers:
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit',  use: { ...devices['Desktop Safari'] } },
  ],
});

