# Attachment Support - Database Schema Update

**Date:** October 15, 2025  
**Status:** ✅ Ready for Deployment

## Overview

Extended the database schema to support attachment storage for Markup.io comments, with automatic tracking at both the thread and comment levels.

## Database Changes

### 1. New Columns

#### `markup_threads` Table
```sql
has_attachments BOOLEAN DEFAULT FALSE
```
- **Purpose:** Quick flag to identify threads that contain attachments
- **Default:** `FALSE` (safe for existing data)
- **Automatically Updated:** Yes, via trigger

#### `markup_comments` Table
```sql
attachments TEXT[] DEFAULT '{}'
```
- **Purpose:** Array of attachment URLs for each comment
- **Type:** PostgreSQL text array
- **Default:** Empty array `'{}'` (safe for existing data)

### 2. Indexes (Performance Optimization)

```sql
-- Find threads with attachments quickly
CREATE INDEX idx_markup_threads_has_attachments 
ON markup_threads(has_attachments) WHERE has_attachments = TRUE;

-- Find comments with attachments quickly (GIN index for arrays)
CREATE INDEX idx_markup_comments_attachments 
ON markup_comments USING GIN(attachments) WHERE array_length(attachments, 1) > 0;
```

### 3. Automatic Trigger

```sql
CREATE TRIGGER trigger_update_thread_has_attachments
    AFTER INSERT OR UPDATE OF attachments OR DELETE ON markup_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_thread_has_attachments();
```

**What it does:**
- Automatically sets `has_attachments = TRUE` on a thread when any comment gets attachments
- Automatically sets `has_attachments = FALSE` when all attachments are removed
- No manual maintenance required!

## Code Changes

### 1. Extraction Logic (`getpayload.js` & `test_attachments.js`)

**Before:**
```javascript
{
  id: threadId,
  content: messageContent,
  user: userName
}
```

**After:**
```javascript
{
  id: threadId,
  content: messageContent + '\n\n📎 Attachments:\n- url1\n- url2',  // Display version
  user: userName,
  attachments: ['url1', 'url2']  // Separate field for database
}
```

### 2. Database Function (`insert_markup_payload`)

Updated to:
- Extract `attachments` array from comment JSON
- Store attachments in the `attachments` column
- Calculate and set `has_attachments` flag on threads

## Migration Steps

### Step 1: Run the Migration

**Using Supabase Dashboard:**
1. Go to SQL Editor
2. Open `migrations/001_add_attachment_support.sql`
3. Run the script

**Using psql:**
```bash
psql -h your-host -U your-user -d your-db -f migrations/001_add_attachment_support.sql
```

### Step 2: Verify Migration

```sql
-- Check columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name IN ('markup_threads', 'markup_comments')
  AND column_name IN ('has_attachments', 'attachments');

-- Should show:
-- markup_threads.has_attachments | boolean | false
-- markup_comments.attachments    | ARRAY   | '{}'
```

### Step 3: Deploy Updated Code

The extraction scripts (`getpayload.js`, `test_attachments.js`) are already updated to:
- Click each comment's attachment indicator
- Extract attachment URLs
- Include them in the payload with the `attachments` field

## Impact on Existing Data

### ✅ SAFE - No Data Loss

- Existing comments keep all their data
- New columns have safe defaults (`FALSE` and `'{}'`)
- No existing content is modified
- Migration is **idempotent** (safe to run multiple times)

### Data Before Migration

```sql
{
  "id": "comment-1",
  "content": "Fix this bug",
  "user": "John"
}
```

### Data After Migration

```sql
{
  "id": "comment-1",
  "content": "Fix this bug",
  "user": "John",
  "attachments": []  -- Empty array, no attachments
}
```

## Example Usage

### Querying Threads with Attachments

