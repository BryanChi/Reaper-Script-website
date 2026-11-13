// Does a community layout fit FX Devices' card? The card's content area is a fixed 216 px tall (SFX.H
// in "Stock FX UI.lua"; FX Devices clips at 220) and W px wide (+8). Anything drawn past that is cut
// off in REAPER, so before a layout goes to the user it runs here for two frames against a stand-in
// of the kit, im and r (Lua 5.3 in JS, no REAPER) and every box it draws is measured.
// checkBounds(lua, params) -> { ok, issues: [text], H, W } or { skipped: reason } when it can't tell.

const fengari = require('fengari');
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const CARD_H = 216;
const SLACK = 2; // anti-aliasing, rounding

const HARNESS = String.raw`
local SRC, NAMES, CARD_H = ...
local X0, Y0 = 1000, 1000
local boxes, n = {}, 0
local function Box(what, x1, y1, x2, y2)
    if type(x1) ~= 'number' or type(y1) ~= 'number' then return end
    x2, y2 = tonumber(x2) or x1, tonumber(y2) or y1
    if x2 < x1 then x1, x2 = x2, x1 end
    if y2 < y1 then y1, y2 = y2, y1 end
    n = n + 1
    if n > 200000 then return end
    boxes[n] = { what, x1, y1, x2, y2 }
end
local function TW(s, sz) return #tostring(s or '') * (sz or 10) * 0.58 end

local names = {}
for nm in (NAMES .. '\n'):gmatch('([^\n]*)\n') do names[#names + 1] = nm end
local NP = #names

-- the kit: same geometry as src/Functions/Stock FX UI.lua, drawing replaced by boxes
local KNOB = { L = 17, M = 14, S = 11 }
local Dev = {}
Dev.__index = Dev
local function Ctl(self, what, x1, y1, x2, y2) Box(what, self.X + x1, self.Y + y1, self.X + x2, self.Y + y2) end
function Dev:Idx(k)
    if type(k) == 'number' then return k end
    return self.P[k]
end
function Dev:Get(k) return 0.5 end
function Dev:Set() end
function Dev:Fmt(k) return self:Idx(k) and '0.0' or '' end
function Dev:FmtN() return '0.0' end
function Dev:Val() return 0 end
function Dev:NormFor() return 0.5 end
function Dev:On() return false end
function Dev:Lit() return false end
function Dev:IsToggle() return false end
function Dev:Choices() return { { 'A', 0 }, { 'B', 1 } } end
function Dev:Groups() return {} end
function Dev:Hold(_, v) return v or 0 end
function Dev:InputWave(n) local t = {} for i = 1, math.max(1, math.floor(n or 64)) do t[i] = 0.5 end return t, 60 end
function Dev:Text(x, y, clr, txt, sz, align)
    sz = sz or 10
    local w = TW(txt, sz)
    local l = align == 'c' and x - w / 2 or (align == 'r' and x - w or x)
    Ctl(self, 'text "' .. tostring(txt):sub(1, 24) .. '"', l, y, l + w, y + sz)
end
function Dev:Rect(x, y, w, h) Ctl(self, 'D:Rect', x, y, x + (w or 0), y + (h or 0)) end
function Dev:Line(x1, y1, x2, y2) Ctl(self, 'D:Line', x1, y1, x2, y2) end
function Dev:Dashed(x1, y1, x2, y2) Ctl(self, 'D:Dashed', x1, y1, x2, y2) end
function Dev:Panel(x, y, w, h)
    Ctl(self, 'D:Panel', x, y, x + w, y + h)
    return self.X + x, self.Y + y, self.X + x + w, self.Y + y + h
end
function Dev:Section(x, y, w, label) Ctl(self, 'D:Section "' .. tostring(label):sub(1, 24) .. '"', x, y, x + math.max(w or 0, TW(label, 9)), y + 9) end
function Dev:Btn(id, x, y, w, h)
    Ctl(self, 'D:Btn', x, y, x + (w or 1), y + (h or 1))
    return false, false, false
end
function Dev:PrmKnob(p, cx, cy, rad) Ctl(self, 'D:PrmKnob', cx - rad, cy - rad, cx + rad, cy + rad) end
function Dev:PrmSlider(p, x, y, w, h) Ctl(self, 'D:PrmSlider', x, y, x + w, y + h) end
function Dev:Knob(k, cx, cy, size, label)
    local rad = type(size) == 'number' and size or KNOB[size or 'M'] or 14
    local arcR = rad + 3.5
    local lsz = rad >= 15 and 9 or 8
    local top = label and (cy - arcR - lsz - 4) or (cy - arcR)
    local bot = cy + arcR + 3 + (rad >= 15 and 10 or 9) + 2
    local hw = math.max(arcR, label and TW(label, lsz) / 2 or 0)
    Ctl(self, 'knob ' .. (label and ('"' .. tostring(label):sub(1, 24) .. '"') or tostring(k)), cx - hw, top, cx + hw, bot)
end
function Dev:Fader(k, cx, y, h, label)
    Ctl(self, 'fader ' .. (label and ('"' .. tostring(label):sub(1, 24) .. '"') or tostring(k)), cx - 9, y - 13, cx + 9, y + h + (label and 15 or 4))
end
function Dev:Bar(k, x, y, w, h, label) Ctl(self, 'bar "' .. tostring(label or k):sub(1, 24) .. '"', x, y, x + w, y + h) end
function Dev:Toggle(k, x, y, w, label, o)
    local h = (o and o.h) or 17
    Ctl(self, 'toggle "' .. tostring(label or k):sub(1, 24) .. '"', x, y, x + w, y + h)
    return false
end
function Dev:Choice(k, x, y, w, o)
    local h = (o and o.h) or 18
    Ctl(self, 'menu ' .. tostring((o and o.label) or k), x, y, x + w, y + h)
end
function Dev:Tabs(id, x, y, items, sel, o)
    local h, cx = (o and o.h) or 18, x
    for _, it in ipairs(items or {}) do
        local w = (o and o.w) or (TW(it[1], 9) + (it[2] and 22 or 14))
        cx = cx + w + 4
    end
    Ctl(self, 'tabs ' .. tostring(id), x, y, cx - 4, y + h)
    return sel, cx
end
function Dev:Meter(x, y, w, h, v, clr, o) Ctl(self, 'meter', x, y, x + w, y + h + ((o and o.label) and 13 or 0)) end
function Dev:End() end
-- kit 2: hardware parts
local function Lbl(s) return '"' .. tostring(s or ''):sub(1, 24) .. '"' end
function Dev:Engrave(x, y, txt, o)
    o = o or {}
    self:Text(x, y, 0, txt, o.size or 9, o.align)
end
function Dev:Screw(cx, cy, r) r = tonumber(r) or 4 Ctl(self, 'D:Screw', cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 2) end
function Dev:Faceplate(x, y, w, h, o)
    Ctl(self, 'D:Faceplate', x, y, x + w, y + h)
    if o and o.ears then local ew = o.earW or 14 return x + ew, y, w - ew * 2, h end
    return x, y, w, h
end
function Dev:Inset(x, y, w, h, o) Ctl(self, 'D:Inset' .. ((o and o.label) and (' ' .. Lbl(o.label)) or ''), x, y, x + w, y + h) end
function Dev:Dial(k, cx, cy, r, o)
    o = o or {}
    r = tonumber(r) or 14
    local ticks = o.ticks
    if ticks == nil and type(o.scale) == 'table' then ticks = #o.scale end
    local out = r + 2
    if ticks and ticks > 0 then out = r + 2 + (o.tickLen or 3) end
    local ssz = o.scaleSize or 7
    local side = out
    if type(o.scale) == 'table' and #o.scale > 0 then
        local wmax = 0
        for _, e in ipairs(o.scale) do wmax = math.max(wmax, TW(type(e) == 'table' and e[2] or e, ssz)) end
        side = out + 1.5 + wmax
        out = out + 1.5 + ssz
    end
    local lsz = o.labelSize or 8
    local top = o.label and (cy - out - lsz - 1) or (cy - out)
    local bot = cy + out + ((o.value == true and cy + out + (o.valueSize or 8) + 3 <= CARD_H) and (o.valueSize or 8) + 3 or 0) -- a hover value moves above it at the bottom edge
    local hw = math.max(side, o.label and TW(o.label, lsz) / 2 or 0)
    Ctl(self, 'dial ' .. (o.label and Lbl(o.label) or tostring(k)), cx - hw, top, cx + hw, bot)
end
function Dev:Switch(k, x, y, o)
    o = o or {}
    local len, w = o.len or 22, o.w or 10
    local bw, bh = o.horizontal and len or w, o.horizontal and w or len
    local lsz = o.labelSize or 8
    local x1, x2, y1, y2 = x - bw / 2, x + bw / 2, y - bh / 2 - 2, y + bh / 2 + 2
    if o.horizontal then
        if o.up then x1 = x1 - 3 - TW(o.up, lsz) end
        if o.down then x2 = x2 + 3 + TW(o.down, lsz) end
    else
        if o.up then y1 = y1 - lsz - 1 local hw = TW(o.up, lsz) / 2 x1, x2 = math.min(x1, x - hw), math.max(x2, x + hw) end
        if o.down then y2 = y2 + lsz + 1 local hw = TW(o.down, lsz) / 2 x1, x2 = math.min(x1, x - hw), math.max(x2, x + hw) end
    end
    if o.label then y1 = y1 - lsz - 1 local hw = TW(o.label, lsz) / 2 x1, x2 = math.min(x1, x - hw), math.max(x2, x + hw) end
    Ctl(self, 'switch ' .. Lbl(o.label or o.up or k), x1, y1, x2, y2)
    return false
end
function Dev:Lamp(x, y, r, on, o)
    r = tonumber(r) or 4
    local b = y + r + 3
    if o and o.label then b = y + r + 4 + (o.labelSize or 8) end
    Ctl(self, 'lamp', x - r - 3, y - r - 3, x + r + 3, b)
end
function Dev:Push(k, x, y, w, h, o)
    o = o or {}
    local top = y - 1
    if o.led ~= false then top = y - 9 end
    if o.label then top = top - (o.labelSize or 8) - 2 end
    Ctl(self, 'push ' .. Lbl(o.label or o.text or k), x - 1, top, x + w + 1, y + h + 1)
    return false
end
function Dev:VU(x, y, w, h) Ctl(self, 'D:VU', x, y, x + w + 1, y + h + 2) end
function Dev:Level() return -12 end
function Dev:Readout(x, y, w, h) Ctl(self, 'D:Readout', x - 1, y - 1, x + w + 1, y + h + 1) end

local KIT = {
    H = CARD_H, KNOB = KNOB,
    ACCENT = { Dynamics = 0xF2B04Cff, EQ = 0x4FC3F7ff, Time = 0xA78BFAff, Pitch = 0x5FE0B8ff, Synth = 0xF472B6ff, Utility = 0x9BA1ABff },
    BAND_CLR = { 1, 2, 3, 4, 5, 6, 7, 8 },
    C = setmetatable({}, { __index = function() return 0xFFFFFFFF end }),
    A = function(c) return c end,
    Clamp = function(v, lo, hi) return math.max(lo, math.min(hi, v)) end,
    Num = function(s) return tonumber(tostring(s or ''):match('[-+]?%d+%.?%d*')) end,
    ShortVal = function(s) return s or '' end,
    TextW = function(s, sz) return TW(s, sz) end,
    Shade = function(c) return c end, Mix = function(a) return a end, KIT = 2,
    VUPos = function(db) return 0.5 end,
}
local Declared = {}
local S = {}
function KIT.Begin(spec)
    spec = type(spec) == 'table' and spec or {}
    Declared.H, Declared.W = spec.H, spec.W
    local P = {}
    local i = 0
    for k, v in pairs(spec.Params or {}) do
        local idx = type(v) == 'table' and tonumber(v.idx)
        if not idx and type(v) == 'table' then
            for _, nm in ipairs(v) do
                for j, have in ipairs(names) do
                    if type(nm) == 'string' and have:lower() == nm:lower() then idx = j - 1 break end
                end
                if idx then break end
            end
        end
        P[k] = idx or i
        i = i + 1
    end
    local H = math.min(tonumber(spec.H) or CARD_H, CARD_H) -- FX Devices clamps it too
    return setmetatable({ X = X0, Y = Y0, W = tonumber(spec.W) or 300, H = H, Acc = 0xFFFFFFFF, DL = 'DL', NOW = 0,
        NumParams = NP, P = P, Names = names, S = S }, Dev)
end

-- im: draw-list calls become boxes; everything else is harmless
local PTS = { DrawList_AddLine = 4, DrawList_AddRect = 4, DrawList_AddRectFilled = 4, DrawList_AddRectFilledMultiColor = 4,
    DrawList_AddQuad = 8, DrawList_AddQuadFilled = 8, DrawList_AddTriangle = 6, DrawList_AddTriangleFilled = 6,
    DrawList_AddBezierCubic = 8, DrawList_AddBezierQuadratic = 6, DrawList_PathLineTo = 2, DrawList_PathRect = 4,
    DrawList_PathBezierCubicCurveTo = 6, DrawList_PathBezierQuadraticCurveTo = 4 }
local CIRC = { DrawList_AddCircle = true, DrawList_AddCircleFilled = true, DrawList_AddNgon = true,
    DrawList_AddNgonFilled = true, DrawList_PathArcTo = true, DrawList_PathArcToFast = true }
local cursorX, cursorY = X0, Y0
local im = setmetatable({}, { __index = function(t, k)
    local f
    if PTS[k] then
        local np = PTS[k]
        f = function(dl, ...)
            local a = { ... }
            local x1, y1, x2, y2 = math.huge, math.huge, -math.huge, -math.huge
            for j = 1, np, 2 do
                local x, y = tonumber(a[j]), tonumber(a[j + 1])
                if x and y then x1, y1, x2, y2 = math.min(x1, x), math.min(y1, y), math.max(x2, x), math.max(y2, y) end
            end
            if x1 <= x2 then Box(k:sub(10), x1, y1, x2, y2) end
        end
    elseif CIRC[k] then
        f = function(dl, cx, cy, rad)
            cx, cy, rad = tonumber(cx), tonumber(cy), tonumber(rad) or 0
            if cx and cy then Box(k:sub(10), cx - rad, cy - rad, cx + rad, cy + rad) end
        end
    elseif k == 'DrawList_AddEllipse' or k == 'DrawList_AddEllipseFilled' then
        f = function(dl, cx, cy, rx, ry)
            cx, cy, rx, ry = tonumber(cx), tonumber(cy), tonumber(rx) or 0, tonumber(ry) or 0
            if cx and cy then Box(k:sub(10), cx - rx, cy - ry, cx + rx, cy + ry) end
        end
    elseif k == 'DrawList_AddText' then
        f = function(dl, x, y, clr, txt) Box('text "' .. tostring(txt):sub(1, 24) .. '"', tonumber(x), tonumber(y), (tonumber(x) or 0) + TW(txt, 13), (tonumber(y) or 0) + 13) end
    elseif k == 'DrawList_AddTextEx' then
        f = function(dl, font, sz, x, y, clr, txt)
            sz = tonumber(sz) or 13
            Box('text "' .. tostring(txt):sub(1, 24) .. '"', tonumber(x), tonumber(y), (tonumber(x) or 0) + TW(txt, sz), (tonumber(y) or 0) + sz)
        end
    elseif k == 'SetCursorScreenPos' then
        f = function(c, x, y) cursorX, cursorY = tonumber(x) or cursorX, tonumber(y) or cursorY end
    elseif k == 'GetCursorScreenPos' or k == 'GetCursorStartPos' then
        f = function() return cursorX, cursorY end
    elseif k == 'InvisibleButton' or k == 'Button' then
        f = function(c, id, w, h)
            w, h = tonumber(w) or 0, tonumber(h) or 0
            Box(k, cursorX, cursorY, cursorX + w, cursorY + h)
            return false
        end
    elseif k:find('^DrawList_') or k:find('^Push') or k:find('^Pop') or k:find('^End') or k:find('^Set') or k:find('^Open') then
        f = function() end
    elseif k:find('^Calc') then
        f = function(c, s) return TW(s, 13), 13 end
    elseif k:find('^Get') then
        f = function() return 0, 0, 0, 0 end
    elseif k:find('^Is') or k:find('^Begin') or k:find('^Selectable') or k:find('^Checkbox') or k:find('Slider') or k:find('Drag') or k:find('Combo') then
        f = function() return false end
    elseif k:find('_') then
        return 1 -- a constant: Col_Text, WindowFlags_NoInputs ...
    else
        f = function() return false end
    end
    rawset(t, k, f)
    return f
end })

local R = setmetatable({
    TrackFX_GetParamNormalized = function() return 0.5 end,
    TrackFX_GetFormattedParamValue = function() return true, '0.0' end,
    TrackFX_FormatParamValueNormalized = function() return true, '0.0' end,
    TrackFX_GetParamName = function(_, _, p) return true, names[(tonumber(p) or 0) + 1] or 'Param' end,
    TrackFX_GetNumParams = function() return NP end,
    TrackFX_GetFXName = function() return true, 'FX' end,
    TrackFX_GetParam = function() return 0.5, 0, 1 end,
    TrackFX_GetParamEx = function() return 0.5, 0, 1, 0.5 end,
    time_precise = function() return 0 end,
}, { __index = function() return function() return 0 end end })

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
    im = im, r = R, reaper = R, Presets = Presets, ctx = 'ctx', LT_Track = 'track',
    PluginScript = { FX_Idx = 0, Guid = '{guid}' },
    require = function() return KIT end,
}
setmetatable(env, { __index = function(_, k) if type(k) == 'string' and k:match('^Font_') then return 'font' end end })

local fn, err = load(SRC, '=layout', 't', env)
if not fn then return 'SKIP\tdoesn\'t compile' end
local function Run()
    debug.sethook(function() error('too long', 0) end, '', 3000000)
    local ok, e = pcall(fn)
    debug.sethook()
    return ok, e
end
for frame = 1, 2 do
    n = 0
    boxes = {}
    local ok, e = Run()
    if not ok then return 'SKIP\t' .. tostring(e):sub(1, 200) end
end

local out = { 'H\t' .. tostring(Declared.H or ''), 'W\t' .. tostring(Declared.W or '') }
for j = 1, math.min(n, 200000) do
    local b = boxes[j]
    out[#out + 1] = ('B\t%s\t%.1f\t%.1f\t%.1f\t%.1f'):format(b[1], b[2] - X0, b[3] - Y0, b[4] - X0, b[5] - Y0)
end
return table.concat(out, '\n')
`;

