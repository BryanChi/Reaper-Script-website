// The email a buyer gets after paying: their key plus the steps to install and activate the script.
// Styled like the site (black, column guides, Anton titles, mono caps, green accent) with email-safe
// HTML: tables and inline styles only, plus a plain-text part for clients that don't show HTML.

const SITE = 'https://www.coolreaperscripts.com';
const MANAGER_URL = SITE + '/assets/Download/Cool%20Reaper%20Script%20Manager.lua';

// What each script is called in REAPER's Actions list, and what it needs besides REAPER
const SCRIPT_INFO = {
	'vertical-fx-list': { action: 'CRS_vertical fx list', needs: 'ReaImGui, js_ReaScriptAPI and SWS' },
	'fx-devices': { action: 'BryanChi_FX Devices', needs: 'ReaImGui and js_ReaScriptAPI' }
};

const C = {
	page: '#0b0c0f', card: '#111317', ink: '#e6e8eb', ink2: '#a9afb8', ink3: '#6f7681',
	line: '#1f2227', line2: '#2c3036', acc: '#49cc85', accInk: '#062414', accBg: '#0f1d16'
};
const F = {
	display: "Anton, Impact, 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif",
	ui: "'Inter Tight', Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
	mono: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'Courier New', monospace"
};

function esc(s) {
	return String(s == null ? '' : s)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// The setup steps, shared by the HTML and text parts. Text may hold {b:...} (bold) and {code:...}.
function setupSteps(productName, product, email) {
	const info = SCRIPT_INFO[product] || SCRIPT_INFO['vertical-fx-list'];
	return [
		{ title: 'Download the Script Manager', body: [
			'Get {b:Cool Reaper Script Manager.lua}, the free installer that installs and updates your scripts.'
		], link: { label: 'Download the Script Manager', url: MANAGER_URL } },
		{ title: 'Load and run it in REAPER', body: [
			'Open the Actions list, click {b:New action} then {b:Load ReaScript}, pick the file you downloaded and run it. It moves itself into REAPER, so the downloaded file disappears.'
		] },
		{ title: 'Sign in and install', body: [
			`Next to ${productName}, click {b:Sign in with browser}. The activation page opens with a code.`,
			`Sign in with {b:${email}}, the email this message was sent to. Google, a password, or {b:Email me a sign-in link} all work, as long as it's this address.`,
			`Check that the code matches the one in REAPER and click {b:Activate}. Back in the Script Manager, click {b:Install}.`
		] },
		{ title: `Run ${productName}`, body: [
			`Search the Actions list for {code:${info.action}} and run it. It opens already activated. Give it a shortcut so it's one key away.`,
			`Updates and our other scripts live under {b:Scripts and updates} in its settings, so you won't need the Script Manager file again.`
		] }
	];
}

function inlineHtml(s) {
	return esc(s)
		.replace(/\{b:([^}]*)\}/g, `<strong style="color:${C.ink};font-weight:600;">$1</strong>`)
		.replace(/\{code:([^}]*)\}/g, `<span style="font-family:${F.mono};font-size:13px;color:${C.ink};background:#1a1d22;padding:2px 6px;">$1</span>`);
}
const inlineText = s => s.replace(/\{(?:b|code):([^}]*)\}/g, '$1');

