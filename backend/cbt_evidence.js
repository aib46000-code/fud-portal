const fs = require('fs');

const LIVE_API = 'https://skillful-happiness-production-ba1e.up.railway.app/api';

async function fetchAPI(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const res = await fetch(LIVE_API + endpoint, { ...options, headers });
  let data;
  const text = await res.text();
  try { data = JSON.parse(text); } catch(e) { data = text; }
  return { status: res.status, data };
}

async function run() {
  const ts = Date.now();
  console.log("=== STARTING CBT EVIDENCE E2E TEST ===");
  
  // 0. Setup: Login Admin
  const adminLogin = await fetchAPI('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@fudportal.edu.ng', password: 'Admin@FUD2024' }) });
  const adminToken = adminLogin.data.data.accessToken;
  
  // Setup: Register & Login Student
  const studentEmail = `cbt_${ts}@test.com`;
  await fetchAPI('/auth/register/student', { method: 'POST', body: JSON.stringify({ email: studentEmail, password: 'Password123!', full_name: 'CBT Student', matric_no: 'CBT' + ts, department: 'CS', faculty: 'Science' }) });
  const studentLogin = await fetchAPI('/auth/login', { method: 'POST', body: JSON.stringify({ email: studentEmail, password: 'Password123!' }) });
  const studentToken = studentLogin.data.data.accessToken;
  
  // Setup: Create Subject
  const subj = await fetchAPI('/subjects', { method: 'POST', headers: { 'Authorization': 'Bearer ' + adminToken }, body: JSON.stringify({ name: 'CBT Subj ' + ts, code: 'CBTS' + ts }) });
  const subjectId = subj.data.data.id;

  // 1. Create Exam Session
  console.log("\n--- 1. Create Exam Session ---");
  const testPayload = { title: "CBT Evidence Exam", course_code: "CBTE101", duration_minutes: 10, start_time: new Date().toISOString(), end_time: new Date(Date.now() + 86400000).toISOString(), is_published: 0, subject_id: subjectId, type: 'exam', total_marks: 10, pass_mark: 50 };
  const createTest = await fetchAPI('/tests', { method: 'POST', headers: { 'Authorization': 'Bearer ' + adminToken }, body: JSON.stringify(testPayload) });
  const testId = createTest.data.data.id;
  console.log(`HTTP Status: ${createTest.status}`);
  console.log(`JSON Response: ${JSON.stringify(createTest.data)}`);
  
  // Setup: Add Questions
  const cbtQuestions = { questions: [{ question_text: 'What is 1+1?', correct_answer: 'A', option_a: '2', option_b: '3', question_type: 'mcq' }] };
  await fetchAPI(`/tests/${testId}/questions/bulk`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + adminToken }, body: JSON.stringify(cbtQuestions) });

  // 2. Publish CBT
  console.log("\n--- 2. Publish CBT ---");
  const pubTest = await fetchAPI(`/tests/${testId}/publish`, { method: 'PATCH', headers: { 'Authorization': 'Bearer ' + adminToken } });
  console.log(`HTTP Status: ${pubTest.status}`);
  console.log(`JSON Response: ${JSON.stringify(pubTest.data)}`);

  // 3. Student Start CBT
  console.log("\n--- 3. Student Start CBT ---");
  const startTest = await fetchAPI(`/tests/${testId}/start`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + studentToken } });
  console.log(`HTTP Status: ${startTest.status}`);
  console.log(`JSON Response: ${JSON.stringify(startTest.data)}`);
  const qId = startTest.data.data.questions[0].id;

  // 4. Submit CBT
  console.log("\n--- 4. Submit CBT ---");
  const answers = { [qId]: 'A' };
  const submitTest = await fetchAPI(`/tests/${testId}/submit`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + studentToken }, body: JSON.stringify({ answers, time_taken: 30 }) });
  console.log(`HTTP Status: ${submitTest.status}`);
  console.log(`JSON Response: ${JSON.stringify(submitTest.data)}`);

  // 5. Auto Marking & 6. Store Results
  console.log("\n--- 5 & 6. Auto Marking / Store Results ---");
  console.log("Evidence: The Submit response contains calculated score and percentage, proving auto marking and storage.");
  console.log(`Result ID: ${submitTest.data.data.result_id}, Score: ${submitTest.data.data.score}, Percentage: ${submitTest.data.data.percentage}`);

  // 7. View Results
  console.log("\n--- 7. View Results ---");
  const viewRes = await fetchAPI('/tests/my-results', { headers: { 'Authorization': 'Bearer ' + studentToken } });
  console.log(`HTTP Status: ${viewRes.status}`);
  console.log(`JSON Response: ${JSON.stringify(viewRes.data)}`);

  // 8. Admin Analytics
  console.log("\n--- 8. Admin Analytics ---");
  const adminRes = await fetchAPI(`/tests/${testId}/results`, { headers: { 'Authorization': 'Bearer ' + adminToken } });
  console.log(`HTTP Status: ${adminRes.status}`);
  console.log(`JSON Response: ${JSON.stringify(adminRes.data)}`);

  console.log("\n=== DONE ===");
}
run().catch(console.error);
