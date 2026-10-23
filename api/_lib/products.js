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
		buyUrl: 'https://www.coolreaperscripts.com/#pricing'
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
		// no FX Devices checkout on the site yet, so this is the shared pricing section
		buyUrl: 'https://www.coolreaperscripts.com/#pricing',
		// installers before the Script Manager (3) can't put the JSFX in the Effects folder
		minClient: 3,
		// JSFX that are their own items (FXD_JSFX below, and Prism EQ): Script Managers from 3.11 (5)
		// leave them out of an FX Devices install and only update the ones already on disk. The JSFX
		// FX Devices itself runs on (Macros, Container Macros, the splitters, Analyzer, Gain Reduction
		// Scope, ReSpectrum, RackMixer, Clash Finder, the .jsfx-inc files) always come with it.
		optional: []
	},
	'prism-eq': {
		name: 'Prism EQ',
		// the Script Manager lists JSFX in their own section, as smaller cards with a GUI preview
		kind: 'jsfx',
		preview: '/assets/Previews/prism-eq.png',
		// no license: anyone can install it, nothing is stamped
		free: true,
		description: 'A free 16-band EQ: any band can go dynamic, spectral, saturated or mid/side. One JSFX.',
		// FX Devices ships it, so it comes from FX Devices' releases
		owner: 'BryanChi',
		repo: 'BryanChi-FX-Devices',
		branch: 'main',
		releasesOnly: true,
		include: ['BryanChi_FX_Devices/FXD JSFXs/FXD Prism EQ.jsfx'],
		// the same file FX Devices installs, so people with both get one Prism EQ in the FX browser,
		// not two; the Script Manager keeps its notes (version.txt, manifest) in installDir
		installDir: 'Scripts/CoolReaperScripts/Prism EQ',
		routes: [{ from: 'BryanChi_FX_Devices/FXD JSFXs/', to: 'Effects/FX Devices/BryanChi_FX_Devices/FXD JSFXs/' }],
		// with FX Devices installed, the Script Manager shows it as part of FX Devices instead
		includedIn: 'fx-devices',
		// there is no script to look for: this file being there means it's installed
		installedFile: 'Effects/FX Devices/BryanChi_FX_Devices/FXD JSFXs/FXD Prism EQ.jsfx',
		pageUrl: 'https://www.coolreaperscripts.com/prism-eq',
		// Script Managers before 3.10 (4) ask for a license for everything
		minClient: 4
	}
};

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

for (const [name, description, deps] of FXD_JSFX) {
	const file = FXD_JSFX_DIR + 'FXD ' + name + '.jsfx';
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
	module.exports['fx-devices'].optional.push(file);
}
module.exports['fx-devices'].optional.push(module.exports['prism-eq'].include[0]);
// not offered on their own yet, and still left out of an FX Devices install
for (const name of ['Algorithmic Reverb', 'ControlFreakDelay']) module.exports['fx-devices'].optional.push(FXD_JSFX_DIR + 'FXD ' + name + '.jsfx');
