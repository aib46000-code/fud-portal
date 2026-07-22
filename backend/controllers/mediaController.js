'use strict';
/**
 * ╔═══════════════════════════════════════════════════════╗
 * ║  Media Controller – FUD Portal                        ║
 * ║  Upload · List · Get · Delete · Stats · Toggle Public ║
 * ╚═══════════════════════════════════════════════════════╝
 */
const path    = require('path');
const fs      = require('fs');
const { v4: uuidv4 } = require('uuid');
const MediaModel = require('../models/Media');
const { logActivity } = require('../database/db');
const R = require('../utils/response');
const { MIME_TO_CATEGORY, enforceSizeLimit } = require('../middleware/uploadMiddleware');

// ── POST /api/media/upload ────────────────────────────────────────
exports.upload = async (req, res, next) => {
  try {
    if (!req.file) return R.error(res, 'No file uploaded', 400);

    const { file } = req;

    // Enforce per-type size limit (after multer has saved the file)
    const sizeErr = enforceSizeLimit(file);
    if (sizeErr) return R.error(res, sizeErr.message, 413);

    const baseUrl  = `${req.protocol}://${req.get('host')}`;
    const relPath  = file.path.replace(/\\/g, '/').replace(/.*\/uploads/, '/uploads');
    const url      = `${baseUrl}${relPath}`;
    const uuid     = uuidv4();
    const category = MIME_TO_CATEGORY[file.mimetype.toLowerCase()] || req.body.category || 'general';
    const is_public = req.body.is_public === '1' || req.body.is_public === 'true' ? 1 : 0;

    const mediaId = await MediaModel.create({
      uuid,
      original_name: file.originalname,
      stored_name:   file.filename,
      mime_type:     file.mimetype,
      size_bytes:    file.size,
      file_path:     file.path,
      url,
      category,
      uploaded_by:   req.user.id,
      is_public,
    });

    await logActivity({
      userId: req.user.id, action: 'UPLOAD_FILE', entityType: 'media',
      entityId: mediaId,
      description: `Uploaded: ${file.originalname} (${category}, ${formatBytes(file.size)})`,
      ipAddress: req.ip,
    });

    const media = await MediaModel.findById(mediaId);
    return R.created(res, media, 'File uploaded successfully');
  } catch (err) { next(err); }
};

// ── GET /api/media ────────────────────────────────────────────────
exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, category, search, is_public, mime_prefix } = req.query;
    const isAdmin = ['admin','superadmin','staff'].includes(req.user.role);

    // Students can only see public files OR their own
    const opts = {
      page: +page, limit: Math.min(+limit, 200),
      category: category || null,
      search:   search   || null,
      mime_prefix: mime_prefix || null,
    };

    if (!isAdmin) {
      // Students: public files only (library view)
      opts.is_public = 1;
    } else if (is_public !== undefined) {
      opts.is_public = +is_public;
    }

    const result = await MediaModel.list(opts);
    return R.paginated(res, result, 'Files fetched');
  } catch (err) { next(err); }
};

// ── GET /api/media/stats ──────────────────────────────────────────
exports.stats = async (req, res, next) => {
  try {
    const isAdmin = ['admin','superadmin','staff'].includes(req.user.role);
    const stats   = await MediaModel.getStats(isAdmin ? null : req.user.id);
    return R.success(res, stats, 'Media stats');
  } catch (err) { next(err); }
};

// ── GET /api/media/:id ────────────────────────────────────────────
exports.getOne = async (req, res, next) => {
  try {
    const media = await MediaModel.findById(+req.params.id);
    if (!media) return R.notFound(res, 'File not found');

    const isAdmin = ['admin','superadmin','staff'].includes(req.user.role);
    if (!isAdmin && !media.is_public && media.uploaded_by !== req.user.id)
      return R.forbidden(res, 'Access denied');

    return R.success(res, media);
  } catch (err) { next(err); }
};

// ── PATCH /api/media/:id/visibility ──────────────────────────────
exports.toggleVisibility = async (req, res, next) => {
  try {
    const media = await MediaModel.findById(+req.params.id);
    if (!media) return R.notFound(res, 'File not found');

    const isAdmin = ['admin','superadmin','staff'].includes(req.user.role);
    if (!isAdmin && media.uploaded_by !== req.user.id)
      return R.forbidden(res, 'Cannot modify this file');

    const newState = req.body.is_public !== undefined ? (req.body.is_public ? 1 : 0) : (media.is_public ? 0 : 1);
    await MediaModel.setPublic(+req.params.id, newState);

    await logActivity({
      userId: req.user.id, action: 'UPDATE_MEDIA', entityType: 'media',
      entityId: +req.params.id,
      description: `Set ${media.original_name} to ${newState ? 'public' : 'private'}`,
      ipAddress: req.ip,
    });

    const updated = await MediaModel.findById(+req.params.id);
    return R.success(res, updated, `File is now ${newState ? 'public' : 'private'}`);
  } catch (err) { next(err); }
};

// ── DELETE /api/media/:id ─────────────────────────────────────────
exports.delete = async (req, res, next) => {
  try {
    const media = await MediaModel.findById(+req.params.id);
    if (!media) return R.notFound(res, 'File not found');

    const isAdmin = ['admin','superadmin','staff'].includes(req.user.role);
    if (!isAdmin && media.uploaded_by !== req.user.id)
      return R.forbidden(res, 'You cannot delete this file');

    // Remove from disk
    if (media.file_path && fs.existsSync(media.file_path)) {
      try { fs.unlinkSync(media.file_path); } catch {}
    }

    await MediaModel.delete(+req.params.id);
    await logActivity({
      userId: req.user.id, action: 'DELETE_FILE', entityType: 'media',
      entityId: +req.params.id,
      description: `Deleted: ${media.original_name}`, ipAddress: req.ip,
    });

    return R.success(res, {}, 'File deleted successfully');
  } catch (err) { next(err); }
};

// ── DELETE /api/media/bulk ────────────────────────────────────────
exports.bulkDelete = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return R.error(res, 'ids[] required', 400);
    // SECURITY (VULN-14): Validate all IDs are positive integers
    if (ids.length > 100) return R.error(res, 'Maximum 100 files per bulk delete', 400);
    const validIds = ids.map(id => parseInt(id, 10)).filter(id => Number.isInteger(id) && id > 0);
    if (validIds.length !== ids.length) return R.error(res, 'All IDs must be valid positive integers', 400);

    const isAdmin = ['admin','superadmin','staff'].includes(req.user.role);
    let deleted = 0;
    const errors = [];

    for (const id of validIds) {
      const media = await MediaModel.findById(+id);
      if (!media) continue;
      if (!isAdmin && media.uploaded_by !== req.user.id) { errors.push(id); continue; }
      if (media.file_path && fs.existsSync(media.file_path)) {
        try { fs.unlinkSync(media.file_path); } catch {}
      }
      await MediaModel.delete(+id);
      deleted++;
    }

    await logActivity({
      userId: req.user.id, action: 'BULK_DELETE_FILES', entityType: 'media',
      description: `Bulk deleted ${deleted} files`, ipAddress: req.ip,
    });

    return R.success(res, { deleted, skipped: errors.length }, `${deleted} file(s) deleted`);
  } catch (err) { next(err); }
};

// ── Helpers ───────────────────────────────────────────────────────
function formatBytes(b) {
  if (!b) return '0 B';
  const k = 1024;
  const sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
