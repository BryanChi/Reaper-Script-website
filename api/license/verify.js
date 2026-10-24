const { verifyLicense, getLicenseOrTrialStatus, emailFromAccessToken, issueNativeToken } = require('../_lib/store');

module.exports = async function handler(req, res) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	const body = req.body || {};
	const licenseKey = body.licenseKey || (req.query && req.query.licenseKey);
	const email = body.email || (req.query && req.query.email);
	const deviceId = body.deviceId || (req.query && req.query.deviceId);
	// which script is asking; none = Vertical FX List (its builds before products were added)
	const product = body.product || (req.query && req.query.product);

	// By email (the site's account page): only for the signed-in account itself, since the answer
	// carries the key. Otherwise verify by license key (the scripts).
	let result;
	if (email) {
		const accountEmail = await emailFromAccessToken(body.accessToken);
		if (!accountEmail) {
			return res.status(401).json({ ok: false, status: 'invalid', reason: 'Sign in to check your license.' });
		}
		result = await getLicenseOrTrialStatus(accountEmail, product);
	} else if (licenseKey) {
		result = await verifyLicense(licenseKey, deviceId, product);
		if (result.retry) {
			// plain text on purpose: the scripts treat a reply without JSON as "server not reachable"
			// and keep working on their offline grace
			res.setHeader('Content-Type', 'text/plain');
			return res.status(503).send(result.reason);
		}
	} else {
		return res.status(400).json({
			ok: false,
			status: 'invalid',
			reason: 'Email or license key required'
		});
	}

	// a native plugin's own check (native: 1, hw = its hardware hash): a signed token on top
	let token = null, tokenExpiresAt = null;
	if (licenseKey && !email && body.native && result.ok !== false) {
		const t = await issueNativeToken(licenseKey, deviceId, product, body.hw, result);
		if (t.retry) {
			res.setHeader('Content-Type', 'text/plain');
			return res.status(503).send(t.reason);
		}
		if (!t.ok) {
			return res.status(400).json({ ok: false, status: t.status || 'invalid', reason: t.reason || null, expiresAt: result.expiresAt || null });
		}
		token = t.token;
		tokenExpiresAt = t.tokenExpiresAt;
	}

	const statusCode = result.ok === false ? 400 : 200;
	return res.status(statusCode).json({
		ok: result.ok !== false,
		status: result.status,
		expiresAt: result.expiresAt || null,
		updatesUntil: result.updatesUntil || null,
		reason: result.reason || null,
		licenseKey: result.licenseKey || null,
		...(token ? { token, tokenExpiresAt } : {})
	});
};




