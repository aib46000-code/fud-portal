# ────────────────────────────────────────────────────────────────────────────
#  FUD Portal – Dockerfile
#  Multi-stage build: builder → production
#  Image: node:20-alpine (minimal, secure)
# ────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Dependency installer ───────────────────────────────────────────
FROM node:20-alpine AS deps

# Install build tools needed for native modules (sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./

# Install production deps only
RUN npm ci --omit=dev --ignore-scripts && \
    npm rebuild sqlite3 && \
    npm cache clean --force

# ── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS production

# Security: run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser  -S fudportal -u 1001 -G nodejs

WORKDIR /app

# Copy pre-built node_modules from deps stage
COPY --from=deps --chown=fudportal:nodejs /app/node_modules ./node_modules

# Copy application source
COPY --chown=fudportal:nodejs backend/     ./backend/
COPY --chown=fudportal:nodejs frontend/    ./frontend/
COPY --chown=fudportal:nodejs package.json ./

# Create required runtime directories
RUN mkdir -p /app/uploads /app/logs /app/data /app/database && \
    chown -R fudportal:nodejs /app/uploads /app/logs /app/data /app/database

# Environment defaults (override via docker-compose or --env-file)
ENV NODE_ENV=production \
    PORT=5000 \
    DB_PATH=/app/data/fud_portal.db \
    UPLOAD_DIR=/app/uploads \
    LOG_DIR=/app/logs

# Expose app port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

# Switch to non-root user
USER fudportal

# Start server
CMD ["node", "backend/server.js"]
