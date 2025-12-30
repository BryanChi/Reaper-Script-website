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

	// Include debug info in development
	const response = {
		ok: true,
		licenseKey: result.licenseKey,
		status: result.status,
		expiresAt: result.expiresAt || null,
		activations: result.activations || []
	};

	// Add debug info if activations array is empty but we have a license key
	if (result.licenseKey && (!result.activations || result.activations.length === 0)) {
		response._debug = {
			message: 'No activations found for license key',
			licenseKey: result.licenseKey,
			activationsArrayLength: result.activations ? result.activations.length : 0,
			activationsType: typeof result.activations
		};
	}

	return res.status(200).json(response);
};

