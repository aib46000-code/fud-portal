const fs = require('fs');
let code = fs.readFileSync('frontend/js/tests.js', 'utf8');

// 1. Update saveTest
if (!code.includes('early_access_mins')) {
  code = code.replace(
    /ends_at:\s*document\.getElementById\('t-ends'\)\.value \|\| null,/g,
    "ends_at: document.getElementById('t-ends').value || null,\n    early_access_mins: document.getElementById('t-early-access') ? document.getElementById('t-early-access').value : 0,\n    late_entry_mins: document.getElementById('t-late-entry') ? document.getElementById('t-late-entry').value : 0,\n    max_attempts: document.getElementById('t-max-attempts') ? document.getElementById('t-max-attempts').value : 1,\n    token_required: document.getElementById('t-token-required') ? document.getElementById('t-token-required').value : 0,\n    randomize_options: document.getElementById('t-randomize-options') ? document.getElementById('t-randomize-options').value : 0,\n    randomize_sections: document.getElementById('t-randomize-sections') ? document.getElementById('t-randomize-sections').value : 0,"
  );
}

// 2. Update openTestModal
if (!code.includes("document.getElementById('t-early-access').value = test?.early_access_mins")) {
  code = code.replace(
    /document\.getElementById\('t-ends'\)\.value\s*=\s*test\?\.ends_at.*?\|\|\s*'';/g,
    "document.getElementById('t-ends').value = test?.ends_at ? test.ends_at.slice(0,16) : '';\n  if (document.getElementById('t-early-access')) document.getElementById('t-early-access').value = test?.early_access_mins || 0;\n  if (document.getElementById('t-late-entry')) document.getElementById('t-late-entry').value = test?.late_entry_mins || 0;\n  if (document.getElementById('t-max-attempts')) document.getElementById('t-max-attempts').value = test?.max_attempts || 1;\n  if (document.getElementById('t-token-required')) document.getElementById('t-token-required').value = test?.token_required || 0;\n  if (document.getElementById('t-randomize-options')) document.getElementById('t-randomize-options').value = test?.randomize_options || 0;\n  if (document.getElementById('t-randomize-sections')) document.getElementById('t-randomize-sections').value = test?.randomize_sections || 0;"
  );
}

// 3. Update switchView
if (!code.includes("loadAnalytics()")) {
  code = code.replace(
    /if \(view === 'results-admin'\) loadResultsOverview\(\);/g,
    "if (view === 'results-admin') loadResultsOverview();\n  if (view === 'analytics') loadAnalytics();\n  if (view === 'live-monitor') loadLiveMonitor();"
  );
}

