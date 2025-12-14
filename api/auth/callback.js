// OAuth callback handler - receives Google OAuth callback and displays authorization code
// This endpoint receives the OAuth callback from Google and redirects to a nice success page
module.exports = async function handler(req, res) {
	const { code, error, state } = req.query;

	if (error) {
		// Redirect to error page
		return res.redirect(`/auth/error?error=${encodeURIComponent(error)}`);
	}

	if (!code) {
		return res.redirect('/auth/error?error=no_code');
	}

	// Redirect to success page with the authorization code
	// The code will be displayed on a nice branded page for the user to copy
	return res.redirect(`/auth/success?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state || '')}`);
};
