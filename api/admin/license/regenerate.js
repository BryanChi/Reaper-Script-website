const { generateLicenseKey } = require('../../_lib/store');

// Simple auth middleware
function checkAuth(req) {
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return false;
	}
	const token = authHeader.substring(7);
	return global.__adminTokens && global.__adminTokens.has(token);
}

module.exports = async function handler(req, res) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	if (!checkAuth(req)) {
		return res.status(401).json({ ok: false, error: 'Unauthorized' });
	}

	const { licenseKey } = req.body || {};

	if (!licenseKey) {
		return res.status(400).json({ ok: false, error: 'License key required' });
	}

	const supabaseUrl = process.env.SUPABASE_URL;
	const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !supabaseServiceKey) {
		// Memory fallback
		const store = require('../../_lib/store').getMemoryStore?.() || global.__licenseStore;
		if (store && store.licenses && store.licenses[licenseKey]) {
			const newKey = generateLicenseKey();
			const license = store.licenses[licenseKey];
			delete store.licenses[licenseKey];
			store.licenses[newKey] = license;
			return res.status(200).json({ ok: true, newLicenseKey: newKey });
		}
		return res.status(404).json({ ok: false, error: 'License not found' });
	}

	const supabase = require('@supabase/supabase-js').createClient(
		supabaseUrl,
		supabaseServiceKey,
		{ auth: { autoRefreshToken: false, persistSession: false } }
	);

	// Get existing license
	const { data: existing, error: fetchError } = await supabase
		.from('licenses')
		.select('*')
		.eq('license_key', licenseKey)
		.single();

	if (fetchError || !existing) {
		return res.status(404).json({ ok: false, error: 'License not found' });
	}

	// Generate new key
	const newLicenseKey = generateLicenseKey();

	// Update license with new key
	const { error: updateError } = await supabase
		.from('licenses')
		.update({ license_key: newLicenseKey })
		.eq('license_key', licenseKey);

	if (updateError) {
		return res.status(500).json({ ok: false, error: updateError.message });
	}

	return res.status(200).json({ ok: true, newLicenseKey });
};
