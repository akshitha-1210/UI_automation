import { test } from '@playwright/test';
import { writeFileSync } from 'fs';
import { join } from 'path';

test('Vision-Based Course Flow', async ({ page }) => {
  test.setTimeout(5 * 60 * 1000); // 5 minutes

  console.log('🚀 Starting Vision-Based Course Flow...');

  // Helper function to take screenshot and log for vision analysis
  async function takeScreenshotAndLog(step: string, description: string) {
    const filename = `vision-${step}-${Date.now()}.png`;
    await page.screenshot({ path: `screenshots/${filename}`, fullPage: true });
    console.log(`📸 ${step}: ${description}`);
    console.log(`Screenshot saved: ${filename}`);
    console.log(`Current URL: ${page.url()}`);
    console.log(`Page Title: ${await page.title()}`);
    return filename;
  }

  // Step 1: Login
  console.log('🔐 Step 1: Login');
  await page.goto('https://test.sunbirded.org/auth/realms/sunbird/protocol/openid-connect/auth?redirect_uri=https%3A%2F%2Ftest.sunbirded.org%2Fportal%2Fauth%2Fcallback&scope=openid&code_challenge=OjHubuBEjxjkyJDY2ND7hp7kLT_NctDBi9TW0g63KX8&code_challenge_method=S256&state=7bfe8b46-de0c-4df6-b939-51b20e0a8516&prompt=login&client_id=portal&response_type=code');
  
  await takeScreenshotAndLog('01-login-page', 'Login page loaded');
  
  // Fill credentials using simple, reliable selectors
  await page.fill('#emailormobile', 'user1@yopmail.com');
  await page.fill('#password', 'User1@123');
  await page.click('#kc-login');
  await page.waitForURL('**/home', { timeout: 30000 });
  
  await takeScreenshotAndLog('02-after-login', 'Successfully logged in to home page');
  
  // Save auth state
  const auth = await page.context().storageState();
  writeFileSync(join(__dirname, 'auth.json'), JSON.stringify(auth, null, 2));

  // Step 2: Navigate to explore
  console.log('📚 Step 2: Navigate to courses');
  await page.waitForTimeout(3000); // Let page settle
  
  await takeScreenshotAndLog('03-home-page', 'Home page - looking for Explore button');
  
  // Click Explore - try the most common patterns
  try {
    await page.click('button:has-text("Explore")', { timeout: 5000 });
  } catch {
    try {
      await page.click('a:has-text("Explore")', { timeout: 5000 });
    } catch {
      console.log('⚠️ Could not find Explore button, navigating directly...');
      await page.goto('https://test.sunbirded.org/explore');
    }
  }
  
  await page.waitForTimeout(3000);
  await takeScreenshotAndLog('04-explore-page', 'Explore page with course listings');
  
  // Step 3: Find courses
  console.log('🔍 Step 3: Analyzing course options');
  
  // Get all clickable course elements - use broad selectors
  const courseElements = await page.locator('div[class*="card"], div[class*="course"], a[href*="course"]').all();
  console.log(`Found ${courseElements.length} potential course elements`);
  
  // Take screenshot showing all courses
  await takeScreenshotAndLog('05-course-list', `Found ${courseElements.length} course elements`);
  
  // Try clicking the first few courses to find one that's not 100% complete
  let selectedCourseIndex = -1;
  
  for (let i = 0; i < Math.min(courseElements.length, 3); i++) {
    try {
      console.log(`🔍 Analyzing course ${i + 1}...`);
      
      // Click on the course
      await courseElements[i].click({ timeout: 5000 });
      await page.waitForTimeout(3000);
      
      // Take screenshot of the course page
      const filename = await takeScreenshotAndLog(`06-course-${i + 1}`, `Course ${i + 1} page for analysis`);
      
      // Get page text to analyze
      const pageText = await page.locator('body').innerText();
      
      // Simple text analysis - look for progress indicators
      const hasZeroPercent = pageText.includes('0%');
      const hasLowProgress = pageText.includes('1%') || pageText.includes('2%') || pageText.includes('3%') || pageText.includes('4%') || pageText.includes('5%');
      const hasHundredPercent = pageText.includes('100%');
      const hasCompleted = pageText.includes('Completed') || pageText.includes('Complete');
      const hasCertificate = pageText.includes('Certificate earned') || pageText.includes('Download Certificate');
      const hasJoinButton = pageText.includes('Join') || pageText.includes('Enroll');
      
      console.log(`Course ${i + 1} Analysis:`);
      console.log(`- Has 0%: ${hasZeroPercent}`);
      console.log(`- Has Low Progress (1-5%): ${hasLowProgress}`);
      console.log(`- Has 100%: ${hasHundredPercent}`);
      console.log(`- Shows Completed: ${hasCompleted}`);
      console.log(`- Has Certificate: ${hasCertificate}`);
      console.log(`- Has Join Button: ${hasJoinButton}`);
      
      // Prioritize courses with 0% or very low progress, or courses that need joining
      if (hasZeroPercent || hasLowProgress || (hasJoinButton && !hasHundredPercent)) {
        console.log(`✅ Course ${i + 1} has minimal progress or needs joining - perfect choice!`);
        selectedCourseIndex = i;
        break;
      } else if (!hasHundredPercent && !hasCertificate) {
        console.log(`✅ Course ${i + 1} is incomplete (no 100% or certificate) - good choice!`);
        selectedCourseIndex = i;
        break;
      } else {
        console.log(`⚠️ Course ${i + 1} appears completed (100% or certificate available), trying next...`);
        await page.goBack();
        await page.waitForTimeout(2000);
      }
      
    } catch (error) {
      console.log(`❌ Error analyzing course ${i + 1}: ${error}`);
      try {
        await page.goBack();
        await page.waitForTimeout(1000);
      } catch {}
    }
  }
  
  // Step 4: Work with selected course
  if (selectedCourseIndex === -1) {
    console.log('⚠️ No clearly incomplete course found, going back to first one...');
    await page.goBack();
    await page.waitForTimeout(1000);
    await courseElements[0].click();
    await page.waitForTimeout(3000); // Wait for course page to load
    selectedCourseIndex = 0;
  }
  
  console.log(`🎯 Step 4: Working with course ${selectedCourseIndex + 1}`);
  await takeScreenshotAndLog('07-selected-course', `Working with selected course ${selectedCourseIndex + 1}`);
  
  // Step 4.1: Look for and select available batch
  console.log('📋 Step 4.1: Looking for Available Batches');
  await page.waitForTimeout(2000);
  
  await takeScreenshotAndLog('07a-before-batch-selection', 'Course page before batch selection');
  
  // Look for "Available batches" section in sidebar
  const batchSectionSelectors = [
    ':has-text("Available batches")',
    ':has-text("Available Batches")', 
    ':has-text("Batches")',
    '[class*="batch"]',
    'div:has-text("batch")',
    'sidebar :has-text("Available")'
  ];
  
  let batchSectionFound = false;
  
  for (const selector of batchSectionSelectors) {
    try {
      const batchSection = page.locator(selector).first();
      if (await batchSection.isVisible({ timeout: 3000 })) {
        console.log(`✅ Found batch section with selector: ${selector}`);
        
        // Look for dropdown in the batch section
        const dropdownSelectors = [
          'select',
          '[role="combobox"]',
          '.dropdown',
          'button[aria-expanded]',
          'div[class*="dropdown"]',
          'button:has-text("Select")'
        ];
        
        for (const dropdownSelector of dropdownSelectors) {
          try {
            const dropdown = batchSection.locator(dropdownSelector).first();
            if (await dropdown.isVisible({ timeout: 2000 })) {
              console.log(`📋 Found batch dropdown, clicking...`);
              await dropdown.click();
              await page.waitForTimeout(1500);
              
              await takeScreenshotAndLog('07b-batch-dropdown-open', 'Batch dropdown opened');
              
              // Look for batch options to select
              const batchOptionSelectors = [
                'option',
                'li[role="option"]',
                'div[role="option"]',
                '.dropdown-item',
                'a[class*="option"]',
                'button:not([aria-expanded])'
              ];
              
              let batchSelected = false;
              
              for (const optionSelector of batchOptionSelectors) {
                try {
                  const options = await page.locator(optionSelector).all();
                  if (options.length > 0) {
                    console.log(`Found ${options.length} batch options`);
                    // Select the first available batch
                    await options[0].click();
                    console.log(`✅ Selected batch option`);
                    await page.waitForTimeout(1000);
                    batchSelected = true;
                    break;
                  }
                } catch (e) {
                  continue;
                }
              }
              
              if (batchSelected) {
                await takeScreenshotAndLog('07c-batch-selected', 'Batch selected from dropdown');
                batchSectionFound = true;
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }
        
        if (batchSectionFound) break;
      }
    } catch (e) {
      continue;
    }
  }
  
  if (!batchSectionFound) {
    console.log('⚠️ No batch dropdown found - may not be required for this course');
    await takeScreenshotAndLog('07d-no-batch-found', 'No batch selection needed');
  }
  
  // Step 5: Join course after batch selection
  console.log('🚀 Step 5: Join course if needed');
  await page.waitForTimeout(2000);
  
  // Look for join/enroll buttons
  const joinButtons = await page.locator('button:has-text("Join"), button:has-text("Enroll"), a:has-text("Join")').all();
  
  if (joinButtons.length > 0) {
    console.log(`Found ${joinButtons.length} join buttons`);
    await joinButtons[0].click();
    await page.waitForTimeout(3000);
    await takeScreenshotAndLog('08-after-join', 'After joining course');
  } else {
    console.log('ℹ️ No join buttons found - course may already be joined');
  }
  
  // Step 6: Start course content
  console.log('📖 Step 6: Start course content');
  
  // Look for start/begin buttons
  const startButtons = await page.locator('button:has-text("Start"), a:has-text("Start"), button:has-text("Begin")').all();
  
  if (startButtons.length > 0) {
    console.log(`Found ${startButtons.length} start buttons`);
    await startButtons[0].click();
    await page.waitForTimeout(3000);
    await takeScreenshotAndLog('09-course-started', 'Course content started');
  }
  
  // Step 7: Find and complete content
  console.log('✅ Step 7: Complete course content');
  
  // Look for content items to click
  const contentLinks = await page.locator('a[href*="content"], a[href*="lesson"], button:has-text("Start"), div[class*="unit"], div[class*="lesson"]').all();
  console.log(`Found ${contentLinks.length} potential content items`);
  
  // Process a few content items
  for (let i = 0; i < Math.min(contentLinks.length, 3); i++) {
    try {
      console.log(`📚 Processing content item ${i + 1}...`);
      
      await contentLinks[i].click({ timeout: 5000 });
      await page.waitForTimeout(2000);
      
      await takeScreenshotAndLog(`10-content-${i + 1}`, `Content item ${i + 1} opened`);
      
      // Look for complete/finish buttons
      const completeButtons = await page.locator('button:has-text("Complete"), button:has-text("Finish"), button:has-text("Mark Complete"), div[class*="complete"]').all();
      
      if (completeButtons.length > 0) {
        await completeButtons[0].click();
        console.log(`✅ Marked content ${i + 1} as complete`);
        await page.waitForTimeout(1000);
      }
      
      // Try to go back
      const backButtons = await page.locator('button:has-text("Back"), button[aria-label="Back"]').all();
      if (backButtons.length > 0) {
        await backButtons[0].click();
        await page.waitForTimeout(1000);
      } else {
        await page.goBack();
        await page.waitForTimeout(1000);
      }
      
    } catch (error) {
      console.log(`⚠️ Error with content ${i + 1}: ${error}`);
    }
  }
  
  // Step 8: Check for certificate
  console.log('🏆 Step 8: Check for certificate');
  await page.waitForTimeout(3000);
  
  await takeScreenshotAndLog('11-final-state', 'Final course state - checking for certificate');
  
  const certButtons = await page.locator('button:has-text("Certificate"), a:has-text("Certificate"), button:has-text("Download")').all();
  
  if (certButtons.length > 0) {
    console.log(`✅ Found ${certButtons.length} certificate buttons!`);
    await certButtons[0].click();
    await page.waitForTimeout(2000);
    await takeScreenshotAndLog('12-certificate', 'Certificate page or download');
  } else {
    console.log('ℹ️ No certificate available yet');
  }
  
  console.log('🎉 Vision-based flow completed!');
  console.log('📸 Check the screenshots/ folder to see what the AI "saw" at each step');
});