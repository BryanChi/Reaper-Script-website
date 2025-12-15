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

async function memVerifyLicense(licenseKey, deviceId) {
	const store = getMemoryStore();
	const now = Date.now();

	if (!licenseKey) {
		return { ok: false, status: 'invalid', reason: 'License key required' };
	}

	// Find license by license key
	const license = store.licenses[licenseKey];
	if (license) {
		const isActive = license.status === 'active';
		const notExpired = !license.expiresAt || now < license.expiresAt;
		if (isActive && notExpired) {
			return { ok: true, status: 'active', expiresAt: license.expiresAt || null, licenseKey: licenseKey };
		}
		return { ok: false, status: 'expired', reason: 'License expired or inactive' };
	}

	return { ok: false, status: 'invalid', reason: 'License not found' };
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

async function verifyLicense(licenseKey, deviceId) {
	const now = Date.now();

	if (!licenseKey) {
		return { ok: false, status: 'invalid', reason: 'License key required' };
	}

	if (!supabase) {
		return memVerifyLicense(licenseKey, deviceId);
	}

	// Look up license by license key
	const { data: licRows, error: licErr } = await supabase
		.from('licenses')
		.select('*')
		.eq('license_key', licenseKey)
		.eq('status', 'active')
		.single();

	if (licErr || !licRows) {
		return { ok: false, status: 'invalid', reason: 'License not found or inactive' };
	}

	const lic = licRows;
	const exp = lic.expires_at ? new Date(lic.expires_at).getTime() : null;
	
	// Check if license is expired
	if (exp && now >= exp) {
		return { ok: false, status: 'expired', reason: 'License expired', expiresAt: exp };
	}

	return { ok: true, status: 'active', expiresAt: exp, licenseKey: lic.license_key };
}

async function getLicenseInfo(email) {
	const normalized = normalizeEmail(email);
	if (!normalized) {
		return { ok: false, error: 'Email required' };
	}

	if (!supabase) {
		// Memory fallback - return basic info
		const store = getMemoryStore();
		const licenseEntry = Object.entries(store.licenses).find(([key, lic]) => lic.email === normalized && lic.status === 'active');
		if (licenseEntry) {
			const [licenseKey, lic] = licenseEntry;
			return {
				ok: true,
				licenseKey,
				status: 'active',
				expiresAt: lic.expiresAt || null,
				activations: [] // Memory store doesn't support activations
			};
		}
		return { ok: true, licenseKey: null, status: 'inactive', activations: [] };
	}

	// Get license info
	const { data: licRows, error: licErr } = await supabase
		.from('licenses')
		.select('*')
		.eq('email', normalized)
		.eq('status', 'active')
		.order('created_at', { ascending: false })
		.limit(1);

	if (licErr || !licRows || licRows.length === 0) {
		return { ok: true, licenseKey: null, status: 'inactive', activations: [] };
	}

	const license = licRows[0];
	const licenseKey = license.license_key;

	// Get device activations for this license
	const { data: activations, error: actErr } = await supabase
		.from('device_activations')
		.select('*')
		.eq('license_key', licenseKey)
		.eq('active', true)
		.order('activated_at', { ascending: false });

	return {
		ok: true,
		licenseKey,
		status: 'active',
		expiresAt: license.expires_at ? new Date(license.expires_at).getTime() : null,
		activations: activations || []
	};
}

async function activateDevice(email, licenseKey, deviceId) {
	const normalized = normalizeEmail(email);
	if (!normalized || !deviceId) {
		return { ok: false, error: 'Email and device ID required' };
	}

	if (!supabase) {
		return { ok: false, error: 'Device activation requires Supabase' };
	}

	// Verify license belongs to user
	const { data: licRows, error: licErr } = await supabase
		.from('licenses')
		.select('*')
		.eq('email', normalized)
		.eq('license_key', licenseKey)
		.eq('status', 'active')
		.single();

	if (licErr || !licRows) {
		return { ok: false, error: 'License not found or invalid' };
	}

	const now = Date.now();

	// Check if device is already activated
	const { data: existing, error: existErr } = await supabase
		.from('device_activations')
		.select('*')
		.eq('license_key', licenseKey)
		.eq('device_id', deviceId)
		.single();

	if (!existErr && existing) {
		// Reactivate if inactive
		if (!existing.active) {
			const { error: updateErr } = await supabase
				.from('device_activations')
				.update({ active: true, activated_at: iso(now) })
				.eq('id', existing.id);
			if (updateErr) {
				return { ok: false, error: updateErr.message || 'Failed to reactivate device' };
			}
		}
		return { ok: true, message: 'Device already activated' };
	}

	// Create new activation
	const { error: insertErr } = await supabase
		.from('device_activations')
		.insert({
			license_key: licenseKey,
			device_id: deviceId,
			active: true,
			activated_at: iso(now)
		});

	if (insertErr) {
		return { ok: false, error: insertErr.message || 'Failed to activate device' };
	}

	return { ok: true, message: 'Device activated successfully' };
}

async function deactivateDevice(email, licenseKey, deviceId) {
	const normalized = normalizeEmail(email);
	if (!normalized || !deviceId) {
		return { ok: false, error: 'Email and device ID required' };
	}

	if (!supabase) {
		return { ok: false, error: 'Device deactivation requires Supabase' };
	}

	// Verify license belongs to user
	const { data: licRows, error: licErr } = await supabase
		.from('licenses')
		.select('*')
		.eq('email', normalized)
		.eq('license_key', licenseKey)
		.eq('status', 'active')
		.single();

	if (licErr || !licRows) {
		return { ok: false, error: 'License not found or invalid' };
	}

	// Deactivate device
	const { error: updateErr } = await supabase
		.from('device_activations')
		.update({ active: false })
		.eq('license_key', licenseKey)
		.eq('device_id', deviceId)
		.eq('active', true);

	if (updateErr) {
		return { ok: false, error: updateErr.message || 'Failed to deactivate device' };
	}

	return { ok: true, message: 'Device deactivated successfully' };
}

module.exports = {
	startTrial,
	activateLicense,
	verifyLicense,
	getLicenseInfo,
	activateDevice,
	deactivateDevice,
	normalizeEmail
};




