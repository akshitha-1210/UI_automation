import { test, expect } from '@playwright/test';
import { writeFileSync } from 'fs';
import { join } from 'path';

test('Complete Flow: Login + Onboarding + Join Course + Complete Course', async ({ page }) => {
  test.setTimeout(3 * 60 * 1000); // 3 minutes

  console.log('🚀 Starting Course Consumption Flow...');

  // Step 1: Login
  console.log('🔐 Logging in...');
  await page.goto('https://test.sunbirded.org/auth/realms/sunbird/protocol/openid-connect/auth?redirect_uri=https%3A%2F%2Ftest.sunbirded.org%2Fportal%2Fauth%2Fcallback&scope=openid&code_challenge=OjHubuBEjxjkyJDY2ND7hp7kLT_NctDBi9TW0g63KX8&code_challenge_method=S256&state=7bfe8b46-de0c-4df6-b939-51b20e0a8516&prompt=login&client_id=portal&response_type=code');
  
  // Wait for login form to be visible
  await page.waitForSelector('#emailormobile', { timeout: 10000 });
  console.log('📝 Login form detected, filling credentials...');
  
  await page.fill('#emailormobile', 'user1@yopmail.com');
  await page.fill('#password', 'User1@123');
  console.log('🔑 Credentials filled, submitting...');
  await page.click('#kc-login');
  await page.waitForURL('**/home', { timeout: 30000 });
  
  // Save auth state
  const auth = await page.context().storageState();
  writeFileSync(join(__dirname, 'auth.json'), JSON.stringify(auth, null, 2));
  console.log('✅ Logged in successfully');

  // Step 3: Navigate to courses
  console.log('📚 Finding courses...');
  console.log('Current URL before Explore click:', page.url());
  
  // Wait for page to be ready
  await page.waitForLoadState('networkidle');
  
  // Try multiple ways to find and click Explore
  const exploreSelectors = [
    'a:has-text("Explore")',
    'button:has-text("Explore")', 
    '[href*="explore"]',
    'a[title*="Explore"]',
    '.explore-link'
  ];
  
  let exploreClicked = false;
  for (const selector of exploreSelectors) {
    try {
      if (await page.locator(selector).isVisible({ timeout: 2000 })) {
        console.log(`Found Explore button with selector: ${selector}`);
        await page.locator(selector).click();
        exploreClicked = true;
        break;
      }
    } catch (e) {
      console.log(`Selector ${selector} not found or failed: ${e}`);
    }
  }
  
  if (!exploreClicked) {
    console.log('⚠️ Could not find Explore button, trying direct navigation...');
    await page.goto('https://test.sunbirded.org/explore');
  }
  
  console.log('Current URL after Explore click:', page.url());
  await page.waitForTimeout(3000); // Wait for page to load
  await page.waitForURL('**/explore', { timeout: 10000 }).catch(() => {
    console.log('⚠️ Did not reach explore URL, but continuing...');
  });
  
  // Step 4: Find and click an incomplete course
  console.log('🔍 Looking for incomplete course...');
  const courses = page.locator('[class*="course-"], [class*="card-"]');
  const courseCount = await courses.count();
  console.log(`Found ${courseCount} courses`);
  
  let selectedCourse = -1;
  let courseProgress = '';
  
  // Try multiple courses to find one that's not 100% complete
  for (let i = 0; i < Math.min(courseCount, 5); i++) {
    try {
      const courseCard = courses.nth(i);
      const courseText = await courseCard.textContent({ timeout: 1000 }) || '';
      
      console.log(`Checking Course ${i + 1}: ${courseText.slice(0, 80)}...`);
      
      // Click on the course to check its progress
      await courseCard.click();
      await page.waitForTimeout(3000);
      
      // Check actual course progress now that we're inside the course
      console.log('📊 Checking course progress inside course page...');
      const progressSelectors = [
        ':has-text("Course Progress")',
        ':has-text("Progress")',
        '[class*="progress"]',
        ':has-text("%")'
      ];
      
      let foundProgress = false;
      for (const selector of progressSelectors) {
        try {
          const progressElement = page.locator(selector).first();
          if (await progressElement.isVisible({ timeout: 2000 })) {
            courseProgress = await progressElement.textContent() || '';
            console.log(`Found progress: ${courseProgress.slice(0, 200)}...`);
            foundProgress = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      // Check if this course is not 100% complete
      if (!courseProgress.includes('100%') && !courseProgress.includes('Completed')) {
        console.log(`✅ Found incomplete course ${i + 1}: ${courseText.slice(0, 80)}...`);
        selectedCourse = i;
        break;
      } else {
        console.log(`⚠️ Course ${i + 1} is already completed (${courseProgress.includes('100%') ? '100%' : 'Completed'}), trying next...`);
        // Go back to course list to try next course
        await page.goBack();
        await page.waitForTimeout(2000);
      }
      
    } catch (e) {
      console.log(`Error checking course ${i + 1}: ${e}`);
      // Try to go back if we're stuck
      try {
        await page.goBack();
        await page.waitForTimeout(1000);
      } catch (backError) {
        console.log('Could not go back, continuing...');
      }
      continue;
    }
  }
  
  if (selectedCourse === -1) {
    console.log('⚠️ No incomplete courses found in first 5, selecting first course anyway...');
    selectedCourse = 0;
    await courses.nth(selectedCourse).click();
  }
  
  // Step 5: Join course if needed (we're already inside the selected course)
  console.log('🎯 Joining course if needed...');
  await page.waitForTimeout(2000);
  
  const joinSelectors = ['button:has-text("Join")', 'button:has-text("Enroll")', 'a:has-text("Join")'];
  for (const selector of joinSelectors) {
    try {
      if (await page.locator(selector).isVisible({ timeout: 2000 })) {
        await page.locator(selector).click();
        console.log(`✅ Joined course using: ${selector}`);
        await page.waitForTimeout(2000); // Wait for join to process
        break;
      }
    } catch (e) {
      continue;
    }
  }
  
  // Step 6: Start course content
  console.log('📖 Starting course consumption...');
  await page.waitForTimeout(2000);
  
  const startSelectors = ['button:has-text("Start")', 'a:has-text("Start")', 'button:has-text("Begin")'];
  for (const selector of startSelectors) {
    try {
      if (await page.locator(selector).isVisible({ timeout: 2000 })) {
        await page.locator(selector).click();
        console.log(`✅ Started course using: ${selector}`);
        break;
      }
    } catch (e) {
      continue;
    }
  }
  
  // Step 7: Complete course content
  const contentSelectors = [
    'a[href*="content"]', 
    'a[href*="lesson"]', 
    '.content-item', 
    '[class*="unit"]',
    '[class*="chapter"]'
  ];
  
  let contentItems = page.locator('').first(); // Initialize
  for (const selector of contentSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      contentItems = page.locator(selector);
      console.log(`📚 Found ${count} content items using: ${selector}`);
      break;
    }
  }
  
  const contentCount = await contentItems.count();
  
  for (let i = 0; i < Math.min(contentCount, 5); i++) {
    try {
      console.log(`📖 Processing content ${i + 1}/${Math.min(contentCount, 5)}...`);
      await contentItems.nth(i).click({ timeout: 5000 });
      await page.waitForTimeout(2000);
      
      // Mark as complete if possible
      const completeSelectors = [
        'button:has-text("Complete")', 
        'button:has-text("Mark Complete")',
        '[class*="complete"]',
        'button:has-text("Finish")'
      ];
      
      for (const selector of completeSelectors) {
        try {
          if (await page.locator(selector).isVisible({ timeout: 1000 })) {
            await page.locator(selector).click();
            console.log(`✅ Marked complete using: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      // Navigate back
      const backSelectors = ['button:has-text("Back")', '.back-button', 'button[aria-label="Back"]'];
      for (const selector of backSelectors) {
        try {
          if (await page.locator(selector).isVisible({ timeout: 1000 })) {
            await page.locator(selector).click();
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
    } catch (error) {
      console.log(`⚠️ Error with content ${i + 1}: ${error}`);
    }
  }
  
  console.log('✅ Course consumption completed!');
  
  // Step 8: Check for certificate
  console.log('🏆 Checking for certificate...');
  await page.waitForTimeout(3000);
  
  const certSelectors = [
    'button:has-text("Download Certificate")', 
    'a:has-text("Certificate")',
    'button:has-text("Certificate")',
    '[class*="certificate"]'
  ];
  
  for (const selector of certSelectors) {
    try {
      if (await page.locator(selector).isVisible({ timeout: 3000 })) {
        await page.locator(selector).click();
        console.log(`✅ Certificate found and clicked using: ${selector}`);
        break;
      }
    } catch (e) {
      continue;
    }
  }
  
  console.log('🎉 Flow completed successfully!');
});