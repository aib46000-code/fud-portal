# FUD Portal Enterprise - Release Notes

**Version:** 1.0.0-RC1
**Date:** July 23, 2026

## Overview
We are extremely proud to announce the Release Candidate 1 (RC-1) for FUD Portal Enterprise. This release marks the culmination of 5 distinct development phases designed to upgrade the Federal University Dutse's student and admin portal into an enterprise-grade Computer-Based Testing (CBT) and Learning Management System.

## Major Highlights

### Complete CBT Module
A robust and highly scalable CBT engine supporting unlimited subjects, multi-pools, and randomization of both questions and options. Now natively supports KaTeX mathematical rendering directly from the backend to ensure seamless offline functionality.

### Enterprise Features
1. **Multiple Attempts:** Granular tracking of examination attempts (1, 2, or Unlimited).
2. **Scheduling:** Granular exam scheduling, allowing early-access windows and enforcing late-entry lockouts.
3. **Advanced Question Formats:** Administrators can assign purely objective (MCQ/True-False), subjective (Essays), and Practical (File upload) tasks inside a single unified exam environment.

### Security and Analytics
1. **Live Exam Monitor:** An optimized reactivity engine polling every 5 seconds provides administrators a live view of all students, progress, and immediate alerts for anti-cheat violations.
2. **Result Verification:** Post-exam results generate offline PDF certificates verifiable via unique QR codes.

## Upgrade Instructions
This release is 100% backward compatible. No existing data is lost during the migration process. Run the built-in database migration scripts via `npm run migrate` to apply the Phase 5 enterprise tables (e.g. `exam_sessions`, `exam_attempts`, `question_pools`).

## Known Issues
- Currently, WebSockets are disabled in favor of lightweight short-polling. Full WebSocket real-time analytics will be introduced in `v1.1.0`.
