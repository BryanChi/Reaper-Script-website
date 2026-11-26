// Is every control of a community layout bound to the right parameter, and is it where the plugin has it?
// checkBounds (layout-bounds.js) runs the layout against a stand-in of the kit and returns which param each
// Params key resolves to (the kit's own rule: the first param with one of the names, else idx) and every
// control drawn (kind, key, param index, label, centre). This compares that with the plugin's parameter list
// and with the writer's plan (GENERATE_SCHEMA.controls: each control of the original window, the param it
// shows and where it sits as a fraction of the window).
// checkBindings(fit, params, plan) -> { errors: [text], notes: [text], table: text }
//   errors: wrong for sure (a name that isn't a param and falls back to some other param, a shared name that
//           binds the wrong one, a control that isn't bound, a control bound against the plan): the writer fixes them
//   notes:  worth a look (a label that doesn't match its param's name, a control far from its place in the original,
//           a control of the original that isn't on the card): shown with the look pass
//   table:  label -> param (name, current value) for every control, for the look pass

const STOP = new Set(['the', 'of', 'and', 'amt', 'amount', 'level', 'lvl', 'param', 'parameter', 'value', 'on', 'off', 'enable', 'enabled']);
function words(s) {
	return String(s || '').toLowerCase().replace(/([a-z])([0-9])/g, '$1 $2').split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w));
}
function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
// does a control's label plausibly name this param? ('Ceiling' ~ 'RMS Ceiling', 'Thresh' ~ 'Threshold', 'Lo Cut' ~ 'Low Cut')
function related(label, name) {
	const a = words(label), b = words(name);
	if (!a.length || !b.length) return true;
	if (norm(label) && norm(name).includes(norm(label))) return true;
	if (norm(name) && norm(label).includes(norm(name))) return true;
	for (const x of a) for (const y of b) {
		if (x === y) return true;
		if (x.length >= 3 && y.length >= 3 && (x.startsWith(y.slice(0, 3)) && y.startsWith(x.slice(0, 3)))) return true;
		if (x.length >= 2 && y.length >= 2 && (y.startsWith(x) || x.startsWith(y))) return true;
	}
	return false;
}

// the params whose name is closest to what a key asked for, for the error text
function closest(params, asked, n = 3) {
	const scored = [];
	for (let i = 0; i < params.length; i++) {
		const nm = String((params[i] && params[i].name) || '');
		let best = 0;
		for (const a of asked) {
			if (norm(nm) === norm(a)) best = Math.max(best, 3);
			else if (related(a, nm)) best = Math.max(best, norm(nm).includes(norm(a)) || norm(a).includes(norm(nm)) ? 2 : 1);
		}
		if (best) scored.push([best, i]);
	}
	return scored.sort((x, y) => y[0] - x[0] || x[1] - y[1]).slice(0, n).map(s => s[1]);
}

