// translator.js
// Translates German comments to English using DeepL API (no library required)
// Usage: await translateCommentToEnglish(commentText)

require('dotenv').config();
// Note: Using native fetch API (available in Node.js 18+)

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_API_URL = 'https://api-free.deepl.com/v2/translate';
const TRANSLATION_ENABLED = process.env.ENABLE_TRANSLATION !== 'false'; // Enable by default

// Rate limiting configuration
const MAX_RETRIES = 3;
const BASE_DELAY = 2000; // 2 seconds base delay
const MAX_DELAY = 30000; // 30 seconds max delay

/**
 * Extract quoted strings and replace with placeholders
 * @param {string} text - The text containing quoted strings
 * @returns {Object} - { processedText, quotedStrings }
 */
function extractQuotedStrings(text) {
  const quotedStrings = [];
  let processedText = text;
  
  // Match both single and double quoted strings
  // Regex matches: "..." or '...' (non-greedy, handles escaped quotes)
  const quotePattern = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
  
  processedText = text.replace(quotePattern, (match) => {
    const index = quotedStrings.length;
    quotedStrings.push(match);
    return `__QUOTED_${index}__`;
  });
  
  return { processedText, quotedStrings };
}

/**
 * Restore quoted strings from placeholders
 * @param {string} text - The translated text with placeholders
 * @param {Array<string>} quotedStrings - The original quoted strings
 * @returns {string} - Text with quoted strings restored
 */
function restoreQuotedStrings(text, quotedStrings) {
  let restoredText = text;
  
  quotedStrings.forEach((quotedStr, index) => {
    const placeholder = `__QUOTED_${index}__`;
    restoredText = restoredText.replace(placeholder, quotedStr);
  });
  
  return restoredText;
}

/**
 * Sleep utility for rate limiting
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - Current attempt number (0-indexed)
 * @returns {number} - Delay in milliseconds
 */
function getBackoffDelay(attempt) {
  const delay = BASE_DELAY * Math.pow(2, attempt);
  return Math.min(delay, MAX_DELAY);
}

/**
 * Translates a comment from German to English using DeepL API.
 * Preserves quoted strings by replacing them with placeholders before translation.
 * Includes automatic retry with exponential backoff for rate limiting (429 errors).
 * @param {string} text - The comment text in German.
 * @returns {Promise<string>} - The translated text in English.
 */
async function translateCommentToEnglish(text) {
  // Check if translation is disabled
  if (!TRANSLATION_ENABLED) {
    return text;
  }
  
  if (!DEEPL_API_KEY) {
    console.warn('⚠️  DEEPL_API_KEY not set - skipping translation');
    return text;
  }
  
  if (!text || typeof text !== 'string') return text;
  const { processedText, quotedStrings } = extractQuotedStrings(text);
  if (processedText.trim() === '' || processedText.trim().match(/^__QUOTED_\d+__$/)) {
    return text;
  }

  const params = new URLSearchParams();
  params.append('auth_key', DEEPL_API_KEY);
  params.append('text', processedText);
  params.append('source_lang', 'DE');
  params.append('target_lang', 'EN');

  // Retry loop with exponential backoff for rate limits
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(DEEPL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
        signal: AbortSignal.timeout(15000) // 15 second timeout
      });
      
      // Handle rate limiting (429)
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : getBackoffDelay(attempt);
        
        if (attempt < MAX_RETRIES - 1) {
          console.warn(`⏳ Rate limited (429). Waiting ${delay/1000}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
          await sleep(delay);
          continue; // Retry
        } else {
          throw new Error(`DeepL API rate limit exceeded. Please wait before retrying. (Free tier: 500,000 chars/month)`);
        }
      }
      
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`DeepL API error: ${response.status} ${err}`);
      }
      
      const data = await response.json();
      if (data && data.translations && data.translations[0] && data.translations[0].text) {
        const translatedText = data.translations[0].text;
        return restoreQuotedStrings(translatedText, quotedStrings);
      }
      throw new Error('DeepL API: Unexpected response format');
      
    } catch (err) {
      // Only retry on rate limit errors
      if (err.message.includes('rate limit') && attempt < MAX_RETRIES - 1) {
        continue;
      }
      
      // Re-throw other errors
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        throw new Error('Translation timeout: DeepL API took longer than 15 seconds');
      } else if (err.cause?.code === 'UND_ERR_CONNECT_TIMEOUT') {
        throw new Error('Cannot reach DeepL API: Connection timeout');
      } else if (err.message.includes('DeepL API')) {
        throw err; // Re-throw DeepL-specific errors
      } else {
        throw new Error(`Translation failed: ${err.message}`);
      }
    }
  }
  
  // Should not reach here, but just in case
  throw new Error('Translation failed after maximum retries');
}module.exports = { translateCommentToEnglish, extractQuotedStrings, restoreQuotedStrings };
