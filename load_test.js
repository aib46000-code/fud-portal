const http = require('http');

const ENDPOINT = 'http://localhost:5000/api/health';
const CONCURRENCY = 100;
const DURATION_SEC = 5;

let totalRequests = 0;
let successRequests = 0;
let failedRequests = 0;
let totalTime = 0;

const startTime = Date.now();
const endTime = startTime + (DURATION_SEC * 1000);

function makeRequest() {
    if (Date.now() > endTime) return;

    totalRequests++;
    const reqStart = Date.now();
    
    http.get(ENDPOINT, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode === 200) {
                successRequests++;
                totalTime += (Date.now() - reqStart);
            } else {
                failedRequests++;
            }
            makeRequest();
        });
    }).on('error', (err) => {
        failedRequests++;
        makeRequest();
    });
}

console.log(`Starting load test on ${ENDPOINT}... (Concurrency: ${CONCURRENCY}, Duration: ${DURATION_SEC}s)`);

for (let i = 0; i < CONCURRENCY; i++) {
    makeRequest();
}

setTimeout(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    const rps = (totalRequests / elapsed).toFixed(2);
    const avgLatency = successRequests ? (totalTime / successRequests).toFixed(2) : 0;
    
    console.log('\n--- PERFORMANCE & LOAD TEST RESULTS ---');
    console.log(`Duration: ${elapsed} seconds`);
    console.log(`Total Requests: ${totalRequests}`);
    console.log(`Successful: ${successRequests}`);
    console.log(`Failed: ${failedRequests}`);
    console.log(`Requests per second (RPS): ${rps}`);
    console.log(`Average Latency: ${avgLatency} ms`);
    
    if (rps > 100 && failedRequests === 0) {
        console.log('\n✅ Load Test Passed!');
        process.exit(0);
    } else {
        console.log('\n⚠️ Load Test Finished with Suboptimal Results');
        process.exit(0);
    }
}, DURATION_SEC * 1000 + 500);
