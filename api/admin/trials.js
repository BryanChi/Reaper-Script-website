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

	const supabaseUrl = process.env.SUPABASE_URL;
	const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !supabaseServiceKey) {
		// Memory fallback
		const store = require('../_lib/store').getMemoryStore?.() || global.__licenseStore;
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

	const supabase = require('@supabase/supabase-js').createClient(
		supabaseUrl,
		supabaseServiceKey,
		{ auth: { autoRefreshToken: false, persistSession: false } }
	);

	const { data: trials, error } = await supabase
		.from('trials')
		.select('*')
		.order('started_at', { ascending: false });

	if (error) {
		return res.status(500).json({ ok: false, error: error.message });
	}

	return res.status(200).json({ ok: true, trials: trials || [] });
};
