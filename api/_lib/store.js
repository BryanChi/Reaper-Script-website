// Store helpers using Supabase (service role) with in-memory fallback for local/dev.
const crypto = require('crypto');
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

const TRIAL_DAYS = 14;

function getMemoryStore() {
	if (!global.__licenseStore) {
		global.__licenseStore = {
			users: {},      // email -> { email, createdAt }
			trials: {},     // email -> { expiresAt, startedAt }
			licenses: {}    // licenseKey -> { email, status, createdAt, expiresAt }
		};
	}
	return global.__licenseStore;
}

function normalizeEmail(email) {
	return (email || '').trim().toLowerCase();
}

function iso(date) {
	return new Date(date).toISOString();
}

function generateLicenseKey() {
	return `${crypto.randomBytes(8).toString('hex')}-${crypto.randomBytes(4).toString('hex')}`;
}

async function memStartTrial(email) {
	const store = getMemoryStore();
	const normalized = normalizeEmail(email);
	if (!normalized) return { ok: false, error: 'Email required' };

	const now = Date.now();
	const existing = store.trials[normalized];
	if (existing) {
		const active = now < existing.expiresAt;
		return {
			ok: true,
			status: active ? 'trial' : 'expired',
			expiresAt: existing.expiresAt,
			message: active ? 'Trial already active' : 'Trial expired'
		};
	}

	const expiresAt = now + TRIAL_DAYS * 24 * 60 * 60 * 1000;
	store.users[normalized] = store.users[normalized] || { email: normalized, createdAt: iso(now) };
	store.trials[normalized] = { startedAt: iso(now), expiresAt };
	return { ok: true, status: 'trial', expiresAt, message: 'Trial started' };
}

async function memActivateLicense(email, providedKey) {
	const store = getMemoryStore();
	const normalized = normalizeEmail(email);
	if (!normalized) return { ok: false, error: 'Email required' };

	const now = Date.now();
	const licenseKey = providedKey || generateLicenseKey();
	store.users[normalized] = store.users[normalized] || { email: normalized, createdAt: iso(now) };
	store.licenses[licenseKey] = {
		email: normalized,
		status: 'active',
		createdAt: iso(now),
		expiresAt: null
	};

	return { ok: true, licenseKey, status: 'active', expiresAt: null };
}

async function memVerifyLicense(email, licenseKey) {
	const store = getMemoryStore();
	const normalized = normalizeEmail(email);
	const now = Date.now();

	if (!normalized) {
		return { ok: false, status: 'invalid', reason: 'Email required' };
	}

	if (licenseKey) {
		const lic = store.licenses[licenseKey];
		if (lic && lic.email === normalized && lic.status === 'active' && (!lic.expiresAt || now < lic.expiresAt)) {
			return { ok: true, status: 'active', expiresAt: lic.expiresAt || null, licenseKey };
		}
	}

	const trial = store.trials[normalized];
	if (trial) {
		if (now < trial.expiresAt) {
			return { ok: true, status: 'trial', expiresAt: trial.expiresAt };
		}
		return { ok: true, status: 'expired', expiresAt: trial.expiresAt };
	}

	return { ok: true, status: 'inactive', reason: 'No trial or license' };
}

async function startTrial(email) {
	const normalized = normalizeEmail(email);
	if (!normalized) return { ok: false, error: 'Email required' };

	if (!supabase) {
		return memStartTrial(email);
	}

	const now = Date.now();
	const expiresAt = now + TRIAL_DAYS * 24 * 60 * 60 * 1000;

	// Upsert user
	await supabase.from('users').upsert({ email: normalized, created_at: iso(now) });

	// Fetch existing trial
	const { data: trialRow, error: trialErr } = await supabase
		.from('trials')
		.select('*')
		.eq('email', normalized)
		.single();

	if (!trialErr && trialRow) {
		const active = now < new Date(trialRow.expires_at || trialRow.expiresAt || 0).getTime();
		return {
			ok: true,
			status: active ? 'trial' : 'expired',
			expiresAt: new Date(trialRow.expires_at || trialRow.expiresAt).getTime(),
			message: active ? 'Trial already active' : 'Trial expired'
		};
	}

	const { error: insertErr, data: inserted } = await supabase
		.from('trials')
		.upsert({ email: normalized, started_at: iso(now), expires_at: iso(expiresAt) })
		.select()
		.single();

	if (insertErr) {
		return { ok: false, error: insertErr.message || 'Unable to start trial' };
	}

	return { ok: true, status: 'trial', expiresAt, message: 'Trial started', trial: inserted };
}

async function activateLicense(email, providedKey) {
	const normalized = normalizeEmail(email);
	if (!normalized) return { ok: false, error: 'Email required' };

	if (!supabase) {
		return memActivateLicense(email, providedKey);
	}

	const now = Date.now();
	const licenseKey = providedKey || generateLicenseKey();

	await supabase.from('users').upsert({ email: normalized, created_at: iso(now) });

	const { error: licErr } = await supabase
		.from('licenses')
		.upsert({
			license_key: licenseKey,
			email: normalized,
			status: 'active',
			created_at: iso(now),
			expires_at: null
		});

	if (licErr) {
		return { ok: false, error: licErr.message || 'Unable to activate license' };
	}

	return { ok: true, licenseKey, status: 'active', expiresAt: null };
}

async function verifyLicense(email, licenseKey) {
	const normalized = normalizeEmail(email);
	const now = Date.now();

	if (!normalized) {
		return { ok: false, status: 'invalid', reason: 'Email required' };
	}

	if (!supabase) {
		return memVerifyLicense(email, licenseKey);
	}

	// Check license
	if (licenseKey) {
		const { data: lic, error: licErr } = await supabase
			.from('licenses')
			.select('*')
			.eq('license_key', licenseKey)
			.single();

		if (!licErr && lic && lic.email === normalized && lic.status === 'active') {
			const exp = lic.expires_at ? new Date(lic.expires_at).getTime() : null;
			if (!exp || now < exp) {
				return { ok: true, status: 'active', expiresAt: exp, licenseKey };
			}
		}
	}

	// Fallback to trial
	const { data: trial, error: trialErr } = await supabase
		.from('trials')
		.select('*')
		.eq('email', normalized)
		.single();

	if (!trialErr && trial) {
		const exp = new Date(trial.expires_at).getTime();
		if (now < exp) {
			return { ok: true, status: 'trial', expiresAt: exp };
		}
		return { ok: true, status: 'expired', expiresAt: exp };
	}

	return { ok: true, status: 'inactive', reason: 'No trial or license' };
}

module.exports = {
	startTrial,
	activateLicense,
	verifyLicense,
	normalizeEmail
};
