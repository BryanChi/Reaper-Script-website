const crypto = require('crypto');

module.exports = async function handler(req, res) {
	if (req.method !== 'POST') {
		res.setHeader('Allow', ['POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}

	const adminPassword = process.env.ADMIN_PASSWORD;
	
	if (!adminPassword) {
		console.error('ADMIN_PASSWORD environment variable not set!');
		return res.status(500).json({ 
			ok: false, 
			error: 'Admin panel not configured. Set ADMIN_PASSWORD environment variable.' 
		});
	}

	const providedPassword = req.body?.password;

	if (!providedPassword) {
		return res.status(400).json({ ok: false, error: 'Password required' });
	}

	if (providedPassword !== adminPassword) {
		return res.status(401).json({ ok: false, error: 'Invalid password' });
	}

	// Generate a simple token (in production, use JWT or similar)
	const token = crypto.randomBytes(32).toString('hex');
	
	// Store token in memory (in production, use Redis or database)
	if (!global.__adminTokens) {
		global.__adminTokens = new Set();
	}
	global.__adminTokens.add(token);

	// Expire token after 24 hours
	setTimeout(() => {
		if (global.__adminTokens) {
			global.__adminTokens.delete(token);
		}
	}, 24 * 60 * 60 * 1000);

	return res.status(200).json({ ok: true, token });
};
