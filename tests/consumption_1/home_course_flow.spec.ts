import { test, expect, Page, Frame } from '@playwright/test';
import { loginWithValidCredentials, closeAnyPopup } from './helpers';

test.setTimeout(20 * 60 * 1000); // 20 min max per test

// ─── Utility: read course progress % ─────────────────────────────────────────
async function readProgress(page: Page): Promise<number | null> {
  // Strategy 1: aria-valuenow on a progress bar element
  try {
    const val = await page.evaluate((): number | null => {
      const bar = document.querySelector<HTMLElement>(
        '[aria-valuenow][role="progressbar"], [aria-valuenow][class*="progress"]'
      );
      if (bar) {
        const n = parseInt(bar.getAttribute('aria-valuenow') ?? '', 10);
        if (!isNaN(n)) return n;
      }
      return null;
    });
    if (val !== null) return val;
  } catch (_) {}

  // Strategy 2: "Course Progress" panel text
  try {
    const progressPanel = page
      .locator('h3:has-text("Course Progress"), h2:has-text("Course Progress"), span:has-text("Course Progress")')
      .first()
      .locator('..');
    const txt = await progressPanel.textContent({ timeout: 3000 }).catch(() => '');
    const m = txt?.match(/(\d+)%/);
    if (m) return parseInt(m[1], 10);
  } catch (_) {}

  // Strategy 3: any standalone "XX%" text
  try {
    const pct = page.locator('text=/^\\d+%$/').first();
    if (await pct.isVisible({ timeout: 1500 }).catch(() => false)) {
      const t = await pct.textContent().catch(() => '');
      const m2 = t?.match(/(\d+)/);
      if (m2) return parseInt(m2[1], 10);
    }
  } catch (_) {}

  return null;
}

// ─── Utility: attach screenshot + text to report ─────────────────────────────
async function bugReport(page: Page, id: string, message: string) {
  const ts = Date.now();
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60);
  const imgPath = `test-results/bug-${safeId}-${ts}.png`;
  try { await page.screenshot({ path: imgPath, fullPage: false }); } catch (_) {}
  try { await test.info().attach(`bug-${safeId}`, { path: imgPath, contentType: 'image/png' }); } catch (_) {}
  try { await test.info().attach(`bug-${safeId}-details`, { body: message, contentType: 'text/plain' }); } catch (_) {}
  console.log('🐞 BUG:', message);
}

// ─── Utility: expand all Course Unit accordions in the TOC sidebar ────────────
async function expandAllUnits(page: Page) {
  try {
    const unitBtns = page.locator('button:has-text("Course Unit"), [class*="accordion"] button, [class*="unit"] button');
    const count = await unitBtns.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      try {
        const btn = unitBtns.nth(i);
        const ariaExpanded = await btn.getAttribute('aria-expanded').catch(() => null);
        const dataState = await btn.getAttribute('data-state').catch(() => null);
        if (ariaExpanded === 'true' || dataState === 'open') continue;
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(300);
      } catch (_) {}
    }
  } catch (_) {}
}

// ─── Utility: read a lesson's status from the TOC anchor ─────────────────────
// Returns "Completed" | "In progress" | "Not viewed" | null
async function getLessonStatus(page: Page, href: string): Promise<string | null> {
  const rel = href.replace('https://test.sunbirded.org', '');
  const anchor = page.locator(`a[href="${href}"], a[href="${rel}"]`).first();
  if (!await anchor.isVisible({ timeout: 2000 }).catch(() => false)) return null;

  // Strategy 1: only spans/smalls that actually contain a known status keyword
  // (avoids falsely reading lesson title text like "About" from the last span)
  const badgeText = await anchor.evaluate((el: Element): string => {
    const candidates = Array.from(
      el.querySelectorAll<HTMLElement>('span[class*="status"], span[class*="badge"], small')
    );
    for (const s of candidates) {
      const t = s.textContent?.trim() ?? '';
      if (/completed|in\s*progress|not\s*view/i.test(t)) return t;
    }
    // Fallback: any span whose text is ONLY a status word (exact match, no title bleed)
    for (const s of Array.from(el.querySelectorAll<HTMLElement>('span')).reverse()) {
      const t = s.textContent?.trim() ?? '';
      if (/^(completed|in progress|not viewed)$/i.test(t)) return t;
    }
    return '';
  }).catch(() => '');

  if (/completed/i.test(badgeText)) return 'Completed';
  if (/in\s*progress/i.test(badgeText)) return 'In progress';
  if (/not\s*view/i.test(badgeText)) return 'Not viewed';

  // Strategy 2: all spans
  const allSpans = await anchor.evaluate((el: Element): string =>
    Array.from(el.querySelectorAll('span, small')).map(s => s.textContent?.trim() ?? '').join('|')
  ).catch(() => '');
  if (/completed/i.test(allSpans)) return 'Completed';
  if (/in\s*progress/i.test(allSpans)) return 'In progress';
  if (/not\s*view/i.test(allSpans)) return 'Not viewed';

  // Strategy 3: full anchor text
  const full = (await anchor.textContent().catch(() => ''))?.trim() ?? '';
  if (/completed/i.test(full)) return 'Completed';
  if (/in\s*progress/i.test(full)) return 'In progress';
  if (/not\s*view/i.test(full)) return 'Not viewed';

  return full.substring(0, 60) || null;
}

// ─── Utility: collect all leaf lesson hrefs from the TOC ────────────────────
async function collectLessonHrefs(page: Page): Promise<string[]> {
  const currentUrl = page.url();
  const sels = [
    'nav a[href*="/content/"]',
    '[class*="toc"] a[href*="/content/"]',
    '[class*="sidebar"] a[href*="/content/"]',
    'a[href*="/content/"]',
  ];

  for (const sel of sels) {
    try {
      const anchors = page.locator(sel);
      const n = await anchors.count().catch(() => 0);
      if (n === 0) continue;
      const hrefs: string[] = [];
      for (let i = 0; i < n; i++) {
        const href = await anchors.nth(i).getAttribute('href').catch(() => null);
        if (!href) continue;
        // Skip fragment-only anchors like #about, #contact — those are not lessons
        if (/#[a-zA-Z]/.test(href) && !/\/content\/do_/.test(href.split('#')[0])) continue;
        // Also skip hrefs that are ONLY a fragment variant of an already-collected URL
        const withoutFragment = href.split('#')[0];
        const full = withoutFragment.startsWith('http') ? withoutFragment : `https://test.sunbirded.org${withoutFragment}`;
        if (full === currentUrl) continue;
        if (hrefs.includes(full)) continue;
        hrefs.push(full);
      }
      if (hrefs.length > 0) {
        console.log(`  TOC via "${sel}" -> ${hrefs.length} lesson(s)`);
        return hrefs;
      }
    } catch (_) {}
  }

  // DOM eval fallback
  const fromDOM = await page.evaluate((base: string): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
      // Strip fragment so #about / #contact variants don't create duplicate entries
      const href = a.href.split('#')[0];
      if (/\/content\/do_/.test(href) && href !== base && !seen.has(href)) {
        seen.add(href);
        out.push(href);
      }
    });
    return out;
  }, currentUrl).catch(() => [] as string[]);
  console.log(`  TOC via DOM eval -> ${fromDOM.length} lesson(s)`);
  return fromDOM;
}

