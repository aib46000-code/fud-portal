'use strict';
/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║         FUD Portal – Ahmaditech School                        ║
 * ║         server.js – Express Application Entry Point           ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const fs         = require('fs');
const compression = require('compression');

// ─── Internal Modules ─────────────────────────────────────────────────────────
const logger                 = require('./utils/logger');
const { initialize,
        purgeExpiredTokens,
        get: dbGet } = require('./database/db');
const errorHandler           = require('./middleware/errorHandler');
const { apiLimiter }         = require('./middleware/rateLimiter');
const requirePasswordChange  = require('./middleware/requirePasswordChange');

// ─── Route Imports ────────────────────────────────────────────────────────────
const authRoutes         = require('./routes/authRoutes');
const userRoutes         = require('./routes/userRoutes');
const testRoutes         = require('./routes/testRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const mediaRoutes        = require('./routes/mediaRoutes');
const adminRoutes        = require('./routes/adminRoutes');
const emailRoutes        = require('./routes/emailRoutes');
const subjectRoutes      = require('./routes/subjectRoutes');

// ─── Upload & Log Dirs ────────────────────────────────────────────────────────
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
[UPLOAD_DIR, LOG_DIR].forEach(d => { 
  try {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); 
  } catch (err) {
    console.error(`[Diagnostics] Failed to create directory ${d}:`, err.message);
  }
});

// ─── Express App ──────────────────────────────────────────────────────────────
const app  = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// ─── Compression (gzip + brotli fallback) ────────────────────────────────────
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    // Don't compress already-compressed uploads
    if (req.path.startsWith('/uploads/')) return false;
    return compression.filter(req, res);
  },
}));

// ─── Security: Helmet ─────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'same-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   [
        "'self'", "'unsafe-inline'",
        'https://fonts.googleapis.com',
        'https://cdnjs.cloudflare.com',
        'https://cdn.jsdelivr.net',     // Chart.js
      ],
      scriptSrcAttr: ["'unsafe-inline'"],

      styleSrc:    [
        "'self'", "'unsafe-inline'",
        'https://fonts.googleapis.com',
        'https://cdnjs.cloudflare.com',
        'https://cdn.jsdelivr.net',
      ],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
      imgSrc:      ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc:  ["'self'", 'https://api.ethereal.email'],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
    },
  },
  hsts: {
    maxAge:            31536000,
    includeSubDomains: true,
    preload:           true,
  },
}));

// ─── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5000',
  'http://localhost:3000',
  'http://127.0.0.1:5000',
  // Legacy Railway deployments
  'https://skillful-happiness-production-ba1e.up.railway.app',
  'https://fud-portal-production-1c02.up.railway.app',
  // Current production frontend
  'https://fud-portal-production.up.railway.app',
];

// Dynamically add FRONTEND_URL env var (supports comma-separated list)
if (process.env.FRONTEND_URL) {
  process.env.FRONTEND_URL.split(',').forEach(url => {
    const trimmed = url.trim().replace(/\/$/, '');
    if (trimmed && !ALLOWED_ORIGINS.includes(trimmed)) {
      ALLOWED_ORIGINS.push(trimmed);
    }
  });
}

