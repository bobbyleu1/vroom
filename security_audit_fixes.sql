-- VROOM SECURITY AUDIT FIXES
-- This script addresses the security issues identified in your Supabase project

-- ============================================================================
-- 1. FIX SECURITY DEFINER VIEWS
-- ============================================================================

-- Issue: Views with SECURITY DEFINER bypass user permissions and RLS
-- Solution: Recreate views without SECURITY DEFINER and ensure proper RLS

-- Fix public_profiles view
DROP VIEW IF EXISTS public.public_profiles;

-- Recreate without SECURITY DEFINER
CREATE VIEW public.public_profiles AS
SELECT 
    id,
    username,
    avatar_url,
    bio,
    created_at,
    updated_at,
    followers_count,
    following_count,
    posts_count
FROM profiles
WHERE NOT is_private OR id = auth.uid();

-- Enable RLS on the underlying profiles table if not already enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for public profiles view
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON profiles
    FOR SELECT USING (
        NOT is_private 
        OR id = auth.uid() 
        OR EXISTS (
            SELECT 1 FROM followers 
            WHERE follower_id = auth.uid() 
            AND following_id = profiles.id 
            AND status = 'accepted'
        )
    );

-- ============================================================================

-- Fix dm_conversations_with_participants view
DROP VIEW IF EXISTS public.dm_conversations_with_participants;

-- Recreate without SECURITY DEFINER with proper user filtering
CREATE VIEW public.dm_conversations_with_participants AS
SELECT 
    dc.id,
    dc.created_at,
    dc.updated_at,
    dc.last_message_at,
    -- Only show participant info for conversations the user is part of
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM dm_participants dp 
            WHERE dp.conversation_id = dc.id 
            AND dp.user_id = auth.uid()
        ) THEN (
            SELECT json_agg(
                json_build_object(
                    'user_id', dp.user_id,
                    'joined_at', dp.joined_at,
                    'username', p.username,
                    'avatar_url', p.avatar_url
                )
            )
            FROM dm_participants dp
            JOIN profiles p ON p.id = dp.user_id
            WHERE dp.conversation_id = dc.id
        )
        ELSE NULL
    END as participants
FROM dm_conversations dc
WHERE EXISTS (
    SELECT 1 FROM dm_participants dp 
    WHERE dp.conversation_id = dc.id 
    AND dp.user_id = auth.uid()
);

-- Ensure RLS is enabled on related tables
ALTER TABLE dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for DM tables
DROP POLICY IF EXISTS "Users can only see their own conversations" ON dm_conversations;
CREATE POLICY "Users can only see their own conversations" ON dm_conversations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM dm_participants 
            WHERE conversation_id = dm_conversations.id 
            AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can only see their own participations" ON dm_participants;