// ─── Capture screenshot + report bug if status is stale on completion ─────────
async function checkAndReportStaleStatus(
  page: Page,
  lessonHref: string,
  lessonLabel: string,
  eventKey: string
) {
  const safeLabel = lessonLabel.replace(/\s+/g, '-');
  const shotPath = `test-results/${eventKey}-${safeLabel}-${Date.now()}.png`;
  await page.screenshot({ path: shotPath, fullPage: false }).catch(() => {});
  await test.info().attach(`${eventKey}-${safeLabel}`, { path: shotPath, contentType: 'image/png' }).catch(() => {});

  const statusNow = await getLessonStatus(page, lessonHref);
  const progressNow = await readProgress(page);

  console.log(`  [${lessonLabel}] On "${eventKey}": TOC status="${statusNow ?? '(not found)'}", progress=${progressNow ?? '?'}%`);

  if (statusNow !== null && statusNow !== 'Completed') {
    const banner = /you-just-completed/.test(eventKey)
      ? '"You just completed <lesson-name>" banner'
      : '"We would love to hear from you" feedback form';
    const bugMsg =
      `BUG: [${lessonLabel}] Lesson status NOT updated to "Completed" even though ${banner} is visible.\n` +
      `  ${banner} confirms the lesson is fully consumed, but TOC still shows: "${statusNow}".\n` +
      `  Course Progress: ${progressNow ?? 'unknown'}%.\n` +
      `  Lesson URL: ${lessonHref}\n` +
      `  Screenshot: ${shotPath}`;
    await bugReport(page, `stale-status-on-${eventKey}-${safeLabel}`, bugMsg);
    expect.soft(statusNow, bugMsg).toBe('Completed');
  }
}

// ─── Dismiss the feedback form ("We would love to hear from you") ─────────────
async function dismissFeedback(page: Page, lessonLabel: string) {
  const dismissSels = [
    'button:has-text("Skip")',
    'button:has-text("Close")',
    'button[aria-label="Close"]',
    'button[aria-label*="close" i]',
    'button:has-text("Submit")',
    'button:has-text("Done")',
    'button:has-text("Later")',
    '[class*="feedback"] button:last-of-type',
    '[class*="rating"] button:last-of-type',
  ];

  for (const sel of dismissSels) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 500 }).catch(() => false)) {
        await el.click().catch(() => {});
        await page.waitForTimeout(600);
        console.log(`  [${lessonLabel}] Dismissed feedback via "${sel}"`);
        return;
      }
    } catch (_) {}
  }

  const xBtn = page.locator('button:has-text("x"), button[aria-label="x"], [class*="close-btn"]').first();
  if (await xBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await xBtn.click().catch(() => {});
    await page.waitForTimeout(500);
  } else {
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  }
}

// ─── Consume a VIDEO lesson (YouTube or native) ───────────────────────────────
async function consumeVideoLesson(
  page: Page,
  lessonHref: string,
  lessonLabel: string,
  playerBox: { x: number; y: number; width: number; height: number } | null,
  isFeedbackVisible: () => Promise<boolean>,
  isYouJustCompletedVisible: () => Promise<boolean>,
  isLessonCompletedInTOC: () => Promise<boolean>
): Promise<boolean> {
  // Click center of player to start/focus
  if (playerBox) {
    await page.mouse.click(
      Math.round(playerBox.x + playerBox.width / 2),
      Math.round(playerBox.y + playerBox.height / 2)
    ).catch(() => {});
    await page.waitForTimeout(800);
  }

  await page.keyboard.press('k').catch(() => {});
  await page.waitForTimeout(500);

  // Set 2X speed
  const setTwoXSpeed = async () => {
    // YouTube iframe
    const ytFrame = page.frames().find(fr => fr.url().includes('youtube.com/embed'));
    if (ytFrame) {
      try {
        const settingsBtn = ytFrame.locator('.ytp-settings-button, button[aria-label*="Settings" i]').first();
        if (await settingsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await settingsBtn.click({ timeout: 2000 });
          await ytFrame.waitForTimeout(400);
          const speedMenu = ytFrame.locator(
            '.ytp-menuitem:has-text("Playback speed"), .ytp-panel-menu :text("Playback speed")'
          ).first();
          await speedMenu.click({ timeout: 2000 });
          await ytFrame.waitForTimeout(300);
          const speed2x = ytFrame.locator(
            '.ytp-menuitem:has-text("2"), .ytp-panel-menu :text-is("2")'
          ).first();
          await speed2x.click({ timeout: 2000 });
          console.log(`  [${lessonLabel}] YouTube speed -> 2x`);
          return;
        }
      } catch (_) {}
    }

    // Native video
    for (const fr of [page as unknown as Frame, ...page.frames()]) {
      try {
        await (fr as any).evaluate(() => {
          document.querySelectorAll<HTMLVideoElement>('video').forEach(v => {
            v.playbackRate = 2;
            if (v.paused) v.play().catch(() => {});
          });
        });
      } catch (_) {}
    }
    console.log(`  [${lessonLabel}] Native video playbackRate -> 2x`);
  };

  await setTwoXSpeed();

  const deadline = Date.now() + 12 * 60 * 1000;
  let lastBodySnippet = '';
  let lastChangeAt = Date.now();

  while (Date.now() < deadline) {
    // Re-apply 2x speed every poll
    for (const fr of [page as unknown as Frame, ...page.frames()]) {
      try {
        await (fr as any).evaluate(() => {
          document.querySelectorAll<HTMLVideoElement>('video').forEach(v => {
            if (v.playbackRate !== 2) v.playbackRate = 2;
          });
        });
      } catch (_) {}
    }

    if (await isFeedbackVisible()) {
      console.log(`  [${lessonLabel}] Feedback form appeared — video done`);
      await checkAndReportStaleStatus(page, lessonHref, lessonLabel, 'feedback-video');
      await dismissFeedback(page, lessonLabel);
      return true;
    }
    if (await isYouJustCompletedVisible()) {
      console.log(`  [${lessonLabel}] "You just completed" — video done`);
      await checkAndReportStaleStatus(page, lessonHref, lessonLabel, 'you-just-completed-video');
      return true;
    }
    if (await isLessonCompletedInTOC()) {
      console.log(`  [${lessonLabel}] TOC -> Completed`);
      return true;
    }

    const snippet = await page.evaluate(() => document.body.innerText.substring(0, 500)).catch(() => '');
    if (snippet !== lastBodySnippet) {
      lastBodySnippet = snippet;
      lastChangeAt = Date.now();
    } else if (Date.now() - lastChangeAt > 90_000) {
      console.log(`  [${lessonLabel}] Video page stuck 90s — reporting bug`);
      const stuckShot = `test-results/stuck-video-${lessonLabel.replace(/\s+/g, '-')}-${Date.now()}.png`;
      await page.screenshot({ path: stuckShot, fullPage: false }).catch(() => {});
      await test.info().attach(`stuck-video-${lessonLabel}`, { path: stuckShot, contentType: 'image/png' }).catch(() => {});
      await bugReport(page, `video-stuck-${lessonLabel.replace(/\s+/g, '-')}`,
        `BUG: [${lessonLabel}] Video lesson player was stuck on the same screen for over 90 seconds.\n` +
        `  The video may have ended but the app did not show "You just completed" or update the TOC.\n` +
        `  Lesson URL: ${lessonHref}`
      );
      return true;
    }

    await page.waitForTimeout(3000);
  }

  console.log(`  [${lessonLabel}] Video timeout (12 min) — moving on`);
  return true;
}

