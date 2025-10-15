#!/bin/bash

# ============================================================================
# Quick Test Script for Markup.io Automation with Attachments
# ============================================================================

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  🧪 MARKUP.IO AUTOMATION TEST SUITE                            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if URL is provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: No Markup.io URL provided${NC}"
    echo ""
    echo "Usage:"
    echo "  $0 <markup-url> [test-type]"
    echo ""
    echo "Examples:"
    echo "  $0 https://app.markup.io/markup/2ea1332e-2645-4021-86f4-b5d233a65bd1"
    echo "  $0 https://app.markup.io/markup/YOUR-ID headed"
    echo "  $0 https://app.markup.io/markup/YOUR-ID full"
    echo ""
    echo "Test types:"
    echo "  (none)  - Quick headed test (default)"
    echo "  headed  - Watch the browser extract attachments"
    echo "  full    - Complete end-to-end test with database"
    echo "  db      - Database verification only"
    exit 1
fi

MARKUP_URL=$1
TEST_TYPE=${2:-headed}

echo -e "${BLUE}📋 Test Configuration${NC}"
echo "   URL: $MARKUP_URL"
echo "   Test Type: $TEST_TYPE"
echo ""

# ============================================================================
# Test 1: Headed Mode - Watch Extraction
# ============================================================================

if [ "$TEST_TYPE" = "headed" ] || [ "$TEST_TYPE" = "full" ]; then
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}🔍 Test 1: Headed Mode - Visual Extraction${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "This will open a browser window where you can watch:"
    echo "  • Comments with attachment indicators being found"
    echo "  • Attachment icons being clicked"
    echo "  • URLs being extracted"
    echo "  • Pin numbers being matched"
    echo ""
    read -p "Press Enter to start..."
    echo ""
    
    node test_attachments.js "$MARKUP_URL"
    
    echo ""
    echo -e "${GREEN}✅ Headed test completed!${NC}"
    echo ""
    
    if [ "$TEST_TYPE" = "headed" ]; then
        echo -e "${BLUE}💡 Tip: Run with 'full' to test complete database flow:${NC}"
        echo "   $0 $MARKUP_URL full"
        exit 0
    fi
fi

# ============================================================================
# Test 2: Full Server Test with Database
# ============================================================================

if [ "$TEST_TYPE" = "full" ]; then
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}🚀 Test 2: Full Server Test${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    # Check if .env exists
    if [ ! -f .env ]; then
        echo -e "${RED}❌ Error: .env file not found${NC}"
        echo ""
        echo "Create a .env file with:"
        echo "  SUPABASE_URL=your_url"
        echo "  SUPABASE_KEY=your_key"
        exit 1
    fi
    
    # Check if server is already running
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Server already running on port 3000${NC}"
        SERVER_WAS_RUNNING=true
    else
        echo "Starting server..."
        node server.js > server.log 2>&1 &
        SERVER_PID=$!
        SERVER_WAS_RUNNING=false
        
        # Wait for server to start
        echo -n "Waiting for server to start"
        for i in {1..10}; do
            if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
                echo ""
                echo -e "${GREEN}✅ Server started (PID: $SERVER_PID)${NC}"
                break
            fi
            echo -n "."
            sleep 1
        done
        echo ""
    fi
    
    echo ""
    echo "Sending extraction request..."
    echo ""
    
    # Make the request
    RESPONSE=$(curl -s -X POST http://localhost:3000/complete-payload \
        -H "Content-Type: application/json" \
        -d "{\"url\": \"$MARKUP_URL\", \"options\": {}}")
    
    # Check if successful
    if echo "$RESPONSE" | grep -q '"success":true'; then
        echo -e "${GREEN}✅ Extraction successful!${NC}"
        echo ""
        
        # Parse response
        PROJECT_NAME=$(echo "$RESPONSE" | grep -o '"projectName":"[^"]*"' | cut -d'"' -f4)
        TOTAL_THREADS=$(echo "$RESPONSE" | grep -o '"totalThreads":[0-9]*' | cut -d':' -f2)
        TOTAL_SCREENSHOTS=$(echo "$RESPONSE" | grep -o '"totalScreenshots":[0-9]*' | cut -d':' -f2)
        
        echo -e "${BLUE}📊 Results:${NC}"
        echo "   Project: $PROJECT_NAME"
        echo "   Threads: $TOTAL_THREADS"
        echo "   Screenshots: $TOTAL_SCREENSHOTS"
        echo ""
        
        echo -e "${BLUE}💾 Full Response:${NC}"
        echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
        
    else
        echo -e "${RED}❌ Extraction failed!${NC}"
        echo ""
        echo "Response:"
        echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    fi
    
    echo ""
    
    # Cleanup
    if [ "$SERVER_WAS_RUNNING" = false ]; then
        echo "Stopping server..."
        kill $SERVER_PID 2>/dev/null || true
        echo -e "${GREEN}✅ Server stopped${NC}"
    fi
fi

# ============================================================================
# Test 3: Database Verification
# ============================================================================

if [ "$TEST_TYPE" = "db" ] || [ "$TEST_TYPE" = "full" ]; then
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}🗄️  Test 3: Database Verification${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    echo "To verify the data in your database, run these SQL queries:"
    echo ""
    echo -e "${BLUE}1. Check threads with attachments:${NC}"
    echo "   SELECT thread_name, has_attachments"
    echo "   FROM markup_threads"
    echo "   ORDER BY created_at DESC LIMIT 5;"
    echo ""
    echo -e "${BLUE}2. Check comment attachments:${NC}"
    echo "   SELECT t.thread_name, c.pin_number, c.user_name,"
    echo "          array_length(c.attachments, 1) as attachment_count"
    echo "   FROM markup_comments c"
    echo "   JOIN markup_threads t ON t.id = c.thread_id"
    echo "   WHERE array_length(c.attachments, 1) > 0"
    echo "   ORDER BY t.created_at DESC;"
    echo ""
    echo -e "${BLUE}3. View actual attachment URLs:${NC}"
    echo "   SELECT t.thread_name, c.pin_number,"
    echo "          unnest(c.attachments) as attachment_url"
    echo "   FROM markup_comments c"
    echo "   JOIN markup_threads t ON t.id = c.thread_id"
    echo "   WHERE array_length(c.attachments, 1) > 0;"
    echo ""
fi

# ============================================================================
# Summary
# ============================================================================

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ Test Suite Completed!                                      ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📚 Next Steps:${NC}"
echo "   1. Review the extraction logs above"
echo "   2. Check your database for the new attachments columns"
echo "   3. Verify attachments are matched to correct comments"
echo ""
echo -e "${BLUE}📖 Documentation:${NC}"
echo "   • TESTING_GUIDE.md - Complete testing documentation"
echo "   • ATTACHMENT_DATABASE_SCHEMA.md - Database schema details"
echo "   • QUICKSTART_ATTACHMENTS.md - Quick setup guide"
echo ""
echo "Happy testing! 🎉"
echo ""
