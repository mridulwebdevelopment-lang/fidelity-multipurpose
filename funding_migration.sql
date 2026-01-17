-- Supabase Migration File for Funding Target Tracker (OCR -> daily + shift targets)
--
-- Run this SQL in your Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS funding_states (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  end_date DATE,
  manual_adjustment_pence BIGINT NOT NULL DEFAULT 0,
  last_image_message_id TEXT,
  last_image_url TEXT,
  last_ocr_text TEXT,
  last_parsed_needed_values JSONB,
  last_parsed_total_pence BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funding_states_channel_id ON funding_states(channel_id);

-- Enable Row Level Security (RLS)
ALTER TABLE funding_states ENABLE ROW LEVEL SECURITY;

-- Service role policies
CREATE POLICY "Service role can access all funding_states" ON funding_states
  FOR ALL USING (true);















