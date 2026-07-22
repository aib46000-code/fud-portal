/**
 * api.js – FUD Portal Frontend
 * Centralised API client with automatic JWT refresh, error handling, and toast integration.
 */
const API_BASE = '/api';

// ── Token Storage ─────────────────────────────────────────────────────────────
const Auth = {
  getAccess()    { return localStorage.getItem('fud_access'); },
  getRefresh()   { return localStorage.getItem('fud_refresh'); },
  getUser()      { return JSON.parse(localStorage.getItem('fud_user') || 'null'); },
  getRole()      { const u = Auth.getUser(); return u?.role || null; },

  setTokens({ accessToken, refreshToken, user }) {
    if (accessToken)  localStorage.setItem('fud_access',  accessToken);
    if (refreshToken) localStorage.setItem('fud_refresh', refreshToken);
    if (user)         localStorage.setItem('fud_user',    JSON.stringify(user));
  },

  clear() {
    localStorage.removeItem('fud_access');
    localStorage.removeItem('fud_refresh');
    localStorage.removeItem('fud_user');
  },

  isLoggedIn() { return !!Auth.getAccess(); },

  requireAuth(redirectTo = '/index.html') {
    if (!Auth.isLoggedIn()) { window.location.href = redirectTo; return false; }
    return true;
  },

  requireGuest(redirectTo = '/dashboard.html') {
    if (Auth.isLoggedIn()) { window.location.href = redirectTo; return false; }
    return true;
  },

  requireRole(roles, redirectTo = '/dashboard.html') {
    const role = Auth.getRole();
    if (!roles.includes(role)) { window.location.href = redirectTo; return false; }
    return true;
  },
};

// ── Refresh Token Logic ───────────────────────────────────────────────────────
let refreshing = null;
async function refreshTokens() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refreshToken = Auth.getRefresh();
    if (!refreshToken) { Auth.clear(); window.location.href = '/index.html'; return null; }
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await res.json();
      if (data.success) {
        Auth.setTokens(data.data);
        return data.data.accessToken;
      } else {
        Auth.clear();
        window.location.href = '/index.html';
        return null;
      }
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// ── Core Fetch Wrapper ────────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}, retry = true) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = Auth.getAccess();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401 && retry) {
    const newToken = await refreshTokens();
    if (newToken) {
      return apiFetch(endpoint, options, false);
    }
    return null;
  }

  // Force password change
  if (res.status === 403) {
    const data = await res.json().catch(() => ({}));
    if (data.force_password_change) {
      Toast.warning('You must change your password to continue.');
      setTimeout(() => showModal('modal-change-pw'), 500);
      return data;
    }
    throw Object.assign(new Error(data.message || 'Forbidden'), { status: 403, data });
  }

  const data = await res.json().catch(() => ({ success: false, message: 'Invalid server response' }));

  if (!res.ok) {
    const err = Object.assign(new Error(data.message || 'Request failed'), { status: res.status, data });
    throw err;
  }

  return data;
}

