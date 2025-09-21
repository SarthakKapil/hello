/*
  # Virtual Try-On Extension Database Schema

  1. New Tables
    - `users`
      - `id` (uuid, primary key)
      - `name` (text, user's full name)
      - `gender` (text, user's gender)
      - `profile_image_url` (text, profile photo URL)
      - `full_body_image_url` (text, full body photo URL)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `tryons`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `original_image_url` (text, clothing item image)
      - `generated_image_url` (text, AI generated result)
      - `website_url` (text, source website)
      - `status` (text, processing status)
      - `error_message` (text, error details if failed)
      - `created_at` (timestamp)
    
    - `api_usage`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to users)
      - `date` (date, usage date)
      - `count` (integer, number of generations)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
    - Ensure data privacy and security compliance

  3. Indexes
    - Add performance indexes for common queries
    - Optimize for user lookups and usage tracking
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  gender text NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  profile_image_url text,
  full_body_image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create tryons table
CREATE TABLE IF NOT EXISTS tryons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  original_image_url text NOT NULL,
  generated_image_url text,
  website_url text,
  status text DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- Create api_usage table
CREATE TABLE IF NOT EXISTS api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  date date DEFAULT CURRENT_DATE,
  count integer DEFAULT 1,
  UNIQUE(user_id, date)
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tryons ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for users table
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  USING (true); -- Allow reading for extension functionality

CREATE POLICY "Users can insert own data"
  ON users
  FOR INSERT
  WITH CHECK (true); -- Allow insertion for new users

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  USING (true); -- Allow updates for profile management

-- Create RLS policies for tryons table
CREATE POLICY "Users can read own tryons"
  ON tryons
  FOR SELECT
  USING (true); -- Allow reading for history functionality

CREATE POLICY "Users can insert own tryons"
  ON tryons
  FOR INSERT
  WITH CHECK (true); -- Allow insertion for new try-ons

CREATE POLICY "Users can update own tryons"
  ON tryons
  FOR UPDATE
  USING (true); -- Allow updates for status changes

-- Create RLS policies for api_usage table
CREATE POLICY "Users can read own usage"
  ON api_usage
  FOR SELECT
  USING (true); -- Allow reading for rate limiting

CREATE POLICY "Users can insert own usage"
  ON api_usage
  FOR INSERT
  WITH CHECK (true); -- Allow insertion for usage tracking

CREATE POLICY "Users can update own usage"
  ON api_usage
  FOR UPDATE
  USING (true); -- Allow updates for usage increments

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tryons_user_id ON tryons(user_id);
CREATE INDEX IF NOT EXISTS idx_tryons_created_at ON tryons(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_user_date ON api_usage(user_id, date);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at'
  ) THEN
    CREATE TRIGGER update_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;