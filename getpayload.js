const puppeteer = require('puppeteer');
const { MarkupScreenshotter } = require('./script_integrated.js');

async function scrapeMarkupThreads(url = 'https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0') {
  console.log('🚀 Initializing browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-gpu',
      '--no-first-run',
      '--disable-default-apps'
    ]
  });

  try {
    console.log('📄 Creating new page...');
    const page = await browser.newPage();
    
    // Set viewport and timeouts
    await page.setViewport({ width: 1920, height: 1080 });
    page.setDefaultTimeout(60000); // Increased to 60 seconds
    page.setDefaultNavigationTimeout(60000); // Increased to 60 seconds
    
    // Navigate to the markup page
    console.log(`🌐 Navigating to markup page: ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000 // Increased to 60 seconds
    });
    console.log('✅ Page loaded successfully');

    // Extract project name from note__heading
    console.log('🔍 Extracting project name...');
    const projectName = await page.evaluate(() => {
      // Look for p tag with class note__heading that's a child of element with class note
      const noteElement = document.querySelector('.note');
      if (noteElement) {
        const headingElement = noteElement.querySelector('p.note__heading');
        if (headingElement) {
          return headingElement.textContent.trim();
        }
      }
      
      // Fallback: try to find note__heading anywhere on the page
      const headingElement = document.querySelector('p.note__heading');
      return headingElement ? headingElement.textContent.trim() : null;
    });
    
    console.log(`✅ Project name extracted: ${projectName || 'Not found'}`);

    // Wait for the thread list to load
    console.log('⏳ Waiting for thread list to load...');
    await page.waitForSelector('div.thread-list', { timeout: 30000 }); // Increased to 30 seconds
    console.log('✅ Thread list loaded successfully');

    // Expand the thread list container to reveal all thread groups
    console.log('📂 Expanding thread list container...');
    await page.evaluate(() => {
      const threadList = document.querySelector('div.thread-list');
      if (threadList) {
        // Try to expand or show the thread list if it's collapsed
        const expandButton = threadList.querySelector('.expand-button, .show-all, .toggle-button, [aria-expanded="false"]');
        if (expandButton) {
          expandButton.click();
          console.log('Clicked thread list expand button');
        }
        
        // Ensure the element is visible and expanded
        threadList.style.display = 'block';
        threadList.style.visibility = 'visible';
        
        // If there's a max-height restriction, remove it
        threadList.style.maxHeight = 'none';
        threadList.style.overflow = 'visible';
      }
    });

    // Wait for expansion to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Now count the actual thread groups after expansion (immediate children only)
    const threadGroupCount = await page.evaluate(() => {
      const threadList = document.querySelector('div.thread-list');
      if (!threadList) {
        console.error('thread-list container not found!');
        return 0;
      }
      
      // Count only immediate children with class thread-list-group
      const threadGroups = threadList.querySelectorAll(':scope > div.thread-list-group');
      console.log(`After expansion, found ${threadGroups.length} immediate child thread groups in thread-list`);
      
      // Alternative method to double-check
      const allChildren = Array.from(threadList.children);
      const threadGroupChildren = allChildren.filter(child => child.classList.contains('thread-list-group'));
      console.log(`Alternative count: ${threadGroupChildren.length} thread-list-group children`);
      
      return threadGroups.length;
    });
    
    console.log(`✅ Thread list expanded - Found ${threadGroupCount} thread groups as immediate children`);

    // Expand individual thread groups if they're collapsed
    console.log('📂 Expanding individual thread groups...');
    await expandAllThreadGroups(page);

    // Extract thread data
    console.log('🔍 Extracting thread data...');
    const threads = await page.evaluate(() => {
      const threadsByName = {};

      // First, get the total comment count for validation
      const totalCountElement = document.querySelector('span.thread-list-tabs__option-count');
      const expectedTotalComments = totalCountElement ? parseInt(totalCountElement.textContent.trim()) || 0 : 0;
      console.log(`Expected total comments across all threads: ${expectedTotalComments}`);

      // Find all thread groups after expansion - only immediate children of thread-list
      const threadList = document.querySelector('div.thread-list');
      if (!threadList) {
        console.error('thread-list container not found during extraction!');
        return threadsByName;
      }
      
      // Get only immediate children with class thread-list-group
      let threadGroups = threadList.querySelectorAll(':scope > div.thread-list-group');
      let actualThreadCount = threadGroups.length;
      console.log(`Found ${actualThreadCount} thread groups as immediate children of thread-list`);
      
      if (actualThreadCount === 0) {
        console.error('No immediate child thread groups found! The thread-list may not be properly expanded.');
        
        // Fallback: try to find all thread-list-group elements anywhere
        const allThreadGroups = document.querySelectorAll('div.thread-list-group');
        console.log(`Fallback: Found ${allThreadGroups.length} thread-list-group elements anywhere on page`);
        
        if (allThreadGroups.length === 0) {
          return threadsByName;
        }
        
        // Use fallback if we found some
        threadGroups = allThreadGroups;
        actualThreadCount = allThreadGroups.length;
        console.log('Using fallback thread groups');
      }
      
      threadGroups.forEach((group, groupIndex) => {
        try {
          // Extract thread-level information
          const nameElement = group.querySelector('span.thread-list-item-group-header-label');
          const counterElement = group.querySelector('span.thread-list-item-group-header-thread-counter');
          
          const threadName = nameElement ? nameElement.textContent.trim() : `Thread ${groupIndex + 1}`;
          const expectedCommentCount = counterElement ? parseInt(counterElement.textContent.trim()) || 0 : 0;
          
          console.log(`Processing thread ${groupIndex + 1}/${actualThreadCount}: ${threadName} (expected ${expectedCommentCount} comments)`);

          if (!threadName) {
            console.warn(`Thread ${groupIndex + 1} has no name, skipping`);
            return;
          }

          // Initialize thread group if it doesn't exist
          if (!threadsByName[threadName]) {
            threadsByName[threadName] = [];
          }

          // Find all individual messages in this thread group
          const messageElements = group.querySelectorAll('div[data-thread-id]');
          console.log(`Found ${messageElements.length} message elements (expected ${expectedCommentCount})`);
          
          // If we don't find enough messages with the main selector, try alternatives
          let finalMessageElements = messageElements;
          if (messageElements.length < expectedCommentCount) {
            console.warn(`Not enough messages found with main selector. Trying alternatives...`);
            const alternativeSelectors = [
              '.thread-item',
              '.comment-item', 
              '.message-item',
              '[data-message-id]',
              '.thread-list-item:not(.thread-list-item-group-header)'
            ];
            
            for (const altSelector of alternativeSelectors) {
              const altElements = group.querySelectorAll(altSelector);
              if (altElements.length >= expectedCommentCount) {
                console.log(`Using alternative selector ${altSelector}: found ${altElements.length} elements`);
                finalMessageElements = altElements;
                break;
              }
            }
          }
          
          let threadIndex = 1; // Reset for each thread group
          
          Array.from(finalMessageElements).forEach((messageEl, msgIndex) => {
            try {
              // Extract thread ID
              const threadId = messageEl.getAttribute('data-thread-id') || 
                             messageEl.getAttribute('data-message-id') || 
                             `${threadName}-${msgIndex + 1}`;
              
              // Extract pin number from label button
              let pinNumber = null;
              const pinSelectors = [
                '.thread-label',      // Primary selector
                '.pin-label',
                '.label-button',
                '.pin-number'
              ];
              
              for (const selector of pinSelectors) {
                const pinElement = messageEl.querySelector(selector);
                if (pinElement) {
                  const pinText = pinElement.textContent.trim();
                  const extractedPin = parseInt(pinText.match(/\d+/)?.[0]);
                  if (extractedPin && !isNaN(extractedPin)) {
                    pinNumber = extractedPin;
                    break;
                  }
                }
              }
              
              // Fallback: look for any element containing numbers that might be pin
              if (pinNumber === null) {
                const allElements = messageEl.querySelectorAll('*');
                for (const el of allElements) {
                  const text = el.textContent.trim();
                  if (text && /^#?\d+$/.test(text) && parseInt(text.replace('#', '')) > 0) {
                    pinNumber = parseInt(text.replace('#', ''));
                    break;
                  }
                }
              }
              
              // Extract message content with multiple selectors
              let messageContent = '';
              const contentSelectors = [
                'div.message-text p',
                '.message-content',
                '.comment-text',
                '.thread-content',
                'p'
              ];
              
              for (const selector of contentSelectors) {
                const contentElement = messageEl.querySelector(selector);
                if (contentElement && contentElement.textContent.trim()) {
                  messageContent = contentElement.textContent.trim();
                  break;
                }
              }
              
              // Extract user/author
              let userName = '';
              const authorSelectors = [
                'span.message-author',
                '.author-name',
                '.user-name',
                '.comment-author'
              ];
              
              for (const selector of authorSelectors) {
                const authorElement = messageEl.querySelector(selector);
                if (authorElement && authorElement.textContent.trim()) {
                  userName = authorElement.textContent.trim() || authorElement.getAttribute('title') || '';
                  if (userName) break;
                }
              }

              console.log(`Message ${threadIndex}: ID=${threadId}, Pin=${pinNumber}, Content=${messageContent.substring(0, 30)}..., User=${userName}`);

              // Add if we have any meaningful data
              if (threadId || messageContent || userName) {
                threadsByName[threadName].push({
                  id: threadId,
                  index: pinNumber || threadIndex,
                  pinNumber: pinNumber || threadIndex,
                  content: messageContent,
                  user: userName
                });
                threadIndex++;
              }
            } catch (msgError) {
              console.warn('Error processing message element:', msgError);
            }
          });
          
          const actualCount = threadsByName[threadName].length;
          console.log(`Thread "${threadName}" completed: Expected ${expectedCommentCount}, Got ${actualCount} comments`);
          
          // If we didn't get the expected number of comments, log a warning
          if (actualCount !== expectedCommentCount) {
            console.warn(`Comment count mismatch for "${threadName}": Expected ${expectedCommentCount}, Got ${actualCount}`);
          }
          
        } catch (groupError) {
          console.warn('Error processing thread group:', groupError);
        }
      });

      // Final validation against total expected comments
      const actualTotalComments = Object.values(threadsByName).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`Final validation - Expected total: ${expectedTotalComments}, Got total: ${actualTotalComments}`);
      
      if (actualTotalComments !== expectedTotalComments) {
        console.warn(`TOTAL COMMENT MISMATCH: Expected ${expectedTotalComments}, Got ${actualTotalComments}`);
      }

      return threadsByName;
    });

    console.log('✅ Thread data extracted successfully');
    
    // Convert to the required structure format
    console.log('📊 Formatting data structure...');
    const formattedData = {
      "projectName": projectName || "Unknown Project",
      "threads": Object.keys(threads).map(threadName => ({
        "threadName": threadName,
        "comments": threads[threadName]
      }))
    };

    console.log(`✅ Successfully extracted ${Object.keys(threads).length} thread groups with ${Object.values(threads).reduce((sum, arr) => sum + arr.length, 0)} total messages`);
    
    return formattedData;

  } catch (error) {
    console.error('❌ Scraping failed:', error.message);
    throw error;
  } finally {
    console.log('🔐 Closing browser...');
    await browser.close();
    console.log('✅ Browser closed successfully');
  }
}

// Helper function to extract thread data from existing page
async function extractThreadDataFromPage(page) {
  console.log('⏳ Waiting for thread list to load...');
  await page.waitForSelector('div.thread-list', { timeout: 30000 });
  console.log('✅ Thread list loaded successfully');

  // Extract project name from note__heading
  console.log('🔍 Extracting project name...');
  const projectName = await page.evaluate(() => {
    // Look for p tag with class note__heading that's a child of element with class note
    const noteElement = document.querySelector('.note');
    if (noteElement) {
      const headingElement = noteElement.querySelector('p.note__heading');
      if (headingElement) {
        return headingElement.textContent.trim();
      }
    }
    
    // Fallback: try to find note__heading anywhere on the page
    const headingElement = document.querySelector('p.note__heading');
    return headingElement ? headingElement.textContent.trim() : null;
  });
  
  console.log(`✅ Project name extracted: ${projectName || 'Not found'}`);

  // Expand the thread list container
  console.log('📂 Expanding thread list container...');
  await page.evaluate(() => {
    const threadList = document.querySelector('div.thread-list');
    if (threadList) {
      const expandButton = threadList.querySelector('.expand-button, .show-all, .toggle-button, [aria-expanded="false"]');
      if (expandButton) {
        expandButton.click();
        console.log('Clicked thread list expand button');
      }
      threadList.style.display = 'block';
      threadList.style.visibility = 'visible';
      threadList.style.maxHeight = 'none';
      threadList.style.overflow = 'visible';
    }
  });

  await new Promise(resolve => setTimeout(resolve, 2000));
  await expandAllThreadGroupsFromPage(page);

  // Extract thread data
  console.log('🔍 Extracting thread data...');
  const threads = await page.evaluate(() => {
    const threadsByName = {};

    // Find thread groups
    const threadList = document.querySelector('div.thread-list');
    if (!threadList) {
      console.error('thread-list container not found!');
      return threadsByName;
    }
    
    let threadGroups = threadList.querySelectorAll(':scope > div.thread-list-group');
    let actualThreadCount = threadGroups.length;
    
    if (actualThreadCount === 0) {
      const allThreadGroups = document.querySelectorAll('div.thread-list-group');
      console.log(`Fallback: Found ${allThreadGroups.length} thread-list-group elements`);
      threadGroups = allThreadGroups;
      actualThreadCount = allThreadGroups.length;
    }
    
    threadGroups.forEach((group, groupIndex) => {
      try {
        const nameElement = group.querySelector('span.thread-list-item-group-header-label');
        const counterElement = group.querySelector('span.thread-list-item-group-header-thread-counter');
        
        const threadName = nameElement ? nameElement.textContent.trim() : `Thread ${groupIndex + 1}`;
        const expectedCommentCount = counterElement ? parseInt(counterElement.textContent.trim()) || 0 : 0;
        
        console.log(`Processing thread ${groupIndex + 1}/${actualThreadCount}: ${threadName} (expected ${expectedCommentCount} comments)`);

        if (!threadName) {
          console.warn(`Thread ${groupIndex + 1} has no name, skipping`);
          return;
        }

        if (!threadsByName[threadName]) {
          threadsByName[threadName] = [];
        }

        const messageElements = group.querySelectorAll('div[data-thread-id]');
        let threadIndex = 1;
        
        Array.from(messageElements).forEach((messageEl, msgIndex) => {
          try {
            const threadId = messageEl.getAttribute('data-thread-id') || 
                           messageEl.getAttribute('data-message-id') || 
                           `${threadName}-${msgIndex + 1}`;
            
            let pinNumber = null;
            const pinSelectors = ['.thread-label', '.pin-label', '.label-button', '.pin-number'];
            
            for (const selector of pinSelectors) {
              const pinElement = messageEl.querySelector(selector);
              if (pinElement) {
                const pinText = pinElement.textContent.trim();
                const extractedPin = parseInt(pinText.match(/\d+/)?.[0]);
                if (extractedPin && !isNaN(extractedPin)) {
                  pinNumber = extractedPin;
                  break;
                }
              }
            }
            
            let messageContent = '';
            const contentSelectors = ['div.message-text p', '.message-content', '.comment-text', '.thread-content', 'p'];
            
            for (const selector of contentSelectors) {
              const contentElement = messageEl.querySelector(selector);
              if (contentElement && contentElement.textContent.trim()) {
                messageContent = contentElement.textContent.trim();
                break;
              }
            }
            
            let userName = '';
            const authorSelectors = ['span.message-author', '.author-name', '.user-name', '.comment-author'];
            
            for (const selector of authorSelectors) {
              const authorElement = messageEl.querySelector(selector);
              if (authorElement && authorElement.textContent.trim()) {
                userName = authorElement.textContent.trim() || authorElement.getAttribute('title') || '';
                if (userName) break;
              }
            }

            if (threadId || messageContent || userName) {
              threadsByName[threadName].push({
                id: threadId,
                index: pinNumber || threadIndex,
                pinNumber: pinNumber || threadIndex,
                content: messageContent,
                user: userName
              });
              threadIndex++;
            }
          } catch (msgError) {
            console.warn('Error processing message element:', msgError);
          }
        });
        
      } catch (groupError) {
        console.warn('Error processing thread group:', groupError);
      }
    });

    return threadsByName;
  });

  console.log('✅ Thread data extracted successfully');
  
  const formattedData = {
    "projectName": projectName || "Unknown Project",
    "threads": Object.keys(threads).map(threadName => ({
      "threadName": threadName,
      "comments": threads[threadName]
    }))
  };

  return formattedData;
}

// Helper function to expand thread groups from existing page
async function expandAllThreadGroupsFromPage(page) {
  try {
    console.log('Expanding individual thread group containers...');
    
    const expandedCount = await page.evaluate(() => {
      let expandedGroups = 0;
      
      const toggleButtons = document.querySelectorAll('div.thread-list-item-group-header-toggle-button-container, .thread-group-toggle, .expand-toggle');
      
      toggleButtons.forEach((button, index) => {
        try {
          const svg = button.querySelector('svg');
          const isCollapsed = svg && (svg.classList.contains('collapsed') || !svg.classList.contains('open'));
          
          if (isCollapsed || button.getAttribute('aria-expanded') === 'false') {
            console.log(`Expanding thread group ${index + 1}`);
            button.click();
            expandedGroups++;
          }
        } catch (err) {
          console.warn(`Error expanding thread group ${index + 1}:`, err);
        }
      });
      
      return expandedGroups;
    });

    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log(`✅ Expanded ${expandedCount} thread groups`);
    
  } catch (error) {
    console.warn('Could not expand thread groups:', error);
  }
}

// Helper function to take screenshots from existing page
async function takeScreenshotsFromPage(page, url, numberOfImages, options = {}) {
  try {
    console.log(`📸 Taking ${numberOfImages} screenshots from existing page...`);
    
    // Use the existing MarkupScreenshotter but with the existing page
    const screenshotter = new MarkupScreenshotter({
      numberOfImages: numberOfImages,
      debugMode: options.debugMode || false,
      screenshotQuality: options.screenshotQuality || 90
    });
    
    // Manually set up the screenshotter with existing page
    screenshotter.page = page;
    screenshotter.currentUrl = url;
    screenshotter.currentTitle = await page.title();
    screenshotter.sessionId = screenshotter.supabaseService.initializeSession();
    
    console.log(`Starting screenshot session: ${screenshotter.sessionId}`);
    
    // Wait for images and setup
    await screenshotter.handleOverlays();
    await screenshotter.waitForImageContainer();
    await screenshotter.waitForImagesLoad();
    await screenshotter.enableFullscreen();
    
    // Additional wait for everything to settle
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Capture images
    await screenshotter.captureMultipleImages();
    
    const result = {
      success: true,
      url: url,
      title: screenshotter.currentTitle,
      numberOfImages: screenshotter.screenshots.length,
      screenshots: screenshotter.screenshots.map(s => s.filename),
      metadata: screenshotter.getScreenshotMetadata(),
      supabaseUrls: [],
      localPaths: screenshotter.screenshots.map(s => s.localPath || '')
    };

    // Save to Supabase
    try {
      const supabaseResult = await screenshotter.supabaseService.saveScrapedData({
        ...result,
        screenshotBuffers: screenshotter.screenshots
      });
      result.supabaseUrls = supabaseResult.uploadedUrls || [];
      console.log('Screenshots saved to Supabase successfully');
    } catch (dbError) {
      console.error(`Failed to save screenshots to Supabase: ${dbError.message}`);
    }
    
    return result;
    
  } catch (error) {
    console.error(`Screenshot capture failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      numberOfImages: 0,
      screenshots: [],
      supabaseUrls: [],
      localPaths: []
    };
  }
}

