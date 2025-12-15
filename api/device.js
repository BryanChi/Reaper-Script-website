const { activateDevice, deactivateDevice } = require('./_lib/store');

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

		const result = await activateDevice(email, licenseKey, deviceId);
		if (!result.ok) {
			return res.status(400).json({ ok: false, error: result.error || 'Unable to activate device' });
		}

		return res.status(200).json({
			ok: true,
			message: result.message || 'Device activated successfully'
		});
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
