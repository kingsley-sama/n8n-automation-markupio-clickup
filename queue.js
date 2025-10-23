const { Queue, Worker } = require('bullmq');
const { getCompletePayload } = require('./getpayload');
const IORedis = require('ioredis');
require('dotenv').config();

// ============================================================================
// REDIS CONNECTION
// ============================================================================

const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
});

// ============================================================================
// QUEUE CONFIGURATION
// ============================================================================

const QUEUE_NAME = 'markup-scraper';

const queueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Retry up to 3 times
    backoff: {
      type: 'fixed',
      delay: 10 * 60 * 1000, // 10 minutes between retries
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 100, // Keep last 100 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
      count: 1000, // Keep last 1000 failed jobs
    },
  },
};

// ============================================================================
// CREATE QUEUE INSTANCES
// ============================================================================

const markupQueue = new Queue(QUEUE_NAME, queueOptions);

// Note: In BullMQ v5+, QueueScheduler is no longer needed
// The queue handles delayed jobs automatically

// ============================================================================
// WORKER CONFIGURATION
// ============================================================================

const workerOptions = {
  connection: redisConnection,
  concurrency: 1, // Process one job at a time
  limiter: {
    max: 1, // Maximum 1 job
    duration: 1000, // per second (rate limiting)
  },
};

// ============================================================================
// JOB PROCESSOR
// ============================================================================

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { url, options = {} } = job.data;
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔄 Processing job: ${job.id}`);
    console.log(`📍 URL: ${url}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log(`🔢 Attempt: ${job.attemptsMade + 1}/${job.opts.attempts}`);
    console.log(`${'='.repeat(80)}\n`);

    try {
      // Update job progress
      await job.updateProgress(10);
      
      // Execute the scraping
      const result = await getCompletePayload(url, options);
      
      await job.updateProgress(100);
      
      if (!result.success) {
        throw new Error(result.error || 'Scraping failed');
      }
      
      console.log(`\n✅ Job ${job.id} completed successfully`);
      console.log(`📊 Result: ${result.totalThreads} threads, ${result.totalScreenshots} screenshots`);
      
      // Fetch the full payload from database to return complete data
      const SupabaseService = require('./supabase-service.js');
      const supabaseService = new SupabaseService();
      
      try {
        const fullPayload = await supabaseService.getProjectFromDB(url);
        
        return {
          success: true,
          url: url,
          projectId: result.projectId,
          scrapedDataId: result.scrapedDataId,
          totalThreads: result.totalThreads,
          totalComments: result.totalComments,
          totalScreenshots: result.totalScreenshots || result.totalThreads,
          operation: result.operation,
          duration: result.duration,
          completedAt: new Date().toISOString(),
          // Include full payload with threads and comments
          payload: fullPayload ? {
            projectName: fullPayload.projectName,
            url: fullPayload.url,
            totalThreads: fullPayload.totalThreads,
            threads: fullPayload.threads // Complete threads with comments and attachments
          } : null
        };
      } catch (dbError) {
        console.warn('⚠️  Could not fetch full payload from DB:', dbError.message);
        
        // Return summary even if full payload fetch fails
        return {
          success: true,
          url: url,
          projectId: result.projectId,
          scrapedDataId: result.scrapedDataId,
          totalThreads: result.totalThreads,
          totalComments: result.totalComments,
          totalScreenshots: result.totalScreenshots || result.totalThreads,
          operation: result.operation,
          duration: result.duration,
          completedAt: new Date().toISOString(),
          payload: null,
          warning: 'Full payload could not be retrieved from database'
        };
      }
      
    } catch (error) {
      console.error(`\n❌ Job ${job.id} failed:`, error.message);
      
      // Log detailed error for debugging
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
      
      throw error; // Re-throw to trigger retry mechanism
    }
  },
  workerOptions
);

// ============================================================================
// WORKER EVENT HANDLERS
// ============================================================================

worker.on('completed', (job, result) => {
  console.log(`\n🎉 Job ${job.id} has been completed`);
  console.log(`📊 Summary:`, {
    url: result.url,
    projectId: result.projectId,
    totalThreads: result.totalThreads,
    totalComments: result.totalComments,
    operation: result.operation,
    duration: result.duration
  });
  
  if (result.payload) {
    console.log(`📦 Full payload available with ${result.payload.threads?.length || 0} threads`);
  }
});

worker.on('failed', (job, err) => {
  console.error(`\n💥 Job ${job.id} has failed with error:`, err.message);
  
  if (job.attemptsMade < job.opts.attempts) {
    console.log(`🔄 Will retry in 10 minutes (Attempt ${job.attemptsMade + 1}/${job.opts.attempts})`);
  } else {
    console.log(`⚠️  Max retries reached. Job will not be retried.`);
  }
});

worker.on('progress', (job, progress) => {
  console.log(`📈 Job ${job.id} progress: ${progress}%`);
});

worker.on('error', (err) => {
  console.error('❌ Worker error:', err);
});

// ============================================================================
// QUEUE EVENT HANDLERS
// ============================================================================

markupQueue.on('error', (err) => {
  console.error('❌ Queue error:', err);
});

// ============================================================================
// QUEUE MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Add a scraping job to the queue with deduplication
 * If the same URL is already in queue, it will be delayed by 3 minutes
 * 
 * @param {string} url - The Markup.io URL to scrape
 * @param {object} options - Scraping options
 * @returns {Promise<object>} Job information
 */
