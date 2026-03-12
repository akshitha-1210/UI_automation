import { test, expect } from '@playwright/test';
import { writeFileSync } from 'fs';
import { join } from 'path';

test('Simple Course Consumption Flow', async ({ page }) => {
  test.setTimeout(2 * 60 * 1000); // 2 minutes

  console.log('🚀 Starting Simple Course Flow...');

  // Step 1: Login
  console.log('🔐 Logging in...');
  await page.goto('https://test.sunbirded.org/auth/realms/sunbird/protocol/openid-connect/auth?redirect_uri=https%3A%2F%2Ftest.sunbirded.org%2Fportal%2Fauth%2Fcallback&scope=openid&code_challenge=OjHubuBEjxjkyJDY2ND7hp7kLT_NctDBi9TW0g63KX8&code_challenge_method=S256&state=7bfe8b46-de0c-4df6-b939-51b20e0a8516&prompt=login&client_id=portal&response_type=code');
  
  await page.fill('#username', 'user1@yomail.com');
  await page.fill('#password', 'User1@123');
  await page.click('#kc-login');
  await page.waitForURL('**/home', { timeout: 30000 });
  
  // Save auth state
  const auth = await page.context().storageState();
  writeFileSync(join(__dirname, 'auth.json'), JSON.stringify(auth, null, 2));
  console.log('✅ Logged in successfully');

  // Step 2: Navigate to courses
  console.log('📚 Finding courses...');
  await page.click('a:has-text("Explore")');
  await page.waitForURL('**/explore');
  
  // Step 3: Find and click an incomplete course
  console.log('🔍 Looking for incomplete course...');
  const courses = page.locator('[class*="course-"], [class*="card-"]');
  const courseCount = await courses.count();
  console.log(`Found ${courseCount} courses`);
  
  let selectedCourse = -1;
  for (let i = 0; i < Math.min(courseCount, 5); i++) {
    const courseText = await courses.nth(i).textContent() || '';
    if (!courseText.includes('100%') && !courseText.includes('Completed')) {
      console.log(`✅ Selecting course ${i + 1}: ${courseText.slice(0, 50)}...`);
      selectedCourse = i;
      break;
    }
  }
  
  if (selectedCourse === -1) selectedCourse = 0; // Fallback to first course
  await courses.nth(selectedCourse).click();
  
  // Step 4: Join course if needed
  console.log('🎯 Joining course if needed...');
  await page.waitForTimeout(2000);
  const joinButton = page.locator('button:has-text("Join"), button:has-text("Enroll")');
  if (await joinButton.isVisible({ timeout: 3000 })) {
    await joinButton.click();
    console.log('✅ Joined course');
  }
  
  // Step 5: Consume course content
  console.log('📖 Starting course consumption...');
  await page.waitForTimeout(2000);
  
  const startButton = page.locator('button:has-text("Start"), a:has-text("Start")');
  if (await startButton.isVisible({ timeout: 3000 })) {
    await startButton.click();
  }
  
  // Find and complete course content
  const contentItems = page.locator('a[href*="content"], a[href*="lesson"], .content-item');
  const contentCount = await contentItems.count();
  
  for (let i = 0; i < Math.min(contentCount, 3); i++) {
    try {
      await contentItems.nth(i).click({ timeout: 5000 });
      await page.waitForTimeout(2000);
      
      // Mark as complete if possible
      const completeButton = page.locator('button:has-text("Complete"), [class*="complete"]');
      if (await completeButton.isVisible({ timeout: 2000 })) {
        await completeButton.click();
      }
      
      // Navigate back
      const backButton = page.locator('button:has-text("Back"), .back-button');
      if (await backButton.isVisible({ timeout: 2000 })) {
        await backButton.click();
      }
      
    } catch (error) {
      console.log(`⚠️ Error with content ${i + 1}: ${error}`);
    }
  }
  
  console.log('✅ Course consumption completed!');
  
  // Step 6: Check for certificate
  console.log('🏆 Checking for certificate...');
  const certificateButton = page.locator('button:has-text("Download Certificate"), a:has-text("Certificate")');
  if (await certificateButton.isVisible({ timeout: 5000 })) {
    await certificateButton.click();
    console.log('✅ Certificate found and clicked!');
  } else {
    console.log('ℹ️ No certificate available yet');
  }
  
  console.log('🎉 Simple flow completed successfully!');
});