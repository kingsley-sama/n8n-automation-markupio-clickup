# Markup.io ClickUp Automation

A comprehensive automation system for capturing screenshots and extracting thread data from Markup.io projects with intelligent URL-based deduplication and automatic image replacement.

## 🌟 Key Features

- **Smart URL Checking**: Automatically detects existing records for the same URL
- **Image Replacement**: Replaces old screenshots with new ones instead of creating duplicates
- **Supabase Integration**: Stores data and images with intelligent update/create logic
- **Single Browser Session**: Optimized extraction using one browser for both operations
- **REST API Server**: HTTP endpoints for easy integration
- **ClickUp Ready**: Structured data output perfect for ClickUp automation workflows

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- Supabase account with configured database and storage bucket

### Installation
```bash
# Clone and install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials
```

### Environment Variables
```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key
SUPABASE_BUCKET=screenshots
SCRAPER_TIMEOUT=90000
SCRAPER_RETRY_ATTEMPTS=3
SCRAPER_DEBUG_MODE=false
PORT=3000
```

### Database Setup
```sql
-- Run the SQL commands from supabase_schema.sql in your Supabase SQL editor
-- This creates the scraped_data and scraping_error_logs tables
```

## 📖 Usage

### 1. REST API Server (Recommended)
```bash
# Start the server
npm start

# The server runs on http://localhost:3000
```

#### Complete Payload Extraction (Optimized)
```bash
curl -X POST http://localhost:3000/complete-payload \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://app.markup.io/markup/your-project-id",
    "options": {
      "screenshotQuality": 90,
      "debugMode": false
    }
  }'
```

#### Response with URL Checking Info
```json
{
  "success": true,
  "data": {
    "url": "https://app.markup.io/markup/your-project-id",
    "projectName": "Your Project",
    "threads": [...],
    "totalThreads": 3,
    "totalScreenshots": 3,
    "supabaseOperation": "updated",  // "created" or "updated"
    "oldImagesDeleted": 2,
    "supabaseRecordId": 123
  },
  "message": "Successfully extracted 3 threads with 3 screenshots (Updated existing record, replaced 2 old images)",
  "supabaseOperation": "updated",
  "oldImagesDeleted": 2
}
```

### 2. Direct Script Usage
```bash
# Extract complete payload (threads + screenshots)
npm run payload

# Capture screenshots only
npm run capture

# Test URL checking functionality
npm run test
```

### 3. Programmatic Usage
```javascript
const { getCompletePayload } = require('./getpayload.js');
const { captureMarkupScreenshots } = require('./script_integrated.js');

// Complete payload with URL checking
const result = await getCompletePayload('https://app.markup.io/markup/your-id');

if (result.success) {
  console.log(`Operation: ${result.supabaseOperation}`); // 'created' or 'updated'
  console.log(`Old images deleted: ${result.oldImagesDeleted}`);
  
  // Process threads
  result.threads.forEach(thread => {
    console.log(`Thread: ${thread.threadName}`);
    console.log(`Comments: ${thread.comments.length}`);
    console.log(`Screenshot: ${thread.imagePath}`);
  });
}
```

## 🔄 URL Checking & Image Replacement Logic

### How It Works
1. **URL Check**: Before saving, system checks if URL already exists in database
2. **Update vs Create**: 
   - If URL exists → Updates existing record + deletes old images
   - If URL is new → Creates new record
3. **Image Management**: 
   - Old screenshots are deleted from Supabase storage
   - New screenshots are uploaded with fresh session ID paths
   - No orphaned files left behind

### Benefits
- **No Duplicates**: Same URL never creates multiple database records
- **Storage Efficiency**: Old images are automatically cleaned up
- **Data Freshness**: Latest screenshots always replace older versions
- **Cost Optimization**: Prevents Supabase storage bloat

## 📊 Database Schema

### `scraped_data` Table
```sql
- id (Primary Key)
- session_id (UUID)
- url (Text) - Used for deduplication
- title (Text)
- number_of_images (Integer)
- screenshot_metadata (JSONB)
- screenshots_paths (Text Array) - URLs to images in storage
- duration_seconds (Numeric)
- success (Boolean)
- options (JSONB)
- created_at (Timestamp)
- updated_at (Timestamp) - Auto-updated on record changes
```

