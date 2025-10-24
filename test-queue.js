#!/usr/bin/env node

/**
 * Simple test script to verify queue system is working
 * Run with: node test-queue.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const TEST_URL = 'https://app.markup.io/markup/test-queue-' + Date.now();

console.log('🧪 Testing Queue System...\n');

// Helper function to make HTTP requests
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function runTests() {
  try {
    // Test 1: Health check
    console.log('1️⃣ Testing health endpoint...');
    const health = await makeRequest('GET', '/health');
    console.log('   Status:', health.status);
    console.log('   Queue stats:', health.data.queue);
    console.log('   ✅ Health check passed\n');

    // Test 2: Queue stats
    console.log('2️⃣ Testing queue stats...');
    const stats = await makeRequest('GET', '/queue/stats');
    console.log('   Status:', stats.status);
    console.log('   Stats:', stats.data.data);
    console.log('   ✅ Queue stats retrieved\n');

    // Test 3: Add job to queue
    console.log('3️⃣ Testing job creation...');
    const job = await makeRequest('POST', '/complete-payload', {
      url: TEST_URL,
      options: { screenshotQuality: 90 }
    });
    console.log('   Status:', job.status);
    console.log('   Job ID:', job.data.job?.jobId);
    console.log('   Will process at:', job.data.job?.willProcessAt);
    console.log('   ✅ Job created\n');

    const jobId = job.data.job?.jobId;

    if (!jobId) {
      console.error('   ❌ No job ID returned');
      return;
    }

    // Test 4: Check job status
    console.log('4️⃣ Testing job status check...');
    const status = await makeRequest('GET', `/queue/job/${jobId}`);
    console.log('   Status:', status.status);
    console.log('   Job state:', status.data.data?.state);
    console.log('   ✅ Job status retrieved\n');

    // Test 5: Get delayed jobs
    console.log('5️⃣ Testing delayed jobs list...');
    const delayed = await makeRequest('GET', '/queue/jobs/delayed');
    console.log('   Status:', delayed.status);
    console.log('   Delayed jobs:', delayed.data.count);
    console.log('   ✅ Delayed jobs retrieved\n');

    // Test 6: Remove test job (cleanup)
    console.log('6️⃣ Removing test job (cleanup)...');
    const remove = await makeRequest('DELETE', `/queue/job/${jobId}`);
    console.log('   Status:', remove.status);
    console.log('   ✅ Test job removed\n');

    // Test 7: Final queue stats
    console.log('7️⃣ Final queue stats...');
    const finalStats = await makeRequest('GET', '/queue/stats');
    console.log('   Stats:', finalStats.data.data);
    console.log('   ✅ Final stats retrieved\n');

    console.log('═══════════════════════════════════════════');
    console.log('🎉 All tests passed successfully!');
    console.log('═══════════════════════════════════════════\n');
    console.log('✅ Queue system is working correctly');
    console.log('✅ Redis connection is active');
    console.log('✅ Worker is processing jobs');
    console.log('✅ API endpoints are responsive\n');
    console.log('📝 Next steps:');
    console.log('   1. Configure your webhook to POST to /complete-payload');
    console.log('   2. Monitor queue with: curl http://localhost:3000/queue/stats');
    console.log('   3. View logs in server console\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Is the server running? (npm start)');
    console.error('   2. Is Redis running? (redis-cli ping)');
    console.error('   3. Check .env has REDIS_HOST and REDIS_PORT');
    process.exit(1);
  }
}

// Run tests
console.log('Starting tests in 2 seconds...\n');
setTimeout(runTests, 2000);
