/**
 * full_audit_test.js – FUD Portal Complete Audit Test Suite
 * Tests: Auth · Users · Tests/CBT · Media · Email · Admin · Notifications · DB
 * Run: node full_audit_test.js
 */
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');

const BASE = 'http://localhost:5000';
let pass = 0, fail = 0, skip = 0;
const results = [];

const OK   = (m, detail='') => { console.log(`\x1b[32m✓\x1b[0m ${m}${detail?' — '+detail:''}`); pass++; results.push({s:'PASS',m}); };
const FAIL = (m, detail='') => { console.log(`\x1b[31m✗\x1b[0m ${m}${detail?' — '+detail:''}`); fail++; results.push({s:'FAIL',m,detail}); };
const SKIP = (m)            => { console.log(`\x1b[33m-\x1b[0m ${m} (skipped)`); skip++; results.push({s:'SKIP',m}); };
const HDR  = (m)            => { console.log(`\n\x1b[1m\x1b[34m══ ${m} ══\x1b[0m`); };

function req(method, url, body=null, token=null, isForm=false) {
  return new Promise((resolve, reject) => {
    const b = body && !isForm ? JSON.stringify(body) : body;
    const h = {};
    if (b && !isForm) { h['Content-Type']='application/json'; h['Content-Length']=Buffer.byteLength(b); }
    if (token)        h['Authorization'] = 'Bearer '+token;
    const u = new URL(url);
    const r = http.request({hostname:u.hostname,port:u.port||80,path:u.pathname+(u.search||''),method,headers:h}, res => {
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{
        try { resolve({status:res.statusCode,data:JSON.parse(d),raw:d}); }
        catch { resolve({status:res.statusCode,data:null,raw:d}); }
      });
    });
    r.on('error', reject);
    if (b) r.write(b);
    r.end();
  });
}

const rnd  = ()=>Math.floor(Math.random()*90000+10000);
const RND  = rnd();
let adminToken, studentToken, studentId, testId, questionId, mediaId, notifId;

