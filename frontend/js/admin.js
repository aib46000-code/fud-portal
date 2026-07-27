/**
 * admin.js – FUD Portal Admin Panel
 * Full logic: dashboard, students, admins, activity, permissions, export, backup
 */
'use strict';

// ── State ────────────────────────────────────────────────────────────────────
const State = {
  currentTab: 'dashboard',
  isSuperAdmin: false,
  students:  { page: 1, limit: 20, total: 0 },
  admins:    { page: 1, limit: 20, total: 0 },
  activity:  { page: 1, limit: 30, total: 0 },
  allPerms:  [],
  rolePerms: {},
};

// ── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;
  if (!Auth.requireRole(['admin','superadmin','staff'], '/dashboard.html')) return;

  initSidebar();
  renderSidebarUser();

  const user = Auth.getUser();
  State.isSuperAdmin = user?.role === 'superadmin';

  // Hide superadmin-only nav items for non-superadmins
  if (!State.isSuperAdmin) {
    document.getElementById('nav-perms')?.classList.add('hidden');
    document.getElementById('btn-backup')?.classList.add('hidden');
    document.getElementById('btn-add-admin-open')?.classList.add('superadmin-only-dim');
  }

  document.getElementById('btn-logout').addEventListener('click', async () => {
    try { await API.logout(Auth.getRefresh()); } catch {}
    Auth.clear();
    window.location.href = 'index.html';
  });

  await loadDashboard();
});

// ── Tab Switcher ─────────────────────────────────────────────────────────────
const TAB_META = {
  dashboard:   { title: 'Admin Dashboard',     subtitle: 'Overview & Statistics' },
  students:    { title: 'Student Management',  subtitle: 'Create, edit, block students' },
  admins:      { title: 'Admin Management',    subtitle: 'Manage admin & staff accounts' },
  activity:    { title: 'Activity Logs',       subtitle: 'All system events & actions' },
  permissions: { title: 'Role Permissions',    subtitle: 'Configure access control' },
};

window.switchTab = function(tab, el) {
  if (el) el.preventDefault?.();
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  if (el) el.classList?.add('active');

  const meta = TAB_META[tab] || {};
  document.getElementById('topbar-title').textContent    = meta.title    || tab;
  document.getElementById('topbar-subtitle').textContent = meta.subtitle || '';
  State.currentTab = tab;

  // Lazy-load tab data
  if (tab === 'students')    { State.students.page = 1;  loadStudents(); }
  if (tab === 'admins')      { State.admins.page   = 1;  loadAdmins(); }
  if (tab === 'activity')    { State.activity.page  = 1; loadActivity(); }
  if (tab === 'permissions') loadPermissions();
};

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
async function loadDashboard() {
  try {
    const res = await API.get('/admin/stats');
    const d = res?.data;
    if (!d) return;

    const o = d.overview;
    
    // Ensure we are actually on the admin dashboard page before setting textContent
    if (!document.getElementById('s-total')) return;

    document.getElementById('s-total').textContent    = o.totalUsers;
    document.getElementById('s-students').textContent = o.students;
    document.getElementById('s-admins').textContent   = o.admins;
    document.getElementById('s-active').textContent   = o.activeUsers;
    document.getElementById('s-blocked').textContent  = o.blockedUsers;
    document.getElementById('s-tests').textContent    = d.tests.published;
    document.getElementById('s-passrate').textContent = d.tests.passRate + '%';
    document.getElementById('s-today').textContent    = o.newToday;

    // Badge
    const sb = document.getElementById('badge-students');
    if (sb && o.newThisWeek > 0) { sb.textContent = '+'+o.newThisWeek; sb.classList.remove('hidden'); }

    renderRegChart(d.registrationTrend || []);
    renderDeptChart(d.topDepts || []);
    renderRecentActivity(d.recentActivity || []);
  } catch (err) {
    Toast.error('Failed to load dashboard: ' + err.message);
  }
}

function renderRegChart(trend) {
  const container = document.getElementById('reg-chart');
  if (!trend.length) { container.innerHTML = '<p style="color:var(--txt-muted);text-align:center;width:100%">No data</p>'; return; }
  const max = Math.max(...trend.map(t => t.count), 1);
  container.innerHTML = trend.map(t => {
    const h = Math.max(Math.round(t.count / max * 130), 4);
    return `<div class="chart-bar-wrap">
      <div class="chart-value">${t.count}</div>
      <div class="chart-bar" style="height:${h}px" title="${t.month}: ${t.count} registrations"></div>
      <div class="chart-label">${t.month?.slice(5) || ''}</div>
    </div>`;
  }).join('');
}