### `scraping_error_logs` Table
```sql
- id (Primary Key)
- session_id (UUID)
- url (Text)
- error_message (Text)
- error_details (JSONB)
- failed_at (Timestamp)
- retry_count (Integer)
- status (Text: 'failed', 'retrying', 'resolved')
```

## 🛠 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API documentation |
| GET | `/health` | Health check |
| POST | `/complete-payload` | **Recommended**: Extract threads + screenshots (optimized) |
| POST | `/capture` | Screenshot capture with JSON payload |
| GET | `/capture` | Simple screenshot capture via query params |
| POST | `/diagnose` | Debug mode capture with detailed logs |

## 🔧 Configuration Options

```javascript
const options = {
  numberOfImages: 'auto',        // Auto-detects from thread count
  screenshotQuality: 90,         // JPEG quality (1-100)
  timeout: 90000,                // Request timeout in ms
  retryAttempts: 3,              // Number of retry attempts
  debugMode: false,              // Enable detailed logging
  waitForFullscreen: true,       // Try to activate fullscreen mode
  screenshotFormat: 'jpeg'       // Image format
};
```

## 🧪 Testing

```bash
# Test URL checking and update functionality
npm run test

# This will:
# 1. Check for existing records for test URL
# 2. Run extraction and show operation type (created/updated)
# 3. Run again immediately to test update behavior
# 4. Display before/after database records
```

## 🎯 ClickUp Integration

The extracted data structure is optimized for ClickUp automation:

```javascript
{
  "projectName": "Project Name",
  "threads": [
    {
      "threadName": "Header Navigation",
      "imageIndex": 1,
      "imagePath": "https://supabase-url/image1.jpg",
      "comments": [
        {
          "pinNumber": "1",
          "userName": "John Doe",
          "messageContent": "Fix the navigation alignment",
          "threadId": "thread-123"
        }
      ]
    }
  ]
}
```

## 🔍 Monitoring & Debugging

### View Recent Activities
```javascript
const supabaseService = new SupabaseService();
const recent = await supabaseService.getRecentActivities(10);
console.log(recent);
```

### Check Failed Scrapings
```javascript
const failed = await supabaseService.getFailedScrapings(10);
console.log(failed);
```

### Debug Mode
Set `SCRAPER_DEBUG_MODE=true` or use `debugMode: true` in options for detailed logs.

## 🚦 Error Handling

- **Automatic Retries**: Failed operations retry with exponential backoff
- **Graceful Degradation**: Screenshot failures don't break thread extraction
- **Error Logging**: All errors logged to Supabase for analysis
- **Recovery Options**: Failed operations can be manually retriggered

## 📁 File Structure

```
├── server.js              # REST API server
├── script_integrated.js   # Screenshot capture logic
├── getpayload.js         # Thread extraction + screenshot combination
├── supabase-service.js   # Database operations with URL checking
├── supabase_schema.sql   # Database schema
├── test_url_checking.js  # Test script for URL checking
├── package.json          # Dependencies and scripts
└── README.md            # This file
```

## 🔄 Workflow Examples

### New Project Workflow
1. Extract markup → **Creates new record**
2. Re-extract same markup → **Updates existing record, replaces images**
3. No duplicate records, storage stays clean

### Production Integration
1. Webhook receives markup URL
2. API call to `/complete-payload`
3. Response indicates if record was created or updated
4. ClickUp tasks created/updated accordingly
5. Old screenshots automatically cleaned up

## 🛡 Security & Best Practices

- Use Supabase Service Key for server environments
- Use Supabase Anon Key for client environments  
- Enable RLS (Row Level Security) on Supabase tables
- Set up proper CORS policies
- Monitor storage usage and set up cleanup jobs
- Use environment variables for all sensitive configuration

## 📈 Performance Optimizations

- **Single Browser Session**: Complete payload extraction uses one browser instance
- **Parallel Processing**: Screenshots captured in parallel when possible
- **Smart Caching**: URL checking prevents unnecessary duplicate processing
- **Image Cleanup**: Automatic deletion of old images prevents storage bloat
- **Connection Pooling**: Efficient Supabase connections

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Test URL checking functionality with the test script
4. Submit a pull request with clear description of changes

## 📄 License

ISC License - see package.json for details.

## 🆘 Support

For issues related to:
- **URL Checking**: Run `npm run test` to verify functionality
- **Database Issues**: Check Supabase logs and connection settings
- **Screenshot Problems**: Enable debug mode and check logs
- **API Integration**: Check server logs and endpoint documentation