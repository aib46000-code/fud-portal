# FUD Portal for Ahmaditech — Release Notes

**Version:** 1.1.1
**Date:** August 22, 2026

## Overview
**FUD Portal for Ahmaditech v1.1.1** is a minimal maintenance release delivering client logging cleanup, visibility-aware email manager polling, and provider-neutral UI terminology improvements.

## Maintenance Improvements

### 1. Client Console Logging Cleanup
- Stripped verbose development-only `console.log` statements in `frontend/js/api.js` to ensure clean client execution and prevent form/request logging in developer tools.

### 2. Email Management UI Polish & Polling Optimization
- Replaced legacy SMTP terminology in `frontend/email.html` with provider-neutral labels (`Verify Connection`).
- Implemented visibility-aware polling using `document.visibilityState` to automatically pause queue stats polling when the browser tab is in the background and resume immediately when focused.

### 3. Architecture Preservation
- 100% backward compatible with existing SQLite database, JWT authentication, CBT examinations, results, and Brevo HTTPS API email delivery flows.

## Upgrade Instructions
This release is 100% backward compatible. No database migrations, schema modifications, or environment variable changes are required.
