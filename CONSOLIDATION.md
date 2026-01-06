# API Endpoint Consolidation

## Summary

Consolidated API endpoints to reduce the number of serverless functions from **16 to 10** (under Vercel's 12 function limit).

## Changes Made

### Consolidated Endpoints

1. **Admin endpoints** → Single `api/admin.js`
   - `/api/admin/auth` → `/api/admin?action=auth`
   - `/api/admin/licenses` → `/api/admin?action=licenses`
   - `/api/admin/trials` → `/api/admin?action=trials`
   - `/api/admin/license/update` → `/api/admin?action=license-update`
   - `/api/admin/license/regenerate` → `/api/admin?action=license-regenerate`
   - `/api/admin/trial/update` → `/api/admin?action=trial-update`
   - `/api/admin/trial/regenerate` → `/api/admin?action=trial-regenerate`

2. **Device endpoints** → Single `api/device.js`
   - `/api/device/activate` → `/api/device?action=activate` (or POST without action)
   - `/api/device/deactivate` → `/api/device?action=deactivate`

## Files to Delete

You can safely delete these old endpoint files (they've been consolidated):

```
api/admin/auth.js
api/admin/licenses.js
api/admin/trials.js
api/admin/license/update.js
api/admin/license/regenerate.js
api/admin/trial/update.js
api/admin/trial/regenerate.js
api/device/activate.js
api/device/deactivate.js
```

## New Function Count

**Before:** 16 functions
**After:** 10 functions

Remaining functions:
1. `api/admin.js` (consolidated)
2. `api/device.js` (consolidated)
3. `api/auth/callback.js`
4. `api/license/activate.js`
5. `api/license/info.js`
6. `api/license/verify.js`
7. `api/paypal/webhook.js`
8. `api/test/email.js`
9. `api/trial/start.js`
10. (plus `api/_lib/store.js` which is a library, not a function)

## Usage

The new consolidated endpoints work the same way, just with query parameters:

**Admin:**
- `GET /api/admin?action=licenses` - List licenses
- `GET /api/admin?action=trials` - List trials
- `POST /api/admin?action=auth` - Authenticate
- `POST /api/admin?action=license-update` - Update license
- `POST /api/admin?action=license-regenerate` - Regenerate license key
- `POST /api/admin?action=trial-update` - Update trial
- `POST /api/admin?action=trial-regenerate` - Regenerate trial key

**Device:**
- `POST /api/device?action=activate` - Activate device (or just POST without action)
- `POST /api/device?action=deactivate` - Deactivate device

The admin panel (`admin.html`) has been updated to use the new endpoints.



