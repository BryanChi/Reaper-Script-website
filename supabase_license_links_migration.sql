-- "Sign in with browser" for the scripts: one row per sign-in a script starts.
-- Run this once in the Supabase SQL editor BEFORE deploying the code that uses it.
-- Only the server (service role) reads or writes it: RLS is on with no policies.

CREATE TABLE IF NOT EXISTS public.license_links (
	device_code_hash TEXT PRIMARY KEY,          -- SHA-256 of the secret code only the script knows
	user_code TEXT NOT NULL UNIQUE,             -- the short code in the /link page URL (ABCD-2345)
	product TEXT NOT NULL,                      -- 'vertical-fx-list' | 'fx-devices'
	email TEXT,                                 -- the signed-in account, once confirmed
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	expires_at TIMESTAMPTZ NOT NULL,            -- 10 minutes after created_at
	linked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_license_links_expires ON public.license_links(expires_at);

ALTER TABLE public.license_links ENABLE ROW LEVEL SECURITY;
