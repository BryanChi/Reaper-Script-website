// Script downloads for the installer and the in-app updaters.
//
// POST /api/scripts  { action, licenseKey, product, ref, path }
//   action=products  -> list of products (no key needed)
//   platform         -> mac | win64 | ...: the CLAP plugins come per platform (products.platforms),
//                       with their VST3 for clients from 7 (the Script Manager 3.14);
//                       without a build for it a plugin isn't offered, its files aren't served
//   action=releases  -> releases of a product (tag, name, date, notes)
//   action=files     -> files of a product at a ref (tag or branch), plus its version.txt
//   action=download  -> one file's bytes
//   action=layouts / layout -> FX Devices' plugin layouts published between releases (layoutsAction)
//   action=layout-generate / layout-share / layout-job / community-layouts / community-layout
//                    -> FX Devices' community layouts, made with Claude (_lib/community-layouts.js)
// Every download needs a license or trial key that verifies (a free trial is enough; free products
// like Prism EQ need none; FX Devices' own JSFX take FX Devices' key), so the repos can be private and each copy can be traced: the main
// script of every download carries a code naming the key it was downloaded with
// (downloadStamp; the admin page traces it back).
// Only published releases and the product's main branch are served, never other branches.
// A license includes the releases published until its updates end (2 years per purchase): newer
// ones answer 403 with updatesEnded, and once updates end the main branch isn't served either.
// action=releases with a licenseKey also says which releases the license includes.
//
// Files are read from GitHub on the server. Set GITHUB_TOKEN (a fine-grained token with read-only
// "Contents" access to the script repos) so this keeps working when the repos are private.

const { verifyLicense, downloadStamp } = require('./_lib/store');
const PRODUCTS = require('./_lib/products');
const Community = require('./_lib/community-layouts');

const GH = 'https://api.github.com';
const SAFE_REF = /^[A-Za-z0-9._\-\/]{1,100}$/;

function ghHeaders(accept) {
	const h = {
		Accept: accept || 'application/vnd.github+json',
		'User-Agent': 'coolreaperscripts-site',
		'X-GitHub-Api-Version': '2022-11-28'
	};
	if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
	return h;
}

function encodePath(p) {
	return p.split('/').map(encodeURIComponent).join('/');
}

function isExcluded(product, path) {
	if (product.include && !product.include.some(prefix => path.startsWith(prefix))) return true;
	return (product.exclude || []).some(prefix => path === prefix || path.startsWith(prefix));
}

function validPath(product, path) {
	if (typeof path !== 'string' || !path || path.length > 300) return false;
	// no absolute paths, no "..", no hidden files or folders (.git, .DS_Store, .github)
	if (path.startsWith('/') || path.includes('\\') || path.split('/').some(s => s === '' || s.startsWith('.'))) return false;
	return !isExcluded(product, path);
}

