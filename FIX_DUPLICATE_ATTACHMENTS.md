# Fix: Duplicate Attachment URLs

## Issue

Attachment URLs were appearing twice in the `attachments` array for each comment.

### Example of the Problem

**Before Fix:**
```json
{
  "attachments": [
    "https://cdn.markup.io/image1.png",
    "https://cdn.markup.io/image1.png"  // ❌ Duplicate!
  ]
}
```

**After Fix:**
```json
{
  "attachments": [
    "https://cdn.markup.io/image1.png"  // ✅ Only once!
  ]
}
```

---

## Root Cause

The Markup.io page sometimes renders multiple `<img>` elements with the same `src` attribute (possibly for responsive design, loading states, or gallery views). Our selector was finding all of them:

```javascript
// This selector finds ALL matching images, including duplicates
document.querySelectorAll('img.associated-file-content.attachment-thumbnail');
```

When we extracted URLs, we were adding them without checking for duplicates.

---

## Solution

Added deduplication logic using a `Set` to track seen URLs:

### Before

```javascript
const attachmentUrls = await page.evaluate(() => {
  const urls = [];
  const images = document.querySelectorAll('img.associated-file-content.attachment-thumbnail');
  
  images.forEach(img => {
    let url = img.getAttribute('src');
    if (url && url.trim() && !url.startsWith('data:')) {
      if (url.includes('?')) {
        url = url.split('?')[0];
      }
      urls.push(url);  // ❌ No duplicate check
    }
  });
  
  return urls;
});
```

### After

```javascript
const attachmentUrls = await page.evaluate(() => {
  const urls = [];
  const seen = new Set(); // ✨ Track seen URLs
  const images = document.querySelectorAll('img.associated-file-content.attachment-thumbnail');
  
  images.forEach(img => {
    let url = img.getAttribute('src');
    if (url && url.trim() && !url.startsWith('data:')) {
      if (url.includes('?')) {
        url = url.split('?')[0];
      }
      // ✅ Only add if not already seen
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }
  });
  
  return urls;
});
```

---

## How It Works

1. **Create a Set** - `const seen = new Set()` - Fast O(1) lookup for duplicates
2. **Check before adding** - `if (!seen.has(url))`
3. **Track the URL** - `seen.add(url)`
4. **Add to array** - `urls.push(url)`

This ensures each unique URL only appears once in the final array.

---

## Files Updated

✅ **`getpayload.js`** - Production extraction script
✅ **`test_attachments.js`** - Test script

---

## Testing

### Before Fix

```bash
node test_attachments.js https://app.markup.io/markup/YOUR-ID
```

**Output:**
```
📎 Pin 1: Clicking to reveal attachments...
   ✅ Found 2 attachment(s)
      - https://cdn.markup.io/image1.png
      - https://cdn.markup.io/image1.png  ❌ Duplicate!
```

### After Fix

```bash
node test_attachments.js https://app.markup.io/markup/YOUR-ID
```

**Output:**
```
📎 Pin 1: Clicking to reveal attachments...
   ✅ Found 1 attachment(s)
      - https://cdn.markup.io/image1.png  ✅ Only once!
```

---

## Impact

### Database Storage

**Before:**
```sql
-- Wastes storage with duplicates
attachments: ['url1', 'url1', 'url2', 'url2']
```

**After:**
```sql
-- Clean, unique URLs only
attachments: ['url1', 'url2']
```

### API Response

**Before:**
```json
{
  "comments": [{
    "attachments": [
      "https://cdn.markup.io/img.png",
      "https://cdn.markup.io/img.png"
    ]
  }]
}
```

**After:**
```json
{
  "comments": [{
    "attachments": [
      "https://cdn.markup.io/img.png"
    ]
  }]
}
```

---

## Why This Happens

The Markup.io interface may render duplicate images for:

1. **Responsive design** - Different image sizes for different viewports
2. **Gallery/lightbox** - Thumbnail + full-size image both in DOM
3. **Loading states** - Placeholder + actual image
4. **Framework rendering** - React/Vue components rendering multiple instances

Our fix ensures we only capture unique URLs regardless of DOM structure.

---

## Performance Impact

✅ **Minimal** - Set operations are O(1) for lookups
✅ **Better** - Actually reduces data to process/store
✅ **Faster** - Smaller arrays in database and API responses

---

## Edge Cases Handled

### Multiple Attachments (Different URLs)
```javascript
// Works correctly - all unique URLs kept
['url1', 'url2', 'url3'] // ✅
```

### Single Attachment (Duplicated in DOM)
```javascript
// Correctly deduplicated
['url1', 'url1', 'url1'] → ['url1'] // ✅
```

### No Attachments
```javascript
// Still works fine
[] // ✅
```

### Mixed Duplicates
```javascript
// Keeps only unique
['url1', 'url2', 'url1', 'url3', 'url2'] → ['url1', 'url2', 'url3'] // ✅
```

---

## Verification

After deploying, verify with:

```bash
# Test extraction
node test_attachments.js https://app.markup.io/markup/YOUR-ID

# Check database
psql -c "
SELECT 
  t.thread_name,
  c.pin_number,
  c.attachments,
  array_length(c.attachments, 1) as count
FROM markup_comments c
JOIN markup_threads t ON t.id = c.thread_id
WHERE array_length(c.attachments, 1) > 0;
"

# Verify API response
curl http://localhost:3000/project/123 | jq '.threads[].comments[].attachments'
```

---

## Rollback

If needed (though unlikely), revert to old logic:

```javascript
// Remove the Set and duplicate check
images.forEach(img => {
  let url = img.getAttribute('src');
  if (url && url.trim() && !url.startsWith('data:')) {
    if (url.includes('?')) {
      url = url.split('?')[0];
    }
    urls.push(url); // Back to no deduplication
  }
});
```

But this is **not recommended** as it brings back the duplicate issue.

---

## Summary

✅ **Problem:** Duplicate attachment URLs in arrays
✅ **Cause:** Multiple DOM elements with same src
✅ **Solution:** Deduplication using Set
✅ **Impact:** Cleaner data, less storage, accurate counts
✅ **Files:** `getpayload.js`, `test_attachments.js`

---

**Fixed:** October 15, 2025  
**Status:** Ready to deploy
