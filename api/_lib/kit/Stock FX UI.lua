-- @noindex
--- Shared look for the REAPER stock FX plugin scripts (ReaComp, ReaEQ, ReaDelay, ...).
--- A plain "stock plugin" layout: one display panel, a tidy grid of arc knobs, small pills and
--- Wet/Dry faders on the right, all in one accent colour per FX family.
--- Every knob and fader is an invisible FX Devices AddKnob / AddSlider on top of the drawing, so
--- modulation, linking, morphing and right-click menus work as on any other device.
---
--- Usage from a plugin script:
---   local SFX = require('src.Functions.Stock FX UI')
---   local D = SFX.Begin({ Key = 'ReaComp', Title = 'ReaComp', W = 452, Accent = SFX.ACCENT.Dynamics,
---                         Params = { thr = { 'Threshold', 0 }, ... } })
---   if not D then return end       -- collapsed / no FX
---   D:Knob('thr', x, y, 'L', 'THRESHOLD')
---   D:End()
--- Coordinates passed to the D: methods are relative to the top-left of the content area.

local SFX = {}
local JU = require('src.Functions.JSFX Update')
SFX.JU = JU

SFX.H = 216
--- kit version. 2 added the hardware parts (Faceplate, Inset, Screw, Dial, Switch, Lamp, Push, VU, Readout,
--- Engrave, Level): FX Devices sends it with Auto Layout creator requests, and the site only writes layouts
--- that use them for an FX Devices that has them.
SFX.KIT = 2

SFX.ACCENT = {
    Dynamics = 0xF2B04Cff, -- amber
    EQ       = 0x4FC3F7ff, -- sky
    Time     = 0xA78BFAff, -- violet
    Pitch    = 0x5FE0B8ff, -- mint
    Synth    = 0xF472B6ff, -- pink
    Utility  = 0x9BA1ABff,
}

-- band / tap colours (ReaEQ bands, ReaDelay taps, ReaXcomp bands)
SFX.BAND_CLR = { 0xF2B04Cff, 0x7ED957ff, 0x4FC3F7ff, 0xA78BFAff, 0xF472B6ff, 0xFF8A65ff, 0x5FE0B8ff, 0xE6D35Cff }

SFX.C = {
    Body      = 0x1A1C20ff,
    Panel     = 0x121317ff,
    PanelEdge = 0xFFFFFF10,
    Grid      = 0xFFFFFF0A,
    GridHi    = 0xFFFFFF16,
    Track     = 0xFFFFFF12,
    KnobShade = 0x00000059,
    Knob      = 0x2B2E35ff,
    KnobHi    = 0x353943ff,
    KnobRim   = 0xFFFFFF14,
    Pointer   = 0xF2F4F7ff,
    Text      = 0xE6E8EBff,
    TextDim   = 0x9BA1ABff,
    TextMute  = 0x6A707Aff,
    Chip      = 0xFFFFFF08,
    ChipHi    = 0xFFFFFF10,
    ChipEdge  = 0xFFFFFF14,
    Handle    = 0xDDE0E5ff,
}
local C = SFX.C

local ANG0, ANG1 = math.pi * 0.75, math.pi * 2.25
local floor, max, min = math.floor, math.max, math.min

local function A(clr, a) return (clr & 0xFFFFFF00) | (floor(max(0, min(1, a)) * 255 + 0.5)) end
SFX.A = A
local function Clamp(v, lo, hi) return v < lo and lo or (v > hi and hi or v) end
SFX.Clamp = Clamp
--- mix two colours (t = 0: c1, 1: c2), alpha mixed too
local function Mix(c1, c2, t)
    t = Clamp(t, 0, 1)
    local o = 0
    for sh = 0, 24, 8 do
        local a, b = (c1 >> sh) & 0xFF, (c2 >> sh) & 0xFF
        o = o | (floor(a + (b - a) * t + 0.5) << sh)
    end
    return o
end
SFX.Mix = Mix
--- lighter (f > 0, towards white) or darker (f < 0, towards black), alpha kept
local function Shade(clr, f)
    local tgt = f >= 0 and 0xFFFFFF00 or 0
    return (Mix(clr & 0xFFFFFF00, tgt, math.abs(f)) & 0xFFFFFF00) | (clr & 0xFF)
end
SFX.Shade = Shade

local function Font(sz, bold)
    if bold then return _G['Font_SemiBold_' .. sz] or _G['Font_Andale_Mono_' .. sz] end
    return _G['Font_Andale_Mono_' .. sz]
end

function SFX.TextW(txt, sz, bold)
    local f = Font(sz, bold)
    if f then im.PushFont(ctx, f) end
    local w = im.CalcTextSize(ctx, txt)
    if f then im.PopFont(ctx) end
    return w
end

local Dev = {}
Dev.__index = Dev

---------------------------------------------------------------------------
-- setup
---------------------------------------------------------------------------

-- param name -> index, built from the plugin's own names (falls back to the index in the spec)
local function BuildParamMap(D, spec)
    local fx, n = D.fx, r.TrackFX_GetNumParams(LT_Track, D.FX_Idx)
    if fx.SFX_Map and fx.SFX_MapIdx == D.FX_Idx and fx.SFX_NumParams == n then return fx.SFX_Map end
    local byName, names = {}, {}
    for p = 0, n - 1 do
        local _, nm = r.TrackFX_GetParamName(LT_Track, D.FX_Idx, p)
        nm = nm or ''
        names[p] = nm
        local k = nm:lower()
        if byName[k] == nil then byName[k] = p end
    end
    local map = {}
    for key, list in pairs(spec.Params or {}) do
        for _, nm in ipairs(list) do
            if type(nm) == 'string' and byName[nm:lower()] then map[key] = byName[nm:lower()]; break end
        end
        if map[key] == nil and type(list.idx) == 'number' and list.idx < n then map[key] = list.idx end
    end
    fx.SFX_Map, fx.SFX_MapIdx, fx.SFX_NumParams, fx.SFX_Names = map, D.FX_Idx, n, names
    -- register every plugin param as an FX Devices param (Fx_P = index + 1) so modulation,
    -- linking and morphing find them; again whenever the param count changes (ReaEQ bands, taps).
    -- spec.RegisterMapped: only up to the last param the layout uses (Kontakt has 4000+). FX[FxGUID]
    -- must stay a list without holes (code walks it with #), so every param below that is registered too.
    if fx.SFX_Registered ~= n then
        local last = n - 1
        if spec.RegisterMapped then
            last = -1
            for _, p in pairs(map) do last = max(last, p) end
        end
        for p = 0, last do
            StoreNewParam(D.FxGUID, names[p], p, D.FX_Idx, false, 'AddingFromExtState', p + 1, D.FX_Idx)
        end
        fx.SFX_Registered = n
    end
    return map
end

--- spec: Key, Title, W, Accent, Params = { key = { 'Name', 'Alt name', idx = 0 } }
function SFX.Begin(spec)
    local FX_Idx, FxGUID = PluginScript.FX_Idx, PluginScript.Guid
    local fx = FX[FxGUID]
    if not fx then return end
    local D = setmetatable({}, Dev)
    D.FX_Idx, D.FxGUID, D.fx = FX_Idx, FxGUID, fx
    D.W, D.H = spec.W, spec.H or SFX.H
    D.Acc = spec.Accent or SFX.ACCENT.Utility
    fx.CustomTitle = spec.Title
    fx.TitleWidth = spec.TitleWidth or 70
    fx.BgClr = C.Body
    fx.Dont_Allow_Add_Prm = true
    if not fx.Collapse and Animate_FX_Width ~= FxGUID then fx.Width = D.W + 38 end -- let the expand animation run
    fx.SFX = fx.SFX or { Hov = {}, Act = {}, Sel = 1, Choices = {} }
    D.S = fx.SFX
    D.P = BuildParamMap(D, spec)
    D.Names = fx.SFX_Names
    D.NumParams = fx.SFX_NumParams
    if fx.Collapse and Animate_FX_Width ~= FxGUID then return end -- keep drawing while the collapse animation runs
    D.DL = im.GetWindowDrawList(ctx)
    D.X, D.Y = im.GetCursorScreenPos(ctx)
    D.NOW = r.time_precise()
    return D
end

--- For a layout of one of FX Devices' own JSFX: P (key -> param index in the .jsfx file the layout
--- is written for) as the loaded instance has it, and whether the layout can't draw it (true: an
--- older copy of the JSFX runs and some of these params are missing or moved; nil: unknown, use the
--- layout's own check). remap = true for a layout that reaches its params only through P: it then
--- follows params that moved. An instance running an older copy gets the UPDATE button (Dev:End).
function SFX.Follow(D, P, remap) return JU.Follow(D, P, remap) end

function Dev:End()
    if self.Stale then
        JU.Button(self.DL, self.X + self.W - 4, self.Y + self.H - 20, self.JSInfo, self.FxGUID, self.fx.CustomTitle)
    end
    im.SetCursorScreenPos(ctx, self.X, self.Y)
    im.Dummy(ctx, self.W, self.H)
end

---------------------------------------------------------------------------
-- param access
---------------------------------------------------------------------------
function Dev:Idx(k) if type(k) == 'number' then return k end return self.P[k] end
function Dev:Get(k)
    local p = self:Idx(k)
    return p and r.TrackFX_GetParamNormalized(LT_Track, self.FX_Idx, p) or 0
end
function Dev:Set(k, v)
    local p = self:Idx(k)
    if p then r.TrackFX_SetParamNormalized(LT_Track, self.FX_Idx, p, Clamp(v, 0, 1)) end
