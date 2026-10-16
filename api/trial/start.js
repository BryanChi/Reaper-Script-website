const { startTrial, emailFromAccessToken } = require('../_lib/store');

module.exports = async function handler(req, res) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	// Only for a signed-in account: a typed email could start (or read back) someone else's
	// trial key. REAPER scripts and the Script Manager start trials from the /link page.
	const email = await emailFromAccessToken(req.body && req.body.accessToken);
	if (!email) return res.status(401).json({ ok: false, error: 'Sign in to start your trial.' });
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




