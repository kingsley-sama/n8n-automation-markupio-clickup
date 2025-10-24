# BullMQ Queue System for Markup Scraper

## 🎯 Overview

This implementation adds a robust queue system using BullMQ to handle Markup.io scraping jobs. It solves the problem of multiple webhook triggers for the same URL by implementing intelligent debouncing.

---

## ✨ Features

### 1. **Intelligent Debouncing (3-minute window)**
- When a URL is received, it's added to the queue with a 3-minute delay
- If the SAME URL is received again within those 3 minutes, the timer resets
- Only processes the job once after 3 minutes of inactivity
- **Perfect for multiple comments added to same Markup project**

### 2. **Concurrency Control**
- Processes **one job at a time** (concurrency: 1)
- Prevents resource conflicts and browser instance issues
- Ensures reliable scraping

### 3. **Automatic Retries**
- Failed jobs automatically retry after **10 minutes**
- Up to **3 retry attempts** per job
- Exponential backoff prevents hammering failed URLs

### 4. **URL-based Job Identification**
- Each URL gets a unique job ID
- Duplicate URLs are handled intelligently
- Easy tracking and debugging

### 5. **Full Queue Management**
- View queue statistics
- Monitor job states (waiting, delayed, active, completed, failed)
- Manually retry or remove jobs
- Pause/resume queue processing

---

## 📋 Prerequisites

### Install Dependencies

```bash
npm install bullmq ioredis
```

### Install Redis

**On Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

**On macOS:**
```bash
brew install redis
brew services start redis
```

**On Windows:**
- Use Docker: `docker run -d -p 6379:6379 redis`
- Or install from: https://github.com/microsoftarchive/redis/releases

### Verify Redis is Running

```bash
redis-cli ping
# Should return: PONG
```

---

## 🚀 Setup

### 1. Add Environment Variables

Add to your `.env` file:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=your_password  # Optional, if Redis has auth
```

### 2. Start the Server

```bash
npm start
```

You should see:
```
🚀 Server running on port 3000
✅ QUEUE-BASED PROCESSING:
- 🔄 Automatic URL debouncing (3-minute window)
- 🎯 One job at a time (concurrency: 1)
- 🔁 Auto-retry failed jobs (3 attempts, 10-min delay)
```

---

## 📡 API Usage

### **Webhook Endpoint (Recommended)**

**POST `/complete-payload`**

Add a job to the queue with 3-minute debouncing:

```bash
curl -X POST http://localhost:3000/complete-payload \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0",
    "options": {
      "screenshotQuality": 90
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Job added to queue. Will process in 3 minutes if no duplicate URLs are received.",
  "job": {
    "success": true,
    "jobId": "markup-aHR0cHM6Ly9hcHAubWFya3VwLmlvL21hcmt1cC82MDM5YjQ0NS",
    "url": "https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0",
    "status": "delayed",
    "delay": 180000,
    "willProcessAt": "2025-10-20T10:33:00.000Z"
  },
  "checkStatus": "/queue/job/markup-aHR0cHM6Ly9hcHAubWFya3VwLmlvL21hcmt1cC82MDM5YjQ0NS",
  "timestamp": "2025-10-20T10:30:00.000Z"
}
```

---

### **Immediate Processing (Bypass Queue)**

**POST `/complete-payload/immediate`**

Process immediately without queue (legacy behavior):

```bash
curl -X POST http://localhost:3000/complete-payload/immediate \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0"
  }'
```

---

## 📊 Queue Management

### Get Queue Statistics

**GET `/queue/stats`**

```bash
curl http://localhost:3000/queue/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "waiting": 5,
    "active": 1,
    "completed": 42,
    "failed": 2,
    "delayed": 3,
    "total": 53
  },
  "timestamp": "2025-10-20T10:30:00.000Z"
}
```

---

### Check Job Status

**GET `/queue/job/:jobId`**

```bash
curl http://localhost:3000/queue/job/markup-aHR0cHM6Ly9hcHAubWFya3VwLmlvL21hcmt1cC82MDM5YjQ0NS
```

**Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "markup-aHR0cHM6Ly9hcHAubWFya3VwLmlvL21hcmt1cC82MDM5YjQ0NS",
    "url": "https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0",
    "state": "completed",
    "progress": 100,
    "attemptsMade": 1,
    "processedOn": 1634734200000,
    "finishedOn": 1634734230000,
    "returnvalue": {
      "success": true,
      "projectId": "uuid-here",
      "totalThreads": 5,
      "totalScreenshots": 5
    }
  },
  "timestamp": "2025-10-20T10:30:00.000Z"
}
```

---

### Get Jobs by State

**GET `/queue/jobs/:state?start=0&end=10`**

States: `waiting`, `delayed`, `active`, `completed`, `failed`

```bash
# Get waiting jobs
curl http://localhost:3000/queue/jobs/waiting

# Get failed jobs
curl http://localhost:3000/queue/jobs/failed?start=0&end=20

# Get delayed jobs
curl http://localhost:3000/queue/jobs/delayed
```

---

### Retry Failed Job

