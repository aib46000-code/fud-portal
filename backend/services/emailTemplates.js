'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Email Templates – FUD Portal                                    ║
 * ║  Professional HTML emails with consistent branding              ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

// ── Brand constants ───────────────────────────────────────────────────────────
const BRAND = {
  name:    'FUD Portal',
  school:  'Ahmaditech School – Federal University Dutsin-Ma',
  primary: '#6366f1',   // indigo
  accent:  '#0ea5e9',   // sky blue
  dark:    '#0a0f1a',
  text:    '#1e293b',
  muted:   '#64748b',
  success: '#22c55e',
  danger:  '#ef4444',
  warning: '#f59e0b',
  baseUrl: process.env.FRONTEND_URL || 'http://localhost:5000',
  supportEmail: process.env.SUPPORT_EMAIL || 'support@fudportal.edu.ng',
  logoText: 'FUD',
};

// ── Shared layout wrapper ─────────────────────────────────────────────────────
function layout(content, previewText = '') {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${BRAND.name}</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f0f4ff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    .email-wrapper { background: #f0f4ff; padding: 32px 16px; }
    .email-card { background: #ffffff; border-radius: 16px; max-width: 600px; margin: 0 auto; overflow: hidden; box-shadow: 0 4px 32px rgba(99,102,241,.10); }
    .email-header { background: linear-gradient(135deg, #6366f1 0%, #0ea5e9 100%); padding: 36px 40px; text-align: center; }
    .logo-circle { width: 64px; height: 64px; border-radius: 50%; background: rgba(255,255,255,.2); border: 2px solid rgba(255,255,255,.4); display: inline-flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 900; color: #fff; letter-spacing: -1px; margin-bottom: 12px; }
    .header-title { color: #fff; font-size: 22px; font-weight: 700; }
    .header-sub { color: rgba(255,255,255,.8); font-size: 13px; margin-top: 4px; }
    .email-body { padding: 40px; }
    .greeting { font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 16px; }
    p { font-size: 15px; color: #475569; line-height: 1.65; margin-bottom: 14px; }
    .highlight-box { background: linear-gradient(135deg, rgba(99,102,241,.07) 0%, rgba(14,165,233,.07) 100%); border: 1px solid rgba(99,102,241,.2); border-radius: 12px; padding: 20px 24px; margin: 24px 0; }
    .highlight-box p { margin: 0; font-size: 15px; color: #334155; }
    .btn { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #0ea5e9 100%); color: #fff !important; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 32px; border-radius: 50px; margin: 8px 0; letter-spacing: .3px; }
    .btn-center { text-align: center; margin: 28px 0; }
    .btn-secondary { background: #f1f5f9; color: #6366f1 !important; border: 2px solid #e2e8f0; }
    .info-grid { border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; margin: 24px 0; }
    .info-row { display: flex; border-bottom: 1px solid #f1f5f9; }
    .info-row:last-child { border-bottom: none; }
    .info-label { background: #f8fafc; padding: 12px 16px; font-size: 13px; font-weight: 600; color: #64748b; width: 40%; text-transform: uppercase; letter-spacing: .4px; }
    .info-value { padding: 12px 16px; font-size: 14px; color: #1e293b; font-weight: 500; }
    .stat-grid { display: flex; gap: 12px; margin: 20px 0; }
    .stat-box { flex: 1; text-align: center; background: #f8fafc; border-radius: 10px; padding: 16px 8px; border: 1px solid #e2e8f0; }
    .stat-val { font-size: 28px; font-weight: 900; background: linear-gradient(135deg, #6366f1, #0ea5e9); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .stat-lbl { font-size: 12px; color: #94a3b8; margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; }
    .grade-badge { display: inline-block; font-size: 48px; font-weight: 900; width: 90px; height: 90px; border-radius: 50%; line-height: 90px; text-align: center; margin: 0 auto 16px; }
    .grade-pass { background: linear-gradient(135deg, #dcfce7, #bbf7d0); color: #16a34a; border: 2px solid #86efac; }
    .grade-fail { background: linear-gradient(135deg, #fee2e2, #fecaca); color: #dc2626; border: 2px solid #fca5a5; }
    .result-banner { text-align: center; padding: 28px; border-radius: 12px; margin: 20px 0; }
    .result-banner.pass { background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 1px solid #86efac; }
    .result-banner.fail { background: linear-gradient(135deg, #fff1f2, #fee2e2); border: 1px solid #fca5a5; }
    .result-banner .title { font-size: 20px; font-weight: 800; margin-top: 8px; }
    .result-banner.pass .title { color: #15803d; }
    .result-banner.fail .title { color: #b91c1c; }
    .otp-box { font-size: 40px; font-weight: 900; letter-spacing: 12px; background: linear-gradient(135deg, #6366f1, #0ea5e9); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; margin: 20px 0; padding: 20px; background-color: #f8fafc; border-radius: 12px; border: 2px dashed #c7d2fe; }
    .divider { height: 1px; background: #f1f5f9; margin: 28px 0; }
    .warning-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px 18px; margin: 16px 0; font-size: 13px; color: #92400e; }
    .footer { background: #f8fafc; padding: 24px 40px; border-top: 1px solid #e2e8f0; text-align: center; }
    .footer p { font-size: 12px; color: #94a3b8; margin-bottom: 6px; }
    .footer a { color: #6366f1; text-decoration: none; }
    .footer .brand { font-weight: 700; color: #64748b; font-size: 13px; }
  </style>
</head>
<body>
${previewText ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#f0f4ff">${previewText}</div>` : ''}
<div class="email-wrapper">
  <div class="email-card">
    <div class="email-header">
      <div>
        <div class="logo-circle">${BRAND.logoText}</div>
        <div class="header-title">${BRAND.name}</div>
        <div class="header-sub">${BRAND.school}</div>
      </div>
    </div>
    <div class="email-body">
      ${content}
    </div>
    <div class="footer">
      <p class="brand">${BRAND.name} — ${BRAND.school}</p>
      <p>This is an automated message. Please do not reply to this email.</p>
      <p>Need help? <a href="mailto:${BRAND.supportEmail}">${BRAND.supportEmail}</a></p>
      <p style="margin-top:12px;font-size:11px">© ${new Date().getFullYear()} ${BRAND.school}. All rights reserved.</p>
    </div>
  </div>
</div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Welcome / Registration Email
 */
function welcomeEmail({ full_name, email, matric_no, role = 'student', loginUrl }) {
  const isStudent = role === 'student';
  const content = `
    <p class="greeting">Welcome to ${BRAND.name}, ${full_name}! 🎉</p>
    <p>Your account has been created successfully. You now have access to the FUD Student Portal where you can take CBT exams, view results, access learning materials, and much more.</p>

    <div class="highlight-box">
      <p><strong>Your Account Details</strong></p>
    </div>
    <div class="info-grid">
      <div class="info-row">
        <div class="info-label">Full Name</div>
        <div class="info-value">${full_name}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Email Address</div>
        <div class="info-value">${email}</div>
      </div>
      ${isStudent && matric_no ? `
      <div class="info-row">
        <div class="info-label">Matric Number</div>
        <div class="info-value">${matric_no}</div>
      </div>` : ''}
      <div class="info-row">
        <div class="info-label">Account Type</div>
        <div class="info-value" style="text-transform:capitalize">${role}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Portal Access</div>
        <div class="info-value">${BRAND.baseUrl}</div>
      </div>
    </div>

    <div class="btn-center">
      <a href="${loginUrl || BRAND.baseUrl + '/index.html'}" class="btn">🚀 Log In to Portal</a>
    </div>

    <div class="warning-box">
      ⚠️ Keep your login credentials safe. Never share your password with anyone, including staff members.
    </div>

    <div class="divider"></div>
    <p style="font-size:13px;color:#94a3b8">If you did not create this account, please contact us immediately at <a href="mailto:${BRAND.supportEmail}" style="color:#6366f1">${BRAND.supportEmail}</a></p>
  `;
  return layout(content, `Welcome to ${BRAND.name}! Your account is ready.`);
}

/**
 * Password Reset Email
 */
function passwordResetEmail({ full_name, resetUrl, expiresInMinutes = 60 }) {
  const content = `
    <p class="greeting">Password Reset Request 🔐</p>
    <p>Hello <strong>${full_name}</strong>,</p>
    <p>We received a request to reset the password for your ${BRAND.name} account. Click the button below to create a new password.</p>

    <div class="btn-center">
      <a href="${resetUrl}" class="btn">🔑 Reset My Password</a>
    </div>

    <div class="highlight-box">
      <p>⏱ This reset link will expire in <strong>${expiresInMinutes} minutes</strong>. After that, you will need to request a new one.</p>
    </div>

    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break:break-all;font-size:13px;background:#f8fafc;border-radius:8px;padding:12px 14px;color:#6366f1;border:1px solid #e2e8f0">${resetUrl}</p>

    <div class="warning-box">
      ⚠️ If you did not request a password reset, please ignore this email. Your password will not be changed and this link will expire automatically.
    </div>

    <div class="divider"></div>
    <p style="font-size:13px;color:#94a3b8">For security, reset links can only be used once and expire after ${expiresInMinutes} minutes.</p>
  `;
  return layout(content, 'Reset your FUD Portal password — link expires in ' + expiresInMinutes + ' minutes.');
}

/**
 * Exam Notification Email
 */
function examNotificationEmail({ full_name, test_title, subject, course_code, duration_mins,
                                   pass_mark, total_marks, starts_at, ends_at, instructions, portalUrl }) {
  const formatDate = d => d ? new Date(d).toLocaleString('en-NG', {
    dateStyle:'medium', timeStyle:'short'
  }) : 'Open';

  const content = `
    <p class="greeting">Upcoming Exam Notification 📝</p>
    <p>Hello <strong>${full_name}</strong>,</p>
    <p>A new exam has been published and is available for you on the ${BRAND.name}. Please review the details below and prepare accordingly.</p>

    <div class="highlight-box">
      <p style="font-size:18px;font-weight:800;color:#6366f1;margin-bottom:4px">${test_title}</p>
      <p style="font-size:14px;color:#64748b">${subject}${course_code ? ' · ' + course_code : ''}</p>
    </div>

    <div class="info-grid">
      ${course_code ? `<div class="info-row">
        <div class="info-label">Course Code</div>
        <div class="info-value">${course_code}</div>
      </div>` : ''}
      <div class="info-row">
        <div class="info-label">Duration</div>
        <div class="info-value">${duration_mins} minutes</div>
      </div>
      <div class="info-row">
        <div class="info-label">Total Marks</div>
        <div class="info-value">${total_marks}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Pass Mark</div>
        <div class="info-value">${pass_mark}%</div>
      </div>
      ${starts_at ? `<div class="info-row">
        <div class="info-label">Starts</div>
        <div class="info-value">${formatDate(starts_at)}</div>
      </div>` : ''}
      ${ends_at ? `<div class="info-row">
        <div class="info-label">Deadline</div>
        <div class="info-value">${formatDate(ends_at)}</div>
      </div>` : ''}
    </div>

    ${instructions ? `<div class="highlight-box">
      <p><strong>📋 Instructions:</strong><br>${instructions.replace(/\n/g,'<br>')}</p>
    </div>` : ''}

    <div class="warning-box">
      ⚠️ <strong>Important:</strong> Do not switch tabs or minimize the browser during the exam. Violations are recorded and may result in automatic submission.
    </div>

    <div class="btn-center">
      <a href="${portalUrl || BRAND.baseUrl + '/tests.html'}" class="btn">📖 Start Exam on Portal</a>
    </div>

    <div class="divider"></div>
    <p style="font-size:13px;color:#94a3b8">Log in to ${BRAND.baseUrl} with your student credentials to access the exam.</p>
  `;
  return layout(content, `New exam available: ${test_title}`);
}

/**
 * Result Notification Email
 */
function resultEmail({ full_name, test_title, subject, score, total_marks, percentage,
                        grade, passed, pass_mark, time_spent_secs, attempt_number, reviewUrl }) {
  const mins  = Math.floor((time_spent_secs || 0) / 60);
  const secs  = (time_spent_secs || 0) % 60;
  const timeStr = `${mins}m ${secs}s`;

  const gradeColors = { A:'#16a34a', B:'#2563eb', C:'#7c3aed', D:'#d97706', E:'#ea580c', F:'#dc2626' };
  const gradeColor  = gradeColors[grade] || '#64748b';

  const content = `
    <p class="greeting">Your Exam Result is Ready 📊</p>
    <p>Hello <strong>${full_name}</strong>,</p>
    <p>Your submission for <strong>${test_title}</strong> has been scored. Here are your results:</p>

    <div class="result-banner ${passed ? 'pass' : 'fail'}">
      <div style="font-size:48px">${passed ? '🎉' : '😔'}</div>
      <div class="title">${passed ? 'CONGRATULATIONS — YOU PASSED!' : 'YOU DID NOT PASS THIS TIME'}</div>
      <p style="margin-top:8px;font-size:14px;color:${passed?'#166534':'#991b1b'}">${passed ? 'Great work! Keep it up.' : 'Don\'t give up. Review your answers and try again.'}</p>
    </div>

    <div class="stat-grid">
      <div class="stat-box">
        <div class="stat-val">${score}/${total_marks}</div>
        <div class="stat-lbl">Score</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">${percentage.toFixed(1)}%</div>
        <div class="stat-lbl">Percentage</div>
      </div>
      <div class="stat-box">
        <div class="stat-val" style="color:${gradeColor};-webkit-text-fill-color:${gradeColor}">${grade}</div>
        <div class="stat-lbl">Grade</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-row">
        <div class="info-label">Exam</div>
        <div class="info-value">${test_title}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Subject</div>
        <div class="info-value">${subject || '—'}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Pass Mark</div>
        <div class="info-value">${pass_mark}%</div>
      </div>
      <div class="info-row">
        <div class="info-label">Time Spent</div>
        <div class="info-value">${timeStr}</div>
      </div>
      ${attempt_number > 1 ? `<div class="info-row">
        <div class="info-label">Attempt</div>
        <div class="info-value">#${attempt_number}</div>
      </div>` : ''}
    </div>

    <div class="btn-center">
      <a href="${reviewUrl || BRAND.baseUrl + '/tests.html?view=my-results'}" class="btn">👁️ Review Answers</a>
    </div>

    <div class="divider"></div>
    <p style="font-size:13px;color:#94a3b8">Log in to the portal to review your answers, see correct solutions, and access explanations for each question.</p>
  `;
  return layout(content, `Your result: ${score}/${total_marks} (${percentage.toFixed(1)}%) — Grade ${grade}`);
}

/**
 * Bulk / Announcement Email
 */
function announcementEmail({ recipient_name, subject_line, message_html, cta_text, cta_url, category = 'info' }) {
  const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', announcement: '📢', general: '📣' };
  const icon  = icons[category] || icons.general;
  const content = `
    <p class="greeting">${icon} ${subject_line}</p>
    <p>Hello ${recipient_name || 'Portal User'},</p>
    <div style="font-size:15px;color:#475569;line-height:1.7">
      ${message_html}
    </div>
    ${cta_text && cta_url ? `
    <div class="btn-center" style="margin-top:28px">
      <a href="${cta_url}" class="btn">${cta_text}</a>
    </div>` : ''}
    <div class="divider"></div>
    <p style="font-size:13px;color:#94a3b8">You received this message because you are registered on ${BRAND.name}.</p>
  `;
  return layout(content, subject_line);
}

/**
 * Password Changed Notification
 */
function passwordChangedEmail({ full_name, changed_at, ip_address }) {
  const content = `
    <p class="greeting">Password Changed Successfully 🔒</p>
    <p>Hello <strong>${full_name}</strong>,</p>
    <p>This is a confirmation that the password for your ${BRAND.name} account has been changed.</p>

    <div class="info-grid">
      <div class="info-row">
        <div class="info-label">Changed At</div>
        <div class="info-value">${new Date(changed_at || Date.now()).toLocaleString('en-NG')}</div>
      </div>
      ${ip_address ? `<div class="info-row">
        <div class="info-label">IP Address</div>
        <div class="info-value">${ip_address}</div>
      </div>` : ''}
    </div>

    <div class="warning-box">
      ⚠️ If you did not make this change, your account may be compromised. Contact support immediately at <strong>${BRAND.supportEmail}</strong>
    </div>

    <div class="btn-center">
      <a href="${BRAND.baseUrl}/index.html" class="btn">🔐 Log In to Your Account</a>
    </div>
  `;
  return layout(content, 'Your FUD Portal password was changed.');
}

/**
 * Account Blocked Notification
 */
function accountBlockedEmail({ full_name, reason, support_email }) {
  const content = `
    <p class="greeting">Account Status Update ⚠️</p>
    <p>Hello <strong>${full_name}</strong>,</p>
    <p>Your ${BRAND.name} account has been temporarily suspended.</p>

    ${reason ? `<div class="highlight-box"><p><strong>Reason:</strong> ${reason}</p></div>` : ''}

    <p>If you believe this is an error or wish to appeal, please contact us:</p>
    <div class="btn-center">
      <a href="mailto:${support_email || BRAND.supportEmail}" class="btn btn-secondary">📩 Contact Support</a>
    </div>
  `;
  return layout(content, 'Your FUD Portal account has been suspended.');
}

// ── Plain-text fallbacks ──────────────────────────────────────────────────────
function plainText(name, message) {
  return `${BRAND.name} — ${BRAND.school}\n\nHello ${name},\n\n${message}\n\n--\nThis is an automated message from ${BRAND.name}.\nSupport: ${BRAND.supportEmail}`;
}

module.exports = {
  layout,
  welcomeEmail,
  passwordResetEmail,
  examNotificationEmail,
  resultEmail,
  announcementEmail,
  passwordChangedEmail,
  accountBlockedEmail,
  plainText,
  BRAND,
};
