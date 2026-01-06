# Leaked Password Protection Setup Guide

## Issue
Supabase Auth's leaked password protection is currently disabled. This feature checks user passwords against the HaveIBeenPwned (HIBP) breach database to prevent users from using compromised passwords.

## Why This Matters
- **Security**: Prevents users from using passwords that have appeared in known data breaches
- **Account Protection**: Reduces risk of account takeover attacks
- **Best Practice**: Industry-standard security measure recommended by security experts

## How to Enable (No Code Changes Required)

### Step 1: Open Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Settings** → **Security** (or **Password security**)

### Step 2: Enable Leaked Password Protection
1. Find the **"Leaked password protection"** toggle (or similar)
2. **Enable** the feature
3. Choose your preferred behavior:
   - **Block** (recommended): Rejects leaked passwords during sign-up and password changes
   - **Warn** (optional): Allows the password but warns the user (less secure)

### Step 3: Configure Settings (if available)
- **Threshold**: If available, set whether to block passwords with any match or only those with high breach counts
- **Apply to**: Ensure it applies to both sign-up and password reset/change flows

## Code Updates (Optional but Recommended)

The application code has been updated to provide better error messages when leaked passwords are rejected. The error handling will now:

- Display user-friendly messages for leaked password errors
- Guide users to choose a different password
- Provide helpful context about why the password was rejected

## Testing

After enabling the feature, test these flows:

1. **Sign-up with a leaked password** (e.g., "password123", "12345678")
   - Should be rejected with a clear error message
   - User should be able to try again with a different password

2. **Password change/reset** (if implemented)
   - Should also check against leaked passwords
   - Should show appropriate error messages

3. **Sign-up with a strong password**
   - Should work normally
   - No false positives

## Common Leaked Passwords (for testing)
These passwords are commonly found in breaches and should be rejected:
- `password123`
- `12345678`
- `qwerty123`
- `welcome123`
- `admin123`

## Additional Security Recommendations

1. **Password Policy**: Consider enforcing minimum length (8+ characters) and complexity
2. **Multi-Factor Authentication (MFA)**: Enable MFA for additional account protection
3. **Rate Limiting**: Ensure authentication endpoints are rate-limited
4. **Password Managers**: Encourage users to use password managers

## Troubleshooting

### Users complaining about password rejection
- Explain that this protects their account security
- Suggest using a password manager
- Provide guidance on creating strong passwords

### High false positive rate
- Consider adjusting the threshold (if available)
- Review the HIBP integration settings
- Check if there are any known issues with the HIBP API

### Feature not appearing in dashboard
- Ensure you're using a recent version of Supabase
- Check if the feature is available in your plan tier
- Contact Supabase support if needed

## Notes

- **No breaking changes**: Enabling this feature won't affect existing users or their passwords
- **Only affects new passwords**: Existing passwords are not checked until changed
- **Privacy**: The HIBP check uses k-anonymity, so full passwords are never sent to the service
- **Performance**: Minimal impact on sign-up/password change flows