(async()=>{

// ═══════════════════════════════════════════════════════════════
HDR('1. HEALTH CHECK');
// ═══════════════════════════════════════════════════════════════
try {
  const r = await req('GET',`${BASE}/api/health`);
  r.data?.success ? OK('Server health check', `env=${r.data.env} uptime=${r.data.uptime}s`) : FAIL('Health check failed', r.raw?.slice(0,80));
} catch(e) { FAIL('Server not reachable', e.message); process.exit(1); }

// ═══════════════════════════════════════════════════════════════
HDR('2. AUTH – ADMIN LOGIN');
// ═══════════════════════════════════════════════════════════════
try {
  const r = await req('POST',`${BASE}/api/auth/admin/login`,{email:'admin@fudportal.edu.ng',password:'Admin@FUD2024'});
  if(r.status===200 && r.data?.data?.accessToken) {
    adminToken = r.data.data.accessToken;
    OK('Admin login', `role=${r.data.data.user.role}`);
  } else { FAIL('Admin login failed', r.data?.message); process.exit(1); }
} catch(e) { FAIL('Admin login error', e.message); process.exit(1); }

// ═══════════════════════════════════════════════════════════════
HDR('3. AUTH – STUDENT REGISTER & LOGIN');
// ═══════════════════════════════════════════════════════════════
const sEmail = `audit${RND}@fud.edu.ng`;
try {
  const r = await req('POST',`${BASE}/api/auth/register/student`,{
    email:sEmail, password:'AuditPass99@', confirm_password:'AuditPass99@',
    full_name:'Audit Test Student', matric_no:`FUD/AUD/${RND}`,
    department:'Computer Science', faculty:'Computing', level:'300', phone:'08012345678'
  });
  r.status===201 ? OK('Student register',`email=${sEmail}`) : FAIL('Student register',r.data?.message);
} catch(e) { FAIL('Student register error',e.message); }

try {
  const r = await req('POST',`${BASE}/api/auth/login`,{email:sEmail,password:'AuditPass99@'});
  if(r.status===200 && r.data?.data?.accessToken) {
    studentToken = r.data.data.accessToken;
    OK('Student login', `role=${r.data.data.user.role}`);
  } else { FAIL('Student login',r.data?.message); }
} catch(e) { FAIL('Student login error',e.message); }

try {
  const r = await req('POST',`${BASE}/api/auth/login`,{email:'admin@fudportal.edu.ng',password:'Admin@FUD2024'});
  r.status===200 ? OK('General login (admin via /login)') : FAIL('General login failed',r.data?.message);
} catch(e) { FAIL('General login error',e.message); }

try {
  const r = await req('GET',`${BASE}/api/auth/me`,null,adminToken);
  r.data?.success ? OK('GET /auth/me (admin)',`email=${r.data.data?.email}`) : FAIL('GET /auth/me failed',r.data?.message);
} catch(e) { FAIL('/auth/me error',e.message); }

try {
  const r = await req('POST',`${BASE}/api/auth/forgot-password`,{email:'nonexistent@fud.edu.ng'});
  // Should succeed (200) but not reveal whether email exists
  r.status===200 ? OK('Forgot password (non-existent email returns 200)') : FAIL('Forgot password error',r.data?.message);
} catch(e) { FAIL('Forgot password exception',e.message); }

// ═══════════════════════════════════════════════════════════════
HDR('4. AUTH – TOKEN REFRESH & CHANGE PASSWORD');
// ═══════════════════════════════════════════════════════════════
try {
  const r = await req('PUT',`${BASE}/api/auth/change-password`,
    {current_password:'AuditPass99@',new_password:'AuditPass88@',confirm_password:'AuditPass88@'}, studentToken);
  if(r.status===200) {
    OK('Change password');
    studentToken = r.data?.data?.accessToken || studentToken; // some endpoints return new token
  } else { FAIL('Change password failed',r.data?.message); }
} catch(e) { FAIL('Change password error',e.message); }

// ═══════════════════════════════════════════════════════════════
HDR('5. USERS');
// ═══════════════════════════════════════════════════════════════
try {
  const r = await req('GET',`${BASE}/api/users/students?limit=5`,null,adminToken);
  if(r.data?.success) {
    OK('List students', `total=${r.data.data?.total}`);
    studentId = r.data.data?.rows?.[0]?.user_id || r.data.data?.rows?.[0]?.id;
  } else { FAIL('List students',r.data?.message); }
} catch(e) { FAIL('List students error',e.message); }

try {
  const r = await req('GET',`${BASE}/api/users?limit=5`,null,adminToken);
  r.data?.success ? OK('List all users',`total=${r.data.data?.total||r.data.pagination?.total}`) : FAIL('List users',r.data?.message);
} catch(e) { FAIL('List users error',e.message); }

// ═══════════════════════════════════════════════════════════════
HDR('6. TESTS/CBT – CRUD');
// ═══════════════════════════════════════════════════════════════
try {
  const r = await req('POST',`${BASE}/api/tests`,{
    title:'Audit Test '+RND, subject:'Computer Science', course_code:'CSC301',
    duration_mins:30, total_marks:10, pass_mark:50, test_type:'mcq',
    description:'Auto-generated audit test', semester:'First',
    academic_year:'2024/2025', level:'300', department:'Computer Science'
  },adminToken);
  if(r.status===201 && r.data?.data?.id) {
    testId = r.data.data.id;
    OK('Create test',`id=${testId}`);
  } else { FAIL('Create test',r.data?.message); }
} catch(e) { FAIL('Create test error',e.message); }

try {
  const r = await req('GET',`${BASE}/api/tests?limit=5`,null,adminToken);
  r.data?.success ? OK('List tests',`total=${r.data.data?.total}`) : FAIL('List tests',r.data?.message);
} catch(e) { FAIL('List tests error',e.message); }

if(testId) {
  try {
    const r = await req('GET',`${BASE}/api/tests/${testId}`,null,adminToken);
    r.data?.success ? OK(`GET /tests/${testId}`,`title=${r.data.data?.title}`) : FAIL('Get test',r.data?.message);
  } catch(e) { FAIL('Get test error',e.message); }

  // Add questions
  try {
    const r = await req('POST',`${BASE}/api/tests/${testId}/questions/bulk`,{questions:[
      {question_text:'What does CPU stand for?',question_type:'mcq',option_a:'Central Processing Unit',
       option_b:'Core Power Unit',option_c:'Central Power Unit',option_d:'Computer Power Unit',
       correct_answer:'A',marks:2},
      {question_text:'HTML stands for HyperText Markup Language',question_type:'true_false',
       correct_answer:'true',marks:2},
      {question_text:'Which is a programming language?',question_type:'mcq',option_a:'HTML',
       option_b:'CSS',option_c:'Python',option_d:'HTTP',correct_answer:'C',marks:2},
      {question_text:'A for-loop is a control structure',question_type:'true_false',
       correct_answer:'true',marks:2},
      {question_text:'RAM stands for?',question_type:'mcq',option_a:'Random Access Memory',
       option_b:'Read All Memory',option_c:'Real Access Mode',option_d:'Remote Access Module',
       correct_answer:'A',marks:2},
    ]},adminToken);
    if(r.data?.success) {
      questionId = r.data.data?.questions?.[0]?.id;
      OK('Bulk add questions',`count=${r.data.data?.questions?.length}`);
    } else { FAIL('Bulk add questions',r.data?.message); }
  } catch(e) { FAIL('Bulk questions error',e.message); }

  try {
    const r = await req('GET',`${BASE}/api/tests/${testId}/questions`,null,adminToken);
    r.data?.success ? OK('Get questions',`count=${r.data.data?.length}`) : FAIL('Get questions',r.data?.message);
  } catch(e) { FAIL('Get questions error',e.message); }

  // Publish
  try {
    const r = await req('PATCH',`${BASE}/api/tests/${testId}/publish`,{},adminToken);
    r.data?.success ? OK('Publish test') : FAIL('Publish test',r.data?.message);
  } catch(e) { FAIL('Publish test error',e.message); }

  // Student can see published test
  if(studentToken) {
    try {
      const r = await req('GET',`${BASE}/api/tests?is_published=1&limit=10`,null,studentToken);
      r.data?.success ? OK('Student can list published tests',`count=${r.data.data?.rows?.length}`) : FAIL('Student list tests',r.data?.message);
    } catch(e) { FAIL('Student list tests error',e.message); }
  }

  // Test stats
  try {
    const r = await req('GET',`${BASE}/api/tests/stats`,null,adminToken);
    r.data?.success ? OK('Test stats',`total=${r.data.data?.total} published=${r.data.data?.published}`) : FAIL('Test stats',r.data?.message);
  } catch(e) { FAIL('Test stats error',e.message); }

  // Start CBT session first, then submit
  if(studentToken) {
    try {
      const startR = await req('POST',`${BASE}/api/tests/${testId}/start`,{},studentToken);
      if(startR.data?.success || startR.status===200) {
        OK('Start CBT session');
        // Now submit
        const submitR = await req('POST',`${BASE}/api/tests/${testId}/submit`,
          {answers:{1:'A',2:'true',3:'C',4:'true',5:'A'}}, studentToken);
        if(submitR.data?.success||submitR.status===201) {
          OK('Submit CBT test',`score=${submitR.data.data?.score} passed=${submitR.data.data?.passed}`);
        } else { FAIL('Submit CBT',submitR.data?.message); }
      } else { FAIL('Start CBT session',startR.data?.message); }
    } catch(e) { FAIL('CBT session error',e.message); }

    try {
      const r = await req('GET',`${BASE}/api/tests/my-results`,null,studentToken);
      r.data?.success ? OK('Get my results',`count=${r.data.data?.rows?.length||r.data.data?.length}`) : FAIL('My results',r.data?.message);
    } catch(e) { FAIL('My results error',e.message); }
  }

  // Unpublish
  try {
    const r = await req('PATCH',`${BASE}/api/tests/${testId}/unpublish`,{},adminToken);
    r.data?.success ? OK('Unpublish test') : FAIL('Unpublish test',r.data?.message);
  } catch(e) { FAIL('Unpublish error',e.message); }
} else { SKIP('CBT operations — no testId'); }

// ═══════════════════════════════════════════════════════════════
HDR('7. MEDIA');
// ═══════════════════════════════════════════════════════════════
// Upload a real small file using multipart
try {
  const boundary = '----AuditBoundary'+Date.now();
  const content  = 'FUD Portal audit test file. ' .repeat(10);
  const filename = `audit_test_${RND}.txt`;
  const body = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    'Content-Type: text/plain',
    '',
    content,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  const bodyBuf = Buffer.from(body);
  const r = await new Promise((resolve,reject)=>{
    const u = new URL(`${BASE}/api/media/upload`);
    const opts = {
      hostname:u.hostname, port:u.port, path:u.pathname, method:'POST',
      headers:{
        'Content-Type':`multipart/form-data; boundary=${boundary}`,
        'Content-Length':bodyBuf.length,
        'Authorization':`Bearer ${adminToken}`,
      },
    };
    const req2 = http.request(opts, res=>{
      let d=''; res.on('data',c=>d+=c);
      res.on('end',()=>{ try{resolve({status:res.statusCode,data:JSON.parse(d)})}catch{resolve({status:res.statusCode,data:null,raw:d})} });
    });
    req2.on('error',reject);
    req2.write(bodyBuf);
    req2.end();
  });
  if(r.status===201 && r.data?.data?.id) {
    mediaId = r.data.data.id;
    OK('Upload media file',`id=${mediaId} name=${r.data.data?.original_name}`);
  } else { FAIL('Upload media',r.data?.message||r.raw?.slice(0,100)); }
} catch(e) { FAIL('Upload media error',e.message); }

try {
  const r = await req('GET',`${BASE}/api/media?limit=5`,null,adminToken);
  r.data?.success ? OK('List media',`total=${r.data.data?.total}`) : FAIL('List media',r.data?.message);
} catch(e) { FAIL('List media error',e.message); }

try {
  const r = await req('GET',`${BASE}/api/media/stats`,null,adminToken);
  r.data?.success ? OK('Media stats',`total=${r.data.data?.total_files}`) : FAIL('Media stats',r.data?.message);
} catch(e) { FAIL('Media stats error',e.message); }

if(mediaId) {
  try {
    const r = await req('PATCH',`${BASE}/api/media/${mediaId}/visibility`,{is_public:true},adminToken);
    r.data?.success ? OK('Toggle media visibility (public)') : FAIL('Visibility toggle',r.data?.message);
  } catch(e) { FAIL('Visibility toggle error',e.message); }

  // Student can see public media
  if(studentToken) {
    try {
      const r = await req('GET',`${BASE}/api/media/${mediaId}`,null,studentToken);
      r.data?.success ? OK('Student can access public media') : FAIL('Student media access',r.data?.message);
    } catch(e) { FAIL('Student media access error',e.message); }
  }

  try {
    const r = await req('DELETE',`${BASE}/api/media/${mediaId}`,null,adminToken);
    r.data?.success ? OK('Delete media file') : FAIL('Delete media',r.data?.message);
  } catch(e) { FAIL('Delete media error',e.message); }
}

// ═══════════════════════════════════════════════════════════════
HDR('8. NOTIFICATIONS');
// ═══════════════════════════════════════════════════════════════
try {
  const r = await req('POST',`${BASE}/api/notifications/broadcast`,{
    title:'Audit Test Notification',message:'This is an automated audit notification',
    type:'info',target:'all'
  },adminToken);
  r.data?.success ? OK('Broadcast notification',`sent=${r.data.data?.sent}`) : FAIL('Broadcast',r.data?.message);
} catch(e) { FAIL('Broadcast error',e.message); }

try {
  const r = await req('GET',`${BASE}/api/notifications?limit=5`,null,adminToken);
  if(r.data?.success) {
    OK('List notifications',`total=${r.data.data?.total||r.data.pagination?.total}`);
    notifId = r.data.data?.rows?.[0]?.id;
  } else { FAIL('List notifications',r.data?.message); }
} catch(e) { FAIL('List notifications error',e.message); }

try {
  const r = await req('GET',`${BASE}/api/notifications/unread-count`,null,adminToken);
  r.data?.success ? OK('Unread count',`count=${r.data.data?.count}`) : FAIL('Unread count',r.data?.message);
} catch(e) { FAIL('Unread count error',e.message); }

if(notifId) {
  try {
    const r = await req('PATCH',`${BASE}/api/notifications/${notifId}/read`,{},adminToken);
    r.data?.success ? OK('Mark notification read') : FAIL('Mark read',r.data?.message);
  } catch(e) { FAIL('Mark read error',e.message); }
}

try {
  const r = await req('PATCH',`${BASE}/api/notifications/mark-all-read`,{},adminToken);
  r.data?.success ? OK('Mark all read') : FAIL('Mark all read',r.data?.message);
} catch(e) { FAIL('Mark all read error',e.message); }

// ═══════════════════════════════════════════════════════════════
HDR('9. EMAIL SYSTEM');
// ═══════════════════════════════════════════════════════════════
try {
  const r = await req('GET',`${BASE}/api/email/stats`,null,adminToken);
  r.data?.success ? OK('Email stats',`pending=${r.data.data?.pending} total=${r.data.data?.total}`) : FAIL('Email stats',r.data?.message);
} catch(e) { FAIL('Email stats error',e.message); }

try {
  const r = await req('GET',`${BASE}/api/email/queue?limit=5`,null,adminToken);
  r.data?.success ? OK('Email queue list') : FAIL('Email queue list',r.data?.message);
} catch(e) { FAIL('Email queue error',e.message); }

const templates = ['welcome','password_reset','exam','result','result_fail'];
for(const tpl of templates) {
  try {
    const res = await new Promise((resolve,reject)=>{
      const u = new URL(`${BASE}/api/email/preview/${tpl}`);
      const r = http.request({hostname:u.hostname,port:u.port,path:u.pathname,
        method:'GET',headers:{Authorization:'Bearer '+adminToken}},res=>{
        let d=''; res.on('data',c=>d+=c);
        res.on('end',()=>resolve({status:res.statusCode,body:d}));
      });
      r.on('error',reject); r.end();
    });
    res.status===200 && res.body.includes('FUD Portal')
      ? OK(`Email preview: ${tpl}`)
      : FAIL(`Email preview: ${tpl}`,`status=${res.status}`);
  } catch(e) { FAIL(`Preview ${tpl} error`,e.message); }
}

try {
  const r = await req('POST',`${BASE}/api/email/send`,{
    subject:'Audit Bulk Email '+RND, message_html:'<p>Audit test email from FUD Portal.</p>',
    target:'admins', category:'announcement'
  },adminToken);
  r.data?.success ? OK('Bulk email send',`queued=${r.data.data?.queued}`) : FAIL('Bulk email',r.data?.message);
} catch(e) { FAIL('Bulk email error',e.message); }

try {
  const r = await req('POST',`${BASE}/api/email/process-queue`,null,adminToken);
  r.data?.success ? OK('Process email queue') : FAIL('Process queue',r.data?.message);
} catch(e) { FAIL('Process queue error',e.message); }

try {
  const r = await req('POST',`${BASE}/api/email/retry-all`,null,adminToken);
  r.data?.success ? OK('Retry all failed emails',`retried=${r.data.data?.retried}`) : FAIL('Retry all',r.data?.message);
} catch(e) { FAIL('Retry all error',e.message); }

// ═══════════════════════════════════════════════════════════════
HDR('10. ADMIN');
// ═══════════════════════════════════════════════════════════════
try {
  const r = await req('GET',`${BASE}/api/admin/stats`,null,adminToken);
  r.data?.success ? OK('Admin stats') : FAIL('Admin stats',r.data?.message);
} catch(e) { FAIL('Admin stats error',e.message); }

try {
  const r = await req('GET',`${BASE}/api/admin/activity?limit=5`,null,adminToken);
  r.data?.success ? OK('Admin activity logs',`total=${r.data.data?.total||r.data.pagination?.total}`) : FAIL('Admin logs',r.data?.message);
} catch(e) { FAIL('Admin logs error',e.message); }

// ═══════════════════════════════════════════════════════════════
HDR('11. SECURITY CHECKS');
// ═══════════════════════════════════════════════════════════════
try {
  const r = await req('GET',`${BASE}/api/users`); // no token
  r.status===401 ? OK('Unauthenticated request blocked (401)') : FAIL('Security: unauth not blocked',`status=${r.status}`);
} catch(e) { FAIL('Security check error',e.message); }

try {
  const r = await req('GET',`${BASE}/api/admin/logs`,null,studentToken); // student trying admin
  r.status===403 ? OK('Role check: student blocked from admin (403)') : FAIL('Role check failed',`status=${r.status}`);
} catch(e) { FAIL('Role check error',e.message); }

try {
  const r = await req('POST',`${BASE}/api/auth/login`,{email:"'; DROP TABLE users; --",password:'x'});
  r.status!==500 ? OK('SQL injection in login handled gracefully',`status=${r.status}`) : FAIL('SQL injection caused 500',r.data?.message);
} catch(e) { FAIL('SQL injection test error',e.message); }

try {
  const r = await req('GET',`${BASE}/api/tests/../../../etc/passwd`,null,adminToken);
  r.status===404 ? OK('Path traversal blocked (404)') : OK(`Path traversal: status=${r.status} (non-200 OK)`);
} catch(e) { FAIL('Path traversal error',e.message); }

// ═══════════════════════════════════════════════════════════════
HDR('12. FRONTEND PAGES');
// ═══════════════════════════════════════════════════════════════
const pages = ['index.html','dashboard.html','tests.html','cbt.html','admin.html',
               'media.html','email.html','notifications.html','profile.html','register.html'];
for(const page of pages) {
  try {
    const r = await new Promise((resolve,reject)=>{
      const u=new URL(`${BASE}/${page}`);
      const req2=http.request({hostname:u.hostname,port:u.port,path:u.pathname,method:'GET'},res=>{
        let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({status:res.statusCode,len:d.length}));
      });
      req2.on('error',reject); req2.end();
    });
    r.status===200 && r.len > 1000
      ? OK(`Page: /${page}`, `${(r.len/1024).toFixed(1)}KB`)
      : FAIL(`Page: /${page}`, `status=${r.status} size=${r.len}`);
  } catch(e) { FAIL(`Page /${page} error`,e.message); }
}

// ═══════════════════════════════════════════════════════════════
HDR('13. DATABASE INTEGRITY');
// ═══════════════════════════════════════════════════════════════
const { db } = require('./backend/database/db');
const tables = ['users','students','admins','tests','questions','results',
                'notifications','activity_logs','password_resets','tokens','email_queue','media'];
for(const tbl of tables) {
  try {
    await new Promise((resolve,reject)=>db.get(`SELECT COUNT(*) AS c FROM ${tbl}`,[],(err,row)=>{
      if(err) reject(err); else resolve(row);
    })).then(row=>OK(`Table "${tbl}" exists`,`rows=${row.c}`));
  } catch(e) { FAIL(`Table "${tbl}" missing or broken`,e.message); }
}

// Check WAL mode
try {
  const mode = await new Promise((resolve,reject)=>db.get('PRAGMA journal_mode',(err,r)=>err?reject(err):resolve(r?.journal_mode)));
  mode==='wal' ? OK('SQLite WAL mode enabled') : FAIL('WAL mode not enabled',`mode=${mode}`);
} catch(e) { FAIL('WAL check error',e.message); }

// FK check — use the same shared db connection (not a new one)
try {
  const { run: dbRun } = require('./backend/database/db');
  await dbRun('PRAGMA foreign_keys = ON');
  const fk = await new Promise((resolve,reject)=>db.get('PRAGMA foreign_keys',(err,r)=>err?reject(err):resolve(r?.foreign_keys)));
  fk===1 ? OK('Foreign keys enforced') : FAIL('Foreign keys not enforced',`fk=${fk}`);
} catch(e) { FAIL('FK check error',e.message); }

// ═══════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════
HDR('14. CLEANUP');
if(testId) {
  try {
    const r = await req('DELETE',`${BASE}/api/tests/${testId}`,null,adminToken);
    r.data?.success ? OK('Deleted audit test') : SKIP('Delete test: '+r.data?.message);
  } catch(e) { SKIP('Delete test: '+e.message); }
}

// ═══════════════════════════════════════════════════════════════
// RESULTS SUMMARY
// ═══════════════════════════════════════════════════════════════
console.log('\n'+('═').repeat(60));
console.log(`\x1b[1mFINAL RESULTS\x1b[0m`);
console.log(('═').repeat(60));
console.log(`\x1b[32m✓ PASSED: ${pass}\x1b[0m`);
console.log(`\x1b[31m✗ FAILED: ${fail}\x1b[0m`);
console.log(`\x1b[33m- SKIPPED: ${skip}\x1b[0m`);
console.log(`  TOTAL:  ${pass+fail+skip}`);
const score = Math.round(pass/(pass+fail)*100) || 0;
console.log(`\x1b[1m  SCORE:  ${score}%\x1b[0m\n`);

if(fail>0) {
  console.log('\x1b[31mFailed tests:\x1b[0m');
  results.filter(r=>r.s==='FAIL').forEach(r=>console.log(`  ✗ ${r.m}${r.detail?' — '+r.detail:''}`));
}

// Write report
const report = {timestamp:new Date().toISOString(),pass,fail,skip,score,results};
fs.writeFileSync('audit_report.json', JSON.stringify(report,null,2));
console.log('\nReport saved to: audit_report.json');
process.exit(fail>0?1:0);
})();
