const fs = require('fs');

const LIVE_API = 'https://skillful-happiness-production-ba1e.up.railway.app/api';
const testEmail = 'persist_1785023875718@test.com'; // This was printed by the first script
const testFileUrl = 'https://skillful-happiness-production-ba1e.up.railway.app/uploads/2026-07-25/d4c7d42d-ea0b-421e-92a1-54c5fc152435.txt'; // This was printed by the first script

async function runPostTest() {
  console.log("=== Verifying Persistent Volume on Railway (Post-Redeploy) ===");
  
  // 1. Verify User Login (Checks SQLite database persistence)
  console.log("1. Logging in with previously created user...");
  let res = await fetch(`${LIVE_API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'Password123!' })
  });
  
  if (res.status === 401) {
    throw new Error("FAIL: Database was wiped. User login returned 401.");
  } else if (res.status !== 200) {
    throw new Error("FAIL: Login returned unexpected status: " + res.status);
  }
  console.log("   ✅ SUCCESS: User logged in. SQLite database persists across redeploys.");

  // 2. Verify File Access (Checks /uploads folder persistence)
  console.log("2. Verifying uploaded file access...");
  res = await fetch(testFileUrl);
  if (res.status === 404) {
    throw new Error("FAIL: File not found. The /uploads directory was wiped.");
  } else if (res.status !== 200) {
    throw new Error("FAIL: File fetch returned unexpected status: " + res.status);
  }
  const text = await res.text();
  console.log("   ✅ SUCCESS: File retrieved successfully. /uploads folder persists across redeploys.");
  console.log("   File content:", text);
  
  console.log("\n=== ALL PERSISTENCE TESTS PASSED ===");
}

runPostTest().catch(console.error);
