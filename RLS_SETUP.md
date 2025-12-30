# Row Level Security (RLS) Setup Guide

## Issue
Supabase is warning that RLS is not enabled on the `public.licenses`, `public.users`, and `public.trials` tables. This is a security best practice.

## Solution
I've created an SQL file (`supabase_rls_policies.sql`) that enables RLS with appropriate policies for your application.

## How to Apply

1. **Open Supabase Dashboard**
   - Go to your Supabase project dashboard
   - Navigate to the SQL Editor

2. **Run the SQL Script**
   - Open the file `supabase_rls_policies.sql` in this repository
   - Copy the entire contents
   - Paste it into the Supabase SQL Editor
   - Click "Run" to execute

3. **Verify RLS is Enabled**
   - The script includes verification queries (commented out)
   - You can uncomment and run them to check the policies

## What This Does

- ✅ **Enables RLS** on the `licenses`, `users`, and `trials` tables
- ✅ **Allows SELECT** operations (needed for license/trial verification)
- ✅ **Blocks INSERT/UPDATE/DELETE** for anon/authenticated roles (only service_role can modify)
- ✅ **Creates indexes** for better query performance

## Important Notes

1. **Your app will continue working** - Since you use `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS, your current functionality is unaffected.

2. **This is defense-in-depth** - These policies protect against accidental use of the anon key or future changes.

3. **SELECT policy is permissive** - This is intentional because:
   - License verification needs to work with just a license_key
   - Your app doesn't use Supabase Auth, so we can't use `auth.uid()` for row-level filtering
   - The application logic already handles access control via service_role

4. **Other tables** - The script covers `licenses`, `users`, and `trials`. If Supabase flags `device_activations` or other tables, you can apply the same pattern.

## Testing

After applying the policies, test your application to ensure everything still works:
- License verification by license_key
- License info retrieval by email
- Trial verification and status checks
- Admin operations (should work via service_role)

If you encounter any issues, you can temporarily disable RLS:
```sql
ALTER TABLE public.licenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.trials DISABLE ROW LEVEL SECURITY;
```

But this will bring back the security warnings.

