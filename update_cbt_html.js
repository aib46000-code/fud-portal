const fs = require('fs');

let html = fs.readFileSync('frontend/cbt.html', 'utf8');

// 1. Accessibility Tools
if (!html.includes('id="btn-high-contrast"')) {
  html = html.replace(
    /<div class="exam-timer" id="exam-timer">/g,
    `<div style="display:flex;gap:0.5rem;margin-right:1rem;">
      <button class="btn btn-sm btn-ghost" id="btn-font-dec" onclick="changeFontSize(-1)" title="Decrease Font Size"><i class="fas fa-font"></i>-</button>
      <button class="btn btn-sm btn-ghost" id="btn-font-inc" onclick="changeFontSize(1)" title="Increase Font Size"><i class="fas fa-font"></i>+</button>
      <button class="btn btn-sm btn-ghost" id="btn-high-contrast" onclick="toggleHighContrast()" title="Toggle High Contrast"><i class="fas fa-adjust"></i></button>
    </div>
    <div class="exam-timer" id="exam-timer">`
  );
}

// 2. Token Entry Modal
if (!html.includes('id="modal-token"')) {
  html = html.replace(
    /<!-- ═══════════════════ LOBBY ═══════════════════ -->/,
    `<!-- Token Modal -->
<div class="modal-overlay hidden" id="modal-token" style="z-index:9999;">
  <div class="modal" style="max-width:400px; background:var(--card-bg);">
    <div class="modal-header">
      <div class="modal-title"><i class="fas fa-key"></i> Enter Access Token</div>
      <span class="modal-close" onclick="document.getElementById('modal-token').classList.add('hidden')">&times;</span>
    </div>
    <div class="modal-body">
      <p style="font-size:0.85rem; color:var(--txt-300); margin-bottom:1rem;">This exam requires a secure access token to start. Please enter the token provided by your invigilator.</p>
      <div class="form-group">
        <label class="form-label">Access Token</label>
        <div class="input-wrap"><i class="fas fa-lock input-icon"></i>
          <input type="text" id="exam-token-input" class="form-input" placeholder="e.g. A1B2C3D4" style="text-transform:uppercase;">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="document.getElementById('modal-token').classList.add('hidden')">Cancel</button>
      <button class="btn btn-primary" onclick="submitTokenAndStart()"><i class="fas fa-play"></i> Verify & Start</button>
    </div>
  </div>
</div>

<!-- ═══════════════════ LOBBY ═══════════════════ -->`
  );
}

fs.writeFileSync('frontend/cbt.html', html);
console.log('cbt.html updated successfully');
