# Fix: Remove local_image_path Column Error

## Problem
You're getting this error:
```
Error in insert_markup_payload: column "local_image_path" of relation "markup_threads" does not exist (SQLSTATE: 42703)
```

## Root Cause
Your database function `insert_markup_payload` still has the old version that tries to insert into the `local_image_path` column, which you've already removed from your database.

## Solution

### ✅ Run This Migration in Supabase SQL Editor

Open your Supabase SQL Editor and run the contents of this file:

📄 **`migrations/004_fix_insert_function_remove_local_image_path.sql`**

This migration will:
1. ✅ Remove `local_image_path` column (if it still exists)
2. ✅ Drop all old function variations
3. ✅ Create the correct `insert_markup_payload` function with proper signature `(BIGINT, JSONB)`
4. ✅ Ensure the function only uses `image_path` (NOT `local_image_path`)
5. ✅ Add attachment support
6. ✅ Verify the migration succeeded

### How to Apply

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy the entire contents of `migrations/004_fix_insert_function_remove_local_image_path.sql`
5. Paste it into the SQL editor
6. Click **Run**

### Expected Output

You should see these success messages:
```
✅ Migration 004 completed successfully
✓ Removed local_image_path column from markup_threads
✓ Updated insert_markup_payload function (BIGINT, JSONB signature)
✓ Function no longer references local_image_path
```

## What Was Changed

### Before (OLD - BROKEN)
```sql
INSERT INTO markup_threads (
    project_id,
    thread_name,
    image_index,
    image_path,
    local_image_path,  -- ❌ DUPLICATE COLUMN
    image_filename,
    has_attachments
)
```

### After (NEW - FIXED)
```sql
INSERT INTO markup_threads (
    project_id,
    thread_name,
    image_index,
    image_path,        -- ✅ ONLY ONE URL COLUMN
    image_filename,
    has_attachments
)
```

## Verification

After running the migration, test your application. The error should be gone!

If you still see errors, check:

1. **Did the migration run successfully?**
   ```sql
   -- Check if column still exists (should return 0 rows)
   SELECT column_name 
   FROM information_schema.columns 
   WHERE table_name = 'markup_threads' 
   AND column_name = 'local_image_path';
   ```

2. **Is the function updated?**
   ```sql
   -- Check function exists
   SELECT proname, pronargs 
   FROM pg_proc p
   JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'public'
   AND p.proname = 'insert_markup_payload';
   ```

## Files Updated

✅ `/migrations/004_fix_insert_function_remove_local_image_path.sql` - **NEW MIGRATION**
✅ `/setup_database.sql` - Updated function
✅ `/supabase_schema.sql` - Updated function

---

**Once you run the migration, your error will be fixed!** 🎉