// ─── Consume a SLIDE/PDF/non-video lesson via right-arrow clicks ──────────────
async function consumeSlideLesson(
  page: Page,
  lessonHref: string,
  lessonLabel: string,
  playerBox: { x: number; y: number; width: number; height: number } | null,
  isFeedbackVisible: () => Promise<boolean>,
  isYouJustCompletedVisible: () => Promise<boolean>,
  isLessonCompletedInTOC: () => Promise<boolean>
): Promise<boolean> {
  // Read page counter ("N / M" or "Page N of M")
  const getPageInfo = async (): Promise<{ current: number; total: number } | null> => {
    try {
      const inp = page.locator('input[type="number"], [class*="page-number"] input').first();
      if (await inp.isVisible({ timeout: 400 }).catch(() => false)) {
        const cur = parseInt(await inp.inputValue().catch(() => '0'), 10) || 0;
        const totEl = page.locator('text=/\\/\\s*\\d+/').first();
        const totTxt = await totEl.textContent({ timeout: 400 }).catch(() => '') ?? '';
        const totM = totTxt.match(/(\d+)$/);
        return { current: cur, total: totM ? parseInt(totM[1], 10) : cur };
      }
      const fracEl = page.locator('text=/\\d+\\s*\\/\\s*\\d+/').first();
      if (await fracEl.isVisible({ timeout: 400 }).catch(() => false)) {
        const fracTxt = await fracEl.textContent({ timeout: 400 }).catch(() => '') ?? '';
        const m = fracTxt.match(/(\d+)\s*\/\s*(\d+)/);
        if (m) return { current: parseInt(m[1], 10), total: parseInt(m[2], 10) };
      }
    } catch (_) {}
    return null;
  };

  // Right-arrow button selectors (hover-revealed)
  const rightArrowSels = [
    'button.navigate-next',
    'button[class*="navigate-next"]',
    'button[class*="next-page"]',
    'button[aria-label*="Next" i]:not([aria-label*="lesson" i])',
    'button[aria-label*="next page" i]',
    'button[aria-label*="forward" i]',
    'button:has(svg[data-icon*="right"])',
    'button:has(svg[class*="right"])',
    '[class*="player"] button:last-of-type',
    '[class*="content"] button:last-of-type',
  ];

  // Hover the right side of the player to reveal the hidden arrow button
  const hoverAndFindArrow = async (): Promise<ReturnType<typeof page.locator> | null> => {
    if (playerBox) {
      await page.mouse.move(
        Math.round(playerBox.x + playerBox.width * 0.85),
        Math.round(playerBox.y + playerBox.height * 0.5)
      ).catch(() => {});
      await page.waitForTimeout(400);
    }
    for (const sel of rightArrowSels) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 600 }).catch(() => false)) {
          return el;
        }
      } catch (_) {}
    }
    return null;
  };

  // Click the right-arrow; re-hover if it disappeared
  const clickNextArrow = async (
    arrowBtn: ReturnType<typeof page.locator> | null
  ): Promise<ReturnType<typeof page.locator> | null> => {
    if (arrowBtn && await arrowBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await arrowBtn.scrollIntoViewIfNeeded().catch(() => {});
      await arrowBtn.click({ timeout: 2000 }).catch(() => {});
      return arrowBtn;
    }
    const found = await hoverAndFindArrow();
    if (found) {
      await found.scrollIntoViewIfNeeded().catch(() => {});
      await found.click({ timeout: 2000 }).catch(() => {});
      return found;
    }
    // Keyboard fallback
    if (playerBox) {
      await page.mouse.click(
        Math.round(playerBox.x + playerBox.width / 2),
        Math.round(playerBox.y + playerBox.height / 2)
      ).catch(() => {});
    }
    await page.keyboard.press('ArrowRight').catch(() => {});
    return null;
  };

  let arrowBtn = await hoverAndFindArrow();
  if (arrowBtn) {
    console.log(`  [${lessonLabel}] Found right-arrow button`);
  } else {
    console.log(`  [${lessonLabel}] Right-arrow not immediately visible — will hover on each click`);
  }

  const pi = await getPageInfo();
  if (pi) console.log(`  [${lessonLabel}] Pagination: ${pi.current} / ${pi.total}`);

  const maxClicks = 300;
  let clicks = 0;
  let lastBodySnippet = '';
  let lastChangeAt = Date.now();
  const STUCK_MS = 60_000;

  while (clicks < maxClicks) {
    clicks++;

    if (await isFeedbackVisible()) {
      console.log(`  [${lessonLabel}] Feedback form — lesson done`);
      await checkAndReportStaleStatus(page, lessonHref, lessonLabel, 'feedback-slide');
      await dismissFeedback(page, lessonLabel);
      return true;
    }
    if (await isYouJustCompletedVisible()) {
      console.log(`  [${lessonLabel}] "You just completed" banner — lesson done`);
      await checkAndReportStaleStatus(page, lessonHref, lessonLabel, 'you-just-completed-slide');
      return true;
    }
    if (await isLessonCompletedInTOC()) {
      console.log(`  [${lessonLabel}] TOC -> Completed`);
      return true;
    }

    const cur = await getPageInfo();
    if (cur) {
      console.log(`  [${lessonLabel}] Slide ${cur.current} / ${cur.total}`);
      if (cur.current >= cur.total) {
        console.log(`  [${lessonLabel}] Reached last slide — waiting for completion signal`);
        await page.waitForTimeout(2000);
        if (await isFeedbackVisible()) {
          await checkAndReportStaleStatus(page, lessonHref, lessonLabel, 'feedback-last-slide');
          await dismissFeedback(page, lessonLabel);
          return true;
        }
        if (await isYouJustCompletedVisible()) {
          await checkAndReportStaleStatus(page, lessonHref, lessonLabel, 'you-just-completed-last-slide');
          return true;
        }
        if (await isLessonCompletedInTOC()) return true;
      }
    }

    // Stuck detection
    const snippet = await page.evaluate(() => document.body.innerText.substring(0, 500)).catch(() => '');
    if (snippet !== lastBodySnippet) {
      lastBodySnippet = snippet;
      lastChangeAt = Date.now();
    } else if (Date.now() - lastChangeAt > STUCK_MS) {
      console.log(`  [${lessonLabel}] Content unchanged for 60s — reporting stuck bug`);
      const stuckShot = `test-results/stuck-slide-${lessonLabel.replace(/\s+/g, '-')}-${Date.now()}.png`;
      await page.screenshot({ path: stuckShot, fullPage: false }).catch(() => {});
      await test.info().attach(`stuck-slide-${lessonLabel}`, { path: stuckShot, contentType: 'image/png' }).catch(() => {});
      await bugReport(page, `slide-stuck-${lessonLabel.replace(/\s+/g, '-')}`,
        `BUG: [${lessonLabel}] Slide player was stuck on the same screen for over 60 seconds.\n` +
        `  The content may have been fully consumed but the app did not show a completion signal.\n` +
        `  Lesson URL: ${lessonHref}`
      );
      return true;
    }

    arrowBtn = await clickNextArrow(arrowBtn);
    await page.waitForTimeout(700);
  }

  // Hit click cap
  console.log(`  [${lessonLabel}] Reached ${maxClicks}-click cap without completion signal`);
  const capShot = `test-results/cap-${lessonLabel.replace(/\s+/g, '-')}-${Date.now()}.png`;
  await page.screenshot({ path: capShot, fullPage: false }).catch(() => {});
  await test.info().attach(`cap-${lessonLabel}`, { path: capShot, contentType: 'image/png' }).catch(() => {});
  await bugReport(page, `slide-cap-${lessonLabel.replace(/\s+/g, '-')}`,
    `BUG: [${lessonLabel}] Lesson did not show a completion signal after ${maxClicks} right-arrow clicks.\n` +
    `  Expected: "You just completed" banner or "We would love to hear from you" feedback form.\n` +
    `  Lesson URL: ${lessonHref}`
  );
  return false;
}

