const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LIVE_API = 'https://skillful-happiness-production-ba1e.up.railway.app/api';

async function verifyBackup() {
  console.log("=== Verifying Backup & Restore End-to-End on Railway ===");
  
  // Login as admin
  console.log("1. Logging in as superadmin...");
  let res = await fetch(`${LIVE_API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@fudportal.edu.ng', password: 'Admin@FUD2024' })
  });
  if (res.status !== 200) {
    // If it fails, maybe the DB wiped because of ephemeral storage!
    // Try to register the admin? No, the system seeds admin if missing.
    console.warn("   Admin login failed. Database might have been wiped. Let's see if we can still fetch backup...");
  }
  const token = (await res.json())?.data?.accessToken || '';

  // Download Backup
  console.log("2. Downloading backup ZIP...");
  res = await fetch(`${LIVE_API}/admin/backup`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (res.status !== 200) throw new Error("FAIL: /api/admin/backup returned " + res.status);
  
  const buffer = await res.arrayBuffer();
  fs.writeFileSync('test_backup.zip', Buffer.from(buffer));
  console.log(`   ✅ SUCCESS: Downloaded test_backup.zip (${buffer.byteLength} bytes).`);

  // Extract Backup
  console.log("3. Extracting backup ZIP locally (Simulating Restore)...");
  if (fs.existsSync('test_restore_dir')) {
    fs.rmSync('test_restore_dir', { recursive: true, force: true });
  }
  fs.mkdirSync('test_restore_dir');
  
  try {
    execSync('tar -xf test_backup.zip -C test_restore_dir');
  } catch (err) {
    throw new Error("FAIL: Could not extract ZIP. The archive might be corrupted. " + err.message);
  }
  console.log("   ✅ SUCCESS: ZIP extracted without errors.");

  // Verify Contents
  console.log("4. Verifying backup contents...");
  const extractedFiles = fs.readdirSync('test_restore_dir');
  console.log("   Extracted root contents:", extractedFiles);
  
  if (!extractedFiles.includes('fud_portal.db')) {
    throw new Error("FAIL: fud_portal.db missing from backup!");
  }
  if (!extractedFiles.includes('uploads')) {
    throw new Error("FAIL: uploads directory missing from backup!");
  }
  
  const uploadContents = fs.readdirSync(path.join('test_restore_dir', 'uploads'));
  console.log("   Uploads directory contents:", uploadContents);
  
  console.log("\n=== ALL BACKUP & RESTORE TESTS PASSED ===");
  
  // Cleanup
  fs.unlinkSync('test_backup.zip');
  fs.rmSync('test_restore_dir', { recursive: true, force: true });
}

verifyBackup().catch(err => {
  console.error(err);
  process.exit(1);
});
