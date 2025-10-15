# Testing Guide - Markup.io Automation

## 🧪 Testing the Main Codebase

### Quick Test (5 minutes)

The easiest way to test is using the **headed test script** which shows you exactly what's happening:

```bash
node test_attachments.js https://app.markup.io/markup/YOUR-MARKUP-ID
```

**What you'll see:**
- Browser window opens (headed mode)
- Slow motion (100ms delays) so you can watch
- Console logs showing:
  - Thread groups being processed
  - Attachment indicators being clicked
  - URLs being extracted
  - Attachments matched to comments by pin number

### Full Production Test

To test the complete flow including database insertion:

#### Step 1: Set Up Environment Variables

Create or update `.env` file:
```bash
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

#### Step 2: Run Migration (First Time Only)

In Supabase SQL Editor, run:
```sql
-- Copy contents of migrations/001_add_attachment_support.sql
```

Or via psql:
```bash
psql -h your-host -U your-user -d your-db -f migrations/001_add_attachment_support.sql
```

#### Step 3: Test the Complete Extraction

```bash
node server.js
```

Then send a test request:

```bash
curl -X POST http://localhost:3000/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://app.markup.io/markup/YOUR-MARKUP-ID",
    "numberOfImages": 5
  }'
```

---

## 🎯 Testing Scenarios

### Scenario 1: Comments WITHOUT Attachments (Baseline)

**Test URL:** Any Markup.io thread with only text comments

**Expected:**
```javascript
{
  "content": "Please fix this issue",
  "attachments": []  // Empty array
}
```

**Verify:**
```sql
SELECT * FROM markup_comments WHERE attachments = '{}';
-- Should return comments without attachments
```

### Scenario 2: Comments WITH Attachments (Primary Test)

**Test URL:** Markup.io thread with images attached to comments

**Expected:**
```javascript
{
  "content": "Please fix this\n\n📎 Attachments:\n- https://cdn.markup.io/...",
  "attachments": [
    "https://cdn.markup.io/image1.png",
    "https://cdn.markup.io/image2.jpg"
  ]
}
```

**Verify:**
```sql
SELECT 
  c.pin_number,
  c.content,
  c.attachments,
  array_length(c.attachments, 1) as attachment_count
FROM markup_comments c
WHERE array_length(c.attachments, 1) > 0;
```

### Scenario 3: Multiple Comments with Attachments

**Test URL:** Thread where multiple comments have attachments (like pin 1 and pin 2)

**Expected:**
- Each comment gets ONLY its own attachments
- Pin 1 attachments → Comment 1
- Pin 2 attachments → Comment 2

**Verify:**
```bash
# Watch the console output - should show:
# "📎 Pin 1: Clicking to reveal attachments..."
# "   ✅ Found 1 attachment(s)"
# "📎 Pin 2: Clicking to reveal attachments..."
# "   ✅ Found 1 attachment(s)"
```

### Scenario 4: Thread with Multiple Attachment Types

**Expected:**
- All attachment types extracted (PNG, JPG, GIF, etc.)
- Query parameters stripped (`?fit=contain&width=96` removed)
- Only real URLs (no `data:` URIs)

---

## 🔍 Verification Steps

### 1. Console Output Verification

Look for these patterns in the console:

```
📎 Collecting attachments from all comments...

   📌 Thread: Header Issue
      📎 Pin 1: Clicking to reveal attachments...
         ✅ Found 2 attachment(s)
            - https://cdn.markup.io/image1.png
            - https://cdn.markup.io/image2.jpg
         🔙 Closing attachment view...

   📊 Collected attachments from 1 comment(s) across 1 thread(s)
```

### 2. Database Verification

After extraction completes:

```sql
-- Check thread flags
SELECT 
  thread_name,
  has_attachments
FROM markup_threads
ORDER BY created_at DESC
LIMIT 10;

-- Check comment attachments
SELECT 
  t.thread_name,
  c.pin_number,
  c.user_name,
  array_length(c.attachments, 1) as attachment_count,
  c.attachments
FROM markup_comments c
JOIN markup_threads t ON t.id = c.thread_id
ORDER BY t.created_at DESC, c.pin_number
LIMIT 10;

-- Check attachment URLs
SELECT 
  t.thread_name,
  c.pin_number,
  unnest(c.attachments) as attachment_url
