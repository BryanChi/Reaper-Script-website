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
			trials: {},     // email -> { expiresAt, startedAt, licenseKey }
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

function isMissingActivationsTable(err) {
	const msg = err?.message || '';
	return err?.code === 'PGRST205' || msg.includes('device_activations');
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
			licenseKey: existing.licenseKey || null,
			message: active ? 'Trial already active' : 'Trial expired'
		};
	}

	const expiresAt = now + TRIAL_DAYS * 24 * 60 * 60 * 1000;
	const licenseKey = generateLicenseKey();
	store.users[normalized] = store.users[normalized] || { email: normalized, createdAt: iso(now) };
	store.trials[normalized] = { startedAt: iso(now), expiresAt, licenseKey };
	return { ok: true, status: 'trial', expiresAt, licenseKey, message: 'Trial started' };
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

	// Check if it's a trial license key
	const trialEntry = Object.entries(store.trials).find(([email, trial]) => trial.licenseKey === licenseKey);
	if (trialEntry) {
		const [email, trial] = trialEntry;
		const active = now < trial.expiresAt;
		if (active) {
			return { ok: true, status: 'trial', expiresAt: trial.expiresAt, licenseKey: licenseKey };
		}
		return { ok: false, status: 'expired', reason: 'Trial expired', expiresAt: trial.expiresAt };
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
		// Generate license key if it doesn't exist (for existing trials)
		let licenseKey = trialRow.license_key || null;
		if (!licenseKey) {
			licenseKey = generateLicenseKey();
			// Try to update the trial with the license key
			const { error: updateErr } = await supabase
				.from('trials')
				.update({ license_key: licenseKey })
				.eq('email', normalized);
			
			// If update fails due to missing column, return error with helpful message
			if (updateErr) {
				const errorMsg = updateErr.message || '';
				if (errorMsg.includes('license_key') && (errorMsg.includes('schema cache') || errorMsg.includes('column'))) {
					return { 
						ok: false, 
						error: `Database schema error: The 'license_key' column does not exist in the 'trials' table. Please add this column to your Supabase database. Run this SQL: ALTER TABLE trials ADD COLUMN license_key TEXT;` 
					};
				}
			}
		}
		return {
			ok: true,
			status: active ? 'trial' : 'expired',
			expiresAt: new Date(trialRow.expires_at || trialRow.expiresAt).getTime(),
			licenseKey: licenseKey,
			message: active ? 'Trial already active' : 'Trial expired'
		};
	}

	const licenseKey = generateLicenseKey();
	const { error: insertErr, data: inserted } = await supabase
		.from('trials')
		.upsert({ email: normalized, started_at: iso(now), expires_at: iso(expiresAt), license_key: licenseKey })
		.select()
		.single();

	if (insertErr) {
		const errorMsg = insertErr.message || '';
		// Check if error is about missing license_key column
		if (errorMsg.includes('license_key') && (errorMsg.includes('schema cache') || errorMsg.includes('column'))) {
			return { 
				ok: false, 
				error: `Database schema error: The 'license_key' column does not exist in the 'trials' table. Please add this column to your Supabase database. Run this SQL: ALTER TABLE trials ADD COLUMN license_key TEXT;` 
			};
		}
		return { ok: false, error: insertErr.message || 'Unable to start trial' };
	}

	return { ok: true, status: 'trial', expiresAt, licenseKey, message: 'Trial started', trial: inserted };
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

	if (!licErr && licRows) {
		const lic = licRows;
		const exp = lic.expires_at ? new Date(lic.expires_at).getTime() : null;
		
		// Check if license is expired
		if (exp && now >= exp) {
			return { ok: false, status: 'expired', reason: 'License expired', expiresAt: exp };
		}

		return { ok: true, status: 'active', expiresAt: exp, licenseKey: lic.license_key };
	}

	// If not found in licenses, check if it's a trial license key
	// Note: This query will fail if license_key column doesn't exist, but that's okay
	// as it means no trials have license keys yet
	const { data: trialRow, error: trialErr } = await supabase
		.from('trials')
		.select('*')
		.eq('license_key', licenseKey)
		.single();

	// If error is about missing column, just treat as license not found
	if (trialErr) {
		const errorMsg = trialErr.message || '';
		if (errorMsg.includes('license_key') && (errorMsg.includes('schema cache') || errorMsg.includes('column'))) {
			// Column doesn't exist, so this license key can't be a trial key
			return { ok: false, status: 'invalid', reason: 'License not found or inactive' };
		}
		// Other errors (like not found) are fine, just continue
	}

	if (!trialErr && trialRow) {
		const expiresAt = new Date(trialRow.expires_at || trialRow.expiresAt).getTime();
		const active = now < expiresAt;
		if (active) {
			return { ok: true, status: 'trial', expiresAt: expiresAt, licenseKey: licenseKey };
		}
		return { ok: false, status: 'expired', reason: 'Trial expired', expiresAt: expiresAt };
	}

	return { ok: false, status: 'invalid', reason: 'License not found or inactive' };
}

