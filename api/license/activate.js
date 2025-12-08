const { activateLicense } = require('../_lib/store');

module.exports = async function handler(req, res) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	const body = req.body || {};
	const email = body.email || (req.query && req.query.email);
	const providedKey = body.licenseKey || (req.query && req.query.licenseKey);

	const result = await activateLicense(email, providedKey);
	if (!result.ok) {
		return res.status(400).json({ ok: false, error: result.error || 'Unable to activate license' });
	}

	return res.status(200).json({
		ok: true,
		status: result.status,
		licenseKey: result.licenseKey,
		expiresAt: result.expiresAt || null
	});
};
