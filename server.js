
const express = require('express');
const { getCompletePayload } = require('./getpayload');
const { getProjectByPartialName } = require('./db_response_helper.js');
const { addScrapingJob, getJobStatus, getQueueStats } = require('./queue');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

app.get('/health', async (req, res) => {
  try {
    const queueStats = await getQueueStats();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'markup-screenshot-payload-extractor',
      queue: queueStats
    });
  } catch (error) {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'markup-screenshot-payload-extractor',
      queue: { error: 'Queue not available' }
    });
  }
});

// ============================================================================
// MAIN ENDPOINTS
// ============================================================================

// Main endpoint: Queue scraping job with debouncing
app.post('/complete-payload', async (req, res) => {
  try {
    const { url, options = {} } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: url'
      });
    }
    
    try { new URL(url); } catch (urlError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
    }
    
    const payloadOptions = {
      screenshotQuality: 90,
      debugMode: process.env.SCRAPER_DEBUG_MODE === 'true' || false,
      ...options
    };
    
    console.log(`📥 Received request to scrape: ${url}`);
    
    // Add job to queue instead of processing immediately
    const jobInfo = await addScrapingJob(url, payloadOptions);
    
    res.status(202).json({
      success: true,
      message: 'Job added to queue. Will process in 3 minutes if no duplicate URLs are received.',
      job: jobInfo,
      checkStatus: `/queue/job/${jobInfo.jobId}`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Search for a project by partial name (case-insensitive, returns first match)
app.get('/project-by-name', async (req, res) => {
  try {
    const { name } = req.query;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameter: name',
        message: 'Usage: /project-by-name?name=partialProjectName'
      });
    }
    
    const project = await getProjectByPartialName(name);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'No project found matching the given name',
        searchTerm: name
      });
    }
    
    res.json({
      success: true,
      data: project
    });
    
  } catch (error) {
    console.error('Error in /project-by-name:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get job status by ID (for monitoring queue jobs)
app.get('/queue/job/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const status = await getJobStatus(jobId);
    
    if (!status.success) {
      return res.status(404).json(status);
    }
    
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching job status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ROOT ENDPOINT & ERROR HANDLERS
// ============================================================================

app.get('/', (req, res) => {
  const docs = {
    service: 'Markup.io Screenshot & Payload Extractor API',
    version: '4.0.0 - Simplified',
    endpoints: {
      'GET /health': 'Health check with queue stats',
      'POST /complete-payload': 'Queue scraping job (3-minute debounce)',
      'GET /project-by-name?name=': 'Get project by partial name match',
      'GET /queue/job/:jobId': 'Get job status and payload'
    },
    usage: {
      'Submit scraping job': {
        method: 'POST',
        endpoint: '/complete-payload',
        body: { url: 'https://app.markup.io/markup/YOUR_ID' },
        response: 'Returns jobId and checkStatus URL'
      },
      'Get project by name': {
        method: 'GET',
        endpoint: '/project-by-name?name=partialName',
        response: 'Returns project with threads and comments'
      },
      'Check job status': {
        method: 'GET',
        endpoint: '/queue/job/:jobId',
        response: 'Returns job state and payload when completed'
      }
    },
    features: [
      'Queue-based processing with 3-minute debouncing',
      'Automatic retries (3 attempts, 10-min delay)',
      'German to English translation with rate limit handling',
      'Sequential translation to avoid API overload',
      'Normalized database storage'
    ]
  };

  res.json(docs);
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📋 API Documentation: http://localhost:${PORT}/`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
  console.log('');
  console.log('✅ ACTIVE ENDPOINTS:');
  console.log(`   POST /complete-payload - Queue scraping job`);
  console.log(`   GET  /project-by-name?name= - Get project by name`);
  console.log(`   GET  /queue/job/:jobId - Check job status`);
  console.log('');
  console.log('✅ FEATURES:');
  console.log('   • Queue-based processing (3-minute debouncing)');
  console.log('   • German → English translation');
  console.log('   • Rate limit handling (auto-retry)');
  console.log('   • Sequential processing (1 job at a time)');
});

module.exports = app;