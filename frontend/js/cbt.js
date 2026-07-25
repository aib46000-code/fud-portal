/**
 * cbt.js – FUD Portal CBT Exam Engine
 *
 * Features:
 *  - Start / resume session
 *  - Countdown timer with colour warnings
 *  - Randomised question order (from server)
 *  - Answer navigation + flag
 *  - Auto-save every 30 s
 *  - Auto-submit on timer expiry
 *  - Anti-cheat: visibility + blur detection
 *  - Instant score & grade on submit
 *  - Review link after submission
 */
'use strict';

// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════
const CBT = {
  testId:       null,
  sessionId:    null,
  questions:    [],
  answers:      {},    // { qId: 'A'|'B'|'C'|'D' }
  flagged:      new Set(),
  currentIndex: 0,
  remainingSecs: 0,
  startedAt:    null,
  timerHandle:  null,
  autoSaveHandle: null,
  violations:   0,
  maxViolations: 3,
  resultId:     null,
  submitting:   false,
  submitted:    false,
};

// ═══════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;

  const params = new URLSearchParams(location.search);
  CBT.testId   = +params.get('testId');
  if (!CBT.testId) { Toast.error('No test ID specified'); return; }

  const user = Auth.getUser();
  // Admins redirect to management page
  if (['admin','superadmin','staff'].includes(user?.role)) {
    window.location.href = `tests.html`;
    return;
  }

  await loadLobby();
});

// ═══════════════════════════════════════════════════════════════════
// LOBBY
// ═══════════════════════════════════════════════════════════════════
async function loadLobby() {
  try {
    const res  = await API.get(`/tests/${CBT.testId}`);
    const test = res?.data;
    if (!test) { Toast.error('Test not found'); return; }

    document.title = `${test.title} – FUD Portal CBT`;
    document.getElementById('lobby-title').textContent    = test.title;
    document.getElementById('lobby-duration').textContent = `${test.duration_mins} minutes`;
    document.getElementById('lobby-questions').textContent= `${test.question_count} questions`;
    document.getElementById('lobby-marks').textContent    = `${test.total_marks} marks`;
    document.getElementById('lobby-pass').textContent     = `${test.pass_mark}%`;
    document.getElementById('lobby-instructions').textContent =
      test.instructions || 'Answer all questions carefully. Once started, the timer cannot be paused.';

    const user = Auth.getUser();
    document.getElementById('lobby-student').textContent = `${test.student_name} (${test.matric_no})`;
    
    // Store in global CBT state for header injection
    CBT.studentName = test.student_name;
    CBT.matricNo = test.matric_no;

    // Time window check
    if (test.starts_at && new Date(test.starts_at) > new Date()) {
      document.getElementById('btn-start').disabled = true;
      document.getElementById('btn-start-label').textContent = `Opens: ${formatDate(test.starts_at)}`;
    }
    if (test.ends_at && new Date(test.ends_at) < new Date()) {
      document.getElementById('btn-start').disabled = true;
      document.getElementById('btn-start-label').textContent = 'This test has ended';
    }
  } catch (err) {
    Toast.error(err.message || 'Failed to load test');
  }
}

// ═══════════════════════════════════════════════════════════════════
// START / RESUME
// ═══════════════════════════════════════════════════════════════════
window.startExamOld = async function() {
  const btn = document.getElementById('btn-start');
  btn.classList.add('btn-loading'); btn.disabled = true;
  try {
    const token = sessionStorage.getItem('cbt_token_' + CBT.testId);
    const headers = token ? { 'X-Exam-Token': token } : {};
    const res = await API.post(`/tests/${CBT.testId}/start`, {}, { headers });
    const data = res?.data;

    if (!data) throw new Error('Invalid server response');

    CBT.sessionId    = data.session_id;
    CBT.questions    = data.questions || [];
    CBT.remainingSecs= data.remaining_secs;
    CBT.startedAt    = new Date(data.started_at);
    CBT.answers      = data.saved_answers || {};

    // Show resume notice if continuing
    if (data.is_resume) {
      document.getElementById('lobby-resume-notice').style.display = '';
      document.getElementById('btn-start-label').textContent = 'Resume Exam';
    }

    if (!CBT.questions.length) {
      Toast.error('This test has no questions'); return;
    }

    showScreen('exam');
    initExam();
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('already completed')) {
      Toast.warning('You have already completed this test.');
      setTimeout(() => { window.location.href = 'tests.html?view=my-results'; }, 1800);
    } else {
      Toast.error(msg || 'Failed to start exam');
    }
    btn.classList.remove('btn-loading'); btn.disabled = false;
  }
};

