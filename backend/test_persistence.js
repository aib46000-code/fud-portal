const fs = require('fs');

const LIVE_API = 'https://skillful-happiness-production-ba1e.up.railway.app/api';
const ts = Date.now();
const testEmail = `persist_${ts}@test.com`;

async function runTest() {
  console.log("=== Testing Persistent Volume on Railway ===");
  
  // 1. Create a user
  console.log("1. Creating test user...");
  let res = await fetch(`${LIVE_API}/auth/register/student`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'Password123!', full_name: 'Persist Test', matric_no: 'PT' + ts, department: 'CS', faculty: 'Science' })
  });
  if (res.status !== 201) throw new Error("Failed to create user: " + await res.text());
  console.log("   User created successfully.");

  // 2. Login
  console.log("2. Logging in...");
  res = await fetch(`${LIVE_API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: 'Password123!' })
  });
  const loginData = await res.json();
  const token = loginData.data.accessToken;
  console.log("   Logged in successfully.");

  // 3. Upload a file
  console.log("3. Uploading a test file...");
  fs.writeFileSync('test_upload.txt', 'This is a test file for persistent volume verification ' + ts);
  
  const fsStream = fs.createReadStream('test_upload.txt');
  const formData = new FormData();
  
  // Convert Node fs.ReadStream to something native FormData understands (like Blob)
  // Or simpler: just use a Blob directly since we have the string!
  const fileContent = fs.readFileSync('test_upload.txt');
  const fileBlob = new Blob([fileContent], { type: 'text/plain' });
  formData.append('file', fileBlob, 'test_upload.txt');
  formData.append('title', 'Persistence Test File');
  formData.append('description', 'Test desc');
  formData.append('visibility', 'public');
  
  res = await fetch(`${LIVE_API}/media/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  const uploadData = await res.json();
  
  if (res.status !== 201) throw new Error("Failed to upload file: " + JSON.stringify(uploadData));
  const fileUrl = uploadData.data.url;
  console.log("   File uploaded successfully to: " + fileUrl);
  
  // Verify file is accessible right now
  res = await fetch(fileUrl.startsWith('http') ? fileUrl : `https://skillful-happiness-production-ba1e.up.railway.app${fileUrl}`);
  if (res.status !== 200) throw new Error("Uploaded file is not accessible before redeploy!");
  console.log("   File is accessible pre-redeploy.");
  
  console.log(`\n=== Pre-Redeploy Setup Complete ===`);
  console.log(`Test Email: ${testEmail}`);
  console.log(`File URL: ${fileUrl}`);
  
  fs.unlinkSync('test_upload.txt');
}

runTest().catch(console.error);
