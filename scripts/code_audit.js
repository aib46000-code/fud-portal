const fs   = require('fs');
const path = require('path');
const issues = [];

// CLI scripts legitimately use console.log (terminal tools, not server code)
const CLI_SCRIPTS = new Set(['migrate.js','seed.js','create_zip.js','verify-endpoints.js','add-meta.js','code_audit.js']);

function scanDir(dir, ext) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) { scanDir(fp, ext); return; }
    if (!fp.endsWith(ext)) return;
    if (CLI_SCRIPTS.has(e.name)) return;          // skip CLI scripts
    const rel  = fp.replace(/.*fud-portal[\\/]/, '');
    const text = fs.readFileSync(fp, 'utf8');
    text.split('\n').forEach((line, i) => {
      const n = i + 1;
      if (/console\.(log|debug)\(/.test(line) && !line.trim().startsWith('//')) {
        issues.push({ sev: 'MEDIUM', file: rel, line: n, msg: 'console.log/debug: ' + line.trim().slice(0, 90) });
      }
      if (/\bTODO\b|\bFIXME\b|\bHACK\b/.test(line)) {
        issues.push({ sev: 'LOW', file: rel, line: n, msg: 'Dev comment: ' + line.trim().slice(0, 90) });
      }
    });
  });
}

scanDir('backend', '.js');
scanDir(path.join('frontend', 'js'), '.js');

// ── api.js specific checks ──
const apiPath = path.join('frontend', 'js', 'api.js');
if (fs.existsSync(apiPath)) {
  const api = fs.readFileSync(apiPath, 'utf8');
  if (api.includes("getToken()")) {
    issues.push({ sev: 'LOW', file: 'frontend/js/api.js', line: '~9', msg: 'getToken() is duplicate of getAccess() - dead code' });
  }
  const dbl = "el.classList.remove('hidden'); el.classList.remove('hidden')";
  if (api.includes(dbl)) {
    issues.push({ sev: 'LOW', file: 'frontend/js/api.js', line: '~233', msg: 'Duplicate classList.remove in showModal()' });
  }
}

// ── HTML checks ──
fs.readdirSync('frontend').filter(f => f.endsWith('.html')).forEach(f => {
  const fp   = path.join('frontend', f);
  const html = fs.readFileSync(fp, 'utf8');
  if (!html.includes('rel="icon"') && !html.includes("rel='icon'"))     issues.push({ sev: 'LOW',    file: 'frontend/' + f, line: 'head', msg: 'Missing favicon' });
  if (!html.includes('og:title'))                                         issues.push({ sev: 'LOW',    file: 'frontend/' + f, line: 'head', msg: 'Missing OG meta tags' });
  if (!html.includes('rel="canonical"'))                                  issues.push({ sev: 'LOW',    file: 'frontend/' + f, line: 'head', msg: 'Missing canonical link' });
  if (!html.includes('theme-color'))                                      issues.push({ sev: 'LOW',    file: 'frontend/' + f, line: 'head', msg: 'Missing theme-color meta' });
});

// ── package.json ──
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (!pkg.engines) {
  issues.push({ sev: 'MEDIUM', file: 'package.json', line: 'root', msg: 'Missing engines field' });
}

// ── Report ──
const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
issues.sort((a, b) => order[a.sev] - order[b.sev]);

if (issues.length === 0) {
  console.log('NO ISSUES FOUND - code is clean');
} else {
  issues.forEach(i => console.log('[' + i.sev + '] ' + i.file + ':' + i.line + ' -> ' + i.msg));
  console.log('\nTotal issues: ' + issues.length);
}