CREATE POLICY "Users can only see their own participations" ON dm_participants
    FOR ALL USING (
        user_id = auth.uid() 
        OR EXISTS (
            SELECT 1 FROM dm_participants dp2 
            WHERE dp2.conversation_id = dm_participants.conversation_id 
            AND dp2.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can only see messages from their conversations" ON dm_messages;
CREATE POLICY "Users can only see messages from their conversations" ON dm_messages
    FOR ALL USING (
        sender_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM dm_participants 
            WHERE conversation_id = dm_messages.conversation_id 
            AND user_id = auth.uid()
        )
    );

-- ============================================================================

-- Fix notification_view
DROP VIEW IF EXISTS public.notification_view;

-- Recreate without SECURITY DEFINER
CREATE VIEW public.notification_view AS
SELECT 
    n.id,
    n.recipient_id,
    n.type,
    n.title,
    n.body,
    n.data,
    n.is_read,
    n.created_at,
    -- Only include sender info if user has permission to see it
    CASE 
        WHEN n.sender_id IS NULL THEN NULL
        WHEN n.sender_id = auth.uid() THEN json_build_object(
            'id', p.id,
            'username', p.username,
            'avatar_url', p.avatar_url
        )
        WHEN NOT p.is_private THEN json_build_object(
            'id', p.id,
            'username', p.username,
            'avatar_url', p.avatar_url
        )
        ELSE json_build_object(
            'id', p.id,
            'username', 'Private User',
            'avatar_url', null
        )
    END as sender_info
FROM notifications n
LEFT JOIN profiles p ON p.id = n.sender_id
WHERE n.recipient_id = auth.uid(); -- Critical: only show user's own notifications

-- Ensure RLS is enabled on notifications table
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Add RLS policy for notifications
DROP POLICY IF EXISTS "Users can only see their own notifications" ON notifications;
CREATE POLICY "Users can only see their own notifications" ON notifications
    FOR ALL USING (recipient_id = auth.uid());

-- ============================================================================
-- 2. ENABLE RLS ON thumbnail_generation_log TABLE
-- ============================================================================

-- Enable RLS on the thumbnail_generation_log table
ALTER TABLE thumbnail_generation_log ENABLE ROW LEVEL SECURITY;

-- Add appropriate RLS policy based on your access requirements
-- Option A: Only allow service role access (recommended for system logs)
DROP POLICY IF EXISTS "Service role only access" ON thumbnail_generation_log;
CREATE POLICY "Service role only access" ON thumbnail_generation_log
    FOR ALL USING (
        auth.jwt() ->> 'role' = 'service_role'
    );

-- Option B: If users need to see their own thumbnail generation logs
-- DROP POLICY IF EXISTS "Users can see their own thumbnail logs" ON thumbnail_generation_log;
-- CREATE POLICY "Users can see their own thumbnail logs" ON thumbnail_generation_log
--     FOR SELECT USING (
--         user_id = auth.uid() 
--         OR auth.jwt() ->> 'role' = 'service_role'
--     );

-- ============================================================================
-- 3. ADDITIONAL SECURITY HARDENING
-- ============================================================================

-- Ensure all user-facing tables have proper RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feed_seen ENABLE ROW LEVEL SECURITY;

-- Verify critical tables have appropriate policies
-- (You may need to adjust these based on your existing policies)

-- Posts should be visible based on user privacy settings
DROP POLICY IF EXISTS "Posts visibility policy" ON posts;
CREATE POLICY "Posts visibility policy" ON posts
    FOR SELECT USING (
        -- Public posts are visible to everyone
        NOT EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = posts.author_id 
            AND is_private = true
        )
        -- Or user is the author
        OR author_id = auth.uid()
        -- Or user follows the private author
        OR EXISTS (
            SELECT 1 FROM followers f
            JOIN profiles p ON p.id = posts.author_id
            WHERE f.follower_id = auth.uid()
            AND f.following_id = posts.author_id
            AND f.status = 'accepted'
            AND p.is_private = true
        )
    );

-- Users can only insert their own posts
DROP POLICY IF EXISTS "Users can insert their own posts" ON posts;
CREATE POLICY "Users can insert their own posts" ON posts
    FOR INSERT WITH CHECK (author_id = auth.uid());

-- Users can only update/delete their own posts
DROP POLICY IF EXISTS "Users can manage their own posts" ON posts;
CREATE POLICY "Users can manage their own posts" ON posts
    FOR ALL USING (author_id = auth.uid());

-- Comments follow post visibility
DROP POLICY IF EXISTS "Comments follow post visibility" ON post_comments;
CREATE POLICY "Comments follow post visibility" ON post_comments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM posts 
            WHERE posts.id = post_comments.post_id
            AND (
                -- Public posts
                NOT EXISTS (
                    SELECT 1 FROM profiles 
                    WHERE id = posts.author_id 
                    AND is_private = true
                )
                -- Or user is the post author
                OR posts.author_id = auth.uid()
                -- Or user follows private author
                OR EXISTS (
                    SELECT 1 FROM followers f
                    JOIN profiles p ON p.id = posts.author_id
                    WHERE f.follower_id = auth.uid()
                    AND f.following_id = posts.author_id
                    AND f.status = 'accepted'
                    AND p.is_private = true
                )
            )
        )
    );

-- ============================================================================
-- 4. SECURITY VERIFICATION QUERIES
-- ============================================================================

-- Run these queries to verify security is working correctly:

-- Check that all tables in public schema have RLS enabled
SELECT 
    schemaname, 
    tablename, 
    rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = false;

-- Check for any remaining SECURITY DEFINER views
SELECT 
    schemaname,
    viewname,
    definition
FROM pg_views 
WHERE schemaname = 'public'
AND definition ILIKE '%SECURITY DEFINER%';

-- Verify RLS policies exist for critical tables
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================================================
-- IMPORTANT NOTES:
-- ============================================================================

-- 1. TEST THOROUGHLY: Run these in a development environment first
-- 2. BACKUP: Always backup your database before making these changes
-- 3. MONITOR: Watch for any application errors after deployment
-- 4. ADJUST: You may need to modify policies based on your specific business logic
-- 5. SERVICE ROLE: Some operations may need to use the service role for system tasks

-- Run each section individually and test your application after each change