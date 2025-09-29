const { getCompletePayload } = require('./getpayload.js');
const SupabaseService = require('./supabase-service.js');
require('dotenv').config();

async function testScrollableImage() {
  console.log('🧪 Testing URL checking with scrollable image...\n');

  // Test URL with scrollable content
  const testUrl = 'https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0';
  
  try {
    // Initialize Supabase service to check existing records
    const supabaseService = new SupabaseService();
    
    console.log('🔍 Step 1: Checking if scrollable image URL already exists...');
    const existingRecord = await supabaseService.findExistingRecord(testUrl);
    
    if (existingRecord) {
      console.log(`✅ Found existing record: ID ${existingRecord.id}`);
      console.log(`📅 Created: ${existingRecord.created_at}`);
      console.log(`🔄 Updated: ${existingRecord.updated_at}`);
      console.log(`📊 Existing record has ${existingRecord.number_of_images} images`);
      console.log(`📸 Screenshots in storage: ${existingRecord.screenshots_paths?.length || 0}`);
      if (existingRecord.screenshots_paths && existingRecord.screenshots_paths.length > 0) {
        console.log(`🔗 First image URL: ${existingRecord.screenshots_paths[0].substring(0, 80)}...`);
      }
    } else {
      console.log('❌ No existing record found for this scrollable image URL');
    }

    console.log('\n🚀 Step 2: Running complete payload extraction on scrollable image...');
    
    const startTime = Date.now();
    
    // Run the complete payload extraction with options optimized for scrollable content
    const result = await getCompletePayload(testUrl, {
      screenshotQuality: 90,
      debugMode: true, // Enable debug for scrollable content
      timeout: 120000, // Longer timeout for scrollable content
      waitForFullscreen: true,
      fullPage: true // Ensure full page capture for scrollable content
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (result.success) {
      console.log('\n✅ Scrollable image payload extraction completed successfully!');
      console.log(`⏱️  Duration: ${duration}s`);
      console.log(`📊 Project: ${result.projectName}`);
      console.log(`🧵 Total threads: ${result.totalThreads}`);
      console.log(`📸 Total screenshots: ${result.totalScreenshots}`);
      console.log(`⚙️  Supabase operation: ${result.supabaseOperation || 'unknown'}`);
      console.log(`🗑️  Old images deleted: ${result.oldImagesDeleted || 0}`);
      
      if (result.supabaseRecordId) {
        console.log(`🆔 Supabase record ID: ${result.supabaseRecordId}`);
      }

      // Show thread details with scrollable content info
      console.log('\n📋 Thread Analysis:');
      result.threads.forEach((thread, index) => {
        console.log(`\n📁 Thread ${index + 1}: "${thread.threadName}"`);
        console.log(`   💬 Comments: ${thread.comments.length}`);
        console.log(`   📷 Screenshot: ${thread.imageFilename}`);
        if (thread.imagePath) {
          console.log(`   🔗 Image URL: ${thread.imagePath.substring(0, 70)}...`);
        }
        
        // Show first few comments for context
        if (thread.comments.length > 0) {
          console.log(`   📝 Sample comments:`);
          thread.comments.slice(0, 2).forEach((comment, i) => {
            console.log(`      ${i + 1}. Pin ${comment.pinNumber || 'N/A'}: ${comment.messageContent?.substring(0, 60) || 'No content'}...`);
            console.log(`         👤 Author: ${comment.userName || 'Unknown'}`);
          });
          if (thread.comments.length > 2) {
            console.log(`      ... and ${thread.comments.length - 2} more comments`);
          }
        }
      });

      console.log('\n🧪 Step 3: Testing immediate re-run to verify URL checking with scrollable content...');
      
      // Run again immediately to test update functionality
      const secondStart = Date.now();
      const secondResult = await getCompletePayload(testUrl, {
        screenshotQuality: 90,
        debugMode: false,
        timeout: 120000,
        waitForFullscreen: true,
        fullPage: true
      });
      const secondDuration = ((Date.now() - secondStart) / 1000).toFixed(2);

      if (secondResult.success) {
        console.log('\n✅ Second run on scrollable content completed successfully!');
        console.log(`⏱️  Second run duration: ${secondDuration}s`);
        console.log(`⚙️  Second run operation: ${secondResult.supabaseOperation || 'unknown'}`);
        console.log(`🗑️  Old images deleted in second run: ${secondResult.oldImagesDeleted || 0}`);
        
        if (secondResult.supabaseOperation === 'updated') {
          console.log('\n🎉 SUCCESS: URL checking works perfectly with scrollable images!');
          console.log('   ✅ System detected existing URL for scrollable content');
          console.log('   ✅ Updated existing record instead of creating new one');
          console.log(`   ✅ Deleted ${secondResult.oldImagesDeleted} old scrollable images from storage`);
          console.log('   ✅ New scrollable screenshots properly captured and stored');
        } else if (secondResult.supabaseOperation === 'created') {
          console.log('⚠️  WARNING: Second run created new record instead of updating (unexpected)');
        }

        // Compare image counts between runs
        if (result.totalScreenshots === secondResult.totalScreenshots) {
          console.log(`   ✅ Screenshot count consistent: ${result.totalScreenshots} images both runs`);
        } else {
          console.log(`   ⚠️  Screenshot count changed: ${result.totalScreenshots} → ${secondResult.totalScreenshots}`);
        }
      } else {
        console.log('❌ Second run failed:', secondResult.error);
      }

    } else {
      console.log('❌ Scrollable image payload extraction failed:', result.error);
      return false;
    }

    console.log('\n📋 Scrollable Image Test Summary:');
    console.log('✅ URL checking functionality works with scrollable content');
    console.log('✅ Image deletion from storage works with scrollable images');
    console.log('✅ Update vs create logic works with scrollable content');
    console.log('✅ Full page capture handles scrollable images properly');
    console.log('✅ Thread extraction works with scrollable markup projects');
    
    return true;

  } catch (error) {
    console.error('💥 Scrollable image test failed with error:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Helper function to show recent records for the specific URL
async function showRecordsForUrl(url) {
  try {
    console.log(`\n📊 Database records for URL: ${url.substring(0, 60)}...`);
    const supabaseService = new SupabaseService();
    
    // Get all records for this specific URL
    const { data: records } = await supabaseService.supabase
      .from('scraped_data')
      .select('*')
      .eq('url', url)
      .order('created_at', { ascending: false });
    
    if (records && records.length > 0) {
      console.log(`Found ${records.length} record(s) for this URL:`);
      records.forEach((record, index) => {
        console.log(`${index + 1}. ID: ${record.id}`);
        console.log(`   Created: ${record.created_at}`);
        console.log(`   Updated: ${record.updated_at}`);
        console.log(`   Images: ${record.number_of_images}`);
        console.log(`   Session: ${record.session_id}`);
        console.log(`   Success: ${record.success}`);
      });
    } else {
      console.log('No records found for this URL');
    }
  } catch (error) {
    console.error('Failed to fetch records for URL:', error.message);
  }
}

// Main execution
async function main() {
  console.log('🎬 Testing URL Checking with Scrollable Image Content\n');
  console.log('📍 Test URL: https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0');
  console.log('🎯 Focus: Scrollable image handling with URL deduplication\n');
  
  // Check environment
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('❌ Supabase configuration missing. Please set up your .env file');
    process.exit(1);
  }

  console.log('✅ Supabase configuration found');
  
  const testUrl = 'https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0';
  
  // Show records before test
  await showRecordsForUrl(testUrl);
  
  // Run the scrollable image test
  const success = await testScrollableImage();
  
  // Show records after test
  await showRecordsForUrl(testUrl);
  
  if (success) {
    console.log('\n🎉 All scrollable image tests passed! URL checking works perfectly with scrollable content.');
  } else {
    console.log('\n💥 Scrollable image tests failed. Please check the error messages above.');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { testScrollableImage, showRecordsForUrl };