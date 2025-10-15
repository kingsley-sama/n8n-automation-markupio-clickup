# 🧪 How to Test the Main Codebase

## Quick Start

### Option 1: Simple Visual Test (Recommended First)
Watch the browser extract attachments in real-time:

```bash
./test.sh https://app.markup.io/markup/YOUR-MARKUP-ID
```

**What you'll see:**
- Browser opens (headed mode, slow motion)
- Comments with attachments being found
- Attachment icons being clicked
- URLs extracted and matched to correct comments
- Console logs showing the entire process

### Option 2: Full End-to-End Test
Test the complete flow including database insertion:

```bash
./test.sh https://app.markup.io/markup/YOUR-MARKUP-ID full
```

**What happens:**
1. Visual extraction test (same as Option 1)
2. Server starts automatically
3. Makes API request to `/complete-payload`
4. Stores data in database with attachments
5. Shows results and response

### Option 3: Manual Testing

#### 3A. Test Extraction Only
```bash
node test_attachments.js https://app.markup.io/markup/YOUR-MARKUP-ID
```

#### 3B. Test Full Server
```bash
# Terminal 1: Start server
node server.js

# Terminal 2: Send request
curl -X POST http://localhost:3000/complete-payload \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://app.markup.io/markup/YOUR-MARKUP-ID",
    "options": {}
  }'
```

---

## Test URLs

Use these test scenarios:

### 1. Comments WITHOUT Attachments (Baseline)
Any Markup.io thread with only text comments
- **Expected:** `attachments: []` for all comments

### 2. Comments WITH Attachments (Primary Test)
Your test URL: `https://app.markup.io/markup/2ea1332e-2645-4021-86f4-b5d233a65bd1`
- **Expected:** Attachments extracted and matched to correct pins

### 3. Multiple Comments with Attachments
Thread where pin 1 AND pin 2 both have attachments
- **Expected:** Each comment gets ONLY its own attachments

---

## What to Look For

### ✅ Good Signs

**Console Output:**
```
📎 Collecting attachments from all comments...

   📌 Thread: Header Issue
      📎 Pin 1: Clicking to reveal attachments...
         ✅ Found 1 attachment(s)
            - https://cdn.markup.io/image.png
         🔙 Closing attachment view...

   📊 Collected attachments from 1 comment(s) across 1 thread(s)
```

**Database:**
```sql
-- Comments have attachments array
SELECT attachments FROM markup_comments WHERE array_length(attachments, 1) > 0;

-- Threads have correct flag
SELECT thread_name, has_attachments FROM markup_threads WHERE has_attachments = TRUE;
```

### ❌ Bad Signs

**Console Output:**
```
📎 Pin 1: Clicking to reveal attachments...
   ℹ️  No attachment images found  ⚠️ Problem!
```

**What to check:**
- Does the Markup.io page actually have attachments?
- Is the attachment selector correct?
- Did the sidebar load properly?

---

## Verify Database

After running a test, check your database:

```sql
-- 1. Recent extractions
SELECT 
  t.thread_name,
  t.has_attachments,
  COUNT(c.id) as total_comments,
  COUNT(c.id) FILTER (WHERE array_length(c.attachments, 1) > 0) as comments_with_attachments
FROM markup_threads t
LEFT JOIN markup_comments c ON c.thread_id = t.id
WHERE t.created_at > NOW() - INTERVAL '1 hour'
GROUP BY t.id, t.thread_name, t.has_attachments;

-- 2. Attachment URLs
SELECT 
  t.thread_name,
  c.pin_number,
  c.user_name,
  unnest(c.attachments) as attachment_url
FROM markup_comments c
JOIN markup_threads t ON t.id = c.thread_id
WHERE array_length(c.attachments, 1) > 0
  AND t.created_at > NOW() - INTERVAL '1 hour';
```

---

## Troubleshooting

### Server won't start
```bash
# Check if port 3000 is already in use
lsof -i :3000

# Kill existing process
kill -9 $(lsof -t -i:3000)
```

### Database issues
```bash
# Check if migration ran
psql -h your-host -U your-user -d your-db -c "
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'markup_comments' AND column_name = 'attachments';
"

# If empty, run migration
psql -h your-host -U your-user -d your-db -f migrations/001_add_attachment_support.sql
```

### Browser doesn't open
```bash
# Check if Chrome/Chromium is installed
which google-chrome chromium-browser chromium

# Install if needed (Ubuntu/Debian)
sudo apt-get install chromium-browser
```

---

## Environment Setup

### Required Environment Variables

Create `.env` file:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
PORT=3000
```

### Required Dependencies

```bash
npm install
```

Should install:
- `puppeteer` - Browser automation
- `express` - API server
- `dotenv` - Environment variables
- Other dependencies in `package.json`

---

## Testing Checklist

Before deploying to production:

- [ ] Run migration in database
- [ ] Verify columns exist (`has_attachments`, `attachments`)
- [ ] Test with headed mode (`./test.sh URL`)
- [ ] Verify attachments match correct pins
- [ ] Test full server flow (`./test.sh URL full`)
- [ ] Check database has correct data
- [ ] Verify thread flags auto-update
- [ ] Test with multiple scenarios (with/without attachments)
- [ ] Check server logs for errors
- [ ] Verify API response includes `attachments` field

---

## Need More Help?

See detailed documentation:
- **TESTING_GUIDE.md** - Comprehensive testing guide
- **ATTACHMENT_DATABASE_SCHEMA.md** - Database schema details
- **QUICKSTART_ATTACHMENTS.md** - Quick setup guide
- **migrations/README.md** - Migration instructions

---

## Quick Commands Reference

```bash
# Watch extraction in browser
./test.sh https://app.markup.io/markup/YOUR-ID

# Full end-to-end test
./test.sh https://app.markup.io/markup/YOUR-ID full

# Test extraction only
node test_attachments.js https://app.markup.io/markup/YOUR-ID

# Start server manually
node server.js

# Check server health
curl http://localhost:3000/health
```

Happy testing! 🚀
