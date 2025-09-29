const express = require('express');
const { captureMarkupScreenshots, diagnoseMarkupPage } = require('./script_integrated');
const { getCompletePayload } = require('./getpayload');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Add CORS if needed
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'markup-screenshot-payload-extractor'
  });
});

// Optimized endpoint for complete payload extraction with screenshots (single browser session)
app.post('/complete-payload', async (req, res) => {
  try {
    const {
      url,
      options = {}
    } = req.body;

    // Validate required parameters
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: url',
        message: 'Please provide a markup.io URL to extract payload from'
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (urlError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format',
        message: 'Please provide a valid URL (including http:// or https://)'
      });
    }

    // Set reasonable defaults
    const payloadOptions = {
      screenshotQuality: 90,
      debugMode: process.env.SCRAPER_DEBUG_MODE === 'true' || false,
      ...options
    };

    console.log(`🎬 Starting optimized complete payload extraction for: ${url}`);
    
    // Execute optimized payload extraction (single browser session)
    const result = await getCompletePayload(url, payloadOptions);
    
    // Return appropriate response
    if (result.success) {
      console.log(`✅ Complete payload extraction completed successfully`);
      
      // Enhanced message with URL checking info
      let message = `Successfully extracted ${result.totalThreads || result.threads?.length || 0} threads with ${result.totalScreenshots || 0} screenshots`;
      if (result.supabaseOperation === 'updated') {
        message += ` (Updated existing record, replaced ${result.oldImagesDeleted || 0} old images)`;
      } else if (result.supabaseOperation === 'created') {
        message += ` (Created new record)`;
      }
      
      res.status(200).json({
        success: true,
        data: result,
        message: message,
        supabaseOperation: result.supabaseOperation || 'unknown',
        oldImagesDeleted: result.oldImagesDeleted || 0,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error(`❌ Complete payload extraction failed: ${result.error}`);
      res.status(500).json({
        success: false,
        error: result.error,
        data: result,
        message: 'Complete payload extraction failed',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error occurred',
      timestamp: new Date().toISOString()
    });
  }
});

// Main screenshot endpoint - POST for data, GET for simple usage
app.post('/capture', async (req, res) => {
  try {
    const {
      url,
      numberOfImages = 1,
      options = {}
    } = req.body;

    // Validate required parameters
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: url',
        message: 'Please provide a URL to capture screenshots from'
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (urlError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format',
        message: 'Please provide a valid URL (including http:// or https://)'
      });
    }

    // Validate numberOfImages
    const numImages = parseInt(numberOfImages);
    if (isNaN(numImages) || numImages < 1 || numImages > 10) {
      return res.status(400).json({
        success: false,
        error: 'Invalid numberOfImages',
        message: 'numberOfImages must be a number between 1 and 10'
      });
    }

    // Set reasonable defaults and merge options
    const captureOptions = {
      outputDir: process.env.SCRAPER_OUTPUT_DIR || './screenshots',
      timeout: parseInt(process.env.SCRAPER_TIMEOUT) || 60000,
      retryAttempts: parseInt(process.env.SCRAPER_RETRY_ATTEMPTS) || 3,
      debugMode: process.env.SCRAPER_DEBUG_MODE === 'true' || false,
      waitForFullscreen: true,
      screenshotQuality: 90,
      ...options
    };

    console.log(`📸 Starting screenshot capture for: ${url} (${numImages} images)`);
    
    // Execute screenshot capture
    const result = await captureMarkupScreenshots(url, numImages, captureOptions);
    
    // Return appropriate response
    if (result.success) {
      console.log(`✅ Screenshot capture completed successfully`);
      
      // Enhanced message with URL checking info
      let message = `Successfully captured ${result.numberOfImages} screenshots`;
      if (result.supabaseOperation === 'updated') {
        message += ` (Updated existing record, replaced ${result.oldImagesDeleted || 0} old images)`;
      } else if (result.supabaseOperation === 'created') {
        message += ` (Created new record)`;
      }
      
      res.status(200).json({
        success: true,
        data: result,
        message: message,
        supabaseOperation: result.supabaseOperation || 'unknown',
        oldImagesDeleted: result.oldImagesDeleted || 0,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error(`❌ Screenshot capture failed: ${result.error}`);
      res.status(500).json({
        success: false,
        error: result.error,
        data: result,
        message: 'Screenshot capture failed',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error occurred',
      timestamp: new Date().toISOString()
    });
  }
});

// Simple GET endpoint for quick testing
app.get('/capture', async (req, res) => {
  try {
    const {
      url,
      numberOfImages = '1',
      debug = 'false'
    } = req.query;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: url',
        message: 'Usage: /capture?url=https://example.com&numberOfImages=1&debug=false'
      });
    }

    const options = {
      debugMode: debug === 'true',
      outputDir: process.env.SCRAPER_OUTPUT_DIR || './screenshots',
      timeout: parseInt(process.env.SCRAPER_TIMEOUT) || 60000,
      retryAttempts: parseInt(process.env.SCRAPER_RETRY_ATTEMPTS) || 3,
      waitForFullscreen: true,
      screenshotQuality: 90
    };

    console.log(`📸 GET request - Starting screenshot capture for: ${url}`);
    
    const result = await captureMarkupScreenshots(url, parseInt(numberOfImages), options);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        data: result,
        message: `Successfully captured ${result.numberOfImages} screenshots`,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        data: result,
        message: 'Screenshot capture failed',
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Internal server error occurred',
      timestamp: new Date().toISOString()
    });
  }
});

