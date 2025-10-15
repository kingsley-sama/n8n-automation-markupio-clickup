# Database Migrations

This directory contains database migration scripts for the Markup.io automation project.

## How to Run Migrations

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the contents of the migration file
5. Click **Run** to execute

### Option 2: Using psql CLI

```bash
psql -h <your-host> -U <your-user> -d <your-database> -f migrations/001_add_attachment_support.sql
```

## Migration History

### 002_remove_raw_payload.sql (October 15, 2025)

**Purpose:** Remove redundant `raw_payload` column from `markup_projects` table

**Changes:**
- ✅ Drops `raw_payload` (JSONB) column from `markup_projects` table
- ✅ Updates `insert_markup_payload()` function to not use `raw_payload`
- ✅ **Safe for existing data** - Column can be dropped without affecting functionality
- ✅ **Storage optimization** - Removes duplicate data storage

**Why Remove It:**
- All data is already normalized into separate tables (`markup_threads`, `markup_comments`)
- The raw payload was redundant and wasting database storage
- No application code uses this column
- Can always reconstruct the full payload from normalized tables

**What Gets Removed:**
```sql
-- This column is no longer needed
raw_payload JSONB
```

**Rollback (if needed):**
```sql
-- Add column back (though not recommended)
ALTER TABLE markup_projects ADD COLUMN raw_payload JSONB;

-- Update function to include it again (see setup_database.sql for old version)
```

---

### 001_add_attachment_support.sql (October 15, 2025)

**Purpose:** Add attachment support to the database schema

**Changes:**
- ✅ Adds `has_attachments` (BOOLEAN) column to `markup_threads` table
- ✅ Adds `attachments` (TEXT[]) column to `markup_comments` table
- ✅ Creates indexes for better query performance
- ✅ Creates trigger to automatically update thread attachment status
- ✅ Updates `insert_markup_payload()` function to handle attachments
- ✅ **Safe for existing data** - uses `IF NOT EXISTS` and `DEFAULT` values

**What It Does:**

1. **Thread Level:** Tracks if any comment in a thread has attachments
2. **Comment Level:** Stores array of attachment URLs for each comment
3. **Automatic Updates:** Trigger ensures thread flag stays in sync with comments
4. **Performance:** Indexes speed up queries for threads/comments with attachments

**Example Data Structure:**

```sql
-- Comment with attachments
{
  "id": "uuid",
  "content": "Please fix this issue",
  "attachments": [
    "https://cdn.markup.io/image1.png",
    "https://cdn.markup.io/image2.jpg"
  ]
}

-- Thread with attachments flag
{
  "id": "uuid",
  "thread_name": "Header Issue",
  "has_attachments": true  -- Automatically set to true
}
```

**Rollback (if needed):**

```sql
-- Remove columns (WARNING: This will delete attachment data)
ALTER TABLE markup_comments DROP COLUMN IF EXISTS attachments;
ALTER TABLE markup_threads DROP COLUMN IF EXISTS has_attachments;

-- Remove trigger and function
DROP TRIGGER IF EXISTS trigger_update_thread_has_attachments ON markup_comments;
DROP FUNCTION IF EXISTS update_thread_has_attachments();

-- Remove indexes
DROP INDEX IF EXISTS idx_markup_threads_has_attachments;
DROP INDEX IF EXISTS idx_markup_comments_attachments;
```

## Testing the Migration

After running the migration, you can test it with:

```sql
-- Check if columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name IN ('markup_threads', 'markup_comments')
  AND column_name IN ('has_attachments', 'attachments');

-- Test inserting a comment with attachments
INSERT INTO markup_comments (thread_id, comment_index, pin_number, content, user_name, attachments)
VALUES (
  'your-thread-id',
  1,
  1,
  'Test comment',
  'Test User',
  ARRAY['https://example.com/image1.png', 'https://example.com/image2.jpg']
);

-- Verify the thread's has_attachments flag was automatically updated
SELECT id, thread_name, has_attachments
FROM markup_threads
WHERE id = 'your-thread-id';
```

## Notes

- All migrations are **idempotent** - safe to run multiple times
- Uses `IF NOT EXISTS` to avoid errors on re-runs
- Existing data is **never modified** - only new columns added with safe defaults
- Triggers handle automatic updates, no manual maintenance needed