end
function Dev:Fmt(k)
    local p = self:Idx(k)
    if not p then return '' end
    local _, s = r.TrackFX_GetFormattedParamValue(LT_Track, self.FX_Idx, p)
    return s or ''
end
function Dev:FmtN(k, v)
    local p = self:Idx(k)
    if not p then return '' end
    local ok, s = r.TrackFX_FormatParamValueNormalized(LT_Track, self.FX_Idx, p, v)
    return ok and s or ''
end
--- number shown by the plugin for this param (dB, ms, Hz ...); -inf as -math.huge
function SFX.Num(s)
    if not s then return end
    local low = s:lower()
    if low:find('inf') then return low:find('%-') and -math.huge or math.huge end
    local n = tonumber(s:match('[-+]?%d+%.?%d*'))
    if n and low:find('%d%s*k') then n = n * 1000 end
    return n
end
function Dev:Val(k) return SFX.Num(self:Fmt(k)) end
--- normalized value that makes the plugin show `target` (dB, Hz, ratio ...), by bisection on its own
--- formatting; works for any monotonic param whatever its internal curve
function Dev:NormFor(k, target)
    local p = self:Idx(k)
    if not p then return 0 end
    local Num = SFX.Num
    local lo, hi = 0, 1
    local up = (Num(self:FmtN(p, 1)) or 1) >= (Num(self:FmtN(p, 0)) or 0)
    for _ = 1, 24 do
        local m = (lo + hi) / 2
        local v = Num(self:FmtN(p, m)) or 0
        if (v < target) == up then lo = m else hi = m end
    end
    return (lo + hi) / 2
end
function Dev:On(k) return self:Idx(k) ~= nil and self:Get(k) >= 0.5 end
function Dev:Lit(k)
    local p = self:Idx(k)
    return p and (self.S.Hov[p] or self.S.Act[p])
end