// ── Shorthand Methods ─────────────────────────────────────────────────────────
const API = {
  get:    (ep, opts={})         => apiFetch(ep, { method:'GET',    ...opts }),
  post:   (ep, body={},opts={}) => apiFetch(ep, { method:'POST',   body: JSON.stringify(body), ...opts }),
  put:    (ep, body={},opts={}) => apiFetch(ep, { method:'PUT',    body: JSON.stringify(body), ...opts }),
  patch:  (ep, body={},opts={}) => apiFetch(ep, { method:'PATCH',  body: JSON.stringify(body), ...opts }),
  delete: (ep, body=null,opts={}) => apiFetch(ep, { method:'DELETE', ...(body ? { body: JSON.stringify(body) } : {}), ...opts }),

  // Auth
  login:            (email, password)     => API.post('/auth/login',             { email, password }),
  adminLogin:       (email, password)     => API.post('/auth/admin/login',       { email, password }),
  register:         (data)                => API.post('/auth/register/student',  data),
  registerAdmin:    (data)                => API.post('/auth/register/admin',    data),
  logout:           (refreshToken)        => API.post('/auth/logout',            { refreshToken }),
  logoutAll:        ()                    => API.post('/auth/logout-all',        {}),
  getMe:            ()                    => API.get('/auth/me'),
  changePassword:   (current, newPw, confirmPw) => API.put('/auth/change-password',    { current_password: current, new_password: newPw, confirm_password: confirmPw || newPw }),
  forgotPassword:   (email)              => API.post('/auth/forgot-password',   { email }),
  resetPassword:    (token, newPw)        => API.post('/auth/reset-password',    { token, new_password: newPw }),
  verifyEmail:      (token)              => API.get(`/auth/verify-email/${token}`),
  forceChangePw:    (userId)             => API.post(`/auth/force-change-password/${userId}`, {}),

  // Users
  getUsers:         (params={})          => API.get('/users?' + new URLSearchParams(params)),
  getStudents:      (params={})          => API.get('/users/students?' + new URLSearchParams(params)),
  getUser:          (id)                 => API.get(`/users/${id}`),
  updateUser:       (id, data)           => API.put(`/users/${id}`, data),
  toggleActive:     (id, active)         => API.patch(`/users/${id}/active`, { is_active: active }),
  deleteUser:       (id)                 => API.delete(`/users/${id}`),

  // Tests
  getTests:         (params={})          => API.get('/tests?' + new URLSearchParams(params)),
  createTest:       (data)               => API.post('/tests', data),
  getTest:          (id)                 => API.get(`/tests/${id}`),
  updateTest:       (id, data)           => API.put(`/tests/${id}`, data),
  deleteTest:       (id)                 => API.delete(`/tests/${id}`),
  publishTest:      (id)                 => API.patch(`/tests/${id}/publish`, {}),
  unpublishTest:    (id)                 => API.patch(`/tests/${id}/unpublish`, {}),
  getQuestions:     (testId)             => API.get(`/tests/${testId}/questions`),
  addQuestion:      (testId, data)       => API.post(`/tests/${testId}/questions`, data),
  bulkAddQuestions: (testId, questions)  => API.post(`/tests/${testId}/questions/bulk`, { questions }),
  submitTest:       (testId, answers)    => API.post(`/tests/${testId}/submit`, { answers }),
  getMyResults:     ()                   => API.get('/tests/my-results'),
  getTestResults:   (testId)             => API.get(`/tests/${testId}/results`),

  // Notifications
  getNotifications: (params={})          => API.get('/notifications?' + new URLSearchParams(params)),
  getUnreadCount:   ()                   => API.get('/notifications/unread-count'),
  markRead:         (id)                 => API.patch(`/notifications/${id}/read`, {}),
  markAllRead:      ()                   => API.patch('/notifications/mark-all-read', {}),
  broadcast:        (data)              => API.post('/notifications/broadcast', data),

  // Media
  getMedia:         (params={})              => API.get('/media?' + new URLSearchParams(params)),
  getMediaStats:    ()                       => API.get('/media/stats'),
  getMediaItem:     (id)                     => API.get(`/media/${id}`),
  deleteMedia:      (id)                     => API.delete(`/media/${id}`),
  bulkDeleteMedia:  (ids)                    => apiFetch('/media/bulk', { method:'DELETE', body: JSON.stringify({ ids }) }),
  toggleMediaVisibility: (id, is_public)     => API.patch(`/media/${id}/visibility`, { is_public }),
  uploadMedia(file, onProgress) {
    const fd = new FormData(); fd.append('file', file);
    const token = Auth.getAccess();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/media/upload`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      if (onProgress) xhr.upload.onprogress = e => onProgress(Math.round(e.loaded / e.total * 100));
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          data.success ? resolve(data) : reject(new Error(data.message || 'Upload failed'));
        } catch { reject(new Error('Upload failed')); }
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(fd);
    });
  },
};

// ── Toast Notification System ─────────────────────────────────────────────────
const Toast = (() => {
  let container;
  function getContainer() {
    if (!container) {
      container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
      }
    }
    return container;
  }
  const icons = { success:'✅', danger:'❌', warning:'⚠️', info:'ℹ️' };
  function show(msg, type='info', duration=4000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type]||icons.info}</span>
      <span class="toast-msg">${msg}</span>
      <span class="toast-close" onclick="this.parentElement.remove()">✕</span>`;
    getContainer().appendChild(toast);
    if (duration > 0) setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, duration);
    return toast;
  }
  return {
    success: (m,d) => show(m,'success',d),
    danger:  (m,d) => show(m,'danger', d),
    warning: (m,d) => show(m,'warning',d),
    info:    (m,d) => show(m,'info',   d),
    error:   (m,d) => show(m,'danger', d),
  };
})();

// ── Modal Helpers ─────────────────────────────────────────────────────────────
function showModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}
function hideModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

// ── Password Strength ─────────────────────────────────────────────────────────
function checkPasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  const levels = ['', 'weak', 'weak', 'fair', 'good', 'strong'];
  const labels = ['', 'Weak', 'Weak', 'Fair', 'Good', 'Strong!'];
  return { score, level: levels[score] || 'weak', label: labels[score] || 'Weak' };
}
function initPasswordStrength(inputId, containerId) {
  const input = document.getElementById(inputId);
  const container = document.getElementById(containerId);
  if (!input || !container) return;
  input.addEventListener('input', () => {
    const { score, level, label } = checkPasswordStrength(input.value);
    container.querySelectorAll('.pw-strength-seg').forEach((seg, i) => {
      seg.className = 'pw-strength-seg' + (i < score ? ` filled ${level}` : '');
    });
    const lbl = container.querySelector('.pw-strength-label');
    if (lbl) lbl.textContent = input.value ? `Strength: ${label}` : '';
  });
}

