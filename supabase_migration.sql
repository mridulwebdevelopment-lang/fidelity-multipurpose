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



