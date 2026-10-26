-- Connection-error reports from the scripts (api/_lib/client-log.js, POST /api/device?action=client-log).
-- Run this once in the Supabase SQL editor BEFORE deploying the code that uses it. Until then the
-- endpoint answers 500 and the scripts keep their logs and try again the next day.

-- One row per kind of error: product + what failed + how (the signature is made by the endpoint).
CREATE TABLE IF NOT EXISTS public.client_log_groups (
  sig TEXT PRIMARY KEY,
  product TEXT NOT NULL,
  what TEXT,          -- host and path of the request (never its query), plus the API action
  kind TEXT,          -- curl | http | timeout | not started | fallback
  rc INT,             -- curl's exit code
  http INT,           -- HTTP status (0 = none)
  way TEXT,           -- Windows: how the request was started, and what it fell back to (conhost>wscript)
  err TEXT,           -- curl's error text, scrubbed (first one seen)
  count BIGINT NOT NULL DEFAULT 0,
  devices TEXT[] NOT NULL DEFAULT '{}', -- anonymous computer IDs (hashes), the first 200
  device_count INT NOT NULL DEFAULT 0,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_os TEXT,
  last_reaper TEXT,
  last_ver TEXT,
  last_ms INT
);
CREATE INDEX IF NOT EXISTS client_log_groups_last_seen ON public.client_log_groups (last_seen DESC);

-- When each computer last sent a report, per product: one report a day.
CREATE TABLE IF NOT EXISTS public.client_log_devices (
  dev TEXT NOT NULL,
  product TEXT NOT NULL,
  last_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dev, product)
);

-- Only the server (service role) reads or writes them.
ALTER TABLE public.client_log_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_log_devices ENABLE ROW LEVEL SECURITY;

-- Store one report: refused when the same computer sent one for this product in the last 20 hours;
-- past 5000 kinds of error, only the known ones are counted.
CREATE OR REPLACE FUNCTION public.client_log_ingest(p_product TEXT, p_dev TEXT, p_entries JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e JSONB;
  n INT := 0;
  prev TIMESTAMPTZ;
  total INT;
BEGIN
  SELECT last_at INTO prev FROM client_log_devices WHERE dev = p_dev AND product = p_product;
  IF prev IS NOT NULL AND prev > now() - INTERVAL '20 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate');
  END IF;
  INSERT INTO client_log_devices (dev, product, last_at) VALUES (p_dev, p_product, now())
    ON CONFLICT (dev, product) DO UPDATE SET last_at = now();

  SELECT count(*) INTO total FROM client_log_groups;
  FOR e IN SELECT value FROM jsonb_array_elements(p_entries) LIMIT 50 LOOP
    IF total >= 5000 AND NOT EXISTS (SELECT 1 FROM client_log_groups WHERE sig = e->>'sig') THEN
      CONTINUE;
    END IF;
    INSERT INTO client_log_groups AS g (sig, product, what, kind, rc, http, way, err, count, devices,
        device_count, last_os, last_reaper, last_ver, last_ms)
      VALUES (e->>'sig', p_product, e->>'what', e->>'kind', (e->>'rc')::INT, (e->>'http')::INT, e->>'way',
        e->>'err', GREATEST(COALESCE((e->>'n')::INT, 1), 1), ARRAY[p_dev], 1, e->>'os', e->>'reaper',
        e->>'ver', (e->>'ms')::INT)
      ON CONFLICT (sig) DO UPDATE SET
        count = g.count + EXCLUDED.count,
        devices = CASE WHEN p_dev = ANY (g.devices) OR cardinality(g.devices) >= 200 THEN g.devices
          ELSE g.devices || p_dev END,
        device_count = g.device_count + CASE WHEN p_dev = ANY (g.devices) THEN 0 ELSE 1 END,
        last_seen = now(),
        last_os = EXCLUDED.last_os,
        last_reaper = EXCLUDED.last_reaper,
        last_ver = EXCLUDED.last_ver,
        last_ms = EXCLUDED.last_ms;
    IF NOT FOUND THEN CONTINUE; END IF;
    total := total + 1;
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'stored', n);
END;
$$;

REVOKE ALL ON FUNCTION public.client_log_ingest(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_log_ingest(TEXT, TEXT, JSONB) TO service_role;

-- To read them: SELECT product, what, kind, rc, http, way, err, count, device_count, last_seen, last_ver
--   FROM client_log_groups ORDER BY last_seen DESC;
