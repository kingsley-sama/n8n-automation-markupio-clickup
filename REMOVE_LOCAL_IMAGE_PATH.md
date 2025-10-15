# Remove Redundant local_image_path Column

## Issue

The `markup_threads` table had two columns storing the same screenshot URL:
- `image_path` 
- `local_image_path`

Both columns stored identical values, resulting in unnecessary data duplication.

---

## Problem

### Before (Redundant Storage)

**Database Schema:**
```sql
CREATE TABLE markup_threads (
    id UUID PRIMARY KEY,
    project_id UUID,
    thread_name VARCHAR(255),
    image_path TEXT,           -- Screenshot URL
    local_image_path TEXT,     -- ❌ Same URL duplicated!
    ...
);
```

**Example Data:**
```json
{
  "id": "abc-123",
  "thread_name": "Header Issue",
  "image_path": "https://supabase.co/storage/v1/object/public/markupio-screenshots/abc123.jpg",
  "local_image_path": "https://supabase.co/storage/v1/object/public/markupio-screenshots/abc123.jpg"
}
```

**Issues:**
- ❌ Duplicate storage of the same URL
- ❌ Wasted database space
- ❌ Two fields that mean the same thing
- ❌ Confusion about which field to use
- ❌ Extra data to maintain and update

---

## Solution

### After (Clean Storage)

**Database Schema:**
```sql
CREATE TABLE markup_threads (
    id UUID PRIMARY KEY,
    project_id UUID,
    thread_name VARCHAR(255),
    image_path TEXT,           -- ✅ Single screenshot URL field
    ...
);
```

**Example Data:**
```json
{
  "id": "abc-123",
  "thread_name": "Header Issue",
  "image_path": "https://supabase.co/storage/v1/object/public/markupio-screenshots/abc123.jpg"
}
```

**Benefits:**
- ✅ Single source of truth for screenshot URLs
- ✅ Reduced storage usage
- ✅ Clearer data model
- ✅ Less data to maintain
- ✅ Simpler API responses

---

## Changes Made

### 1. Database Schema

**Migration: `003_remove_local_image_path.sql`**

```sql
-- Remove the redundant column
ALTER TABLE markup_threads DROP COLUMN IF EXISTS local_image_path;
```

### 2. Database Functions

Updated `insert_markup_payload()` function:

**Before:**
```sql
INSERT INTO markup_threads (
    project_id,
    thread_name,
    image_path,
    local_image_path,  -- ❌ Removed
    has_attachments
)
VALUES (
    v_project_id,
    v_thread->>'threadName',
    v_thread->>'imagePath',
    v_thread->>'localImagePath',  -- ❌ Removed
    v_has_attachments
);
```

**After:**
```sql
INSERT INTO markup_threads (
    project_id,
    thread_name,
    image_path,
    has_attachments
)
VALUES (
    v_project_id,
    v_thread->>'threadName',
    v_thread->>'imagePath',
    v_has_attachments
);
```

### 3. Application Code

**File: `supabase-service.js`**

**Before:**
```javascript
threadsWithUrls.push({
  ...thread,
  imagePath: uploadedUrl,
  localImagePath: uploadedUrl  // ❌ Duplicate
});
```

**After:**
```javascript
threadsWithUrls.push({
  ...thread,
  imagePath: uploadedUrl  // ✅ Single field
});
```

**File: `db_response_helper.js`**

**Before:**
```javascript
const threads = project.markup_threads.map(thread => ({
  threadName: thread.thread_name,
  imagePath: thread.image_path,
  localImagePath: thread.local_image_path,  // ❌ Removed
  ...
}));
```

**After:**
```javascript
const threads = project.markup_threads.map(thread => ({
  threadName: thread.thread_name,
  imagePath: thread.image_path,  // ✅ Only one field
  ...
}));
```

### 4. Schema Files Updated

All schema and migration files updated:
- ✅ `supabase_schema.sql`
- ✅ `setup_database.sql`
- ✅ `migrations/001_add_attachment_support.sql`
- ✅ `migrations/002_remove_raw_payload.sql`
- ✅ `migrations/003_remove_local_image_path.sql` (new)

---

## API Response Changes

### Before

```json
{
  "projectName": "Website Redesign",
  "threads": [
    {
      "threadName": "Homepage",
      "imagePath": "https://supabase.co/storage/.../image1.jpg",
      "localImagePath": "https://supabase.co/storage/.../image1.jpg",
      "comments": [...]
    }
  ]
}
```

