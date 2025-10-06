# Comprehensive Error Logging Implementation

## Overview

All errors during smart screenshot matching are now logged to the `scraping_error_logs` table in Supabase for proper monitoring and debugging.

## Error Categories Logged

### 1. Image Name Extraction Errors
**When:** Fails to get image name from `.mk-inline-edit__display span.value`

**Context Logged:**
```json
{
  "url": "https://app.markup.io/...",
  "title": "Project Title",
  "operation": "getCurrentImageName",
  "selector": ".mk-inline-edit__display span.value",
  "stack": "Error stack trace..."
}
```

**Example Error:**
```
Failed to get image name from fullscreen view: Element not found
```

---

### 2. Smart Matching Navigation Errors
**When:** Error occurs while navigating to next image during smart matching

**Context Logged:**
```json
{
  "url": "https://app.markup.io/...",
  "title": "Project Title",
  "operation": "captureImagesMatchingThreads - navigation",
  "imageIndex": 3,
  "matchedSoFar": 2,
  "totalThreads": 5,
  "attempts": 8,
  "stack": "Error stack trace..."
}
```

**Example Error:**
```
Error navigating to image 3: Button not found
```

---

### 3. Incomplete Thread Matching Errors
**When:** Not all threads could be matched with images

**Context Logged:**
```json
{
  "url": "https://app.markup.io/...",
  "title": "Project Title",
  "operation": "captureImagesMatchingThreads - incomplete",
  "matchedCount": 3,
  "expectedCount": 5,
  "unmatchedThreads": ["02. missing-file.jpg", "04. another-missing.jpg"],
  "matchedThreads": ["01. file1.jpg", "03. file3.jpg", "05. file5.jpg"],
  "totalAttempts": 12
}
```

**Example Error:**
```
Only matched 3/5 threads. Unmatched: 02. missing-file.jpg, 04. another-missing.jpg
```

---

### 4. Fatal Smart Matching Errors
**When:** Catastrophic failure in the smart matching process

**Context Logged:**
```json
{
  "url": "https://app.markup.io/...",
  "title": "Project Title",
  "operation": "captureImagesMatchingThreads - fatal",
  "threadNames": ["01. file1.jpg", "02. file2.jpg", "03. file3.jpg"],
  "matchedCount": 1,
  "expectedCount": 3,
  "attempts": 5,
  "stack": "Error stack trace..."
}
```

**Example Error:**
```
Fatal error in smart screenshot matching: Page crashed
```

---

### 5. Thread Data Extraction Errors
**When:** Failed to extract thread data from the page

**Context Logged:**
```json
{
  "url": "https://app.markup.io/...",
  "operation": "extractThreadDataFromPage",
  "sessionId": "abc-123-def",
  "stack": "Error stack trace..."
}
```

**Example Error:**
```
Failed to extract thread data: Thread list not found
```

---

### 6. Screenshot Capture Errors
**When:** Smart or sequential screenshot capture fails

**Context Logged:**
```json
{
  "url": "https://app.markup.io/...",
  "operation": "captureImagesMatchingThreads",
  "sessionId": "abc-123-def",
  "threadNames": ["01. file1.jpg", "02. file2.jpg"],
  "capturedCount": 1,
  "stack": "Error stack trace..."
}
```

**Example Error:**
```
Smart capture failed: Fullscreen mode unavailable
```

---

### 7. Overlay Handling Errors
**When:** Failed to handle overlays (non-fatal, continues execution)

**Context Logged:**
```json
{
  "url": "https://app.markup.io/...",
  "operation": "handleOverlays",
  "sessionId": "abc-123-def",
  "stack": "Error stack trace..."
}
```

**Example Error:**
```
Failed to handle overlays: Close button not found
```

---

### 8. Fullscreen Activation Errors
**When:** Failed to enable fullscreen mode (non-fatal, continues execution)

**Context Logged:**
```json
{
  "url": "https://app.markup.io/...",
  "operation": "enableFullscreen",
  "sessionId": "abc-123-def",
  "stack": "Error stack trace..."
}
```

**Example Error:**
```
Failed to enable fullscreen (continuing anyway): Fullscreen button disabled
```

---

### 9. Database Save Errors
**When:** Failed to save payload to Supabase

**Context Logged:**
```json
{
  "url": "https://app.markup.io/...",
  "operation": "saveCompletePayloadNormalized",
  "sessionId": "abc-123-def",
  "totalThreads": 5,
  "totalScreenshots": 5,
  "stack": "Error stack trace..."
}
```

**Example Error:**
```
Failed to save payload to database: Connection timeout
```

---

### 10. Complete Payload Extraction Errors
**When:** Final catch-all for any unhandled errors

**Context Logged:**
```json
{
  "url": "https://app.markup.io/...",
  "operation": "getCompletePayload - fatal",
  "sessionId": "abc-123-def",
  "stack": "Error stack trace..."
}
```

**Example Error:**
```
Complete payload extraction failed: Unknown error
```

---

## Error Log Table Structure

All errors are saved to the `scraping_error_logs` table:

