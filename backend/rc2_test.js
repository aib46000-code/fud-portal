const fs = require('fs');
const path = require('path');

const LIVE_API = 'https://skillful-happiness-production-ba1e.up.railway.app/api';
// const LIVE_API = 'http://localhost:5000/api'; // fallback if needed, but strict requirement is live

async function fetchAPI(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const res = await fetch(LIVE_API + endpoint, {
    ...options,
    headers,
  });
  let data;
  const text = await res.text();
  try { data = JSON.parse(text); } catch(e) { data = text; }
  return { status: res.status, data };
}

async function uploadFile(endpoint, filePath, token, additionalFields = {}) {
  const fileContent = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  let body = '';
  
  body += '--' + boundary + '\r\n';
  body += 'Content-Disposition: form-data; name="file"; filename="' + filename + '"\r\n';
  body += 'Content-Type: text/plain\r\n\r\n';
  body += fileContent + '\r\n';

  for (const key in additionalFields) {
    body += '--' + boundary + '\r\n';
    body += 'Content-Disposition: form-data; name="' + key + '"\r\n\r\n';
    body += additionalFields[key] + '\r\n';
  }
  body += '--' + boundary + '--\r\n';

  const res = await fetch(LIVE_API + endpoint, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'multipart/form-data; boundary=' + boundary
    },
    body: body
  });
  let data;
  const text = await res.text();
  try { data = JSON.parse(text); } catch(e) { data = text; }
  return { status: res.status, data };
}