function renderDeptChart(depts) {
  const container = document.getElementById('dept-chart');
  if (!depts.length) { container.innerHTML = '<p style="color:var(--txt-muted)">No data</p>'; return; }
  const max = Math.max(...depts.map(d => d.count), 1);
  container.innerHTML = depts.map(d => `
    <div class="dept-row">
      <div class="dept-name" title="${esc(d.department)}">${esc(d.department)}</div>
      <div class="dept-bar-track">
        <div class="dept-bar-fill" style="width:${Math.round(d.count/max*100)}%"></div>
      </div>
      <div class="dept-count">${d.count}</div>
    </div>`).join('');
}

function renderRecentActivity(logs) {
  const tbody = document.getElementById('recent-activity-body');
  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-state-icon">📋</div><h3>No activity yet</h3></div></td></tr>`;
    return;
  }
  tbody.innerHTML = logs.map(l => `
    <tr>
      <td>${actionPill(l.action)}</td>
      <td style="font-size:.82rem">
        <div style="font-weight:600">${esc(l.email || 'System')}</div>
        <div style="color:var(--txt-muted);font-size:.72rem">${esc(l.role || '')}</div>
      </td>
      <td style="color:var(--txt-400);font-size:.82rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
          title="${esc(l.description)}">${esc(l.description || '—')}</td>
      <td><code style="font-size:.75rem;color:var(--txt-400)">${esc(l.ip_address || '—')}</code></td>
      <td style="color:var(--txt-muted);font-size:.76rem;white-space:nowrap">${timeAgo(l.created_at)}</td>
    </tr>`).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// STUDENTS
// ═══════════════════════════════════════════════════════════════════════════
async function loadStudents() {
  const tbody = document.getElementById('students-body');
  tbody.innerHTML = loadingRow(9);

  const params = {
    page: State.students.page, limit: State.students.limit,
    search:     document.getElementById('st-search').value.trim(),
    department: document.getElementById('st-dept').value,
    is_active:  document.getElementById('st-active').value,
    is_verified:document.getElementById('st-verified').value,
  };
  // Remove empty
  Object.keys(params).forEach(k => { if (params[k] === '') delete params[k]; });

  try {
    const res = await API.get('/admin/students?' + new URLSearchParams(params));
    const rows  = res?.data?.rows || [];
    const total = res?.data?.total || 0;
    State.students.total = total;
    document.getElementById('st-count').textContent = `${total} student${total !== 1 ? 's' : ''}`;

    // Populate dept filter (first load)
    populateDeptFilter(rows);

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-state-icon">🎓</div>
        <h3>No Students Found</h3><p>Try adjusting the search or filters.</p></div></td></tr>`;
      document.getElementById('st-pagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = rows.map(s => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:.6rem">
            <div class="mini-avatar" style="background:${roleColor('student')}">${(s.full_name||s.email)[0].toUpperCase()}</div>
            <div>
              <div style="font-weight:600;font-size:.88rem">${esc(s.full_name || '—')}</div>
              <div style="font-size:.73rem;color:var(--txt-muted)">${esc(s.email)}</div>
            </div>
          </div>
        </td>
        <td><code style="font-size:.78rem;color:var(--txt-400)">${esc(s.matric_no || '—')}</code></td>
        <td style="font-size:.82rem">${esc(s.department || '—')}</td>
        <td><span class="badge badge-neutral">${esc(s.level || '—')}</span></td>
        <td style="text-align:center;font-weight:600">${s.tests_taken || 0}</td>
        <td style="text-align:center;color:${avgColor(s.avg_score)};font-weight:600">${s.avg_score ?? '—'}${s.avg_score != null ? '%' : ''}</td>
        <td>
          ${s.is_active
            ? '<span class="badge badge-success"><span class="badge-dot"></span>Active</span>'
            : '<span class="badge badge-danger"><span class="badge-dot"></span>Blocked</span>'}
          ${s.is_verified ? '' : '<span class="badge badge-warning" style="margin-left:3px" title="Unverified">!</span>'}
          ${s.force_password_change ? '<span title="Must change password" style="margin-left:3px">🔑</span>' : ''}
        </td>
        <td style="font-size:.76rem;color:var(--txt-muted);white-space:nowrap">${formatDateShort(s.created_at)}</td>
        <td>
          <div class="action-group">
            <button class="btn btn-xs btn-secondary" onclick="editStudent(${s.id})" title="Edit"><i class="fas fa-edit"></i></button>
            ${s.is_active
              ? `<button class="btn btn-xs btn-danger" onclick="blockUser(${s.id},'${esc(s.full_name||s.email)}','student')" title="Block"><i class="fas fa-ban"></i></button>`
              : `<button class="btn btn-xs btn-secondary" onclick="unblockUser(${s.id},'${esc(s.full_name||s.email)}','student')" title="Unblock" style="color:var(--clr-success);border-color:rgba(52,211,153,.3)"><i class="fas fa-check-circle"></i></button>`
            }
            <button class="btn btn-xs btn-secondary" onclick="forcePassword(${s.id},'${esc(s.full_name||s.email)}')" title="Force PW change"><i class="fas fa-key"></i></button>
            ${State.isSuperAdmin
              ? `<button class="btn btn-xs btn-danger" onclick="confirmDelete(${s.id},'${esc(s.full_name||s.email)}','student')" title="Delete"><i class="fas fa-trash"></i></button>`
              : ''}
          </div>
        </td>
      </tr>`).join('');

    renderPagination('st-pagination', total, State.students.page, State.students.limit, p => {
      State.students.page = p; loadStudents();
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--clr-danger);padding:2rem">${err.message}</td></tr>`;
  }
}

