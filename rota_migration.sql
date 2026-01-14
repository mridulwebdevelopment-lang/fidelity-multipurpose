-- Rota Migration File for Chatter Weekly Rota Submissions
-- Run this SQL in your Supabase SQL Editor to create the rota_weeks table

-- ============================================================
-- Weekly Rota (Chatter)
-- ============================================================

-- Store one rota submission per user per UK week (week_start_date = Monday)
CREATE TABLE IF NOT EXISTS rota_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  week_start_date DATE NOT NULL,
  schedule JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure one record per user per week
CREATE UNIQUE INDEX IF NOT EXISTS idx_rota_weeks_user_week ON rota_weeks(user_id, week_start_date);
CREATE INDEX IF NOT EXISTS idx_rota_weeks_week_start_date ON rota_weeks(week_start_date);

-- Enable RLS
ALTER TABLE rota_weeks ENABLE ROW LEVEL SECURITY;

-- Service role policies
CREATE POLICY "Service role can access all rota_weeks" ON rota_weeks
  FOR ALL USING (true);