async function runTests() {
  const report = [];
  const log = (flow, name, status, pass, notes = '', data = null) => {
    report.push({ flow, name, status, pass, notes, data });
    console.log(`[${flow}] ${name} - ${pass ? 'PASS' : 'FAIL'} (${status}) - ${notes}`);
  };

  try {
    let adminToken, adminId;
    const adminLogin = await fetchAPI('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@fudportal.edu.ng', password: 'Admin@FUD2024' }) });
    if (adminLogin.status === 200 && adminLogin.data.data && adminLogin.data.data.accessToken) {
      adminToken = adminLogin.data.data.accessToken;
      log('ADMIN', 'Admin Login', adminLogin.status, true, 'Logged in as superadmin');
    } else {
      log('ADMIN', 'Admin Login', adminLogin.status, false, 'Failed to login', adminLogin.data);
      return console.log("Aborting due to admin login failure");
    }

    const ts = Date.now();
    let subjectId = null;
    let testId = null;

    // Admin Dashboard
    const adminStats = await fetchAPI('/admin/stats', { headers: { 'Authorization': 'Bearer ' + adminToken } });
    log('ADMIN', 'Dashboard', adminStats.status, adminStats.status === 200, 'Fetched stats');

    // Subject Management
    const createSubj = await fetchAPI('/subjects', { method: 'POST', headers: { 'Authorization': 'Bearer ' + adminToken }, body: JSON.stringify({ name: 'RC2 Subject ' + ts, code: 'RC2' + ts, description: 'desc' }) });
    if (createSubj.status === 201) {
      subjectId = createSubj.data.data.id;
      log('ADMIN', 'Subject Management', createSubj.status, true, `Created subject ${subjectId}`);
    } else {
      log('ADMIN', 'Subject Management', createSubj.status, false, 'Failed to create subject', createSubj.data);
    }

    // Question Bank Import
    if (subjectId) {
      const csvContent = `Question,A,B,C,D,Answer,Difficulty
What is 2+2?,3,4,5,6,B,easy
What is JS?,Lang,Car,Food,Toy,A,easy`;
      fs.writeFileSync('rc2_questions.csv', csvContent);
      const qImport = await uploadFile(`/subjects/${subjectId}/import`, 'rc2_questions.csv', adminToken);
      log('ADMIN', 'Question Bank', qImport.status, qImport.status === 200, 'Imported questions to subject', qImport.data);
    }

    // CBT Creation
    if (subjectId) {
      const testPayload = { title: "RC2 E2E Exam", course_code: "RC2101", description: "Desc", duration_minutes: 10, start_time: new Date().toISOString(), end_time: new Date(Date.now() + 86400000).toISOString(), is_published: 0, subject_id: subjectId, type: 'exam' };
      const createTest = await fetchAPI('/tests', { method: 'POST', headers: { 'Authorization': 'Bearer ' + adminToken }, body: JSON.stringify(testPayload) });
      if (createTest.status === 201) {
        testId = createTest.data.data.id;
        log('ADMIN', 'CBT Create', createTest.status, true, 'Created CBT');
        
        // Add Questions directly to CBT
        const cbtQuestions = { questions: [{ question_text: 'Q1', correct_answer: 'A', option_a: 'A', option_b: 'B', question_type: 'mcq' }] };
        const addQ = await fetchAPI(`/tests/${testId}/questions/bulk`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + adminToken }, body: JSON.stringify(cbtQuestions) });
        log('ADMIN', 'CBT Add Questions', addQ.status, addQ.status === 201 || addQ.status === 200, 'Added questions to CBT');

        // Publish CBT
        const pubTest = await fetchAPI(`/tests/${testId}/publish`, { method: 'PATCH', headers: { 'Authorization': 'Bearer ' + adminToken } });
        log('ADMIN', 'CBT Publish', pubTest.status, pubTest.status === 200, 'Published CBT');
      } else {
        log('ADMIN', 'CBT Create', createTest.status, false, 'Failed to create CBT', createTest.data);
      }
    }

    // Notifications Broadcast
    const notif = await fetchAPI('/notifications/broadcast', { method: 'POST', headers: { 'Authorization': 'Bearer ' + adminToken }, body: JSON.stringify({ title: 'E2E Broadcast', message: 'Hello RC2' }) });
    log('ADMIN', 'Notifications Broadcast', notif.status, notif.status === 200, 'Sent broadcast notification');

    // Student Registration
    const newStudentEmail = `rc2_${ts}@test.com`;
    const regPayload = { email: newStudentEmail, password: 'Password123!', full_name: 'RC Student Two', matric_no: 'RC2' + ts, department: 'CS', faculty: 'Science' };
    const studentReg = await fetchAPI('/auth/register/student', { method: 'POST', body: JSON.stringify(regPayload) });
    log('STUDENT', 'Registration', studentReg.status, studentReg.status === 201, 'Student registered');

    // Student Login
    let studentToken;
    const studentLogin = await fetchAPI('/auth/login', { method: 'POST', body: JSON.stringify({ email: newStudentEmail, password: 'Password123!' }) });
    if (studentLogin.status === 200) {
      studentToken = studentLogin.data.data.accessToken;
      log('STUDENT', 'Student Login', studentLogin.status, true, 'Student logged in');
    } else {
      log('STUDENT', 'Student Login', studentLogin.status, false, 'Student login failed');
    }

    // Dashboard (Student)
    const studentMe = await fetchAPI('/auth/me', { headers: { 'Authorization': 'Bearer ' + studentToken } });
    log('STUDENT', 'Dashboard', studentMe.status, studentMe.status === 200, 'Fetched /auth/me profile');

    // Notifications Check (Student)
    const stuNotif = await fetchAPI('/notifications', { headers: { 'Authorization': 'Bearer ' + studentToken } });
    log('STUDENT', 'Notifications Fetch', stuNotif.status, stuNotif.status === 200, 'Fetched notifications');

    // Student Upload
    fs.writeFileSync('rc2_upload.txt', 'RC2 student upload');
    const studentMediaUpload = await uploadFile('/media/upload', 'rc2_upload.txt', studentToken, { is_public: 0, visibility: 'private', category: 'document' });
    let studentMediaId;
    if (studentMediaUpload.status === 201) {
      studentMediaId = studentMediaUpload.data.data.id;
      log('STUDENT', 'Student Upload', studentMediaUpload.status, true, 'Student uploaded file');
    } else {
      log('STUDENT', 'Student Upload', studentMediaUpload.status, false, 'Failed to upload', studentMediaUpload.data);
    }

    // Admin Approves Upload (Media Approval)
    if (studentMediaId) {
      const approveRes = await fetchAPI(`/media/${studentMediaId}/visibility`, { method: 'PATCH', headers: { 'Authorization': 'Bearer ' + adminToken }, body: JSON.stringify({ is_public: 1 }) });
      log('ADMIN', 'Media Approval', approveRes.status, approveRes.status === 200, 'Admin approved media');
      
      // Learning Progress
      const openResource = await fetchAPI(`/media/${studentMediaId}/progress`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + studentToken }, body: JSON.stringify({ progress_pct: 100 }) });
      log('STUDENT', 'Learning Progress', openResource.status, openResource.status === 200, 'Tracked progress 100%');
    }

    // Student Takes CBT
    if (testId) {
      const startTest = await fetchAPI(`/tests/${testId}/start`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + studentToken } });
      log('STUDENT', 'CBT Start', startTest.status, startTest.status === 200, 'Student started test');

      if (startTest.status === 200) {
        const answers = [{ question_id: startTest.data.data.questions[0].id, answer: 'A' }];
        const submitTest = await fetchAPI(`/tests/${testId}/submit`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + studentToken }, body: JSON.stringify({ answers, time_taken: 60 }) });
        log('STUDENT', 'CBT Submit', submitTest.status, submitTest.status === 200 || submitTest.status === 201, 'Student submitted test', submitTest.data);

        // Student Views Results
        const stuRes = await fetchAPI('/tests/my-results', { headers: { 'Authorization': 'Bearer ' + studentToken } });
        log('STUDENT', 'Results (Student)', stuRes.status, stuRes.status === 200, 'Student viewed results');
      }

      // Admin Views Results
      const adminRes = await fetchAPI(`/tests/${testId}/results`, { headers: { 'Authorization': 'Bearer ' + adminToken } });
      log('ADMIN', 'Results (Admin)', adminRes.status, adminRes.status === 200, 'Admin viewed test results');
    }

    fs.writeFileSync('rc2_report.json', JSON.stringify(report, null, 2));
    console.log("\n--- FINAL PASS/FAIL SUMMARY ---");
    let passed = 0; let failed = 0;
    report.forEach(r => {
      if (r.pass) passed++; else failed++;
    });
    console.log(`TOTAL: ${report.length} | PASS: ${passed} | FAIL: ${failed}`);
    if (failed === 0) console.log("ALL FEATURES PASSED END-TO-END PRODUCTION TEST!");
    else console.log("SOME FEATURES FAILED. See rc2_report.json for details.");
    
  } catch(e) {
    console.error("FATAL ERROR in rc2_test:", e);
  }
}
runTests();