--- Params that repeat per tap / shifter / band ("Feedback 2", "2: Feedback", "2-Threshold", "Tap 2 Feedback").
--- fields = { { key, 'substring of the lower-case base name' }, ... } (first match wins);
--- skip = { ['wet'] = true, ... } lower-case names to ignore. Returns a list of { n = 1, key = p, ... }
--- sorted by number; names without a number count as group 1. Cached per param count under cacheKey.
function Dev:Groups(cacheKey, fields, skip)
    local S = self.S
    S.Groups = S.Groups or {}
    local c = S.Groups[cacheKey]
    if c and c.n == self.NumParams then return c.list end
    local byN, list = {}, {}
    for p = 0, self.NumParams - 1 do
        local nm = self.Names[p] or ''
        if not (skip and skip[nm:lower()]) then
            local n, base = nm:match('^(%d+)%s*[:%-%.]%s*(.+)$')
            if not n then n, base = nm:match('^%a+%s+(%d+)%s*[:%-]%s*(.+)$') end
            if not n then n, base = nm:match('^[Tt]ap%s*(%d+)%s*(.+)$') end
            if not n then base, n = nm:match('^(.-)%s*%(?(%d+)%)?$') end
            if not n or base == '' then n, base = 1, nm end
            n = tonumber(n)
            base = base:lower()
            for _, f in ipairs(fields) do
                if base:find(f[2], 1, true) then
                    local g = byN[n]
                    if not g then g = { n = n }; byN[n] = g; list[#list + 1] = g end
                    if g[f[1]] == nil then g[f[1]] = p end
                    break
                end
            end
        end
    end
    table.sort(list, function(a, b) return a.n < b.n end)
    S.Groups[cacheKey] = { n = self.NumParams, list = list }
    return list
end

--- true when the param only has two values (on / off)
function Dev:IsToggle(k)
    local p = self:Idx(k)
    if not p then return false end
    return #self:Choices(p, 16) <= 2
end

---------------------------------------------------------------------------
-- drawing basics
---------------------------------------------------------------------------
function Dev:Text(x, y, clr, txt, sz, align, bold)
    sz = sz or 10
    local ax, ay = self.X + x, self.Y + y
    if align == 'c' then ax = ax - SFX.TextW(txt, sz, bold) / 2
    elseif align == 'r' then ax = ax - SFX.TextW(txt, sz, bold) end
    local f = Font(sz, bold)
    im.DrawList_AddTextEx(self.DL, f, sz, floor(ax + 0.5), floor(ay + 0.5), clr, txt)
end

function Dev:Rect(x, y, w, h, clr, rnd, fill, th)
    local x1, y1 = self.X + x, self.Y + y
    if fill == false then
        im.DrawList_AddRect(self.DL, x1, y1, x1 + w, y1 + h, clr, rnd or 0, nil, th or 1)
    else
        im.DrawList_AddRectFilled(self.DL, x1, y1, x1 + w, y1 + h, clr, rnd or 0)
    end
end

function Dev:Line(x1, y1, x2, y2, clr, th)
    im.DrawList_AddLine(self.DL, self.X + x1, self.Y + y1, self.X + x2, self.Y + y2, clr, th or 1)
end

function Dev:Dashed(x1, y1, x2, y2, clr, dash, gap)
    dash, gap = dash or 3, gap or 3
    local len = math.sqrt((x2 - x1) ^ 2 + (y2 - y1) ^ 2)
    if len < 1 then return end
    local dx, dy, t = (x2 - x1) / len, (y2 - y1) / len, 0
    while t < len do
        local e = min(t + dash, len)
        self:Line(x1 + dx * t, y1 + dy * t, x1 + dx * e, y1 + dy * e, clr, 1)
        t = e + gap
    end
end

local function Arc(DL, cx, cy, rad, a0, a1, clr, th)
    if a1 - a0 < 0.01 then return end
    im.DrawList_PathArcTo(DL, cx, cy, rad, a0, a1)
    im.DrawList_PathStroke(DL, clr, nil, th)
end

--- display panel; returns absolute L, T, R, B of its inside
function Dev:Panel(x, y, w, h)
    self:Rect(x, y, w, h, C.Panel, 6)
    self:Rect(x, y, w, h, C.PanelEdge, 6, false)
    return self.X + x, self.Y + y, self.X + x + w, self.Y + y + h
end

--- small caps heading with a hairline to its right, up to x + w
function Dev:Section(x, y, w, label)
    self:Text(x, y, C.TextMute, label, 9, nil, true)
    local tw = SFX.TextW(label, 9, true)
    if w and w > tw + 8 then self:Line(x + tw + 6, y + 5.5, x + w, y + 5.5, C.Grid, 1) end
end

-- invisible button in content coordinates
function Dev:Btn(id, x, y, w, h)
    im.SetCursorScreenPos(ctx, self.X + x, self.Y + y)
    local c = im.InvisibleButton(ctx, id .. '##' .. self.FxGUID, max(w, 1), max(h, 1))
    return c, im.IsItemHovered(ctx), im.IsItemActive(ctx)
end

---------------------------------------------------------------------------
-- FX Devices controls under the drawings
---------------------------------------------------------------------------
function Dev:PrmKnob(p, cx, cy, rad, label)
    local FP = self.fx[p + 1]
    if not FP or not FP.Num then return end
    FP.Style, FP.Lbl_Pos, FP.V_Pos, FP.Sldr_W, FP.CustomLbl = 'Invisible', 'None', 'None', rad, label
    FP.ValueShown = true -- the drawing shows the value: no value popup
    im.SetCursorScreenPos(ctx, self.X + cx - rad, self.Y + cy - rad)
    AddKnob(ctx, self.FxGUID, p + 1, self.FX_Idx)
    self.S.Hov[p] = im.IsItemHovered(ctx)
    self.S.Act[p] = im.IsItemActive(ctx)
end

function Dev:PrmSlider(p, x, y, w, h, label)
    local FP = self.fx[p + 1]
    if not FP or not FP.Num then return end
    FP.Type = 'V-Slider'
    FP.Invisible, FP.Lbl_Pos, FP.V_Pos, FP.Sldr_W, FP.Height, FP.CustomLbl = true, 'None', 'None', w, h, label
    FP.ValueShown = true -- the drawing shows the value: no value popup
    im.SetCursorScreenPos(ctx, self.X + x, self.Y + y)
    AddSlider(ctx, self.FxGUID, p + 1, self.FX_Idx)
    self.S.Hov[p] = im.IsItemHovered(ctx)
    self.S.Act[p] = im.IsItemActive(ctx)
end

---------------------------------------------------------------------------
-- widgets
---------------------------------------------------------------------------
SFX.KNOB = { L = 17, M = 14, S = 11 }

local function ShortVal(s, unit)
    s = s or ''
    s = s:gsub('^%s+', ''):gsub('%s+$', '')
    if unit and unit ~= '' and not s:find('%a') and s ~= '' then
        local n = tonumber(s)
        if unit == 'Hz' and n and n >= 1000 then return ('%.1f kHz'):format(n / 1000):gsub('%.0 ', ' ') end
        s = s .. ' ' .. unit
    end
    return s
end
SFX.ShortVal = ShortVal

--- Arc knob: label above, value below. size 'L' | 'M' | 'S' or a radius.
--- o: { unit = 'dB', bipolar = true, accent = clr, value = 'text', dim = true }
function Dev:Knob(k, cx, cy, size, label, o)
    o = o or {}
    local p = self:Idx(k)
    local rad = type(size) == 'number' and size or SFX.KNOB[size or 'M']
    local DL, X, Y = self.DL, self.X + cx, self.Y + cy
    local v = p and self:Get(p) or 0
    if p and o.units then v = Clamp(o.units.pos(o.units.get()), 0, 1) end
    local lit, act = self:Lit(p), p and self.S.Act[p]
    local acc = o.accent or self.Acc
    if o.dim or not p then acc = A(acc, 0.35) end
    local arcR, th = rad + 3.5, rad >= 15 and 2.6 or 2.2
    -- track + value arc
    Arc(DL, X, Y, arcR, ANG0, ANG1, C.Track, th)
    if p then
        local a = ANG0 + (ANG1 - ANG0) * v
        if o.bipolar then
            local mid = (ANG0 + ANG1) / 2
            if a > mid then Arc(DL, X, Y, arcR, mid, a, acc, th) else Arc(DL, X, Y, arcR, a, mid, acc, th) end
        else
            Arc(DL, X, Y, arcR, ANG0, a, acc, th)
        end
    end
    -- body
    im.DrawList_AddCircleFilled(DL, X, Y + 1.5, rad + 0.5, C.KnobShade)
    im.DrawList_AddCircleFilled(DL, X, Y, rad, lit and C.KnobHi or C.Knob)
    im.DrawList_AddCircle(DL, X, Y, rad - 0.5, C.KnobRim, 0, 1)
    -- pointer
    if p then
        local a = ANG0 + (ANG1 - ANG0) * v
        local c, s = math.cos(a), math.sin(a)
        im.DrawList_AddLine(DL, X + c * rad * 0.3, Y + s * rad * 0.3, X + c * (rad - 3), Y + s * (rad - 3),
            o.dim and C.TextDim or C.Pointer, rad >= 15 and 2.2 or 1.8)
    end
    -- label + value
    local lsz = rad >= 15 and 9 or 8
    if label then self:Text(cx, cy - arcR - lsz - 4, lit and C.TextDim or C.TextMute, label, lsz, 'c', true) end
    local val = o.value or (p and ShortVal(self:Fmt(p), o.unit)) or '-'
    self:Text(cx, cy + arcR + 3, act and C.Text or (lit and C.Text or C.TextDim), val, rad >= 15 and 10 or 9, 'c')
    if p then
        self:PrmKnob(p, cx, cy, rad + 3, label)
        if o.units then self:UnitsDrag(p, o.units) end
    end
end

--- Drag in the plugin's display units instead of the raw normalized value (params whose internal
--- curve is far from what the knob should feel like, e.g. ReaComp's amplitude-linear threshold).
--- Runs after AddKnob and overrides the value it set this frame.
--- u = { get = fn() -> display value, step = fn(start, dyPixelsUp) -> target, pos = fn(display) -> 0..1 }
function Dev:UnitsDrag(p, u)
    local S = self.S
    local _, my = im.GetMousePos(ctx)
    if S.Act[p] then
        if not S.UD or S.UD.p ~= p then S.UD = { p = p, start = u.get(), my = my } end
        local dy = S.UD.my - my
        if dy ~= 0 then self:Set(p, self:NormFor(p, u.step(S.UD.start, dy))) end
    elseif S.UD and S.UD.p == p then
        S.UD = nil
    end
end

--- Vertical fader: value above the slot, label below. x is the centre; y/h the slot.
function Dev:Fader(k, cx, y, h, label, o)
    o = o or {}
    local p = self:Idx(k)
    local v = p and self:Get(p) or 0
    local lit, act = self:Lit(p), p and self.S.Act[p]
    local acc = o.accent or self.Acc
    local X, T = self.X + cx, self.Y + y
    local B = T + h
    local DL = self.DL
    im.DrawList_AddRectFilled(DL, X - 2, T, X + 2, B, 0x0B0C0Eff, 2)
    local hy = B - (h - 8) * v - 4
    if o.bipolar then
        local my = T + h / 2
        im.DrawList_AddRectFilled(DL, X - 2, math.min(hy, my), X + 2, math.max(hy, my), A(acc, lit and 0.95 or 0.8), 2)
        im.DrawList_AddLine(DL, X - 7, my, X + 7, my, C.TextMute, 1)
    else
        im.DrawList_AddRectFilled(DL, X - 2, hy, X + 2, B, A(acc, lit and 0.95 or 0.8), 2)
    end
    -- unity tick
    if o.unity then
        local uy = B - (h - 8) * o.unity - 4
        im.DrawList_AddLine(DL, X - 7, uy, X - 4, uy, C.TextMute, 1)
        im.DrawList_AddLine(DL, X + 4, uy, X + 7, uy, C.TextMute, 1)
    end
    -- handle
    im.DrawList_AddRectFilled(DL, X - 8, hy - 3 + 1, X + 8, hy + 4 + 1, C.KnobShade, 3)
    im.DrawList_AddRectFilled(DL, X - 8, hy - 3.5, X + 8, hy + 3.5, (lit or act) and 0xFFFFFFff or C.Handle, 3)
    im.DrawList_AddLine(DL, X - 4, hy, X + 4, hy, 0x1A1C20ff, 1)
    if label then self:Text(cx, y + h + 5, lit and C.TextDim or C.TextMute, label, 8, 'c', true) end
    local val = o.value or (p and ShortVal(self:Fmt(p), o.unit)) or ''
    self:Text(cx, y - 13, act and C.Text or C.TextDim, val, 9, 'c')
    if p then self:PrmSlider(p, cx - 9, y, 18, h, label) end
end

--- Slim horizontal bar: label on the left, value on the right, fill along the bottom. A compact
--- stand-in for a knob on secondary params. Underneath is an invisible horizontal FX Devices slider,
--- so modulation and right-click menus still work. o: { unit = 'ms', dim = true, accent = clr }
function Dev:Bar(k, x, y, w, h, label, o)
    o = o or {}
    local p = self:Idx(k)
    local v = p and self:Get(p) or 0
    local lit, act = self:Lit(p), p and self.S.Act[p]
    local acc = o.accent or self.Acc
    if o.dim or not p then acc = A(acc, 0.35) end
    self:Rect(x, y, w, h, lit and C.ChipHi or C.Chip, 4)
    self:Rect(x, y, w, h, act and A(acc, 0.6) or C.ChipEdge, 4, false)
    if p and v > 0.001 then
        local fw = max((w - 2) * v, 3)
        self:Rect(x + 1, y + 1, fw, h - 2, A(acc, lit and 0.2 or 0.13), 3)
        self:Rect(x + 1 + fw - 1.5, y + 3, 1.5, h - 6, A(acc, lit and 1 or 0.8))
    end
    local ty = y + (h - 9) / 2 - 1
    self:Text(x + 6, ty + 0.5, lit and C.TextDim or C.TextMute, label, 8, nil, true)
    local val = o.value or (p and ShortVal(self:Fmt(p), o.unit)) or '-'
    self:Text(x + w - 6, ty, (act or lit) and C.Text or (o.dim and C.TextMute or C.TextDim), val, 9, 'r')
    if not p then return end
    local FP = self.fx[p + 1]
    if not FP or not FP.Num then return end
    FP.Type, FP.Invisible, FP.Lbl_Pos, FP.V_Pos, FP.Sldr_W, FP.CustomLbl = 'Slider', true, 'None', 'None', w, label
    FP.ValueShown = true -- the drawing shows the value: no value popup
    FP.Height = max(0, (h - im.GetTextLineHeight(ctx)) / 2)
    im.SetCursorScreenPos(ctx, self.X + x, self.Y + y)
    AddSlider(ctx, self.FxGUID, p + 1, self.FX_Idx)
    self.S.Hov[p] = im.IsItemHovered(ctx)
    self.S.Act[p] = im.IsItemActive(ctx)
end

--- Pill toggle with an LED dot. Clicking flips the param (or calls o.onClick).
function Dev:Toggle(k, x, y, w, label, o)
    o = o or {}
    local p = self:Idx(k)
    local on = o.on
    if on == nil then on = p and self:Get(p) >= 0.5 end
    local h = o.h or 17
    local clicked, hov = self:Btn('tgl' .. label .. (p or ''), x, y, w, h)
    local acc = o.accent or self.Acc
    self:Rect(x, y, w, h, on and A(acc, 0.16) or (hov and C.ChipHi or C.Chip), h / 2)
    self:Rect(x, y, w, h, on and A(acc, 0.7) or C.ChipEdge, h / 2, false)
    local DL = self.DL
    im.DrawList_AddCircleFilled(DL, self.X + x + 8.5, self.Y + y + h / 2, 2.6, on and acc or 0x4C515Bff)
    if on then im.DrawList_AddCircle(DL, self.X + x + 8.5, self.Y + y + h / 2, 4.5, A(acc, 0.3), 0, 1.5) end
    self:Text(x + 16, y + (h - 9) / 2 - 0.5, on and (o.textOn or C.Text) or (hov and C.Text or C.TextDim), label, 9, nil, true)
    if clicked and p and not o.onClick then self:Set(p, on and 0 or 1) end
    if clicked and o.onClick then o.onClick() end
    if hov and o.tip then im.SetTooltip(ctx, o.tip) end
    return clicked
end

--- discrete values of a param: { {label, norm}, ... } sampled from the plugin's own formatting
function Dev:Choices(k, n)
    local p = self:Idx(k)
    if not p then return {} end
    local cache = self.S.Choices
    if cache[p] then return cache[p] end
    local out, seen, steps = {}, {}, n or 128
    for i = 0, steps do
        local v = i / steps
        local s = self:FmtN(p, v)
        if s ~= '' and not seen[s] then
            seen[s] = true
            out[#out + 1] = { s, v }
        end
    end
    cache[p] = out
    return out
end

--- Drop-down chip: shows the current value, click opens the list of the param's values.
--- o.items = { {label, norm} } overrides the sampled list; o.label = small caps label inside on the left
function Dev:Choice(k, x, y, w, o)
    o = o or {}
    local p = self:Idx(k)
    local h = o.h or 18
    local id = 'chs' .. (p or o.id or '')
    local clicked, hov = self:Btn(id, x, y, w, h)
    self:Rect(x, y, w, h, hov and C.ChipHi or C.Chip, 4)
    self:Rect(x, y, w, h, C.ChipEdge, 4, false)
    local tx = x + 7
    if o.label then
        self:Text(tx, y + (h - 8) / 2 - 0.5, C.TextMute, o.label, 8, nil, true)
        tx = tx + SFX.TextW(o.label, 8, true) + 6
    end
    local cur = o.value or (p and self:Fmt(p)) or ''
    self:Text(tx, y + (h - 10) / 2 - 1, C.Text, cur, 10)
    -- chevron
    local cx, cy = self.X + x + w - 9, self.Y + y + h / 2
    im.DrawList_AddTriangleFilled(self.DL, cx - 3, cy - 1.5, cx + 3, cy - 1.5, cx, cy + 2, C.TextDim)
    local pop = 'SFXPopup' .. id .. self.FxGUID
    if clicked then im.OpenPopup(ctx, pop) end
    local chosen
    if im.BeginPopup(ctx, pop) then
        for _, it in ipairs(o.items or self:Choices(p)) do
            if im.Selectable(ctx, it[1], it[1] == cur) then chosen = it end
        end
        im.EndPopup(ctx)
    end
    if chosen then
        if o.onPick then o.onPick(chosen) elseif p then self:Set(p, chosen[2]) end
    end
end

--- Tab chips in a row; returns the new selected index. items = { {label, clr, dim}, ... }
function Dev:Tabs(id, x, y, items, sel, o)
    o = o or {}
    local h, gap = o.h or 18, 4
    local cx = x
    for i, it in ipairs(items) do
        local w = o.w or (SFX.TextW(it[1], 9, true) + (it[2] and 22 or 14))
        local clicked, hov = self:Btn(id .. i, cx, y, w, h)
        local on = i == sel
        self:Rect(cx, y, w, h, on and 0xFFFFFF1A or (hov and C.ChipHi or C.Chip), 4)
        if on then self:Rect(cx, y, w, h, 0xFFFFFF30, 4, false) end
        local tx = cx + w / 2
        if it[2] then
            im.DrawList_AddCircleFilled(self.DL, self.X + cx + 8, self.Y + y + h / 2, 3, it[3] and A(it[2], 0.3) or it[2])
            tx = tx + 4
        end
        self:Text(tx, y + (h - 9) / 2 - 0.5, on and C.Text or (it[3] and C.TextMute or C.TextDim), it[1], 9, 'c', true)
        if clicked then sel = i end
        if o.onRight and hov and im.IsMouseClicked(ctx, 1) then o.onRight(i) end
        cx = cx + w + gap
    end
    return sel, cx
end

--- Vertical meter (0..1 from the bottom, or from the top with o.fromTop), with peak-hold
function Dev:Meter(x, y, w, h, v, clr, o)
    o = o or {}
    v = Clamp(v or 0, 0, 1)
    self:Rect(x, y, w, h, 0x0B0C0Eff, 2)
    if v > 0.001 then
        if o.fromTop then self:Rect(x, y, w, h * v, clr, 2)
        else self:Rect(x, y + h * (1 - v), w, h * v, clr, 2) end
    end
    if o.label then self:Text(x + w / 2, y + h + 5, C.TextMute, o.label, 8, 'c', true) end
end

--- the track's input before any FX (FXD Macros measures it, and is added to a track without it): n
--- peaks (linear, 1 = 0 dB), oldest first, and how many per second; nil while there's none yet
function Dev:InputWave(n)
    if not (CLAPMacros and CLAPMacros.Input_Wave and LT_Track) then return end
    return CLAPMacros.Input_Wave(LT_Track, n)
end

--- simple peak hold with fall-off (per key), for meters
function Dev:Hold(key, v, rate)
    self.S.HoldV = self.S.HoldV or {}
    local prev = self.S.HoldV[key] or 0
    if v >= prev then prev = v else prev = max(v, prev - (rate or 0.02)) end
    self.S.HoldV[key] = prev
    return prev
end

---------------------------------------------------------------------------
-- hardware parts (kit 2): front panels, screws, knobs with printed scales, needle meters, bat and
-- paddle switches, lamps, push buttons, LED readouts, so a layout can look like the gear (or the
-- plugin that copies it) instead of a flat modern card. Same coordinates as the rest of the kit.
---------------------------------------------------------------------------
local pi, cos, sin, rad = math.pi, math.cos, math.sin, math.rad

local function TextAt(self, x, y, clr, txt, sz, bold)
    im.DrawList_AddTextEx(self.DL, Font(sz, bold), sz, floor(x + 0.5), floor(y + 0.5), clr, txt)
end
-- text centred on absolute x
local function TextC(self, x, y, clr, txt, sz, bold)
    TextAt(self, x - SFX.TextW(txt, sz, bold) / 2, y, clr, txt, sz, bold)
end
local function Lum(clr)
    return (((clr >> 24) & 0xFF) * 0.3 + ((clr >> 16) & 0xFF) * 0.59 + ((clr >> 8) & 0xFF) * 0.11) / 255
end
-- a vertical gradient rectangle
local function VGrad(DL, x1, y1, x2, y2, top, bot)
    im.DrawList_AddRectFilledMultiColor(DL, x1, y1, x2, y2, top, top, bot, bot)
end

--- silkscreened text: D:Text with a faint emboss. o = { clr, size (8..16), align 'c' | 'r', bold, shadow = false }
function Dev:Engrave(x, y, txt, o)
    o = o or {}
    local sz, clr = o.size or 9, o.clr or 0xE8E8E8ff
    txt = tostring(txt or '')
    if o.shadow ~= false then
        local sh = Lum(clr) > 0.5 and 0x00000059 or 0xFFFFFF33
        self:Text(x, y + 1, sh, txt, sz, o.align, o.bold)
    end
    self:Text(x, y, clr, txt, sz, o.align, o.bold)
end

--- a screw head; cx, cy its centre, r its radius. o = { kind = 'phillips' | 'slot' | 'hex', clr, angle (degrees) }
function Dev:Screw(cx, cy, r, o)
    o = o or {}
    r = r or 4
    local DL, X, Y = self.DL, self.X + cx, self.Y + cy
    local m = o.clr or 0xB4B8BFff
    im.DrawList_AddCircleFilled(DL, X + 0.6, Y + 1, r + 0.8, 0x00000066)
    im.DrawList_AddCircleFilled(DL, X, Y, r, Shade(m, -0.25))
    im.DrawList_AddCircleFilled(DL, X - r * 0.12, Y - r * 0.12, r * 0.84, m)
    im.DrawList_AddCircleFilled(DL, X - r * 0.3, Y - r * 0.32, r * 0.42, A(Shade(m, 0.5), 0.55))
    local kind = o.kind or 'phillips'
    local a = rad(o.angle or 35)
    local c, s, l = cos(a), sin(a), r * 0.72
    local slot = Shade(m, -0.6)
    if kind == 'hex' then
        im.DrawList_AddNgonFilled(DL, X, Y, r * 0.5, slot, 6)
    else
        im.DrawList_AddLine(DL, X - c * l, Y - s * l, X + c * l, Y + s * l, slot, math.max(1, r * 0.28))
        if kind == 'phillips' then
            im.DrawList_AddLine(DL, X + s * l, Y - c * l, X - s * l, Y + c * l, slot, math.max(1, r * 0.28))
        end
    end
end

--- a hardware front panel. o = { clr (panel colour), finish = 'matte' | 'brushed' | 'gloss' | 'black',
--- ears = true (rack ears with mounting slots on both sides), earW = 14, screws = true (a screw in each corner
--- of the face), rnd = 3, edge = false (no bevel) }. Returns x, y, w, h of the face (inside the ears).
function Dev:Faceplate(x, y, w, h, o)
    o = o or {}
    local DL = self.DL
    local clr = o.clr or 0x3E4A7Cff
    if o.finish == 'black' and not o.clr then clr = 0x1C1D20ff end
    local rnd = o.rnd or 3
    local X1, Y1 = self.X + x, self.Y + y
    local X2, Y2 = X1 + w, Y1 + h
    im.DrawList_AddRectFilled(DL, X1, Y1, X2, Y2, clr, rnd)
    local hi, lo = Shade(clr, 0.07), Shade(clr, -0.12)
    VGrad(DL, X1 + 1, Y1 + 1, X2 - 1, Y2 - 1, hi, lo)
    local finish = o.finish or 'matte'
    if finish == 'brushed' then
        local k = 0
        for yy = Y1 + 2, Y2 - 2, 1.5 do
            k = k + 1
            local a = (k * 7919) % 5
            im.DrawList_AddLine(DL, X1 + 1, yy, X2 - 1, yy, a < 2 and 0xFFFFFF0C or 0x00000010, 1)
        end
    elseif finish == 'gloss' then
        VGrad(DL, X1 + 1, Y1 + 1, X2 - 1, Y1 + h * 0.45, 0xFFFFFF1C, 0xFFFFFF00)
    end
    local fx, fw = x, w
    if o.ears then
        local ew = o.earW or 14
        fx, fw = x + ew, w - ew * 2
        for side = 0, 1 do
            local ex = side == 0 and X1 or X2 - ew
            im.DrawList_AddLine(DL, side == 0 and ex + ew or ex, Y1 + 2, side == 0 and ex + ew or ex, Y2 - 2, 0x00000040, 1)
            im.DrawList_AddLine(DL, (side == 0 and ex + ew or ex) + 1, Y1 + 2, (side == 0 and ex + ew or ex) + 1, Y2 - 2, 0xFFFFFF14, 1)
            local sw, sh = ew * 0.62, math.min(10, h * 0.07)
            for _, sy in ipairs({ Y1 + h * 0.1, Y2 - h * 0.1 - sh }) do
                local sx = ex + (ew - sw) / 2
                im.DrawList_AddRectFilled(DL, sx, sy, sx + sw, sy + sh, 0x0000009A, sh / 2)
                im.DrawList_AddRectFilled(DL, sx + 1, sy + sh * 0.55, sx + sw - 1, sy + sh, 0xD8C6A033, sh / 2)
                im.DrawList_AddRect(DL, sx, sy, sx + sw, sy + sh, 0xFFFFFF22, sh / 2, nil, 1)
            end
        end
    end
    if o.edge ~= false then
        im.DrawList_AddLine(DL, X1 + rnd, Y1 + 0.5, X2 - rnd, Y1 + 0.5, A(Shade(clr, 0.45), 0.8), 1)
        im.DrawList_AddLine(DL, X1 + 0.5, Y1 + rnd, X1 + 0.5, Y2 - rnd, A(Shade(clr, 0.3), 0.6), 1)
        im.DrawList_AddLine(DL, X1 + rnd, Y2 - 0.5, X2 - rnd, Y2 - 0.5, 0x00000080, 1)
        im.DrawList_AddLine(DL, X2 - 0.5, Y1 + rnd, X2 - 0.5, Y2 - rnd, 0x00000066, 1)
    end
    if o.screws then
        local sr = o.screwR or math.max(2.5, math.min(4.5, h * 0.03))
        local m = sr + 3
        for _, p in ipairs({ { fx + m, y + m }, { fx + fw - m, y + m }, { fx + m, y + h - m }, { fx + fw - m, y + h - m } }) do
            self:Screw(p[1], p[2], sr, { angle = (p[1] * 13 + p[2] * 7) % 180 })
        end
    end
    return fx, y, fw, h
end

--- a section of a panel. o = { style = 'line' (engraved outline) | 'sunken' | 'raised' | 'plate', clr = its fill,
--- line = outline colour, rnd = 3, label = 'COMPRESS L', labelAt = 'bottom' | 'top' | 'tab', labelClr, labelSize = 8, bold = true }
function Dev:Inset(x, y, w, h, o)
    o = o or {}
    local DL = self.DL
    local X1, Y1 = self.X + x, self.Y + y
    local X2, Y2 = X1 + w, Y1 + h
    local rnd = o.rnd or 3
    local style = o.style or 'line'
    local line = o.line or 0xFFFFFF40
    if o.clr then
        if style == 'raised' or style == 'plate' then
            im.DrawList_AddRectFilled(DL, X1 + 1, Y1 + 2, X2 + 1, Y2 + 2, 0x00000055, rnd)
        end
        im.DrawList_AddRectFilled(DL, X1, Y1, X2, Y2, o.clr, rnd)
        if style == 'plate' then VGrad(DL, X1, Y1, X2, Y1 + h * 0.5, 0xFFFFFF14, 0xFFFFFF00) end
    end
    if style == 'sunken' then
        im.DrawList_AddRectFilled(DL, X1, Y1, X2, Y2, 0x00000038, rnd)
        im.DrawList_AddLine(DL, X1 + rnd, Y1 + 0.5, X2 - rnd, Y1 + 0.5, 0x00000080, 1)
        im.DrawList_AddLine(DL, X1 + 0.5, Y1 + rnd, X1 + 0.5, Y2 - rnd, 0x00000060, 1)
        im.DrawList_AddLine(DL, X1 + rnd, Y2 - 0.5, X2 - rnd, Y2 - 0.5, 0xFFFFFF26, 1)
        im.DrawList_AddLine(DL, X2 - 0.5, Y1 + rnd, X2 - 0.5, Y2 - rnd, 0xFFFFFF1A, 1)
    elseif style == 'raised' or style == 'plate' then
        im.DrawList_AddLine(DL, X1 + rnd, Y1 + 0.5, X2 - rnd, Y1 + 0.5, 0xFFFFFF33, 1)
        im.DrawList_AddRect(DL, X1, Y1, X2, Y2, 0x00000050, rnd, nil, 1)
    else
        im.DrawList_AddRect(DL, X1 + 0.5, Y1 + 1, X2 + 0.5, Y2 + 1, 0x00000045, rnd, nil, 1)
        im.DrawList_AddRect(DL, X1, Y1, X2, Y2, line, rnd, nil, 1)
    end
    if o.label then
        local sz = o.labelSize or 8
        local lc = o.labelClr or 0xE8E8E8ff
        local at = o.labelAt or 'bottom'
        local ly = at == 'top' and y + 3 or (at == 'tab' and y - sz / 2 - 1 or y + h - sz - 3)
        if at == 'tab' then
            local tw = SFX.TextW(o.label, sz, o.bold ~= false) + 8
            im.DrawList_AddRectFilled(DL, X1 + w / 2 - tw / 2, Y1 - 1, X1 + w / 2 + tw / 2, Y1 + 1, o.tabBg or 0x00000000, 0)
        end
        self:Engrave(x + w / 2, ly, o.label, { clr = lc, size = sz, align = 'c', bold = o.bold ~= false })
    end
end

-- start and end angle (radians, screen: 0 = right, clockwise) for a sweep in degrees, centred on top
local function Sweep(deg)
    deg = deg or 300
    local a0 = rad(90 + (360 - deg) / 2)
    return a0, a0 + rad(deg)
end

-- scale entries -> { {pos 0..1, text}, ... }
local function ScaleList(scale)
    local out = {}
    if type(scale) ~= 'table' then return out end
    local n = #scale
    for i, e in ipairs(scale) do
        if type(e) == 'table' then out[#out + 1] = { tonumber(e[1]) or 0, tostring(e[2] or '') }
        else out[#out + 1] = { n > 1 and (i - 1) / (n - 1) or 0.5, tostring(e) } end
    end
    return out
end

-- how far the printed parts of a dial reach past its body
local function DialOuter(r, o)
    local ticks = o.ticks
    if ticks == nil and o.scale then ticks = #o.scale end
    local out = r + 2
    if ticks and ticks > 0 then out = r + 2 + (o.tickLen or 3) end
    if o.scale and #o.scale > 0 then out = out + 1.5 + (o.scaleSize or 7) end
    return out
end

--- a hardware knob with a printed scale. Underneath it is a real FX Devices knob (modulation, linking,
--- right-click menus work). cx, cy centre, r body radius (6..30).
--- o = { style = 'cap' (coloured cap on a knurled metal skirt) | 'skirt' (black knob on a silver skirt) |
---       'chicken' (chicken-head pointer) | 'bakelite' (glossy black) | 'metal' (machined aluminium) |
---       'flat' (plain coloured disc) | 'davies' (ribbed black, small dot),
---   cap, body, line (pointer colour), scale = { '-40', '-30', ... } spread evenly over the sweep, or
---   { {0, '-40'}, {0.62, '0'}, {1, '+6'} } at normalized positions, ticks = number of tick marks (default:
---   one per scale entry), minor = ticks between two marks, tickClr, scaleClr, scaleSize = 7, dots = true
---   (dots instead of tick lines), sweep = 300 (degrees), label = 'threshold' (printed above), labelClr,
---   labelSize = 8, labelBold, value = 'hover' (the param's value shows under the knob while hovered or
---   dragged; true = always; false = never), bipolar, unit, arc = clr (a lit value arc, for modern gear) }
function Dev:Dial(k, cx, cy, r, o)
    o = o or {}
    r = r or 14
    local p = self:Idx(k)
    local DL, X, Y = self.DL, self.X + cx, self.Y + cy
    local v = p and self:Get(p) or 0
    local lit, act = self:Lit(p), p and self.S.Act[p]
    local a0, a1 = Sweep(o.sweep)
    local av = a0 + (a1 - a0) * v
    local tc = o.tickClr or o.scaleClr or 0xE6E6E6D0
    local sc = o.scaleClr or tc
    local ssz = o.scaleSize or 7
    -- ticks + scale
    local ticks = o.ticks
    if ticks == nil and o.scale then ticks = #o.scale end
    local tl = o.tickLen or 3
    local r1, r2 = r + 2, r + 2 + tl
    if ticks and ticks > 1 then
        local minor = o.minor or 0
        local total = (ticks - 1) * (minor + 1)
        for i = 0, total do
            local a = a0 + (a1 - a0) * i / total
            local major = i % (minor + 1) == 0
            local c, s = cos(a), sin(a)
            if o.dots then
                im.DrawList_AddCircleFilled(DL, X + c * (r1 + tl / 2), Y + s * (r1 + tl / 2), major and 1.3 or 0.8, tc)
            else
                local e = major and r2 or (r1 + tl * 0.55)
                im.DrawList_AddLine(DL, X + c * r1, Y + s * r1, X + c * e, Y + s * e, major and tc or A(tc, 0.6), 1)
            end
        end
    end
    if o.arc and p then
        local ar = r + 2 + tl * 0.5
        if o.bipolar then
            local mid = (a0 + a1) / 2
            im.DrawList_PathArcTo(DL, X, Y, ar, math.min(mid, av), math.max(mid, av))
        else
            im.DrawList_PathArcTo(DL, X, Y, ar, a0, av)
        end
        im.DrawList_PathStroke(DL, o.arc, nil, 2)
    end
    if o.scale then
        local sr = (ticks and ticks > 0 and r2 or r1) + 1.5
        for _, e in ipairs(ScaleList(o.scale)) do
            local a = a0 + (a1 - a0) * Clamp(e[1], 0, 1)
            local c, s = cos(a), sin(a)
            local tw = SFX.TextW(e[2], ssz)
            -- the text's nearest edge (not its centre) sits on the ring
            local tx, ty = X + c * sr + c * tw * 0.5, Y + s * sr + s * ssz * 0.5
            TextAt(self, tx - tw / 2, ty - ssz / 2 - 0.5, sc, e[2], ssz)
        end
    end
    -- body
    local style = o.style or 'cap'
    local cap = o.cap or 0x2F5BD3ff
    im.DrawList_AddCircleFilled(DL, X + r * 0.08, Y + r * 0.16, r + 1, 0x00000070)
    local ptrIn, ptrOut, ptrClr, ptrTh = r * 0.18, r * 0.72, o.line or 0xF4F4F4ff, math.max(1.4, r * 0.12)
    if style == 'cap' then
        local body = o.body or 0x8E939Bff
        im.DrawList_AddCircleFilled(DL, X, Y, r, Shade(body, -0.35))
        im.DrawList_AddCircleFilled(DL, X, Y, r - 1, body)
        im.DrawList_AddCircleFilled(DL, X - r * 0.15, Y - r * 0.18, r * 0.8, A(Shade(body, 0.45), 0.6))
        local n = floor(r * 2.2)
        for i = 0, n - 1 do
            local a = av + i * 2 * pi / n
            local c, s = cos(a), sin(a)
            im.DrawList_AddLine(DL, X + c * r * 0.82, Y + s * r * 0.82, X + c * (r - 0.8), Y + s * (r - 0.8), 0x00000040, 1)
        end
        local cr = r * 0.74
        im.DrawList_AddCircleFilled(DL, X, Y, cr, Shade(cap, -0.3))
        im.DrawList_AddCircleFilled(DL, X, Y, cr - 1, cap)
        im.DrawList_AddCircleFilled(DL, X - cr * 0.22, Y - cr * 0.26, cr * 0.6, A(Shade(cap, 0.25), 0.55))
        ptrOut = cr - 1
    elseif style == 'skirt' then
        local body = o.body or 0xC7CBD1ff
        local capc = o.cap or 0x1B1C1Fff
        im.DrawList_AddCircleFilled(DL, X, Y, r, Shade(body, -0.35))
        im.DrawList_AddCircleFilled(DL, X, Y, r - 1, body)
        im.DrawList_AddCircleFilled(DL, X - r * 0.12, Y - r * 0.15, r * 0.85, A(Shade(body, 0.4), 0.6))
        local c, s = cos(av), sin(av)
        im.DrawList_AddLine(DL, X + c * r * 0.62, Y + s * r * 0.62, X + c * (r - 1), Y + s * (r - 1), o.line or 0x111111ff, math.max(1.4, r * 0.1))
        local cr = r * 0.6
        im.DrawList_AddCircleFilled(DL, X, Y, cr, capc)
        im.DrawList_AddCircleFilled(DL, X - cr * 0.25, Y - cr * 0.3, cr * 0.5, A(Shade(capc, 0.35), 0.5))
        ptrIn, ptrOut, ptrClr = cr * 0.35, cr * 0.95, o.capLine or 0xEDEDEDff
    elseif style == 'chicken' then
        local body = o.cap or 0x1A1A1Cff
        local c, s = cos(av), sin(av)
        local px, py = -s, c
        local bw = r * 0.38
        local tipX, tipY = X + c * r, Y + s * r
        local bX, bY = X - c * r * 0.5, Y - s * r * 0.5
        im.DrawList_AddCircleFilled(DL, X, Y, r * 0.55, body)
        im.DrawList_AddQuadFilled(DL, bX + px * bw, bY + py * bw, tipX + px * bw * 0.45, tipY + py * bw * 0.45,
            tipX - px * bw * 0.45, tipY - py * bw * 0.45, bX - px * bw, bY - py * bw, body)
        im.DrawList_AddCircleFilled(DL, tipX, tipY, bw * 0.45, body)
        im.DrawList_AddCircleFilled(DL, bX, bY, bw, body)
        im.DrawList_AddCircleFilled(DL, X - r * 0.15, Y - r * 0.18, r * 0.3, 0xFFFFFF1E)
        ptrIn, ptrOut = r * 0.1, r * 0.92
    elseif style == 'bakelite' or style == 'davies' then
        local body = o.cap or 0x161618ff
        im.DrawList_AddCircleFilled(DL, X, Y, r, body)
        if style == 'davies' then
            local n = 16
            for i = 0, n - 1 do
                local a = av + i * 2 * pi / n
                im.DrawList_AddCircleFilled(DL, X + cos(a) * r * 0.93, Y + sin(a) * r * 0.93, r * 0.16, Shade(body, 0.1))
            end
            im.DrawList_AddCircleFilled(DL, X, Y, r * 0.78, Shade(body, 0.05))
        end
        im.DrawList_PathArcTo(DL, X, Y, r * 0.78, pi * 1.05, pi * 1.6)
        im.DrawList_PathStroke(DL, 0xFFFFFF30, nil, math.max(1, r * 0.12))
        im.DrawList_AddCircle(DL, X, Y, r - 0.5, 0xFFFFFF14, 0, 1)
        if style == 'davies' then
            ptrIn, ptrOut = r * 0.45, r * 0.7
        else
            ptrIn, ptrOut = r * 0.3, r * 0.92
        end
    elseif style == 'metal' then
        local body = o.cap or 0xB9BDC4ff
        im.DrawList_AddCircleFilled(DL, X, Y, r, Shade(body, -0.4))
        im.DrawList_AddCircleFilled(DL, X, Y, r - 1, body)
        for i = 1, 5 do
            im.DrawList_AddCircle(DL, X, Y, (r - 1) * i / 6, i % 2 == 0 and 0xFFFFFF26 or 0x0000001C, 0, 1)
        end
        im.DrawList_PathArcTo(DL, X, Y, r * 0.7, pi * 1.1, pi * 1.5)
        im.DrawList_PathStroke(DL, 0xFFFFFF55, nil, math.max(1, r * 0.25))
        ptrClr, ptrIn, ptrOut = o.line or 0x202124ff, r * 0.45, r * 0.9
    else -- flat
        im.DrawList_AddCircleFilled(DL, X, Y, r, Shade(cap, -0.25))
        im.DrawList_AddCircleFilled(DL, X, Y, r - 1.2, cap)
        ptrIn, ptrOut = r * 0.25, r - 2.5
    end
    if lit or act then im.DrawList_AddCircle(DL, X, Y, r + 0.5, 0xFFFFFF40, 0, 1) end
    if style ~= 'skirt' then
        local c, s = cos(av), sin(av)
        if style == 'davies' then
            im.DrawList_AddCircleFilled(DL, X + c * r * 0.62, Y + s * r * 0.62, math.max(1.3, r * 0.1), ptrClr)
        else
            im.DrawList_AddLine(DL, X + c * ptrIn, Y + s * ptrIn, X + c * ptrOut, Y + s * ptrOut, ptrClr, ptrTh)
        end
    else
        local c, s = cos(av), sin(av)
        im.DrawList_AddLine(DL, X + c * ptrIn, Y + s * ptrIn, X + c * ptrOut, Y + s * ptrOut, ptrClr, math.max(1.2, r * 0.08))
    end
    -- label above, value below
    local outer = DialOuter(r, o)
    local lc = o.labelClr or 0xE6E6E6ff
    if o.label then
        local lsz = o.labelSize or 8
        self:Engrave(cx, cy - outer - lsz - 1, o.label, { clr = lc, size = lsz, align = 'c', bold = o.labelBold })
    end
    local show = o.value
    if show == nil then show = 'hover' end
    if p and (show == true or (show == 'hover' and (lit or act))) then
        local val = ShortVal(self:Fmt(p), o.unit)
        local vsz = o.valueSize or 8
        local vw = SFX.TextW(val, vsz) + 6
        local vy = cy + outer + 1
        -- no room under it (the card's bottom edge): over the label instead
        if vy + vsz + 2 > (self.H or SFX.H) then vy = cy - outer - vsz - 2 end
        self:Rect(cx - vw / 2, vy - 1, vw, vsz + 3, 0x000000A0, 2)
        self:Text(cx, vy, 0xFFFFFFff, val, vsz, 'c')
    end
    if p then self:PrmKnob(p, cx, cy, r + 2, o.label) end
end

-- which of n positions a param is in, and the normalized value of each position
local function Positions(self, p, n)
    local ch = self:Choices(p, 32)
    local norms = {}
    if #ch == n then
        for i, c in ipairs(ch) do norms[i] = c[2] end
    else
        for i = 1, n do norms[i] = (i - 1) / (n - 1) end
    end
    local v, best, bd = self:Get(p), 1, math.huge
    for i, nv in ipairs(norms) do
        local d = math.abs(nv - v)
        if d < bd then best, bd = i, d end
    end
    return best, norms
end

--- a hardware switch; x, y its centre. Click flips (2 positions) or steps (3) the param.
--- o = { style = 'bat' (round metal toggle lever) | 'paddle' (flat black lever in a slot) | 'rocker' | 'slide',
---   horizontal = false, len = 22 (travel length), w = 10, states = 2 | 3, invert = false (normally up / right
---   = the param's high value), up = 'fast', down = 'slow' (printed at the two ends; left / right when
---   horizontal), label = 'in' (printed above everything), labelClr, labelSize = 8, clr, on, onClick = fn }
function Dev:Switch(k, x, y, o)
    o = o or {}
    local p = self:Idx(k)
    local n = o.states or 2
    local len, w = o.len or 22, o.w or 10
    local hz = o.horizontal
    local bw, bh = hz and len or w, hz and w or len
    local clicked, hov = self:Btn('sw' .. (p or o.label or '') .. '_' .. floor(x) .. '_' .. floor(y), x - bw / 2, y - bh / 2, bw, bh)
    local pos, norms = 1, nil
    if p then pos, norms = Positions(self, p, n) end
    if o.on ~= nil then pos = o.on and n or 1 end
    local t = (pos - 1) / (n - 1) -- 0 = low value, 1 = high
    if not o.invert then t = 1 - t end -- 0 = up / left in drawing terms
    if hz then t = 1 - t end
    local DL, X, Y = self.DL, self.X + x, self.Y + y
    local style = o.style or 'bat'
    local lc = o.labelClr or 0xE6E6E6ff
    local lsz = o.labelSize or 8
    if style == 'bat' then
        local nr = w * 0.62
        im.DrawList_AddCircleFilled(DL, X + 0.5, Y + 1, nr + 1.5, 0x00000066)
        im.DrawList_AddNgonFilled(DL, X, Y, nr + 1, 0x9DA2AAff, 6)
        im.DrawList_AddCircleFilled(DL, X, Y, nr * 0.72, 0x2A2B2Eff)
        local d = (t - 0.5) * 2 -- -1 .. 1
        local tipX, tipY = X, Y + d * len * 0.5
        if hz then tipX, tipY = X + d * len * 0.5, Y end
        local half = w * 0.22
        local px, py = hz and 0 or half, hz and half or 0
        local tr = w * 0.36
        im.DrawList_AddQuadFilled(DL, X - px, Y - py, tipX - px * 1.4, tipY - py * 1.4, tipX + px * 1.4, tipY + py * 1.4, X + px, Y + py, o.clr or 0xC9CDD3ff)
        im.DrawList_AddCircleFilled(DL, tipX + 0.5, tipY + 1, tr + 0.5, 0x00000055)
        im.DrawList_AddCircleFilled(DL, tipX, tipY, tr, o.clr or 0xD6DADFff)
        im.DrawList_AddCircleFilled(DL, tipX - tr * 0.3, tipY - tr * 0.3, tr * 0.45, 0xFFFFFFAA)
    elseif style == 'paddle' or style == 'rocker' then
        local x1, y1, x2, y2 = X - bw / 2, Y - bh / 2, X + bw / 2, Y + bh / 2
        im.DrawList_AddRectFilled(DL, x1 - 1, y1 - 1, x2 + 1, y2 + 1, 0x0000008C, 2)
        im.DrawList_AddRectFilled(DL, x1, y1, x2, y2, style == 'rocker' and 0x1E1F22ff or 0x111214ff, 2)
        local c = o.clr or 0x1A1B1Eff
        if style == 'paddle' then
            local sx, sy = hz and (x1 + (bw - bw * 0.5) * t) or x1, hz and y1 or (y1 + (bh - bh * 0.5) * t)
            local ex, ey = hz and sx + bw * 0.5 or x2, hz and y2 or sy + bh * 0.5
            im.DrawList_AddRectFilled(DL, sx, sy, ex, ey, Shade(c, 0.12), 2)
            VGrad(DL, sx + 1, sy + 1, ex - 1, ey - 1, Shade(c, 0.28), c)
            im.DrawList_AddLine(DL, sx + 1.5, sy + 1.5, hz and sx + 1.5 or ex - 1.5, hz and ey - 1.5 or sy + 1.5, 0xFFFFFF40, 1)
        else
            local midX, midY = (x1 + x2) / 2, (y1 + y2) / 2
            local upPressed = t < 0.5
            local ax1, ay1, ax2, ay2 = x1 + 1, y1 + 1, hz and midX or x2 - 1, hz and y2 - 1 or midY
            local bx1, by1, bx2, by2 = hz and midX or x1 + 1, hz and y1 + 1 or midY, x2 - 1, y2 - 1
            im.DrawList_AddRectFilled(DL, ax1, ay1, ax2, ay2, upPressed and Shade(c, -0.2) or Shade(c, 0.25), 1)
            im.DrawList_AddRectFilled(DL, bx1, by1, bx2, by2, upPressed and Shade(c, 0.25) or Shade(c, -0.2), 1)
        end
    else -- slide
        local x1, y1, x2, y2 = X - bw / 2, Y - bh / 2, X + bw / 2, Y + bh / 2
        im.DrawList_AddRectFilled(DL, x1, y1, x2, y2, 0x0B0B0Cff, bw * 0.5 < bh * 0.5 and bw * 0.5 or bh * 0.5)
        local kw, kh = hz and bw * 0.45 or bw - 2, hz and bh - 2 or bh * 0.45
        local kx = hz and (x1 + 1 + (bw - 2 - kw) * t) or x1 + 1
        local ky = hz and y1 + 1 or (y1 + 1 + (bh - 2 - kh) * t)
        local c = o.clr or 0xC9CDD3ff
        im.DrawList_AddRectFilled(DL, kx, ky, kx + kw, ky + kh, c, 2)
        VGrad(DL, kx + 1, ky + 1, kx + kw - 1, ky + kh * 0.5, 0xFFFFFF40, 0xFFFFFF00)
    end
    if hov then im.DrawList_AddRect(DL, X - bw / 2 - 2, Y - bh / 2 - 2, X + bw / 2 + 2, Y + bh / 2 + 2, 0xFFFFFF30, 3, nil, 1) end
    -- printed labels
    local top = y - bh / 2 - 3
    if o.up then
        if hz then self:Engrave(x - bw / 2 - 3, y - lsz / 2 - 1, o.up, { clr = lc, size = lsz, align = 'r' })
        else self:Engrave(x, top - lsz, o.up, { clr = lc, size = lsz, align = 'c' }); top = top - lsz - 1 end
    end
    if o.down then
        if hz then self:Engrave(x + bw / 2 + 3, y - lsz / 2 - 1, o.down, { clr = lc, size = lsz })
        else self:Engrave(x, y + bh / 2 + 2, o.down, { clr = lc, size = lsz, align = 'c' }) end
    end
    if o.label then self:Engrave(x, top - lsz, o.label, { clr = lc, size = lsz, align = 'c', bold = o.labelBold }) end
    if clicked then
        if o.onClick then o.onClick()
        elseif p then
            local nxt = n == 2 and (pos == 1 and 2 or 1) or (pos % n + 1)
            self:Set(p, norms[nxt])
        end
    end
    return clicked
end

--- a pilot lamp or LED; x, y its centre. o = { clr = 0xFF3B30ff, kind = 'jewel' (lamp in a chrome bezel) | 'led',
--- label (printed under it), labelClr, labelSize }
function Dev:Lamp(x, y, r, on, o)
    o = o or {}
    r = r or 4
    local DL, X, Y = self.DL, self.X + x, self.Y + y
    local c = o.clr or 0xFF3B30ff
    if (o.kind or 'jewel') == 'jewel' then
        im.DrawList_AddCircleFilled(DL, X, Y + 0.8, r + 2.6, 0x00000070)
        im.DrawList_AddCircleFilled(DL, X, Y, r + 2.2, 0xB7BBC2ff)
        im.DrawList_AddCircleFilled(DL, X, Y, r + 1, 0x55585Eff)
    else
        im.DrawList_AddCircleFilled(DL, X, Y, r + 1.2, 0x00000080)
    end
    if on then
        for i = 3, 1, -1 do im.DrawList_AddCircleFilled(DL, X, Y, r + i * r * 0.55, A(c, 0.07 * (4 - i))) end
        im.DrawList_AddCircleFilled(DL, X, Y, r, c)
        im.DrawList_AddCircleFilled(DL, X, Y, r * 0.55, Shade(c, 0.45))
    else
        im.DrawList_AddCircleFilled(DL, X, Y, r, Shade(c, -0.68))
    end
    im.DrawList_AddCircleFilled(DL, X - r * 0.35, Y - r * 0.4, r * 0.3, 0xFFFFFFA0)
    if o.label then
        self:Engrave(x, y + r + 4, o.label, { clr = o.labelClr or 0xE6E6E6ff, size = o.labelSize or 8, align = 'c' })
    end
end

--- a square push button (latching: flips the param); x, y top-left. o = { label (printed above), labelClr,
--- labelSize, text (printed on the cap), led = true (an LED above the cap that lights when on), ledClr, clr (cap),
--- on, onClick = fn }
function Dev:Push(k, x, y, w, h, o)
    o = o or {}
    local p = self:Idx(k)
    local on = o.on
    if on == nil then on = p and self:Get(p) >= 0.5 end
    local clicked, hov, active = self:Btn('push' .. (p or o.label or o.text or '') .. '_' .. floor(x), x, y, w, h)
    local DL = self.DL
    local X1, Y1 = self.X + x, self.Y + y
    local c = o.clr or 0x1E1F23ff
    local down = (on or active) and 1 or 0
    im.DrawList_AddRectFilled(DL, X1 - 1, Y1 - 1, X1 + w + 1, Y1 + h + 1, 0x000000A0, 2)
    im.DrawList_AddRectFilled(DL, X1, Y1 + down, X1 + w, Y1 + h, Shade(c, hov and 0.12 or 0), 2)
    VGrad(DL, X1 + 1, Y1 + 1 + down, X1 + w - 1, Y1 + h - 1, Shade(c, 0.22), Shade(c, -0.15))
    if not on then im.DrawList_AddLine(DL, X1 + 1.5, Y1 + 1.5, X1 + w - 1.5, Y1 + 1.5, 0xFFFFFF33, 1) end
    if o.text then
        self:Text(x + w / 2, y + (h - 8) / 2 + down - 0.5, on and (o.textOn or 0xFFFFFFff) or 0xC8C8C8ff, o.text, 8, 'c', true)
    end
    local top = y
    if o.led ~= false then
        top = y - 9
        self:Lamp(x + w / 2, y - 5, 2.4, on, { kind = 'led', clr = o.ledClr or 0xFF3B30ff })
    end
    if o.label then
        self:Engrave(x + w / 2, top - (o.labelSize or 8) - 2, o.label, { clr = o.labelClr or 0xE6E6E6ff, size = o.labelSize or 8, align = 'c', bold = o.labelBold })
    end
    if clicked then
        if o.onClick then o.onClick() elseif p then self:Set(p, on and 0 or 1) end
    end
    return clicked
end

--- needle position (0..1) of a level in dB on a VU scale from lo to hi dB (default -20 .. +3)
function SFX.VUPos(db, lo, hi)
    lo, hi = lo or -20, hi or 3
    if not db or db ~= db then return 0 end
    local a, a0, a1 = 10 ^ (Clamp(db, lo - 10, hi) / 20), 10 ^ (lo / 20), 10 ^ (hi / 20)
    return Clamp((a - a0) / (a1 - a0), 0, 1)
end
local VU_SCALE = { '-20', '-10', '-7', '-5', '-3', '-1', '0', '+1', '+2', '+3' }

--- the track's input level in dB (the newest of D:InputWave's peaks, eased like a VU needle), or nil before
--- there's any. o = { attack = 0.3 (seconds), release = 0.3 }
function Dev:Level(o)
    local pk = self:InputWave(4)
    if not pk then return end
    local v = 0
    for i = 1, #pk do v = max(v, pk[i] or 0) end
    local db = v > 0 and 20 * math.log(v, 10) or -90
    local S = self.S
    local now = self.NOW or 0
    local dt = Clamp(now - (S.LvlT or now), 0, 0.2)
    S.LvlT = now
    local prev = S.Lvl or db
    local tc = (db > prev) and ((o and o.attack) or 0.3) or ((o and o.release) or 0.3)
    prev = prev + (db - prev) * (1 - math.exp(-dt / max(tc, 0.001)))
    S.Lvl = prev
    return prev
end

--- an analog needle meter; x, y, w, h its outer box (bezel included), v the needle position 0..1 (SFX.VUPos
--- turns dB into it; nil rests the needle at 0). o = { face = 0xEDE3C3ff (cream; 'black' for a black face),
--- ink = scale colour, needle = colour, bezel = colour, scale = { '-20', ... } or { {pos, text}, ... }
--- (default: a VU scale), red = 0.69 (where the red part of the arc starts; false for none), label = 'VU'
--- (printed on the face), labelSize, light = true (a warm backlight glow) }
function Dev:VU(x, y, w, h, v, o)
    o = o or {}
    local DL = self.DL
    local X1, Y1 = self.X + x, self.Y + y
    local X2, Y2 = X1 + w, Y1 + h
    local bz = o.bezel or 0x16171Aff
    local b = math.max(2, math.min(w, h) * 0.06)
    im.DrawList_AddRectFilled(DL, X1 + 1, Y1 + 2, X2 + 1, Y2 + 2, 0x00000066, 3)
    im.DrawList_AddRectFilled(DL, X1, Y1, X2, Y2, bz, 3)
    im.DrawList_AddRect(DL, X1, Y1, X2, Y2, 0xFFFFFF18, 3, nil, 1)
    local black = o.face == 'black'
    local face = black and 0x101113ff or (o.face or 0xEDE3C3ff)
    local fx1, fy1, fx2, fy2 = X1 + b, Y1 + b, X2 - b, Y2 - b
    im.DrawList_AddRectFilled(DL, fx1, fy1, fx2, fy2, face, 1)
    if o.light ~= false and not black then
        VGrad(DL, fx1, fy1, fx2, fy2, 0xFFF4C81C, 0x6B4A1022)
    end
    local ink = o.ink or (black and 0xE8E8E8ff or 0x1A1A1Aff)
    local fw, fh = fx2 - fx1, fy2 - fy1
    -- pivot below the face; the scale arc spans +-45 degrees around straight up
    local px, py = (fx1 + fx2) / 2, fy2 + fh * 0.32
    local R = math.min(fh * 1.02, fw * 0.78)
    local A0, A1 = rad(-90 - 47), rad(-90 + 47)
    im.DrawList_PushClipRect(DL, fx1, fy1, fx2, fy2, true)
    local rS = R * 0.86
    local red = o.red
    if red == nil then red = 0.69 end
    im.DrawList_PathArcTo(DL, px, py, rS, A0, red and (A0 + (A1 - A0) * red) or A1)
    im.DrawList_PathStroke(DL, ink, nil, 1)
    if red then
        im.DrawList_PathArcTo(DL, px, py, rS, A0 + (A1 - A0) * red, A1)
        im.DrawList_PathStroke(DL, 0xD7261Eff, nil, math.max(1.5, R * 0.05))
    end
    local scale = o.scale
    local list = {}
    if scale then list = ScaleList(scale)
    else
        for _, t in ipairs(VU_SCALE) do list[#list + 1] = { SFX.VUPos(tonumber(t)), t } end
    end
    local ssz = o.scaleSize or (fh > 50 and 8 or 7)
    for i, e in ipairs(list) do
        local a = A0 + (A1 - A0) * Clamp(e[1], 0, 1)
        local c, s = cos(a), sin(a)
        local isRed = red and e[1] >= red - 0.001
        local tc = isRed and 0xD7261Eff or ink
        im.DrawList_AddLine(DL, px + c * rS, py + s * rS, px + c * (rS + R * 0.07), py + s * (rS + R * 0.07), tc, 1)
        if e[2] ~= '' and (fw > 70 or #list <= 7 or i % 2 == 1 or i == #list) then
            local txt = e[2]:gsub('^%+', '')
            TextC(self, px + c * (rS + R * 0.07 + ssz * 0.75), py + s * (rS + R * 0.07 + ssz * 0.75) - ssz / 2, tc, txt, ssz)
        end
    end
    local lbl = o.label
    if lbl == nil then lbl = 'VU' end
    if lbl ~= false and lbl ~= '' then
        local lsz = o.labelSize or (fh > 50 and 10 or 8)
        TextC(self, px, fy1 + fh * 0.58, ink, lbl, lsz, true)
    end
    -- needle
    local nv = Clamp(v or 0, 0, 1)
    local a = A0 + (A1 - A0) * nv
    local c, s = cos(a), sin(a)
    local nc = o.needle or (black and 0xF2F2F2ff or 0x111111ff)
    im.DrawList_AddLine(DL, px + 1, py + 1.5, px + c * R * 0.98 + 1, py + s * R * 0.98 + 1.5, 0x00000030, 1.2)
    im.DrawList_AddLine(DL, px, py, px + c * R * 0.98, py + s * R * 0.98, nc, 1.2)
    im.DrawList_PopClipRect(DL)
    -- pivot cover and glass
    im.DrawList_AddRectFilled(DL, fx1, fy2 - fh * 0.12, fx2, fy2, A(bz, 0.85), 1)
    im.DrawList_AddQuadFilled(DL, fx1, fy1, fx1 + fw * 0.55, fy1, fx1 + fw * 0.3, fy2, fx1, fy2, 0xFFFFFF0C)
    im.DrawList_AddRect(DL, fx1, fy1, fx2, fy2, 0x00000066, 1, nil, 1)
end

--- an LED / LCD number display; x, y, w, h its box. o = { kind = 'led' (glowing digits on black) | 'lcd'
--- (dark digits on a lit green-grey glass) | 'vfd' (cyan), clr = digit colour, size = 8..16, align = 'c' | 'r' | 'l' }
function Dev:Readout(x, y, w, h, txt, o)
    o = o or {}
    local kind = o.kind or 'led'
    local DL = self.DL
    local X1, Y1 = self.X + x, self.Y + y
    local bg = kind == 'lcd' and 0x9BA889ff or 0x0A0B0Cff
    local clr = o.clr or (kind == 'lcd' and 0x1B2116ff or (kind == 'vfd' and 0x5FF3E6ff or 0xFF5A1Fff))
    im.DrawList_AddRectFilled(DL, X1 - 1, Y1 - 1, X1 + w + 1, Y1 + h + 1, 0x000000AA, 2)
    im.DrawList_AddRectFilled(DL, X1, Y1, X1 + w, Y1 + h, bg, 2)
    if kind == 'lcd' then VGrad(DL, X1, Y1, X1 + w, Y1 + h * 0.5, 0xFFFFFF22, 0xFFFFFF00) end
    local sz = o.size or Clamp(floor(h * 0.7), 8, 16)
    txt = tostring(txt or '')
    local al = o.align or 'c'
    local tx = al == 'l' and x + 4 or (al == 'r' and x + w - 4 or x + w / 2)
    local ty = y + (h - sz) / 2 - 0.5
    if kind ~= 'lcd' then self:Text(tx, ty, A(clr, 0.25), txt, sz, al ~= 'l' and al or nil, o.bold) end
    self:Text(tx, ty, clr, txt, sz, al ~= 'l' and al or nil, o.bold)
end

return SFX
