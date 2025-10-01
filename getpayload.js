const puppeteer = require('puppeteer');
const { MarkupScreenshotter } = require('./db_helper.js');
const SupabaseService = require('./supabase-service.js');

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

  const threads = await page.evaluate(() => {
    const threadsByName = {};
    const threadList = document.querySelector('div.thread-list');
    if (!threadList) return threadsByName;
    
    let threadGroups = threadList.querySelectorAll(':scope > div.thread-list-group');
    if (threadGroups.length === 0) {
      threadGroups = document.querySelectorAll('div.thread-list-group');
    }
    
    threadGroups.forEach((group, groupIndex) => {
      try {
        const nameElement = group.querySelector('span.thread-list-item-group-header-label');
        const threadName = nameElement ? nameElement.textContent.trim() : `Thread ${groupIndex + 1}`;
        
        if (!threadName) return;
        if (!threadsByName[threadName]) threadsByName[threadName] = [];

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
            const contentSelectors = ['div.message-text p', '.message-content', '.comment-text', 'p'];
            for (const selector of contentSelectors) {
              const contentElement = messageEl.querySelector(selector);
              if (contentElement && contentElement.textContent.trim()) {
                messageContent = contentElement.textContent.trim();
                break;
              }
            }
            
            let userName = '';
            const authorSelectors = ['span.message-author', '.author-name', '.user-name'];
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
            console.warn('Error processing message:', msgError);
          }
        });
      } catch (groupError) {
        console.warn('Error processing thread group:', groupError);
      }
    });
    return threadsByName;
  });

  return {
    projectName: projectName || "Unknown Project",
    threads: Object.keys(threads).map(threadName => ({
      threadName: threadName,
      comments: threads[threadName]
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

async function takeScreenshotsFromPage(existingPage, url, numberOfImages, options = {}) {
  const startTime = Date.now();
  
  try {
    const screenshotter = new MarkupScreenshotter({
      numberOfImages: numberOfImages,
      debugMode: options.debugMode || false,
      screenshotQuality: options.screenshotQuality || 90,
      timeout: options.timeout || 90000,
      retryAttempts: options.retryAttempts || 3
    });
    
    screenshotter.page = existingPage;
    screenshotter.browser = existingPage.browser();
    screenshotter.currentUrl = url;
    screenshotter.sessionId = screenshotter.supabaseService.initializeSession();
    screenshotter.currentTitle = await existingPage.title();
    
    await existingPage.setViewport(screenshotter.options.viewport);
    existingPage.setDefaultTimeout(screenshotter.options.timeout);
    existingPage.setDefaultNavigationTimeout(screenshotter.options.timeout);
    
    await screenshotter.handleOverlays();
    await screenshotter.waitForImageContainer();
    await screenshotter.waitForImagesLoad();
    await screenshotter.enableFullscreen();
    await screenshotter.delay(2000);
    await screenshotter.captureMultipleImages();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    return {
      success: true,
      screenshots: screenshotter.screenshots,
      screenshotBuffers: screenshotter.screenshots,
      duration: parseFloat(duration)
    };
  } catch (error) {
    console.error(`Screenshot capture failed: ${error.message}`);
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
    const threadData = await extractThreadDataFromPage(page);
    
    const numberOfImages = threadData.threads.length;
    console.log(`📸 Taking ${numberOfImages} screenshots...`);
    
    const screenshotResult = await takeScreenshotsFromPage(page, url, numberOfImages, {
      screenshotQuality: options.screenshotQuality || 90,
      debugMode: options.debugMode || false
    });
    
    if (!screenshotResult.success) {
      throw new Error(`Screenshot capture failed: ${screenshotResult.error}`);
    }
    
    console.log('💾 Saving to normalized database structure...');
    const supabaseService = new SupabaseService();
    const sessionId = supabaseService.initializeSession();
    
    const threadsWithScreenshots = threadData.threads.map((thread, index) => ({
      ...thread,
      imageIndex: index + 1,
      imageFilename: `thread_${index + 1}.jpg`,
      screenshotBuffer: screenshotResult.screenshotBuffers[index]?.buffer || null
    }));
    
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

    const supabaseResult = await supabaseService.saveCompletePayloadNormalized(payloadToSave);
    
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