-- Phase 3: Anti-Cheat Tracking
-- Add columns to results table safely

ALTER TABLE results ADD COLUMN violations_count INTEGER DEFAULT 0;
ALTER TABLE results ADD COLUMN anti_cheat_logs TEXT;