async function getLicenseOrTrialStatus(email) {
	const normalized = normalizeEmail(email);
	if (!normalized) {
		return { ok: false, status: 'inactive', reason: 'Email required' };
	}

	const now = Date.now();

	if (!supabase) {
		// Memory fallback - check license first, then trial
		const store = getMemoryStore();
		const licenseEntry = Object.entries(store.licenses).find(([key, lic]) => lic.email === normalized && lic.status === 'active');
		if (licenseEntry) {
			const [licenseKey, lic] = licenseEntry;
			const notExpired = !lic.expiresAt || now < lic.expiresAt;
			if (notExpired) {
				return {
					ok: true,
					status: 'active',
					expiresAt: lic.expiresAt || null,
					licenseKey: licenseKey
				};
			}
			return { ok: false, status: 'expired', reason: 'License expired' };
		}

		// Check trial
		const trial = store.trials[normalized];
		if (trial) {
			const active = now < trial.expiresAt;
			return {
				ok: true,
				status: active ? 'trial' : 'expired',
				expiresAt: trial.expiresAt,
				licenseKey: trial.licenseKey || null,
				reason: active ? null : 'Trial expired'
			};
		}

		return { ok: false, status: 'inactive', reason: 'No active license or trial' };
	}

	// Check for active license first
	const { data: licRows, error: licErr } = await supabase
		.from('licenses')
		.select('*')
		.eq('email', normalized)
		.eq('status', 'active')
		.order('created_at', { ascending: false })
		.limit(1);

	if (!licErr && licRows && licRows.length > 0) {
		const license = licRows[0];
		const exp = license.expires_at ? new Date(license.expires_at).getTime() : null;
		if (!exp || now < exp) {
			return {
				ok: true,
				status: 'active',
				expiresAt: exp,
				licenseKey: license.license_key
			};
		}
		return { ok: false, status: 'expired', reason: 'License expired', expiresAt: exp };
	}

	// Check for trial
	const { data: trialRow, error: trialErr } = await supabase
		.from('trials')
		.select('*')
		.eq('email', normalized)
		.single();

	if (!trialErr && trialRow) {
		const expiresAt = new Date(trialRow.expires_at || trialRow.expiresAt).getTime();
		const active = now < expiresAt;
		// Return existing license key (should always exist for trials created after the update)
		const licenseKey = trialRow.license_key || null;
		return {
			ok: true,
			status: active ? 'trial' : 'expired',
			expiresAt: expiresAt,
			licenseKey: licenseKey,
			reason: active ? null : 'Trial expired'
		};
	}

	return { ok: false, status: 'inactive', reason: 'No active license or trial' };
}

