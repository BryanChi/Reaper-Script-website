const { activateLicense, normalizeEmail } = require('../_lib/store');

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

module.exports = async function handler(req, res) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	const body = req.body || {};

	// Minimal validation: ensure we have an email and an order id
	const payerEmail = normalizeEmail(
		body.payerEmail ||
		body.email ||
		body.payer?.email_address ||
		body.purchase_units?.[0]?.payee?.email_address ||
		body.purchase_units?.[0]?.shipping?.email_address
	);

	if (!payerEmail) {
		return res.status(400).json({ ok: false, error: 'Missing payer email' });
	}

	const orderId = body.orderId || body.id || body.transactionId;
	const amount = body.amount || body.purchase_units?.[0]?.amount?.value || '19.00';
	const currency = body.currency || body.purchase_units?.[0]?.amount?.currency_code || 'USD';
	const payerName =
		body.payerName ||
		(body.payer?.name && `${body.payer.name.given_name || ''} ${body.payer.name.surname || ''}`.trim()) ||
		'';

	// Activate or generate a license
	let licenseResult;
	try {
		licenseResult = await activateLicense(payerEmail);
		if (!licenseResult.ok) {
			return res.status(400).json({ ok: false, error: licenseResult.error || 'Unable to activate license' });
		}
	} catch (err) {
		return res.status(500).json({ ok: false, error: err.message || 'License activation failed' });
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
				subject: 'Your Reaper Script License',
				html: `
					<p>Hi ${payerName || 'there'},</p>
					<p>Thank you for your purchase. Here is your license key:</p>
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
		licenseKey: licenseResult.licenseKey,
		status: licenseResult.status,
		expiresAt: licenseResult.expiresAt || null,
		emailSent,
		emailError: emailError || null
	});
};