function checkBindings(fit, params, plan) {
	const errors = [], notes = [];
	const list = Array.isArray(params) ? params : [];
	const byIdx = new Map(list.map((p, j) => [Number.isInteger(p && p.i) ? p.i : j, p]));
	const P = i => byIdx.get(i) || list[i];
	const pinfo = i => {
		const p = P(i);
		if (!p) return `#${i}`;
		const v = p.value !== undefined && p.value !== '' ? `, now "${String(p.value).slice(0, 24)}"` : '';
		return `#${i} "${String(p.name || '').slice(0, 48)}"${v}`;
	};
	const named = new Map(); // lower-case name -> [indexes]
	for (const [i, p] of byIdx) {
		const k = String((p && p.name) || '').toLowerCase();
		if (!named.has(k)) named.set(k, []);
		named.get(k).push(i);
	}
	const keys = new Map((fit.keys || []).map(k => [k.key, k]));
	const used = new Set((fit.controls || []).map(c => c.key));

	const badKeys = new Set(); // keys already reported: no second note about their controls
	for (const k of fit.keys || []) {
		if (!used.has(k.key) && k.how !== 'none') continue; // declared but never drawn: harmless
		if (k.how === 'idx' && k.asked.length) {
			badKeys.add(k.key);
			const near = closest(list, k.asked).filter(i => i !== k.idx);
			errors.push(`Params.${k.key} asks for ${k.asked.map(a => `"${a}"`).join(' / ')}, but no parameter has that name, so it falls back to idx ${k.idx} = ${pinfo(k.idx)}.` +
				(near.length ? ` Parameters with a similar name: ${near.map(pinfo).join('; ')}.` : '') +
				` Copy the name exactly as the parameter list writes it, with its idx.`);
		} else if (k.how === 'none' && used.has(k.key)) {
			errors.push(`Params.${k.key} (${k.asked.map(a => `"${a}"`).join(' / ') || 'no name'}${k.askedIdx != null ? `, idx ${k.askedIdx}` : ''}) matches no parameter, so its control does nothing. Use a name and idx from the parameter list.`);
		} else if (k.how === 'name' && k.askedIdx != null && k.askedIdx !== k.idx) {
			const same = named.get(String((P(k.idx) || {}).name || '').toLowerCase()) || [];
			if (same.includes(k.askedIdx)) {
				errors.push(`Params.${k.key}: ${same.length} parameters are named "${(P(k.idx) || {}).name}" (${same.map(i => '#' + i).join(', ')}) and the kit binds a name to the first one, #${k.idx}, not idx ${k.askedIdx}. For a parameter that shares its name with another, write only the index: ${k.key} = { idx = ${k.askedIdx} }.`);
			}
		}
	}
	for (const c of fit.controls || []) {
		if (c.idx == null && !keys.has(c.key) && isNaN(Number(c.key))) {
			errors.push(`A ${c.kind}${c.label ? ` "${c.label}"` : ''} uses the key '${c.key}', which isn't in Params, so it is bound to nothing.`);
		}
	}

	// the plan: what the original window shows, where, and with which param
	const W = Number(fit.W) || 0, H = 216;
	const planned = (Array.isArray(plan) ? plan : []).filter(e => e && typeof e === 'object').slice(0, 200);
	const sameLabel = (a, b) => norm(a) && norm(a) === norm(b);
	const name = (label, kind) => label ? `"${label}"` : `the ${kind || 'control'}`;
	for (const e of planned) {
		const pi = Number.isInteger(e.param) ? e.param : -1;
		if (pi < 0) continue;
		if (!P(pi)) { errors.push(`The plan puts parameter #${pi} under "${e.label}", but the plugin has no parameter #${pi}.`); continue; }
		const wrong = (fit.controls || []).filter(c => sameLabel(c.label, e.label) && c.idx != null && c.idx !== pi);
		const right = (fit.controls || []).filter(c => c.idx === pi);
		// a label the original prints twice ("Threshold" in two sections) can't tell which control is meant
		const unique = planned.filter(o => sameLabel(o.label, e.label)).length === 1;
		if (unique && wrong.length && !right.some(c => sameLabel(c.label, e.label))) {
			errors.push(`"${e.label}" shows ${pinfo(pi)} in your plan, but the layout's ${wrong[0].kind} "${wrong[0].label}" is bound to ${pinfo(wrong[0].idx)}.`);
			wrong.forEach(c => badKeys.add(c.key));
			continue;
		}
		if (!right.length) {
			notes.push(`${name(e.label, e.kind)} (${pinfo(pi)}) is in the original window but not on the card.`);
			continue;
		}
		if (right.every(c => badKeys.has(c.key))) continue;
		if (W > 0 && typeof e.x === 'number' && typeof e.y === 'number') {
			const c = right.reduce((a, b) => (Math.hypot(a.cx - e.x * W, a.cy - e.y * H) <= Math.hypot(b.cx - e.x * W, b.cy - e.y * H) ? a : b));
			const dx = c.cx / W - e.x, dy = c.cy / H - e.y;
			if (Math.abs(dx) > 0.08 || Math.abs(dy) > 0.15) {
				const pct = v => Math.round(v * 100) + '%';
				notes.push(`${name(e.label, e.kind)} sits at ${pct(c.cx / W)} across, ${pct(c.cy / H)} down the card; in the original it is at ${pct(e.x)}, ${pct(e.y)}.`);
			}
		}
	}
	// labels that don't name their param (checked once per param)
	const seen = new Set();
	for (const c of fit.controls || []) {
		if (c.idx == null || !c.label || badKeys.has(c.key) || seen.has(c.idx + '|' + c.label)) continue;
		seen.add(c.idx + '|' + c.label);
		const p = P(c.idx);
		if (p && !related(c.label, p.name)) {
			const inPlan = planned.some(e => e.param === c.idx && sameLabel(e.label, c.label));
			notes.push(`The ${c.kind} labelled "${c.label}" is bound to ${pinfo(c.idx)}: the label and the parameter's name don't match${inPlan ? ' (your plan says so too)' : ''}. Check against the value the picture shows under "${c.label}".`);
		}
	}
	const table = (fit.controls || []).map(c => `${c.kind} "${c.label || c.key}" -> ${c.idx == null ? 'nothing' : pinfo(c.idx)}`).join('\n');
	return { errors: [...new Set(errors)].slice(0, 30), notes: [...new Set(notes)].slice(0, 30), table };
}

module.exports = { checkBindings, related };
