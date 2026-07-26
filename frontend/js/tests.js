/**
 * tests.js – FUD Portal CBT Test Management
 * Admin: CRUD tests, question builder, view results
 * Student: browse available tests, view results, review answers
 */
'use strict';

// ── State ─────────────────────────────────────────────────────────
const State = {
  isAdmin:      false,
  currentView:  'tests',
  tests:        { page:1, limit:12, total:0 },
  myResults:    { page:1, limit:15, total:0 },
  builderTestId:null,
  builderQuestions: [],  // unsaved question cards
  pendingConfirm: null,
};

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;
  initSidebar();
  renderSidebarUser();

  const user = Auth.getUser();
  State.isAdmin = ['admin','superadmin','staff'].includes(user?.role);

  // Show/hide role elements
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = State.isAdmin ? '' : 'none';
  });
  document.querySelectorAll('.student-only').forEach(el => {
    el.style.display = user?.role === 'student' ? '' : 'none';
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    try { await API.logout(Auth.getRefresh()); } catch {}
    Auth.clear(); window.location.href = 'index.html';
  });

  document.getElementById('btn-confirm-ok').addEventListener('click', async () => {
    if (State.pendingConfirm) {
      document.getElementById('btn-confirm-ok').classList.add('btn-loading');
      try { await State.pendingConfirm(); } finally {
        document.getElementById('btn-confirm-ok').classList.remove('btn-loading');
        State.pendingConfirm = null;
      }
    }
    hideModal('modal-confirm');
  });

  // Check URL params
  const urlParams = new URLSearchParams(window.location.search);
  const urlResultId = urlParams.get('resultId');
  const urlView     = urlParams.get('view');

  // Load initial view
  if (State.isAdmin) {
    await Promise.all([loadStats(), loadTests()]);
  } else {
    switchView('available', document.querySelector('[data-tab=available]'));
  }

  // Auto-navigate based on URL params
  if (urlResultId) {
    setTimeout(() => openReview(+urlResultId), 300);
  } else if (urlView === 'my-results') {
    switchView('my-results', document.querySelector('[data-tab=my-results]'));
  }
});

// ── View Switcher ─────────────────────────────────────────────────
const VIEW_META = {
  tests:         { title:'CBT Tests',            subtitle:'Manage all tests' },
  subjects:      { title:'Subjects & Bank',      subtitle:'Manage subjects and question banks' },
  available:     { title:'Available Tests',       subtitle:'Tests you can take' },
  'my-results':  { title:'My Results',            subtitle:'Your CBT performance' },
  'results-admin':{ title:'Results Overview',     subtitle:'All student results' },
  builder:       { title:'Question Builder',      subtitle:'Add & manage questions' },
  review:        { title:'Answer Review',         subtitle:'Detailed answer breakdown' },
};

window.switchView = function(view, el) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.getElementById(`view-${view}`)?.classList.add('active');
  if (el) el.classList?.add('active');

  const m = VIEW_META[view] || {};
  document.getElementById('topbar-title').textContent    = m.title    || view;
  document.getElementById('topbar-subtitle').textContent = m.subtitle || '';
  State.currentView = view;

  if (view === 'tests')         { State.tests.page    = 1; loadTests(); }
  if (view === 'subjects')      loadSubjects();
  if (view === 'available')     loadAvailableTests();
  if (view === 'my-results')    { State.myResults.page = 1; loadMyResults(); }
  if (view === 'results-admin') loadResultsOverview();
  if (view === 'analytics') loadAnalytics();
  if (view === 'live-monitor') loadLiveMonitor();
};

// ══════════════════════════════════════════════════════════════════
// STATS (Admin)
// ══════════════════════════════════════════════════════════════════
async function loadStats() {
  try {
    const res = await API.get('/tests/stats');
    const d = res?.data;
    if (!d) return;
    document.getElementById('st-total').textContent     = d.total     || 0;
    document.getElementById('st-published').textContent = d.published || 0;
    document.getElementById('st-subjects').textContent  = d.subjects  || 0;
    document.getElementById('st-active').textContent    = d.active    || 0;
  } catch {}
}

// ══════════════════════════════════════════════════════════════════
// TESTS LIST
// ══════════════════════════════════════════════════════════════════
async function loadTests() {
  const grid = document.getElementById('tests-grid');
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--txt-muted)"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';

  const params = {
    page:  State.tests.page, limit: State.tests.limit,
    search: document.getElementById('test-search')?.value.trim() || '',
    is_published: document.getElementById('filter-published')?.value || '',
  };
  Object.keys(params).forEach(k => { if (!params[k] && params[k] !== 0) delete params[k]; });

  try {
    const res = await API.get('/tests?' + new URLSearchParams(params));
    const rows  = res?.data?.rows || [];
    const total = res?.data?.total || 0;
    State.tests.total = total;

    if (!rows.length) {
      grid.innerHTML = `<div style="grid-column:1/-1"><div class="empty-state">
        <div class="empty-state-icon">📄</div>
        <h3>No Tests Found</h3>
        <p>${State.isAdmin ? 'Create your first test using the button above.' : 'No tests available yet.'}</p>
        ${State.isAdmin ? '<button class="btn btn-primary" style="width:auto;margin-top:.75rem" onclick="openTestModal()"><i class="fas fa-plus"></i> Create Test</button>' : ''}
      </div></div>`;
      document.getElementById('test-pagination').innerHTML = '';
      return;
    }

    grid.innerHTML = rows.map(t => renderTestCard(t)).join('');

    renderPagination('test-pagination', total, State.tests.page, State.tests.limit, p => {
      State.tests.page = p; loadTests();
    });
  } catch (err) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--clr-danger);padding:2rem">${esc(err.message)}</div>`;
  }
}

