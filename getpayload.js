const puppeteer = require('puppeteer');
const { MarkupScreenshotter } = require('./db_helper.js');
const SupabaseService = require('./supabase-service.js');

/**
 * Collect attachments by clicking each comment's attachment indicator
 * Maps attachments to specific comments by their pin number
 */
async function collectAttachmentsFromAllThreads(page) {
  const attachmentsByThreadAndPin = {};
  
  try {
    console.log('📎 Collecting attachments from all comments...\n');
    
    // Find all thread groups
    let threadGroups = await page.$$('div.thread-list-group');
    
    for (let groupIndex = 0; groupIndex < threadGroups.length; groupIndex++) {
      const group = threadGroups[groupIndex];
      
      // Get thread name
      const nameElement = await group.$('span.thread-list-item-group-header-label');
      let threadName = nameElement 
        ? (await page.evaluate(el => el.textContent.trim(), nameElement)) 
        : `Thread ${groupIndex + 1}`;
      
      if (!threadName) continue;
      
      console.log(`   📌 Thread: ${threadName}`);
      
      // Find all comments with attachments in this thread
      const commentElements = await group.$$('div[data-thread-id]');
      
      for (let msgIndex = 0; msgIndex < commentElements.length; msgIndex++) {
        const messageEl = commentElements[msgIndex];
        
        // Check if this comment has attachments
        const attachmentContainer = await messageEl.$('.thread-list-item-attachment-count');
        
        if (!attachmentContainer) continue;
        
        // Get pin number for this comment
        let pinNumber = null;
        const pinSelectors = ['.thread-label', '.pin-label', '.label-button', '.pin-number'];
        for (const selector of pinSelectors) {
          const pinElement = await messageEl.$(selector);
          if (pinElement) {
            const pinText = await page.evaluate(el => el.textContent.trim(), pinElement);
            const extractedPin = parseInt(pinText.match(/\d+/)?.[0]);
            if (extractedPin && !isNaN(extractedPin)) {
              pinNumber = extractedPin;
              break;
            }
          }
        }
        
        if (!pinNumber) {
          console.log(`      ⚠️  Could not determine pin number for comment ${msgIndex + 1}, skipping`);
          continue;
        }
        
        console.log(`      📎 Pin ${pinNumber}: Clicking to reveal attachments...`);
        
        // Scroll into view
        await page.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), attachmentContainer);
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Click to open attachment view/sidebar
        await attachmentContainer.click();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for sidebar/modal to open
        
        // Extract attachment URLs
        const attachmentUrls = await page.evaluate(() => {
          const urls = [];
          const seen = new Set(); // Track seen URLs to avoid duplicates
          const images = document.querySelectorAll('img.associated-file-content.attachment-thumbnail');
          
          images.forEach(img => {
            let url = img.getAttribute('src');
            if (url && url.trim() && !url.startsWith('data:')) {
              // Strip query parameters
              if (url.includes('?')) {
                url = url.split('?')[0];
              }
              // Only add if not already seen
              if (!seen.has(url)) {
                seen.add(url);
                urls.push(url);
              }
            }
          });
          
          return urls;
        });
        
        if (attachmentUrls.length > 0) {
          // Initialize thread map if needed
          if (!attachmentsByThreadAndPin[threadName]) {
            attachmentsByThreadAndPin[threadName] = {};
          }
          
          attachmentsByThreadAndPin[threadName][pinNumber] = attachmentUrls;
          
          console.log(`         ✅ Found ${attachmentUrls.length} attachment(s)`);
          attachmentUrls.forEach(url => console.log(`            - ${url}`));
        } else {
          console.log(`         ℹ️  No attachment images found`);
        }
        
        // Close the sidebar/modal - press Escape to go back
        console.log(`         🔙 Closing attachment view...`);
        await page.keyboard.press('Escape');
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // We might need to refresh the element references after closing
        // Re-get the thread groups in case DOM changed
        threadGroups = await page.$$('div.thread-list-group');
      }
    }
    
    const totalThreads = Object.keys(attachmentsByThreadAndPin).length;
    const totalPins = Object.values(attachmentsByThreadAndPin).reduce((sum, thread) => sum + Object.keys(thread).length, 0);
    console.log(`\n   📊 Collected attachments from ${totalPins} comment(s) across ${totalThreads} thread(s)\n`);
    
  } catch (error) {
    console.error('   ❌ Error collecting attachments:', error.message);
  }
  
  return attachmentsByThreadAndPin;
}