// ─── Core: consume the lesson in the content player ──────────────────────────
async function consumeCurrentLesson(
  page: Page,
  lessonHref: string,
  lessonLabel: string
): Promise<boolean> {
  await page.waitForTimeout(1500);
  await closeAnyPopup(page).catch(() => {});

  // Completion signal helpers
  const isFeedbackVisible = async (): Promise<boolean> =>
    page.locator(
      'text=/we would love to hear from you/i, ' +
      'text=/how was your learning/i, ' +
      'text=/share your feedback/i, ' +
      'text=/rate this/i, ' +
      '[class*="feedback"], [class*="rating"]'
    ).first().isVisible({ timeout: 400 }).catch(() => false);

  const isYouJustCompletedVisible = async (): Promise<boolean> =>
    page.locator('text=/you just completed/i')
      .first().isVisible({ timeout: 400 }).catch(() => false);

  const isLessonCompletedInTOC = async (): Promise<boolean> => {
    const activeCompleted = await page.locator(
      '[class*="active"] span:has-text("Completed"), ' +
      'a[aria-current] span:has-text("Completed"), ' +
      'a[class*="active"] span:has-text("Completed")'
    ).first().isVisible({ timeout: 400 }).catch(() => false);
    if (activeCompleted) return true;
    return (await getLessonStatus(page, lessonHref)) === 'Completed';
  };

  // Already Completed?
  if (await isLessonCompletedInTOC()) {
    console.log(`  [${lessonLabel}] Already Completed — skipping`);
    return true;
  }

  // Completion banners visible on entry?
  if (await isYouJustCompletedVisible()) {
    console.log(`  [${lessonLabel}] "You just completed" visible on entry`);
    await checkAndReportStaleStatus(page, lessonHref, lessonLabel, 'you-just-completed-on-entry');
    return true;
  }
  if (await isFeedbackVisible()) {
    console.log(`  [${lessonLabel}] Feedback form visible on entry`);
    await checkAndReportStaleStatus(page, lessonHref, lessonLabel, 'feedback-on-entry');
    await dismissFeedback(page, lessonLabel);
    return true;
  }

  // Wait for content to load
  await page.waitForTimeout(2000);

  // Detect the content player iframe bounding box
  const playerIframeSel = [
    'iframe#contentPlayer',
    'iframe[name="contentPlayer"]',
    'iframe[class*="content-player"]',
    'iframe[src*="content"]',
  ].join(', ');
  const playerIframe = page.locator(playerIframeSel).first();
  const playerBox = await playerIframe.boundingBox().catch(() => null);

  // Detect video in any frame
  let hasVideo = false;
  for (const fr of [page as unknown as Frame, ...page.frames()]) {
    try {
      const vid = (fr as any).locator('video').first();
      if (await vid.isVisible({ timeout: 2000 }).catch(() => false)) {
        hasVideo = true;
        break;
      }
    } catch (_) {}
  }

  if (hasVideo) {
    console.log(`  [${lessonLabel}] Video content detected`);
    return await consumeVideoLesson(
      page, lessonHref, lessonLabel, playerBox,
      isFeedbackVisible, isYouJustCompletedVisible, isLessonCompletedInTOC
    );
  }

  console.log(`  [${lessonLabel}] Non-video content — using right-arrow`);
  return await consumeSlideLesson(
    page, lessonHref, lessonLabel, playerBox,
    isFeedbackVisible, isYouJustCompletedVisible, isLessonCompletedInTOC
  );
}