```sql
-- Get all threads that have attachments
SELECT * FROM markup_threads
WHERE has_attachments = TRUE;

-- Get threads with their attachment counts
SELECT 
  t.id,
  t.thread_name,
  COUNT(c.id) FILTER (WHERE array_length(c.attachments, 1) > 0) as comments_with_attachments
FROM markup_threads t
LEFT JOIN markup_comments c ON c.thread_id = t.id
GROUP BY t.id, t.thread_name
HAVING t.has_attachments = TRUE;
```

### Querying Comments with Attachments

```sql
-- Get all comments with attachments
SELECT 
  c.id,
  c.content,
  c.attachments,
  array_length(c.attachments, 1) as attachment_count
FROM markup_comments c
WHERE array_length(c.attachments, 1) > 0;

-- Get specific attachment URLs
SELECT 
  t.thread_name,
  c.pin_number,
  c.user_name,
  unnest(c.attachments) as attachment_url
FROM markup_comments c
JOIN markup_threads t ON t.id = c.thread_id
WHERE array_length(c.attachments, 1) > 0;
```

## Payload Structure

### New JSON Payload Format

```json
{
  "data": {
    "projectName": "My Project",
    "url": "https://app.markup.io/markup/...",
    "totalThreads": 5,
    "totalScreenshots": 10,
    "timestamp": "2025-10-15T10:30:00Z",
    "threads": [
      {
        "threadName": "Header Issue",
        "imageIndex": 1,
        "imagePath": "/screenshots/1.png",
        "comments": [
          {
            "id": "uuid",
            "index": 0,
            "pinNumber": 1,
            "content": "Please fix this\n\n📎 Attachments:\n- https://cdn.markup.io/image1.png",
            "user": "John Doe",
            "attachments": [
              "https://cdn.markup.io/image1.png",
              "https://cdn.markup.io/image2.jpg"
            ]
          }
        ]
      }
    ]
  }
}
```

## Testing

### Test the Complete Flow

1. **Run Test Script:**
   ```bash
   node test_attachments.js https://app.markup.io/markup/YOUR-ID
   ```

2. **Verify Console Output:**
   - Should show clicking attachment indicators
   - Should show extracted URLs
   - Should show URLs appended to content

3. **Check Database:**
   ```sql
   -- After inserting data, verify:
   SELECT 
     t.thread_name,
     t.has_attachments,
     c.pin_number,
     c.attachments
   FROM markup_threads t
   JOIN markup_comments c ON c.thread_id = t.id
   ORDER BY t.thread_name, c.pin_number;
   ```

## Rollback Plan

If needed, you can rollback the changes:

```sql
-- WARNING: This will delete attachment data
ALTER TABLE markup_comments DROP COLUMN IF EXISTS attachments;
ALTER TABLE markup_threads DROP COLUMN IF EXISTS has_attachments;

DROP TRIGGER IF EXISTS trigger_update_thread_has_attachments ON markup_comments;
DROP FUNCTION IF EXISTS update_thread_has_attachments();

DROP INDEX IF EXISTS idx_markup_threads_has_attachments;
DROP INDEX IF EXISTS idx_markup_comments_attachments;

-- Then restore the old insert_markup_payload function from setup_database.sql
```

## Benefits

1. **Separation of Concerns:** Attachments stored separately from content text
2. **Efficient Queries:** Indexes make it fast to find threads/comments with attachments
3. **Automatic Maintenance:** Triggers keep thread flags in sync
4. **Backward Compatible:** Works with existing data
5. **Type Safety:** PostgreSQL arrays ensure data integrity

## Next Steps

1. ✅ Run migration script
2. ✅ Deploy updated extraction code
3. ✅ Test with a sample Markup.io URL
4. ✅ Verify attachments are stored correctly
5. Monitor performance with indexes

## Support

If you encounter issues:

1. Check the migration verification queries
2. Review the trigger logic
3. Test with the SQL examples above
4. Check Supabase logs for errors

---

**Migration File:** `migrations/001_add_attachment_support.sql`  
**Documentation:** `migrations/README.md`  
**Updated Files:**
- `getpayload.js`
- `test_attachments.js`
