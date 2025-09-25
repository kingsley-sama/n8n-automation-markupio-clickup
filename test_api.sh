#!/bin/bash

echo "🧪 Testing Screenshot Capture API Endpoints"
echo "============================================="

# Test 1: Health Check
echo ""
echo "1. Testing Health Check..."
curl -s http://localhost:3000/health | jq '.'

# Test 2: GET endpoint
echo ""
echo "2. Testing GET endpoint..."
curl -s "http://localhost:3000/capture?url=https://app.markup.io/markup/bb3022bd-01f0-4ed5-8fbb-1c5da2e3bdc7&numberOfImages=1" | jq '.'

# Test 3: POST endpoint (main capture)
echo ""
echo "3. Testing POST capture endpoint..."
curl -s -X POST http://localhost:3000/capture \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://app.markup.io/markup/bb3022bd-01f0-4ed5-8fbb-1c5da2e3bdc7",
    "numberOfImages": 1,
    "options": {
      "debugMode": false,
      "screenshotQuality": 90
    }
  }' | jq '.'

# Test 4: Webhook endpoint (recommended for n8n)
echo ""
echo "4. Testing Webhook endpoint (recommended for n8n)..."
curl -s -X POST http://localhost:3000/webhook/capture \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://app.markup.io/markup/bb3022bd-01f0-4ed5-8fbb-1c5da2e3bdc7",
    "numberOfImages": 2
  }' | jq '.'

echo ""
echo "✅ Test completed! Check the responses above."
echo "📁 Screenshots should be saved in the ./screenshots directory"