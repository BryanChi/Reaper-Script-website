-- Products: each script is a separate purchase (Vertical FX List, FX Devices).
-- Run this once in the Supabase SQL editor BEFORE deploying the code that uses it.
-- Existing rows become Vertical FX List licenses and trials (the column default).

-- 1. Licenses: which script each key unlocks
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS product TEXT NOT NULL DEFAULT 'vertical-fx-list';
CREATE INDEX IF NOT EXISTS idx_licenses_email_product ON public.licenses(email, product, status);

-- 2. Trials: one trial per email per script (was one per email)
ALTER TABLE public.trials ADD COLUMN IF NOT EXISTS product TEXT NOT NULL DEFAULT 'vertical-fx-list';

-- drop whatever made email alone unique (primary key or unique constraint on just "email")
DO $$
DECLARE c RECORD;
BEGIN
	FOR c IN
		SELECT con.conname
		FROM pg_constraint con
		JOIN pg_class rel ON rel.oid = con.conrelid
		JOIN pg_namespace ns ON ns.oid = rel.relnamespace
		WHERE ns.nspname = 'public' AND rel.relname = 'trials'
			AND con.contype IN ('p', 'u')
			AND con.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = rel.oid AND attname = 'email')]::smallint[]
	LOOP
		EXECUTE format('ALTER TABLE public.trials DROP CONSTRAINT %I', c.conname);
	END LOOP;
END $$;

-- a unique index on just email (not a constraint) would block a second product's trial too
DROP INDEX IF EXISTS public.trials_email_key;

ALTER TABLE public.trials ADD CONSTRAINT trials_email_product_key UNIQUE (email, product);
CREATE INDEX IF NOT EXISTS idx_trials_license_key ON public.trials(license_key);
