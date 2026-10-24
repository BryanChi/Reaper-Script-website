-- Native plugin license tokens (api/_lib/store.js issueNativeToken).
-- Run this once in the Supabase SQL editor. The code works without it (no hardware binding then),
-- so it can go before or after the deploy.

-- The hardware hash of the computer a device ID was activated on, saved the first time one of FX
-- Devices' native plugins asks for a token: a token for that device ID is only signed for that
-- computer again.
ALTER TABLE public.device_activations ADD COLUMN IF NOT EXISTS hw TEXT;
