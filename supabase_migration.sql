-- Supabase Migration File for Multipurpose Bot Tasks
-- Run this SQL in your Supabase SQL Editor to create the tasks table

-- Create enum types
CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to_user_id TEXT NOT NULL,
  assigned_by_user_id TEXT NOT NULL,
  status task_status NOT NULL DEFAULT 'pending',
  priority task_priority NOT NULL DEFAULT 'medium',
  deadline TIMESTAMPTZ,
  channel_id TEXT NOT NULL,
  proof_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reminded_at TIMESTAMPTZ,
  escalation_count INTEGER NOT NULL DEFAULT 0
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_user_id ON tasks(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_channel_id ON tasks(channel_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_last_reminded_at ON tasks(last_reminded_at);

-- Enable Row Level Security (RLS)
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role to access all data
CREATE POLICY "Service role can access all tasks" ON tasks
  FOR ALL USING (true);

-- Add proof_image_url column if it doesn't exist (for existing databases)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS proof_image_url TEXT;

-- ============================================================
-- Shift Check-In Flow (Chatter)
-- ============================================================

-- Track shift-capable users we’ve seen (created on first /startshift)
CREATE TABLE IF NOT EXISTS shift_profiles (
  user_id TEXT PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_startshift_at TIMESTAMPTZ,
  last_endshift_at TIMESTAMPTZ,
  last_missing_start_flag_at TIMESTAMPTZ,
  missing_start_count INTEGER NOT NULL DEFAULT 0,
  missing_end_count INTEGER NOT NULL DEFAULT 0,
  zero_activity_count INTEGER NOT NULL DEFAULT 0,
  last_repeat_offender_flag_at TIMESTAMPTZ
);

-- Individual shifts (start/end + activity)
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES shift_profiles(user_id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  opening_reminder_sent_at TIMESTAMPTZ,
  last_periodic_reminder_at TIMESTAMPTZ,
  activity_count INTEGER NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  flagged_zero_activity_at TIMESTAMPTZ,
  flagged_missing_end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shift_profiles_last_startshift_at ON shift_profiles(last_startshift_at);
CREATE INDEX IF NOT EXISTS idx_shifts_user_id_start_time ON shifts(user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_shifts_end_time ON shifts(end_time);
CREATE INDEX IF NOT EXISTS idx_shifts_start_time ON shifts(start_time);

-- Enable RLS
ALTER TABLE shift_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- Service role policies
CREATE POLICY "Service role can access all shift_profiles" ON shift_profiles
  FOR ALL USING (true);
CREATE POLICY "Service role can access all shifts" ON shifts
  FOR ALL USING (true);

-- Backfill/upgrade existing databases safely
ALTER TABLE shift_profiles ADD COLUMN IF NOT EXISTS missing_start_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shift_profiles ADD COLUMN IF NOT EXISTS missing_end_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shift_profiles ADD COLUMN IF NOT EXISTS zero_activity_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shift_profiles ADD COLUMN IF NOT EXISTS last_repeat_offender_flag_at TIMESTAMPTZ;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS last_periodic_reminder_at TIMESTAMPTZ;



