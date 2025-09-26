const puppeteer = require('puppeteer');
const SupabaseService = require('./supabase-service');
require('dotenv').config();

class MarkupScreenshotter {
  constructor(options = {}) {
    this.options = {
      // Default configuration
      numberOfImages: 1,
      timeout: parseInt(process.env.SCRAPER_TIMEOUT) || 90000, // Increased to 90 seconds
      retryAttempts: parseInt(process.env.SCRAPER_RETRY_ATTEMPTS) || 3,
      retryDelay: 2000,
      screenshotQuality: 90, // Reduced from 100 for better file size/quality balance
      screenshotFormat: 'jpeg', // Use JPEG for better compression
      fullPage: true,
      viewport: { width: 1920, height: 1080 }, // We'll adjust this dynamically if needed
      waitForFullscreen: true,
      debugMode: process.env.SCRAPER_DEBUG_MODE === 'true' || false,
      ...options
    };
    
    this.browser = null;
    this.page = null;
    this.screenshots = [];
    this.supabaseService = new SupabaseService();
    this.sessionId = null;
    this.currentUrl = null;
    this.currentTitle = null;
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const levels = {
      error: '❌',
      warn: '⚠️ ',
      info: 'ℹ️ ',
      success: '✅',
      debug: '🔍'
    };
    
    const prefix = levels[level] || 'ℹ️ ';
    const logMessage = `[${timestamp}] ${prefix} ${message}`;
    
    // Show debug messages when in debug mode, otherwise show all except debug
    if (level !== 'debug' || this.options.debugMode) {
      console.log(logMessage);
    }
    
    // Log errors to Supabase with context for manual retriggering
    if (this.supabaseService && this.sessionId && level === 'error') {
      const context = {
        url: this.currentUrl,
        title: this.currentTitle,
        numberOfImages: this.options.numberOfImages,
        options: this.options
      };
      this.supabaseService.log(level, message, null, context).catch(err => {
        console.error('Failed to log error to Supabase:', err.message);
      });
    }
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async retry(operation, description, maxAttempts = this.options.retryAttempts) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.log(`${description} (attempt ${attempt}/${maxAttempts})`);
        const result = await operation();
        this.log(`${description} - Success`, 'success');
        return result;
      } catch (error) {
        this.log(`${description} - Attempt ${attempt} failed: ${error.message}`, 'warn');
        
        if (attempt === maxAttempts) {
          this.log(`${description} - All attempts failed`, 'error');
          throw new Error(`Failed after ${maxAttempts} attempts: ${error.message}`);
        }
        
        await this.delay(this.options.retryDelay * attempt); // Exponential backoff
      }
    }
  }

  async initializeBrowser() {
    this.log('Initializing browser...');
    
    const launchOptions = {
      headless: this.options.debugMode ? false : true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-gpu',
        '--no-first-run',
        '--disable-default-apps',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    };

    this.browser = await puppeteer.launch(launchOptions);
    this.page = await this.browser.newPage();
    
    // Set viewport
    await this.page.setViewport(this.options.viewport);
    
    // Set longer timeout for navigation
    this.page.setDefaultTimeout(this.options.timeout);
    this.page.setDefaultNavigationTimeout(this.options.timeout);
    
    this.log('Browser initialized successfully', 'success');
  }



  async navigateToPage(url) {
    this.currentUrl = url;
    await this.retry(async () => {
      this.log(`Navigating to: ${url}`);
      await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: this.options.timeout
      });
      
      // Get page title
      this.currentTitle = await this.page.title();
      this.log(`Page loaded: ${this.currentTitle}`);
      
    }, 'Page navigation');
  }

  async handleOverlays() {
    this.log('Checking for overlays and popups...');
    
    const overlaySelectors = [
      'button:has-text("Accept")',
      'button:has-text("Close")',
      'button:has-text("OK")',
      '[aria-label*="close"]',
      '[aria-label*="dismiss"]',
      '.modal-close',
      '.popup-close',
      '.overlay-close'
    ];

    for (const selector of overlaySelectors) {
      try {
        await this.page.waitForSelector(selector, { timeout: 3000 });
        await this.page.click(selector);
        this.log(`Clicked overlay button: ${selector}`, 'success');
        await this.delay(1000);
      } catch (e) {
        // Continue to next selector
        if (this.options.debugMode) {
          this.log(`No overlay button found: ${selector}`, 'debug');
        }
      }
    }
  }

  async waitForImageContainer() {
    await this.retry(async () => {
      this.log('Waiting for image container...');
      await this.page.waitForSelector('.image-container', { 
        timeout: 45000, // Increased to 45 seconds
        visible: true 
      });
    }, 'Image container detection');
  }

  async waitForImagesLoad() {
    await this.retry(async () => {
      this.log('Waiting for images to load...');
      
      await this.page.evaluate(async () => {
        const images = Array.from(document.querySelectorAll('img'));
        
        if (images.length === 0) {
          throw new Error('No images found on page');
        }
        
        const loadPromises = images.map(img => {
          if (img.complete && img.naturalHeight > 0) {
            return Promise.resolve();
          }
          
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error(`Image load timeout: ${img.src?.substring(0, 100)}`));
            }, 10000);
            
            img.addEventListener('load', () => {
              clearTimeout(timeout);
              resolve();
            });
            
            img.addEventListener('error', () => {
              clearTimeout(timeout);
              reject(new Error(`Image load error: ${img.src?.substring(0, 100)}`));
            });
          });
        });
        
        await Promise.all(loadPromises);
      });
      
      // Verify images are actually loaded
      const imageStatus = await this.page.evaluate(() => {
        const images = Array.from(document.querySelectorAll('img'));
        return images.map(img => ({
          src: img.src ? img.src.substring(0, 100) : 'no src',
          loaded: img.complete && img.naturalHeight > 0,
          visible: img.offsetParent !== null,
          dimensions: `${img.naturalWidth}x${img.naturalHeight}`
        }));
      });
      
      const failedImages = imageStatus.filter(img => !img.loaded);
      if (failedImages.length > 0) {
        throw new Error(`${failedImages.length} images failed to load`);
      }
      
      this.log(`Successfully loaded ${imageStatus.length} images`, 'success');
      
    }, 'Image loading');
  }

  async enableFullscreen() {
    if (!this.options.waitForFullscreen) {
      this.log('Skipping fullscreen activation');
      return;
    }

    await this.retry(async () => {
      this.log('Attempting to enable fullscreen...');
      
      const fullscreenSelectors = [
        '.fullscreen-button',
        '.info-bar__control-icons .fullscreen-button',
        '[class*="fullscreen"]',
        '[aria-label*="fullscreen" i]',
        '[aria-label*="expand" i]',
        '[title*="fullscreen" i]',
        '[title*="expand" i]',
        'button[class*="expand"]',
        'div[role="button"][class*="fullscreen"]'
      ];
      
      let fullscreenButton = null;
      let usedSelector = null;
      
      // Try each selector until we find a visible, clickable button
      for (const selector of fullscreenSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 2000 });
          const button = await this.page.$(selector);
          
          if (button) {
            const isClickable = await this.page.evaluate(el => {
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              
              return rect.width > 0 && 
                     rect.height > 0 && 
                     style.visibility !== 'hidden' &&
                     style.display !== 'none' &&
                     !el.disabled &&
                     style.pointerEvents !== 'none';
            }, button);
            
            if (isClickable) {
              fullscreenButton = button;
              usedSelector = selector;
              this.log(`Found clickable fullscreen button: ${selector}`, 'success');
              break;
            }
          }
        } catch (e) {
          // Continue to next selector
          if (this.options.debugMode) {
            this.log(`Selector not found: ${selector}`, 'debug');
          }
        }
      }
      
      if (!fullscreenButton) {
        throw new Error('No clickable fullscreen button found');
      }
      
      // Click the fullscreen button with retry logic
      await this.page.evaluate((selector) => {
        const button = document.querySelector(selector);
        if (button) {
          button.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, usedSelector);
      
      await this.delay(500); // Wait for scroll
      
      await fullscreenButton.click();
      this.log('Fullscreen button clicked successfully', 'success');
      
      // Wait for fullscreen transition
      await this.delay(3000);
      
      // Verify fullscreen state (optional)
      const isFullscreen = await this.page.evaluate(() => {
        return document.fullscreenElement !== null || 
               document.webkitFullscreenElement !== null ||
               document.body.classList.contains('fullscreen') ||
               window.innerHeight === screen.height;
      });
      
      if (isFullscreen) {
        this.log('Fullscreen mode confirmed', 'success');
      } else {
        this.log('Fullscreen mode not detected, but continuing...', 'warn');
      }
      
    }, 'Fullscreen activation', 2); // Only retry twice for fullscreen
  }

  async takeScreenshot(filename) {
    // Use JPEG extension for better compatibility
    const jpegFilename = filename.replace(/\.png$/i, '.jpg');
    
    await this.retry(async () => {
      // Wait for any animations to complete
      await this.delay(1000);
      
      this.log('Starting full page screenshot capture...', 'info');
      
      // Get page dimensions for logging and viewport optimization
      const pageInfo = await this.page.evaluate(() => {
        return {
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth,
          documentHeight: document.documentElement.scrollHeight,
          documentWidth: document.documentElement.scrollWidth,
          bodyHeight: document.body.scrollHeight,
          bodyWidth: document.body.scrollWidth,
          currentScrollY: window.pageYOffset || document.documentElement.scrollTop
        };
      });
      
      this.log(`Page dimensions:`, 'info');
      this.log(`- Viewport: ${pageInfo.viewportWidth}x${pageInfo.viewportHeight}px`, 'info');
      this.log(`- Document: ${pageInfo.documentWidth}x${pageInfo.documentHeight}px`, 'info');
      this.log(`- Body: ${pageInfo.bodyWidth}x${pageInfo.bodyHeight}px`, 'info');
      this.log(`- Current scroll position: ${pageInfo.currentScrollY}px`, 'debug');
      
      const isLongPage = pageInfo.documentHeight > pageInfo.viewportHeight;
      this.log(`Long page detected: ${isLongPage} (${pageInfo.documentHeight}px total height)`, 'info');
      
      // For very long pages, let's try adjusting viewport to be taller
      if (isLongPage && pageInfo.documentHeight > pageInfo.viewportHeight * 2) {
        this.log('🔧 Adjusting viewport for long content capture...', 'info');
        
        // Set viewport height to be larger for better full-page capture
        const newViewportHeight = Math.min(pageInfo.documentHeight, 4000); // Cap at 4000px to avoid memory issues
        
        await this.page.setViewport({
          width: this.options.viewport.width,
          height: newViewportHeight
        });
        
        this.log(`📐 Viewport adjusted to: ${this.options.viewport.width}x${newViewportHeight}px`, 'info');
        
        // Wait for viewport adjustment
        await this.delay(2000);
      }
      
      // Use Puppeteer's built-in fullPage option - it handles scrolling automatically
      const screenshotOptions = {
        type: 'jpeg',
        quality: this.options.screenshotQuality,
        fullPage: true  // ✅ Puppeteer automatically scrolls and captures entire page
      };
      
      this.log(`Taking full page screenshot with options: ${JSON.stringify(screenshotOptions)}`, 'debug');
      
      const screenshotBuffer = await this.page.screenshot(screenshotOptions);
      
      // Verify screenshot was captured
      if (!screenshotBuffer || screenshotBuffer.length < 1000) {
        throw new Error('Screenshot buffer is too small, possible capture error');
      }
      
      // Log final results
      const fileSizeKB = (screenshotBuffer.length / 1024).toFixed(1);
      const fileSizeMB = (screenshotBuffer.length / (1024 * 1024)).toFixed(2);
      
      this.log(`✅ Full page screenshot captured successfully!`, 'success');
      this.log(`📊 File size: ${fileSizeKB}KB (${fileSizeMB}MB)`, 'info');
      
      // Store screenshot data with metadata
      this.screenshots.push({
        filename: jpegFilename,
        buffer: screenshotBuffer,
        size: screenshotBuffer.length
      });
      
    }, `Screenshot capture: ${jpegFilename}`);
    
    this.log(`🎯 Screenshot saved: ${jpegFilename}`, 'success');
  }

  async navigateToNextImage(imageIndex) {
    await this.retry(async () => {
      this.log(`Navigating to image ${imageIndex}...`);
      
      const nextButtonSelectors = [
        '.right-flipper',
        '.next-button',
        '.image-flippers .right-flipper',
        '[class*="next"]:not([class*="prev"])',
        '[class*="right"]:not([class*="left"])',
        '[aria-label*="next" i]',
        '[aria-label*="right" i]',
        '[title*="next" i]',
        '[title*="right" i]',
        'button:has-text("Next")',
        'div[role="button"]:has-text("Next")'
      ];
      
      let nextButton = null;
      let usedSelector = null;
      
      // Find clickable next button
      for (const selector of nextButtonSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 2000 });
          const button = await this.page.$(selector);
          
          if (button) {
            const isClickable = await this.page.evaluate(el => {
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              
              return rect.width > 0 && 
                     rect.height > 0 && 
                     style.visibility !== 'hidden' &&
                     style.display !== 'none' &&
                     !el.disabled &&
                     style.pointerEvents !== 'none';
            }, button);
            
            if (isClickable) {
              nextButton = button;
              usedSelector = selector;
              break;
            }
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      if (nextButton) {
        // Scroll button into view
        await this.page.evaluate((selector) => {
          const button = document.querySelector(selector);
          if (button) {
            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, usedSelector);
        
        await this.delay(500);
        await nextButton.click();
        this.log(`Successfully navigated using: ${usedSelector}`, 'success');
        
      } else {
        // Fallback to keyboard navigation
        this.log('No next button found, trying keyboard navigation...', 'warn');
        await this.page.keyboard.press('ArrowRight');
        this.log('Used keyboard navigation (ArrowRight)', 'success');
      }
      
      // Wait for navigation to complete
      await this.delay(2000);
      
      // Wait for new image to load
      await this.waitForImagesLoad();
      
    }, `Navigation to image ${imageIndex}`);
  }

  async captureMultipleImages() {
    this.log(`Starting capture of ${this.options.numberOfImages} images...`);
    
    // Capture first image (using .jpg extension)
    await this.takeScreenshot(`image_1.jpg`);
    
    // Navigate and capture remaining images
    for (let imageIndex = 2; imageIndex <= this.options.numberOfImages; imageIndex++) {
      try {
        await this.navigateToNextImage(imageIndex);
        await this.takeScreenshot(`image_${imageIndex}.jpg`);
      } catch (error) {
        this.log(`Failed to capture image ${imageIndex}: ${error.message}`, 'error');
        
        if (this.options.numberOfImages > 2) {
          this.log('Continuing with next image...', 'warn');
          continue;
        } else {
          throw error; // Re-throw if there's only one more image expected
        }
      }
    }
  }

  async generateDiagnosticInfo() {
    if (!this.options.debugMode) return;
    
    try {
      this.log('Generating diagnostic information...');
      
      const diagnosticData = await this.page.evaluate(() => {
        return {
          url: window.location.href,
          title: document.title,
          images: Array.from(document.querySelectorAll('img')).map(img => ({
            src: img.src?.substring(0, 100),
            loaded: img.complete && img.naturalHeight > 0,
            dimensions: `${img.naturalWidth}x${img.naturalHeight}`
          })),
          buttons: Array.from(document.querySelectorAll('button')).map(btn => ({
            text: btn.textContent?.trim().substring(0, 50),
            className: btn.className,
            visible: btn.offsetParent !== null
          })).filter(btn => btn.visible),
          clickableElements: Array.from(document.querySelectorAll('[onclick], [role="button"]')).map(el => ({
            tagName: el.tagName,
            className: el.className,
            text: el.textContent?.trim().substring(0, 50),
            visible: el.offsetParent !== null
          })).filter(el => el.visible)
        };
      });
      
      // Log diagnostic info to console and Supabase (via the log method)
      this.log(`Diagnostic info: ${JSON.stringify(diagnosticData, null, 2)}`, 'debug');
      
    } catch (error) {
      this.log(`Failed to generate diagnostic info: ${error.message}`, 'warn');
    }
  }

  async cleanup() {
    try {
      if (this.browser) {
        await this.browser.close();
        this.log('Browser closed successfully', 'success');
      }
    } catch (error) {
      this.log(`Error during cleanup: ${error.message}`, 'error');
    }
  }

  // Method to get screenshot metadata (useful for ClickUp integration)
  getScreenshotMetadata() {
    return this.screenshots.map((screenshot, index) => {
      return {
        filename: screenshot.filename,
        format: 'jpeg',
        quality: this.options.screenshotQuality,
        size: screenshot.size,
        sizeKB: (screenshot.size / 1024).toFixed(1)
      };
    });
  }

  async run(url) {
    const startTime = Date.now();
    
    // Initialize Supabase session
    this.sessionId = this.supabaseService.initializeSession();
    this.log(`Starting scraping session: ${this.sessionId}`);
    
    try {
      this.log(`Starting screenshot capture for ${this.options.numberOfImages} images...`);
      
      // Initialize
      await this.initializeBrowser();
      
      // Navigate and prepare page
      await this.navigateToPage(url);
      await this.handleOverlays();
      await this.waitForImageContainer();
      await this.waitForImagesLoad();
      await this.enableFullscreen();
      
      // Additional wait for everything to settle
      await this.delay(2000);
      
      // Capture images
      await this.captureMultipleImages();
      
      // Generate diagnostic info if in debug mode
      await this.generateDiagnosticInfo();
      
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      this.log(`✅ Successfully captured ${this.screenshots.length} screenshots in ${duration}s`, 'success');
      this.log(`Screenshots captured and ready for Supabase upload`, 'info');
      
      const result = {
        success: true,
        url: this.currentUrl,
        title: this.currentTitle,
        numberOfImages: this.screenshots.length,
        screenshots: this.screenshots.map(s => s.filename), // Return filenames for compatibility
        metadata: this.getScreenshotMetadata(),
        duration: parseFloat(duration),
        options: this.options,
        message: `Successfully captured ${this.screenshots.length} images`,
        supabaseUrls: [] // Will be populated after Supabase upload
      };

      // Save successful scraping data to Supabase and get URLs
      try {
        const supabaseResult = await this.supabaseService.saveScrapedData({
          ...result,
          screenshotBuffers: this.screenshots
        });
        result.supabaseUrls = supabaseResult.uploadedUrls || [];
        result.sessionId = this.sessionId;
        this.log('Scraping data saved to Supabase successfully', 'success');
      } catch (dbError) {
        this.log(`Failed to save to Supabase: ${dbError.message}`, 'error');
        // Don't fail the entire operation if database save fails
      }
      
      return result;
      
    } catch (error) {
      this.log(`❌ Screenshot capture failed: ${error.message}`, 'error');
      
      const result = {
        success: false,
        url: this.currentUrl,
        title: this.currentTitle,
        error: error.message,
        numberOfImages: 0, // No images captured on error
        screenshots: [], // No screenshots on error
        metadata: [], // No metadata on error
        options: this.options,
        supabaseUrls: [] // Empty for failed attempts
      };

      // Save failed scraping data to Supabase (no screenshots)
      try {
        await this.supabaseService.saveFailedScraping(result);
        this.log('Failed scraping data saved to Supabase', 'info');
      } catch (dbError) {
        this.log(`Failed to save failed scraping to Supabase: ${dbError.message}`, 'error');
      }
      
      return result;
      
    } finally {
      await this.cleanup();
    }
  }
}

// Usage function for backward compatibility
async function diagnoseMarkupPage(numberOfImages = 1, options = {}) {
  const screenshotter = new MarkupScreenshotter({
    numberOfImages,
    debugMode: true, // Enable debug mode for diagnosis
    ...options
  });
  
  const url = 'https://app.markup.io/markup/bb3022bd-01f0-4ed5-8fbb-1c5da2e3bdc7';
  return await screenshotter.run(url);
}

// Production usage function
async function captureMarkupScreenshots(url, numberOfImages = 1, options = {}) {
  const screenshotter = new MarkupScreenshotter({
    numberOfImages,
    debugMode: false, // Disable debug mode for production
    ...options
  });
  
  return await screenshotter.run(url);
}

// Main execution
async function main() {
  // Check for Supabase configuration
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('❌ Supabase configuration missing. Please set up your .env file based on .env.template');
    process.exit(1);
  }

  const config = {
    numberOfImages: 2, // Change this to your desired number
    timeout: parseInt(process.env.SCRAPER_TIMEOUT) || 60000,
    retryAttempts: parseInt(process.env.SCRAPER_RETRY_ATTEMPTS) || 3,
    debugMode: process.env.SCRAPER_DEBUG_MODE === 'true' || false,
    waitForFullscreen: true,
    screenshotQuality: 90 // Optimized for ClickUp uploads
  };
  
  const url = 'https://app.markup.io/markup/bb3022bd-01f0-4ed5-8fbb-1c5da2e3bdc7';
  
  const result = await captureMarkupScreenshots(url, config.numberOfImages, config);
  
  if (result.success) {
    console.log(`\n🎉 SUCCESS: ${result.message}`);
    console.log(`� Screenshots captured: ${result.screenshots.join(', ')}`);
    console.log(`⏱️  Duration: ${result.duration}s`);
    console.log(`💾 Data saved to Supabase with session ID: ${result.sessionId || 'Unknown'}`);
    
    // Display metadata useful for ClickUp integration
    result.metadata.forEach((meta, index) => {
      console.log(`📷 Image ${index + 1}: ${meta.filename} (${meta.format}, quality: ${meta.quality}, size: ${meta.sizeKB}KB)`);
    });
  } else {
    console.error(`\n💥 FAILED: ${result.error}`);
    if (result.screenshots.length > 0) {
      console.log(`� Partial screenshots captured: ${result.screenshots.join(', ')}`);
    }
    console.log(`💾 Error details saved to Supabase`);
    process.exit(1);
  }
}

// Export for use as module
module.exports = { captureMarkupScreenshots, diagnoseMarkupPage, MarkupScreenshotter };

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
