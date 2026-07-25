'use strict';
/**
 * Upload Middleware – FUD Portal
 * Multer: Images, Videos, Audio, PDF, ZIP, Documents
 * Per-type size limits + strict MIME validation
 */
const path   = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Allowed MIME types & size limits per category ──────────────────
const TYPES = {
  image: {
    // SECURITY: SVG removed — can contain embedded XSS/JavaScript payloads
    mimes: ['image/jpeg','image/png','image/webp','image/gif','image/bmp','image/tiff'],
    maxBytes: 15 * 1024 * 1024,   // 15 MB
    exts: ['.jpg','.jpeg','.png','.webp','.gif','.bmp','.tiff','.tif'],
  },
  video: {
    mimes: ['video/mp4','video/webm','video/ogg','video/quicktime','video/x-msvideo','video/x-ms-wmv','video/mpeg'],
    maxBytes: 200 * 1024 * 1024,  // 200 MB
    exts: ['.mp4','.webm','.ogv','.mov','.avi','.wmv','.mpeg','.mpg'],
  },
  audio: {
    mimes: ['audio/mpeg','audio/ogg','audio/wav','audio/mp4','audio/aac','audio/flac','audio/x-wav','audio/webm'],
    maxBytes: 50 * 1024 * 1024,   // 50 MB
    exts: ['.mp3','.ogg','.wav','.m4a','.aac','.flac','.weba'],
  },
  document: {
    mimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain','text/csv',
    ],
    maxBytes: 50 * 1024 * 1024,   // 50 MB
    exts: ['.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.txt','.csv'],
  },
  archive: {
    mimes: [
      'application/zip',
      'application/x-zip-compressed',
      'application/x-tar',
      'application/gzip',
      // SECURITY: RAR/7z removed — less common, harder to validate safely
    ],
    maxBytes: 50 * 1024 * 1024,   // 50 MB (reduced from 100MB)
    exts: ['.zip','.tar','.gz'],
  },
};

// Build flat lookup maps
const MIME_TO_CATEGORY = {};
const ALL_ALLOWED_MIMES = new Set();
const MAX_SINGLE_FILE   = 200 * 1024 * 1024; // hard cap 200 MB

for (const [cat, cfg] of Object.entries(TYPES)) {
  for (const m of cfg.mimes) {
    MIME_TO_CATEGORY[m] = cat;
    ALL_ALLOWED_MIMES.add(m);
  }
}

// ── Disk storage: date-subfolder + UUID filename ───────────────────
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const today = new Date().toISOString().slice(0, 10);
    const dir   = path.join(UPLOAD_DIR, today);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext  = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

// ── File filter: MIME type + extension double-check ────────────────
const fileFilter = (req, file, cb) => {
  const mime = file.mimetype.toLowerCase();
  const ext  = path.extname(file.originalname).toLowerCase();

  if (!ALL_ALLOWED_MIMES.has(mime)) {
    return cb(Object.assign(
      new Error(`File type "${mime}" is not allowed. Allowed: images, videos, audio, PDF, documents, ZIP.`),
      { code: 'INVALID_TYPE' }
    ), false);
  }

  // Ensure extension matches the declared category
  const cat = MIME_TO_CATEGORY[mime];
  if (cat && !TYPES[cat].exts.includes(ext)) {
    return cb(Object.assign(
      new Error(`File extension "${ext}" does not match type "${mime}"`),
      { code: 'INVALID_EXT' }
    ), false);
  }

  cb(null, true);
};

// ── Main multer instance ──────────────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_SINGLE_FILE,
    files:    1,    // SECURITY: max 1 file per request
    fields:   10,   // limit non-file fields too
  },
});

// ── Per-type size enforcement (called in controller after upload) ──
function enforceSizeLimit(file) {
  const cat  = MIME_TO_CATEGORY[file.mimetype.toLowerCase()];
  const maxB = TYPES[cat]?.maxBytes || (10 * 1024 * 1024);
  if (file.size > maxB) {
    // Delete the already-saved file
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    const mb = (maxB / 1024 / 1024).toFixed(0);
    const err = new Error(`File too large. Maximum size for ${cat || 'this type'} is ${mb} MB.`);
    err.code = 'FILE_TOO_LARGE';
    return err;
  }
  return null;
}

// ── Image-only uploader (for avatars etc.) ────────────────────────
const uploadImage = multer({
  storage,
  limits: { fileSize: TYPES.image.maxBytes },
  fileFilter(req, file, cb) {
    if (TYPES.image.mimes.includes(file.mimetype.toLowerCase())) cb(null, true);
    else cb(new Error('Only image files are allowed'), false);
  },
});

module.exports = { upload, uploadImage, UPLOAD_DIR, MIME_TO_CATEGORY, enforceSizeLimit, TYPES };