**POST `/queue/job/:jobId/retry`**

```bash
curl -X POST http://localhost:3000/queue/job/markup-abc123/retry
```

---

### Remove Job

**DELETE `/queue/job/:jobId`**

```bash
curl -X DELETE http://localhost:3000/queue/job/markup-abc123
```

---

### Pause Queue

**POST `/queue/pause`**

```bash
curl -X POST http://localhost:3000/queue/pause
```

---

### Resume Queue

**POST `/queue/resume`**

```bash
curl -X POST http://localhost:3000/queue/resume
```

---

### Clean Old Jobs

**POST `/queue/clean`**

Remove completed jobs older than 24 hours (default):

```bash
curl -X POST http://localhost:3000/queue/clean \
  -H "Content-Type: application/json" \
  -d '{"grace": 86400000}'
```

---

## 🔄 How Debouncing Works

### Scenario: Multiple Comments on Same Markup

**Timeline:**

```
10:00:00 - Comment 1 added → Webhook triggers
           └─ Job created with 3-minute delay
           └─ Will process at 10:03:00

10:00:30 - Comment 2 added → Webhook triggers
           └─ Existing job found and removed
           └─ New job created with 3-minute delay
           └─ Will now process at 10:03:30

10:01:00 - Comment 3 added → Webhook triggers
           └─ Existing job found and removed
           └─ New job created with 3-minute delay
           └─ Will now process at 10:04:00

10:04:00 - 3 minutes passed with no new comments
           └─ Job starts processing
           └─ Scrapes all 3 comments in one go ✅
```

**Result:** Only ONE scraping job runs, capturing all comments!

---

## 🎯 Webhook Integration

### Configure Your Markup.io Webhook

**Webhook URL:**
```
https://your-server.com/complete-payload
```

**Payload:**
```json
{
  "url": "https://app.markup.io/markup/{{markup_id}}"
}
```

**Behavior:**
- Each comment triggers the webhook
- Queue system debounces multiple comments
- Scraper waits 3 minutes after last comment
- Only one scraping job runs per Markup project

---

## 🐛 Monitoring & Debugging

### View Real-time Logs

Worker logs show job processing:

```
================================================================================
🔄 Processing job: markup-aHR0cHM6Ly9hcHAubWFya3VwLmlvL21hcmt1cC82MDM5YjQ0NS
📍 URL: https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0
⏰ Started at: 2025-10-20T10:30:00.000Z
🔢 Attempt: 1/3
================================================================================

✅ Job markup-aHR0cHM... completed successfully
📊 Result: 5 threads, 5 screenshots
```

### Health Check with Queue Stats

```bash
curl http://localhost:3000/health
```

Returns server health + queue statistics.

---

## ⚙️ Configuration Options

### Modify Queue Behavior

Edit `queue.js`:

```javascript
// Change debounce delay (default: 3 minutes)
delay: 3 * 60 * 1000, // Change to 5 * 60 * 1000 for 5 minutes

// Change retry delay (default: 10 minutes)
backoff: {
  type: 'fixed',
  delay: 10 * 60 * 1000, // Change to 15 * 60 * 1000 for 15 minutes
}

// Change max retries (default: 3)
attempts: 3, // Change to 5 for 5 attempts

// Change concurrency (default: 1)
concurrency: 1, // Change to 2 to process 2 jobs simultaneously
```

---

## 📈 Production Considerations

### 1. **Redis Persistence**

Enable Redis persistence in `/etc/redis/redis.conf`:

```
save 900 1
save 300 10
save 60 10000
```

### 2. **Redis Memory**

Set max memory and eviction policy:

```
maxmemory 256mb
maxmemory-policy allkeys-lru
```

### 3. **Queue Dashboard**

Install Bull Board for visual monitoring:

```bash
npm install @bull-board/express @bull-board/api
```

### 4. **Process Manager**

Use PM2 to keep server running:

```bash
npm install -g pm2
pm2 start server.js --name markup-scraper
pm2 startup
pm2 save
```

---

## 🚨 Troubleshooting

### Redis Connection Error

**Error:** `Error connecting to Redis`

**Solution:**
1. Check Redis is running: `redis-cli ping`
2. Verify `.env` has correct Redis host/port
3. Check firewall isn't blocking port 6379

### Jobs Not Processing

**Problem:** Jobs stay in "delayed" state

**Solution:**
1. Check worker is running (should start with server)
2. Check queue scheduler is running
3. Restart server: `npm start`

### Jobs Failing Repeatedly

**Problem:** Jobs fail all 3 attempts

**Solution:**
1. Check job logs for error details
2. Test URL manually: `POST /complete-payload/immediate`
3. Check Puppeteer/browser issues
4. Verify Supabase credentials

---

## 📝 Summary

✅ **Solves multiple webhook problem** with 3-minute debouncing  
✅ **One job at a time** prevents conflicts  
✅ **Automatic retries** handle transient failures  
✅ **Full queue management** via API  
✅ **Production-ready** with monitoring and error handling  

**Your webhook can now trigger freely - the queue handles the rest!** 🎉
