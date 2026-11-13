// Draws a community layout to a PNG the way FX Devices would, so Auto Layout creator can look at what it
// made and compare it with the plugin's own window (and so people can see before/after pictures).
// The layout runs in Lua 5.3 (fengari) against FX Devices' real Stock FX UI kit (kit/Stock FX UI.lua, a
// copy of src/Functions/Stock FX UI.lua from the BryanChi-FX-Devices repo: copy it again when the kit
// changes), with ReaImGui's draw list recorded and painted with @napi-rs/canvas.
// renderLayout(lua, params, { scale = 2, values }) -> { png: Buffer, W, H } or { skipped: reason }

const fs = require('fs');
const path = require('path');
const fengari = require('fengari');
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const KIT_DIR = path.join(__dirname, 'kit');
let KIT_SRC = null;
function kitSource() {
	if (KIT_SRC === null) KIT_SRC = fs.readFileSync(path.join(KIT_DIR, 'Stock FX UI.lua'), 'utf8');
	return KIT_SRC;
}

const CARD_H = 216;

const HARNESS = String.raw`
local SRC, KIT, NAMES, VALUES, FMTS, WIDTHS = ...
local X0, Y0 = 4, 4
local OPS, n = {}, 0
local function op(s) n = n + 1 if n < 400000 then OPS[n] = s end end
local function N(v) v = tonumber(v) or 0 if v ~= v or v == math.huge or v == -math.huge then return 0 end return v end
local function F(v) return string.format('%.2f', N(v)) end
local function C(c) return string.format('%d', math.floor(N(c))) end
local function S(s) return (tostring(s or ''):gsub('[\t\n]', ' ')) end

local names, vals, fmts = {}, {}, {}
for nm in (NAMES .. '\n'):gmatch('([^\n]*)\n') do names[#names + 1] = nm end
local i = 0
for v in (VALUES .. '\n'):gmatch('([^\n]*)\n') do i = i + 1 vals[i] = tonumber(v) end
i = 0
for v in (FMTS .. '\n'):gmatch('([^\n]*)\n') do i = i + 1 fmts[i] = v end
local NP = #names

local fontSz, fontBold = 13, false
local cursorX, cursorY = X0, Y0
-- glyph widths (per 100 px) of printable ASCII in the regular and the bold font, measured by the painter
local WR, WB = {}, {}
do
    local k = 0
    for w in (WIDTHS or ''):gmatch('[^,]+') do
        k = k + 1
        if k <= 95 then WR[k + 31] = tonumber(w) else WB[k - 95 + 31] = tonumber(w) end
    end
end
local function TW(s, sz, bold)
    s, sz = tostring(s or ''), sz or 13
    local t, tab = 0, bold and WB or WR
    for i = 1, #s do t = t + (tab[s:byte(i)] or 56) end
    return t * sz / 100
end
local im = {}
im.DrawFlags_None = 0
im.DrawFlags_Closed = 1
im.DrawFlags_RoundCornersTop = 48
im.DrawFlags_RoundCornersBottom = 192
im.DrawFlags_RoundCornersAll = 240
im.DrawFlags_RoundCornersNone = 256
function im.DrawList_AddRectFilled(dl, x1, y1, x2, y2, c, rr) op('rf\t' .. F(x1) .. '\t' .. F(y1) .. '\t' .. F(x2) .. '\t' .. F(y2) .. '\t' .. C(c) .. '\t' .. F(rr)) end
function im.DrawList_AddRect(dl, x1, y1, x2, y2, c, rr, fl, th) op('r\t' .. F(x1) .. '\t' .. F(y1) .. '\t' .. F(x2) .. '\t' .. F(y2) .. '\t' .. C(c) .. '\t' .. F(rr) .. '\t' .. F(th or 1)) end
function im.DrawList_AddRectFilledMultiColor(dl, x1, y1, x2, y2, a, b, c, d) op('g\t' .. F(x1) .. '\t' .. F(y1) .. '\t' .. F(x2) .. '\t' .. F(y2) .. '\t' .. C(a) .. '\t' .. C(b) .. '\t' .. C(c) .. '\t' .. C(d)) end
function im.DrawList_AddLine(dl, x1, y1, x2, y2, c, th) op('l\t' .. F(x1) .. '\t' .. F(y1) .. '\t' .. F(x2) .. '\t' .. F(y2) .. '\t' .. C(c) .. '\t' .. F(th or 1)) end
function im.DrawList_AddCircleFilled(dl, x, y, r, c) op('cf\t' .. F(x) .. '\t' .. F(y) .. '\t' .. F(r) .. '\t' .. C(c)) end
function im.DrawList_AddCircle(dl, x, y, r, c, sg, th) op('c\t' .. F(x) .. '\t' .. F(y) .. '\t' .. F(r) .. '\t' .. C(c) .. '\t' .. F(th or 1)) end
function im.DrawList_AddNgonFilled(dl, x, y, r, c, k) op('nf\t' .. F(x) .. '\t' .. F(y) .. '\t' .. F(r) .. '\t' .. C(c) .. '\t' .. F(k or 6)) end
function im.DrawList_AddNgon(dl, x, y, r, c, k, th) op('n\t' .. F(x) .. '\t' .. F(y) .. '\t' .. F(r) .. '\t' .. C(c) .. '\t' .. F(k or 6) .. '\t' .. F(th or 1)) end
function im.DrawList_AddEllipseFilled(dl, x, y, rx, ry, c) op('ef\t' .. F(x) .. '\t' .. F(y) .. '\t' .. F(rx) .. '\t' .. F(ry) .. '\t' .. C(c)) end
function im.DrawList_AddTriangleFilled(dl, x1, y1, x2, y2, x3, y3, c) op('poly\t' .. C(c) .. '\t1\t1\t' .. F(x1) .. '\t' .. F(y1) .. '\t' .. F(x2) .. '\t' .. F(y2) .. '\t' .. F(x3) .. '\t' .. F(y3)) end
function im.DrawList_AddTriangle(dl, x1, y1, x2, y2, x3, y3, c, th) op('poly\t' .. C(c) .. '\t0\t' .. F(th or 1) .. '\t' .. F(x1) .. '\t' .. F(y1) .. '\t' .. F(x2) .. '\t' .. F(y2) .. '\t' .. F(x3) .. '\t' .. F(y3)) end
function im.DrawList_AddQuadFilled(dl, x1, y1, x2, y2, x3, y3, x4, y4, c) op('poly\t' .. C(c) .. '\t1\t1\t' .. F(x1) .. '\t' .. F(y1) .. '\t' .. F(x2) .. '\t' .. F(y2) .. '\t' .. F(x3) .. '\t' .. F(y3) .. '\t' .. F(x4) .. '\t' .. F(y4)) end
function im.DrawList_AddQuad(dl, x1, y1, x2, y2, x3, y3, x4, y4, c, th) op('poly\t' .. C(c) .. '\t0\t' .. F(th or 1) .. '\t' .. F(x1) .. '\t' .. F(y1) .. '\t' .. F(x2) .. '\t' .. F(y2) .. '\t' .. F(x3) .. '\t' .. F(y3) .. '\t' .. F(x4) .. '\t' .. F(y4) .. '\t' .. F(x1) .. '\t' .. F(y1)) end
function im.DrawList_AddBezierCubic(dl, x1, y1, x2, y2, x3, y3, x4, y4, c, th) op('bz\t' .. C(c) .. '\t' .. F(th or 1) .. '\t' .. F(x1) .. '\t' .. F(y1) .. '\t' .. F(x2) .. '\t' .. F(y2) .. '\t' .. F(x3) .. '\t' .. F(y3) .. '\t' .. F(x4) .. '\t' .. F(y4)) end
function im.DrawList_AddText(dl, x, y, c, s) op('t\t' .. F(x) .. '\t' .. F(y) .. '\t' .. C(c) .. '\t0\t' .. F(fontSz) .. '\t' .. S(s)) end
function im.DrawList_AddTextEx(dl, f, sz, x, y, c, s)
    local bold = type(f) == 'table' and f.bold and 1 or 0
    op('t\t' .. F(x) .. '\t' .. F(y) .. '\t' .. C(c) .. '\t' .. bold .. '\t' .. F(sz or fontSz) .. '\t' .. S(s))
end
function im.DrawList_PathLineTo(dl, x, y) op('pl\t' .. F(x) .. '\t' .. F(y)) end
function im.DrawList_PathArcTo(dl, x, y, r, a0, a1) op('pa\t' .. F(x) .. '\t' .. F(y) .. '\t' .. F(r) .. '\t' .. string.format('%.4f', N(a0)) .. '\t' .. string.format('%.4f', N(a1))) end
function im.DrawList_PathArcToFast(dl, x, y, r, m0, m1) op('pa\t' .. F(x) .. '\t' .. F(y) .. '\t' .. F(r) .. '\t' .. string.format('%.4f', N(m0) * math.pi / 6) .. '\t' .. string.format('%.4f', N(m1) * math.pi / 6)) end
function im.DrawList_PathBezierCubicCurveTo(dl, x2, y2, x3, y3, x4, y4) op('pb\t' .. F(x2) .. '\t' .. F(y2) .. '\t' .. F(x3) .. '\t' .. F(y3) .. '\t' .. F(x4) .. '\t' .. F(y4)) end
function im.DrawList_PathRect(dl, x1, y1, x2, y2) op('pl\t' .. F(x1) .. '\t' .. F(y1)) op('pl\t' .. F(x2) .. '\t' .. F(y1)) op('pl\t' .. F(x2) .. '\t' .. F(y2)) op('pl\t' .. F(x1) .. '\t' .. F(y2)) end
function im.DrawList_PathStroke(dl, c, fl, th) op('ps\t' .. C(c) .. '\t' .. F(th or 1) .. '\t' .. ((tonumber(fl) or 0) % 2 == 1 and 1 or 0)) end
function im.DrawList_PathFillConvex(dl, c) op('pf\t' .. C(c)) end
function im.DrawList_PathClear() op('pc') end
function im.DrawList_PushClipRect(dl, x1, y1, x2, y2) op('clip\t' .. F(x1) .. '\t' .. F(y1) .. '\t' .. F(x2) .. '\t' .. F(y2)) end
function im.DrawList_PopClipRect() op('unclip') end
function im.PushFont(c, f) fontSz = type(f) == 'table' and f.sz or 13 fontBold = type(f) == 'table' and f.bold or false end
function im.PopFont() fontSz, fontBold = 13, false end
function im.CalcTextSize(c, s) return TW(s, fontSz, fontBold), fontSz end
function im.GetFontSize() return fontSz end
function im.GetTextLineHeight() return fontSz end
function im.GetWindowDrawList() return 'DL' end
function im.GetForegroundDrawList() return 'DL' end
function im.GetCursorScreenPos() return cursorX, cursorY end
function im.SetCursorScreenPos(c, x, y) cursorX, cursorY = N(x), N(y) end
function im.GetMousePos() return -9999, -9999 end
function im.GetTime() return 1 end
setmetatable(im, { __index = function(t, k)
    if type(k) ~= 'string' then return nil end
    if k:find('^Is') or k:find('^Begin') or k:find('Button$') or k:find('^Selectable') or k:find('^Checkbox')
        or k:find('Slider') or k:find('Drag') or k:find('Combo') then return function() return false end end
    if k:find('^Get') then return function() return 0, 0, 0, 0 end end
    if k:find('_') and not k:find('^DrawList') then return 1 end
    return function() end
end })

local function Fmt(p)
    local f = fmts[p + 1]
    if f and f ~= '' then return f end
    return string.format('%.2f', vals[p + 1] or 0.5)
end
local r = setmetatable({
    TrackFX_GetParamNormalized = function(_, _, p) return vals[(tonumber(p) or 0) + 1] or 0.5 end,
    TrackFX_SetParamNormalized = function() return true end,
    TrackFX_GetFormattedParamValue = function(_, _, p) return true, Fmt(tonumber(p) or 0) end,
    TrackFX_FormatParamValueNormalized = function(_, _, p, v) return true, string.format('%.2f', tonumber(v) or 0) end,
    TrackFX_GetParamName = function(_, _, p) return true, names[(tonumber(p) or 0) + 1] or '' end,
    TrackFX_GetNumParams = function() return NP end,
    TrackFX_GetFXName = function() return true, 'FX' end,
    TrackFX_GetParam = function(_, _, p) return vals[(tonumber(p) or 0) + 1] or 0.5, 0, 1 end,
    TrackFX_GetParamEx = function(_, _, p) return vals[(tonumber(p) or 0) + 1] or 0.5, 0, 1, 0.5 end,
    TrackFX_GetEnabled = function() return true end,
    time_precise = function() return 100 end,
}, { __index = function() return function() return 0 end end })

-- what the kit expects of FX Devices
local G = {}
for k, v in pairs(_G) do G[k] = v end
G._G = G
G.im, G.r, G.reaper, G.ctx, G.LT_Track = im, r, r, 'ctx', 'track'
G.PluginScript = { FX_Idx = 0, Guid = '{guid}' }
G.FX = { ['{guid}'] = {} }
G.StoreNewParam = function(guid, name, p) G.FX['{guid}'][(tonumber(p) or 0) + 1] = { Num = p } end
G.AddKnob = function() end
G.AddSlider = function() end
for sz = 6, 30 do G['Font_Andale_Mono_' .. sz] = { sz = sz } end
for sz = 9, 14 do G['Font_SemiBold_' .. sz] = { sz = sz, bold = true } end -- as FX Devices makes them
G.require = function(m)
    if m == 'src.Functions.JSFX Update' then return { Follow = function() end, Button = function() end } end
    error('no module ' .. tostring(m))
end
local kfn, kerr = load(KIT, '=kit', 't', G)
if not kfn then return 'SKIP\tkit: ' .. tostring(kerr) end
local okk, SFX = pcall(kfn)
if not okk then return 'SKIP\tkit: ' .. tostring(SFX) end

local Declared = {}
local Begin = SFX.Begin
local KIT_T = setmetatable({}, { __index = SFX })
KIT_T.Begin = function(spec)
    spec = type(spec) == 'table' and spec or {}
    if type(spec.H) ~= 'number' or spec.H > SFX.H then spec.H = nil end
    Declared.W = spec.W
    return Begin(spec)
end

local Presets = setmetatable({ Current = function() return 'Default' end, Files = function() return {} end,
    Read = function() return '' end, IsOpen = function() return false end },
    { __index = function() return function() end end })
local function Copy(t) local o = {} for k, v in pairs(t) do o[k] = v end return o end
local env = {
    assert = assert, error = error, ipairs = ipairs, next = next, pairs = pairs, select = select,
    tonumber = tonumber, tostring = tostring, type = type, rawequal = rawequal, rawlen = rawlen, rawget = rawget, rawset = rawset,
    unpack = table.unpack, math = Copy(math), table = Copy(table), utf8 = Copy(utf8), string = Copy(string),
    os = { clock = function() return 0 end, time = function() return 0 end, date = function() return '' end },
    pcall = pcall, xpcall = xpcall, getmetatable = getmetatable, setmetatable = setmetatable, print = function() end,
    im = im, r = r, reaper = r, Presets = Presets, ctx = 'ctx', LT_Track = 'track',
    PluginScript = G.PluginScript,
    require = function() return KIT_T end,
}
setmetatable(env, { __index = function(_, k) if type(k) == 'string' and k:match('^Font_') then return G[k] end end })
local fn, err = load(SRC, '=layout', 't', env)
if not fn then return 'SKIP\tdoesn\'t compile: ' .. tostring(err):sub(1, 200) end
local last
for frame = 1, 2 do
    n, OPS = 0, {}
    cursorX, cursorY = X0, Y0
    debug.sethook(function() error('too long', 0) end, '', 5000000)
    local ok, e = pcall(fn)
    debug.sethook()
    if not ok then return 'SKIP\t' .. tostring(e):sub(1, 200) end
end
return 'W\t' .. tostring(Declared.W or '') .. '\n' .. table.concat(OPS, '\n', 1, math.min(n, 400000))
`;