// ── Form Validation Helper ────────────────────────────────────────────────────
function showFieldError(fieldId, msg) {
  const input = document.getElementById(fieldId);
  const err   = document.getElementById(fieldId + '-error');
  if (input) input.classList.add('error');
  if (err)   { err.textContent = msg; err.classList.add('show'); }
}
function clearFieldError(fieldId) {
  const input = document.getElementById(fieldId);
  const err   = document.getElementById(fieldId + '-error');
  if (input) input.classList.remove('error');
  if (err)   err.classList.remove('show');
}
function clearAllErrors(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.querySelectorAll('.form-input.error').forEach(el => el.classList.remove('error'));
  form.querySelectorAll('.form-error.show').forEach(el => el.classList.remove('show'));
}
function handleApiErrors(errors, fieldMap = {}) {
  if (!Array.isArray(errors)) return;
  errors.forEach(err => {
    const fieldId = fieldMap[err.path] || err.path;
    showFieldError(fieldId, err.msg);
  });
}

// ── Sidebar Toggle ────────────────────────────────────────────────────────────
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggle  = document.getElementById('sidebar-toggle');
  if (!sidebar || !toggle) return;

  let collapsed = localStorage.getItem('sidebar_collapsed') === '1';
  if (collapsed) sidebar.classList.add('collapsed');

  toggle.addEventListener('click', () => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      sidebar.classList.toggle('mobile-open');
    } else {
      collapsed = !collapsed;
      sidebar.classList.toggle('collapsed', collapsed);
      localStorage.setItem('sidebar_collapsed', collapsed ? '1' : '0');
    }
  });

  // Close sidebar on mobile overlay click
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 &&
        sidebar.classList.contains('mobile-open') &&
        !sidebar.contains(e.target) &&
        e.target !== toggle) {
      sidebar.classList.remove('mobile-open');
    }
  });
}

// ── Format Helpers ────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('en-NG', { dateStyle:'medium', timeStyle:'short' }).format(new Date(dateStr));
}
function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('en-NG', { dateStyle:'medium' }).format(new Date(dateStr));
}
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k,i)).toFixed(1)} ${sizes[i]}`;
}
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}
function roleBadge(role) {
  const map = {
    superadmin: 'badge-danger',
    admin:      'badge-warning',
    staff:      'badge-info',
    student:    'badge-primary',
  };
  return `<span class="badge ${map[role]||'badge-neutral'}">${role}</span>`;
}

// ── Update notification badge ─────────────────────────────────────────────────
async function updateUnreadBadge() {
  try {
    const res = await API.getUnreadCount();
    const count = res?.data?.count || 0;
    const badge = document.getElementById('notif-badge');
    const dot   = document.getElementById('notif-dot');
    if (badge) badge.textContent = count > 0 ? count : '';
    if (dot)   dot.classList.toggle('hidden', count === 0);
  } catch {}
}

// ── Render current user in sidebar ───────────────────────────────────────────
function renderSidebarUser() {
  const user = Auth.getUser();
  if (!user) return;
  const nameEl = document.getElementById('sidebar-user-name');
  const roleEl = document.getElementById('sidebar-user-role');
  const avatEl = document.getElementById('sidebar-avatar');
  if (nameEl) nameEl.textContent = user.profile?.full_name || user.email.split('@')[0];
  if (roleEl) roleEl.textContent = user.role;
  if (avatEl) avatEl.textContent = (user.profile?.full_name || user.email)[0].toUpperCase();
}

// ── Force-password-change banner ──────────────────────────────────────────────
function checkForcePwChange() {
  const user = Auth.getUser();
  if (user?.force_password_change) {
    const banner = document.getElementById('force-pw-banner');
    if (banner) banner.classList.remove('hidden');
  }
}

// Export to global
window.Auth    = Auth;
window.API     = API;
window.Toast   = Toast;
window.showModal = showModal;
window.hideModal = hideModal;
window.formatDate = formatDate;
window.formatDateShort = formatDateShort;
window.formatBytes = formatBytes;
window.timeAgo = timeAgo;
window.roleBadge = roleBadge;
window.checkPasswordStrength = checkPasswordStrength;
window.initPasswordStrength  = initPasswordStrength;
window.showFieldError   = showFieldError;
window.clearFieldError  = clearFieldError;
window.clearAllErrors   = clearAllErrors;
window.handleApiErrors  = handleApiErrors;
window.initSidebar      = initSidebar;
window.renderSidebarUser= renderSidebarUser;
window.updateUnreadBadge= updateUnreadBadge;
window.checkForcePwChange = checkForcePwChange;