// Railway auto-injects RAILWAY_PUBLIC_DOMAIN – use it as a zero-config fallback
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  const railwayOrigin = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`.replace(/\/$/, '');
  if (!ALLOWED_ORIGINS.includes(railwayOrigin)) {
    ALLOWED_ORIGINS.push(railwayOrigin);
  }
}

console.log('[Diagnostics] CORS Allowed Origins:', ALLOWED_ORIGINS);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    
    const normalizedOrigin = origin.trim().replace(/\/$/, '');
    if (ALLOWED_ORIGINS.includes(normalizedOrigin)) {
      return cb(null, true);
    }
    
    cb(new Error(`CORS: Origin "${origin}" not allowed`));
  },
  methods:        ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
  credentials:    true,
  maxAge:         86400,
}));
app.options('*', cors());

// ─── Trust Proxy (for correct IP behind nginx/load-balancer) ─────────────────
app.set('trust proxy', 1);

// ─── Body Parser ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ─── Request ID (for tracing) ─────────────────────────────────────────────────
app.use((req, _res, next) => {
  req.id = require('crypto').randomUUID();
  next();
});

// ─── HTTP Request Logger (Morgan → Winston) ───────────────────────────────────
const accessLogStream = fs.createWriteStream(path.join(LOG_DIR, 'access.log'), { flags: 'a' });
accessLogStream.on('error', err => {
  console.error('[Diagnostics] Failed to write to access.log stream:', err.message);
});
app.use(morgan('combined', { stream: accessLogStream }));
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ─── Static Files ─────────────────────────────────────────────────────────────
// Versioned/hashed assets get long cache; index.html gets no-cache
app.use(express.static(path.join(__dirname, '../frontend'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
  etag:         true,
  lastModified: true,
  setHeaders(res, filePath) {
    // HTML & JS: always revalidate
    if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    // Fonts/icons: long cache
    if (/\.(woff2?|ttf|eot|ico)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// Serve uploaded files with strict security headers (VULN-07)
app.use('/uploads', (req, res, next) => {
  // SECURITY: Prevent browsers from executing uploaded files as scripts
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  next();
}, express.static(UPLOAD_DIR, {
  maxAge: '1d',
  etag:   true,
  // SECURITY: Never allow directory listing
  index:  false,
}));

// ─── Rate Limiting (API-wide) ─────────────────────────────────────────────────
app.use('/api', apiLimiter);

// ─── Global Auth Middleware: Force Password Change Guard ──────────────────────
// NOTE: Applied once here — not repeated on individual routes
app.use('/api', requirePasswordChange);

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/tests',         testRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/media',         mediaRoutes);         // requirePasswordChange already applied globally
app.use('/api/admin',         adminRoutes);
app.use('/api/email',         emailRoutes);
app.use('/api/subjects',      subjectRoutes);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  let dbStatus = 'connected';
  try {
    const row = await dbGet('SELECT 1 AS ok');
    if (!row || row.ok !== 1) dbStatus = 'disconnected';
  } catch {
    dbStatus = 'disconnected';
  }

  const provider = String(process.env.EMAIL_PROVIDER || 'smtp').toLowerCase().trim();
  let emailStatus = 'unconfigured';
  if (provider === 'brevo') {
    emailStatus = process.env.BREVO_API_KEY ? 'active' : 'unconfigured';
  } else if (provider === 'resend') {
    emailStatus = process.env.RESEND_API_KEY ? 'active' : 'unconfigured';
  } else if (provider === 'mailgun') {
    emailStatus = (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) ? 'active' : 'unconfigured';
  } else {
    emailStatus = (process.env.EMAIL_USER && process.env.EMAIL_PASS) ? 'active' : 'unconfigured';
  }

  res.json({
    status:         dbStatus === 'connected' ? 'ok' : 'degraded',
    success:        true,
    message:        'FUD Portal API is running',
    version:        process.env.npm_package_version || '1.1.1',
    database:       dbStatus,
    email_provider: provider,
    email_status:   emailStatus,
    env:            process.env.NODE_ENV || 'development',
    uptime:         Math.floor(process.uptime()),
    timestamp:      new Date().toISOString(),
  });
});

// ─── Metrics / Monitoring Endpoint (internal — restrict in nginx) ─────────────
app.get('/api/metrics', (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    success: true,
    data: {
      uptime_seconds:  Math.floor(process.uptime()),
      memory: {
        rss_mb:        +(mem.rss / 1024 / 1024).toFixed(1),
        heap_used_mb:  +(mem.heapUsed / 1024 / 1024).toFixed(1),
        heap_total_mb: +(mem.heapTotal / 1024 / 1024).toFixed(1),
        external_mb:   +(mem.external / 1024 / 1024).toFixed(1),
      },
      node_version:    process.version,
      pid:             process.pid,
      env:             process.env.NODE_ENV || 'development',
      timestamp:       new Date().toISOString(),
    },
  });
});

// ─── 404 for unknown API routes ───────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ─── Frontend SPA Fallback ────────────────────────────────────────────────────
// SECURITY (VULN-15): Only serve SPA for non-API, non-upload routes
// API routes must never fall through to index.html — they return 404 above
app.get(/^(?!\/api\/|\/uploads\/).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ─── Global Error Handler (must be last) ─────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
async function startServer() {
  console.log('[Diagnostics] Starting server initialization...');
  try {
    console.log('[Diagnostics] Calling db.initialize()...');
    await initialize();
    console.log('[Diagnostics] db.initialize() complete.');

    console.log(`[Diagnostics] Attempting to listen on port ${PORT}...`);
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Diagnostics] Successfully bound to port ${PORT} on 0.0.0.0`);
      logger.info(`╔══════════════════════════════════════════════╗`);
      logger.info(`║   FUD Portal – Ahmaditech School             ║`);
      logger.info(`║   Server running on http://localhost:${PORT}    ║`);
      logger.info(`║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(28)}║`);
      logger.info(`╚══════════════════════════════════════════════╝`);
      if (process.send) {
        process.send('ready');
      }
    });

    server.on('error', (err) => {
      console.error('[Diagnostics] Server listen error:', err);
      setTimeout(() => process.exit(1), 500);
    });

    // Graceful shutdown
    function shutdown(signal) {
      console.log(`[Diagnostics] ${signal} received – shutting down gracefully`);
      logger.info(`[Server] ${signal} received – shutting down gracefully`);
      server.close(() => {
        logger.info('[Server] HTTP server closed');
        process.exit(0);
      });
      setTimeout(() => { logger.error('[Server] Forced exit'); process.exit(1); }, 10000);
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

    // Purge expired tokens every 6 hours
    setInterval(async () => {
      try {
        const purged = await purgeExpiredTokens();
        if (purged.tokens > 0 || purged.passwordResets > 0) {
          logger.info(`[Purge] Removed ${purged.tokens} expired tokens, ${purged.passwordResets} reset tokens`);
        }
      } catch (err) {
        console.error('[Diagnostics] Token purge failed:', err);
        logger.error('Token purge failed:', err.message);
      }
    }, 6 * 60 * 60 * 1000);

    // Start email queue worker (polls every 30 seconds)
    // The worker is started unconditionally. It handles transient SMTP errors
    // through the queue retry/backoff mechanism.
    console.log('[Diagnostics] Initializing email service...');

    try {
      const emailService = require('./services/emailService');

      // Start worker independently of SMTP diagnostic verification.
      emailService.startWorker(30000);
      console.log('[Diagnostics] Email worker initialized.');

      // SMTP verification is diagnostic only; it must not block the worker.
      emailService.verifyTransporter()
        .then(result => {
          if (result.ok) {
            logger.info(
              `[Email] ✓ SMTP connection verified — user: ${result.user}, host: ${result.host}`
            );
            console.log(
              `[Diagnostics] SMTP OK: ${result.user} via ${result.host}`
            );
          } else {
            logger.warn(
              `[Email] ⚠ SMTP diagnostic failed: ${result.error}`
            );
            console.warn(
              `[Diagnostics] SMTP WARNING: ${result.error}`
            );
            console.warn(
              '[Diagnostics] Worker is running, but emails may temporarily fail and retry if SMTP remains down.'
            );
          }
        })
        .catch(err => {
          logger.error(
            `[Email] Provider verification error: ${err.message}`
          );
          console.error(
            `[Diagnostics] SMTP verification error: ${err.message}`
          );
        });

    } catch (err) {
      console.error(
        '[Diagnostics] Non-fatal: Email service failed to initialize:',
        err
      );
    }

    // Purge old sent emails daily
    console.log('[Diagnostics] Setting up email purge interval...');
    setInterval(async () => {
      try {
        const EmailQueue = require('./models/EmailQueue');
        const purged = await EmailQueue.purgeSent(30);
        if (purged > 0) logger.info(`[EmailPurge] Removed ${purged} old sent email records`);
      } catch (err) { 
        console.error('[Diagnostics] Email purge failed:', err);
        logger.error('Email purge failed:', err.message); 
      }
    }, 24 * 60 * 60 * 1000);
    console.log('[Diagnostics] Server startup sequence completed successfully.');

  } catch (err) {
    console.error('[Diagnostics] FATAL STARTUP ERROR:', err.stack || err);
    logger.error('Failed to start server:', err);
    setTimeout(() => process.exit(1), 500);
  }
}

// ─── Handle Uncaught Errors ───────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[Diagnostics] Uncaught Exception:', err.stack || err);
  logger.error('Uncaught Exception:', err);
  if (process.env.NODE_ENV === 'production') setTimeout(() => process.exit(1), 500);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Diagnostics] Unhandled Rejection:', reason.stack || reason);
  logger.error('Unhandled Rejection:', reason);
  if (process.env.NODE_ENV === 'production') setTimeout(() => process.exit(1), 500);
});

startServer();

module.exports = app;
