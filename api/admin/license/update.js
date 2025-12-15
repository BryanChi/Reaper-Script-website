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

	const { licenseKey, email, status } = req.body || {};

	if (!licenseKey) {
		return res.status(400).json({ ok: false, error: 'License key required' });
	}

	const supabaseUrl = process.env.SUPABASE_URL;
	const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !supabaseServiceKey) {
		// Memory fallback
		const store = require('../../_lib/store').getMemoryStore?.() || global.__licenseStore;
		if (store && store.licenses && store.licenses[licenseKey]) {
			if (email) store.licenses[licenseKey].email = email;
			if (status) store.licenses[licenseKey].status = status;
			return res.status(200).json({ ok: true, message: 'License updated' });
		}
		return res.status(404).json({ ok: false, error: 'License not found' });
	}

	const supabase = require('@supabase/supabase-js').createClient(
		supabaseUrl,
		supabaseServiceKey,
		{ auth: { autoRefreshToken: false, persistSession: false } }
	);

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
};