// Diagnosis endpoint for debugging
app.post('/diagnose', async (req, res) => {
  try {
    const { numberOfImages = 1, options = {} } = req.body;

    const diagOptions = {
      debugMode: true,
      outputDir: process.env.SCRAPER_OUTPUT_DIR || './screenshots',
      timeout: parseInt(process.env.SCRAPER_TIMEOUT) || 60000,
      retryAttempts: parseInt(process.env.SCRAPER_RETRY_ATTEMPTS) || 3,
      waitForFullscreen: true,
      screenshotQuality: 90,
      ...options
    };

    console.log(`🔍 Starting diagnostic capture...`);
    
    const result = await diagnoseMarkupPage(parseInt(numberOfImages), diagOptions);
    
    res.status(200).json({
      success: true,
      data: result,
      message: 'Diagnostic capture completed',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Diagnosis error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Diagnosis failed',
      timestamp: new Date().toISOString()
    });
  }
});

// API documentation endpoint
app.get('/', (req, res) => {
  const docs = {
    service: 'Markup.io Screenshot & Payload Extractor API',
    version: '2.0.0',
    endpoints: {
      'GET /health': 'Health check endpoint',
      'GET /capture': 'Simple screenshot capture via query parameters',
      'POST /capture': 'Advanced screenshot capture with JSON payload',
      'POST /complete-payload': '🚀 OPTIMIZED: Extract threads + screenshots in single browser session',
      'POST /diagnose': 'Run diagnostic capture with debug information',
      'GET /': 'This documentation'
    },
    examples: {
      'Complete Payload (RECOMMENDED)': {
        endpoint: 'POST /complete-payload',
        body: {
          url: 'https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0',
          options: {
            screenshotQuality: 90,
            debugMode: false
          }
        },
        description: 'Extracts thread data and captures screenshots in one optimized request'
      },
      'Simple GET request': '/capture?url=https://app.markup.io/markup/bb3022bd-01f0-4ed5-8fbb-1c5da2e3bdc7&numberOfImages=2',
      'POST request': {
        url: 'https://app.markup.io/markup/bb3022bd-01f0-4ed5-8fbb-1c5da2e3bdc7',
        numberOfImages: 2,
        options: {
          debugMode: false,
          screenshotQuality: 90,
          waitForFullscreen: true
        }
      }
    },
    environment: {
      port: PORT,
      nodeEnv: process.env.NODE_ENV || 'development'
    },
    features: {
      'Single Browser Session': 'Optimized /complete-payload endpoint uses one browser for both operations',
      'Dynamic URLs': 'All URLs are dynamic - no hardcoded values',
      'Dynamic Screenshot Count': 'Screenshot count automatically matches thread count',
      'Local File Saving': 'Screenshots saved locally for debugging',
      'Supabase Integration': 'Automatic upload to Supabase storage'
    }
  };

  res.json(docs);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    availableEndpoints: ['/', '/health', '/capture', '/diagnose'],
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Markup.io Screenshot & Payload Extractor API server running on port ${PORT}`);
  console.log(`📋 Documentation available at: http://localhost:${PORT}/`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
  console.log(`📸 Screenshot endpoint: http://localhost:${PORT}/capture`);
  console.log(`🎯 OPTIMIZED Complete payload: http://localhost:${PORT}/complete-payload`);
  console.log('');
  console.log('🚀 NEW OPTIMIZED ENDPOINT (RECOMMENDED):');
  console.log(`curl -X POST http://localhost:${PORT}/complete-payload \\`);
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"url":"https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0"}\'');
  console.log('');
  console.log('Features:');
  console.log('✅ Single browser session (faster)');
  console.log('✅ Dynamic URLs (no hardcoding)');
  console.log('✅ Auto screenshot count = thread count');
  console.log('✅ Local file saving + Supabase upload');
  console.log('');
});

module.exports = app;
