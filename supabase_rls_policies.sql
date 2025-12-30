-- ============================================
-- RLS Policies for licenses, users, and trials tables
-- ============================================
-- This file enables Row Level Security (RLS) on the licenses, users, and trials tables
-- to address Supabase security warnings.
--
-- Note: Your application uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS,
-- so enabling RLS won't affect current functionality. These policies provide
-- defense-in-depth protection if the anon key is accidentally used or
-- if there are future changes to authentication.
--
-- To apply: Copy and paste this SQL into your Supabase SQL Editor
-- ============================================

-- Step 1: Enable RLS on the licenses table
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "licenses_select_public" ON public.licenses;
DROP POLICY IF EXISTS "licenses_insert_restricted" ON public.licenses;
DROP POLICY IF EXISTS "licenses_update_restricted" ON public.licenses;
DROP POLICY IF EXISTS "licenses_delete_restricted" ON public.licenses;

-- Step 3: Create SELECT policy
-- IMPORTANT: This policy is permissive (allows reading all rows) because:
-- 1. License verification requires public access by license_key
-- 2. Your app doesn't use Supabase Auth, so we can't use auth.uid() for row-level filtering
-- 3. The application logic (using service_role) already handles access control
--
-- This policy provides defense-in-depth: if anon key is accidentally exposed,
-- at least INSERT/UPDATE/DELETE are blocked. For stricter SELECT control,
-- consider implementing Supabase Auth or using SECURITY DEFINER functions.
CREATE POLICY "licenses_select_public"
ON public.licenses
FOR SELECT
TO anon, authenticated
USING (true); -- Allow reading (filtering happens via WHERE clauses in queries)

-- Step 4: Restrict INSERT/UPDATE/DELETE to service_role only
-- These operations should only be done via your backend API using service_role
-- Block anon and authenticated roles from modifying data

-- Block INSERT for anon/authenticated (only service_role should insert)
CREATE POLICY "licenses_insert_restricted"
ON public.licenses
FOR INSERT
TO anon, authenticated
WITH CHECK (false); -- Deny all inserts from anon/authenticated

-- Block UPDATE for anon/authenticated (only service_role should update)
CREATE POLICY "licenses_update_restricted"
ON public.licenses
FOR UPDATE
TO anon, authenticated
USING (false) -- Deny all updates from anon/authenticated
WITH CHECK (false);

-- Block DELETE for anon/authenticated (only service_role should delete)
CREATE POLICY "licenses_delete_restricted"
ON public.licenses
FOR DELETE
TO anon, authenticated
USING (false); -- Deny all deletes from anon/authenticated

-- Step 5: Create indexes for performance (if they don't exist)
-- These indexes help with the queries your application makes
CREATE INDEX IF NOT EXISTS idx_licenses_license_key ON public.licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_email ON public.licenses(email);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON public.licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_email_status ON public.licenses(email, status);

-- ============================================
-- RLS Policies for users table
-- ============================================

-- Step 1: Enable RLS on the users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "users_select_public" ON public.users;
DROP POLICY IF EXISTS "users_insert_restricted" ON public.users;
DROP POLICY IF EXISTS "users_update_restricted" ON public.users;
DROP POLICY IF EXISTS "users_delete_restricted" ON public.users;

-- Step 3: Create SELECT policy
-- Allow reading users (needed for application queries)
CREATE POLICY "users_select_public"
ON public.users
FOR SELECT
TO anon, authenticated
USING (true); -- Allow reading (filtering happens via WHERE clauses in queries)

-- Step 4: Restrict INSERT/UPDATE/DELETE to service_role only
CREATE POLICY "users_insert_restricted"
ON public.users
FOR INSERT
TO anon, authenticated
WITH CHECK (false); -- Deny all inserts from anon/authenticated

CREATE POLICY "users_update_restricted"
ON public.users
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "users_delete_restricted"
ON public.users
FOR DELETE
TO anon, authenticated
USING (false);

-- Step 5: Create indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- ============================================
-- RLS Policies for trials table
-- ============================================

-- Step 1: Enable RLS on the trials table
ALTER TABLE public.trials ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "trials_select_public" ON public.trials;
DROP POLICY IF EXISTS "trials_insert_restricted" ON public.trials;
DROP POLICY IF EXISTS "trials_update_restricted" ON public.trials;
DROP POLICY IF EXISTS "trials_delete_restricted" ON public.trials;

-- Step 3: Create SELECT policy
-- IMPORTANT: This policy is permissive (allows reading all rows) because:
-- 1. Trial verification requires access by email and license_key
-- 2. Your app doesn't use Supabase Auth, so we can't use auth.uid() for row-level filtering
-- 3. The application logic (using service_role) already handles access control
CREATE POLICY "trials_select_public"
ON public.trials
FOR SELECT
TO anon, authenticated
USING (true); -- Allow reading (filtering happens via WHERE clauses in queries)

-- Step 4: Restrict INSERT/UPDATE/DELETE to service_role only
CREATE POLICY "trials_insert_restricted"
ON public.trials
FOR INSERT
TO anon, authenticated
WITH CHECK (false); -- Deny all inserts from anon/authenticated

CREATE POLICY "trials_update_restricted"
ON public.trials
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "trials_delete_restricted"
ON public.trials
FOR DELETE
TO anon, authenticated
USING (false);

-- Step 5: Create indexes for trials table
CREATE INDEX IF NOT EXISTS idx_trials_email ON public.trials(email);
CREATE INDEX IF NOT EXISTS idx_trials_license_key ON public.trials(license_key);
CREATE INDEX IF NOT EXISTS idx_trials_email_license_key ON public.trials(email, license_key);

-- ============================================
-- Verification queries (optional - run these to test)
-- ============================================
-- Check if RLS is enabled on all tables:
-- SELECT tablename, rowsecurity FROM pg_tables 
-- WHERE schemaname = 'public' AND tablename IN ('licenses', 'users', 'trials');

-- List all policies:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
-- FROM pg_policies 
-- WHERE tablename IN ('licenses', 'users', 'trials')
-- ORDER BY tablename, policyname;

-- ============================================
-- Notes:
-- ============================================
-- 1. The SELECT policies are permissive (allow all reads) because:
--    - License/trial verification needs to work with license_key and email
--    - Your app doesn't use Supabase Auth, so we can't use auth.uid()
--    - The application logic already filters results appropriately
--
-- 2. INSERT/UPDATE/DELETE are blocked for anon/authenticated because:
--    - These operations should only happen via your backend API
--    - Your backend uses service_role which bypasses RLS
--    - This prevents accidental data modification if anon key is exposed
--
-- 3. If you want stricter SELECT policies in the future:
--    - You could add email verification via JWT claims
--    - Or use a SECURITY DEFINER function to validate access
--    - Or implement Supabase Auth and use auth.uid() matching
--
-- 4. The service_role key bypasses all RLS policies, so your current
--    application functionality will continue to work unchanged.
--
-- 5. Tables covered:
--    - licenses: License keys and status
--    - users: User email records
--    - trials: Trial period records with license keys

