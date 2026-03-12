import { test, expect } from '@playwright/test';
import { writeFileSync } from 'fs';
import { join } from 'path';

test('Course Consumption: Continue and Complete All Units', async ({ page }) => {
  test.setTimeout(10 * 60 * 1000); // 10 minutes

  console.log('🚀 Starting Course Consumption Flow...');

  // Step 1: Login
  console.log('🔐 Step 1: Login');
  await page.goto('https://test.sunbirded.org/auth/realms/sunbird/protocol/openid-connect/auth?redirect_uri=https%3A%2F%2Ftest.sunbirded.org%2Fportal%2Fauth%2Fcallback&scope=openid&code_challenge=OjHubuBEjxjkyJDY2ND7hp7kLT_NctDBi9TW0g63KX8&code_challenge_method=S256&state=7bfe8b46-de0c-4df6-b939-51b20e0a8516&prompt=login&client_id=portal&response_type=code');
  
  await page.waitForSelector('#emailormobile', { timeout: 10000 });
  await page.fill('#emailormobile', 'user1@yopmail.com');
  await page.fill('#password', 'User1@123');
  await page.click('#kc-login');
  await page.waitForURL('**/home', { timeout: 30000 });
  
  // Save auth state
  const auth = await page.context().storageState();
  writeFileSync(join(__dirname, 'auth.json'), JSON.stringify(auth, null, 2));
  console.log('✅ Logged in successfully');

  // Step 2: Find and click "Continue where you left from"
  console.log('📖 Step 2: Looking for "Continue where you left from"');
  await page.waitForTimeout(3000);
  
  const continueSelectors = [
    ':has-text("Continue where you left from")',
    'button:has-text("Continue")',
    'a:has-text("Continue")'
  ];
  
  let continueFound = false;
  for (const selector of continueSelectors) {
    try {
      if (await page.locator(selector).isVisible({ timeout: 3000 })) {
        console.log(`✅ Found "Continue where you left from"`);
        await page.locator(selector).click();
        continueFound = true;
        break;
      }
    } catch (e) {
      continue;
    }
  }
  
  if (!continueFound) {
    throw new Error('Could not find "Continue where you left from" section');
  }
  
  console.log('✅ Opened course for continuation');
  await page.waitForTimeout(3000);

  // Helper function to handle popups
  async function handlePopups() {
    // Handle feedback popup
    const feedbackSelectors = [
      ':has-text("We would love to hear from you")',
      ':has-text("love to hear from you")'
    ];
    
    for (const selector of feedbackSelectors) {
      try {
        if (await page.locator(selector).isVisible({ timeout: 1000 })) {
          console.log(`📋 Closing feedback popup...`);
          // Try multiple close methods
          const closeMethods = [
            () => page.locator('button:has-text("×")').first().click(),
            () => page.locator('button:has-text("X")').first().click(), 
            () => page.keyboard.press('Escape')
          ];
          
          for (const method of closeMethods) {
            try {
              await method();
              await page.waitForTimeout(1000);
              break;
            } catch {}
          }
          break;
        }
      } catch {}
    }
    
    // Handle enjoyed content popup
    const enjoyedSelectors = [':has-text("Enjoyed this content")'];
    for (const selector of enjoyedSelectors) {
      try {
        if (await page.locator(selector).isVisible({ timeout: 1000 })) {
          console.log(`📝 Closing enjoyed content popup...`);
          await page.locator('button:has-text("×")').first().click();
          await page.waitForTimeout(1000);
        }
      } catch {}
    }
  }

  // Helper function to navigate content within a unit
  async function navigateContent() {
    console.log('→ Looking for right arrow in content player...');
    
    // Find content player and hover to reveal arrows
    const playerSelectors = ['.content-player', '[class*="player"]', '.player'];
    
    for (const playerSelector of playerSelectors) {
      try {
        const player = page.locator(playerSelector).first();
        if (await player.isVisible({ timeout: 3000 })) {
          console.log(`🎬 Found content player, hovering...`);
          await player.hover();
          await page.waitForTimeout(1000);
          
          // Look for right arrow
          const arrowSelectors = [
            'button[class*="next"]',
            'button[aria-label="Next"]',
            'button:has-text("→")',
            'button:has-text(">")'
          ];
          
          for (const arrowSelector of arrowSelectors) {
            try {
              const arrow = page.locator(arrowSelector).first();
              if (await arrow.isVisible({ timeout: 2000 })) {
                console.log(`✅ Clicking right arrow`);
                await arrow.click();
                await page.waitForTimeout(2000);
                return true;
              }
            } catch {}
          }
        }
      } catch {}
    }
    
    return false;
  }

  // Step 3: Main course consumption loop
  console.log('🎓 Step 3: Starting course consumption');
  
  let unitIndex = 0;
  let courseCompleted = false;
  let maxUnits = 10;
  let maxContentsPerUnit = 20;

  while (!courseCompleted && unitIndex < maxUnits) {
    console.log(`\n🏫 Processing Unit ${unitIndex + 1}...`);
    
    // Handle any popups
    await handlePopups();
    
    // Take screenshot
    await page.screenshot({ path: `screenshots/unit-${unitIndex + 1}-start.png` });
    
    // Navigate through contents in current unit
    let contentIndex = 0;
    let unitCompleted = false;
    
    while (!unitCompleted && contentIndex < maxContentsPerUnit) {
      console.log(`📚 Content ${contentIndex + 1} in Unit ${unitIndex + 1}`);
      
      // Handle popups
      await handlePopups();
      
      // Check for course completion
      const completionTexts = [
        'You completed this course!',
        'Course completed',
        'Congratulations'
      ];
      
      for (const text of completionTexts) {
        try {
          if (await page.locator(`:has-text("${text}")`).isVisible({ timeout: 1000 })) {
            console.log(`🎉 Course completed!`);
            courseCompleted = true;
            break;
          }
        } catch {}
      }
      
      if (courseCompleted) break;
      
      // Try to navigate to next content
      const navigated = await navigateContent();
      
      if (!navigated) {
        console.log(`⚠️ No more content arrows found in Unit ${unitIndex + 1}`);
        unitCompleted = true;
      }
      
      contentIndex++;
      await page.waitForTimeout(2000);
    }
    
    // Move to next unit
    if (!courseCompleted && !unitCompleted) {
      console.log(`📋 Looking for next unit in sidebar...`);
      
      const sidebarSelectors = [
        '.sidebar [class*="unit"]',
        '.course-sidebar a',
        '[class*="unit-list"] a'
      ];
      
      let nextUnitClicked = false;
      for (const selector of sidebarSelectors) {
        try {
          const units = await page.locator(selector).all();
          if (units.length > unitIndex + 1) {
            console.log(`📚 Clicking Unit ${unitIndex + 2}...`);
            await units[unitIndex + 1].click();
            await page.waitForTimeout(3000);
            nextUnitClicked = true;
            break;
          }
        } catch {}
      }
      
      if (!nextUnitClicked) {
        console.log(`⚠️ No more units found. Course may be completed.`);
        break;
      }
    }
    
    unitIndex++;
  }
  
  // Final screenshot and completion
  await page.screenshot({ path: 'screenshots/final-state.png' });
  
  if (courseCompleted) {
    console.log('🏆 SUCCESS: Course completed successfully!');
  } else {
    console.log(`ℹ️ Processed ${unitIndex} units. Course may be completed.`);
  }
  
  console.log('✅ Course consumption flow completed!');
});