// ═══════════════════════════════════════════════════════════════════
// EXAM INIT
// ═══════════════════════════════════════════════════════════════════
function initExam() {
  document.getElementById('head-subject').textContent = document.getElementById('lobby-title').textContent;
  document.getElementById('head-student-name').textContent = CBT.studentName || 'Student';
  document.getElementById('head-matric').textContent = CBT.matricNo || 'N/A';

  buildNavGrid();
  
  // Find first unanswered question
  let startIndex = 0;
  for(let i=0; i<CBT.questions.length; i++) {
     if(!CBT.answers[CBT.questions[i].id]) {
        startIndex = i;
        break;
     }
  }
  renderQuestion(startIndex);
  
  startTimer();
  startAutoSave();
  initAntiCheat();
}

// ═══════════════════════════════════════════════════════════════════
// QUESTION RENDER
// ═══════════════════════════════════════════════════════════════════
function renderQuestion(index) {
  CBT.currentIndex = index;
  const q = CBT.questions[index];
  if (!q) return;

  const total     = CBT.questions.length;
  const answered  = Object.keys(CBT.answers).length;
  const flagged   = CBT.flagged.size;

  // Progress
  document.getElementById('exam-progress-fill').style.width = `${((index+1)/total)*100}%`;
  document.getElementById('sidebar-answered').textContent = answered;
  document.getElementById('sidebar-total').textContent    = total;
  document.getElementById('sidebar-flagged').textContent  = flagged;

  // Flag button state
  const flagBtn = document.getElementById('btn-flag');
  if (CBT.flagged.has(q.id)) {
    flagBtn.style.background = 'rgba(251,191,36,.25)';
    flagBtn.innerHTML = '<i class="fas fa-flag"></i> Flagged';
  } else {
    flagBtn.style.background = 'rgba(251,191,36,.1)';
    flagBtn.innerHTML = '<i class="fas fa-flag"></i> Flag';
  }

  // Options
  const opts = [
    { key:'A', text: q.option_a },
    { key:'B', text: q.option_b },
    { key:'C', text: q.option_c },
    { key:'D', text: q.option_d },
  ].filter(o => o.text);

  const userAns = CBT.answers[q.id];

  document.getElementById('head-q-current').textContent = index + 1;
  document.getElementById('head-q-total').textContent = total;

  let mediaHtml = '';
  if (q.image_url) {
    mediaHtml = `<div style="margin-bottom:1rem; text-align:center;"><img src="${q.image_url}" alt="Question Image" style="max-width:100%; border-radius:8px;"></div>`;
  }

  document.getElementById('q-panel').innerHTML = `
    <div class="q-number-badge">
      <i class="fas fa-question-circle"></i>
      Question ${index+1} of ${total}
      ${CBT.flagged.has(q.id) ? '<span style="color:var(--clr-warning)">· 🚩 Flagged</span>' : ''}
    </div>
    ${mediaHtml}
    <div class="q-text katex-render">${escHtml(q.question_text)}</div>
    ${(() => {
      if (q.question_type === 'essay') {
         return `<textarea class="form-input" rows="6" placeholder="Type your answer here..." oninput="selectAnswer(${q.id}, this.value)">${escHtml(userAns || '')}</textarea>`;
      } else if (q.question_type === 'practical') {
         return `<div style="padding:1rem; border:1px dashed var(--border-subtle); border-radius:8px; text-align:center;">
            <input type="file" id="prac-upload-${q.id}" onchange="uploadPractical(${q.id}, this.files[0])" style="display:none">
            <button class="btn btn-secondary" onclick="document.getElementById('prac-upload-${q.id}').click()"><i class="fas fa-upload"></i> Upload Submission File</button>
            <div style="margin-top:0.5rem; font-size:0.85rem; color:var(--clr-success)" id="prac-status-${q.id}">${userAns ? 'File uploaded: ' + userAns : ''}</div>
         </div>`;
      } else {
         const finalOpts = q.shuffled_options ? q.shuffled_options : opts;
         return finalOpts.map(o => `
            <button class="option-btn katex-render ${userAns===o.key?'selected':''}"
              onclick="selectAnswer(${q.id},'${o.key}')" id="opt-${q.id}-${o.key}">
              <span class="option-key">${o.key}</span>
              <span>${escHtml(o.text)}</span>
            </button>`).join('');
      }
    })()}
  `;

  // Render Math with KaTeX
  if (window.renderMathInElement) {
    renderMathInElement(document.getElementById('q-panel'), {
      delimiters: [
        {left: "$$", right: "$$", display: true},
        {left: "$", right: "$", display: false},
        {left: "\\(", right: "\\)", display: false},
        {left: "\\[", right: "\\]", display: true}
      ],
      throwOnError: false
    });
  }

  // Update controls display
  document.getElementById('q-controls').style.display = 'flex';
  document.getElementById('btn-prev').disabled = (index === 0);
  
  if (index === total - 1) {
    document.getElementById('btn-next').innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
    document.getElementById('btn-next').className = 'btn btn-danger';
    document.getElementById('btn-next').onclick = confirmSubmit;
  } else {
    document.getElementById('btn-next').innerHTML = 'Next <i class="fas fa-chevron-right"></i>';
    document.getElementById('btn-next').className = 'btn btn-primary';
    document.getElementById('btn-next').onclick = nextQuestion;
  }

  // Scroll to top of panel
  document.getElementById('exam-main').scrollTo({ top:0, behavior:'smooth' });
  // Update nav grid
  updateNavGrid(index);
}

