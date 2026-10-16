/* FabFilter devices (Pro-Q 4, Pro-C 3, Pro-L 2, Pro-R 2): the coded layouts in
   src/FX Layout Plugin Scripts/ ("Pro Q 4.lua" + src/Functions/Pro Q Shared.lua, Pro Q Curves.lua,
   Pro Q Params.lua; "Pro C 3.lua", "Pro L 2.lua", "Pro R 2.lua"), redrawn on a canvas with the same
   draw calls, sizes and colours. A tiny immediate-mode layer (ImGui-like: items, hover, active,
   mouse delta, wheel) lets the Lua logic be ported almost line by line.
   Registers FXD.devices['proq4' | 'proc3' | 'prol2' | 'pror2']. CSS prefix: ff- */
(function () {
  'use strict';
  const { h, clamp } = FXD;
  const PI = Math.PI;
  const FONT = '"Inter Tight", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif';

  FXD.css(`
  .ff-wrap { position: relative; touch-action: none; -webkit-user-select: none; user-select: none; }
  .ff-wrap canvas { display: block; }
  .ff-anchor { position: absolute; pointer-events: none; }
  .ff-menu { padding: 4px; min-width: 140px; max-height: 340px; overflow: auto; z-index: 45; }
  .ff-mi { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: transparent; color: var(--fx-text);
    font: 500 12px/1.2 var(--f-ui); padding: 5px 9px 5px 6px; border-radius: 4px; text-align: left; white-space: nowrap; cursor: pointer; }
  .ff-mi:hover, .ff-mi.open { background: rgba(255,255,255,.08); }
  .ff-mi[disabled] { color: var(--fx-muted); cursor: default; background: transparent; }
  .ff-mi .ck { width: 12px; flex: none; color: #ffca1f; text-align: center; font-size: 11px; }
  .ff-mi .ar { margin-left: auto; padding-left: 14px; color: var(--fx-dim); font-size: 10px; }
  .ff-mi svg { flex: none; }
  .ff-mh { font: 600 10px var(--f-ui); color: var(--fx-muted); padding: 6px 8px 3px; text-transform: uppercase; letter-spacing: .07em; }
  .ff-sep { height: 1px; background: var(--fx-border-hi); margin: 4px 3px; }
  .ff-tip { white-space: pre-line; z-index: 65; }
  .ff-char { padding: 8px 9px 9px; min-width: 0; background: #2a282c; border-color: #3f3d42; }
  .ff-ch-h { font: 600 8px var(--f-ui); color: #8a888c; letter-spacing: .06em; margin-bottom: 5px; }
  .ff-ch-row { display: flex; gap: 2px; }
  .ff-ch-b { width: 40px; height: 16px; border: 0; border-radius: 4px; background: transparent; color: #9a989c; font: 500 9px var(--f-ui); cursor: pointer; padding: 0; }
  .ff-ch-b:hover { background: #323035; } .ff-ch-b.on { background: #3a383d; color: #f5f3f8; }
  .ff-ch-row2 { display: flex; gap: 12px; align-items: flex-start; margin-top: 8px; }
  .ff-ch-drive { width: 110px; height: 6px; border-radius: 3px; background: #1c1b1e; overflow: hidden; cursor: ew-resize; touch-action: none; margin-top: 3px; }
  .ff-ch-drive i { display: block; height: 100%; background: linear-gradient(90deg, #c8743a, #e8a050); }
  .ff-ch-dl { font: 500 8px var(--f-ui); color: #9a989c; margin-top: 3px; }
  .ff-ch-route { display: flex; align-items: center; justify-content: space-between; gap: 4px; width: 46px; height: 14px; border: 0; border-radius: 4px; background: #323035; color: #f5f3f8; font: 600 8px var(--f-ui); padding: 0 4px; cursor: pointer; }
  .ff-ch-route b { width: 4px; height: 4px; border-radius: 50%; background: #555358; } .ff-ch-route b.on { background: #e85030; }
  `);

  /* ------------------------------------------------------------------ colours (0xRRGGBBAA like ImGui) */
  const cc = new Map();
  function col(u) {
    let v = cc.get(u);
    if (!v) {
      v = `rgba(${Math.floor(u / 16777216) & 255},${Math.floor(u / 65536) & 255},${Math.floor(u / 256) & 255},${((u % 256) / 255).toFixed(3)})`;
      cc.set(u, v);
    }
    return v;
  }
  const WA = (c, a) => c - (c % 256) + (a & 255); // same colour, new alpha
  function ch(c, i) { return Math.floor(c / 2 ** (24 - 8 * i)) & 255; }
  function Mix(c1, c2, t) { let o = 0; for (let i = 0; i < 4; i++) o = o * 256 + Math.round(ch(c1, i) + (ch(c2, i) - ch(c1, i)) * t); return o; }
  function hsvU(hh, ss, vv, a) {
    hh = ((hh % 1) + 1) % 1;
    const i = Math.floor(hh * 6), f = hh * 6 - i, p = vv * (1 - ss), q = vv * (1 - f * ss), t = vv * (1 - (1 - f) * ss);
    const [r, g, b] = [[vv, t, p], [q, vv, p], [p, vv, t], [p, q, vv], [t, p, vv], [vv, p, q]][i % 6];
    return ((Math.round(r * 255) * 256 + Math.round(g * 255)) * 256 + Math.round(b * 255)) * 256 + Math.round(a * 255);
  }
  /** EightColors.Bright_HighSat[M] (modulator colours) */
  const ModClr = M => hsvU(0.08 * (M - 1), 1, 1, 0.9);

  /* ------------------------------------------------------------------ Pro Q Curves.lua (pure maths) */
  const Curves = (function () {
    const log = Math.log, exp = Math.exp, sin = Math.sin, abs = Math.abs, max = Math.max;
    const DB_PER_LN = 10 / log(10), MIN_DB = -240, BRICKWALL_N = 120, LOG_RANGE = log(3000);
    const Cal = { BellQScale: 1, CutQScale: 1, ShelfQScale: 1, ShelfQExp: 0.5, TiltSplit: 0.5, FlatTiltOct: 5 };
    const PQ4_N = [0, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95], PQ4_S = [0, 36, 48, 60, 72, 84, 96, 96];
    function ProQ4_NormToSlope(n) {
      if (n >= 0.95) return Infinity;
      for (let i = 1; i < PQ4_N.length; i++) if (n <= PQ4_N[i]) { const t = (n - PQ4_N[i - 1]) / (PQ4_N[i] - PQ4_N[i - 1]); return PQ4_S[i - 1] + t * (PQ4_S[i] - PQ4_S[i - 1]); }
      return 96;
    }
    const HzToX = (f, w) => (w || 340) * log(f / 10) / LOG_RANGE;
    const XToHz = (x, w) => 10 * exp(LOG_RANGE * x / (w || 340));
    const DbToPx = (db, hh, range) => db * (hh * 0.5) / range;
    const db1pexp = t => t > 40 ? DB_PER_LN * t : DB_PER_LN * log(1 + exp(t));
    const butterQ1 = N => 0.5 / sin(PI / (2 * N));
    function resCorr(y2, q1, R) { const a = (1 - y2) * (1 - y2); return DB_PER_LN * log((a + y2 / (q1 * q1)) / (a + y2 / (q1 * q1 * R * R))); }
    function resFactor(N, Q) { if (N <= 1 || Q === 1) return 1; if (N < 2) return Q ** (N - 1); return Q; }
    function cutDb(y, N, R) {
      if (N <= 0) return 0;
      let db = -db1pexp(2 * N * log(y));
      if (R !== 1) db += resCorr(y * y, butterQ1(max(N, 2)), R);
      return max(db, MIN_DB);
    }
    function shelfCore(u, G) {
      if (u > 0) { const e = exp(-u); return DB_PER_LN * (log(G * e + 1) - log(e + G)); }
      const e = exp(u); return DB_PER_LN * (log(G + e) - log(1 + G * e));
    }
    function lowShelfDb(x, G, gainDb, N, R) {
      if (gainDb === 0 || N <= 0) return 0;
      let db = gainDb * 0.5 + shelfCore(2 * N * log(x), G);
      if (R !== 1) {
        const q1 = butterQ1(max(N, 2)), r = exp(log(G) / (2 * N)), xz = x / r, xp = x * r;
        db = db - resCorr(xz * xz, q1, R) + resCorr(xp * xp, q1, R);
      }
      return db;
    }
    function MagDb(shape, slope, freqHz, gainDb, Q, f) {
      if (slope == null) slope = 12;
      if (Q == null) Q = 1;
      const x = f / freqHz;
      const steep = slope === Infinity ? 6 * BRICKWALL_N : slope;
      if (shape === 'Bell') {
        if (gainDb === 0) return 0;
        const M = max(steep, 12) / 12, v = abs(Q * Cal.BellQScale * (x - 1 / x));
        if (v === 0) return gainDb;
        const G = 10 ** (gainDb / 20);
        return gainDb * 0.5 + shelfCore(2 * M * log(v), G);
      } else if (shape === 'Low Cut' || shape === 'High Cut') {
        const y = shape === 'Low Cut' ? 1 / x : x;
        if (slope === Infinity) return cutDb(y, BRICKWALL_N, 1);
        const N = slope / 6;
        return cutDb(y, N, resFactor(N, Q * Cal.CutQScale));
      } else if (shape === 'Low Shelf' || shape === 'High Shelf' || shape === 'Tilt Shelf') {
        let N = max(slope, 6) / 6;
        if (slope === Infinity) { N = BRICKWALL_N; Q = 1; }
        const y = shape === 'Low Shelf' ? x : 1 / x, G = 10 ** (gainDb / 20);
        let db = lowShelfDb(y, G, gainDb, N, resFactor(N, (Q * Cal.ShelfQScale) ** Cal.ShelfQExp));
        if (shape === 'Tilt Shelf') db -= Cal.TiltSplit * gainDb;
        return db;
      } else if (shape === 'Notch') {
        const M = max(steep, 12) / 12, v = abs(Q * (x - 1 / x));
        if (v === 0) return MIN_DB;
        return max(-db1pexp(-2 * M * log(v)), MIN_DB);
      } else if (shape === 'Band Pass') {
        const N = steep / 6;
        if (N <= 0) return 0;
        const v = abs(Q * (x - 1 / x));
        if (v === 0) return 0;
        return max(-db1pexp(2 * N * log(v)), MIN_DB);
      } else if (shape === 'Flat Tilt') {
        return gainDb * log(x) / (Cal.FlatTiltOct * log(2));
      }
      return 0;
    }
    const FT = {};
    function FreqTable(w) { let t = FT[w]; if (!t) { t = []; for (let i = 1; i <= w; i++) t[i] = XToHz(i, w); FT[w] = t; } return t; }
    function BandCurveDb(b, w, out) {
      out = out || [];
      const fr = FreqTable(w);
      for (let i = 1; i <= w; i++) out[i] = MagDb(b.Shape, b.Slope, b.Freq, b.Gain, b.Q, fr[i]);
      return out;
    }
    function ScaledGain(shape, g, gs) { return (shape === 'Bell' || shape === 'Low Shelf' || shape === 'High Shelf' || shape === 'Tilt Shelf' || shape === 'Flat Tilt') ? g * gs : g; }
    return { MagDb, HzToX, XToHz, DbToPx, FreqTable, BandCurveDb, ScaledGain, ProQ4_NormToSlope };
  })();
  FXD.ProQCurves = Curves;

  /* ------------------------------------------------------------------ immediate-mode canvas */
  function IM(parent, W, H, draw) {
    const I = { W, H, active: null, hotTaken: false, wheelRegs: [], nextWheel: [], blocked: false, anchors: {} };
    const wrap = h('div', { class: 'ff-wrap' });
    const cv = h('canvas');
    wrap.append(cv); parent.append(wrap);
    const g = cv.getContext('2d');
    let dpr = 1;
    I.resize = function (w, hh) {
      I.W = w; I.H = hh; dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr);
      cv.style.width = w + 'px'; cv.style.height = hh + 'px'; wrap.style.width = w + 'px'; wrap.style.height = hh + 'px';
    };
    I.resize(W, H);
    I.g = g; I.wrap = wrap; I.cv = cv;
    const M = I.M = { x: -1e4, y: -1e4, inside: false, down: false, rdown: false, pressed: false, released: false, dbl: false,
      rpressed: false, rreleased: false, rdbl: false, wheel: 0, wheelN: 0, dx: 0, dy: 0, alt: false, shift: false, ctrl: false, touch: false };
    let lastT = 0, lastX = 0, lastY = 0, lastRT = 0, wheelAcc = 0;
    const loc = e => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * I.W / (b.width || 1), (e.clientY - b.top) * I.H / (b.height || 1)]; };
    const mods = e => { M.alt = e.altKey; M.shift = e.shiftKey; M.ctrl = e.ctrlKey || e.metaKey; };
    cv.addEventListener('pointermove', e => {
      const [x, y] = loc(e);
      if (M.down || M.rdown) { M.dx += x - M.x; M.dy += y - M.y; }
      M.x = x; M.y = y; M.inside = true; mods(e);
    });
    cv.addEventListener('pointerdown', e => {
      const [x, y] = loc(e);
      M.x = x; M.y = y; M.inside = true; M.touch = e.pointerType !== 'mouse'; mods(e);
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const now = performance.now();
      if (e.button === 0) {
        M.dbl = now - lastT < 360 && Math.hypot(x - lastX, y - lastY) < 9;
        lastT = M.dbl ? 0 : now; lastX = x; lastY = y;
        M.down = true; M.pressed = true;
      } else if (e.button === 2) {
        M.rdbl = now - lastRT < 360; lastRT = M.rdbl ? 0 : now;
        M.rdown = true; M.rpressed = true;
      }
      e.preventDefault();
    });
    const up = e => {
      if (e.button === 0 || e.type === 'pointercancel') { if (M.down) M.released = true; M.down = false; }
      if (e.button === 2 || e.type === 'pointercancel') { if (M.rdown) M.rreleased = true; M.rdown = false; }
      mods(e);
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', e => { if (!M.down && !M.rdown && e.pointerType === 'mouse') { M.inside = false; M.x = M.y = -1e4; } });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      const [x, y] = loc(e);
      if (!I.wheelRegs.some(r => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3])) return;
      e.preventDefault(); mods(e);
      let d = -(e.deltaY || e.deltaX);
      if (e.deltaMode === 1) d *= 33;
      d = clamp(d / 100, -3, 3);
      M.wheel += d; wheelAcc += d;
      const n = Math.trunc(wheelAcc);
      if (n) { M.wheelN += n; wheelAcc -= n; }
    }, { passive: false });

    /* drawing (ImGui DrawList-like, coordinates in CSS px of the canvas) */
    const D = I.d = {
      rectF(x1, y1, x2, y2, c, r) { if (x2 <= x1 || y2 <= y1) return; g.fillStyle = col(c); if (r) { g.beginPath(); g.roundRect(x1, y1, x2 - x1, y2 - y1, Math.min(r, (x2 - x1) / 2, (y2 - y1) / 2)); g.fill(); } else g.fillRect(x1, y1, x2 - x1, y2 - y1); },
      rect(x1, y1, x2, y2, c, r, th) { g.strokeStyle = col(c); g.lineWidth = th || 1; g.beginPath(); g.roundRect(x1 + 0.5, y1 + 0.5, Math.max(0, x2 - x1 - 1), Math.max(0, y2 - y1 - 1), r || 0); g.stroke(); },
      grad(x1, y1, x2, y2, cT, cB, r) { const gr = g.createLinearGradient(0, y1, 0, y2); gr.addColorStop(0, col(cT)); gr.addColorStop(1, col(cB)); g.fillStyle = gr; if (r) { g.beginPath(); g.roundRect(x1, y1, x2 - x1, y2 - y1, r); g.fill(); } else g.fillRect(x1, y1, x2 - x1, y2 - y1); },
      gradH(x1, y1, x2, y2, cL, cR) { const gr = g.createLinearGradient(x1, 0, x2, 0); gr.addColorStop(0, col(cL)); gr.addColorStop(1, col(cR)); g.fillStyle = gr; g.fillRect(x1, y1, x2 - x1, y2 - y1); },
      line(x1, y1, x2, y2, c, th) { g.strokeStyle = col(c); g.lineWidth = th || 1; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); },
      circF(x, y, r, c) { g.fillStyle = col(c); g.beginPath(); g.arc(x, y, Math.max(0, r), 0, 2 * PI); g.fill(); },
      circ(x, y, r, c, th) { g.strokeStyle = col(c); g.lineWidth = th || 1; g.beginPath(); g.arc(x, y, Math.max(0, r), 0, 2 * PI); g.stroke(); },
      arc(x, y, r, a0, a1, c, th) { if (a1 - a0 < 0.005) return; g.strokeStyle = col(c); g.lineWidth = th || 1; g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); },
      tri(x1, y1, x2, y2, x3, y3, c) { g.fillStyle = col(c); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath(); g.fill(); },
      quad(x1, y1, x2, y2, x3, y3, x4, y4, c) { g.fillStyle = col(c); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.lineTo(x4, y4); g.closePath(); g.fill(); },
      clip(x1, y1, x2, y2) { g.save(); g.beginPath(); g.rect(x1, y1, x2 - x1, y2 - y1); g.clip(); },
      unclip() { g.restore(); },
      dashed(x0, y0, x1, y1, c, dash, gap, th) { g.save(); g.setLineDash([dash, gap]); D.line(x0, y0, x1, y1, c, th); g.restore(); },
    };
    const tw = new Map();
    I.font = (size, wt) => `${wt || 500} ${size}px ${FONT}`;
    I.tw = function (s, size, wt) {
      const k = size + '|' + (wt || 500) + '|' + s;
      let v = tw.get(k);
      if (v == null) { g.font = I.font(size, wt); v = g.measureText(s).width; if (tw.size > 3000) tw.clear(); tw.set(k, v); }
      return v;
    };
    I.text = function (x, y, c, s, size, wt) { g.font = I.font(size, wt); g.fillStyle = col(c); g.textBaseline = 'top'; g.fillText(s, x, y + size * 0.06); };
    I.textC = (cx, y, c, s, size, wt) => I.text(cx - I.tw(s, size, wt) / 2, y, c, s, size, wt);
    I.textR = (rx, y, c, s, size, wt) => I.text(rx - I.tw(s, size, wt), y, c, s, size, wt);

    /** ImGui-style item: first item under the mouse gets the hover; a press makes it active until release */
    I.item = function (id, x, y, w, hh, o) {
      o = o || {};
      if (o.wheel) I.nextWheel.push([x, y, x + w, y + hh]);
      const inside = M.inside && M.x >= x && M.x < x + w && M.y >= y && M.y < y + hh;
      let hov = false;
      if (inside && !I.blocked && !I.hotTaken && (I.active == null || I.active === id)) {
        hov = true; I.hotTaken = true; if (o.cursor) I.cursor = o.cursor;
      }
      if (hov && M.pressed && I.active == null) I.active = id;
      const act = I.active === id;
      return { hov, act, pressed: act && M.pressed, clicked: act && M.released && inside, rclicked: hov && M.rpressed, dbl: hov && M.dbl && M.pressed };
    };
    /** a wheel region without an item (lets the canvas take the wheel there) */
    I.wheelArea = (x, y, w, hh) => I.nextWheel.push([x, y, x + w, y + hh]);
    I.tip = function (t) { if (!M.down && !M.rdown && t) I.tipText = t; };
    I.now = () => performance.now() / 1000;

    /* anchors: invisible boxes over canvas regions, for the "Try it" pointer ring */
    I.anchor = function (key) {
      let a = I.anchors[key];
      if (!a) { a = I.anchors[key] = h('div', { class: 'ff-anchor', 'data-k': key, style: { left: '0px', top: '0px', width: '0px', height: '0px' } }); wrap.append(a); }
      return a;
    };
    I.setAnchor = function (key, x, y, w, hh) {
      const a = I.anchor(key);
      a.style.left = x + 'px'; a.style.top = y + 'px'; a.style.width = Math.max(0, w) + 'px'; a.style.height = Math.max(0, hh) + 'px';
    };

    /* DOM tooltip (FXD style), shown after a short hover */
    let tipEl = null, tipKey = null, tipSince = 0;
    function host() { return wrap.closest('.stage-inner') || document.body; }
    function updTip() {
      const t = I.tipText;
      if (!t || M.touch) { if (tipEl) { tipEl.remove(); tipEl = null; } tipKey = null; return; }
      const now = performance.now();
      if (t !== tipKey) { tipKey = t; tipSince = now; if (tipEl) { tipEl.remove(); tipEl = null; } }
      if (now - tipSince < 380) return;
      const hst = host();
      if (!tipEl) { tipEl = h('div', { class: 'fx-tip fx ff-tip' }, t); hst.append(tipEl); }
      const hb = hst.getBoundingClientRect(), b = cv.getBoundingClientRect();
      const cx = b.left + M.x * b.width / I.W, cy = b.top + M.y * b.height / I.H;
      let lx = cx - hb.left + hst.scrollLeft + 14, ly = cy - hb.top + hst.scrollTop + 18;
      const maxX = hst.scrollWidth - tipEl.offsetWidth - 4;
      tipEl.style.left = Math.max(4, Math.min(lx, maxX)) + 'px'; tipEl.style.top = ly + 'px';
    }

    /* DOM menus: items [{ label, checked, disabled, onClick, sub: [...], sep, header, icon: svg }] */
    let menus = [];
    I.closeMenu = function () { menus.forEach(m => m.remove()); menus = []; document.removeEventListener('pointerdown', outside, true); I.menuOpen = false; };
    function outside(e) { if (!menus.some(m => m.contains(e.target))) I.closeMenu(); }
    function buildMenu(items, level) {
      const el = h('div', { class: 'fx-pop fx ff-menu', role: 'menu' });
      for (const it of items) {
        if (it.sep) { el.append(h('div', { class: 'ff-sep' })); continue; }
        if (it.header) { el.append(h('div', { class: 'ff-mh' }, it.header)); continue; }
        const b = h('button', { class: 'ff-mi', type: 'button', role: 'menuitem', disabled: it.disabled ? true : null },
          h('span', { class: 'ck' }, it.checked ? '✓' : ''), it.icon ? it.icon() : null, h('span', null, it.label), it.sub ? h('span', { class: 'ar' }, '▶') : null);
        if (it.sub) {
          const open = () => {
            menus.slice(level + 1).forEach(m => m.remove()); menus = menus.slice(0, level + 1);
            el.querySelectorAll('.ff-mi.open').forEach(x => x.classList.remove('open')); b.classList.add('open');
            const sm = buildMenu(it.sub, level + 1);
            placeEl(sm, b.getBoundingClientRect().right + 2, b.getBoundingClientRect().top - 5, true);
          };
          b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') open(); });
          b.addEventListener('click', open);
        } else if (!it.disabled) {
          b.addEventListener('pointerenter', () => { menus.slice(level + 1).forEach(m => m.remove()); menus = menus.slice(0, level + 1); el.querySelectorAll('.ff-mi.open').forEach(x => x.classList.remove('open')); });
          b.addEventListener('click', () => { I.closeMenu(); it.onClick && it.onClick(); });
        }
        el.append(b);
      }
      menus.push(el);
      return el;
    }
    function placeEl(el, clientX, clientY, side) {
      const hst = host();
      hst.append(el);
      const hb = hst.getBoundingClientRect();
      let x = clientX - hb.left + hst.scrollLeft, y = clientY - hb.top + hst.scrollTop;
      const maxX = hst.scrollWidth - el.offsetWidth - 6;
      if (x > maxX && side) x = clientX - hb.left + hst.scrollLeft - el.offsetWidth - 150;
      el.style.left = Math.max(6, Math.min(x, maxX)) + 'px'; el.style.top = Math.max(6, y) + 'px';
    }
    /** opens a menu at canvas position x, y (pivot 1 = right-aligned to x) */
    I.menu = function (items, x, y, pivot) {
      I.closeMenu();
      const el = buildMenu(items, 0);
      const b = cv.getBoundingClientRect();
      let cx = b.left + x * b.width / I.W;
      const cy = b.top + y * b.height / I.H;
      placeEl(el, cx, cy);
      if (pivot === 1) { const l = parseFloat(el.style.left) - el.offsetWidth; el.style.left = Math.max(6, l) + 'px'; }
      I.menuOpen = true;
      setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    };

    /** a DOM panel placed like a menu at canvas position x, y (closes on an outside click) */
    I.popEl = function (el, x, y) {
      I.closeMenu();
      menus.push(el);
      const b = cv.getBoundingClientRect();
      placeEl(el, b.left + x * b.width / I.W, b.top + y * b.height / I.H);
      I.menuOpen = true;
      setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    };

    I.frame = function () {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, I.W, I.H);
      g.lineJoin = 'round'; g.lineCap = 'butt';
      I.hotTaken = false; I.nextWheel = []; I.tipText = null; I.cursor = ''; I.blocked = false;
      draw(I);
      if (M.pressed && I.active == null) I.active = '__void';
      if (!M.down && I.active != null && !M.pressed) I.active = null;
      if (M.released) I.active = null;
      M.pressed = M.released = M.dbl = M.rpressed = M.rreleased = M.rdbl = false;
      M.wheel = 0; M.wheelN = 0; M.dx = 0; M.dy = 0;
      I.wheelRegs = I.nextWheel;
      cv.style.cursor = I.cursor || 'default';
      updTip();
    };
    I.destroy = function () { I.closeMenu(); if (tipEl) tipEl.remove(); };
    return I;
  }

  /* ------------------------------------------------------------------ shared helpers */
  const sdb = (db, d = 1) => (db > 0.049 ? '+' : '') + db.toFixed(d) + ' dB';
  const pct = v => Math.round(v * 100) + '%';
  function hzLabel(hz) {
    if (hz < 100) return hz.toFixed(1) + ' Hz';
    if (hz < 1000) return Math.round(hz) + ' Hz';
    if (hz < 10000) return (hz / 1000).toFixed(2) + ' kHz';
    return (hz / 1000).toFixed(1) + ' kHz';
  }
  const idxOf = (v, n) => clamp(Math.round(v * (n - 1)), 0, n - 1);
  /** svg picture of a Pro-Q shape (DrawShapeIcon), for menus */
  function shapeSvg(shape, w = 24, hh = 10, clr = '#c0c0c8') {
    const GI = { Bell: 9, 'Low Shelf': 9, 'High Shelf': 9, 'Tilt Shelf': 12, 'Flat Tilt': 12 };
    const gn = GI[shape], zeroY = gn ? hh / 2 : hh * 0.3, N = 16;
    let d = '';
    for (let i = 0; i <= N; i++) {
      const f = 20 * 1000 ** (i / N);
      const db = Curves.MagDb(shape, 12, 632, gn || 0, shape === 'Band Pass' ? 2 : shape === 'Bell' ? 0.6 : 1, f);
      d += (i ? 'L' : 'M') + (w * i / N).toFixed(1) + ' ' + clamp(zeroY - db * (hh / 2) / 12, 0, hh).toFixed(1);
    }
    return () => { const e = FXD.s('svg', { width: w, height: hh + 2, viewBox: `0 -1 ${w} ${hh + 2}` }); e.innerHTML = `<path d="${d}" fill="none" stroke="${clr}" stroke-width="1.3"/>`; return e; };
  }
  /** keeps a body content box centred vertically in the device */
  function mount(body, D, W, H, bg) {
    body.style.background = col(bg);
    body.style.display = 'flex'; body.style.alignItems = 'center'; body.style.paddingLeft = '4px';
  }

  /* ================================================================== PRO-Q 4 */
  function buildProQ(body, api) {
    const D = api.device;
    const NUM = 24, CURVE_H = 200, HEADER_H = 20, PANEL_W = 176, PANEL_GAP = 6;
    const DISPLAY_WIDTHS = [['Small', 340], ['Medium', 420], ['Large', 520]];
    const SHAPES = ['Bell', 'Low Shelf', 'Low Cut', 'High Shelf', 'High Cut', 'Notch', 'Band Pass', 'Tilt Shelf', 'Flat Tilt', 'All Pass'];
    const PLACES = ['Left', 'Right', 'Stereo', 'Mid', 'Side'];
    const CLR = {
      BgTop: 0x1a1a21ff, BgBottom: 0x0f0f13ff, GridMinor: 0xffffff0a, GridMajor: 0xffffff17, Zero: 0xffffff26, Label: 0x86868fff,
      Curve: 0xffca1fff, Chan: { Left: 0xe6e6e6dd, Right: 0xf05a5add, Mid: 0x5fd07add, Side: 0x55a0f5dd },
      SpecPreFill: 0xc8c8d22e, SpecPreLine: 0xc8c8d238, SpecPostFill: 0xffffff0c, SpecPostLine: 0xe2e2eab4, Dyn: 0xff5a5aff,
    };
    const CHAN_LETTER = { Left: 'L', Right: 'R', Mid: 'M', Side: 'S' };
    const PANEL_CLR = { Bg: 0x131313ff, Row: 0x1e1e1eff, RowHvr: 0x292929ff, Text: 0xd6d6d6ff, Dim: 0x7c7c7cff, Line: 0x2c2c2cff, Accent: 0xffc434ff };
    const HDR = { Bg: 0x17171dff, Line: 0xffffff12, Pill: 0x22222bff, PillHvr: 0x2d2d38ff, Edge: 0xffffff16, Txt: 0xc8c8d0ff, Dim: 0x8a8a94ff, Accent: 0xffca1fff, Red: 0xff5a5aff };
    const BAND_FULL = [0x69B45Dff, 0x2D91E3ff, 0xC530E5ff, 0xF51B1Dff, 0x571EF5ff, 0xC1FF1Aff, 0x30C2FFff, 0x00e496ff];
    const BAND_BRI = [0x96CA8Dff, 0x6CB2EBff, 0xC530E5ff, 0xF51B1Dff, 0x865affff, 0xccef6eff, 0x30C2FFff, 0x00e496ff];
    const bandClr = B => [WA(BAND_FULL[(B - 1) % 8], 0x55), BAND_FULL[(B - 1) % 8], BAND_BRI[(B - 1) % 8]];
    const TXT = 11;

    // value conversions (Pro Q Params.lua fallbacks: Pro-Q's documented ranges)
    const Hz = v => 10 * 3000 ** clamp(v);
    const Db = v => -30 + 60 * clamp(v);
    const Qr = v => 0.025 * 1600 ** clamp(v);
    const ToNorm = { Freq: x => Math.log(x / 10) / Math.log(3000), Gain: x => (x + 30) / 60, Q: x => Math.log(x / 0.025) / Math.log(1600) };
    const QLabel = q => q < 10 ? q.toFixed(2) : q.toFixed(1);
    const DbLabel = db => { db = Math.round(db * 10) / 10; return (db > 0 ? '+' : '') + db.toFixed(1) + ' dB'; };
    const SlopeLabel = db => db === Infinity ? 'Brickwall' : (Math.round(db * 10) / 10) + ' dB/oct';
    const IsCut = sh => sh === 'Low Cut' || sh === 'High Cut';
    const GAIN_HANDLE = { Bell: 1, 'Low Shelf': 0.5, 'High Shelf': 0.5, 'Tilt Shelf': 0.5, 'Flat Tilt': 0.5 };
    const VertKey = sh => IsCut(sh) ? 'Q' : GAIN_HANDLE[sh] ? 'Gain' : null;
    const shapeNorm = name => SHAPES.indexOf(name) / (SHAPES.length - 1);

    // global params (names as the plugin reports them; the side panel's Global page lists them)
    const G = {
      mode: { name: 'Processing Mode', opts: ['Zero Latency', 'Natural Phase', 'Linear Phase'], v: 0 },
      res: { name: 'Processing Resolution', opts: ['Low', 'Medium', 'High', 'Very High', 'Maximum'], v: 0.5 },
      char: { name: 'Character', opts: ['Clean', 'Subtle', 'Warm'], v: 0 },
      gs: { name: 'Gain Scale', v: 0.5, fmt: v => Math.round(v * 200) + '%' },
      out: { name: 'Output Level', v: 0.5, fmt: v => sdb(v * 72 - 36) },
      pan: { name: 'Output Pan', v: 0.5, fmt: v => Math.abs(v - 0.5) < 0.005 ? 'C' : Math.round(Math.abs(v - 0.5) * 200) + (v < 0.5 ? 'L' : 'R') },
      byp: { name: 'Bypass', toggle: true, v: 0 },
      inv: { name: 'Output Invert Phase', toggle: true, v: 0 },
      auto: { name: 'Auto Gain', toggle: true, v: 0 },
      range: { name: 'Display Range', opts: ['3 dB', '6 dB', '12 dB', '30 dB'], v: 2 / 3, visual: true },
    };
    const GLOBAL_ORDER = ['mode', 'res', 'char', 'gs', 'out', 'pan', 'byp', 'inv', 'auto', 'range'];
    // per-band extras, in the plugin's order (Discover() keeps the plugin's own list)
    const XTRA = [
      { k: 'Place', name: 'Stereo Placement', opts: PLACES },
      { k: 'Solo', name: 'Solo', toggle: true },
      { k: 'DynRange', name: 'Dynamic Range', fmt: v => sdb(v * 60 - 30) },
      { k: 'DynOn', name: 'Dynamics Enabled', toggle: true },
      { k: 'DynAuto', name: 'Dynamics Auto', toggle: true },
      { k: 'Thr', name: 'Threshold', fmt: v => sdb(v * 60 - 60) },
      { k: 'Att', name: 'Attack', fmt: pct },
      { k: 'Rel', name: 'Release', fmt: pct },
      { k: 'ExtSC', name: 'External Side Chain', toggle: true },
      { k: 'SCFilt', name: 'Side Chain Filtering', toggle: true },
      { k: 'SCLo', name: 'Side Chain Low Frequency', fmt: v => hzLabel(Hz(v)) },
      { k: 'SCHi', name: 'Side Chain High Frequency', fmt: v => hzLabel(Hz(v)) },
      { k: 'SCAud', name: 'Side Chain Audition', toggle: true },
      { k: 'Spectral', name: 'Spectral Enabled', toggle: true },
      { k: 'Density', name: 'Spectral Density', fmt: pct },
      { k: 'Tilt', name: 'Spectral Tilt', fmt: v => sdb(v * 12 - 6) + '/oct' },
    ];
    const DYN_WORDS = ['dynamic', 'threshold', 'attack', 'release', 'side chain', 'sidechain', 'spectral', 'external', 'density', 'ratio', 'knee', 'auto', 'range', 'sensitivity'];
    const KNOB_WORDS = ['range', 'threshold', 'attack', 'release'];
    const SHORT_NAME = { 'Dynamics Enabled': 'Dynamic', 'Dynamics Auto': 'Auto', 'External Side Chain': 'Ext. SC', 'Side Chain Filtering': 'SC filter', 'Side Chain Audition': 'Audition', 'Spectral Enabled': 'Spectral', 'Spectral Tilt': 'Spectral tilt' };
    const hasWord = (name, words) => words.some(w => name.toLowerCase().includes(w));
    const pageExtras = { Band: XTRA.filter(e => !hasWord(e.name, DYN_WORDS)), Dynamics: XTRA.filter(e => hasWord(e.name, DYN_WORDS)) };

    // bands: normalized values like the plugin's params
    const B = [];
    function newBand(o) {
      return Object.assign({ Used: 1, Enabled: 1, Freq: 0.5, Gain: 0.5, Q: ToNorm.Q(1), Shape: 0, Slope: 0.2, Place: 0.5, Solo: 0,
        DynRange: 0.5, DynOn: 0, DynAuto: 1, Thr: 0.5, Att: 0.5, Rel: 0.5, ExtSC: 0, SCFilt: 0, SCLo: ToNorm.Freq(20), SCHi: ToNorm.Freq(20000),
        SCAud: 0, Spectral: 0, Density: 0.5, Tilt: 0.5 }, o);
    }
    function initBands() {
      for (let i = 1; i <= NUM; i++) B[i] = null;
      B[1] = newBand({ Freq: ToNorm.Freq(36), Shape: shapeNorm('Low Cut'), Slope: 0.4, Q: ToNorm.Q(0.75) });
      B[2] = newBand({ Freq: ToNorm.Freq(180), Gain: ToNorm.Gain(4), Q: ToNorm.Q(1.4) });
      B[3] = newBand({ Freq: ToNorm.Freq(900), Gain: ToNorm.Gain(-5), Q: ToNorm.Q(2.4), DynOn: 1, DynRange: ToNorm.Gain(4) });
      B[4] = newBand({ Freq: ToNorm.Freq(7000), Gain: ToNorm.Gain(6.6), Shape: shapeNorm('High Shelf'), Q: ToNorm.Q(0.7) });
      B[5] = newBand({ Freq: ToNorm.Freq(16500), Gain: ToNorm.Gain(5), Q: ToNorm.Q(1.3) });
      B[6] = newBand({ Freq: ToNorm.Freq(3000), Shape: shapeNorm('Notch'), Q: ToNorm.Q(6), Place: 0.75 });
      MOD[5] = { Freq: { amt: -0.055, M: 1 }, Gain: { amt: -0.1, M: 1 } };
    }
    // modulation (band -> key -> { amt, M }); base values stay in B, the live value includes the modulator
    const MOD = {};
    const lfo = M => (Math.sin(FXD.clock.beat * PI / 4 + M) + 1) / 2; // modulator output 0..1 (2 bars per cycle)
    initBands();
    const live = (Band, key) => { const b = B[Band], m = MOD[Band] && MOD[Band][key]; return m ? clamp(b[key] + m.amt * lfo(m.M)) : b[key]; };
    const modEnds = (Band, key) => { const m = MOD[Band] && MOD[Band][key]; if (!m || !m.amt) return null; return [clamp(B[Band][key]), clamp(B[Band][key] + m.amt), m.M]; };
    const anyMod = Band => !!(MOD[Band] && Object.keys(MOD[Band]).length);
    const FmtVal = (key, v) => key === 'Freq' ? hzLabel(Hz(v)) : key === 'Gain' ? DbLabel(Db(v)) : QLabel(Qr(v));
    const MOD_KEY_NAME = { Freq: 'Frequency', Gain: 'Gain', Q: 'Q' };
    const modLines = (Band, keys) => (keys || ['Freq', 'Gain', 'Q']).map(k => { const e = modEnds(Band, k); return e ? `LFO ${e[2]}  ${MOD_KEY_NAME[k]}: ${FmtVal(k, e[0])} ~ ${FmtVal(k, e[1])}` : null; }).filter(Boolean).join('\n');
    const modClrOf = (Band, key) => { const e = modEnds(Band, key); return e ? ModClr(e[2]) : null; };

    const st = {
      W: FXD.store.get('ff:pq:w', 420), panel: FXD.store.get('ff:pq:panel', true), page: 'Band', sel: 3,
      pop: null, popRect: null, nodeDrag: null, popDrag: null, popHold: null, listOff: { Band: 0, Dynamics: 0, Global: 0 },
      curveCache: {}, sums: null, sumSig: '', dragMoved: 0,
    };
    if (!DISPLAY_WIDTHS.some(d => d[1] === st.W)) st.W = 420;
    const totalW = () => st.W + (st.panel ? PANEL_GAP + PANEL_W : 0);
    const RangeDb = () => parseFloat(G.range.opts[idxOf(G.range.v, 4)]);
    const PxPerDb = () => (CURVE_H / 2) / RangeDb();
    const gsMul = () => G.gs.v * 2;

    const bandShape = b => SHAPES[idxOf(b.Shape, SHAPES.length)];
    const bandSlopeDb = b => Curves.ProQ4_NormToSlope(b.Slope);
    const bandPlace = b => PLACES[idxOf(b.Place, PLACES.length)];
    function Spec(shape, slopeDb, fN, gN, qN) {
      return { Shape: shape, Slope: slopeDb == null ? 12 : slopeDb, Freq: Hz(fN), Gain: Curves.ScaledGain(shape, Db(gN), gsMul()), Q: Qr(qN) };
    }
    const CUT_Q_DB = 60;
    function NodeDb(spec, rangeDb) {
      const k = GAIN_HANDLE[spec.Shape];
      if (k) return spec.Gain * k;
      if (IsCut(spec.Shape)) return clamp(CUT_Q_DB * Math.log(Math.max(spec.Q, 0.025)) / Math.log(1600), -rangeDb, rangeDb);
      return 0;
    }
    function CurveOf(key, spec, W) {
      const sig = spec.Shape + '|' + spec.Slope + '|' + spec.Freq + '|' + spec.Gain + '|' + spec.Q + '|' + W;
      const c = st.curveCache[key];
      if (c && c.sig === sig) return [c.pts, sig];
      const pts = Curves.BandCurveDb(spec, W, c && c.pts);
      st.curveCache[key] = { sig, pts };
      return [pts, sig];
    }

    // synthetic analyzer: a mix going in (pre) and the EQ'd signal coming out (post), Pro-Q's "Pre+Post" look
    const spec = { pre: null, w: 0 };
    function specStep(W, dt) {
      if (spec.w !== W) { spec.w = W; spec.pre = new Float32Array(W + 2).fill(-90); spec.target = new Float32Array(W + 2); spec.started = false; }
      if (!FXD.clock.playing && spec.started) return;
      const first = !spec.started;
      spec.started = true;
      const beat = FXD.clock.beat, t = FXD.clock.time;
      const fb = beat % 1, kick = Math.exp(-fb * 7), snare = (Math.floor(beat) % 2 === 1) ? Math.exp(-fb * 5) : 0, hat = Math.exp(-((beat * 2) % 1) * 9);
      const atk = 1 - Math.exp(-dt * 30), rel = 1 - Math.exp(-dt * 5);
      for (let i = 1; i <= W; i += 2) {
        const f = Curves.XToHz(i, W), lf = Math.log2(f), x = lf - 10;
        let v = -40 - 1.1 * x * x;
        if (f < 45) v -= Math.log2(45 / f) * 16;
        if (f > 13000) v -= Math.log2(f / 13000) * 34;
        v += 9 * Math.exp(-((lf - 6.2) ** 2) / 0.5) * (0.45 + kick);
        v += 5 * Math.exp(-((lf - 7.8) ** 2) / 0.9) * (0.5 + 0.8 * snare);
        v += hat * 6 * clamp((lf - 12) / 2, 0, 1);
        v += 2.6 * Math.sin(i * 0.31 + t * 2.3) * Math.sin(i * 0.083 - t * 1.4) + 1.6 * Math.sin(i * 0.9 + t * 7.1);
        const p = spec.pre[i];
        spec.pre[i] = first ? v : p + (v - p) * (v > p ? atk : rel);
        spec.pre[i + 1] = spec.pre[i];
      }
    }

    let I;
    const container = h('div', { style: { position: 'relative' } });
    body.append(container);
    mount(body, D, 0, 0, 0x101014ff);

    /* ------------------------------------------------------------------ frame */
    function drawAll(I) {
      const d = I.d, M = I.M, W = st.W, panelOn = st.panel, TW = totalW();
      const now = I.now();
      const bands = {};
      for (let i = 1; i <= NUM; i++) if (B[i] && B[i].Used >= 0.5) {
        const b = B[i];
        bands[i] = { Enabled: b.Enabled >= 0.5, Freq: live(i, 'Freq'), Gain: live(i, 'Gain'), Q: live(i, 'Q'), Shape: bandShape(b), SlopeDb: bandSlopeDb(b), Placement: bandPlace(b), Solo: b.Solo >= 0.5,
          DynRange: b.DynOn >= 0.5 && Math.abs(b.DynRange - 0.5) > 0.001 ? Db(b.DynRange) : null };
      }
      if (st.sel && !bands[st.sel]) st.sel = null;
      const pr = st.pop && st.popRect;
      const overPop = !!(pr && M.x >= pr[0] && M.x <= pr[2] && M.y >= pr[1] - 1 && M.y <= pr[3] + 1);
      I.blocked = overPop;
      Header(I, bands, W, TW, panelOn);
      I.blocked = false;
      const popDraw = Body(I, bands, W, overPop, now);
      if (panelOn) { I.blocked = overPop; Panel(I, bands, W + PANEL_GAP, HEADER_H, PANEL_W, CURVE_H); I.blocked = false; }
      if (popDraw) popDraw();
      // anchors for the "Try it" list
      if (bands[2] && st.nodePos[2]) I.setAnchor('node2', st.nodePos[2][0] - 10, st.nodePos[2][1] - 10, 20, 20);
      I.setAnchor('display', 0, HEADER_H, W, CURVE_H);
    }

    /* ---------------- header (Header in Pro Q Shared.lua) */
    function Pack(items, x1, x2, gap) {
      let kept = items.filter(it => it.Show !== false);
      const width = () => kept.reduce((s, it) => s + it.W, 0) + gap * Math.max(kept.length - 1, 0);
      while (kept.length && width() > x2 - x1) {
        let low = 0; kept.forEach((it, i) => { if (it.Prio < kept[low].Prio) low = i; });
        kept.splice(low, 1);
      }
      let x = x2 - width();
      for (const it of kept) { it.X = x; x += it.W + gap; }
      return x2 - width();
    }
    function PillBg(d, x1, y1, x2, y2, hov, onClr) {
      d.rectF(x1, y1, x2, y2, onClr ? WA(onClr, 0x33) : (hov ? HDR.PillHvr : HDR.Pill), 4);
      d.rect(x1, y1, x2, y2, onClr ? WA(onClr, 0xaa) : HDR.Edge, 4);
    }
    function PillText(I, x1, y1, x2, y2, s, clr, size) { size = size || 11; I.textC((x1 + x2) / 2, (y1 + y2 - size) / 2 - 0.5, clr, s, size); }
    function DrawShapeIcon(d, shape, x, y, w, hh, clr) {
      const GI = { Bell: 9, 'Low Shelf': 9, 'High Shelf': 9, 'Tilt Shelf': 12, 'Flat Tilt': 12 };
      const gn = GI[shape], zeroY = gn ? y + hh / 2 : y + hh * 0.3, N = 16;
      const g = I.g; g.strokeStyle = col(clr); g.lineWidth = 1.3; g.beginPath();
      for (let i = 0; i <= N; i++) {
        const f = 20 * 1000 ** (i / N);
        const db = Curves.MagDb(shape, 12, 632, gn || 0, shape === 'Band Pass' ? 2 : shape === 'Bell' ? 0.6 : 1, f);
        const nx = x + w * i / N, ny = clamp(zeroY - db * (hh / 2) / 12, y, y + hh);
        i ? g.lineTo(nx, ny) : g.moveTo(nx, ny);
      }
      g.stroke();
    }
    function enumMenu(p, x, y, set) {
      const n = p.opts.length, cur = idxOf(p.v, n);
      I.menu(p.opts.map((o, k) => ({ label: o, checked: k === cur, onClick: () => { (set || (v => { p.v = v; }))(k / (n - 1)); } })), x, y);
    }
    function shapeMenuItems(Band) {
      const cur = idxOf(B[Band].Shape, SHAPES.length);
      return SHAPES.map((s, k) => ({ label: s, checked: k === cur, icon: shapeSvg(s, 24, 10, k === cur ? '#ffca1f' : '#c0c0c8'),
        onClick: () => { if (B[Band]) { B[Band].Shape = k / (SHAPES.length - 1); api.check('shape'); } } }));
    }
    function stepSlope(Band, dir) { const b = B[Band]; b.Slope = clamp(Math.round(b.Slope * 10 + dir) / 10); }
    let FreqDragging = false, GainDragging = false, QDragging = false;

    function ValueDrag(I, Band, key, lbl, x, y, w, txtClr) {
      const it = I.item('hdr' + key, x, y, w, 18, { cursor: key === 'Gain' ? 'ns-resize' : 'ew-resize', wheel: true });
      const d = I.d, M = I.M;
      d.rectF(x, y, x + w, y + 18, it.hov || it.act ? HDR.PillHvr : HDR.Pill, 4);
      I.textC(x + w / 2, y + 3, txtClr, lbl, 11);
      if (it.hov && M.wheel && !it.act) {
        const step = (key === 'Gain' ? 0.5 / 60 : 0.01) * (M.shift ? 0.2 : 1);
        B[Band][key] = clamp(B[Band][key] + M.wheel * step);
        if (key === 'Q') api.check('q');
      }
      const mc = modClrOf(Band, key);
      if (mc) {
        d.line(x + 2, y + 17, x + w - 2, y + 17, mc, 2); d.circF(x + w - 4, y + 4, 2.5, mc);
        if (it.hov) I.tip(modLines(Band, [key]));
      }
      return it.act;
    }
    function EnumPill(I, p, id, x, y, w, short, tip) {
      const it = I.item(id, x, y, w, 18, { wheel: true });
      const n = p.opts.length, cur = idxOf(p.v, n), label = p.opts[cur];
      if (it.clicked) enumMenu(p, x, y + 20);
      if (it.hov && I.M.wheelN) p.v = clamp(cur + (I.M.wheelN > 0 ? 1 : -1), 0, n - 1) / (n - 1);
      if (it.hov && tip) I.tip(tip + ': ' + label);
      PillBg(I.d, x, y, x + w, y + 18, it.hov);
      let s = short ? short(label) : label;
      while (I.tw(s, 11) > w - 13 && s.length > 3) s = s.slice(0, -1);
      I.text(x + 6, y + 3, it.hov ? 0xffffffff : HDR.Txt, s, 11);
      const cx = x + w - 7, cy = y + 9;
      I.d.tri(cx - 3, cy - 1.5, cx + 3, cy - 1.5, cx, cy + 2, HDR.Dim);
    }
    function GlobalDrag(I, p, id, x, y, w, text, perPx, wheel, reset, tip) {
      const it = I.item(id, x, y, w, 18, { cursor: 'ew-resize', wheel: true });
      const fine = I.M.shift ? 0.2 : 1;
      if (it.act && I.M.dx) p.v = clamp(p.v + I.M.dx * perPx * fine);
      if (it.hov && I.M.wheel && !it.act) p.v = clamp(p.v + Math.sign(I.M.wheel) * wheel * fine);
      if (it.dbl && reset != null) p.v = reset;
      if (it.hov && tip) I.tip(tip);
      PillBg(I.d, x, y, x + w, y + 18, it.hov || it.act);
      PillText(I, x, y, x + w, y + 18, text, (it.hov || it.act) ? 0xffffffff : HDR.Txt);
    }
    function ToggleIcon(I, p, id, x, y, w, onClr, draw, tip) {
      const on = p.v >= 0.5;
      const it = I.item(id, x, y, w, 18);
      if (it.clicked) p.v = on ? 0 : 1;
      if (it.hov && tip) I.tip(tip);
      PillBg(I.d, x, y, x + w, y + 18, it.hov, on ? onClr : null);
      draw(x, y, x + w, y + 18, on ? onClr : (it.hov ? 0xffffffff : HDR.Dim));
    }
    function PowerIcon(d, cx, cy, c) { d.arc(cx, cy, 4.5, PI * 1.68, PI * 3.32, c, 1.5); d.line(cx, cy - 6, cx, cy - 1.5, c, 1.5); }

    function Header(I, bands, W, totalW, panelOn) {
      const d = I.d, M = I.M, Band = st.sel;
      const x0 = 8, y = 1;
      d.rectF(x0 - 4, y - 1, totalW, y + 19, HDR.Bg, 5);
      if (panelOn) { const dx = W + PANEL_GAP / 2; d.line(dx, y + 3, dx, y + 15, HDR.Line, 1); }
      const SHORT_MODE = { 'zero latency': 'Zero Lat', 'natural phase': 'Natural', 'linear phase': 'Linear' };
      const It = { Mode: { W: 58, Prio: 4 }, Char: { W: 52, Prio: 1 }, Out: { W: 52, Prio: 5 }, Auto: { W: 34, Prio: 2 }, Byp: { W: 20, Prio: 6 },
        GS: { W: 46, Prio: 8 }, Range: { W: 44, Prio: 9 }, Pane: { W: 16, Prio: 10 }, Set: { W: 16, Prio: 10 } };
      let bandR;
      if (panelOn) {
        Pack([It.Mode, It.Out, It.Byp, It.Pane, It.Set], W + PANEL_GAP + 2, totalW - 2, 2);
        bandR = Pack([It.Char, It.Auto, It.GS, It.Range], x0 + 52 + 150, W - 4, 3) - 6;
      } else {
        bandR = Pack([It.Char, It.Auto, It.Mode, It.Out, It.GS, It.Range, It.Byp, It.Pane, It.Set], x0 + 52 + 120, totalW - 2, 3) - 6;
      }
      FreqDragging = GainDragging = QDragging = false;
      const b = Band && bands[Band];
      if (b) {
        const [, clr, txtClr] = bandClr(Band);
        const cx = x0 + 8, cy = y + 9;
        d.circF(cx, cy, 8, b.Enabled ? clr : 0x4a4a4aff);
        I.textC(cx, cy - 6, 0x000000ff, String(Band), Band <= 9 ? 11 : 9.5, 600);
        const it = I.item('hdrShape', x0 + 20, y, 28, 18);
        if (it.clicked) I.menu(shapeMenuItems(Band), x0 + 20, y + 20);
        if (it.hov) { I.tip(b.Shape); d.rectF(x0 + 20, y, x0 + 48, y + 18, 0xffffff14, 4); }
        DrawShapeIcon(d, b.Shape, x0 + 23, y + 4, 22, 10, it.hov ? 0xffffffff : clr);
        const gx = x0 + 52, gap = 3;
        let wF = 66, wG = 58, wQ = 52;
        const k = clamp((bandR - gx - gap * 2) / (wF + wG + wQ), 0.5, 1);
        wF = Math.floor(wF * k); wG = Math.floor(wG * k); wQ = Math.floor(wQ * k);
        const tc = txtClr || 0xffffffff;
        FreqDragging = ValueDrag(I, Band, 'Freq', hzLabel(Hz(B[Band].Freq)), gx, y, wF, tc);
        if (GAIN_HANDLE[b.Shape]) GainDragging = ValueDrag(I, Band, 'Gain', DbLabel(Db(B[Band].Gain)), gx + wF + gap, y, wG, tc);
        else {
          const sx = gx + wF + gap, si = I.item('hdrSlope', sx, y, wG, 18, { wheel: true });
          if (si.clicked) stepSlope(Band, 1);
          if (si.hov && M.wheelN) stepSlope(Band, M.wheelN > 0 ? 1 : -1);
          if (si.hov) I.tip('Slope (scroll or click)');
          PillBg(d, sx, y, sx + wG, y + 18, si.hov);
          PillText(I, sx, y, sx + wG, y + 18, SlopeLabel(b.SlopeDb), tc);
        }
        QDragging = ValueDrag(I, Band, 'Q', 'Q ' + QLabel(Qr(B[Band].Q)), gx + wF + wG + gap * 2, y, wQ, tc);
      } else {
        const s = 'Double-click to add a band';
        if (bandR - x0 > I.tw(s, 10.5)) I.text(x0 + 4, y + 4, HDR.Dim, s, 10.5);
      }
      if (It.Mode.X != null) EnumPill(I, G.mode, 'hMode', It.Mode.X, y, It.Mode.W, s => SHORT_MODE[s.toLowerCase()] || s, 'Processing mode');
      if (It.Char.X != null) EnumPill(I, G.char, 'hChar', It.Char.X, y, It.Char.W, null, 'Character');
      if (It.Out.X != null) GlobalDrag(I, G.out, 'hOut', It.Out.X, y, It.Out.W, sdb(G.out.v * 72 - 36).replace(' dB', ' dB'), 0.1 / 72, 0.5 / 72, 0.5, 'Output level (double-click: 0 dB)');
      if (It.Auto.X != null) ToggleIcon(I, G.auto, 'hAuto', It.Auto.X, y, It.Auto.W, HDR.Accent, (x1, y1, x2, y2, c) => PillText(I, x1, y1, x2, y2, 'Auto', c, 10.5), 'Auto gain');
      if (It.GS.X != null) GlobalDrag(I, G.gs, 'hGS', It.GS.X, y, It.GS.W, Math.round(G.gs.v * 200) + '%', 0.0025, 0.025, 0.5, 'Gain scale (double-click: 100%)');
      if (It.Range.X != null) {
        const x = It.Range.X, it = I.item('hRange', x, y, It.Range.W, 18, { wheel: true });
        if (it.clicked) enumMenu({ opts: G.range.opts.map(o => '±' + parseFloat(o) + ' dB'), v: G.range.v }, x, y + 20, v => { G.range.v = v; });
        if (it.hov && M.wheelN) G.range.v = clamp(idxOf(G.range.v, 4) + (M.wheelN > 0 ? 1 : -1), 0, 3) / 3;
        if (it.hov) I.tip('Display range');
        PillBg(d, x, y, x + It.Range.W, y + 18, it.hov);
        PillText(I, x, y, x + It.Range.W, y + 18, '±' + Math.round(RangeDb()) + ' dB', it.hov ? 0xffffffff : HDR.Accent);
      }
      if (It.Byp.X != null) ToggleIcon(I, G.byp, 'hByp', It.Byp.X, y, It.Byp.W, HDR.Red, (x1, y1, x2, y2, c) => PowerIcon(d, (x1 + x2) / 2, (y1 + y2) / 2 + 1, c), G.byp.v >= 0.5 ? 'Bypassed (click to turn on)' : 'Bypass');
      if (It.Pane.X != null) {
        const x = It.Pane.X, it = I.item('hPane', x, y, 16, 18);
        if (it.clicked) setPanel(!panelOn);
        if (it.hov) I.tip(panelOn ? 'Hide side panel' : 'Show side panel');
        const c = it.hov ? 0xffffffff : HDR.Dim, a1 = x + 3, b1 = y + 4, a2 = x + 13, b2 = y + 14;
        d.rect(a1, b1, a2, b2, c, 2, 1.2);
        if (panelOn) d.rectF(a2 - 5, b1, a2, b2, c, 2); else d.line(a2 - 5, b1, a2 - 5, b2, c, 1);
      }
      if (It.Set.X != null) {
        const x = It.Set.X, it = I.item('hSet', x, y, 16, 18);
        const c = it.hov ? 0xffffffff : HDR.Dim;
        for (let i = -1; i <= 1; i++) d.circF(x + 8 + i * 4.5, y + 9, 1.6, c);
        if (it.clicked) I.menu([{ header: 'Display size' }, ...DISPLAY_WIDTHS.map(dw => ({ label: dw[0], checked: st.W === dw[1], onClick: () => setW(dw[1]) })),
          { sep: true }, { label: 'Side panel', checked: panelOn, onClick: () => setPanel(!panelOn) }], x + 16, y + 20, 1);
      }
    }
    function relayout() {
      D.setWidth(totalW() + 40);
      I.resize(totalW(), HEADER_H + CURVE_H);
    }
    function setW(w) { st.W = w; FXD.store.set('ff:pq:w', w); st.curveCache = {}; st.sumSig = ''; relayout(); }
    function setPanel(on) { st.panel = on; FXD.store.set('ff:pq:panel', on); relayout(); }

    /* ---------------- display (Body in Pro Q Shared.lua) */
    const FREQ_GRID = [20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 20000];
    const FREQ_LABELS = { 20: '20', 50: '50', 100: '100', 200: '200', 500: '500', 1000: '1k', 2000: '2k', 5000: '5k', 10000: '10k', 20000: '20k' };
    const DB_STEP = { 3: 1, 6: 2, 12: 3, 30: 10 };
    st.nodePos = {};

    function DrawDbLine(g, L, T, Bot, Ymid, pts, W, ppd, clr, thick) {
      const Y = db => clamp(Ymid - db * ppd, T - 20, Bot + 20);
      g.strokeStyle = col(clr); g.lineWidth = thick; g.beginPath(); g.moveTo(L, Y(pts[1]));
      for (let x = 3; x <= W + 1; x += 2) { const i = Math.min(x, W); g.lineTo(L + i - 1, Y(pts[i])); }
      g.stroke();
    }
    function FillDb(g, L, T, Bot, Ymid, from, to, W, ppd, clr) {
      const Y = db => clamp(Ymid - db * ppd, T - 2, Bot + 2);
      g.fillStyle = col(clr); g.beginPath();
      g.moveTo(L, Y(from[1]));
      for (let x = 1; x <= W; x += 2) g.lineTo(L + x - 1, Y(from[x]));
      for (let x = W - ((W - 1) % 2); x >= 1; x -= 2) g.lineTo(L + x - 1, to ? Y(to[x]) : Ymid);
      g.closePath(); g.fill();
    }
    function SoloRange(s) {
      const f = s.Freq, sh = s.Shape;
      if (sh === 'Low Shelf' || sh === 'Low Cut') return [10, f];
      if (sh === 'High Shelf' || sh === 'High Cut') return [f, 30000];
      if (sh === 'Tilt Shelf' || sh === 'Flat Tilt') return [10, 30000];
      const k = 1 / (2 * Math.max(s.Q || 1, 0.025)), m = Math.sqrt(1 + k * k);
      return [f * (m - k), f * (m + k)];
    }
    function deleteBand(Band) { delete MOD[Band]; B[Band] = null; if (st.pop && st.pop.Band === Band) st.pop = null; }
    function addBand(freqN, db) {
      let Band = 0;
      for (let i = 1; i <= NUM; i++) if (!B[i]) { Band = i; break; }
      if (!Band) return;
      const shape = freqN > 0.9 ? 'High Cut' : freqN < 0.1 ? 'Low Cut' : 'Bell';
      B[Band] = newBand({ Shape: shapeNorm(shape), Freq: clamp(freqN) });
      if (shape === 'Bell') B[Band].Gain = clamp(ToNorm.Gain(clamp(db / Math.max(gsMul(), 0.05), -30, 30)));
      st.sel = Band;
      api.check('add');
    }

    function Body(I, bands, W, overPop, now) {
      const d = I.d, g = I.g, M = I.M, H = CURVE_H, gs = gsMul(), ppd = PxPerDb(), range = RangeDb();
      const L = 0, T = HEADER_H, R = L + W, Bot = T + H, Ymid = T + H / 2;
      const inDisplay = M.inside && M.x >= L && M.x < R && M.y >= T && M.y < Bot && !I.menuOpen;
      d.clip(L, T, R, Bot);
      d.grad(L, T, R, Bot, CLR.BgTop, CLR.BgBottom);

      // curves (needed by the analyzer's post line too)
      const curves = {}, specs = {}, sigs = [];
      for (let Band = 1; Band <= NUM; Band++) {
        const b = bands[Band];
        if (!b) continue;
        specs[Band] = Spec(b.Shape, b.SlopeDb, b.Freq, b.Gain, b.Q);
        if (b.Enabled) { const [c, sig] = CurveOf(Band, specs[Band], W); curves[Band] = c; sigs.push(Band + (b.Placement || '') + sig); }
      }
      const sumSig = sigs.join(';');
      if (st.sumSig !== sumSig || !st.sums) {
        st.sumSig = sumSig;
        const sums = { All: new Float64Array(W + 1) };
        for (const k in curves) {
          const c = curves[k], ch = bands[k].Placement;
          if (ch && CHAN_LETTER[ch]) { if (!sums[ch]) sums[ch] = new Float64Array(W + 1); for (let i = 1; i <= W; i++) sums[ch][i] += c[i]; }
          else for (let i = 1; i <= W; i++) sums.All[i] += c[i];
        }
        for (const ch in sums) if (ch !== 'All') for (let i = 1; i <= W; i++) sums[ch][i] += sums.All[i];
        st.sums = sums;
      }
      const byp = G.byp.v >= 0.5;

      // analyzer (floor -102 dB, ceiling +6 dB over the display height)
      specStep(W, FXD.clock.dt || 0.016);
      const sy = db => T + (6 - db) / 108 * H;
      const pre = spec.pre;
      g.beginPath(); g.moveTo(L, Bot);
      for (let i = 1; i <= W; i += 2) g.lineTo(L + i - 1, sy(pre[i]));
      g.lineTo(R, Bot); g.closePath(); g.fillStyle = col(CLR.SpecPreFill); g.fill();
      g.beginPath(); for (let i = 1; i <= W; i += 2) i === 1 ? g.moveTo(L, sy(pre[i])) : g.lineTo(L + i - 1, sy(pre[i]));
      g.strokeStyle = col(CLR.SpecPreLine); g.lineWidth = 0.8; g.stroke();
      const all = st.sums.All;
      g.beginPath(); g.moveTo(L, Bot);
      for (let i = 1; i <= W; i += 2) g.lineTo(L + i - 1, sy(pre[i] + (byp ? 0 : Math.max(all[i], -80))));
      g.lineTo(R, Bot); g.closePath(); g.fillStyle = col(CLR.SpecPostFill); g.fill();
      g.beginPath(); for (let i = 1; i <= W; i += 2) { const yy = sy(pre[i] + (byp ? 0 : Math.max(all[i], -80))); i === 1 ? g.moveTo(L, yy) : g.lineTo(L + i - 1, yy); }
      g.strokeStyle = col(CLR.SpecPostLine); g.lineWidth = 1; g.stroke();

      // grid
      for (const f of FREQ_GRID) {
        const x = L + Curves.HzToX(f, W), major = f === 100 || f === 1000 || f === 10000;
        d.line(x, T, x, Bot, major ? CLR.GridMajor : CLR.GridMinor, 1);
        const lbl = FREQ_LABELS[f];
        if (lbl) I.textC(x, Bot - 12, CLR.Label, lbl, 9.5);
      }
      const step = DB_STEP[Math.round(range)] || range / 3;
      for (let db = step; db < range - 0.01; db += step) for (const s of [1, -1]) {
        const y = Ymid - s * db * ppd;
        d.line(L, y, R, y, CLR.GridMinor, 1);
        I.textR(R - 4, y - 6, CLR.Label, (s > 0 ? '+' : '-') + Math.round(db), 9.5);
      }
      d.line(L, Ymid, R, Ymid, CLR.Zero, 1);

      const Sel = st.sel;
      // every band's own curve, faint
      for (const k in curves) if (+k !== Sel) DrawDbLine(g, L, T, Bot, Ymid, curves[k], W, ppd, WA(bandClr(+k)[1], 0x45), 1);
      // dynamic bands: the range they move through
      for (const k in curves) {
        const b = bands[k];
        if (b.DynRange && GAIN_HANDLE[b.Shape]) {
          const s = specs[k];
          const [dc] = CurveOf('dyn' + k, { Shape: s.Shape, Slope: s.Slope, Freq: s.Freq, Q: s.Q, Gain: s.Gain + b.DynRange * gs }, W);
          FillDb(g, L, T, Bot, Ymid, dc, curves[k], W, ppd, WA(bandClr(+k)[1], +k === Sel ? 0x30 : 0x1c));
          DrawDbLine(g, L, T, Bot, Ymid, dc, W, ppd, WA(CLR.Dyn, +k === Sel ? 0xaa : 0x55), 1);
        }
      }
      if (Sel && curves[Sel]) {
        const clr = bandClr(Sel)[1];
        FillDb(g, L, T, Bot, Ymid, curves[Sel], null, W, ppd, WA(clr, GAIN_HANDLE[bands[Sel].Shape] ? 0x38 : 0x20));
        DrawDbLine(g, L, T, Bot, Ymid, curves[Sel], W, ppd, WA(clr, 0xdd), 1.5);
      }
      for (const ch in st.sums) if (ch !== 'All') DrawDbLine(g, L, T, Bot, Ymid, st.sums[ch], W, ppd, CLR.Chan[ch], 1.5);
      DrawDbLine(g, L, T, Bot, Ymid, st.sums.All, W, ppd, CLR.Curve, 2.2);

      let soloBand = null;
      for (let k = 1; k <= NUM; k++) if (bands[k] && (bands[k].Solo || st.popHold === k)) { soloBand = k; break; }
      if (soloBand) {
        d.rectF(L, T, R, Bot, 0x000000a0);
        const s = specs[soloBand], clr = bandClr(soloBand)[1];
        const [lo, hi] = SoloRange(s);
        const x1 = L + clamp(Curves.HzToX(lo, W), 0, W), x2 = L + clamp(Curves.HzToX(hi, W), 0, W);
        d.grad(x1, T, x2, Bot, WA(clr, 0x50), WA(clr, 0x0c));
        d.line(x1, T, x1, Bot, WA(clr, 0x90), 1); d.line(x2, T, x2, Bot, WA(clr, 0x90), 1);
        if (curves[soloBand]) DrawDbLine(g, L, T, Bot, Ymid, curves[soloBand], W, ppd, clr, 2);
        I.text(clamp((x1 + x2) / 2 - I.tw('SOLO', 10) / 2, L + 2, R - 30), T + 4, clr, 'SOLO', 10, 600);
      }

      // nodes
      let hoveredBand = null, tipBand = null;
      const Near = (x, y) => Math.abs(M.x - x) < 10 && Math.abs(M.y - y) < 10;
      const nodePos = {};
      const order = [];
      for (let k = 1; k <= NUM; k++) if (bands[k] && k !== Sel) order.push(k);
      if (Sel && bands[Sel]) order.push(Sel);
      for (const Band of order) {
        const b = bands[Band];
        const NodeX = L + Curves.HzToX(specs[Band].Freq, W);
        const NY = clamp(Ymid - NodeDb(specs[Band], range) * ppd, T + 6, Bot - 6);
        const am = anyMod(Band);
        let BaseX = NodeX, BaseY = NY;
        if (am) {
          const bb = B[Band], bs = Spec(b.Shape, b.SlopeDb, bb.Freq, bb.Gain, bb.Q);
          BaseX = L + Curves.HzToX(bs.Freq, W);
          BaseY = clamp(Ymid - NodeDb(bs, range) * ppd, T + 6, Bot - 6);
          // ranges: hollow end = modulator at 0, filled end = at full
          const vk = VertKey(b.Shape);
          const fe = modEnds(Band, 'Freq'), ve = vk && modEnds(Band, vk);
          if (fe || ve) {
            const clr = ModClr((fe || ve)[2]);
            const Pos = (fv, vv) => {
              const x = fv != null ? L + Curves.HzToX(Hz(fv), W) : BaseX;
              if (vv == null) return [x, BaseY];
              const t = { Freq: bb.Freq, Gain: bb.Gain, Q: bb.Q }; t[vk] = vv;
              return [x, Ymid - NodeDb(Spec(b.Shape, b.SlopeDb, t.Freq, t.Gain, t.Q), range) * ppd];
            };
            const [x1, y1] = Pos(fe && fe[0], ve && ve[0]), [x2, y2] = Pos(fe && fe[1], ve && ve[1]);
            d.line(x1, y1, x2, y2, clr, 2); d.circ(x1, y1, 3, clr, 1.5); d.circF(x2, y2, 3.5, clr);
          }
          d.circ(BaseX, BaseY, 6, 0xffffff77, 1.5);
        }
        nodePos[Band] = [NodeX, NY];
        const [half, full] = bandClr(Band);
        const sel = Band === Sel;
        const hov = Near(NodeX, NY) || (am && Near(BaseX, BaseY));
        if (IsCut(b.Shape)) {
          const cy = clamp(Ymid - Curves.MagDb(b.Shape, specs[Band].Slope, specs[Band].Freq, 0, specs[Band].Q, specs[Band].Freq) * ppd, T, Bot);
          if (Math.abs(cy - NY) > 7) d.line(NodeX, NY + (cy > NY ? 6 : -6), NodeX, cy, WA(full, 0xb0), 1);
        }
        if (hov || sel) d.circF(NodeX, NY, 11, WA(full, sel ? 0x2c : 0x1e));
        d.circF(NodeX, NY + 0.8, 7.2, 0x00000070);
        d.circF(NodeX, NY, 5.6, b.Enabled ? full : 0x4a4a4aff);
        d.circF(NodeX - 1.2, NY - 1.6, 2.6, b.Enabled ? 0xffffff40 : 0xffffff18);
        d.circ(NodeX, NY, 6.3, sel ? 0xffffffff : hov ? 0xf0f0f0e0 : (b.Enabled ? 0xd8d8dcb0 : WA(half, 0xc0)), sel ? 2 : 1.4);
        const letter = CHAN_LETTER[b.Placement];
        if (letter) I.text(NodeX + 7, NY - 14, CLR.Chan[b.Placement], letter, 9, 600);
        if (b.DynRange && GAIN_HANDLE[b.Shape]) {
          const ty = clamp(NY - b.DynRange * gs * GAIN_HANDLE[b.Shape] * ppd, T + 2, Bot - 2), dir = ty < NY ? -1 : 1;
          d.line(NodeX, NY + dir * 8, NodeX, ty, CLR.Dyn, 1.5);
          d.tri(NodeX - 3, ty - dir * 4, NodeX + 3, ty - dir * 4, NodeX, ty, CLR.Dyn);
        }
        if (soloBand && Band !== soloBand) d.circF(NodeX, NY, 8, 0x000000a0);
        else if (soloBand) d.circ(NodeX, NY, 12, full, 2);
        if (hov && inDisplay && !(overPop && st.pop.Band !== Band)) {
          hoveredBand = Band;
          if (am && !M.down) tipBand = Band;
        }
      }
      st.nodePos = nodePos;

      if (hoveredBand) {
        const Band = hoveredBand, b = bands[Band];
        if (M.pressed && M.alt && !M.shift && !M.ctrl) deleteBand(Band);
        else if (M.pressed) { st.sel = Band; st.nodeDrag = Band; st.dragMoved = 0; I.active = 'node'; }
        if (M.dbl && B[Band]) B[Band].Enabled = b.Enabled ? 0 : 1;
        if (M.wheel && !M.down && B[Band]) {
          if (M.alt) nudgeDyn(Band, Math.sign(M.wheel));
          else { B[Band].Q = clamp(B[Band].Q + M.wheel * 0.02 * (M.shift ? 0.2 : 1)); api.check('q'); }
        }
        if (M.rpressed && B[Band]) I.menu(bandMenuItems(Band), M.x + 4, M.y + 4);
        I.cursor = 'pointer';
      }
      if (hoveredBand || overPop) I.wheelArea(0, 0, I.W, I.H);
      else I.wheelArea(0, 0, 0, 0);

      // hovering a modulated node: its sweep and ranges
      if (tipBand && bands[tipBand]) {
        drawSweep(g, tipBand, bands[tipBand], L, T, Bot, W, Ymid, ppd);
        if (!(st.pop && st.pop.Band === tipBand)) I.tip(modLines(tipBand) + '\n(right-drag to change, double right-click to remove)');
      }

      // node drag: frequency and gain (Q for cuts), so the node follows the mouse
      const dragBand = st.nodeDrag;
      if (dragBand && (!M.down || !bands[dragBand])) st.nodeDrag = null;
      else if (dragBand) {
        const fine = M.shift ? 0.2 : 1, b = bands[dragBand], bb = B[dragBand];
        st.sel = dragBand;
        if (M.dx) bb.Freq = clamp(bb.Freq + M.dx / W * fine);
        const vk = VertKey(b.Shape);
        if (M.dy && vk === 'Gain') { const k = GAIN_HANDLE[b.Shape] * Math.max(gs, 0.05); bb.Gain = clamp(ToNorm.Gain(Db(bb.Gain) - M.dy / ppd / k * fine)); }
        else if (M.dy && vk === 'Q') bb.Q = clamp(bb.Q - M.dy / (CUT_Q_DB * ppd) * fine);
        st.dragMoved += Math.abs(M.dx) + Math.abs(M.dy);
        if (st.dragMoved > 4 && dragBand === 2) api.check('drag');
        I.cursor = 'grabbing';
      }

      // the node popup: opens under the hovered node, follows it, closes a moment after the mouse leaves
      const popBand = !st.nodeDrag && hoveredBand;
      if (popBand) { if (!st.pop || st.pop.Band !== popBand) st.pop = { Band: popBand }; st.pop.T = now; }
      else if (st.pop && (overPop || I.menuOpen || st.popDrag || st.popHold)) st.pop.T = now;
      if (st.pop && (st.nodeDrag || !bands[st.pop.Band] || !nodePos[st.pop.Band] || (now - st.pop.T > (M.touch ? 1e9 : 0.35)))) st.pop = null;
      if (M.touch && M.pressed && inDisplay && !hoveredBand && !overPop) st.pop = null;

      // double-click empty space: add a band there
      if (inDisplay && M.dbl && M.pressed && !hoveredBand && !overPop) addBand((M.x - L) / W, (Ymid - M.y) / ppd);
      if (byp) d.rectF(L, T, R, Bot, 0x00000088);
      d.unclip();

      // header value drags act on the selected band
      if (st.sel && B[st.sel]) {
        const bb = B[st.sel], fine = M.shift ? 0.2 : 1;
        if (GainDragging && M.dy) bb.Gain = clamp(ToNorm.Gain(Db(bb.Gain) - M.dy * 0.1 * fine));
        if (QDragging && M.dx) { bb.Q = clamp(bb.Q + M.dx / 300 * fine); api.check('q'); }
        if (FreqDragging && M.dx) bb.Freq = clamp(bb.Freq + M.dx / 400 * fine);
      }
      PopupDrags(M, bands, W);

      if (st.pop) {
        const pop = st.pop, [nx, ny] = nodePos[pop.Band];
        if (!pop.Off) {
          const lines = Object.values(st.sums).map(sm => [sm, 1]);
          if (curves[pop.Band]) lines.push([curves[pop.Band], 0.6]);
          const [x, y, side] = PlacePopup(pop.Band, nx, ny, L, T, R, Bot, W, Ymid, ppd, lines, nodePos, [0, 0, I.W, I.H]);
          pop.Off = [x - nx, y - ny, side];
        }
        return () => NodePopup(I, pop.Band, bands[pop.Band], nx, ny, nx + pop.Off[0], ny + pop.Off[1], pop.Off[2]);
      }
      st.popRect = null;
      return null;
    }
    function drawSweep(g, Band, b, L, T, Bot, W, Ymid, ppd) {
      const A = {}, Bv = {};
      for (const k of ['Freq', 'Gain', 'Q']) {
        const base = B[Band][k]; A[k] = base; Bv[k] = base;
        const e = modEnds(Band, k);
        if (e) { A[k] = e[0]; Bv[k] = e[1]; }
      }
      const clr = bandClr(Band)[1];
      [A, Bv].forEach((c, i) => {
        const [pts] = CurveOf('sweep' + i, Spec(b.Shape, b.SlopeDb, c.Freq, c.Gain, c.Q), W);
        DrawDbLine(g, L, T, Bot, Ymid, pts, W, ppd, WA(clr, i === 1 ? 0xee : 0x99), i === 1 ? 2 : 1);
      });
    }
    function nudgeDyn(Band, steps) {
      const bb = B[Band];
      if (bb.DynOn < 0.5) bb.DynOn = 1;
      bb.DynRange = clamp(bb.DynRange + steps * (I.M.shift ? 0.1 : 0.5) / 60);
    }

    const POP_W = 136, POP_H = 60, SEMITONE = 1 / (12 * Math.log2(3000));
    const POP_SPOTS = [
      [(nx, ny) => [nx - POP_W / 2, ny + 13], 'below'], [(nx, ny) => [nx - POP_W / 2, ny - 13 - POP_H], 'above'],
      [(nx, ny) => [nx + 14, ny - POP_H / 2], 'right'], [(nx, ny) => [nx - 14 - POP_W, ny - POP_H / 2], 'left'],
      [(nx, ny) => [nx - 22, ny + 13], 'below'], [(nx, ny) => [nx - POP_W + 22, ny + 13], 'below'],
      [(nx, ny) => [nx - 22, ny - 13 - POP_H], 'above'], [(nx, ny) => [nx - POP_W + 22, ny - 13 - POP_H], 'above'],
    ];
    function PlacePopup(Band, nx, ny, L, T, R, Bot, W, Ymid, ppd, lines, nodePos, vp) {
      let best = Infinity, bx = 0, by = 0, bside = 'below';
      POP_SPOTS.forEach((spot, i) => {
        const [x, y] = spot[0](nx, ny);
        let sc = (i + 1) * 0.5;
        if (x < vp[0] || y < vp[1] || x + POP_W > vp[2] || y + POP_H > vp[3]) sc += 1e6;
        sc += (Math.max(0, L - x) + Math.max(0, x + POP_W - R)) * 0.15 + (Math.max(0, T - y) + Math.max(0, y + POP_H - Bot)) * 0.3;
        for (let px = x; px <= x + POP_W; px += 2) {
          const c = Math.floor(px - L) + 1;
          if (c >= 1 && c <= W) for (const ln of lines) {
            const yy = clamp(Ymid - (ln[0][c] || 0) * ppd, T, Bot);
            if (yy >= y - 3 && yy <= y + POP_H + 3) sc += ln[1];
          }
        }
        for (const k in nodePos) {
          const p = nodePos[k];
          if (+k !== Band && p[0] >= x - 8 && p[0] <= x + POP_W + 8 && p[1] >= y - 8 && p[1] <= y + POP_H + 8) sc += 25;
        }
        if (sc < best) { best = sc; bx = x; by = y; bside = spot[1]; }
      });
      if (best >= 1e6) {
        bx = nx - POP_W / 2; by = ny + 13; bside = 'below';
        if (by + POP_H > vp[3]) { by = ny - 13 - POP_H; bside = 'above'; }
        bx = clamp(bx, vp[0] + 2, vp[2] - POP_W - 2); by = clamp(by, vp[1] + 2, vp[3] - POP_H - 2);
      }
      return [bx, by, bside];
    }

    function NodePopup(I, Band, b, nx, ny, x, y, side) {
      const d = I.d, M = I.M, g = I.g, bb = B[Band];
      st.popRect = [Math.min(x, nx), Math.min(y, ny), Math.max(x + POP_W, nx), Math.max(y + POP_H, ny)];
      const bg = 0x1d1d24f4;
      d.rectF(x, y, x + POP_W, y + POP_H, bg, 6);
      d.rect(x, y, x + POP_W, y + POP_H, 0xffffff26, 6);
      const px = clamp(nx, x + 10, x + POP_W - 10), py = clamp(ny, y + 10, y + POP_H - 10);
      if (side === 'below') d.tri(px - 6, y + 0.5, px + 6, y + 0.5, px, y - 6, bg);
      else if (side === 'above') d.tri(px - 6, y + POP_H - 0.5, px, y + POP_H + 6, px + 6, y + POP_H - 0.5, bg);
      else if (side === 'right') d.tri(x + 0.5, py - 6, x + 0.5, py + 6, x - 6, py, bg);
      else d.tri(x + POP_W - 0.5, py - 6, x + POP_W + 6, py, x + POP_W - 0.5, py + 6, bg);
      const menuX = x + POP_W + 190 > I.W ? x - 4 : x + POP_W + 4, menuPiv = x + POP_W + 190 > I.W ? 1 : 0;
      const interactive = !st.nodeDrag && !I.menuOpen;
      const In = (x1, y1, x2, y2) => M.x >= x1 && M.x <= x2 && M.y >= y1 && M.y <= y2;
      const Hot = (x1, y1, x2, y2, tip) => { const hh = interactive && In(x1, y1, x2, y2); if (hh && tip) I.tip(tip); if (hh) I.cursor = 'pointer'; return hh; };
      const Clicked = hh => hh && M.pressed;
      const fine = M.shift ? 0.2 : 1;
      if (interactive && In(x, y, x + POP_W, y + POP_H)) { I.hotTaken = true; if (M.pressed) I.active = 'popup'; }

      // row 1: bypass, frequency, solo, delete
      const r1 = y + 4;
      const hp = Hot(x + 4, r1, x + 24, r1 + 18, b.Enabled ? 'Bypass band' : 'Enable band');
      { const cx = x + 14, cy = r1 + 9, c = b.Enabled ? (hp ? 0xffe070ff : 0xffca1fff) : (hp ? 0xbbbbbbff : 0x777777ff); d.arc(cx, cy, 5, PI * 1.68, PI * 3.32, c, 1.6); d.line(cx, cy - 7, cx, cy - 1.5, c, 1.6); }
      if (Clicked(hp)) bb.Enabled = b.Enabled ? 0 : 1;
      const fLbl = hzLabel(Hz(bb.Freq)), fx1 = x + 26, fx2 = x + POP_W - 46;
      const hf = Hot(fx1, r1, fx2, r1 + 18);
      I.textC((fx1 + fx2) / 2, r1 + 1, hf ? 0xffffffff : 0xeeeeeeff, fLbl, 13);
      { const hx = x + POP_W - 42, hs = Hot(hx - 9, r1, hx + 9, r1 + 18, 'Hold to solo the band'), on = bb.Solo >= 0.5 || st.popHold === Band;
        const c = on ? 0xffca1fff : hs ? 0xffffffff : 0xaaaaaaff;
        d.arc(hx, r1 + 10, 5.5, PI, PI * 2, c, 1.5); d.rectF(hx - 7, r1 + 9, hx - 4, r1 + 15, c, 1); d.rectF(hx + 4, r1 + 9, hx + 7, r1 + 15, c, 1);
        if (Clicked(hs)) st.popHold = Band; }
      const dx1 = x + POP_W - 24, hd = Hot(dx1, y + 2, x + POP_W - 2, y + 22, 'Delete band');
      d.rectF(dx1, y + 2, x + POP_W - 2, y + 22, hd ? 0x3a2a2eff : 0x2a2a32ff, 5);
      { const cx = dx1 + 11, cy = y + 12, c = hd ? 0xff7070ff : 0xb0b0b0ff; d.line(cx - 4, cy - 4, cx + 4, cy + 4, c, 1.6); d.line(cx - 4, cy + 4, cx + 4, cy - 4, c, 1.6); }
      if (Clicked(hd)) { deleteBand(Band); return; }

      // row 2: gain (slope for shapes without gain), dynamic range
      const r2 = y + 23, hasGain = GAIN_HANDLE[b.Shape];
      const hg = Hot(x + 26, r2, x + POP_W - 26, r2 + 16);
      const gLbl = hasGain ? DbLabel(Db(bb.Gain)) : SlopeLabel(b.SlopeDb);
      I.textC(x + POP_W / 2, r2 + 2, hg ? 0xffffffff : 0xa8a8b2ff, gLbl, 11.5);
      if (b.DynRange) {
        const dl = (b.DynRange > 0 ? '+' : '') + b.DynRange.toFixed(1), tx = x + POP_W - 8 - I.tw(dl, 10);
        I.text(tx, r2 + 3, CLR.Dyn, dl, 10);
        const ax = tx - 6;
        d.line(ax, r2 + 4, ax, r2 + 13, CLR.Dyn, 1.2);
        d.tri(ax - 2.5, r2 + 6, ax + 2.5, r2 + 6, ax, r2 + 3, CLR.Dyn); d.tri(ax - 2.5, r2 + 11, ax, r2 + 14, ax + 2.5, r2 + 11, CLR.Dyn);
      }
      if (hg && !(hasGain && modClrOf(Band, 'Gain'))) I.tip(hasGain ? 'Drag or scroll: gain\nAlt+scroll: dynamic range' : 'Scroll: slope');

      // row 3: shape, Q, menu
      const r3 = y + 41;
      const hsh = Hot(x + 4, r3, x + 32, r3 + 16, b.Shape + ' (click to change)');
      if (hsh) d.rectF(x + 4, r3, x + 32, r3 + 16, 0xffffff14, 4);
      DrawShapeIcon(d, b.Shape, x + 7, r3 + 3, 22, 10, hsh ? 0xffffffff : 0xb4b4bcff);
      if (Clicked(hsh)) I.menu(shapeMenuItems(Band), menuX, y, menuPiv);
      const qLbl = 'Q: ' + QLabel(Qr(bb.Q)), hq = Hot(x + 34, r3, x + POP_W - 24, r3 + 16);
      I.textC(x + POP_W / 2, r3 + 2, hq ? 0xffffffff : 0xc8c8d0ff, qLbl, 11.5);
      const hm = Hot(x + POP_W - 22, r3, x + POP_W - 4, r3 + 16, 'More');
      { const cx = x + POP_W - 13, cy = r3 + 8, c = hm ? 0xffffffff : 0xa0a0a8ff; d.line(cx - 4, cy - 2, cx, cy + 2, c, 1.5); d.line(cx, cy + 2, cx + 4, cy - 2, c, 1.5); }
      if (Clicked(hm)) I.menu(bandMenuItems(Band), menuX, y, menuPiv);
      // modulated values: a dot in the modulator's colour, the range on hover
      const ModMark = (key, hot, lx, cy) => { const mc = modClrOf(Band, key); if (!mc) return; d.circF(lx - 6, cy, 2.5, mc); if (hot) I.tip(modLines(Band, [key])); };
      ModMark('Freq', hf, (fx1 + fx2 - I.tw(fLbl, 13)) / 2, r1 + 9);
      if (hasGain) ModMark('Gain', hg, x + (POP_W - I.tw(gLbl, 11.5)) / 2, r2 + 8);
      ModMark('Q', hq, x + (POP_W - I.tw(qLbl, 11.5)) / 2, r3 + 8);
      if (hf || (hg && hasGain)) I.cursor = 'ew-resize';
      if (hg && hasGain) I.cursor = 'ns-resize';
      if (hq) I.cursor = 'ew-resize';

      // drags and wheel on the values
      if (M.pressed) {
        if (hf) st.popDrag = { Band, Key: 'Freq' };
        else if (hg && hasGain) st.popDrag = { Band, Key: 'Gain' };
        else if (hq) st.popDrag = { Band, Key: 'Q' };
      }
      if (M.wheel && interactive && In(x, y, x + POP_W, y + POP_H)) {
        const dir = M.wheel > 0 ? 1 : -1;
        if (M.alt) nudgeDyn(Band, dir);
        else if (hf) bb.Freq = clamp(bb.Freq + dir * SEMITONE * fine);
        else if (hg && hasGain) bb.Gain = clamp(ToNorm.Gain(Db(bb.Gain) + dir * 0.5 * fine));
        else if (hg) { if (M.wheelN) stepSlope(Band, M.wheelN > 0 ? 1 : -1); }
        else if (hq) { bb.Q = clamp(bb.Q + dir * 0.02 * fine); api.check('q'); }
      }
    }
    function PopupDrags(M, bands, W) {
      let dd = st.popDrag;
      if (dd && (!M.down || !bands[dd.Band])) { st.popDrag = dd = null; }
      if (dd) {
        const fine = M.shift ? 0.2 : 1, bb = B[dd.Band];
        if (dd.Key === 'Freq' && M.dx) bb.Freq = clamp(bb.Freq + M.dx / W * fine);
        else if (dd.Key === 'Gain' && M.dy) bb.Gain = clamp(ToNorm.Gain(Db(bb.Gain) - M.dy * 0.1 * fine));
        else if (dd.Key === 'Q' && M.dx) { bb.Q = clamp(bb.Q + M.dx / 300 * fine); api.check('q'); }
      }
      if (st.popHold && !M.down) st.popHold = null;
    }

    let Clip = null;
    function bandMenuItems(Band) {
      const bb = B[Band], shape = bandShape(bb), hasGain = GAIN_HANDLE[shape];
      const dynamic = Math.abs(bb.DynRange - 0.5) > 0.001;
      const items = [{ label: bb.Enabled >= 0.5 ? 'Disable' : 'Enable', onClick: () => { bb.Enabled = bb.Enabled >= 0.5 ? 0 : 1; } },
        { label: 'Invert Gain', disabled: !hasGain, onClick: () => { bb.Gain = 1 - bb.Gain; bb.DynRange = 1 - bb.DynRange; } }];
      if (dynamic) {
        items.push({ label: bb.DynOn >= 0.5 ? 'Disable Dynamics' : 'Enable Dynamics', onClick: () => { bb.DynOn = bb.DynOn >= 0.5 ? 0 : 1; } });
        items.push({ label: 'Clear Dynamics', onClick: () => { bb.DynRange = 0.5; } });
      } else items.push({ label: 'Make Dynamic', onClick: () => { bb.DynOn = 1; bb.DynRange = ToNorm.Gain(-3); } });
      items.push({ label: bb.Spectral >= 0.5 ? 'Make Non-Spectral' : 'Make Spectral', onClick: () => { bb.Spectral = bb.Spectral >= 0.5 ? 0 : 1; } });
      if (anyMod(Band)) items.push({ label: 'Remove Modulation', onClick: () => { delete MOD[Band]; } });
      items.push({ sep: true });
      items.push({ label: 'Shape', sub: shapeMenuItems(Band) });
      const stops = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
      items.push({ label: 'Slope', sub: stops.map(v => ({ label: v === 0 ? '0 dB/oct' : SlopeLabel(Curves.ProQ4_NormToSlope(v)), checked: Math.abs(v - bb.Slope) < 0.02, onClick: () => { bb.Slope = v; } })) });
      items.push({ label: 'Stereo Placement', sub: PLACES.map((p, k) => ({ label: p, checked: idxOf(bb.Place, 5) === k, onClick: () => { bb.Place = k / 4; } })) });
      items.push({ sep: true });
      items.push({ label: 'Cut', onClick: () => { Clip = Object.assign({}, bb); deleteBand(Band); } });
      items.push({ label: 'Copy', onClick: () => { Clip = Object.assign({}, bb); } });
      items.push({ label: 'Paste', disabled: !Clip, onClick: () => { const nb = pasteBand(Clip); if (nb) st.sel = nb; } });
      items.push({ sep: true });
      const canSplit = bandPlace(bb) === 'Stereo';
      items.push({ label: 'Split', disabled: !canSplit, onClick: () => {
        let ms = false; for (let k = 1; k <= NUM; k++) if (B[k] && ['Mid', 'Side'].includes(bandPlace(B[k]))) ms = true;
        const nb = pasteBand(bb);
        if (nb) { bb.Place = PLACES.indexOf(ms ? 'Mid' : 'Left') / 4; B[nb].Place = PLACES.indexOf(ms ? 'Side' : 'Right') / 4; }
      } });
      items.push({ label: 'Delete', onClick: () => deleteBand(Band) });
      return items;
    }
    function pasteBand(c) {
      for (let k = 1; k <= NUM; k++) if (!B[k]) { B[k] = Object.assign({}, c, { Solo: 0 }); return k; }
      return 0;
    }

    /* ---------------- side panel */
    function Txt(I, x, y, c, s, size) { I.text(x, y, c, s, size || TXT); }
    function PrmSlider(I, id, x, y, w, hh, name, v, fmt, clr, set, wheelStep) {
      const it = I.item(id, x, y, w, hh, { cursor: 'ew-resize', wheel: true });
      const d = I.d, M = I.M, s = fmt(v);
      d.rectF(x, y, x + w, y + hh, it.hov || it.act ? PANEL_CLR.RowHvr : PANEL_CLR.Row, 3);
      if (v > 0.002) d.rectF(x, y, x + w * v, y + hh, WA(clr, 0x50), 3);
      d.clip(x, y, x + w, y + hh);
      Txt(I, x + 4, y + (hh - TXT) / 2 - 1, PANEL_CLR.Dim, name);
      I.textR(x + w - 4, y + (hh - TXT) / 2 - 1, PANEL_CLR.Text, s, TXT);
      d.unclip();
      if (it.act && M.dx) set(clamp(v + M.dx / (w * (M.shift ? 6 : 1))));
      else if (it.hov && M.wheel) {
        let st2 = wheelStep || 0.01, nv = v + Math.sign(M.wheel) * (M.shift ? st2 / 10 : st2);
        if (st2 >= 0.1 && !M.shift) nv = Math.round(nv / st2) * st2;
        set(clamp(nv));
      }
      if (it.hov && I.tw(name, TXT) + I.tw(s, TXT) + 12 > w) I.tip(name + ': ' + s);
    }
    function PrmToggle(I, id, x, y, w, hh, name, on, clr, set) {
      const it = I.item(id, x, y, w, hh);
      if (it.clicked) set(on ? 0 : 1);
      I.d.rectF(x, y, x + w, y + hh, on ? WA(clr, it.hov ? 0xee : 0xbb) : (it.hov ? PANEL_CLR.RowHvr : PANEL_CLR.Row), 3);
      I.d.clip(x, y, x + w, y + hh);
      I.textC(x + w / 2, y + (hh - TXT) / 2 - 1, on ? 0x111111ff : PANEL_CLR.Dim, name, TXT);
      I.d.unclip();
      if (it.hov && I.tw(name, TXT) > w) I.tip(name);
    }
    function PrmCombo(I, id, x, y, w, name, opts, v, set) {
      const n = opts.length, i = idxOf(v, n), cur = opts[i];
      const nameW = name ? Math.min(I.tw(name, TXT) + 6, w * 0.45) : 0;
      if (name) { I.d.clip(x, y, x + nameW - 2, y + 17); Txt(I, x + 2, y + 2, PANEL_CLR.Dim, name); I.d.unclip(); }
      const bx = x + nameW, bw = w - nameW;
      const it = I.item(id, bx, y, bw, 17, { wheel: true });
      I.d.rectF(bx, y, bx + bw, y + 17, it.hov ? PANEL_CLR.RowHvr : PANEL_CLR.Row, 3);
      I.d.rectF(bx + bw - 17, y, bx + bw, y + 17, 0x2d2d2dff, 3);
      I.d.tri(bx + bw - 12, y + 6, bx + bw - 5, y + 6, bx + bw - 8.5, y + 11, PANEL_CLR.Text);
      I.d.clip(bx, y, bx + bw - 18, y + 17); Txt(I, bx + 4, y + 2, PANEL_CLR.Text, cur); I.d.unclip();
      if (it.clicked) I.menu(opts.map((o, k) => ({ label: o, checked: k === i, onClick: () => set(k / (n - 1)) })), bx, y + 19);
      if (it.hov && I.M.wheelN) set(clamp(i + (I.M.wheelN > 0 ? -1 : 1), 0, n - 1) / (n - 1));
      if (it.hov && name && I.tw(name, TXT) + 6 > nameW) I.tip(name + ': ' + cur);
    }
    function PrmKnob(I, id, x, y, w, name, v, fmt, clr, set) {
      const rad = 11, hh = TXT + 2 + rad * 2 + 3 + TXT;
      const it = I.item(id, x, y, w, hh, { cursor: 'ns-resize', wheel: true });
      const d = I.d, cx = x + w / 2, cy = y + TXT + 2 + rad;
      const short = name.replace('Dynamic ', '').replace('Dynamics ', '');
      I.textC(cx, y, PANEL_CLR.Dim, short, 10);
      const a0 = PI * 0.75, a1 = PI * 2.25;
      d.arc(cx, cy, rad - 1, a0, a1, 0x333333ff, 3);
      if (v > 0.001) d.arc(cx, cy, rad - 1, a0, a0 + (a1 - a0) * v, clr, 3);
      d.circF(cx, cy, rad - 4, it.hov || it.act ? 0x3a3a3aff : 0x2a2a2aff);
      const a = a0 + (a1 - a0) * v;
      d.line(cx + Math.cos(a) * 2, cy + Math.sin(a) * 2, cx + Math.cos(a) * (rad - 4), cy + Math.sin(a) * (rad - 4), PANEL_CLR.Text, 1.5);
      let s = fmt(v);
      if (I.tw(s, 10) > w) s = s.replace(/\s.*/, '');
      I.textC(cx, cy + rad + 3, PANEL_CLR.Text, s, 10);
      if (it.act && I.M.dy) set(clamp(v - I.M.dy / (I.M.shift ? 800 : 150)));
      else if (it.hov) { if (I.M.wheel) set(clamp(v + Math.sign(I.M.wheel) * 0.01)); I.tip(name + ': ' + fmt(v)); }
      return hh;
    }
    function PrmControl(I, id, x, y, w, p, clr) {
      // p: { name, v, set, opts?, toggle?, fmt? }
      if (p.toggle) PrmToggle(I, id, x, y, w, 17, p.name, p.v >= 0.5, clr, p.set);
      else if (p.opts) PrmCombo(I, id, x, y, w, p.name, p.opts, p.v, p.set);
      else PrmSlider(I, id, x, y, w, 17, p.name, p.v, p.fmt, clr, p.set, p.wheelStep);
      return 20;
    }
    const bandPrm = (Band, e) => ({ name: e.name, v: B[Band][e.k], opts: e.opts, toggle: e.toggle, fmt: e.fmt, set: v => { B[Band][e.k] = v; } });

    function Panel(I, bands, x, y, w, hh) {
      const d = I.d, M = I.M;
      d.rectF(x, y, x + w, y + hh, PANEL_CLR.Bg, 4);
      const iw = w - 10, x0 = x + 5;
      let cy = y + 4;
      // page tabs
      const PAGES = ['Band', 'Dynamics', 'Global'], tw = iw / 3;
      PAGES.forEach((name, i) => {
        const bx = x0 + i * tw, it = I.item('pg' + name, bx, cy, tw, 16);
        if (it.clicked) st.page = name;
        const on = st.page === name, c = on ? PANEL_CLR.Text : it.hov ? 0xb0b0b0ff : PANEL_CLR.Dim;
        I.textC(bx + tw / 2, cy + 1, c, name, TXT);
        d.line(bx + 3, cy + 15, bx + tw - 3, cy + 15, on ? PANEL_CLR.Accent : PANEL_CLR.Line, on ? 2 : 1);
      });
      cy += 21;
      const bottom = y + hh - 4;
      if (st.page === 'Global') {
        list(I, 'Global', x0, cy, iw, bottom - cy, (yy, w2) => {
          let used = 0;
          for (const k of GLOBAL_ORDER) {
            const p = G[k];
            if (p.visual || k === 'gs') continue;
            used += PrmControl(I, 'g' + k, x0, yy + used, w2 - 8, { name: p.name, v: p.v, opts: p.opts, toggle: p.toggle, fmt: p.fmt, set: v => { p.v = v; } }, PANEL_CLR.Accent);
          }
          return used;
        });
        return;
      }
      const Band = st.sel, b = Band && bands[Band];
      if (!b) {
        const lines = ['Click a band to edit it.', 'Double-click the display', 'to add one.'];
        lines.forEach((s, i) => I.text(x0, cy + i * 14, 0x6d6d6dff, s, TXT));
        return;
      }
      const clr = bandClr(Band)[1];
      // band header: < Band 3 >, enable, delete
      {
        const hh2 = 17, stepB = dir => { let n = Band; for (let k = 0; k < NUM; k++) { n = ((n - 1 + dir + NUM) % NUM) + 1; if (bands[n]) { st.sel = n; return; } } };
        const Btn = (id, bx, bw, draw) => { const it = I.item(id, bx, cy, bw, hh2); d.rectF(bx, cy, bx + bw, cy + hh2, it.hov ? PANEL_CLR.RowHvr : PANEL_CLR.Row, 3); draw(bx, bw, it.hov); return it; };
        if (Btn('pPrev', x0, 16, bx => Txt(I, bx + 5, cy + 2, PANEL_CLR.Text, '<')).clicked) stepB(-1);
        const nameW = iw - 16 * 2 - 18 * 2 - 8;
        d.rectF(x0 + 18, cy, x0 + 18 + nameW, cy + hh2, PANEL_CLR.Row, 3);
        d.circF(x0 + 27, cy + hh2 / 2, 4, b.Enabled ? clr : 0x555555ff);
        Txt(I, x0 + 35, cy + 2, b.Enabled ? PANEL_CLR.Text : PANEL_CLR.Dim, 'Band ' + Band);
        if (Btn('pNext', x0 + 20 + nameW, 16, bx => Txt(I, bx + 5, cy + 2, PANEL_CLR.Text, '>')).clicked) stepB(1);
        const ex = x0 + iw - 18 * 2 - 2;
        const en = Btn('pEn', ex, 18, (bx, bw) => { const ccx = bx + bw / 2, ccy = cy + hh2 / 2, c = b.Enabled ? clr : 0x777777ff; d.arc(ccx, ccy, 4.5, PI * 1.7, PI * 3.3, c, 1.5); d.line(ccx, ccy - 6, ccx, ccy - 1, c, 1.5); });
        if (en.clicked) B[Band].Enabled = b.Enabled ? 0 : 1;
        if (en.hov) I.tip(b.Enabled ? 'Disable band' : 'Enable band');
        const del = Btn('pDel', ex + 20, 18, (bx, bw, hv) => { const ccx = bx + bw / 2, ccy = cy + hh2 / 2, c = hv ? 0xff6060ff : 0x999999ff; d.line(ccx - 3.5, ccy - 3.5, ccx + 3.5, ccy + 3.5, c, 1.5); d.line(ccx - 3.5, ccy + 3.5, ccx + 3.5, ccy - 3.5, c, 1.5); });
        if (del.hov) I.tip('Delete band (Alt+click a node)');
        if (del.clicked) { deleteBand(Band); return; }
        cy += hh2 + 4;
      }
      if (st.page === 'Band') {
        // shape picker: one icon per shape, two rows
        const perRow = Math.ceil(SHAPES.length / 2), gap = 2, iw2 = Math.floor((iw - gap * (perRow - 1)) / perRow), ih = 18;
        const cur = idxOf(B[Band].Shape, SHAPES.length);
        SHAPES.forEach((s, k) => {
          const bx = x0 + (k % perRow) * (iw2 + gap), by = cy + Math.floor(k / perRow) * (ih + gap);
          const it = I.item('shp' + k, bx, by, iw2, ih);
          if (it.clicked) { B[Band].Shape = k / (SHAPES.length - 1); api.check('shape'); }
          if (it.hov) I.tip(s);
          const sel = k === cur;
          d.rectF(bx, by, bx + iw2, by + ih, sel ? WA(clr, 0x55) : (it.hov ? PANEL_CLR.RowHvr : PANEL_CLR.Row), 3);
          if (sel) d.rect(bx, by, bx + iw2, by + ih, clr, 3);
          DrawShapeIcon(d, s, bx + 3, by + 3, iw2 - 6, ih - 6, sel ? 0xffffffff : 0xb0b0b0ff);
        });
        cy += 2 * (ih + gap);
        cy += PrmControl(I, 'slope', x0, cy, iw, { name: 'Slope', v: B[Band].Slope, fmt: v => SlopeLabel(Curves.ProQ4_NormToSlope(v)), wheelStep: 0.1, set: v => { B[Band].Slope = v; } }, clr);
        list(I, 'Band', x0, cy, iw, bottom - cy, (yy, w2) => {
          let used = 0;
          for (const e of pageExtras.Band) used += PrmControl(I, 'bx' + e.k, x0, yy + used, w2 - 2, bandPrm(Band, e), clr);
          return used;
        });
      } else {
        const ex = pageExtras.Dynamics, toggles = ex.filter(e => e.toggle), knobs = [], others = [];
        for (const e of ex) if (!e.toggle) { if (hasWord(e.name, KNOB_WORDS) && knobs.length < 4) knobs.push(e); else others.push(e); }
        const perRow = toggles.length > 4 ? 3 : 2, tw2 = (iw - 3 * (perRow - 1)) / perRow;
        toggles.forEach((e, i) => {
          const bx = x0 + (i % perRow) * (tw2 + 3), by = cy + Math.floor(i / perRow) * 20;
          PrmToggle(I, 'dt' + e.k, bx, by, tw2, 17, SHORT_NAME[e.name] || e.name, B[Band][e.k] >= 0.5, clr, v => { B[Band][e.k] = v; });
        });
        cy += Math.ceil(toggles.length / perRow) * 20;
        let kh = 0;
        knobs.forEach((e, i) => { kh = PrmKnob(I, 'dk' + e.k, x0 + i * iw / 4, cy, iw / 4, e.name, B[Band][e.k], e.fmt, clr, v => { B[Band][e.k] = v; }); });
        cy += kh + 3;
        list(I, 'Dynamics', x0, cy, iw, bottom - cy, (yy, w2) => {
          let used = 0;
          for (const e of others) used += PrmControl(I, 'do' + e.k, x0, yy + used, w2 - 2, bandPrm(Band, e), clr);
          return used;
        });
      }
    }
    /** scrolling list area (BeginList): content drawn by fn(y, w) returning its height; wheel scrolls it */
    function list(I, key, x, y, w, hh, fn) {
      if (hh < 10) return;
      const off = st.listOff[key] || 0;
      I.d.clip(x - 1, y, x + w + 6, y + hh);
      const used = fn(y - off, w);
      I.d.unclip();
      const maxOff = Math.max(0, used - hh);
      if (maxOff > 0) {
        I.wheelArea(x, y, w, hh);
        const M = I.M;
        if (M.inside && M.x >= x && M.x < x + w && M.y >= y && M.y < y + hh && M.wheel && !I.hotTaken) st.listOff[key] = clamp(off - M.wheel * 20, 0, maxOff);
        const sbH = hh * hh / used, sbY = y + (hh - sbH) * (off / maxOff);
        I.d.rectF(x + w - 3, sbY, x + w + 2, sbY + sbH, 0x3a3a3aff, 3);
      }
      st.listOff[key] = clamp(st.listOff[key] || 0, 0, maxOff);
    }

    I = IM(container, totalW(), HEADER_H + CURVE_H, drawAll);
    FXD.devices.proq4._I = I;
    D.setWidth(totalW() + 40);
    FXD.onFrame(() => { if (I.wrap.isConnected) I.frame(); });
    api.reset = () => { initBands(); st.sel = 3; st.pop = null; };
    return () => I.destroy();
  }

  FXD.devices.proq4 = {
    id: 'proq4', name: 'Pro-Q 4', vendor: 'FabFilter', group: 'FabFilter', width: 642, height: 232,
    blurb: 'The EQ curve, band nodes and band popup are drawn right in the chain, so you can shape a band without opening the plugin window. Every band\'s gain, frequency and Q can take modulators.',
    steps: [
      { id: 'drag', text: 'Drag the blue node <b>2</b>', why: 'Left and right set the frequency, up and down the gain. Hold Shift for fine moves.', target: () => FXD.devices.proq4._I && FXD.devices.proq4._I.anchor('node2') },
      { id: 'q', text: 'Scroll on a node to change its <b>Q</b>', why: 'On a touch screen, drag the Q value in the popup sideways.' },
      { id: 'add', text: 'Double-click an empty spot to add a band', why: 'Near the left or right edge you get a low cut or high cut.', target: () => FXD.devices.proq4._I && FXD.devices.proq4._I.anchor('display') },
      { id: 'shape', text: 'Pick another <b>shape</b> for a band', why: 'Click the shape icon in the band popup, or one of the icons in the side panel.' },
    ],
    notes: [
      { title: 'Mouse on the display', text: 'Drag a node to move it. Scroll on it for Q. Double-click a node to turn it off. <kbd>Alt</kbd>+click deletes it, right-click opens the band menu. Hold the headphones in the popup to solo a band.' },
      { title: 'Modulating bands', text: 'Each band\'s gain, frequency and Q are modulation targets. With a modulator armed, right-drag a node: sideways sets the frequency range, up and down the gain (Q for cuts). Band 5 here is swept by an LFO; hover it to see both ends of the sweep.' },
      { title: 'Panel and analyzer', text: 'The side panel has the Band, Dynamics and Global pages, built from the plugin\'s own parameter list. The ⋯ button sets the display size and hides the panel. The analyzer behind the curve is on when <b>Use analyzer for Pro-Q</b> is ticked in the settings.' },
    ],
    build(body, api) { const cleanup = buildProQ(body, api); return cleanup; },
  };

  /* ================================================================== shared by Pro-C 3, Pro-L 2, Pro-R 2 */
  const dbs = a => 20 * Math.log10(Math.max(a, 1e-7));
  const lin = db => 10 ** (db / 20);
  function msLabel(x) {
    if (x >= 1000) return (x / 1000).toFixed(2) + ' s';
    if (x >= 100) return Math.round(x) + ' ms';
    if (x >= 10) return x.toFixed(1) + ' ms';
    return x.toFixed(2) + ' ms';
  }
  /** a plugin parameter, normalized like REAPER's (v 0..1) */
  function Prm(name, v, fmt, o) { return Object.assign({ name, v, def: v, fmt: fmt || pct }, o || {}); }
  function EnumPrm(name, opts, i) { const n = opts.length; return Prm(name, n > 1 ? i / (n - 1) : 0, v => opts[idxOf(v, n)], { opts }); }
  const Ix = p => idxOf(p.v, p.opts.length);
  const SetIx = (p, i) => { p.v = clamp(i, 0, p.opts.length - 1) / (p.opts.length - 1); };
  const On = p => p.v >= 0.5;
  const Toggle = p => { p.v = p.v >= 0.5 ? 0 : 1; };
  /** an invisible FX Devices control over a drawing: drag (up / right raises), wheel steps, value tooltip */
  function prmDrag(I, p, id, x, y, w, hh, o) {
    o = o || {};
    const it = I.item(id, x, y, w, hh, { cursor: o.cursor || 'ns-resize', wheel: true });
    const M = I.M, fine = M.shift ? 0.15 : 1, before = p.v;
    if (it.act && (M.dx || M.dy)) {
      const d = o.axis === 'y' ? -M.dy : o.axis === 'x' ? M.dx : M.dx - M.dy;
      p.v = clamp(p.v + d / (o.px || 130) * fine);
    } else if (it.hov && M.wheel) p.v = clamp(p.v + Math.sign(M.wheel) * (o.wheel || 0.01) * fine);
    if ((it.hov || it.act) && o.tip !== false) I.tip((o.label || p.name) + ': ' + p.fmt(p.v));
    return { hov: it.hov, act: it.act, lit: it.hov || it.act, changed: p.v !== before, clicked: it.clicked };
  }
  function Dashed(d, x0, y0, x1, y1, clr, dash, gap) { d.dashed(x0, y0, x1, y1, clr, dash, gap, 1); }
  /** the fake drum loop the renders use (pl2_scenarios.lua): kick, off-beat snare, a bit of body */
  function rnd(i) { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
  const pmod = (a, m) => ((a % m) + m) % m;
  function drumAmp(t) {
    const kick = Math.exp(-pmod(t, 0.5) * 18) * 0.65;
    const snare = (pmod(t + 0.25, 1) < 0.5) ? 0 : Math.exp(-pmod(t + 0.25, 0.5) * 25) * 0.45;
    const body = 0.10 + 0.05 * Math.sin(t * 7) + rnd(Math.floor(t * 240)) * 0.06;
    return Math.min(0.98, kick + snare + body);
  }
  const songTime = () => FXD.clock.beat * 60 / (FXD.clock.bpm || 120);
  /** the side panel/compact anchors etc. read by step targets */
  const TG = {};
  const tg = (dev, k) => () => { const I = TG[dev]; return I && I.wrap.isConnected ? I.anchor(k) : null; };
  /** mounts an IM canvas in a device body, keeps the frame width in step with it */
  function mountIM(body, api, W, H, bg, draw) {
    body.style.background = col(bg);
    body.style.display = 'flex'; body.style.alignItems = 'center'; body.style.paddingLeft = '4px';
    const I = IM(body, W, H, draw);
    api.device.setWidth(W + 40);
    I.setSize = (w, hh) => { if (w !== I.W || hh !== I.H) { I.resize(w, hh); api.device.setWidth(w + 40); } };
    FXD.onFrame(() => { if (I.wrap.isConnected) I.frame(); });
    return I;
  }

  /* ================================================================== PRO-C 3 ("Pro C 3.lua") */
  function buildProC(body, api) {
    const Dv = api.device;
    const C = {
      Bg: 0x1d1b20ff, Hdr: 0x211f20ff, Foot: 0x1f1e20ff, DispTop: 0x1a1719ff, DispMid: 0x312f34ff,
      Grid: 0x2c2a2eff, Dash: 0x6a686cff, InFill: 0x36353aff, OutFill: 0x55535aff, OutLine: 0xd5ccc5ff,
      GR: 0xff5b46ff, GRbar: 0xfb5e5bff, Lime: 0x8bb03fff, Olive: 0x586031ff, YTick: 0xe2d146ff,
      Track: 0x252324ff, KnobHi: 0x2f2a30ff, KnobLo: 0x252326ff, Bezel: 0x79787680, Arc: 0xffdc4dff,
      Dot: 0xebc441ff, ScRing: 0x869e30ff, ScRingHi: 0x92be13ff, ScAbove: 0xc8a030ff,
      Pill: 0x37353aff, PillLo: 0x2c2a2fff, PillEdge: 0x4a484dff, Text: 0xe7e5e8ff, TextHi: 0xf5f3f8ff,
      Auto: 0xfdeb7fff, Dim: 0x646265ff, Scale: 0x8a888cff, Logo1: 0xf2b84aff,
      Logo2: 0xe9a43cff, Char: 0xe0503aff, EqCurve: 0xffc458ff, ScPanel: 0x1e1e1eff, Green: 0x92be13ff,
    };
    const BAND_CLR = [0x4fdc5aff, 0x234cfdff, 0x14f6fdff, 0xffc458ff, 0xf05aa0ff, 0xb070ffff];
    const STYLE_GROUPS = [['Modern', ['Clean', 'Versatile', 'Smooth', 'Punch', 'Upward', 'TTM']], ['Classic', ['Op-El', 'Vari-Mu', 'Classic', 'Opto']], ['Utility', ['Vocal', 'Mastering', 'Bus', 'Pumping']]];
    const STYLE_ORDER = ['Clean', 'Versatile', 'Smooth', 'Punch', 'Upward', 'TTM', 'Op-El', 'Vari-Mu', 'Classic', 'Opto', 'Vocal', 'Mastering', 'Bus', 'Pumping'];
    const CHAR_MODES = ['Off', 'Tube', 'Diode', 'Bright'];
    const SC_INPUTS = ['Internal', 'External', 'Host Sync', 'MIDI'];
    const METER_SCALES = [9, 18, 36, 72, 90];
    const LINK_MODES = ['MID', 'SIDE', 'M>S', 'S>M'];
    const EQ_SHAPES = ['Bell', 'Low Shelf', 'Low Cut', 'High Shelf', 'High Cut', 'Notch', 'Band Pass', 'Tilt Shelf', 'Flat Tilt', 'All Pass'];
    const ANG0 = PI * 0.75, ANG1 = PI * 2.25, Ang = v => ANG0 + (ANG1 - ANG0) * v;

    // parameters (Pro-C 3's ranges; the layout reads the plugin's own formatted values)
    const thrDbOf = v => -60 + 60 * v;
    const ratioOf = v => v >= 0.999 ? Infinity : 100 ** v;
    const ToMs = (lo, hi) => v => lo * (hi / lo) ** v;
    const attMs = ToMs(0.005, 250), relMs = ToMs(10, 2500);
    const gdb = v => -36 + 72 * v;
    const P = {
      thr: Prm('Threshold', 40 / 60, v => thrDbOf(v).toFixed(1) + ' dB'),
      ratio: Prm('Ratio', Math.log(4) / Math.log(100), v => { const r = ratioOf(v); return r === Infinity ? '∞:1' : r.toFixed(2) + ':1'; }),
      knee: Prm('Knee', 0.25, v => (72 * v).toFixed(1) + ' dB'),
      range: Prm('Range', 0.65, v => (60 * v).toFixed(1) + ' dB'),
      att: Prm('Attack', 0.3, v => msLabel(attMs(v))),
      rel: Prm('Release', 0.5, v => msLabel(relMs(v))),
      autorel: Prm('Auto Release', 1, v => v >= 0.5 ? 'On' : 'Off'),
      la: Prm('Lookahead', 0, v => msLabel(20 * v)),
      hold: Prm('Hold', 0, v => msLabel(500 * v)),
      style: EnumPrm('Style', STYLE_ORDER, 5),
      autothr: Prm('Auto Threshold', 0, v => v >= 0.5 ? 'On' : 'Off'),
      lockthr: Prm('Lock Auto Threshold', 0, v => v >= 0.5 ? 'On' : 'Off'),
      char: EnumPrm('Character', CHAR_MODES, 1),
      charRoute: Prm('Character Routing', 1, v => v >= 0.5 ? 'Post' : 'Pre'),
      drive: Prm('Character Drive', 0.4, pct),
      autogain: Prm('Auto Gain', 1, v => v >= 0.5 ? 'On' : 'Off'),
      wet: Prm('Wet Gain', 0.5, v => sdb(gdb(v))),
      wetpan: Prm('Wet Pan', 0.5, v => Math.abs(v - 0.5) < 0.01 ? 'C' : Math.round(Math.abs(v - 0.5) * 200) + (v < 0.5 ? 'L' : 'R')),
      dry: Prm('Dry Gain', 0, v => v < 0.005 ? '-inf dB' : sdb(gdb(v))),
      drypan: Prm('Dry Pan', 0.5, v => Math.abs(v - 0.5) < 0.01 ? 'C' : Math.round(Math.abs(v - 0.5) * 200) + (v < 0.5 ? 'L' : 'R')),
      mix: Prm('Mix', 1, v => Math.round(v * 100) + '%'),
      scIn: EnumPrm('Side Chain Input', SC_INPUTS, 0),
      scLvl: Prm('Side Chain Level', 0.5, v => sdb(gdb(v))),
      hsync: EnumPrm('Host Trigger Sync', ['Whole', '1/2', '1/4', '1/8', '1/16'], 2),
      hofs: Prm('Host Trigger Offset', 0, pct),
      hlen: Prm('Host Trigger Length', 0.5, pct),
      link: Prm('Stereo Link', 1, v => Math.round(v * 100) + '%'),
      linkMode: EnumPrm('Stereo Link Mode', LINK_MODES, 0),
      audSC: Prm('Audition Side Chain', 0, v => v >= 0.5 ? 'On' : 'Off'),
      audTrig: Prm('Audition Triggering', 0, v => v >= 0.5 ? 'On' : 'Off'),
      inLvl: Prm('Input Level', 0.5, v => sdb(gdb(v))),
      outLvl: Prm('Output Level', 0.5, v => sdb(gdb(v))),
      os: EnumPrm('Oversampling', ['Off', '2x', '4x', '8x', '16x', '32x'], 0),
      maxLa: EnumPrm('Maximum Lookahead', ['Off', '1 ms', '2 ms', '5 ms', '10 ms', '20 ms'], 0),
      meter: EnumPrm('Meter Scale', METER_SCALES.map(x => x + ' dB'), 3),
    };
    // side-chain EQ bands (Side Chain EQ Band n Frequency / Gain / Q / Shape / Used / Enabled)
    const EqHz = v => 10 * 3000 ** v, EqHzN = f => Math.log(f / 10) / Math.log(3000);
    const EqQ = v => 0.025 * 1600 ** v, EqQN = q => Math.log(q / 0.025) / Math.log(1600);
    const Bands = [];
    function initBands() {
      Bands.length = 0;
      for (let i = 1; i <= 6; i++) Bands.push({ n: i, Used: 0, On: 1, Freq: EqHzN(1000), Gain: 0.5, Q: EqQN(1), Shape: 0, Slope: 12 });
      Object.assign(Bands[0], { Used: 1, Freq: EqHzN(110), Shape: 2 / 9, Q: EqQN(0.71) });
      Object.assign(Bands[1], { Used: 1, Freq: EqHzN(2400), Gain: 0.5 + 8 / 60, Q: EqQN(1.6) });
      Object.assign(Bands[2], { Used: 1, Freq: EqHzN(4600), Gain: 0.5 - 9 / 60, Q: EqQN(2.6) });
    }
    initBands();

    const st = { compact: FXD.store.get('ff:pc:compact', true), knee: true, sc: false, hist: new Float32Array(230 * 3).fill(-150), hidx: 0,
      scaleIdx: 3, pk: {}, sig: '', orig: null };
    const HN = 230;
    const HDR = 17, FOOT = 16, H = 216;
    const dims = () => {
      const MW = st.compact ? 380 : 530, DW = st.compact ? 184 : MW, SCW = st.compact ? 260 : 300;
      return { MW, DW, SCW, W: MW + (st.sc ? SCW : 0) };
    };
    const styleName = () => STYLE_ORDER[Ix(P.style)];

    /* ---- the compressor, run on the fake drum loop at 120 steps per second */
    let thrDb, ratio, kneeDb, rangeDb, upward;
    function readParams() {
      thrDb = thrDbOf(P.thr.v); ratio = ratioOf(P.ratio.v); if (ratio === Infinity) ratio = 1e9;
      kneeDb = 72 * P.knee.v; rangeDb = 60 * P.range.v; upward = styleName() === 'Upward';
    }
    function Transfer(x) {
      const d = x - thrDb;
      let y;
      if (kneeDb > 0 && Math.abs(d) <= kneeDb / 2) y = x + (1 / ratio - 1) * (d + kneeDb / 2) ** 2 / (2 * kneeDb);
      else if (d > kneeDb / 2) y = thrDb + d / ratio;
      else y = x;
      if (upward) y = d < 0 ? Math.min(thrDb + d / ratio, x + rangeDb) : x;
      else y = Math.max(y, x - rangeDb);
      return y;
    }
    const sim = { t: 0, env: 0, hold: 0, n: 0, acc: null, inDb: -150, outL: -150, outR: -150, gr: 0 };
    const DT = 1 / 120;
    function step(t) {
      const enabled = Dv.enabled;
      const a = drumAmp(t) * lin(gdb(P.inLvl.v));
      const inDb = dbs(a);
      const det = inDb + gdb(P.scLvl.v);
      const change = enabled ? Transfer(det) - det : 0;
      const attack = upward ? change > sim.env : change < sim.env;
      if (attack) { sim.hold = 500 * P.hold.v / 1000; sim.env += (change - sim.env) * (1 - Math.exp(-DT * 1000 / Math.max(attMs(P.att.v), 0.05))); }
      else if (sim.hold > 0) sim.hold -= DT;
      else {
        const rel = relMs(P.rel.v) * (On(P.autorel) ? (0.6 + 0.8 * clamp(-sim.env / 12, 0, 1)) : 1);
        sim.env += (change - sim.env) * (1 - Math.exp(-DT * 1000 / rel));
      }
      const makeup = !enabled ? 0 : On(P.autogain) ? -0.4 * (Transfer(0) - 0) : gdb(P.wet.v);
      const mix = P.mix.v;
      let out = enabled ? a * (mix * lin(sim.env + makeup) + (1 - mix) + (P.dry.v < 0.005 ? 0 : lin(gdb(P.dry.v)))) : a;
      out *= lin(gdb(P.outLvl.v));
      // levels as the meters show them: instant rise, 80 dB/s fall
      const outDb = dbs(out), fall = 80 * DT;
      sim.inDb = Math.max(inDb, sim.inDb - fall); sim.outL = Math.max(outDb, sim.outL - fall); sim.outR = sim.outL - 0.6;
      sim.gr = enabled ? -Math.abs(sim.env) : 0;
      const inS = sim.inDb, outS = sim.outL;
      // history at 40 Hz: the loudest of three steps
      const a3 = sim.acc || (sim.acc = [-150, -150, 0]);
      a3[0] = Math.max(a3[0], inS); a3[1] = Math.max(a3[1], outS); a3[2] = Math.min(a3[2], sim.gr);
      if (++sim.n % 3 === 0) {
        st.hidx = (st.hidx + 1) % HN;
        st.hist[st.hidx * 3] = a3[0]; st.hist[st.hidx * 3 + 1] = a3[1]; st.hist[st.hidx * 3 + 2] = a3[2];
        sim.acc = null;
      }
    }
    function resim() {
      const now = songTime();
      st.hist.fill(-150); sim.env = 0; sim.hold = 0; sim.n = 0; sim.acc = null;
      readParams();
      let t = now - HN / 40 - 0.6;
      for (; t <= now; t += DT) step(t);
      sim.t = t;
    }
    const sigOf = () => [P.thr, P.ratio, P.knee, P.range, P.att, P.rel, P.autorel, P.hold, P.style, P.autogain, P.wet, P.dry, P.mix, P.inLvl, P.outLvl, P.scLvl].map(p => p.v.toFixed(4)).join() + Dv.enabled;
    function advance() {
      readParams();
      const now = songTime();
      const sig = sigOf();
      if (!FXD.clock.playing) { if (sig !== st.sig) { st.sig = sig; resim(); } return; }
      st.sig = sig;
      if (now < sim.t - 1 || now - sim.t > 4) { resim(); return; }
      while (sim.t + DT <= now) { step(sim.t); sim.t += DT; }
    }
    function Hold(key, v, now) {
      const hh = st.pk[key];
      if (!hh || v >= hh.v || now - hh.t > 2) { st.pk[key] = { v, t: now }; return v; }
      return hh.v;
    }

    /* ---- drawing helpers (BigKnob, SmallKnob, AutoLabel, ArcSlider, Headphone) */
    function BigKnob(I, p, id, cx, cy, rad, label, fromMax, ring) {
      const r = prmDrag(I, p, id, cx - rad, cy - rad, rad * 2, rad * 2, { label });
      const d = I.d, v = p.v, lit = r.lit;
      d.circF(cx, cy + rad * 0.12, rad * 1.04, 0x00000066);
      d.circF(cx, cy, rad, C.KnobLo);
      d.circF(cx, cy - rad * 0.08, rad * 0.86, lit ? 0x37323aff : C.KnobHi);
      d.circ(cx, cy, rad, lit ? 0xa8a6a4c0 : C.Bezel, 1);
      const th = Math.max(rad * 0.08, 1.6);
      if (fromMax) d.arc(cx, cy, rad * 0.9, Ang(v), ANG1, C.Arc, th); else d.arc(cx, cy, rad * 0.9, ANG0, Ang(v), C.Arc, th);
      const a = Ang(v);
      d.circF(cx + Math.cos(a) * rad * 0.72, cy + Math.sin(a) * rad * 0.72, Math.max(rad * 0.075, 1.6), C.Dot);
      if (ring != null) {
        const lv = clamp(ring), th2 = Math.max(rad * 0.09, 2), split = Math.min(lv, v);
        d.arc(cx, cy, rad * 1.14, ANG0, Ang(split), lv > 0.6 ? C.ScRingHi : C.ScRing, th2);
        if (lv > v) d.arc(cx, cy, rad * 1.14, Ang(v), Ang(lv), C.ScAbove, th2);
      }
      return r;
    }
    function SmallKnob(I, p, id, cx, cy, rad, label, panP) {
      const r = prmDrag(I, p, id, cx - rad, cy - rad, rad * 2, rad * 2, { label });
      const d = I.d, v = p.v;
      d.circF(cx, cy + rad * 0.1, rad * 1.04, 0x00000066);
      d.circF(cx, cy, rad, r.lit ? 0x3a383dff : 0x2e2c31ff);
      d.circ(cx, cy, rad, 0x4a484dff, 1);
      d.circF(cx, cy, rad * 0.75, C.KnobLo);
      d.circ(cx, cy - 0.5, rad * 0.74, 0x3c3a3fff, 1);
      d.circF(cx, cy - rad * 0.88, Math.max(rad * 0.06, 1), WA(C.Arc, 0xaa));
      const a = Ang(v);
      d.circF(cx + Math.cos(a) * rad * 0.5, cy + Math.sin(a) * rad * 0.5, Math.max(rad * 0.09, 1.5), C.Dot);
      if (panP && Math.abs(panP.v - 0.5) > 0.01) {
        const pa = -PI / 2 + (panP.v - 0.5) * PI * 1.5;
        d.line(cx + Math.cos(pa) * rad * 0.8, cy + Math.sin(pa) * rad * 0.8, cx + Math.cos(pa) * rad, cy + Math.sin(pa) * rad, C.Arc, 2);
      }
      return r;
    }
    function AutoLabel(I, autoP, id, cx, y, label, size, lockP) {
      const full = (autoP ? 'AUTO ' : '') + label;
      let x = cx - I.tw(full, size) / 2;
      if (autoP) {
        const w = I.tw('AUTO', size);
        const it = I.item(id, x - 2, y - 1, w + 4, size + 3, { cursor: 'pointer' });
        if (it.clicked) { Toggle(autoP); api.check('auto'); }
        const on = On(autoP);
        let c = on ? C.Auto : C.Dim;
        if (it.hov) { c = Mix(c, 0xffffffff, 0.35); I.tip('Auto ' + label.toLowerCase() + (on ? ': on' : ': off')); }
        I.text(x, y, c, 'AUTO', size);
        x += I.tw('AUTO ', size);
        if (lockP && on) {
          const lx = cx - I.tw(full, size) / 2 - 9, ly = y + 1;
          const il = I.item(id + 'L', lx - 1, ly - 1, 9, size + 2, { cursor: 'pointer' });
          if (il.clicked) Toggle(lockP);
          const lc = On(lockP) ? C.Auto : (il.hov ? C.Text : C.Dim);
          I.d.rectF(lx, ly + 4, lx + 7, ly + 9, lc, 1);
          I.d.circ(lx + 3.5, ly + 4, 2.4, lc, 1.2);
          if (il.hov) I.tip('Lock auto threshold');
        }
      }
      I.text(x, y, C.Text, label, size);
    }
    const ArcPts = (cx, y, w, sag, t) => { const u = t * 2 - 1; return [cx + u * w / 2, y + sag * (1 - u * u)]; };
    function ArcSlider(I, p, id, cx, y, w, label, dim) {
      const d = I.d, sag = 3.5, N = 24;
      const r = prmDrag(I, p, id, cx - w / 2 - 4, y - 6, w + 8, 14, { label, axis: 'x', px: w + 8, cursor: 'ew-resize' });
      let [px, py] = ArcPts(cx, y, w, sag, 0);
      for (let i = 1; i <= N; i++) { const [x1, y1] = ArcPts(cx, y, w, sag, i / N); d.line(px, py, x1, y1, C.Dash, 1); px = x1; py = y1; }
      d.line(cx - w / 2, y, cx - w / 2 - 5, y - 2.5, C.Dash, 1);
      d.line(cx + w / 2, y, cx + w / 2 + 5, y - 2.5, C.Dash, 1);
      const v = p.v, clr = dim ? WA(C.Arc, 0x66) : C.Arc;
      if (v < 0.01) d.circF(cx - w / 2, y, 2, clr);
      else {
        const n = Math.max(Math.floor(N * v), 1);
        let [qx, qy] = ArcPts(cx, y, w, sag, 0);
        for (let i = 1; i <= n; i++) { const [x1, y1] = ArcPts(cx, y, w, sag, v * i / n); d.line(qx, qy, x1, y1, clr, 3); qx = x1; qy = y1; }
        d.circF(qx, qy, 1.5, clr);
      }
      if (r.lit) { const [x0, y0] = ArcPts(cx, y, w, sag, 0); d.rectF(x0 - 6, y0 - 6, x0 + w + 6, y0 + sag + 6, 0xffffff0c, 4); }
      I.textC(cx, y + sag + 4, dim ? C.Dim : C.Text, label, 8);
      return r;
    }
    function Headphone(d, cx, cy, rad, on, hov) {
      const c = on ? C.Auto : (hov ? C.Text : 0x9a989cff);
      d.circF(cx, cy, rad, 0x29272cff);
      d.circ(cx, cy, rad, 0x3f3d42ff, 1);
      d.arc(cx, cy + 1, rad * 0.5, PI * 1.05, PI * 1.95, c, 1.2);
      d.rectF(cx - rad * 0.55, cy, cx - rad * 0.3, cy + rad * 0.45, c, 1);
      d.rectF(cx + rad * 0.3, cy, cx + rad * 0.55, cy + rad * 0.45, c, 1);
    }
    function HeadBtn(I, p, id, cx, cy, tip) {
      const it = I.item(id, cx - 7, cy - 7, 14, 14, { cursor: 'pointer' });
      if (it.clicked) Toggle(p);
      Headphone(I.d, cx, cy, 6.5, On(p), it.hov);
      if (it.hov) I.tip(tip);
    }
    function styleMenu(I, x, y) {
      const cur = Ix(P.style);
      I.menu(STYLE_GROUPS.map(g => ({ label: g[0], sub: g[1].map(nm => { const i = STYLE_ORDER.indexOf(nm); return { label: nm, checked: i === cur, onClick: () => { SetIx(P.style, i); api.check('style'); } }; }) })), x, y);
    }
    function StylePill(I, cx, pT, pw, ph) {
      const pL = cx - pw / 2, d = I.d;
      const it = I.item('style', pL, pT, pw, ph, { cursor: 'pointer', wheel: true });
      if (it.clicked) styleMenu(I, pL, pT + ph + 2);
      if (it.hov && I.M.wheelN) { SetIx(P.style, clamp(Ix(P.style) + (I.M.wheelN > 0 ? -1 : 1), 0, 13)); api.check('style'); }
      d.rectF(pL + 1, pT + 2, pL + pw + 1, pT + ph + 2, 0x00000066, ph * 0.3);
      d.grad(pL, pT, pL + pw, pT + ph, it.hov ? 0x45434aff : 0x3a383dff, C.PillLo, ph * 0.3);
      d.rect(pL, pT, pL + pw, pT + ph, C.PillEdge, ph * 0.3);
      I.textC(cx, pT + 3, C.TextHi, styleName(), 9);
      if (it.hov) I.tip('Style (click for the list, wheel to step)');
      I.setAnchor('style', pL, pT, pw, ph);
    }
    function CharIcon(I, ix, iy, hitW, hitH, label) {
      const ci = Ix(P.char);
      const it = I.item('charIcon', ix - hitW / 2, iy - 6, hitW, hitH, { cursor: 'pointer' });
      if (it.clicked) charPopup(I, ix, iy + 8);
      const c = ci > 0 ? C.Char : (it.hov ? C.Text : 0x7a787cff), d = I.d;
      d.rect(ix - 3.5, iy - 5, ix + 3.5, iy + 3, c, 3, 1.3);
      d.line(ix - 5, iy + 4, ix + 5, iy + 4, c, 1.3);
      d.line(ix - 1.5, iy - 2, ix - 1.5, iy + 1, c, 1);
      d.line(ix + 1.5, iy - 2, ix + 1.5, iy + 1, c, 1);
      if (label) I.textC(ix, iy + 7, ci > 0 ? C.Char : C.Dim, ci > 0 ? CHAR_MODES[ci].toUpperCase() : 'CHARACTER', 6.5);
      if (it.hov) I.tip('Character: ' + CHAR_MODES[ci]);
    }
    // character popup: Off | Tube | Diode | Bright, DRIVE, PRE / POST (a small DOM panel)
    function charPopup(I, x, y) {
      I.closeMenu();
      const el = h('div', { class: 'fx-pop fx ff-menu ff-char' });
      const paint = () => {
        const ci = Ix(P.char);
        el.replaceChildren(
          h('div', { class: 'ff-ch-h' }, 'CHARACTER'),
          h('div', { class: 'ff-ch-row' }, CHAR_MODES.map((m, i) => { const b = h('button', { type: 'button', class: 'ff-ch-b' + (i === ci ? ' on' : '') }, m); b.addEventListener('click', () => { SetIx(P.char, i); paint(); }); return b; })),
          (() => {
            const bar = h('div', { class: 'ff-ch-drive' }, h('i', { style: { width: (P.drive.v * 100) + '%' } }));
            const row = h('div', { class: 'ff-ch-row2' }, h('div', null, bar, h('div', { class: 'ff-ch-dl' }, 'DRIVE ' + P.drive.fmt(P.drive.v))));
            const post = On(P.charRoute);
            const rb = h('button', { type: 'button', class: 'ff-ch-route' }, h('b', { class: post ? '' : 'on' }), post ? 'POST' : 'PRE', h('b', { class: post ? 'on' : '' }));
            rb.addEventListener('click', () => { Toggle(P.charRoute); paint(); });
            row.append(rb);
            let lastX = null;
            bar.addEventListener('pointerdown', e => { lastX = e.clientX; bar.setPointerCapture(e.pointerId); const b = bar.getBoundingClientRect(); P.drive.v = clamp((e.clientX - b.left) / b.width); paint2(); });
            bar.addEventListener('pointermove', e => { if (lastX == null) return; const b = bar.getBoundingClientRect(); P.drive.v = clamp((e.clientX - b.left) / b.width); paint2(); });
            bar.addEventListener('pointerup', () => { lastX = null; });
            bar.addEventListener('wheel', e => { e.preventDefault(); P.drive.v = clamp(P.drive.v + (e.deltaY < 0 ? 0.02 : -0.02)); paint2(); }, { passive: false });
            function paint2() { bar.firstChild.style.width = (P.drive.v * 100) + '%'; row.querySelector('.ff-ch-dl').textContent = 'DRIVE ' + P.drive.fmt(P.drive.v); }
            return row;
          })());
      };
      paint();
      I.popEl(el, x, y);
    }

    /* ---- one frame */
    function draw(I) {
      advance();
      const { MW, DW, SCW, W } = dims();
      I.setSize(W, H);
      const d = I.d, M = I.M, now = I.now();
      const compact = st.compact;
      const X = 0, Y = 0, DTp = Y + HDR, DB = Y + H - FOOT, DL_ = X, DR = X + DW - 30, MeterL = DR + 2;
      st.scaleIdx = Ix(P.meter);
      const SCALE = METER_SCALES[st.scaleIdx];
      const YDb = db => { const t = DTp + 9, b = DB - 4; return t + clamp(-db / SCALE, 0, 1) * (b - t); };
      const inDb = sim.inDb, grDb = sim.gr, outL = sim.outL, outR = sim.outR, outDb = Math.max(outL, outR);
      const grPeak = -Hold('GRPk', -grDb, now), outPk = Hold('OutPk', outDb, now);
      d.rectF(X, Y, X + W, Y + H, C.Bg, 4);

      // display
      {
        const mid = DTp + (DB - DTp) * 0.55;
        d.grad(DL_, DTp, MeterL - 1, mid, C.DispTop, C.DispMid);
        d.grad(DL_, mid, MeterL - 1, DB, C.DispMid, 0x232126ff);
        const stepDb = SCALE <= 9 ? 1.5 : SCALE <= 18 ? 3 : SCALE <= 72 ? 6 : 10;
        for (let db = 0; db > -SCALE + 0.01; db -= stepDb) d.line(DL_, YDb(db), DR, YDb(db), C.Grid, 1);
        const bottom = YDb(-SCALE), stp = (DR - DL_) / HN;
        let prevOut, prevGr, prevX;
        const g = I.g;
        for (let i = 0; i < HN; i++) {
          const k = ((st.hidx - i) % HN + HN) % HN;
          const sIn = st.hist[k * 3], sOut = st.hist[k * 3 + 1], sGr = st.hist[k * 3 + 2];
          const x1 = DR - i * stp, x0 = x1 - stp;
          const yIn = YDb(sIn), yOut = YDb(sOut);
          if (yIn < bottom) d.rectF(x0, yIn, x1 + 0.4, bottom, C.InFill);
          if (yOut < bottom) d.rectF(x0, yOut, x1 + 0.4, bottom, WA(C.OutFill, 0xb0));
          const yGr = YDb(sGr);
          if (prevX != null) {
            if (yOut < bottom || prevOut < bottom) d.line(prevX, prevOut, x1, yOut, WA(C.OutLine, 0xcc), 1.2);
            if (sGr < -0.05 || prevGr > YDb(0) + 0.3) d.line(prevX, prevGr, x1, yGr, C.GR, 2.2);
          }
          prevOut = yOut; prevGr = yGr; prevX = x1;
        }
        void g;
        let n = 0;
        for (let db = 0; db > -SCALE + 0.01; db -= stepDb) {
          n++;
          if (SCALE !== 72 || n % 2 === 1) I.textR(DR - 2, YDb(db) - 4, C.Scale, db === 0 ? '0' : String(db % 1 === 0 ? Math.floor(db) : db), 8);
        }
      }
      // knee display
      const KR = DL_ + (DR - DL_) * (compact ? 0.5 : 0.41);
      if (st.knee) {
        const KT = YDb(0), KB = YDb(-SCALE);
        d.rectF(DL_, DTp, KR, DB, 0xffffff09);
        d.line(KR, DTp, KR, DB, 0x3a383dff, 1);
        const KX = db => DL_ + (1 + clamp(db, -SCALE, 0) / SCALE) * (KR - DL_);
        d.line(KX(-SCALE), KB, KX(0), KT, 0xffffff12, 1);
        const N = 64;
        let px, py;
        for (let i = 0; i <= N; i++) {
          const xin = -SCALE + SCALE * i / N, x = KX(xin), y = YDb(Transfer(xin));
          if (px != null) d.line(px, py, x, y, xin <= inDb ? Mix(C.Olive, C.Green, clamp(i / N + 0.3)) : 0x9a9a9aff, 2);
          px = x; py = y;
        }
        if (inDb > -SCALE) d.circF(KX(inDb), YDb(Transfer(inDb)), 2.5, C.Green);
        Dashed(d, KX(thrDb), KT, KX(thrDb), KB, WA(C.Dash, 0xaa), 3, 3);
      }
      {
        const tx = st.knee ? KR : DL_, tT = DTp + (DB - DTp) * 0.2, tB = DTp + (DB - DTp) * 0.36;
        const it = I.item('kneeTab', tx, tT, 8, tB - tT, { cursor: 'pointer' });
        if (it.clicked) st.knee = !st.knee;
        d.rectF(tx, tT, tx + 7, tB, it.hov ? 0x3a383dff : 0x2a282cff, 2);
        const c = it.hov ? C.Text : 0x8a888cff;
        I.textC(tx + 3.5, tT + 1, c, st.knee ? '<' : '>', 7);
        ['K', 'N', 'E', 'E'].forEach((ch, i) => I.textC(tx + 3.5, tT + 6 + (i + 1) * 6, c, ch, 6));
        if (it.hov) I.tip(st.knee ? 'Hide the knee display' : 'Show the knee display');
      }
      Dashed(d, DL_, YDb(thrDb), DR - 24, YDb(thrDb), WA(C.Dash, 0xcc), 4, 3);

      // meters
      {
        const T = YDb(0), B = YDb(-SCALE), bw = 5, gap = 1.5;
        const Bar = (i, top, v, peak, peakClr) => {
          const L = MeterL + 1 + (i - 1) * (bw + gap) + (i > 2 ? 2 : 0);
          d.rectF(L, T, L + bw, B, C.Track);
          d.rect(L, T, L + bw, B, 0x111111ff);
          const y = YDb(v);
          if (top) {
            if (y > T + 0.5) d.grad(L + 1, T, L + bw - 1, y, 0xe45a53ff, C.GRbar);
            if (peak != null && YDb(peak) > T + 0.5) d.line(L + 1, YDb(peak), L + bw - 1, YDb(peak), C.GR, 1.5);
          } else {
            if (y < B) {
              const yl = YDb(v - 6);
              d.rectF(L + 1, y, L + bw - 1, B, C.Olive);
              if (yl < B) d.rectF(L + 1, yl, L + bw - 1, B, C.Lime);
              d.line(L + 1, yl, L + bw - 1, yl, C.YTick, 1);
            }
            if (peak != null && YDb(peak) < B) d.line(L + 1, YDb(peak), L + bw - 1, YDb(peak), peakClr, 1.5);
          }
          return L;
        };
        const gx = Bar(1, true, grDb, grPeak); Bar(2, true, grDb, grPeak);
        const ox = Bar(3, false, outL, outPk, outPk > 0 ? C.GR : C.YTick); Bar(4, false, outR, outPk, outPk > 0 ? C.GR : C.YTick);
        const Readout = (id, cx, s, c, key) => {
          const it = I.item('rd' + id, cx - 7, DTp + 1, 14, 9, { cursor: 'pointer' });
          if (it.clicked) delete st.pk[key];
          I.textC(cx, DTp + 1, it.hov ? C.TextHi : c, s, 7);
          if (it.hov) I.tip('Click to reset the peak');
        };
        Readout('gr', gx + bw + gap / 2, grPeak > -0.5 ? '0' : grPeak.toFixed(0), 0xb0aeb2ff, 'GRPk');
        Readout('out', ox + bw + gap / 2, outPk <= -99 ? '-inf' : (outPk > 0 ? '+' : '') + outPk.toFixed(1), outPk > 0 ? C.GR : 0xb0aeb2ff, 'OutPk');
      }
      // meter scale button
      {
        const s = SCALE + ' dB', w = I.tw(s, 8) + 8, L = DR - w - 2, T = DB - 13;
        const it = I.item('scale', L, T, w, 11, { cursor: 'pointer' });
        if (it.clicked) I.menu(METER_SCALES.map((v, i) => ({ label: v + ' dB', checked: i === st.scaleIdx, onClick: () => SetIx(P.meter, i) })), L, T + 13);
        d.rectF(L, T, L + w, T + 11, it.hov ? 0x3a383dff : 0x2a282cff, 3);
        I.textC(L + w / 2, T + 1, C.TextHi, s, 8);
      }

      if (compact) CompactControls(I, X, DTp, DB, DW, MW, inDb); else WideControls(I, DL_, DTp, DB, inDb);
      Header(I, X, Y, W, MW);
      Footer(I, X, Y, W, MW);
      if (st.sc && W > MW) SidePanel(I, X + MW, Y + HDR, X + W, Y + H - FOOT);
      I.setAnchor('thr', st.thrPos[0] - st.thrPos[2] - 3, st.thrPos[1] - st.thrPos[2] - 3, st.thrPos[2] * 2 + 6, st.thrPos[2] * 2 + 6);
    }
    st.thrPos = [0, 0, 0];
    const ThrNorm = db => clamp((db + 60) / 60);
    const pv = { thr: P.thr.v, ratio: P.ratio.v, knee: P.knee.v };
    function checkMoves() {
      if (Math.abs(P.thr.v - pv.thr) > 0.04) api.check('thr');
      if (Math.abs(P.ratio.v - pv.ratio) > 0.04 || Math.abs(P.knee.v - pv.knee) > 0.04) api.check('ratio');
    }

    function WideControls(I, DL_, DTp, DB, inDb) {
      const x = f => DL_ + 74 + (f - 0.185) * 531;
      const KY = DTp + 113, KRAD = 16, LBL = KY + KRAD + 4, ARCY = DB - 18;
      AutoLabel(I, P.autothr, 'aThr', x(0.185), LBL, 'THRESHOLD', 8, P.lockthr);
      AutoLabel(I, P.autorel, 'aRel', x(0.715), LBL, 'RELEASE', 8);
      AutoLabel(I, P.autogain, 'aGain', x(0.855), KY - 1, 'GAIN', 7.5);
      I.textC(x(0.33), LBL, C.Text, 'RATIO', 8);
      I.textC(x(0.575), LBL, C.Text, 'ATTACK', 8);
      HeadBtn(I, P.audTrig, 'audTrig', x(0.185) - KRAD - 13, KY - KRAD + 2, 'Audition triggering');
      BigKnob(I, P.thr, 'thr', x(0.185), KY, KRAD, 'Threshold', true, ThrNorm(inDb));
      st.thrPos = [x(0.185), KY, KRAD];
      BigKnob(I, P.ratio, 'ratio', x(0.33), KY, KRAD, 'Ratio');
      BigKnob(I, P.att, 'att', x(0.575), KY, KRAD, 'Attack');
      BigKnob(I, P.rel, 'rel', x(0.715), KY, KRAD, 'Release');
      SmallKnob(I, P.wet, 'wet', x(0.855), KY - 17, 10, 'Gain', P.wetpan);
      SmallKnob(I, P.dry, 'dry', x(0.855), ARCY - 9, 8, 'Dry', P.drypan);
      I.textC(x(0.855), ARCY + 1, C.Text, 'DRY', 7.5);
      const cx = x(0.452);
      StylePill(I, cx, KY - 2, 64, 15);
      CharIcon(I, cx, KY - 2 + 15 + 9, 16, 12, false);
      const laOff = Ix(P.maxLa) === 0;
      ArcSlider(I, P.knee, 'knee', x(0.185), ARCY, 54, 'KNEE');
      ArcSlider(I, P.range, 'range', x(0.33), ARCY, 54, 'RANGE');
      ArcSlider(I, P.la, 'la', x(0.575), ARCY, 54, 'LOOKAHEAD', laOff);
      ArcSlider(I, P.hold, 'hold', x(0.715), ARCY, 54, 'HOLD');
      ScToggle(I, cx, ARCY + 4, 8);
      checkMoves();
    }
    function CompactControls(I, X, DTp, DB, DW, MW) {
      const CL = X + DW + 8, CR = X + MW - 4, colx = i => CL + (CR - CL) * (i - 0.5) / 3;
      const KRAD = 15, KY1 = DTp + 25, KY2 = DTp + 98, ARC1 = DTp + 60, ARC2 = DTp + 133, BOT = DTp + 156;
      I.d.line(X + DW + 1, DTp, X + DW + 1, DB, 0x141315ff, 1);
      const L1 = KY1 + KRAD + 3, L2 = KY2 + KRAD + 3;
      AutoLabel(I, P.autothr, 'aThr', colx(1), L1, 'THRESHOLD', 7, P.lockthr);
      I.textC(colx(2), L1, C.Text, 'RATIO', 7);
      AutoLabel(I, P.autogain, 'aGain', colx(3), L1, 'GAIN', 7);
      I.textC(colx(1), L2, C.Text, 'ATTACK', 7);
      AutoLabel(I, P.autorel, 'aRel', colx(2), L2, 'RELEASE', 7);
      I.textC(colx(3), L2, C.Text, 'DRY', 7);
      HeadBtn(I, P.audTrig, 'audTrig', colx(1) - KRAD - 10, KY1 - KRAD + 1, 'Audition triggering');
      BigKnob(I, P.thr, 'thr', colx(1), KY1, KRAD, 'Threshold', true, ThrNorm(sim.inDb));
      st.thrPos = [colx(1), KY1, KRAD];
      BigKnob(I, P.ratio, 'ratio', colx(2), KY1, KRAD, 'Ratio');
      SmallKnob(I, P.wet, 'wet', colx(3), KY1, 12, 'Gain', P.wetpan);
      BigKnob(I, P.att, 'att', colx(1), KY2, KRAD, 'Attack');
      BigKnob(I, P.rel, 'rel', colx(2), KY2, KRAD, 'Release');
      SmallKnob(I, P.dry, 'dry', colx(3), KY2, 10, 'Dry', P.drypan);
      const laOff = Ix(P.maxLa) === 0;
      ArcSlider(I, P.knee, 'knee', colx(1), ARC1, 46, 'KNEE');
      ArcSlider(I, P.range, 'range', colx(2), ARC1, 46, 'RANGE');
      ArcSlider(I, P.la, 'la', colx(1), ARC2, 46, 'LOOKAHEAD', laOff);
      ArcSlider(I, P.hold, 'hold', colx(2), ARC2, 46, 'HOLD');
      StylePill(I, (colx(1) + colx(2)) / 2, BOT, 96, 15);
      CharIcon(I, colx(3), ARC1 - 2, 36, 20, true);
      ScToggle(I, colx(3), ARC2 + 1, 7);
      checkMoves();
    }
    function ScToggle(I, cx, y, size) {
      const sc = (st.sc ? '<< ' : '>> ') + 'SIDE CHAIN', sw = I.tw(sc, size);
      const it = I.item('scTgl', cx - sw / 2 - 2, y - 1, sw + 4, size + 3, { cursor: 'pointer' });
      if (it.clicked) setSC(!st.sc);
      const active = Ix(P.scIn) > 0 || Math.abs(P.link.v - 1) > 0.01 || Math.abs(P.scLvl.v - 0.5) > 0.01;
      if (active && !st.sc) I.d.rectF(cx - sw / 2 - 3, y - 1, cx + sw / 2 + 3, y + size + 3, 0xfdeb7f22, 3);
      I.textC(cx, y, it.hov ? 0xffffffff : C.Auto, sc, size);
      I.setAnchor('sc', cx - sw / 2 - 3, y - 2, sw + 6, size + 5);
    }
    function setSC(on) { st.sc = on; if (on) api.check('sc'); }
    function setCompact(on) { st.compact = on; FXD.store.set('ff:pc:compact', on); api.check('layout'); }

    function Header(I, X, Y, W, MW) {
      const d = I.d, T = Y, B = Y + HDR;
      d.rectF(X, T, X + W, B, C.Hdr, 4);
      d.quad(X, T, X + 118, T, X + 108, B, X, B, 0x1a181bff);
      for (let i = 0; i <= 2; i++) for (let j = 0; j <= 1; j++) d.circF(X + 6 + i * 3, T + 6 + j * 4, 0.9, 0xd0ced2ff);
      I.text(X + 17, T + 2, C.TextHi, 'fabfilter', 9);
      const lg = I.item('logo', X + 58, T, 50, HDR);
      if (lg.hov) I.tip('Open Pro-C 3');
      const c1 = lg.hov ? 0xffd27aff : C.Logo1, pw = I.tw('Pro', 12);
      I.text(X + 60, T + 1, c1, 'Pro', 12);
      d.circF(X + 60 + pw + 2.5, T + 9, 1.4, C.Logo2);
      I.text(X + 60 + pw + 5, T + 1, lg.hov ? 0xffd27aff : C.Logo2, 'C', 12);
      I.text(X + 60 + pw + 5 + I.tw('C', 12) + 1, T, C.Logo2, '3', 8);
      const pL = X + MW * 0.36, pR = X + MW * 0.82;
      I.textC(pL + 6, T + 3, 0x9a989cff, '<', 9);
      I.textC(pR - 6, T + 3, 0x9a989cff, '>', 9);
      const pn = I.item('preset', pL, T, pR - pL, HDR);
      if (pn.hov) I.tip('Presets: search, favorites, save');
      d.clip(pL + 14, T, pR - 14, B);
      I.textC((pL + pR) / 2, T + 3, pn.hov ? C.TextHi : 0xb0aeb2ff, 'Default Setting', 9);
      d.unclip();
      // compact / wide toggle
      const wx = X + MW - 36, cw = I.item('compact', wx, T + 2, 15, HDR - 4, { cursor: 'pointer' });
      if (cw.clicked) setCompact(!st.compact);
      const wc = cw.hov ? C.TextHi : 0x9a989cff;
      d.rect(wx + 1, T + 4, wx + 14, T + HDR - 4, wc, 2);
      if (st.compact) { d.tri(wx + 3, T + 8.5, wx + 6, T + 6.5, wx + 6, T + 10.5, wc); d.tri(wx + 12, T + 8.5, wx + 9, T + 6.5, wx + 9, T + 10.5, wc); }
      else { d.tri(wx + 7, T + 8.5, wx + 4, T + 6.5, wx + 4, T + 10.5, wc); d.tri(wx + 8, T + 8.5, wx + 11, T + 6.5, wx + 11, T + 10.5, wc); }
      if (cw.hov) I.tip(st.compact ? 'Wide layout' : 'Compact layout');
      I.setAnchor('compact', wx - 2, T, 19, HDR);
      // menu
      const mx = X + MW - 18, cm = I.item('hmenu', mx, T, 14, HDR, { cursor: 'pointer' });
      for (let i = 0; i <= 2; i++) d.line(mx + 3, T + 5 + i * 3, mx + 11, T + 5 + i * 3, cm.hov ? C.TextHi : 0x9a989cff, 1);
      if (cm.clicked) I.menu([
        { label: 'Compact layout', checked: st.compact, onClick: () => setCompact(!st.compact) },
        { label: 'Knee display', checked: st.knee, onClick: () => { st.knee = !st.knee; } },
        { label: 'Side chain panel', checked: st.sc, onClick: () => setSC(!st.sc) },
      ], mx + 14, B, 1);
    }
    function Footer(I, X, Y, W, MW) {
      const d = I.d, T = Y + H - FOOT, B = Y + H, ty = T + 3.5, compact = st.compact;
      d.rectF(X, T, X + W, B, C.Foot, 4);
      d.line(X, T, X + W, T, 0x141315ff, 1);
      const LabelValue = (id, lx, label, value, p) => {
        const s1 = label + ' ', w = I.tw(s1, 8) + I.tw(value, 8);
        const it = I.item('ft' + id, lx, T, w, FOOT, { cursor: 'pointer' });
        I.text(lx, ty, 0x8a888cff, s1, 8);
        I.text(lx + I.tw(s1, 8), ty, it.hov ? 0xffffffff : C.TextHi, value, 8);
        if (it.clicked) I.menu(p.opts.map((o, i) => ({ label: o, checked: i === Ix(p), onClick: () => SetIx(p, i) })), lx, T - 4);
      };
      LabelValue('os', compact ? X + 6 : X + MW * 0.12, 'Oversampling:', P.os.opts[Ix(P.os)], P.os);
      LabelValue('la', compact ? X + 98 : X + MW * 0.38, 'Lookahead:', P.maxLa.opts[Ix(P.maxLa)], P.maxLa);
      const bx = compact ? X + 186 : X + MW * 0.64, en = Dv.enabled;
      const bt = I.item('byp', bx, T + 2, 12, 12, { cursor: 'pointer' });
      if (bt.clicked) Dv.setEnabled(!en);
      d.rectF(bx, T + 2, bx + 12, T + 14, bt.hov ? 0x2a282cff : 0x161517ff, 2);
      if (!en) d.line(bx + 1, T + 2.5, bx + 11, T + 2.5, C.GR, 2);
      d.arc(bx + 6, T + 8.5, 3.2, -PI * 0.25, PI * 1.25, en ? 0x9a989cff : C.GR, 1.1);
      d.line(bx + 6, T + 4, bx + 6, T + 8, en ? 0x9a989cff : C.GR, 1.1);
      if (bt.hov) I.tip(en ? 'Bypass' : 'Bypassed');
      const FootVal = (p, id, cx, label) => {
        const s = p.fmt(p.v), w = Math.max(I.tw(s, 8), 14);
        const r = prmDrag(I, p, id, cx - w / 2 - 2, T, w + 4, FOOT, { label });
        I.textC(cx, ty, r.lit ? 0xffffffff : C.TextHi, s, 8);
      };
      FootVal(P.mix, 'fmix', compact ? X + 226 : X + MW * 0.73, 'Mix');
      FootVal(P.inLvl, 'fin', compact ? X + 278 : X + MW * 0.82, 'Input Level');
      FootVal(P.outLvl, 'fout', compact ? X + 338 : X + MW * 0.92, 'Output Level');
    }

    function SidePanel(I, L, T, R, B) {
      const d = I.d, M = I.M;
      d.rectF(L, T, R, B, C.ScPanel);
      d.line(L, T, L, B, 0x141315ff, 1);
      HeadBtn(I, P.audSC, 'audSC', L + 13, T + 12, 'Audition side chain');
      {
        const fx0 = L + 13, fT = T + 26, fB = B - 18, v = P.scLvl.v;
        const r = prmDrag(I, P.scLvl, 'scLvl', fx0 - 6, fT, 12, fB - fT, { axis: 'y', px: fB - fT, label: 'Side Chain Level' });
        d.rectF(fx0 - 1.5, fT, fx0 + 1.5, fB, 0x111111ff, 1);
        const hy = fB - (fB - fT) * v;
        d.rectF(fx0 - 1, hy, fx0 + 1, fB, C.Arc);
        d.rectF(fx0 - 5, hy - 2.5, fx0 + 5, hy + 2.5, r.lit ? 0xd0ced2ff : 0x9a989cff, 1);
        I.textC(fx0, B - 13, C.Text, 'LEVEL', 7);
      }
      const scIdx = Ix(P.scIn);
      for (let i = 0; i < 4; i++) {
        const ix = L + 34 + i * 13;
        const it = I.item('scIn' + i, ix - 5, T + 6, 11, 12, { cursor: 'pointer' });
        if (it.clicked) SetIx(P.scIn, i);
        const c = i === scIdx ? C.Auto : (it.hov ? C.Text : 0x7a787cff);
        if (i === 0) d.rect(ix - 3.5, T + 9, ix + 3.5, T + 15, c, 2, 1.2);
        else if (i === 1) { d.rectF(ix - 3, T + 10, ix + 3, T + 15, c, 1); d.line(ix - 1.5, T + 7, ix - 1.5, T + 10, c, 1); d.line(ix + 1.5, T + 7, ix + 1.5, T + 10, c, 1); }
        else if (i === 2) d.tri(ix, T + 7, ix - 4, T + 16, ix + 4, T + 16, c);
        else { d.circ(ix, T + 12, 4, c, 1.2); for (let k = 0; k <= 2; k++) d.circF(ix - 2 + k * 2, T + 11 + (k === 1 ? -1 : 0), 0.8, c); }
        if (it.hov) I.tip(SC_INPUTS[i]);
      }
      I.textC(L + 54, T + 21, C.TextHi, SC_INPUTS[scIdx], 8);
      if (scIdx === 2) {
        const si = Ix(P.hsync);
        const it = I.item('hsync', L + 32, T + 36, 44, 12, { cursor: 'pointer' });
        if (it.clicked) SetIx(P.hsync, (si + 1) % 5);
        d.rectF(L + 32, T + 36, L + 76, T + 48, it.hov ? 0x3a383dff : 0x2a282cff, 3);
        I.textC(L + 54, T + 38, C.TextHi, P.hsync.opts[si], 8);
        SmallKnob(I, P.hofs, 'hofs', L + 42, T + 70, 8, 'Offset'); I.textC(L + 42, T + 80, C.Text, 'OFFSET', 6.5);
        SmallKnob(I, P.hlen, 'hlen', L + 68, T + 70, 8, 'Length'); I.textC(L + 68, T + 80, C.Text, 'LENGTH', 6.5);
      }
      {
        const cx = L + 54, cy = B - 40;
        I.textC(cx, cy - 22, C.TextHi, P.link.fmt(P.link.v), 7.5);
        SmallKnob(I, P.link, 'link', cx, cy, 11, 'Stereo Link');
        I.textC(cx, B - 13, C.Text, 'STEREO LINK', 7);
        const mi = Ix(P.linkMode), it = I.item('linkMode', cx + 13, cy + 4, 22, 10, { cursor: 'pointer' });
        if (it.clicked) SetIx(P.linkMode, (mi + 1) % 4);
        d.rectF(cx + 13, cy + 4, cx + 35, cy + 14, it.hov ? 0x3a383dff : 0x2a282cff, 3);
        I.textC(cx + 24, cy + 5, C.TextHi, LINK_MODES[mi], 6.5);
        if (it.hov) I.tip('Stereo link mode (click to change)');
      }
      // side-chain EQ
      const eL = L + 86, eT = T + 4, eR = R - 4, eB = B - 4, w = eR - eL, hh = eB - eT, RANGE = 24, mid = eT + hh / 2, iw = Math.floor(w);
      d.rectF(eL, eT, eR, eB, 0x161517ff, 3);
      for (const f of [100, 1000, 10000]) { const gx = eL + Curves.HzToX(f, w); d.line(gx, eT, gx, eB, 0x262428ff, 1); }
      for (const g of [-12, 12]) { const gy = mid - Curves.DbToPx(g, hh, RANGE); d.line(eL, gy, eR, gy, 0x262428ff, 1); }
      d.line(eL, mid, eR, mid, 0x3a383dff, 1);
      I.textR(eR - 2, eT + 2, 0x5f5d60ff, 'SIDE CHAIN EQ', 7);
      const bands = [];
      for (const b of Bands) if (b.Used >= 0.5) {
        const shape = EQ_SHAPES[idxOf(b.Shape, EQ_SHAPES.length)];
        bands.push({ src: b, on: b.On >= 0.5, Shape: shape, Freq: EqHz(b.Freq), Gain: -30 + 60 * b.Gain, Q: EqQ(b.Q), Slope: 12 });
      }
      const sum = new Float32Array(iw + 2);
      for (const b of bands) if (b.on) { b.Curve = Curves.BandCurveDb(b, iw); for (let i = 1; i <= iw; i++) sum[i] += b.Curve[i]; }
      const Yc = v => mid - Curves.DbToPx(clamp(v, -RANGE * 1.2, RANGE * 1.2), hh, RANGE);
      d.clip(eL, eT, eR, eB);
      const g = I.g;
      for (const b of bands) if (b.on && b.Curve) {
        g.strokeStyle = col(WA(BAND_CLR[b.src.n - 1], 0x70)); g.lineWidth = 1; g.beginPath();
        for (let i = 1; i <= iw; i += 2) { const yy = Yc(b.Curve[i]); i === 1 ? g.moveTo(eL + i, yy) : g.lineTo(eL + i, yy); }
        g.stroke();
      }
      g.fillStyle = col(0xffc45814); g.beginPath(); g.moveTo(eL, mid);
      for (let i = 1; i <= iw; i++) g.lineTo(eL + i, Math.max(mid, Yc(sum[i])));
      g.lineTo(eR, mid); g.closePath(); g.fill();
      g.strokeStyle = col(C.EqCurve); g.lineWidth = 1.8; g.beginPath();
      for (let i = 1; i <= iw; i++) { const yy = Yc(sum[i]); i === 1 ? g.moveTo(eL + i, yy) : g.lineTo(eL + i, yy); }
      g.stroke();
      d.unclip();
      let onNode = false;
      for (const b of bands) {
        const nx = eL + Curves.HzToX(b.Freq, w);
        const hasGain = b.Shape === 'Bell' || b.Shape.includes('Shelf') || b.Shape === 'Flat Tilt';
        const ny = mid - (hasGain ? Curves.DbToPx(clamp(b.Gain, -RANGE, RANGE), hh, RANGE) : 0);
        const src = b.src;
        const it = I.item('scn' + src.n, nx - 6, ny - 6, 12, 12, { cursor: 'grab', wheel: true });
        if (it.hov || it.act) onNode = true;
        if (it.act) {
          if (M.dx) src.Freq = clamp(src.Freq + M.dx / w);
          if (M.dy && hasGain) src.Gain = clamp(src.Gain - M.dy / (hh / 2) * RANGE / 60);
          if (M.dx || M.dy) api.check('sceq');
          I.cursor = 'grabbing';
        } else if (it.hov) {
          if (M.wheel) src.Q = clamp(src.Q + M.wheel * 0.02);
          I.tip(`${b.Shape}  ${hzLabel(b.Freq)}  ${hasGain ? sdb(b.Gain) : ''}  Q ${QL(b.Q)}`);
          if (it.rclicked) {
            const cur = idxOf(src.Shape, EQ_SHAPES.length);
            I.menu([...EQ_SHAPES.map((s, i) => ({ label: s, checked: i === cur, icon: shapeSvg(s), onClick: () => { src.Shape = i / (EQ_SHAPES.length - 1); } })),
              { sep: true }, { label: 'Enabled', checked: b.on, onClick: () => { src.On = b.on ? 0 : 1; } }, { label: 'Delete band', onClick: () => { src.Used = 0; } }], M.x + 4, M.y + 4);
          }
        }
        const clr = b.on ? BAND_CLR[src.n - 1] : WA(BAND_CLR[src.n - 1], 0x55);
        d.circF(nx, ny, (it.hov || it.act) ? 5 : 4, WA(clr, 0x50));
        d.circF(nx, ny, 2.6, clr);
      }
      const bg = I.item('eqbg', eL, eT, w, hh);
      if (bg.dbl && !onNode) {
        const fb = Bands.find(b => b.Used < 0.5);
        if (fb) { Object.assign(fb, { Used: 1, On: 1, Shape: 0, Freq: clamp((M.x - eL) / w), Gain: clamp(0.5 + (mid - M.y) / (hh / 2) * RANGE / 60), Q: EqQN(1) }); api.check('sceq'); }
      }
    }
    const QL = q => q < 10 ? q.toFixed(2) : q.toFixed(1);

    const I = mountIM(body, api, dims().W, H, C.Bg, draw);
    TG.proc3 = I;
    resim();
    return () => { I.destroy(); };
  }

  FXD.devices.proc3 = {
    id: 'proc3', name: 'Pro-C 3', vendor: 'FabFilter', group: 'FabFilter', width: 420, height: 232,
    blurb: 'The level display, knee curve, gain reduction meters and every knob of Pro-C 3 in the chain. The red line is the gain reduction on a drum loop; press Space to stop and start it.',
    steps: [
      { id: 'thr', text: 'Drag <b>THRESHOLD</b> down', why: 'The dashed line, the knee curve and the red gain reduction follow. The green ring outside the knob is the level the compressor hears.', target: tg('proc3', 'thr') },
      { id: 'ratio', text: 'Change the <b>RATIO</b> knob or the <b>KNEE</b> slider', why: 'The knee display on the left shows the curve: input level across, output level up.' },
      { id: 'sc', text: 'Open the <b>SIDE CHAIN</b> panel', why: 'It holds the side chain level, input, stereo link and the side chain EQ. Drag its nodes, or double-click to add one.', target: tg('proc3', 'sc') },
      { id: 'layout', text: 'Switch between the compact and wide layouts', why: 'The arrows button in the header. Every Pro-C 3 in your projects remembers the choice.', target: tg('proc3', 'compact') },
    ],
    notes: [
      { title: 'Two layouts', text: 'Compact puts the knobs in a panel right of the display, 380 px wide. Wide floats them over the display, like the plugin window, at 530 px. The side chain panel adds 260 or 300 px.' },
      { title: 'Controls', text: 'Drag a knob or slider, or scroll on it; hold <kbd>Shift</kbd> for fine moves. Click an <b>AUTO</b> label to turn that auto mode on. The tube icon opens Character with drive and pre or post routing. Each control is an FX Devices param, so it can be modulated and linked.' },
      { title: 'Meters', text: 'Gain reduction hangs from the top, output rises from the bottom. Click a number above the meters to reset its peak, and the dB button to change the scale.' },
    ],
    build(body, api) { return buildProC(body, api); },
  };

  /* ================================================================== PRO-L 2 ("Pro L 2.lua") */
  function buildProL(body, api) {
    const Dv = api.device;
    const C = {
      Bg: 0x1b1d22ff, Hdr: 0x202227ff, Foot: 0x1d1f24ff, DispTop: 0x15171bff, DispBot: 0x23272eff,
      Grid: 0x262a31ff, GridTxt: 0x7d838cff, InFill: 0x3c4859ff, OutFill: 0x24466ce0, OutTop: 0x6aa2d8e0,
      OutLine: 0x9fd0ffff, GR: 0xff3b3bff, GRFill: 0xd8262680, Ceil: 0xe6c75aff, Panel: 0x14161ae6,
      PanelEdge: 0x343841ff, Track: 0x22252bff, KnobHi: 0x30343bff, KnobLo: 0x22252bff, Bezel: 0x6e747d90,
      Arc: 0x63b8ffff, Dot: 0xbfe2ffff, Pill: 0x353a43ff, PillLo: 0x272b32ff, PillEdge: 0x4a505aff,
      Text: 0xe4e7ecff, TextHi: 0xf6f8fbff, Dim: 0x60656dff, Label: 0x9aa1abff, On: 0x63b8ffff,
      MeterLo: 0x2a6fb5ff, MeterHi: 0x7cc4ffff, PeakTick: 0xe8eef5ff, Over: 0xff4b3bff, Logo1: 0x6ab8f5ff,
      Logo2: 0x4d9de0ff, Loud: 0xf0c64aff, LoudLo: 0x8a6d1eff,
    };
    const STYLES = ['Transparent', 'Punchy', 'Dynamic', 'Allround', 'Aggressive', 'Modern', 'Bus', 'Safe'];
    const STYLE_TIPS = {
      Transparent: 'Cleanest, for low amounts of limiting', Punchy: 'Keeps the punch of the transients',
      Dynamic: 'Keeps transients and adds a little', Allround: 'Fits most material',
      Aggressive: 'Fast and loud, with some distortion', Modern: 'Loud with little distortion (default)',
      Bus: 'For buses and single tracks', Safe: 'Avoids distortion, may pump more',
    };
    const ANG0 = PI * 0.75, ANG1 = PI * 2.25, Ang = v => ANG0 + (ANG1 - ANG0) * v;
    const onOff = v => v >= 0.5 ? 'On' : 'Off';
    const relMs = v => 10 * 1000 ** v;
    const P = {
      gain: Prm('Gain', 0.2, v => (v * 30 < 0.05 ? '0.0' : '+' + (v * 30).toFixed(1)) + ' dB'),
      style: EnumPrm('Style', STYLES, 5),
      la: Prm('Lookahead', 0.036, v => msLabel(5 * v)),
      att: Prm('Attack', 0.407, v => msLabel(10 * v)),
      rel: Prm('Release', 0.388, v => msLabel(relMs(v))),
      clT: Prm('Channel Link Transients', 0.375, v => Math.round(v * 100) + '%'),
      clR: Prm('Channel Link Release', 0.5, v => Math.round(v * 100) + '%'),
      os: EnumPrm('Oversampling', ['Off', '2x', '4x', '8x', '16x', '32x'], 2),
      tp: Prm('True Peak Limiting', 1, onOff),
      dith: EnumPrm('Dithering', ['Off', '24 bit', '22 bit', '20 bit', '18 bit', '16 bit', '14 bit', '12 bit', '10 bit', '8 bit'], 0),
      ns: EnumPrm('Noise Shaping', ['Off', 'Basic', 'Optimized', 'Weighted'], 2),
      dc: Prm('Filter DC Offset', 0, onOff),
      scTrig: Prm('Side Chain Triggering', 0, onOff),
      unity: Prm('Unity Gain', 0, onOff),
      aud: Prm('Audition Limiting', 0, onOff),
      out: Prm('Output Level', 29 / 30, v => (-30 + 30 * v).toFixed(1) + ' dB'),
      lockOut: Prm('Lock Output', 0, onOff),
      adv: Prm('Show Advanced', 1, onOff),
      tpm: Prm('True Peak Metering', 1, onOff),
      disp: EnumPrm('Display Mode', ['Fast', 'Moving', 'Slow', 'Infinite', 'Off'], 0),
      meter: EnumPrm('Meter Scale', ['12 dB', '24 dB', '36 dB', '48 dB'], 1),
      lTarget: EnumPrm('Loudness Meter Target', ['-23 LUFS', '-18 LUFS', '-16 LUFS', '-14 LUFS', '-12 LUFS', '-10 LUFS'], 3),
    };
    const st = { compact: FXD.store.get('ff:pl:compact', false), loud: false, pk: {}, maxPk: -150, intSum: 0, intN: 0, lastLoudT: null };
    const H = 214, LW = 92, HDR = 17, FOOT = 16;
    const dims = () => { const MW = st.compact ? 300 : 600; return { MW, CTRL: st.compact ? 50 : 0, W: MW + (st.loud ? LW : 0) }; };

    /* ---- the limiter on the fake drum loop (pl2_scenarios.lua), as rows of the display, oldest first */
    const NR = 384;
    const rIn = new Float32Array(NR), rOut = new Float32Array(NR), rGr = new Float32Array(NR), rMs = new Float32Array(NR);
    let SPAN = 4;
    function compute() {
      const dtRow = SPAN / NR, now = songTime();
      const k1 = Math.floor(now / dtRow), k0 = k1 - NR + 1;
      const enabled = Dv.enabled, gDb = 30 * P.gain.v, g = lin(gDb), c = lin(-30 + 30 * P.out.v);
      const relF = 1 - Math.exp(-dtRow * 1000 / relMs(P.rel.v));
      const unity = On(P.unity) ? 1 / g : 1;
      let env = 1;
      for (let k = k0 - 120; k <= k1; k++) {
        const pre = drumAmp(k * dtRow);
        let inA, outA;
        if (enabled) {
          inA = pre * g;
          const want = Math.min(1, c / inA);
          env = want < env ? want : env + (1 - env) * relF;
          outA = inA * env * unity;
        } else { inA = pre; outA = pre; }
        if (k >= k0) {
          const i = k - k0;
          rIn[i] = dbs(inA); rOut[i] = dbs(outA); rGr[i] = Math.min(0, rOut[i] - dbs(inA * unity)); rMs[i] = outA * outA * 0.5;
        }
      }
    }
    const lufs = ms => 10 * Math.log10(Math.max(ms, 1e-12)) - 0.691;
    function meanMs(sec) {
      const n = Math.max(1, Math.min(NR, Math.round(sec / (SPAN / NR))));
      let s = 0; for (let i = NR - n; i < NR; i++) s += rMs[i];
      return s / n;
    }
    function Hold(key, v, now) {
      const hh = st.pk[key];
      if (!hh || v >= hh.v || now - hh.t > 2) { st.pk[key] = { v, t: now }; return v; }
      return hh.v;
    }

    function Knob(I, p, id, cx, cy, rad, label) {
      const R = rad * 1.2;
      const r = prmDrag(I, p, id, cx - R, cy - R, R * 2, R * 2, { label });
      const d = I.d, v = p.v;
      d.circF(cx, cy + rad * 0.12, rad * 1.05, 0x00000070);
      d.circF(cx, cy, rad, C.KnobLo);
      d.circF(cx, cy - rad * 0.08, rad * 0.84, r.lit ? 0x3a3f47ff : C.KnobHi);
      d.circ(cx, cy, rad, r.lit ? 0xb0b6bec0 : C.Bezel, 1);
      const th = Math.max(rad * 0.13, 2);
      d.arc(cx, cy, rad * 1.22, ANG0, ANG1, 0x2c3037ff, th);
      d.arc(cx, cy, rad * 1.22, ANG0, Ang(v), C.Arc, th);
      const a = Ang(v);
      g2line(d, cx + Math.cos(a) * rad * 0.3, cy + Math.sin(a) * rad * 0.3, cx + Math.cos(a) * rad * 0.78, cy + Math.sin(a) * rad * 0.78, C.Dot, Math.max(rad * 0.12, 1.6));
      return r;
    }
    function g2line(d, x1, y1, x2, y2, c, th) { const g = d._g; g.lineCap = 'round'; d.line(x1, y1, x2, y2, c, th); g.lineCap = 'butt'; }
    function Headphone(d, cx, cy, rad, on, hov) {
      const c = on ? C.On : (hov ? C.Text : 0x9aa1abff);
      d.circF(cx, cy, rad, on ? 0x1f3448ff : 0x262a31ff);
      d.circ(cx, cy, rad, 0x3c414aff, 1);
      d.arc(cx, cy + 1, rad * 0.5, PI * 1.05, PI * 1.95, c, 1.2);
      d.rectF(cx - rad * 0.55, cy, cx - rad * 0.3, cy + rad * 0.45, c, 1);
      d.rectF(cx + rad * 0.3, cy, cx + rad * 0.55, cy + rad * 0.45, c, 1);
    }
    function Box(d, x, y, on, hov) {
      d.rectF(x, y, x + 9, y + 9, hov ? 0x30343bff : 0x15171bff, 2);
      d.rect(x, y, x + 9, y + 9, 0x454a53ff, 2);
      if (on) d.rectF(x + 2, y + 2, x + 7, y + 7, C.On, 1);
    }
    const listMenu = (I, p, x, y, cb) => I.menu(p.opts.map((o, i) => ({ label: o, checked: i === Ix(p), onClick: () => { SetIx(p, i); cb && cb(); } })), x, y);
    function setCompact(on) { st.compact = on; FXD.store.set('ff:pl:compact', on); api.check('compact'); }
    function setLoud(on) { st.loud = on; if (on) api.check('loud'); }

    function draw(I) {
      const { MW, CTRL, W } = dims();
      I.setSize(W, H);
      I.d._g = I.g;
      const d = I.d, g = I.g, M = I.M, now = I.now(), compact = st.compact;
      const dispName = P.disp.opts[Ix(P.disp)], dispOff = dispName === 'Off';
      SPAN = dispName === 'Slow' || dispName === 'Infinite' ? 10 : dispName === 'Moving' ? 6 : 4;
      const SCALE = parseFloat(P.meter.opts[Ix(P.meter)]);
      compute();
      const gainDb = 30 * P.gain.v, ceilDb = -30 + 30 * P.out.v;
      const outL = rOut[NR - 1], outR = outL + dbs(0.95), outDb = Math.max(outL, outR), grDb = rGr[NR - 1];
      const grPeak = -Hold('GRPk', -grDb, now), outPkL = Hold('OutPkL', outL, now), outPkR = Hold('OutPkR', outR, now);
      st.maxPk = Math.max(st.maxPk, outDb);
      const X = 0, Y = 0, DTp = Y + HDR, DB = Y + H - FOOT - CTRL, MeterW = 64, GS = 20, DL_ = X + GS, DR = X + MW - MeterW;
      const YDb = db => { const t = DTp + 12, b = DB - 4; return t + clamp(-db / SCALE, 0, 1) * (b - t); };
      d.rectF(X, Y, X + W, Y + H, C.Bg, 4);

      // display
      d.grad(X, DTp, DR, DB, C.DispTop, C.DispBot);
      const stepDb = SCALE <= 12 ? 1 : SCALE <= 24 ? 3 : 6;
      for (let db = 0; db > -SCALE + 0.01; db -= stepDb) d.line(DL_, YDb(db), DR, YDb(db), C.Grid, 1);
      const bottom = YDb(-SCALE), top = YDb(0);
      if (!dispOff) {
        const step = (DR - DL_) / (NR - 1);
        d.clip(DL_, DTp, DR, DB);
        const xs = i => DL_ + i * step;
        const area = (arr, fill) => {
          g.beginPath(); g.moveTo(xs(0) - step, bottom);
          for (let i = 0; i < NR; i++) { const y = Math.min(YDb(arr[i]), bottom); g.lineTo(xs(i) - step, y); g.lineTo(xs(i) + 0.5, y); }
          g.lineTo(xs(NR - 1) + 0.5, bottom); g.closePath(); g.fillStyle = fill; g.fill();
        };
        area(rIn, col(C.InFill));
        const gr = g.createLinearGradient(0, top, 0, bottom); gr.addColorStop(0, col(C.OutTop)); gr.addColorStop(1, col(C.OutFill));
        area(rOut, gr);
        // gain reduction hanging from the top
        g.beginPath(); g.moveTo(xs(0) - step, top);
        for (let i = 0; i < NR; i++) { const yg = top + clamp(-rGr[i] / SCALE, 0, 1) * (bottom - top); g.lineTo(xs(i) - step, yg); g.lineTo(xs(i) + 0.5, yg); }
        g.lineTo(xs(NR - 1) + 0.5, top); g.closePath(); g.fillStyle = col(C.GRFill); g.fill();
        g.beginPath(); let pen = false;
        for (let i = 0; i < NR; i++) {
          if (rGr[i] < -0.05) { const yg = top + clamp(-rGr[i] / SCALE, 0, 1) * (bottom - top); if (!pen) { g.moveTo(xs(i) - step, yg); pen = true; } else g.lineTo(xs(i) - step, yg); g.lineTo(xs(i) + 0.5, yg); }
          else pen = false;
        }
        g.strokeStyle = col(C.GR); g.lineWidth = 1.5; g.stroke();
        g.beginPath();
        for (let i = 0; i < NR; i++) { const y = YDb(rOut[i]); i ? g.lineTo(xs(i), y) : g.moveTo(xs(i), y); }
        g.strokeStyle = col(WA(C.OutLine, 0xb0)); g.lineWidth = 1; g.stroke();
        d.unclip();
      } else I.textC((DL_ + DR) / 2, (DTp + DB) / 2 - 20, C.Dim, 'DISPLAY OFF', 9);
      Dashed(d, DL_, YDb(ceilDb), DR, YDb(ceilDb), WA(C.Ceil, 0xc0), 5, 3);
      { let n = 0; for (let db = 0; db > -SCALE + 0.01; db -= stepDb) { n++; if (SCALE <= 24 || n % 2 === 1) I.textR(DR - 3, YDb(db) - 4, C.GridTxt, db === 0 ? '0' : String(Math.floor(db)), 8); } }

      // gain slider
      {
        const L = X, R_ = X + GS, T = DTp + 22, B = DB - 8, cx = L + GS / 2;
        const r = prmDrag(I, P.gain, 'gain', L, T - 4, GS, B - T + 8, { axis: 'y', px: B - T, label: 'Gain' });
        if (r.changed) api.check('gain');
        d.rectF(L, DTp, R_, DB, 0x17191dff);
        d.line(R_, DTp, R_, DB, 0x2b2f36ff, 1);
        d.rectF(cx - 1.5, T, cx + 1.5, B, 0x0d0e10ff, 1);
        const hy = B - (B - T) * P.gain.v;
        d.rectF(cx - 1, hy, cx + 1, B, C.Arc);
        const hc = r.lit ? 0xffffffff : 0xd7dde5ff;
        d.tri(cx - 6, hy - 5, cx - 6, hy + 5, cx + 7, hy, hc);
        d.line(cx + 7, hy, DL_ + 6, hy, WA(hc, r.lit ? 0x90 : 0x40), 1);
        I.textC(cx, DTp + 2, C.Label, 'GAIN', 7);
        I.textC(cx, DTp + 11, r.lit ? C.TextHi : C.Text, gainDb < 0.05 ? '0.0' : '+' + gainDb.toFixed(1), 7);
        I.setAnchor('gain', cx - 8, hy - 7, 16, 14);
      }
      // meters
      {
        const L0 = DR;
        d.rectF(L0, DTp, X + MW, DB, 0x18191eff);
        d.line(L0, DTp, L0, DB, 0x2b2f36ff, 1);
        const T = YDb(0), B = YDb(-SCALE), bw = 7, gL = L0 + 6, oL = gL + bw + 6;
        const Track = l => { d.rectF(l, T, l + bw, B, C.Track); d.rect(l, T, l + bw, B, 0x0e0f12ff); };
        Track(gL);
        const yg = T + clamp(-grDb / SCALE, 0, 1) * (B - T);
        if (yg > T + 0.5) d.grad(gL + 1, T, gL + bw - 1, yg, 0xb52020ff, C.GR);
        const yp = T + clamp(-grPeak / SCALE, 0, 1) * (B - T);
        if (yp > T + 0.5) d.line(gL + 1, yp, gL + bw - 1, yp, C.GR, 1.5);
        const Out = (l, v, pk) => {
          Track(l);
          const y = YDb(v);
          if (y < B) d.grad(l + 1, y, l + bw - 1, B, C.MeterHi, C.MeterLo);
          if (v > ceilDb + 0.05) d.rectF(l + 1, T, l + bw - 1, T + 2, C.Over);
          const py = YDb(pk);
          if (py < B) d.line(l + 1, py, l + bw - 1, py, pk > ceilDb + 0.05 ? C.Over : C.PeakTick, 1.5);
        };
        Out(oL, outL, outPkL); Out(oL + bw + 1.5, outR, outPkR);
        const Readout = (id, cx, s, c, reset) => {
          const it = I.item('rd' + id, cx - 9, DTp + 1, 18, 9, { cursor: 'pointer' });
          if (it.clicked) reset();
          I.textC(cx, DTp + 1, it.hov ? C.TextHi : c, s, 7);
        };
        Readout('gr', gL + bw / 2, grPeak > -0.05 ? '0.0' : grPeak.toFixed(1), 0xff8a80ff, () => { delete st.pk.GRPk; });
        const mx = st.maxPk;
        Readout('out', oL + bw + 0.75, mx <= -99 ? '-inf' : (mx > 0 ? '+' : '') + mx.toFixed(1), mx > ceilDb + 0.05 ? C.Over : 0xb8c0caff, () => { st.maxPk = -150; delete st.pk.OutPkL; delete st.pk.OutPkR; });
        const hx = oL + bw * 2 + 3, hy = YDb(ceilDb);
        const r = prmDrag(I, P.out, 'out', hx - 2, T - 4, 12, B - T + 8, { axis: 'y', px: B - T, label: 'Output Level' });
        if (r.changed) api.check('ceil');
        d.tri(hx, hy, hx + 8, hy - 5, hx + 8, hy + 5, r.lit ? 0xffffffff : C.Ceil);
        I.setAnchor('ceil', hx - 3, hy - 7, 14, 14);
        const ax = X + MW - 11, ay = B - 2, ia = I.item('aud', ax - 7, ay - 7, 14, 14, { cursor: 'pointer' });
        if (ia.clicked) Toggle(P.aud);
        Headphone(d, ax, ay, 6, On(P.aud), ia.hov);
        if (ia.hov) I.tip('Audition limiting (hear what the limiter removes)');
        const tx = X + MW - 8, tT = DTp + 14, tB = DTp + 70, it = I.item('loudTab', tx, tT, 8, tB - tT, { cursor: 'pointer' });
        if (it.clicked) setLoud(!st.loud);
        d.rectF(tx, tT, tx + 7, tB, it.hov ? 0x353a43ff : 0x262a31ff, 2);
        const c = st.loud ? C.Loud : (it.hov ? C.Text : 0x8a919bff);
        I.textC(tx + 3.5, tT + 1, c, st.loud ? '<' : '>', 7);
        ['L', 'U', 'F', 'S'].forEach((ch, i) => I.textC(tx + 3.5, tT + 4 + (i + 1) * 8, c, ch, 6));
        if (it.hov) I.tip(st.loud ? 'Hide the loudness meters' : 'Show the loudness meters');
        I.setAnchor('loud', tx - 2, tT - 2, 11, tB - tT + 4);
      }
      // control panel
      {
        const adv = On(P.adv);
        let PL, PT, PR, PB, KY, LBL;
        if (compact) {
          PL = X + 4; PT = DB + 3; PR = X + MW - 4; PB = DB + CTRL - 3;
          d.rectF(X, DB, X + MW, DB + CTRL, C.Bg);
          d.line(X, DB, X + MW, DB, 0x111215ff, 1);
          d.rectF(PL, PT, PR, PB, 0x16181cff, 6);
          d.rect(PL, PT, PR, PB, C.PanelEdge, 6);
          KY = PT + 17; LBL = PB - 11;
        } else {
          PL = DL_ + 8; PT = DB - 54; PR = PL + (adv ? 420 : 304); PB = DB - 6;
          d.rectF(PL + 2, PT + 3, PR + 2, PB + 3, 0x00000050, 6);
          d.rectF(PL, PT, PR, PB, C.Panel, 6);
          d.rect(PL, PT, PR, PB, C.PanelEdge, 6);
          KY = PT + 21; LBL = PB - 12;
        }
        const LS = compact ? 7 : 8;
        const si = Ix(P.style), styleName = STYLES[si];
        const sx = PL + (compact ? 7 : 10), sw = compact ? 80 : 92, sh = 20, sy = KY - sh / 2;
        I.textC(sx + sw / 2, LBL, C.Label, 'STYLE', LS);
        const it = I.item('style', sx, sy, sw, sh, { cursor: 'pointer', wheel: true });
        if (it.clicked) I.menu(STYLES.map((nm, i) => ({ label: nm, checked: i === si, onClick: () => { SetIx(P.style, i); api.check('style'); } })), sx, sy + sh + 2);
        if (it.hov && M.wheelN) { SetIx(P.style, clamp(si + (M.wheelN > 0 ? -1 : 1), 0, 7)); api.check('style'); }
        d.rectF(sx + 1, sy + 2, sx + sw + 1, sy + sh + 2, 0x00000066, 4);
        d.grad(sx, sy, sx + sw, sy + sh, it.hov ? 0x404651ff : C.Pill, C.PillLo, 4);
        d.rect(sx, sy, sx + sw, sy + sh, C.PillEdge, 4);
        I.textC(sx + sw / 2 - 4, sy + 5, C.TextHi, styleName, 10);
        d.tri(sx + sw - 11, sy + 8, sx + sw - 5, sy + 8, sx + sw - 8, sy + 12, 0x9aa1abff);
        if (it.hov) I.tip('Style: ' + styleName + '\n' + STYLE_TIPS[styleName] + '\n(click for the list, wheel to step)');
        I.setAnchor('style', sx, sy, sw, sh);
        const KR = 11, kx = sx + sw + (compact ? 30 : 34), KS = compact ? 50 : 58;
        const KnobV = (p, id, cxk, label) => { const r = Knob(I, p, id, cxk, KY, KR, label); I.textC(cxk, LBL, r.lit ? C.TextHi : C.Label, r.lit ? p.fmt(p.v) : label.toUpperCase(), LS); };
        const LinkK = (p, id, cxk, label, full) => { const r = Knob(I, p, id, cxk, KY + (compact ? 0 : 2), KR - 1, full); I.textC(cxk, LBL, r.lit ? C.TextHi : C.Label, r.lit ? p.fmt(p.v) : label, LS); };
        if (compact && adv) {
          I.textC(kx + KS * 0.75, PT + 1, C.Label, 'CHANNEL LINKING', 6);
          LinkK(P.clT, 'clT', kx + KS * 0.15, 'TRANSIENTS', 'Channel Link Transients');
          LinkK(P.clR, 'clR', kx + KS * 1.55, 'RELEASE', 'Channel Link Release');
        } else {
          KnobV(P.la, 'la', kx, 'Lookahead'); KnobV(P.att, 'att', kx + KS, 'Attack'); KnobV(P.rel, 'rel', kx + KS * 2, 'Release');
        }
        const ax = compact ? PR - 16 : kx + 116 + 34;
        const ia = I.item('adv', ax, PT + 4, 12, PB - PT - 8, { cursor: 'pointer' });
        if (ia.clicked) { Toggle(P.adv); api.check('adv'); }
        d.rectF(ax, PT + 4, ax + 12, PB - 4, ia.hov ? 0x353a43ff : 0x23262dff, 3);
        const acol = adv ? C.On : (ia.hov ? C.Text : 0x8a919bff);
        I.textC(ax + 6, PT + 6, acol, adv ? '<' : '>', 7);
        const word = compact ? 'ADV' : 'ADVANCED';
        for (let i = 0; i < word.length; i++) I.textC(ax + 6, PT + 7 + (i + 1) * (compact ? 6.5 : 4.3), acol, word[i], compact ? 6 : 5);
        if (ia.hov) I.tip(adv ? 'Hide the advanced settings' : 'Show the advanced settings (channel linking)');
        if (adv && !compact) {
          const cx0 = ax + 22;
          I.textC(cx0 + 48, PT + 3, C.Label, 'CHANNEL LINKING', 7);
          LinkK(P.clT, 'clT', cx0 + 22, 'TRANSIENTS', 'Channel Link Transients');
          LinkK(P.clR, 'clR', cx0 + 76, 'RELEASE', 'Channel Link Release');
        }
      }
      // display mode / meter scale
      {
        const y = DTp + 3, s = dispName, w = I.tw(s, 8) + 10, L = DR - w - 34;
        const it = I.item('disp', L, y, w, 11, { cursor: 'pointer' });
        if (it.clicked) listMenu(I, P.disp, L, y + 13);
        d.rectF(L, y, L + w, y + 11, it.hov ? 0x353a43ff : 0x23262dff, 3);
        I.textC(L + w / 2, y + 1, C.TextHi, s, 8);
        if (it.hov) I.tip('Display mode');
        const s2 = SCALE + ' dB', w2 = I.tw(s2, 8) + 8, L2 = DR - w2 - 3;
        const i2 = I.item('scale', L2, y, w2, 11, { cursor: 'pointer' });
        if (i2.clicked) listMenu(I, P.meter, L2, y + 13);
        d.rectF(L2, y, L2 + w2, y + 11, i2.hov ? 0x353a43ff : 0x23262dff, 3);
        I.textC(L2 + w2 / 2, y + 1, C.TextHi, s2, 8);
        if (i2.hov) I.tip('Meter scale');
      }
      // loudness panel
      const momentary = lufs(meanMs(0.4)), shortTerm = lufs(meanMs(3));
      if (FXD.clock.playing && Dv.enabled) {
        const t = songTime();
        if (st.lastLoudT == null || t - st.lastLoudT >= 0.1 || t < st.lastLoudT) { st.lastLoudT = t; const ms = meanMs(0.4); if (lufs(ms) > -70) { st.intSum += ms; st.intN++; } }
      }
      if (!st.intN) { st.intSum = meanMs(3); st.intN = 1; }
      const integrated = lufs(st.intSum / st.intN);
      if (st.loud && W > MW) {
        const L = X + MW, T = DTp, R_ = X + W, B = Y + H - FOOT;
        d.rectF(L, T, R_, B, 0x17181cff);
        d.line(L, T, L, B, 0x0e0f12ff, 1);
        const target = parseFloat(P.lTarget.opts[Ix(P.lTarget)]);
        const bT = T + 14, bB = B - 6, bx = L + 8, LY = l => bT + clamp((target + 9 - l) / 36, 0, 1) * (bB - bT);
        d.rectF(bx, bT, bx + 12, bB, C.Track); d.rect(bx, bT, bx + 12, bB, 0x0e0f12ff);
        if (shortTerm > target - 27) d.grad(bx + 1, LY(shortTerm), bx + 11, bB, C.Loud, C.LoudLo);
        if (momentary > target - 27) d.line(bx + 1, LY(momentary), bx + 11, LY(momentary), 0xffffffcc, 1.5);
        if (integrated > target - 27) { const y = LY(integrated); d.tri(bx + 13, y, bx + 18, y - 3, bx + 18, y + 3, C.TextHi); }
        const ty = LY(target);
        d.line(bx - 3, ty, bx + 15, ty, 0x63b8ffcc, 1);
        I.textC(bx + 6, T + 3, C.Label, 'S', 7);
        const F = v => v <= -70 ? '-inf' : v.toFixed(1), nx = L + 30;
        const Row = (y, label, value, big, clr) => { I.text(nx, y, C.Label, label, 6.5); I.text(nx, y + 8, clr || C.TextHi, value, big ? 13 : 10); };
        Row(T + 4, 'MOMENTARY', F(momentary));
        Row(T + 28, 'SHORT TERM', F(shortTerm));
        const ir = I.item('intReset', nx - 2, T + 52, R_ - nx, 26, { cursor: 'pointer' });
        if (ir.clicked) { st.intSum = 0; st.intN = 0; }
        Row(T + 52, 'INTEGRATED', F(integrated), true, ir.hov ? 0xffffffff : C.Loud);
        if (ir.hov) I.tip('Click to reset.\nLoudness here is measured without K-weighting,\nso it can differ from the plugin\'s own meter.');
        Row(T + 82, On(P.tpm) ? 'TRUE PEAK' : 'PEAK', st.maxPk <= -99 ? '-inf' : (st.maxPk > 0 ? '+' : '') + st.maxPk.toFixed(1), false, st.maxPk > ceilDb + 0.05 ? C.Over : null);
        I.text(nx, T + 106, C.Label, 'TARGET', 6.5);
        const tt = I.item('target', nx - 2, T + 113, R_ - nx, 11, { cursor: 'pointer' });
        if (tt.clicked) listMenu(I, P.lTarget, nx - 2, T + 126);
        I.text(nx, T + 114, tt.hov ? 0xffffffff : 0x9fd0ffff, P.lTarget.opts[Ix(P.lTarget)], 8);
        I.text(nx, B - 14, C.Dim, 'LUFS (approx.)', 6);
      }
      // header
      {
        const T = Y, B = Y + HDR;
        d.rectF(X, T, X + W, B, C.Hdr, 4);
        d.quad(X, T, X + 118, T, X + 108, B, X, B, 0x16181cff);
        for (let i = 0; i <= 2; i++) for (let j = 0; j <= 1; j++) d.circF(X + 6 + i * 3, T + 6 + j * 4, 0.9, 0xd0d4daff);
        I.text(X + 17, T + 2, C.TextHi, 'fabfilter', 9);
        const lg = I.item('logo', X + 58, T, 50, HDR);
        if (lg.hov) I.tip('Open Pro-L 2');
        const lc = lg.hov ? 0x9fd4ffff : C.Logo1, pw = I.tw('Pro', 12);
        I.text(X + 60, T + 1, lc, 'Pro', 12);
        d.circF(X + 60 + pw + 2.5, T + 9, 1.4, C.Logo2);
        I.text(X + 60 + pw + 5, T + 1, lg.hov ? 0x9fd4ffff : C.Logo2, 'L', 12);
        I.text(X + 60 + pw + 5 + I.tw('L', 12) + 1, T, C.Logo2, '2', 8);
        let pL = X + MW * 0.33, pR = X + MW * 0.8;
        if (compact) { pL = X + 114; pR = X + W - 38; }
        I.textC(pL + 6, T + 3, 0x9aa1abff, '<', 9);
        I.textC(pR - 6, T + 3, 0x9aa1abff, '>', 9);
        const pn = I.item('preset', pL, T, pR - pL, HDR);
        if (pn.hov) I.tip('Presets: search, favorites, save');
        d.clip(pL + 14, T, pR - 14, B);
        I.textC((pL + pR) / 2, T + 3, pn.hov ? C.TextHi : 0xb4bcc6ff, 'Default Setting', 9);
        d.unclip();
        const wx = X + W - 36, cw = I.item('compact', wx, T + 2, 15, HDR - 4, { cursor: 'pointer' });
        if (cw.clicked) setCompact(!compact);
        const wc = cw.hov ? C.TextHi : 0x9aa1abff;
        d.rect(wx + 1, T + 4, wx + 14, T + HDR - 4, wc, 2);
        if (compact) { d.tri(wx + 3, T + 8.5, wx + 6, T + 6.5, wx + 6, T + 10.5, wc); d.tri(wx + 12, T + 8.5, wx + 9, T + 6.5, wx + 9, T + 10.5, wc); }
        else { d.tri(wx + 7, T + 8.5, wx + 4, T + 6.5, wx + 4, T + 10.5, wc); d.tri(wx + 8, T + 8.5, wx + 11, T + 6.5, wx + 11, T + 10.5, wc); }
        if (cw.hov) I.tip(compact ? 'Full width layout' : 'Compact layout (half the width)');
        I.setAnchor('compact', wx - 2, T, 19, HDR);
        const mx = X + W - 18, cm = I.item('hmenu', mx, T, 14, HDR, { cursor: 'pointer' });
        for (let i = 0; i <= 2; i++) d.line(mx + 3, T + 5 + i * 3, mx + 11, T + 5 + i * 3, cm.hov ? C.TextHi : 0x9aa1abff, 1);
        if (cm.clicked) I.menu([
          { label: 'Compact layout', checked: compact, onClick: () => setCompact(!compact) },
          { label: 'Loudness meters', checked: st.loud, onClick: () => setLoud(!st.loud) },
          { label: 'True peak metering', checked: On(P.tpm), onClick: () => Toggle(P.tpm) },
          { label: 'Lock output level (presets keep it)', checked: On(P.lockOut), onClick: () => Toggle(P.lockOut) },
          { label: 'External side chain triggering', checked: On(P.scTrig), onClick: () => Toggle(P.scTrig) },
        ], mx + 14, B, 1);
      }
      // footer
      {
        const T = Y + H - FOOT, ty = T + 3.5;
        d.rectF(X, T, X + W, Y + H, C.Foot, 4);
        d.line(X, T, X + W, T, 0x111215ff, 1);
        const LabelValue = (id, lx, label, value, p) => {
          const s1 = label ? label + ' ' : '', w = I.tw(s1, 8) + I.tw(value, 8);
          const it = I.item('ft' + id, lx, T, w, FOOT, { cursor: 'pointer' });
          if (s1) I.text(lx, ty, 0x8a919bff, s1, 8);
          I.text(lx + I.tw(s1, 8), ty, it.hov ? 0xffffffff : C.TextHi, value, 8);
          if (it.clicked) listMenu(I, p, lx, T - 4);
          return lx + w;
        };
        const Check = (id, lx, label, p, tip) => {
          const w = 12 + I.tw(label, 8), it = I.item('ck' + id, lx, T, w, FOOT, { cursor: 'pointer' });
          if (it.clicked) Toggle(p);
          Box(d, lx, T + 3.5, On(p), it.hov);
          I.text(lx + 12, ty, it.hov ? 0xffffffff : C.TextHi, label, 8);
          if (it.hov && tip) I.tip(tip);
          return lx + w;
        };
        let x = X + 8;
        if (compact) {
          x = LabelValue('os', x, 'OS:', P.os.opts[Ix(P.os)], P.os) + 10;
          x = Check('tp', x, 'TP', P.tp, 'True peak limiting (catches inter-sample peaks)') + 10;
          const busy = Ix(P.dith) > 0 || On(P.dc) || On(P.unity), w = I.tw('More', 8) + 10;
          const it = I.item('more', x, T, w, FOOT, { cursor: 'pointer' });
          I.text(x, ty, it.hov ? 0xffffffff : (busy ? C.On : C.TextHi), 'More', 8);
          d.tri(x + w - 7, ty + 3, x + w - 1, ty + 3, x + w - 4, ty + 6.5, 0x9aa1abff);
          if (it.hov) I.tip('Dither, noise shaping, DC filter, unity gain');
          if (it.clicked) I.menu([
            { label: 'Dither: ' + P.dith.opts[Ix(P.dith)], sub: P.dith.opts.map((o, i) => ({ label: o, checked: i === Ix(P.dith), onClick: () => SetIx(P.dith, i) })) },
            { label: 'Noise shaping: ' + P.ns.opts[Ix(P.ns)], sub: P.ns.opts.map((o, i) => ({ label: o, checked: i === Ix(P.ns), onClick: () => SetIx(P.ns, i) })) },
            { label: 'Filter DC offset', checked: On(P.dc), onClick: () => Toggle(P.dc) },
            { label: 'Unity gain', checked: On(P.unity), onClick: () => Toggle(P.unity) },
          ], x, T - 4);
        } else {
          x = LabelValue('os', x, 'Oversampling:', P.os.opts[Ix(P.os)], P.os) + 12;
          x = Check('tp', x, 'True Peak Limiting', P.tp, 'True peak limiting (catches inter-sample peaks)') + 12;
          const di = Ix(P.dith);
          x = LabelValue('dith', x, 'Dither:', P.dith.opts[di], P.dith);
          if (di > 0) x = LabelValue('ns', x + 4, '', P.ns.opts[Ix(P.ns)], P.ns);
          x += 12;
          x = Check('dc', x, 'DC', P.dc, 'Filter DC offset') + 12;
          Check('unity', x, 'Unity Gain', P.unity, 'Unity gain: lowers the output by the gain, to hear the limiting at the same loudness');
        }
        const bx = X + MW - (compact ? 100 : 112), en = Dv.enabled;
        const bt = I.item('byp', bx, T + 2, 12, 12, { cursor: 'pointer' });
        if (bt.clicked) Dv.setEnabled(!en);
        d.rectF(bx, T + 2, bx + 12, T + 14, bt.hov ? 0x2a2e35ff : 0x15171bff, 2);
        d.arc(bx + 6, T + 8.5, 3.2, -PI * 0.25, PI * 1.25, en ? 0x9aa1abff : C.Over, 1.1);
        d.line(bx + 6, T + 4, bx + 6, T + 8, en ? 0x9aa1abff : C.Over, 1.1);
        if (bt.hov) I.tip(en ? 'Bypass' : 'Bypassed');
        const ox = bx + 20;
        I.text(ox, ty, 0x8a919bff, 'Out:', 8);
        I.text(ox + I.tw('Out: ', 8), ty, C.Ceil, P.out.fmt(P.out.v), 8);
      }
    }

    const I = mountIM(body, api, dims().W, H, C.Bg, draw);
    TG.prol2 = I;
    return () => { I.destroy(); };
  }

  FXD.devices.prol2 = {
    id: 'prol2', name: 'Pro-L 2', vendor: 'FabFilter', group: 'FabFilter', width: 640, height: 232,
    blurb: 'Pro-L 2\'s scrolling display in the chain: the blue output, the red gain reduction at the top and the yellow ceiling, next to the Gain slider, Style, the knobs and the meters.',
    steps: [
      { id: 'gain', text: 'Drag the white <b>GAIN</b> arrow up', why: 'More gain pushes more of the drum loop into the ceiling, so the red gain reduction grows.', target: tg('prol2', 'gain') },
      { id: 'style', text: 'Pick another limiting <b>style</b>', why: 'Hover a style in the list for a short note on what it is for. Scroll on the pill to step through them.', target: tg('prol2', 'style') },
      { id: 'loud', text: 'Open the <b>LUFS</b> tab right of the meters', why: 'Momentary, short term and integrated loudness, true peak and your target.', target: tg('prol2', 'loud') },
      { id: 'compact', text: 'Switch to the compact layout', why: 'Half the width: the knobs move under the display and the footer\'s extras go into <b>More</b>.', target: tg('prol2', 'compact') },
    ],
    notes: [
      { title: 'Ceiling and meters', text: 'The yellow arrow right of the output meters is the output level, the dashed line in the display. Click the numbers above the meters to reset the peaks. The headphones button plays only what the limiter takes away.' },
      { title: 'Advanced', text: 'The ADVANCED tab opens the channel linking knobs for transients and release. In the compact layout they take the place of Lookahead, Attack and Release.' },
      { title: 'Levels', text: 'In REAPER the display reads FX Devices\' hidden analyzer, before and after the plugin. The loudness numbers are measured without K-weighting, so they are close to the plugin\'s own LUFS meter but not the same.' },
    ],
    build(body, api) { return buildProL(body, api); },
  };

  /* ================================================================== PRO-R 2 ("Pro R 2.lua") */
  function buildProR(body, api) {
    const Dv = api.device;
    const C = {
      Bg: 0x1c1d22ff, Hdr: 0x202126ff, Panel: 0x26272dff, PanelLo: 0x1f2025ff, Foot: 0x1e1f23ff,
      Disp: 0x15161aff, DispLo: 0x1b1c21ff, Grid: 0x24252bff, GridHi: 0x2f3037ff,
      KnobHi: 0x34353cff, KnobLo: 0x27282eff, Bezel: 0x80818a80, Arc: 0xffd24aff, Dot: 0xf0c63eff,
      Text: 0xe4e5eaff, TextHi: 0xf6f7faff, Dim: 0x64656cff, Scale: 0x84858dff, Label: 0xb6b7beff,
      Time: 0xffd24aff, Pill: 0x3a3b42ff, PillLo: 0x2d2e34ff, PillEdge: 0x4d4e56ff,
      Decay: 0x4aa3ffff, DecayFill: 0x4aa3ff1c, Post: 0xffc14aff, PostFill: 0xffc14a14,
      Tail: 0xffd56a, Spec: 0xe8eaf0c0, SpecPre: 0x9da3b030, Freeze: 0x7fd4ffff, Red: 0xff4f45ff,
      Logo1: 0x8fd0ffff, Logo2: 0x5fb6f5ff, Meter: 0x9ccc4aff, MeterHi: 0xd8e05aff,
    };
    const DECAY_CLR = [0x4aa3ffff, 0x5ab8ffff, 0x3d8de8ff, 0x6fc3ffff, 0x2f7fe0ff, 0x8ad0ffff];
    const POST_CLR = [0xffc14aff, 0xffd36aff, 0xf0a838ff, 0xffe08aff, 0xe8962eff, 0xfff0b0ff];
    const STYLES = ['Modern', 'Vintage', 'Plate'];
    const SYNCS = ['Off', 'Quarter Note', '8th Note', '16th Note', '32nd Note'];
    const POST_SHAPES = ['Bell', 'Low Shelf', 'High Shelf', 'Low Cut', 'High Cut'];
    const DECAY_SHAPES = ['Bell', 'Low Shelf', 'High Shelf', 'Notch'];
    const PLACES = ['Stereo', 'Left', 'Right', 'Mid', 'Side'];
    const SPEC_MODES = ['Reverb+Post', 'Pre+Post', 'Off'];
    const EQ_RANGES = [30, 18, 9];
    const ANG0 = PI * 0.75, ANG1 = PI * 2.25, Ang = v => ANG0 + (ANG1 - ANG0) * v;
    const lvl = v => { const db = 72 * v - 36; return (db >= 0 ? '+' : '') + db.toFixed(1) + ' dB'; };
    const pan = v => Math.abs(v - 0.5) < 0.01 ? 'C' : Math.round(Math.abs(v - 0.5) * 200) + (v < 0.5 ? 'L' : 'R');
    const spaceS = v => 0.2 * 50 ** v, rateOf = v => (25 * 16 ** v) / 100;
    const sLabel = t => t < 1 ? Math.round(t * 1000) + ' ms' : t.toFixed(2) + ' s';
    const P = {
      space: Prm('Space', 0.55, v => sLabel(spaceS(v))),
      decay: Prm('Decay Rate', 0.55, v => Math.round(rateOf(v) * 100) + '%'),
      style: EnumPrm('Style', STYLES, 0),
      pre: Prm('Predelay', 0.08, v => Math.round(v * 500) + ' ms'),
      preSync: EnumPrm('Predelay Sync', SYNCS, 0),
      preOfs: Prm('Predelay Offset', 1 / 3, v => Math.round(50 + 150 * v) + '%'),
      char: Prm('Character', 0.35, pct), bright: Prm('Brightness', 0.62, pct),
      dist: Prm('Distance', 0.4, pct), thick: Prm('Thickness', 0.5, pct),
      duck: Prm('Ducking', 0.2, v => (v * 30).toFixed(1) + ' dB'),
      gate: Prm('Auto Gate', 0, v => v >= 0.5 ? 'On' : 'Off'),
      gateHold: Prm('Auto Gate Hold', 0.3, v => Math.round(v * 1000) + ' ms'),
      gateSync: Prm('Auto Gate Sync', 0, v => v >= 0.5 ? 'On' : 'Off'),
      width: Prm('Stereo Width', 0.6, v => Math.round(v * 200) + '%'),
      freeze: Prm('Freeze', 0, v => v >= 0.5 ? 'On' : 'Off'),
      mix: Prm('Mix', 0.3, pct), lockMix: Prm('Lock Mix', 1, v => v >= 0.5 ? 'On' : 'Off'),
      inLvl: Prm('Input Level', 0.5, lvl), inPan: Prm('Input Pan', 0.5, pan),
      outLvl: Prm('Output Level', 0.5, lvl), outPan: Prm('Output Pan', 0.5, pan),
    };
    const Hz = v => 10 * 3000 ** v, Qv = v => 0.025 * 1600 ** v, qN = q => Math.log(q / 0.025) / Math.log(1600);
    const QL = q => q < 10 ? q.toFixed(2) : q.toFixed(1);
    const mk = (n, bank, o) => Object.assign({ n, bank, Used: 0, On: 1, Freq: 0.5, Gain: 0.5, Q: qN(1), Shape: 0, Place: 0 }, o);
    const Decay = [], Post = [];
    for (let i = 1; i <= 6; i++) { Decay.push(mk(i, 'D')); Post.push(mk(i, 'E')); }
    Object.assign(Decay[0], { Used: 1, Freq: 0.3, Gain: 0.7, Shape: 1 / 3 });
    Object.assign(Decay[1], { Used: 1, Freq: 0.82, Gain: 0.25, Shape: 2 / 3, Q: 0.5 });
    Object.assign(Post[0], { Used: 1, Freq: 0.2, Shape: 3 / 4, Q: 0.3 });
    Object.assign(Post[1], { Used: 1, Freq: 0.55, Gain: 0.42, Shape: 0, Q: 0.45 });
    Object.assign(Post[2], { Used: 1, Freq: 0.86, Gain: 0.6, Shape: 2 / 4 });
    const st = { compact: FXD.store.get('ff:pr:compact', false), spec: 0, piano: false, range: 18, pk: null, lvl: -150 };
    const H = 216, HDR = 17, PANEL = 84, FOOT = 16;
    const Wof = () => st.compact ? 400 : 680;
    const v0 = { space: P.space.v, decay: P.decay.v };

    // drawing helpers
    function Knob(I, p, id, cx, cy, rad, label, bipolar) {
      const r = prmDrag(I, p, id, cx - rad, cy - rad, rad * 2, rad * 2, { label });
      const d = I.d, v = p.v;
      d.circF(cx, cy + rad * 0.12, rad * 1.05, 0x00000070);
      d.circF(cx, cy, rad, C.KnobLo);
      d.circF(cx, cy - rad * 0.08, rad * 0.86, r.lit ? 0x3d3e46ff : C.KnobHi);
      d.circ(cx, cy, rad, r.lit ? 0xb0b1bac0 : C.Bezel, 1);
      const th = Math.max(rad * 0.08, 1.6);
      if (bipolar) { if (v >= 0.5) d.arc(cx, cy, rad * 0.9, Ang(0.5), Ang(v), C.Arc, th); else d.arc(cx, cy, rad * 0.9, Ang(v), Ang(0.5), C.Arc, th); }
      else d.arc(cx, cy, rad * 0.9, ANG0, Ang(v), C.Arc, th);
      const a = Ang(v);
      d.circF(cx + Math.cos(a) * rad * 0.7, cy + Math.sin(a) * rad * 0.7, Math.max(rad * 0.075, 1.6), C.Dot);
      return r;
    }
    function KnobLabel(I, p, r, cx, y, label, size) {
      if (r.lit) I.textC(cx, y, C.TextHi, p.fmt(p.v), size || 8); else I.textC(cx, y, C.Label, label, size || 8);
    }
    function KL(I, p, id, cx, cy, rad, lbl, ly, label, size) { const r = Knob(I, p, id, cx, cy, rad, lbl); KnobLabel(I, p, r, cx, ly, label, size); return r; }
    function Pill(I, id, cx, y, w, hh, s, tip) {
      const L = cx - w / 2, d = I.d;
      const it = I.item(id, L, y, w, hh, { cursor: 'pointer', wheel: true });
      d.rectF(L + 1, y + 2, L + w + 1, y + hh + 2, 0x00000066, hh * 0.35);
      d.grad(L, y, L + w, y + hh, it.hov ? 0x494a52ff : C.Pill, C.PillLo, hh * 0.35);
      d.rect(L, y, L + w, y + hh, C.PillEdge, hh * 0.35);
      I.textC(cx, y + (hh - 9) / 2, C.TextHi, s, 9);
      if (it.hov && tip) I.tip(tip);
      return it;
    }
    function Lock(d, x, y, on, hov) { const c = on ? C.Time : (hov ? C.Text : 0x8a8b92ff); d.rectF(x, y + 4, x + 7, y + 9, c, 1); d.circ(x + 3.5, y + 4, 2.4, c, 1.2); }
    function Note(d, x, y, c) { d.circF(x, y + 5, 2, c); d.line(x + 1.6, y + 5, x + 1.6, y - 1, c, 1); d.line(x + 1.6, y - 1, x + 4, y + 1, c, 1); }
    function RoomIcon(d, i, cx, cy, c) {
      const s = 2.2 + i * 0.55;
      if (i <= 2) { d.rect(cx - s, cy - s * 0.6, cx + s, cy + s * 0.8, c, 0, 1); d.line(cx - s, cy - s * 0.6, cx, cy - s * 1.3, c, 1); d.line(cx, cy - s * 1.3, cx + s, cy - s * 0.6, c, 1); }
      else if (i <= 4) {
        d.rect(cx - s * 1.2, cy - s * 0.5, cx + s * 1.2, cy + s * 0.8, c, 0, 1); d.line(cx - s * 1.4, cy - s * 0.5, cx + s * 1.4, cy - s * 0.5, c, 1);
        for (let k = -1; k <= 1; k++) d.line(cx + k * s * 0.6, cy - s * 0.5, cx + k * s * 0.6, cy + s * 0.8, c, 1);
      } else {
        d.rect(cx - s * 0.9, cy - s * 0.2, cx + s * 0.9, cy + s * 0.8, c, 0, 1); d.line(cx - s * 0.35, cy - s * 0.2, cx, cy - s * 1.4, c, 1);
        d.line(cx, cy - s * 1.4, cx + s * 0.35, cy - s * 0.2, c, 1); d.line(cx, cy - s * 1.4, cx, cy - s * 1.9, c, 1);
      }
    }
    const listMenu = (I, p, x, y, list) => I.menu((list || p.opts).map((o, i) => ({ label: o, checked: i === Ix(p), onClick: () => SetIx(p, i) })), x, y);

    function PredelayCtl(I, cx, ky, rad, lblY, lblSize, noteX, noteY) {
      const synced = Ix(P.preSync) > 0, d = I.d;
      const it = I.item('preSync', noteX - 6, noteY - 3, 14, 12, { cursor: 'pointer' });
      if (it.clicked) listMenu(I, P.preSync, noteX - 6, noteY + 10);
      Note(d, noteX, noteY, synced ? C.Time : (it.hov ? C.Text : 0x8a8b92ff));
      if (it.hov) I.tip('Predelay sync: ' + SYNCS[Ix(P.preSync)]);
      const kp = synced ? P.preOfs : P.pre;
      const r = Knob(I, kp, 'pre', cx, ky, rad, synced ? 'Predelay Offset' : 'Predelay');
      KnobLabel(I, kp, r, cx, lblY, synced ? 'OFFSET' : 'PREDELAY', lblSize);
      return [synced, r];
    }
    function StylePill(I, cx, y, w, hh) {
      const si = Ix(P.style);
      const it = Pill(I, 'style', cx, y, w, hh, STYLES[si], 'Style (click for the list, wheel to step)');
      if (it.clicked) listMenu(I, P.style, cx - w / 2, y + hh + 2);
      if (it.hov && I.M.wheelN) SetIx(P.style, clamp(si + (I.M.wheelN > 0 ? -1 : 1), 0, 2));
    }
    function SpaceCtl(I, cx, cy, rad, rx, ry, decayT, spaceT, rate) {
      const d = I.d;
      for (let i = 1; i <= 5; i++) {
        const t = (i - 1) / 4, a = PI * (1 + t), ix = cx + Math.cos(a) * (rad + rx), iy = cy + Math.sin(a) * (rad + ry);
        const near = Math.abs(P.space.v - t) < 1 / 8;
        const it = I.item('room' + i, ix - 6, iy - 6, 12, 12, { cursor: 'pointer' });
        if (it.clicked) { P.space.v = t; api.check('space'); }
        RoomIcon(d, i + Math.floor((i - 1) / 2), ix, iy + 1, near ? C.Time : (it.hov ? C.TextHi : 0x7c7d85ff));
        if (it.hov) I.tip('Space: ' + P.space.fmt(t));
      }
      Knob(I, P.space, 'space', cx, cy, rad, 'Space');
      I.textC(cx, cy - 6, C.Time, sLabel(decayT), rad > 21 ? 10 : 9);
      if (Math.abs(rate - 1) > 0.005) I.textC(cx, cy + 5, WA(C.Time, 0x99), spaceT.toFixed(2) + ' s', 7);
      I.textC(cx, cy + rad + 4, C.Label, 'SPACE', 8.5);
      I.setAnchor('space', cx - rad - 4, cy - rad - 4, rad * 2 + 8, rad * 2 + 8);
    }
    function GateBtn(I, cx, gy, gw, gh) {
      const L = cx - gw / 2, d = I.d, M = I.M, gon = On(P.gate);
      d.rectF(L, gy, L + gw, gy + gh, gon ? 0x3d3a2cff : C.PillLo, 3);
      d.rect(L, gy, L + gw, gy + gh, gon ? WA(C.Time, 0x90) : C.PillEdge, 3);
      const e = I.item('gateOn', L, gy, 12, gh, { cursor: 'pointer' });
      if (e.clicked) Toggle(P.gate);
      d.circF(L + 6, gy + gh / 2, 2.5, gon ? C.Time : (e.hov ? C.Text : 0x6a6b72ff));
      if (e.hov) I.tip('Auto gate ' + (gon ? 'on' : 'off'));
      const hd = I.item('gateHold', L + 12, gy, gw - 24, gh, { cursor: 'ns-resize', wheel: true });
      if (hd.act && M.dy) P.gateHold.v = clamp(P.gateHold.v - M.dy / 120);
      else if (hd.hov && M.wheel) P.gateHold.v = clamp(P.gateHold.v + Math.sign(M.wheel) * 0.02);
      const s = (hd.hov || hd.act) ? P.gateHold.fmt(P.gateHold.v) : 'AUTO GATE';
      I.textC(L + gw / 2, gy + (gh - 7.5) / 2, gon ? C.TextHi : C.Label, s, 7.5);
      if (hd.hov) I.tip('Auto gate hold: drag up / down');
      const sy = I.item('gateSync', L + gw - 12, gy, 12, gh, { cursor: 'pointer' });
      if (sy.clicked) Toggle(P.gateSync);
      Note(d, L + gw - 7, gy + gh / 2 - 3.5, On(P.gateSync) ? C.Time : (sy.hov ? C.Text : 0x6a6b72ff));
      if (sy.hov) I.tip('Auto gate tempo sync');
    }
    function FreezeBtn(I, cx, fy, fw, fh) {
      const fz = On(P.freeze), d = I.d, it = I.item('freeze', cx - fw / 2, fy, fw, fh, { cursor: 'pointer' });
      if (it.clicked) { Toggle(P.freeze); api.check('freeze'); }
      d.rectF(cx - fw / 2, fy, cx + fw / 2, fy + fh, fz ? 0x24425aff : (it.hov ? 0x3a3b42ff : C.PillLo), 3);
      d.rect(cx - fw / 2, fy, cx + fw / 2, fy + fh, fz ? C.Freeze : C.PillEdge, 3);
      I.textC(cx, fy + (fh - 7.5) / 2, fz ? C.Freeze : C.Label, 'FREEZE', 7.5);
      if (it.hov) I.tip('Freeze: endless decay');
    }
    function MixCtl(I, cx, ky, rad, lblY, lblSize) {
      const r = Knob(I, P.mix, 'mix', cx, ky, rad, 'Mix');
      KnobLabel(I, P.mix, r, cx, lblY, 'MIX', lblSize);
      const lx = cx + I.tw('MIX', lblSize || 8) / 2 + 4, ly = lblY - 1;
      const it = I.item('lockMix', lx - 1, ly, 10, 11, { cursor: 'pointer' });
      if (it.clicked) Toggle(P.lockMix);
      Lock(I.d, lx, ly, On(P.lockMix), it.hov);
      if (it.hov) I.tip('Lock mix (keep it when loading presets)');
    }
    function DecayCtl(I, cx, ky, rad, lblY, lblSize, rateY, rate) {
      const r = Knob(I, P.decay, 'decayK', cx, ky, rad, 'Decay Rate', true);
      if (r.lit) KnobLabel(I, P.decay, r, cx, lblY, 'DECAY RATE', lblSize);
      else { I.textC(cx, lblY, C.Label, 'DECAY RATE', lblSize || 8); if (rateY != null) I.textC(cx, rateY, C.Time, Math.round(rate * 100) + '%', 8); }
      return r;
    }

    // synthetic output spectrum for the analyzer ("Reverb+Post"; "Pre+Post" adds the input)
    const spec = { w: 0 };
    function specStep(iw, esum, fr, dt) {
      if (spec.w !== iw) { spec.w = iw; spec.post = new Float32Array(iw + 2).fill(-100); spec.pre = new Float32Array(iw + 2).fill(-100); spec.started = false; }
      if (!FXD.clock.playing && spec.started) return;
      const first = !spec.started;
      spec.started = true;
      const beat = FXD.clock.beat, t = FXD.clock.time, fb = pmod(beat, 1), kick = Math.exp(-fb * 7);
      const k = first ? 1 : 1 - Math.exp(-dt * 6), kp = first ? 1 : 1 - Math.exp(-dt * 18);
      for (let i = 1; i <= iw; i += 2) {
        const f = fr[i], lf = Math.log2(f), x = lf - 10;
        let v = -46 - 1.1 * x * x;
        if (f < 45) v -= Math.log2(45 / f) * 16;
        if (f > 13000) v -= Math.log2(f / 13000) * 30;
        const pre = v + 9 * Math.exp(-((lf - 6.2) ** 2) / 0.5) * (0.4 + kick) + 2.2 * Math.sin(i * 0.9 + t * 7.1);
        const post = v - 4 + (esum[i] || 0) + 1.5 * Math.sin(i * 0.21 + t * 1.3) * Math.sin(i * 0.07 - t * 0.9);
        spec.pre[i] += (pre - spec.pre[i]) * kp; spec.pre[i + 1] = spec.pre[i];
        spec.post[i] += (post - spec.post[i]) * k; spec.post[i + 1] = spec.post[i];
      }
    }
    function setCompact(on) { st.compact = on; FXD.store.set('ff:pr:compact', on); api.check('compact'); }

    function draw(I) {
      const W = Wof();
      I.setSize(W, H);
      const d = I.d, g = I.g, M = I.M, now = I.now(), compact = st.compact;
      const spaceT = spaceS(P.space.v), rate = rateOf(P.decay.v), decayT = spaceT * rate;
      if (Math.abs(P.space.v - v0.space) > 0.03) api.check('space');
      const X = 0, Y = 0, PT = Y + HDR, PB = Y + HDR + PANEL, DT = PB, DB = Y + H - FOOT, x = f => X + W * f;
      d.rectF(X, Y, X + W, Y + H, C.Bg, 4);
      // control panel
      d.grad(X, PT, X + W, PB, C.Panel, C.PanelLo);
      d.line(X, PB - 1, X + W, PB - 1, 0x0e0f12ff, 1);
      if (!compact) {
        const KY = PT + 40, R = 12, LBL = KY + R + 5;
        { const cx = x(0.06); const [synced, r] = PredelayCtl(I, cx, KY, R, LBL, 8, cx - 1, KY - R - 12); if (synced && !r.lit) I.textC(cx, LBL + 9, C.Time, SYNCS[Ix(P.preSync)], 7); }
        StylePill(I, x(0.205), PT + 5, 68, 14);
        KL(I, P.char, 'char', x(0.16), KY + 5, R - 1, 'Character', LBL + 4, 'CHARACTER');
        KL(I, P.bright, 'bright', x(0.25), KY + 5, R - 1, 'Brightness', LBL + 4, 'BRIGHTNESS');
        SpaceCtl(I, x(0.385), PT + 45, 22, 20, 11, decayT, spaceT, rate);
        DecayCtl(I, x(0.51), KY + 5, R + 1, LBL + 6, 8, KY + 5 - R - 13, rate);
        KL(I, P.dist, 'dist', x(0.6), KY, R, 'Distance', LBL, 'DISTANCE');
        KL(I, P.thick, 'thick', x(0.68), KY, R, 'Thickness', LBL, 'THICKNESS');
        KL(I, P.duck, 'duck', x(0.765), KY - 5, R - 1, 'Ducking', KY + R - 2, 'DUCKING');
        GateBtn(I, x(0.765), LBL + 3, 58, 13);
        KL(I, P.width, 'width', x(0.85), KY, R, 'Stereo Width', LBL, 'STEREO WIDTH');
        FreezeBtn(I, x(0.94), PT + 5, 46, 13);
        MixCtl(I, x(0.94), KY + 5, R, LBL + 4, 8);
      } else {
        SpaceCtl(I, X + 52, PT + 44, 20, 17, 10, decayT, spaceT, rate);
        const colx = k => X + 128 + 56 * k, R1 = PT + 17, R2 = PT + 50, r = 9, L1 = R1 + r + 3, L2 = R2 + r + 3, LS = 7;
        PredelayCtl(I, colx(0), R1, r, L1, LS, colx(0) - r - 9, R1 - 4);
        KL(I, P.char, 'char', colx(1), R1, r, 'Character', L1, 'CHARACTER', LS);
        KL(I, P.bright, 'bright', colx(2), R1, r, 'Brightness', L1, 'BRIGHTNESS', LS);
        KL(I, P.dist, 'dist', colx(3), R1, r, 'Distance', L1, 'DISTANCE', LS);
        KL(I, P.thick, 'thick', colx(4), R1, r, 'Thickness', L1, 'THICKNESS', LS);
        const dr = DecayCtl(I, colx(0), R2, r, L2, LS, null, rate);
        if (!dr.lit) I.textR(colx(0) - r - 3, R2 - 4, C.Time, Math.round(rate * 100) + '%', 7);
        KL(I, P.duck, 'duck', colx(1), R2, r, 'Ducking', L2, 'DUCKING', LS);
        KL(I, P.width, 'width', colx(2), R2, r, 'Stereo Width', L2, 'WIDTH', LS);
        MixCtl(I, colx(3), R2, r, L2, LS);
        FreezeBtn(I, colx(4), R2 - 6, 46, 12);
        StylePill(I, (colx(0) + colx(1)) / 2, PB - 14, 62, 11);
        GateBtn(I, (colx(2) + colx(3)) / 2, PB - 14, 64, 11);
      }

      // reverb display
      const PIANO = st.piano ? 9 : 0, MWm = 8;
      const L = X + 26, T = DT + 2, R = X + W - 26 - MWm, B = DB - 2 - PIANO, w = R - L, hh = B - T, iw = Math.max(Math.floor(w), 2), mid = T + hh / 2, RANGE = st.range;
      const HX = f => L + Curves.HzToX(f, w);
      const DecY = mult => mid - clamp(Math.log2(mult) / 2, -1.1, 1.1) * (hh / 2);
      const EqY = db => mid - Curves.DbToPx(clamp(db, -RANGE * 1.2, RANGE * 1.2), hh, RANGE);
      d.grad(X, DT, X + W, DB, C.Disp, C.DispLo);
      for (const f of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]) {
        const gx = HX(f); d.line(gx, T, gx, B, C.Grid, 1);
        if (!compact || f === 20 || f === 100 || f === 1000 || f === 10000) I.textC(gx, B - 9, 0x4c4d55ff, f >= 1000 ? Math.floor(f / 1000) + 'k' : String(f), 7);
      }
      const step = RANGE >= 30 ? 10 : RANGE >= 18 ? 6 : 3;
      for (let gg = -RANGE + step; gg <= RANGE - step; gg += step) if (gg !== 0) d.line(L, EqY(gg), R, EqY(gg), C.Grid, 1);
      d.line(L, mid, R, mid, C.GridHi, 1);
      const fr = Curves.FreqTable(iw);
      const read = (list, shapes, isDecay) => list.filter(b => b.Used >= 0.5).map(b => {
        const shape = shapes[idxOf(b.Shape, shapes.length)];
        const gain = isDecay ? 20 * Math.log10(4 ** (2 * b.Gain - 1)) : b.Gain * 60 - 30;
        return { src: b, on: b.On >= 0.5, Freq: Hz(b.Freq), Gain: gain, Shape: isDecay && shape === 'Notch' ? 'Bell' : shape, ShapeName: shape, Q: Qv(b.Q), Slope: 12 };
      });
      const decayBands = read(Decay, DECAY_SHAPES, true), postBands = read(Post, POST_SHAPES, false);
      d.clip(L, T, R, B);
      const dsum = new Float32Array(iw + 2); let anyDecay = false;
      for (const b of decayBands) if (b.on) { anyDecay = true; b.Curve = Curves.BandCurveDb(b, iw); for (let i = 1; i <= iw; i++) dsum[i] += b.Curve[i]; }
      const esum = new Float32Array(iw + 2); let anyPost = false;
      for (const b of postBands) if (b.on) { anyPost = true; b.Curve = Curves.BandCurveDb(b, iw); for (let i = 1; i <= iw; i++) esum[i] += b.Curve[i]; }
      // decay per frequency: soft yellow hill
      {
        const lo = Math.log(0.1), hi = Math.log(20);
        const gr = g.createLinearGradient(0, T, 0, B); gr.addColorStop(0, col(C.Tail * 256 + 0x1c)); gr.addColorStop(1, col(C.Tail * 256 + 0x04));
        g.beginPath(); g.moveTo(L, B);
        const pts = [];
        for (let i = 1; i <= iw; i += 2) {
          let t = decayT * 10 ** (dsum[i] / 20); const f = fr[i];
          if (f > 8000) t *= (8000 / f) ** 0.6;
          if (f < 60) t *= (f / 60) ** 0.3;
          const yy = B - clamp((Math.log(t) - lo) / (hi - lo), 0, 1) * hh;
          pts.push([L + i - 1, yy]); g.lineTo(L + i - 1, yy);
        }
        g.lineTo(R, B); g.closePath(); g.fillStyle = gr; g.fill();
        g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]));
        g.strokeStyle = col(C.Tail * 256 + 0x40); g.lineWidth = 1; g.stroke();
      }
      // analyzer
      if (st.spec !== 2) {
        specStep(iw, esum, fr, FXD.clock.dt || 0.016);
        const sy = db => T + (6 - db) / 102 * hh;
        if (st.spec === 1) {
          g.beginPath(); g.moveTo(L, B); for (let i = 1; i <= iw; i += 2) g.lineTo(L + i - 1, sy(spec.pre[i])); g.lineTo(R, B); g.closePath();
          g.fillStyle = col(C.SpecPre); g.fill(); g.strokeStyle = col(WA(C.SpecPre, 0x70)); g.lineWidth = 0.8; g.stroke();
        }
        g.beginPath(); for (let i = 1; i <= iw; i += 2) i === 1 ? g.moveTo(L, sy(spec.post[i])) : g.lineTo(L + i - 1, sy(spec.post[i]));
        g.strokeStyle = col(C.Spec); g.lineWidth = 1; g.stroke();
      }
      // Decay Rate EQ (blue) and Post EQ (yellow)
      const curve = (fn, fillC, lineC, th, doFill) => {
        if (doFill) { g.beginPath(); g.moveTo(L, mid); for (let i = 1; i <= iw; i++) g.lineTo(L + i, fn(i)); g.lineTo(L + iw, mid); g.closePath(); g.fillStyle = col(fillC); g.fill(); }
        g.beginPath(); for (let i = 1; i <= iw; i++) i === 1 ? g.moveTo(L + i, fn(i)) : g.lineTo(L + i, fn(i));
        g.strokeStyle = col(lineC); g.lineWidth = th; g.stroke();
      };
      curve(i => DecY(10 ** (dsum[i] / 20)), C.DecayFill, anyDecay ? C.Decay : WA(C.Decay, 0x60), anyDecay ? 1.8 : 1, anyDecay);
      for (const b of postBands) if (b.on && b.Curve) {
        g.beginPath(); for (let i = 1; i <= iw; i += 2) i === 1 ? g.moveTo(L + i, EqY(b.Curve[i])) : g.lineTo(L + i, EqY(b.Curve[i]));
        g.strokeStyle = col(WA(POST_CLR[b.src.n - 1], 0x50)); g.lineWidth = 1; g.stroke();
      }
      if (anyPost) curve(i => EqY(esum[i]), C.PostFill, C.Post, 1.8, true);
      d.unclip();
      for (const m of [[4, '400%'], [2, '200%'], [1, '100%'], [0.5, '50%'], [0.25, '25%']]) {
        const yy = DecY(m[0]);
        if (yy > T + 2 && yy < B - 4) I.textR(L - 3, yy - 4, anyDecay ? WA(C.Decay, 0xd0) : 0x4a5566ff, m[1], 7);
      }
      for (let gg = -RANGE + step; gg <= RANGE - step; gg += step) I.text(R + 3, EqY(gg) - 4, anyPost ? WA(C.Post, 0xc0) : 0x5e5848ff, (gg > 0 ? '+' : '') + gg, 7);
      I.textR(R - 4, T + 3, WA(C.Time, 0xb0), 'Decay ' + decayT.toFixed(2) + ' s', 7.5);
      if (st.piano) {
        const pT = B + 1, pB = B + PIANO;
        d.rectF(Math.max(HX(26.7), L), pT, Math.min(HX(4310), R), pB, 0xd8d8dcff);
        for (let note = 21; note <= 108; note++) {
          const f0 = 440 * 2 ** ((note - 0.5 - 69) / 12), f1 = 440 * 2 ** ((note + 0.5 - 69) / 12), k = note % 12;
          const black = k === 1 || k === 3 || k === 6 || k === 8 || k === 10, x0 = HX(f0), x1 = HX(f1);
          if (black) d.rectF(x0, pT, x1, pT + PIANO * 0.6, 0x202024ff);
          else if (k === 0 || k === 5) d.line(x0, pT, x0, pB, 0x8a8a90ff, 1);
        }
      }
      // output meter: the reverb's tail on the drum loop
      {
        const a = Dv.enabled ? drumAmp(songTime()) * (1 - P.mix.v * 0.5) + P.mix.v * 0.25 : drumAmp(songTime());
        const db = dbs(a) + (72 * P.outLvl.v - 36);
        st.lvl = FXD.clock.playing || st.lvl < -100 ? Math.max(db, st.lvl - 60 * (FXD.clock.dt || 0.016)) : st.lvl;
        if (!st.pk || st.lvl >= st.pk.v || now - st.pk.t > 2) st.pk = { v: st.lvl, t: now };
        const mL = X + W - MWm - 3, mT = T, mB = DB - 3;
        const Bar = (i, dbv) => {
          const bx = mL + (i - 1) * 4; d.rectF(bx, mT, bx + 3, mB, 0x101114ff);
          const tt = clamp((dbv + 60) / 66, 0, 1);
          if (tt > 0) d.grad(bx, mB - tt * (mB - mT), bx + 3, mB, dbv > 0 ? C.Red : C.MeterHi, C.Meter);
        };
        Bar(1, st.lvl); Bar(2, st.lvl - 0.8);
        const pkT = clamp((st.pk.v + 60) / 66, 0, 1);
        if (pkT > 0) d.line(mL, mB - pkT * (mB - mT), mL + 7, mB - pkT * (mB - mT), st.pk.v > 0 ? C.Red : C.Text, 1);
      }
      // nodes
      let onNode = false;
      const Nodes = (bands, isDecay) => {
        for (const b of bands) {
          const src = b.src, nx = HX(b.Freq), hasGain = isDecay || b.Shape === 'Bell' || b.Shape.includes('Shelf');
          const ny = isDecay ? DecY(10 ** (b.Gain / 20)) : (hasGain ? EqY(b.Gain) : mid);
          const id = (isDecay ? 'D' : 'E') + src.n;
          const it = I.item('node' + id, nx - 6, ny - 6, 12, 12, { cursor: 'grab', wheel: true });
          if (it.hov || it.act) onNode = true;
          if (it.act) {
            const fine = M.shift ? 0.2 : 1, dx = M.dx, dy = M.dy;
            if (dx && !(M.alt && Math.abs(dy) > Math.abs(dx))) src.Freq = clamp(src.Freq + dx / w * fine);
            if (dy && hasGain && !(M.alt && Math.abs(dx) >= Math.abs(dy))) src.Gain = clamp(src.Gain - dy / (isDecay ? hh : (hh / 2) * 60 / RANGE) * fine);
            if (dx || dy) api.check(isDecay ? 'decay' : 'post');
            I.cursor = 'grabbing';
          } else if (it.hov) {
            if (M.wheel) src.Q = clamp(src.Q + M.wheel * 0.02);
            const gs = isDecay ? Math.round(4 ** (2 * src.Gain - 1) * 100) + '%' : sdb(b.Gain);
            I.tip(`${isDecay ? 'Decay Rate' : 'Post EQ'} ${src.n}: ${b.ShapeName}  ${hzLabel(b.Freq)}  ${hasGain ? gs : ''}  Q ${QL(b.Q)}`);
            if (it.rclicked) {
              const shapes = isDecay ? DECAY_SHAPES : POST_SHAPES, cur = idxOf(src.Shape, shapes.length);
              I.menu([...shapes.map((s, i) => ({ label: s, checked: i === cur, icon: shapeSvg(s), onClick: () => { src.Shape = i / (shapes.length - 1); } })), { sep: true },
                { label: 'Stereo placement', sub: PLACES.map((p, i) => ({ label: p, checked: idxOf(src.Place, 5) === i, onClick: () => { src.Place = i / 4; } })) },
                { label: 'Enabled', checked: b.on, onClick: () => { src.On = b.on ? 0 : 1; } }, { label: 'Delete band', onClick: () => { src.Used = 0; } }], M.x + 4, M.y + 4);
            }
          }
          let clr = (isDecay ? DECAY_CLR : POST_CLR)[src.n - 1];
          if (!b.on) clr = WA(clr, 0x55);
          d.circF(nx, ny, (it.hov || it.act) ? 6 : 4.5, WA(clr, 0x48));
          d.circF(nx, ny, 3, clr);
          if (it.hov || it.act) d.circ(nx, ny, 6, clr, 1);
          if (isDecay && src.n === 1) I.setAnchor('decayNode', nx - 8, ny - 8, 16, 16);
        }
      };
      Nodes(decayBands, true); Nodes(postBands, false);
      const bg = I.item('eqbg', L, T, w, hh);
      if (bg.dbl && !onNode) {
        const decay = M.alt, list = decay ? Decay : Post, fb = list.find(b => b.Used < 0.5);
        if (fb) {
          Object.assign(fb, { Used: 1, On: 1, Shape: 0, Freq: clamp((M.x - L) / w), Q: qN(1) });
          fb.Gain = clamp(decay ? 0.5 + (mid - M.y) / hh : 0.5 + (mid - M.y) / (hh / 2) * RANGE / 60);
          api.check(decay ? 'decay' : 'post');
        }
      }
      I.setAnchor('display', L, T, w, hh);

      // header
      {
        const T0 = Y, B0 = Y + HDR;
        d.rectF(X, T0, X + W, B0, C.Hdr, 4);
        d.quad(X, T0, X + 118, T0, X + 108, B0, X, B0, 0x18191dff);
        for (let i = 0; i <= 2; i++) for (let j = 0; j <= 1; j++) d.circF(X + 6 + i * 3, T0 + 6 + j * 4, 0.9, 0xd0d1d8ff);
        I.text(X + 17, T0 + 2, C.TextHi, 'fabfilter', 9);
        const lg = I.item('logo', X + 58, T0, 50, HDR);
        if (lg.hov) I.tip('Open Pro-R 2');
        const pw = I.tw('Pro', 12);
        I.text(X + 60, T0 + 1, lg.hov ? 0xbfe6ffff : C.Logo1, 'Pro', 12);
        d.circF(X + 60 + pw + 2.5, T0 + 9, 1.4, C.Logo2);
        I.text(X + 60 + pw + 5, T0 + 1, lg.hov ? 0xbfe6ffff : C.Logo2, 'R', 12);
        I.text(X + 60 + pw + 5 + I.tw('R', 12) + 1, T0, C.Logo2, '2', 8);
        const pL = X + W * 0.36, pR = X + W * 0.82;
        I.textC(pL + 6, T0 + 3, 0x9a9ba2ff, '<', 9); I.textC(pR - 6, T0 + 3, 0x9a9ba2ff, '>', 9);
        const pn = I.item('preset', pL, T0, pR - pL, HDR);
        if (pn.hov) I.tip('Presets: search, favorites, save');
        d.clip(pL + 14, T0, pR - 14, B0); I.textC((pL + pR) / 2, T0 + 3, pn.hov ? C.TextHi : 0xb0b1b8ff, 'Default Setting', 9); d.unclip();
        const mx = X + W - 18, cm = I.item('hmenu', mx, T0, 14, HDR, { cursor: 'pointer' });
        for (let i = 0; i <= 2; i++) d.line(mx + 3, T0 + 5 + i * 3, mx + 11, T0 + 5 + i * 3, cm.hov ? C.TextHi : 0x9a9ba2ff, 1);
        const tx = mx - 20, ty = T0 + HDR / 2, ct = I.item('compact', tx - 8, T0, 16, HDR, { cursor: 'pointer' });
        if (ct.clicked) setCompact(!compact);
        const c = ct.hov ? C.TextHi : 0x9a9ba2ff, dd = compact ? -1 : 1;
        for (const sg of [-1, 1]) {
          const tip = tx + sg * (compact ? 6 : 1.5);
          d.line(tx + sg * 6, ty, tx + sg * 1.5, ty, c, 1.2);
          d.line(tip, ty, tip - sg * dd * 2.5, ty - 2.5, c, 1.2);
          d.line(tip, ty, tip - sg * dd * 2.5, ty + 2.5, c, 1.2);
        }
        if (ct.hov) I.tip(compact ? 'Full width layout' : 'Compact layout (narrower)');
        I.setAnchor('compact', tx - 8, T0, 16, HDR);
        if (cm.clicked) I.menu([
          { label: 'Compact layout', checked: compact, onClick: () => setCompact(!compact) },
          { label: 'Post EQ scale', sub: EQ_RANGES.map(v => ({ label: '+/- ' + v + ' dB', checked: RANGE === v, onClick: () => { st.range = v; } })) },
          { label: 'Piano keyboard', checked: st.piano, onClick: () => { st.piano = !st.piano; } },
        ], mx + 14, B0, 1);
      }
      // footer
      {
        const T0 = Y + H - FOOT, ty = T0 + 3.5;
        d.rectF(X, T0, X + W, Y + H, C.Foot, 4);
        d.line(X, T0, X + W, T0, 0x0e0f12ff, 1);
        {
          const px = X + 8, it = I.item('piano', px - 2, T0, 18, FOOT, { cursor: 'pointer' });
          if (it.clicked) st.piano = !st.piano;
          const c = st.piano ? C.Time : (it.hov ? C.Text : 0x8a8b92ff);
          d.rect(px, T0 + 4, px + 14, T0 + 12, c, 1, 1);
          for (let k = 1; k <= 3; k++) d.line(px + k * 3.5, T0 + 4, px + k * 3.5, T0 + 12, c, 1);
          for (const k of [1, 2]) d.rectF(px + k * 3.5 + 1.5, T0 + 4, px + k * 3.5 + 3.5, T0 + 8.5, c);
          if (it.hov) I.tip('Piano keyboard');
        }
        {
          const lx = X + 34, s1 = 'Analyzer: ', s2 = SPEC_MODES[st.spec], wd = I.tw(s1, 8) + I.tw(s2, 8);
          const it = I.item('spec', lx, T0, wd, FOOT, { cursor: 'pointer' });
          I.text(lx, ty, 0x8a8b92ff, s1, 8); I.text(lx + I.tw(s1, 8), ty, it.hov ? 0xffffffff : C.TextHi, s2, 8);
          if (it.clicked) I.menu(SPEC_MODES.map((m, i) => ({ label: m, checked: i === st.spec, onClick: () => { st.spec = i; } })), lx, T0 - 4);
        }
        const bx = X + W * (compact ? 0.5 : 0.7), en = Dv.enabled, bt = I.item('byp', bx, T0 + 2, 12, 12, { cursor: 'pointer' });
        if (bt.clicked) Dv.setEnabled(!en);
        d.rectF(bx, T0 + 2, bx + 12, T0 + 14, bt.hov ? 0x2a2b30ff : 0x15161aff, 2);
        if (!en) d.line(bx + 1, T0 + 2.5, bx + 11, T0 + 2.5, C.Red, 2);
        d.arc(bx + 6, T0 + 8.5, 3.2, -PI * 0.25, PI * 1.25, en ? 0x9a9ba2ff : C.Red, 1.1);
        d.line(bx + 6, T0 + 4, bx + 6, T0 + 8, en ? 0x9a9ba2ff : C.Red, 1.1);
        if (bt.hov) I.tip(en ? 'Bypass' : 'Bypassed');
        const FootVal = (p, id, cx, label, prefix) => {
          const s = p.fmt(p.v), tw = I.tw(prefix + s, 8);
          const r = prmDrag(I, p, id, cx - tw / 2 - 2, T0, tw + 4, FOOT, { label });
          I.text(cx - tw / 2, ty, 0x8a8b92ff, prefix, 8);
          I.textR(cx + tw / 2, ty, r.lit ? 0xffffffff : C.TextHi, s, 8);
        };
        if (compact) { FootVal(P.inLvl, 'fin', X + W * 0.68, 'Input Level', 'In '); FootVal(P.outLvl, 'fout', X + W * 0.87, 'Output Level', 'Out '); }
        else {
          FootVal(P.inLvl, 'fin', X + W * 0.77, 'Input Level', 'In '); FootVal(P.inPan, 'finp', X + W * 0.83, 'Input Pan', '');
          FootVal(P.outLvl, 'fout', X + W * 0.89, 'Output Level', 'Out '); FootVal(P.outPan, 'foutp', X + W * 0.955, 'Output Pan', '');
        }
      }
    }

    const I = mountIM(body, api, Wof(), H, C.Bg, draw);
    TG.pror2 = I;
    return () => { I.destroy(); };
  }

  FXD.devices.pror2 = {
    id: 'pror2', name: 'Pro-R 2', vendor: 'FabFilter', group: 'FabFilter', width: 720, height: 232,
    blurb: 'Pro-R 2\'s control row over its decay display: Space with the room icons and decay time, the blue Decay Rate EQ, the yellow Post EQ and how long the reverb rings at each frequency.',
    steps: [
      { id: 'space', text: 'Turn <b>SPACE</b> or click one of the room icons', why: 'Small rooms on the left, churches on the right. The yellow time in the knob is the decay after the Decay Rate.', target: tg('pror2', 'space') },
      { id: 'decay', text: 'Drag a blue <b>Decay Rate</b> node', why: 'Up makes that range ring longer, down shorter. The soft yellow hill shows the decay time across the frequencies.', target: tg('pror2', 'decayNode') },
      { id: 'post', text: 'Drag a yellow <b>Post EQ</b> node, or double-click the display to add one', why: '<kbd>Alt</kbd>+double-click adds a Decay Rate band instead. Scroll on a node for Q, right-click it for the shape.', target: tg('pror2', 'display') },
      { id: 'compact', text: 'Switch to the compact layout', why: 'The arrows left of the menu button. 400 px wide, with the knobs in two rows.', target: tg('pror2', 'compact') },
    ],
    notes: [
      { title: 'Controls', text: 'The note icon over Predelay syncs it to the tempo; the knob then sets an offset. <b>AUTO GATE</b>: the dot turns it on, drag the middle for the hold time, the note syncs it. The padlock by Mix keeps the mix when you load a preset.' },
      { title: 'Display', text: 'Decay Rate on the left scale (25% to 400%), Post EQ on the right (dB). The footer turns on a piano strip under the display and picks the analyzer: Reverb+Post, Pre+Post or Off. The menu sets the Post EQ scale to 9, 18 or 30 dB.' },
    ],
    build(body, api) { return buildProR(body, api); },
  };
})();
