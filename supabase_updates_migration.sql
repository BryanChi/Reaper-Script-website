-- Two years of updates per purchase, renewed by buying the same script again.
-- Run this once in the Supabase SQL editor BEFORE deploying the code that uses it.

-- When a license's updates end. Empty = purchase date + 2 years (what the code assumes for older rows).
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS updates_until TIMESTAMPTZ;

-- A renewal order's own row (status 'inactive') names the license it renewed, so the same order
-- can't renew twice and a repeated request gets the buyer's existing key back.
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS renews TEXT;