async function extractThreadDataFromPage(page) {
  console.log('⏳ Waiting for thread list to load...');
  await page.waitForSelector('div.thread-list', { timeout: 30000 });

  const projectName = await page.evaluate(() => {
    const noteElement = document.querySelector('.note');
    if (noteElement) {
      const headingElement = noteElement.querySelector('p.note__heading');
      if (headingElement) return headingElement.textContent.trim();
    }
    const headingElement = document.querySelector('p.note__heading');
    return headingElement ? headingElement.textContent.trim() : null;
  });

  console.log('📂 Expanding thread list...');
  await page.evaluate(() => {
    const threadList = document.querySelector('div.thread-list');
    if (threadList) {
      const expandButton = threadList.querySelector('.expand-button, .show-all, .toggle-button, [aria-expanded="false"]');
      if (expandButton) expandButton.click();
      threadList.style.display = 'block';
      threadList.style.visibility = 'visible';
      threadList.style.maxHeight = 'none';
      threadList.style.overflow = 'visible';
    }
  });

  await new Promise(resolve => setTimeout(resolve, 2000));
  await expandAllThreadGroupsFromPage(page);

  // Collect attachments first by navigating through image sidebar
  const attachmentsByThread = await collectAttachmentsFromAllThreads(page);

  // Puppeteer-based extraction for comments
  const threadsByName = {};
  const threadListHandle = await page.$('div.thread-list');
  if (!threadListHandle) return { projectName: projectName || "Unknown Project", threads: [] };

  let threadGroups = await page.$$('div.thread-list-group');
  if (threadGroups.length === 0) {
    threadGroups = await page.$$('div.thread-list > div.thread-list-group');
  }

  for (let groupIndex = 0; groupIndex < threadGroups.length; groupIndex++) {
    const group = threadGroups[groupIndex];
    const nameElement = await group.$('span.thread-list-item-group-header-label');
    let threadName = nameElement ? (await page.evaluate(el => el.textContent.trim(), nameElement)) : `Thread ${groupIndex + 1}`;
    if (!threadName) continue;
    if (!threadsByName[threadName]) threadsByName[threadName] = [];

    const messageElements = await group.$$('div[data-thread-id]');
    let threadIndex = 1;
    for (let msgIndex = 0; msgIndex < messageElements.length; msgIndex++) {
      const messageEl = messageElements[msgIndex];
      // ... Pin number extraction ...
      let pinNumber = null;
      const pinSelectors = ['.thread-label', '.pin-label', '.label-button', '.pin-number'];
      for (const selector of pinSelectors) {
        const pinElement = await messageEl.$(selector);
        if (pinElement) {
          const pinText = await page.evaluate(el => el.textContent.trim(), pinElement);
          const extractedPin = parseInt(pinText.match(/\d+/)?.[0]);
          if (extractedPin && !isNaN(extractedPin)) {
            pinNumber = extractedPin;
            break;
          }
        }
      }
      // ... Content extraction ...
      let messageContent = '';
      const contentSelectors = ['div.message-text p', '.message-content', '.comment-text', 'p'];
      for (const selector of contentSelectors) {
        const contentElement = await messageEl.$(selector);
        if (contentElement) {
          messageContent = await page.evaluate(el => el.textContent.trim(), contentElement);
          break;
        }
      }
      // ... User extraction ...
      let userName = '';
      const authorSelectors = ['span.message-author', '.author-name', '.user-name'];
      for (const selector of authorSelectors) {
        const authorElement = await messageEl.$(selector);
        if (authorElement) {
          userName = await page.evaluate(el => el.textContent.trim(), authorElement);
          if (!userName) userName = await page.evaluate(el => el.getAttribute('title') || '', authorElement);
          if (userName) break;
        }
      }
      // Get attachments from the pre-collected map by matching thread name and pin number
      let attachmentUrls = [];
      if (attachmentsByThread[threadName] && attachmentsByThread[threadName][pinNumber || 1]) {
        attachmentUrls = attachmentsByThread[threadName][pinNumber || 1];
      }
      
      const threadId = await page.evaluate(el => el.getAttribute('data-thread-id') || el.getAttribute('data-message-id') || `${threadName}-${msgIndex + 1}`, messageEl);
      if (threadId || messageContent || userName) {
        threadsByName[threadName].push({
          id: threadId,
          index: pinNumber || threadIndex,
          pinNumber: pinNumber || threadIndex,
          content: messageContent,  // Store only the message content, not attachments
          user: userName,
          attachments: attachmentUrls  // Attachments stored separately in dedicated field
        });
        threadIndex++;
      }
    }
  }
  return {
    projectName: projectName || "Unknown Project",
    threads: Object.keys(threadsByName).map(threadName => ({
      threadName: threadName,
      comments: threadsByName[threadName]
    }))
  };
}

