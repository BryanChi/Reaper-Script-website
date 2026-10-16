const { getLicenseInfo, emailFromAccessToken, startLink, linkInfo, confirmLink, linkStartTrial, pollLink } = require('../_lib/store');

// "Sign in with browser" from the scripts lives here too (Vercel Hobby allows 12 functions):
//   link-start   script -> { deviceCode, userCode, url }    (deviceCode stays in the script)
//   link-poll    script -> { status: pending | linked | no-license | expired | invalid }
//   link-info    /link page, before sign-in
//   link-confirm /link page, signed in (accessToken) -> ties the code to that account
//   link-trial   /link page, signed in, no license yet -> starts the trial for that account
const SITE = 'https://www.coolreaperscripts.com';

async function handleLink(action, body, res) {
	let result;
	if (action === 'link-start') {
		result = await startLink(body.product);
		if (result.ok) result.url = `${SITE}/link?code=${encodeURIComponent(result.userCode)}`;
	} else if (action === 'link-poll') {
		result = await pollLink(body.deviceCode);
	} else if (action === 'link-info') {
		result = await linkInfo(body.code);
	} else if (action === 'link-confirm') {
		result = await confirmLink(body.code, body.accessToken);
	} else if (action === 'link-trial') {
		result = await linkStartTrial(body.code, body.accessToken);
		if (result.ok) result = { ok: true, status: result.status, expiresAt: result.expiresAt || null };
	} else {
		return res.status(404).json({ ok: false, error: 'Action not found' });
	}
	res.setHeader('Cache-Control', 'no-store');
	return res.status(result.ok ? 200 : 400).json(result);
}

module.exports = async function handler(req, res) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	const body = req.body || {};
	const action = body.action || (req.query && req.query.action);
	if (action) return handleLink(String(action), body, res);
	// The answer carries the key and the activated computers, so it only goes to the signed-in
	// account itself, never to whoever knows the email
	const email = await emailFromAccessToken(body.accessToken);
	if (!email) {
		return res.status(401).json({ ok: false, error: 'Sign in to see your license.' });
	}

	const product = body.product || (req.query && req.query.product);
	const result = await getLicenseInfo(email, product);
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