```sql
CREATE TABLE scraping_error_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID,
  url TEXT,
  title TEXT,
  error_message TEXT,
  number_of_images INTEGER,
  error_details JSONB,  -- Contains the detailed context
  options JSONB,
  failed_at TIMESTAMP,
  status TEXT DEFAULT 'failed'
);
```

## Querying Errors

### Get all smart matching errors:
```sql
SELECT * FROM scraping_error_logs 
WHERE error_details->>'operation' LIKE '%captureImagesMatchingThreads%'
ORDER BY failed_at DESC;
```

### Get incomplete matching errors:
```sql
SELECT 
  url,
  error_message,
  error_details->>'matchedCount' as matched,
  error_details->>'expectedCount' as expected,
  error_details->>'unmatchedThreads' as unmatched,
  failed_at
FROM scraping_error_logs 
WHERE error_details->>'operation' = 'captureImagesMatchingThreads - incomplete'
ORDER BY failed_at DESC;
```

### Get navigation errors:
```sql
SELECT * FROM scraping_error_logs 
WHERE error_details->>'operation' = 'captureImagesMatchingThreads - navigation'
ORDER BY failed_at DESC;
```

### Get errors for a specific URL:
```sql
SELECT * FROM scraping_error_logs 
WHERE url = 'https://app.markup.io/markup/your-id'
ORDER BY failed_at DESC;
```

### Get errors by session:
```sql
SELECT * FROM scraping_error_logs 
WHERE session_id = 'your-session-id'
ORDER BY failed_at DESC;
```

### Get all fatal errors:
```sql
SELECT * FROM scraping_error_logs 
WHERE error_details->>'operation' LIKE '%fatal%'
ORDER BY failed_at DESC;
```

## Monitoring Dashboard Queries

### Error rate over time:
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

### Most common errors:
```sql
SELECT 
  error_details->>'operation' as operation,
  COUNT(*) as occurrence_count,
  MAX(failed_at) as last_occurrence
FROM scraping_error_logs
WHERE failed_at > NOW() - INTERVAL '7 days'
GROUP BY error_details->>'operation'
ORDER BY occurrence_count DESC;
```

### URLs with most errors:
```sql
SELECT 
  url,
  COUNT(*) as error_count,
  MAX(failed_at) as last_error
FROM scraping_error_logs
WHERE failed_at > NOW() - INTERVAL '7 days'
GROUP BY url
ORDER BY error_count DESC
LIMIT 10;
```

## Error Response Flow

```
┌─────────────────────────────────────┐
│  Smart Matching Process Starts      │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│  Try to get current image name      │
└────────┬─────────────────┬──────────┘
         │                 │
    Success              Error
         │                 │
         ▼                 ▼
    Continue      ┌──────────────────┐
                  │ Log to DB:       │
                  │ - Error message  │
                  │ - URL            │
                  │ - Operation      │
                  │ - Stack trace    │
                  │ - Full context   │
                  └──────────────────┘
```

## Benefits of Comprehensive Logging

1. **Complete Visibility**: Every error is tracked with full context
2. **Easy Debugging**: Stack traces and detailed context help identify root causes
3. **Monitoring**: Query errors by type, URL, session, or time period
4. **Trend Analysis**: Identify patterns and recurring issues
5. **Retry Support**: Errors contain all info needed to retry failed operations
6. **Accountability**: Know exactly what failed, when, and why

## Best Practices

1. **Regular Monitoring**: Check error logs daily
2. **Alert Setup**: Set up alerts for critical errors (fatal errors, high error rates)
3. **Error Analysis**: Review incomplete matches to improve matching logic
4. **Cleanup**: Archive old error logs after resolution
5. **Pattern Recognition**: Look for common URLs or operations that fail frequently

## Example Error Log Entry

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "session_id": "123e4567-e89b-12d3-a456-426614174000",
  "url": "https://app.markup.io/markup/bb3022bd-01f0-4ed5-8fbb-1c5da2e3bdc7",
  "title": "Design Review - Homepage",
  "error_message": "Only matched 3/5 threads. Unmatched: 02. header-mobile.jpg, 04. footer-section.jpg",
  "number_of_images": 5,
  "error_details": {
    "operation": "captureImagesMatchingThreads - incomplete",
    "matchedCount": 3,
    "expectedCount": 5,
    "unmatchedThreads": [
      "02. header-mobile.jpg",
      "04. footer-section.jpg"
    ],
    "matchedThreads": [
      "01. hero-section.jpg",
      "03. features-grid.jpg",
      "05. cta-banner.jpg"
    ],
    "totalAttempts": 15
  },
  "options": {
    "numberOfImages": 5,
    "threadNames": ["01. hero-section.jpg", "02. header-mobile.jpg", ...],
    "debugMode": false
  },
  "failed_at": "2025-10-06T14:30:45.123Z",
  "status": "failed"
}
```

## Integration with Existing Systems

The error logging integrates seamlessly with:
- ✅ Existing `scraping_error_logs` table
- ✅ SupabaseService class
- ✅ Session tracking system
- ✅ Current error handling patterns
- ✅ Retry mechanisms

No schema changes or migrations needed!