async function expandAllThreadGroupsFromPage(page) {
  try {
    const expandedCount = await page.evaluate(() => {
      let expandedGroups = 0;
      const toggleButtons = document.querySelectorAll('div.thread-list-item-group-header-toggle-button-container, .thread-group-toggle');
      
      toggleButtons.forEach((button, index) => {
        try {
          const svg = button.querySelector('svg');
          const isCollapsed = svg && (svg.classList.contains('collapsed') || !svg.classList.contains('open'));
          if (isCollapsed || button.getAttribute('aria-expanded') === 'false') {
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
  } catch (error) {
    console.warn('Could not expand thread groups:', error);
  }
}

async function takeScreenshotsFromPage(existingPage, url, numberOfImages, threadNames = null, options = {}) {
  const startTime = Date.now();
  const supabaseService = new SupabaseService();
  const sessionId = supabaseService.initializeSession();
  
  try {
    const screenshotter = new MarkupScreenshotter({
      numberOfImages: numberOfImages,
      threadNames: threadNames, // Pass thread names for smart matching
      debugMode: options.debugMode || false,
      screenshotQuality: options.screenshotQuality || 90,
      timeout: options.timeout || 90000,
      retryAttempts: options.retryAttempts || 3
    });
    
    screenshotter.page = existingPage;
    screenshotter.browser = existingPage.browser();
    screenshotter.currentUrl = url;
    screenshotter.sessionId = sessionId;
    screenshotter.currentTitle = await existingPage.title();
    
    await existingPage.setViewport(screenshotter.options.viewport);
    existingPage.setDefaultTimeout(screenshotter.options.timeout);
    existingPage.setDefaultNavigationTimeout(screenshotter.options.timeout);
    
    try {
      await screenshotter.handleOverlays();
    } catch (error) {
      const errorMsg = `Failed to handle overlays: ${error.message}`;
      console.warn(`⚠️  ${errorMsg}`);
      await supabaseService.log('error', errorMsg, error, {
        url: url,
        operation: 'handleOverlays',
        sessionId: sessionId,
        stack: error.stack
      });
      // Continue anyway
    }
    
    await screenshotter.waitForImageContainer();
    await screenshotter.waitForImagesLoad();
    
    try {
      await screenshotter.enableFullscreen();
    } catch (error) {
      const errorMsg = `Failed to enable fullscreen (continuing anyway): ${error.message}`;
      console.warn(`⚠️  ${errorMsg}`);
      await supabaseService.log('error', errorMsg, error, {
        url: url,
        operation: 'enableFullscreen',
        sessionId: sessionId,
        stack: error.stack
      });
      // Continue anyway
    }
    
    await screenshotter.delay(2000);
    
    // Use smart capture if thread names provided, otherwise sequential
    if (threadNames && threadNames.length > 0) {
      console.log(`📸 Using smart capture with ${threadNames.length} thread names`);
      try {
        await screenshotter.captureImagesMatchingThreads(threadNames);
      } catch (error) {
        const errorMsg = `Smart capture failed: ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        await supabaseService.log('error', errorMsg, error, {
          url: url,
          operation: 'captureImagesMatchingThreads',
          sessionId: sessionId,
          threadNames: threadNames,
          capturedCount: screenshotter.screenshots.length,
          stack: error.stack
        });
        throw error; // Re-throw to fail the operation
      }
    } else {
      console.log(`📸 Using sequential capture (no thread names)`);
      try {
        await screenshotter.captureMultipleImages();
      } catch (error) {
        const errorMsg = `Sequential capture failed: ${error.message}`;
        console.error(`❌ ${errorMsg}`);
        await supabaseService.log('error', errorMsg, error, {
          url: url,
          operation: 'captureMultipleImages',
          sessionId: sessionId,
          numberOfImages: numberOfImages,
          capturedCount: screenshotter.screenshots.length,
          stack: error.stack
        });
        throw error; // Re-throw to fail the operation
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    return {
      success: true,
      screenshots: screenshotter.screenshots,
      screenshotBuffers: screenshotter.screenshots,
      duration: parseFloat(duration)
    };
  } catch (error) {
    const errorMsg = `Screenshot capture failed: ${error.message}`;
    console.error(errorMsg);
    
    // Log final error
    await supabaseService.log('error', errorMsg, error, {
      url: url,
      operation: 'takeScreenshotsFromPage - fatal',
      sessionId: sessionId,
      numberOfImages: numberOfImages,
      threadNames: threadNames,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message,
      screenshots: [],
      screenshotBuffers: []
    };
  }
}

async function getCompletePayload(url, options = {}) {
  console.log('🎬 Starting optimized payload extraction...');
  const startTime = Date.now();
  
  if (!url) throw new Error('URL is required');
  
  let browser = null;
  const supabaseService = new SupabaseService();
  const sessionId = supabaseService.initializeSession();
  
  try {
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
    await page.setViewport({ width: 1920, height: 1080 });
    page.setDefaultTimeout(80000);
    page.setDefaultNavigationTimeout(80000);
    
    console.log(`🌐 Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 80000 });
    
    console.log('📝 Extracting thread data...');
    let threadData;
    try {
      threadData = await extractThreadDataFromPage(page);
    } catch (error) {
      const errorMsg = `Failed to extract thread data: ${error.message}`;
      console.error(`❌ ${errorMsg}`);
      
      // Log thread extraction error
      await supabaseService.log('error', errorMsg, error, {
        url: url,
        operation: 'extractThreadDataFromPage',
        sessionId: sessionId,
        stack: error.stack
      });
      
      throw new Error(errorMsg);
    }
    
    const numberOfImages = threadData.threads.length;
    
    // Extract thread names for smart matching
    const threadNames = threadData.threads.map(thread => thread.threadName);
    console.log(`📋 Thread names extracted: ${threadNames.join(', ')}`);
    
    console.log(`📸 Taking ${numberOfImages} screenshots with smart matching...`);
    
    let screenshotResult;
    try {
      screenshotResult = await takeScreenshotsFromPage(page, url, numberOfImages, threadNames, {
        screenshotQuality: options.screenshotQuality || 90,
        debugMode: options.debugMode || false
      });
      
      if (!screenshotResult.success) {
        throw new Error(`Screenshot capture failed: ${screenshotResult.error}`);
      }
    } catch (error) {
      const errorMsg = `Screenshot capture failed during smart matching: ${error.message}`;
      console.error(`❌ ${errorMsg}`);
      
      // Log screenshot capture error
      await supabaseService.log('error', errorMsg, error, {
        url: url,
        operation: 'takeScreenshotsFromPage - smart matching',
        sessionId: sessionId,
        numberOfImages: numberOfImages,
        threadNames: threadNames,
        stack: error.stack
      });
      
      throw new Error(errorMsg);
    }
    
    console.log('💾 Saving to normalized database structure...');
    

    // Translate all comment contents asynchronously before saving
    const { translateCommentToEnglish } = require('./translator.js');
    let threadsWithScreenshots;
    
    try {
      console.log('🌐 Translating comments from German to English...');
      
      // Process threads sequentially to avoid rate limiting
      threadsWithScreenshots = [];
      for (let index = 0; index < threadData.threads.length; index++) {
        const thread = threadData.threads[index];
        
        // Translate comments one at a time with small delay
        const translatedComments = [];
        for (const comment of (thread.comments || [])) {
          const translatedContent = await translateCommentToEnglish(comment.content);
          translatedComments.push({ ...comment, content: translatedContent });
          
          // Small delay between translations to avoid rate limiting (100ms)
          if (translatedComments.length < thread.comments.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        threadsWithScreenshots.push({
          ...thread,
          comments: translatedComments,
          imageIndex: index + 1,
          imageFilename: `thread_${index + 1}.jpg`,
          screenshotBuffer: screenshotResult.screenshotBuffers[index]?.buffer || null
        });
      }
      
      console.log('✅ Translation completed successfully');
      
    } catch (error) {
      const errorMsg = `Translation failed: ${error.message}`;
      console.error(`❌ ${errorMsg}`);
      
      // Log translation error to database
      await supabaseService.log('error', errorMsg, error, {
        url: url,
        operation: 'translateComments',
        sessionId: sessionId,
        totalComments: threadData.threads.reduce((sum, t) => sum + (t.comments?.length || 0), 0),
        errorType: 'translation_failure',
        stack: error.stack
      });
      
      // Re-throw to stop the job and trigger retry
      throw new Error(errorMsg);
    }

    const payloadToSave = {
      success: true,
      url: url,
      projectName: threadData.projectName,
      threads: threadsWithScreenshots,
      totalThreads: threadData.threads.length,
      totalScreenshots: numberOfImages,
      timestamp: new Date().toISOString(),
      sessionId: sessionId
    };

    let supabaseResult;
    try {
      supabaseResult = await supabaseService.saveCompletePayloadNormalized(payloadToSave);
    } catch (error) {
      const errorMsg = `Failed to save payload to database: ${error.message}`;
      console.error(`❌ ${errorMsg}`);
      
      // Log database save error
      await supabaseService.log('error', errorMsg, error, {
        url: url,
        operation: 'saveCompletePayloadNormalized',
        sessionId: sessionId,
        totalThreads: threadData.threads.length,
        totalScreenshots: numberOfImages,
        stack: error.stack
      });
      
      throw new Error(errorMsg);
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Complete payload saved in ${duration}s`);
    
    return {
      success: true,
      url: url,
      projectId: supabaseResult.projectId,
      scrapedDataId: supabaseResult.scrapedDataId,
      operation: supabaseResult.operation,
      oldImagesDeleted: supabaseResult.oldImagesDeleted,
      totalThreads: supabaseResult.totalThreads,
      totalComments: supabaseResult.totalComments,
      duration: parseFloat(duration),
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Payload extraction failed:', error.message);
    
    // Log final catch-all error
    await supabaseService.log('error', `Complete payload extraction failed: ${error.message}`, error, {
      url: url,
      operation: 'getCompletePayload - fatal',
      sessionId: sessionId,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message,
      url: url,
      timestamp: new Date().toISOString()
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function main() {
  try {
    const args = process.argv.slice(2);
    const url = args[0] || process.env.MARKUP_URL || 'https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0';
    
    if (!url) {
      console.error('❌ No URL provided');
      process.exit(1);
    }
    
    const result = await getCompletePayload(url);
    
    if (result.success) {
      console.log('🎉 Extraction successful!');
      console.log(`Project ID: ${result.projectId}`);
      console.log(`Total threads: ${result.totalThreads}`);
      console.log(`Total comments: ${result.totalComments}`);
      console.log(`Operation: ${result.operation}`);
    } else {
      console.error('💥 Extraction failed:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  getCompletePayload,
  extractThreadDataFromPage,
  takeScreenshotsFromPage
};