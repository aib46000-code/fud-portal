# FUD Portal for Ahmaditech — Release Notes

**Version:** 1.1.0
**Date:** August 22, 2026

## Overview
We are proud to release **FUD Portal for Ahmaditech v1.1.0**. This release focuses on cloud infrastructure reliability, enhanced transactional email delivery via Brevo HTTPS API, dynamic provider detection across the administrative interface, and security and rate-limiting isolation improvements.

## Major Highlights

### 1. Cloud-Native Email Delivery (Brevo HTTPS API)
- Implemented `BrevoApiProvider` utilizing native Node 20 `fetch` over port 443.
- Completely resolves outbound SMTP TCP port timeout issues common on cloud hosting environments (Railway / Render / VPS).
- Seamless JSON payload mapping and clean error handling without credential leakage.

### 2. Dynamic Email Provider Status & UI Recognition
- The `/api/email/stats` endpoint dynamically detects the active provider (`brevo`, `resend`, `mailgun`, `smtp`).
- The Email Management interface (`email.html`) accurately identifies Brevo API as live and active without erroneously prompting for SMTP credentials.

### 3. Security & Test Isolation
- Implemented rate-limit test namespace isolation for automated testing suites on localhost, ensuring no cross-test state leakage.
- Added dedicated `refreshLimiter` (30 req / 5 min) for `/api/auth/refresh` to prevent token-stuffing attacks while preserving strict 10 req / 5 min limits on `/api/auth/login`.

## Upgrade Instructions
This release is 100% backward compatible. No database migrations, schema modifications, or manual configuration changes are required. Set `EMAIL_PROVIDER=brevo` and `BREVO_API_KEY` in environment variables for Brevo HTTPS API delivery.
