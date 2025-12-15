const crypto = require('crypto');
const { generateLicenseKey, getMemoryStore } = require('./_lib/store');

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
			.order('created_at', { ascending: false });

		if (error) {
			return res.status(500).json({ ok: false, error: error.message });
		}

		return res.status(200).json({ ok: true, licenses: licenses || [] });
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
				const trials = Object.entries(store.trials).map(([email, trial]) => ({
					email: email,
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
			.order('started_at', { ascending: false });

		if (error) {
			return res.status(500).json({ ok: false, error: error.message });
		}

		return res.status(200).json({ ok: true, trials: trials || [] });
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

		if (!email) {
			return res.status(400).json({ ok: false, error: 'Email required' });
		}

		if (!expiresAt) {
			return res.status(400).json({ ok: false, error: 'ExpiresAt required' });
		}

		const supabase = getSupabaseClient();
		if (!supabase) {
			const store = getMemoryStore() || global.__licenseStore;
			if (store && store.trials && store.trials[email.toLowerCase().trim()]) {
				store.trials[email.toLowerCase().trim()].expiresAt = new Date(expiresAt).getTime();
				return res.status(200).json({ ok: true, message: 'Trial updated' });
			}
			return res.status(404).json({ ok: false, error: 'Trial not found' });
		}

		const { error } = await supabase
			.from('trials')
			.update({ expires_at: expiresAt })
			.eq('email', email.toLowerCase().trim());

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

		if (!email) {
			return res.status(400).json({ ok: false, error: 'Email required' });
		}

		const normalizedEmail = email.toLowerCase().trim();
		const supabase = getSupabaseClient();
		
		if (!supabase) {
			const store = getMemoryStore() || global.__licenseStore;
			if (store && store.trials && store.trials[normalizedEmail]) {
				const newKey = generateLicenseKey();
				store.trials[normalizedEmail].licenseKey = newKey;
				return res.status(200).json({ ok: true, newLicenseKey: newKey });
			}
			return res.status(404).json({ ok: false, error: 'Trial not found' });
		}

		// First, check if the trial exists and get current data
		const { data: existingTrial, error: fetchError } = await supabase
			.from('trials')
			.select('*')
			.eq('email', normalizedEmail)
			.single();

		if (fetchError || !existingTrial) {
			return res.status(404).json({ ok: false, error: 'Trial not found' });
		}

		const newLicenseKey = generateLicenseKey();

		// Try to update with license_key
		const { error: updateError } = await supabase
			.from('trials')
			.update({ license_key: newLicenseKey })
			.eq('email', normalizedEmail);

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

		if (!email) {
			return res.status(400).json({ ok: false, error: 'Email required' });
		}

		const normalizedEmail = email.toLowerCase().trim();
		const supabase = getSupabaseClient();
		
		if (!supabase) {
			const store = getMemoryStore() || global.__licenseStore;
			if (store && store.trials && store.trials[normalizedEmail]) {
				delete store.trials[normalizedEmail];
				return res.status(200).json({ ok: true, message: 'Trial deleted successfully' });
			}
			return res.status(404).json({ ok: false, error: 'Trial not found' });
		}

		// Delete the trial entry
		const { error: deleteError } = await supabase
			.from('trials')
			.delete()
			.eq('email', normalizedEmail);

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
		const { error: deleteError } = await supabase
			.from('licenses')
			.delete()
			.eq('license_key', licenseKey);

		if (deleteError) {
			return res.status(500).json({ ok: false, error: deleteError.message });
		}

		return res.status(200).json({ ok: true, message: 'License deleted successfully' });
	}

	return res.status(404).json({ ok: false, error: 'Action not found' });
};
