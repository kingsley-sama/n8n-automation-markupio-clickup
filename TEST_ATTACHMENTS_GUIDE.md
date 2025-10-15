# Attachment Extraction Test Guide

## Quick Start

### Method 1: Using Node directly
```bash
node test_attachments.js "https://app.markup.io/markup/your-markup-id"
```

### Method 2: Using the shell script
```bash
chmod +x test_attachments.sh
./test_attachments.sh "https://app.markup.io/markup/your-markup-id"
```

### Method 3: Using environment variable
```bash
export MARKUP_URL="https://app.markup.io/markup/your-markup-id"
node test_attachments.js
```

## What the Test Does

The test script runs Puppeteer in **headed mode** (visible browser) with these features:

1. **Opens a visible Chrome browser** - You can watch the extraction happen
2. **DevTools automatically open** - See console logs and network requests
3. **Slow motion mode** - Actions are slowed down by 100ms for visibility
4. **Detailed console logging** - Every step is logged with emojis for clarity

## What You'll See

### Browser Actions:
- ✅ Page loads and navigates to the Markup.io URL
- ✅ Thread list expands automatically
- ✅ All thread groups expand
- ✅ For each comment with attachments:
  - Finds the attachment SVG icon
  - Clicks the icon to reveal attachments
  - Extracts all attachment URLs
  - Closes the attachment modal
  - Appends URLs to comment text

### Console Output:
```
🧪 Starting headed test for attachment extraction...
🌐 URL: https://app.markup.io/markup/...
📂 Navigating to page...
⏳ Waiting for thread list...
📋 Project: My Project Name
📂 Expanding thread list...
🔽 Expanding all thread groups...
✅ Expanded 3 thread groups

🔍 Starting extraction with attachment detection...

📌 Thread: 01. Homepage.png
   💬 Found 2 comments

   🔹 Comment 1/2
      ID: abc-123-456
      Pin: 1
      Content: "Please update this section..."
      User: John Doe
      🔍 Looking for attachments...
      📎 Found attachment indicator: svg[class*="attachment"]
      🖱️  Clicking attachment icon...
      ⏳ Waiting for attachment area to appear...
      🔗 Found 2 links with selector: a[href*="download"]
      ✅ Found attachment: https://media.markup.io/files/screenshot.png
      ✅ Found attachment: https://media.markup.io/files/document.pdf
      🔙 Closing attachment view...
      ✅ Closed using: button[class*="close"]
      📎 Appending 2 attachments to content

   🔹 Comment 2/2
      ID: def-789-012
      Pin: 2
      Content: "Looks good!"
      User: Jane Smith
      🔍 Looking for attachments...
      ℹ️  No attachment indicator found

================================================================================
📊 EXTRACTION RESULTS
================================================================================

✅ Extracted 1 threads with 2 total comments

1. Thread: 01. Homepage.png (2 comments)
   1. [Pin 1] John Doe
      Please update this section...

📎 Attachments:
- https://media.markup.io/files/screenshot.png
- https://media.markup.io/files/document.pdf
      🎉 HAS 2 ATTACHMENT(S)!
   2. [Pin 2] Jane Smith
      Looks good!

================================================================================
✅ Test completed! Browser will stay open for 30 seconds...
================================================================================
```

## Test Features

### 1. Multiple Attachment Selector Strategies
The test tries multiple selectors to find attachment icons:
- `svg[class*="attachment"]`
- `.thread-list-item-attachment-count svg`
- `.attachment-icon svg`
- `span[class*="attachment"] svg`

### 2. Multiple Attachment Link Strategies
Once the attachment area is revealed, it searches for:
- `a[href*="download"]`
- `a[href*="attachment"]`
- `a[href*="media"]`
- `a[href*="markup.io"][href*="message"]`
- `.modal img[src]`
- `.attachment-list a`
- `[role="dialog"] a[href]`

### 3. Multiple Close Modal Strategies
To return to the previous view:
- `button[class*="close"]`
- `.modal_close`
- `.modal-close`
- `[aria-label="Close"]`
- `button[aria-label*="close" i]`
- `.icon-close`
- Pressing **Escape key** as fallback

### 4. URL Normalization
All attachment URLs are converted to absolute URLs:
- Relative paths: `/file.pdf` → `https://app.markup.io/file.pdf`
- Protocol-relative: `//cdn.example.com/file.pdf` → `https://cdn.example.com/file.pdf`
- Absolute URLs are kept as-is

## Troubleshooting

### Browser doesn't open?
- Check if you have Chrome/Chromium installed
- Try installing: `sudo apt-get install chromium-browser` (Linux)

### No attachments found?
The test will show which selectors were tried. Watch the browser window to see:
- Are attachment icons visible?
- Do they have a different class name?
- What happens when you manually click them?

### Modal doesn't close?
The test tries multiple close strategies. If it fails:
- Watch what button/action closes the modal manually
- Update the `closeSelectors` array in the test script

### Test runs too fast?
Increase the `slowMo` value in the test:
```javascript
browser = await puppeteer.launch({
  headless: false,
  slowMo: 500, // Increase from 100ms to 500ms
  ...
});
```

## After Testing

Once you verify the test works correctly, the same logic is used in:
- `getpayload.js` - The main extraction function
- Production runs will use `headless: true` for better performance

## Example Output Format

When attachments are found, they're appended to the comment content:

```
Original comment text goes here...

📎 Attachments:
- https://media.markup.io/files/screenshot-1.png
- https://media.markup.io/files/reference-doc.pdf
- https://cdn.example.com/mockup-v2.jpg
```

This format is easy to parse and human-readable in the database and ClickUp.
