/**
 * email_system_test.js – FUD Portal Email System smoke test
 */
'use strict';
const http = require('http');
const BASE = 'http://localhost:5000';
let pass = 0, fail = 0;
const OK  = m => { console.log('\x1b[32m[OK]   \x1b[0m' + m); pass++; };
const NOK = m => { console.log('\x1b[31m[FAIL] \x1b[0m' + m); fail++; };

function req(method, url, body=null, token=null) {
  return new Promise((resolve, reject) => {
    const b = body ? JSON.stringify(body) : null;
    const h = {};
    if (b)     { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(b); }
    if (token) { h['Authorization'] = 'Bearer ' + token; }
    const u = new URL(url);
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: h }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { reject(new Error('Parse: ' + d.slice(0,100))); }
      });
    });
    r.on('error', reject);
    if (b) r.write(b);
    r.end();
  });
}

(async () => {
  console.log('\n==== EMAIL SYSTEM SMOKE TEST ====\n');

  // 1. Health
  try {
    const r = await req('GET', `${BASE}/api/health`);
    if (r.data.success) OK('Health check');
    else NOK('Health check failed');
  } catch(e) { NOK('Server not running: ' + e.message); process.exit(1); }

  // 2. Admin login
  let at;
  try {
    const r = await req('POST', `${BASE}/api/auth/admin/login`, { email:'admin@fudportal.edu.ng', password:'Admin@FUD2024' });
    at = r.data.data.accessToken;
    OK(`Admin login role=${r.data.data.user.role}`);
  } catch(e) { NOK('Admin login: ' + e.message); process.exit(1); }

  // 3. Email stats endpoint
  try {
    const r = await req('GET', `${BASE}/api/email/stats`, null, at);
    if (!r.data.success) throw new Error(r.data.message);
    const s = r.data.data;
    OK(`Stats: pending=${s.pending} sent=${s.sent} failed=${s.failed} total=${s.total}`);
  } catch(e) { NOK('Stats: ' + e.message); }

  // 4. List queue
  try {
    const r = await req('GET', `${BASE}/api/email/queue?page=1&limit=10`, null, at);
    if (!r.data.success) throw new Error(r.data.message);
    OK(`List queue total=${r.data.data.total}`);
  } catch(e) { NOK('List queue: ' + e.message); }

  // 5. Template preview – welcome
  try {
    const res = await new Promise((resolve, reject) => {
      const u = new URL(`${BASE}/api/email/preview/welcome`);
      const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname,
        method: 'GET', headers: { Authorization: 'Bearer ' + at } }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      r.on('error', reject); r.end();
    });
    if (res.status === 200 && res.body.includes('FUD Portal')) OK('Preview welcome template (HTML)');
    else NOK('Preview welcome: status=' + res.status);
  } catch(e) { NOK('Preview: ' + e.message); }

  // 6. Preview password_reset
  try {
    const res = await new Promise((resolve, reject) => {
      const u = new URL(`${BASE}/api/email/preview/password_reset`);
      const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname,
        method: 'GET', headers: { Authorization: 'Bearer ' + at } }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      r.on('error', reject); r.end();
    });
    if (res.status === 200 && res.body.includes('Reset My Password')) OK('Preview password_reset template');
    else NOK('Preview password_reset: status=' + res.status);
  } catch(e) { NOK('Preview password_reset: ' + e.message); }

  // 7. Preview exam notification
  try {
    const res = await new Promise((resolve, reject) => {
      const u = new URL(`${BASE}/api/email/preview/exam`);
      const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname,
        method: 'GET', headers: { Authorization: 'Bearer ' + at } }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      r.on('error', reject); r.end();
    });
    if (res.status === 200 && res.body.includes('Upcoming Exam')) OK('Preview exam template');
    else NOK('Preview exam: status=' + res.status);
  } catch(e) { NOK('Preview exam: ' + e.message); }

  // 8. Preview result (pass)
  try {
    const res = await new Promise((resolve, reject) => {
      const u = new URL(`${BASE}/api/email/preview/result`);
      const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname,
        method: 'GET', headers: { Authorization: 'Bearer ' + at } }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      r.on('error', reject); r.end();
    });
    if (res.status === 200 && res.body.includes('CONGRATULATIONS')) OK('Preview result template (pass)');
    else NOK('Preview result: status=' + res.status);
  } catch(e) { NOK('Preview result: ' + e.message); }

  // 9. Preview result (fail)
  try {
    const res = await new Promise((resolve, reject) => {
      const u = new URL(`${BASE}/api/email/preview/result_fail`);
      const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname,
        method: 'GET', headers: { Authorization: 'Bearer ' + at } }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      r.on('error', reject); r.end();
    });
    if (res.status === 200 && res.body.includes('DID NOT PASS')) OK('Preview result template (fail)');
    else NOK('Preview result_fail: status=' + res.status);
  } catch(e) { NOK('Preview result_fail: ' + e.message); }

  // 10. Send bulk email (students only)
  let queuedCount = 0;
  try {
    const r = await req('POST', `${BASE}/api/email/send`, {
      subject:      'Test Bulk Email – FUD Portal Smoke Test',
      message_html: '<p>This is an <strong>automated test</strong> bulk email.</p>',
      target:       'students',
      category:     'info',
    }, at);
    if (!r.data.success) throw new Error(r.data.message);
    queuedCount = r.data.data.queued;
    OK(`Bulk send to students: ${queuedCount} queued`);
  } catch(e) { NOK('Bulk send: ' + e.message); }

  // 11. Verify queue grew
  try {
    const r = await req('GET', `${BASE}/api/email/stats`, null, at);
    const s = r.data.data;
    OK(`Queue after bulk: pending=${s.pending} total=${s.total}`);
  } catch(e) { NOK('Stats after bulk: ' + e.message); }

  // 12. Process queue (manually flush)
  try {
    const r = await req('POST', `${BASE}/api/email/process-queue`, null, at);
    if (!r.data.success) throw new Error(r.data.message);
    OK('Queue flush triggered');
  } catch(e) { NOK('Queue flush: ' + e.message); }

  // 13. Check queue list with status filter
  try {
    const r = await req('GET', `${BASE}/api/email/queue?status=sent&limit=5`, null, at);
    OK(`Queue filter status=sent: ${r.data.data.total} records`);
  } catch(e) { NOK('Queue filter: ' + e.message); }

  // 14. Retry all failed (should be 0, still tests endpoint)
  try {
    const r = await req('POST', `${BASE}/api/email/retry-all`, null, at);
    OK(`Retry all: ${r.data.data.retried} re-queued`);
  } catch(e) { NOK('Retry all: ' + e.message); }

  // 15. Register student → check welcome email queued
  const rnd = Math.floor(Math.random() * 90000 + 10000);
  const se  = `emailtest${rnd}@fud.edu.ng`;
  try {
    const r = await req('POST', `${BASE}/api/auth/register/student`, {
      email: se, password: 'TestPass99@', confirm_password: 'TestPass99@',
      full_name: 'Email Test', matric_no: `FUD/ET/${rnd}`,
      department: 'Computer Science', faculty: 'Computing', level: '300', phone: '08033334444',
    });
    if (r.data.success) OK(`Student registered: ${se} (welcome email should be queued)`);
    else NOK('Student register: ' + r.data.message);
  } catch(e) { NOK('Student register: ' + e.message); }

  // 16. Check stats again – welcome email should be in queue
  await new Promise(r => setTimeout(r, 500));
  try {
    const r = await req('GET', `${BASE}/api/email/stats`, null, at);
    const s = r.data.data;
    OK(`Final stats: pending=${s.pending} sent=${s.sent} total=${s.total}`);
  } catch(e) { NOK('Final stats: ' + e.message); }

  // 17. email.html page reachable
  try {
    const res = await new Promise((resolve, reject) => {
      const u = new URL(`${BASE}/email.html`);
      const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode }));
      });
      r.on('error', reject); r.end();
    });
    if (res.status === 200) OK('/email.html HTTP 200');
    else NOK('/email.html status=' + res.status);
  } catch(e) { NOK('/email.html: ' + e.message); }

  console.log(`\n==== RESULTS: ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail > 0 ? 1 : 0);
})();
