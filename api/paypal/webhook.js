const crypto = require('crypto');
const { issuePurchaseLicense, emailFromAccessToken, normalizeEmail, normalizeProduct } = require('../_lib/store');
const PRODUCTS = require('../_lib/products');
const { findDiscount, discountById, priceFor } = require('../_lib/discounts');
const { buildPurchaseEmail } = require('../_lib/purchase-email');

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

// One route, three steps (Vercel's function limit keeps it to one file):
//   { action: 'quote', product, code }   -> the price, with a discount code if it's valid
//   { action: 'create', product, code }  -> creates the PayPal order here, so the browser can't set the price
//   { orderId }                          -> captures the approved order and issues the key
// Everything that decides whether a key is issued (paid, how much, for which script, to whom) is read
// back from PayPal with the account's secret, so a made-up request can't get a key.
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

async function paypalApi(path, token, opts) {
	const resp = await fetch(`${PAYPAL_API}${path}`, {
		method: (opts && opts.method) || 'GET',
		headers: Object.assign({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, opts && opts.headers),
		body: opts && opts.body ? JSON.stringify(opts.body) : undefined
	});
	const json = await resp.json().catch(() => ({}));
	return { ok: resp.ok, status: resp.status, json };
}

async function fetchOrder(orderId, token) {
	const r = await paypalApi(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, token);
	if (!r.ok) throw new Error('PayPal order lookup failed: ' + (r.json.message || r.status));
	return r.json;
}

// custom_id is "product", or "product|discount-id|sig" for an order this server made with a valid code.
// The sig means an order made elsewhere with the browser SDK can't claim a discount.
function discountSig(product, discountId) {
	return crypto.createHmac('sha256', process.env.PAYPAL_CLIENT_SECRET || '').update(`discount:${product}|${discountId}`).digest('hex').slice(0, 20);
}

function parseCustomId(customId) {
	const [productPart, discountId, sig] = String(customId || '').split('|');
	const product = normalizeProduct(productPart);
	if (!product) return { product: null };
	if (!discountId) return { product, discount: null };
	const discount = discountById(discountId, product);
	const sigOk = !!sig && !!process.env.PAYPAL_CLIENT_SECRET && sig === discountSig(product, discountId);
	return { product, discount: discount && sigOk ? discount : null, badDiscount: !discount || !sigOk };
}

function quote(body) {
	const product = normalizeProduct(body.product);
	if (!product || !PRODUCTS[product].price) return { status: 400, json: { ok: false, error: 'Unknown product' } };
	const code = String(body.code || '').trim();
	const discount = code ? findDiscount(code, product) : null;
	if (code && !discount) return { status: 400, json: { ok: false, error: "That code isn't valid for " + PRODUCTS[product].name } };
	return { status: 200, product, discount, json: {
		ok: true, product, listPrice: PRODUCTS[product].price, price: priceFor(product, discount),
		percent: discount ? discount.percent : 0, label: discount ? discount.label : null
	} };
}

// Same order, same key: a repeated request returns the key the order already has
function orderLicenseKey(orderId) {
	const h = crypto.createHmac('sha256', process.env.PAYPAL_CLIENT_SECRET || '').update('paypal-order:' + orderId).digest('hex');
	return `${h.slice(0, 16)}-${h.slice(16, 24)}`;
}

module.exports = async function handler(req, res) {
	// The pages load the PayPal button with this client id, so the button and the server always use
	// the same PayPal app (live, or sandbox with PAYPAL_ENV=sandbox). A client id is public.
	if (req.method === 'GET') {
		res.setHeader('Cache-Control', 'public, max-age=60');
		const clientId = process.env.PAYPAL_CLIENT_ID || '';
		if (!clientId) return res.status(503).json({ ok: false, error: 'PayPal is not configured on the server' });
		// ?check=1 signs in to PayPal with the server's id and secret, to see if they belong together
		if (req.query && req.query.check) {
			res.setHeader('Cache-Control', 'no-store');
			try {
				await paypalToken();
				return res.status(200).json({ ok: true, signIn: 'ok', sandbox: process.env.PAYPAL_ENV === 'sandbox' });
			} catch (err) {
				return res.status(200).json({ ok: false, signIn: 'failed', error: err.message, sandbox: process.env.PAYPAL_ENV === 'sandbox' });
			}
		}
		return res.status(200).json({ ok: true, clientId, sandbox: process.env.PAYPAL_ENV === 'sandbox' });
	}
	if (req.method !== 'POST') {
		res.setHeader('Allow', ['GET', 'POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	const body = req.body || {};

	if (body.action === 'quote' || body.action === 'create') {
		const q = quote(body);
		if (q.status !== 200 || body.action === 'quote') return res.status(q.status).json(q.json);
		try {
			const token = await paypalToken();
			const r = await paypalApi('/v2/checkout/orders', token, { method: 'POST', body: {
				intent: 'CAPTURE',
				// A download: no shipping address on PayPal's page or card form
				application_context: { shipping_preference: 'NO_SHIPPING', brand_name: 'Cool Reaper Scripts' },
				purchase_units: [{
					amount: { currency_code: 'USD', value: q.json.price },
					description: `${PRODUCTS[q.product].name} for REAPER - Lifetime License` + (q.discount ? ` (${q.discount.label} ${q.discount.percent}% off)` : ''),
					custom_id: q.product + (q.discount ? `|${q.discount.id}|${discountSig(q.product, q.discount.id)}` : '')
				}]
			} });
			if (!r.ok || !r.json.id) throw new Error('PayPal could not create the order: ' + (r.json.message || r.status));
			return res.status(200).json({ ok: true, id: r.json.id, price: q.json.price });
		} catch (err) {
			console.error('PayPal create failed:', err);
			return res.status(502).json({ ok: false, error: err.message || 'Could not start the PayPal order' });
		}
	}

	const orderId = String(body.orderId || body.id || '').trim();
	if (!/^[A-Z0-9-]{6,64}$/i.test(orderId)) {
		return res.status(400).json({ ok: false, error: 'Missing PayPal order id' });
	}

	let order;
	try {
		const token = await paypalToken();
		order = await fetchOrder(orderId, token);
		// Orders the server created are approved in the browser and captured here
		if (order.status === 'APPROVED') {
			const cap = await paypalApi(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, token, {
				method: 'POST', body: {}, headers: { 'PayPal-Request-Id': 'capture-' + orderId }
			});
			if (!cap.ok && cap.json.details?.[0]?.issue !== 'ORDER_ALREADY_CAPTURED') {
				return res.status(402).json({ ok: false, error: 'PayPal could not take the payment: ' + (cap.json.details?.[0]?.description || cap.json.message || cap.status) });
			}
			order = await fetchOrder(orderId, token);
		}
	} catch (err) {
		console.error('PayPal verification failed:', err);
		return res.status(502).json({ ok: false, error: err.message || 'Could not check the order with PayPal' });
	}

	const unit = order.purchase_units?.[0] || {};
	const capture = unit.payments?.captures?.[0];
	if (order.status !== 'COMPLETED' || !capture || capture.status !== 'COMPLETED') {
		return res.status(402).json({ ok: false, error: 'This order has not been paid' });
	}

	// Which script was bought, and with which discount (the order's custom_id); none = Vertical FX List
	const { product, discount, badDiscount } = parseCustomId(unit.custom_id);
	if (!product) {
		return res.status(400).json({ ok: false, error: 'Unknown product' });
	}
	if (badDiscount) {
		return res.status(400).json({ ok: false, error: 'The discount on this order is not valid' });
	}
	const productName = PRODUCTS[product].name;

	const amount = capture.amount?.value || unit.amount?.value;
	const currency = capture.amount?.currency_code || unit.amount?.currency_code;
	const price = PRODUCTS[product].price && priceFor(product, discount);
	if (currency !== 'USD' || !price || Number(amount) + 1e-9 < Number(price)) {
		console.error('PayPal amount mismatch:', { orderId, product, amount, currency, price });
		return res.status(402).json({ ok: false, error: `The amount paid doesn't match the ${productName} price` });
	}

	// The key goes to the buyer's site account when they are signed in, otherwise to the email they gave PayPal
	const checkoutEmail = normalizeEmail(order.payer?.email_address);
	const accountEmail = await emailFromAccessToken(body.accessToken);
	let payerEmail = accountEmail || checkoutEmail;
	let emailSource = accountEmail ? 'account' : 'checkout';
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
		if (licenseResult.email && licenseResult.email !== payerEmail) {
			payerEmail = licenseResult.email;
			emailSource = payerEmail === checkoutEmail ? 'checkout' : 'account';
		}
		return res.status(200).json({
			ok: true, orderId, email: payerEmail, emailSource, product,
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
			const mail = buildPurchaseEmail({
				productName, product, licenseKey: licenseResult.licenseKey, email: payerEmail, payerName, orderId
			});
			const emailResponse = await resend.emails.send({
				from: fromEmail,
				to: payerEmail,
				subject: mail.subject,
				html: mail.html,
				text: mail.text
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
		emailSource,
		product,
		licenseKey: licenseResult.licenseKey,
		status: licenseResult.status,
		expiresAt: licenseResult.expiresAt || null,
		emailSent,
		emailError: emailError || null
	});
};
