/**
 * media_upload_test.js
 * Node.js script to test media upload with real multipart/form-data
 */
'use strict';
const http = require('http');
const https= require('https');
const fs   = require('fs');
const path = require('path');

const BASE   = 'http://localhost:5000';
const ADMIN  = { email:'admin@fudportal.edu.ng', password:'Admin@FUD2024' };

function post(url, data, token=null, isJson=true) {
  return new Promise((resolve, reject) => {
    const body    = isJson ? JSON.stringify(data) : data;
    const headers = { 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'MediaUploadTest/1.0' };
    if (isJson) headers['Content-Type'] = 'application/json';
    if (token)  headers['Authorization'] = 'Bearer ' + token;
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method: 'POST', headers }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { reject(new Error('Parse error: ' + body)); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function req(method, url, data=null, token=null) {
  return new Promise((resolve, reject) => {
    const body    = data ? JSON.stringify(data) : null;
    const headers = { 'User-Agent': 'MediaUploadTest/1.0' };
    if (body)  { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(body); }
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const u = new URL(url);
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method, headers }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(b) }); }
        catch { reject(new Error('Parse error: ' + b.slice(0,200))); }
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

function uploadFile(filePath, token, isPublic=1) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Date.now();
    const filename  = path.basename(filePath);
    const fileData  = fs.readFileSync(filePath);
    const parts = [
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/plain\r\n\r\n`),
      fileData,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="is_public"\r\n\r\n${isPublic}\r\n--${boundary}--\r\n`),
    ];
    const body    = Buffer.concat(parts);
    const headers = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
      'Authorization': 'Bearer ' + token,
      'User-Agent': 'MediaUploadTest/1.0',
    };
    const u = new URL(`${BASE}/api/media/upload`);
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname,
      method: 'POST', headers }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(b) }); }
        catch { reject(new Error('Parse: ' + b.slice(0,200))); }
      });
    });
    r.on('error', reject);
    r.write(body); r.end();
  });
}

let pass = 0, fail = 0;
const OK  = m => { console.log('\x1b[32m[OK]   \x1b[0m' + m); pass++; };
const NOK = m => { console.log('\x1b[31m[FAIL] \x1b[0m' + m); fail++; };

(async () => {
  console.log('\n==== MEDIA UPLOAD TEST (Node) ====');

  // 1. Admin login
  let at;
  try {
    const r = await req('POST', `${BASE}/api/auth/admin/login`, ADMIN);
    at = r.data.data.accessToken;
    OK(`Admin login role=${r.data.data.user.role}`);
  } catch(e) { NOK('Admin login: ' + e.message); process.exit(1); }

  // 2. Stats
  try {
    const r = await req('GET', `${BASE}/api/media/stats`, null, at);
    if (!r.data.success) throw new Error(r.data.message);
    const s = r.data.data;
    OK(`Stats total_files=${s.total_files} bytes=${s.total_bytes}`);
  } catch(e) { NOK('Stats: ' + e.message); }

  // 3. Upload text file
  const tmpFile = path.join(process.cwd(), 'uploads', '_test_upload.txt');
  fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
  fs.writeFileSync(tmpFile, `FUD Portal test upload\nTimestamp: ${new Date().toISOString()}\n`);

  let mediaId;
  try {
    const r = await uploadFile(tmpFile, at, 1);
    if (!r.data.success) throw new Error(r.data.message);
    mediaId = r.data.data.id;
    OK(`Upload id=${mediaId} cat=${r.data.data.category} size=${r.data.data.size_bytes}B pub=${r.data.data.is_public}`);
  } catch(e) { NOK('Upload: ' + e.message); }

  // 4. List
  try {
    const r = await req('GET', `${BASE}/api/media`, null, at);
    OK(`List total=${r.data.data.total}`);
  } catch(e) { NOK('List: ' + e.message); }

  if (mediaId) {
    // 5. Get one
    try {
      const r = await req('GET', `${BASE}/api/media/${mediaId}`, null, at);
      OK(`GetOne: ${r.data.data.original_name} pub=${r.data.data.is_public}`);
    } catch(e) { NOK('GetOne: ' + e.message); }

    // 6. Filter
    try {
      const r = await req('GET', `${BASE}/api/media?category=document`, null, at);
      OK(`Filter document total=${r.data.data.total}`);
    } catch(e) { NOK('Filter: ' + e.message); }

    // 7. Toggle private
    try {
      const r = await req('PATCH', `${BASE}/api/media/${mediaId}/visibility`, { is_public: 0 }, at);
      if (!r.data.success) throw new Error(r.data.message);
      OK(`Toggle private: is_public=${r.data.data.is_public}`);
    } catch(e) { NOK('Toggle private: ' + e.message); }

    // 8. Register student
    const rnd = Math.floor(Math.random() * 9000 + 1000);
    const se  = `mtest${rnd}@fud.edu.ng`;
    const sp  = 'TestPass99@';
    let   st;
    try {
      await req('POST', `${BASE}/api/auth/register/student`, {
        email: se, password: sp, confirm_password: sp,
        full_name: 'Media Tester', matric_no: `FUD/M/${rnd}`,
        department: 'Computer Science', faculty: 'Computing', level: '200', phone: '08011112222',
      });
      const lr = await req('POST', `${BASE}/api/auth/login`, { email: se, password: sp });
      st = lr.data.data.accessToken;
      OK(`Student registered: ${se}`);
    } catch(e) { NOK('Student setup: ' + e.message); }

    // 9. Student blocked from private
    if (st) {
      try {
        const r = await req('GET', `${BASE}/api/media/${mediaId}`, null, st);
        if (r.status === 403 || (r.data && !r.data.success)) OK('Student blocked from private file ✓');
        else NOK('Student saw private file (should be blocked)');
      } catch(e) { OK('Student blocked (exception): ' + e.message.slice(0,40)); }
    }

    // 10. Bulk upload 2 more files
    const tmpFile2 = path.join(process.cwd(), 'uploads', '_test2.txt');
    fs.writeFileSync(tmpFile2, 'Second test file\n');
    let id2;
    try {
      const r = await uploadFile(tmpFile2, at, 1);
      id2 = r.data.data?.id;
      OK(`Upload file2 id=${id2}`);
    } catch(e) { NOK('Upload file2: ' + e.message); }

    // 11. Bulk delete
    if (id2) {
      try {
        const r = await req('DELETE', `${BASE}/api/media/bulk`, { ids: [mediaId, id2] }, at);
        OK(`Bulk delete: ${r.data.data.deleted} deleted`);
        mediaId = null; // already deleted
      } catch(e) { NOK('Bulk delete: ' + e.message); }
    }

    // 12. Delete remaining if not bulk-deleted
    if (mediaId) {
      try {
        const r = await req('DELETE', `${BASE}/api/media/${mediaId}`, null, at);
        OK(`Delete: ${r.data.message}`);
      } catch(e) { NOK('Delete: ' + e.message); }
    }

    // Cleanup
    [tmpFile, tmpFile2].forEach(f => { try { fs.unlinkSync(f); } catch {} });
  }

  // Summary
  console.log(`\n==== RESULTS: ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
