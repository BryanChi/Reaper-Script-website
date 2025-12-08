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
	const testEmail = normalizeEmail(body.email || body.testEmail);

	if (!testEmail) {
		return res.status(400).json({ 
			ok: false, 
			error: 'Missing email. Send POST with { "email": "your@email.com" }' 
		});
	}

	const payerName = body.name || body.payerName || 'Test User';

	// Activate or generate a license
	let licenseResult;
	try {
		licenseResult = await activateLicense(testEmail);
		if (!licenseResult.ok) {
			return res.status(400).json({ ok: false, error: licenseResult.error || 'Unable to activate license' });
		}
	} catch (err) {
		return res.status(500).json({ ok: false, error: err.message || 'License activation failed' });
	}

	// Attempt to send email via Resend if configured
	let emailSent = false;
	let emailError = null;
	let emailDetails = null;
	const resend = getResend();
	const fromEmail = process.env.RESEND_FROM_EMAIL;
	
	if (!resend) {
		emailError = 'Resend client not initialized. Check RESEND_API_KEY environment variable.';
	} else if (!fromEmail) {
		emailError = 'RESEND_FROM_EMAIL environment variable not set.';
	} else {
		try {
			const emailResponse = await resend.emails.send({
				from: fromEmail,
				to: testEmail,
				subject: 'Your Reaper Script License',
				html: `
					<p>Hi ${payerName},</p>
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
				emailDetails = { id: emailResponse.data.id, from: fromEmail, to: testEmail };
			} else {
				emailError = 'Unexpected response from Resend API';
				console.error('Unexpected Resend response:', emailResponse);
			}
		} catch (err) {
			emailError = err.message || 'Unknown error';
			console.error('Resend email failed:', err);
			// Log full error details for debugging
			if (err.response) {
				console.error('Resend error response:', err.response);
			}
		}
	}

	return res.status(200).json({
		ok: true,
		email: testEmail,
		licenseKey: licenseResult.licenseKey,
		status: licenseResult.status,
		expiresAt: licenseResult.expiresAt || null,
		emailSent,
		emailError: emailError || null,
		emailDetails: emailDetails || null,
		message: emailSent 
			? `Email sent successfully! (ID: ${emailDetails?.id || 'unknown'})` 
			: emailError 
				? `Email not sent: ${emailError}` 
				: 'License generated but email not configured'
	});
};
