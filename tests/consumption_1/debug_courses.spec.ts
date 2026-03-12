import { test } from '@playwright/test';

test('Debug Course Cards Structure', async ({ page }) => {
  console.log('🔍 Debugging course card structure...');
  
  // Login first
  await page.goto('https://test.sunbirded.org/auth/realms/sunbird/protocol/openid-connect/auth?redirect_uri=https%3A%2F%2Ftest.sunbirded.org%2Fportal%2Fauth%2Fcallback&scope=openid&code_challenge=OjHubuBEjxjkyJDY2ND7hp7kLT_NctDBi9TW0g63KX8&code_challenge_method=S256&state=7bfe8b46-de0c-4df6-b939-51b20e0a8516&prompt=login&client_id=portal&response_type=code');
  await page.waitForSelector('#emailormobile', { timeout: 10000 });
  await page.fill('#emailormobile', 'user1@yopmail.com');
  await page.fill('#password', 'User1@123');
  await page.click('#kc-login');
  await page.waitForURL('**/home', { timeout: 30000 });
  
  // Navigate to explore
  await page.click('button:has-text("Explore")');
  await page.waitForTimeout(3000);
  
  const courses = page.locator('[class*="course-"], [class*="card-"]');
  const courseCount = await courses.count();
  console.log(`Found ${courseCount} courses`);
  
  // Debug first 3 course cards
  for (let i = 0; i < Math.min(courseCount, 3); i++) {
    const courseCard = courses.nth(i);
    console.log(`\n=== Course Card ${i + 1} ===`);
    
    // Get full HTML structure
    const innerHTML = await courseCard.innerHTML().catch(() => 'Could not get innerHTML');
    console.log('Full HTML:', innerHTML.slice(0, 500) + '...');
    
    // Get all text content
    const fullText = await courseCard.textContent().catch(() => '');
    console.log('Full text:', fullText);
    
    // Try different progress selectors
    const progressSelectors = [
      ':has-text("Course Progress")',
      ':has-text("Progress")',
      ':has-text("%")',
      '[class*="progress"]',
      '.progress',
      ':has-text("Completed")',
      ':has-text("Complete")'
    ];
    
    for (const selector of progressSelectors) {
      const progressElement = courseCard.locator(selector).first();
      const isVisible = await progressElement.isVisible({ timeout: 500 }).catch(() => false);
      const text = await progressElement.textContent({ timeout: 500 }).catch(() => '');
      console.log(`  Selector "${selector}": visible=${isVisible}, text="${text}"`);
    }
  }
  
  await page.screenshot({ path: 'debug-course-cards.png' });
});