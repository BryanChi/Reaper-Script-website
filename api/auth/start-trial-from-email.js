const { startTrial, normalizeEmail } = require('../_lib/store');

// Helper function to confirm email in Supabase using service role
async function confirmEmailInSupabase(email) {
	try {
		const { createClient } = require('@supabase/supabase-js');
		
		// Check environment variables
		if (!process.env.SUPABASE_URL) {
			console.error('SUPABASE_URL not set');
			return { ok: false, error: 'SUPABASE_URL not configured' };
		}
		
		if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
			console.error('SUPABASE_SERVICE_ROLE_KEY not set');
			return { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY not configured' };
		}

		console.log('Attempting to confirm email for:', email);
		console.log('Supabase URL:', process.env.SUPABASE_URL);
		console.log('Service role key present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

		const supabaseAdmin = createClient(
			process.env.SUPABASE_URL,
			process.env.SUPABASE_SERVICE_ROLE_KEY,
			{
				auth: { 
					autoRefreshToken: false, 
					persistSession: false 
				}
			}
		);

		// Get the user by email - handle pagination
		const normalizedEmail = email.toLowerCase().trim();
		let allUsers = [];
		let page = 1;
		let hasMore = true;

		while (hasMore) {
			const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
				page: page,
				perPage: 1000
			});
			
			if (listError) {
				console.error('Error listing users:', listError);
				return { ok: false, error: `Failed to list users: ${listError.message}` };
			}

			if (usersData?.users && usersData.users.length > 0) {
				allUsers = allUsers.concat(usersData.users);
				hasMore = usersData.users.length === 1000; // If we got a full page, there might be more
				page++;
			} else {
				hasMore = false;
			}
		}

		console.log(`Found ${allUsers.length} total users in Supabase`);

		const user = allUsers.find(u => {
			const userEmail = u.email?.toLowerCase().trim();
			return userEmail === normalizedEmail;
		});
		
		if (!user) {
			console.warn(`User not found for email: ${email} (searched ${allUsers.length} users)`);
			// Log first few user emails for debugging (without exposing full emails)
			if (allUsers.length > 0) {
				const sampleEmails = allUsers.slice(0, 3).map(u => {
					const e = u.email || 'no-email';
					return e.substring(0, 3) + '...' + e.substring(e.length - 3);
				});
				console.log('Sample user emails:', sampleEmails);
			}
			return { ok: false, error: `User not found for email: ${email}` };
		}

		console.log(`Found user: ${user.id}, email confirmed: ${!!user.email_confirmed_at}`);

		// If already confirmed, return success
		if (user.email_confirmed_at) {
			console.log('Email already confirmed');
			return { ok: true, message: 'Email already confirmed' };
		}

		// Confirm the email
		console.log('Confirming email for user:', user.id);
		const { data, error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(
			user.id,
			{ email_confirm: true }
		);

		if (confirmError) {
			console.error('Error confirming email:', confirmError);
			return { ok: false, error: `Failed to confirm email: ${confirmError.message}` };
		}

		console.log('Email confirmed successfully');
		return { ok: true, message: 'Email confirmed successfully' };
	} catch (err) {
		console.error('Error in confirmEmailInSupabase:', err);
		console.error('Error stack:', err.stack);
		return { ok: false, error: err.message || 'Failed to confirm email' };
	}
}

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
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, initial-scale=1">
				<style>
					* { box-sizing: border-box; margin: 0; padding: 0; }
					body { 
						font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
						max-width: 600px; 
						margin: 50px auto; 
						padding: 20px; 
						text-align: center; 
						background: #030806;
						color: #f3f4f6;
					}
					.container {
						background: rgba(11, 25, 18, 0.4);
						border: 1px solid rgba(34, 243, 107, 0.15);
						border-radius: 24px;
						padding: 40px;
					}
					.error { color: #f87171; font-size: 32px; margin-bottom: 16px; }
					h1 { color: #f87171; margin-bottom: 16px; }
					p { color: #9ca3af; }
				</style>
			</head>
			<body>
				<div class="container">
					<h1 class="error">Invalid Link</h1>
					<p>This link is invalid or has expired. Please request a new verification email.</p>
				</div>
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
					<meta charset="utf-8">
					<meta name="viewport" content="width=device-width, initial-scale=1">
					<style>
						* { box-sizing: border-box; margin: 0; padding: 0; }
						body { 
							font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
							max-width: 600px; 
							margin: 50px auto; 
							padding: 20px; 
							text-align: center; 
							background: #030806;
							color: #f3f4f6;
						}
						.container {
							background: rgba(11, 25, 18, 0.4);
							border: 1px solid rgba(34, 243, 107, 0.15);
							border-radius: 24px;
							padding: 40px;
						}
						.error { color: #f87171; font-size: 32px; margin-bottom: 16px; }
						h1 { color: #f87171; margin-bottom: 16px; }
						p { color: #9ca3af; }
					</style>
				</head>
				<body>
					<div class="container">
						<h1 class="error">Link Expired</h1>
						<p>This link has expired. Please request a new verification email.</p>
					</div>
				</body>
				</html>
			`);
		}

		// Confirm email in Supabase first (so user can log in)
		const confirmResult = await confirmEmailInSupabase(email);
		if (!confirmResult.ok) {
			console.error('Failed to confirm email in Supabase:', confirmResult.error);
			// Log the error but continue - trial can still be started
			// The user will need to verify their email manually or we can retry later
		} else {
			console.log('Email confirmation result:', confirmResult.message);
		}

		// Start trial for this email
		const result = await startTrial(email);

		if (!result.ok) {
			return res.status(400).send(`
				<!DOCTYPE html>
				<html>
				<head>
					<title>Unable to Start Trial</title>
					<meta charset="utf-8">
					<meta name="viewport" content="width=device-width, initial-scale=1">
					<style>
						* { box-sizing: border-box; margin: 0; padding: 0; }
						body { 
							font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
							max-width: 600px; 
							margin: 50px auto; 
							padding: 20px; 
							text-align: center; 
							background: #030806;
							color: #f3f4f6;
						}
						.container {
							background: rgba(11, 25, 18, 0.4);
							border: 1px solid rgba(34, 243, 107, 0.15);
							border-radius: 24px;
							padding: 40px;
						}
						.error { color: #f87171; font-size: 32px; margin-bottom: 16px; }
						h1 { color: #f87171; margin-bottom: 16px; }
						p { color: #9ca3af; }
					</style>
				</head>
				<body>
					<div class="container">
						<h1 class="error">Unable to Start Trial</h1>
						<p>${result.error || 'An error occurred while starting your trial.'}</p>
					</div>
				</body>
				</html>
			`);
		}

		// Success page
		const siteUrl = process.env.SITE_URL || 'https://www.coolreaperscripts.com';
		const expiresDate = result.expiresAt ? new Date(result.expiresAt).toLocaleDateString() : 'N/A';

		return res.status(200).send(`
			<!DOCTYPE html>
			<html>
			<head>
				<title>Trial Started Successfully</title>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, initial-scale=1">
				<style>
					* { box-sizing: border-box; margin: 0; padding: 0; }
					body { 
						font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
						max-width: 600px; 
						margin: 50px auto; 
						padding: 20px; 
						text-align: center; 
						background: #030806;
						color: #f3f4f6;
						line-height: 1.6;
					}
					.container { 
						background: rgba(11, 25, 18, 0.4);
						border: 1px solid rgba(34, 243, 107, 0.15);
						border-radius: 24px; 
						padding: 40px; 
						box-shadow: 0 20px 50px rgba(0,0,0,0.5);
					}
					.success { 
						color: #22f36b; 
						font-size: 48px; 
						margin-bottom: 20px; 
						filter: drop-shadow(0 0 10px rgba(34, 243, 107, 0.5));
					}
					h1 { 
						color: #f3f4f6; 
						margin-top: 0; 
						font-size: 32px;
						font-weight: 700;
						margin-bottom: 16px;
					}
					p { 
						color: #9ca3af; 
						line-height: 1.6; 
						margin-bottom: 12px;
					}
					p strong {
						color: #f3f4f6;
					}
					.license-key { 
						background: rgba(255, 255, 255, 0.05);
						border: 1px solid rgba(255, 255, 255, 0.08);
						padding: 12px; 
						border-radius: 8px; 
						font-family: monospace; 
						font-size: 14px; 
						margin: 20px 0; 
						word-break: break-all;
						color: #22f36b;
					}
					.button { 
						display: inline-block; 
						background: #22f36b; 
						color: #111827; 
						text-decoration: none; 
						padding: 12px 24px; 
						border-radius: 12px; 
						font-weight: 600; 
						margin-top: 20px;
						transition: background 0.2s, transform 0.2s;
					}
					.button:hover { 
						background: #36f578;
						transform: translateY(-1px);
					}
				</style>
			</head>
			<body>
				<div class="container">
					<div class="success">✓</div>
					<h1>Trial Started Successfully!</h1>
					<p>Your email has been confirmed and your 14-day free trial has been activated for <strong>${email}</strong>.</p>
					<p style="color: #22f36b; margin-top: 16px;">✓ You can now log in with your email and password!</p>
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
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, initial-scale=1">
				<style>
					* { box-sizing: border-box; margin: 0; padding: 0; }
					body { 
						font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
						max-width: 600px; 
						margin: 50px auto; 
						padding: 20px; 
						text-align: center; 
						background: #030806;
						color: #f3f4f6;
					}
					.container {
						background: rgba(11, 25, 18, 0.4);
						border: 1px solid rgba(34, 243, 107, 0.15);
						border-radius: 24px;
						padding: 40px;
					}
					.error { color: #f87171; font-size: 32px; margin-bottom: 16px; }
					h1 { color: #f87171; margin-bottom: 16px; }
					p { color: #9ca3af; }
				</style>
			</head>
			<body>
				<div class="container">
					<h1 class="error">Error</h1>
					<p>An error occurred while processing your request. Please try again later.</p>
				</div>
			</body>
			</html>
		`);
	}
};

