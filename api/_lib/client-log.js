// Connection-error reports from the scripts (FX Devices' License.lua, the Script Manager): each
// keeps its last 50 failed requests and sends them at most once a day, after a request that worked.
// Stored grouped by error (product + what failed + how), with a count and how many computers saw
// it, in client_log_groups (supabase_client_log_migration.sql). Never a key, email, path or name:
// the scripts scrub those, and this scrubs again.
// Reached as POST /api/device?action=client-log (Vercel Hobby allows 12 functions).
const crypto = require('crypto');
const PRODUCTS = require('./products');

let supabase = null;
try {
	const { createClient } = require('@supabase/supabase-js');
	if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
		supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
			auth: { autoRefreshToken: false, persistSession: false }
		});
	}
} catch (err) {
	// ignore; fallback to memory
}

const MAX_BODY = 32 * 1024;
const MAX_ENTRIES = 50;
const KINDS = new Set(['curl', 'http', 'timeout', 'not started', 'fallback']);
// uploads one server instance takes per hour, on top of the database's once a day per computer
const INSTANCE_PER_HOUR = 600;

function str(v, max) {
	if (v === undefined || v === null) return '';
	return String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
}

function int(v, min, max) {
	const n = Math.floor(Number(v));
	if (!Number.isFinite(n)) return null;
	return Math.min(max, Math.max(min, n));
}

// what the scripts already took out, once more: emails, keys and tokens, paths, user folders
function scrub(s) {
	return s
		.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>')
		.replace(/\b[0-9a-f]{16}-[0-9a-f]{8}\b/gi, '<x>')
		.replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<x>')
		.replace(/[A-Za-z]:[\\/][^\s"']*/g, '<path>')
		.replace(/\\\\[^\s"']+/g, '<path>')
		.replace(/(^|[\s"'(])\/(Users|home|private|var|tmp|Volumes)\/[^\s"']*/g, '$1<path>');
}

function products() {
	return new Set([...Object.keys(PRODUCTS), 'script-manager']);
}

// one entry from the script, cleaned; null when it isn't one
function cleanEntry(e, product) {
	if (!e || typeof e !== 'object') return null;
	const kind = str(e.kind, 20);
	if (!KINDS.has(kind)) return null;
	const out = {
		what: scrub(str(e.what, 120)) || '?',
		kind,
		rc: int(e.rc, -1, 1000),
		http: int(e.http, 0, 999),
		way: str(e.way, 40),
		err: scrub(str(e.err, 240)),
		os: str(e.os, 60),
		reaper: str(e.reaper, 40),
		ver: str(e.ver, 60),
		ms: int(e.ms, 0, 3600000),
		n: int(e.n, 1, 10000) || 1
	};
	// numbers in an error (ms, ports, codes) don't make it a different error
	const sig = [product, out.what, out.kind, out.rc, out.http, out.way, out.err.replace(/\d+/g, '#')].join('|');
	out.sig = crypto.createHash('sha1').update(sig).digest('hex');
	return out;
}

function memoryStore() {
	if (!global.__clientLog) global.__clientLog = { groups: {}, devices: {} };
	return global.__clientLog;
}

// the database's client_log_ingest, for local runs without Supabase
function ingestMemory(product, dev, entries) {
	const m = memoryStore();
	const k = dev + '|' + product;
	const now = Date.now();
	if (m.devices[k] && now - m.devices[k] < 20 * 3600 * 1000) return { ok: false, error: 'rate' };
	m.devices[k] = now;
	for (const e of entries) {
		const g = m.groups[e.sig] || (m.groups[e.sig] = { ...e, product, count: 0, devices: [], first_seen: now });
		g.count += e.n;
		if (!g.devices.includes(dev)) g.devices.push(dev);
		Object.assign(g, { last_seen: now, os: e.os, reaper: e.reaper, ver: e.ver, ms: e.ms });
	}
	return { ok: true, stored: entries.length };
}

let hour = { start: 0, n: 0 };

async function handleClientLog(req, res) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}
	let body = req.body;
	const size = typeof body === 'string' ? body.length : JSON.stringify(body || {}).length;
	if (size > MAX_BODY) return res.status(413).json({ ok: false, error: 'Too large' });
	if (typeof body === 'string') {
		try { body = JSON.parse(body); } catch (err) { body = null; }
	}
	if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'JSON body required' });

	const product = str(body.product, 40).toLowerCase();
	const dev = str(body.dev, 32).toLowerCase();
	if (!products().has(product)) return res.status(400).json({ ok: false, error: 'Unknown product' });
	if (!/^[0-9a-f]{8,32}$/.test(dev)) return res.status(400).json({ ok: false, error: 'Bad computer id' });
	if (!Array.isArray(body.entries)) return res.status(400).json({ ok: false, error: 'entries required' });
	const entries = body.entries.slice(-MAX_ENTRIES).map(e => cleanEntry(e, product)).filter(Boolean);
	if (entries.length === 0) return res.status(200).json({ ok: true, stored: 0 });

	const now = Date.now();
	if (now - hour.start > 3600 * 1000) hour = { start: now, n: 0 };
	if (++hour.n > INSTANCE_PER_HOUR) return res.status(429).json({ ok: false, error: 'Busy, try tomorrow' });

	let result;
	if (supabase) {
		const { data, error } = await supabase.rpc('client_log_ingest', { p_product: product, p_dev: dev, p_entries: entries });
		if (error) {
			console.error('client_log_ingest failed:', error.message);
			return res.status(500).json({ ok: false, error: 'Could not store the report' });
		}
		result = data || { ok: false };
	} else {
		result = ingestMemory(product, dev, entries);
	}
	// sent too soon after the last one: the script keeps its log and tries again tomorrow
	if (!result.ok) return res.status(result.error === 'rate' ? 429 : 400).json(result);
	return res.status(200).json({ ok: true, stored: result.stored });
}

module.exports = { handleClientLog, cleanEntry, scrub };
