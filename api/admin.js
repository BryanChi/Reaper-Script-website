const crypto = require('crypto');
const { generateLicenseKey, getMemoryStore, activateLicense, normalizeProduct, normalizeEmail, DEFAULT_PRODUCT, downloadStamp } = require('./_lib/store');
const PRODUCTS = require('./_lib/products');
const { buildPurchaseEmail, sendEmail } = require('./_lib/purchase-email');

// Trials are one per email per product. The trial actions narrow to the product the panel sends
// (older panels send none: then they act on all of that email's trials, as before).
function trialsQuery(q, email, product) {
	q = q.eq('email', email);
	return product ? q.eq('product', product) : q;
}
function memTrialKey(store, email, product) {
	const id = `${email}|${product || DEFAULT_PRODUCT}`;
	return store && store.trials && store.trials[id] ? id : null;
}

// Account names come from the sign-in accounts (Google gives full_name; email sign-ups have none).
// Devices = active device_activations for the row's key. Both are display-only extras for the panel.
async function withNamesAndDevices(supabase, rows) {
	if (!rows.length) return rows;
	const names = {};
	try {
		for (let page = 1; page <= 20; page++) {
			const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
			if (error || !data || !data.users) break;
			for (const u of data.users) {
				const m = u.user_metadata || {};
				const name = m.full_name || m.name || [m.given_name, m.family_name].filter(Boolean).join(' ');
				if (u.email && name) names[u.email.toLowerCase()] = name;
			}
			if (data.users.length < 1000) break;
		}
	} catch (e) { /* names are optional */ }
	const devices = {};
	const { data: acts } = await supabase.from('device_activations').select('license_key').eq('active', true).limit(10000);
	for (const a of acts || []) devices[a.license_key] = (devices[a.license_key] || 0) + 1;
	return rows.map(r => ({ ...r, name: names[(r.email || '').toLowerCase()] || null, devices: r.license_key ? (devices[r.license_key] || 0) : 0 }));
}

// Simple auth middleware
function checkAuth(req) {
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return false;
	}
	const token = authHeader.substring(7);
	return global.__adminTokens && global.__adminTokens.has(token);
}

