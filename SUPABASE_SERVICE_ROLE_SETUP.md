# Supabase Service Role Key Setup Guide

## What is the Service Role Key?

The `service_role` key is a special Supabase API key that:
- ✅ Bypasses Row Level Security (RLS) policies
- ✅ Has admin privileges (can manage users, confirm emails, etc.)
- ✅ Should **NEVER** be exposed in client-side code
- ✅ Should **ONLY** be used in server-side API endpoints

## How to Find Your Service Role Key

1. **Go to your Supabase Dashboard**
   - Navigate to: https://app.supabase.com
   - Select your project

2. **Open Project Settings**
   - Click the gear icon (⚙️) in the left sidebar
   - Or go to: `Settings` → `API`

3. **Find the Service Role Key**
   - Scroll down to the "Project API keys" section
   - Look for the key labeled **"service_role"** (it's usually the second key)
   - Click the **eye icon** 👁️ to reveal it
   - Click **Copy** to copy the key

   ⚠️ **Important**: This key starts with `eyJ...` and is very long (JWT token)

## Where to Add the Service Role Key

### Option 1: Vercel (Recommended for Production)

1. Go to your Vercel project dashboard
2. Click **Settings** → **Environment Variables**
3. Add a new variable:
   - **Name**: `SUPABASE_SERVICE_ROLE_KEY`
   - **Value**: Paste your service_role key
   - **Environment**: Select all (Production, Preview, Development)
4. Click **Save**
5. **Redeploy** your application for changes to take effect

### Option 2: Netlify

1. Go to your Netlify site dashboard
2. Click **Site settings** → **Environment variables**
3. Click **Add a variable**
4. Add:
   - **Key**: `SUPABASE_SERVICE_ROLE_KEY`
   - **Value**: Paste your service_role key
   - **Scopes**: Select all environments
5. Click **Save**
6. **Redeploy** your site

### Option 3: Local Development (.env file)

1. Create a `.env` file in your project root (if it doesn't exist)
2. Add this line:
   ```
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   ```
3. Make sure `.env` is in your `.gitignore` file (it should be already)

## Verify Your Setup

After adding the key, verify it's working:

1. **Check your API logs** when someone clicks "Start Trial"
2. Look for any errors about "Supabase not configured"
3. Test the flow:
   - Create a new account
   - Click "Start Trial" in the email
   - Try to log in immediately (should work!)

## Security Best Practices

⚠️ **CRITICAL**: Never expose the service_role key:

- ❌ **DON'T** put it in `index.html` or `script.js`
- ❌ **DON'T** commit it to Git (it's already in `.gitignore`)
- ❌ **DON'T** expose it in client-side JavaScript
- ✅ **DO** only use it in server-side API endpoints (`/api/*`)
- ✅ **DO** keep it in environment variables
- ✅ **DO** rotate it if accidentally exposed

## Current Usage in Your App

The service_role key is used in these API endpoints:

1. **`/api/auth/start-trial-from-email.js`**
   - Confirms user emails automatically when they click "Start Trial"

2. **`/api/_lib/store.js`**
   - Manages licenses, trials, and users in Supabase database
   - Used by all license/trial management endpoints

3. **`/api/admin.js`**
   - Admin panel functionality

## Troubleshooting

### "Supabase not configured" error
- Check that `SUPABASE_SERVICE_ROLE_KEY` is set in your environment variables
- Make sure you copied the **entire** key (it's very long)
- Redeploy your application after adding the variable

### Email confirmation not working
- Verify the service_role key is correct
- Check API logs for errors
- Make sure the user exists in Supabase Auth (they should after signup)

### Can't find the service_role key
- Make sure you're looking at the **API** settings page
- The key might be hidden - click the eye icon to reveal it
- If you can't see it, you might need project owner/admin permissions

## Need Help?

If you're still having issues:
1. Check your deployment platform's logs
2. Verify the key is set correctly (no extra spaces, complete key)
3. Make sure you're using the `service_role` key, not the `anon` key