function runLua(src, names) {
	const L = lauxlib.luaL_newstate();
	try {
		lualib.luaL_openlibs(L);
		if (lauxlib.luaL_loadstring(L, to_luastring(HARNESS)) !== lua.LUA_OK) {
			return { skipped: 'harness: ' + to_jsstring(lua.lua_tostring(L, -1)) };
		}
		lua.lua_pushstring(L, to_luastring(src));
		lua.lua_pushstring(L, to_luastring(names.join('\n')));
		lua.lua_pushnumber(L, CARD_H);
		if (lua.lua_pcall(L, 3, 1, 0) !== lua.LUA_OK) {
			return { skipped: to_jsstring(lua.lua_tostring(L, -1) || to_luastring('error')) };
		}
		return { text: to_jsstring(lua.lua_tostring(L, -1)) };
	} finally {
		lua.lua_close && lua.lua_close(L);
	}
}

function checkBounds(src, params) {
	let res;
	try {
		const names = (Array.isArray(params) ? params : []).slice(0, 2000).map(p => String((p && p.name) || '').replace(/\n/g, ' '));
		res = runLua(String(src || ''), names);
	} catch (err) {
		return { skipped: String(err && err.message || err) };
	}
	if (res.skipped) return res;
	const lines = res.text.split('\n');
	if (lines[0].startsWith('SKIP')) return { skipped: lines[0].slice(5) };
	const H = Number(lines[0].split('\t')[1]) || null;
	const W = Number(lines[1].split('\t')[1]) || null;
	const maxX = W ? W + 8 : Infinity;
	let bottom = -Infinity, right = -Infinity, top = Infinity, left = Infinity;
	const below = new Map(), beyond = new Map(), above = new Map();
	for (const ln of lines.slice(2)) {
		const [, what, x1s, y1s, x2s, y2s] = ln.split('\t');
		const x1 = +x1s, y1 = +y1s, x2 = +x2s, y2 = +y2s;
		if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
		// something far off the card (a screen-coordinate mix-up) is reported, not measured as size
		bottom = Math.max(bottom, y2); right = Math.max(right, x2); top = Math.min(top, y1); left = Math.min(left, x1);
		if (y2 > CARD_H + SLACK) below.set(what, Math.max(below.get(what) || 0, y2));
		if (x2 > maxX + SLACK) beyond.set(what, Math.max(beyond.get(what) || 0, x2));
		if (y1 < -SLACK || x1 < -SLACK) above.set(what, Math.min(above.get(what) || 0, Math.min(x1, y1)));
	}
	const issues = [];
	if (H && H > CARD_H) issues.push(`SFX.Begin asks for H = ${H}, but the card is only ${CARD_H} px tall: leave H out (or ${CARD_H} or less) and fit the layout into it.`);
	const list = m => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w, v]) => `${w} (to ${Math.round(v)})`).join(', ');
	if (below.size) issues.push(`Drawn below the card's bottom edge (y = ${CARD_H}), so REAPER cuts it off; the lowest part reaches y = ${Math.round(bottom)}: ${list(below)}.`);
	if (beyond.size) issues.push(`Drawn past the card's right edge (x = W + 8 = ${maxX}), so it is cut off; the rightmost part reaches x = ${Math.round(right)}: ${list(beyond)}. Make W wide enough or move it in.`);
	if (above.size) issues.push(`Drawn above or left of the content area (y or x below 0): ${list(above)}.`);
	return { ok: issues.length === 0, issues, H, W, bottom, right };
}

module.exports = { checkBounds, CARD_H };