// Helper to get Supabase client
function getSupabaseClient() {
	const supabaseUrl = process.env.SUPABASE_URL;
	const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
	
	if (!supabaseUrl || !supabaseServiceKey) {
		return null;
	}
	
	const { createClient } = require('@supabase/supabase-js');
	return createClient(supabaseUrl, supabaseServiceKey, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
}

module.exports = async function handler(req, res) {
	const { method, query, body } = req;
	const action = query.action || body?.action;

	// Handle authentication
	if (action === 'auth' || (!action && method === 'POST' && !query.action)) {
		if (method !== 'POST') {
			res.setHeader('Allow', ['POST']);
			return res.status(405).json({ ok: false, error: 'Method not allowed' });
		}

		const adminPassword = process.env.ADMIN_PASSWORD;
		
		if (!adminPassword) {
			console.error('ADMIN_PASSWORD environment variable not set!');
			return res.status(500).json({ 
				ok: false, 
				error: 'Admin panel not configured. Set ADMIN_PASSWORD environment variable.' 
			});
		}

		const providedPassword = body?.password;

		if (!providedPassword) {
			return res.status(400).json({ ok: false, error: 'Password required' });
		}

		if (providedPassword !== adminPassword) {
			return res.status(401).json({ ok: false, error: 'Invalid password' });
		}

		const token = crypto.randomBytes(32).toString('hex');
		
		if (!global.__adminTokens) {
			global.__adminTokens = new Set();
		}
		global.__adminTokens.add(token);

		setTimeout(() => {
			if (global.__adminTokens) {
				global.__adminTokens.delete(token);
			}
		}, 24 * 60 * 60 * 1000);

		return res.status(200).json({ ok: true, token });
	}

	// All other endpoints require authentication
	if (!checkAuth(req)) {
		return res.status(401).json({ ok: false, error: 'Unauthorized' });
	}

	// Handle GET /api/admin/licenses
	if (action === 'licenses' || (!action && method === 'GET' && query.licenses !== undefined)) {
		if (method !== 'GET') {
			res.setHeader('Allow', ['GET']);
			return res.status(405).json({ ok: false, error: 'Method not allowed' });
		}

		const supabase = getSupabaseClient();
		if (!supabase) {
			const store = getMemoryStore() || global.__licenseStore;
			if (store && store.licenses) {
				const licenses = Object.entries(store.licenses).map(([key, lic]) => ({
					license_key: key,
					email: lic.email,
					product: lic.product || DEFAULT_PRODUCT,
					status: lic.status,
					created_at: lic.createdAt,
					expires_at: lic.expiresAt ? new Date(lic.expiresAt).toISOString() : null
				}));
				return res.status(200).json({ ok: true, licenses });
			}
			return res.status(200).json({ ok: true, licenses: [] });
		}

		const { data: licenses, error } = await supabase
			.from('licenses')
			.select('*')
			.order('created_at', { ascending: false })
			.limit(1000); // Limit to prevent slow queries

		if (error) {
			return res.status(500).json({ ok: false, error: error.message });
		}

		return res.status(200).json({ ok: true, licenses: await withNamesAndDevices(supabase, licenses || []) });
	}

	// Handle GET /api/admin/trials
	if (action === 'trials' || (!action && method === 'GET' && query.trials !== undefined)) {
		if (method !== 'GET') {
			res.setHeader('Allow', ['GET']);
			return res.status(405).json({ ok: false, error: 'Method not allowed' });
		}

		const supabase = getSupabaseClient();
		if (!supabase) {
			const store = getMemoryStore() || global.__licenseStore;
			if (store && store.trials) {
				const trials = Object.entries(store.trials).map(([id, trial]) => ({
					email: trial.email || id,
					product: trial.product || DEFAULT_PRODUCT,
					license_key: trial.licenseKey || null,
					started_at: trial.startedAt,
					expires_at: trial.expiresAt ? new Date(trial.expiresAt).toISOString() : null
				}));
				return res.status(200).json({ ok: true, trials });
			}
			return res.status(200).json({ ok: true, trials: [] });
		}

		const { data: trials, error } = await supabase
			.from('trials')
			.select('*')
			.order('started_at', { ascending: false })
			.limit(1000); // Limit to prevent slow queries

		if (error) {
			return res.status(500).json({ ok: false, error: error.message });
		}

		return res.status(200).json({ ok: true, trials: await withNamesAndDevices(supabase, trials || []) });
	}

	// POST /api/admin?action=trace { text }: which license or trial a leaked copy was downloaded
	// with. text = the copy's "-- build <code>" line (or the whole script); the code is matched by
	// computing every key's download stamp.
	if (action === 'trace') {
		if (method !== 'POST') {
			res.setHeader('Allow', ['POST']);
			return res.status(405).json({ ok: false, error: 'Method not allowed' });
		}
		const text = String((body && body.text) || '');
		const m = text.match(/--\s*build\s+([0-9a-f]{16})\b/i) || text.match(/\b([0-9a-f]{16})\b/i);
		if (!m) return res.status(400).json({ ok: false, error: 'No build code found. Paste the "-- build ..." line from the script.' });
		const code = m[1].toLowerCase();
		const supabase = getSupabaseClient();
		if (!supabase) return res.status(500).json({ ok: false, error: 'Tracing requires Supabase' });
		const [lic, tri] = await Promise.all([
			supabase.from('licenses').select('license_key, email, product, status, created_at'),
			supabase.from('trials').select('license_key, email, product, expires_at')
		]);
		if (lic.error || tri.error) return res.status(500).json({ ok: false, error: (lic.error || tri.error).message });
		const matches = []
			.concat((lic.data || []).map(r => ({ kind: 'license', ...r })))
			.concat((tri.data || []).map(r => ({ kind: 'trial', ...r })))
			.filter(r => r.license_key && downloadStamp(r.license_key) === code);
		return res.status(200).json({ ok: true, code, matches });
	}

	// Handle POST /api/admin?action=license-create: issue a license by hand { email, product }
	// Sends the purchase email with a sample key, so it can be checked in a real inbox. Creates no license.
	if (action === 'email-preview') {
		if (method !== 'POST') {
			res.setHeader('Allow', ['POST']);
			return res.status(405).json({ ok: false, error: 'Method not allowed' });
		}
		const email = normalizeEmail(body?.email);
		const product = normalizeProduct(body?.product);
		if (!email) return res.status(400).json({ ok: false, error: 'Email required' });
		if (!product) return res.status(400).json({ ok: false, error: 'Unknown product' });
		const mail = buildPurchaseEmail({
			productName: PRODUCTS[product].name, product, licenseKey: 'SAMPLE-KEY-NOT-A-LICENSE', email, payerName: '', orderId: 'PREVIEW',
			updatesUntil: new Date().setUTCFullYear(new Date().getUTCFullYear() + 2)
		});
		const sent = await sendEmail({ to: email, subject: '[Preview] ' + mail.subject, html: mail.html, text: mail.text });
		return res.status(sent.ok ? 200 : 502).json(sent);
	}

	if (action === 'license-create') {
		if (method !== 'POST') {
			res.setHeader('Allow', ['POST']);
			return res.status(405).json({ ok: false, error: 'Method not allowed' });
		}
		const { email, product } = body || {};
		if (!normalizeProduct(product)) {
			return res.status(400).json({ ok: false, error: 'Unknown product' });
		}
		const result = await activateLicense(email, null, product);
		if (!result.ok) {
			return res.status(400).json({ ok: false, error: result.error || 'Unable to create license' });
		}
		return res.status(200).json({ ok: true, licenseKey: result.licenseKey, product: result.product });
	}

	// Handle POST /api/admin/license/update
	if (action === 'license-update') {
		if (method !== 'POST') {
			res.setHeader('Allow', ['POST']);
			return res.status(405).json({ ok: false, error: 'Method not allowed' });
		}

		const { licenseKey, email, status } = body || {};

		if (!licenseKey) {
			return res.status(400).json({ ok: false, error: 'License key required' });
		}

		const supabase = getSupabaseClient();
		if (!supabase) {
			const store = getMemoryStore() || global.__licenseStore;
			if (store && store.licenses && store.licenses[licenseKey]) {
				if (email) store.licenses[licenseKey].email = email;
				if (status) store.licenses[licenseKey].status = status;
				return res.status(200).json({ ok: true, message: 'License updated' });
			}
			return res.status(404).json({ ok: false, error: 'License not found' });
		}

		const updateData = {};
		if (email) updateData.email = email;
		if (status) updateData.status = status;

		const { error } = await supabase
			.from('licenses')
			.update(updateData)
			.eq('license_key', licenseKey);

		if (error) {
			return res.status(500).json({ ok: false, error: error.message });
		}

		return res.status(200).json({ ok: true, message: 'License updated successfully' });
	}

	// Handle POST /api/admin/license/regenerate
	if (action === 'license-regenerate') {
		if (method !== 'POST') {
			res.setHeader('Allow', ['POST']);
			return res.status(405).json({ ok: false, error: 'Method not allowed' });
		}

		const { licenseKey } = body || {};

		if (!licenseKey) {
			return res.status(400).json({ ok: false, error: 'License key required' });
		}

		const supabase = getSupabaseClient();
		if (!supabase) {
			const store = getMemoryStore() || global.__licenseStore;
			if (store && store.licenses && store.licenses[licenseKey]) {
				const newKey = generateLicenseKey();
				const license = store.licenses[licenseKey];
				delete store.licenses[licenseKey];
				store.licenses[newKey] = license;
				return res.status(200).json({ ok: true, newLicenseKey: newKey });
			}
			return res.status(404).json({ ok: false, error: 'License not found' });
		}

		const { data: existing, error: fetchError } = await supabase
			.from('licenses')
			.select('*')
			.eq('license_key', licenseKey)
			.single();

		if (fetchError || !existing) {
			return res.status(404).json({ ok: false, error: 'License not found' });
		}

		const newLicenseKey = generateLicenseKey();

		const { error: updateError } = await supabase
			.from('licenses')
			.update({ license_key: newLicenseKey })
			.eq('license_key', licenseKey);

		if (updateError) {
			return res.status(500).json({ ok: false, error: updateError.message });
		}

		return res.status(200).json({ ok: true, newLicenseKey });
	}

	// Handle POST /api/admin/trial/update
	if (action === 'trial-update') {
		if (method !== 'POST') {
			res.setHeader('Allow', ['POST']);
			return res.status(405).json({ ok: false, error: 'Method not allowed' });
		}

		const { email, expiresAt } = body || {};
		const product = body && body.product ? normalizeProduct(body.product) : null;

		if (!email) {
			return res.status(400).json({ ok: false, error: 'Email required' });
		}

		if (!expiresAt) {
			return res.status(400).json({ ok: false, error: 'ExpiresAt required' });
		}

		const supabase = getSupabaseClient();
		if (!supabase) {
			const store = getMemoryStore() || global.__licenseStore;
			const id = memTrialKey(store, email.toLowerCase().trim(), product);
			if (id) {
				store.trials[id].expiresAt = new Date(expiresAt).getTime();
				return res.status(200).json({ ok: true, message: 'Trial updated' });
			}
			return res.status(404).json({ ok: false, error: 'Trial not found' });
		}

		const { error } = await trialsQuery(supabase
			.from('trials')
			.update({ expires_at: expiresAt }), email.toLowerCase().trim(), product);

		if (error) {
			return res.status(500).json({ ok: false, error: error.message });
		}

		return res.status(200).json({ ok: true, message: 'Trial updated successfully' });
	}

	// Handle POST /api/admin/trial/regenerate
	if (action === 'trial-regenerate') {
		if (method !== 'POST') {
			res.setHeader('Allow', ['POST']);
			return res.status(405).json({ ok: false, error: 'Method not allowed' });
		}

		const { email } = body || {};
		const product = body && body.product ? normalizeProduct(body.product) : null;

		if (!email) {
			return res.status(400).json({ ok: false, error: 'Email required' });
		}

		const normalizedEmail = email.toLowerCase().trim();
		const supabase = getSupabaseClient();
		
		if (!supabase) {
			const store = getMemoryStore() || global.__licenseStore;
			const id = memTrialKey(store, normalizedEmail, product);
			if (id) {
				const newKey = generateLicenseKey();
				store.trials[id].licenseKey = newKey;
				return res.status(200).json({ ok: true, newLicenseKey: newKey });
			}
			return res.status(404).json({ ok: false, error: 'Trial not found' });
		}

		// First, check if the trial exists and get current data
		const { data: existingTrial, error: fetchError } = await trialsQuery(supabase
			.from('trials')
			.select('*'), normalizedEmail, product)
			.single();

		if (fetchError || !existingTrial) {
			return res.status(404).json({ ok: false, error: 'Trial not found' });
		}

		const newLicenseKey = generateLicenseKey();

		// Try to update with license_key
		const { error: updateError } = await trialsQuery(supabase
			.from('trials')
			.update({ license_key: newLicenseKey }), normalizedEmail, product);

		if (updateError) {
			// Check if error is about missing license_key column
			const errorMsg = updateError.message || '';
			if (errorMsg.includes('license_key') && (errorMsg.includes('schema cache') || errorMsg.includes('column'))) {
				return res.status(500).json({ 
					ok: false, 
					error: `Database schema error: The 'license_key' column does not exist in the 'trials' table. Please add this column to your Supabase database. Run this SQL: ALTER TABLE trials ADD COLUMN license_key TEXT;` 
				});
			}
			return res.status(500).json({ ok: false, error: updateError.message });
		}

		return res.status(200).json({ ok: true, newLicenseKey });
	}

	// Handle POST /api/admin/trial/delete
	if (action === 'trial-delete') {
		if (method !== 'POST') {
			res.setHeader('Allow', ['POST']);
			return res.status(405).json({ ok: false, error: 'Method not allowed' });
		}

		const { email } = body || {};
		const product = body && body.product ? normalizeProduct(body.product) : null;

		if (!email) {
			return res.status(400).json({ ok: false, error: 'Email required' });
		}

		const normalizedEmail = email.toLowerCase().trim();
		const supabase = getSupabaseClient();
		
		if (!supabase) {
			const store = getMemoryStore() || global.__licenseStore;
			const id = memTrialKey(store, normalizedEmail, product);
			if (id) {
				delete store.trials[id];
				return res.status(200).json({ ok: true, message: 'Trial deleted successfully' });
			}
			return res.status(404).json({ ok: false, error: 'Trial not found' });
		}

		// Delete the trial entry
		const { error: deleteError } = await trialsQuery(supabase
			.from('trials')
			.delete(), normalizedEmail, product);

		if (deleteError) {
			return res.status(500).json({ ok: false, error: deleteError.message });
		}

		return res.status(200).json({ ok: true, message: 'Trial deleted successfully' });
	}

	// Handle POST /api/admin/license/delete
	if (action === 'license-delete') {
		if (method !== 'POST') {
			res.setHeader('Allow', ['POST']);
			return res.status(405).json({ ok: false, error: 'Method not allowed' });
		}

		const { licenseKey } = body || {};

		if (!licenseKey) {
			return res.status(400).json({ ok: false, error: 'License key required' });
		}

		const supabase = getSupabaseClient();
		
		if (!supabase) {
			const store = getMemoryStore() || global.__licenseStore;
			if (store && store.licenses && store.licenses[licenseKey]) {
				delete store.licenses[licenseKey];
				return res.status(200).json({ ok: true, message: 'License deleted successfully' });
			}
			return res.status(404).json({ ok: false, error: 'License not found' });
		}

		// Delete the license entry
		const { data: deletedData, error: deleteError } = await supabase
			.from('licenses')
			.delete()
			.eq('license_key', licenseKey)
			.select();

		if (deleteError) {
			return res.status(500).json({ ok: false, error: deleteError.message });
		}

		// Check if any rows were actually deleted
		if (!deletedData || deletedData.length === 0) {
			return res.status(404).json({ ok: false, error: 'License not found' });
		}

		return res.status(200).json({ ok: true, message: 'License deleted successfully' });
	}

	return res.status(404).json({ ok: false, error: 'Action not found' });
};
