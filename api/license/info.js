const { getLicenseInfo, normalizeEmail } = require('../_lib/store');

module.exports = async function handler(req, res) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	const body = req.body || {};
	const email = body.email || (req.query && req.query.email);

	if (!email) {
		return res.status(400).json({ ok: false, error: 'Email required' });
	}

	const result = await getLicenseInfo(email);
	if (!result.ok) {
		return res.status(400).json({ ok: false, error: result.error || 'Unable to get license info' });
	}

	return res.status(200).json({
		ok: true,
		licenseKey: result.licenseKey,
		status: result.status,
		expiresAt: result.expiresAt || null,
		activations: result.activations || []
	});
};