async function addScrapingJob(url, options = {}) {
  try {
    // Check if job with this URL already exists in queue (waiting or delayed)
    const existingJobs = await markupQueue.getJobs(['waiting', 'delayed', 'active']);
    const existingJob = existingJobs.find(job => job.data.url === url);
    
    if (existingJob) {
      console.log(`\n⏸️  Job for URL already exists: ${existingJob.id}`);
      console.log(`🔄 Removing old job and creating new one with 3-minute delay`);
      
      // Remove the existing job
      await existingJob.remove();
    }
    
    // Add new job with 3-minute delay
    const job = await markupQueue.add(
      'scrape-markup',
      { url, options },
      {
        jobId: `markup-${Buffer.from(url).toString('base64').substring(0, 50)}`, // Unique ID based on URL
        delay: 3 * 60 * 1000, // 3 minutes delay
        priority: 1, // Default priority
      }
    );
    
    console.log(`\n✅ Job added to queue: ${job.id}`);
    console.log(`📍 URL: ${url}`);
    console.log(`⏰ Will start processing in 3 minutes at: ${new Date(Date.now() + 3 * 60 * 1000).toISOString()}`);
    
    return {
      success: true,
      jobId: job.id,
      url: url,
      status: 'delayed',
      delay: 3 * 60 * 1000,
      willProcessAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
    };
    
  } catch (error) {
    console.error('❌ Error adding job to queue:', error);
    throw error;
  }
}

/**
 * Get job status by job ID
 */
async function getJobStatus(jobId) {
  try {
    const job = await markupQueue.getJob(jobId);
    
    if (!job) {
      return {
        success: false,
        error: 'Job not found',
      };
    }
    
    const state = await job.getState();
    const progress = job.progress;
    
    return {
      success: true,
      jobId: job.id,
      url: job.data.url,
      state: state,
      progress: progress,
      attemptsMade: job.attemptsMade,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue,
    };
    
  } catch (error) {
    console.error('❌ Error getting job status:', error);
    throw error;
  }
}

/**
 * Get queue statistics
 */
async function getQueueStats() {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      markupQueue.getWaitingCount(),
      markupQueue.getActiveCount(),
      markupQueue.getCompletedCount(),
      markupQueue.getFailedCount(),
      markupQueue.getDelayedCount(),
    ]);
    
    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  } catch (error) {
    console.error('❌ Error getting queue stats:', error);
    throw error;
  }
}

/**
 * Get all jobs by state
 */
async function getJobs(state = 'waiting', start = 0, end = 10) {
  try {
    const jobs = await markupQueue.getJobs(state, start, end);
    
    return jobs.map(job => ({
      id: job.id,
      url: job.data.url,
      state: job.state,
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    }));
  } catch (error) {
    console.error('❌ Error getting jobs:', error);
    throw error;
  }
}

/**
 * Retry a failed job immediately
 */
async function retryJob(jobId) {
  try {
    const job = await markupQueue.getJob(jobId);
    
    if (!job) {
      return {
        success: false,
        error: 'Job not found',
      };
    }
    
    await job.retry();
    
    console.log(`🔄 Job ${jobId} has been queued for retry`);
    
    return {
      success: true,
      jobId: job.id,
      message: 'Job queued for retry',
    };
  } catch (error) {
    console.error('❌ Error retrying job:', error);
    throw error;
  }
}

/**
 * Remove a job from the queue
 */
async function removeJob(jobId) {
  try {
    const job = await markupQueue.getJob(jobId);
    
    if (!job) {
      return {
        success: false,
        error: 'Job not found',
      };
    }
    
    await job.remove();
    
    console.log(`🗑️  Job ${jobId} has been removed from queue`);
    
    return {
      success: true,
      jobId: job.id,
      message: 'Job removed',
    };
  } catch (error) {
    console.error('❌ Error removing job:', error);
    throw error;
  }
}

/**
 * Clean old jobs from queue
 */
async function cleanQueue(grace = 24 * 3600 * 1000) {
  try {
    const cleaned = await markupQueue.clean(grace, 1000, 'completed');
    const cleanedFailed = await markupQueue.clean(grace * 7, 1000, 'failed');
    
    console.log(`🧹 Cleaned ${cleaned.length} completed jobs and ${cleanedFailed.length} failed jobs`);
    
    return {
      success: true,
      cleanedCompleted: cleaned.length,
      cleanedFailed: cleanedFailed.length,
    };
  } catch (error) {
    console.error('❌ Error cleaning queue:', error);
    throw error;
  }
}

/**
 * Pause the queue
 */
async function pauseQueue() {
  await markupQueue.pause();
  console.log('⏸️  Queue paused');
  return { success: true, message: 'Queue paused' };
}

/**
 * Resume the queue
 */
async function resumeQueue() {
  await markupQueue.resume();
  console.log('▶️  Queue resumed');
  return { success: true, message: 'Queue resumed' };
}

/**
 * Gracefully close queue, worker, and scheduler
 */
async function closeQueue() {
  console.log('\n🔄 Closing queue connections...');
  
  await worker.close();
  await markupQueue.close();
  await redisConnection.quit();
  
  console.log('✅ Queue connections closed');
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGTERM', async () => {
  console.log('\n📛 SIGTERM received, closing queue gracefully...');
  await closeQueue();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n📛 SIGINT received, closing queue gracefully...');
  await closeQueue();
  process.exit(0);
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  markupQueue,
  worker,
  addScrapingJob,
  getJobStatus,
  getQueueStats,
  getJobs,
  retryJob,
  removeJob,
  cleanQueue,
  pauseQueue,
  resumeQueue,
  closeQueue,
};
