# DeepL API Rate Limit Handling

## 📋 Overview

This document explains how the application handles DeepL API rate limiting (429 errors) to ensure reliable translation operations.

## 🚨 Problem

DeepL API Free Tier has limits:
- **500,000 characters per month**
- **Rate limiting**: Too many requests in short time → 429 error
- Previous behavior: Job would fail immediately on 429 error

## ✅ Solution Implemented

### 1. **Automatic Retry with Exponential Backoff**

When a 429 error occurs, the translator automatically retries with increasing delays:

```javascript
Attempt 1: Wait 2 seconds
Attempt 2: Wait 4 seconds  
Attempt 3: Wait 8 seconds (or use Retry-After header if provided)
```

**Configuration** (in `translator.js`):
```javascript
MAX_RETRIES = 3           // Number of retry attempts
BASE_DELAY = 2000         // Initial delay: 2 seconds
MAX_DELAY = 30000         // Maximum delay: 30 seconds
```

### 2. **Sequential Translation with Throttling**

Comments are now translated **one at a time** (not in parallel) with a 100ms delay between each:

**Before** (parallel - caused rate limiting):
```javascript
await Promise.all(comments.map(c => translateCommentToEnglish(c)))
```

**After** (sequential with delay):
```javascript
for (const comment of comments) {
  await translateCommentToEnglish(comment.content);
  await sleep(100); // 100ms delay between translations
}
```

This prevents overwhelming the API with simultaneous requests.

### 3. **Respects Retry-After Header**

When DeepL returns a `Retry-After` header (tells you exactly how long to wait), the system uses that value instead of exponential backoff.

## 🔧 Error Messages

### Rate Limit Exceeded (Final)
```
DeepL API rate limit exceeded. Please wait before retrying. 
(Free tier: 500,000 chars/month)
```
**Cause**: Hit monthly quota or persistent rate limiting after 3 retries  
**Action**: Wait for quota reset (monthly) or upgrade to paid tier

### Rate Limit (Retry in Progress)
```
⏳ Rate limited (429). Waiting 2s before retry 1/3...
```
**Cause**: Temporary rate limit  
**Action**: System automatically retries (no user action needed)

## 📊 Translation Flow

```
Start Translation
       ↓
Try API Call
       ↓
  429 Error? ────No───→ Success → Return Result
       ↓ Yes
       ↓
Retry < 3? ────No───→ Throw Error → Job Fails
       ↓ Yes
       ↓
Wait (Exponential Backoff)
       ↓
Try API Call Again...
```

## 🎯 Best Practices

### If You Hit Rate Limits Frequently:

1. **Check Usage**: Log into DeepL Console
   ```
   https://www.deepl.com/pro-account/usage
   ```

2. **Increase Delays**: Edit `getpayload.js` line ~511
   ```javascript
   await new Promise(resolve => setTimeout(resolve, 500)); // 500ms instead of 100ms
   ```

3. **Disable Translation Temporarily**:
   ```bash
   echo "ENABLE_TRANSLATION=false" >> .env
   ```

4. **Upgrade to Pro**:
   - Paid tier has higher limits
   - Update `.env`:
     ```
     DEEPL_API_KEY=your-pro-key
     ```
   - Update `translator.js` line 8:
     ```javascript
     const DEEPL_API_URL = 'https://api.deepl.com/v2/translate'; // Remove '-free'
     ```

## 🔍 Monitoring Rate Limits

The system logs translation attempts:

```bash
# Watch logs in real-time
npm start

# Look for:
✅ Translation completed successfully          # All good
⏳ Rate limited (429). Waiting 2s...          # Retrying
❌ DeepL API rate limit exceeded               # Quota exhausted
```

## 🛠️ Testing Rate Limit Handling

To test the retry logic locally:

```javascript
// In translator.js, temporarily simulate 429 errors:
if (Math.random() < 0.5) {
  throw new Error('DeepL API error: 429 Rate limit');
}
```

Run a scraping job and observe retry behavior in logs.

## 📈 Queue Interaction

When translation fails after all retries:
1. Job is marked as **failed** in BullMQ queue
2. Error logged to `scraping_error_logs` table with `errorType: 'translation_failure'`
3. Job automatically retries after 10 minutes (up to 3 attempts)
4. Can manually retry: `POST /queue/job/:jobId/retry`

## 🚀 Production Recommendations

- **Monitor monthly quota**: Set up alerts in DeepL Console
- **Batch processing**: Don't scrape too many URLs simultaneously
- **Off-peak usage**: Schedule large scraping jobs during low-traffic hours
- **Consider Pro tier**: If translating >500k chars/month regularly

## 📝 Configuration Summary

| Setting | Location | Default | Purpose |
|---------|----------|---------|---------|
| `MAX_RETRIES` | `translator.js` | 3 | Number of retry attempts for 429 |
| `BASE_DELAY` | `translator.js` | 2000ms | Initial backoff delay |
| `MAX_DELAY` | `translator.js` | 30000ms | Maximum backoff delay |
| Comment delay | `getpayload.js` | 100ms | Delay between sequential translations |
| `ENABLE_TRANSLATION` | `.env` | true | Global translation toggle |

## 📖 Related Documentation

- [TRANSLATION_FEATURE.md](./TRANSLATION_FEATURE.md) - Translation feature overview
- [TRANSLATION_ERROR_HANDLING_SUMMARY.md](./TRANSLATION_ERROR_HANDLING_SUMMARY.md) - Error handling strategy
- [QUEUE_SYSTEM.md](./QUEUE_SYSTEM.md) - Queue retry mechanism
