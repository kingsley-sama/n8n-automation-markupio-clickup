# 🚀 Quick Start: Queue System Setup

## 1. Install Dependencies

```bash
npm install
```

This installs:
- `bullmq` - Queue management library
- `ioredis` - Redis client

## 2. Install & Start Redis

### Ubuntu/Debian:
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
```

### macOS:
```bash
brew install redis
brew services start redis
```

### Windows (Docker):
```bash
docker run -d -p 6379:6379 redis
```

### Verify Redis:
```bash
redis-cli ping
# Should return: PONG
```

## 3. Configure Environment

Add to your `.env` file:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
```

## 4. Start Server

```bash
npm start
```

## 5. Test It!

### Add a job to queue:
```bash
curl -X POST http://localhost:3000/complete-payload \
  -H "Content-Type: application/json" \
  -d '{"url": "https://app.markup.io/markup/YOUR_MARKUP_ID"}'
```

### Check queue stats:
```bash
curl http://localhost:3000/queue/stats
```

### Check health:
```bash
curl http://localhost:3000/health
```

---

## How It Works

1. **Webhook triggers** → URL added to queue with 3-minute delay
2. **Same URL again?** → Timer resets (debouncing)
3. **3 minutes pass** → Job starts processing
4. **Scraper runs** → Captures all comments in one go
5. **If fails** → Auto-retry after 10 minutes (up to 3 times)

---

## Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /complete-payload` | Queue a job (with debounce) |
| `POST /complete-payload/immediate` | Bypass queue (instant) |
| `GET /queue/stats` | View queue statistics |
| `GET /queue/job/:jobId` | Check job status |
| `GET /queue/jobs/delayed` | See delayed jobs |

---

## Monitoring

Watch the logs in real-time:
```bash
npm start
```

You'll see:
```
🔄 Processing job: markup-abc123
📍 URL: https://app.markup.io/markup/...
✅ Job completed successfully
```

---

## Troubleshooting

**Redis not running?**
```bash
sudo systemctl status redis-server  # Linux
brew services list                  # macOS
```

**Can't connect to Redis?**
- Check `.env` has correct `REDIS_HOST` and `REDIS_PORT`
- Check Redis is running: `redis-cli ping`

**Jobs not processing?**
- Check worker logs in console
- Verify queue stats: `GET /queue/stats`
- Check for errors: `GET /queue/jobs/failed`

---

📖 **Full documentation:** See `QUEUE_SYSTEM.md`
