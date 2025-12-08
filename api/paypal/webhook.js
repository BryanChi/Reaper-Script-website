// Placeholder webhook: replace with real PayPal verification and license issuance.
module.exports = async function handler(req, res) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	// TODO: Verify PayPal webhook signature, confirm payment, and then:
	// 1) Extract buyer email (or custom_id pointing to user/email).
	// 2) Call activateLicense(email) to issue license.
	// 3) Send email via Resend with the license key.

	return res.status(501).json({ ok: false, error: 'Not implemented. Wire PayPal webhook and call activateLicense().' });
};
