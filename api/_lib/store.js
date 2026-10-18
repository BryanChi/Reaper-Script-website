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

// A purchase includes this many years of updates: releases published after that still need a new
// purchase, but the copy already installed keeps working. Buying the same script again with the same
// email adds the years to that license (same key, same computers) instead of issuing a new one.
const UPDATE_YEARS = 2;

function addYears(ms, years) {
	const d = new Date(ms);
	d.setUTCFullYear(d.getUTCFullYear() + years);
	return d.getTime();
}

// When a license's updates end (ms): its updates_until, or purchase date + UPDATE_YEARS for rows
// that have none (issued before renewals, or added on the admin page)
function updatesUntil(row) {
	if (!row) return null;
	const until = row.updates_until || row.updatesUntil;
	if (until) return new Date(until).getTime();
	const created = row.created_at || row.createdAt;
	return created ? addYears(new Date(created).getTime(), UPDATE_YEARS) : null;
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
			return { ok: true, status: 'active', expiresAt: license.expiresAt || null, updatesUntil: updatesUntil(license), licenseKey: licenseKey };
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
// When the buyer already has an active license for this script, the order renews it instead: its
// updates run UPDATE_YEARS longer (from today, or from their current end if that's later) and the
// buyer keeps their key and computers. The order's own key is then saved as an inactive row that
// "renews" the license, so a repeated request for the same order doesn't renew it twice.
async function issuePurchaseLicense(email, licenseKey, productInput) {
	const normalized = normalizeEmail(email);
	if (!normalized) return { ok: false, error: 'Email required' };
	const product = normalizeProduct(productInput);
	if (!product) return { ok: false, error: 'Unknown product' };
	if (!licenseKey) return { ok: false, error: 'License key required' };

	if (!supabase) {
		const store = getMemoryStore();
		const existing = store.licenses[licenseKey];
		if (existing && existing.renews) {
			const lic = store.licenses[existing.renews];
			return { ok: true, licenseKey: existing.renews, email: lic.email, status: lic.status, expiresAt: lic.expiresAt || null, updatesUntil: updatesUntil(lic), product, renewed: true, existing: true };
		}
		if (existing) return { ok: true, licenseKey, email: existing.email, status: existing.status, expiresAt: existing.expiresAt || null, updatesUntil: updatesUntil(existing), product: rowProduct(existing), existing: true };
		const current = Object.entries(store.licenses).find(([, l]) => l.email === normalized && l.status === 'active' && rowProduct(l) === product && !l.expiresAt);
		if (current) {
			const [currentKey, lic] = current;
			lic.updatesUntil = iso(addYears(Math.max(Date.now(), updatesUntil(lic) || 0), UPDATE_YEARS));
			store.licenses[licenseKey] = { email: normalized, product, status: 'inactive', createdAt: iso(Date.now()), expiresAt: Date.now(), renews: currentKey };
			return { ok: true, licenseKey: currentKey, status: 'active', expiresAt: null, updatesUntil: updatesUntil(lic), product, renewed: true };
		}
		const made = await memActivateLicense(email, licenseKey, product);
		return Object.assign(made, { updatesUntil: updatesUntil(store.licenses[licenseKey]), product });
	}

	const { data: existing, error: findErr } = await supabase
		.from('licenses')
		.select('*')
		.eq('license_key', licenseKey)
		.maybeSingle();
	if (findErr) return { ok: false, error: findErr.message || 'Unable to look up license' };
	if (existing && existing.renews) {
		const { data: lic } = await supabase.from('licenses').select('*').eq('license_key', existing.renews).maybeSingle();
		if (lic) return { ok: true, licenseKey: lic.license_key, email: lic.email, status: lic.status, expiresAt: lic.expires_at || null, updatesUntil: updatesUntil(lic), product: rowProduct(lic), renewed: true, existing: true };
	}
	if (existing) {
		return { ok: true, licenseKey, email: existing.email, status: existing.status, expiresAt: existing.expires_at || null, updatesUntil: updatesUntil(existing), product: rowProduct(existing), existing: true };
	}

	// The license this order renews: the buyer's newest active one for this script (one that never
	// expires, so a time-limited key handed out on the admin page isn't the one extended)
	const { data: currentRows, error: curErr } = await supabase
		.from('licenses')
		.select('*')
		.eq('email', normalized)
		.eq('product', product)
		.eq('status', 'active')
		.is('expires_at', null)
		.order('created_at', { ascending: false })
		.limit(1);
	if (curErr) return { ok: false, error: curErr.message || 'Unable to look up license' };
	const current = currentRows && currentRows[0];
	if (current) {
		const now = Date.now();
		const until = addYears(Math.max(now, updatesUntil(current) || 0), UPDATE_YEARS);
		// the order's row first: its key is unique, so two requests for one order can't both renew
		const { error: markErr } = await supabase
			.from('licenses')
			.insert({ license_key: licenseKey, email: normalized, product, status: 'inactive', created_at: iso(now), expires_at: iso(now), renews: current.license_key });
		if (markErr) {
			if (markErr.code === '23505') return issuePurchaseLicense(email, licenseKey, product);
			return { ok: false, error: markErr.message || 'Unable to renew license' };
		}
		const { error: updErr } = await supabase
			.from('licenses')
			.update({ updates_until: iso(until) })
			.eq('license_key', current.license_key);
		if (updErr) {
			// undo, so asking again for this order renews it
			await supabase.from('licenses').delete().eq('license_key', licenseKey);
			return { ok: false, error: updErr.message || 'Unable to renew license' };
		}
		return { ok: true, licenseKey: current.license_key, email: current.email, status: 'active', expiresAt: null, updatesUntil: until, product, renewed: true };
	}

	const now = Date.now();
	await supabase.from('users').upsert({ email: normalized, created_at: iso(now) });
	const { error: insErr } = await supabase
		.from('licenses')
		.insert({ license_key: licenseKey, email: normalized, product, status: 'active', created_at: iso(now), expires_at: null });
	if (insErr) return { ok: false, error: insErr.message || 'Unable to issue license' };
	return { ok: true, licenseKey, status: 'active', expiresAt: null, updatesUntil: addYears(now, UPDATE_YEARS), product };
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

			// A failed lookup can't prove this computer is activated: answer "try again later" so the
			// script keeps its offline grace instead of unlocking (or locking out) the computer
			if (devErr) {
				console.error('Error checking device activation:', devErr);
				return { ok: false, retry: true, status: 'invalid', reason: 'License check unavailable, try again later' };
			}

			if (!deviceActivation) {
				return { ok: false, status: 'invalid', reason: 'Device not activated for this license. Please activate your device first.' };
			}
		}

		return { ok: true, status: 'active', expiresAt: exp, updatesUntil: updatesUntil(lic), licenseKey: lic.license_key };
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

				if (devErr) {
					console.error('Error checking device activation:', devErr);
					return { ok: false, retry: true, status: 'invalid', reason: 'License check unavailable, try again later' };
				}

				if (!deviceActivation) {
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
					updatesUntil: updatesUntil(lic),
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
				updatesUntil: updatesUntil(license),
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
				updatesUntil: updatesUntil(lic),
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
			updatesUntil: updatesUntil(license),
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

// ---------------------------------------------------------------------------------------------
// "Sign in with browser" for the scripts (the device-code flow other desktop apps use).
// The script asks for a link: it gets a secret device code (only the script ever sees it) and a
// short user code that goes in the /link page URL. The person signs in on that page and confirms;
// the code is then tied to their account. The script polls with the device code and gets the key
// of the license or trial that account's email holds for that product. Only a hash of the device
// code is stored. Rows live in public.license_links (supabase_license_links_migration.sql).
// ---------------------------------------------------------------------------------------------
const LINK_TTL_MS = 10 * 60 * 1000;
const LINK_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I

function sha256(str) {
	return crypto.createHash('sha256').update(String(str)).digest('hex');
}

function makeUserCode() {
	let out = '';
	for (let i = 0; i < 8; i++) out += LINK_CODE_CHARS[crypto.randomInt(LINK_CODE_CHARS.length)];
	return `${out.slice(0, 4)}-${out.slice(4)}`;
}

// 'abcd2345', 'ABCD-2345' and ' abcd 2345 ' are the same code; null when it can't be one
function normalizeUserCode(code) {
	const raw = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
	if (raw.length !== 8) return null;
	return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function memLinks() {
	const store = getMemoryStore();
	if (!store.links) store.links = {}; // device code hash -> row
	return store.links;
}

async function linkRowByUserCode(userCode) {
	if (!supabase) return Object.values(memLinks()).find(l => l.user_code === userCode) || null;
	const { data } = await supabase.from('license_links').select('*').eq('user_code', userCode).maybeSingle();
	return data || null;
}

async function linkRowByDeviceCode(deviceCode) {
	const hash = sha256(deviceCode);
	if (!supabase) return memLinks()[hash] || null;
	const { data } = await supabase.from('license_links').select('*').eq('device_code_hash', hash).maybeSingle();
	return data || null;
}

async function updateLinkRow(row, fields) {
	if (!supabase) {
		Object.assign(memLinks()[row.device_code_hash] || {}, fields);
		return null;
	}
	const { error } = await supabase.from('license_links').update(fields).eq('device_code_hash', row.device_code_hash);
	return error;
}

function linkExpired(row) {
	return !row || Date.now() > new Date(row.expires_at).getTime();
}

async function startLink(productInput) {
	const product = normalizeProduct(productInput);
	if (!product) return { ok: false, error: 'Unknown product' };
	const deviceCode = crypto.randomBytes(24).toString('hex');
	const expiresAt = iso(Date.now() + LINK_TTL_MS);

	if (!supabase) {
		const userCode = makeUserCode();
		memLinks()[sha256(deviceCode)] = { device_code_hash: sha256(deviceCode), user_code: userCode, product, email: null, expires_at: expiresAt, linked_at: null };
		return { ok: true, deviceCode, userCode, product, expiresIn: LINK_TTL_MS / 1000 };
	}

	// old rows are useless after they expire; clear them out now and then
	await supabase.from('license_links').delete().lt('expires_at', iso(Date.now() - 24 * 60 * 60 * 1000));

	for (let attempt = 0; attempt < 3; attempt++) {
		const userCode = makeUserCode();
		const { error } = await supabase.from('license_links').insert({
			device_code_hash: sha256(deviceCode), user_code: userCode, product,
			created_at: iso(Date.now()), expires_at: expiresAt
		});
		if (!error) return { ok: true, deviceCode, userCode, product, expiresIn: LINK_TTL_MS / 1000 };
		if (error.code !== '23505') return { ok: false, error: error.message || 'Unable to start sign-in' }; // 23505 = user code taken
	}
	return { ok: false, error: 'Unable to start sign-in' };
}

// What the /link page shows before and after the person confirms
async function linkInfo(userCodeInput) {
	const userCode = normalizeUserCode(userCodeInput);
	const row = userCode && await linkRowByUserCode(userCode);
	if (!row) return { ok: false, status: 'invalid', error: 'This sign-in link is not valid. Start again from the script.' };
	const base = { ok: true, userCode, product: rowProduct(row), productName: productName(rowProduct(row)) };
	if (linkExpired(row)) return { ...base, status: 'expired' };
	return { ...base, status: row.email ? 'linked' : 'pending' };
}

// Ties the code to the signed-in account. The email always comes from the verified access token.
async function confirmLink(userCodeInput, accessToken) {
	const email = await emailFromAccessToken(accessToken);
	if (!email) return { ok: false, error: 'Sign in first.' };
	const userCode = normalizeUserCode(userCodeInput);
	const row = userCode && await linkRowByUserCode(userCode);
	if (!row) return { ok: false, error: 'This sign-in link is not valid. Start again from the script.' };
	if (linkExpired(row)) return { ok: false, error: 'This sign-in link has expired. Start again from the script.' };
	if (row.email && row.email !== email) return { ok: false, error: 'This link was already used by another account.' };
	if (!row.email) {
		const err = await updateLinkRow(row, { email, linked_at: iso(Date.now()) });
		if (err) return { ok: false, error: err.message || 'Unable to link this computer' };
	}
	const product = rowProduct(row);
	const lic = await getLicenseOrTrialStatus(email, product);
	const usable = lic.ok && (lic.status === 'active' || lic.status === 'trial') && !!lic.licenseKey;
	return { ok: true, email, product, productName: productName(product), hasLicense: usable, licenseStatus: lic.status || 'inactive' };
}

// From the /link page when the account has no license yet: starts the trial for the signed-in
// email, so the waiting script picks it up on its next poll.
async function linkStartTrial(userCodeInput, accessToken) {
	const email = await emailFromAccessToken(accessToken);
	if (!email) return { ok: false, error: 'Sign in first.' };
	const userCode = normalizeUserCode(userCodeInput);
	const row = userCode && await linkRowByUserCode(userCode);
	if (!row || linkExpired(row)) return { ok: false, error: 'This sign-in link has expired. Start again from the script.' };
	if (row.email !== email) return { ok: false, error: 'Confirm this computer first.' };
	return startTrial(email, rowProduct(row));
}

// From the /link page: emails a one-click sign-in link, so a buyer whose email isn't a Google
// account (or who never set a password) can still sign in as the email the key was sent to. The
// account is created on first use. Only works for a live link code from a script.
async function linkEmail(userCodeInput, emailInput) {
	const email = normalizeEmail(emailInput);
	if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Enter your email address.' };
	const userCode = normalizeUserCode(userCodeInput);
	const row = userCode && await linkRowByUserCode(userCode);
	if (!row || linkExpired(row)) return { ok: false, error: 'This sign-in link has expired. Start again from the script.' };
	if (row.email) return { ok: false, error: 'This computer is already signed in.' };
	if (!supabase) return { ok: false, error: 'Email sign-in requires Supabase' };

	const redirectTo = `https://www.coolreaperscripts.com/link?code=${encodeURIComponent(userCode)}`;
	const { data, error } = await supabase.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } });
	const actionLink = data && data.properties && data.properties.action_link;
	if (error || !actionLink) return { ok: false, error: (error && error.message) || 'Couldn\'t create the sign-in link.' };

	let Resend;
	try { ({ Resend } = require('resend')); } catch (_) { /* not installed */ }
	const from = (process.env.RESEND_FROM_EMAIL || '').trim().replace(/^["']|["']$/g, '');
	if (!Resend || !process.env.RESEND_API_KEY || !from) return { ok: false, error: 'Email sign-in isn\'t set up on the site.' };
	const name = productName(rowProduct(row));
	const { error: sendErr } = await new Resend(process.env.RESEND_API_KEY).emails.send({
		from,
		to: email,
		subject: `Sign in to activate ${name}`,
		html: `<div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
			<h2 style="margin-top: 0;">Sign in to activate ${name}</h2>
			<p>Click the button to sign in to Cool Reaper Scripts as ${email} and activate ${name} on the computer showing the code <b>${userCode}</b>.</p>
			<p style="margin: 28px 0;"><a href="${actionLink}" style="background: #111; color: #fff; padding: 12px 22px; text-decoration: none; font-weight: 600;">Sign in</a></p>
			<p style="color: #6b7280; font-size: 13px;">The link works once and expires soon. If you didn't ask for it, ignore this email.</p>
		</div>`
	});
	if (sendErr) return { ok: false, error: sendErr.message || 'Couldn\'t send the email.' };
	return { ok: true, sent: true };
}

// The script's poll. pending -> linked (with the key) or no-license (signed in, but that account
// has no license or trial for this product yet; keeps answering until the link expires).
// Signing in is the only way a computer gets activated: the script sends its device ID with the
// poll and the server adds that computer to the account's license before handing over the key.
// limit = the license already has its 3 computers; keeps answering until the link expires, so
// the person can deactivate one on the site and the waiting script carries on.
async function pollLink(deviceCode, deviceId) {
	if (!deviceCode) return { ok: false, status: 'invalid', error: 'Device code required' };
	const row = await linkRowByDeviceCode(deviceCode);
	if (!row) return { ok: true, status: 'invalid' };
	if (linkExpired(row)) return { ok: true, status: 'expired' };
	if (!row.email) return { ok: true, status: 'pending' };
	const lic = await getLicenseOrTrialStatus(row.email, rowProduct(row));
	if (lic.ok && (lic.status === 'active' || lic.status === 'trial') && lic.licenseKey) {
		if (!deviceId) {
			return { ok: true, status: 'invalid', error: 'Update the script to sign in on this computer.' };
		}
		const act = await activateDevice(row.email, lic.licenseKey, String(deviceId));
		if (!act.ok) {
			const limit = /maximum of/.test(act.error || '');
			return { ok: true, status: limit ? 'limit' : 'error', email: row.email, error: act.error || 'Unable to activate this computer' };
		}
		// one key per link: the code can't be polled again
		if (supabase) await supabase.from('license_links').delete().eq('device_code_hash', row.device_code_hash);
		else delete memLinks()[row.device_code_hash];
		return { ok: true, status: 'linked', email: row.email, licenseKey: lic.licenseKey, licenseStatus: lic.status, expiresAt: lic.expiresAt || null };
	}
	return { ok: true, status: 'no-license', email: row.email, licenseStatus: lic.status || 'inactive' };
}

// The code stamped into every script download (api/scripts.js): who downloaded it, without
// putting the key or email in the file. The admin page's "Trace a leaked copy" finds the
// license or trial a code belongs to by computing it for each key.
function downloadStamp(licenseKey) {
	const secret = process.env.STAMP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
	return crypto.createHmac('sha256', secret).update('download-stamp:' + String(licenseKey || '')).digest('hex').slice(0, 16);
}

module.exports = {
	downloadStamp,
	startLink,
	linkEmail,
	linkInfo,
	confirmLink,
	linkStartTrial,
	pollLink,
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
	getMemoryStore,
	updatesUntil
};




