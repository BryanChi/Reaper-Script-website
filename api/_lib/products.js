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
			'BryanChi_FX_Devices/src/FX_Adder_Cache/fx_favorites.txt'
		],
		licenseSection: 'CRS_FX_Devices_License',
		// no FX Devices checkout on the site yet, so this is the shared pricing section
		buyUrl: 'https://www.coolreaperscripts.com/#pricing',
		// installers before the Script Manager (3) can't put the JSFX in the Effects folder
		minClient: 3
	}
};