let deptsFilled = false;
function populateDeptFilter(rows) {
  if (deptsFilled) return;
  const sel = document.getElementById('st-dept');
  const depts = [...new Set(rows.map(r => r.department).filter(Boolean))].sort();
  depts.forEach(d => {
    const o = document.createElement('option');
    o.value = o.textContent = d;
    sel.appendChild(o);
  });
  deptsFilled = true;
}

// Create / Edit student
window.openStudentModal = function(data = null) {
  const isEdit = !!data;
  document.getElementById('student-modal-title').innerHTML =
    `<i class="fas fa-${isEdit ? 'edit' : 'user-plus'}"></i> ${isEdit ? 'Edit' : 'Add'} Student`;
  document.getElementById('st-edit-id').value = data?.id || '';
  document.getElementById('st-name').value    = data?.full_name || '';
  document.getElementById('st-email').value   = data?.email || '';
  document.getElementById('st-matric').value  = data?.matric_no || '';
  document.getElementById('st-dept-input').value = data?.department || '';
  document.getElementById('st-faculty').value = data?.faculty || '';
  document.getElementById('st-level').value   = data?.level || '';
  document.getElementById('st-gender').value  = data?.gender || '';
  document.getElementById('st-phone').value   = data?.phone || '';
  document.getElementById('st-password').value = '';
  // Hide password field on edit
  document.getElementById('st-pw-group').style.display = isEdit ? 'none' : '';
  document.getElementById('st-password').required = !isEdit;
  showModal('modal-student');
};

window.editStudent = async function(id) {
  try {
    const res = await API.get(`/users/${id}`);
    const u = res?.data;
    const s = u?.profile || {};
    openStudentModal({ id: u.id, email: u.email, full_name: s.full_name, matric_no: s.matric_no,
      department: s.department, faculty: s.faculty, level: s.level, gender: s.gender, phone: s.phone });
  } catch (err) { Toast.error('Failed to load student: ' + err.message); }
};

window.saveStudent = async function() {
  const btn = document.getElementById('btn-save-student');
  const id  = document.getElementById('st-edit-id').value;
  const data = {
    full_name:  document.getElementById('st-name').value.trim(),
    email:      document.getElementById('st-email').value.trim(),
    matric_no:  document.getElementById('st-matric').value.trim(),
    department: document.getElementById('st-dept-input').value.trim() || undefined,
    faculty:    document.getElementById('st-faculty').value.trim() || undefined,
    level:      document.getElementById('st-level').value || undefined,
    gender:     document.getElementById('st-gender').value || undefined,
    phone:      document.getElementById('st-phone').value.trim() || undefined,
  };
  if (!id) {
    data.password = document.getElementById('st-password').value;
    if (!data.full_name || !data.email || !data.matric_no || !data.password) {
      Toast.warning('Full Name, Email, Matric Number and Password are required'); return;
    }
  }

  btn.classList.add('btn-loading'); btn.disabled = true;
  try {
    if (id) {
      await API.put(`/admin/students/${id}`, data);
      Toast.success('Student updated successfully');
    } else {
      await API.post('/admin/students', data);
      Toast.success('Student created successfully');
      deptsFilled = false; // refresh dept filter
    }
    hideModal('modal-student');
    loadStudents();
    if (State.currentTab === 'dashboard') loadDashboard();
  } catch (err) {
    if (err.data?.errors) err.data.errors.forEach(e => Toast.warning(e.msg));
    else Toast.error(err.message);
  } finally { btn.classList.remove('btn-loading'); btn.disabled = false; }
};