function renderTestCard(t) {
  const isPublished = !!t.is_published;
  const typeColor   = { mcq:'teal', exam:'rose', quiz:'indigo', assignment:'gold' };
  const clr         = typeColor[t.test_type] || 'teal';
  const iconMap     = { mcq:'fa-list-ol', exam:'fa-graduation-cap', quiz:'fa-bolt', assignment:'fa-tasks' };

  return `<div class="test-card" id="test-card-${t.id}">
    <div class="test-card-header">
      <div class="test-icon" style="background:var(--stat-${clr}-bg,rgba(45,212,191,.1));color:var(--stat-${clr}-color,var(--clr-primary))">
        <i class="fas ${iconMap[t.test_type]||'fa-file-alt'}"></i>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;color:var(--txt-100);margin-bottom:.2rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(t.title)}">${esc(t.title)}</div>
        <div style="font-size:.78rem;color:var(--txt-muted)">${esc(t.subject||'—')} ${t.course_code?'· '+esc(t.course_code):''}</div>
      </div>
      ${State.isAdmin ? `<span class="badge ${isPublished?'badge-success':'badge-neutral'}" style="flex-shrink:0">${isPublished?'Published':'Draft'}</span>` : ''}
    </div>
    <div class="test-meta">
      <span class="badge badge-neutral"><i class="fas fa-clock" style="margin-right:4px"></i>${t.duration_mins}m</span>
      <span class="badge badge-neutral"><i class="fas fa-question-circle" style="margin-right:4px"></i>${t.question_count||0} Qs</span>
      <span class="badge badge-neutral"><i class="fas fa-star" style="margin-right:4px"></i>${t.total_marks} marks</span>
      <span class="badge badge-neutral" title="Pass mark"><i class="fas fa-check" style="margin-right:4px"></i>Pass: ${t.pass_mark}%</span>
      ${t.target_level?`<span class="badge badge-neutral">L${t.target_level}</span>`:''}
      ${State.isAdmin && t.attempt_count?`<span class="badge badge-info">${t.attempt_count} attempts</span>`:''}
    </div>
    <div class="test-actions">
      ${State.isAdmin ? `
        <button class="btn btn-xs btn-secondary" onclick="openTestModal(${t.id})" title="Edit"><i class="fas fa-edit"></i> Edit</button>
        <button class="btn btn-xs btn-secondary" onclick="openBuilder(${t.id})" title="Questions">
          <i class="fas fa-list-ol"></i> Questions${t.question_count>0?' ('+t.question_count+')':''}
        </button>
        ${isPublished
          ? `<button class="btn btn-xs btn-secondary" onclick="togglePublish(${t.id},false,'${esc(t.title)}')" title="Unpublish" style="color:var(--clr-warning)"><i class="fas fa-eye-slash"></i></button>`
          : `<button class="btn btn-xs btn-primary" onclick="togglePublish(${t.id},true,'${esc(t.title)}')" title="Publish"><i class="fas fa-rocket"></i> Publish</button>`
        }
        <button class="btn btn-xs btn-secondary" onclick="viewTestResults(${t.id},'${esc(t.title)}')" title="Results"><i class="fas fa-chart-bar"></i></button>
        <button class="btn btn-xs btn-danger" onclick="deleteTest(${t.id},'${esc(t.title)}')" title="Delete" style="margin-left:auto"><i class="fas fa-trash"></i></button>
      ` : `
        <a href="cbt.html?testId=${t.id}" class="btn btn-primary" style="flex:1;justify-content:center">
          <i class="fas fa-play-circle"></i> Start Test
        </a>
      `}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════════
// AVAILABLE TESTS (Student)
// ══════════════════════════════════════════════════════════════════
async function loadAvailableTests() {
  const grid = document.getElementById('avail-grid');
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--txt-muted)"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
  try {
    const res  = await API.get('/tests?is_published=1&is_active=1&limit=50');
    const rows = res?.data?.rows || [];
    if (!rows.length) {
      grid.innerHTML = `<div style="grid-column:1/-1"><div class="empty-state">
        <div class="empty-state-icon">📚</div><h3>No Tests Available</h3>
        <p>Check back later for upcoming tests.</p></div></div>`;
      return;
    }
    grid.innerHTML = rows.map(t => `
      <div class="test-card">
        <div class="test-card-header">
          <div class="test-icon" style="background:rgba(45,212,191,.1);color:var(--clr-primary)">
            <i class="fas fa-file-alt"></i>
          </div>
          <div>
            <div style="font-weight:700;color:var(--txt-100)">${esc(t.title)}</div>
            <div style="font-size:.78rem;color:var(--txt-muted)">${esc(t.subject||'General')}</div>
          </div>
        </div>
        <div class="test-meta">
          <span class="badge badge-success">Published</span>
          <span class="badge badge-neutral"><i class="fas fa-clock" style="margin-right:4px"></i>${t.duration_mins}m</span>
          <span class="badge badge-neutral">${t.question_count||0} Questions</span>
          <span class="badge badge-neutral">Pass: ${t.pass_mark}%</span>
        </div>
        ${t.starts_at ? `<div style="font-size:.78rem;color:var(--txt-muted);margin-bottom:.6rem"><i class="fas fa-calendar" style="margin-right:4px"></i>Opens: ${formatDate(t.starts_at)}</div>` : ''}
        <div class="test-actions">
          <a href="cbt.html?testId=${t.id}" class="btn btn-primary" style="flex:1;justify-content:center">
            <i class="fas fa-play-circle"></i> Start Test
          </a>
        </div>
      </div>`).join('');
  } catch (err) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--clr-danger)">${esc(err.message)}</div>`;
  }
}

// ══════════════════════════════════════════════════════════════════
// MY RESULTS (Student)
// ══════════════════════════════════════════════════════════════════
async function loadMyResults() {
  const tbody = document.getElementById('my-results-body');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--txt-muted)"><i class="fas fa-spinner fa-spin"></i></td></tr>`;
  try {
    const res   = await API.get(`/tests/my-results?page=${State.myResults.page}&limit=${State.myResults.limit}`);
    const rows  = res?.data?.rows || [];
    const total = res?.data?.total || 0;
    State.myResults.total = total;
    document.getElementById('my-results-count').textContent = `${total} result${total!==1?'s':''}`;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">
        <div class="empty-state-icon">🏆</div><h3>No Results Yet</h3>
        <p>Complete a test to see your results here.</p></div></td></tr>`;
      document.getElementById('my-results-pagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td style="font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.title)}">${esc(r.title)}</td>
        <td style="font-size:.82rem;color:var(--txt-400)">${esc(r.subject||'—')}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="pct-bar"><div class="pct-fill" style="width:${r.percentage||0}%;background:${pctColor(r.percentage)}"></div></div>
            <span style="font-weight:700;color:${pctColor(r.percentage)}">${r.percentage||0}%</span>
          </div>
          <div style="font-size:.72rem;color:var(--txt-muted)">${r.score}/${r.total_marks}</div>
        </td>
        <td><span style="font-size:1.2rem;font-weight:900;color:${gradeColor(r.grade)}">${r.grade||'—'}</span></td>
        <td><span class="result-pill ${r.passed?'pass':'fail'}">${r.passed?'PASSED':'FAILED'}</span></td>
        <td style="font-size:.76rem;color:var(--txt-muted);white-space:nowrap">${formatDate(r.submitted_at)}</td>
        <td>
          <div style="display:flex;gap:.4rem">
            <button class="btn btn-xs btn-secondary" onclick="openReview(${r.id})" title="Review answers">
              <i class="fas fa-eye"></i> Review
            </button>
            <a class="btn btn-xs btn-primary" href="/api/tests/${r.test_id}/results/${r.id}/pdf" target="_blank" title="Download Result PDF">
              <i class="fas fa-file-pdf"></i> PDF
            </a>
          </div>
        </td>
      </tr>`).join('');

    renderPagination('my-results-pagination', total, State.myResults.page, State.myResults.limit, p => {
      State.myResults.page = p; loadMyResults();
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--clr-danger);padding:2rem">${esc(err.message)}</td></tr>`;
  }
}

