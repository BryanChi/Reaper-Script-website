const { normalizeEmail } = require('../_lib/store');
const crypto = require('crypto');

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
	const email = normalizeEmail(body.email);

	if (!email) {
		return res.status(400).json({ 
			ok: false, 
			error: 'Missing email. Send POST with { "email": "your@email.com" }' 
		});
	}

	// Generate a secure token for starting trial (valid for 24 hours)
	const token = crypto.randomBytes(32).toString('hex');
	const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
	
	// Store token temporarily (in production, you'd store this in a database)
	// For now, we'll encode email and expiration in the token itself
	const tokenData = {
		email: email,
		expiresAt: expiresAt
	};
	const encodedToken = Buffer.from(JSON.stringify(tokenData)).toString('base64url');
	
	// Get site URL from environment or use default
	const siteUrl = process.env.SITE_URL || req.headers.origin || 'https://example.com';
	const startTrialUrl = `${siteUrl}/api/auth/start-trial-from-email?token=${encodedToken}`;

	// Attempt to send email via Resend if configured
	let emailSent = false;
	let emailError = null;
	let emailDetails = null;
	const resend = getResend();
	// Clean up the FROM email - remove extra quotes and whitespace
	let fromEmail = process.env.RESEND_FROM_EMAIL;
	if (fromEmail) {
		fromEmail = fromEmail.trim().replace(/^["']|["']$/g, ''); // Remove surrounding quotes
	}
	
	if (!resend) {
		emailError = 'Resend client not initialized. Check RESEND_API_KEY environment variable.';
	} else if (!fromEmail) {
		emailError = 'RESEND_FROM_EMAIL environment variable not set.';
	} else {
		// Validate format
		const emailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		const nameEmailFormat = /^.+<[^\s@]+@[^\s@]+\.[^\s@]+>$/;
		if (!emailFormat.test(fromEmail) && !nameEmailFormat.test(fromEmail)) {
			emailError = `Invalid RESEND_FROM_EMAIL format. Use "email@example.com" or "Name <email@example.com>". Current value: "${fromEmail}"`;
		}
	}
	
	if (!emailError) {
		try {
			const emailResponse = await resend.emails.send({
				from: fromEmail,
				to: email,
				subject: 'Welcome! Verify your account and start your trial',
				html: `
					<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
						<div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
							<h1 style="color: #111827; margin-top: 0;">Welcome to Reaper Script!</h1>
							<p style="color: #374151; line-height: 1.6;">Thank you for creating an account. Please verify your email address by clicking the confirmation link sent by Supabase.</p>
							<p style="color: #374151; line-height: 1.6;">Once your email is verified, you can start your 14-day free trial right away!</p>
							<div style="margin: 30px 0; text-align: center;">
								<a href="${startTrialUrl}" style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 16px;">Start Your Free Trial</a>
							</div>
							<p style="color: #6b7280; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
								This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
							</p>
						</div>
					</div>
				`
			});
			
			// Check if Resend returned an error in the response
			if (emailResponse.error) {
				emailError = emailResponse.error.message || JSON.stringify(emailResponse.error);
				console.error('Resend API error:', emailResponse.error);
			} else if (emailResponse.data && emailResponse.data.id) {
				emailSent = true;
				emailDetails = { id: emailResponse.data.id, from: fromEmail, to: email };
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
		email: email,
		emailSent,
		emailError: emailError || null,
		emailDetails: emailDetails || null,
		message: emailSent 
			? `Verification email sent successfully!` 
			: emailError 
				? `Email not sent: ${emailError}` 
				: 'Email not configured'
	});
};

