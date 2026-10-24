// Scripts the installer and the in-app updaters can download through /api/scripts.
// Files come from each product's GitHub repo, fetched server-side (GITHUB_TOKEN when the repo is
// private), so the repo can be private while license and trial holders still download.

module.exports = {
	'vertical-fx-list': {
		name: 'Vertical FX List',
		// what PayPal must have charged (USD) before /api/paypal/webhook issues a key
		price: '89.00',
		description: 'FX chains, sends and containers next to every track.',
		owner: 'BryanChi',
		repo: 'Vertical-FX-List',
		branch: 'main',
		// where the files go, relative to the REAPER resource folder
		installDir: 'Scripts/CoolReaperScripts/Vertical FX List',
		// the action users run; installed under a release name
		mainScript: { from: '[DEV] CRS_Vertical FX list.lua', to: 'CRS_vertical fx list.lua' },
		// repo paths that are never sent (prefix match)
		exclude: ['README', 'LICENSE', 'Vertical FX List Resources/plugin_select_counts.txt'],
		// installed only when missing, never overwritten by an update
		userData: ['style_presets_USER.lua', 'fx_favorites.txt'],
		// extstate section the script reads its license key and email from
		licenseSection: 'FXD_Vertical_FX_List_License',
		// where the Script Manager's Buy button goes
		buyUrl: 'https://www.coolreaperscripts.com/pricing#vertical-fx-list'
	},
	'fx-devices': {
		name: 'FX Devices',
		price: '93.00',
		description: 'Plugin devices, modulation and layouts for every FX on a track.',
		owner: 'BryanChi',
		repo: 'BryanChi-FX-Devices',
		branch: 'main',
		// same places ReaPack uses, so a ReaPack install is updated in place and the script finds
		// its JSFX at "Effects/FX Devices/BryanChi_FX_Devices/FXD JSFXs"
		installDir: 'Scripts/FX Devices',
		// only these repo paths are sent (prefix match); the rest of the repo is other projects
		include: ['BryanChi_FX_Devices/'],
		// repo paths installed somewhere other than installDir (relative to the REAPER resource folder)
		routes: [{ from: 'BryanChi_FX_Devices/FXD JSFXs/', to: 'Effects/FX Devices/BryanChi_FX_Devices/FXD JSFXs/' }],
		mainScript: { from: 'BryanChi_FX_Devices/BryanChi_FX Devices.lua', to: 'BryanChi_FX_Devices/BryanChi_FX Devices.lua' },
		exclude: ['BryanChi_FX_Devices/src/FX_Adder_Cache/fx_category_cache.lua', 'BryanChi_FX_Devices/src/FX_Adder_Cache/plugin_select_counts.txt'],
		userData: [
			'BryanChi_FX_Devices/src/FX Default Values',
			'BryanChi_FX_Devices/src/Keyboard Shortcuts.ini',
			'BryanChi_FX_Devices/src/ThemeColors.ini',
			'BryanChi_FX_Devices/src/FX_Adder_Cache/fx_favorites.txt',
			// people make and reorder their own shapes here: a shape already on disk is never replaced
			'BryanChi_FX_Devices/src/LFO Shapes',
			'BryanChi_FX_Devices/src/Envelope Shapes'
		],
		// shipped files people edit in the layout editor: when an update changes one they changed too,
		// the Script Manager asks whether to keep theirs or take the new one
		askIfChanged: [
			'BryanChi_FX_Devices/src/FX Layouts/',
			'BryanChi_FX_Devices/src/Layout Editor Item Styles/',
			'BryanChi_FX_Devices/src/FX Layout Plugin Scripts/'
		],
		licenseSection: 'CRS_FX_Devices_License',
		// main is an old build without the license check: only published releases are served
		releasesOnly: true,
		buyUrl: 'https://www.coolreaperscripts.com/pricing#fx-devices',
		// installers before the Script Manager (3) can't put the JSFX in the Effects folder
		minClient: 3,
		// JSFX that are their own items (FXD_JSFX below): Script Managers from 3.11 (5)
		// leave them out of an FX Devices install and only update the ones already on disk. The JSFX
		// FX Devices itself runs on (Macros, Container Macros, the splitters, Analyzer, Gain Reduction
		// Scope, ReSpectrum, RackMixer, Clash Finder, the .jsfx-inc files) always come with it.
		optional: [],
		// the FXD Macros CLAP comes with FX Devices where there's a build of it (Script Managers from
		// 3.13 put it in the CLAP folder); FX Devices' own include and routes everywhere else
		platforms: {
			mac: {
				include: ['BryanChi_FX_Devices/', 'CLAP/macOS/FXD Macros.clap/'],
				routes: [
					{ from: 'BryanChi_FX_Devices/FXD JSFXs/', to: 'Effects/FX Devices/BryanChi_FX_Devices/FXD JSFXs/' },
					{ from: 'CLAP/macOS/', to: '{CLAP}/' }
				]
			},
			default: {}
		}
	},
	'prism-eq': {
		name: 'Prism EQ',
		// a CLAP plugin (the JSFX is discontinued): the Script Manager lists plugins in their own
		// section, as cards with a preview, like the JSFX
		kind: 'clap',
		preview: '/assets/Previews/prism-eq.png',
		// no license: anyone can install it, nothing is stamped
		free: true,
		description: 'A free 16-band EQ: any band can go dynamic, spectral, saturated or mid/side. A CLAP plugin with its own window.',
		owner: 'BryanChi',
		repo: 'BryanChi-FX-Devices',
		branch: 'main',
		releasesOnly: true,
		// the Script Manager keeps its notes (version.txt, manifest) in installDir; the plugin goes in
		// the user's CLAP folder, and its VST3 (Script Managers from 3.14) in the VST3 folder
		installDir: 'Scripts/CoolReaperScripts/Prism EQ',
		platforms: clapPlatforms('FXD Prism EQ', { vst3: true }),
		// the discontinued JSFX: deleted once the plugin is in (FX Devices' copy and the website download)
		replaces: ['Effects/FX Devices/BryanChi_FX_Devices/FXD JSFXs/FXD Prism EQ.jsfx', 'Effects/FXD Prism EQ.jsfx'],
		pageUrl: 'https://www.coolreaperscripts.com/prism-eq',
		// Script Managers before 3.13 (6) can't install plugins
		minClient: 6
	},
	'fxd-waveshaper': {
		name: 'Waveshaper',
		kind: 'clap',
		description: 'A 16-point waveshaper with an analog stage, from warm saturation to wavefolding, with eight built-in modulators.',
		owner: 'BryanChi',
		repo: 'BryanChi-FX-Devices',
		branch: 'main',
		releasesOnly: true,
		// FX Devices' license or trial, for the download and inside the plugin (it reads FX Devices' saved license)
		licenseOf: 'fx-devices',
		installDir: 'Scripts/CoolReaperScripts/FXD Plugins/Waveshaper',
		platforms: clapPlatforms('FXD Waveshaper'),
		minClient: 6
	}
};