// ══════════════════════════════════════════════════════════════════
// RESULTS OVERVIEW (Admin)
// ══════════════════════════════════════════════════════════════════
async function loadResultsOverview() {
  const container = document.getElementById('results-overview');
  try {
    const res  = await API.get('/tests?limit=50');
    const rows = res?.data?.rows || [];
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><h3>No Tests Yet</h3></div>';
      return;
    }
    container.innerHTML = `
      <div class="mb-md" style="font-size:.88rem;color:var(--txt-400)">Click a test to view its results.</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:.75rem">
        ${rows.map(t => `
          <div class="card" style="cursor:pointer;transition:border-color var(--t-fast)" onclick="viewTestResults(${t.id},'${esc(t.title)}')"
            onmouseover="this.style.borderColor='rgba(45,212,191,.4)'" onmouseout="this.style.borderColor=''">
            <div style="font-weight:700;margin-bottom:.5rem">${esc(t.title)}</div>
            <div style="font-size:.8rem;color:var(--txt-muted);margin-bottom:.75rem">${esc(t.subject||'—')} · ${t.question_count||0} Qs</div>
            <div style="display:flex;gap:.5rem">
              <span class="badge ${t.is_published?'badge-success':'badge-neutral'}">${t.is_published?'Live':'Draft'}</span>
              <span class="badge badge-info">${t.attempt_count||0} attempts</span>
            </div>
          </div>`).join('')}
      </div>`;
  } catch (err) { container.innerHTML = `<p style="color:var(--clr-danger)">${esc(err.message)}</p>`; }
}

