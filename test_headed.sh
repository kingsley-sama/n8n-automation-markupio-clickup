#!/bin/bash
# Quick test script to run the scraper in headed (visible) mode
# Usage: ./test_headed.sh <markup-url>

echo "🚀 Running scraper in HEADED mode (visible browser window)"
echo "============================================================"
echo ""

if [ -z "$1" ]; then
  echo "❌ Error: Please provide a Markup.io URL"
  echo ""
  echo "Usage: ./test_headed.sh 'https://app.markup.io/markup/...'"
  exit 1
fi

URL="$1"

echo "📍 URL: $URL"
echo "🔍 Watch the browser window that opens"
echo "📝 Console logs will show timing and progress"
echo ""

# Force headed mode (already hardcoded in db_helper.js now)
export SCRAPER_DEBUG_MODE=true
export SCRAPER_TIMEOUT=120000

# Run the extraction
node getpayload.js "$URL"

echo ""
echo "✅ Test complete!"
