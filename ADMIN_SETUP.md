# Admin Panel Setup Guide

## Security Best Practices

The admin password should **always** be stored as an environment variable, never in code or git.

## Setting Up in Vercel

1. **Go to your Vercel project dashboard**
   - Navigate to: Project → Settings → Environment Variables

2. **Add the environment variable**
   - **Name:** `ADMIN_PASSWORD`
   - **Value:** Your secure password (use a strong, random password)
   - **Environment:** Select all environments (Production, Preview, Development) or just Production

3. **Redeploy your application**
   - After adding the variable, redeploy so it takes effect

## Setting Up Locally

1. **Create/update your `.env` file** (already in `.gitignore`)
   ```
   ADMIN_PASSWORD=your-secure-password-here
   ```

2. **Never commit `.env` to git**
   - The `.env` file should already be in `.gitignore`
   - Double-check that `.env` is not tracked

## Password Recommendations

- Use a strong, random password (at least 16 characters)
- Consider using a password manager to generate and store it
- Use different passwords for different environments (dev/staging/prod)
- Change it periodically

## Accessing the Admin Panel

1. Navigate to: `https://your-domain.com/admin.html`
2. Enter the password you set in `ADMIN_PASSWORD`
3. You'll receive a session token valid for 24 hours

## Security Notes

⚠️ **Important:**
- The admin panel has full access to modify licenses and trials
- Only share the password with trusted team members
- Consider adding IP restrictions in production (via Vercel Edge Config or similar)
- Monitor access logs if possible
- For production, consider implementing:
  - Rate limiting on admin endpoints
  - Two-factor authentication
  - Audit logging of admin actions

## Troubleshooting

**"Admin panel not configured" error:**
- Make sure `ADMIN_PASSWORD` is set in your Vercel environment variables
- Redeploy after adding the variable
- Check that the variable name is exactly `ADMIN_PASSWORD` (case-sensitive)

**"Invalid password" error:**
- Verify you're using the correct password from your environment variables
- Check for extra spaces or special characters
- Make sure you're using the password from the correct environment (dev vs prod)

**"Could not find the 'license_key' column" error when regenerating trial keys:**
- This error occurs when the `trials` table in your Supabase database is missing the `license_key` column
- To fix this, run the following SQL in your Supabase SQL Editor:
  ```sql
  ALTER TABLE trials ADD COLUMN IF NOT EXISTS license_key TEXT;
  ```
- After adding the column, the regenerate trial key feature should work correctly
- Note: The `license_key` column is required for trials to function properly with the admin panel
