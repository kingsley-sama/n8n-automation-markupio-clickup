# Attachment Extraction Update - Simplified Approach

## Date: October 15, 2025

## Changes Made

### Problem
The original attachment extraction logic was too complex and tried to find modal dialogs and various link types. The actual attachment URLs are directly available in `<img>` tags with specific classes.

### Solution
Simplified the attachment extraction to:
1. Click the attachment container (`.thread-list-item-attachment-count`)
2. Wait for the file list to expand
3. Find `<img class="associated-file-content attachment-thumbnail">` elements
4. Extract the `src` attribute
5. Strip query parameters (e.g., `?fit=contain&width=96`)
6. Collapse the attachment list by clicking again

### Updated Logic

#### Before:
- Looked for SVG icons
- Waited for modals to appear
- Searched multiple selectors for links
- Tried multiple ways to close modals
- Kept query parameters in URLs

#### After:
- Looks for attachment container directly
- Clicks container to expand inline
- Targets specific image class: `associated-file-content attachment-thumbnail`
- Strips query parameters from URLs
- Collapses by clicking container again
- No modal handling needed

### URL Processing

Example URL transformation:
```
Input:  https://media.markup.io/green/message-attachment/5ecb1d27-e172-4179-aab4-0910507ad955//9a37f4ea-2a6a-4d15-81bd-781e33540b43.jpg?fit=contain&width=96
Output: https://media.markup.io/green/message-attachment/5ecb1d27-e172-4179-aab4-0910507ad955//9a37f4ea-2a6a-4d15-81bd-781e33540b43.jpg
```

The query parameters are removed so you get the raw image URL without sizing constraints.

### Files Updated

1. **test_attachments.js** - Test script with headed browser
2. **getpayload.js** - Production extraction script

Both files now use the same simplified logic.

### Code Structure

```javascript
// Look for attachment container
const attachmentContainer = await messageEl.$('.thread-list-item-attachment-count');

if (attachmentContainer) {
  // Click to expand
  await attachmentContainer.click();
  await delay(1500);
  
  // Get all attachment images
  const attachmentImages = await page.$$('img.associated-file-content.attachment-thumbnail');
  
  for (const imgEl of attachmentImages) {
    let url = await page.evaluate(el => el.getAttribute('src'), imgEl);
    
    // Strip query parameters
    if (url.includes('?')) {
      url = url.split('?')[0];
    }
    
    attachmentUrls.push(url);
  }
  
  // Collapse
  await attachmentContainer.click();
}
```

### Benefits

1. ✅ **Simpler**: Less code, fewer edge cases
2. ✅ **Faster**: No waiting for modals, shorter delays
3. ✅ **More reliable**: Directly targets the correct elements
4. ✅ **Clean URLs**: Strips unnecessary query parameters
5. ✅ **No modal handling**: Works with inline expansion

### Testing

Run the test with headed browser to see it in action:
```bash
node test_attachments.js "https://app.markup.io/markup/YOUR-ID"
```

You'll see:
- Attachment containers being clicked
- File lists expanding inline
- Image URLs being extracted and cleaned
- Lists collapsing after extraction

### Integration

The same logic is now in both:
- `test_attachments.js` (for testing/debugging)
- `getpayload.js` (for production use)

Both use:
- Direct container targeting
- Specific image class selection
- Query parameter stripping
- Inline expand/collapse (no modals)

### Result Format

Attachments are appended to comment text as before:
```
Comment text goes here...

📎 Attachments:
- https://media.markup.io/green/message-attachment/abc123/image1.jpg
- https://media.markup.io/green/message-attachment/abc123/image2.png
```

Query parameters are removed, giving you clean, shareable image URLs.
