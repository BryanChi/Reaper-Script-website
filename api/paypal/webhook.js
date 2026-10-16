const crypto = require('crypto');
const { issuePurchaseLicense, normalizeEmail, normalizeProduct } = require('../_lib/store');
const PRODUCTS = require('../_lib/products');

// Lazy-load Resend to avoid requiring it if not configured
let resendClient = null;
function getResend() {
	if (resendClient) return resendClient;
	try {
		const { Resend } = require('resend');
		if (process.env.RESEND_API_KEY) {
			resendClient = new Resend(process.env.RESEND_API_KEY);
		}
	} catch (err) {
		// ignore; will fall back to no-email mode
	}
	return resendClient;
}

// The browser only tells us the PayPal order id. Everything that decides whether a key is issued
// (paid, how much, for which script, to whom) is read back from PayPal with the account's secret,
// so a made-up request can't get a key.
const PAYPAL_API = process.env.PAYPAL_ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

async function paypalToken() {
	const id = process.env.PAYPAL_CLIENT_ID;
	const secret = process.env.PAYPAL_CLIENT_SECRET;
	if (!id || !secret) throw new Error('PayPal is not configured on the server (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).');
	const resp = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
		method: 'POST',
		headers: {
			Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: 'grant_type=client_credentials'
	});
	const json = await resp.json().catch(() => ({}));
	if (!resp.ok || !json.access_token) throw new Error('Could not sign in to PayPal: ' + (json.error_description || resp.status));
	return json.access_token;
}

async function fetchOrder(orderId) {
	const token = await paypalToken();
	const resp = await fetch(`${PAYPAL_API}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	const json = await resp.json().catch(() => ({}));
	if (!resp.ok) throw new Error('PayPal order lookup failed: ' + (json.message || resp.status));
	return json;
}

// Same order, same key: a repeated request returns the key the order already has
function orderLicenseKey(orderId) {
	const h = crypto.createHmac('sha256', process.env.PAYPAL_CLIENT_SECRET || '').update('paypal-order:' + orderId).digest('hex');
	return `${h.slice(0, 16)}-${h.slice(16, 24)}`;
}

module.exports = async function handler(req, res) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	const body = req.body || {};
	const orderId = String(body.orderId || body.id || '').trim();
	if (!/^[A-Z0-9-]{6,64}$/i.test(orderId)) {
		return res.status(400).json({ ok: false, error: 'Missing PayPal order id' });
	}

	let order;
	try {
		order = await fetchOrder(orderId);
	} catch (err) {
		console.error('PayPal verification failed:', err);
		return res.status(502).json({ ok: false, error: err.message || 'Could not check the order with PayPal' });
	}

	const unit = order.purchase_units?.[0] || {};
	const capture = unit.payments?.captures?.[0];
	if (order.status !== 'COMPLETED' || !capture || capture.status !== 'COMPLETED') {
		return res.status(402).json({ ok: false, error: 'This order has not been paid' });
	}

	// Which script was bought (the order's custom_id); none = Vertical FX List
	const product = normalizeProduct(unit.custom_id);
	if (!product) {
		return res.status(400).json({ ok: false, error: 'Unknown product' });
	}
	const productName = PRODUCTS[product].name;

	const amount = capture.amount?.value || unit.amount?.value;
	const currency = capture.amount?.currency_code || unit.amount?.currency_code;
	const price = PRODUCTS[product].price;
	if (currency !== 'USD' || !price || Number(amount) + 1e-9 < Number(price)) {
		console.error('PayPal amount mismatch:', { orderId, product, amount, currency, price });
		return res.status(402).json({ ok: false, error: `The amount paid doesn't match the ${productName} price` });
	}

	const payerEmail = normalizeEmail(order.payer?.email_address);
	if (!payerEmail) {
		return res.status(400).json({ ok: false, error: 'PayPal did not return the buyer email' });
	}
	const payerName = order.payer?.name ? `${order.payer.name.given_name || ''} ${order.payer.name.surname || ''}`.trim() : '';

	let licenseResult;
	try {
		licenseResult = await issuePurchaseLicense(payerEmail, orderLicenseKey(orderId), product);
		if (!licenseResult.ok) {
			return res.status(400).json({ ok: false, error: licenseResult.error || 'Unable to issue license' });
		}
	} catch (err) {
		return res.status(500).json({ ok: false, error: err.message || 'License activation failed' });
	}

	// A repeated request for the same order gets the same key back, without a second email
	if (licenseResult.existing) {
		return res.status(200).json({
			ok: true, orderId, email: payerEmail, product,
			licenseKey: licenseResult.licenseKey, status: licenseResult.status, expiresAt: licenseResult.expiresAt || null,
			emailSent: false, emailError: null
		});
	}

	// Attempt to send email via Resend if configured
	let emailSent = false;
	let emailError = null;
	const resend = getResend();
	// Clean up the FROM email - remove extra quotes and whitespace
	let fromEmail = process.env.RESEND_FROM_EMAIL;
	if (fromEmail) {
		fromEmail = fromEmail.trim().replace(/^["']|["']$/g, ''); // Remove surrounding quotes
	}
	
	if (!resend) {
		emailError = 'Resend client not initialized. Check RESEND_API_KEY environment variable.';
		console.error('Resend not configured:', emailError);
	} else if (!fromEmail) {
		emailError = 'RESEND_FROM_EMAIL environment variable not set.';
		console.error('Resend FROM email not configured:', emailError);
	} else {
		// Validate format
		const emailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		const nameEmailFormat = /^.+<[^\s@]+@[^\s@]+\.[^\s@]+>$/;
		if (!emailFormat.test(fromEmail) && !nameEmailFormat.test(fromEmail)) {
			emailError = `Invalid RESEND_FROM_EMAIL format. Use "email@example.com" or "Name <email@example.com>". Current value: "${fromEmail}"`;
			console.error('Invalid FROM email format:', emailError);
		}
	}
	
	if (!emailError) {
		try {
			const emailResponse = await resend.emails.send({
				from: fromEmail,
				to: payerEmail,
				subject: `Your ${productName} License`,
				html: `
					<p>Hi ${payerName || 'there'},</p>
					<p>Thank you for buying ${productName}. Here is your license key:</p>
					<pre style="font-size:16px;font-weight:bold;">${licenseResult.licenseKey}</pre>
					<p>Status: ${licenseResult.status}</p>
					${licenseResult.expiresAt ? `<p>Expires: ${new Date(licenseResult.expiresAt).toISOString()}</p>` : ''}
					<p>If you have any questions, reply to this email.</p>
				`
			});
			
			// Check if Resend returned an error in the response
			if (emailResponse.error) {
				emailError = emailResponse.error.message || JSON.stringify(emailResponse.error);
				console.error('Resend API error:', emailResponse.error);
			} else if (emailResponse.data && emailResponse.data.id) {
				emailSent = true;
				console.log('Email sent successfully:', { id: emailResponse.data.id, to: payerEmail });
			} else {
				emailError = 'Unexpected response from Resend API';
				console.error('Unexpected Resend response:', emailResponse);
			}
		} catch (err) {
			emailError = err.message || 'Unknown error';
			console.error('Resend email failed:', err);
			if (err.response) {
				console.error('Resend error response:', err.response);
			}
		}
	}

	return res.status(200).json({
		ok: true,
		orderId: orderId || null,
		email: payerEmail,
		product,
		licenseKey: licenseResult.licenseKey,
		status: licenseResult.status,
		expiresAt: licenseResult.expiresAt || null,
		emailSent,
		emailError: emailError || null
	});
};