async function listFiles(product, ref) {
	const url = `${GH}/repos/${product.owner}/${product.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
	const resp = await fetch(url, { headers: ghHeaders() });
	if (!resp.ok) return { ok: false, status: resp.status };
	const data = await resp.json();
	const files = (data.tree || [])
		.filter(e => e.type === 'blob' && validPath(product, e.path))
		.map(e => ({ path: e.path, size: e.size, sha: e.sha }));
	return { ok: true, files, truncated: !!data.truncated };
}

// Is a product's file in the newest release? FX Devices' JSFX items show only once it is, so one still
// in development stays hidden. Unknown (GitHub didn't answer) counts as yes.
const treeCache = new Map();

async function inNewestRelease(product) {
	if (!product.inRelease) return true;
	const releases = await fetchReleases(product);
	const newest = releases && releases.find(r => !r.prerelease);
	if (!newest) return true;
	const key = product.repo + '@' + newest.tag_name;
	let paths = treeCache.get(key);
	if (!paths) {
		const listed = await listFiles({ owner: product.owner, repo: product.repo }, newest.tag_name);
		if (!listed.ok) return true;
		paths = new Set(listed.files.map(f => f.path));
		treeCache.set(key, paths);
	}
	return paths.has(product.inRelease);
}

async function fetchRaw(product, path, ref) {
	const url = `${GH}/repos/${product.owner}/${product.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`;
	return fetch(url, { headers: ghHeaders('application/vnd.github.raw') });
}

// Published release tags per product, cached for a few minutes on a warm instance
const releaseCache = new Map();
const RELEASE_TTL = 5 * 60 * 1000;

async function fetchReleases(product) {
	const hit = releaseCache.get(product.repo);
	if (hit && Date.now() - hit.at < RELEASE_TTL) return hit.list;
	const resp = await fetch(`${GH}/repos/${product.owner}/${product.repo}/releases?per_page=30`, { headers: ghHeaders() });
	if (!resp.ok) return null;
	// newest first by publish date: GitHub orders by the tagged commit's date, so a release of an
	// older commit (a merge made earlier) would otherwise sort below the previous release
	const list = (await resp.json()).filter(r => !r.draft)
		.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
	releaseCache.set(product.repo, { at: Date.now(), list });
	return list;
}

// The stamp goes in twice, as plain Lua comments: after the first line (headers like
// "-- @noindex" stay first) and at the very end. Sizes in the files list are GitHub's, so
// clients don't compare them byte for byte.
function stampScript(buf, code) {
	const text = buf.toString('utf8');
	const nl = text.indexOf('\n');
	const line = `-- build ${code}\n`;
	const head = nl < 0 ? text + '\n' + line : text.slice(0, nl + 1) + line + text.slice(nl + 1);
	return Buffer.from(head + (head.endsWith('\n') ? '' : '\n') + `--[[ ${code} ]]\n`, 'utf8');
}

function publicProduct(id, p) {
	return {
		id,
		name: p.name,
		description: p.description,
		installDir: p.installDir,
		mainScript: p.mainScript,
		userData: p.userData,
		askIfChanged: p.askIfChanged,
		routes: p.routes,
		licenseSection: p.licenseSection,
		releasesOnly: !!p.releasesOnly,
		buyUrl: p.buyUrl,
		free: !!p.free,
		kind: p.kind,
		preview: p.preview,
		includedIn: p.includedIn,
		installedFile: p.installedFile,
		vst3InstalledFile: p.vst3InstalledFile,
		pageUrl: p.pageUrl,
		licenseOf: p.licenseOf,
		optional: p.optional,
		replaces: p.replaces
	};
}

// FX Devices' plugin layouts, published between releases: FX Devices' repo keeps them on its
// "layouts" branch, each version as its own file (Layouts/<Name>/<version>.lua) and all of them in
// catalog.json there. FX Devices checks the catalog once a day and offers the layouts of the plugins
// people have.
//   action=layouts -> the catalog (no key needed)
//   action=layout  -> one file of a published version (path from the catalog), with an FX Devices
//                     license or trial key; a .lua is stamped like the main script
const LAYOUTS = { owner: 'BryanChi', repo: 'BryanChi-FX-Devices', ref: 'layouts', license: 'fx-devices' };
let catalogCache = null;

async function fetchCatalog() {
	if (catalogCache && Date.now() - catalogCache.at < RELEASE_TTL) return catalogCache.catalog;
	const resp = await fetchRaw(LAYOUTS, 'catalog.json', LAYOUTS.ref);
	if (!resp.ok) return resp.status === 404 ? {} : null;
	const catalog = await resp.json();
	catalogCache = { at: Date.now(), catalog };
	return catalog;
}

// the published version a catalog path belongs to, so only those files are served
function catalogVersion(catalog, path) {
	for (const layout of Object.values(catalog.layouts || {})) {
		for (const v of layout.versions || []) {
			if ((v.files || []).some(f => f.path === path)) return v;
		}
	}
	return null;
}

async function layoutsAction(action, input, res) {
	try {
		const catalog = await fetchCatalog();
		if (!catalog) return res.status(502).json({ ok: false, error: 'Could not reach GitHub' });
		if (action === 'layouts') {
			res.setHeader('Cache-Control', 'public, max-age=300');
			return res.status(200).json({ ok: true, layouts: catalog.layouts || {} });
		}

		const path = input.path;
		const version = typeof path === 'string' && !path.includes('..') && catalogVersion(catalog, path);
		if (!version) return res.status(404).json({ ok: false, error: 'Unknown layout' });
		const key = typeof input.licenseKey === 'string' ? input.licenseKey.trim() : '';
		if (!key) return res.status(401).json({ ok: false, error: 'License key required. Start a free trial or enter your license key.' });
		const lic = await verifyLicense(key, null, LAYOUTS.license);
		if (!lic || !lic.ok) {
			return res.status(403).json({ ok: false, status: lic && lic.status, error: (lic && lic.reason) || 'License not valid' });
		}
		// like releases: a license includes the versions published while its updates last
		const until = lic.status === 'active' ? lic.updatesUntil || null : null;
		if (until && new Date(version.date).getTime() > until) {
			const owner = PRODUCTS[LAYOUTS.license];
			return res.status(403).json({ ok: false, updatesEnded: true, updatesUntil: until, buyUrl: owner.buyUrl,
				error: `Your ${owner.name} updates ended before this layout version came out. Buy ${owner.name} again to renew them for 2 years, or pick an older version.` });
		}
		const resp = await fetchRaw(LAYOUTS, path, LAYOUTS.ref);
		if (!resp.ok) return res.status(resp.status === 404 ? 404 : 502).json({ ok: false, error: `GitHub ${resp.status}` });
		let buf = Buffer.from(await resp.arrayBuffer());
		if (path.endsWith('.lua')) buf = stampScript(buf, downloadStamp(key));
		res.setHeader('Content-Type', 'application/octet-stream');
		res.setHeader('Cache-Control', 'no-store');
		return res.status(200).send(buf);
	} catch (err) {
		console.error('layouts api error', err);
		return res.status(502).json({ ok: false, error: 'Could not reach GitHub' });
	}
}

module.exports = async function handler(req, res) {
	if (req.method !== 'POST' && req.method !== 'GET') {
		res.setHeader('Allow', ['GET', 'POST']);
		return res.status(405).json({ ok: false, error: 'Method not allowed' });
	}
	const input = Object.assign({}, req.query || {}, req.body || {});
	const action = input.action || 'products';

	// installer generation: none = the 2.0 installer, 3 = the Script Manager (handles routes)
	const client = Number(input.client) || 2;
	const offered = p => p && p.installable !== false && client >= (p.minClient || 0);
	// the CLAP plugins: this platform's build (null when there is none)
	const platform = typeof input.platform === 'string' ? input.platform : '';

	if (action === 'products') {
		const list = Object.entries(PRODUCTS).map(([id, p]) => [id, PRODUCTS.forPlatform(p, platform, client)]).filter(([, p]) => offered(p));
		let shown;
		try {
			shown = await Promise.all(list.map(([, p]) => inNewestRelease(p)));
		} catch (err) {
			shown = list.map(() => true);
		}
		return res.status(200).json({
			ok: true,
			products: list.filter((_, i) => shown[i]).map(([id, p]) => publicProduct(id, p))
		});
	}

	if (action === 'layouts' || action === 'layout') return layoutsAction(action, input, res);
	if (Community.ACTIONS.has(action)) return Community.communityAction(action, input, res);

	const product = PRODUCTS[input.product] && PRODUCTS.forPlatform(PRODUCTS[input.product], platform, client);
	if (!product || product.installable === false) return res.status(404).json({ ok: false, error: 'Unknown product' });

	const ref = input.ref || product.branch;
	if (!SAFE_REF.test(ref) || ref.includes('..')) return res.status(400).json({ ok: false, error: 'Bad ref' });

	try {
		const releases = await fetchReleases(product);
		if (!releases) return res.status(502).json({ ok: false, error: 'Could not reach GitHub' });

		const isRelease = releases.some(r => r.tag_name === ref);
		// only published releases and the product's main branch, never other branches
		if (!isRelease && ref !== product.branch) return res.status(404).json({ ok: false, error: 'Unknown version' });
		if (!isRelease && product.releasesOnly && action !== 'releases') {
			return res.status(404).json({ ok: false, error: 'Install the newest release; the development version isn\'t available for ' + product.name + '.' });
		}
		// files and downloads are for license and trial holders (device activation isn't needed to download);
		// free products (Prism EQ) need no key
		const key = typeof input.licenseKey === 'string' ? input.licenseKey.trim() : '';
		// when this license's updates end (ms), null for trials
		let until = null;
		if (action !== 'releases' && !product.free) {
			if (!key) return res.status(401).json({ ok: false, error: 'License key required. Start a free trial or enter your license key.' });
			const lic = await verifyLicense(key, null, product.licenseOf || input.product);
			if (!lic || !lic.ok) {
				return res.status(403).json({ ok: false, status: lic && lic.status, error: (lic && lic.reason) || 'License not valid' });
			}
			if (lic.status === 'active') until = lic.updatesUntil || null;
			const rel = releases.find(r => r.tag_name === ref);
			const ended = until && (rel ? new Date(rel.published_at).getTime() > until : Date.now() > until);
			if (ended) {
				const newest = releases.find(r => !r.prerelease && new Date(r.published_at).getTime() <= until);
				// FX Devices' JSFX: the license and its renewal are FX Devices'
				const owner = PRODUCTS[product.licenseOf] || product;
				const date = new Date(until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
				return res.status(403).json({
					ok: false, updatesEnded: true, updatesUntil: until, newestIncluded: newest ? newest.tag_name : null, buyUrl: owner.buyUrl,
					error: `Your ${owner.name} updates ended on ${date}, before this version came out. Buy ${owner.name} again to renew them for 2 years` +
						(newest ? `, or install ${newest.tag_name}.` : '.')
				});
			}
		}

		if (action === 'releases') {
			// a key is optional here: with one, each release says whether the license includes it
			if (key && !product.free) {
				const lic = await verifyLicense(key, null, product.licenseOf || input.product);
				if (lic && lic.ok && lic.status === 'active') until = lic.updatesUntil || null;
			}
			return res.status(200).json({
				ok: true,
				branch: product.branch,
				updatesUntil: until,
				releases: releases.map(r => ({
					tag: r.tag_name,
					name: r.name || r.tag_name,
					publishedAt: r.published_at,
					prerelease: !!r.prerelease,
					included: !until || new Date(r.published_at).getTime() <= until,
					notes: (r.body || '').slice(0, 4000)
				}))
			});
		}

		if (action === 'files') {
			const listed = await listFiles(product, ref);
			if (!listed.ok) return res.status(listed.status === 404 ? 404 : 502).json({ ok: false, error: `GitHub ${listed.status}` });
			let version = null;
			const v = await fetchRaw(product, 'version.txt', ref);
			if (v.ok) version = (await v.text()).trim().slice(0, 40);
			return res.status(200).json({ ok: true, ref, version, files: listed.files, truncated: listed.truncated });
		}

		if (action === 'download') {
			if (!validPath(product, input.path)) return res.status(400).json({ ok: false, error: 'Bad path' });
			const resp = await fetchRaw(product, input.path, ref);
			if (!resp.ok) return res.status(resp.status === 404 ? 404 : 502).json({ ok: false, error: `GitHub ${resp.status}` });
			let buf = Buffer.from(await resp.arrayBuffer());
			if (product.mainScript && input.path === product.mainScript.from) buf = stampScript(buf, downloadStamp(key));
			res.setHeader('Content-Type', 'application/octet-stream');
			res.setHeader('Cache-Control', 'no-store');
			return res.status(200).send(buf);
		}
	} catch (err) {
		console.error('scripts api error', err);
		return res.status(502).json({ ok: false, error: 'Could not reach GitHub' });
	}

	return res.status(400).json({ ok: false, error: 'Unknown action' });
};

// community layout generation and review keep running after the answer (waitUntil) for a minute or two
module.exports.config = { maxDuration: 300 };