FROM markup_comments c
JOIN markup_threads t ON t.id = c.thread_id
WHERE array_length(c.attachments, 1) > 0;
```

### 3. Payload Verification

Check the response payload has the correct structure:

```javascript
{
  "success": true,
  "data": {
    "projectName": "Project Name",
    "threads": [
      {
        "threadName": "Thread 1",
        "comments": [
          {
            "pinNumber": 1,
            "content": "Text\n\n📎 Attachments:\n- url",
            "user": "John Doe",
            "attachments": ["https://..."]  // ✅ This should exist
          }
        ]
      }
    ]
  }
}
```

---

## 🐛 Troubleshooting

### Issue: No attachments extracted

**Check:**
1. Are there actually attachments in the Markup.io page?
2. Look for console logs: `"ℹ️  No attachment images found"`
3. Check if attachment indicator (`.thread-list-item-attachment-count`) exists

**Debug:**
```bash
# Run in headed mode to watch
node test_attachments.js https://app.markup.io/markup/YOUR-ID
```

### Issue: Attachments go to wrong comment

**This shouldn't happen anymore!** But if it does:

1. Check console logs for pin numbers:
   ```
   📎 Pin 1: Clicking to reveal attachments...
   📎 Pin 2: Clicking to reveal attachments...
   ```

2. Verify pin extraction in code:
   ```javascript
   // Should extract pin number like "1", "2", etc.
   const pinText = pinElement.textContent.trim();
   const extractedPin = parseInt(pinText.match(/\d+/)?.[0]);
   ```

### Issue: Browser hangs or doesn't close

**Cause:** Puppeteer waiting for something

**Fix:**
1. Check if sidebar closes properly (Escape key)
2. Look for selector timeouts in console
3. Manually close browser and check logs

### Issue: Database insertion fails

**Check:**
1. Migration ran successfully?
   ```sql
   -- Should exist
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'markup_comments' AND column_name = 'attachments';
   ```

2. Function updated?
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'insert_markup_payload';
   ```

3. Payload format correct?
   - Each comment should have `attachments: []` array

---

## 📊 Performance Testing

### Test with Large Projects

```bash
# Project with 10+ threads
node server.js
# POST with numberOfImages: 15
```

**Monitor:**
- Extraction time (should be reasonable)
- Memory usage
- Database insert time

**Expected Performance:**
- ~1-2 seconds per comment with attachments
- ~0.5 seconds per comment without attachments
- No memory leaks

### Load Testing

```bash
# Install autocannon if needed
npm install -g autocannon

# Test the endpoint
autocannon -c 10 -d 30 http://localhost:3000/health
```

---

## ✅ Test Checklist

Before deploying to production, verify:

- [ ] Migration ran successfully
- [ ] `has_attachments` column exists on `markup_threads`
- [ ] `attachments` column exists on `markup_comments`
- [ ] Test script extracts attachments correctly
- [ ] Attachments match correct comments (by pin number)
- [ ] Database stores attachments as text array
- [ ] Thread `has_attachments` flag auto-updates (trigger works)
- [ ] Query parameters stripped from URLs
- [ ] Payload includes `attachments` field
- [ ] Server endpoint works end-to-end
- [ ] No errors in console
- [ ] Browser closes properly after extraction

---

## 🚀 Quick Test Commands

```bash
# 1. Test extraction only (headed mode - watch it work!)
node test_attachments.js https://app.markup.io/markup/YOUR-ID

# 2. Test full server (headless mode)
node server.js
# Then in another terminal:
curl -X POST http://localhost:3000/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://app.markup.io/markup/YOUR-ID", "numberOfImages": 5}'

# 3. Test database function directly
psql -h your-host -U your-user -d your-db -c "
SELECT insert_markup_payload(
  1,  -- scraped_data_id
  '{\"data\": {...}}'::jsonb  -- your payload
);
"

# 4. Check recent extractions
psql -h your-host -U your-user -d your-db -c "
SELECT 
  t.thread_name,
  t.has_attachments,
  COUNT(c.id) as comment_count,
  COUNT(c.id) FILTER (WHERE array_length(c.attachments, 1) > 0) as comments_with_attachments
FROM markup_threads t
LEFT JOIN markup_comments c ON c.thread_id = t.id
GROUP BY t.id, t.thread_name, t.has_attachments
ORDER BY t.created_at DESC
LIMIT 5;
"
```

---

## 📝 Test Results Template

Use this to document your test results:

```markdown
### Test Run - [Date]

**Test URL:** https://app.markup.io/markup/...

**Expected:**
- X threads
- Y comments total
- Z comments with attachments

**Results:**
- ✅/❌ Attachments extracted
- ✅/❌ Correct pin matching
- ✅/❌ Database insertion
- ✅/❌ Thread flags correct

**Performance:**
- Extraction time: X seconds
- Database insert time: Y seconds

**Issues Found:**
- None / [List issues]

**Console Output:**
[Paste relevant console output]
```

---

## 🎓 Understanding the Test Output

### Good Output Example:
```
📎 Collecting attachments from all comments...

   📌 Thread: Header Issue
      📎 Pin 1: Clicking to reveal attachments...
         ✅ Found 1 attachment(s)
            - https://cdn.markup.io/12345.png
         🔙 Closing attachment view...

   📊 Collected attachments from 1 comment(s) across 1 thread(s)

✅ Extraction completed successfully!
```

### Bad Output Example (Problem):
```
📎 Collecting attachments from all comments...

   📌 Thread: Header Issue
      📎 Pin 1: Clicking to reveal attachments...
         ℹ️  No attachment images found  ⚠️ Problem!
         🔙 Closing attachment view...

   📊 Collected attachments from 0 comment(s) across 0 thread(s)
```

If you see the bad example, the attachment sidebar might not have loaded properly, or the selector changed.

---

**Need help?** Check the other documentation files or review the console output for specific error messages.
