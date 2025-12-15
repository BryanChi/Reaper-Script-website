const { verifyLicense, getLicenseOrTrialStatus } = require('../_lib/store');

module.exports = async function handler(req, res) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	const body = req.body || {};
	const licenseKey = body.licenseKey || (req.query && req.query.licenseKey);
	const email = body.email || (req.query && req.query.email);
	const deviceId = body.deviceId || (req.query && req.query.deviceId);

	// If email is provided, check license or trial status by email
	// Otherwise, verify by license key
	let result;
	if (email) {
		result = await getLicenseOrTrialStatus(email);
	} else if (licenseKey) {
		result = await verifyLicense(licenseKey, deviceId);
	} else {
		return res.status(400).json({
			ok: false,
			status: 'invalid',
			reason: 'Email or license key required'
		});
	}

	const statusCode = result.ok === false ? 400 : 200;
	return res.status(statusCode).json({
		ok: result.ok !== false,
		status: result.status,
		expiresAt: result.expiresAt || null,
		reason: result.reason || null,
		licenseKey: result.licenseKey || null
	});
};




