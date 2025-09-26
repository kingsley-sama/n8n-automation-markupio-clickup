#!/usr/bin/env node

// Use Node.js built-in modules to avoid import issues
const http = require('http');
const https = require('https');

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            json: () => Promise.resolve(parsed)
          });
        } catch (e) {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            text: data,
            json: () => Promise.resolve({})
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function testServer() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('🧪 Testing Server Endpoints...');
  console.log('================================');
  
  try {
    // Test 1: Health Check
    console.log('\n1. Testing Health Check...');
    const healthResponse = await makeRequest(`${baseUrl}/health`);
    const healthData = await healthResponse.json();
    
    if (healthResponse.ok) {
      console.log('✅ Health check passed');
      console.log(`   Service: ${healthData.service}`);
      console.log(`   Status: ${healthData.status}`);
    } else {
      console.log('❌ Health check failed');
      console.log(`   Status: ${healthResponse.status}`);
    }
    
    // Test 2: API Documentation
    console.log('\n2. Testing API Documentation...');
    const docsResponse = await makeRequest(`${baseUrl}/`);
    const docsData = await docsResponse.json();
    
    if (docsResponse.ok) {
      console.log('✅ API documentation accessible');
      console.log(`   Service: ${docsData.service}`);
      console.log(`   Version: ${docsData.version}`);
      console.log(`   Available endpoints: ${Object.keys(docsData.endpoints || {}).length}`);
    } else {
      console.log('❌ API documentation failed');
      console.log(`   Status: ${docsResponse.status}`);
    }
    
    // Test 3: Complete Payload Endpoint (validation only)
    console.log('\n3. Testing Complete Payload Endpoint Validation...');
    const payloadResponse = await makeRequest(`${baseUrl}/complete-payload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({}) // Empty body to test validation
    });
    
    const payloadData = await payloadResponse.json();
    
    if (payloadResponse.status === 400 && payloadData.error === 'Missing required parameter: url') {
      console.log('✅ Complete payload endpoint validation works correctly');
      console.log(`   Error message: ${payloadData.message}`);
    } else {
      console.log('❌ Complete payload endpoint validation failed');
      console.log(`   Status: ${payloadResponse.status}`);
      console.log(`   Response: ${JSON.stringify(payloadData, null, 2)}`);
    }
    
    console.log('\n🎉 All server endpoint tests completed!');
    console.log('\n🚀 Ready to use with:');
    console.log(`curl -X POST ${baseUrl}/complete-payload \\`);
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d \'{"url":"https://app.markup.io/markup/YOUR-MARKUP-ID"}\'');
    
  } catch (error) {
    console.error('❌ Server test failed:', error.message);
    console.log('💡 Make sure the server is running: node server.js');
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  testServer();
}

module.exports = { testServer };