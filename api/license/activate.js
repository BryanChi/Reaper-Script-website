// Turned off: it created an active license for any email without a payment, and nothing on the
// site or in the scripts calls it. Keys come from a verified PayPal order (/api/paypal/webhook)
// or from the admin page ("Create license").
module.exports = async function handler(req, res) {
	return res.status(410).json({ ok: false, error: 'Licenses are issued after purchase or by the admin.' });
};