// The CLAP plugins' builds, per platform, from FX Devices' repo (CLAP/<platform>/, built by
// "Native Plugins/stage.sh"), installed in the user's CLAP folder ('{CLAP}/'; the Script Manager
// knows where that is). The Script Manager says which platform it runs on: a platform without a
// build doesn't get the plugin, and a plugin only shows once the newest release has its build
// (inRelease), so nothing is offered before it's released.
//   mac: a .clap bundle (a folder, universal arm64 + x86_64)   win64: one .clap file (x64)
// With vst3, the same plugin's VST3 (VST3/<platform>/, also from stage.sh) comes along, into the
// user's VST3 folder ('{VST3}/'), for Script Managers that know that folder (VST3_CLIENT): one card,
// both formats. Its files come from the release like the rest, so a release without the VST3 build
// just installs the CLAP.
//   mac: a .vst3 bundle (universal)   win64: a .vst3 bundle folder (Contents/x86_64-win/<name>.vst3)
const VST3_CLIENT = 7;
function clapPlatforms(name, opts) {
	const mac = 'CLAP/macOS/' + name + '.clap/';
	const win = 'CLAP/Windows/' + name + '.clap';
	const vst3 = !!(opts && opts.vst3);
	return {
		mac: {
			include: [mac],
			routes: [{ from: 'CLAP/macOS/', to: '{CLAP}/' }],
			inRelease: mac + 'Contents/MacOS/' + name,
			installedFile: '{CLAP}/' + name + '.clap/Contents/MacOS/' + name,
			vst3: vst3 ? {
				include: ['VST3/macOS/' + name + '.vst3/'],
				routes: [{ from: 'VST3/macOS/', to: '{VST3}/' }],
				installedFile: '{VST3}/' + name + '.vst3/Contents/MacOS/' + name
			} : undefined
		},
		win64: {
			include: [win],
			routes: [{ from: 'CLAP/Windows/', to: '{CLAP}/' }],
			inRelease: win,
			installedFile: '{CLAP}/' + name + '.clap',
			vst3: vst3 ? {
				include: ['VST3/Windows/' + name + '.vst3/'],
				routes: [{ from: 'VST3/Windows/', to: '{VST3}/' }],
				installedFile: '{VST3}/' + name + '.vst3/Contents/x86_64-win/' + name + '.vst3'
			} : undefined
		}
	};
}