// Block / Unblock
window.blockUser = function(id, name, type) {
  openConfirm(
    `Block ${type === 'student' ? 'Student' : 'Admin'}`,
    `Block account for <strong style="color:var(--txt-100)">${esc(name)}</strong>? They will not be able to login.`,
    async () => {
      try {
        await API.patch(`/admin/${type === 'student' ? 'students' : 'students'}/${id}/block`);
        Toast.success(`${name} blocked`);
        type === 'student' ? loadStudents() : loadAdmins();
      } catch (err) { Toast.error(err.message); }
    }, 'warning'
  );
};

window.unblockUser = function(id, name, type) {
  openConfirm(
    `Unblock ${type === 'student' ? 'Student' : 'Admin'}`,
    `Restore access for <strong style="color:var(--txt-100)">${esc(name)}</strong>?`,
    async () => {
      try {
        const endpoint = type === 'student' ? `/admin/students/${id}/unblock` : `/admin/students/${id}/unblock`;
        await API.patch(endpoint);
        Toast.success(`${name} unblocked`);
        type === 'student' ? loadStudents() : loadAdmins();
      } catch (err) { Toast.error(err.message); }
    }, 'info'
  );
};

window.forcePassword = function(id, name) {
  openConfirm('Force Password Change',
    `Force <strong style="color:var(--txt-100)">${esc(name)}</strong> to change their password on next login?`,
    async () => {
      try {
        await API.patch(`/admin/students/${id}/force-password`);
        Toast.success('Force password change flag set');
        loadStudents();
      } catch (err) { Toast.error(err.message); }
    }, 'warning'
  );
};

window.confirmDelete = function(id, name, type) {
  openConfirm('⚠️ Delete Account',
    `Permanently delete <strong style="color:var(--clr-danger)">${esc(name)}</strong>? This action cannot be undone.`,
    async () => {
      try {
        await API.delete(`/admin/${type === 'student' ? 'students' : 'admins'}/${id}`);
        Toast.success('Account deleted');
        type === 'student' ? loadStudents() : loadAdmins();
        loadDashboard();
      } catch (err) { Toast.error(err.message); }
    }, 'danger'
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// ADMINS
// ═══════════════════════════════════════════════════════════════════════════
async function loadAdmins() {
  const tbody = document.getElementById('admins-body');
  tbody.innerHTML = loadingRow(7);

  const params = {
    page: State.admins.page, limit: State.admins.limit,
    search: document.getElementById('ad-search').value.trim(),
    role:   document.getElementById('ad-role').value,
  };
  Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });

  try {
    const res = await API.get('/admin/admins?' + new URLSearchParams(params));
    const rows  = res?.data?.rows || [];
    const total = res?.data?.total || 0;
    State.admins.total = total;
    document.getElementById('ad-count').textContent = `${total} admin${total !== 1 ? 's' : ''}`;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">
        <div class="empty-state-icon">🛡️</div><h3>No Admins Found</h3></div></td></tr>`;
      document.getElementById('ad-pagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = rows.map(a => {
      const name    = a.profile?.full_name || a.email;
      const roleMap = { superadmin: 'badge-danger', admin: 'badge-warning', staff: 'badge-info' };
      const isMe    = a.id === Auth.getUser()?.id;
      return `<tr${isMe ? ' style="background:rgba(45,212,191,.04)"' : ''}>
        <td>
          <div style="display:flex;align-items:center;gap:.6rem">
            <div class="mini-avatar" style="background:${roleColor(a.role)}">${name[0].toUpperCase()}</div>
            <div>
              <div style="font-weight:600;font-size:.88rem">${esc(name)}${isMe ? ' <span style="font-size:.7rem;color:var(--clr-primary)">(you)</span>' : ''}</div>
              <div style="font-size:.73rem;color:var(--txt-muted)">${esc(a.email)}</div>
            </div>
          </div>
        </td>
        <td><span class="badge ${roleMap[a.role]||'badge-neutral'}">${a.role}</span></td>
        <td><code style="font-size:.78rem;color:var(--txt-400)">${esc(a.profile?.staff_id || '—')}</code></td>
        <td style="font-size:.82rem;color:var(--txt-400)">${esc(a.profile?.department || '—')}</td>
        <td style="font-size:.76rem;color:var(--txt-muted);white-space:nowrap">${a.last_login ? timeAgo(a.last_login) : 'Never'}</td>
        <td>
          ${a.is_active
            ? '<span class="badge badge-success"><span class="badge-dot"></span>Active</span>'
            : '<span class="badge badge-danger"><span class="badge-dot"></span>Inactive</span>'}
        </td>
        <td>
          <div class="action-group">
            ${State.isSuperAdmin && !isMe ? `
              <button class="btn btn-xs btn-secondary" onclick="editAdmin(${a.id})" title="Edit"><i class="fas fa-edit"></i></button>
              <button class="btn btn-xs btn-secondary" onclick="forceAdminPw(${a.id},'${esc(name)}')" title="Force PW"><i class="fas fa-key"></i></button>
              ${a.role !== 'superadmin' ? `
                <button class="btn btn-xs btn-danger" onclick="confirmDelete(${a.id},'${esc(name)}','admin')" title="Delete"><i class="fas fa-trash"></i></button>` : ''}
            ` : '<span style="color:var(--txt-muted);font-size:.78rem">—</span>'}
          </div>
        </td>
      </tr>`;
    }).join('');

    renderPagination('ad-pagination', total, State.admins.page, State.admins.limit, p => {
      State.admins.page = p; loadAdmins();
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--clr-danger);padding:2rem">${err.message}</td></tr>`;
  }
}

