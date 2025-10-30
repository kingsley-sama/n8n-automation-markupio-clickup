const { chromium } = require('playwright');

async function testPlaywright() {
  console.log('🎭 Testing Playwright setup...\n');
  
  let browser;
  try {
    // Launch browser
    console.log('1. Launching browser...');
    browser = await chromium.launch({ headless: true });
    console.log('   ✅ Browser launched successfully\n');
    
    // Create context and page
    console.log('2. Creating browser context...');
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    console.log('   ✅ Context created successfully\n');
    
    console.log('3. Creating new page...');
    const page = await context.newPage();
    console.log('   ✅ Page created successfully\n');
    
    // Navigate to a test page
    console.log('4. Navigating to example.com...');
    await page.goto('https://example.com', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    console.log('   ✅ Navigation successful\n');
    
    // Get page title
    console.log('5. Getting page title...');
    const title = await page.title();
    console.log(`   ✅ Page title: "${title}"\n`);
    
    // Take a screenshot
    console.log('6. Taking screenshot...');
    const screenshot = await page.screenshot({ 
      type: 'jpeg',
      quality: 90
    });
    console.log(`   ✅ Screenshot taken (${(screenshot.length / 1024).toFixed(1)} KB)\n`);
    
    // Test viewport size
    console.log('7. Testing viewport methods...');
    const viewport = page.viewportSize();
    console.log(`   ✅ Viewport: ${viewport.width}x${viewport.height}\n`);
    
    // Close browser
    await browser.close();
    console.log('8. Browser closed\n');
    
    console.log('🎉 All tests passed! Playwright is working correctly.\n');
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    if (browser) {
      await browser.close();
    }
    return false;
  }
}

// Run the test
if (require.main === module) {
  testPlaywright()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { testPlaywright };
