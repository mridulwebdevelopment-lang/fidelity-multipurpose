-- Supabase Migration File for Funding Updates History
-- Run this SQL in your Supabase SQL Editor to create the funding_updates_history table
-- This table stores a complete history of all funding table updates

CREATE TABLE IF NOT EXISTS funding_updates_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  command_type TEXT NOT NULL, -- 'slash_command' or 'text_command'
  message_id TEXT, -- Discord message ID if available
  
  -- Image and OCR data
  image_url TEXT NOT NULL,
  ocr_text TEXT,
  parsed_rows JSONB, -- Array of {name, neededPence, confidence}
  parsed_needed_values BIGINT[], -- Array of pence values
  parsed_total_pence BIGINT NOT NULL,
  
  -- Calculation data
  days_left INTEGER NOT NULL,
  end_of_week_date DATE, -- The Sunday date that marks end of week
  daily_target_pence BIGINT NOT NULL,
  remaining_shifts TEXT[], -- Array of shift names ['Day', 'Night']
  per_shift_pence BIGINT NOT NULL,
  current_shift TEXT NOT NULL, -- 'Morning', 'Day', or 'Night'
  shift_day_iso_date DATE NOT NULL, -- The shift day (starts at 03:00)
  
  -- Manual adjustments
  manual_adjustment_pence BIGINT NOT NULL DEFAULT 0,
  manual_adjustment_type TEXT, -- 'add', 'remove', 'reset', or null
  
  -- Options used
  days_left_override INTEGER, -- If manually overridden
  end_date_override DATE, -- If manually set
  
  -- Timestamps
  calculated_at TIMESTAMPTZ NOT NULL, -- When the calculation was made (upload time)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW() -- When record was inserted
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_funding_updates_history_guild_id ON funding_updates_history(guild_id);
CREATE INDEX IF NOT EXISTS idx_funding_updates_history_user_id ON funding_updates_history(user_id);
CREATE INDEX IF NOT EXISTS idx_funding_updates_history_calculated_at ON funding_updates_history(calculated_at);
CREATE INDEX IF NOT EXISTS idx_funding_updates_history_created_at ON funding_updates_history(created_at);
CREATE INDEX IF NOT EXISTS idx_funding_updates_history_shift_day ON funding_updates_history(shift_day_iso_date);

-- Add comments for documentation
COMMENT ON TABLE funding_updates_history IS 'Complete history of all funding table updates with full calculation data';
COMMENT ON COLUMN funding_updates_history.parsed_rows IS 'JSONB array of parsed rows: [{name: string, neededPence: number|null, confidence: number}]';
COMMENT ON COLUMN funding_updates_history.parsed_needed_values IS 'Array of all non-null needed values in pence';
COMMENT ON COLUMN funding_updates_history.calculated_at IS 'The exact timestamp when the calculation was made (upload/command time)';
COMMENT ON COLUMN funding_updates_history.shift_day_iso_date IS 'The shift day date (shift day starts at 03:00 UK time)';










