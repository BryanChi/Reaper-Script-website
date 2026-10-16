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

const TRIAL_DAYS = 30;

// Each script is its own purchase: a key or trial only unlocks the product it was issued for.
// Rows saved before products existed have product = 'vertical-fx-list' (the column's default), and
// clients that send no product (Vertical FX List builds before this change) mean that product too.
const PRODUCTS = require('./products');
const DEFAULT_PRODUCT = 'vertical-fx-list';

// Known product id, the default when none is given, or null for an unknown one
function normalizeProduct(product) {
	if (product === undefined || product === null || product === '') return DEFAULT_PRODUCT;
	const id = String(product).trim().toLowerCase();
	return Object.prototype.hasOwnProperty.call(PRODUCTS, id) ? id : null;
}

function rowProduct(row) {
	return (row && row.product) || DEFAULT_PRODUCT;
}

function productName(id) {
	return (PRODUCTS[id] && PRODUCTS[id].name) || id;
}

function wrongProduct(row, product) {
	return {
		ok: false,
		status: 'invalid',
		reason: `This key is for ${productName(rowProduct(row))}, not ${productName(product)}. Each script needs its own license.`
	};
}

function memTrialId(email, product) {
	return `${email}|${product}`;
}

function getMemoryStore() {
	if (!global.__licenseStore) {
		global.__licenseStore = {
			users: {},      // email -> { email, createdAt }
			trials: {},     // 'email|product' -> { email, product, expiresAt, startedAt, licenseKey }
			licenses: {}    // licenseKey -> { email, product, status, createdAt, expiresAt }
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

async function memStartTrial(email, product) {
	const store = getMemoryStore();
	const normalized = normalizeEmail(email);
	if (!normalized) return { ok: false, error: 'Email required' };

	const now = Date.now();
	const existing = store.trials[memTrialId(normalized, product)];
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
	store.trials[memTrialId(normalized, product)] = { email: normalized, product, startedAt: iso(now), expiresAt, licenseKey };
	return { ok: true, status: 'trial', expiresAt, licenseKey, message: 'Trial started' };
}

async function memActivateLicense(email, providedKey, product) {
	const store = getMemoryStore();
	const normalized = normalizeEmail(email);
	if (!normalized) return { ok: false, error: 'Email required' };

	const now = Date.now();
	const licenseKey = providedKey || generateLicenseKey();
	store.users[normalized] = store.users[normalized] || { email: normalized, createdAt: iso(now) };
	store.licenses[licenseKey] = {
		email: normalized,
		product,
		status: 'active',
		createdAt: iso(now),
		expiresAt: null
	};

	return { ok: true, licenseKey, status: 'active', expiresAt: null };
}

async function memVerifyLicense(licenseKey, deviceId, product) {
	const store = getMemoryStore();
	const now = Date.now();

	if (!licenseKey) {
		return { ok: false, status: 'invalid', reason: 'License key required' };
	}

	// Find license by license key
	const license = store.licenses[licenseKey];
	if (license) {
		if (rowProduct(license) !== product) return wrongProduct(license, product);
		const isActive = license.status === 'active';
		const notExpired = !license.expiresAt || now < license.expiresAt;
		if (isActive && notExpired) {
			return { ok: true, status: 'active', expiresAt: license.expiresAt || null, licenseKey: licenseKey };
		}
		return { ok: false, status: 'expired', reason: 'License expired or inactive' };
	}

	// Check if it's a trial license key
	const trialEntry = Object.entries(store.trials).find(([id, trial]) => trial.licenseKey === licenseKey);
	if (trialEntry) {
		const [, trial] = trialEntry;
		if (rowProduct(trial) !== product) return wrongProduct(trial, product);
		const active = now < trial.expiresAt;
		if (active) {
			return { ok: true, status: 'trial', expiresAt: trial.expiresAt, licenseKey: licenseKey };
		}
		return { ok: false, status: 'expired', reason: 'Trial expired', expiresAt: trial.expiresAt };
	}

	return { ok: false, status: 'invalid', reason: 'License not found' };
}

async function startTrial(email, productInput) {
	const normalized = normalizeEmail(email);
	if (!normalized) return { ok: false, error: 'Email required' };
	const product = normalizeProduct(productInput);
	if (!product) return { ok: false, error: 'Unknown product' };

	if (!supabase) {
		return memStartTrial(email, product);
	}

	const now = Date.now();
	const expiresAt = now + TRIAL_DAYS * 24 * 60 * 60 * 1000;

	// Upsert user
	await supabase.from('users').upsert({ email: normalized, created_at: iso(now) });

	// Fetch this product's trial (one trial per email per product)
	const { data: trialRow, error: trialErr } = await supabase
		.from('trials')
		.select('*')
		.eq('email', normalized)
		.eq('product', product)
		.maybeSingle();

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
				.eq('email', normalized)
				.eq('product', product);
			
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
		.upsert({ email: normalized, product, started_at: iso(now), expires_at: iso(expiresAt), license_key: licenseKey }, { onConflict: 'email,product' })
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

async function activateLicense(email, providedKey, productInput) {
	const normalized = normalizeEmail(email);
	if (!normalized) return { ok: false, error: 'Email required' };
	const product = normalizeProduct(productInput);
	if (!product) return { ok: false, error: 'Unknown product' };

	if (!supabase) {
		return memActivateLicense(email, providedKey, product);
	}

	const now = Date.now();
	const licenseKey = providedKey || generateLicenseKey();

	await supabase.from('users').upsert({ email: normalized, created_at: iso(now) });

	const { error: licErr } = await supabase
		.from('licenses')
		.upsert({
			license_key: licenseKey,
			email: normalized,
			product,
			status: 'active',
			created_at: iso(now),
			expires_at: null
		});

	if (licErr) {
		return { ok: false, error: licErr.message || 'Unable to activate license' };
	}

	return { ok: true, licenseKey, status: 'active', expiresAt: null, product };
}

// The license a paid order gets. The key comes from the order id, so the same order always gets the
// same key, and an existing row (perhaps revoked after a refund) is returned as it is, never re-activated.
async function issuePurchaseLicense(email, licenseKey, productInput) {
	const normalized = normalizeEmail(email);
	if (!normalized) return { ok: false, error: 'Email required' };
	const product = normalizeProduct(productInput);
	if (!product) return { ok: false, error: 'Unknown product' };
	if (!licenseKey) return { ok: false, error: 'License key required' };

	if (!supabase) {
		const store = getMemoryStore();
		const existing = store.licenses[licenseKey];
		if (existing) return { ok: true, licenseKey, email: existing.email, status: existing.status, expiresAt: existing.expiresAt || null, product: rowProduct(existing), existing: true };
		return memActivateLicense(email, licenseKey, product);
	}

	const { data: existing, error: findErr } = await supabase
		.from('licenses')
		.select('*')
		.eq('license_key', licenseKey)
		.maybeSingle();
	if (findErr) return { ok: false, error: findErr.message || 'Unable to look up license' };
	if (existing) {
		return { ok: true, licenseKey, email: existing.email, status: existing.status, expiresAt: existing.expires_at || null, product: rowProduct(existing), existing: true };
	}

	const now = Date.now();
	await supabase.from('users').upsert({ email: normalized, created_at: iso(now) });
	const { error: insErr } = await supabase
		.from('licenses')
		.insert({ license_key: licenseKey, email: normalized, product, status: 'active', created_at: iso(now), expires_at: null });
	if (insErr) return { ok: false, error: insErr.message || 'Unable to issue license' };
	return { ok: true, licenseKey, status: 'active', expiresAt: null, product };
}

// The email of the site account a Supabase access token belongs to, or null if the token isn't valid
async function emailFromAccessToken(token) {
	if (!token || !supabase) return null;
	try {
		const { data, error } = await supabase.auth.getUser(String(token));
		if (error || !data || !data.user) return null;
		return normalizeEmail(data.user.email) || null;
	} catch (_) {
		return null;
	}
}

async function verifyLicense(licenseKey, deviceId, productInput) {
	const now = Date.now();

	if (!licenseKey) {
		return { ok: false, status: 'invalid', reason: 'License key required' };
	}
	const product = normalizeProduct(productInput);
	if (!product) return { ok: false, status: 'invalid', reason: 'Unknown product' };

	if (!supabase) {
		return memVerifyLicense(licenseKey, deviceId, product);
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
		if (rowProduct(lic) !== product) return wrongProduct(lic, product);
		const exp = lic.expires_at ? new Date(lic.expires_at).getTime() : null;
		
		// Check if license is expired
		if (exp && now >= exp) {
			return { ok: false, status: 'expired', reason: 'License expired', expiresAt: exp };
		}

		// If deviceId is provided, verify device is activated
		if (deviceId) {
			const { data: deviceActivation, error: devErr } = await supabase
				.from('device_activations')
				.select('*')
				.eq('license_key', licenseKey)
				.eq('device_id', deviceId)
				.eq('active', true)
				.maybeSingle();

			// If device_activations table doesn't exist, skip device check (backward compatibility)
			if (devErr && !isMissingActivationsTable(devErr)) {
				// Some other error occurred
				console.error('Error checking device activation:', devErr);
			}

			// If device activation check succeeded but device is not activated
			if (!devErr && !deviceActivation) {
				return { ok: false, status: 'invalid', reason: 'Device not activated for this license. Please activate your device first.' };
			}
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
		if (rowProduct(trialRow) !== product) return wrongProduct(trialRow, product);
		const expiresAt = new Date(trialRow.expires_at || trialRow.expiresAt).getTime();
		const active = now < expiresAt;
		if (active) {
			// If deviceId is provided, verify device is activated for trial
			if (deviceId) {
				const { data: deviceActivation, error: devErr } = await supabase
					.from('device_activations')
					.select('*')
					.eq('license_key', licenseKey)
					.eq('device_id', deviceId)
					.eq('active', true)
					.maybeSingle();

				// If device_activations table doesn't exist, skip device check (backward compatibility)
				if (devErr && !isMissingActivationsTable(devErr)) {
					// Some other error occurred
					console.error('Error checking device activation:', devErr);
				}

				// If device activation check succeeded but device is not activated
				if (!devErr && !deviceActivation) {
					return { ok: false, status: 'invalid', reason: 'Device not activated for this trial license. Please activate your device first.' };
				}
			}
			return { ok: true, status: 'trial', expiresAt: expiresAt, licenseKey: licenseKey };
		}
		return { ok: false, status: 'expired', reason: 'Trial expired', expiresAt: expiresAt };
	}

	return { ok: false, status: 'invalid', reason: 'License not found or inactive' };
}

async function getLicenseOrTrialStatus(email, productInput) {
	const normalized = normalizeEmail(email);
	const product = normalizeProduct(productInput);
	if (!product) {
		return { ok: false, status: 'inactive', reason: 'Unknown product', error: 'Unknown product' };
	}
	if (!normalized) {
		return { ok: false, status: 'inactive', reason: 'Email required' };
	}

	const now = Date.now();

	if (!supabase) {
		// Memory fallback - check license first, then trial
		const store = getMemoryStore();
		const licenseEntry = Object.entries(store.licenses).find(([key, lic]) => lic.email === normalized && lic.status === 'active' && rowProduct(lic) === product);
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
		const trial = store.trials[memTrialId(normalized, product)];
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
		.eq('product', product)
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
		.eq('product', product)
		.maybeSingle();

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

async function getLicenseInfo(email, productInput) {
	const normalized = normalizeEmail(email);
	const product = normalizeProduct(productInput);
	if (!product) {
		return { ok: false, status: 'inactive', reason: 'Unknown product', error: 'Unknown product' };
	}
	if (!normalized) {
		return { ok: false, error: 'Email required' };
	}

	if (!supabase) {
		// Memory fallback - check license first, then trial
		const store = getMemoryStore();
		const licenseEntry = Object.entries(store.licenses).find(([key, lic]) => lic.email === normalized && lic.status === 'active' && rowProduct(lic) === product);
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
		const trial = store.trials[memTrialId(normalized, product)];
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
		.eq('product', product)
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
		.eq('product', product)
		.maybeSingle();

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

const MAX_ACTIVE_DEVICES = 3;

// The license or trial row behind this key, when it belongs to this email (trial keys activate
// computers too, or a trial could never pass the device check in the scripts)
async function findOwnedKey(email, licenseKey) {
	const { data: lic } = await supabase
		.from('licenses')
		.select('*')
		.eq('email', email)
		.eq('license_key', licenseKey)
		.eq('status', 'active')
		.maybeSingle();
	if (lic) return lic;
	const { data: trial } = await supabase
		.from('trials')
		.select('*')
		.eq('email', email)
		.eq('license_key', licenseKey)
		.maybeSingle();
	if (trial && Date.now() < new Date(trial.expires_at).getTime()) return trial;
	return null;
}

async function activateDevice(email, licenseKey, deviceId) {
	const normalized = normalizeEmail(email);
	if (!normalized || !deviceId) {
		return { ok: false, error: 'Email and device ID required' };
	}

	if (!supabase) {
		return { ok: false, error: 'Device activation requires Supabase' };
	}

	// Verify the license or trial belongs to user
	if (!(await findOwnedKey(normalized, licenseKey))) {
		return { ok: false, error: 'License not found or invalid' };
	}

	const now = Date.now();

	// Check if device is already activated
	const { data: existing, error: existErr } = await supabase
		.from('device_activations')
		.select('*')
		.eq('license_key', licenseKey)
		.eq('device_id', deviceId)
		.maybeSingle();

	if (existErr) {
		if (isMissingActivationsTable(existErr)) {
			return { ok: false, error: "Device activations table missing. Create table 'public.device_activations' or disable device tracking." };
		}
		return { ok: false, error: existErr.message || 'Failed to check device activation' };
	}

	if (existing) {
		// Reactivate if inactive
		if (!existing.active) {
			// Enforce max active devices before reactivating
			const { data: activeDevices, error: countErr } = await supabase
				.from('device_activations')
				.select('id')
				.eq('license_key', licenseKey)
				.eq('active', true)
				.limit(MAX_ACTIVE_DEVICES + 1);

			if (countErr) {
				if (isMissingActivationsTable(countErr)) {
					return { ok: false, error: "Device activations table missing. Create table 'public.device_activations' or disable device tracking." };
				}
				return { ok: false, error: countErr.message || 'Failed to check active device count' };
			}

			if (activeDevices && activeDevices.length >= MAX_ACTIVE_DEVICES) {
				return { ok: false, error: `License key has reached the maximum of ${MAX_ACTIVE_DEVICES} active devices. Please deactivate a device first.` };
			}

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

	// Check how many active devices this license key already has
	const { data: activeDevices, error: countErr } = await supabase
		.from('device_activations')
		.select('id')
		.eq('license_key', licenseKey)
		.eq('active', true)
		.limit(MAX_ACTIVE_DEVICES + 1);

	if (countErr) {
		if (isMissingActivationsTable(countErr)) {
			return { ok: false, error: "Device activations table missing. Create table 'public.device_activations' or disable device tracking." };
		}
		return { ok: false, error: countErr.message || 'Failed to check active device count' };
	}

	// Enforce max active devices
	if (activeDevices && activeDevices.length >= MAX_ACTIVE_DEVICES) {
		return { ok: false, error: `License key has reached the maximum of ${MAX_ACTIVE_DEVICES} active devices. Please deactivate a device first.` };
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

	// Verify the license or trial belongs to user
	if (!(await findOwnedKey(normalized, licenseKey))) {
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
	issuePurchaseLicense,
	emailFromAccessToken,
	verifyLicense,
	getLicenseInfo,
	getLicenseOrTrialStatus,
	activateDevice,
	deactivateDevice,
	normalizeEmail,
	normalizeProduct,
	DEFAULT_PRODUCT,
	generateLicenseKey,
	getMemoryStore
};