// 4. Add new functions for Analytics and Monitor
if (!code.includes("window.loadAnalytics")) {
  code += "\n// ══════════════════════════════════════════════════════════════════\n" +
"// PHASE 5: ENTERPRISE ANALYTICS & LIVE MONITOR\n" +
"// ══════════════════════════════════════════════════════════════════\n" +
"window.loadAnalytics = async function() {\n" +
"  try {\n" +
"    const res = await API.get('/tests/stats/dashboard');\n" +
"    const data = res.data;\n" +
"    \n" +
"    const cardsHtml = `\\\n" +
"      <div class=\"tests-stat\"><div class=\"tests-stat-val\">${data.cards.totalStudents}</div><div class=\"tests-stat-lab\">Total Students</div></div>\\\n" +
"      <div class=\"tests-stat\"><div class=\"tests-stat-val\">${data.cards.totalExams}</div><div class=\"tests-stat-lab\">Total Exams Taken</div></div>\\\n" +
"      <div class=\"tests-stat\"><div class=\"tests-stat-val\" style=\"color:var(--clr-success)\">${data.cards.passRate.toFixed(1)}%</div><div class=\"tests-stat-lab\">Global Pass Rate</div></div>\\\n" +
"      <div class=\"tests-stat\"><div class=\"tests-stat-val\" style=\"color:var(--clr-danger)\">${data.cards.failRate.toFixed(1)}%</div><div class=\"tests-stat-lab\">Global Fail Rate</div></div>\\\n" +
"    `;\n" +
"    document.getElementById('analytics-cards').innerHTML = cardsHtml;\n" +
"    \n" +
"    document.getElementById('analytics-worst-q').innerHTML = data.charts.worstQuestions.map(q => `\\\n" +
"      <tr>\\\n" +
"        <td>${q.id}</td>\\\n" +
"        <td style=\"max-width:200px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;\">${q.question_text}</td>\\\n" +
"        <td>${q.times_used}</td>\\\n" +
"        <td>${q.times_correct}</td>\\\n" +
"        <td>${q.times_wrong}</td>\\\n" +
"        <td style=\"color:var(--clr-danger)\">${((q.times_wrong / q.times_used) * 100).toFixed(1)}%</td>\\\n" +
"      </tr>\\\n" +
"    `).join('');\n" +
"\n" +
"    if (window.Chart) {\n" +
"      if (window.monthlyChart) window.monthlyChart.destroy();\n" +
"      if (window.perfChart) window.perfChart.destroy();\n" +
"      \n" +
"      const ctx1 = document.getElementById('chart-monthly').getContext('2d');\n" +
"      window.monthlyChart = new Chart(ctx1, {\n" +
"        type: 'bar',\n" +
"        data: {\n" +
"          labels: data.charts.monthlyExams.map(i => i.month),\n" +
"          datasets: [{ label: 'Exams Taken', data: data.charts.monthlyExams.map(i => i.count), backgroundColor: '#0d9488' }]\n" +
"        },\n" +
"        options: { responsive: true, maintainAspectRatio: false }\n" +
"      });\n" +
"      \n" +
"      const ctx2 = document.getElementById('chart-performance').getContext('2d');\n" +
"      window.perfChart = new Chart(ctx2, {\n" +
"        type: 'line',\n" +
"        data: {\n" +
"          labels: data.charts.subjectPerformance.map(i => i.subject),\n" +
"          datasets: [{ label: 'Avg Score (%)', data: data.charts.subjectPerformance.map(i => i.avg_score), borderColor: '#f59e0b', tension: 0.3 }]\n" +
"        },\n" +
"        options: { responsive: true, maintainAspectRatio: false }\n" +
"      });\n" +
"    }\n" +
"  } catch(e) { console.error(e); }\n" +
"};\n" +
"\n" +
"window.monitorInterval = null;\n" +
"window.currentMonitorTestId = null;\n" +
"\n" +
"window.loadLiveMonitor = async function() {\n" +
"  try {\n" +
"    const res = await API.get('/tests?limit=100');\n" +
"    const select = document.getElementById('monitor-test-select');\n" +
"    select.innerHTML = '<option value=\"\">Select an active test...</option>' + \n" +
"      res.data.rows.map(t => `<option value=\"${t.id}\">${t.title} (${t.course_code || 'N/A'})</option>`).join('');\n" +
"  } catch(e) {}\n" +
"};\n" +
"\n" +
"window.startMonitor = function(testId) {\n" +
"  if (!testId) {\n" +
"    clearInterval(window.monitorInterval);\n" +
"    document.getElementById('monitor-tbody').innerHTML = '<tr><td colspan=\"6\" style=\"text-align:center;padding:2rem;\">Select a test to monitor</td></tr>';\n" +
"    return;\n" +
"  }\n" +
"  window.currentMonitorTestId = testId;\n" +
"  refreshMonitor();\n" +
"  if (window.monitorInterval) clearInterval(window.monitorInterval);\n" +
"  window.monitorInterval = setInterval(() => {\n" +
"    if (!document.hidden) refreshMonitor();\n" +
"  }, 5000);\n" +
"};\n" +
"\n" +
"window.refreshMonitor = async function() {\n" +
"  if (!window.currentMonitorTestId) return;\n" +
"  try {\n" +
"    const res = await API.get(`/tests/${window.currentMonitorTestId}/live-monitor`);\n" +
"    const tbody = document.getElementById('monitor-tbody');\n" +
"    if (!res.data || res.data.length === 0) {\n" +
"      tbody.innerHTML = '<tr><td colspan=\"6\" style=\"text-align:center;padding:2rem;\">No active sessions currently.</td></tr>';\n" +
"      return;\n" +
"    }\n" +
"    \n" +
"    tbody.innerHTML = res.data.map(s => `\\\n" +
"      <tr>\\\n" +
"        <td>${s.full_name}</td>\\\n" +
"        <td>${s.matric_no}</td>\\\n" +
"        <td><span class=\"result-pill ${s.status === 'active' ? 'pass' : 'fail'}\">${s.status.toUpperCase()}</span></td>\\\n" +
"        <td>Q${s.current_question_index + 1}</td>\\\n" +
"        <td>${new Date(s.last_active_at).toLocaleTimeString()}</td>\\\n" +
"        <td><button class=\"btn btn-sm btn-danger\" onclick=\"terminateSession(${s.session_id})\">Terminate</button></td>\\\n" +
"      </tr>\\\n" +
"    `).join('');\n" +
"  } catch(e) {}\n" +
"};\n" +
"\n" +
"window.terminateSession = async function(sessionId) {\n" +
"  if (!confirm('Are you sure you want to terminate this session? The student will be forcefully submitted.')) return;\n" +
"  try {\n" +
"    await API.post(`/tests/${window.currentMonitorTestId}/submit`, { session_id: sessionId });\n" +
"    refreshMonitor();\n" +
"    Toast.show('Session terminated successfully');\n" +
"  } catch(e) {\n" +
"    Toast.show(e.message, 'error');\n" +
"  }\n" +
"};\n";
}

fs.writeFileSync('frontend/js/tests.js', code);
console.log('tests.js updated successfully');