window.viewTestResults = async function(testId, title) {
  switchView('results-admin', document.querySelector('[data-tab=results-admin]'));
  const container = document.getElementById('results-overview');
  container.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--txt-muted)"><i class="fas fa-spinner fa-spin fa-2x"></i></div>`;

  try {
    const [statsRes, resultsRes] = await Promise.all([
      API.get(`/tests/${testId}/results/stats`),
      API.get(`/tests/${testId}/results?limit=100`),
    ]);

    const stats   = statsRes?.data || {};
    const results = resultsRes?.data?.rows || [];

    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem">
        <button class="btn btn-sm btn-secondary" onclick="loadResultsOverview()"><i class="fas fa-arrow-left"></i> All Tests</button>
        <div style="font-size:1.1rem;font-weight:700">${esc(title)} – Results</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.5rem">
        ${[
          ['Total Attempts', stats.attempts||0, 'var(--clr-primary)'],
          ['Pass Rate', stats.attempts ? Math.round((stats.passed_count||0)/(stats.attempts)*100)+'%' : '—', 'var(--clr-success)'],
          ['Avg Score', (stats.avg_percentage||0).toFixed(1)+'%', 'var(--clr-accent)'],
          ['Highest',  (stats.highest||0).toFixed(1)+'%', 'var(--clr-warning)'],
        ].map(([l,v,c]) => `<div class="card" style="text-align:center;padding:.9rem">
          <div style="font-size:1.7rem;font-weight:800;color:${c}">${v}</div>
          <div style="font-size:.78rem;color:var(--txt-muted);margin-top:.2rem">${l}</div>
        </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fas fa-table" style="color:var(--clr-primary)"></i> Student Results</div></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Student</th><th>Matric No</th><th>Score</th><th>Grade</th><th>Result</th><th>Time</th><th>Submitted</th></tr></thead>
            <tbody>
              ${results.length ? results.map(r => `<tr>
                <td style="font-weight:600">${esc(r.full_name||'—')}</td>
                <td><code style="font-size:.75rem">${esc(r.matric_no||'—')}</code></td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div class="pct-bar"><div class="pct-fill" style="width:${r.percentage||0}%;background:${pctColor(r.percentage)}"></div></div>
                    <span style="font-weight:700;color:${pctColor(r.percentage)}">${r.percentage||0}%</span>
                  </div>
                </td>
                <td><span style="font-size:1.1rem;font-weight:900;color:${gradeColor(r.grade)}">${r.grade}</span></td>
                <td><span class="result-pill ${r.passed?'pass':'fail'}">${r.passed?'PASS':'FAIL'}</span></td>
                <td style="font-size:.78rem;color:var(--txt-muted)">${r.time_spent_secs?formatTime(r.time_spent_secs):'—'}</td>
                <td style="font-size:.76rem;color:var(--txt-muted);white-space:nowrap">${formatDate(r.submitted_at)}</td>
              </tr>`).join('')
              : '<tr><td colspan="7" style="text-align:center;color:var(--txt-muted);padding:2rem">No submissions yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch (err) { container.innerHTML = `<p style="color:var(--clr-danger)">${esc(err.message)}</p>`; }
};

// ══════════════════════════════════════════════════════════════════
// TEST CRUD
// ══════════════════════════════════════════════════════════════════
window.openTestModal = async function(id = null) {
  const isEdit = !!id;
  document.getElementById('test-modal-title').innerHTML =
    `<i class="fas fa-${isEdit?'edit':'plus'}"></i> ${isEdit?'Edit':'Create'} Test`;
  document.getElementById('edit-test-id').value = id || '';

  // Clear form
  ['t-title','t-subject','t-code','t-dept','t-instructions'].forEach(f => document.getElementById(f).value='');
  document.getElementById('t-duration').value = '60';
  document.getElementById('t-passmark').value = '50';
  document.getElementById('t-type').value = 'mcq';
  document.getElementById('t-semester').value = '';
  document.getElementById('t-level').value = '';
  document.getElementById('t-starts').value = '';
  document.getElementById('t-ends').value = '';
  if(document.getElementById('t-bank-subject')) document.getElementById('t-bank-subject').value = '';
  if(document.getElementById('t-limit')) document.getElementById('t-limit').value = '';
  if(document.getElementById('t-randomize')) document.getElementById('t-randomize').value = '1';

  if (isEdit) {
    try {
      const res = await API.get(`/tests/${id}`);
      const t   = res?.data;
      if (t) {
        document.getElementById('t-title').value    = t.title||'';
        document.getElementById('t-subject').value  = t.subject||'';
        document.getElementById('t-code').value     = t.course_code||'';
        document.getElementById('t-type').value     = t.test_type||'mcq';
        document.getElementById('t-duration').value = t.duration_mins||60;
        document.getElementById('t-passmark').value = t.pass_mark||50;
        document.getElementById('t-semester').value = t.semester||'';
        document.getElementById('t-level').value    = t.target_level||'';
        document.getElementById('t-dept').value     = t.target_dept||'';
        document.getElementById('t-instructions').value = t.instructions||'';
        if (t.starts_at) document.getElementById('t-starts').value = t.starts_at.slice(0,16);
        if (t.ends_at)   document.getElementById('t-ends').value   = t.ends_at.slice(0,16);
        if(document.getElementById('t-bank-subject')) document.getElementById('t-bank-subject').value = t.bank_subject_id || '';
        if(document.getElementById('t-limit')) document.getElementById('t-limit').value = t.display_limit || '';
        if(document.getElementById('t-randomize')) document.getElementById('t-randomize').value = t.randomize !== undefined ? t.randomize : 1;
      }
    } catch (err) { Toast.error('Failed to load test: '+err.message); return; }
  }
  showModal('modal-test');
};

window.saveTest = async function() {
  const btn = document.getElementById('btn-save-test');
  const id  = document.getElementById('edit-test-id').value;
  const title = document.getElementById('t-title').value.trim();
  if (!title) { Toast.warning('Title is required'); return; }

  const data = {
    title, subject:       document.getElementById('t-subject').value.trim()||undefined,
    course_code:          document.getElementById('t-code').value.trim()||undefined,
    test_type:            document.getElementById('t-type').value,
    duration_mins: +document.getElementById('t-duration').value||60,
    pass_mark:     +document.getElementById('t-passmark').value||50,
    semester:             document.getElementById('t-semester').value||undefined,
    target_level:         document.getElementById('t-level').value||undefined,
    target_dept:          document.getElementById('t-dept').value.trim()||undefined,
    instructions:         document.getElementById('t-instructions').value.trim()||undefined,
    starts_at:            document.getElementById('t-starts').value||undefined,
    ends_at:              document.getElementById('t-ends').value||undefined,
    bank_subject_id:      document.getElementById('t-bank-subject')?.value || undefined,
    display_limit:        +document.getElementById('t-limit')?.value || 0,
    randomize:            +document.getElementById('t-randomize')?.value || 0,
  };

  btn.classList.add('btn-loading'); btn.disabled = true;
  try {
    let testId;
    if (id) {
      await API.put(`/tests/${id}`, data);
      Toast.success('Test updated');
      testId = +id;
    } else {
      const res = await API.post('/tests', data);
      testId = res?.data?.id;
      Toast.success('Test created — now add questions!');
    }
    hideModal('modal-test');
    loadTests(); loadStats();
    if (!id && testId) {
      setTimeout(() => openBuilder(testId), 400);
    }
  } catch (err) {
    if (err.data?.errors) err.data.errors.forEach(e => Toast.warning(e.msg));
    else Toast.error(err.message);
  } finally { btn.classList.remove('btn-loading'); btn.disabled = false; }
};

window.togglePublish = function(id, publish, title) {
  const action = publish ? 'publish' : 'unpublish';
  openConfirm(
    publish ? '🚀 Publish Test' : '📥 Unpublish Test',
    `${publish ? 'Make' : 'Hide'} "<strong style="color:var(--txt-100)">${esc(title)}</strong>" ${publish ? 'visible to students?' : 'from students?'}`,
    async () => {
      try {
        await API.patch(`/tests/${id}/${action}`);
        Toast.success(`Test ${publish?'published':'unpublished'}`);
        loadTests(); loadStats();
      } catch (err) { Toast.error(err.message); }
    }, publish ? 'info' : 'warning'
  );
};

window.deleteTest = function(id, title) {
  openConfirm('⚠️ Delete Test',
    `Permanently delete "<strong style="color:var(--clr-danger)">${esc(title)}</strong>" and all its questions & results?`,
    async () => {
      try {
        await API.delete(`/tests/${id}`);
        Toast.success('Test deleted');
        loadTests(); loadStats();
      } catch (err) { Toast.error(err.message); }
    }, 'danger'
  );
};

// ══════════════════════════════════════════════════════════════════
// QUESTION BUILDER
// ══════════════════════════════════════════════════════════════════
window.openBuilder = async function(testId) {
  State.builderTestId = testId;
  State.builderQuestions = [];
  switchView('builder', null);

  try {
    const [testRes, qRes] = await Promise.all([
      API.get(`/tests/${testId}`),
      API.get(`/tests/${testId}/questions`),
    ]);
    const test = testRes?.data;
    const qs   = qRes?.data || [];

    document.getElementById('builder-test-title').textContent = test?.title || 'Question Builder';
    document.getElementById('builder-test-meta').textContent  =
      `${test?.subject||''} · ${test?.duration_mins||60}min · Pass: ${test?.pass_mark||50}%`;

    const container = document.getElementById('questions-container');
    container.innerHTML = '';

    if (qs.length) {
      qs.forEach(q => addQuestionCard(q));
    } else {
      addQuestionCard(); // start with one blank
    }
    updateBuilderStats();
  } catch (err) { Toast.error('Failed to load questions: '+err.message); }
};

window.addQuestionCard = function(data = null) {
  const container = document.getElementById('questions-container');
  const idx = container.children.length;
  const id  = data?.id || null;
  const div = document.createElement('div');
  div.className = 'q-card';
  div.dataset.qid = id || '';
  div.innerHTML = `
    <div class="q-card-header">
      <div class="q-num">${idx+1}</div>
      <div style="flex:1;font-size:.82rem;color:var(--txt-400)">Question ${idx+1}</div>
      <div class="marks-badge"><i class="fas fa-star" style="font-size:.7rem"></i>
        <input type="number" class="q-marks" value="${data?.marks||1}" min="1" max="100"
          style="width:40px;background:none;border:none;outline:none;color:var(--txt-200);font-weight:700;font-size:.82rem"
          onchange="updateBuilderStats()" title="Marks">
        marks
      </div>
      <button class="btn btn-xs btn-danger q-remove" onclick="removeQuestion(this)" title="Remove"><i class="fas fa-times"></i></button>
    </div>
    <div class="form-group" style="margin-bottom:.75rem">
      <textarea class="form-input q-text" rows="2" style="resize:vertical;font-size:.88rem"
        placeholder="Type your question here…">${esc(data?.question_text||'')}</textarea>
    </div>
    <div class="form-row">
      ${['A','B','C','D'].map(opt => `
        <div class="form-group">
          <div class="option-row">
            <div class="option-label ${data?.correct_answer===opt?'correct-label':''}" id="opt-label-${idx}-${opt}">${opt}</div>
            <input type="text" class="form-input q-opt-${opt}" style="font-size:.85rem"
              value="${esc(data?.['option_'+opt.toLowerCase()]||'')}"
              placeholder="Option ${opt}">
          </div>
        </div>`).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-top:.5rem">
      <div style="display:flex;align-items:center;gap:.5rem">
        <label style="font-size:.8rem;color:var(--txt-400)">Correct:</label>
        <select class="form-select q-correct" style="width:90px;padding:6px 10px;font-size:.85rem" onchange="highlightCorrect(this)">
          ${['A','B','C','D'].map(o => `<option value="${o}" ${data?.correct_answer===o?'selected':''}>${o}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1">
        <input type="text" class="form-input q-explanation" style="font-size:.82rem;padding:7px 12px"
          value="${esc(data?.explanation||'')}" placeholder="Explanation (optional)">
      </div>
    </div>`;

  container.appendChild(div);
  // Renumber all
  renumberCards();
  updateBuilderStats();
};

window.removeQuestion = function(btn) {
  const card = btn.closest('.q-card');
  if (document.getElementById('questions-container').children.length <= 1) {
    Toast.warning('At least one question is required'); return;
  }
  const qid = card.dataset.qid;
  if (qid) {
    // Mark for deletion from server
    openConfirm('Remove Question', 'Delete this question? This cannot be undone.',
      async () => {
        try {
          await API.delete(`/tests/${State.builderTestId}/questions/${qid}`);
          card.remove(); renumberCards(); updateBuilderStats();
          Toast.success('Question deleted');
        } catch (err) { Toast.error(err.message); }
      }, 'danger');
  } else {
    card.remove(); renumberCards(); updateBuilderStats();
  }
};

function renumberCards() {
  document.querySelectorAll('#questions-container .q-card').forEach((c, i) => {
    const num = c.querySelector('.q-num');
    if (num) num.textContent = i+1;
  });
}

window.highlightCorrect = function(sel) {
  const card = sel.closest('.q-card');
  const val  = sel.value;
  card.querySelectorAll('.option-label').forEach(l => {
    const isCorrect = l.textContent === val;
    l.classList.toggle('correct-label', isCorrect);
  });
};

function updateBuilderStats() {
  const container = document.getElementById('questions-container');
  const cards = container.querySelectorAll('.q-card');
  let totalMarks = 0;
  cards.forEach(c => {
    const m = parseInt(c.querySelector('.q-marks')?.value||'1');
    totalMarks += m;
  });
  document.getElementById('builder-stats').innerHTML = `
    <div class="marks-badge"><i class="fas fa-question-circle"></i> ${cards.length} Questions</div>
    <div class="marks-badge" style="color:var(--clr-warning)"><i class="fas fa-star"></i> ${totalMarks} Total Marks</div>`;
}

window.saveAllQuestions = async function() {
  const btn = document.getElementById('btn-save-questions');
  const cards = document.querySelectorAll('#questions-container .q-card');
  const newQs = [], updQs = [];

  for (const [i, card] of [...cards].entries()) {
    const qid  = card.dataset.qid;
    const text = card.querySelector('.q-text')?.value.trim();
    if (!text) { Toast.warning(`Question ${i+1} is missing question text`); return; }
    const correct = card.querySelector('.q-correct')?.value;
    if (!correct) { Toast.warning(`Question ${i+1} needs a correct answer`); return; }
    const optA = card.querySelector('.q-opt-A')?.value.trim();
    const optB = card.querySelector('.q-opt-B')?.value.trim();
    if (!optA || !optB) { Toast.warning(`Question ${i+1} needs at least options A and B`); return; }

    const qData = {
      question_text:  text,
      question_type:  'mcq',
      option_a:       optA,
      option_b:       optB,
      option_c:       card.querySelector('.q-opt-C')?.value.trim()||null,
      option_d:       card.querySelector('.q-opt-D')?.value.trim()||null,
      correct_answer: correct,
      explanation:    card.querySelector('.q-explanation')?.value.trim()||null,
      marks:         +card.querySelector('.q-marks')?.value||1,
      order_index:    i,
    };
    if (qid) { updQs.push({ id: qid, ...qData }); }
    else      { newQs.push(qData); }
  }

  btn.classList.add('btn-loading'); btn.disabled = true;
  try {
    // Update existing questions
    for (const q of updQs) {
      const { id, ...data } = q;
      await API.put(`/tests/${State.builderTestId}/questions/${id}`, data);
    }
    // Bulk insert new questions
    if (newQs.length) {
      await API.post(`/tests/${State.builderTestId}/questions/bulk`, { questions: newQs });
    }
    Toast.success(`${updQs.length + newQs.length} questions saved!`);
    // Refresh builder to get server-assigned IDs
    await openBuilder(State.builderTestId);
  } catch (err) { Toast.error(err.message); }
  finally { btn.classList.remove('btn-loading'); btn.disabled = false; }
};

// Bulk Import
window.openImportModal = function() { showModal('modal-import'); };
window.importQuestions = async function() {
  const raw = document.getElementById('import-json').value.trim();
  if (!raw) { Toast.warning('Paste JSON first'); return; }
  let questions;
  try { questions = JSON.parse(raw); } catch { Toast.error('Invalid JSON'); return; }
  if (!Array.isArray(questions) || !questions.length) { Toast.error('Must be a non-empty array'); return; }

  try {
    await API.post(`/tests/${State.builderTestId}/questions/bulk`, { questions });
    Toast.success(`${questions.length} questions imported`);
    hideModal('modal-import');
    openBuilder(State.builderTestId);
  } catch (err) { Toast.error(err.message); }
};

// ══════════════════════════════════════════════════════════════════
// ANSWER REVIEW
// ══════════════════════════════════════════════════════════════════
window.openReview = async function(resultId) {
  switchView('review', null);
  document.getElementById('result-scorecard').innerHTML =
    '<div style="text-align:center;padding:2rem;color:var(--txt-muted)"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
  document.getElementById('review-questions').innerHTML = '';

  try {
    const res    = await API.get(`/tests/results/${resultId}/review`);
    const { result, review } = res?.data || {};
    if (!result) { Toast.error('Review not found'); return; }

    document.getElementById('review-title').textContent = result.test_title || 'Answer Review';

    // Scorecard
    document.getElementById('result-scorecard').innerHTML = `
      <div class="card-header">
        <div><div class="card-title">📊 Your Score</div><div class="card-subtitle">${esc(result.test_title)}</div></div>
        <span class="result-pill ${result.passed?'pass':'fail'}" style="font-size:.95rem;padding:6px 16px">${result.passed?'PASSED':'FAILED'}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;padding:1rem 0">
        ${[
          ['Score', `${result.score}/${result.total_marks}`, 'var(--clr-primary)'],
          ['Percentage', (result.percentage||0)+'%', pctColor(result.percentage)],
          ['Grade', result.grade||'—', gradeColor(result.grade)],
          ['Time', result.time_spent_secs?formatTime(result.time_spent_secs):'—', 'var(--txt-300)'],
        ].map(([l,v,c]) => `<div style="text-align:center">
          <div style="font-size:1.6rem;font-weight:800;color:${c}">${v}</div>
          <div style="font-size:.75rem;color:var(--txt-muted);margin-top:.2rem">${l}</div>
        </div>`).join('')}
      </div>`;

    // Review questions
    if (!review?.length) {
      document.getElementById('review-questions').innerHTML =
        '<div class="empty-state"><div class="empty-state-icon">📝</div><h3>No questions available for review</h3></div>';
      return;
    }

    const correct = review.filter(r => r.is_correct).length;
    document.getElementById('review-questions').innerHTML = `
      <div class="card-header" style="margin-bottom:1rem">
        <div class="card-title"><i class="fas fa-list-ol" style="color:var(--clr-primary)"></i> Detailed Review</div>
        <span style="font-size:.85rem;color:var(--txt-400)">${correct}/${review.length} correct</span>
      </div>
      ${review.map((q,i) => `
        <div class="q-card" style="border-color:${q.is_correct?'rgba(52,211,153,.3)':'rgba(248,113,113,.3)'}">
          <div class="q-card-header">
            <div class="q-num" style="background:${q.is_correct?'rgba(52,211,153,.15)':'rgba(248,113,113,.12)'};color:${q.is_correct?'var(--clr-success)':'var(--clr-danger)'}">${i+1}</div>
            <div style="flex:1">
              <div style="font-weight:600;font-size:.9rem;color:var(--txt-100)">${esc(q.question_text)}</div>
            </div>
            <span style="font-size:1.1rem">${q.is_correct?'✅':'❌'}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin:.5rem 0">
            ${['A','B','C','D'].filter(o => q['option_'+o.toLowerCase()]).map(o => {
              const isCorrect = q.correct_answer===o;
              const isStudentAns = q.student_answer===o;
              let bg = 'rgba(255,255,255,.03)'; let color = 'var(--txt-400)';
              if (isCorrect) { bg = 'rgba(52,211,153,.1)'; color = 'var(--clr-success)'; }
              if (isStudentAns && !isCorrect) { bg = 'rgba(248,113,113,.1)'; color = 'var(--clr-danger)'; }
              return `<div style="padding:8px 12px;border-radius:8px;background:${bg};color:${color};font-size:.84rem;border:1px solid ${isCorrect?'rgba(52,211,153,.3)':'var(--border-subtle)'};display:flex;align-items:center;gap:8px">
                <span style="font-weight:700;width:20px">${o}.</span>
                <span>${esc(q['option_'+o.toLowerCase()])}</span>
                ${isCorrect?'<span style="margin-left:auto">✓</span>':''}
                ${isStudentAns&&!isCorrect?'<span style="margin-left:auto">✗</span>':''}
              </div>`;
            }).join('')}
          </div>
          ${q.explanation?`<div style="margin-top:.5rem;font-size:.8rem;color:var(--txt-muted);background:rgba(45,212,191,.05);border-radius:6px;padding:8px 12px;border-left:3px solid var(--clr-primary)">
            <strong>Explanation:</strong> ${esc(q.explanation)}
          </div>`:''}
          <div style="margin-top:.5rem;font-size:.78rem;color:var(--txt-muted)">
            Your answer: <strong style="color:${q.student_answer?'var(--txt-200)':'var(--txt-muted)'}">${q.student_answer||'Not answered'}</strong>
            &nbsp;|&nbsp; Correct: <strong style="color:var(--clr-success)">${q.correct_answer}</strong>
            &nbsp;|&nbsp; ${q.marks} mark${q.marks>1?'s':''}
          </div>
        </div>`).join('')}`;
  } catch (err) {
    document.getElementById('result-scorecard').innerHTML = `<p style="color:var(--clr-danger);padding:1rem">${esc(err.message)}</p>`;
  }
};

// ══════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════
function pctColor(v) {
  if (v >= 70) return 'var(--clr-success)';
  if (v >= 50) return 'var(--clr-warning)';
  return 'var(--clr-danger)';
}
function gradeColor(g) {
  const m = { A:'var(--clr-success)', B:'#60a5fa', C:'var(--clr-warning)', D:'#f97316', E:'#fb923c', F:'var(--clr-danger)' };
  return m[g] || 'var(--txt-300)';
}
function formatTime(secs) {
  const m = Math.floor(secs/60), s = secs%60;
  return `${m}m ${s}s`;
}
function esc(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function openConfirm(title, msg, cb, type='danger') {
  State.pendingConfirm = cb;
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').innerHTML = msg;
  const btn = document.getElementById('btn-confirm-ok');
  const c = { danger:'var(--clr-danger-dark)', warning:'var(--clr-warning)', info:'var(--clr-info)' };
  btn.style.background = c[type]||c.danger;
  btn.style.color = type==='warning'?'var(--bg-900)':'#fff';
  showModal('modal-confirm');
}

function renderPagination(cid, total, cur, limit, onPage) {
  const pages = Math.ceil(total/limit);
  const el = document.getElementById(cid);
  if (pages<=1) { el.innerHTML=''; return; }
  let html = `<button class="btn btn-sm btn-secondary" ${cur<=1?'disabled':''} onclick="(${onPage})(${cur-1})"><i class="fas fa-chevron-left"></i></button>`;
  for (let p=1; p<=Math.min(pages,7); p++) {
    html += `<button class="btn btn-sm ${p===cur?'btn-primary':'btn-secondary'}" onclick="(${onPage})(${p})">${p}</button>`;
  }
  html += `<button class="btn btn-sm btn-secondary" ${cur>=pages?'disabled':''} onclick="(${onPage})(${cur+1})"><i class="fas fa-chevron-right"></i></button>`;
  html += `<span class="page-info">${cur}/${pages}</span>`;
  el.innerHTML = html;
}

const _d = {};
window.debounce = (fn, delay) => (...args) => { clearTimeout(_d[fn]); _d[fn] = setTimeout(()=>fn(...args), delay); };

// ══════════════════════════════════════════════════════════════════
// SUBJECTS & QUESTION BANK
// ══════════════════════════════════════════════════════════════════
window.openSubjectModal = function() {
  document.getElementById('s-code').value = '';
  document.getElementById('s-name').value = '';
  document.getElementById('s-desc').value = '';
  showModal('modal-subject');
};

window.saveSubject = async function() {
  const code = document.getElementById('s-code').value.trim();
  const name = document.getElementById('s-name').value.trim();
  const desc = document.getElementById('s-desc').value.trim();
  if (!code || !name) return Toast.error('Code and Name are required');
  try {
    await API.post('/subjects', { code, name, description: desc });
    Toast.success('Subject created');
    hideModal('modal-subject');
    loadSubjects();
  } catch(e) { Toast.error(e.response?.data?.message || 'Error saving subject'); }
};

window.loadSubjects = async function() {
  const tbody = document.getElementById('subjects-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
  try {
    const res = await API.get('/subjects');
    const subjects = res?.data || [];
    populateSubjectSelect(subjects);
    if (!subjects.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No subjects found. Create one to start.</td></tr>';
      return;
    }
    tbody.innerHTML = subjects.map(s => `
      <tr>
        <td>${s.id}</td>
        <td><strong>${s.code}</strong></td>
        <td>${s.name}</td>
        <td class="text-muted" style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.description || ''}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="loadQuestionBank(${s.id}, '${s.name}')">View Bank</button>
          <button class="btn btn-sm btn-danger" onclick="deleteSubject(${s.id})"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  } catch(e) { Toast.error('Failed to load subjects'); }
};

window.deleteSubject = function(id) {
  confirmAction('Delete Subject', 'Are you sure? This deletes the subject but NOT its question bank.', async () => {
    try {
      await API.delete(`/subjects/${id}`);
      Toast.success('Subject deleted');
      loadSubjects();
    } catch(e) { Toast.error('Failed to delete subject'); }
  });
};

window.populateSubjectSelect = function(subjects) {
  const select = document.getElementById('t-bank-subject');
  if(!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="">-- No Bank (Manual Questions) --</option>' + subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  select.value = currentVal;
};

// Question Bank
window.loadQuestionBank = async function(subjectId, subjectName) {
  State.currentBankSubject = subjectId;
  document.getElementById('question-bank-container').style.display = 'block';
  document.getElementById('bank-subtitle').textContent = subjectName;
  const tbody = document.getElementById('bank-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
  try {
    const res = await API.get(`/subjects/${subjectId}/questions`);
    const qs = res?.data || [];
    if (!qs.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Question bank is empty. Import some questions!</td></tr>';
      return;
    }
    tbody.innerHTML = qs.map(q => `
      <tr>
        <td>${q.id}</td>
        <td><span class="result-pill pass">${q.question_type.toUpperCase()}</span></td>
        <td><strong>${q.question_text.length > 50 ? q.question_text.substring(0,50)+'...' : q.question_text}</strong></td>
        <td class="text-muted text-sm">
          A: ${q.option_a}<br>B: ${q.option_b}<br>C: ${q.option_c}<br>D: ${q.option_d}
        </td>
        <td class="text-success font-bold">${q.correct_answer}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="deleteBankQuestion(${q.id})"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  } catch(e) { Toast.error('Failed to load question bank'); }
};

window.deleteBankQuestion = function(qid) {
  confirmAction('Delete Question', 'Delete this question from the bank?', async () => {
    try {
      await API.delete(`/subjects/questions/${qid}`);
      Toast.success('Question deleted');
      loadQuestionBank(State.currentBankSubject, document.getElementById('bank-subtitle').textContent);
    } catch(e) { Toast.error('Failed to delete question'); }
  });
};

window.addBankQuestionModal = function() {
  if (!State.currentBankSubject) {
    Toast.warning('Please select a subject bank first');
    return;
  }
  document.getElementById('qb-qtext').value = '';
  document.getElementById('qb-opt-a').value = '';
  document.getElementById('qb-opt-b').value = '';
  document.getElementById('qb-opt-c').value = '';
  document.getElementById('qb-opt-d').value = '';
  document.getElementById('qb-correct').value = '';
  showModal('modal-question');
};

window.saveBankQuestion = async function() {
  const text = document.getElementById('qb-qtext').value.trim();
  const optA = document.getElementById('qb-opt-a').value.trim();
  const optB = document.getElementById('qb-opt-b').value.trim();
  const optC = document.getElementById('qb-opt-c').value.trim();
  const optD = document.getElementById('qb-opt-d').value.trim();
  const correct = document.getElementById('qb-correct').value;

  if (!text || !optA || !optB || !correct) {
    Toast.warning('Please fill in the question, at least options A & B, and the correct answer.');
    return;
  }

  const payload = {
    question_text: text,
    question_type: 'mcq',
    options: { A: optA, B: optB, ...(optC && { C: optC }), ...(optD && { D: optD }) },
    correct_answer: correct
  };

  try {
    await API.post(`/subjects/${State.currentBankSubject}/questions`, payload);
    Toast.success('Question added to bank');
    hideModal('modal-question');
    loadQuestionBank(State.currentBankSubject, document.getElementById('bank-subtitle').textContent);
  } catch(e) {
    Toast.error('Failed to add question');
  }
};

// Import CSV/Excel
window.openImportModal = function() {
  document.getElementById('import-file').value = '';
  document.getElementById('import-report').style.display = 'none';
  document.getElementById('import-report').innerHTML = '';
  showModal('modal-import');
};

window.runCsvImport = async function() {
  const fileInput = document.getElementById('import-file');
  if (!fileInput.files.length) return Toast.error('Please select a file');
  
  let subjectId = State.currentBankSubject;
  if (!subjectId) return Toast.error('Please select a subject bank first');

  const formData = new FormData();
  formData.append('file', fileInput.files[0]);

  const btn = document.getElementById('btn-run-import');
  btn.classList.add('btn-loading');
  try {
    const res = await API.post(`/subjects/${subjectId}/import`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    
    Toast.success('Import completed');
    
    // Render detailed report
    const d = res?.data?.data || {};
    const reportEl = document.getElementById('import-report');
    reportEl.style.display = 'block';
    reportEl.innerHTML = `
      <strong>Import Report:</strong><br>
      Total Rows: ${d.total_rows}<br>
      <span class="text-success">Imported: ${d.imported_rows}</span><br>
      <span class="text-danger">Skipped: ${d.skipped_rows} (Duplicates: ${d.duplicate_rows}, Invalid: ${d.invalid_rows})</span><br>
      ${d.error_messages.length > 0 ? `<div style="margin-top:0.5rem;max-height:100px;overflow-y:auto;background:#222;padding:5px;border-radius:4px;">${d.error_messages.join('<br>')}</div>` : ''}
    `;
    
    loadQuestionBank(subjectId, document.getElementById('bank-subtitle').textContent);
  } catch(e) {
    Toast.error(e.response?.data?.message || 'Import failed');
  } finally {
    btn.classList.remove('btn-loading');
  }
};


// ══════════════════════════════════════════════════════════════════
// PHASE 5: ENTERPRISE ANALYTICS & LIVE MONITOR
// ══════════════════════════════════════════════════════════════════
window.loadAnalytics = async function() {
  try {
    const res = await API.get('/tests/stats/dashboard');
    const data = res?.data || {};
    
    const cardsHtml = `\
      <div class="tests-stat"><div class="tests-stat-val">${data.cards.totalStudents}</div><div class="tests-stat-lab">Total Students</div></div>\
      <div class="tests-stat"><div class="tests-stat-val">${data.cards.totalExams}</div><div class="tests-stat-lab">Total Exams Taken</div></div>\
      <div class="tests-stat"><div class="tests-stat-val" style="color:var(--clr-success)">${data.cards.passRate.toFixed(1)}%</div><div class="tests-stat-lab">Global Pass Rate</div></div>\
      <div class="tests-stat"><div class="tests-stat-val" style="color:var(--clr-danger)">${data.cards.failRate.toFixed(1)}%</div><div class="tests-stat-lab">Global Fail Rate</div></div>\
    `;
    document.getElementById('analytics-cards').innerHTML = cardsHtml;
    
    document.getElementById('analytics-worst-q').innerHTML = data.charts.worstQuestions.map(q => `\
      <tr>\
        <td>${q.id}</td>\
        <td style="max-width:200px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;">${q.question_text}</td>\
        <td>${q.times_used}</td>\
        <td>${q.times_correct}</td>\
        <td>${q.times_wrong}</td>\
        <td style="color:var(--clr-danger)">${((q.times_wrong / q.times_used) * 100).toFixed(1)}%</td>\
      </tr>\
    `).join('');

    if (window.Chart) {
      if (window.monthlyChart) window.monthlyChart.destroy();
      if (window.perfChart) window.perfChart.destroy();
      
      const ctx1 = document.getElementById('chart-monthly').getContext('2d');
      window.monthlyChart = new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: data.charts.monthlyExams.map(i => i.month),
          datasets: [{ label: 'Exams Taken', data: data.charts.monthlyExams.map(i => i.count), backgroundColor: '#0d9488' }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
      
      const ctx2 = document.getElementById('chart-performance').getContext('2d');
      window.perfChart = new Chart(ctx2, {
        type: 'line',
        data: {
          labels: data.charts.subjectPerformance.map(i => i.subject),
          datasets: [{ label: 'Avg Score (%)', data: data.charts.subjectPerformance.map(i => i.avg_score), borderColor: '#f59e0b', tension: 0.3 }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }
  } catch(e) { console.error(e); }
};

window.monitorInterval = null;
window.currentMonitorTestId = null;

window.loadLiveMonitor = async function() {
  try {
    const res = await API.get('/tests?limit=100');
    const select = document.getElementById('monitor-test-select');
    select.innerHTML = '<option value="">Select an active test...</option>' + 
      (res?.data?.rows || []).map(t => `<option value="${t.id}">${t.title} (${t.course_code || 'N/A'})</option>`).join('');
  } catch(e) {}
};

window.startMonitor = function(testId) {
  if (!testId) {
    clearInterval(window.monitorInterval);
    document.getElementById('monitor-tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">Select a test to monitor</td></tr>';
    return;
  }
  window.currentMonitorTestId = testId;
  refreshMonitor();
  if (window.monitorInterval) clearInterval(window.monitorInterval);
  window.monitorInterval = setInterval(() => {
    if (!document.hidden) refreshMonitor();
  }, 5000);
};

window.refreshMonitor = async function() {
  if (!window.currentMonitorTestId) return;
  try {
    const res = await API.get(`/tests/${window.currentMonitorTestId}/live-monitor`);
    const tbody = document.getElementById('monitor-tbody');
    if (!res?.data || res.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;">No active sessions currently.</td></tr>';
      return;
    }
    
    tbody.innerHTML = res.data.map(s => `\
      <tr>\
        <td>${s.full_name}</td>\
        <td>${s.matric_no}</td>\
        <td><span class="result-pill ${s.status === 'active' ? 'pass' : 'fail'}">${s.status.toUpperCase()}</span></td>\
        <td>Q${s.current_question_index + 1}</td>\
        <td>${new Date(s.last_active_at).toLocaleTimeString()}</td>\
        <td><button class="btn btn-sm btn-danger" onclick="terminateSession(${s.session_id})">Terminate</button></td>\
      </tr>\
    `).join('');
  } catch(e) {}
};

window.terminateSession = async function(sessionId) {
  if (!confirm('Are you sure you want to terminate this session? The student will be forcefully submitted.')) return;
  try {
    await API.post(`/tests/${window.currentMonitorTestId}/submit`, { session_id: sessionId });
    refreshMonitor();
    Toast.show('Session terminated successfully');
  } catch(e) {
    Toast.show(e.message, 'error');
  }
};