window.goTo = function(i) {
  if (i < 0 || i >= CBT.questions.length) return;
  renderQuestion(i);
};

window.nextQuestion = function() {
  goTo(CBT.currentIndex + 1);
};

window.prevQuestion = function() {
  goTo(CBT.currentIndex - 1);
};

window.clearAnswer = function() {
  const q = CBT.questions[CBT.currentIndex];
  if (!q) return;
  if (CBT.answers[q.id]) {
    delete CBT.answers[q.id];
    renderQuestion(CBT.currentIndex);
    updateNavGrid(CBT.currentIndex);
    forceSaveProgress();
  }
};

window.selectAnswer = function(qId, key) {
  CBT.answers[qId] = key;
  // Instantly re-render to show selected state
  renderQuestion(CBT.currentIndex);
  updateNavGrid(CBT.currentIndex);
  forceSaveProgress();
};

window.toggleFlag = function() {
  const q = CBT.questions[CBT.currentIndex];
  if (!q) return;
  if (CBT.flagged.has(q.id)) CBT.flagged.delete(q.id);
  else CBT.flagged.add(q.id);
  renderQuestion(CBT.currentIndex);
};

// ═══════════════════════════════════════════════════════════════════
// NAVIGATOR GRID
// ═══════════════════════════════════════════════════════════════════
function buildNavGrid() {
  const grid = document.getElementById('nav-grid');
  grid.innerHTML = CBT.questions.map((q, i) =>
    `<button class="nav-btn" id="nav-${i}" onclick="goTo(${i})" title="Q${i+1}">${i+1}</button>`
  ).join('');
}

function updateNavGrid(currentIndex) {
  CBT.questions.forEach((q, i) => {
    const btn = document.getElementById(`nav-${i}`);
    if (!btn) return;
    btn.className = 'nav-btn';
    if (i === currentIndex)        btn.classList.add('current');
    else if (CBT.flagged.has(q.id)) btn.classList.add('flagged');
    else if (CBT.answers[q.id])    btn.classList.add('answered');
  });
}

