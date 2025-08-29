-- Add push_token column to profiles table if it doesn't exist
-- This script is safe to run multiple times

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' 
    AND column_name = 'push_token'
  ) THEN
    ALTER TABLE profiles ADD COLUMN push_token TEXT;
    PRINT 'Added push_token column to profiles table';
  ELSE
    PRINT 'push_token column already exists in profiles table';
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_push_token ON profiles(push_token);

-- Update RLS policies to allow users to update their own push_token
CREATE POLICY IF NOT EXISTS "Users can update own push_token"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);