window.openAdminModal = function(data = null) {
  if (!State.isSuperAdmin) { Toast.warning('Only superadmin can manage admins'); return; }
  const isEdit = !!data;
  document.getElementById('admin-modal-title').innerHTML =
    `<i class="fas fa-${isEdit ? 'edit' : 'user-shield'}"></i> ${isEdit ? 'Edit' : 'Add'} Admin`;
  document.getElementById('ad-edit-id').value    = data?.id || '';
  document.getElementById('ad-name').value       = data?.full_name || '';
  document.getElementById('ad-email').value      = data?.email || '';
  document.getElementById('ad-staff-id').value   = data?.staff_id || '';
  document.getElementById('ad-role-select').value= data?.role || 'admin';
  document.getElementById('ad-dept-input').value = data?.department || '';
  document.getElementById('ad-password').value   = '';
  document.getElementById('ad-pw-group').style.display = isEdit ? 'none' : '';
  showModal('modal-admin');
};

window.editAdmin = async function(id) {
  try {
    const res = await API.get(`/users/${id}`);
    const u = res?.data;
    openAdminModal({
      id: u.id, email: u.email, role: u.role,
      full_name:  u.profile?.full_name,
      staff_id:   u.profile?.staff_id,
      department: u.profile?.department,
    });
  } catch (err) { Toast.error('Failed to load admin: ' + err.message); }
};

window.saveAdmin = async function() {
  const btn = document.getElementById('btn-save-admin');
  const id  = document.getElementById('ad-edit-id').value;
  const data = {
    full_name:  document.getElementById('ad-name').value.trim(),
    email:      document.getElementById('ad-email').value.trim(),
    staff_id:   document.getElementById('ad-staff-id').value.trim(),
    role:       document.getElementById('ad-role-select').value,
    department: document.getElementById('ad-dept-input').value.trim() || undefined,
  };
  if (!id) {
    data.password = document.getElementById('ad-password').value;
    if (!data.full_name || !data.email || !data.staff_id || !data.password) {
      Toast.warning('Name, Email, Staff ID and Password are required'); return;
    }
  }

  btn.classList.add('btn-loading'); btn.disabled = true;
  try {
    if (id) {
      await API.put(`/admin/admins/${id}`, data);
      Toast.success('Admin updated');
    } else {
      await API.post('/admin/admins', data);
      Toast.success('Admin account created');
    }
    hideModal('modal-admin');
    loadAdmins();
    if (State.currentTab === 'dashboard') loadDashboard();
  } catch (err) {
    if (err.data?.errors) err.data.errors.forEach(e => Toast.warning(e.msg));
    else Toast.error(err.message);
  } finally { btn.classList.remove('btn-loading'); btn.disabled = false; }
};

