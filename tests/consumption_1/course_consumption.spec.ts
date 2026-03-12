import { test, expect } from '@playwright/test';
import { writeFileSync } from 'fs';
import { join } from 'path';

test('Simple Course Consumption: Continue where you left from', async ({ page }) => {
  test.setTimeout(5 * 60 * 1000); // 5 minutes

  console.log('🚀 Starting Simple Course Consumption...');

  // Helper function to handle all types of popups
  async function handlePopups(page: any) {
    // Handle "We would love to hear from you" feedback popup
    const feedbackSelectors = [
      ':has-text("We would love to hear from you")',
      ':has-text("love to hear from you")',
      ':has-text("hear from you")',
      '.feedback-popup',
      '.survey-popup'
    ];
    
    for (const selector of feedbackSelectors) {
      try {
        if (await page.locator(selector).isVisible({ timeout: 1000 })) {
          console.log(`📋 Found "We would love to hear from you" popup, closing...`);
          
          // Try multiple ways to close the popup
          const closeAttempts = [
            () => page.locator(selector).locator('button:has-text("×")').first().click(),
            () => page.locator(selector).locator('button:has-text("X")').first().click(),
            () => page.locator(selector).locator('[aria-label="Close"]').first().click(),
            () => page.locator(selector).locator('.close').first().click(),
            () => page.locator('button:has-text("×")').first().click(), // Global close
            () => page.locator('button:has-text("X")').first().click(), // Global close
            () => page.keyboard.press('Escape') // Escape key
          ];
          
          for (const closeAttempt of closeAttempts) {
            try {
              await closeAttempt();
              console.log(`❌ Successfully closed feedback popup`);
              await page.waitForTimeout(1000);
              break;
            } catch (e) {
              continue;
            }
          }
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Handle "Enjoyed this content" popup
    const enjoyedSelectors = [
      ':has-text("Enjoyed this content")',
      ':has-text("Enjoyed")',
      '.popup:has-text("content")',
      '.modal:has-text("Enjoyed")'
    ];
    
    for (const selector of enjoyedSelectors) {
      try {
        if (await page.locator(selector).isVisible({ timeout: 1000 })) {
          console.log(`📝 Found "Enjoyed this content" popup, closing...`);
          
          const closeAttempts = [
            () => page.locator(selector).locator('button:has-text("×")').first().click(),
            () => page.locator(selector).locator('button:has-text("X")').first().click(),
            () => page.locator(selector).locator('[aria-label="Close"]').first().click(),
            () => page.keyboard.press('Escape')
          ];
          
          for (const closeAttempt of closeAttempts) {
            try {
              await closeAttempt();
              console.log(`❌ Successfully closed enjoyed popup`);
              await page.waitForTimeout(1000);
              break;
            } catch (e) {
              continue;
            }
          }
          break;
        }
      } catch (e) {
        continue;
      }
    }
  }

  // Helper function to click next unit in sidebar
  async function clickNextUnitInSidebar(page: any, currentUnitIndex: number) {
    console.log(`📋 Looking for unit ${currentUnitIndex + 1} in sidebar...`);
    
    const sidebarUnitSelectors = [
      '.sidebar [class*="unit"]',
      '.course-sidebar [class*="unit"]',
      '.sidebar .unit',
      '[class*="sidebar"] [class*="lesson"]',
      '.sidebar a[href*="content"]',
      '.course-units a',
      '.unit-list a',
      '[class*="unit-list"] a'
    ];
    
    for (const selector of sidebarUnitSelectors) {
      try {
        const units = await page.locator(selector).all();
        console.log(`Found ${units.length} units with selector: ${selector}`);
        
        if (units.length > currentUnitIndex) {
          console.log(`📚 Clicking on unit ${currentUnitIndex + 1}...`);
          await units[currentUnitIndex].click();
          await page.waitForTimeout(2000);
          return true;
        }
      } catch (e) {
        continue;
      }
    }
    
    return false;
  }

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
  await page.waitForTimeout(3000); // Let page load
  
  // Take screenshot to see what's on home page
  await page.screenshot({ path: 'screenshots/01-home-page.png' });
  
  // Look for "Continue where you left from" section
  const continueSelectors = [
    ':has-text("Continue where you left from")',
    ':has-text("Continue where you left")',
    ':has-text("Continue")',
    ':has-text("Resume")',
    ':has-text("left from")',
    'button:has-text("Continue")',
    'a:has-text("Continue")'
  ];
  
  let continueFound = false;
  for (const selector of continueSelectors) {
    try {
      if (await page.locator(selector).isVisible({ timeout: 3000 })) {
        console.log(`✅ Found "Continue where you left from" using: ${selector}`);
        await page.locator(selector).click();
        continueFound = true;
        break;
      }
    } catch (e) {
      continue;
    }
  }
  
  if (!continueFound) {
    console.log('⚠️ Could not find "Continue where you left from", taking screenshot for debugging');
    await page.screenshot({ path: 'screenshots/02-no-continue-found.png' });
    throw new Error('Could not find "Continue where you left from" section');
  }
  
  console.log('✅ Clicked on "Continue where you left from"');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'screenshots/03-course-opened.png' });
  
  // Step 3: Course consumption loop
  console.log('🎓 Step 3: Starting course consumption');
  
  let contentCounter = 1;
  let unitCounter = 1;
  let courseCompleted = false;
  let contentsInCurrentUnit = 0;
  
  // Define selectors for completion detection
  const completionSelectors = [
    ':has-text("You completed this course!")',
    ':has-text("completed this course")',
    ':has-text("Course completed")',
    ':has-text("Congratulations")',
    '.completion-popup',
    '.course-complete'
  ];
  
  while (!courseCompleted && unitCounter <= 10) { // Max 10 units
    console.log(`🏫 Starting Unit ${unitCounter}...`);
    contentsInCurrentUnit = 0;
    
    // Process contents within current unit
    while (contentsInCurrentUnit < 20 && !courseCompleted) { // Max 20 contents per unit
      console.log(`📚 Processing content ${contentsInCurrentUnit + 1} in Unit ${unitCounter}...`);
      
      // Handle any popups that appear
      await handlePopups(page);
      
      // Take screenshot of current state
      await page.screenshot({ path: `screenshots/unit-${unitCounter}-content-${contentsInCurrentUnit + 1}.png` });
      
      // Check for course completion
      for (const selector of completionSelectors) {
        try {
          if (await page.locator(selector).isVisible({ timeout: 1000 })) {
            console.log(`🎉 Course completed!`);
            courseCompleted = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (courseCompleted) break;
    
    // Check for "Enjoyed this content" popup and close it first
    const enjoyedPopupSelectors = [
      ':has-text("Enjoyed this content")',
      ':has-text("Enjoyed")',
      '.popup:has-text("content")',
      '.modal:has-text("Enjoyed")'
    ];
    
    for (const selector of enjoyedPopupSelectors) {
      try {
        if (await page.locator(selector).isVisible({ timeout: 1000 })) {
          console.log(`📝 Found "Enjoyed this content" popup, closing it...`);
          
          // Look for X button to close
          const closeSelectors = [
            'button:has-text("×")',
            'button:has-text("X")',
            'button[aria-label="Close"]',
            '.close-button',
            '[class*="close"]'
          ];
          
          for (const closeSelector of closeSelectors) {
            try {
              const closeButton = page.locator(selector).locator(closeSelector).first();
              if (await closeButton.isVisible({ timeout: 1000 })) {
                console.log(`❌ Closing popup using: ${closeSelector}`);
                await closeButton.click();
                await page.waitForTimeout(1000);
                break;
              }
            } catch (e) {
              // Try clicking anywhere on the popup to close
              await page.locator(selector).click();
              await page.waitForTimeout(1000);
              break;
            }
          }
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Check for "We would love to hear from you" feedback popup and close it
    const feedbackPopupSelectors = [
      ':has-text("We would love to hear from you")',
      ':has-text("love to hear from you")',
      ':has-text("hear from you")',
      '.feedback-popup',
      '.survey-popup'
    ];
    
    for (const selector of feedbackPopupSelectors) {
      try {
        if (await page.locator(selector).isVisible({ timeout: 1000 })) {
          console.log(`📋 Found "We would love to hear from you" popup, closing it...`);
          
          // Look for X button to close
          const closeSelectors = [
            'button:has-text("×")',
            'button:has-text("X")',
            'button[aria-label="Close"]',
            '.close-button',
            '[class*="close"]'
          ];
          
          for (const closeSelector of closeSelectors) {
            try {
              const closeButton = page.locator(selector).locator(closeSelector).first();
              if (await closeButton.isVisible({ timeout: 1000 })) {
                console.log(`❌ Closing feedback popup using: ${closeSelector}`);
                await closeButton.click();
                await page.waitForTimeout(1000);
                break;
              }
            } catch (e) {
              continue;
            }
          }
          
          // If no X button found, try general close approaches
          if (true) { // Always try this as fallback
            try {
              // Try clicking on any close button within the popup
              const anyCloseButton = page.locator(selector).locator('button').filter({ hasText: /×|X|Close/i }).first();
              if (await anyCloseButton.isVisible({ timeout: 500 })) {
                await anyCloseButton.click();
                console.log(`❌ Closed feedback popup with general close button`);
                await page.waitForTimeout(1000);
              }
            } catch (e) {
              console.log(`⚠️ Could not close feedback popup automatically`);
            }
          }
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Look for content player first, then find right arrow within it
    const contentPlayerSelectors = [
      '.content-player',
      '.player',
      '[class*="player"]',
      '.video-player',
      '.course-player',
      '.learning-player',
      '[id*="player"]'
    ];
    
    let playerFound = false;
    let arrowClicked = false;
    
    // First try to find the content player
    for (const playerSelector of contentPlayerSelectors) {
      try {
        const player = page.locator(playerSelector).first();
        if (await player.isVisible({ timeout: 3000 })) {
          console.log(`🎬 Found content player using: ${playerSelector}`);
          
          // HOVER over the content player to make the arrow appear
          console.log(`🖱️ Hovering over content player to reveal navigation arrows...`);
          await player.hover();
          await page.waitForTimeout(1000); // Wait for hover effect to show arrows
          
          // Look for right arrow INSIDE the content player after hovering
          const rightArrowSelectors = [
            'button[aria-label="Next"]',
            'button:has-text("→")',
            'button:has-text("❯")',
            'button:has-text(">")',
            '.next-arrow',
            'button[class*="next"]',
            '[class*="arrow-right"]',
            'button[title="Next"]',
            '.navigation-next',
            'button:has-text("Next")',
            '[class*="forward"]',
            'button[class*="arrow"]',
            '[class*="nav-right"]',
            '[class*="player-next"]'
          ];
          
          for (const arrowSelector of rightArrowSelectors) {
            try {
              const rightArrow = player.locator(arrowSelector).first();
              if (await rightArrow.isVisible({ timeout: 2000 })) {
                console.log(`→ Found right arrow inside player using: ${arrowSelector}`);
                await rightArrow.click();
                console.log(`✅ Clicked right arrow inside content player`);
                arrowClicked = true;
                playerFound = true;
                break;
              }
            } catch (e) {
              continue;
            }
          }
          
          // If no arrow found after hover, try hovering again and look globally
          if (!arrowClicked) {
            console.log(`🖱️ No arrow found in player, trying global search after hover...`);
            await player.hover(); // Hover again
            await page.waitForTimeout(500);
            
            for (const arrowSelector of rightArrowSelectors) {
              try {
                if (await page.locator(arrowSelector).isVisible({ timeout: 1000 })) {
                  console.log(`→ Found right arrow globally after hover using: ${arrowSelector}`);
                  await page.locator(arrowSelector).click();
                  console.log(`✅ Clicked right arrow after hover`);
                  arrowClicked = true;
                  playerFound = true;
                  break;
                }
              } catch (e) {
                continue;
              }
            }
          }
          
          if (arrowClicked) break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // If no player found, try generic right arrow search
    if (!playerFound) {
      console.log('⚠️ Content player not found, trying generic right arrow search...');
      
      const genericRightArrowSelectors = [
        'button[aria-label="Next"]',
        'button:has-text("→")',
        'button:has-text("❯")',
        'button:has-text(">")',
        '.next-arrow',
        'button[class*="next"]',
        '[class*="arrow-right"]',
        'button[title="Next"]',
        '.navigation-next',
        'button:has-text("Next")'
      ];
      
      for (const selector of genericRightArrowSelectors) {
        try {
          if (await page.locator(selector).isVisible({ timeout: 2000 })) {
            console.log(`→ Clicking right arrow using: ${selector}`);
            await page.locator(selector).click();
            arrowClicked = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    if (!arrowClicked) {
      console.log('⚠️ No right arrow found, trying to click next content in sidebar');
      
      // Try to click next content in sidebar
      const sidebarContentSelectors = [
        '.sidebar a',
        '.sidebar button',
        '[class*="sidebar"] [class*="unit"]',
        '[class*="content-list"] a',
        '.unit-list a',
        '[class*="lesson"]'
      ];
      
      for (const selector of sidebarContentSelectors) {
        try {
          const sidebarItems = await page.locator(selector).all();
          if (sidebarItems.length > contentCounter - 1) {
            console.log(`📋 Clicking content ${contentCounter} in sidebar`);
            await sidebarItems[contentCounter - 1].click();
            arrowClicked = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    if (!arrowClicked) {
      console.log('⚠️ Could not find next content, may have reached the end');
      break;
    }
    
    await page.waitForTimeout(3000);
    
    // Check for "Enjoyed this content" popup and close it (using previously defined selectors)
    for (const selector of enjoyedPopupSelectors) {
      try {
        if (await page.locator(selector).isVisible({ timeout: 2000 })) {
          console.log(`📝 Found "Enjoyed this content" popup`);
          
          // Look for X button to close (reusing close selectors)
          const closeSelectors = [
            'button:has-text("×")',
            'button:has-text("X")',
            'button[aria-label="Close"]',
            '.close-button',
            '[class*="close"]'
          ];
          
          for (const closeSelector of closeSelectors) {
            try {
              const closeButton = page.locator(selector).locator(closeSelector).first();
              if (await closeButton.isVisible({ timeout: 1000 })) {
                console.log(`❌ Closing popup using: ${closeSelector}`);
                await closeButton.click();
                break;
              }
            } catch (e) {
              continue;
            }
          }
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    // Check for course completion popup (using previously defined selectors)
    for (const selector of completionSelectors) {
      try {
        if (await page.locator(selector).isVisible({ timeout: 2000 })) {
          console.log(`🎉 Found course completion popup!`);
          await page.screenshot({ path: `screenshots/05-course-completed.png` });
          courseCompleted = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    contentCounter++;
  }
  
  if (courseCompleted) {
    console.log('🏆 SUCCESS: Course completed successfully!');
  } else {
    console.log(`ℹ️ Processed ${contentCounter - 1} contents. Course may be completed.`);
  }
  
  // Final screenshot
  await page.screenshot({ path: 'screenshots/06-final-state.png' });
  
  console.log('✅ Course consumption flow completed!');
});