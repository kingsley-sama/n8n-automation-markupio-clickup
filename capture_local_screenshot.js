const { captureMarkupScreenshots } = require('./script_integrated.js');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

async function captureScrollableImageLocally() {
  console.log('📸 Capturing scrollable image locally for preview...\n');

  const testUrl = 'https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0';
  const outputDir = './local_screenshots';

  try {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`📁 Created output directory: ${outputDir}`);
    }

    console.log(`🎯 Target URL: ${testUrl}`);
    console.log(`💾 Output Directory: ${outputDir}`);
    console.log(`🔧 Starting screenshot capture...\n`);

    // Configure capture options for local saving
    const options = {
      outputDir: outputDir,
      screenshotQuality: 100, // Max quality for local preview
      screenshotFormat: 'png', // PNG for better quality
      timeout: 120000, // 2 minutes timeout for scrollable content
      debugMode: true, // Enable debug to see what's happening
      waitForFullscreen: true,
      fullPage: true, // Ensure full page capture
      retryAttempts: 2
    };

    // Capture screenshot
    const result = await captureMarkupScreenshots(testUrl, 1, options);

    if (result.success) {
      console.log('\n✅ Screenshot capture completed successfully!');
      console.log(`📊 Project: ${result.title || 'Unknown'}`);
      console.log(`📸 Screenshots captured: ${result.numberOfImages}`);
      console.log(`⏱️  Duration: ${result.duration}s`);
      
      // Show local file paths
      console.log('\n📁 Local Files Created:');
      if (result.screenshots && result.screenshots.length > 0) {
        result.screenshots.forEach((filename, index) => {
          const fullPath = path.join(process.cwd(), outputDir, filename);
          console.log(`${index + 1}. ${fullPath}`);
          
          // Check if file actually exists
          if (fs.existsSync(fullPath)) {
            const stats = fs.statSync(fullPath);
            const fileSizeKB = (stats.size / 1024).toFixed(1);
            console.log(`   ✅ File exists: ${fileSizeKB}KB`);
          } else {
            console.log(`   ❌ File not found locally`);
          }
        });
      }

      // Show Supabase URLs if available
      if (result.supabaseUrls && result.supabaseUrls.length > 0) {
        console.log('\n🌐 Supabase URLs:');
        result.supabaseUrls.forEach((url, index) => {
          console.log(`${index + 1}. ${url}`);
        });
      }

      console.log('\n🎉 Screenshots are ready for viewing!');
      console.log(`📂 Open the folder: ${path.join(process.cwd(), outputDir)}`);
      
      return { success: true, localPaths: result.screenshots?.map(f => path.join(outputDir, f)) || [] };

    } else {
      console.error('\n❌ Screenshot capture failed:', result.error);
      return { success: false, error: result.error };
    }

  } catch (error) {
    console.error('💥 Script execution failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Helper function to list all files in output directory
function showLocalFiles() {
  const outputDir = './local_screenshots';
  
  console.log(`\n📂 Contents of ${outputDir}:`);
  
  if (!fs.existsSync(outputDir)) {
    console.log('   📭 Directory does not exist');
    return;
  }

  const files = fs.readdirSync(outputDir);
  
  if (files.length === 0) {
    console.log('   📭 Directory is empty');
    return;
  }

  files.forEach((file, index) => {
    const fullPath = path.join(outputDir, file);
    const stats = fs.statSync(fullPath);
    const fileSizeKB = (stats.size / 1024).toFixed(1);
    const modified = stats.mtime.toISOString().replace('T', ' ').substring(0, 19);
    
    console.log(`${index + 1}. ${file}`);
    console.log(`   📏 Size: ${fileSizeKB}KB`);
    console.log(`   📅 Modified: ${modified}`);
    console.log(`   📍 Path: ${fullPath}`);
  });
}

// Main execution
async function main() {
  console.log('🎬 Local Screenshot Capture for Scrollable Image\n');
  
  // Check environment
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.warn('⚠️  Supabase configuration missing - screenshots will only be saved locally');
  } else {
    console.log('✅ Supabase configuration found - screenshots will be saved locally AND uploaded');
  }

  // Show existing files first
  showLocalFiles();

  // Capture new screenshot
  const result = await captureScrollableImageLocally();

  // Show files after capture
  showLocalFiles();

  if (result.success) {
    console.log('\n🎉 Local screenshot capture completed successfully!');
    if (result.localPaths && result.localPaths.length > 0) {
      console.log('\n📸 You can now view the screenshots at:');
      result.localPaths.forEach(path => {
        console.log(`   👀 ${path}`);
      });
    }
  } else {
    console.error('\n💥 Local screenshot capture failed:', result.error);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Execution failed:', error);
    process.exit(1);
  });
}

module.exports = { captureScrollableImageLocally, showLocalFiles };