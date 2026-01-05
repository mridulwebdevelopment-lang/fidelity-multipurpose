-- ============================================================
-- Shift Periodic Reminder Update
-- Run this SQL in your Supabase SQL Editor to add periodic reminder tracking
-- ============================================================

-- Add last_periodic_reminder_at column to shifts table
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS last_periodic_reminder_at TIMESTAMPTZ;

-- This column tracks when the last periodic reminder was sent to a chatter
-- The bot will send periodic reminders every 2 hours (configurable) during active shifts
-- to repeat key playbook instructions

