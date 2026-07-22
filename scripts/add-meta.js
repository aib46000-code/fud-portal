/**
 * add-meta.js — Injects favicon, Open Graph tags, and canonical links into all HTML files
 */
const fs   = require('fs');
const path = require('path');

const FRONTEND = path.join(__dirname, '..', 'frontend');

// Page-specific metadata
const META = {
  'index.html':         { title: 'Login – FUD Portal | Ahmaditech School', desc: 'Sign in to FUD Portal – Federal University Dutse\'s official student and admin portal.', canonical: '/' },
  'register.html':      { title: 'Register – FUD Portal | Ahmaditech School', desc: 'Create your FUD Portal student account to access CBT exams, results, and notifications.', canonical: '/register.html' },
  'dashboard.html':     { title: 'Dashboard – FUD Portal | Ahmaditech School', desc: 'Your FUD Portal student dashboard – view notifications, test results, and upcoming exams.', canonical: '/dashboard.html' },
  'admin.html':         { title: 'Admin Dashboard – FUD Portal', desc: 'FUD Portal administration panel – manage students, staff, exams, and system settings.', canonical: '/admin.html' },
  'tests.html':         { title: 'CBT Tests – FUD Portal', desc: 'Browse and manage Computer-Based Tests on FUD Portal.', canonical: '/tests.html' },
  'cbt.html':           { title: 'Take Exam – FUD Portal', desc: 'Take your Computer-Based Test on FUD Portal.', canonical: '/cbt.html' },
  'results.html':       { title: 'Results – FUD Portal', desc: 'View your CBT exam results and performance analytics on FUD Portal.', canonical: '/results.html' },
  'media.html':         { title: 'Media Library – FUD Portal', desc: 'Upload and manage learning resources, documents, and media files on FUD Portal.', canonical: '/media.html' },
  'notifications.html': { title: 'Notifications – FUD Portal', desc: 'Stay up to date with FUD Portal announcements and exam notifications.', canonical: '/notifications.html' },
  'users.html':         { title: 'User Management – FUD Portal', desc: 'Manage students, staff, and admin accounts on FUD Portal.', canonical: '/users.html' },
  'profile.html':       { title: 'My Profile – FUD Portal', desc: 'View and update your FUD Portal account profile and settings.', canonical: '/profile.html' },
  'email.html':         { title: 'Email Settings – FUD Portal', desc: 'Configure email notifications and settings for FUD Portal.', canonical: '/email.html' },
};

const SITE_URL = 'https://your-domain.com'; // placeholder — update at deploy time

let fixed = 0, skipped = 0;

fs.readdirSync(FRONTEND).filter(f => f.endsWith('.html')).forEach(file => {
  const fp = path.join(FRONTEND, file);
  let html = fs.readFileSync(fp, 'utf8');
  const m = META[file];
  if (!m) { console.log('SKIP (no meta):', file); skipped++; return; }

  let changed = false;

  // 1. Add favicon (after charset meta)
  if (!html.includes('rel="icon"') && !html.includes("rel='icon'")) {
    html = html.replace(
      '<meta charset="UTF-8">',
      '<meta charset="UTF-8">\n  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><text y=\'.9em\' font-size=\'90\'>🎓</text></svg>">\n  <link rel="shortcut icon" href="/favicon.ico">'
    );
    changed = true;
  }

  // 2. Add canonical link
  if (!html.includes('rel="canonical"')) {
    html = html.replace(
      '</head>',
      `  <link rel="canonical" href="${SITE_URL}${m.canonical}">\n</head>`
    );
    changed = true;
  }

  // 3. Add Open Graph + Twitter tags
  if (!html.includes('og:title')) {
    const ogTags = `  <!-- Open Graph / Social -->
  <meta property="og:type"        content="website">
  <meta property="og:url"         content="${SITE_URL}${m.canonical}">
  <meta property="og:title"       content="${m.title}">
  <meta property="og:description" content="${m.desc}">
  <meta property="og:image"       content="${SITE_URL}/og-image.png">
  <meta name="twitter:card"       content="summary">
  <meta name="twitter:title"      content="${m.title}">
  <meta name="twitter:description" content="${m.desc}">
  <meta name="robots" content="noindex, nofollow">
`;
    html = html.replace('</head>', ogTags + '</head>');
    changed = true;
  }

  // 4. Add theme-color meta
  if (!html.includes('theme-color')) {
    html = html.replace(
      '<meta name="viewport"',
      '<meta name="theme-color" content="#667eea">\n  <meta name="viewport"'
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(fp, html, 'utf8');
    console.log('✅ Fixed:', file);
    fixed++;
  } else {
    console.log('OK (no change):', file);
    skipped++;
  }
});

console.log(`\nDone. Fixed: ${fixed}, Skipped: ${skipped}`);
