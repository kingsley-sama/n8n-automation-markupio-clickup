# Markup.io to ClickUp Automation System

## Overview
This automation system seamlessly transfers design feedback from Markup.io to ClickUp tasks, eliminating manual screenshot uploads and comment copying. The system consists of two interconnected workflows that trigger automatically based on specific events.

---

## How It Works

### Workflow 1: Screenshot Capture (Triggered by Markup.io)

**Trigger Event:** When a new comment is created in Markup.io

**What Happens:**
1. **Screenshot Capture** - The system automatically takes a screenshot of the current thread with all pin markers visible
2. **Data Collection** - Gathers all relevant information:
   - Thread name
   - All comments with pin numbers
   - User information for each comment
   - Image paths and metadata
3. **Database Storage** - Saves everything to the database:
   - Screenshots with detailed pin overlays
   - Complete comment data
   - Thread metadata
   - Timestamp information

**Result:** All Markup.io feedback is automatically documented and stored, ready for retrieval.

---

### Workflow 2: ClickUp Task Update (Triggered by Status Change)

**Trigger Event:** When a ClickUp task status changes from "Waiting for Client" to "In Review"

**What Happens:**
1. **Task Identification** - System captures:
   - Task ID
   - Task Name
2. **Database Search** - Looks up the task name in the database to find matching Markup.io data
3. **Data Retrieval** - Pulls all associated screenshots and comments for that task
4. **ClickUp Update** - Automatically adds to the ClickUp task:
   - All relevant screenshots with pin markers
   - All comments from Markup.io
   - Properly formatted and organized

**Result:** ClickUp task is automatically populated with all client feedback and visual references.

---

## User Steps

### For Project Managers

**The only action required:**
1. Change the task status in ClickUp from **"Waiting for Client"** to **"In Review"**

That's it! The automation handles everything else.

---

## Naming Convention (Future Implementation)

### Purpose
To organize and separate Markup.io threads and screenshots by individual studios for better management and retrieval.