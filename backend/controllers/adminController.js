'use strict';
/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  Admin Controller – FUD Portal (Ahmaditech School)           ║
 * ║  Full admin panel: stats, students, admins, logs, backup, CSV ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */
const path     = require('path');
const fs       = require('fs');
const bcrypt   = require('bcryptjs');
const { run, get, all, logActivity } = require('../database/db');
const UserModel    = require('../models/User');
const StudentModel = require('../models/Student');
const AdminModel   = require('../models/Admin');
const R = require('../utils/response');

// ─── Helper ───────────────────────────────────────────────────────────────────
function esc(s) { return String(s ?? '').replace(/"/g, '""'); }

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD STATISTICS
// ═══════════════════════════════════════════════════════════════════════════════
exports.stats = async (req, res, next) => {
  try {
    const [
      totalUsers,   students, admins, activeUsers, verifiedUsers,
      totalTests,   published, drafts, totalResults, passedResults,
      totalMedia,   totalNotifs, unreadNotifs,
      recentLogins, newToday, newThisWeek,
    ] = await Promise.all([
      get('SELECT COUNT(*) as c FROM users'),
      get("SELECT COUNT(*) as c FROM users WHERE role='student'"),
      get("SELECT COUNT(*) as c FROM users WHERE role IN ('admin','superadmin','staff')"),
      get('SELECT COUNT(*) as c FROM users WHERE is_active=1'),
      get('SELECT COUNT(*) as c FROM users WHERE is_verified=1'),
      get('SELECT COUNT(*) as c FROM tests'),
      get('SELECT COUNT(*) as c FROM tests WHERE is_published=1'),
      get('SELECT COUNT(*) as c FROM tests WHERE is_published=0'),
      get('SELECT COUNT(*) as c FROM results'),
      get('SELECT COUNT(*) as c FROM results WHERE passed=1'),
      get('SELECT COUNT(*) as c FROM media'),
      get('SELECT COUNT(*) as c FROM notifications'),
      get('SELECT COUNT(*) as c FROM notifications WHERE is_read=0'),
      get("SELECT COUNT(*) as c FROM users WHERE last_login >= datetime('now','-1 day')"),
      get("SELECT COUNT(*) as c FROM users WHERE date(created_at) = date('now')"),
      get("SELECT COUNT(*) as c FROM users WHERE created_at >= datetime('now','-7 days')"),
    ]);

    // Recent activity (last 20 entries)
    const recentActivity = await all(`
      SELECT al.action, al.ip_address, al.created_at, al.description,
             u.email, u.role
      FROM activity_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC LIMIT 20`);

    // Monthly registration trend (last 6 months)
    const registrationTrend = await all(`
      SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count
      FROM users
      WHERE created_at >= datetime('now', '-6 months')
      GROUP BY month ORDER BY month ASC`);

    // Top departments
    const topDepts = await all(`
      SELECT department, COUNT(*) as count
      FROM students WHERE department IS NOT NULL AND department != ''
      GROUP BY department ORDER BY count DESC LIMIT 5`);

    // Test pass rate per subject
    const testStats = await all(`
      SELECT t.subject, COUNT(r.id) as attempts,
             SUM(CASE WHEN r.passed=1 THEN 1 ELSE 0 END) as passed_count,
             ROUND(AVG(r.percentage),1) as avg_score
      FROM tests t
      LEFT JOIN results r ON r.test_id = t.id
      WHERE t.subject IS NOT NULL
      GROUP BY t.subject
      ORDER BY attempts DESC LIMIT 8`);

    return R.success(res, {
      overview: {
        totalUsers: totalUsers.c,
        students:   students.c,
        admins:     admins.c,
        activeUsers:activeUsers.c,
        verifiedUsers: verifiedUsers.c,
        blockedUsers: totalUsers.c - activeUsers.c,
        newToday:   newToday.c,
        newThisWeek:newThisWeek.c,
        recentLogins: recentLogins.c,
      },
      tests: {
        total: totalTests.c, published: published.c,
        drafts: drafts.c,
        totalResults: totalResults.c,
        passedResults: passedResults.c,
        passRate: totalResults.c > 0
          ? Math.round(passedResults.c / totalResults.c * 100) : 0,
      },
      media:  { total: totalMedia.c },
      notifications: { total: totalNotifs.c, unread: unreadNotifs.c },
      recentActivity,
      registrationTrend,
      topDepts,
      testStats,
    }, 'Admin statistics');
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// STUDENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════
exports.listStudents = async (req, res, next) => {
  try {
    const {
      page = 1, limit = 20, search, department, faculty,
      level, gender, is_active, is_verified,
    } = req.query;

    const offset = (+page - 1) * +limit;
    let where = "WHERE u.role = 'student'";
    const params = [];

    if (search) {
      where += ` AND (u.email LIKE ? OR s.full_name LIKE ? OR s.matric_no LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (department)  { where += ' AND s.department = ?';   params.push(department); }
    if (faculty)     { where += ' AND s.faculty = ?';      params.push(faculty); }
    if (level)       { where += ' AND s.level = ?';        params.push(level); }
    if (gender)      { where += ' AND s.gender = ?';       params.push(gender); }
    if (is_active !== undefined && is_active !== '')
                     { where += ' AND u.is_active = ?';    params.push(is_active === '1' ? 1 : 0); }
    if (is_verified !== undefined && is_verified !== '')
                     { where += ' AND u.is_verified = ?';  params.push(is_verified === '1' ? 1 : 0); }

    const rows = await all(`
      SELECT
        u.id, u.email, u.role, u.is_active, u.is_verified, u.force_password_change,
        u.last_login, u.login_count, u.failed_attempts, u.created_at,
        s.full_name, s.matric_no, s.department, s.faculty, s.level, s.gender,
        s.phone, s.id as student_id,
        (SELECT COUNT(*) FROM results r WHERE r.student_id = s.id) as tests_taken,
        (SELECT ROUND(AVG(r.percentage),1) FROM results r WHERE r.student_id = s.id) as avg_score
      FROM users u
      LEFT JOIN students s ON s.user_id = u.id
      ${where}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?`,
      [...params, +limit, offset]
    );
    const countRow = await get(
      `SELECT COUNT(*) as c FROM users u LEFT JOIN students s ON s.user_id = u.id ${where}`,
      params
    );

    return R.paginated(res, {
      rows, total: countRow.c, page: +page, limit: +limit,
    }, 'Students fetched');
  } catch (err) { next(err); }
};

exports.createStudent = async (req, res, next) => {
  try {
    const {
      email, password, full_name, matric_no,
      department, faculty, level, gender, phone,
    } = req.body;

    if (!email || !password || !full_name || !matric_no) {
      return R.error(res, 'email, password, full_name, matric_no are required', 400);
    }
    if (await UserModel.emailExists(email)) return R.error(res, 'Email already registered', 409);

    const existing = await get('SELECT 1 FROM students WHERE matric_no = ?', [matric_no]);
    if (existing) return R.error(res, 'Matric number already registered', 409);

    const hash = await bcrypt.hash(password, 12);
    const userId = await run(
      `INSERT INTO users (email, password_hash, role, is_active, is_verified)
       VALUES (?, ?, 'student', 1, 1)`,
      [email.toLowerCase().trim(), hash]
    );

    await run(
      `INSERT INTO students (user_id, full_name, matric_no, department, faculty, level, gender, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId.lastID, full_name, matric_no, department, faculty, level, gender, phone || null]
    );

    await logActivity({ userId: req.user.id, action: 'CREATE_STUDENT', entityType: 'user',
      entityId: userId.lastID, description: `Created student: ${email}`, ipAddress: req.ip });

    const user = await UserModel.findWithProfile(userId.lastID);
    return R.success(res, user, 'Student created successfully', 201);
  } catch (err) { next(err); }
};

exports.updateStudent = async (req, res, next) => {
  try {
    const id = +req.params.id;
    const user = await UserModel.findById(id);
    if (!user || user.role !== 'student') return R.notFound(res, 'Student not found');

    const {
      full_name, matric_no, department, faculty, level, gender, phone, email,
    } = req.body;

    if (email && email !== user.email) {
      if (await UserModel.emailExists(email)) return R.error(res, 'Email already in use', 409);
      await run('UPDATE users SET email = ? WHERE id = ?', [email.toLowerCase().trim(), id]);
    }

    const student = await get('SELECT * FROM students WHERE user_id = ?', [id]);
    if (student) {
      await run(`
        UPDATE students SET
          full_name = COALESCE(?, full_name),
          matric_no = COALESCE(?, matric_no),
          department= COALESCE(?, department),
          faculty   = COALESCE(?, faculty),
          level     = COALESCE(?, level),
          gender    = COALESCE(?, gender),
          phone     = COALESCE(?, phone),
          updated_at= CURRENT_TIMESTAMP
        WHERE user_id = ?`,
        [full_name, matric_no, department, faculty, level, gender, phone, id]
      );
    }

    await logActivity({ userId: req.user.id, action: 'UPDATE_STUDENT', entityType: 'user',
      entityId: id, description: `Updated student: ${user.email}`, ipAddress: req.ip });

    const updated = await UserModel.findWithProfile(id);
    return R.success(res, updated, 'Student updated');
  } catch (err) { next(err); }
};

exports.deleteStudent = async (req, res, next) => {
  try {
    const id = +req.params.id;
    const user = await UserModel.findById(id);
    if (!user || user.role !== 'student') return R.notFound(res, 'Student not found');
    if (req.user.role !== 'superadmin') return R.forbidden(res, 'Only superadmin can delete students');

    await logActivity({ userId: req.user.id, action: 'DELETE_STUDENT', entityType: 'user',
      entityId: id, description: `Deleted student: ${user.email}`, ipAddress: req.ip });
    await UserModel.delete(id);
    return R.success(res, {}, 'Student deleted');
  } catch (err) { next(err); }
};

exports.blockStudent = async (req, res, next) => {
  try {
    const id = +req.params.id;
    const user = await UserModel.findById(id);
    if (!user || user.role !== 'student') return R.notFound(res, 'Student not found');
    await run('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
    await logActivity({ userId: req.user.id, action: 'BLOCK_STUDENT', entityType: 'user',
      entityId: id, description: `Blocked student: ${user.email}`, ipAddress: req.ip });
    return R.success(res, { is_active: false }, 'Student blocked');
  } catch (err) { next(err); }
};

exports.unblockStudent = async (req, res, next) => {
  try {
    const id = +req.params.id;
    const user = await UserModel.findById(id);
    if (!user || user.role !== 'student') return R.notFound(res, 'Student not found');
    await run('UPDATE users SET is_active = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?', [id]);
    await logActivity({ userId: req.user.id, action: 'UNBLOCK_STUDENT', entityType: 'user',
      entityId: id, description: `Unblocked student: ${user.email}`, ipAddress: req.ip });
    return R.success(res, { is_active: true }, 'Student unblocked');
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════
exports.listAdmins = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, role } = req.query;
    const offset = (+page - 1) * +limit;
    let where = "WHERE u.role IN ('admin','superadmin','staff')";
    const params = [];

    if (search) {
      where += ' AND (u.email LIKE ? OR a.full_name LIKE ? OR a.staff_id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (role && ['admin','superadmin','staff'].includes(role)) {
      where += ' AND u.role = ?'; params.push(role);
    }

    const rows = await all(`
      SELECT u.id, u.email, u.role, u.is_active, u.is_verified, u.last_login,
             u.login_count, u.created_at, u.force_password_change,
             a.full_name, a.staff_id, a.department, a.id as admin_id
      FROM users u
      LEFT JOIN admins a ON a.user_id = u.id
      ${where}
      ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, +limit, offset]
    );
    const countRow = await get(
      `SELECT COUNT(*) as c FROM users u LEFT JOIN admins a ON a.user_id = u.id ${where}`,
      params
    );

    return R.paginated(res, {
      rows: rows.map(r => ({
        ...r,
        profile: { full_name: r.full_name, staff_id: r.staff_id, department: r.department },
      })),
      total: countRow.c, page: +page, limit: +limit,
    }, 'Admins fetched');
  } catch (err) { next(err); }
};

exports.createAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== 'superadmin') return R.forbidden(res, 'Only superadmin can create admins');
    const { email, password, full_name, staff_id, role = 'admin', department } = req.body;
    if (!email || !password || !full_name || !staff_id) {
      return R.error(res, 'email, password, full_name, staff_id are required', 400);
    }
    if (!['admin','staff'].includes(role)) return R.error(res, 'Role must be admin or staff', 400);
    if (await UserModel.emailExists(email)) return R.error(res, 'Email already registered', 409);

    const existing = await get('SELECT 1 FROM admins WHERE staff_id = ?', [staff_id]);
    if (existing) return R.error(res, 'Staff ID already in use', 409);

    const hash = await bcrypt.hash(password, 12);
    const userId = await run(
      `INSERT INTO users (email, password_hash, role, is_active, is_verified)
       VALUES (?, ?, ?, 1, 1)`,
      [email.toLowerCase().trim(), hash, role]
    );
    await run(
      `INSERT INTO admins (user_id, full_name, staff_id, department)
       VALUES (?, ?, ?, ?)`,
      [userId.lastID, full_name, staff_id, department || null]
    );

    await logActivity({ userId: req.user.id, action: 'CREATE_ADMIN', entityType: 'user',
      entityId: userId.lastID, description: `Created admin: ${email} (${role})`, ipAddress: req.ip });

    const user = await UserModel.findWithProfile(userId.lastID);
    return R.success(res, user, 'Admin created successfully', 201);
  } catch (err) { next(err); }
};

exports.updateAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== 'superadmin') return R.forbidden(res, 'Only superadmin can edit admins');
    const id = +req.params.id;
    const user = await UserModel.findById(id);
    if (!user || !['admin','staff','superadmin'].includes(user.role)) return R.notFound(res, 'Admin not found');
    if (user.role === 'superadmin' && id !== req.user.id) return R.forbidden(res, 'Cannot edit other superadmins');

    const { full_name, staff_id, department, role, email, is_active } = req.body;
    if (email && email !== user.email) {
      if (await UserModel.emailExists(email)) return R.error(res, 'Email already in use', 409);
      await run('UPDATE users SET email = ? WHERE id = ?', [email.toLowerCase().trim(), id]);
    }
    if (role && ['admin','staff'].includes(role) && user.role !== 'superadmin') {
      await run('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    }
    if (is_active !== undefined) {
      await run('UPDATE users SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, id]);
    }
    await run(`
      UPDATE admins SET
        full_name  = COALESCE(?, full_name),
        staff_id   = COALESCE(?, staff_id),
        department = COALESCE(?, department),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?`,
      [full_name, staff_id, department, id]
    );

    await logActivity({ userId: req.user.id, action: 'UPDATE_ADMIN', entityType: 'user',
      entityId: id, description: `Updated admin: ${user.email}`, ipAddress: req.ip });

    const updated = await UserModel.findWithProfile(id);
    return R.success(res, updated, 'Admin updated');
  } catch (err) { next(err); }
};

exports.deleteAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== 'superadmin') return R.forbidden(res, 'Only superadmin can delete admins');
    const id = +req.params.id;
    const user = await UserModel.findById(id);
    if (!user || !['admin','staff'].includes(user.role)) return R.notFound(res, 'Admin not found');
    if (id === req.user.id) return R.error(res, 'Cannot delete your own account', 400);

    await logActivity({ userId: req.user.id, action: 'DELETE_ADMIN', entityType: 'user',
      entityId: id, description: `Deleted admin: ${user.email}`, ipAddress: req.ip });
    await UserModel.delete(id);
    return R.success(res, {}, 'Admin deleted');
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY LOGS
// ═══════════════════════════════════════════════════════════════════════════════
exports.activityLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 30, search, action, user_id, from, to } = req.query;
    const offset = (+page - 1) * +limit;
    let where = 'WHERE 1=1';
    const params = [];

    if (user_id) { where += ' AND al.user_id = ?';       params.push(+user_id); }
    if (action)  { where += ' AND al.action LIKE ?';      params.push(`%${action}%`); }
    if (search)  { where += ' AND (u.email LIKE ? OR al.action LIKE ? OR al.description LIKE ?)';
                   params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (from)    { where += ' AND al.created_at >= ?';    params.push(from); }
    if (to)      { where += ' AND al.created_at <= ?';    params.push(to + ' 23:59:59'); }

    const rows = await all(`
      SELECT al.id, al.action, al.entity_type, al.entity_id,
             al.ip_address, al.user_agent, al.description, al.created_at,
             u.email, u.role,
             COALESCE(s.full_name, a.full_name) as full_name
      FROM activity_logs al
      LEFT JOIN users    u ON u.id = al.user_id
      LEFT JOIN students s ON s.user_id = al.user_id
      LEFT JOIN admins   a ON a.user_id = al.user_id
      ${where}
      ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
      [...params, +limit, offset]
    );
    const countRow = await get(
      `SELECT COUNT(*) as c FROM activity_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${where}`, params
    );

    // Distinct actions for filter dropdown
    const actions = await all(`SELECT DISTINCT action FROM activity_logs ORDER BY action`);

    return R.paginated(res, {
      rows, total: countRow.c, page: +page, limit: +limit,
      meta: { actions: actions.map(a => a.action) },
    }, 'Activity logs fetched');
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ROLE PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════════
const DEFAULT_PERMISSIONS = {
  student:    ['view_tests', 'take_tests', 'view_own_results', 'view_notifications', 'view_media'],
  staff:      ['view_tests', 'create_tests', 'edit_tests', 'view_students', 'view_results',
                'view_notifications', 'send_notifications', 'view_media', 'upload_media'],
  admin:      ['view_tests', 'create_tests', 'edit_tests', 'delete_tests', 'publish_tests',
                'view_students', 'edit_students', 'block_students', 'view_results',
                'view_notifications', 'send_notifications', 'broadcast', 'view_media', 'upload_media',
                'delete_media', 'view_activity_logs'],
  superadmin: ['*'], // all permissions
};

const PERMISSIONS_FILE = path.join(__dirname, '../database/permissions.json');

function loadPermissions() {
  try {
    if (fs.existsSync(PERMISSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(PERMISSIONS_FILE, 'utf8'));
    }
  } catch {}
  return DEFAULT_PERMISSIONS;
}

function savePermissions(perms) {
  fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(perms, null, 2));
}

exports.getPermissions = async (req, res, next) => {
  try {
    const ALL_PERMISSIONS = [
      { key: 'view_tests',          label: 'View Tests',             group: 'Tests' },
      { key: 'create_tests',        label: 'Create Tests',           group: 'Tests' },
      { key: 'edit_tests',          label: 'Edit Tests',             group: 'Tests' },
      { key: 'delete_tests',        label: 'Delete Tests',           group: 'Tests' },
      { key: 'publish_tests',       label: 'Publish/Unpublish Tests',group: 'Tests' },
      { key: 'view_students',       label: 'View Students',          group: 'Students' },
      { key: 'create_students',     label: 'Create Students',        group: 'Students' },
      { key: 'edit_students',       label: 'Edit Students',          group: 'Students' },
      { key: 'delete_students',     label: 'Delete Students',        group: 'Students' },
      { key: 'block_students',      label: 'Block/Unblock Students', group: 'Students' },
      { key: 'take_tests',          label: 'Take Tests',             group: 'Exams' },
      { key: 'view_own_results',    label: 'View Own Results',       group: 'Exams' },
      { key: 'view_results',        label: 'View All Results',       group: 'Exams' },
      { key: 'view_notifications',  label: 'View Notifications',     group: 'Notifications' },
      { key: 'send_notifications',  label: 'Send Notifications',     group: 'Notifications' },
      { key: 'broadcast',           label: 'Broadcast to All',       group: 'Notifications' },
      { key: 'view_media',          label: 'View Media',             group: 'Media' },
      { key: 'upload_media',        label: 'Upload Media',           group: 'Media' },
      { key: 'delete_media',        label: 'Delete Media',           group: 'Media' },
      { key: 'view_activity_logs',  label: 'View Activity Logs',     group: 'Admin' },
      { key: 'manage_admins',       label: 'Manage Admins',          group: 'Admin' },
      { key: 'export_data',         label: 'Export Data (CSV)',      group: 'Admin' },
      { key: 'download_backup',     label: 'Download DB Backup',     group: 'Admin' },
    ];

    const current = loadPermissions();
    return R.success(res, { permissions: ALL_PERMISSIONS, roles: current }, 'Permissions fetched');
  } catch (err) { next(err); }
};

exports.updatePermissions = async (req, res, next) => {
  try {
    if (req.user.role !== 'superadmin') return R.forbidden(res, 'Only superadmin can update permissions');
    const { roles } = req.body;
    if (!roles || typeof roles !== 'object' || Array.isArray(roles))
      return R.error(res, 'roles must be a plain object', 400);

    // SECURITY (VULN-10): Whitelist allowed role names and permission strings
    const VALID_ROLES = new Set(['student', 'staff', 'admin', 'superadmin']);
    const VALID_PERM  = /^[a-z_]{2,40}$/;
    for (const [roleName, perms] of Object.entries(roles)) {
      if (!VALID_ROLES.has(roleName)) return R.error(res, `Invalid role: ${roleName}`, 400);
      if (!Array.isArray(perms)) return R.error(res, `Permissions for ${roleName} must be an array`, 400);
      if (perms.some(p => p !== '*' && !VALID_PERM.test(p)))
        return R.error(res, 'Permission keys must be lowercase letters and underscores only', 400);
    }

    const current = loadPermissions();
    const updated  = { ...current, ...roles, superadmin: ['*'] };
    savePermissions(updated);

    await logActivity({ userId: req.user.id, action: 'UPDATE_PERMISSIONS',
      description: 'Updated role permissions', ipAddress: req.ip });

    return R.success(res, updated, 'Permissions updated');
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT CSV
// ═══════════════════════════════════════════════════════════════════════════════
exports.exportStudentsCSV = async (req, res, next) => {
  try {
    const rows = await all(`
      SELECT u.id, u.email, u.is_active, u.is_verified, u.last_login, u.login_count, u.created_at,
             s.id as student_id, s.full_name, s.matric_no, s.department, s.faculty, s.level, s.gender, s.phone,
             (SELECT COUNT(*) FROM results r WHERE r.student_id=s.id) as tests_taken,
             (SELECT ROUND(AVG(r.percentage),1) FROM results r WHERE r.student_id=s.id) as avg_score
      FROM users u
      LEFT JOIN students s ON s.user_id = u.id
      WHERE u.role = 'student'
      ORDER BY u.created_at DESC`);

    const headers = [
      'ID','Email','Full Name','Matric No','Department','Faculty','Level','Gender','Phone',
      'Active','Verified','Tests Taken','Avg Score (%)','Last Login','Registered',
    ];
    const csvRows = rows.map(r => [
      r.id, esc(r.email), esc(r.full_name), esc(r.matric_no),
      esc(r.department), esc(r.faculty), esc(r.level), esc(r.gender), esc(r.phone),
      r.is_active ? 'Yes' : 'No', r.is_verified ? 'Yes' : 'No',
      r.tests_taken, r.avg_score ?? '',
      r.last_login || '', r.created_at || '',
    ].map(v => `"${v}"`).join(','));

    const csv = [headers.join(','), ...csvRows].join('\r\n');
    const filename = `fud_students_${new Date().toISOString().slice(0,10)}.csv`;

    await logActivity({ userId: req.user.id, action: 'EXPORT_CSV',
      description: `Exported ${rows.length} students to CSV`, ipAddress: req.ip });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Total-Records', rows.length);
    return res.send('\uFEFF' + csv); // BOM for Excel
  } catch (err) { next(err); }
};

exports.exportAdminsCSV = async (req, res, next) => {
  try {
    const rows = await all(`
      SELECT u.id, u.email, u.role, u.is_active, u.is_verified, u.last_login, u.login_count, u.created_at,
             a.full_name, a.staff_id, a.department
      FROM users u
      LEFT JOIN admins a ON a.user_id = u.id
      WHERE u.role IN ('admin','superadmin','staff')
      ORDER BY u.created_at DESC`);

    const headers = ['ID','Email','Role','Full Name','Staff ID','Department','Active','Verified','Last Login','Registered'];
    const csvRows = rows.map(r => [
      r.id, esc(r.email), esc(r.role), esc(r.full_name), esc(r.staff_id), esc(r.department),
      r.is_active ? 'Yes' : 'No', r.is_verified ? 'Yes' : 'No',
      r.last_login || '', r.created_at || '',
    ].map(v => `"${v}"`).join(','));

    const csv = [headers.join(','), ...csvRows].join('\r\n');
    const filename = `fud_admins_${new Date().toISOString().slice(0,10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send('\uFEFF' + csv);
  } catch (err) { next(err); }
};

exports.exportActivityCSV = async (req, res, next) => {
  try {
    let { from, to } = req.query;

    // SECURITY (VULN-09): Validate date params to prevent injection
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (from && !ISO_DATE.test(from)) return R.error(res, 'Invalid "from" date format (YYYY-MM-DD)', 400);
    if (to   && !ISO_DATE.test(to))   return R.error(res, 'Invalid "to" date format (YYYY-MM-DD)', 400);

    let where = 'WHERE 1=1';
    const params = [];
    if (from) { where += ' AND al.created_at >= ?'; params.push(from); }
    if (to)   { where += ' AND al.created_at <= ?'; params.push(to + ' 23:59:59'); }

    const rows = await all(`
      SELECT al.id, al.action, al.entity_type, al.description, al.ip_address, al.created_at,
             u.email, u.role, COALESCE(s.full_name, a.full_name) as full_name
      FROM activity_logs al
      LEFT JOIN users    u ON u.id = al.user_id
      LEFT JOIN students s ON s.user_id = al.user_id
      LEFT JOIN admins   a ON a.user_id = al.user_id
      ${where}
      ORDER BY al.created_at DESC LIMIT 10000`, params
    );

    const headers = ['ID','Action','User Email','User Name','Role','Entity Type','Description','IP','Timestamp'];
    const csvRows = rows.map(r => [
      r.id, esc(r.action), esc(r.email), esc(r.full_name), esc(r.role),
      esc(r.entity_type), esc(r.description), esc(r.ip_address), r.created_at,
    ].map(v => `"${v}"`).join(','));

    const filename = `fud_activity_${new Date().toISOString().slice(0,10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send('\uFEFF' + [headers.join(','), ...csvRows].join('\r\n'));
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// DATABASE BACKUP
// ═══════════════════════════════════════════════════════════════════════════════
exports.downloadBackup = async (req, res, next) => {
  try {
    if (req.user.role !== 'superadmin') return R.forbidden(res, 'Only superadmin can download backups');

    const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || './backend/database/fud_portal.db');
    if (!fs.existsSync(dbPath)) return R.notFound(res, 'Database file not found');

    const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    const filename = `fud_portal_backup_${ts}.zip`;

    await logActivity({ userId: req.user.id, action: 'DOWNLOAD_BACKUP',
      description: 'Downloaded database backup', ipAddress: req.ip });

    const archiver = require('archiver');
    const tempZip = path.join(process.cwd(), 'temp_backup.zip');
    const output = require('fs').createWriteStream(tempZip);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', archive.pointer());
      const readStream = require('fs').createReadStream(tempZip);
      readStream.on('end', () => require('fs').unlinkSync(tempZip)); // Cleanup
      readStream.pipe(res);
    });

    archive.on('error', (err) => {
      if (!res.headersSent) {
        return res.status(500).json({ success: false, message: 'Archive error: ' + err.message, stack: err.stack });
      }
    });

    archive.pipe(output);
    archive.file(dbPath, { name: 'fud_portal.db' });
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    if (require('fs').existsSync(uploadDir)) {
      archive.directory(uploadDir, 'uploads');
    }
    return archive.finalize();
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message, stack: err.stack });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// FORCE PASSWORD CHANGE (bulk for admins)
// ═══════════════════════════════════════════════════════════════════════════════
exports.forcePasswordChange = async (req, res, next) => {
  try {
    const id = +req.params.id;
    const user = await UserModel.findById(id);
    if (!user) return R.notFound(res, 'User not found');
    if (user.role === 'superadmin') return R.forbidden(res, 'Cannot force superadmin');
    await run('UPDATE users SET force_password_change = 1 WHERE id = ?', [id]);
    await logActivity({ userId: req.user.id, action: 'FORCE_PASSWORD_CHANGE', entityType: 'user',
      entityId: id, description: `Force password change for: ${user.email}`, ipAddress: req.ip });
    return R.success(res, {}, 'Force password change flag set');
  } catch (err) { next(err); }
};