async function expandAllThreadGroups(page) {
  try {
    // Look for collapsed thread groups and expand them
    console.log('Expanding individual thread group containers...');
    
    const expandedCount = await page.evaluate(() => {
      let expandedGroups = 0;
      
      // Find all thread group headers with toggle buttons
      const toggleButtons = document.querySelectorAll('div.thread-list-item-group-header-toggle-button-container, .thread-group-toggle, .expand-toggle');
      
      toggleButtons.forEach((button, index) => {
        try {
          // Check if the group is collapsed
          const svg = button.querySelector('svg');
          const isCollapsed = svg && (svg.classList.contains('collapsed') || !svg.classList.contains('open'));
          
          if (isCollapsed || button.getAttribute('aria-expanded') === 'false') {
            console.log(`Expanding thread group ${index + 1}`);
            button.click();
            expandedGroups++;
          }
        } catch (err) {
          console.warn(`Error expanding thread group ${index + 1}:`, err);
        }
      });
      
      // Also try to expand any collapsed sections
      const collapsedSections = document.querySelectorAll('[aria-expanded="false"], .collapsed, .thread-list-group.collapsed');
      collapsedSections.forEach(section => {
        const expandButton = section.querySelector('button, .toggle, [role="button"]');
        if (expandButton) {
          expandButton.click();
          expandedGroups++;
        }
      });
      
      return expandedGroups;
    });

    // Wait for expansions to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log(`✅ Expanded ${expandedCount} thread groups`);
    
    // Verify thread groups are now visible
    const visibleGroups = await page.evaluate(() => {
      const groups = document.querySelectorAll('div.thread-list-group');
      let visibleCount = 0;
      
      groups.forEach(group => {
        const style = window.getComputedStyle(group);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          visibleCount++;
        }
      });
      
      return visibleCount;
    });
    
    console.log(`✅ ${visibleGroups} thread groups are now visible`);
    
  } catch (error) {
    console.warn('Could not expand thread groups:', error);
  }
}