// ─── Consume + verify one lesson (progress + status checks) ──────────────────
async function consumeAndVerify(
  page: Page,
  href: string,
  label: string
): Promise<void> {
  const progressBefore = await readProgress(page);
  console.log(`\n-> [${label}] Starting consumption. Progress before: ${progressBefore ?? 'unknown'}%`);

  await consumeCurrentLesson(page, href, label);

  await page.waitForTimeout(1500);
  await expandAllUnits(page);
  await page.waitForTimeout(600);

  // Check 1: TOC status -> "Completed"
  let statusAfter: string | null = null;
  const statusDeadline = Date.now() + 12_000;
  while (Date.now() < statusDeadline) {
    statusAfter = await getLessonStatus(page, href);
    console.log(`  [poll] TOC status = "${statusAfter}"`);
    if (statusAfter === 'Completed') break;
    await page.waitForTimeout(1500);
    await expandAllUnits(page).catch(() => {});
  }
  console.log(`  Status after: "${statusAfter}"`);

  if (statusAfter !== 'Completed') {
    const rel = href.replace('https://test.sunbirded.org', '');
    const anchor = page.locator(`a[href="${href}"], a[href="${rel}"]`).first();
    const rawHtml = await anchor.evaluate((el: Element) => el.outerHTML).catch(() => '(unavailable)');
    console.log(`  Raw anchor HTML: ${rawHtml.substring(0, 300)}`);

    const staleShot = `test-results/stale-status-${label.replace(/\s+/g, '-')}-${Date.now()}.png`;
    await page.screenshot({ path: staleShot, fullPage: false }).catch(() => {});
    await test.info().attach(`stale-status-${label}`, { path: staleShot, contentType: 'image/png' }).catch(() => {});

    const bugMsg =
      `BUG: [${label}] Lesson status did NOT update to "Completed" after the lesson was finished.\n` +
      `  Completion signal (feedback form or "You just completed" banner) was detected,\n` +
      `  but TOC anchor still shows: "${statusAfter}"\n` +
      `  Expected: "Completed"  Got: "${statusAfter}"\n` +
      `  Lesson URL: ${href}\n` +
      `  Screenshot: ${staleShot}`;
    await bugReport(page, `stale-status-after-${label.replace(/\s+/g, '-')}`, bugMsg);
    expect.soft(statusAfter, bugMsg).toBe('Completed');
  } else {
    console.log(`  [${label}] TOC shows Completed`);
  }

  // Check 2: Course Progress % increased
  const progressAfter = await readProgress(page);
  console.log(`  Progress after: ${progressAfter ?? 'unknown'}%`);

  if (progressBefore !== null && progressAfter !== null) {
    if (progressAfter < progressBefore) {
      // Progress went backwards — definite bug
      const progShot = `test-results/no-progress-increase-${label.replace(/\s+/g, '-')}-${Date.now()}.png`;
      await page.screenshot({ path: progShot, fullPage: false }).catch(() => {});
      await test.info().attach(`no-progress-increase-${label}`, { path: progShot, contentType: 'image/png' }).catch(() => {});
      const progMsg =
        `BUG: [${label}] Course Progress bar decreased after completing this lesson.\n` +
        `  Before: ${progressBefore}%  ->  After: ${progressAfter}%\n` +
        `  Lesson URL: ${href}`;
      await bugReport(page, `progress-stuck-${label.replace(/\s+/g, '-')}`, progMsg);
      expect.soft(progressAfter, progMsg).toBeGreaterThanOrEqual(progressBefore);
    } else if (progressAfter === progressBefore && progressAfter < 100) {
      // Progress did not move even though there are still lessons left — bug
      const progShot = `test-results/no-progress-increase-${label.replace(/\s+/g, '-')}-${Date.now()}.png`;
      await page.screenshot({ path: progShot, fullPage: false }).catch(() => {});
      await test.info().attach(`no-progress-increase-${label}`, { path: progShot, contentType: 'image/png' }).catch(() => {});
      const progMsg =
        `BUG: [${label}] Course Progress bar did NOT increase after completing this lesson.\n` +
        `  Before: ${progressBefore}%  ->  After: ${progressAfter}%  (no change)\n` +
        `  Expected the progress bar to move forward after lesson completion.\n` +
        `  Lesson URL: ${href}`;
      await bugReport(page, `progress-stuck-${label.replace(/\s+/g, '-')}`, progMsg);
      expect.soft(progressAfter, progMsg).toBeGreaterThan(progressBefore);
    } else {
      console.log(`  Progress updated: ${progressBefore}% -> ${progressAfter}%`);
    }
  } else if (progressAfter === null) {
    const progMsg = `BUG: [${label}] Course Progress bar is not readable after completing the lesson`;
    await bugReport(page, `progress-unreadable-${label.replace(/\s+/g, '-')}`, progMsg);
    expect.soft(progressAfter, progMsg).not.toBeNull();
  }
}

// =============================================================================
//  TEST
// =============================================================================