window.forceAdminPw = function(id, name) {
  openConfirm('Force Password Change',
    `Force <strong style="color:var(--txt-100)">${esc(name)}</strong> to change their password?`,
    async () => {
      try {
        await API.patch(`/admin/admins/${id}/force-password`);
        Toast.success('Force password change set');
      } catch (err) { Toast.error(err.message); }
    }, 'warning'
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY LOGS
// ═══════════════════════════════════════════════════════════════════════════
async function loadActivity() {
  const tbody = document.getElementById('activity-body');
  tbody.innerHTML = loadingRow(6);

  const params = {
    page:   State.activity.page, limit: State.activity.limit,
    search: document.getElementById('ac-search').value.trim(),
    action: document.getElementById('ac-action').value,
    from:   document.getElementById('ac-from').value,
    to:     document.getElementById('ac-to').value,
  };
  Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });

  try {
    const res = await API.get('/admin/activity?' + new URLSearchParams(params));
    const rows  = res?.data?.rows || [];
    const total = res?.data?.total || 0;
    const meta  = res?.data?.meta || {};
    State.activity.total = total;
    document.getElementById('ac-count').textContent = `${total} event${total !== 1 ? 's' : ''}`;

    // Populate action filter
    populateActionFilter(meta.actions || []);

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state">
        <div class="empty-state-icon">📋</div><h3>No Logs Found</h3></div></td></tr>`;
      document.getElementById('ac-pagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = rows.map(l => `
      <tr>
        <td>${actionPill(l.action)}</td>
        <td style="font-size:.82rem">
          <div style="font-weight:600">${esc(l.email || 'System')}</div>
          <div style="font-size:.72rem;color:var(--txt-muted)">${esc(l.full_name || '')}</div>
        </td>
        <td>${l.role ? roleBadge(l.role) : '—'}</td>
        <td style="color:var(--txt-400);font-size:.82rem;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
            title="${esc(l.description)}">${esc(l.description || '—')}</td>
        <td><code style="font-size:.75rem;color:var(--txt-muted)">${esc(l.ip_address || '—')}</code></td>
        <td style="color:var(--txt-muted);font-size:.76rem;white-space:nowrap">${formatDate(l.created_at)}</td>
      </tr>`).join('');

    renderPagination('ac-pagination', total, State.activity.page, State.activity.limit, p => {
      State.activity.page = p; loadActivity();
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--clr-danger);padding:2rem">${err.message}</td></tr>`;
  }
}

let actionsFilled = false;
function populateActionFilter(actions) {
  if (actionsFilled || !actions.length) return;
  const sel = document.getElementById('ac-action');
  actions.forEach(a => {
    const o = document.createElement('option');
    o.value = o.textContent = a;
    sel.appendChild(o);
  });
  actionsFilled = true;
}

// ═══════════════════════════════════════════════════════════════════════════
// PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════
async function loadPermissions() {
  const grid = document.getElementById('permissions-grid');
  grid.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--txt-muted)"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';

  try {
    const res = await API.get('/admin/permissions');
    State.allPerms  = res?.data?.permissions || [];
    State.rolePerms = res?.data?.roles || {};
    renderPermissionsGrid();
  } catch (err) {
    grid.innerHTML = `<p style="color:var(--clr-danger);padding:1rem">${err.message}</p>`;
  }
}

