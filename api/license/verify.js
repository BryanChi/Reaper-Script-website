const { verifyLicense } = require('../_lib/store');

module.exports = async function handler(req, res) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	const body = req.body || {};
	const email = body.email || (req.query && req.query.email);
	const licenseKey = body.licenseKey || (req.query && req.query.licenseKey);
	const result = await verifyLicense(email, licenseKey);

	const statusCode = result.ok === false ? 400 : 200;
	return res.status(statusCode).json({
		ok: result.ok !== false,
		status: result.status,
		expiresAt: result.expiresAt || null,
		reason: result.reason || null,
		licenseKey: result.licenseKey || null
	});
};
