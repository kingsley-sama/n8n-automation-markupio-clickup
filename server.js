
const express = require('express');
const { captureMarkupScreenshots, diagnoseMarkupPage } = require('./db_helper');
const { getCompletePayload } = require('./getpayload');
const { 
  getProjectDataFromDB, 
  getAllProjects, 
  getProjectById,
  searchThreadsByContent,
  getStatistics,
  getProjectByPartialName
} = require('./db_response_helper.js');
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

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'markup-screenshot-payload-extractor'
  });
});

// Main endpoint: Extract and save to normalized structure
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
    
    console.log(`Starting payload extraction for: ${url}`);
    
    // Extract and save to normalized tables
    const result = await getCompletePayload(url, payloadOptions);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }
    
    // Fetch from DB (source of truth)
    const dbData = await getProjectDataFromDB(url);
    
    if (!dbData) {
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve saved data from database'
      });
    }
    
    let message = `Successfully extracted ${dbData.totalThreads} threads with ${dbData.totalScreenshots} screenshots`;
    if (result.operation === 'updated') {
      message += ` (Updated, replaced ${result.oldImagesDeleted} old images)`;
    }
    
    res.status(200).json({
      success: true,
      data: dbData,
      message: message,
      operation: result.operation,
      oldImagesDeleted: result.oldImagesDeleted,
      projectId: result.projectId,
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

// Get project by URL
app.get('/project', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: url'
      });
    }
    
    const projectData = await getProjectDataFromDB(url);
    
    if (!projectData) {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
        url: url
      });
    }
    
    res.json({
      success: true,
      data: projectData
    });
    
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({
      success: false,
      error: error.message
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

// Get all projects (paginated)
app.get('/projects', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    
    const projects = await getAllProjects(limit, offset);
    
    res.json({
      success: true,
      data: projects,
      pagination: {
        limit: limit,
        offset: offset,
        count: projects.length
      }
    });
    
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get project by ID
app.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const projectData = await getProjectById(projectId);
    
    if (!projectData) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    res.json({
      success: true,
      data: projectData
    });
    
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Search threads
app.get('/search', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Missing search query parameter: q'
      });
    }
    
    const results = await searchThreadsByContent(q, parseInt(limit));
    
    res.json({
      success: true,
      data: results,
      query: q,
      count: results.length
    });
    
  } catch (error) {
    console.error('Error searching:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get statistics
app.get('/stats', async (req, res) => {
  try {
    const stats = await getStatistics();
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Legacy screenshot endpoint (still supported)
app.post('/capture', async (req, res) => {
  try {
    const { url, numberOfImages = 1, options = {} } = req.body;

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

    const numImages = parseInt(numberOfImages);
    if (isNaN(numImages) || numImages < 1 || numImages > 10) {
      return res.status(400).json({
        success: false,
        error: 'numberOfImages must be between 1 and 10'
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
    
    const result = await captureMarkupScreenshots(url, numImages, captureOptions);
    
    if (result.success) {
      let message = `Successfully captured ${result.numberOfImages} screenshots`;
      if (result.supabaseOperation === 'updated') {
        message += ` (Updated, replaced ${result.oldImagesDeleted} old images)`;
      }
      
      res.status(200).json({
        success: true,
        data: result,
        message: message,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        data: result,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/capture', async (req, res) => {
  try {
    const { url, numberOfImages = '1', debug = 'false' } = req.query;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: url'
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
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

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
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/', (req, res) => {
  const docs = {
    service: 'Markup.io Screenshot & Payload Extractor API',
    version: '3.0.0 - Normalized Structure',
    endpoints: {
      'GET /health': 'Health check',
      'POST /complete-payload': 'Extract & save to normalized structure (RECOMMENDED)',
      'GET /project?url=': 'Get project by URL',
      'GET /projects?limit=10&offset=0': 'Get all projects (paginated)',
      'GET /project/:projectId': 'Get project by ID',
      'GET /search?q=term&limit=20': 'Search threads by content',
      'GET /stats': 'Get database statistics',
      'POST /capture': 'Legacy screenshot capture',
      'GET /capture': 'Legacy screenshot capture (GET)',
      'POST /diagnose': 'Diagnostic capture'
    },
    examples: {
      'Extract complete payload': {
        endpoint: 'POST /complete-payload',
        body: {
          url: 'https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0',
          options: { screenshotQuality: 90 }
        }
      },
      'Get project data': 'GET /project?url=https://app.markup.io/markup/...',
      'Search threads': 'GET /search?q=bug&limit=20',
      'Get statistics': 'GET /stats'
    },
    features: {
      'Normalized Database': 'Projects, threads, and comments in separate tables',
      'URL Deduplication': 'Updates existing records instead of creating duplicates',
      'Image Management': 'Automatic cleanup of old images on update',
      'Full-text Search': 'Search across all comment content',
      'Statistics': 'Track total projects, threads, and comments'
    }
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
  console.log(`📋 Documentation: http://localhost:${PORT}/`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
  console.log('');
  console.log('✅ NORMALIZED STRUCTURE FEATURES:');
  console.log('- Separate tables: projects, threads, comments');
  console.log('- URL deduplication with smart updates');
  console.log('- Automatic image cleanup');
  console.log('- Full-text search capabilities');
  console.log('- Statistics tracking');
  console.log('');
  console.log('📡 RECOMMENDED ENDPOINT:');
  console.log(`POST http://localhost:${PORT}/complete-payload`);
  console.log('Body: {"url": "https://app.markup.io/markup/..."}');
});

module.exports = app;