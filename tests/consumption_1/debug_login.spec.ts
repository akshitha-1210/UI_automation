import { test } from '@playwright/test';

test('Debug Login Form', async ({ page }) => {
  console.log('🔍 Debugging login form...');
  
  await page.goto('https://test.sunbirded.org/auth/realms/sunbird/protocol/openid-connect/auth?redirect_uri=https%3A%2F%2Ftest.sunbirded.org%2Fportal%2Fauth%2Fcallback&scope=openid&code_challenge=OjHubuBEjxjkyJDY2ND7hp7kLT_NctDBi9TW0g63KX8&code_challenge_method=S256&state=7bfe8b46-de0c-4df6-b939-51b20e0a8516&prompt=login&client_id=portal&response_type=code');
  
  await page.waitForLoadState('networkidle');
  
  // Take screenshot
  await page.screenshot({ path: 'debug-login-form.png' });
  
  // Get all input elements
  const inputs = await page.locator('input').all();
  console.log(`Found ${inputs.length} input elements:`);
  
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const id = await input.getAttribute('id') || 'no-id';
    const name = await input.getAttribute('name') || 'no-name';
    const type = await input.getAttribute('type') || 'no-type';
    const placeholder = await input.getAttribute('placeholder') || 'no-placeholder';
    
    console.log(`Input ${i + 1}: id="${id}", name="${name}", type="${type}", placeholder="${placeholder}"`);
  }
  
  // Also check for common selectors
  const selectors = [
    '#username',
    '#emailid', 
    '#email',
    '#user',
    '#login',
    'input[type="text"]',
    'input[type="email"]',
    'input[name="username"]',
    'input[name="email"]',
    'input[placeholder*="email"]',
    'input[placeholder*="username"]'
  ];
  
  console.log('\nChecking common selectors:');
  for (const selector of selectors) {
    const exists = await page.locator(selector).isVisible().catch(() => false);
    console.log(`${selector}: ${exists ? '✅ Found' : '❌ Not found'}`);
  }
});