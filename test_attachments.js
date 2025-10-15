/**
 * Test script for attachment extraction with headed Puppeteer
 * This allows you to see the browser actions in real-time
 */

const puppeteer = require('puppeteer');

// Helper function to replace deprecated page.waitForTimeout
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
        await delay(300);
        
        // Click to open attachment view/sidebar
        await attachmentContainer.click();
        await delay(2000); // Wait for sidebar/modal to open
        
        // Extract attachment URLs
        const attachmentUrls = await page.evaluate(() => {
          const urls = [];
          const images = document.querySelectorAll('img.associated-file-content.attachment-thumbnail');
          
          images.forEach(img => {
            let url = img.getAttribute('src');
            if (url && url.trim() && !url.startsWith('data:')) {
              // Strip query parameters
              if (url.includes('?')) {
                url = url.split('?')[0];
              }
              urls.push(url);
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
        await delay(800);
        
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

async function testAttachmentExtraction(url) {
  console.log('🧪 Starting headed test for attachment extraction...');
  console.log(`🌐 URL: ${url}`);
  
  let browser = null;
  
  try {
    // Launch browser in HEADED mode with devtools open
    browser = await puppeteer.launch({
      headless: false, // Show the browser
      devtools: true,  // Open devtools automatically
      slowMo: 100,     // Slow down by 100ms to see actions
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1920,1080'
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    page.setDefaultTimeout(60000);
    
    console.log('📂 Navigating to page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    console.log('⏳ Waiting for thread list...');
    await page.waitForSelector('div.thread-list', { timeout: 30000 });
    
    // Get project name
    const projectName = await page.evaluate(() => {
      const noteElement = document.querySelector('.note');
      if (noteElement) {
        const headingElement = noteElement.querySelector('p.note__heading');
        if (headingElement) return headingElement.textContent.trim();
      }
      const headingElement = document.querySelector('p.note__heading');
      return headingElement ? headingElement.textContent.trim() : null;
    });
    console.log(`📋 Project: ${projectName}`);
    
    // Expand thread list
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
    
    await delay(2000);
    
    // Expand all thread groups
    console.log('🔽 Expanding all thread groups...');
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
    console.log(`✅ Expanded ${expandedCount} thread groups`);
    
    await delay(5000);
    
    // First, collect attachment URLs by navigating through threads
    console.log('\n📎 Collecting attachment URLs by navigating through threads...\n');
    const attachmentsByThread = await collectAttachmentsFromAllThreads(page);
    console.log(`✅ Collected attachments for ${Object.keys(attachmentsByThread).length} threads\n`);
    
    // Start extracting with Puppeteer
    console.log('\n🔍 Starting extraction with attachment detection...\n');
    
    const threadsByName = {};
    const threadListHandle = await page.$('div.thread-list');
    
    if (!threadListHandle) {
      console.error('❌ Thread list not found');
      return;
    }
    
    let threadGroups = await page.$$('div.thread-list-group');
    console.log(`📊 Found ${threadGroups.length} thread groups`);
    
    for (let groupIndex = 0; groupIndex < threadGroups.length; groupIndex++) {
      const group = threadGroups[groupIndex];
      
      // Get thread name
      const nameElement = await group.$('span.thread-list-item-group-header-label');
      let threadName = nameElement 
        ? (await page.evaluate(el => el.textContent.trim(), nameElement)) 
        : `Thread ${groupIndex + 1}`;
      
      if (!threadName) continue;
      
      console.log(`\n📌 Thread: ${threadName}`);
      threadsByName[threadName] = [];
      
      const messageElements = await group.$$('div[data-thread-id]');
      console.log(`   💬 Found ${messageElements.length} comments`);
      
      let threadIndex = 1;
      
      for (let msgIndex = 0; msgIndex < messageElements.length; msgIndex++) {
        const messageEl = messageElements[msgIndex];
        console.log(`\n   🔹 Comment ${msgIndex + 1}/${messageElements.length}`);
        
        // Extract thread ID
        const threadId = await page.evaluate(el => 
          el.getAttribute('data-thread-id') || 
          el.getAttribute('data-message-id'), 
          messageEl
        );
        console.log(`      ID: ${threadId || 'N/A'}`);
        
        // Extract pin number
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
        console.log(`      Pin: ${pinNumber || 'N/A'}`);
        
        // Extract content
        let messageContent = '';
        const contentSelectors = ['div.message-text p', '.message-content', '.comment-text', 'p'];
        for (const selector of contentSelectors) {
          const contentElement = await messageEl.$(selector);
          if (contentElement) {
            messageContent = await page.evaluate(el => el.textContent.trim(), contentElement);
            if (messageContent) break;
          }
        }
        console.log(`      Content: "${messageContent.substring(0, 50)}${messageContent.length > 50 ? '...' : ''}"`);
        
        // Extract user
        let userName = '';
        const authorSelectors = ['span.message-author', '.author-name', '.user-name'];
        for (const selector of authorSelectors) {
          const authorElement = await messageEl.$(selector);
          if (authorElement) {
            userName = await page.evaluate(el => el.textContent.trim() || el.getAttribute('title') || '', authorElement);
            if (userName) break;
          }
        }
        console.log(`      User: ${userName || 'N/A'}`);
        
        // Get attachments from the pre-collected map by matching thread name and pin number
        let attachmentUrls = [];
        if (attachmentsByThread[threadName] && attachmentsByThread[threadName][pinNumber || 1]) {
          attachmentUrls = attachmentsByThread[threadName][pinNumber || 1];
          console.log(`      📎 Using ${attachmentUrls.length} pre-collected attachment(s) for pin ${pinNumber || 1}`);
          attachmentUrls.forEach(url => console.log(`         - ${url}`));
        } else {
          console.log(`      ℹ️  No attachments for this comment (pin ${pinNumber || 'N/A'})`);
        }
        
        // Append attachment URLs to comment content
        let finalContent = messageContent;
        if (attachmentUrls.length > 0) {
          console.log(`      📎 Appending ${attachmentUrls.length} attachments to content`);
          finalContent = messageContent + '\n\n📎 Attachments:\n' + attachmentUrls.map(url => `- ${url}`).join('\n');
        }
        
        // Add to results
        threadsByName[threadName].push({
          id: threadId || `${threadName}-${msgIndex + 1}`,
          index: pinNumber || threadIndex,
          pinNumber: pinNumber || threadIndex,
          content: finalContent,
          user: userName,
          attachments: attachmentUrls  // Add attachments as separate field for database
        });
        
        threadIndex++;
        
        // Small delay between comments
        await delay(600);
      }
    }
    
    // Display results
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 EXTRACTION RESULTS');
    console.log('='.repeat(80));
    
    const threads = Object.keys(threadsByName).map(threadName => ({
      threadName: threadName,
      comments: threadsByName[threadName]
    }));
    
    console.log(`\n✅ Extracted ${threads.length} threads with ${threads.reduce((sum, t) => sum + t.comments.length, 0)} total comments\n`);
    
    threads.forEach((thread, idx) => {
      console.log(`\n${idx + 1}. Thread: ${thread.threadName} (${thread.comments.length} comments)`);
      thread.comments.forEach((comment, cidx) => {
        console.log(`   ${cidx + 1}. [Pin ${comment.pinNumber}] ${comment.user}`);
        console.log(`      ${comment.content.substring(0, 100)}${comment.content.length > 100 ? '...' : ''}`);
        if (comment.content.includes('📎 Attachments:')) {
          const attachmentCount = comment.content.split('\n📎 Attachments:\n')[1]?.split('\n').length || 0;
          console.log(`      🎉 HAS ${attachmentCount} ATTACHMENT(S)!`);
        }
      });
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Test completed! Browser will stay open for 30 seconds...');
    console.log('='.repeat(80));
    
    // Keep browser open for inspection
    await delay(30000);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) {
      console.log('\n👋 Closing browser...');
      await browser.close();
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const url = args[0] || process.env.MARKUP_URL || 'https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0';
  
  if (!url) {
    console.error('❌ Usage: node test_attachments.js <markup-url>');
    process.exit(1);
  }
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🧪 ATTACHMENT EXTRACTION TEST (HEADED MODE)                 ║
║                                                              ║
║  This test will open a browser window so you can see        ║
║  the attachment extraction process in real-time.            ║
║                                                              ║
║  Watch for:                                                  ║
║  - Clicking attachment SVG icons                             ║
║  - Extracting attachment URLs                                ║
║  - Closing attachment modals                                 ║
║  - Appending URLs to comment text                            ║
╚══════════════════════════════════════════════════════════════╝
`);
  
  await testAttachmentExtraction(url);
}

if (require.main === module) {
  main();
}

module.exports = { testAttachmentExtraction };
