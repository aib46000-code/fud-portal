# Changelog

All notable changes to the FUD Portal Enterprise project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-08-22

### Added
- Brevo HTTPS API email delivery provider (`BrevoApiProvider`) using native Node 20 fetch over port 443.
- Dynamic email provider detection across backend (`/api/email/stats`) and management UI (`email.html`).
- Multi-provider support and status recognition for Brevo, Resend, Mailgun, and SMTP.

### Security
- Test rate-limit namespace isolation preventing cross-test state leakage while maintaining strict production throttling.
- Dedicated refresh token rate limiter (`refreshLimiter`) to mitigate token-stuffing attacks.

### Fixed
- Fixed email management UI banner incorrectly requesting SMTP credentials when Brevo API is configured.
- Resolved outbound SMTP TCP connection timeout issues on cloud container environments (Railway/Render).

## [1.0.0] - 2026-07-23

### Added
- Complete Computer-Based Testing (CBT) engine.
- Token-based access control for exams.
- Multi-attempt exams with strict attempt tracking.
- Question Pools and Options Randomization.
- Support for Essay and Practical (File Upload) examination questions.
- Result generation via automated PDF with QR code verification.
- Advanced administrative analytics dashboard and Live Exam Monitor (5s polling).
- Security controls: Anti-cheat tracking (Tab switching, Developer Tools, Fullscreen escape).
- Accessibility overrides (High Contrast mode, dynamic font sizes).
- System health checks and full database backup modules.

### Changed
- Converted SQLite database schema to support relational components without loss of existing data.
- Upgraded Express.js backend to enforce strict Rate Limiting per endpoint.
- Optimized database indexing to ensure `O(log N)` lookups for frequent CBT operations.

### Security
- Role-Based Access Control (RBAC) across all endpoints.
- JWT rotation with short-lived access tokens (15m) and persistent refresh tokens.
- Parameterized SQL execution avoiding SQL Injection vectors.
- MIME-type enforcement preventing executable payload uploads.

### Fixed
- Fixed bug causing undefined questions array when resuming CBT sessions.
- Fixed scoping issue leading to missing analytics column tracking.
