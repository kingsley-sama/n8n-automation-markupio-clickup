# Test Files Created for Attachment Extraction

## Files Created

### 1. `test_attachments.js`
**Purpose**: Main test script for attachment extraction with headed Puppeteer

**Features**:
- Runs Puppeteer in visible browser mode (headless: false)
- Opens DevTools automatically
- Slow motion mode (100ms delay between actions)
- Detailed console logging with emojis
- Tests the complete attachment extraction flow:
  - Finds attachment SVG icons
  - Clicks to reveal attachments
  - Extracts attachment URLs
  - Closes attachment modals
  - Appends URLs to comment text

**Usage**:
```bash
node test_attachments.js "https://app.markup.io/markup/your-id"
```

### 2. `test_attachments.sh`
**Purpose**: Bash wrapper script for easier execution

**Usage**:
```bash
chmod +x test_attachments.sh
./test_attachments.sh "https://app.markup.io/markup/your-id"
```

### 3. `TEST_ATTACHMENTS_GUIDE.md`
**Purpose**: Complete documentation for running and troubleshooting the test

**Contents**:
- Multiple ways to run the test
- What to expect during the test
- Console output examples
- Troubleshooting guide
- Selector strategies explained

## How to Run the Test

### Quick Start:
```bash
# Navigate to project directory
cd /home/kingsley-sama/markupio-clickup-automation

# Run with your Markup.io URL
node test_attachments.js "https://app.markup.io/markup/YOUR-MARKUP-ID"
```

### What You'll See:

1. **Browser Window Opens** - Chrome/Chromium will launch visibly
2. **DevTools Opens** - Console logs appear automatically
3. **Navigation** - Page loads the Markup.io URL
4. **Thread Expansion** - All thread groups expand
5. **Comment Processing** - For each comment:
   - Scrolls into view
   - Clicks attachment icon (if present)
   - Extracts attachment URLs
   - Closes attachment modal
   - Logs results to console
6. **Results Summary** - Final report with all extracted data
7. **30 Second Wait** - Browser stays open for inspection

### Console Output Preview:
```
🧪 Starting headed test for attachment extraction...
🌐 URL: https://app.markup.io/markup/...
📋 Project: My Project
📌 Thread: 01. Homepage.png
   💬 Found 2 comments
   🔹 Comment 1/2
      📎 Found attachment indicator
      🖱️  Clicking attachment icon...
      ✅ Found attachment: https://media.markup.io/files/image.png
      📎 Appending 1 attachments to content
✅ Extracted 1 threads with 2 total comments
```

## Testing Different Scenarios

### Test with comments that have attachments:
```bash
node test_attachments.js "https://app.markup.io/markup/[url-with-attachments]"
```

### Test with comments without attachments:
The script will handle both cases gracefully and log "No attachment indicator found"

### Test with multiple attachments per comment:
The script will extract all attachment URLs and append them as a list

## Verifying the Results

After the test completes, verify:

1. ✅ All attachment icons were clicked
2. ✅ Attachment URLs were extracted
3. ✅ URLs are appended to comment content in format:
   ```
   📎 Attachments:
   - https://url1.com
   - https://url2.com
   ```
4. ✅ Modals were closed properly
5. ✅ No errors in the console

## Integration with Main Script

Once you verify the test works, the same logic is already integrated into:
- `getpayload.js` - The `extractThreadDataFromPage()` function uses the same approach

The main difference:
- Test: `headless: false` (visible browser)
- Production: `headless: true` (invisible browser)

## Next Steps

1. **Run the test** with a real Markup.io URL
2. **Watch the browser** perform the extraction
3. **Check the console** for detailed logs
4. **Verify attachments** are correctly extracted
5. **If successful**, run the main `getpayload.js` script
6. **If issues**, use the test to debug and adjust selectors

## Troubleshooting

If attachments aren't being found:
1. Run the test and watch the browser
2. Manually click an attachment icon
3. Inspect the DOM to find the correct selectors
4. Update the selectors in both files:
   - `test_attachments.js` (for testing)
   - `getpayload.js` (for production)

## File Locations

```
/home/kingsley-sama/markupio-clickup-automation/
├── test_attachments.js          # Main test script
├── test_attachments.sh          # Bash wrapper
├── TEST_ATTACHMENTS_GUIDE.md    # Full documentation
└── getpayload.js                # Production script (already updated)
```
