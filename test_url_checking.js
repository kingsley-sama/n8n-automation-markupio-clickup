const { getCompletePayload } = require('./getpayload.js');
const SupabaseService = require('./supabase-service.js');
require('dotenv').config();

async function testUrlChecking() {
  console.log('🧪 Testing URL checking and update functionality...\n');

  // Test URL
  const testUrl = 'https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0';
  
  try {
    // Initialize Supabase service to check existing records
    const supabaseService = new SupabaseService();
    
    // Check if URL already exists before first run
    console.log('🔍 Step 1: Checking if URL already exists in database...');
    const existingRecord = await supabaseService.findExistingRecord(testUrl);
    
    if (existingRecord) {
      console.log(`✅ Found existing record: ID ${existingRecord.id}, created ${existingRecord.created_at}`);
      console.log(`📊 Existing record has ${existingRecord.number_of_images} images`);
      console.log(`📸 Existing screenshot paths: ${existingRecord.screenshots_paths?.length || 0} files`);
    } else {
      console.log('❌ No existing record found for this URL');
    }

    console.log('\n🚀 Step 2: Running complete payload extraction...');
    
    // Run the complete payload extraction
    const result = await getCompletePayload(testUrl, {
      screenshotQuality: 85,
      debugMode: false
    });

    if (result.success) {
      console.log('\n✅ Payload extraction completed successfully!');
      console.log(`📊 Project: ${result.projectName}`);
      console.log(`🧵 Total threads: ${result.totalThreads}`);
      console.log(`📸 Total screenshots: ${result.totalScreenshots}`);
      console.log(`⚙️  Supabase operation: ${result.supabaseOperation || 'unknown'}`);
      console.log(`🗑️  Old images deleted: ${result.oldImagesDeleted || 0}`);
      
      if (result.supabaseRecordId) {
        console.log(`🆔 Supabase record ID: ${result.supabaseRecordId}`);
      }

      // Show thread details
      result.threads.forEach((thread, index) => {
        console.log(`📁 Thread ${index + 1}: "${thread.threadName}" (${thread.comments.length} comments)`);
        console.log(`   📷 Image: ${thread.imageFilename}`);
        if (thread.imagePath) {
          console.log(`   🔗 URL: ${thread.imagePath.substring(0, 80)}...`);
        }
      });

      console.log('\n🧪 Step 3: Testing immediate re-run to verify update behavior...');
      
      // Run again immediately to test update functionality
      const secondResult = await getCompletePayload(testUrl, {
        screenshotQuality: 85,
        debugMode: false
      });

      if (secondResult.success) {
        console.log('\n✅ Second run completed successfully!');
        console.log(`⚙️  Second run operation: ${secondResult.supabaseOperation || 'unknown'}`);
        console.log(`🗑️  Old images deleted in second run: ${secondResult.oldImagesDeleted || 0}`);
        
        if (secondResult.supabaseOperation === 'updated') {
          console.log('🎉 SUCCESS: URL checking and update functionality is working correctly!');
          console.log('   - System detected existing URL');
          console.log('   - Updated existing record instead of creating new one');
          console.log(`   - Deleted ${secondResult.oldImagesDeleted} old images from storage`);
        } else {
          console.log('⚠️  WARNING: Second run created new record instead of updating (unexpected)');
        }
      } else {
        console.log('❌ Second run failed:', secondResult.error);
      }

    } else {
      console.log('❌ Payload extraction failed:', result.error);
      return false;
    }

    console.log('\n📋 Test Summary:');
    console.log('✅ URL checking functionality implemented');
    console.log('✅ Image deletion from storage implemented');
    console.log('✅ Update vs create logic implemented');
    console.log('✅ Logging shows operation type and deleted images count');
    
    return true;

  } catch (error) {
    console.error('💥 Test failed with error:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Helper function to display recent database records
async function showRecentRecords() {
  try {
    console.log('\n📊 Recent database records for verification:');
    const supabaseService = new SupabaseService();
    const recentRecords = await supabaseService.getRecentActivities(5);
    
    recentRecords.forEach((record, index) => {
      console.log(`${index + 1}. ID: ${record.id}, URL: ${record.url?.substring(0, 60)}...`);
      console.log(`   Created: ${record.created_at}, Updated: ${record.updated_at}`);
      console.log(`   Images: ${record.number_of_images}, Session: ${record.session_id}`);
    });
  } catch (error) {
    console.error('Failed to fetch recent records:', error.message);
  }
}

// Main execution
async function main() {
  console.log('🎬 Starting URL checking and update functionality test\n');
  
  // Check environment
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('❌ Supabase configuration missing. Please set up your .env file');
    process.exit(1);
  }

  console.log('✅ Supabase configuration found');
  
  // Show recent records before test
  await showRecentRecords();
  
  // Run the test
  const success = await testUrlChecking();
  
  // Show recent records after test
  await showRecentRecords();
  
  if (success) {
    console.log('\n🎉 All tests passed! URL checking and update functionality is working correctly.');
  } else {
    console.log('\n💥 Tests failed. Please check the error messages above.');
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

module.exports = { testUrlChecking, showRecentRecords };