// A product as one platform gets it: its platform's include, routes and files over the rest. null
// when it has no build for that platform (or the client didn't say which it is). The client's
// generation decides whether a plugin's VST3 comes along (older Script Managers don't know '{VST3}').
function forPlatform(product, platform, client) {
	if (!product.platforms) return product;
	// platforms.default: what every other platform (and a Manager that doesn't say) gets
	const build = (platform && product.platforms[platform]) || product.platforms.default;
	if (!build) return null;
	const out = Object.assign({}, product, build);
	delete out.vst3;
	if (build.vst3 && (Number(client) || 0) >= VST3_CLIENT) {
		out.include = (build.include || []).concat(build.vst3.include);
		out.routes = (build.routes || []).concat(build.vst3.routes);
		out.vst3InstalledFile = build.vst3.installedFile;
	}
	return out;
}
Object.defineProperty(module.exports, 'forPlatform', { value: forPlatform, enumerable: false });
Object.defineProperty(module.exports, 'clapPlatforms', { value: clapPlatforms, enumerable: false });

// FX Devices' own effects, each installable on its own from the Script Manager's JSFX section. They
// come from FX Devices' releases and need an FX Devices license or trial (licenseOf); one only shows
// once the newest release has its file (inRelease), so a JSFX still in development stays hidden.
const FXD_JSFX_DIR = 'BryanChi_FX_Devices/FXD JSFXs/';
const NOTE_TOOLS = FXD_JSFX_DIR + 'FXD Note Tools.jsfx-inc';
const FXD_JSFX = [
	['Analog Drive', 'Six saturation circuits (tube, transformer, console and more), oversampled, with the bloom and sag of real gear.'],
	['Analog Filter', 'Five analog filter models (ladder, MS-20, SEM, diode, 303) that stay in tune at full resonance.'],
	['Audio To Notes', 'Turns the audio on a track into MIDI notes and CC in real time: drums to triggers, a voice to a synth line.', [NOTE_TOOLS]],
	['Bucket Brigade', 'Chorus, flanger, vibrato and tremolo, run through a model of the bucket-brigade chips in the classic boxes.'],
	['Compressor', 'One compressor, 24 models: from transparent digital to the feel of the classic analog units.'],
	['Kaleido Chorus', 'One chorus engine, eight flavors, from a classic two-voice chorus to an octave shimmer.'],
	['Note Echo', 'Repeats incoming notes in time, with pitch steps, strum and decay.', [NOTE_TOOLS]],
	['Note Generator', 'Makes notes on its own with four engines, from balls bouncing in a polygon to Euclidean rhythms.', [NOTE_TOOLS]],
	['Note Shaper', 'Rewrites incoming notes: filter them, snap them to a scale, add chord voices and more.', [NOTE_TOOLS]],
	['Patina', 'Analog character in nine modules, from a little warmth to gear falling apart.'],
	['Step Engine', 'An arpeggiator and a step sequencer in one, with five independent step lanes.', [NOTE_TOOLS]],
	['Surface Noise', 'Layered vinyl, tape and electrical noise: hiss, crackle, hum and static, each with its own level.'],
	['Tape Glitch', 'Stutters, reverses and tape stops on the beat grid, played from a tape loop.'],
	['Tape Machine', 'A whole tape machine: noise reduction, record EQ, tape saturation, wow and flutter.'],
	['Vintage Sampler', 'The converters of a 1980s sampler: the aliasing, the bit depth and the steps they leave.'],
	['Vintage Space', 'Six vintage spaces, each modelled as the thing itself: room, hall, chamber, plate, spring and tape echo.'],
	['Wow Flutter', 'The pitch wobble of old tape and vinyl transports, up to a tape stop.']
];

