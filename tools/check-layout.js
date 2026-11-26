// Check a community layout the way the Auto Layout creator does (card bounds + param bindings) and draw it.
//   node tools/check-layout.js <layout.lua> <params.json> [out.png] [plan.json]
// params.json: [{ i, name, value, norm }] (FX Devices' dump of the plugin); plan.json: the writer's "controls" list.
const fs = require('fs');
const { checkBounds } = require('../api/_lib/layout-bounds');
const { checkBindings } = require('../api/_lib/layout-bindings');
const { renderLayout } = require('../api/_lib/layout-render');
const [src, pj, out, plan] = process.argv.slice(2);
if (!src || !pj) { console.log('node tools/check-layout.js <layout.lua> <params.json> [out.png] [plan.json]'); process.exit(1); }
const lua = fs.readFileSync(src, 'utf8');
const params = JSON.parse(fs.readFileSync(pj, 'utf8'));
const fit = checkBounds(lua, params);
if (fit.skipped) { console.log('not run:', fit.skipped); process.exit(1); }
console.log(fit.ok ? 'fits the card' : 'does not fit:\n- ' + fit.issues.join('\n- '));
const b = checkBindings(fit, params, plan ? JSON.parse(fs.readFileSync(plan, 'utf8')) : []);
console.log(`\nbinding errors (${b.errors.length}):\n- ` + b.errors.join('\n- '));
console.log(`\nworth a look (${b.notes.length}):\n- ` + b.notes.join('\n- '));
console.log('\nbound:\n' + b.table);
if (out) {
	const r = renderLayout(lua, params, { scale: 2 });
	if (r.skipped) { console.error('not drawn:', r.skipped); process.exit(1); }
	fs.writeFileSync(out, r.png);
	console.log(`\n${out}: ${r.W + 8} x ${r.H} px card`);
}
