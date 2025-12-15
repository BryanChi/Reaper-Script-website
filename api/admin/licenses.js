const { getLicenseInfo } = require('../_lib/store');

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
	if (req.method !== 'GET') {
		res.setHeader('Allow', ['GET']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	if (!checkAuth(req)) {
		return res.status(401).json({ ok: false, error: 'Unauthorized' });
	}

	const { createClient } = require('@supabase/supabase-js');
	const supabaseUrl = process.env.SUPABASE_URL;
	const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !supabaseServiceKey) {
		// Memory fallback
		const store = require('../_lib/store').getMemoryStore?.() || global.__licenseStore;
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

	const supabase = require('@supabase/supabase-js').createClient(
		supabaseUrl,
		supabaseServiceKey,
		{ auth: { autoRefreshToken: false, persistSession: false } }
	);

	const { data: licenses, error } = await supabase
		.from('licenses')
		.select('*')
		.order('created_at', { ascending: false });

	if (error) {
		return res.status(500).json({ ok: false, error: error.message });
	}

	return res.status(200).json({ ok: true, licenses: licenses || [] });
};
