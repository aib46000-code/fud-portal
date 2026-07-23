const fs = require('fs');

let code = fs.readFileSync('frontend/js/cbt.js', 'utf8');

// 1. Accessibility Features
if (!code.includes("window.changeFontSize")) {
  code += `
// ═══════════════════════════════════════════════════════════════════
// ACCESSIBILITY
// ═══════════════════════════════════════════════════════════════════
window.currentFontSize = 16;
window.changeFontSize = function(dir) {
  window.currentFontSize += (dir * 2);
  if (window.currentFontSize < 12) window.currentFontSize = 12;
  if (window.currentFontSize > 24) window.currentFontSize = 24;
  document.getElementById('q-panel').style.fontSize = window.currentFontSize + 'px';
};

window.isHighContrast = false;
window.toggleHighContrast = function() {
  window.isHighContrast = !window.isHighContrast;
  if (window.isHighContrast) {
    document.body.style.filter = 'contrast(150%) saturate(150%)';
  } else {
    document.body.style.filter = '';
  }
};
`;
}

// 2. Token Logic
if (!code.includes("window.submitTokenAndStart")) {
  code += `
// ═══════════════════════════════════════════════════════════════════
// TOKEN LOGIC
// ═══════════════════════════════════════════════════════════════════
window.submitTokenAndStart = async function() {
  const token = document.getElementById('exam-token-input').value.trim();
  if (!token) return Toast.show('Please enter a token');
  
  // Save token for API calls
  sessionStorage.setItem('cbt_token_' + CBT.testId, token);
  document.getElementById('modal-token').classList.add('hidden');
  startExamReal();
};

window.startExam = function() {
  // Check if test needs token
  API.get('/tests/' + CBT.testId).then(res => {
     if (res.data.token_required && !sessionStorage.getItem('cbt_token_' + CBT.testId)) {
       document.getElementById('modal-token').classList.remove('hidden');
     } else {
       startExamReal();
     }
  }).catch(() => startExamReal());
};

window.startExamReal = async function() {
`;
  
  // Now we need to replace the original `window.startExam = async function() {` with `window.startExamReal = async function() {`
  // Wait, I already did that in the logic above? No, I appended it to the bottom. I should replace the original function signature.
  code = code.replace(/window\.startExam = async function\(\) {/g, 'window.startExamOld = async function() {'); // Rename the old one or just replace it.
  
  const startExamStr = `window.startExamOld = async function() {
  const btn = document.getElementById('btn-start');
  btn.classList.add('btn-loading'); btn.disabled = true;
  try {
    const token = sessionStorage.getItem('cbt_token_' + CBT.testId);
    const headers = token ? { 'X-Exam-Token': token } : {};
    const res = await API.post(\`/tests/\${CBT.testId}/start\`, {}, { headers });`;
    
  code = code.replace(/window\.startExamOld = async function\(\) {[\s\S]*?const res = await API\.post\(`\/tests\/\$\{CBT\.testId\}\/start`, \{\}\);/, startExamStr);
}

// 3. Update renderQuestion to handle essay, practical and randomized options
if (!code.includes('q.question_type === \'essay\'')) {
  const originalRenderOpts = `    \${opts.map(o => \`
      <button class="option-btn katex-render \${userAns===o.key?'selected':''}"
        onclick="selectAnswer(\${q.id},'\${o.key}')" id="opt-\${q.id}-\${o.key}">
        <span class="option-key">\${o.key}</span>
        <span>\${escHtml(o.text)}</span>
      </button>\`).join('')}`;
      
  const newRenderOpts = `    \${(() => {
      if (q.question_type === 'essay') {
         return \`<textarea class="form-input" rows="6" placeholder="Type your answer here..." oninput="selectAnswer(\${q.id}, this.value)">\${escHtml(userAns || '')}</textarea>\`;
      } else if (q.question_type === 'practical') {
         return \`<div style="padding:1rem; border:1px dashed var(--border-subtle); border-radius:8px; text-align:center;">
            <input type="file" id="prac-upload-\${q.id}" onchange="uploadPractical(\${q.id}, this.files[0])" style="display:none">
            <button class="btn btn-secondary" onclick="document.getElementById('prac-upload-\${q.id}').click()"><i class="fas fa-upload"></i> Upload Submission File</button>
            <div style="margin-top:0.5rem; font-size:0.85rem; color:var(--clr-success)" id="prac-status-\${q.id}">\${userAns ? 'File uploaded: ' + userAns : ''}</div>
         </div>\`;
      } else {
         const finalOpts = q.shuffled_options ? q.shuffled_options : opts;
         return finalOpts.map(o => \`
            <button class="option-btn katex-render \${userAns===o.key?'selected':''}"
              onclick="selectAnswer(\${q.id},'\${o.key}')" id="opt-\${q.id}-\${o.key}">
              <span class="option-key">\${o.key}</span>
              <span>\${escHtml(o.text)}</span>
            </button>\`).join('');
      }
    })()}`;
  
  code = code.replace(originalRenderOpts, newRenderOpts);
}

if (!code.includes("window.uploadPractical")) {
  code += `
window.uploadPractical = async function(qId, file) {
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  document.getElementById('prac-status-'+qId).textContent = 'Uploading...';
  try {
    const token = Auth.getAccess();
    const res = await fetch('/api/media/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    selectAnswer(qId, data.data.url);
    document.getElementById('prac-status-'+qId).textContent = 'File uploaded successfully';
  } catch(e) {
    document.getElementById('prac-status-'+qId).textContent = 'Upload failed: ' + e.message;
  }
};
`;
}

// 4. Update the startExam post request to include headers
if (!code.includes("window.startExamReal")) {
  code = code.replace(/window\.startExam = async function\(\) {/g, 'window.startExamReal = async function() {');
  code = code.replace(/const res = await API\.post\(`\/tests\/\$\{CBT\.testId\}\/start`, \{\}\);/g, "const token = sessionStorage.getItem('cbt_token_' + CBT.testId);\n    const headers = token ? { 'X-Exam-Token': token } : {};\n    const res = await API.post(`/tests/${CBT.testId}/start`, {}, { headers });");
}

fs.writeFileSync('frontend/js/cbt.js', code);
console.log('cbt.js updated successfully');