### After

```json
{
  "projectName": "Website Redesign",
  "threads": [
    {
      "threadName": "Homepage",
      "imagePath": "https://supabase.co/storage/.../image1.jpg",
      "comments": [...]
    }
  ]
}
```

**Impact:**
- API responses are cleaner and smaller
- Frontend code needs one less field to handle
- Screenshot URL is always at `thread.imagePath`

---

## Migration Steps

### Step 1: Run the Migration

```bash
# Using Supabase Dashboard
1. Open SQL Editor
2. Copy contents of migrations/003_remove_local_image_path.sql
3. Run the migration

# Or using psql
psql -h <host> -U <user> -d <database> -f migrations/003_remove_local_image_path.sql
```

### Step 2: Verify

```sql
-- Check column was removed
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'markup_threads'
ORDER BY ordinal_position;

-- Should NOT see local_image_path in results
```

### Step 3: Test

```bash
# Run extraction to verify everything works
node getpayload.js https://app.markup.io/markup/YOUR-ID
```

---

## Storage Savings

Assuming average screenshot URL length of ~150 characters:

**Before:**
- `image_path`: 150 bytes
- `local_image_path`: 150 bytes
- **Total per thread:** 300 bytes

**After:**
- `image_path`: 150 bytes
- **Total per thread:** 150 bytes

**Savings:** 50% reduction in URL storage per thread

For a project with 50 threads:
- **Before:** 15,000 bytes (14.6 KB)
- **After:** 7,500 bytes (7.3 KB)
- **Saved:** 7,500 bytes (7.3 KB) per project

---

## Rollback

If you need to restore the column (not recommended):

```sql
-- Add column back
ALTER TABLE markup_threads ADD COLUMN local_image_path TEXT;

-- Populate with same value as image_path
UPDATE markup_threads SET local_image_path = image_path;

-- Update function to include it (revert to old version in git history)
```

---

## Files Modified

### Database
- ✅ `supabase_schema.sql` - Removed column from CREATE TABLE
- ✅ `setup_database.sql` - Removed column from CREATE TABLE
- ✅ `migrations/001_add_attachment_support.sql` - Updated INSERT
- ✅ `migrations/002_remove_raw_payload.sql` - Updated INSERT
- ✅ `migrations/003_remove_local_image_path.sql` - New migration

### JavaScript
- ✅ `supabase-service.js` - Removed `localImagePath` from payload
- ✅ `db_response_helper.js` - Removed from API responses

### Documentation
- ✅ `migrations/README.md` - Added migration 003 documentation
- ✅ `REMOVE_LOCAL_IMAGE_PATH.md` - This file

---

## Testing Checklist

- [ ] Migration runs successfully
- [ ] Column no longer exists in `markup_threads`
- [ ] Function `insert_markup_payload()` works without errors
- [ ] Extraction script runs and stores data correctly
- [ ] API responses no longer include `localImagePath`
- [ ] Screenshot URLs are accessible at `thread.imagePath`
- [ ] No errors in application logs

---

## FAQ

### Q: Why were there two fields in the first place?

**A:** Likely leftover from an earlier design where there was a distinction between "local" file paths and "remote" URLs. Once everything moved to cloud storage (Supabase), both fields stored the same cloud URL.

### Q: Will this break existing code?

**A:** 
- ✅ **Backend:** No, all references updated
- ⚠️ **Frontend:** If your frontend uses `localImagePath`, update it to use `imagePath` instead

### Q: What happens to existing data?

**A:** The `image_path` column retains all screenshot URLs. The duplicate `local_image_path` column is simply dropped.

### Q: Can I still access old screenshots?

**A:** Yes! All screenshot URLs remain in the `image_path` field and are fully accessible.

### Q: Should I run this migration on production?

**A:** Yes, it's safe! The migration:
- Uses `DROP COLUMN IF EXISTS` (idempotent)
- Doesn't modify existing `image_path` data
- Only removes the duplicate column

---

## Related Changes

This is part of a series of storage optimizations:

1. **002_remove_raw_payload.sql** - Removed redundant JSONB payload storage
2. **003_remove_local_image_path.sql** - Removed redundant image path storage (this)
3. **REMOVE_ATTACHMENTS_FROM_CONTENT.md** - Removed attachments from content field

All aimed at reducing data duplication and optimizing storage.

---

**Updated:** October 15, 2025  
**Status:** ✅ Complete - Redundant `local_image_path` column removed  
**Migration:** `003_remove_local_image_path.sql`
