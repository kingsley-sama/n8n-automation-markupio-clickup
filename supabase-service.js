const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config();

class SupabaseService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    this.bucketName = process.env.SUPABASE_BUCKET || 'screenshots';

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
    if (level === 'error') {
      try {
        const errorLogEntry = {
          session_id: this.currentSessionId,
          url: context?.url || null,
          title: context?.title || null,
          error_message: message,
          number_of_images: context?.numberOfImages || null,
          error_details: { error: message },
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
  }

  async findExistingRecord(url) {
    try {
      const { data, error } = await this.supabase
        .from('scraped_data')
        .select('*')
        .eq('url', url)
        .order('scraping_timestamp', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error('Error checking for existing record:', error.message);
      return null;
    }
  }

  async deleteImagesFromStorage(imagePaths) {
    if (!imagePaths || imagePaths.length === 0) {
      return { success: true, deleted: [] };
    }

    try {
      const pathsToDelete = imagePaths.map(path => {
        if (path.includes('/storage/v1/object/public/')) {
          const parts = path.split('/storage/v1/object/public/');
          if (parts.length > 1) {
            const bucketAndPath = parts[1];
            const pathParts = bucketAndPath.split('/');
            if (pathParts.length > 1) {
              return pathParts.slice(1).join('/');
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

      const { data: publicUrlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(fileName);

      return publicUrlData.publicUrl || data.path;
    } catch (error) {
      await this.log('error', 'Exception while uploading screenshot', { error: error.message });
      throw error;
    }
  }

  async saveScrapedData(data) {
    try {
      const existingRecord = await this.findExistingRecord(data.url);
      let oldImagePaths = [];
      
      if (existingRecord) {
        console.log(`Found existing record for URL: ${data.url}, updating instead of creating new`);
        oldImagePaths = existingRecord.screenshots_paths || [];
      }

      const uploadedPaths = [];
      
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
   * NEW: Save complete payload using normalized structure (projects, threads, comments)
   * This handles URL checking, image management, and uses the PostgreSQL function
   */
  async saveCompletePayloadNormalized(payloadData) {
    try {
      console.log('🔍 Checking for existing project...');
      const existingRecord = await this.findExistingRecord(payloadData.url);
      let existingProject = null;
      let oldImagePaths = [];
      
      if (existingRecord) {
        console.log(`Found existing scraped_data record for URL: ${payloadData.url}`);
        oldImagePaths = existingRecord.screenshots_paths || [];
        
        // Check if there's an existing project linked to this scraped_data
        const { data: projectData, error: projectError } = await this.supabase
          .from('markup_projects')
          .select('*')
          .eq('scraped_data_id', existingRecord.id)
          .limit(1)
          .single();
        
        if (!projectError && projectData) {
          existingProject = projectData;
          console.log(`Found existing project: ${existingProject.id}`);
        }
      }

      // Upload screenshots first
      console.log('📸 Uploading screenshots...');
      const uploadedPaths = [];
      const threadsWithUrls = [];
      
      if (payloadData.threads && Array.isArray(payloadData.threads)) {
        for (let i = 0; i < payloadData.threads.length; i++) {
          const thread = payloadData.threads[i];
          let uploadedUrl = '';
          
          if (thread.screenshotBuffer) {
            const filename = thread.imageFilename || `thread_${i + 1}.jpg`;
            uploadedUrl = await this.uploadScreenshot(
              thread.screenshotBuffer,
              filename,
              'image/jpeg'
            );
            uploadedPaths.push(uploadedUrl);
          }
          
          threadsWithUrls.push({
            ...thread,
            imagePath: uploadedUrl,
            localImagePath: uploadedUrl
          });
        }
      }

      console.log(`✅ Uploaded ${uploadedPaths.length} screenshots`);

      // Save or update scraped_data record first
      let scrapedDataId;
      let operation;

      const scrapedDataRecord = {
        session_id: this.currentSessionId,
        url: payloadData.url,
        title: payloadData.projectName || 'Unknown Project',
        number_of_images: uploadedPaths.length,
        screenshot_metadata: uploadedPaths.map((url, idx) => ({
          filename: threadsWithUrls[idx].imageFilename,
          url: url
        })),
        screenshots_paths: uploadedPaths,
        success: payloadData.success !== false,
        options: {
          type: 'complete_payload_normalized',
          totalThreads: payloadData.threads?.length || 0
        },
        scraping_timestamp: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (existingRecord) {
        const { data: updatedData, error } = await this.supabase
          .from('scraped_data')
          .update(scrapedDataRecord)
          .eq('id', existingRecord.id)
          .select()
          .single();

        if (error) throw new Error(`Failed to update scraped_data: ${error.message}`);
        
        scrapedDataId = updatedData.id;
        operation = 'updated';
        
        // Delete old images after successful update
        if (oldImagePaths.length > 0) {
          console.log(`🗑️ Deleting ${oldImagePaths.length} old images...`);
          await this.deleteImagesFromStorage(oldImagePaths);
        }
      } else {
        const { data: insertedData, error } = await this.supabase
          .from('scraped_data')
          .insert([scrapedDataRecord])
          .select()
          .single();

        if (error) throw new Error(`Failed to insert scraped_data: ${error.message}`);
        
        scrapedDataId = insertedData.id;
        operation = 'created';
      }

      console.log(`✅ Scraped data ${operation}: ${scrapedDataId}`);

      // If updating, delete existing project/threads/comments first
      if (existingProject) {
        console.log('🗑️ Deleting existing project and related data...');
        const { error: deleteError } = await this.supabase
          .from('markup_projects')
          .delete()
          .eq('id', existingProject.id);
        
        if (deleteError) {
          console.warn('Warning: Failed to delete existing project:', deleteError);
        } else {
          console.log('✅ Existing project deleted (cascading to threads and comments)');
        }
      }

      // Prepare payload for PostgreSQL function
      const functionPayload = {
        data: {
          projectName: payloadData.projectName || 'Unknown Project',
          url: payloadData.url,
          totalThreads: threadsWithUrls.length,
          totalScreenshots: uploadedPaths.length,
          timestamp: new Date().toISOString(),
          threads: threadsWithUrls.map((thread, threadIdx) => ({
            threadName: thread.threadName,
            imageIndex: threadIdx + 1,
            imagePath: thread.imagePath,
            imageFilename: thread.imageFilename || `thread_${threadIdx + 1}.jpg`,
            localImagePath: thread.localImagePath,
            comments: (thread.comments || []).map(comment => ({
              id: comment.id || this.generateUUID(),
              index: comment.index || comment.pinNumber || 0,
              pinNumber: comment.pinNumber || comment.index || 0,
              content: comment.content || '',
              user: comment.user || 'Unknown',
              attachments: comment.attachments || []
            }))
          }))
        }
      };

      // Call PostgreSQL function to insert normalized data
      console.log('💾 Saving to normalized tables using PostgreSQL function...');
      const { data: projectId, error: functionError } = await this.supabase
        .rpc('insert_markup_payload', {
          p_payload: functionPayload,
          p_scraped_data_id: scrapedDataId
        });

      if (functionError) {
        throw new Error(`Failed to insert normalized data: ${functionError.message}`);
      }

      console.log(`✅ Project saved with ID: ${projectId}`);

      return {
        success: true,
        operation: operation,
        scrapedDataId: scrapedDataId,
        projectId: projectId,
        uploadedUrls: uploadedPaths,
        oldImagesDeleted: oldImagePaths.length,
        totalThreads: threadsWithUrls.length,
        totalComments: threadsWithUrls.reduce((sum, t) => sum + (t.comments?.length || 0), 0)
      };

    } catch (error) {
      console.error('Error in saveCompletePayloadNormalized:', error.message);
      throw error;
    }
  }

  /**
   * Fetch complete project data from normalized tables
   */
  async getProjectFromDB(url) {
    try {
      // Find scraped_data by URL
      const { data: scrapedData, error: scrapedError } = await this.supabase
        .from('scraped_data')
        .select('id, url, title, scraping_timestamp, screenshots_paths')
        .eq('url', url)
        .order('scraping_timestamp', { ascending: false })
        .limit(1)
        .single();

      if (scrapedError || !scrapedData) {
        return null;
      }

      // Get project with threads and comments
      const { data: project, error: projectError } = await this.supabase
        .from('markup_projects')
        .select(`
          *,
          markup_threads (
            *,
            markup_comments (*)
          )
        `)
        .eq('scraped_data_id', scrapedData.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (projectError || !project) {
        return null;
      }

      // Format threads with attachment info
      const threads = (project.markup_threads || []).map(thread => ({
        threadName: thread.thread_name,
        imageIndex: thread.image_index,
        imagePath: thread.image_path,
        imageFilename: thread.image_filename,
        localImagePath: thread.local_image_path,
        hasAttachments: thread.has_attachments || false,
        comments: (thread.markup_comments || []).map(comment => ({
          id: comment.id,
          index: comment.comment_index,
          pinNumber: comment.pin_number,
          content: comment.content,
          user: comment.user_name,
          attachments: comment.attachments || []
        }))
      }));
      
      // Check if ANY thread has attachments
      const hasAttachments = threads.some(thread => thread.hasAttachments);

      // Format response
      return {
        success: true,
        url: scrapedData.url,
        projectName: project.project_name,
        totalThreads: project.total_threads,
        totalScreenshots: project.total_screenshots,
        timestamp: project.extraction_timestamp,
        hasAttachments: hasAttachments,
        threads: threads
      };

    } catch (error) {
      console.error('Error fetching project from DB:', error.message);
      return null;
    }
  }

  // Keep legacy methods for backward compatibility
  async saveCompletePayload(payloadData) {
    // Redirect to normalized version
    return await this.saveCompletePayloadNormalized(payloadData);
  }

  async saveFailedScraping(data) {
    try {
      const errorLogEntry = {
        session_id: this.currentSessionId,
        url: data.url,
        title: data.title,
        error_message: data.error,
        number_of_images: data.options?.numberOfImages || 0,
        error_details: { error: data.error },
        options: data.options,
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

  async healthCheck() {
    try {
      const { data, error } = await this.supabase.from('scraped_data').select('id').limit(1);
      if (error && !error.message.includes('relation "scraped_data" does not exist')) return false;
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = SupabaseService;