function runLua(src, params, values) {
	const L = lauxlib.luaL_newstate();
	try {
		lualib.luaL_openlibs(L);
		if (lauxlib.luaL_loadstring(L, to_luastring(HARNESS)) !== lua.LUA_OK) {
			return { skipped: 'harness: ' + to_jsstring(lua.lua_tostring(L, -1)) };
		}
		const list = Array.isArray(params) ? params.slice(0, 4000) : [];
		const names = list.map(p => String((p && p.name) || '').replace(/\n/g, ' '));
		const vals = list.map((p, i) => {
			const v = values && values[i] != null ? values[i] : (p && p.norm);
			return Number.isFinite(Number(v)) ? String(Number(v)) : '';
		});
		const fmts = list.map(p => String((p && typeof p.value === 'string' && p.value) || '').replace(/\n/g, ' '));
		for (const s of [String(src || ''), kitSource(), names.join('\n'), vals.join('\n'), fmts.join('\n'), glyphWidths()]) lua.lua_pushstring(L, to_luastring(s));
		if (lua.lua_pcall(L, 6, 1, 0) !== lua.LUA_OK) return { skipped: to_jsstring(lua.lua_tostring(L, -1) || to_luastring('error')) };
		return { text: to_jsstring(lua.lua_tostring(L, -1)) };
	} finally {
		lua.lua_close && lua.lua_close(L);
	}
}