// Held back from the releases (bryan, 2026-10-24: new native FX Devices devices only ship once he
// says so): not offered, and an FX Devices install leaves their files out too. Take a name out of
// here to offer it again; one that isn't in FXD_JSFX then also needs its own entry there (or, for a
// file FX Devices itself runs on, taking it out of HELD_CORE is enough).
const HELD = new Set(['Patina', 'Analog Drive', 'Tape Machine', 'Wow Flutter', 'Vintage Sampler', 'Vintage Space',
	'Surface Noise', 'Analog Filter', 'Bucket Brigade', 'Tape Glitch', 'Compressor']);
const HELD_CORE = ['Poise', 'Noise Splitter'];
for (const name of HELD_CORE) module.exports['fx-devices'].optional.push(FXD_JSFX_DIR + 'FXD ' + name + '.jsfx');

for (const [name, description, deps] of FXD_JSFX) {
	const file = FXD_JSFX_DIR + 'FXD ' + name + '.jsfx';
	module.exports['fx-devices'].optional.push(file);
	if (HELD.has(name)) continue;
	const id = 'fxd-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
	module.exports[id] = {
		name,
		kind: 'jsfx',
		// its FX Devices device, rendered from the layout script
		preview: '/assets/Previews/' + id + '.png',
		description,
		owner: 'BryanChi',
		repo: 'BryanChi-FX-Devices',
		branch: 'main',
		releasesOnly: true,
		licenseOf: 'fx-devices',
		include: [file].concat(deps || []),
		inRelease: file,
		installDir: 'Scripts/CoolReaperScripts/FXD JSFX/' + name,
		routes: [{ from: FXD_JSFX_DIR, to: 'Effects/FX Devices/BryanChi_FX_Devices/FXD JSFXs/' }],
		includedIn: 'fx-devices',
		installedFile: 'Effects/FX Devices/BryanChi_FX_Devices/FXD JSFXs/FXD ' + name + '.jsfx',
		// Script Managers before 3.11 (5) install every FX Devices JSFX with FX Devices
		minClient: 5
	};
}
// not offered on their own yet, and still left out of an FX Devices install
// Prism EQ's discontinued JSFX: never installed again
for (const name of ['Prism EQ', 'Algorithmic Reverb', 'ControlFreakDelay']) module.exports['fx-devices'].optional.push(FXD_JSFX_DIR + 'FXD ' + name + '.jsfx');
