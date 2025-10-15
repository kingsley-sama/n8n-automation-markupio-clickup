# Quick Start: Adding Attachment Support

## 🚀 5-Minute Setup

### 1. Run the Migration (2 minutes)

Open Supabase SQL Editor and run:
```bash
migrations/001_add_attachment_support.sql
```

Or using psql:
```bash
psql -h your-host -U your-user -d your-db -f migrations/001_add_attachment_support.sql
```

### 2. Verify Migration (1 minute)

```sql
-- Should return 2 rows
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name IN ('markup_threads', 'markup_comments')
  AND column_name IN ('has_attachments', 'attachments');
```

### 3. Test Extraction (2 minutes)

```bash
node test_attachments.js https://app.markup.io/markup/YOUR-MARKUP-ID
```

Watch the browser window:
- ✅ Clicks attachment indicators
- ✅ Extracts attachment URLs
- ✅ Assigns to correct comments by pin number

### 4. Deploy to Production

Your code is already updated! Just ensure the migration is run on your production database.

---

## 📋 What Changed?

### Database
- **markup_threads:** Added `has_attachments` (boolean)
- **markup_comments:** Added `attachments` (text array)
- **Automatic:** Trigger keeps thread flags in sync

### Code
- **Extraction:** Now clicks each comment's attachment indicator individually
- **Matching:** Uses pin numbers to match attachments to correct comments
- **Payload:** Includes `attachments: [urls]` array in each comment

---

## 🎯 Key Features

1. **No Navigation Issues** - Clicks attachment indicators directly instead of using Next/Previous buttons
2. **Pin Matching** - Attachments go to the correct comment by pin number
3. **Safe for Existing Data** - New columns have defaults, no data loss
4. **Automatic Updates** - Trigger maintains thread `has_attachments` flag
5. **Performance** - Indexes make queries fast

---

## 📊 Example Payload

```json
{
  "threads": [
    {
      "threadName": "Header Issue",
      "comments": [
        {
          "pinNumber": 1,
          "content": "Fix this\n\n📎 Attachments:\n- https://...",
          "user": "John",
          "attachments": ["https://cdn.markup.io/img1.png"]
        }
      ]
    }
  ]
}
```

---

## 🔍 Quick Queries

```sql
-- Threads with attachments
SELECT * FROM markup_threads WHERE has_attachments = TRUE;

-- All attachment URLs
SELECT unnest(attachments) FROM markup_comments;

-- Comments with multiple attachments
SELECT * FROM markup_comments WHERE array_length(attachments, 1) > 1;
```

---

## 📚 Full Documentation

- **Migration Details:** `migrations/README.md`
- **Schema Changes:** `ATTACHMENT_DATABASE_SCHEMA.md`
- **Extraction Logic:** `ATTACHMENT_PIN_MATCHING.md`
- **Testing Guide:** `TEST_ATTACHMENTS_GUIDE.md`

---

**Ready to go! 🎉**