let canvasLib = null;
function canvas() {
	if (canvasLib) return canvasLib;
	canvasLib = require('@napi-rs/canvas');
	try {
		canvasLib.GlobalFonts.registerFromPath(path.join(KIT_DIR, 'InterTight-SemiBold.ttf'), 'FXDBold');
		canvasLib.GlobalFonts.registerFromPath(path.join(KIT_DIR, 'InterTight-VariableFont_wght.ttf'), 'FXDText');
	} catch (_) { /* default font then */ }
	return canvasLib;
}

let WIDTHS = null;
function glyphWidths() {
	if (WIDTHS !== null) return WIDTHS;
	WIDTHS = '';
	try {
		const { createCanvas } = canvas();
		const g = createCanvas(10, 10).getContext('2d');
		const out = [];
		for (const fam of ['FXDText', 'FXDBold']) {
			g.font = `100px ${fam}`;
			for (let c = 32; c < 127; c++) out.push(g.measureText(String.fromCharCode(c)).width.toFixed(1));
		}
		WIDTHS = out.join(',');
	} catch (_) { /* estimates then */ }
	return WIDTHS;
}

function rgba(c) {
	c = Number(c) >>> 0;
	return `rgba(${(c >>> 24) & 255},${(c >>> 16) & 255},${(c >>> 8) & 255},${((c & 255) / 255).toFixed(3)})`;
}
function roundRect(g, x1, y1, x2, y2, r) {
	const w = x2 - x1, h = y2 - y1;
	r = Math.max(0, Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2));
	g.beginPath();
	if (r > 0.01 && g.roundRect) g.roundRect(x1, y1, w, h, r); else g.rect(x1, y1, w, h);
}