function renderPermissionsGrid() {
  const grid = document.getElementById('permissions-grid');
  const roles = ['student','staff','admin','superadmin'];

  // Group permissions by group
  const groups = {};
  State.allPerms.forEach(p => {
    if (!groups[p.group]) groups[p.group] = [];
    groups[p.group].push(p);
  });

  const roleLabels = { student:'Student', staff:'Staff', admin:'Admin', superadmin:'Superadmin' };
  const roleCols   = { student:'badge-primary', staff:'badge-info', admin:'badge-warning', superadmin:'badge-danger' };

  let html = `
    <div class="perm-role-header">
      <div style="font-size:.78rem;color:var(--txt-400);font-weight:600">Permission</div>
      ${roles.map(r => `<div class="perm-role-label"><span class="badge ${roleCols[r]}">${roleLabels[r]}</span></div>`).join('')}
    </div>`;

  Object.entries(groups).forEach(([group, perms]) => {
    html += `<div class="perm-group">
      <div class="perm-group-header"><i class="fas fa-caret-right" style="margin-right:.4rem"></i>${group}</div>
      ${perms.map(p => {
        const cols = roles.map(r => {
          const isSuperAdmin = r === 'superadmin';
          const hasAll       = State.rolePerms[r]?.includes('*');
          const checked      = isSuperAdmin || hasAll || (State.rolePerms[r] || []).includes(p.key);
          return `<div class="perm-toggle ${isSuperAdmin ? 'superadmin-lock' : ''}">
            <input type="checkbox" data-role="${r}" data-perm="${p.key}"
              ${checked ? 'checked' : ''} ${isSuperAdmin ? 'disabled' : ''}
              onchange="onPermChange(this)">
          </div>`;
        }).join('');
        return `<div class="perm-row">
          <div class="perm-label">${esc(p.label)}</div>${cols}
        </div>`;
      }).join('')}
    </div>`;
  });

  grid.innerHTML = html;
}

window.onPermChange = function(cb) {
  const role = cb.dataset.role;
  const perm = cb.dataset.perm;
  if (!State.rolePerms[role]) State.rolePerms[role] = [];
  if (cb.checked) {
    if (!State.rolePerms[role].includes(perm)) State.rolePerms[role].push(perm);
  } else {
    State.rolePerms[role] = State.rolePerms[role].filter(p => p !== perm);
  }
};

window.savePermissions = async function() {
  if (!State.isSuperAdmin) { Toast.warning('Only superadmin can save permissions'); return; }
  const btn = document.getElementById('btn-save-perms');
  btn.classList.add('btn-loading'); btn.disabled = true;
  try {
    await API.put('/admin/permissions', { roles: State.rolePerms });
    Toast.success('Role permissions saved successfully');
  } catch (err) { Toast.error(err.message); }
  finally { btn.classList.remove('btn-loading'); btn.disabled = false; }
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT CSV & BACKUP
// ═══════════════════════════════════════════════════════════════════════════
window.exportCSV = function(type) {
  let url = `/api/admin/export/${type}`;
  if (type === 'activity') {
    const from = document.getElementById('ac-from')?.value;
    const to   = document.getElementById('ac-to')?.value;
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to)   p.set('to',   to);
    if (p.toString()) url += '?' + p.toString();
  }
  // Download via anchor with token
  const token = Auth.getAccess();
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', '');
  // Inject token by fetching manually
  Toast.info('Preparing CSV export…');
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => {
      if (!r.ok) throw new Error('Export failed: ' + r.status);
      return r.blob();
    })
    .then(blob => {
      const objURL = URL.createObjectURL(blob);
      a.href = objURL;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objURL);
      Toast.success('CSV exported successfully');
    })
    .catch(err => Toast.error(err.message));
};

window.downloadBackup = function() {
  if (!State.isSuperAdmin) { Toast.warning('Only superadmin can download backups'); return; }
  const token = Auth.getAccess();
  Toast.info('Preparing database backup…');
  fetch('/api/admin/backup', { headers: { Authorization: `Bearer ${token}` } })
    .then(r => {
      if (!r.ok) throw new Error('Backup failed: ' + r.status);
      const cd = r.headers.get('Content-Disposition') || '';
      const fn = cd.match(/filename="([^"]+)"/)?.[1] || 'fud_portal_backup.db';
      return r.blob().then(blob => ({ blob, fn }));
    })
    .then(({ blob, fn }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fn;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      Toast.success('Database backup downloaded');
    })
    .catch(err => Toast.error(err.message));
};

