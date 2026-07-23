const fs = require('fs');

let html = fs.readFileSync('frontend/tests.html', 'utf8');

// 1. Add Chart.js at the bottom
if (!html.includes('chart.min.js')) {
    html = html.replace('<script src="js/api.js"></script>', '<script src="libs/chartjs/chart.min.js"></script>\n<script src="js/api.js"></script>');
}

// 2. Add sidebar links
if (!html.includes('data-tab="analytics"')) {
    const navInsertPoint = `<div class="nav-section-label admin-only" id="enterprise-label">Enterprise CBT</div>
      <a href="#" class="nav-item admin-only" data-tab="analytics" onclick="switchView('analytics',this)">
        <i class="fas fa-chart-pie nav-item-icon"></i><span class="nav-item-text">Analytics</span>
      </a>
      <a href="#" class="nav-item admin-only" data-tab="live-monitor" onclick="switchView('live-monitor',this)">
        <i class="fas fa-desktop nav-item-icon"></i><span class="nav-item-text">Live Monitor</span>
      </a>`;
      
    html = html.replace('<div class="nav-section-label">Student</div>', navInsertPoint + '\n\n      <div class="nav-section-label">Student</div>');
}

// 3. Add Analytics and Live Monitor sections
if (!html.includes('id="view-analytics"')) {
    const sections = `
      <!-- ═══════════ VIEW: ANALYTICS (Admin) ═══════════ -->
      <section class="tab-panel admin-only" id="view-analytics">
        <div class="mb-lg" style="display:flex;align-items:center;gap:1rem">
          <div class="topbar-title">Enterprise Analytics Dashboard</div>
        </div>
        <div class="tests-stats-bar" id="analytics-cards" style="margin-bottom:2rem;">
          <!-- Cards will be populated here -->
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;">
           <div class="card">
              <div class="card-header"><div class="card-title">Monthly Exams</div></div>
              <div style="height:250px;"><canvas id="chart-monthly"></canvas></div>
           </div>
           <div class="card">
              <div class="card-header"><div class="card-title">Subject Performance</div></div>
              <div style="height:250px;"><canvas id="chart-performance"></canvas></div>
           </div>
        </div>
        <div class="card mt-lg">
           <div class="card-header"><div class="card-title">Top 10 Most Failed Questions</div></div>
           <div class="table-wrap">
             <table class="data-table">
                <thead><tr><th>ID</th><th>Question</th><th>Times Used</th><th>Times Correct</th><th>Times Wrong</th><th>Fail Rate</th></tr></thead>
                <tbody id="analytics-worst-q"></tbody>
             </table>
           </div>
        </div>
      </section>

      <!-- ═══════════ VIEW: LIVE MONITOR (Admin) ═══════════ -->
      <section class="tab-panel admin-only" id="view-live-monitor">
        <div class="mb-lg" style="display:flex;align-items:center;justify-content:space-between">
          <div class="topbar-title">Real-time Exam Monitor</div>
          <div style="display:flex;gap:1rem">
             <select id="monitor-test-select" class="form-select" onchange="startMonitor(this.value)">
                <option value="">Select an active test...</option>
             </select>
             <button class="btn btn-primary" onclick="refreshMonitor()"><i class="fas fa-sync"></i> Refresh</button>
          </div>
        </div>
        <div class="card">
          <div class="table-wrap">
             <table class="data-table">
                <thead><tr><th>Student</th><th>Matric No</th><th>Status</th><th>Current Question</th><th>Last Active</th><th>Action</th></tr></thead>
                <tbody id="monitor-tbody">
                   <tr><td colspan="6" style="text-align:center;padding:2rem;">Select a test to monitor</td></tr>
                </tbody>
             </table>
          </div>
        </div>
      </section>
`;
    html = html.replace('<!-- ═══════════ VIEW: MY RESULTS ═══════════ -->', sections + '\n      <!-- ═══════════ VIEW: MY RESULTS ═══════════ -->');
}

// 4. Update the Create/Edit Test form fields (Phase 5 enterprise options)
if (!html.includes('id="t-early-access"')) {
    const extraFields = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Early Access (mins)</label>
          <div class="input-wrap"><i class="fas fa-fast-forward input-icon"></i>
            <input type="number" id="t-early-access" class="form-input" value="0" min="0"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Late Entry Window (mins)</label>
          <div class="input-wrap"><i class="fas fa-hourglass-half input-icon"></i>
            <input type="number" id="t-late-entry" class="form-input" value="0" min="0"></div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Max Attempts</label>
          <div class="input-wrap"><i class="fas fa-redo input-icon"></i>
            <input type="number" id="t-max-attempts" class="form-input" value="1" min="1"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Require Access Token?</label>
          <div class="input-wrap"><i class="fas fa-key input-icon"></i>
            <select id="t-token-required" class="form-select">
              <option value="0">No</option>
              <option value="1">Yes</option>
            </select>
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Randomize Options?</label>
          <div class="input-wrap"><i class="fas fa-random input-icon"></i>
            <select id="t-randomize-options" class="form-select">
              <option value="0">No</option>
              <option value="1">Yes (Shuffle options per student)</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Randomize Sections?</label>
          <div class="input-wrap"><i class="fas fa-layer-group input-icon"></i>
            <select id="t-randomize-sections" class="form-select">
              <option value="0">No</option>
              <option value="1">Yes</option>
            </select>
          </div>
        </div>
      </div>
`;
    html = html.replace('<!-- End Date/Time -->', extraFields); // Actually let's place it right before the instructions field.
    html = html.replace('<div class="form-group">\n        <label class="form-label">Instructions</label>', extraFields + '\n      <div class="form-group">\n        <label class="form-label">Instructions</label>');
}

fs.writeFileSync('frontend/tests.html', html);
console.log('tests.html updated successfully');
