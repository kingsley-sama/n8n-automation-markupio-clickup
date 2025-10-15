#!/bin/bash

# Test script for attachment extraction with headed Puppeteer

echo "🧪 Starting attachment extraction test..."
echo ""

# Check if URL is provided
if [ -z "$1" ]; then
    echo "Usage: ./test_attachments.sh <markup-url>"
    echo ""
    echo "Example:"
    echo "  ./test_attachments.sh https://app.markup.io/markup/6039b445-e90e-41c4-ad51-5c46790653c0"
    echo ""
    echo "Or set MARKUP_URL environment variable:"
    echo "  export MARKUP_URL=https://app.markup.io/markup/your-id"
    echo "  ./test_attachments.sh"
    exit 1
fi

# Run the test
node test_attachments.js "$1"
