// Draw a community layout to a PNG the way FX Devices draws it (api/_lib/layout-render.js).
//   node tools/render-layout.js <layout.lua> <out.png> [scale=2]
// Params are stand-ins (P0, P1, ... at mixed values), so a layout that finds params by name falls back to its idx.
const fs = require('fs');
const { renderLayout } = require('../api/_lib/layout-render');
const [src, out, scale] = process.argv.slice(2);
if (!src || !out) { console.log('node tools/render-layout.js <layout.lua> <out.png> [scale]'); process.exit(1); }
const params = [];
for (let i = 0; i < 2200; i++) params.push({ i, name: 'P' + i, norm: [0.35, 0.6, 0.45, 0.7, 0.25][i % 5] });
const r = renderLayout(fs.readFileSync(src, 'utf8'), params, { scale: Number(scale) || 2 });
if (r.skipped) { console.error('not drawn:', r.skipped); process.exit(1); }
fs.writeFileSync(out, r.png);
console.log(`${out}: ${r.W + 8} x ${r.H} px card`);