async function getLicenseInfo(email) {
	const normalized = normalizeEmail(email);
	if (!normalized) {
		return { ok: false, error: 'Email required' };
	}

	if (!supabase) {
		// Memory fallback - check license first, then trial
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
		// Check for trial
		const trial = store.trials[normalized];
		if (trial) {
			const now = Date.now();
			const active = now < trial.expiresAt;
			return {
				ok: true,
				licenseKey: trial.licenseKey || null,
				status: active ? 'trial' : 'expired',
				expiresAt: trial.expiresAt || null,
				activations: []
			};
		}
		return { ok: true, licenseKey: null, status: 'inactive', activations: [] };
	}

	// Get license info - check license first, then trial
	const { data: licRows, error: licErr } = await supabase
		.from('licenses')
		.select('*')
		.eq('email', normalized)
		.eq('status', 'active')
		.order('created_at', { ascending: false })
		.limit(1);

	if (!licErr && licRows && licRows.length > 0) {
		const license = licRows[0];
		const licenseKey = license.license_key;

		// Get device activations for this license
		let activations = [];
		const { data: activationsData, error: actErr } = await supabase
			.from('device_activations')
			.select('*')
			.eq('license_key', licenseKey)
			.eq('active', true)
			.order('activated_at', { ascending: false });

		// Log errors but don't fail - return empty array if table is missing
		if (actErr) {
			const msg = actErr.message || '';
			const isMissingTable = actErr.code === 'PGRST205' || msg.includes('device_activations');
			if (!isMissingTable) {
				console.error('Error fetching device activations for license:', actErr, 'licenseKey:', licenseKey);
			}
		} else if (activationsData && Array.isArray(activationsData)) {
			activations = activationsData;
			// Debug logging to see what we got
			console.log('Device activations query result:', {
				licenseKey,
				activationsCount: activations.length,
				activationsType: typeof activations,
				isArray: Array.isArray(activations)
			});
		}

		// Also check for any activations (including inactive) for debugging
		const { data: allActivations, error: allActErr } = await supabase
			.from('device_activations')
			.select('*')
			.eq('license_key', licenseKey)
			.order('activated_at', { ascending: false });
		
		if (!allActErr && allActivations) {
			console.log('All device activations (including inactive) for license:', {
				licenseKey,
				totalCount: allActivations.length,
				activeCount: allActivations.filter(a => a.active).length,
				inactiveCount: allActivations.filter(a => !a.active).length,
				activations: allActivations
			});
		}

		return {
			ok: true,
			licenseKey,
			status: 'active',
			expiresAt: license.expires_at ? new Date(license.expires_at).getTime() : null,
			activations: (activations && Array.isArray(activations)) ? activations : []
		};
	}

	// Check for trial if no active license
	const { data: trialRow, error: trialErr } = await supabase
		.from('trials')
		.select('*')
		.eq('email', normalized)
		.single();

	if (!trialErr && trialRow) {
		const now = Date.now();
		const expiresAt = new Date(trialRow.expires_at || trialRow.expiresAt).getTime();
		const active = now < expiresAt;
		// Return existing license key (should always exist for trials created after the update)
		const licenseKey = trialRow.license_key || null;
		
		// Get device activations for this trial license key
		let activations = [];
		if (licenseKey) {
			const { data: activationsData, error: actErr } = await supabase
				.from('device_activations')
				.select('*')
				.eq('license_key', licenseKey)
				.eq('active', true)
				.order('activated_at', { ascending: false });
			
			// Log errors but don't fail - return empty array if table is missing
			if (actErr) {
				const msg = actErr.message || '';
				const isMissingTable = actErr.code === 'PGRST205' || msg.includes('device_activations');
				if (!isMissingTable) {
					console.error('Error fetching device activations for trial:', actErr, 'licenseKey:', licenseKey);
				}
			}
			
			if (!actErr && activationsData && Array.isArray(activationsData)) {
				activations = activationsData;
			}
		}
		
		return {
			ok: true,
			licenseKey: licenseKey,
			status: active ? 'trial' : 'expired',
			expiresAt: expiresAt,
			activations: activations
		};
	}

	return { ok: true, licenseKey: null, status: 'inactive', activations: [] };
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

	if (existErr) {
		if (isMissingActivationsTable(existErr)) {
			return { ok: false, error: "Device activations table missing. Create table 'public.device_activations' or disable device tracking." };
		}
		return { ok: false, error: existErr.message || 'Failed to check device activation' };
	}

	if (existing) {
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
		if (isMissingActivationsTable(insertErr)) {
			return { ok: false, error: "Device activations table missing. Create table 'public.device_activations' or disable device tracking." };
		}
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
		if (isMissingActivationsTable(updateErr)) {
			return { ok: false, error: "Device activations table missing. Create table 'public.device_activations' or disable device tracking." };
		}
		return { ok: false, error: updateErr.message || 'Failed to deactivate device' };
	}

	return { ok: true, message: 'Device deactivated successfully' };
}

module.exports = {
	startTrial,
	activateLicense,
	verifyLicense,
	getLicenseInfo,
	getLicenseOrTrialStatus,
	activateDevice,
	deactivateDevice,
	normalizeEmail,
	generateLicenseKey,
	getMemoryStore
};




