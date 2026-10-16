const { deactivateDevice } = require('./_lib/store');

module.exports = async function handler(req, res) {
	const { method, body, query } = req;
	const action = query.action || body?.action;

	const email = body?.email || query?.email;
	const licenseKey = body?.licenseKey || query?.licenseKey;
	const deviceId = body?.deviceId || query?.deviceId;

	if (!email || !licenseKey || !deviceId) {
		return res.status(400).json({ ok: false, error: 'Email, license key, and device ID required' });
	}

	// Handle device activation
	if (action === 'activate' || (!action && method === 'POST')) {
		if (method !== 'POST') {
			res.setHeader('Allow', ['POST']);
			return res.status(405).json({ ok: false, error: 'Method not allowed' });
		}

		// A key alone no longer adds a computer (keys can be shared): computers are added when the
		// owner signs in with the browser from the script (link-poll in api/license/info.js)
		return res.status(410).json({ ok: false, error: 'Sign in with your browser to add this computer.' });
	}

	// Handle device deactivation
	if (action === 'deactivate') {
		if (method !== 'POST') {
			res.setHeader('Allow', ['POST']);
			return res.status(405).json({ ok: false, error: 'Method not allowed' });
		}

		const result = await deactivateDevice(email, licenseKey, deviceId);
		if (!result.ok) {
			return res.status(400).json({ ok: false, error: result.error || 'Unable to deactivate device' });
		}

		return res.status(200).json({
			ok: true,
			message: result.message || 'Device deactivated successfully'
		});
	}

	return res.status(404).json({ ok: false, error: 'Action not found' });
};



