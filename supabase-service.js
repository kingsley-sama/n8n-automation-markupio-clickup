const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config();

class SupabaseService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    this.bucketName = process.env.SUPABASE_BUCKET || 'screenshots'; // bucket name (default = "screenshots")

    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('Supabase URL and key are required. Please check your environment variables.');
    }

    this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
    this.currentSessionId = null;
  }

  initializeSession() {
    this.currentSessionId = this.generateUUID();
    return this.currentSessionId;
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async log(level, message, errorDetails = null, context = null) {
    // Only log errors to database for manual retriggering
    if (level === 'error') {
      try {
        const errorLogEntry = {
          session_id: this.currentSessionId,
          url: context?.url || null,
          title: context?.title || null,
          error_message: message,
          number_of_images: context?.numberOfImages || null,
          error_details: { error: message }, // Minimal error details
          options: context?.options || null,
          failed_at: new Date().toISOString(),
          status: 'failed'
        };

        const { error } = await this.supabase.from('scraping_error_logs').insert([errorLogEntry]);
        if (error) console.error('Failed to save error log to database:', error);
      } catch (error) {
        console.error('Error saving error log to database:', error);
      }
    }
    // All other log levels are just console output
  }

  /**
   * Upload a single screenshot to Supabase Storage
   * @param {Buffer} fileBuffer - The screenshot buffer
   * @param {string} filename - The filename for the screenshot
   * @param {string} contentType - The content type (default: 'image/jpeg')
   */
  async uploadScreenshot(fileBuffer, filename, contentType = 'image/jpeg') {
    try {
      const fileExt = path.extname(filename) || '.jpg';
      const fileName = `${this.currentSessionId}/${Date.now()}-${path.basename(filename, fileExt)}${fileExt}`;

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(fileName, fileBuffer, {
          contentType: contentType,
          upsert: true,
        });

      if (error) {
        await this.log('error', 'Failed to upload screenshot to storage', error);
        throw error;
      }

      // Return a public URL (if bucket is public) or the storage path
      const { data: publicUrlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(fileName);

      return publicUrlData.publicUrl || data.path;
    } catch (error) {
      await this.log('error', 'Exception while uploading screenshot', { error: error.message });
      throw error;
    }
  }

  /**
   * Save successful scraping
   */
  async saveScrapedData(data) {
    try {
      // Upload screenshots to Supabase Storage
      const uploadedPaths = [];
      
      // Handle new screenshot format with buffers
      if (data.screenshotBuffers && Array.isArray(data.screenshotBuffers)) {
        for (const screenshot of data.screenshotBuffers) {
          const uploadedPath = await this.uploadScreenshot(
            screenshot.buffer, 
            screenshot.filename, 
            'image/jpeg'
          );
          uploadedPaths.push(uploadedPath);
        }
      }

      const scrapingRecord = {
        session_id: this.currentSessionId,
        url: data.url,
        title: data.title,
        number_of_images: data.numberOfImages,
        screenshot_metadata: data.metadata,
        screenshots_paths: uploadedPaths,
        duration_seconds: data.duration,
        success: data.success,
        options: data.options,
        scraping_timestamp: new Date().toISOString(),
      };

      const { data: insertedData, error } = await this.supabase
        .from('scraped_data')
        .insert([scrapingRecord])
        .select()
        .single();

      if (error) {
        await this.log('error', 'Failed to save scraped data to database', error);
        throw new Error(`Database save failed: ${error.message}`);
      }

      await this.log('success', `Successfully saved scraped data with ${uploadedPaths.length} screenshots`);
      
      // Return the inserted data with uploaded URLs
      return {
        ...insertedData,
        uploadedUrls: uploadedPaths
      };
    } catch (error) {
      await this.log('error', 'Error in saveScrapedData method', { error: error.message });
      throw error;
    }
  }

  /**
   * Save failed scraping - minimal data for manual retriggering
   */
  async saveFailedScraping(data) {
    try {
      // Save only essential info to error logs table for manual retriggering
      const errorLogEntry = {
        session_id: this.currentSessionId,
        url: data.url,
        title: data.title,
        error_message: data.error,
        number_of_images: data.options?.numberOfImages || 0,
        error_details: {
          error: data.error
        },
        options: data.options, // Keep options for exact retry
        failed_at: new Date().toISOString(),
        status: 'failed'
      };

      const { error } = await this.supabase.from('scraping_error_logs').insert([errorLogEntry]);
      if (error) {
        console.error('Failed to save error log to database:', error);
        return { success: false, logged: false };
      }

      console.log('Failed scraping saved to error logs for manual retriggering');
      return { success: true, logged: true };
    } catch (error) {
      console.error('Error in saveFailedScraping method:', error.message);
      return { success: false, logged: false };
    }
  }

  async getRecentActivities(limit = 10) {
    try {
      const { data, error } = await this.supabase
        .from('scraped_data')
        .select('*')
        .order('scraping_timestamp', { ascending: false })
        .limit(limit);

      if (error) throw new Error(`Failed to fetch recent activities: ${error.message}`);
      return data;
    } catch (error) {
      console.error('Error fetching recent activities:', error.message);
      throw error;
    }
  }

  async getFailedScrapings(limit = 50, status = 'failed') {
    try {
      const { data, error } = await this.supabase
        .from('scraping_error_logs')
        .select('*')
        .eq('status', status)
        .order('failed_at', { ascending: false })
        .limit(limit);

      if (error) throw new Error(`Failed to fetch failed scrapings: ${error.message}`);
      return data;
    } catch (error) {
      console.error('Error fetching failed scrapings:', error.message);
      throw error;
    }
  }

  async markErrorForRetry(errorId) {
    try {
      const { data, error } = await this.supabase
        .from('scraping_error_logs')
        .update({ 
          status: 'retrying',
          retry_count: this.supabase.raw('retry_count + 1'),
          last_retry_at: new Date().toISOString()
        })
        .eq('id', errorId)
        .select()
        .single();

      if (error) throw new Error(`Failed to mark error for retry: ${error.message}`);
      return data;
    } catch (error) {
      console.error('Error marking for retry:', error.message);
      throw error;
    }
  }

  async markErrorAsResolved(errorId) {
    try {
      const { data, error } = await this.supabase
        .from('scraping_error_logs')
        .update({ status: 'resolved' })
        .eq('id', errorId)
        .select()
        .single();

      if (error) throw new Error(`Failed to mark error as resolved: ${error.message}`);
      return data;
    } catch (error) {
      console.error('Error marking as resolved:', error.message);
      throw error;
    }
  }

  async getSessionLogs(sessionId) {
    try {
      const { data, error } = await this.supabase
        .from('scraping_error_logs')
        .select('*')
        .eq('session_id', sessionId)
        .order('failed_at', { ascending: true });

      if (error) throw new Error(`Failed to fetch session logs: ${error.message}`);
      return data;
    } catch (error) {
      console.error('Error fetching session logs:', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      const { data, error } = await this.supabase.from('scraped_data').select('id').limit(1);
      if (error && !error.message.includes('relation "scraped_data" does not exist')) return false;
      return true;
    } catch {
      return false;
    }
  }

  async cleanupOldLogs(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      // Clean up resolved error logs older than specified days
      const { error } = await this.supabase
        .from('scraping_error_logs')
        .delete()
        .eq('status', 'resolved')
        .lt('failed_at', cutoffDate.toISOString());

      if (error) {
        console.error('Failed to cleanup old error logs:', error);
        return false;
      }

      console.log(`Successfully cleaned up resolved error logs older than ${daysOld} days`);
      return true;
    } catch (error) {
      console.error('Error during log cleanup:', error.message);
      return false;
    }
  }
}

module.exports = SupabaseService;

