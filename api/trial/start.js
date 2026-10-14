const { startTrial } = require('../_lib/store');

module.exports = async function handler(req, res) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	const email = (req.body && req.body.email) || (req.query && req.query.email);
	const product = (req.body && req.body.product) || (req.query && req.query.product);
	const result = await startTrial(email, product);

	if (!result.ok) {
		return res.status(400).json({ ok: false, error: result.error || 'Unable to start trial' });
	}

	return res.status(200).json({
		ok: true,
		status: result.status,
		expiresAt: result.expiresAt,
		licenseKey: result.licenseKey || null,
		message: result.message
	});
};




