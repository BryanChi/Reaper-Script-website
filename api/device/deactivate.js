const { deactivateDevice, normalizeEmail } = require('../_lib/store');

module.exports = async function handler(req, res) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	const body = req.body || {};
	const email = body.email || (req.query && req.query.email);
	const licenseKey = body.licenseKey;
	const deviceId = body.deviceId;

	if (!email || !licenseKey || !deviceId) {
		return res.status(400).json({ ok: false, error: 'Email, license key, and device ID required' });
	}

	const result = await deactivateDevice(email, licenseKey, deviceId);
	if (!result.ok) {
		return res.status(400).json({ ok: false, error: result.error || 'Unable to deactivate device' });
	}

	return res.status(200).json({
		ok: true,
		message: result.message || 'Device deactivated successfully'
	});
};
