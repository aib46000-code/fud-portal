const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const LIVE_API = 'https://skillful-happiness-production-ba1e.up.railway.app/api';

async function fetchAPI(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (options.body && options.body instanceof FormData) {
    delete headers['Content-Type']; 
  }
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
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  let body = '';
  
  body += '--' + boundary + '\r\n';
  body += 'Content-Disposition: form-data; name="file"; filename="test.txt"\r\n';
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
  };

  try {
    let adminToken, adminId;
    const adminLogin = await fetchAPI('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@fudportal.edu.ng', password: 'Admin@FUD2024' }) });
    if (adminLogin.status === 200 && adminLogin.data.data && adminLogin.data.data.accessToken) {
      adminToken = adminLogin.data.data.accessToken;
      log('ADMIN', 'Login', adminLogin.status, true, 'Logged in as superadmin', adminLogin.data.data.user);
    } else {
      log('ADMIN', 'Login', adminLogin.status, false, 'Failed to login', adminLogin.data);
      console.log("Admin Login failed, skipping admin flows");
    }

    const ts = Date.now();
    let adminMediaId = null;

    if (adminToken) {
      const adminStats = await fetchAPI('/admin/stats', { headers: { 'Authorization': 'Bearer ' + adminToken } });
      log('ADMIN', 'Dashboard', adminStats.status, adminStats.status === 200, 'Fetched stats', adminStats.data);

      const adminUsers = await fetchAPI('/admin/users', { headers: { 'Authorization': 'Bearer ' + adminToken } });
      log('ADMIN', 'Manage Students', adminUsers.status, adminUsers.status === 200, 'Fetched users list');

      const createSubj = await fetchAPI('/subjects', { method: 'POST', headers: { 'Authorization': 'Bearer ' + adminToken }, body: JSON.stringify({ name: 'RC1 Subject ' + ts, code: 'RC1' + ts, description: 'desc' }) });
      let subjectId = null;
      if (createSubj.status === 201) {
        subjectId = createSubj.data.data.id;
        log('ADMIN', 'Create Subject', createSubj.status, true, `Created subject ${subjectId}`, createSubj.data.data);
      } else {
        log('ADMIN', 'Create Subject', createSubj.status, false, 'Failed to create subject', createSubj.data);
      }

      fs.writeFileSync('rc1_test.txt', 'Hello RC1!');
      const mediaUpload = await uploadFile('/media/upload', 'rc1_test.txt', adminToken, { is_public: 1, visibility: 'public', category: 'document' });
      if (mediaUpload.status === 201) {
        adminMediaId = mediaUpload.data.data.id;
        log('ADMIN', 'Upload Media', mediaUpload.status, true, 'Uploaded public media');
      } else {
        log('ADMIN', 'Upload Media', mediaUpload.status, false, 'Failed upload', mediaUpload.data);
      }
    }

    const newStudentEmail = `student_${ts}@test.com`;
    const regPayload = { email: newStudentEmail, password: 'Password123!', full_name: 'RC Student', matric_no: 'RC' + ts, department: 'CS', faculty: 'Science' };
    const studentReg = await fetchAPI('/auth/register/student', { method: 'POST', body: JSON.stringify(regPayload) });
    log('STUDENT', 'Register', studentReg.status, studentReg.status === 201, 'Student registered', studentReg.data);

    let studentToken;
    const studentLogin = await fetchAPI('/auth/login', { method: 'POST', body: JSON.stringify({ email: newStudentEmail, password: 'Password123!' }) });
    if (studentLogin.status === 200) {
      studentToken = studentLogin.data.data.accessToken;
      log('STUDENT', 'Login', studentLogin.status, true, 'Student logged in');
    } else {
      log('STUDENT', 'Login', studentLogin.status, false, 'Student login failed', studentLogin.data);
    }

    const studentMe = await fetchAPI('/auth/me', { headers: { 'Authorization': 'Bearer ' + studentToken } });
    log('STUDENT', 'View Dashboard', studentMe.status, studentMe.status === 200, 'Fetched /auth/me');

    const studentMediaList = await fetchAPI('/media', { headers: { 'Authorization': 'Bearer ' + studentToken } });
    const seesAdminMedia = studentMediaList.data.data?.rows?.some(m => m.id === adminMediaId);
    log('STUDENT', 'View Public Learning Materials', studentMediaList.status, seesAdminMedia, 'Found admin media: ' + seesAdminMedia);

    const studentMediaUpload = await uploadFile('/media/upload', 'rc1_test.txt', studentToken, { is_public: 0, visibility: 'private', category: 'document' });
    let studentMediaId;
    if (studentMediaUpload.status === 201) {
      studentMediaId = studentMediaUpload.data.data.id;
      log('STUDENT', 'Upload Assignment/Project', studentMediaUpload.status, true, 'Student uploaded file');
    } else {
      log('STUDENT', 'Upload Assignment/Project', studentMediaUpload.status, false, 'Failed to upload', studentMediaUpload.data);
    }

    const pendingCheck = await fetchAPI('/media', { headers: { 'Authorization': 'Bearer ' + studentToken } });
    const seesPending = pendingCheck.data.data?.rows?.some(m => m.id === studentMediaId && m.status === 'pending');
    log('STUDENT', 'See Pending Upload', pendingCheck.status, seesPending, 'Is Pending: ' + seesPending);

    if (adminMediaId) {
      const openResource = await fetchAPI(`/media/${adminMediaId}/progress`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + studentToken }, body: JSON.stringify({ progress_pct: 100 }) });
      log('STUDENT', 'Open Learning Resource', openResource.status, openResource.status === 200, 'Tracked progress', openResource.data);
    }

    if (studentMediaId) {
      const approveRes = await fetchAPI(`/media/${studentMediaId}/visibility`, { method: 'PATCH', headers: { 'Authorization': 'Bearer ' + adminToken }, body: JSON.stringify({ is_public: 1 }) });
      log('ADMIN', 'Approve Student Upload', approveRes.status, approveRes.status === 200, 'Called visibility endpoint', approveRes.data);
      
      const approvedCheck = await fetchAPI('/media', { headers: { 'Authorization': 'Bearer ' + studentToken } });
      const seesApproved = approvedCheck.data.data?.rows?.some(m => m.id === studentMediaId && m.status === 'approved');
      log('STUDENT', 'See Approved Upload', approvedCheck.status, seesApproved, 'Is Approved: ' + seesApproved);
    }

    const changePw = await fetchAPI('/auth/change-password', { method: 'PUT', headers: { 'Authorization': 'Bearer ' + studentToken }, body: JSON.stringify({ currentPassword: 'Password123!', newPassword: 'Password123!4' }) });
    log('STUDENT', 'Change Password', changePw.status, changePw.status === 200, 'Password changed', changePw.data);

    const studentLogout = await fetchAPI('/auth/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + studentToken } });
    log('STUDENT', 'Logout', studentLogout.status, studentLogout.status === 200, 'Student logged out', studentLogout.data);
    
    const adminLogout = await fetchAPI('/auth/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + adminToken } });
    log('ADMIN', 'Logout', adminLogout.status, adminLogout.status === 200, 'Admin logged out', adminLogout.data);

    fs.writeFileSync('rc1_report.json', JSON.stringify(report, null, 2));
    console.log("RC1 Test complete.");
  } catch(e) {
    console.error(e);
  }
}
runTests();
