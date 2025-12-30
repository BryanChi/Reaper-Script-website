const { startTrial, normalizeEmail } = require('../_lib/store');

module.exports = async function handler(req, res) {
	if (req.method !== 'GET') {
		res.setHeader('Allow', ['GET']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	const token = req.query?.token;

	if (!token) {
		return res.status(400).send(`
			<!DOCTYPE html>
			<html>
			<head>
				<title>Invalid Link</title>
				<style>
					body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
					.error { color: #dc2626; }
				</style>
			</head>
			<body>
				<h1 class="error">Invalid Link</h1>
				<p>This link is invalid or has expired. Please request a new verification email.</p>
			</body>
			</html>
		`);
	}

	try {
		// Decode token
		const tokenData = JSON.parse(Buffer.from(token, 'base64url').toString('utf-8'));
		const email = normalizeEmail(tokenData.email);
		const expiresAt = tokenData.expiresAt;

		if (!email) {
			throw new Error('Invalid token: missing email');
		}

		// Check if token has expired
		if (Date.now() > expiresAt) {
			return res.status(400).send(`
				<!DOCTYPE html>
				<html>
				<head>
					<title>Link Expired</title>
					<style>
						body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
						.error { color: #dc2626; }
					</style>
				</head>
				<body>
					<h1 class="error">Link Expired</h1>
					<p>This link has expired. Please request a new verification email.</p>
				</body>
				</html>
			`);
		}

		// Start trial for this email
		const result = await startTrial(email);

		if (!result.ok) {
			return res.status(400).send(`
				<!DOCTYPE html>
				<html>
				<head>
					<title>Unable to Start Trial</title>
					<style>
						body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
						.error { color: #dc2626; }
					</style>
				</head>
				<body>
					<h1 class="error">Unable to Start Trial</h1>
					<p>${result.error || 'An error occurred while starting your trial.'}</p>
				</body>
				</html>
			`);
		}

		// Success page
		const siteUrl = process.env.SITE_URL || req.headers.origin || 'https://example.com';
		const expiresDate = result.expiresAt ? new Date(result.expiresAt).toLocaleDateString() : 'N/A';

		return res.status(200).send(`
			<!DOCTYPE html>
			<html>
			<head>
				<title>Trial Started Successfully</title>
				<style>
					body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; background-color: #f9fafb; }
					.container { background-color: #ffffff; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
					.success { color: #10b981; font-size: 48px; margin-bottom: 20px; }
					h1 { color: #111827; margin-top: 0; }
					p { color: #374151; line-height: 1.6; }
					.license-key { background-color: #f3f4f6; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 14px; margin: 20px 0; word-break: break-all; }
					.button { display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 20px; }
					.button:hover { background-color: #2563eb; }
				</style>
			</head>
			<body>
				<div class="container">
					<div class="success">✓</div>
					<h1>Trial Started Successfully!</h1>
					<p>Your 14-day free trial has been activated for <strong>${email}</strong>.</p>
					${result.licenseKey ? `
						<p>Your trial license key:</p>
						<div class="license-key">${result.licenseKey}</div>
					` : ''}
					<p>Trial expires on: <strong>${expiresDate}</strong></p>
					<a href="${siteUrl}" class="button">Go to Website</a>
				</div>
			</body>
			</html>
		`);

	} catch (err) {
		console.error('Error processing trial start:', err);
		return res.status(500).send(`
			<!DOCTYPE html>
			<html>
			<head>
				<title>Error</title>
				<style>
					body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
					.error { color: #dc2626; }
				</style>
			</head>
			<body>
				<h1 class="error">Error</h1>
				<p>An error occurred while processing your request. Please try again later.</p>
			</body>
			</html>
		`);
	}
};

