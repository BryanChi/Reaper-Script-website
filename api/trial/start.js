const { startTrial } = require('../_lib/store');

module.exports = async function handler(req, res) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	const email = (req.body && req.body.email) || (req.query && req.query.email);
	const result = await startTrial(email);

	if (!result.ok) {
		return res.status(400).json({ ok: false, error: result.error || 'Unable to start trial' });
	}

	return res.status(200).json({
		ok: true,
		status: result.status,
		expiresAt: result.expiresAt,
		message: result.message
	});
};
