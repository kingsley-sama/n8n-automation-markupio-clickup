// Import bullmq with ESM/CommonJS compatibility
const _bullmq = require('bullmq');
const Queue = _bullmq.Queue || _bullmq.default?.Queue;
const Worker = _bullmq.Worker || _bullmq.default?.Worker;
const QueueScheduler = _bullmq.QueueScheduler || _bullmq.default?.QueueScheduler;
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

// QueueScheduler is recommended to handle delayed jobs and retries reliably.
// Create it only when available (handles possible interop issues between ESM/CJS).
let queueScheduler = null;
if (typeof QueueScheduler === 'function') {
  try {
    queueScheduler = new QueueScheduler(QUEUE_NAME, { connection: redisConnection });
    queueScheduler.on('failed', (err) => {
      console.error('❌ QueueScheduler error:', err);
    });
    console.log('⚙️  QueueScheduler started');
  } catch (err) {
    console.warn('⚠️  Could not start QueueScheduler:', err.message);
    queueScheduler = null;
  }
} else {
  console.warn('⚠️  QueueScheduler not available in this bullmq build - delayed jobs may not be promoted automatically');
}

// Fallback poller: if QueueScheduler isn't available, periodically check delayed jobs
// and try to promote them (best-effort). Runs every 15 seconds.
let fallbackPromoter = null;
if (!queueScheduler) {
  try {
    fallbackPromoter = setInterval(async () => {
      try {
        const delayedJobs = await markupQueue.getJobs(['delayed'], 0, 100);
        if (!delayedJobs || delayedJobs.length === 0) return;

        for (const job of delayedJobs) {
          try {
            // If job has promotable API, and its delay has expired, promote it
            const willRunAt = (job.timestamp || 0) + (job.opts?.delay || 0);
            if (Date.now() >= willRunAt) {
              if (typeof job.promote === 'function') {
                await job.promote();
                console.log(`⬆️  Fallback promoter: promoted job ${job.id}`);
              } else {
                // Can't promote programmatically on this build; log for manual action
                console.warn(`⚠️  Fallback promoter: job ${job.id} delayed but promote() not available`);
              }
            }
          } catch (err) {
            console.warn('⚠️  Error promoting job in fallback promoter:', err.message);
          }
        }
      } catch (err) {
        console.warn('⚠️  Fallback promoter error while fetching delayed jobs:', err.message);
      }
    }, 15 * 1000);

    console.log('⚙️  Fallback promoter started (every 15s)');
  } catch (err) {
    console.warn('⚠️  Could not start fallback promoter:', err.message);
    fallbackPromoter = null;
  }
}

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

// In-process scheduled jobs fallback (used when QueueScheduler is unavailable)
const localScheduled = new Map(); // jobId -> { timer, url, willProcessAt }


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
    const DELAY_MS = 3 * 60 * 1000; // 3 minutes
    const jobId = `markup-${Buffer.from(url).toString('base64').substring(0, 50)}`;

    // If QueueScheduler is available, rely on Redis delayed jobs as before
    if (queueScheduler) {
      // Remove any existing duplicate jobs (waiting/delayed/active)
      const existingJobs = await markupQueue.getJobs(['waiting', 'delayed', 'active']);
      const existingJob = existingJobs.find(job => job.data.url === url);
      if (existingJob) {
        console.log(`\n⏸️  Job for URL already exists: ${existingJob.id}`);
        console.log(`🔄 Removing old job and creating new one with 3-minute delay`);
        await existingJob.remove();
      }

      const job = await markupQueue.add(
        'scrape-markup',
        { url, options },
        {
          jobId: jobId,
          delay: DELAY_MS,
          priority: 1,
        }
      );

      console.log(`\n✅ Job added to queue: ${job.id}`);
      console.log(`📍 URL: ${url}`);
      console.log(`⏰ Will start processing in 3 minutes at: ${new Date(Date.now() + DELAY_MS).toISOString()}`);

      return {
        success: true,
        jobId: job.id,
        url: url,
        status: 'delayed',
        delay: DELAY_MS,
        willProcessAt: new Date(Date.now() + DELAY_MS).toISOString(),
      };
    }

    // Fallback: schedule locally (process will set timer and add job without delay when triggered)
    // Remove any existing Redis job with the same id
    try {
      const existing = await markupQueue.getJob(jobId);
      if (existing) {
        console.log(`\n⏸️  Removing leftover Redis job: ${existing.id}`);
        await existing.remove();
      }
    } catch (err) {
      console.warn('⚠️  Could not remove existing Redis job:', err.message);
    }

    // Clear existing local timer for this job if present
    if (localScheduled.has(jobId)) {
      const prev = localScheduled.get(jobId);
      clearTimeout(prev.timer);
      localScheduled.delete(jobId);
      console.log(`🔁 Resetting local schedule for ${jobId}`);
    }

    const willProcessAt = Date.now() + DELAY_MS;
    const timer = setTimeout(async () => {
      try {
        // Add job without delay so worker can pick it up immediately
        const added = await markupQueue.add('scrape-markup', { url, options }, { jobId: jobId, priority: 1 });
        console.log(`\n✅ Locally-scheduled job added to queue: ${added.id}`);
      } catch (err) {
        console.error('❌ Error adding locally scheduled job to queue:', err.message);
      } finally {
        localScheduled.delete(jobId);
      }
    }, DELAY_MS);

    // Track local schedule
    localScheduled.set(jobId, { timer, url, willProcessAt });

    console.log(`\n🕒 Job scheduled locally: ${jobId}`);
    console.log(`📍 URL: ${url}`);
    console.log(`⏰ Will start processing at: ${new Date(willProcessAt).toISOString()}`);

    return {
      success: true,
      jobId: jobId,
      url: url,
      status: 'scheduled_locally',
      willProcessAt: new Date(willProcessAt).toISOString(),
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
 * Promote a delayed job to waiting immediately (if supported)
 */
async function promoteJob(jobId) {
  try {
    const job = await markupQueue.getJob(jobId);
    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    // Some bullmq builds expose job.promote(); check and call if available
    if (typeof job.promote === 'function') {
      await job.promote();
      console.log(`⬆️  Job ${jobId} promoted to waiting`);
      return { success: true, jobId: job.id, message: 'Job promoted to waiting' };
    }

    return { success: false, error: 'Promote operation not supported by this bullmq build' };
  } catch (error) {
    console.error('❌ Error promoting job:', error);
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
  // Close the queue scheduler first (if created)
  if (queueScheduler && typeof queueScheduler.close === 'function') {
    try { await queueScheduler.close(); } catch (err) { console.warn('Error closing QueueScheduler:', err.message); }
  }
  // Stop fallback promoter if running
  if (fallbackPromoter) {
    clearInterval(fallbackPromoter);
    fallbackPromoter = null;
    console.log('🛑 Fallback promoter stopped');
  }

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
  // Export scheduler only if it exists
  ...(queueScheduler ? { queueScheduler } : {}),
  addScrapingJob,
  getJobStatus,
  getQueueStats,
  getJobs,
  retryJob,
  promoteJob,
  removeJob,
  cleanQueue,
  pauseQueue,
  resumeQueue,
  closeQueue,
};