function paint(text, { scale = 2, bg = 0x1A1C20ff } = {}) {
	const { createCanvas } = canvas();
	const lines = text.split('\n');
	const W = Number(lines[0].split('\t')[1]) || 300;
	const X0 = 4, Y0 = 4;
	const cw = Math.ceil(W + 8), ch = CARD_H;
	const cv = createCanvas(Math.ceil(cw * scale), Math.ceil(ch * scale));
	const g = cv.getContext('2d');
	g.fillStyle = rgba(bg);
	g.fillRect(0, 0, cv.width, cv.height);
	g.scale(scale, scale);
	g.translate(-X0, -Y0);
	g.save();
	g.beginPath(); g.rect(X0, Y0, cw, ch); g.clip();
	let clips = 0;
	let pathOpen = false;
	const startPath = () => { if (!pathOpen) { g.beginPath(); pathOpen = true; } };
	for (let i = 1; i < lines.length; i++) {
		const a = lines[i].split('\t');
		const k = a[0];
		const f = j => Number(a[j]);
		switch (k) {
			case 'rf': roundRect(g, f(1), f(2), f(3), f(4), f(6)); g.fillStyle = rgba(a[5]); g.fill(); break;
			case 'r': roundRect(g, f(1), f(2), f(3), f(4), f(6)); g.strokeStyle = rgba(a[5]); g.lineWidth = f(7) || 1; g.stroke(); break;
			case 'g': {
				const gr = g.createLinearGradient(0, f(2), 0, f(4));
				gr.addColorStop(0, rgba(a[5])); gr.addColorStop(1, rgba(a[8]));
				g.fillStyle = gr; g.fillRect(f(1), f(2), f(3) - f(1), f(4) - f(2)); break;
			}
			case 'l': g.beginPath(); g.moveTo(f(1), f(2)); g.lineTo(f(3), f(4)); g.strokeStyle = rgba(a[5]); g.lineWidth = f(6) || 1; g.stroke(); break;
			case 'cf': g.beginPath(); g.arc(f(1), f(2), Math.max(0, f(3)), 0, Math.PI * 2); g.fillStyle = rgba(a[4]); g.fill(); break;
			case 'c': g.beginPath(); g.arc(f(1), f(2), Math.max(0, f(3)), 0, Math.PI * 2); g.strokeStyle = rgba(a[4]); g.lineWidth = f(5) || 1; g.stroke(); break;
			case 'ef': g.beginPath(); g.ellipse(f(1), f(2), Math.max(0, f(3)), Math.max(0, f(4)), 0, 0, Math.PI * 2); g.fillStyle = rgba(a[5]); g.fill(); break;
			case 'nf': case 'n': {
				const sides = Math.max(3, Math.round(f(5)));
				g.beginPath();
				for (let s = 0; s < sides; s++) {
					const an = (s / sides) * Math.PI * 2;
					const px = f(1) + Math.cos(an) * f(3), py = f(2) + Math.sin(an) * f(3);
					if (s) g.lineTo(px, py); else g.moveTo(px, py);
				}
				g.closePath();
				if (k === 'nf') { g.fillStyle = rgba(a[4]); g.fill(); } else { g.strokeStyle = rgba(a[4]); g.lineWidth = f(6) || 1; g.stroke(); }
				break;
			}
			case 'poly': {
				g.beginPath();
				for (let j = 4; j + 1 < a.length; j += 2) { if (j === 4) g.moveTo(f(j), f(j + 1)); else g.lineTo(f(j), f(j + 1)); }
				if (a[2] === '1') { g.closePath(); g.fillStyle = rgba(a[1]); g.fill(); } else { g.strokeStyle = rgba(a[1]); g.lineWidth = f(3) || 1; g.stroke(); }
				break;
			}
			case 'bz': g.beginPath(); g.moveTo(f(3), f(4)); g.bezierCurveTo(f(5), f(6), f(7), f(8), f(9), f(10)); g.strokeStyle = rgba(a[1]); g.lineWidth = f(2) || 1; g.stroke(); break;
			case 't': {
				const sz = f(5) || 13;
				g.font = `${sz}px ${a[4] === '1' ? 'FXDBold' : 'FXDText'}`;
				g.textBaseline = 'top';
				g.fillStyle = rgba(a[3]);
				g.fillText(a.slice(6).join(' '), f(1), f(2) + sz * 0.05);
				break;
			}
			case 'pl': startPath(); g.lineTo(f(1), f(2)); break;
			case 'pa': startPath(); g.arc(f(1), f(2), Math.max(0, f(3)), f(4), f(5), f(5) < f(4)); break;
			case 'pb': startPath(); g.bezierCurveTo(f(1), f(2), f(3), f(4), f(5), f(6)); break;
			case 'ps': if (pathOpen) { if (a[3] === '1') g.closePath(); g.strokeStyle = rgba(a[1]); g.lineWidth = f(2) || 1; g.stroke(); } pathOpen = false; break;
			case 'pf': if (pathOpen) { g.closePath(); g.fillStyle = rgba(a[1]); g.fill(); } pathOpen = false; break;
			case 'pc': pathOpen = false; break;
			case 'clip': g.save(); clips++; g.beginPath(); g.rect(f(1), f(2), f(3) - f(1), f(4) - f(2)); g.clip(); break;
			case 'unclip': if (clips > 0) { g.restore(); clips--; } break;
			default: break;
		}
	}
	while (clips-- > 0) g.restore();
	g.restore();
	return { png: cv.toBuffer('image/png'), W, H: CARD_H };
}

function renderLayout(src, params, opts = {}) {
	let res;
	try {
		res = runLua(src, params, opts.values);
	} catch (err) {
		return { skipped: String(err && err.message || err) };
	}
	if (res.skipped) return res;
	if (res.text.startsWith('SKIP')) return { skipped: res.text.slice(5) };
	try {
		return paint(res.text, opts);
	} catch (err) {
		return { skipped: 'paint: ' + String(err && err.message || err) };
	}
}

module.exports = { renderLayout };
