# Updated API Payload Structure with Attachments

## Overview

All API endpoints now return attachment data in the payload. This document shows the complete structure.

---

## 📋 Complete Payload Structure

### Main Response Format

```json
{
  "success": true,
  "data": {
    "projectName": "Project Name",
    "url": "https://app.markup.io/markup/...",
    "totalThreads": 5,
    "totalScreenshots": 10,
    "timestamp": "2025-10-15T10:30:00Z",
    "threads": [
      {
        "threadName": "Header Issue",
        "imageIndex": 1,
        "imagePath": "https://supabase.co/storage/...",
        "imageFilename": "thread_1.jpg",
        "localImagePath": "https://supabase.co/storage/...",
        "hasAttachments": true,  // ✨ NEW: Quick flag
        "comments": [
          {
            "id": "uuid",
            "index": 0,
            "pinNumber": 1,
            "content": "Please fix this\n\n📎 Attachments:\n- https://cdn.markup.io/img1.png",
            "user": "John Doe",
            "attachments": [  // ✨ NEW: Array of URLs
              "https://cdn.markup.io/image1.png",
              "https://cdn.markup.io/image2.jpg"
            ]
          }
        ]
      }
    ]
  },
  "message": "Successfully extracted 5 threads with 10 screenshots",
  "operation": "created",
  "timestamp": "2025-10-15T10:30:00Z"
}
```

---

## 🔍 New Fields Explained

### Thread Level

```json
{
  "hasAttachments": true  // ✨ NEW
}
```

**Type:** `boolean`  
**Description:** Quick flag indicating if ANY comment in this thread has attachments  
**Default:** `false`  
**Usage:** Use this to filter threads with attachments without checking all comments

### Comment Level

```json
{
  "attachments": [  // ✨ NEW
    "https://cdn.markup.io/image1.png",
    "https://cdn.markup.io/image2.jpg"
  ]
}
```

**Type:** `string[]` (array of URLs)  
**Description:** Array of attachment URLs for this specific comment  
**Default:** `[]` (empty array)  
**Note:** URLs are cleaned (query parameters removed)

---

## 🚀 API Endpoints Updated

### 1. POST `/complete-payload`

**Request:**
```json
{
  "url": "https://app.markup.io/markup/YOUR-ID",
  "options": {}
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "projectName": "...",
    "threads": [
      {
        "hasAttachments": true,  // ✨ NEW
        "comments": [
          {
            "attachments": ["..."]  // ✨ NEW
          }
        ]
      }
    ]
  }
}
```

### 2. GET `/project/:id`

**Response includes:**
- `hasAttachments` on each thread
- `attachments` array on each comment

### 3. GET `/search?q=keyword`

**Response includes:**
```json
{
  "results": [
    {
      "commentId": "uuid",
      "content": "...",
      "attachments": ["..."],  // ✨ NEW
      "threadName": "...",
      "projectName": "..."
    }
  ]
}
```

### 4. GET `/project/search/:partialName`

**Response includes:**
- Full project data with attachments

---

## 📊 Examples by Scenario

### Scenario 1: Comment WITHOUT Attachments

```json
{
  "id": "comment-1",
  "pinNumber": 1,
  "content": "Please fix this bug",
  "user": "John Doe",
  "attachments": []  // Empty array
}
```

### Scenario 2: Comment WITH Single Attachment

```json
{
  "id": "comment-2",
  "pinNumber": 2,
  "content": "See screenshot\n\n📎 Attachments:\n- https://cdn.markup.io/img.png",
  "user": "Jane Smith",
  "attachments": [
    "https://cdn.markup.io/image1.png"
  ]
}
```

### Scenario 3: Comment WITH Multiple Attachments

```json
{
  "id": "comment-3",
  "pinNumber": 3,
  "content": "Multiple issues\n\n📎 Attachments:\n- https://cdn.markup.io/img1.png\n- https://cdn.markup.io/img2.jpg",
  "user": "Bob Johnson",
  "attachments": [
    "https://cdn.markup.io/image1.png",
    "https://cdn.markup.io/image2.jpg",
    "https://cdn.markup.io/image3.gif"
  ]
}
```

### Scenario 4: Thread WITH Mixed Comments

```json
{
  "threadName": "Navigation Issues",
  "hasAttachments": true,  // Because at least one comment has attachments
  "comments": [
    {
      "pinNumber": 1,
      "content": "Text only comment",
      "attachments": []  // No attachments
    },
    {
      "pinNumber": 2,
      "content": "With screenshot\n\n📎 Attachments:\n- ...",
      "attachments": ["https://cdn.markup.io/img.png"]  // Has attachments
    }
  ]
}
```

