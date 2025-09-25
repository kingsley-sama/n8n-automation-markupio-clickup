const express = require('express');
const { captureMarkupScreenshots, diagnoseMarkupPage } = require('./script_integrated');
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
    service: 'n8n-clickup-scraper'
  });
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
      res.status(200).json({
        success: true,
        data: result,
        message: `Successfully captured ${result.numberOfImages} screenshots`,
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

// Webhook endpoint for n8n integration
app.post('/webhook/capture', async (req, res) => {
  try {
    console.log('📡 Webhook received:', {
      headers: req.headers,
      body: req.body,
      query: req.query
    });

    // Extract URL from various possible sources
    const url = req.body.url || req.query.url || req.body.data?.url;
    const numberOfImages = req.body.numberOfImages || req.query.numberOfImages || req.body.data?.numberOfImages || 1;
    const options = req.body.options || req.body.data?.options || {};

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: url',
        message: 'Webhook payload must include a URL field',
        received: {
          body: req.body,
          query: req.query
        }
      });
    }

    const captureOptions = {
      outputDir: process.env.SCRAPER_OUTPUT_DIR || './screenshots',
      timeout: parseInt(process.env.SCRAPER_TIMEOUT) || 60000,
      retryAttempts: parseInt(process.env.SCRAPER_RETRY_ATTEMPTS) || 3,
      debugMode: process.env.SCRAPER_DEBUG_MODE === 'true' || false,
      waitForFullscreen: true,
      screenshotQuality: 90,
      ...options
    };

    console.log(`📸 Webhook - Starting screenshot capture for: ${url}`);
    
    const result = await captureMarkupScreenshots(url, parseInt(numberOfImages), captureOptions);
    
    // Always return 200 for webhooks, but include success status in body
    res.status(200).json({
      success: result.success,
      data: result,
      webhook: true,
      message: result.success ? 
        `Successfully captured ${result.numberOfImages} screenshots` : 
        'Screenshot capture failed',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Webhook error:', error);
    // Always return 200 for webhooks to prevent retries
    res.status(200).json({
      success: false,
      error: error.message,
      webhook: true,
      message: 'Webhook processing failed',
      timestamp: new Date().toISOString()
    });
  }
});

// API documentation endpoint
app.get('/', (req, res) => {
  const docs = {
    service: 'n8n ClickUp Scraper API',
    version: '1.0.0',
    endpoints: {
      'GET /health': 'Health check endpoint',
      'GET /capture': 'Simple screenshot capture via query parameters',
      'POST /capture': 'Advanced screenshot capture with JSON payload',
      'POST /diagnose': 'Run diagnostic capture with debug information',
      'POST /webhook/capture': 'Webhook endpoint for n8n integration',
      'GET /': 'This documentation'
    },
    examples: {
      'Simple GET request': '/capture?url=https://app.markup.io/markup/bb3022bd-01f0-4ed5-8fbb-1c5da2e3bdc7&numberOfImages=2',
      'POST request': {
        url: 'https://app.markup.io/markup/bb3022bd-01f0-4ed5-8fbb-1c5da2e3bdc7',
        numberOfImages: 2,
        options: {
          debugMode: false,
          screenshotQuality: 90,
          waitForFullscreen: true
        }
      },
      'Webhook payload': {
        url: 'https://app.markup.io/markup/bb3022bd-01f0-4ed5-8fbb-1c5da2e3bdc7',
        numberOfImages: 1
      }
    },
    environment: {
      port: PORT,
      nodeEnv: process.env.NODE_ENV || 'development'
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
    availableEndpoints: ['/', '/health', '/capture', '/diagnose', '/webhook/capture'],
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 n8n ClickUp Scraper API server running on port ${PORT}`);
  console.log(`📋 Documentation available at: http://localhost:${PORT}/`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
  console.log(`📸 Capture endpoint: http://localhost:${PORT}/capture`);
  console.log(`🪝 Webhook endpoint: http://localhost:${PORT}/webhook/capture`);
  console.log('');
  console.log('Example usage:');
  console.log(`curl -X POST http://localhost:${PORT}/capture \\`);
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'{"url":"https://app.markup.io/markup/bb3022bd-01f0-4ed5-8fbb-1c5da2e3bdc7","numberOfImages":2}\'');
  console.log('');
});

module.exports = app;