test.describe('Home course flow', () => {
  test('Click Continue -> consume all lessons -> verify 100% completion', async ({ page }) => {
    await loginWithValidCredentials(page);

    if (!page.url().includes('/home')) {
      await page.goto('https://test.sunbirded.org/home', { waitUntil: 'domcontentloaded' });
    }
    await page.waitForTimeout(2000);

    // ── Step 1: Click "Continue from where you left" ──────────────────────
    const continueSels = [
      'button:has-text("Continue from where you left")',
      'a:has-text("Continue from where you left")',
      'button:text-matches("Continue from where you left", "i")',
      'a:text-matches("Continue from where you left", "i")',
    ];

    let continueClicked = false;
    for (const sel of continueSels) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 4000 }).catch(() => false)) {
          await el.scrollIntoViewIfNeeded().catch(() => {});
          await el.click();
          continueClicked = true;
          console.log(`Clicked "Continue from where you left" via: "${sel}"`);
          break;
        }
      } catch (_) {}
    }

    if (!continueClicked) {
      await bugReport(page, 'continue-btn-missing',
        'BUG: "Continue from where you left" button not found on the Home page');
      throw new Error('"Continue from where you left" button not found on Home page');
    }

    await page.waitForTimeout(2500);
    const landedUrl = page.url();
    const isStillHome = /\/(home|explore)\s*$/.test(landedUrl.replace(/[?#].*$/, ''));
    if (isStillHome) {
      await bugReport(page, 'continue-wrong-nav',
        `BUG: Clicking "Continue from where you left" did NOT navigate to a course page. Still on: ${landedUrl}`);
      throw new Error(`Continue did not navigate to a course page, still on: ${landedUrl}`);
    }

    await closeAnyPopup(page).catch(() => {});
    const coursePageUrl = page.url();
    console.log('Entered course page:', coursePageUrl);

    // ── Step 2: Initial progress must NOT be 100% ─────────────────────────
    const initialProgress = await readProgress(page);
    console.log('Initial progress:', initialProgress);
    if (initialProgress !== null && initialProgress >= 100) {
      await bugReport(page, 'continue-100pct',
        `BUG: "Continue from where you left" opened a course that is already ${initialProgress}% complete. A fully completed course should not appear in Continue.`);
      throw new Error(`BUG: Continue opened a ${initialProgress}% completed course`);
    }

    // ── Step 3: Expand TOC ─────────────────────────────────────────────────
    await expandAllUnits(page);
    await page.waitForTimeout(600);

    // If already on a specific lesson URL, check its status first
    const activeUrl = page.url();
    const isOnLesson = /\/content\/do_[^/?#]+/.test(activeUrl);

    if (isOnLesson) {
      console.log(`\nActive lesson in player: ${activeUrl}`);
      await closeAnyPopup(page).catch(() => {});
      const activeStatus = await getLessonStatus(page, activeUrl);
      console.log(`  Active lesson TOC status: "${activeStatus}"`);
      if (activeStatus !== 'Completed') {
        await consumeAndVerify(page, activeUrl, 'active-player-lesson');
      } else {
        console.log('  Active lesson already Completed — will process rest via TOC loop');
      }
    }

    // ── Step 4: TOC loop — consume every "Not viewed" / "In Progress" lesson
    let iteration = 0;
    const MAX_ITERATIONS = 150;

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      // Return to course TOC page for a fresh view
      await page.goto(coursePageUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
      await expandAllUnits(page);
      await page.waitForTimeout(500);

      const hrefs = await collectLessonHrefs(page);
      if (hrefs.length === 0) {
        console.log('No lesson hrefs found in TOC — stopping');
        break;
      }

      if (iteration === 1) {
        console.log(`\nLesson list from TOC (${hrefs.length} total):`);
        hrefs.forEach((h, i) => console.log(`  ${i + 1}. ${h}`));
      }

      // Find the first pending lesson
      let foundPending = false;
      for (let i = 0; i < hrefs.length; i++) {
        const href = hrefs[i];
        const label = `Lesson-${i + 1}`;
        const status = await getLessonStatus(page, href);

        console.log(`\n-> [${label}] Status: "${status ?? '(unknown)'}" | ${href}`);

        if (status === 'Completed') {
          console.log(`  Already Completed — skipping`);
          continue;
        }

        // Open this lesson via TOC anchor
        const rel = href.replace('https://test.sunbirded.org', '');
        const anchor = page.locator(`a[href="${href}"], a[href="${rel}"]`).first();

        if (await anchor.isVisible({ timeout: 2000 }).catch(() => false)) {
          await anchor.scrollIntoViewIfNeeded().catch(() => {});
          await anchor.click({ timeout: 5000 }).catch(async () => {
            const h = await anchor.elementHandle().catch(() => null);
            if (h) await page.evaluate((el: Element) => (el as HTMLElement).click(), h).catch(() => {});
          });
          await page.waitForTimeout(2000);
        } else {
          // Expand and retry
          await expandAllUnits(page);
          await page.waitForTimeout(400);
          const anchor2 = page.locator(`a[href="${href}"], a[href="${rel}"]`).first();
          if (await anchor2.isVisible({ timeout: 2000 }).catch(() => false)) {
            await anchor2.scrollIntoViewIfNeeded().catch(() => {});
            await anchor2.click({ timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(2000);
          } else {
            console.log(`  [${label}] TOC anchor not visible — navigating directly to ${href}`);
            await page.goto(href, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);
          }
        }

        await closeAnyPopup(page).catch(() => {});
        await consumeAndVerify(page, href, label);
        foundPending = true;
        break;
      }

      if (!foundPending) {
        console.log('\nAll lessons are Completed — done');
        break;
      }
    }

    if (iteration >= MAX_ITERATIONS) {
      console.warn(`Hit MAX_ITERATIONS (${MAX_ITERATIONS}) safety cap`);
    }

    // ==========================================================================
    // POST-COMPLETION CHECKS
    // ==========================================================================

    // ── Handle the "Congratulations! You have successfully completed the course"
    // popup that appears on the content player right after the final lesson.
    // 1. Detect it (it may already be visible or appear within a few seconds).
    // 2. Screenshot it as evidence.
    // 3. Close it via the × button.
    // 4. Immediately click the three-dots (⋮) next to "Course Progress" and
    //    click "Sync Progress now" while still on this page.
    // Then navigate back to coursePageUrl for the remaining checks.

    console.log('\nCheck 1: Congratulations popup + Sync Progress now...');

    // Wait up to 5s for the popup to appear (it may take a moment after last lesson)
    const congratsSels = [
      'text=/you have successfully completed the course/i',
      'text=/congratulations/i',
      '[role="dialog"]:has-text("complet")',
      '[class*="modal"]:has-text("Congratulations")',
    ];
    let congratsFound = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      for (const sel of congratsSels) {
        if (await page.locator(sel).first().isVisible({ timeout: 1000 }).catch(() => false)) {
          congratsFound = true;
          console.log(`  Congratulations popup found via: "${sel}"`);
          break;
        }
      }
      if (congratsFound) break;
      await page.waitForTimeout(1000);
    }

    if (congratsFound) {
      // Screenshot the popup as evidence
      const congratsShot = `test-results/congratulations-popup-${Date.now()}.png`;
      await page.screenshot({ path: congratsShot, fullPage: false }).catch(() => {});
      await test.info().attach('congratulations-popup', { path: congratsShot, contentType: 'image/png' }).catch(() => {});
      console.log('  Screenshot captured. Closing the popup...');

      // Close the popup via the × button
      const closeSelectors = [
        'button[aria-label="Close"]',
        'button[aria-label*="close" i]',
        'button:has-text("×")',
        '[role="dialog"] button:last-of-type',
        '[class*="modal"] button[class*="close"]',
      ];
      let closed = false;
      for (const sel of closeSelectors) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 800 }).catch(() => false)) {
            await btn.click();
            closed = true;
            console.log(`  Closed congratulations popup via: "${sel}"`);
            break;
          }
        } catch (_) {}
      }
      if (!closed) {
        await page.keyboard.press('Escape').catch(() => {});
        console.log('  Closed congratulations popup via Escape');
      }
      await page.waitForTimeout(800);

      // ── Navigate back to the course landing page where the Course Progress
      // card (and the ⋮ button) lives — the popup appears on the player page
      // which does not have that card.
      console.log('  Navigating to course landing page to access Course Progress card...');
      await page.goto(coursePageUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      // ── Now click the three-dots (⋮) next to "Course Progress" and sync ──
      console.log('  Clicking three-dots (⋮) next to "Course Progress" to Sync Progress...');

      const progressCardHeading = page.locator(
        'h3:has-text("Course Progress"), h2:has-text("Course Progress"), span:has-text("Course Progress")'
      ).first();
      await progressCardHeading.scrollIntoViewIfNeeded().catch(() => {});
      const progressCard = progressCardHeading.locator('../..');
      await progressCard.hover().catch(() => {});
      await page.waitForTimeout(500);

      let threeDotsBtn = progressCard.locator(
        'button[aria-label*="more" i], button[aria-label*="option" i], button[aria-label*="menu" i], ' +
        'button:has(svg[class*="dots"]), button:has(svg[class*="ellipsis"]), ' +
        'button:has-text("⋮"), button:has-text("…")'
      ).first();
      let dotsVisible = await threeDotsBtn.isVisible({ timeout: 2000 }).catch(() => false);

      if (!dotsVisible) {
        threeDotsBtn = page.locator(
          'button[aria-label*="more" i]:near(h3:has-text("Course Progress")), ' +
          'button[aria-label*="option" i]:near(h3:has-text("Course Progress"))'
        ).first();
        dotsVisible = await threeDotsBtn.isVisible({ timeout: 1500 }).catch(() => false);
      }

      if (!dotsVisible) {
        await bugReport(page, 'check1-threedots-missing',
          'BUG: The three-dots (⋮) button next to "Course Progress" is not visible after closing the Congratulations popup.');
        expect.soft(dotsVisible, 'Three-dots (⋮) button must be visible in Course Progress card').toBe(true);
      } else {
        await threeDotsBtn.scrollIntoViewIfNeeded().catch(() => {});
        await threeDotsBtn.click();
        console.log('  Clicked three-dots (⋮) button');
        await page.waitForTimeout(700);

        const menuShot = `test-results/check1-sync-menu-${Date.now()}.png`;
        await page.screenshot({ path: menuShot }).catch(() => {});
        await test.info().attach('check1-sync-menu', { path: menuShot, contentType: 'image/png' }).catch(() => {});

        const syncBtn = page.locator(
          'text=/sync progress now/i, text=/sync progress/i, ' +
          '[role="menuitem"]:has-text("Sync"), li:has-text("Sync"), button:has-text("Sync")'
        ).first();
        const syncVisible = await syncBtn.isVisible({ timeout: 2000 }).catch(() => false);

        if (!syncVisible) {
          await page.keyboard.press('Escape').catch(() => {});
          await bugReport(page, 'check1-sync-missing',
            'BUG: Clicked the three-dots (⋮) button after Congratulations popup but ' +
            '"Sync Progress now" was NOT present in the dropdown menu.\n' +
            '  Screenshot of the open menu is attached as "check1-sync-menu".'
          );
          expect.soft(syncVisible, '"Sync Progress now" must appear in the Course Progress menu').toBe(true);
        } else {
          await syncBtn.click();
          console.log('  Clicked "Sync Progress now"');
          await page.waitForTimeout(1500);

          const toastSels = [
            'text=/you can view the progress in 24/i',
            'text=/view.*progress.*24/i',
            'text=/24 hours/i',
            '[role="alert"]:has-text("24")',
            '[class*="toast"]:has-text("24")',
            '[class*="snack"]:has-text("success" i)',
          ];
          let toastFound = false;
          for (const sel of toastSels) {
            if (await page.locator(sel).first().isVisible({ timeout: 3000 }).catch(() => false)) {
              console.log(`  Sync toast confirmed: "${sel}"`);
              toastFound = true;
              break;
            }
          }
          if (!toastFound) {
            const toastShot = `test-results/check1-no-toast-${Date.now()}.png`;
            await page.screenshot({ path: toastShot, fullPage: false }).catch(() => {});
            await test.info().attach('check1-no-toast', { path: toastShot, contentType: 'image/png' }).catch(() => {});
            await bugReport(page, 'check1-sync-no-toast',
              'BUG: Clicked "Sync Progress now" but did NOT see the success toast.\n' +
              '  Expected: "You can view the progress in 24 hours" toast/snackbar.\n' +
              `  Screenshot: ${toastShot}`
            );
            expect.soft(toastFound, '"You can view the progress in 24 hours" toast must appear after Sync').toBe(true);
          }
        }
      }
    } else {
      // Congratulations popup did NOT appear — that is a bug
      const noCongratsShot = `test-results/no-congratulations-popup-${Date.now()}.png`;
      await page.screenshot({ path: noCongratsShot, fullPage: false }).catch(() => {});
      await test.info().attach('no-congratulations-popup', { path: noCongratsShot, contentType: 'image/png' }).catch(() => {});
      await bugReport(page, 'check1-no-congratulations-popup',
        'BUG: All lessons were completed but the "Congratulations! You have successfully completed the course" popup did NOT appear.\n' +
        `  Expected this popup to show on the content player after the final lesson.\n` +
        `  Screenshot: ${noCongratsShot}`
      );
    }

    // Navigate to the course TOC page for the remaining checks
    await page.goto(coursePageUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await expandAllUnits(page);
    await page.waitForTimeout(500);

    const courseTitle = await page.locator('h1, h2').first().textContent().catch(() => '') ?? '';
    console.log(`\nCourse title: "${courseTitle}"`);
    console.log('Running remaining post-completion checks...\n');

    // Check 2: Course Progress = 100%
    console.log('Check 2: Course Progress = 100%...');
    const finalProgress = await readProgress(page);
    console.log(`  Course progress reads: ${finalProgress}%`);

    if (finalProgress !== 100) {
      const progShot = `test-results/final-progress-not-100-${Date.now()}.png`;
      await page.screenshot({ path: progShot, fullPage: false }).catch(() => {});
      await test.info().attach('final-progress-not-100', { path: progShot, contentType: 'image/png' }).catch(() => {});
      await bugReport(page, 'check2-progress-not-100',
        `BUG: Course Progress shows ${finalProgress}% after all lessons were consumed — expected 100%.\n` +
        `  The progress bar is not updating correctly even after full consumption.\n` +
        `  Screenshot: ${progShot}`
      );
      throw new Error(`BUG: Course progress is ${finalProgress}% after completing all lessons (expected 100%)`);
    } else {
      console.log('  Course Progress is 100%');
    }

    // Check 3: Every lesson in TOC shows "Completed"
    console.log('Check 3: All lessons Completed in TOC...');
    const finalHrefs = await collectLessonHrefs(page);
    let allDone = true;
    for (let i = 0; i < finalHrefs.length; i++) {
      const href = finalHrefs[i];
      const rel = href.replace('https://test.sunbirded.org', '');
      const anchor = page.locator(`a[href="${href}"], a[href="${rel}"]`).first();
      const rowTxt = (await anchor.textContent().catch(() => ''))?.trim() ?? '';
      if (rowTxt && !/completed/i.test(rowTxt)) {
        allDone = false;
        await bugReport(page, `check3-lesson-${i + 1}-not-completed`,
          `BUG: Lesson ${i + 1} does NOT show "Completed" after full course completion.\n` +
          `  TOC text: "${rowTxt.substring(0, 120)}"\n` +
          `  Lesson URL: ${href}`
        );
      }
    }
    if (allDone && finalHrefs.length > 0) {
      console.log(`  All ${finalHrefs.length} lesson(s) show Completed`);
    }

    // Check 4: Three-dots menu -> "Sync Progress now" -> success toast
    console.log('Check 4: Three-dots -> Sync Progress now...');

    // The ⋮ button sits inside the Course Progress card.
    // Scroll it into view, hover, then click it.
    const progressCardHeading = page.locator(
      'h3:has-text("Course Progress"), h2:has-text("Course Progress"), span:has-text("Course Progress")'
    ).first();
    await progressCardHeading.scrollIntoViewIfNeeded().catch(() => {});

    // Scope to the card container (2 levels up from the heading)
    const progressCard = progressCardHeading.locator('../..');
    await progressCard.hover().catch(() => {});
    await page.waitForTimeout(500);

    // The ⋮ button — try scoped first, then page-wide fallback
    let threeDotsBtn = progressCard.locator(
      'button[aria-label*="more" i], button[aria-label*="option" i], button[aria-label*="menu" i], ' +
      'button:has(svg[class*="dots"]), button:has(svg[class*="ellipsis"]), ' +
      'button:has-text("⋮"), button:has-text("…")'
    ).first();

    let dotsVisible = await threeDotsBtn.isVisible({ timeout: 2000 }).catch(() => false);

    // Fallback: look for any ⋮/… button anywhere near the progress section
    if (!dotsVisible) {
      threeDotsBtn = page.locator(
        'button[aria-label*="more" i]:near(h3:has-text("Course Progress")), ' +
        'button[aria-label*="option" i]:near(h3:has-text("Course Progress"))'
      ).first();
      dotsVisible = await threeDotsBtn.isVisible({ timeout: 1500 }).catch(() => false);
    }

    if (!dotsVisible) {
      await bugReport(page, 'check4-threedots-missing',
        'BUG: The three-dots (⋮) button next to "Course Progress" is not visible.');
      expect.soft(dotsVisible, 'Three-dots (⋮) button must be visible in Course Progress card').toBe(true);
    } else {
      await threeDotsBtn.scrollIntoViewIfNeeded().catch(() => {});
      await threeDotsBtn.click();
      console.log('  Clicked three-dots (⋮) button');
      await page.waitForTimeout(700);

      const menuShot = `test-results/check4-menu-${Date.now()}.png`;
      await page.screenshot({ path: menuShot }).catch(() => {});
      await test.info().attach('check4-threedots-menu', { path: menuShot, contentType: 'image/png' }).catch(() => {});

      const syncBtn = page.locator(
        'text=/sync progress now/i, text=/sync progress/i, ' +
        '[role="menuitem"]:has-text("Sync"), li:has-text("Sync"), button:has-text("Sync")'
      ).first();

      const syncVisible = await syncBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (!syncVisible) {
        // "Sync Progress now" must appear in the menu — if it doesn't that is a bug
        await page.keyboard.press('Escape').catch(() => {});
        await bugReport(page, 'check4-sync-missing',
          'BUG: Clicked the three-dots (⋮) button on the Course Progress card but ' +
          '"Sync Progress now" option was NOT present in the dropdown menu.\n' +
          `  Screenshot of the open menu is attached as "check4-threedots-menu".`
        );
        expect.soft(syncVisible, '"Sync Progress now" must appear in the Course Progress menu').toBe(true);
      } else {
        await syncBtn.click();
        console.log('  Clicked "Sync Progress now"');
        await page.waitForTimeout(1500);

        const toastSels = [
          'text=/you can view the progress in 24/i',
          'text=/view.*progress.*24/i',
          'text=/24 hours/i',
          '[role="alert"]:has-text("24")',
          '[class*="toast"]:has-text("24")',
          '[class*="snack"]:has-text("success" i)',
        ];
        let toastFound = false;
        for (const sel of toastSels) {
          if (await page.locator(sel).first().isVisible({ timeout: 3000 }).catch(() => false)) {
            console.log(`  Sync toast confirmed: "${sel}"`);
            toastFound = true;
            break;
          }
        }
        if (!toastFound) {
          const toastShot = `test-results/check4-no-toast-${Date.now()}.png`;
          await page.screenshot({ path: toastShot, fullPage: false }).catch(() => {});
          await test.info().attach('check4-no-toast', { path: toastShot, contentType: 'image/png' }).catch(() => {});
          const toastMsg =
            'BUG: Clicked "Sync Progress now" but did NOT see the success toast.\n' +
            '  Expected: "You can view the progress in 24 hours" toast/snackbar.\n' +
            `  Screenshot: ${toastShot}`;
          await bugReport(page, 'check4-sync-no-toast', toastMsg);
          expect.soft(toastFound, toastMsg).toBe(true);
        }
      }
    }

    // Check 5: Go Back -> course NOT in Continue / In Progress on Home
    console.log('Check 5: Course removed from Continue/In Progress after completion...');
    const goBackSels = [
      'a:has-text("Go Back")',
      'button:has-text("Go Back")',
      '[aria-label*="back" i]',
      'a.back-btn',
      'text=Go Back',
    ];
    let wentBack = false;
    for (const sel of goBackSels) {
      if (await page.locator(sel).first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await page.locator(sel).first().click();
        wentBack = true;
        console.log(`  Clicked Go Back via: "${sel}"`);
        break;
      }
    }
    if (!wentBack) {
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }

    await page.waitForURL(/\/home/, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2500);

    if (!page.url().includes('/home')) {
      await page.goto('https://test.sunbirded.org/home', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
    }

    const titleShort = courseTitle.trim().substring(0, 40);

    const continueSection = page.locator(
      'section:has-text("Continue from where you left"), div:has-text("Continue from where you left")'
    ).first();
    const continueSectionTxt = await continueSection.textContent().catch(() => '') ?? '';

    const inProgressSection = page.locator(
      'section:has-text("In Progress"), div:has-text("In Progress")'
    ).first();
    const inProgressTxt = await inProgressSection.textContent().catch(() => '') ?? '';

    if (titleShort && continueSectionTxt.includes(titleShort)) {
      await bugReport(page, 'check5-still-in-continue',
        `BUG: Completed course "${courseTitle}" still appears in "Continue from where you left" on Home.\n` +
        `  A fully completed course should NOT appear in the Continue section.`
      );
    } else {
      console.log('  Course NOT in "Continue from where you left"');
    }

    if (titleShort && inProgressTxt.includes(titleShort)) {
      await bugReport(page, 'check5-still-in-inprogress',
        `BUG: Completed course "${courseTitle}" still appears in "In Progress" on Home.\n` +
        `  A fully completed course should NOT appear in the In Progress section.`
      );
    } else {
      console.log('  Course NOT in "In Progress"');
    }

    console.log('\nAll post-completion checks done!');
  });
});