---

## 🔧 How to Use in Your Code

### JavaScript/TypeScript

```javascript
// Fetch project data
const response = await fetch('http://localhost:3000/complete-payload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://app.markup.io/markup/YOUR-ID'
  })
});

const { data } = await response.json();

// Filter threads with attachments
const threadsWithAttachments = data.threads.filter(t => t.hasAttachments);

// Get all attachment URLs
const allAttachments = data.threads.flatMap(thread =>
  thread.comments.flatMap(comment => comment.attachments)
);

// Find comments with attachments
data.threads.forEach(thread => {
  thread.comments.forEach(comment => {
    if (comment.attachments.length > 0) {
      console.log(`Pin ${comment.pinNumber} has ${comment.attachments.length} attachment(s)`);
      comment.attachments.forEach(url => {
        console.log(`  - ${url}`);
      });
    }
  });
});
```

### Python

```python
import requests

# Fetch project data
response = requests.post('http://localhost:3000/complete-payload', json={
    'url': 'https://app.markup.io/markup/YOUR-ID'
})
data = response.json()['data']

# Filter threads with attachments
threads_with_attachments = [t for t in data['threads'] if t['hasAttachments']]

# Get all attachment URLs
all_attachments = [
    url
    for thread in data['threads']
    for comment in thread['comments']
    for url in comment['attachments']
]

# Find comments with attachments
for thread in data['threads']:
    for comment in thread['comments']:
        if comment['attachments']:
            print(f"Pin {comment['pinNumber']} has {len(comment['attachments'])} attachment(s)")
            for url in comment['attachments']:
                print(f"  - {url}")
```

---

## 🎯 Filtering Examples

### Get Only Comments with Attachments

```javascript
const commentsWithAttachments = data.threads.flatMap(thread =>
  thread.comments.filter(comment => comment.attachments.length > 0)
);
```

### Get Attachment Count per Thread

```javascript
const attachmentCounts = data.threads.map(thread => ({
  threadName: thread.threadName,
  totalAttachments: thread.comments.reduce(
    (sum, comment) => sum + comment.attachments.length,
    0
  )
}));
```

### Get Comments with More Than One Attachment

```javascript
const multipleAttachments = data.threads.flatMap(thread =>
  thread.comments.filter(comment => comment.attachments.length > 1)
);
```

---

## 📝 SQL Query Equivalents

If querying the database directly:

```sql
-- Get threads with attachments
SELECT * FROM markup_threads 
WHERE has_attachments = TRUE;

-- Get all comments with attachments
SELECT t.thread_name, c.pin_number, c.attachments
FROM markup_comments c
JOIN markup_threads t ON t.id = c.thread_id
WHERE array_length(c.attachments, 1) > 0;

-- Count attachments per thread
SELECT 
  t.thread_name,
  COUNT(*) FILTER (WHERE array_length(c.attachments, 1) > 0) as comments_with_attachments,
  SUM(array_length(c.attachments, 1)) as total_attachments
FROM markup_threads t
LEFT JOIN markup_comments c ON c.thread_id = t.id
GROUP BY t.id, t.thread_name;
```

---

## ✅ Backward Compatibility

**All existing code continues to work!**

- Old code that doesn't check `attachments` will simply ignore it
- Empty arrays `[]` for comments without attachments
- `hasAttachments: false` for threads without attachments
- No breaking changes to existing fields

---

## 🚨 Important Notes

1. **URL Format:** Attachment URLs have query parameters stripped
   - Before: `https://cdn.markup.io/img.png?fit=contain&width=96`
   - After: `https://cdn.markup.io/img.png`

2. **Content Field:** Still includes attachments in text format for display
   ```
   "content": "Message\n\n📎 Attachments:\n- url1\n- url2"
   ```

3. **Attachments Field:** Separate array for programmatic access
   ```
   "attachments": ["url1", "url2"]
   ```

4. **Empty Arrays:** Comments without attachments have `attachments: []`

5. **Thread Flag:** `hasAttachments` is automatically calculated and maintained

---

## 📚 Related Documentation

- **ATTACHMENT_DATABASE_SCHEMA.md** - Database schema details
- **HOW_TO_TEST.md** - Testing the new structure
- **TESTING_GUIDE.md** - Comprehensive testing guide
- **migrations/001_add_attachment_support.sql** - Database migration

---

**Last Updated:** October 15, 2025  
**Version:** 2.0.0 (with attachment support)
