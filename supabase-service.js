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
   * Check if a URL already exists in the database
   * @param {string} url - The URL to check for
   * @returns {Object|null} - The existing record or null if not found
   */
  async findExistingRecord(url) {
    try {
      const { data, error } = await this.supabase
        .from('scraped_data')
        .select('*')
        .eq('url', url)
        .order('scraping_timestamp', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error('Error checking for existing record:', error.message);
      return null;
    }
  }

  /**
   * Delete images from Supabase storage
   * @param {Array} imagePaths - Array of storage paths to delete
   */
  async deleteImagesFromStorage(imagePaths) {
    if (!imagePaths || imagePaths.length === 0) {
      return { success: true, deleted: [] };
    }

    try {
      const pathsToDelete = imagePaths.map(path => {
        // Extract the file path from the public URL if needed
        if (path.includes('/storage/v1/object/public/')) {
          const parts = path.split('/storage/v1/object/public/');
          if (parts.length > 1) {
            const bucketAndPath = parts[1];
            const pathParts = bucketAndPath.split('/');
            if (pathParts.length > 1) {
              return pathParts.slice(1).join('/'); // Remove bucket name, keep file path
            }
          }
        }
        return path;
      }).filter(Boolean);

      if (pathsToDelete.length === 0) {
        return { success: true, deleted: [] };
      }

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .remove(pathsToDelete);

      if (error) {
        console.error('Error deleting images from storage:', error);
        return { success: false, error: error.message, deleted: [] };
      }

      console.log(`Successfully deleted ${pathsToDelete.length} images from storage`);
      return { success: true, deleted: pathsToDelete };
    } catch (error) {
      console.error('Exception while deleting images from storage:', error.message);
      return { success: false, error: error.message, deleted: [] };
    }
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
   * Save successful scraping (creates new record or updates existing one)
   */
  async saveScrapedData(data) {
    try {
      // Check if URL already exists
      const existingRecord = await this.findExistingRecord(data.url);
      let oldImagePaths = [];
      
      if (existingRecord) {
        console.log(`Found existing record for URL: ${data.url}, updating instead of creating new`);
        oldImagePaths = existingRecord.screenshots_paths || [];
      }

      // Upload new screenshots to Supabase Storage
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
        updated_at: new Date().toISOString()
      };

      let resultData;
      let operation;

      if (existingRecord) {
        // Update existing record
        const { data: updatedData, error } = await this.supabase
          .from('scraped_data')
          .update(scrapingRecord)
          .eq('id', existingRecord.id)
          .select()
          .single();

        if (error) {
          await this.log('error', 'Failed to update existing scraped data', error);
          throw new Error(`Database update failed: ${error.message}`);
        }

        resultData = updatedData;
        operation = 'updated';

        // Delete old images from storage after successful update
        if (oldImagePaths.length > 0) {
          console.log(`Deleting ${oldImagePaths.length} old images from storage...`);
          const deleteResult = await this.deleteImagesFromStorage(oldImagePaths);
          if (deleteResult.success) {
            console.log(`Successfully deleted ${deleteResult.deleted.length} old images`);
          } else {
            console.warn(`Failed to delete some old images: ${deleteResult.error}`);
          }
        }
      } else {
        // Create new record
        const { data: insertedData, error } = await this.supabase
          .from('scraped_data')
          .insert([scrapingRecord])
          .select()
          .single();

        if (error) {
          await this.log('error', 'Failed to save scraped data to database', error);
          throw new Error(`Database save failed: ${error.message}`);
        }

        resultData = insertedData;
        operation = 'created';
      }

      await this.log('success', `Successfully ${operation} scraped data with ${uploadedPaths.length} screenshots`);
      
      // Return the result data with uploaded URLs and operation info
      return {
        ...resultData,
        uploadedUrls: uploadedPaths,
        operation: operation,
        oldImagesDeleted: oldImagePaths.length
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

  /**
   * Save complete payload data (for thread + screenshot combinations)
   * This method handles URL checking and updates for the combined payload system
   */
  async saveCompletePayload(payloadData) {
    try {
      // Check if URL already exists
      const existingRecord = await this.findExistingRecord(payloadData.url);
      let oldImagePaths = [];
      
      if (existingRecord) {
        console.log(`Found existing record for URL: ${payloadData.url}, updating complete payload`);
        oldImagePaths = existingRecord.screenshots_paths || [];
      }

      // Extract screenshot buffers and metadata from threads
      const screenshotBuffers = [];
      const screenshotMetadata = [];
      
      if (payloadData.threads && Array.isArray(payloadData.threads)) {
        payloadData.threads.forEach((thread, index) => {
          if (thread.screenshotBuffer) {
            screenshotBuffers.push({
              buffer: thread.screenshotBuffer,
              filename: thread.imageFilename || `thread_${index + 1}.jpg`
            });
          }
        });
      }

      // Upload new screenshots
      const uploadedPaths = [];
      for (const screenshot of screenshotBuffers) {
        const uploadedPath = await this.uploadScreenshot(
          screenshot.buffer,
          screenshot.filename,
          'image/jpeg'
        );
        uploadedPaths.push(uploadedPath);
        screenshotMetadata.push({
          filename: screenshot.filename,
          format: 'jpeg',
          uploadedUrl: uploadedPath
        });
      }

      // Prepare the complete payload record
      const completePayloadRecord = {
        session_id: this.currentSessionId,
        url: payloadData.url,
        title: payloadData.projectName || 'Unknown Project',
        number_of_images: payloadData.totalScreenshots || uploadedPaths.length,
        screenshot_metadata: screenshotMetadata,
        screenshots_paths: uploadedPaths,
        success: payloadData.success,
        options: {
          type: 'complete_payload',
          totalThreads: payloadData.totalThreads,
          payload: payloadData
        },
        scraping_timestamp: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      let resultData;
      let operation;

      if (existingRecord) {
        // Update existing record
        const { data: updatedData, error } = await this.supabase
          .from('scraped_data')
          .update(completePayloadRecord)
          .eq('id', existingRecord.id)
          .select()
          .single();

        if (error) {
          await this.log('error', 'Failed to update existing complete payload', error);
          throw new Error(`Database update failed: ${error.message}`);
        }

        resultData = updatedData;
        operation = 'updated';

        // Delete old images from storage after successful update
        if (oldImagePaths.length > 0) {
          console.log(`Deleting ${oldImagePaths.length} old images from storage...`);
          const deleteResult = await this.deleteImagesFromStorage(oldImagePaths);
          if (deleteResult.success) {
            console.log(`Successfully deleted ${deleteResult.deleted.length} old images`);
          } else {
            console.warn(`Failed to delete some old images: ${deleteResult.error}`);
          }
        }
      } else {
        // Create new record
        const { data: insertedData, error } = await this.supabase
          .from('scraped_data')
          .insert([completePayloadRecord])
          .select()
          .single();

        if (error) {
          await this.log('error', 'Failed to save complete payload to database', error);
          throw new Error(`Database save failed: ${error.message}`);
        }

        resultData = insertedData;
        operation = 'created';
      }

      console.log(`Successfully ${operation} complete payload with ${uploadedPaths.length} screenshots`);
      
      return {
        ...resultData,
        uploadedUrls: uploadedPaths,
        operation: operation,
        oldImagesDeleted: oldImagePaths.length
      };
    } catch (error) {
      console.error('Error in saveCompletePayload method:', error.message);
      throw error;
    }
  }
}

module.exports = SupabaseService;

