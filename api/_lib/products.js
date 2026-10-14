// Scripts the installer and the in-app updaters can download through /api/scripts.
// Files come from each product's GitHub repo, fetched server-side (GITHUB_TOKEN when the repo is
// private), so the repo can be private while license and trial holders still download.

module.exports = {
	'vertical-fx-list': {
		name: 'Vertical FX List',
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
		licenseSection: 'FXD_Vertical_FX_List_License'
	},
	'fx-devices': {
		name: 'FX Devices',
		description: 'Plugin devices, modulation and layouts for every FX on a track.',
		owner: 'BryanChi',
		repo: 'BryanChi-FX-Devices',
		branch: 'main',
		// a separate purchase from Vertical FX List; licensed here, but not offered by the installer
		// yet (its JSFX go to the Effects folder, which the installer doesn't handle)
		installable: false,
		licenseSection: 'CRS_FX_Devices_License'
	}
};