// Error handling and retry logic
async function scrapeWithRetry(maxRetries = 3) {
  console.log(`🔄 Starting scraper with ${maxRetries} retry attempts...`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🚀 Scraping attempt ${attempt}/${maxRetries}`);
      const result = await scrapeMarkupThreads();
      console.log('✅ Scraping completed successfully on attempt', attempt);
      return result;
    } catch (error) {
      console.log(`❌ Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt === maxRetries) {
        console.log(`💥 All ${maxRetries} attempts failed. Last error: ${error.message}`);
        throw new Error(`All ${maxRetries} attempts failed. Last error: ${error.message}`);
      }
      
      // Wait before retry with exponential backoff
      const waitTime = 2000 * attempt;
      console.log(`⏳ Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

// Combined function to get payload and screenshots in one browser session
async function getCompletePayload(url, options = {}) {
  console.log('🎬 Starting optimized payload extraction with screenshots...');
  const startTime = Date.now();
  
  if (!url) {
    throw new Error('URL is required for payload extraction');
  }
  
  console.log(`🌐 Target URL: ${url}`);
  
  let browser = null;
  
  try {
    // Step 1: Initialize single browser session
    console.log('🚀 Initializing single browser session...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-gpu',
        '--no-first-run',
        '--disable-default-apps'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set viewport and timeouts
    await page.setViewport({ width: 1920, height: 1080 });
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(60000);
    
    // Step 2: Navigate to page once
    console.log(`🌐 Navigating to: ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    console.log('✅ Page loaded successfully');
    
    // Step 3: Extract thread data using existing page
    console.log('� Step 1: Extracting thread data from loaded page...');
    const threadData = await extractThreadDataFromPage(page);
    
    console.log(`✅ Found ${threadData.threads.length} threads`);
    
    // Step 4: Take screenshots using same browser session
    const numberOfImages = threadData.threads.length;
    console.log(`📸 Step 2: Taking ${numberOfImages} screenshots using same browser session...`);
    
    const screenshotResult = await takeScreenshotsFromPage(page, url, numberOfImages, {
      screenshotQuality: options.screenshotQuality || 90,
      debugMode: options.debugMode || false
    });
    
    if (!screenshotResult.success) {
      throw new Error(`Screenshot capture failed: ${screenshotResult.error}`);
    }
    
    console.log('✅ Screenshots captured successfully');
    
    // Step 5: Combine results
    console.log('🔗 Step 3: Combining results...');
    const combinedData = {
      success: true,
      url: url,
      projectName: threadData.projectName || "Unknown Project",
      threads: threadData.threads.map((thread, index) => ({
        ...thread,
        imageIndex: index + 1,
        imagePath: screenshotResult.supabaseUrls[index] || '',
        imageFilename: screenshotResult.screenshots[index] || `image_${index + 1}.jpg`,
        localImagePath: screenshotResult.localPaths[index] || ''
      })),
      totalThreads: threadData.threads.length,
      totalScreenshots: screenshotResult.numberOfImages,
      timestamp: new Date().toISOString()
    };
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`🎉 Complete payload generated in ${duration}s with single browser session`);
    
    return combinedData;
    
  } catch (error) {
    console.error('❌ Complete payload extraction failed:', error.message);
    return {
      success: false,
      error: error.message,
      url: url,
      threads: [],
      timestamp: new Date().toISOString()
    };
  } finally {
    if (browser) {
      console.log('🔐 Closing browser...');
      await browser.close();
      console.log('✅ Browser closed successfully');
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('🎬 Starting Markup.io complete payload extractor...');
    
    // Get URL from command line arguments or use environment variable
    const args = process.argv.slice(2);
    const url = args[0] || process.env.MARKUP_URL || 'https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0';
    
    if (!url) {
      console.error('❌ No URL provided. Usage: node getpayload.js <url>');
      process.exit(1);
    }
    
    console.log(`🌐 Processing URL: ${url}`);
    
    const data = await getCompletePayload(url);
    
    if (data.success) {
      console.log('🎉 Complete payload extraction successful!');
      console.log(`📊 Total threads: ${data.threads.length}`);
      console.log(`💬 Total messages: ${data.threads.reduce((sum, thread) => sum + thread.comments.length, 0)}`);
      console.log(`📸 Total screenshots: ${data.totalScreenshots}`);
      
      // Log summary of each thread with image info
      data.threads.forEach((thread, index) => {
        console.log(`📁 Thread ${index + 1}: "${thread.threadName}" (${thread.comments.length} comments) - Image: ${thread.imageFilename}`);
      });
      
      // Return the complete JSON response
      console.log('\n📄 Complete JSON Response:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.error('💥 Complete payload extraction failed:', data.error);
    }
    
    return data;
    
  } catch (error) {
    console.error('💥 Script execution failed:', error);
    process.exit(1);
  }
}

// Run the scraper
if (require.main === module) {
  main();
}

module.exports = {
  scrapeMarkupThreads,
  scrapeWithRetry,
  getCompletePayload,
  extractThreadDataFromPage,
  takeScreenshotsFromPage
};