// "18 October 2028"
function longDate(ms) {
	return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// The line about updates: a purchase includes 2 years of them, and buying again renews the same license
function updatesLine(productName, updatesUntil, renewed) {
	const until = updatesUntil ? ` until ${longDate(updatesUntil)}` : '';
	if (renewed) return `Thank you for renewing ${productName}. Your updates now run${until}, on the same key and computers as before.`;
	return `Thank you for buying ${productName}. Your license includes 2 years of updates${until}, through the Script Manager.`;
}

function buildPurchaseEmail({ productName, product, licenseKey, email, payerName, orderId, updatesUntil, renewed }) {
	const info = SCRIPT_INFO[product] || SCRIPT_INFO['vertical-fx-list'];
	const steps = setupSteps(productName, product, email);
	const hi = payerName ? `Hi ${payerName},` : 'Hi there,';
	const subject = renewed ? `Your ${productName} updates are renewed` : `Your ${productName} license, and how to set it up`;

	const kicker = (num, label) => `
		<div style="font-family:${F.mono};font-size:11px;line-height:1;letter-spacing:3px;text-transform:uppercase;color:${C.ink2};">
			<span style="font-family:${F.display};font-size:20px;letter-spacing:0;color:${C.acc};padding-right:10px;">${num}</span>${esc(label)}
		</div>`;

	const stepRows = steps.map((s, i) => `
		<tr>
			<td width="34" valign="top" style="padding:18px 0;border-bottom:1px solid ${C.line};">
				<div style="width:32px;height:32px;line-height:32px;text-align:center;border:1px solid ${C.line2};font-family:${F.display};font-size:17px;color:${C.ink};">${i + 1}</div>
			</td>
			<td valign="top" style="padding:18px 0 18px 16px;border-bottom:1px solid ${C.line};">
				<div style="font-family:${F.display};font-size:20px;line-height:1.1;text-transform:uppercase;letter-spacing:0.5px;color:${C.ink};padding:5px 0 6px;">${esc(s.title)}</div>
				${s.body.map(p => `<p style="margin:0 0 8px;font-family:${F.ui};font-size:15px;line-height:1.6;color:${C.ink2};">${inlineHtml(p)}</p>`).join('')}
				${s.link ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;"><tr><td bgcolor="${C.acc}" style="background:${C.acc};">
					<a href="${esc(s.link.url)}" style="display:inline-block;padding:11px 18px;font-family:${F.mono};font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${C.accInk};text-decoration:none;">&darr;&nbsp; ${esc(s.link.label)}</a>
				</td></tr></table>` : ''}
			</td>
		</tr>`).join('');

	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter+Tight:wght@400;600&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${C.page};" bgcolor="${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your ${esc(productName)} key, and four steps to get it running in REAPER. Activate with ${esc(email)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};">
<tr><td align="center" style="padding:28px 12px;">
	<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-left:1px solid ${C.line};border-right:1px solid ${C.line};">
		<!-- top bar -->
		<tr><td style="padding:16px 28px;border-top:1px solid ${C.line};border-bottom:1px solid ${C.line};">
			<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
				<td style="font-family:${F.mono};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${C.ink};">
					<span style="display:inline-block;width:8px;height:8px;background:${C.acc};margin-right:8px;"></span>Cool Reaper Scripts
				</td>
				<td align="right" style="font-family:${F.mono};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${C.ink3};">License</td>
			</tr></table>
		</td></tr>

		<!-- title -->
		<tr><td style="padding:40px 28px 8px;">
			${kicker('01', 'Payment received')}
			<h1 style="margin:18px 0 0;font-family:${F.display};font-weight:400;font-size:44px;line-height:1;text-transform:uppercase;letter-spacing:0.5px;color:${C.ink};">${esc(productName)} is yours.<br><span style="color:${C.acc};">Let's get it running.</span></h1>
			<p style="margin:22px 0 0;font-family:${F.ui};font-size:16px;line-height:1.6;color:${C.ink2};">${esc(hi)} ${esc(updatesLine(productName, updatesUntil, renewed).replace(/^T/, 't'))} Here's everything you need to set it up.</p>
		</td></tr>

		<!-- the email to sign in with -->
		<tr><td style="padding:24px 28px 0;">
			<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.accBg}" style="background:${C.accBg};border:1px solid ${C.acc};">
				<tr><td style="padding:18px 20px;">
					<div style="font-family:${F.mono};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${C.acc};">Activate with this email</div>
					<div style="margin-top:10px;font-family:${F.mono};font-size:17px;font-weight:600;color:#ffffff;word-break:break-all;">${esc(email)}</div>
					<p style="margin:10px 0 0;font-family:${F.ui};font-size:14px;line-height:1.55;color:${C.ink2};">Your license is linked to the address this email was sent to. When REAPER asks you to sign in, use this same email and your copy unlocks on its own.</p>
				</td></tr>
			</table>
		</td></tr>

		<!-- key -->
		<tr><td style="padding:16px 28px 0;">
			<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line2};">
				<tr><td style="padding:16px 20px;">
					<div style="font-family:${F.mono};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${C.ink3};">License key</div>
					<div style="margin-top:10px;font-family:${F.mono};font-size:16px;font-weight:600;color:#ffffff;word-break:break-all;">${esc(licenseKey)}</div>
					<p style="margin:8px 0 0;font-family:${F.ui};font-size:13px;line-height:1.5;color:${C.ink3};">You won't need to type it: signing in finds it for you. Keep it as your proof of purchase.</p>
				</td></tr>
			</table>
		</td></tr>

		<!-- steps -->
		<tr><td style="padding:40px 28px 0;">
			${kicker('02', 'Set it up')}
			<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;border-top:1px solid ${C.line};">
				${stepRows}
			</table>
			<p style="margin:16px 0 0;font-family:${F.ui};font-size:13px;line-height:1.6;color:${C.ink3};">Already installed it for the free trial? Open its license settings and click Sign in with browser. Your license works on up to 3 computers.</p>
			<p style="margin:8px 0 0;font-family:${F.ui};font-size:13px;line-height:1.6;color:${C.ink3};">Needs REAPER with ${esc(info.needs)}, all free through <a href="https://reapack.com" style="color:${C.acc};">ReaPack</a>.</p>
		</td></tr>

		<!-- help -->
		<tr><td style="padding:40px 28px 32px;">
			${kicker('03', 'Need a hand?')}
			<p style="margin:14px 0 0;font-family:${F.ui};font-size:15px;line-height:1.6;color:${C.ink2};">Just reply to this email and we'll help you get set up.</p>
		</td></tr>

		<!-- footer -->
		<tr><td style="padding:16px 28px;border-top:1px solid ${C.line};border-bottom:1px solid ${C.line};">
			<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
				<td style="font-family:${F.mono};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${C.ink3};"><a href="${SITE}" style="color:${C.ink3};text-decoration:none;">coolreaperscripts.com</a></td>
				${orderId ? `<td align="right" style="font-family:${F.mono};font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${C.ink3};">Order ${esc(orderId)}</td>` : ''}
			</tr></table>
		</td></tr>
	</table>
</td></tr>
</table>
</body>
</html>`;

	const text = [
		`${hi}`,
		'',
		updatesLine(productName, updatesUntil, renewed),
		'',
		'ACTIVATE WITH THIS EMAIL',
		email,
		'Your license is linked to the address this email was sent to. When REAPER asks you to sign in, use this same email and your copy unlocks on its own.',
		'',
		'LICENSE KEY',
		licenseKey,
		"You won't need to type it: signing in finds it for you. Keep it as your proof of purchase.",
		'',
		'SET IT UP',
		...steps.flatMap((s, i) => [
			'',
			`${i + 1}. ${s.title}`,
			...s.body.map(inlineText),
			...(s.link ? [s.link.url] : [])
		]),
		'',
		`Already installed it for the free trial? Open its license settings and click Sign in with browser. Your license works on up to 3 computers.`,
		`Needs REAPER with ${info.needs}, all free through ReaPack (https://reapack.com).`,
		'',
		'Need a hand? Just reply to this email.',
		'',
		SITE + (orderId ? `\nOrder ${orderId}` : '')
	].join('\n');

	return { subject, html, text };
}

// Sends one email through Resend (RESEND_API_KEY, RESEND_FROM_EMAIL). Returns { ok, id } or { ok: false, error }.
async function sendEmail({ to, subject, html, text }) {
	let Resend;
	try { ({ Resend } = require('resend')); } catch (_) { /* not installed */ }
	if (!Resend || !process.env.RESEND_API_KEY) return { ok: false, error: 'Resend is not configured (RESEND_API_KEY)' };
	const from = (process.env.RESEND_FROM_EMAIL || '').trim().replace(/^["']|["']$/g, '');
	if (!from) return { ok: false, error: 'RESEND_FROM_EMAIL is not set' };
	try {
		const r = await new Resend(process.env.RESEND_API_KEY).emails.send({ from, to, subject, html, text });
		if (r.error) return { ok: false, error: r.error.message || JSON.stringify(r.error) };
		return { ok: true, id: r.data && r.data.id };
	} catch (err) {
		return { ok: false, error: err.message || 'Could not send the email' };
	}
}

module.exports = { buildPurchaseEmail, sendEmail };
