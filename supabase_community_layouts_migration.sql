-- FX Devices community layouts (api/_lib/community-layouts.js). Run once in the Supabase SQL editor.

-- every layout someone shared; status: reviewing -> pending | approved | rejected, approved -> revoked
create table if not exists community_layouts (
	id uuid primary key default gen_random_uuid(),
	plugin text not null,
	title text,
	source text not null,
	signature text,
	version integer,
	status text not null default 'reviewing',
	review jsonb,
	key_hash text not null,        -- sha256 of the sharer's license key, not the key
	ident text,
	param_hash text,
	num_params integer,
	created_at timestamptz not null default now(),
	decided_at timestamptz
);
create index if not exists community_layouts_plugin on community_layouts (plugin, status, version desc);
create index if not exists community_layouts_status on community_layouts (status, created_at desc);

-- each generate / review Claude runs: for the job FX Devices polls, the per-license limits and the daily budget
create table if not exists community_layout_jobs (
	id uuid primary key default gen_random_uuid(),
	kind text not null,              -- generate | share
	key_hash text not null,
	status text not null default 'running', -- running | done | failed
	result jsonb,
	error text,
	cost_usd numeric not null default 0,
	created_at timestamptz not null default now(),
	finished_at timestamptz
);
create index if not exists community_layout_jobs_key on community_layout_jobs (key_hash, kind, created_at desc);
create index if not exists community_layout_jobs_created on community_layout_jobs (created_at desc);

-- only the server (service role) reads and writes these
alter table community_layouts enable row level security;
alter table community_layout_jobs enable row level security;