// ═══════════════════════════════════════════════════════════════════
// TIMER
// ═══════════════════════════════════════════════════════════════════
function startTimer() {
  updateTimerDisplay();
  CBT.timerHandle = setInterval(() => {
    CBT.remainingSecs--;
    updateTimerDisplay();
    if (CBT.remainingSecs <= 0) {
      clearInterval(CBT.timerHandle);
      autoSubmit();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const s   = Math.max(0, CBT.remainingSecs);
  const m   = Math.floor(s/60), sec = s%60;
  const str = `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  document.getElementById('timer-display').textContent = str;

  const el = document.getElementById('exam-timer');
  el.className = 'exam-timer';
  if (s <= 60)  el.classList.add('danger');
  else if (s <= 300) el.classList.add('warning');
}

// ═══════════════════════════════════════════════════════════════════
// AUTO-SAVE
// ═══════════════════════════════════════════════════════════════════
function startAutoSave() {
  CBT.autoSaveHandle = setInterval(saveProgress, 10_000); // 10s auto-save
}

async function forceSaveProgress() {
  await saveProgress();
}

async function saveProgress() {
  if (CBT.submitted) return;
  try {
    const elapsed = Math.floor((Date.now() - CBT.startedAt.getTime()) / 1000);
    await API.post(`/tests/${CBT.testId}/save-progress`, {
      session_id:      CBT.sessionId,
      answers:         CBT.answers,
      time_spent_secs: elapsed,
      violations:      CBT.violations,
      anti_cheat_logs: CBT.antiCheatLogs || []
    });
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════
// SUBMIT
// ═══════════════════════════════════════════════════════════════════
window.confirmSubmit = function() {
  const total    = CBT.questions.length;
  const answered = Object.keys(CBT.answers).length;
  const unanswered = total - answered;

  const confirmed = confirm(
    `Submit exam?\n\n` +
    `✅ Answered: ${answered}/${total}\n` +
    `⬜ Unanswered: ${unanswered}\n\n` +
    `This cannot be undone.`
  );
  if (confirmed) submitExam();
};

async function submitExam() {
  if (CBT.submitting || CBT.submitted) return;
  CBT.submitting = true;

  clearInterval(CBT.timerHandle);
  clearInterval(CBT.autoSaveHandle);

  const elapsed = Math.floor((Date.now() - CBT.startedAt.getTime()) / 1000);
  try {
    const res = await API.post(`/tests/${CBT.testId}/submit`, {
      session_id:      CBT.sessionId,
      answers:         CBT.answers,
      time_spent_secs: elapsed,
    });

    CBT.submitted  = true;
    CBT.submitting = false;
    const data     = res?.data;
    CBT.resultId   = data?.result_id;

    showResultScreen(data, elapsed);
  } catch (err) {
    CBT.submitting = false;
    if (err.message?.includes('already submitted')) {
      showScreen('result');
      document.getElementById('result-verdict').textContent = 'Already submitted.';
    } else {
      Toast.error('Submission failed: ' + err.message);
    }
  }
}

async function autoSubmit() {
  Toast.warning('⏰ Time is up! Auto-submitting…');
  await saveProgress();
  await submitExam();
}

function showResultScreen(data, elapsed) {
  if (!data) { showScreen('result'); return; }

  const pct    = data.percentage || 0;
  const passed = data.passed;
  const grade  = data.grade || 'F';

  const pctColor = pct >= 70 ? '#34d399' : pct >= 50 ? '#fbbf24' : '#f87171';
  const emoji    = passed ? (pct >= 80 ? '🏆' : '🎉') : (pct >= 40 ? '😔' : '💪');

  document.getElementById('result-emoji').textContent   = emoji;
  document.getElementById('result-pct').textContent     = pct.toFixed(1) + '%';
  document.getElementById('result-pct').style.color     = pctColor;
  document.getElementById('result-grade').textContent   = `Grade: ${grade}`;
  document.getElementById('result-grade').style.color   = pctColor;
  document.getElementById('result-verdict').textContent = passed ? '✅ PASSED' : '❌ FAILED';
  document.getElementById('result-verdict').style.color = passed ? 'var(--clr-success)' : 'var(--clr-danger)';

  document.getElementById('res-score').textContent   = `${data.score}/${data.total_marks}`;
  document.getElementById('res-time').textContent    = formatTime(elapsed);
  document.getElementById('res-correct').textContent = `${countCorrect()}/${CBT.questions.length}`;
  document.getElementById('res-pass').textContent    = `${data.pass_mark}%`;

  showScreen('result');
}

function countCorrect() {
  let c = 0;
  // We don't have server answers client-side during exam — use questions from session if available
  // This is a rough count; exact count comes from review
  return Object.keys(CBT.answers).length; // placeholder: show answered count
}

window.goToReview = function() {
  if (CBT.resultId) {
    window.location.href = `tests.html?view=review&resultId=${CBT.resultId}`;
  } else {
    window.location.href = 'tests.html?view=my-results';
  }
};

// ═══════════════════════════════════════════════════════════════════
// ANTI-CHEAT
// ═══════════════════════════════════════════════════════════════════
function initAntiCheat() {
  CBT.violations = 0;
  CBT.antiCheatLogs = [];
  CBT.violationCounts = { tab_switch: 0, window_blur: 0 };
  CBT.thresholds = { tab_switch: 3, window_blur: 2 }; // from requirements

  // Tab/window visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !CBT.submitted) recordViolation('tab_switch', 'You switched away from the exam tab.');
  });

  // Window blur
  window.addEventListener('blur', () => {
    if (!CBT.submitted) recordViolation('window_blur', 'You exited full-screen or minimized the window.');
  });

  // Right-click disable
  document.addEventListener('contextmenu', e => {
     e.preventDefault();
     recordViolation('context_menu', 'Right-click is disabled.', true);
  });

  // Copy/paste disable
  document.addEventListener('copy',  e => { 
     e.preventDefault(); 
     recordViolation('copy_paste', 'Copying is not allowed during the exam.', true); 
  });
  document.addEventListener('cut',   e => e.preventDefault());
  document.addEventListener('paste', e => {
     e.preventDefault();
     recordViolation('copy_paste', 'Pasting is not allowed during the exam.', true);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && ['c','v','x','a','p','u'].includes(e.key.toLowerCase())) {
      e.preventDefault();
    }
    // F12, DevTools
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I','J','C'].includes(e.key))) {
      e.preventDefault();
      recordViolation('developer_tools', 'Developer tools are strictly prohibited.', true);
    }
  });

  // Print Screen / screenshot warning
  document.addEventListener('keyup', e => {
    if (e.key === 'PrintScreen') {
      recordViolation('screenshot', 'Screenshots are not allowed.', true);
    }
  });
}

function recordViolation(type, message, forceShow = false) {
  if (CBT.submitted) return;
  
  CBT.violations++;
  CBT.antiCheatLogs.push({ type, timestamp: new Date().toISOString() });
  
  if (CBT.violationCounts[type] !== undefined) CBT.violationCounts[type]++;
  
  let shouldWarn = forceShow;
  if (!forceShow && CBT.violationCounts[type] !== undefined && CBT.violationCounts[type] >= CBT.thresholds[type]) {
     shouldWarn = true;
  }

  if (shouldWarn) {
     showOverlay(message);
  } else {
     Toast.warning('Warning: ' + message);
  }

  // Log to server (fire & forget)
  forceSaveProgress();
}

function showOverlay(message) {
  const overlay = document.getElementById('blur-overlay');
  document.getElementById('blur-warnings').textContent = message;
  overlay.classList.add('active');
}

function hideOverlay() {
  document.getElementById('blur-overlay').classList.remove('active');
}

window.resumeExam = function() {
  hideOverlay();
};

// ═══════════════════════════════════════════════════════════════════
// SCREENS
// ═══════════════════════════════════════════════════════════════════
function showScreen(name) {
  document.querySelectorAll('.cbt-screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`)?.classList.add('active');
}

// ═══════════════════════════════════════════════════════════════════
// HANDLE URL PARAMS (review redirect from result screen)
// ═══════════════════════════════════════════════════════════════════
// If tests.html?view=review&resultId=X is requested, redirect there
const _p = new URLSearchParams(location.search);
if (_p.get('view') === 'review' && _p.get('resultId')) {
  // This would be handled by tests.js, but we're on cbt.html — redirect
  const rid = _p.get('resultId');
  if (rid && window.location.pathname.includes('cbt.html')) {
    window.location.href = `tests.html?resultId=${rid}`;
  }
}

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════
function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function formatTime(secs) {
  const h = Math.floor(secs/3600);
  const m = Math.floor((secs%3600)/60);
  const s = secs%60;
  return h>0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

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
     if (res?.data?.token_required && !sessionStorage.getItem('cbt_token_' + CBT.testId)) {
       document.getElementById('modal-token').classList.remove('hidden');
     } else {
       startExamReal();
     }
  }).catch(() => startExamReal());
};

window.startExamReal = async function() {

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
    if (!res.ok) throw new Error(data?.message || 'Upload failed');
    selectAnswer(qId, data?.data?.url);
    document.getElementById('prac-status-'+qId).textContent = 'File uploaded successfully';
  } catch(e) {
    document.getElementById('prac-status-'+qId).textContent = 'Upload failed: ' + e.message;
  }
};