// ═══════════════════════════════════════════════════════════════════════════
// CONFIRM MODAL HELPER
// ═══════════════════════════════════════════════════════════════════════════
let confirmCallback = null;
function openConfirm(title, message, cb, type = 'danger') {
  confirmCallback = cb;
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').innerHTML = message;
  const okBtn = document.getElementById('btn-confirm-ok');
  const colorMap = {
    danger:  'var(--clr-danger-dark)',
    warning: 'var(--clr-warning)',
    info:    'var(--clr-info)',
  };
  okBtn.style.background = colorMap[type] || colorMap.danger;
  okBtn.style.color = type === 'warning' ? 'var(--bg-900)' : '#fff';
  showModal('modal-confirm');
}
document.getElementById('btn-confirm-ok').addEventListener('click', async () => {
  if (confirmCallback) {
    document.getElementById('btn-confirm-ok').classList.add('btn-loading');
    document.getElementById('btn-confirm-ok').disabled = true;
    try { await confirmCallback(); } finally {
      document.getElementById('btn-confirm-ok').classList.remove('btn-loading');
      document.getElementById('btn-confirm-ok').disabled = false;
    }
    confirmCallback = null;
  }
  hideModal('modal-confirm');
});

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════
function renderPagination(containerId, total, currentPage, limit, onPage) {
  const pages = Math.ceil(total / limit);
  const container = document.getElementById(containerId);
  if (pages <= 1) { container.innerHTML = ''; return; }

  let html = '';
  // Prev
  html += `<button class="btn btn-sm btn-secondary" ${currentPage <= 1 ? 'disabled' : ''} onclick="(${onPage})(${currentPage-1})">
    <i class="fas fa-chevron-left"></i></button>`;

  // Page numbers with ellipsis
  const range = pageRange(currentPage, pages);
  range.forEach(p => {
    if (p === '…') {
      html += `<span class="page-info">…</span>`;
    } else {
      html += `<button class="btn btn-sm ${p === currentPage ? 'btn-primary' : 'btn-secondary'}"
        onclick="(${onPage})(${p})" style="${p === currentPage ? 'width:auto;min-width:36px' : ''}">${p}</button>`;
    }
  });

  // Next
  html += `<button class="btn btn-sm btn-secondary" ${currentPage >= pages ? 'disabled' : ''} onclick="(${onPage})(${currentPage+1})">
    <i class="fas fa-chevron-right"></i></button>`;

  html += `<span class="page-info">${currentPage}/${pages} &nbsp;·&nbsp; ${total} records</span>`;
  container.innerHTML = html;
}

function pageRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const r = [];
  r.push(1);
  if (current > 3) r.push('…');
  for (let i = Math.max(2, current-1); i <= Math.min(total-1, current+1); i++) r.push(i);
  if (current < total - 2) r.push('…');
  r.push(total);
  return r;
}

function loadingRow(cols) {
  return `<tr><td colspan="${cols}" style="text-align:center;padding:2.5rem;color:var(--txt-muted)">
    <i class="fas fa-spinner fa-spin fa-2x"></i></td></tr>`;
}

function actionPill(action) {
  const a = (action || '').toLowerCase();
  let cls = 'other';
  if (a.includes('login'))   cls = 'login';
  else if (a.includes('logout'))  cls = 'logout';
  else if (a.includes('create') || a.includes('register') || a.includes('seed')) cls = 'create';
  else if (a.includes('update') || a.includes('change') || a.includes('force')) cls = 'update';
  else if (a.includes('delete') || a.includes('block')) cls = 'delete';
  else if (a.includes('export') || a.includes('backup') || a.includes('download')) cls = 'export';
  else if (a.includes('unblock') || a.includes('activate')) cls = 'login';
  return `<span class="action-pill ${cls}">${esc(action)}</span>`;
}

function roleColor(role) {
  const map = { superadmin: 'var(--clr-danger-dark)', admin: 'var(--clr-warning)',
    staff: 'var(--clr-info)', student: 'var(--clr-primary-dark)' };
  return map[role] || 'var(--bg-500)';
}

function avgColor(v) {
  if (v == null) return 'var(--txt-400)';
  if (v >= 70) return 'var(--clr-success)';
  if (v >= 40) return 'var(--clr-warning)';
  return 'var(--clr-danger)';
}

window.togglePw = function(id, el) {
  const i = document.getElementById(id);
  const ic = el.querySelector('i');
  i.type = i.type === 'password' ? 'text' : 'password';
  ic.className = i.type === 'text' ? 'fas fa-eye-slash' : 'fas fa-eye';
};

function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// Debounce for search inputs
const _debouncers = {};
window.debounce = function(fn, delay) {
  return function(...args) {
    clearTimeout(_debouncers[fn]);
    _debouncers[fn] = setTimeout(() => fn(...args), delay);
  };
};

// Add mini-avatar style to page
const avatarStyle = document.createElement('style');
avatarStyle.textContent = `.mini-avatar{width:30px;height:30px;border-radius:50%;display:flex;
  align-items:center;justify-content:center;font-weight:700;font-size:.78rem;color:#fff;flex-shrink:0;}`;
document.head.appendChild(avatarStyle);
