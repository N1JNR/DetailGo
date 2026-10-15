-- Security Skill — Supabase RLS (Row Level Security) Template
-- Run in Supabase SQL Editor

-- ============================================================
-- STEP 1: Enable RLS on ALL tables (run for each table)
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
-- Add more tables here...

-- ============================================================
-- STEP 2: Drop existing permissive policies if any
-- ============================================================
-- DROP POLICY IF EXISTS "Allow all" ON users;

-- ============================================================
-- USERS TABLE — Example policies
-- ============================================================

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
ON users FOR SELECT
USING (auth.uid() = id);

-- Users can update their own profile (but not change role/email)
CREATE POLICY "Users can update own profile"
ON users FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND role = (SELECT role FROM users WHERE id = auth.uid())  -- cannot change own role
);

-- Only service role can insert users (via auth trigger)
CREATE POLICY "Service role can insert users"
ON users FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- Admins can view all users
CREATE POLICY "Admins can view all users"
ON users FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ============================================================
-- POSTS TABLE — Example policies
-- ============================================================

-- Anyone can read published posts
CREATE POLICY "Public can view published posts"
ON posts FOR SELECT
USING (published = true);

-- Authenticated users can read their own posts (including unpublished)
CREATE POLICY "Users can view own posts"
ON posts FOR SELECT
USING (auth.uid() = author_id);

-- Authenticated users can create posts
CREATE POLICY "Authenticated users can create posts"
ON posts FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
  AND auth.uid() = author_id
);

-- Authors can update their own posts
CREATE POLICY "Authors can update own posts"
ON posts FOR UPDATE
USING (auth.uid() = author_id)
WITH CHECK (auth.uid() = author_id);

-- Authors or admins can delete posts
CREATE POLICY "Authors or admins can delete posts"
ON posts FOR DELETE
USING (
  auth.uid() = author_id
  OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================================
-- VERIFY: Check RLS is enabled on all tables
-- ============================================================
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
