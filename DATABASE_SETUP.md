# Database Setup Guide

## Overview

This guide helps you set up the complete database schema including tables for screenshot storage, thread data, error logging, and smart matching functionality.

## Problem Scenarios

### Error: Function not found
```
Failed to insert normalized data: Could not find the function public.insert_markup_payload
```
**Solution**: Run the complete `setup_database.sql` script

### Error: Table does not exist
```
relation "markup_threads" does not exist
```
**Solution**: Create all tables using the setup script

## Solution

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Click on **SQL Editor** in the left sidebar
3. Create a new query
4. Copy and paste the **entire contents** of `setup_database.sql` 
5. Click **Run** (or press Ctrl+Enter)
6. Wait for it to complete - you should see "Success" messages

### Option 2: Using psql Command Line

If you have psql installed and have your database connection string:

```bash
psql "your-connection-string-here" -f setup_database.sql
```

### Option 3: Manual Step-by-Step (If having issues)

Run each section separately in Supabase SQL Editor:

1. **First**: Create the main tables
   ```sql
   -- Run lines 1-47 of setup_database.sql (scraped_data and error_logs tables)
   ```

2. **Second**: Create the markup tables
   ```sql
   -- Run lines 49-86 (markup_projects, threads, comments tables)
   ```

3. **Third**: Create indexes
   ```sql
   -- Run lines 88-103 (all CREATE INDEX statements)
   ```

4. **Fourth**: Create triggers
   ```sql
   -- Run lines 105-147 (update_updated_at function and triggers)
   ```

5. **Fifth**: Create the insert function
   ```sql
   -- Run lines 149-226 (insert_markup_payload function)
   ```

## Verification

After running the setup, verify everything is created by running:

```sql
-- Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND (table_name LIKE '%markup%' OR table_name LIKE '%scraped%')
ORDER BY table_name;

-- Check function exists
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name = 'insert_markup_payload';
```

Expected output:
- **Tables**: `markup_comments`, `markup_projects`, `markup_threads`, `scraped_data`, `scraping_error_logs`
- **Function**: `insert_markup_payload`

## What Each Table Does

- **`scraped_data`**: Stores basic scraping session info (URL, timestamp, screenshots paths)
- **`markup_projects`**: Stores project-level information (project name, URL, total threads)
- **`markup_threads`**: Stores individual threads (comments grouped by location) with image paths
- **`markup_comments`**: Stores individual comments (user, content, pin number)
- **`scraping_error_logs`**: Stores all errors with detailed context for monitoring
  - Image name extraction failures
  - Navigation errors during smart matching
  - Incomplete thread matches
  - Fatal errors with stack traces
  - Operation context (what was happening when error occurred)

## Error Logging Details

The `scraping_error_logs` table includes:
- **error_message**: Human-readable error description
- **error_details**: JSONB field containing:
  - `operation`: Which operation failed (e.g., "captureImagesMatchingThreads")
  - `matchedCount` / `expectedCount`: Progress information
  - `unmatchedThreads`: List of threads that couldn't be matched
  - `stack`: Full error stack trace
  - Additional context specific to the error type

See [ERROR_LOGGING.md](./ERROR_LOGGING.md) for complete error logging documentation.

## Troubleshooting

### "Relation already exists" errors
This is fine! It means some tables already exist. The script uses `CREATE TABLE IF NOT EXISTS` to avoid conflicts.

### "Function already exists" errors
This is fine! The script uses `CREATE OR REPLACE FUNCTION` to update the function.

### Connection issues
Make sure:
1. Your `.env` file has correct `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
2. Your Supabase project is active and accessible

## Features Enabled by Database Schema

### Smart Screenshot Matching
- Threads table stores image paths for matched screenshots
- Error logs track incomplete matches for monitoring
- Projects table maintains thread counts for validation

### URL-Based Deduplication
- Unique constraints prevent duplicate URLs
- Updated_at timestamps track record modifications
- Old image cleanup handled automatically

### Comprehensive Error Tracking
- All errors logged with full context
- Query errors by operation type, URL, or session
- Monitor incomplete matches and failure patterns

## Useful Queries

### Monitor Smart Matching Success
```sql
-- Check for incomplete matches
SELECT 
  url,
  error_details->>'matchedCount' as matched,
  error_details->>'expectedCount' as expected,
  error_details->>'unmatchedThreads' as unmatched,
  failed_at
FROM scraping_error_logs 
WHERE error_details->>'operation' = 'captureImagesMatchingThreads - incomplete'
ORDER BY failed_at DESC;
```

### View Project Statistics
```sql
SELECT 
  p.project_name,
  p.total_threads,
  COUNT(DISTINCT t.id) as threads_with_screenshots,
  COUNT(c.id) as total_comments
FROM markup_projects p
LEFT JOIN markup_threads t ON p.id = t.project_id
LEFT JOIN markup_comments c ON t.id = c.thread_id
GROUP BY p.id, p.project_name, p.total_threads
ORDER BY p.created_at DESC;
```

### Check Error Rates
```sql
SELECT 
  DATE(failed_at) as error_date,
  COUNT(*) as error_count,
  COUNT(DISTINCT url) as affected_urls
FROM scraping_error_logs
WHERE failed_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(failed_at)
ORDER BY error_date DESC;
```

## Additional Resources

- **[README.md](./README.md)**: Complete system documentation
- **[SMART_SCREENSHOT_MATCHING.md](./SMART_SCREENSHOT_MATCHING.md)**: Smart matching details
- **[ERROR_LOGGING.md](./ERROR_LOGGING.md)**: Error monitoring guide
- **[QUICKSTART.md](./QUICKSTART.md)**: Quick setup guide
3. Your IP is allowed in Supabase settings (if using connection pooler)

### Still having issues?
Check the Supabase logs:
1. Go to Supabase Dashboard
2. Click **Logs** → **Postgres Logs**
3. Look for error messages related to table creation

## After Setup

Once tables are created, your API should work:

```bash
# Test the complete-payload endpoint
curl -X POST http://localhost:3000/complete-payload \
  -H "Content-Type: application/json" \
  -d '{"url": "https://app.markup.io/markup/your-project-id"}'

# Test the project-by-name endpoint
curl "http://localhost:3000/project-by-name?name=yourproject"
```
