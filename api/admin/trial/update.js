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

	const { email, expiresAt } = req.body || {};

	if (!email) {
		return res.status(400).json({ ok: false, error: 'Email required' });
	}

	if (!expiresAt) {
		return res.status(400).json({ ok: false, error: 'ExpiresAt required' });
	}

	const supabaseUrl = process.env.SUPABASE_URL;
	const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !supabaseServiceKey) {
		// Memory fallback
		const store = require('../../_lib/store').getMemoryStore?.() || global.__licenseStore;
		if (store && store.trials && store.trials[email.toLowerCase().trim()]) {
			store.trials[email.toLowerCase().trim()].expiresAt = new Date(expiresAt).getTime();
			return res.status(200).json({ ok: true, message: 'Trial updated' });
		}
		return res.status(404).json({ ok: false, error: 'Trial not found' });
	}

	const supabase = require('@supabase/supabase-js').createClient(
		supabaseUrl,
		supabaseServiceKey,
		{ auth: { autoRefreshToken: false, persistSession: false } }
	);

	const { error } = await supabase
		.from('trials')
		.update({ expires_at: expiresAt })
		.eq('email', email.toLowerCase().trim());

	if (error) {
		return res.status(500).json({ ok: false, error: error.message });
	}

	return res.status(200).json({ ok: true, message: 'Trial updated successfully' });
};
