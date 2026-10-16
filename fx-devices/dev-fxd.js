/* FX Devices tour: device registry for the FX Devices, Third-party, MIDI and REAPER layouts.
   Each device recreates a coded layout from src/FX Layout Plugin Scripts (and the shared
   Note Devices UI / Stock FX UI / Clash Finder Core modules). The layouts are drawn in ImGui
   draw-list calls in the real script, so here they are drawn on a <canvas> with a small
   immediate-mode helper (IM below) that mirrors InvisibleButton / IsItemHovered / IsItemActive.
   CSS prefix: fd- */
(function () {
  'use strict';
  const F = window.FXD;
  const { h } = F;
  const clamp = F.clamp;
  const PI = Math.PI, TAU = PI * 2, A0 = PI * 0.75, A1 = PI * 2.25;
  const frac = x => x - Math.floor(x);
  const lerp = (a, b, t) => a + (b - a) * t;

  /* scale of the small-font layouts (ImGui units -> css px). The real script draws these at 1:1
     with 6-8 px Andale Mono labels; 1.25 keeps them readable while staying close to the app. */
  const SC_S = 1.25;

  F.css(`
  .fd-wrap { position: relative; margin: 0 auto; touch-action: none; }
  .fd-cv { display: block; touch-action: none; }
  .fd-anchor { position: absolute; pointer-events: none; }
  .fx-tip.fd-tip { white-space: pre-line; max-width: 360px; }
  .fd-menu { display: flex; flex-direction: column; min-width: 150px; max-height: 300px; overflow: auto; padding: 4px; gap: 1px; }
  .fd-pop { padding: 4px; }
  .fd-mi { all: unset; display: flex; align-items: center; gap: 8px; padding: 4px 9px 4px 8px; border-radius: 5px; font: 500 12px var(--f-ui); color: var(--fx-text); cursor: pointer; white-space: nowrap; }
  .fd-mi:hover, .fd-mi:focus-visible { background: rgba(255,255,255,.08); }
  .fd-mi .fd-ck { width: 10px; color: var(--signal); }
  .fd-mi.fd-on { color: #fff; }
  .fd-mh { font: 600 10px var(--f-mono); color: var(--fx-muted); letter-spacing: .08em; text-transform: uppercase; padding: 6px 8px 2px; }
  .fd-ms { height: 1px; background: var(--fx-border-hi); margin: 3px 4px; }
  `);

  /* ------------------------------------------------------------ colours */
  const cc = new Map();
  /** 0xRRGGBBAA -> css */
  function c32(n) {
    n = n >>> 0;
    let s = cc.get(n);
    if (!s) { s = `rgba(${n >>> 24 & 255},${n >>> 16 & 255},${n >>> 8 & 255},${((n & 255) / 255).toFixed(3)})`; cc.set(n, s); }
    return s;
  }
  /** 0xRRGGBB + alpha 0..1 (the scripts' Hex(c, a)) */
  const hexA = (rgb, a) => c32(((rgb << 8) >>> 0) + Math.round(clamp(a) * 255));
  /** u32 with a new alpha 0..1 */
  const A = (n, a) => c32(((n >>> 0) & 0xffffff00) + Math.round(clamp(a) * 255));
  const HSV = (hh, s, v, a = 1) => F.hsv(hh, s, v, clamp(a));

  /* ------------------------------------------------------------ immediate-mode canvas */
  /**
   * IM(body, W, H, sc, opts) -> G. A canvas W x H units, drawn at sc css px per unit.
   * G.frame(draw) redraws every frame (FXD.onFrame) while the canvas is in the page.
   * Items: G.btn(id, x, y, w, h, cursor) -> { c: clicked (released over it), h: hovered, a: active, start }
   */
  function IM(body, W, H, sc, o = {}) {
    const G = {
      W, H, sc, mx: -1e4, my: -1e4, over: false, down: false, clicked: false, released: false, dbl: false,
      rclick: false, wheel: 0, dx: 0, dy: 0, shift: false, alt: false, active: null, claimed: false,
      cursor: null, wheelRects: [], wheelPrev: [], tipText: null, t: 0,
    };
    const cv = h('canvas', { class: 'fd-cv', style: { width: W * sc + 'px', height: H * sc + 'px' } });
    const wrap = h('div', { class: 'fd-wrap', style: { width: W * sc + 'px', height: H * sc + 'px' } }, cv);
    if (o.pad != null) wrap.style.marginTop = o.pad + 'px';
    body.append(wrap);
    if (o.bg) body.style.background = o.bg;
    const ctx = cv.getContext('2d');
    G.ctx = ctx; G.cv = cv; G.wrap = wrap;
    let dpr = 0;
    const q = { press: false, release: false, dbl: false, rpress: false, wheel: 0 };
    let lmx = null, lmy = null, menuClosedAt = 0;
    function pos(e) {
      const b = cv.getBoundingClientRect();
      const k = b.width / W;
      G.mx = (e.clientX - b.left) / k; G.my = (e.clientY - b.top) / k;
      G.shift = e.shiftKey; G.alt = e.altKey;
    }
    let lastDown = { t: -1e9, x: 0, y: 0 };
    cv.addEventListener('pointerdown', e => {
      pos(e);
      if (performance.now() - menuClosedAt < 80) return;
      G.over = true;
      if (e.button === 0) {
        q.press = true; G.down = true; cv.setPointerCapture(e.pointerId); e.preventDefault();
        // double-click on the second press (like ImGui's IsMouseDoubleClicked)
        const t = performance.now();
        if (t - lastDown.t < 320 && Math.hypot(G.mx - lastDown.x, G.my - lastDown.y) < 6) { q.dbl = true; lastDown.t = -1e9; }
        else lastDown = { t, x: G.mx, y: G.my };
      }
      else if (e.button === 2) { q.rpress = true; G.rdown = true; }
      G.touch = e.pointerType === 'touch';
    });
    cv.addEventListener('pointermove', e => { pos(e); G.over = true; G.touch = e.pointerType === 'touch'; });
    cv.addEventListener('pointerup', e => { pos(e); if (e.button === 0) { q.release = true; G.down = false; } else if (e.button === 2) G.rdown = false; });
    cv.addEventListener('pointercancel', () => { q.release = true; G.down = false; });
    cv.addEventListener('pointerleave', () => { if (!G.down) { G.over = false; } });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('wheel', e => {
      pos(e);
      if (G.wheelPrev.some(r => G.mx >= r[0] && G.mx < r[0] + r[2] && G.my >= r[1] && G.my < r[1] + r[3])) {
        e.preventDefault();
        q.wheel += e.deltaY < 0 ? 1 : -1;
      }
    }, { passive: false });

    // tooltip (FXD look), hosted in the stage so the device body doesn't clip it
    let tipEl = null, tipSince = 0, tipCur = null;
    function tipUpdate() {
      const t = G.down || G.touch ? null : G.tipText;
      if (t !== tipCur) { tipCur = t; tipSince = performance.now(); if (tipEl) { tipEl.remove(); tipEl = null; } }
      if (!t || performance.now() - tipSince < 380) return;
      const host = wrap.closest('.stage-inner') || document.body;
      if (!tipEl) {
        tipEl = h('div', { class: 'fx-tip fx fd-tip' }, t);
        host.append(tipEl);
      }
      const hb = host.getBoundingClientRect(), b = cv.getBoundingClientRect();
      const k = b.width / W;
      let x = b.left - hb.left + G.mx * k + 14, y = b.top - hb.top + G.my * k + 18;
      x = Math.min(x, host.scrollWidth - tipEl.offsetWidth - 6);
      tipEl.style.left = Math.max(4, x) + 'px'; tipEl.style.top = y + 'px';
    }

    G.frame = function (draw) {
      F.onFrame((dt, clock) => {
        if (!cv.isConnected) return;
        const d = Math.min(3, window.devicePixelRatio || 1);
        if (d !== dpr) { dpr = d; cv.width = Math.round(W * sc * d); cv.height = Math.round(H * sc * d); }
        G.clicked = q.press; G.released = q.release; G.dbl = q.dbl; G.rclick = q.rpress; G.wheel = q.wheel;
        q.press = q.release = q.dbl = q.rpress = false; q.wheel = 0;
        G.dx = lmx == null ? 0 : G.mx - lmx; G.dy = lmy == null ? 0 : G.my - lmy;
        lmx = G.mx; lmy = G.my;
        G.claimed = false; G.cursor = null; G.tipText = null; G.anyHov = false;
        G.wheelPrev = G.wheelRects; G.wheelRects = [];
        G.dt = dt; G.clock = clock;
        ctx.setTransform(dpr * sc, 0, 0, dpr * sc, 0, 0);
        ctx.clearRect(0, 0, W, H);
        try { draw(G, dt, clock); } finally {
          if (G.released) G.active = null;
          cv.style.cursor = G.cursor || 'default';
          tipUpdate();
        }
      });
    };
    G.cleanup = () => { if (tipEl) tipEl.remove(); };

    // ---- items
    G.inside = (x, y, w, hh) => G.over && G.mx >= x && G.mx < x + w && G.my >= y && G.my < y + hh;
    G.btn = function (id, x, y, w, hh, cur) {
      const ins = G.inside(x, y, w, hh);
      const hov = ins && (G.active === null || G.active === id);
      let start = false;
      if (G.clicked && ins && !G.claimed && G.active === null) { G.active = id; G.claimed = true; start = true; }
      const a = G.active === id;
      const c = a && G.released && ins;
      if ((hov || a) && cur) G.cursor = cur;
      if (hov) G.anyHov = true;
      return { c, h: hov, a, start };
    };
    /** wheel steps (+1 = up) while the mouse is over the rect (and stop the page scrolling there) */
    G.useWheel = function (x, y, w, hh) {
      G.wheelRects.push([x, y, w, hh]);
      return G.inside(x, y, w, hh) && G.active === null ? G.wheel : 0;
    };
    /** a knob-like drag on a 0..1 value: up = more (Shift = fine), wheel steps, double-click = default */
    G.drag = function (id, x, y, w, hh, getN, setN, op = {}) {
      const b = G.btn(id, x, y, w, hh, op.cursor || 'ns-resize');
      if (b.start) G.acc = getN();
      if (b.a && (G.dx || G.dy)) {
        const d = (-G.dy + (op.horiz ? G.dx : 0)) * sc / (G.shift ? 900 : (op.px || 180));
        G.acc = clamp(G.acc + d);
        setN(G.acc);
      }
      if (b.h || b.a) {
        const wv = G.useWheel(x, y, w, hh);
        if (wv) setN(clamp(getN() + wv * (op.wheelStep || 0.02)));
        if (G.dbl && op.def != null) { setN(op.def); G.acc = op.def; }
      }
      return b;
    };
    G.tip = s => { G.tipText = s; };
    /** invisible element over a region (for step targets) */
    G.anchor = function (x, y, w, hh) {
      const el = h('div', { class: 'fd-anchor', style: { left: x * sc + 'px', top: y * sc + 'px', width: w * sc + 'px', height: hh * sc + 'px' } });
      wrap.append(el);
      return el;
    };
    /** HTML menu (FXD popup) under a region. items: [{ label, on, head, sep, pick: fn }] */
    G.menu = function (x, y, w, hh, items, op = {}) {
      const an = G.anchor(x, y, w, hh);
      const list = h('div', { class: 'fd-menu' });
      let P = null;
      for (const it of items) {
        if (it.sep) { list.append(h('div', { class: 'fd-ms' })); continue; }
        if (it.head) { list.append(h('div', { class: 'fd-mh' }, it.head)); continue; }
        const b = h('button', { class: 'fd-mi' + (it.on ? ' fd-on' : ''), type: 'button' }, h('span', { class: 'fd-ck' }, it.on ? '●' : ''), it.label);
        b.addEventListener('click', () => { P && P.close(); it.pick && it.pick(); });
        list.append(b);
      }
      P = F.popup(an, list, { cls: 'fd-pop', onClose: () => { an.remove(); menuClosedAt = performance.now(); G.menuOpen = false; op.onClose && op.onClose(); } });
      G.menuOpen = true;
      return P;
    };

    // ---- drawing (units)
    const rr = (x, y, w, hh, r) => {
      ctx.beginPath();
      r = Math.max(0, Math.min(r || 0, w / 2, hh / 2));
      if (r > 0.01 && ctx.roundRect) ctx.roundRect(x, y, w, hh, r); else ctx.rect(x, y, w, hh);
    };
    G.rect = (x, y, w, hh, col, r) => { if (w <= 0 || hh <= 0) return; rr(x, y, w, hh, r); ctx.fillStyle = col; ctx.fill(); };
    G.rectS = (x, y, w, hh, col, r, th = 1) => { rr(x + th / 2 - 0.5, y + th / 2 - 0.5, w - th + 1, hh - th + 1, r); ctx.strokeStyle = col; ctx.lineWidth = th; ctx.stroke(); };
    G.circ = (x, y, r, col) => { if (r <= 0) return; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = col; ctx.fill(); };
    G.ring = (x, y, r, col, th = 1) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = col; ctx.lineWidth = th; ctx.stroke(); };
    G.ln = (x1, y1, x2, y2, col, th = 1) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = col; ctx.lineWidth = th; ctx.lineCap = 'butt'; ctx.stroke(); };
    G.arc = (cx, cy, r, a0, a1, th, col, cap) => {
      if (a1 - a0 < 0.003) return;
      ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.strokeStyle = col; ctx.lineWidth = th; ctx.lineCap = cap || 'butt'; ctx.stroke(); ctx.lineCap = 'butt';
    };
    G.tri = (x1, y1, x2, y2, x3, y3, col) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); };
    G.poly = (pts, col) => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); };
    G.pline = (pts, col, th = 1, close) => {
      if (pts.length < 2) return;
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      if (close) ctx.closePath();
      ctx.strokeStyle = col; ctx.lineWidth = th; ctx.lineJoin = 'round'; ctx.stroke();
    };
    /** area under a polyline down to y = base */
    G.area = (pts, base, col) => {
      if (pts.length < 2) return;
      ctx.beginPath(); ctx.moveTo(pts[0][0], base); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.lineTo(pts[pts.length - 1][0], base); ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
    };
    G.gradV = (x, y, w, hh, c1, c2, r) => {
      const g = ctx.createLinearGradient(0, y, 0, y + hh); g.addColorStop(0, c1); g.addColorStop(1, c2);
      rr(x, y, w, hh, r); ctx.fillStyle = g; ctx.fill();
    };
    G.gradH = (x, y, w, hh, c1, c2, r) => {
      const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, c1); g.addColorStop(1, c2);
      rr(x, y, w, hh, r); ctx.fillStyle = g; ctx.fill();
    };
    G.clip = (x, y, w, hh, r) => { ctx.save(); rr(x, y, w, hh, r); ctx.clip(); };
    G.unclip = () => ctx.restore();
    const fonts = {};
    G.font = (size, wt = 500, mono) => `${wt} ${size}px ${mono ? '"JetBrains Mono", ui-monospace, monospace' : '"Inter Tight", "Inter", system-ui, sans-serif'}`;
    G.text = (x, y, s, size, col, align, wt, mono) => {
      ctx.font = G.font(size, wt, mono); ctx.fillStyle = col; ctx.textBaseline = 'top';
      ctx.textAlign = align === 'c' ? 'center' : align === 'r' ? 'right' : 'left';
      ctx.fillText(s, x, y);
    };
    G.tw = (s, size, wt, mono) => { ctx.font = G.font(size, wt, mono); return ctx.measureText(s).width; };
    /** text shrunk to fit maxW, centred on cx, vertically centred on cy */
    G.textFit = (cx, cy, s, size, col, maxW, wt) => {
      while (size > 5 && G.tw(s, size, wt) > maxW) size -= 0.5;
      G.text(cx, cy - size * 0.55, s, size, col, 'c', wt);
    };
    G.fit = (s, size, maxW, wt) => {
      if (G.tw(s, size, wt) <= maxW) return s;
      while (s.length > 1 && G.tw(s + '..', size, wt) > maxW) s = s.slice(0, -1);
      return s + '..';
    };
    void fonts;
    return G;
  }

  /* step targets: build() stores its anchors here, steps read them via tg(device, key) */
  const TG = {};
  const tg = (dev, k) => () => TG[dev] && TG[dev][k];
  /** register a device; build() gets the frame body */
  function reg(d) { F.devices[d.id] = Object.assign({ vendor: 'FX Devices', height: 250 }, d); }
  /** frame size for a layout W x H units at scale sc */
  const frameW = (W, sc) => Math.round(W * sc) + 30 + 8;
  const frameH = (H, sc) => Math.max(250, Math.round(H * sc) + 10);
  const padFor = (H, sc) => Math.max(0, Math.round((frameH(H, sc) - H * sc) / 2) - 1);

  /* ------------------------------------------------------------ JSFX slider parsing */
  /** 'name=def<min,max,step{a,b}>' lines -> [{ name, def, min, max, step, list, log }] */
  function sliders(src) {
    return src.trim().split('\n').map(l => {
      const m = l.trim().match(/^(?:(\w+)=)?(-?[\d.]+)<(-?[\d.]+),(-?[\d.]+)(?:,([\d.]+))?(:log)?(?:\{([^}]*)\})?>/);
      if (!m) throw new Error('bad slider ' + l);
      return { name: m[1] || '', def: +m[2], min: +m[3], max: +m[4], step: m[5] ? +m[5] : 0, log: !!m[6], list: m[7] ? m[7].split(',') : null };
    });
  }
  /** value store over a slider list: get/set real values, nrm/setN normalized, int */
  function Store(defs) {
    const V = defs.map(d => d.def);
    const S = {
      defs, V,
      get: i => V[i],
      int: i => Math.round(V[i]),
      set(i, v) { const d = defs[i]; v = clamp(v, Math.min(d.min, d.max), Math.max(d.min, d.max)); if (d.step >= 1) v = Math.round(v); V[i] = v; S.changed && S.changed(i); },
      nrm(i) { const d = defs[i]; if (d.log && d.min > 0) return Math.log(V[i] / d.min) / Math.log(d.max / d.min); return (V[i] - d.min) / (d.max - d.min || 1); },
      setN(i, u) { const d = defs[i]; u = clamp(u); S.set(i, d.log && d.min > 0 ? d.min * Math.pow(d.max / d.min, u) : d.min + u * (d.max - d.min)); },
      defN(i) { const d = defs[i]; return d.log && d.min > 0 ? Math.log(d.def / d.min) / Math.log(d.max / d.min) : (d.def - d.min) / (d.max - d.min || 1); },
      range: i => [defs[i].min, defs[i].max],
    };
    return S;
  }

  /* ================================================================== KALEIDO CHORUS */
  // FXD Kaleido Chorus.lua: the JSFX's own @gfx in 500 x 216 units.
  const K_NAMES = ['CLASSIC', 'DIMENSION', 'ENSEMBLE', 'TAPE', 'SWARM', 'CRYSTAL', 'LIQUID', 'SPIN'];
  const K_TAGS = ['bucket-brigade duo, warm & grainy', 'subtle anti-phase widener', 'string-machine triple chorus',
    'wow & flutter from worn tape', 'drifting random voices', 'octave shimmer halo', 'through-zero flange', 'rotary horn & drum'];
  const K_CHAR = ['GRIT', 'CROSS', 'VIBRATO', 'WEAR', 'CHAOS', 'SHIMMER', 'ZERO', 'SPEED'];
  const K_SYNC = ['FREE', '4B', '2B', '1B', '1/2', '1/4', '1/8', '1/16'];
  const K_FH = [0.09, 0.47, 0.74, 0.015, 0.27, 0.55, 0.88, 0.64];
  // rate, depth, delay, feedback, character, tone, low cut, width, mix, voices, spread
  const K_RECIPE = [
    [0.5, 70, 3.5, 0, 35, -15, 80, 100, 50, 2, 100], [0.25, 60, 6, 0, 60, 0, 120, 120, 50, 2, 100],
    [0.6, 55, 7, 0, 50, 10, 150, 130, 60, 6, 100], [0.7, 50, 4, 0, 45, -20, 40, 90, 50, 2, 70],
    [0.35, 60, 12, 10, 50, 5, 150, 160, 55, 8, 100], [0.3, 40, 10, 45, 55, 30, 250, 150, 45, 2, 100],
    [0.15, 85, 2.5, 60, 70, 0, 60, 120, 50, 2, 50], [0.8, 80, 1.2, 0, 0, 0, 40, 130, 100, 2, 100],
  ];
  const K_RECIPE_P = ['rate', 'depth', 'delay', 'feedback', 'character', 'tone', 'lowcut', 'width', 'mix', 'voices', 'spread'];
  const K_PRESETS = [
    ['Juno Wide', [0, 0.5, 0, 65, 3.2, 0, 30, -10, 100, 120, 50, 0, 2, 100]],
    ['BBD Grit', [0, 0.9, 0, 80, 4.5, 15, 75, -35, 120, 100, 50, 0, 2, 100]],
    ['Vibrato Only', [0, 4.5, 0, 50, 3, 0, 10, 0, 20, 100, 100, 0, 1, 0]],
    ['Dimension Subtle', [1, 0.25, 0, 45, 6, 0, 40, 0, 150, 110, 40, 0, 2, 100]],
    ['Dimension Max', [1, 0.4, 0, 80, 8, 0, 90, 5, 150, 160, 55, 0, 4, 100]],
    ['String Machine', [2, 0.6, 0, 60, 7, 0, 55, 10, 150, 140, 70, 0, 6, 100]],
    ['Lush Ensemble 16', [2, 0.45, 0, 55, 9, 5, 40, 5, 120, 160, 60, -2, 16, 100]],
    ['Worn Cassette', [3, 0.6, 0, 55, 4, 0, 65, -35, 60, 80, 100, 0, 2, 60]],
    ['Tape Doubler', [3, 0.35, 0, 35, 18, 0, 30, -10, 80, 140, 45, 0, 2, 100]],
    ['Quarter-Note Wobble', [3, 0.5, 5, 70, 5, 0, 40, -15, 40, 100, 60, 0, 2, 70]],
    ['Swarm Cloud 24', [4, 0.25, 0, 70, 14, 15, 60, 0, 150, 180, 60, -3, 24, 100]],
    ['Choir of 64', [4, 0.2, 0, 60, 20, 10, 45, -10, 150, 200, 55, -4, 64, 100]],
    ['Shimmer Halo', [5, 0.3, 0, 40, 10, 55, 70, 30, 300, 160, 45, -1, 2, 100]],
    ['Crystal Bells', [5, 0.5, 0, 30, 6, 30, 90, 40, 400, 140, 35, 0, 4, 100]],
    ['Jet Flange', [6, 0.12, 0, 90, 2, 70, 80, 0, 60, 120, 50, 0, 2, 50]],
    ['Flange 1 Bar', [6, 0.5, 3, 85, 3, 55, 60, 0, 60, 120, 50, 0, 2, 50]],
    ['Leslie Slow', [7, 0.8, 0, 80, 1.2, 0, 0, 0, 40, 130, 100, 0, 2, 100]],
    ['Leslie Fast', [7, 0.8, 0, 80, 1.2, 0, 100, 0, 40, 130, 100, 0, 2, 100]],
  ];
  const K_PORDER = ['flavor', 'rate', 'sync', 'depth', 'delay', 'feedback', 'character', 'tone', 'lowcut', 'width', 'mix', 'out', 'voices', 'spread'];
  const K_RANGE = { rate: [0.03, 10], depth: [0, 100], delay: [0.2, 40], feedback: [-95, 95], character: [0, 100], tone: [-100, 100], width: [0, 200], mix: [0, 100], out: [-24, 12], spread: [0, 100] };
  // knobs: param, x, y, radius, arc origin, label (row 1 = motion, row 2 = colour)
  const K_KNOBS = [
    ['rate', 247, 80, 13, 0, 'RATE'], ['depth', 290, 80, 13, 0, 'DEPTH'], ['delay', 333, 80, 13, 0, 'DELAY'],
    ['voices', 376, 80, 13, 0, 'VOICES'], ['spread', 419, 80, 13, 0, 'SPREAD'],
    ['character', 247, 136, 13, 0, null], ['feedback', 290, 136, 13, 0.5, 'FEEDBACK'], ['tone', 333, 136, 13, 0.5, 'TONE'],
    ['lowcut', 376, 136, 13, 0, 'LOW CUT'], ['width', 419, 136, 13, 0.5, 'WIDTH'],
    ['mix', 467, 100, 19, 0, 'MIX'], ['out', 467, 160, 11, 24 / 36, 'OUTPUT'],
  ];
  const K_DEFAULT = { rate: 0.5, depth: 70, delay: 3.5, feedback: 0, character: 35, tone: -15, lowcut: 80, width: 100, mix: 50, out: 0, voices: 5, spread: 100 };

  function buildKaleido(body, api) {
    const W = 500, H = 216, SC = SC_S;
    const G = IM(body, W, H, SC, { bg: '#15112a', pad: padFor(H, SC) });
    const V = Object.assign({ flavor: 0, sync: 0 }, K_DEFAULT);
    const S = { ph: [], ph2: [], r0: [], r1: [], lfo: [], hist: [], hs: 0.8, ds: 0.8, kf: [], pip: [], now: 0, fl: -1, preset: null };
    const CX = 110, CY = 108, RI = 80;
    const nrm = k => k === 'lowcut' ? Math.log(V.lowcut / 20) / Math.log(50) : k === 'voices' ? Math.log(Math.max(1, V.voices)) / Math.log(64)
      : (V[k] - K_RANGE[k][0]) / (K_RANGE[k][1] - K_RANGE[k][0]);
    const setN = (k, u) => {
      u = clamp(u);
      if (k === 'lowcut') V.lowcut = 20 * Math.pow(50, u);
      else if (k === 'voices') { const n = Math.max(1, Math.min(64, Math.floor(Math.pow(64, u) + 0.5))); if (n !== V.voices) { V.voices = n; if (n >= 8) api.check('voices'); } }
      else V[k] = K_RANGE[k][0] + u * (K_RANGE[k][1] - K_RANGE[k][0]);
      S.preset = S.preset && S.preset.replace(/\*?$/, '*');
    };
    const recipe = f => K_RECIPE_P.forEach((p, j) => { V[p] = K_RECIPE[f][j]; });
    function pick(f, alt) {
      if (alt) { recipe(f); api.check('recipe'); }
      if (f !== V.flavor) api.check('mode');
      V.flavor = f;
    }
    function loadPreset(pr) { K_PORDER.forEach((k, i) => { V[k] = pr[1][i]; }); S.preset = pr[0]; api.check('preset'); }

    function fmt(k, sy) {
      const v = V[k];
      if (k === 'rate') return sy > 0 ? K_SYNC[sy] : (v < 1 ? v.toFixed(2) : v.toFixed(1)) + ' Hz';
      if (k === 'depth' || k === 'character' || k === 'width' || k === 'mix' || k === 'spread') return Math.round(v) + '%';
      if (k === 'delay') return (v < 10 ? v.toFixed(2) : v.toFixed(1)) + ' ms';
      if (k === 'feedback') return (v >= 0 ? '+' : '') + Math.round(v) + '%';
      if (k === 'tone') return (v >= 0 ? '+' : '') + Math.round(v);
      if (k === 'lowcut') return Math.round(v) + ' Hz';
      if (k === 'voices') return v === 1 ? '1 voice' : v + ' voices';
      return (v >= 0 ? '+' : '') + v.toFixed(1) + ' dB';
    }

    // step targets
    const tChips = G.anchor(226, 24, 264, 29), tVox = G.anchor(358, 62, 36, 46), tSync = G.anchor(226, 168, 214, 13), tPre = G.anchor(446, 190, 46, 19);
    TG['fxd-kaleido'] = { chips: tChips, vox: tVox, sync: tSync, pre: tPre };

    const stars = [];
    for (let i = 0; i < 45; i++) stars.push([frac(Math.sin(i * 12.9898) * 43758.5453) * 500, frac(Math.sin(i * 78.233) * 12345.678) * 216, 0.7 + frac(i * 0.37)]);

    G.frame((G, dt, clock) => {
      if (clock.playing) S.now += dt;
      const NOW = S.now;
      const ldt = clock.playing ? dt : 0;
      let fl = V.flavor;
      let hue0 = K_FH[fl];
      const nvox = Math.max(1, Math.min(64, V.voices));
      const spr = V.spread / 100;
      let sy = V.sync;
      const dpv = V.depth / 100, ch = V.character / 100;
      const rate_hz = sy > 0 ? clock.bpm / 60 / Math.pow(2, 5 - sy) : V.rate;

      // ---- LFO voices (same as the JSFX's @block)
      const Vx = [];
      const add = (rm, off, sh, fr = 0, fam = 0, pitch = false) => Vx.push({ rm, off, sh, fr, fam, pitch });
      const gv = (i, n, sh, rmd, fr, fam) => { const g = frac(i * 0.618034 + 0.1); add(1 + rmd * (g * 2 - 1), i / n * spr, sh, fr, fam); };
      if (fl === 0 || fl === 1) for (let i = 0; i < nvox; i++) gv(i, nvox, 1, 0);
      else if (fl === 2) for (let i = 0; i < nvox; i++) gv(i, nvox, 0, 0, 5.5 + 0.3 * Math.floor(i / 2) + 0.2 * (i % 2) + 0.5 * rate_hz, 0.1 + 0.5 * ch);
      else if (fl === 3) for (let i = 0; i < nvox; i++) gv(i, nvox, 2, 0.15 * spr, 7.5 + 0.8 * i + 2 * rate_hz, 0.05 + 0.3 * ch);
      else if (fl === 4) for (let i = 0; i < nvox; i++) gv(i, nvox, 2, 0.2 + 0.6 * ch);
      else if (fl === 5) { for (let i = 0; i < nvox; i++) gv(i, nvox, 0, 0); add(0, 0, 0, 0, 0, true); add(0, 0.5, 0, 0, 0, true); }
      else if (fl === 6) for (let i = 0; i < nvox; i++) gv(i, nvox, 0, 0);
      else {
        const th = rate_hz + (6.8 - rate_hz) * ch, td = 0.82 * rate_hz + (5.9 - 0.82 * rate_hz) * ch;
        S.hs += (th - S.hs) * (1 - Math.exp(-ldt / 0.7)); S.ds += (td - S.ds) * (1 - Math.exp(-ldt / 2.8));
        for (let i = 0; i < nvox; i++) add(S.hs / rate_hz, i / nvox * spr, 0);
        for (let i = 0; i < nvox; i++) add(S.ds / rate_hz, i / nvox * spr + 0.15, 0);
      }
      const nv = Math.min(8, Vx.length);
      if (S.fl !== fl) { S.fl = fl; S.ph = []; S.ph2 = []; S.lfo = []; S.hist = []; }
      S.lfo.length = Math.min(S.lfo.length, Vx.length);
      Vx.forEach((vc, i) => {
        let lf;
        if (vc.pitch) lf = 0.6 * Math.sin(NOW * 1.7 + i);
        else {
          if (S.r1[i] == null) { S.r0[i] = Math.random() * 2 - 1; S.r1[i] = Math.random() * 2 - 1; }
          let ph = (S.ph[i] || 0) + ldt * rate_hz * vc.rm;
          if (ph >= 1) { ph = frac(ph); S.r0[i] = S.r1[i]; S.r1[i] = Math.random() * 2 - 1; }
          S.ph[i] = ph;
          const x = frac(ph + vc.off);
          if (vc.sh === 0) lf = Math.sin(TAU * x);
          else if (vc.sh === 1) lf = 1 - 4 * Math.abs(x - 0.5);
          else { const a = S.r0[i], b = S.r1[i]; lf = a + (b - a) * ph * ph * (3 - 2 * ph); }
          if (vc.fr > 0) { S.ph2[i] = frac((S.ph2[i] || 0) + ldt * vc.fr); lf = (lf + vc.fam * Math.sin(TAU * S.ph2[i])) / (1 + vc.fam); }
        }
        S.lfo[i] = lf;
      });
      const SPAN = 120 / 94;
      if (ldt > 0) {
        S.hist.push({ t: NOW, v: S.lfo.slice(0, nv) });
        while (S.hist.length > 2 && S.hist[1].t < NOW - SPAN) S.hist.shift();
      }

      // ---- interaction (chips, bezel, sync)
      let hot = null;
      for (let f = 0; f < 8; f++) {
        const bx = 226 + (f % 4) * 66, by = 24 + Math.floor(f / 4) * 16;
        const b = G.btn('chip' + f, bx, by, 63, 13, 'pointer');
        if (b.h) { hot = 'f' + f; G.tip('Click: ' + K_NAMES[f].toLowerCase() + ', keeping your knob settings\nAlt-click: also load its recipe'); }
        if (b.c) pick(f, G.alt);
      }
      let tipF = null;
      {
        const b = G.btn('bezel', CX - RI - 18, CY - RI - 18, (RI + 18) * 2, (RI + 18) * 2);
        const dx = G.mx - CX, dy = G.my - CY, dd = Math.hypot(dx, dy);
        if (b.h && dd >= RI && dd <= RI + 18) {
          let fa = (Math.atan2(dy, dx) + 0.5 * PI + PI / 8) % TAU; if (fa < 0) fa += TAU;
          const f = Math.floor(fa / (PI / 4)) % 8;
          hot = 'f' + f; tipF = f; G.cursor = 'pointer';
          if (b.start) pick(f, G.alt);
        }
      }
      const SW = 214 / 8;
      for (let s = 0; s < 8; s++) {
        const b = G.btn('sync' + s, 226 + s * SW, 168, SW, 13, 'pointer');
        if (b.h) { hot = 's' + s; G.tip(s === 0 ? 'Free rate (Hz)' : 'Rate synced to the tempo: ' + ['', '4 bars', '2 bars', '1 bar', '1/2', '1/4', '1/8', '1/16'][s]); }
        if (b.c) { V.sync = s; if (s > 0) api.check('sync'); }
      }
      fl = V.flavor; hue0 = K_FH[fl]; sy = V.sync;

      // ---- background
      G.gradV(0, 0, W, H, c32(0x1b1535ff), c32(0x0d0a1aff));
      for (let i = 0; i < 45; i++) G.circ(stars[i][0], stars[i][1], 0.6, hexA(0xffffff, 0.5 * (0.25 + 0.25 * Math.sin(NOW * stars[i][2] + i))));
      G.rect(220, 3, 277, 210, hexA(0xffffff, 0.025), 8);

      // ---- kaleidoscope
      G.circ(CX, CY, RI, c32(0x0b0918ff));
      for (let i = 0; i < 14; i++) G.circ(CX, CY, RI * (1 - i / 14), HSV(hue0, 0.7, 0.9, 0.035));
      const rot = NOW * 0.08;
      for (let i = 0; i < 6; i++) { const a = rot + i * PI / 3 + PI / 6; G.ln(CX, CY, CX + Math.cos(a) * RI, CY + Math.sin(a) * RI, hexA(0xffffff, 0.05)); }
      const kdt = Math.min(1, dt * 10);
      for (let v = 0; v < nv; v++) { const tgt = (v + 0.5) / nv; const u = S.kf[v] != null ? S.kf[v] : (S.kf[v - 1] != null ? S.kf[v - 1] : tgt); S.kf[v] = u + (tgt - u) * kdt; }
      S.kf.length = nv;
      for (let v = nv - 1; v >= 0; v--) {
        const fv = S.kf[v], lfv = S.lfo[v] || 0;
        let rr = RI * (0.22 + 0.55 * fv) + RI * 0.16 * lfv * (0.3 + 0.7 * dpv);
        rr = Math.min(RI - 6, Math.max(8, rr));
        let aa = 0.08 + fv * (PI / 6 - 0.16) + lfv * 0.12 * dpv;
        aa = Math.min(PI / 6 - 0.02, Math.max(0.02, aa));
        const os = 2.2 + 1.6 * (1 - fv);
        const hv = hue0 + (v / nv - 0.5) * 0.18;
        for (let i = 0; i < 6; i++) {
          const a = rot + i * PI / 3;
          const x1 = CX + Math.cos(a + aa) * rr, y1 = CY + Math.sin(a + aa) * rr, x2 = CX + Math.cos(a - aa) * rr, y2 = CY + Math.sin(a - aa) * rr;
          G.tri(CX, CY, x1, y1, x2, y2, HSV(hv, 0.6, 1, 0.07));
          G.ln(x1, y1, x2, y2, HSV(hv, 0.5, 1, 0.35));
          for (const [px, py] of [[x1, y1], [x2, y2]]) {
            G.circ(px, py, os * 2.4, HSV(hv, 0.6, 1, 0.1));
            G.circ(px, py, os * 1.5, HSV(hv, 0.6, 1, 0.22));
            G.circ(px, py, os, HSV(hv, 0.55, 1, 0.95));
            G.circ(px - os * 0.3, py - os * 0.3, os * 0.35, hexA(0xffffff, 0.8));
          }
        }
      }
      {
        const lvl = clock.playing ? clamp(0.55 + 0.35 * Math.sin(NOW * 2.3) * Math.sin(NOW * 0.9 + 1)) : 0;
        const hex = (r, a, col) => { const pts = []; for (let k = 0; k < 6; k++) pts.push([CX + Math.cos(a + k * PI / 3) * r, CY + Math.sin(a + k * PI / 3) * r]); G.poly(pts, col); };
        hex(14 + 4 * lvl, rot * 2, HSV(hue0, 0.6, 1, 0.25));
        hex(9 + 3 * lvl, rot * 2, HSV(hue0, 0.5, 1, 0.9));
        hex(4.5 + 1.5 * lvl, rot * 2 + PI / 6, HSV(hue0, 0.15, 1, 0.9));
      }
      G.arc(CX, CY, 89, 0, TAU, 16, c32(0x1d1834ff));
      G.arc(CX, CY, 97.3, 0, TAU, 0.8, c32(0x3a3160ff));
      G.arc(CX, CY, 80.7, 0, TAU, 0.8, c32(0x2b2448ff));
      for (let f = 0; f < 8; f++) {
        const fa = -0.5 * PI + f * PI / 4, a0 = fa - PI / 8 + 0.03, a1 = fa + PI / 8 - 0.03;
        if (f === fl) G.arc(CX, CY, 89, a0, a1, 14, HSV(K_FH[f], 0.6, 1, 0.15));
        G.arc(CX, CY, 89, a0, a1, 6, HSV(K_FH[f], 0.6, f === fl ? 1 : 0.55, f === fl ? 0.95 : hot === 'f' + f ? 0.55 : 0.28));
      }

      // ---- header + chips
      {
        let xx = 226;
        const word = 'KALEIDO';
        for (let i = 0; i < word.length; i++) {
          const c = word[i];
          G.text(xx, 4, c, 13, HSV(hue0 + i * 0.07 - 0.2, 0.55, 1, 1), 'l', 700);
          xx += G.tw(c, 13, 700) + 0.5;
        }
        G.text(xx + 4, 9, 'chorus', 7, c32(0x8c84b0ff));
        G.text(492, 9, K_TAGS[fl], 7, HSV(hue0, 0.35, 1, 0.9), 'r');
      }
      for (let f = 0; f < 8; f++) {
        const bx = 226 + (f % 4) * 66, by = 24 + Math.floor(f / 4) * 16, sel = f === fl;
        G.rect(bx, by, 63, 13, sel ? HSV(K_FH[f], 0.65, 0.9, 0.9) : HSV(K_FH[f], 0.5, 0.35, hot === 'f' + f ? 0.75 : 0.5), 6.5);
        G.circ(bx + 7, by + 6.5, 2, sel ? c32(0x15122aff) : HSV(K_FH[f], 0.6, 1, 1));
        G.text(bx + 34, by + 3, K_NAMES[f], 7, sel ? c32(0x15122aff) : HSV(K_FH[f], 0.3, 1, 0.9), 'c');
      }

      // ---- knobs
      const Ang = n => A0 + (A1 - A0) * n;
      K_KNOBS.forEach((K, k) => {
        const [p, cx, cy, rad, org] = K;
        const label = K[5] || K_CHAR[fl];
        const b = G.drag('k' + k, cx - rad - 4, cy - rad - 4, rad * 2 + 8, rad * 2 + 8, () => nrm(p), u => setN(p, u),
          { def: p === 'voices' ? Math.log(2) / Math.log(64) : p === 'lowcut' ? 0.3544 : (K_DEFAULT[p] - K_RANGE[p][0]) / (K_RANGE[p][1] - K_RANGE[p][0]), wheelStep: p === 'voices' ? 0.04 : 0.02 });
        const lit = b.h || b.a;
        const synced = p === 'rate' && sy > 0;
        const n = clamp(nrm(p));
        G.circ(cx + 0.8, cy + 1.6, rad + 1, hexA(0x000000, 0.4));
        const isVox = p === 'voices';
        if (isVox) {
          const ring = rad + 4.5;
          const dr = nvox > 1 ? Math.max(0.6, Math.min(1.9, ring * (A1 - A0) / (nvox - 1) * 0.42)) : 1.9;
          const ease = Math.min(1, dt * 14);
          for (let j = 0; j < nvox; j++) {
            const tgt = nvox > 1 ? j / (nvox - 1) : 0.5;
            let u = S.pip[j] != null ? S.pip[j] : (S.pip[j - 1] != null ? S.pip[j - 1] : 0.5);
            u += (tgt - u) * ease; S.pip[j] = u;
            const a = Ang(u), lf = Math.abs(S.lfo[j] || 0);
            G.circ(cx + Math.cos(a) * ring, cy + Math.sin(a) * ring, dr * (0.85 + 0.3 * lf), HSV(hue0 + (j / nvox - 0.5) * 0.18, 0.6, 1, 0.55 + 0.45 * lf));
          }
          S.pip.length = nvox;
        } else G.arc(cx, cy, rad + 4.5, A0, A1, 2.6, c32(0x2a2346ff));
        if (!synced && !isVox) {
          const lo = Math.min(org, n), hi = Math.max(org, n);
          const a0 = Ang(lo), a1 = Ang(hi);
          const segs = Math.max(2, Math.ceil((a1 - a0) * (rad + 4.5) / 2.5));
          for (let i = 0; i < segs; i++) {
            const aa = a0 + (a1 - a0) * i / segs, ab = a0 + (a1 - a0) * (i + 1) / segs;
            const t = (i + 0.5) / segs;
            const hh = n >= org ? lerp(hue0 - 0.04, hue0 + 0.06, t) : lerp(hue0 + 0.06, hue0 - 0.04, t);
            G.arc(cx, cy, rad + 4.5, aa, ab + (i < segs - 1 ? 0.01 : 0), 2.6, HSV(hh, 0.6, 1, 1));
          }
        }
        G.circ(cx, cy, rad, c32(lit ? 0x352d52ff : 0x2b2442ff));
        G.circ(cx, cy, rad * 0.7, c32(0x3b3260ff));
        G.circ(cx - rad * 0.25, cy - rad * 0.3, rad * 0.3, hexA(0xffffff, 0.07));
        const a = Ang(n);
        G.ln(cx + Math.cos(a) * rad * 0.15, cy + Math.sin(a) * rad * 0.15, cx + Math.cos(a) * rad * 0.8, cy + Math.sin(a) * rad * 0.8, hexA(0xf3eeff, synced ? 0.35 : 1), Math.max(1.6, rad * 0.12));
        if (!isVox) G.circ(cx + Math.cos(a) * (rad + 4.5), cy + Math.sin(a) * (rad + 4.5), 1.8, HSV(hue0, 0.25, 1, 0.95));
        if (lit || isVox) G.text(cx, cy + rad + 6, fmt(p, sy), 7, lit || isVox ? '#fff' : c32(0x9b93c0ff), 'c');
        else if (synced) G.text(cx, cy + rad + 6, K_SYNC[sy], 7, HSV(hue0, 0.4, 1, 1), 'c');
        else G.text(cx, cy + rad + 6, label, 7, c32(0x9b93c0ff), 'c');
      });

      // ---- sync strip + motion strip
      for (let s = 0; s < 8; s++) {
        const bx = 226 + s * SW;
        G.rect(bx + 1, 168, SW - 2, 13, s === sy ? HSV(hue0, 0.6, 0.9, 0.9) : c32(hot === 's' + s ? 0x2e2650ff : 0x221c3aff), 6.5);
        G.text(bx + SW / 2, 171.5, K_SYNC[s], 6, s === sy ? c32(0x15122aff) : c32(0x9b93c0ff), 'c');
      }
      G.rect(226, 187, 214, 23, c32(0x120e22ff), 4);
      G.ln(230, 198.5, 436, 198.5, hexA(0xffffff, 0.08));
      for (let v = 0; v < nv; v++) {
        const col = HSV(hue0 + (v / nv - 0.5) * 0.18, 0.55, 1, 0.85);
        let pts = [];
        const flush = () => { if (pts.length > 1) G.pline(pts, col, 1); pts = []; };
        for (const e of S.hist) {
          const lv = e.v[v];
          if (lv == null) { flush(); continue; }
          pts.push([230 + Math.max(0, 1 - (NOW - e.t) / SPAN) * 206, 198.5 - lv * 9]);
        }
        flush();
      }

      // ---- bezel tooltip, drawn like the JSFX's
      if (tipF != null) {
        const w = G.tw(K_NAMES[tipF], 7) + 8;
        G.rect(G.mx + 8, G.my + 10, w, 12, hexA(0x0b0918, 0.92), 3);
        G.text(G.mx + 12, G.my + 12, K_NAMES[tipF], 7, HSV(K_FH[tipF], 0.4, 1, 1));
      }

      // ---- right-click on the header: extras
      {
        const b = G.btn('hdr', 226, 2, 266, 18);
        if (b.h && G.rclick) G.menu(G.mx - 2, G.my, 4, 4, [{ label: 'Load the recipe for ' + K_NAMES[fl].toLowerCase(), pick: () => { recipe(V.flavor); api.check('recipe'); } }]);
        if (b.h) G.tip('Right-click: load the recipe for ' + K_NAMES[fl].toLowerCase());
      }

      // ---- presets
      {
        const b = G.btn('preset', 446, 190, 46, 19, 'pointer');
        G.rect(446, 190, 46, 19, c32(b.h ? 0x2e2650ff : 0x221c3aff), 5);
        G.text(469, 191.5, 'PRESET', 6, HSV(hue0, 0.4, 1, 1), 'c');
        let nm = S.preset || '-';
        if (nm.length > 10) nm = nm.slice(0, 9) + '.';
        G.text(469, 200, nm, 6, c32(0x9b93c0ff), 'c');
        if (b.h) G.tip(S.preset || 'Presets');
        if (b.c) {
          const items = [];
          let g = null;
          for (const pr of K_PRESETS) {
            const gn = K_NAMES[pr[1][0]];
            if (gn !== g) { g = gn; items.push({ head: gn[0] + gn.slice(1).toLowerCase() }); }
            items.push({ label: pr[0], on: S.preset === pr[0], pick: () => loadPreset(pr) });
          }
          G.menu(446, 190, 46, 19, items);
        }
      }
    });
    return () => G.cleanup();
  }

  reg({
    id: 'fxd-kaleido', name: 'Kaleido Chorus', vendor: 'FX Devices', group: 'FX Devices',
    width: frameW(500, SC_S), height: frameH(216, SC_S),
    blurb: 'A chorus with eight modes, from a warm two-voice BBD to a rotary speaker. The kaleidoscope draws every voice and how its delay moves.',
    steps: [
      { id: 'mode', text: 'Pick a mode: click <b>Swarm</b> or another chip, or a facet on the ring', why: 'A mode keeps your knob settings and changes how the voices move.', target: tg('fxd-kaleido', 'chips') },
      { id: 'voices', text: 'Turn <b>Voices</b> up to 8 or more', why: 'Each voice gets a dot on the knob and a ring in the kaleidoscope.', target: tg('fxd-kaleido', 'vox') },
      { id: 'recipe', text: '<kbd>Opt</kbd>/<kbd>Alt</kbd>+click a mode chip', why: 'That also loads the mode\'s recipe: its own rate, depth, delay and the rest.', target: tg('fxd-kaleido', 'chips') },
      { id: 'sync', text: 'Click a sync value like <b>1/4</b>', why: 'The rate then follows the tempo. Press Space to stop the demo and the motion freezes.', target: tg('fxd-kaleido', 'sync') },
    ],
    notes: [
      { title: 'Presets', text: 'The PRESET button under Output lists 18 factory presets grouped by mode, plus your own saved ones.' },
      { title: 'Real params', text: 'Every knob is an FX Devices param under the drawing, so it can be modulated and linked like any other.' },
    ],
    build(body, api) {
      return buildKaleido(body, api);
    },
  });

  /* ================================================================== CLASH FINDER */
  // Clash Finder.lua draws CF.Panel (src/Functions/Clash Finder Core.lua) at 700 x 216. Here the five
  // instances (one per track) are simulated: each track plays a pattern on FXD.clock, publishes a fast
  // and a long-term spectrum (60 bands, 1/6 oct, tilted +3 dB/oct), and the pair overlap (the quieter of
  // the two tracks per band) is averaged and ranked just like Rank() does.
  const CF_NB = 60, CF_NBAND = 32;
  const cfBandF = b => 20 * Math.pow(2, (b + 0.5) / 6);
  const cfBandLo = b => 20 * Math.pow(2, b / 6);
  const cfDB = p => 10 * Math.log10(Math.max(p, 1e-14));
  const cfHz = f => f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 0 : 1) + 'k' : Math.round(f) + ' Hz';
  const CF_SHAPES = ['Bell', 'Low shelf', 'High shelf', 'Tilt shelf', 'Notch', 'Band pass', 'Low cut', 'High cut'];
  const CF_SLOPES = [6, 12, 18, 24, 36, 48, 72, 96];
  const CF_PLACES = ['Stereo', 'Left', 'Right', 'Mid', 'Side'], CF_PLACE_SHORT = ['ST', 'L', 'R', 'M', 'S'];
  const cfIsGain = t => t <= 3, cfIsCut = t => t >= 6;
  const cfShapeOf = t => t <= 5 ? t : (t <= 13 ? 6 : 7);
  const cfSlopeOf = t => t >= 14 ? t - 14 : (t >= 6 ? t - 6 : 1);
  const cfMakeType = (sh, si) => sh <= 5 ? sh : ((sh === 6 ? 6 : 14) + (si == null ? 1 : si));
  const cfTypeName = t => cfIsCut(t) ? CF_SHAPES[cfShapeOf(t)] + ' ' + CF_SLOPES[cfSlopeOf(t)] : CF_SHAPES[t];
  const cfDefQ = t => t === 0 ? 1 : (t === 4 ? 4 : 0.71);
  const cfUsed = c => c && c.mode > 0, cfActive = c => c && (c.mode === 1 || c.mode === 2), cfByp = c => c && (c.mode === 3 || c.mode === 4);
  const cfIsDyn = c => c && (c.mode === 2 || c.mode === 4) && cfIsGain(c.type);
  const CF_BANDCOL = [0xff8c59ff, 0xffd94cff, 0x8ce666ff, 0x4cd9bfff, 0x59b3ffff, 0x998cffff, 0xf280e6ff, 0xff738cff];
  const CF_RANGES = [[60, 'Sub'], [250, 'Bass'], [500, 'Low mids'], [2000, 'Mids'], [4000, 'Upper mids'], [6000, 'Presence'], [1e9, 'Air']];
  const CF_SEVNAME = ['', 'Mild', 'Medium', 'Strong'], CF_SEVCOL = [0, 0xa3abbdff, 0xffb547ff, 0xff8f80ff], CF_SEVBG = [0, 0x262b35ff, 0x3a2a14ff, 0x3a1c1aff];
  const cfSev = H => H.db > -6 ? 3 : (H.db > -14 ? 2 : 1);
  const Au = (col, a) => ((((col >>> 0) & 0xffffff00) >>> 0) + Math.round(clamp(a) * 255)) >>> 0;
  function cfMix(c1, c2, t) {
    let o = 0;
    for (const s of [24, 16, 8, 0]) { const a = (c1 >>> s) & 255, b = (c2 >>> s) & 255; o = o * 256 + Math.round(a + (b - a) * t); }
    return o >>> 0;
  }
  const cfHeat = (v, a = 1) => { v = clamp(v); return A(v < 0.5 ? cfMix(0x3a2a55ff, 0xd9483bff, v * 2) : cfMix(0xd9483bff, 0xffd166ff, (v - 0.5) * 2), a); };

  // the JSFX's filters (RBJ biquads, first-order sections, Butterworth cascades)
  function cfBiquad(kind, f, g, q, sr) {
    const A_ = Math.pow(10, g / 40), w0 = TAU * f / sr, cs = Math.cos(w0), sn = Math.sin(w0), al = sn / (2 * q), sa = 2 * Math.sqrt(A_) * al;
    let b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
    if (kind === 0) { b0 = 1 + al * A_; b1 = -2 * cs; b2 = 1 - al * A_; a0 = 1 + al / A_; a1 = -2 * cs; a2 = 1 - al / A_; }
    else if (kind === 1) {
      b0 = A_ * ((A_ + 1) - (A_ - 1) * cs + sa); b1 = 2 * A_ * ((A_ - 1) - (A_ + 1) * cs); b2 = A_ * ((A_ + 1) - (A_ - 1) * cs - sa);
      a0 = (A_ + 1) + (A_ - 1) * cs + sa; a1 = -2 * ((A_ - 1) + (A_ + 1) * cs); a2 = (A_ + 1) + (A_ - 1) * cs - sa;
    } else if (kind === 2) {
      b0 = A_ * ((A_ + 1) + (A_ - 1) * cs + sa); b1 = -2 * A_ * ((A_ - 1) + (A_ + 1) * cs); b2 = A_ * ((A_ + 1) + (A_ - 1) * cs - sa);
      a0 = (A_ + 1) - (A_ - 1) * cs + sa; a1 = 2 * ((A_ - 1) - (A_ + 1) * cs); a2 = (A_ + 1) - (A_ - 1) * cs - sa;
    } else if (kind === 3) { b0 = 1; b1 = -2 * cs; b2 = 1; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (kind === 4) { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (kind === 5) { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (kind === 6) { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else { const kk = sn / (1 + cs); if (kind === 7) { b0 = 1; b1 = -1; } else { b0 = kk; b1 = kk; } a0 = 1 + kk; a1 = kk - 1; }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  const CF_ORDER = [1, 2, 3, 4, 6, 8, 12, 16];
  function cfDesign(t, f, g, q, sr) {
    f = clamp(f, 20, sr * 0.45);
    if (t <= 2) return [cfBiquad(t, f, g, q, sr)];
    if (t === 3) return [cfBiquad(1, f, -g / 2, q, sr), cfBiquad(2, f, g / 2, q, sr)];
    if (t === 4) return [cfBiquad(3, f, 0, q, sr)];
    if (t === 5) return [cfBiquad(6, f, 0, q, sr)];
    const hp = t <= 13, ord = CF_ORDER[hp ? t - 6 : t - 14], out = [];
    if (ord % 2 === 1) out.push(cfBiquad(hp ? 7 : 8, f, 0, 0.7071, sr));
    const np = Math.floor(ord / 2);
    for (let i = 1; i <= np; i++) {
      const th = ord % 2 === 1 ? i * PI / ord : (2 * i - 1) * PI / (2 * ord);
      let qq = 0.5 / Math.cos(th);
      if (i === np) qq = qq * q / 0.7071;
      out.push(cfBiquad(hp ? 4 : 5, f, 0, qq, sr));
    }
    return out;
  }
  function cfSecDB(secs, f, sr) {
    const w = TAU * f / sr, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    let db = 0;
    for (const s of secs) {
      const nr = s[0] + s[1] * c1 + s[2] * c2, ni = -(s[1] * s1 + s[2] * s2);
      const dr = 1 + s[3] * c1 + s[4] * c2, di = -(s[3] * s1 + s[4] * s2);
      db += 10 * Math.log10(Math.max(1e-30, (nr * nr + ni * ni) / Math.max(1e-30, dr * dr + di * di)));
    }
    return db;
  }
  const cfIcons = {};
  function cfShapeIcon(G, t, x, y, w, hh, col) {
    const key = t + ':' + w + ':' + hh;
    let pts = cfIcons[key];
    if (!pts) {
      pts = [];
      const g = cfIsGain(t) ? (t === 3 ? 12 : t === 0 ? 10 : 9) : 0;
      let f = (t === 1 || t === 2 || t === 3) ? 900 : (cfIsCut(t) ? 700 : 1000);
      if (t === 1) f = 300; else if (t === 2) f = 2500;
      const secs = cfDesign(t, f, g, t === 0 ? 1.2 : (t === 4 ? 3 : (t === 5 ? 1.6 : 0.71)), 48000);
      const n = Math.max(8, Math.floor(w / 2));
      for (let i = 0; i <= n; i++) pts.push([i / n, clamp(cfSecDB(secs, 20 * Math.pow(1000, i / n), 48000), -14, 14) / 14]);
      cfIcons[key] = pts;
    }
    G.pline(pts.map(p => [x + p[0] * w, y + hh / 2 - p[1] * hh / 2]), col, 1.4);
  }

  // the demo's five tracks: spectral shape (tilted dB bumps: centre Hz, width oct, level) + a pattern
  const CF_TRACKS = [
    { name: 'Kick', col: 0x6f86ffff, perc: 0.95, bumps: [[52, 0.75, -3], [100, 0.9, -12], [3800, 1.3, -31]] },
    { name: 'Bass', col: 0xf5a623ff, perc: 0.3, bumps: [[75, 0.8, -5], [150, 0.9, -9], [300, 1.1, -17], [900, 1.4, -33]], shift: 500 },
    { name: 'Guitar', col: 0x81c784ff, perc: 0.45, bumps: [[220, 1.1, -17], [900, 1.3, -11], [2600, 0.9, -5], [6800, 0.9, -17]] },
    { name: 'Vocal', col: 0x4fc3f7ff, perc: 0.25, bumps: [[230, 0.9, -21], [650, 0.9, -5], [1300, 0.8, -11], [2700, 0.75, -7], [6000, 0.9, -15], [11000, 1.1, -27]], formant: 2700 },
    { name: 'Hats', col: 0xba68c8ff, perc: 0.9, bumps: [[7800, 0.8, -7], [12500, 0.9, -10], [3600, 0.9, -25], [900, 1.2, -45]] },
  ];
  const CF_BASSNOTES = [0, 0, 7, 0, 5, 0, 3, 5];
  function cfEnv(i, beat, bpm) {
    const spb = 60 / bpm;
    if (i === 0) return Math.exp(-frac(beat) * spb / 0.13);
    if (i === 1) { const x = frac(beat * 2); return x < 0.85 ? 0.7 + 0.3 * Math.exp(-x * 5) : 0.12; }
    if (i === 2) { const x = frac(beat + 0.5); return 0.25 + 0.75 * Math.exp(-x * 2); }
    if (i === 3) { if (beat % 8 > 6.5) return 0.004; const x = frac(beat * 2); return 0.35 + 0.65 * Math.pow(Math.sin(PI * Math.min(1, x * 1.15)), 0.7); }
    const x = frac(beat * 4);
    return Math.exp(-x * spb / 4 / 0.035) * (Math.floor(beat * 4) % 2 ? 1 : 0.55);
  }
  function cfSpec(T, sh, fsh, out) {
    for (let b = 0; b < CF_NB; b++) {
      const f = cfBandF(b);
      let p = 1e-10;
      for (const [fc0, w, db] of T.bumps) {
        let fc = fc0;
        if (T.shift && fc0 < T.shift) fc *= sh;
        if (T.formant === fc0) fc *= fsh;
        const d = Math.log2(f / fc) / w;
        p += Math.pow(10, (db - 12 * d * d) / 10) + Math.pow(10, (db - 20 - 9 * Math.abs(d)) / 10);
      }
      out[b] = p;
    }
  }

  function buildClash(body, api) {
    const W = 700, H = 216, SC = 1;
    const G = IM(body, W, H, SC, { bg: c32(0x101318ff), pad: padFor(H, SC) });
    const FS = 12, lineH = 13, chipH = lineH + 4;
    const Txt = (x, y, s, col) => G.text(x, y, s, FS, c32(col), 'l', 400);
    const TW = s => G.tw(s, FS, 400);
    const Fit = (s, maxW) => G.fit(s, FS, maxW, 400);
    const NB = CF_NB, NBAND = CF_NBAND;

    // ---- instances
    const inst = CF_TRACKS.map((T, i) => ({
      T, i, name: T.name, col: T.col, guid: 'cf' + i, slot: i, perc: T.perc,
      long: new Float64Array(NB), fast: new Float64Array(NB), clash: new Float64Array(NB), nz: new Float64Array(NB).fill(1), tgt: new Float64Array(NB),
      cuts: Array.from({ length: NBAND }, () => ({ mode: 0, type: 0, freq: 1000, gain: 0, q: 1, key: 0, place: 0 })),
      gain: new Float64Array(NBAND), autotime: true, attack: 5, release: 150, protect: false, audition: 0, cache: null,
    }));
    const byGuid = {}; inst.forEach(I => { byGuid[I.guid] = I; });
    const own = inst[3]; // this Clash Finder sits on the Vocal track
    // a low cut already on the vocal, so there is a node to try right away
    Object.assign(own.cuts[0], { mode: 1, type: 7, freq: 90, gain: 0, q: 0.71 });
    const pairs = {}; // 'i,j' (i < j) -> average clash power per band
    for (let i = 0; i < inst.length; i++) for (let j = i + 1; j < inst.length; j++) pairs[i + ',' + j] = new Float64Array(NB);
    const S = { depth: -4, dynamic: true, mine: true, beat: 0, hot: [], rankT: 0, now: 0, memo: {}, scroll: 0, legScroll: 0 };
    let abOff = null;

    function step(dt, playing, bpm) {
      if (playing) S.beat += dt * bpm / 60;
      const fall = Math.exp(-dt / 0.12), lk = 1 - Math.exp(-dt / 2.5);
      for (const I of inst) {
        if (playing) {
          const T = I.T;
          const sh = T.shift ? Math.pow(2, CF_BASSNOTES[Math.floor(S.beat * 2) % 8] / 12) : 1;
          const fsh = T.formant ? Math.pow(2, 0.1 * Math.sin(S.beat * 1.7)) : 1;
          cfSpec(T, sh, fsh, I.tgt);
          const e = cfEnv(I.i, S.beat, bpm);
          for (let b = 0; b < NB; b++) {
            I.nz[b] = I.nz[b] * 0.7 + 0.3 * (0.55 + 0.9 * Math.random());
            const v = I.tgt[b] * e * I.nz[b];
            I.fast[b] = Math.max(v, I.fast[b] * fall);
            I.long[b] += (I.fast[b] - I.long[b]) * lk;
          }
        } else for (let b = 0; b < NB; b++) I.fast[b] *= fall;
      }
      if (!playing) return;
      const pa = 1 - Math.exp(-dt / 4);
      for (let i = 0; i < inst.length; i++) for (let j = i + 1; j < inst.length; j++) {
        const P = pairs[i + ',' + j], fa = inst[i].fast, fb = inst[j].fast;
        for (let b = 0; b < NB; b++) P[b] += pa * (Math.min(fa[b], fb[b]) - P[b]);
      }
      for (const I of inst) for (let b = 0; b < NB; b++) {
        let o = 0;
        for (const J of inst) if (J !== I) o += J.fast[b];
        I.clash[b] += pa * (Math.min(I.fast[b], o) - I.clash[b]);
      }
    }
    // a few seconds of the song already analysed, so the panel looks complete at rest
    for (let n = 0; n < 360; n++) step(1 / 30, true, 120);

    function rank() {
      const hot = [];
      let best = 1e-12;
      const s = new Float64Array(NB);
      for (let i = 0; i < inst.length; i++) for (let j = i + 1; j < inst.length; j++) {
        const A_ = inst[i], B = inst[j], v = pairs[i + ',' + j];
        for (let b = 0; b < NB; b++) s[b] = (v[Math.max(0, b - 1)] + 2 * v[b] + v[Math.min(NB - 1, b + 1)]) / 4;
        const peaks = [];
        for (let b = 1; b < NB - 1; b++) if (s[b] >= s[b - 1] && s[b] > s[b + 1] && s[b] > 1e-9) peaks.push(b);
        peaks.sort((x, y) => s[y] - s[x]);
        for (let n = 0; n < Math.min(2, peaks.length); n++) {
          const b = peaks[n];
          if (n > 0 && !(s[b] > s[peaks[0]] * 0.2)) continue;
          let lo = b, hi = b;
          while (lo > 0 && s[lo - 1] > s[b] * 0.3 && s[lo - 1] <= s[lo]) lo--;
          while (hi < NB - 1 && s[hi + 1] > s[b] * 0.3 && s[hi + 1] <= s[hi]) hi++;
          let sw = 0, sf = 0;
          for (let q = lo; q <= hi; q++) { sw += s[q]; sf += s[q] * Math.log(cfBandF(q)); }
          const f = sw > 0 ? Math.exp(sf / sw) : cfBandF(b);
          const Hh = { a: A_, b: B, band: b, f: clamp(f, 20, 20000), lo: cfBandLo(lo), hi: cfBandLo(hi + 1), score: s[b] };
          const Imp = I => { let m = 1e-14; for (let q = 0; q < NB; q++) m = Math.max(m, I.long[q]); return I.long[b] / m; };
          Hh.impA = Imp(A_); Hh.impB = Imp(B);
          Hh.suggest = Hh.impA <= Hh.impB ? A_ : B;
          if (A_.protect !== B.protect) Hh.suggest = A_.protect ? B : A_;
          hot.push(Hh);
          best = Math.max(best, Hh.score);
        }
      }
      hot.sort((x, y) => y.score - x.score);
      const out = [];
      for (const Hh of hot) {
        Hh.db = cfDB(Hh.score / best);
        if (Hh.score > 1e-8 && Hh.db > -24) out.push(Hh);
        if (out.length >= 24) break;
      }
      S.hot = out;
    }
    rank();

    // ---- cuts (as CF.PlaceCut / AddBand / SetCut ...)
    const QFor = (lo, hi) => { const n = Math.max(1 / 3, Math.log2(hi / lo)); return clamp(Math.sqrt(Math.pow(2, n)) / (Math.pow(2, n) - 1), 0.9, 8); };
    function cutNear(I, f) {
      for (let k = 0; k < NBAND; k++) { const c = I.cuts[k]; if (cfUsed(c) && c.type === 0 && Math.abs(Math.log2(c.freq / f)) < 0.34) return k; }
      return -1;
    }
    const hkey = Hh => Hh.a.guid + Hh.b.guid + Math.floor(Math.log2(Hh.f) * 3 + 0.5);
    function memo(Hh, create) {
      const pk = Hh.a.guid < Hh.b.guid ? Hh.a.guid + Hh.b.guid : Hh.b.guid + Hh.a.guid;
      let L = S.memo[pk];
      if (!L) { if (!create) return null; L = S.memo[pk] = []; }
      let bestE = null, bd = 0.5;
      for (const e of L) { const dd = Math.abs(Math.log2(e.f / Hh.f)); if (dd < bd) { bestE = e; bd = dd; } }
      if (bestE) bestE.f = Hh.f; else if (create) { bestE = { f: Hh.f }; L.push(bestE); }
      return bestE;
    }
    function target(Hh) {
      const ka = cutNear(Hh.a, Hh.f), kb = cutNear(Hh.b, Hh.f);
      if (ka >= 0 && kb < 0) return [Hh.a, Hh.b];
      if (kb >= 0 && ka < 0) return [Hh.b, Hh.a];
      const e = memo(Hh);
      if (e && e.g === Hh.a.guid) return [Hh.a, Hh.b];
      if (e && e.g === Hh.b.guid) return [Hh.b, Hh.a];
      return [Hh.suggest, Hh.suggest === Hh.a ? Hh.b : Hh.a];
    }
    function freeBand(I) { for (let j = 0; j < NBAND; j++) if (I.cuts[j].mode === 0) return j; return -1; }
    function placeCut(I, freq, q, gain, dyn, keyI) {
      freq = clamp(freq, 20, 20000);
      let k = -1;
      for (let j = 0; j < NBAND; j++) { const c = I.cuts[j]; if (cfUsed(c) && c.type === 0 && Math.abs(Math.log2(c.freq / freq)) < 0.34) k = j; }
      if (k < 0) k = freeBand(I);
      if (k < 0) return [-1, 'All ' + NBAND + ' bands on ' + I.name + ' are in use'];
      Object.assign(I.cuts[k], { type: 0, freq, q, gain: clamp(gain, -24, 24), place: 0, mode: dyn ? 2 : 1, key: dyn && keyI ? keyI.slot + 1 : 0 });
      return [k];
    }
    function addBand(I, typ, freq, gain, q, dyn) {
      const k = freeBand(I);
      if (k < 0) return [-1, 'All ' + NBAND + ' bands on ' + I.name + ' are in use'];
      Object.assign(I.cuts[k], { type: typ, freq: clamp(freq, 20, 20000), gain: cfIsGain(typ) ? gain : 0, q: q || cfDefQ(typ), key: 0, place: 0, mode: dyn && cfIsGain(typ) ? 2 : 1 });
      I.gain[k] = 0;
      return [k];
    }
    const setCut = (I, k, field, v) => { if (isFinite(v)) I.cuts[k][field] = v; };
    const toggleByp = (I, k) => { const m = I.cuts[k].mode; I.cuts[k].mode = m === 1 ? 3 : m === 2 ? 4 : m === 3 ? 1 : m === 4 ? 2 : m; };
    const removeBand = (I, k) => { I.cuts[k].mode = 0; if (I.audition === k + 1) I.audition = 0; };
    function setShape(I, k, shape) {
      const c = I.cuts[k], old = cfShapeOf(c.type);
      const t = cfMakeType(shape, cfIsCut(c.type) ? cfSlopeOf(c.type) : 1);
      c.type = t;
      if (!cfIsGain(t)) { c.gain = 0; if (c.mode === 2 || c.mode === 4) c.mode -= 1; }
      if (shape !== old) c.q = shape === 4 ? Math.max(c.q, 4) : cfDefQ(t);
    }
    const setSlope = (I, k, si) => { const c = I.cuts[k]; if (cfIsCut(c.type)) c.type = cfMakeType(cfShapeOf(c.type), clamp(si, 0, 7)); };
    function setDynamic(I, k, on, keySlot) {
      const c = I.cuts[k];
      if (!c || !cfIsGain(c.type)) return;
      const byp = cfByp(c);
      c.mode = on ? (byp ? 4 : 2) : (byp ? 3 : 1);
      if (keySlot != null) c.key = keySlot;
      api.check('mode');
    }
    const keyInst = c => c && c.key > 0 ? inst.find(J => J.slot === c.key - 1) : null;
    function keyPerc(I, c) {
      const J = keyInst(c);
      if (J) return J.perc;
      const b0 = clamp(Math.floor(Math.log2(c.freq / 20) * 6), 1, NB - 2);
      let sw = 0, sp = 0;
      for (const O of inst) if (O !== I) { const w = O.long[b0 - 1] * 0.5 + O.long[b0] + O.long[b0 + 1] * 0.5; sw += w; sp += w * O.perc; }
      return sw > 1e-12 ? sp / sw : 0.5;
    }
    function bandTiming(I, c) {
      if (!I.autotime) return [I.attack, I.release, null];
      const p = keyPerc(I, c);
      return [12 - 11 * p, 300 - 250 * p, p];
    }
    // live gain of the dynamic bands: the gain scaled by how much the key plays there (duck range 9 dB)
    function dynGains(dt) {
      for (const I of inst) for (let k = 0; k < NBAND; k++) {
        const c = I.cuts[k];
        if (!(c.mode === 2 && cfIsGain(c.type))) { I.gain[k] = c.gain; continue; }
        const fb = Math.log2(c.freq / 20) * 6 - 0.5, b0 = clamp(Math.floor(fb + 0.5), 1, NB - 2);
        let kf = 0, kl = 0;
        for (const J of inst) {
          if (c.key ? J.slot !== c.key - 1 : J === I) continue;
          for (let b = b0 - 1; b <= b0 + 1; b++) { const w = b === b0 ? 1 : 0.5; kf += J.fast[b] * w; kl += J.long[b] * w; }
        }
        const tg = kf > 1e-7 && kl > 1e-12 ? c.gain * clamp((10 * Math.log10(kf / kl) + 9) / 9) : 0;
        const [att, rel] = bandTiming(I, c);
        const tau = (tg < I.gain[k] ? att : rel) / 1000;
        I.gain[k] += (tg - I.gain[k]) * (1 - Math.exp(-dt / Math.max(0.001, tau)));
      }
    }
    // whole-EQ curves (target and live) at fs[], cached per settings
    function curves(I, fs) {
      const sig = [fs.length];
      for (let k = 0; k < NBAND; k++) { const c = I.cuts[k]; if (cfActive(c)) sig.push(k, c.mode, c.type, c.freq.toFixed(1), c.gain.toFixed(2), c.q.toFixed(2), I.gain[k].toFixed(2)); }
      const key = sig.join('|');
      if (I.cache && I.cache.key === key) return I.cache;
      const tgt = new Float64Array(fs.length), live = new Float64Array(fs.length);
      let any = false;
      for (let k = 0; k < NBAND; k++) {
        const c = I.cuts[k];
        if (!cfActive(c)) continue;
        any = true;
        const s1 = cfDesign(c.type, c.freq, c.gain, c.q, 48000);
        const s2 = c.mode === 2 && cfIsGain(c.type) ? cfDesign(c.type, c.freq, I.gain[k], c.q, 48000) : s1;
        for (let i = 0; i < fs.length; i++) {
          tgt[i] += clamp(cfSecDB(s1, fs[i], 48000), -60, 30);
          live[i] += s2 === s1 ? clamp(cfSecDB(s1, fs[i], 48000), -60, 30) : clamp(cfSecDB(s2, fs[i], 48000), -60, 30);
        }
      }
      I.cache = { key, tgt, live, any };
      return I.cache;
    }
    function toast(text) { S.toast = { t: S.now, text }; }
    function swapClash(Hh) {
      const [T, O] = target(Hh);
      const k = cutNear(T, Hh.f);
      let ok = true, why = null;
      if (k >= 0) {
        const c = T.cuts[k], dyn = c.mode === 2 || c.mode === 4, byp = cfByp(c);
        const r = placeCut(O, c.freq, c.q, c.gain, dyn, T);
        if (r[0] >= 0) { removeBand(T, k); if (byp) toggleByp(O, r[0]); } else { ok = false; why = r[1]; }
      }
      if (ok) memo(Hh, true).g = O.guid;
      return [ok, why];
    }
    function abToggle() {
      if (abOff) { for (const e of abOff) { const c = byGuid[e.guid].cuts[e.k]; if (c.mode === e.m + 2) c.mode = e.m; } abOff = null; }
      else {
        const list = [];
        for (const I of inst) for (let k = 0; k < NBAND; k++) { const c = I.cuts[k]; if (cfActive(c)) { list.push({ guid: I.guid, k, m: c.mode }); c.mode += 2; } }
        abOff = list.length ? list : null;
      }
    }

    // ---- step targets
    const tList = G.anchor(450, 31, 244, 50), tPlot = G.anchor(129, 50, 313, 140);
    TG['fxd-clash-finder'] = { list: tList, plot: tPlot, chip: tList };

    const POP_W = 196;
    G.frame((G, dt, clock) => {
      S.now += dt;
      const now = S.now;
      step(dt, clock.playing, clock.bpm);
      if (clock.playing && now - S.rankT > 0.25) { S.rankT = now; rank(); }
      dynGains(dt);
      const mx = G.mx, my = G.my, shift = G.shift, alt = G.alt;
      const w = W, h = H, X0 = 0, Y0 = 0;
      // the band popup (drawn at the end) takes the mouse from everything under it
      const R0 = S.popRect;
      S.popOver = !!R0 && G.over && mx >= R0[0] - 2 && mx <= R0[2] + 2 && my >= R0[1] - 2 && my <= R0[3] + 2;
      const Btn = (bid, x, y, bw, bh, cur) => {
        if (S.popOver || G.menuOpen) return { c: false, h: false, a: G.active === bid };
        return G.btn(bid, x, y, Math.max(1, bw), Math.max(1, bh), cur);
      };
      const Chip = (bid, x, y, label, on, accent, tip, txtCol) => {
        const bw = TW(label) + 12;
        const b = Btn(bid, x, y, bw, chipH, 'pointer');
        G.rect(x, y, bw, chipH, c32(on ? (accent || 0x4fc3f7ff) : (b.h ? 0x2c3140ff : 0x1c2029ff)), 4);
        if (!on) G.rectS(x, y, bw, chipH, c32(b.h ? 0x46506aff : 0x2a2f3aff), 4);
        Txt(x + 6, y + 2, label, on ? 0x0d1016ff : (txtCol || (b.h ? 0xe6e9f0ff : 0xa3abbdff)));
        if (b.h && tip) G.tip(tip);
        return [b.c, bw];
      };
      const focus = (S.editGuid && byGuid[S.editGuid]) || own;
      const mineOnly = S.mine;
      G.rect(X0, Y0, w, h, c32(0x121419ff), 6);

      // clashes shown; with the mouse over the list the ranking holds still
      let shown;
      if ((S.overList || S.amtDrag) && S.frozen && S.frozenMine === mineOnly) shown = S.frozen;
      else { shown = S.hot.filter(Hh => !mineOnly || Hh.a === own || Hh.b === own); S.frozen = shown; S.frozenMine = mineOnly; }

      const plan = Hh => { const e = memo(Hh); let dyn = e && e.dyn; if (dyn == null) dyn = S.dynamic; return [S.depth, dyn]; };
      function cutClash(Hh) {
        const [T, O] = target(Hh), [d, dyn] = plan(Hh);
        const r = placeCut(T, Hh.f, QFor(Hh.lo, Hh.hi), d, dyn, O);
        if (r[0] >= 0) {
          T.gain[r[0]] = dyn ? 0 : d;
          toast(T.name + ': ' + (dyn ? 'dynamic' : 'static') + ' cut at ' + cfHz(Hh.f) + ', ' + d.toFixed(0) + ' dB' + (dyn ? ' (while ' + O.name + ' plays)' : ''));
          api.check('cut');
        } else toast(r[1] || 'Could not add a band');
      }
      function fixTop(n) {
        let done = 0;
        for (const Hh of shown) {
          if (done >= n) break;
          const [T, O] = target(Hh);
          if (cutNear(T, Hh.f) < 0) { const [d, dyn] = plan(Hh); if (placeCut(T, Hh.f, QFor(Hh.lo, Hh.hi), d, dyn, O)[0] >= 0) done++; }
        }
        toast(done === 0 ? 'The top clashes already have cuts' : 'Cut the top ' + done + ' clash' + (done === 1 ? '' : 'es'));
        if (done) api.check('cut');
      }
      function swapAll() {
        let n = 0, fail = null;
        for (const Hh of shown) { const [ok, why] = swapClash(Hh); if (ok) n++; else fail = why; }
        toast(fail || 'Swapped ' + n + ' clash' + (n === 1 ? '' : 'es') + ' to the other track');
      }

      // ---- header (right to left)
      const hy = Y0 + 6, nAll = inst.length, live = clock.playing;
      Txt(X0 + 10, hy + 2, 'CLASH', 0xff6b5bff);
      Txt(X0 + 10 + TW('CLASH '), hy + 2, 'FINDER', 0xe6ebf5ff);
      let leftEnd = X0 + 10 + TW('CLASH FINDER') + 12;
      {
        const w1 = TW('This track') + 14, w2 = TW('All tracks') + 14, sx = leftEnd;
        G.rect(sx, hy, w1 + w2 + 4, chipH, c32(0x171a21ff), 5);
        G.rectS(sx, hy, w1 + w2 + 4, chipH, c32(0x2a2f3aff), 5);
        const Seg = (bid, x, sw, label, on, tip) => {
          const b = Btn(bid, x, hy + 2, sw, chipH - 4, 'pointer');
          if (on) { G.rect(x, hy + 2, sw, chipH - 4, c32(0x262b35ff), 4); G.rectS(x, hy + 2, sw, chipH - 4, c32(0x3a4150ff), 4); }
          Txt(x + 7, hy + 2, label, on ? 0xe6e9f0ff : (b.h ? 0xc9d1e6ff : 0x8a93a6ff));
          if (b.h) G.tip(tip);
          return b.c;
        };
        if (Seg('mineT', sx + 2, w1, 'This track', S.mine, 'Show only the clashes that involve ' + own.name)) S.mine = true;
        if (Seg('mineA', sx + 2 + w1, w2, 'All tracks', !S.mine, 'Show every clash in the project')) S.mine = false;
        leftEnd = sx + w1 + w2 + 4 + 10;
      }
      let rx = X0 + w - 8;
      const hidden = {};
      const Room = bw => rx - bw >= leftEnd + 60;
      const RightChip = (bid, label, on, accent, tip, txtCol) => {
        const bw = TW(label) + 12;
        if (!Room(bw)) { hidden[bid] = true; return false; }
        rx -= bw;
        const [c] = Chip(bid, rx, hy, label, on, accent, tip, txtCol);
        rx -= 4;
        return c;
      };
      const menuX = rx - TW('...') - 12;
      if (RightChip('menu', '...', false, null, 'More: reset the analysis, A/B, protect a track')) S.openMenu = [menuX, hy];
      const Gap = () => { rx -= 6; G.ln(rx + 3.5, hy + 3, rx + 3.5, hy + chipH - 3, c32(0x2a2f3aff)); rx -= 4; };
      {
        const wD = TW('Dynamic') + 12, wS = TW('Static') + 12, wDepth = TW('-24 dB') + 12, wLbl = TW('New cuts') + 6;
        if (Room(wD + wS + wDepth + wLbl + 8)) {
          rx -= wS;
          if (Chip('sta', rx, hy, 'Static', !S.dynamic, 0xc9d1e6ff, 'New cuts are static bells')[0]) S.dynamic = false;
          rx -= wD;
          if (Chip('dyn', rx, hy, 'Dynamic', S.dynamic, 0x5fd3ffff, 'New cuts are dynamic: they only dig in while the other track\nplays in that zone (no sidechain routing needed)')[0]) S.dynamic = true;
          rx -= 4 + wDepth;
          const label = S.depth + ' dB';
          const b = Btn('depth', rx, hy, wDepth, chipH, 'pointer');
          G.rect(rx, hy, wDepth, chipH, c32(b.h ? 0x2c3140ff : 0x1c2029ff), 4);
          G.rectS(rx, hy, wDepth, chipH, c32(0x2a2f3aff), 4);
          Txt(rx + (wDepth - TW(label)) / 2, hy + 2, label, 0xffd54fff);
          if (b.h) {
            const wv = G.useWheel(rx, hy, wDepth, chipH);
            if (wv) S.depth = clamp(S.depth + (wv > 0 ? 1 : -1), -24, -1);
            if (G.rclick) S.depth = clamp(S.depth + 1, -24, -1);
            G.tip('Depth of a new cut\nClick or wheel down = deeper, right-click = shallower');
          }
          if (b.c) S.depth = clamp(S.depth - 1, -24, -1);
          rx -= wLbl;
          Txt(rx, hy + 2, 'New cuts', 0x6b7385ff);
          rx -= 4;
        } else hidden.newcuts = true;
      }
      Gap();
      if (RightChip('swapall', 'Swap all', false, null, 'Move every clash\'s cut to the other track of its pair\n(clashes without a cut just switch which track they would cut)')) swapAll();
      if (RightChip('fix', 'Fix top 3', false, null, 'Cut the 3 worst clashes on their suggested tracks, with the settings shown\n(one undo step)')) fixTop(3);
      if (RightChip('ab', abOff ? 'Cuts off' : 'A/B', !!abOff, 0xffb547ff, abOff ? 'Every Clash Finder cut is bypassed. Click to bring them back.' : 'Bypass every Clash Finder cut to hear the mix without them')) abToggle();
      {
        const status = live ? 'Listening · ' + nAll + ' tracks' : nAll + ' tracks · play to analyse';
        const room = rx - leftEnd - 4;
        if (room > 40) {
          const s = Fit(status, room - 22), pw = TW(s) + 22;
          G.rect(leftEnd, hy, pw, chipH, c32(live ? 0x1b2a22ff : 0x1c2029ff), chipH / 2);
          const pulse = live ? 0.55 + 0.45 * Math.sin(now * 4) : 1;
          G.circ(leftEnd + 9, hy + chipH / 2, 3.5, live ? A(0x5fdc8cff, pulse) : c32(0x6b7385ff));
          Txt(leftEnd + 17, hy + 2, s, live ? 0x7be0a1ff : 0x8a93a6ff);
        }
      }
      if (S.openMenu) {
        const [x, y] = S.openMenu; S.openMenu = null;
        const items = [];
        if (hidden.newcuts) {
          items.push({ head: 'New cuts' }, { label: 'Dynamic', on: S.dynamic, pick: () => { S.dynamic = true; } }, { label: 'Static', on: !S.dynamic, pick: () => { S.dynamic = false; } });
          for (const d of [-2, -3, -4, -6, -8, -12]) items.push({ label: 'Depth: ' + d + ' dB', on: S.depth === d, pick: () => { S.depth = d; } });
          items.push({ sep: true });
        }
        items.push({ label: 'Bypass all cuts (A/B)', on: !!abOff, pick: abToggle }, { label: 'Fix the top 3 clashes', pick: () => fixTop(3) },
          { label: 'Swap every clash to the other track', pick: swapAll },
          { label: 'Protect ' + focus.name + ' (never suggest cutting it)', on: focus.protect, pick: () => { focus.protect = !focus.protect; rank(); } },
          { sep: true }, { label: 'Reset the analysis', pick: () => { for (const I of inst) { I.long.fill(0); I.clash.fill(0); } for (const k in pairs) pairs[k].fill(0); rank(); } });
        G.menu(x, y, TW('...') + 12, chipH, items);
      }

      const top = hy + chipH + 8;
      G.ln(X0 + 1, top - 3.5, X0 + w - 1, top - 3.5, c32(0x2a2f3aff));

      // ---- layout: [track legend] plot [clash list]
      const legendW = clamp(Math.floor(w * 0.17), 110, 150);
      const cx0 = X0 + legendW, cw_ = w - legendW;
      const px0 = cx0 + 10, py0 = top + lineH + 6;
      const listW = clamp(Math.floor(cw_ * 0.42), 250, 380);
      const px1 = X0 + w - listW - 8, py1 = Y0 + h - 8;
      const lx0 = px1 + 8, ly0 = top, lx1 = X0 + w - 6, ly1 = Y0 + h - 6;
      const stripH = 8, gy1 = py1 - stripH - 6;
      S.overList = G.over && mx >= lx0 && mx < lx1 && my >= ly0 && my < ly1 && !S.popOver;
      const hovH = S.hovH; S.hovH = null;
      let selH = null;
      if (S.selKey) for (const Hh of shown) if (hkey(Hh) === S.selKey) selH = Hh;
      const AP = hovH || selH;

      // ---- track legend
      {
        const score = new Map();
        let smax = 1e-9;
        for (const Hh of S.hot) { const v = clamp(1 + Hh.db / 24); score.set(Hh.a, (score.get(Hh.a) || 0) + v); score.set(Hh.b, (score.get(Hh.b) || 0) + v); }
        for (const v of score.values()) smax = Math.max(smax, v);
        const x0 = X0 + 6, x1 = X0 + legendW - 4;
        G.ln(X0 + legendW + 0.5, top - 4, X0 + legendW + 0.5, Y0 + h - 1, c32(0x2a2f3aff));
        Txt(x0 + 4, top + 1, 'TRACKS', 0x6b7385ff);
        const rowH = lineH + 12;
        let y = top + lineH + 6;
        for (const I of inst) {
          const inPair = !AP || AP.a === I || AP.b === I, isEd = I === focus, lockX = x1 - lineH - 2;
          const b = Btn('leg' + I.i, x0, y, lockX - x0 - 2, rowH - 2, 'pointer');
          const lb = Btn('lock' + I.i, lockX, y, lineH + 2, rowH - 2, 'pointer');
          if (isEd) { G.rect(x0, y, x1 - x0, rowH - 2, c32(0x1e222bff), 4); G.rect(x0, y + 2, 2, rowH - 6, c32(I.col)); }
          else if (b.h || lb.h) G.rect(x0, y, x1 - x0, rowH - 2, c32(0x191c23ff), 4);
          const a = inPair ? 1 : 0.4;
          G.circ(x0 + 9, y + lineH / 2 + 3, 3.5, A(I.col, a));
          Txt(x0 + 17, y + 2, Fit(I.name, lockX - x0 - 20), Au(isEd ? 0xffffffff : 0xc9d1e6ff, a));
          if (I.protect || lb.h) cfLock(G, lockX + 1, y + 2, lineH, c32(I.protect ? 0xb49cffff : 0x6b7385ff), I.protect);
          const mw = x1 - x0 - 17 - 4;
          G.rect(x0 + 17, y + lineH + 5, mw, 2, c32(0x232733ff), 1);
          const sv = (score.get(I) || 0) / smax;
          if (sv > 0) G.rect(x0 + 17, y + lineH + 5, mw * sv, 2, cfHeat(0.45 + 0.55 * sv, a), 1);
          if (b.h) G.tip('Click: edit ' + I.name + '\'s EQ\nThe bar: how much it clashes with the others');
          if (lb.h) G.tip(I.protect ? I.name + ' is protected: never suggested for a cut. Click to unprotect.' : 'Protect ' + I.name + ': never suggest cutting it\n(for a lead vocal or a kick)');
          if (b.c) S.editGuid = I.guid;
          if (lb.c) { I.protect = !I.protect; rank(); }
          y += rowH;
        }
      }

      // ---- "Editing" line
      {
        const ex = cx0 + 10, ey = top;
        Txt(ex, ey, 'Editing', 0x6b7385ff);
        const nx = ex + TW('Editing') + 8, name = focus.name + '  v';
        const b = Btn('pick', nx - 2, ey - 2, TW(name) + 18, lineH + 4, 'pointer');
        if (b.h) { G.rect(nx - 2, ey - 2, TW(name) + 18, lineH + 4, c32(0x1e222bff), 4); G.tip('Pick the track whose EQ is shown and edited\n(or click its curve in the graph)'); }
        G.circ(nx + 4, ey + lineH / 2, 4, c32(focus.col));
        Txt(nx + 12, ey, name, 0xe6ebf5ff);
        if (b.c) G.menu(nx - 2, ey - 2, TW(name) + 18, lineH + 4, inst.map(I => ({ label: I.name, on: I === focus, pick: () => { S.editGuid = I.guid; } })));
        let x = nx + TW(name) + 22;
        if (focus.protect) { cfLock(G, x, ey, lineH, c32(0xb49cffff), true); x += lineH + 6; }
        let right = px1;
        {
          const auto = focus.autotime;
          const wu = TW('Auto') + 12, wa = TW('Atk 50.0 ms') + 12, wr = TW('Rel 1000 ms') + 12;
          const backW = focus !== own ? TW('Back to ' + own.name) + 16 : 0;
          S.timingHidden = right - (wu + wa + wr + 16) < x + backW + 20;
          if (!S.timingHidden) {
            const TimeDrag = (bid, bx, bw, nm, lo, hi, def) => {
              const v = focus[nm];
              const label = auto ? (nm === 'attack' ? 'Atk' : 'Rel') + ' auto' : (nm === 'attack' ? 'Atk ' + v.toFixed(1) + ' ms' : 'Rel ' + v.toFixed(0) + ' ms');
              const bb = Btn(bid, bx, ey - 2, bw, chipH, 'ew-resize');
              const act = bb.a && !S.popOver;
              G.rect(bx, ey - 2, bw, chipH, c32(bb.h || act ? 0x2c3140ff : 0x1c2029ff), 4);
              G.rectS(bx, ey - 2, bw, chipH, c32(act ? 0x5fd3ffcc : 0x2a2f3aff), 4);
              Txt(bx + (bw - TW(label)) / 2, ey, label, auto ? 0x6b7385ff : 0xc9d1e6ff);
              const SetV = nv => { if (focus.autotime) focus.autotime = false; focus[nm] = clamp(nv, lo, hi); };
              if (act && (G.dx || G.dy)) SetV(v * Math.pow(2, (G.dx - G.dy) * (shift ? 0.2 : 1) / 80));
              if (bb.h) {
                const wv = G.useWheel(bx, ey - 2, bw, chipH);
                if (wv) SetV(v * (wv > 0 ? 1.1 : 1 / 1.1));
                if (G.dbl) SetV(def);
                if (!act) G.tip((nm === 'attack' ? 'Attack' : 'Release') + ' of the dynamic bands on ' + focus.name
                  + (auto ? '\nAuto picks it per band from its key track. Drag to set it by hand (turns Auto off).' : '\nDrag or wheel (Shift = fine), double-click = ' + def + ' ms'));
              }
            };
            right -= wr; TimeDrag('trel', right, wr, 'release', 10, 1000, 150);
            right -= 4 + wa; TimeDrag('tatk', right, wa, 'attack', 0.5, 50, 5);
            right -= 4 + wu;
            if (Chip('tauto', right, ey - 2, 'Auto', auto, 0x5fd3ffff, 'Auto timing: each dynamic band takes its attack / release from the track that drives it.\nA percussive one (drums) ducks fast and follows each hit; a sustained one\n(pads, bass, vocals) moves slowly so the cut doesn\'t pump. Click to set them by hand.')[0]) focus.autotime = !auto;
            right -= 8;
          }
        }
        if (focus !== own) { if (Chip('back', x, ey - 2, 'Back to ' + own.name, false)[0]) S.editGuid = null; }
        else if (right - x > 200) {
          let nb = 0; for (const c of focus.cuts) if (cfUsed(c)) nb++;
          Txt(x, ey, Fit(nb + ' of ' + NBAND + ' bands · hover a node for its controls', right - x), 0x5a6275ff);
        }
      }

      // ---- plot: spectra with the EQ on top
      const Xf = f => px0 + (px1 - px0) * Math.log(f / 20) / Math.log(1000);
      const Fx_ = x => 20 * Math.pow(1000, (x - px0) / (px1 - px0));
      const Ys = p => gy1 - (clamp(cfDB(p), -72, 0) + 72) / 72 * (gy1 - py0 - lineH - 4);
      let RR = 12;
      for (const c of focus.cuts) if (cfUsed(c) && cfIsGain(c.type) && Math.abs(c.gain) > 12) RR = 24;
      const gtop = py0 + lineH + 6, gmid = (gtop + gy1) / 2, ghalf = (gy1 - gtop) / 2;
      const Yg = g => gmid - clamp(g, -RR * 1.1, RR * 1.1) / RR * ghalf;
      const GY = y => clamp(-(y - gmid) / ghalf * RR, -24, 24);
      G.rect(px0, py0, px1 - px0, py1 - py0, c32(0x0d0f13ff), 4);
      G.clip(px0, py0, px1 - px0, py1 - py0);
      {
        let lo = 20;
        CF_RANGES.forEach((Rg, i) => {
          const hi = Math.min(Rg[0], 20000), xa = Xf(lo), xb = Xf(hi);
          if (i % 2 === 1) G.rect(xa, py0, xb - xa, gy1 - py0, c32(0xffffff06));
          if (xb - xa > TW(Rg[1]) + 6) Txt((xa + xb - TW(Rg[1])) / 2, py0 + 3, Rg[1], 0x6b7385ff);
          lo = hi;
        });
      }
      for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
        const x = Math.round(Xf(f)) + 0.5;
        G.ln(x, py0 + lineH + 4, x, gy1, c32(0xffffff10));
        Txt(x + 2, gy1 - lineH - 1, f >= 1000 ? f / 1000 + 'k' : String(f), 0xffffff48);
      }
      const heat = new Float64Array(NB);
      let hmax = 1e-12;
      for (const I of inst) if (!mineOnly || I === own) for (let b = 0; b < NB; b++) heat[b] += I.clash[b];
      for (let b = 0; b < NB; b++) hmax = Math.max(hmax, heat[b]);
      const HV = b => clamp(1 + cfDB(heat[b] / hmax) / 18);
      if (!AP) for (let b = 0; b < NB; b++) { const v = HV(b); if (v > 0.05) G.rect(Xf(cfBandLo(b)), py0 + lineH + 4, Xf(cfBandLo(b + 1)) - Xf(cfBandLo(b)) + 1, gy1 - py0 - lineH - 4, cfHeat(v, 0.16 * v * v)); }
      if (AP) {
        const za = Xf(AP.lo), zb = Xf(AP.hi);
        G.rect(za, py0 + lineH + 4, zb - za, gy1 - py0 - lineH - 4, c32(0xff6b5b14));
        G.rectS(za, py0 + lineH + 4, zb - za, gy1 - py0 - lineH - 4, c32(0xff6b5b80));
        for (let b = 0; b < NB - 1; b++) {
          const x1_ = Xf(cfBandF(b)), x2_ = Xf(cfBandF(b + 1));
          const y1_ = Math.max(Ys(AP.a.long[b]), Ys(AP.b.long[b])), y2_ = Math.max(Ys(AP.a.long[b + 1]), Ys(AP.b.long[b + 1]));
          const inZone = cfBandF(b) >= AP.lo * 0.9 && cfBandF(b + 1) <= AP.hi * 1.1;
          G.poly([[x1_, y1_], [x2_, y2_], [x2_, gy1], [x1_, gy1]], c32(inZone ? 0xff6b5b8c : 0xffb5472a));
        }
      }
      const plotHov = G.over && mx >= px0 && mx < px1 && my >= py0 && my < gy1 && !S.popOver && !G.menuOpen;
      const CurveY = (I, x) => {
        const pos = Math.log2(Fx_(x) / 20) * 6 - 0.5, b0 = clamp(Math.floor(pos), 0, NB - 2), t = clamp(pos - b0);
        return Ys(I.long[b0]) * (1 - t) + Ys(I.long[b0 + 1]) * t;
      };
      let curveHov = null;
      if (plotHov && S.drag == null && !G.down) {
        let best = 7;
        for (const I of inst) { const d = Math.abs(CurveY(I, mx) - my); if (d < best) { best = d; curveHov = I; } }
      }
      const pts = arr => { const o = []; for (let b = 0; b < NB; b++) o.push([Xf(cfBandF(b)), Ys(arr[b])]); return o; };
      const Lit = I => AP ? (AP.a === I || AP.b === I) : I === focus;
      for (const I of inst) if (!Lit(I) && I !== curveHov) G.pline(pts(I.long), A(I.col, AP ? 0.16 : 0.32), 1);
      for (const I of inst) if (Lit(I) || I === curveHov) G.area(pts(I.fast), gy1, A(I.col, 0.32));
      for (const I of inst) if (Lit(I) && I !== curveHov) G.pline(pts(I.long), A(I.col, 0.95), 1.6);

      // the edited track's EQ: target + live curves, nodes
      const pb = (S.popOver || G.menuOpen) ? { h: false, a: G.active === 'plot', start: false } : G.btn('plot', px0, py0, px1 - px0, gy1 - py0);
      const pHov = pb.h && !S.popOver, pAct = pb.a;
      let hn = -1;
      const cuts = focus.cuts;
      const NodeY = c => cfIsGain(c.type) ? Yg(c.gain) : gmid;
      G.ln(px0, gmid, px1, gmid, c32(0xffffff26));
      for (const g of [RR / 2, -RR / 2]) {
        const lb = (g > 0 ? '+' : '') + g;
        G.ln(px0, Yg(g), px1, Yg(g), c32(0xffffff0a));
        Txt(px1 - TW(lb) - 4, Yg(g) - lineH - 1, lb, 0xffffff40);
      }
      if (!S.fs || S.fs.length !== Math.floor((px1 - px0) / 2) + 1) {
        S.fs = []; S.xs = [];
        for (let x = px0; x <= px1; x += 2) { S.xs.push(x); S.fs.push(Fx_(x)); }
      }
      const Cv = curves(focus, S.fs);
      if (Cv.any) {
        const tp = [], lp = [];
        for (let i = 0; i < S.xs.length; i++) { tp.push([S.xs[i], Yg(Cv.tgt[i])]); lp.push([S.xs[i], Yg(Cv.live[i])]); }
        G.ctx.beginPath(); G.ctx.moveTo(lp[0][0], gmid); for (const p of lp) G.ctx.lineTo(p[0], p[1]); G.ctx.lineTo(lp[lp.length - 1][0], gmid); G.ctx.closePath();
        G.ctx.fillStyle = A(focus.col, 0.14); G.ctx.fill();
        G.pline(tp, c32(0xffffff50), 1);
        G.pline(lp, c32(0xf4f6fcff), 1.8);
      }
      for (let k = 0; k < NBAND; k++) { const c = cuts[k]; if (!S.popOver && G.over && cfUsed(c) && (mx - Xf(c.freq)) ** 2 + (my - NodeY(c)) ** 2 < 100) hn = k; }
      if (S.drag != null && pAct) hn = S.drag;
      if (hn >= 0) curveHov = null;
      if (curveHov) G.pline(pts(curveHov.long), A(curveHov.col, 1), 2.6);
      if (AP) {
        const lab = cfHz(AP.f) + '  ' + AP.a.name + ' + ' + AP.b.name, lw = TW(lab);
        const lx = clamp((Xf(AP.lo) + Xf(AP.hi) - lw) / 2, px0 + 4, px1 - lw - 6), ly = py0 + lineH + 8;
        G.rect(lx - 4, ly - 1, lw + 8, lineH + 2, c32(0x0d0f13dd), 3);
        Txt(lx, ly, lab, 0xff8f80ff);
      }
      if (pHov && G.clicked) {
        if (hn >= 0 && alt) toggleByp(focus, hn);
        else if (hn >= 0 && G.dbl) { removeBand(focus, hn); S.drag = null; }
        else if (hn >= 0) { S.drag = hn; S.dragMoved = 0; }
        else if (G.dbl) {
          const f = Fx_(mx), t = f < 40 ? 9 : f > 14000 ? 17 : 0;
          const r = addBand(focus, t, f, Math.round(GY(my) * 10) / 10, null, S.dynamic);
          if (r[0] >= 0) { S.drag = r[0]; S.dragMoved = 0; api.check('band'); } else toast(r[1]);
        } else if (curveHov && curveHov !== focus) S.editGuid = curveHov.guid;
        else S.popPin = null;
      }
      if (S.drag != null && pAct && (G.dx || G.dy)) {
        const c = cuts[S.drag], sc = shift ? 0.2 : 1;
        c.freq = clamp(c.freq * Math.pow(1000, G.dx * sc / (px1 - px0)), 20, 20000);
        if (cfIsGain(c.type)) c.gain = clamp(c.gain - G.dy * sc / ghalf * RR, -24, 24);
        S.dragMoved += Math.abs(G.dx) + Math.abs(G.dy);
        if (S.dragMoved > 3) api.check('band');
      }
      if (S.drag != null && !pAct) {
        const c = cuts[S.drag];
        if (c && cfIsGain(c.type)) c.gain = Math.round(c.gain * 10) / 10;
        // a tap on a node (no drag) pins its popup: the touch fallback for hover
        if (S.dragMoved <= 3 && cfUsed(c)) S.popPin = { guid: focus.guid, k: S.drag };
        S.drag = null;
      }
      if (pHov && G.rclick) {
        if (hn >= 0) bandMenu(focus, hn, mx - 2, my, 4, 4);
        else {
          const addF = Fx_(mx), addG = Math.round(GY(my) * 10) / 10;
          const items = [{ head: 'Add a band at ' + cfHz(addF) }];
          for (let sh = 0; sh < 8; sh++) {
            if (sh === 4 || sh === 6) items.push({ sep: true });
            items.push({ label: CF_SHAPES[sh], pick: () => {
              const t = cfMakeType(sh, 1);
              const r = addBand(focus, t, addF, t === 0 ? addG : (cfIsGain(t) ? (addG !== 0 ? addG : -3) : 0), null, S.dynamic && cfIsGain(t));
              if (r[0] < 0) toast(r[1]); else api.check('band');
            } });
          }
          G.menu(mx - 2, my, 4, 4, items);
        }
      }
      if (pHov && hn >= 0) {
        const wv = G.useWheel(px0, py0, px1 - px0, gy1 - py0);
        if (wv) { cuts[hn].q = clamp(cuts[hn].q * (wv > 0 ? 1.12 : 1 / 1.12), 0.1, 18); api.check('band'); }
        G.cursor = 'pointer';
      } else if (pHov && curveHov && curveHov !== focus) { G.tip('Click: edit ' + curveHov.name + '\'s EQ'); G.cursor = 'pointer'; }
      else if (pHov && S.drag == null && !S.pop) G.tip(cfHz(Fx_(mx)) + '  ' + (GY(my) >= 0 ? '+' : '') + GY(my).toFixed(1) + ' dB\nDouble-click: add a band on ' + focus.name + '  ·  right-click: pick its type');
      else if (G.over && mx >= px0 && mx < px1 && my >= py0 && my < gy1) G.useWheel(px0, py0, px1 - px0, gy1 - py0);
      for (let k = 0; k < NBAND; k++) {
        const c = cuts[k];
        if (!cfUsed(c)) continue;
        const x = Xf(c.freq), y = NodeY(c), col = CF_BANDCOL[k % 8];
        const rad = (k === hn || (S.pop && S.pop.guid === focus.guid && S.pop.k === k)) ? 7 : 5.5;
        if (cfByp(c)) G.ring(x, y, rad, A(col, 0.6), 1.5);
        else {
          if (c.mode === 2 && cfIsGain(c.type)) {
            G.ln(x, gmid, x, y, A(0x5fd3ffff, 0.45));
            G.circ(x, Yg(focus.gain[k]), 3, c32(0x5fd3ffff));
            G.ring(x, y, rad + 2.5, c32(0x5fd3ffcc), 1.2);
          }
          G.circ(x, y, rad, c32(col));
        }
        const nm = String(k + 1);
        G.text(x, y - 6, nm, 11, cfByp(c) ? A(col, 0.8) : c32(0x0d1016ff), 'c', 600);
        if (focus.audition === k + 1) G.ring(x, y, 11, c32(0xffffffdd), 1.5);
      }
      if (S.toast && now - S.toast.t < 2.5) {
        const tw = TW(S.toast.text) + 12, tx = px0 + 6, ty = gy1 - lineH - 24;
        G.rect(tx, ty, tw, lineH + 6, c32(0x000000c8), 4);
        Txt(tx + 6, ty + 3, S.toast.text, 0xffd54fff);
      }
      G.unclip();
      for (let b = 0; b < NB; b++) { const v = HV(b); G.rect(Xf(cfBandLo(b)), gy1 + 4, Xf(cfBandLo(b + 1)) - Xf(cfBandLo(b)) - 1, stripH, cfHeat(v, 0.12 + 0.88 * v), 1); }
      if (AP) G.rectS(Xf(AP.lo) - 1, gy1 + 2, Xf(AP.hi) - Xf(AP.lo) + 2, stripH + 4, c32(0xe6e9f0ff), 2, 1.2);

      // ---- clash cards
      const cardW = lx1 - lx0, cardH = lineH + chipH + 20, gap = 5;
      const nRows = Math.max(1, Math.floor((ly1 - ly0 + gap) / (cardH + gap)));
      S.scroll = clamp(S.scroll, 0, Math.max(0, shown.length - nRows));
      if (S.overList && shown.length > nRows && !S.amtDrag) {
        const wv = G.useWheel(lx0, ly0, lx1 - lx0, ly1 - ly0);
        if (wv && !S.wheelOnAmt) S.scroll = clamp(S.scroll - (wv > 0 ? 1 : -1), 0, shown.length - nRows);
      }
      S.wheelOnAmt = false;
      if (!shown.length) Txt(lx0 + 6, ly0 + 6, Fit(mineOnly && S.hot.length ? 'No clashes with this track. "All tracks" shows them all.' : 'Play the song. Clashes show up here, worst first.', cardW - 8), 0x7d869cff);
      let cardClick = null;
      for (let n = 0; n < Math.min(nRows, shown.length - S.scroll); n++) {
        const Hh = shown[n + S.scroll], key = hkey(Hh), sev = cfSev(Hh);
        const x0 = lx0, y0 = ly0 + n * (cardH + gap), x1 = lx1, y1 = y0 + cardH;
        const cardHov = G.over && !S.popOver && !G.menuOpen && mx >= x0 && mx < x1 && my >= y0 && my < y1;
        if (cardHov) S.hovH = Hh;
        const isSel = S.selKey === key;
        G.rect(x0, y0, x1 - x0, cardH, c32(cardHov || isSel ? 0x1b1f28ff : 0x171a21ff), 6);
        if (isSel || cardHov) G.rectS(x0, y0, x1 - x0, cardH, c32(isSel ? 0x46506aff : 0x323848ff), 6);
        const sv = clamp(1 + Hh.db / 24);
        G.rect(x0 + 1, y1 - 2, (x1 - x0 - 2) * clamp(sv, 0.06, 1), 2, cfHeat(0.4 + 0.6 * sv, 0.9), 2);
        let T, O, k, c, d, dyn;
        const State = () => {
          [T, O] = target(Hh); k = cutNear(T, Hh.f); c = k >= 0 ? T.cuts[k] : null;
          [d, dyn] = plan(Hh);
          if (c) { d = c.gain; dyn = c.mode === 2 || c.mode === 4; }
        };
        State();
        const fx_ = x0 + 9, fTxt = cfHz(Hh.f);
        Txt(fx_, y0 + 6, fTxt, CF_SEVCOL[sev]);
        const sevW = TW(CF_SEVNAME[sev]) + 12, sx_ = fx_ + TW(fTxt) + 8;
        G.rect(sx_, y0 + 5, sevW, lineH + 2, c32(CF_SEVBG[sev]), (lineH + 2) / 2);
        Txt(sx_ + 6, y0 + 6, CF_SEVNAME[sev], CF_SEVCOL[sev]);
        {
          const hint = c ? (cfByp(c) ? 'bypassed' : (dyn ? 'ducks while ' + O.name + ' plays' : 'static cut')) : 'not cut yet';
          const hx = sx_ + sevW + 8;
          Txt(hx, y0 + 6, Fit(hint, x1 - 8 - hx), c ? (dyn ? 0x5fd3ffb0 : 0x8a93a6ff) : 0x5a6275ff);
        }
        const cy = y0 + lineH + 12, ch = chipH + 2, sw = lineH + 6;
        const tw = Math.floor((x1 - 8 - (fx_ - 3) - sw - 6) / 2);
        const TrackChip = (I, x, sub) => {
          const isT = I === T;
          let hasCut = isT && c != null, liveC = hasCut && !cfByp(c);
          const modeW = isT ? lineH + 8 : 0, mainW = tw - modeW, pw = hasCut ? lineH + 6 : 0;
          const bb = Btn('t' + n + sub, x + pw, cy, mainW - pw, ch, isT && hasCut ? 'ns-resize' : 'pointer');
          if (bb.start) S.chipMove = 0;
          const act = bb.a, hov = bb.h;
          const bg = liveC ? A(I.col, hov || act ? 0.62 : 0.48) : isT ? (hov ? A(I.col, 0.22) : c32(0x14171dff)) : c32(hov ? 0x232733ff : 0x121419ff);
          G.rect(x, cy, tw, ch, bg, 5);
          G.rectS(x, cy, tw, ch, isT ? A(I.col, hasCut ? 1 : 0.75) : (hov ? A(I.col, 0.5) : c32(0x2a2f3aff)), 5, isT ? 1.4 : 1);
          if (hasCut) {
            const pp = Btn('p' + n + sub, x, cy, pw, ch, 'pointer');
            const cxp = x + pw / 2 + 1, cyp = cy + ch / 2, rr_ = ch * 0.26;
            if (pp.h) G.rect(x + 1, cy + 1, pw - 1, ch - 2, c32(0xffffff20), 4);
            const pcol = c32(liveC ? 0xffffffff : (pp.h ? 0xc9d1e6ff : 0x6b7385ff));
            G.arc(cxp, cyp, rr_, -PI / 2 + 0.75, 3 * PI / 2 - 0.75, 1.5, pcol);
            G.ln(cxp, cyp - rr_ - 1.5, cxp, cyp - 0.5, pcol, 1.5);
            if (pp.h) G.tip(liveC ? 'Turn the cut on ' + I.name + ' off' : 'Turn the cut on ' + I.name + ' back on');
            if (pp.c) { toggleByp(T, k); State(); hasCut = c != null; liveC = hasCut && !cfByp(c); }
          } else G.circ(x + 8, cy + ch / 2, 3.5, c32(I.col));
          let right = 0;
          if (hasCut) { const dt_ = d.toFixed(1) + ' dB'; right = TW(dt_) + 8; Txt(x + mainW - right + 2, cy + 3, dt_, liveC ? 0xffe9a0ff : 0x8a93a6ff); }
          else if (isT && hov) { right = TW('+ cut') + 8; Txt(x + mainW - right + 2, cy + 3, '+ cut', I.col); }
          if (I.protect) { cfLock(G, x + mainW - right - lineH - 3, cy + 2, lineH, c32(0xb49cffff), true); right += lineH + 2; }
          Txt(x + Math.max(16, pw + 2), cy + 3, Fit(I.name, mainW - Math.max(20, pw + 6) - right), liveC || (isT && hov) ? 0xffffffff : (isT ? 0xe6e9f0ff : 0x8a93a6ff));
          if (isT) {
            if (act) {
              S.chipMove = (S.chipMove || 0) + Math.abs(G.dx) + Math.abs(G.dy);
              if (hasCut && S.chipMove > 3) {
                S.amtDrag = key;
                if (G.dx || G.dy) { d = clamp(d + (G.dx - G.dy) * (shift ? 0.02 : 0.1), -24, 0); c.gain = d; }
              }
            }
            if (bb.c && !hasCut && (S.chipMove || 0) <= 3) { cutClash(Hh); State(); }
            if (hasCut && hov && G.rclick) {
              const TT = T, kk = k;
              G.menu(mx - 2, my, 4, 4, [{ head: 'Cut on ' + TT.name + ' at ' + cfHz(Hh.f) }, { label: cfByp(TT.cuts[kk]) ? 'Turn on' : 'Turn off', pick: () => toggleByp(TT, kk) }, { label: 'Remove the cut', pick: () => removeBand(TT, kk) }]);
            }
            if (!act && S.amtDrag === key) { S.amtDrag = null; if (c) c.gain = Math.round(c.gain * 10) / 10; }
            if (hov && hasCut) {
              const wv = G.useWheel(x + pw, cy, mainW - pw, ch);
              S.wheelOnAmt = true;
              if (wv) { d = clamp(d + (wv > 0 ? 0.5 : -0.5), -24, 0); c.gain = d; }
            }
            if (hov && !act) G.tip(hasCut ? I.name + ': ' + d.toFixed(1) + ' dB cut at ' + cfHz(Hh.f) + (liveC ? '' : ' (off)') + '\nDrag up/down or wheel = depth (Shift = fine)\nPower button = on / off, right-click = remove'
              : 'Click: cut ' + cfHz(Hh.f) + ' on ' + I.name + ' (' + S.depth + ' dB, ' + (dyn ? 'dynamic' : 'static') + ')' + (Hh.suggest === I ? '\nSuggested: this zone matters less to ' + I.name : ''));
            const mx0 = x + mainW;
            const mb = Btn('m' + n + sub, mx0, cy, modeW, ch, 'pointer');
            G.ln(mx0 + 0.5, cy + 4, mx0 + 0.5, cy + ch - 4, c32(liveC ? 0xffffff40 : 0x2a2f3aff));
            if (mb.h) G.rect(mx0 + 1, cy + 1, x + tw - mx0 - 2, ch - 2, c32(0xffffff18), 4);
            const wc = c32(dyn ? (liveC ? 0xffffffff : 0x5fd3ffff) : (mb.h ? 0xe6e9f0ff : 0x8a93a6ff));
            const wx0 = mx0 + 4, wx1 = x + tw - 4, wy = cy + ch / 2;
            if (dyn) { const pp = []; for (let i = 0; i <= 12; i++) pp.push([wx0 + (wx1 - wx0) * i / 12, wy - Math.sin(i / 12 * TAU) * ch * 0.22]); G.pline(pp, wc, 1.5); }
            else G.ln(wx0, wy, wx1, wy, wc, 1.5);
            if (mb.h) G.tip((dyn ? 'Dynamic: the cut only digs in while ' + O.name + ' plays there' : 'Static: the cut is always on') + '\nClick for ' + (dyn ? 'static' : 'dynamic'));
            if (mb.c) {
              if (c) { const byp = cfByp(c); if (dyn) { c.mode = byp ? 3 : 1; c.key = 0; } else { c.mode = byp ? 4 : 2; c.key = O.slot + 1; } }
              memo(Hh, true).dyn = !dyn;
              api.check('mode');
              State();
            }
          } else {
            if (hov) G.tip('Click: cut ' + I.name + ' instead of ' + T.name + (c ? ' (moves the cut)' : ''));
            if (bb.c) { const [ok, why] = swapClash(Hh); if (!ok) toast(why || 'Could not move the cut'); State(); }
          }
        };
        const ax = fx_ - 3;
        TrackChip(Hh.a, ax, 'a');
        const sx = ax + tw + 3;
        const sb = Btn('sw' + n, sx, cy, sw, ch, 'pointer');
        if (sb.h) G.rect(sx, cy, sw, ch, c32(0x262b35ff), 4);
        cfSwapIcon(G, sx + 3, cy + 2, sw - 6, c32(sb.h ? 0xffffffff : 0x8a93a6ff));
        if (sb.h) G.tip('Switch which track gets the cut' + (c ? '\n(moves the cut to ' + O.name + ')' : ''));
        if (sb.c) { const [ok, why] = swapClash(Hh); if (!ok) toast(why || 'Could not move the cut'); State(); }
        TrackChip(Hh.b, sx + sw + 3, 'b');
        if (cardHov && !G.anyHov) {
          if (G.clicked) cardClick = { key, T };
          G.tip(Hh.a.name + ' and ' + Hh.b.name + ' fight around ' + cfHz(Hh.f) + ' (' + cfHz(Hh.lo) + ' to ' + cfHz(Hh.hi) + '). ' + CF_SEVNAME[sev] + '.\nClick to show it in the graph.');
        }
      }
      if (cardClick) { S.selKey = S.selKey === cardClick.key ? null : cardClick.key; if (S.selKey) api.check('show'); }
      if (shown.length > nRows) {
        const t = (S.scroll + 1) + '-' + Math.min(shown.length, S.scroll + nRows) + ' of ' + shown.length;
        Txt(lx1 - TW(t) - 4, ly1 - lineH + 2, t, 0x5a6275ff);
      }
      if (S.amtDrag && !G.down) S.amtDrag = null;

      // ---- the band popup (Pro-Q style)
      popup(hn >= 0 && S.drag == null ? hn : -1, S.drag != null, k => { const c = focus.cuts[k]; return [Xf(c.freq), NodeY(c)]; }, focus);
    });

    // ---- the band menu and the popup
    function bandMenu(I, k, x, y, w, hh) {
      const c = I.cuts[k];
      const items = [{ head: I.name + '  ·  band ' + (k + 1) + '  ·  ' + cfTypeName(c.type) }];
      items.push({ label: cfByp(c) ? 'Enable' : 'Disable', pick: () => toggleByp(I, k) });
      if (cfIsGain(c.type)) {
        items.push({ label: 'Invert Gain', pick: () => { c.gain = -c.gain; api.check('band'); } });
        const dyn = c.mode === 2 || c.mode === 4;
        items.push(dyn ? { label: 'Make Static', pick: () => setDynamic(I, k, false) } : { label: 'Make Dynamic', pick: () => setDynamic(I, k, true, c.key || 0) });
      }
      items.push({ sep: true }, { head: 'Shape' });
      for (let s = 0; s < 8; s++) items.push({ label: CF_SHAPES[s], on: cfShapeOf(c.type) === s, pick: () => { setShape(I, k, s); api.check('band'); } });
      items.push({ sep: true }, { label: 'Solo (hear only this band)', on: I.audition === k + 1, pick: () => { I.audition = I.audition === k + 1 ? 0 : k + 1; } });
      items.push({ label: 'Delete', pick: () => removeBand(I, k) });
      return G.menu(x, y, w, hh, items, { onClose: () => { S.popMenu = null; } });
    }
    function popMenu(name, I, k, R) {
      const c = I.cuts[k];
      S.popMenu = { name, guid: I.guid, k };
      const items = [];
      if (name === 'shape' || name === 'slope') {
        if (name === 'shape') for (let s = 0; s < 8; s++) { if (s === 4 || s === 6) items.push({ sep: true }); items.push({ label: CF_SHAPES[s], on: cfShapeOf(c.type) === s, pick: () => { setShape(I, k, s); api.check('band'); } }); }
        if (cfIsCut(c.type)) { if (name === 'shape') items.push({ sep: true }); for (let si = 0; si < 8; si++) items.push({ label: CF_SLOPES[si] + ' dB/oct', on: cfSlopeOf(c.type) === si, pick: () => { setSlope(I, k, si); api.check('band'); } }); }
      } else if (name === 'place') {
        for (let p = 0; p < 5; p++) items.push({ label: CF_PLACES[p], on: c.place === p, pick: () => { c.place = p; } });
      } else if (name === 'key') {
        const dyn = c.mode === 2 || c.mode === 4;
        items.push({ head: 'Dynamic: apply only while...' }, { label: 'Any other track plays', on: dyn && c.key === 0, pick: () => setDynamic(I, k, true, 0) });
        for (const J of inst) if (J !== I) items.push({ label: J.name + ' plays', on: dyn && c.key === J.slot + 1, pick: () => setDynamic(I, k, true, J.slot + 1) });
        items.push({ sep: true }, { label: 'Make Static', pick: () => setDynamic(I, k, false) });
      } else return bandMenu(I, k, R[0], R[1], R[2], R[3]);
      G.menu(R[0], R[1], R[2], R[3], items, { onClose: () => { S.popMenu = null; } });
    }
    function popup(hovK, busy, nodeXY, focus) {
      const now = S.now;
      let P = S.pop;
      if (S.popHold && !G.down) { const Ih = byGuid[S.popHold.guid]; if (Ih.audition === S.popHold.k + 1) Ih.audition = 0; S.popHold = null; }
      if (S.popDrag && !G.down) { const D = S.popDrag, c = byGuid[D.guid].cuts[D.k]; if (D.key === 'gain') c.gain = Math.round(c.gain * 10) / 10; S.popDrag = null; }
      const R0 = S.popRect, mx = G.mx, my = G.my;
      const over = !!R0 && G.over && mx >= R0[0] - 2 && mx <= R0[2] + 2 && my >= R0[1] - 2 && my <= R0[3] + 2;
      // a press outside the popup and its node drops a pinned popup
      if (S.popPin && G.clicked && !over && hovK < 0) S.popPin = null;
      if (hovK >= 0 && !busy && !S.popDrag) {
        if (!P || P.guid !== focus.guid || P.k !== hovK) { P = { guid: focus.guid, k: hovK }; S.pop = P; }
        P.t = now;
      } else if (P && (over || S.popDrag || S.popHold || (G.menuOpen && S.popMenu) || (S.popPin && S.popPin.guid === P.guid && S.popPin.k === P.k))) P.t = now;
      else if (!P && S.popPin && S.popPin.guid === focus.guid && !busy) { P = S.pop = { guid: S.popPin.guid, k: S.popPin.k, t: now }; }
      const I = P && byGuid[P.guid];
      if (P && (busy || now - P.t > 0.35 || !I || I !== focus || !cfUsed(I.cuts[P.k]))) { S.pop = P = null; }
      if (!P) { S.popRect = null; return; }
      const k = P.k, c = I.cuts[k];
      const [nx, ny] = nodeXY(k);
      const rh = lineH + 6, hh = 6 + rh * 4 + 4, w = POP_W;
      const area = [0, 0, W, H];
      const x = clamp(nx - w / 2, area[0] + 2, area[2] - w - 2);
      let side = P.side;
      if (!side) { side = (ny + 12 + hh > area[3] - 2 && ny - 12 - hh >= area[1] + 2) ? 'above' : 'below'; P.side = side; }
      let y = side === 'above' ? ny - 12 - hh : ny + 12;
      y = clamp(y, area[1] + 2, Math.max(area[1] + 2, area[3] - hh - 2));
      S.popRect = [x, Math.min(y, ny), x + w, Math.max(y + hh, ny)];
      const interactive = !G.menuOpen;
      const clicked = interactive && G.clicked, dbl = interactive && G.dbl;
      const fine = G.shift ? 0.2 : 1;
      const In = (x1, y1, x2, y2) => G.over && mx >= x1 && mx < x2 && my >= y1 && my < y2;
      let tip = null;
      const Hot = (x1, y1, x2, y2, t) => { const hv = interactive && In(x1, y1, x2, y2); if (hv && t) tip = t; if (hv) G.rect(x1, y1, x2 - x1, y2 - y1, c32(0xffffff12), 4); return hv; };
      const Center = (s, x1, x2, ty, col) => Txt((x1 + x2 - TW(s)) / 2, ty, s, col);
      const col = CF_BANDCOL[k % 8];
      const menuR = [x, y, w, hh];
      const bg = c32(0x171a21f8);
      G.rect(x, y, w, hh, bg, 6);
      G.rectS(x, y, w, hh, c32(0x323848ff), 6);
      G.rect(x + 6, y, w - 12, 2, A(col, cfByp(c) ? 0.35 : 0.9), 1);
      const px_ = clamp(nx, x + 10, x + w - 10);
      if (side === 'below') G.tri(px_ - 6, y + 0.5, px_ + 6, y + 0.5, px_, y - 6, bg); else G.tri(px_ - 6, y + hh - 0.5, px_, y + hh + 6, px_ + 6, y + hh - 0.5, bg);
      const y1 = y + 5, y2 = y + 5 + rh, y3 = y + 5 + rh * 2, y4 = y + 5 + rh * 3, ty = (rh - lineH) / 2;
      let changed = false;
      // row 1: on / off, frequency, solo, delete
      const hp = Hot(x + 4, y1, x + 24, y1 + rh, cfByp(c) ? 'Enable band' : 'Bypass band');
      {
        const cx = x + 14, cy = y1 + rh / 2, pc = cfByp(c) ? c32(hp ? 0xc9d1e6ff : 0x6b7385ff) : c32(col);
        G.arc(cx, cy + 1, 5, PI * 1.68, PI * 3.32, 1.6, pc);
        G.ln(cx, cy - 6, cx, cy - 0.5, pc, 1.6);
      }
      if (hp && clicked) toggleByp(I, k);
      const f1 = x + 26, f2 = x + w - 50;
      const hf = Hot(f1, y1, f2, y1 + rh, 'Frequency: drag left / right or wheel (Shift = fine)');
      Center(c.freq >= 1000 ? (c.freq / 1000).toFixed(2) + ' kHz' : c.freq.toFixed(1) + ' Hz', f1, f2, y1 + ty, hf ? 0xffffffff : 0xe6ebf5ff);
      const solo = I.audition === k + 1;
      const hs = Hot(x + w - 48, y1, x + w - 26, y1 + rh, 'Hold to hear only this band');
      {
        const cx = x + w - 37, cy = y1 + rh / 2 + 1, sc = c32(solo ? 0xffd54fff : (hs ? 0xffffffff : 0xa3abbdff));
        G.arc(cx, cy, 5, PI, TAU, 1.4, sc);
        G.rect(cx - 6.5, cy - 0.5, 3, 5.5, sc, 1);
        G.rect(cx + 3.5, cy - 0.5, 3, 5.5, sc, 1);
      }
      if (hs && clicked) { I.audition = k + 1; S.popHold = { guid: I.guid, k }; }
      const hd = Hot(x + w - 24, y1, x + w - 4, y1 + rh, 'Delete band');
      {
        const cx = x + w - 14, cy = y1 + rh / 2, dc = c32(hd ? 0xff8f80ff : 0x8a93a6ff);
        G.ln(cx - 4, cy - 4, cx + 4, cy + 4, dc, 1.5); G.ln(cx - 4, cy + 4, cx + 4, cy - 4, dc, 1.5);
      }
      if (hd && clicked) { removeBand(I, k); S.pop = null; S.popRect = null; S.popPin = null; return; }
      // row 2: dynamic, gain or slope, placement
      const gainT = cfIsGain(c.type);
      if (gainT) {
        const isD = c.mode === 2 || c.mode === 4;
        const hdy = Hot(x + 4, y2 + 1, x + 30, y2 + rh - 1, isD ? 'Dynamic: only digs in while its key plays here. Click for static.\nRight-click: pick the key' : 'Static: always on. Click to make it dynamic (only while another track plays here)');
        G.rect(x + 6, y2 + 2, 22, rh - 4, c32(isD ? 0x1d3a49ff : 0x1c2029ff), 4);
        G.rectS(x + 6, y2 + 2, 22, rh - 4, c32(isD ? 0x5fd3ff99 : 0x2a2f3aff), 4);
        Center('D', x + 6, x + 28, y2 + ty, isD ? 0x5fd3ffff : (hdy ? 0xe6e9f0ff : 0x6b7385ff));
        if (hdy && clicked) setDynamic(I, k, !isD, isD ? null : (c.key || 0));
        if (hdy && interactive && G.rclick) popMenu('key', I, k, menuR);
      }
      const g1 = x + 32, g2 = x + w - 32;
      const hg = Hot(g1, y2, g2, y2 + rh, gainT ? 'Gain: drag up / down or wheel, double-click = 0 dB' : (cfIsCut(c.type) ? 'Slope: wheel or click to pick' : null));
      const gl = gainT ? (c.gain >= 0 ? '+' : '') + c.gain.toFixed(1) + ' dB' : (cfIsCut(c.type) ? CF_SLOPES[cfSlopeOf(c.type)] + ' dB/oct' : CF_SHAPES[cfShapeOf(c.type)]);
      Center(gl, g1, g2, y2 + ty, gainT ? (hg ? 0xffffffff : 0xffd54fff) : (hg ? 0xffffffff : 0xa3abbdff));
      const hpl = Hot(x + w - 30, y2 + 1, x + w - 4, y2 + rh - 1, 'Stereo placement: ' + CF_PLACES[c.place] + ' (click to change)');
      G.rect(x + w - 28, y2 + 2, 22, rh - 4, c32(c.place > 0 ? 0x2c2540ff : 0x1c2029ff), 4);
      G.rectS(x + w - 28, y2 + 2, 22, rh - 4, c32(c.place > 0 ? 0x998cff99 : 0x2a2f3aff), 4);
      Center(CF_PLACE_SHORT[c.place], x + w - 28, x + w - 6, y2 + ty, c.place > 0 ? 0xc9c0ffff : (hpl ? 0xe6e9f0ff : 0x6b7385ff));
      if (hpl && clicked) popMenu('place', I, k, menuR);
      // row 3: shape, Q, menu
      const hsh = Hot(x + 4, y3, x + 38, y3 + rh, cfTypeName(c.type) + ' (click to change)');
      cfShapeIcon(G, c.type, x + 8, y3 + 3, 26, rh - 6, c32(hsh ? 0xffffffff : 0xc9d1e6ff));
      if (hsh && clicked) popMenu('shape', I, k, menuR);
      const q1 = x + 40, q2 = x + w - 28;
      const hq = Hot(q1, y3, q2, y3 + rh, 'Q: drag left / right or wheel, double-click = default');
      Center('Q  ' + c.q.toFixed(2), q1, q2, y3 + ty, hq ? 0xffffffff : 0xc9d1e6ff);
      const hm = Hot(x + w - 26, y3, x + w - 4, y3 + rh, 'More: shape, placement, solo, delete');
      {
        const cx = x + w - 15, cy = y3 + rh / 2, mc = c32(hm ? 0xffffffff : 0x8a93a6ff);
        G.pline([[cx - 4, cy - 2], [cx, cy + 2], [cx + 4, cy - 2]], mc, 1.5);
      }
      if (hm && clicked) popMenu('band', I, k, menuR);
      // row 4: the key and the timing of a dynamic band
      if (cfIsDyn(c)) {
        const J = keyInst(c), who = J ? J.name : 'any other track';
        const [att, rel, p] = bandTiming(I, c);
        const tim = p != null ? (p > 0.6 ? 'fast' : (p < 0.4 ? 'smooth' : 'medium')) + '  ' + att.toFixed(0) + ' / ' + rel.toFixed(0) + ' ms' : att.toFixed(1) + ' / ' + rel.toFixed(0) + ' ms';
        const hk = Hot(x + 4, y4, x + w - 4, y4 + rh, 'Applies while ' + who + ' plays here. Click to pick whose playing drives it.\n'
          + (p != null ? 'Auto timing: ' + who + ' is ' + (p > 0.6 ? 'percussive, so it ducks fast and follows each hit' : (p < 0.4 ? 'sustained, so it moves slowly and doesn\'t pump' : 'in between')) + '.\nAttack / release ' + att.toFixed(1) + ' / ' + rel.toFixed(0) + ' ms'
            : 'Manual timing: attack ' + att.toFixed(1) + ' ms, release ' + rel.toFixed(0) + ' ms'));
        const tw = TW(tim);
        Txt(x + 8, y4 + ty, Fit('while ' + who, w - 16 - tw - 8), hk ? 0xffffffff : 0x5fd3ffff);
        Txt(x + w - 8 - tw, y4 + ty, tim, 0x6b7385ff);
        if (hk && clicked) popMenu('key', I, k, menuR);
      } else {
        let s = gainT ? 'Static: always on' : cfTypeName(c.type) + (cfIsCut(c.type) ? ' dB/oct' : '');
        if (c.place > 0) s += '  ·  ' + CF_PLACES[c.place];
        const hk = gainT && Hot(x + 4, y4, x + w - 4, y4 + rh, 'Click to make it dynamic: it only digs in while another track plays here');
        Txt(x + 8, y4 + ty, s, hk ? 0xe6e9f0ff : 0x6b7385ff);
        if (hk && clicked) setDynamic(I, k, true, c.key || 0);
      }
      // dragging and scrolling the values
      if (clicked) {
        if (dbl && hg && gainT) { c.gain = 0; changed = true; }
        else if (dbl && hq) { c.q = cfDefQ(c.type); changed = true; }
        else if (hf) S.popDrag = { key: 'freq', guid: I.guid, k };
        else if (hg && gainT) S.popDrag = { key: 'gain', guid: I.guid, k };
        else if (hq) S.popDrag = { key: 'q', guid: I.guid, k };
        else if (hg && cfIsCut(c.type)) popMenu('slope', I, k, menuR);
      }
      const D = S.popDrag;
      if (D && D.guid === I.guid && D.k === k && G.down && (G.dx || G.dy)) {
        if (D.key === 'freq') c.freq = clamp(c.freq * Math.pow(1000, G.dx * fine / 500), 20, 20000);
        else if (D.key === 'gain') c.gain = clamp(c.gain - G.dy * 0.1 * fine, -24, 24);
        else c.q = clamp(c.q * Math.pow(2, G.dx * fine / 80), 0.1, 18);
        changed = true;
      }
      if (D) G.cursor = D.key === 'gain' ? 'ns-resize' : 'ew-resize';
      else if (hf || hq) G.cursor = 'ew-resize';
      else if (hg && gainT) G.cursor = 'ns-resize';
      const wv = G.useWheel(x, y, w, hh);
      if (wv && In(x, y, x + w, y + hh) && interactive) {
        const dir = wv > 0 ? 1 : -1;
        if (hf) c.freq = clamp(c.freq * Math.pow(2, dir * fine / 12), 20, 20000);
        else if (hg && gainT) c.gain = clamp(Math.round((c.gain + dir * 0.5 * fine) * 10) / 10, -24, 24);
        else if (hg && cfIsCut(c.type)) setSlope(I, k, cfSlopeOf(c.type) + dir);
        else if (hq) c.q = clamp(c.q * (dir > 0 ? 1.12 : 1 / 1.12), 0.1, 18);
        changed = true;
      }
      if (changed) api.check('band');
      if (tip && !G.down) G.tip(tip);
    }
    return () => G.cleanup();
  }
  function cfLock(G, x, y, s, col, filled) {
    const bw = s * 0.72, bh = s * 0.48, bx = x + (s - bw) / 2, by = y + s - bh - 1;
    G.arc(x + s / 2, by, s * 0.24, PI, TAU, 1.3, col);
    if (filled) G.rect(bx, by, bw, bh, col, 1.5); else G.rectS(bx, by, bw, bh, col, 1.5, 1.2);
  }
  function cfSwapIcon(G, x, y, s, col) {
    const hh = s * 0.28;
    G.ln(x + 2, y + s * 0.35, x + s - 2, y + s * 0.35, col, 1.2);
    G.tri(x + s - 1, y + s * 0.35, x + s - 1 - hh, y + s * 0.35 - hh, x + s - 1 - hh, y + s * 0.35 + hh, col);
    G.ln(x + 2, y + s * 0.68, x + s - 2, y + s * 0.68, col, 1.2);
    G.tri(x + 1, y + s * 0.68, x + 1 + hh, y + s * 0.68 - hh, x + 1 + hh, y + s * 0.68 + hh, col);
  }

  reg({
    id: 'fxd-clash-finder', name: 'Clash Finder', vendor: 'FX Devices', group: 'FX Devices',
    width: frameW(700, 1), height: frameH(216, 1),
    blurb: 'Put it on every track you want to compare. It ranks where two tracks fight for the same frequencies and cuts the zone on the track you pick, static or dynamic. Here it sits on the Vocal track of a five-track song.',
    steps: [
      { id: 'show', text: 'Click a clash card (not its buttons) to show that clash in the graph', why: 'The zone lights up and the two tracks\' spectra are drawn bright, with the part they share filled in red.', target: tg('fxd-clash-finder', 'list') },
      { id: 'cut', text: 'Click the outlined track in a card to cut that zone', why: 'The outlined track is the suggestion: the zone matters less to it. Clicking the other track cuts that one instead.', target: tg('fxd-clash-finder', 'chip') },
      { id: 'band', text: 'Hover or tap a node in the graph, then drag a value in its popup', why: 'The popup works like Pro-Q: frequency, gain, Q, shape, stereo placement. You can also drag the node itself.', target: tg('fxd-clash-finder', 'plot') },
      { id: 'mode', text: 'Click the wave on the cut track\'s button to switch dynamic and static', why: 'A dynamic cut only digs in while the other track plays there. Press Space to play and watch the cyan dot duck.', target: tg('fxd-clash-finder', 'chip') },
    ],
    notes: [
      { title: 'In the graph', text: 'Double-click empty space to add a band (a low or high cut near the ends). <kbd>Alt</kbd>+click a node to bypass it, double-click it to delete it, wheel over it for Q. Right-click for the band menu.' },
      { title: 'Header', text: '<b>Fix top 3</b> cuts the three worst clashes at once, <b>Swap all</b> moves every cut to the other track, <b>A/B</b> bypasses every cut. The lock in the track list protects a track from suggestions.' },
      { title: 'No routing', text: 'The instances find each other through shared memory, so dynamic cuts work without sidechain sends. Each Clash Finder is also a 32-band EQ.' },
    ],
    build(body, api) { return buildClash(body, api); },
  });

  /* ================================================================== MIDI NOTE DEVICES */
  // src/Functions/Note Devices UI.lua (NoteDev.Run) and the five plugin scripts that call it. The JSFXs
  // run here as small JS engines on FXD.clock: they publish the same display values (nt_disp) and the
  // notes they send, which light the keyboard strip.
  const ND_SCALES = ['Off', 'Major', 'Minor', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Locrian', 'Harm. Minor',
    'Mel. Minor', 'Maj. Penta', 'Min. Penta', 'Blues', 'Whole Tone', 'Diminished', 'Hung. Minor', 'Japanese', 'Dbl. Harmonic', 'Chromatic'];
  const ND_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const ND_RATES = ['1/64', '1/32T', '1/32', '1/16T', '1/16', '1/16D', '1/8T', '1/8', '1/8D', '1/4T', '1/4', '1/4D', '1/2T', '1/2', '1/2D', '1 Bar', '2 Bars', '4 Bars'];
  const ND_DIV = [0.0625, 1 / 12, 0.125, 1 / 6, 0.25, 0.375, 1 / 3, 0.5, 0.75, 2 / 3, 1, 1.5, 4 / 3, 2, 3, 4, 8, 16];
  const ND_MODS = ['Velocity', 'Random', 'Random 2', 'Random 3', 'KeyTrack', 'KeyTrack 2', 'KeyTrack 3', 'CC'];
  const ND_SCALE_DEG = [[], [0, 2, 4, 5, 7, 9, 11], [0, 2, 3, 5, 7, 8, 10], [0, 2, 3, 5, 7, 9, 10], [0, 1, 3, 5, 7, 8, 10], [0, 2, 4, 6, 7, 9, 11],
    [0, 2, 4, 5, 7, 9, 10], [0, 1, 3, 5, 6, 8, 10], [0, 2, 3, 5, 7, 8, 11], [0, 2, 3, 5, 7, 9, 11], [0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 3, 5, 6, 7, 10],
    [0, 2, 4, 6, 8, 10], [0, 2, 3, 5, 6, 8, 9, 11], [0, 2, 3, 6, 7, 8, 11], [0, 1, 5, 7, 8], [0, 1, 4, 5, 7, 8, 11], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]];
  const pc12 = n => ((n % 12) + 12) % 12;
  function ndSet(scale, root) {
    if (scale <= 0) return null;
    const s = new Set();
    for (const d of ND_SCALE_DEG[scale] || []) s.add((root + d) % 12);
    return s;
  }
  function ndQuant(set, n, mode = 0) {
    if (!set || set.has(pc12(n))) return n;
    for (let d = 1; d <= 11; d++) {
      if (mode !== 2 && set.has(pc12(n + d))) return n + d;
      if (mode !== 1 && set.has(pc12(n - d))) return n - d;
    }
    return n;
  }
  function ndStep(set, n, steps) {
    steps = Math.round(steps);
    if (!set) return n + steps;
    n = ndQuant(set, n, 0);
    while (steps > 0) { n++; while (!set.has(pc12(n))) n++; steps--; }
    while (steps < 0) { n--; while (!set.has(pc12(n))) n--; steps++; }
    return n;
  }
  const ndName = n => { n = Math.round(n); return ND_ROOTS[pc12(n)] + (Math.floor(n / 12) - 1); };
  const ndClampN = n => Math.max(0, Math.min(127, Math.round(n)));
  function hsv32(h, s, v, a = 1) {
    h -= Math.floor(h);
    const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
    const c = x => Math.max(0, Math.min(255, Math.round(x * 255)));
    return (((c(r) << 24) >>> 0) + (c(g) << 16) + (c(b) << 8) + c(a)) >>> 0;
  }
  const hex32 = (rgb, a) => ((((rgb & 0xffffff) << 8) >>> 0) + Math.max(0, Math.min(255, Math.round(a * 255)))) >>> 0;
  /** layouts wider than ~730 units draw 1:1, narrower ones up to 1.25 so the 6-8 px labels stay readable */
  const ndScale = W => clamp(730 / W, 1, SC_S);
  const ndFmt = (f, v) => typeof f === 'function' ? f(v) : f === '%d' || f === '%.0f' ? String(Math.round(v))
    : f === '%d%%' || f === '%.0f%%' ? Math.round(v) + '%' : f === '%.1f dB' ? v.toFixed(1) + ' dB' : f === '%.0f dB' ? Math.round(v) + ' dB'
      : f === '%.0f ms' ? Math.round(v) + ' ms' : f === '%.1f ms' ? v.toFixed(1) + ' ms' : f === '%.2f oct' ? v.toFixed(2) + ' oct' : String(v);

  /**
   * NoteDev(body, api, spec): the shared panel UI. spec = { id, Title, W, H, Hue, PresetW, Presets, applyPreset(i, St),
   * defs (slider list), Panels, Items, Draw(V), tick(V, dt, clock), startPreset }
   */
  function NoteDev(body, api, spec) {
    const W = spec.W, H = spec.H || 216, SC = ndScale(W);
    const G = IM(body, W, H, SC, { bg: c32(hsv32(spec.Hue, 0.3, 0.07)), pad: padFor(H, SC) });
    const St = Store(spec.defs);
    const hue = spec.Hue;
    const S = { hov: {}, listen: new Set() };
    const notes = [];
    const V = {
      G, S, St, W, H, Hue: hue, now: 0, beat: 0, disp: [], notes, api,
      Val: p => St.get(p), Int: p => St.int(p), Nrm: p => St.nrm(p), Range: p => St.range(p),
      SetVal: (p, v) => { St.set(p, v); },
      Circ: (x, y, r, col) => G.circ(x, y, r, c32(col)),
      Ring: (x, y, r, col, th) => G.ring(x, y, r, c32(col), th || 1),
      Ln: (x1, y1, x2, y2, col, th) => G.ln(x1, y1, x2, y2, c32(col), th || 1),
      RRect: (x, y, w, hh, rad, col) => G.rect(x, y, w, hh, c32(col), rad),
      RBox: (x, y, w, hh, rad, col, th) => G.rectS(x, y, w, hh, c32(col), rad, th || 1),
      Arc: (cx, cy, r, a0, a1, th, col) => G.arc(cx, cy, r, a0, a1, th, c32(col)),
      Tri: (x1, y1, x2, y2, x3, y3, col) => G.tri(x1, y1, x2, y2, x3, y3, c32(col)),
      Txt: (x, y, s, size, col) => G.text(x, y, s, size, c32(col), 'l', 500),
      TxtC: (x, y, s, size, col) => G.text(x, y, s, size, c32(col), 'c', 500),
      TxtR: (x, y, s, size, col) => G.text(x, y, s, size, c32(col), 'r', 500),
      TW: (s, size) => G.tw(s, size, 500),
      Btn: (id, x, y, w, hh, cur) => G.btn(id, x, y, Math.max(1, w), Math.max(1, hh), cur),
      Wheel: (x, y, w, hh) => { const v = G.useWheel(x, y, w, hh); return v > 0 ? 1 : v < 0 ? -1 : 0; },
      HSV: hsv32, Hex: hex32,
      Disp: i => V.disp[i] == null ? -1 : V.disp[i],
      NoteOn: n => { for (const N of notes) if (N.n === n && N.b0 <= V.beat && V.beat < N.b1) return true; return false; },
      play: (n, vel, b0, len) => { if (notes.length < 400) notes.push({ n: ndClampN(n), vel, b0, b1: b0 + Math.max(0.01, len) }); V.lastOut = ndClampN(n); },
      msToBeats: (ms, clock) => ms / 1000 * clock.bpm / 60,
    };
    V.dim = 0x8a8a99ff; V.text = 0xe6e6efff;
    V.accent = hsv32(hue, 0.55, 1, 1); V.accentDim = hsv32(hue, 0.45, 0.55, 1);
    function loadPreset(i) {
      St.V.forEach((_, k) => { if (k > 0) St.V[k] = St.defs[k].def; });
      spec.applyPreset(0, St);
      if (i > 0) spec.applyPreset(i, St);
      St.V[0] = i;
      if (spec.onPreset) spec.onPreset(V, i);
    }
    loadPreset(spec.startPreset || 0);
    V.loadPreset = loadPreset;
    const Fmt = it => it.fmt ? ndFmt(it.fmt, St.get(it.p)) : it.list ? (it.list[St.int(it.p) - (it.base || 0)] || '') : String(Math.round(St.get(it.p) * 100) / 100);
    const EnumLabel = (it, i) => it.list ? (it.list[i - (it.base || 0)] || String(i)) : String(i);

    function Knob(it) {
      const p = it.p, cx = it.x, cy = it.y, rad = it.r || 11;
      const b = G.drag('k' + p, cx - rad - 3, cy - rad - 3, (rad + 3) * 2, (rad + 3) * 2, () => St.nrm(p), u => { St.setN(p, u); spec.onParam && spec.onParam(V, p); }, { def: St.defN(p), wheelStep: St.defs[p].step >= 1 ? Math.max(0.01, 1 / Math.max(1, Math.abs(St.defs[p].max - St.defs[p].min))) : 0.02 });
      const n = St.nrm(p), org = it.bipolar ? 0.5 : 0, lit = b.h || b.a;
      const col = hsv32(it.hue != null ? hue + it.hue : hue, 0.55, 1, 1);
      V.Circ(cx + 0.6, cy + 1.2, rad + 1, hex32(0, 0.35));
      V.Arc(cx, cy, rad + 3.5, A0, A1, 2.2, hex32(0xffffff, 0.08));
      V.Arc(cx, cy, rad + 3.5, A0 + (A1 - A0) * Math.min(org, n), A0 + (A1 - A0) * Math.max(org, n), 2.2, col);
      V.Circ(cx, cy, rad, lit ? 0x3a3a46ff : 0x2c2c36ff);
      V.Circ(cx - rad * 0.25, cy - rad * 0.3, rad * 0.3, hex32(0xffffff, 0.06));
      const a = A0 + (A1 - A0) * n;
      V.Ln(cx + Math.cos(a) * rad * 0.2, cy + Math.sin(a) * rad * 0.2, cx + Math.cos(a) * rad * 0.82, cy + Math.sin(a) * rad * 0.82, 0xf4f4ffff, Math.max(1.5, rad * 0.13));
      if (lit) V.TxtC(cx, cy + rad + 5, Fmt(it), 7, 0xffffffff);
      else V.TxtC(cx, cy + rad + 5, it.label || '', 7, V.dim);
      S.hov[p] = lit;
      if (b.h && it.tip) G.tip(it.tip);
      if (b.a && (G.dx || G.dy)) api.check('knob');
    }
    function Pill(it, toggle) {
      const p = it.p, x = it.x, y = it.y, w = it.w || 44, hh = it.h || 13;
      const [mn, mx] = St.range(p), v = St.int(p);
      if (it.label) V.Txt(x + 1, y - 9, it.label, 6.5, V.dim);
      const b = V.Btn('pill' + p, x, y, w, hh, 'pointer');
      const on = toggle && v > mn;
      const bg = toggle ? (on ? hsv32(it.hue != null ? hue + it.hue : hue, 0.55, 0.85, 0.95) : 0x2a2a33ff) : (b.h ? 0x353542ff : 0x2a2a33ff);
      V.RRect(x, y, w, hh, hh / 2, bg);
      const s = toggle ? (Array.isArray(it.text) ? it.text[on ? 1 : 0] : it.text || (on ? 'On' : 'Off')) : EnumLabel(it, v);
      let fs = 7;
      while (fs > 5 && V.TW(s, fs) > w - 8) fs -= 0.5;
      V.TxtC(x + w / 2, y + (hh - fs) / 2 - 0.5, s, fs, toggle && on ? 0x15151aff : V.text);
      if (b.h) {
        const d = V.Wheel(x, y, w, hh);
        if (d) { St.set(p, Math.max(mn, Math.min(mx, v - d))); spec.onParam && spec.onParam(V, p); }
        if (it.tip) G.tip(it.tip);
      }
      if (b.c) {
        if (toggle) { St.set(p, on ? mn : mx); spec.onParam && spec.onParam(V, p); }
        else {
          const items = [];
          for (let i = Math.round(mn); i <= Math.round(mx); i++) items.push({ label: EnumLabel(it, i), on: i === v, pick: () => { St.set(p, i); spec.onParam && spec.onParam(V, p); } });
          G.menu(x, y, w, hh, items);
        }
      }
    }

    G.frame((G, dt, clock) => {
      V.now += dt;
      V.clock = clock;
      // a free-running clock (like the JSFXs' own when REAPER is stopped); sequencers stop their notes on stop
      V.beat += dt * clock.bpm / 60;
      if (!clock.playing && V.wasPlaying && spec.offOnStop !== false) notes.length = 0;
      V.wasPlaying = clock.playing;
      for (let i = notes.length - 1; i >= 0; i--) if (notes[i].b1 < V.beat - 0.01) notes.splice(i, 1);
      if (spec.tick) spec.tick(V, dt, clock);
      // background and panels
      G.gradV(0, 0, W, H, c32(hsv32(hue, 0.35, 0.13)), c32(hsv32(hue, 0.3, 0.07)));
      for (const pn of spec.Panels) {
        const on = pn.enable == null || St.get(pn.enable) > 0.5;
        V.RRect(pn.x, pn.y, pn.w, pn.h, 5, hex32(0xffffff, on ? 0.045 : 0.02));
        V.RBox(pn.x, pn.y, pn.w, pn.h, 5, hex32(0xffffff, 0.06));
        if (pn.title) V.Txt(pn.x + 6, pn.y + 3, pn.title, 8, on ? hsv32(pn.hue || hue, 0.45, 1, 0.95) : 0x77778aff);
        if (pn.enable != null) {
          const px = pn.x + pn.w - 9, py = pn.y + 7;
          const b = V.Btn('pw' + pn.title, px - 6, py - 6, 12, 12, 'pointer');
          V.Circ(px, py, 4, on ? hsv32(pn.hue || hue, 0.6, 1, 1) : 0x44444fff);
          if (b.h) { V.Ring(px, py, 5.5, hex32(0xffffff, 0.6)); G.tip(pn.title + ' on / off'); }
          if (b.c) { St.set(pn.enable, on ? 0 : 1); spec.onParam && spec.onParam(V, pn.enable); }
        }
      }
      for (const it of spec.Items) {
        if (it.when && !it.when(V)) continue;
        if (it.t === 'knob') Knob(it); else if (it.t === 'enum') Pill(it, false); else if (it.t === 'toggle') Pill(it, true);
      }
      if (spec.Draw) spec.Draw(V);

      // header: title, presets, OUT
      const title = spec.Title.toUpperCase();
      V.Txt(6, 4, title, 10, hsv32(hue, 0.4, 1, 1));
      if (spec.Presets) {
        const px = 14 + V.TW(title, 10), pw = spec.PresetW || 120, cur = St.int(0), n = spec.Presets.length;
        const stepP = d => { loadPreset(((cur + d) % n + n) % n); api.check('preset'); };
        const bl = V.Btn('prev', px, 3, 12, 14, 'pointer');
        V.Txt(px + 3, 5, '<', 8, bl.h ? 0xffffffff : V.dim);
        if (bl.c) stepP(-1);
        const b = V.Btn('preset', px + 13, 3, pw, 14, 'pointer');
        V.RRect(px + 13, 3, pw, 14, 7, b.h ? 0x34343fff : 0x26262eff);
        V.TxtC(px + 13 + pw / 2, 5.5, spec.Presets[cur] || '?', 7.5, V.text);
        if (b.h) { G.tip('Preset: a starting point that sets every knob.\nClick for the list, wheel to step.'); const d = V.Wheel(px + 13, 3, pw, 14); if (d) stepP(-d); }
        if (b.c) G.menu(px + 13, 3, pw, 14, spec.Presets.map((nm, i) => ({ label: nm, on: i === cur, pick: () => { loadPreset(i); api.check('preset'); } })));
        const br = V.Btn('next', px + 15 + pw, 3, 12, 14, 'pointer');
        V.Txt(px + 18 + pw, 5, '>', 8, br.h ? 0xffffffff : V.dim);
        if (br.c) stepP(1);
      }
      {
        const nl = S.listen.size;
        let active = false;
        for (const N of notes) if (N.b0 <= V.beat && V.beat < N.b1) { active = true; break; }
        const bw = 54, bh = 14, bx = W - bw - 4, by = 3;
        const b = V.Btn('out', bx, by, bw, bh, 'pointer');
        V.RRect(bx, by, bw, bh, 7, nl > 0 ? hsv32(hue, 0.6, 0.95, 1) : (b.h ? 0x3c3c48ff : 0x2a2a33ff));
        if (active) V.Circ(bx + 8, by + 7, 3, nl > 0 ? 0x15151aff : hsv32(hue, 0.5, 1, 1)); else V.Ring(bx + 8, by + 7, 2.5, V.dim);
        V.TxtC(bx + bw / 2 + 4, by + 3, (nl > 0 ? 'OUT ' + nl : 'OUT') + ' >', 7.5, nl > 0 ? 0x15151aff : V.text);
        if (b.h && !G.down) G.tip('Drag onto a MIDI modulator (Velocity, Random, KeyTrack, CC) so it reads the notes this device sends.\nClick for a menu.' + (nl ? '\n\nFeeding: ' + [...S.listen].join(', ') : ''));
        if (b.c) {
          const items = [{ head: 'MIDI modulators that read these notes' }];
          for (const lbl of ND_MODS) items.push({ label: lbl, on: S.listen.has(lbl), pick: () => { if (S.listen.has(lbl)) S.listen.delete(lbl); else S.listen.add(lbl); api.check('out'); } });
          if (nl) items.push({ sep: true }, { label: 'Disconnect all', pick: () => S.listen.clear() });
          G.menu(bx, by, bw, bh, items);
        }
      }
      // keyboard strip: the notes the device is sending
      if (!spec.NoKeys) {
        const KH = 12, ky = H - KH, lo = spec.KeyLo || 24, hi = spec.KeyHi || 108, kw = (W - 8) / (hi - lo + 1);
        V.RRect(4, ky, W - 8, KH - 2, 2, 0x0d0d11ff);
        if (spec.onKey) { // demo input: a click on the strip plays that note into the device
          const b = V.Btn('keys', 4, ky, W - 8, KH, 'pointer');
          if (b.start) spec.onKey(V, Math.max(lo, Math.min(hi, lo + Math.floor((G.mx - 4) / kw))));
          if (b.h) G.tip('Demo: click a key to play that note into the device');
        }
        const on = new Set();
        for (const N of notes) if (N.b0 <= V.beat && V.beat < N.b1) on.add(N.n);
        for (let n = lo; n <= hi; n++) {
          const x = 4 + (n - lo) * kw, pc = n % 12, black = pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
          if (on.has(n)) V.RRect(x, ky, kw - 0.5, KH - 2, 1, hsv32(hue + (n - lo) / (hi - lo) * 0.15, 0.55, 1, 1));
          else if (!black) V.RRect(x, ky + 1, kw - 0.5, KH - 4, 1, hex32(0xffffff, n === 60 ? 0.2 : 0.09));
          if (pc === 0) V.Ln(x + 0.5, ky, x + 0.5, ky + KH - 2, hex32(0xffffff, 0.12));
        }
      }
    });
    return V;
  }
  /** JSFX-style preset tables: { n: [[slider number (1-based), value], ...] } */
  const ndPresetFn = table => (i, St) => { for (const [sl, v] of table[i] || []) St.V[sl - 1] = v; };

  /* ---------------------------------------------------------------- Step Engine */
  const SE_P = { preset: 0, source: 1, arpmode: 2, octaves: 3, octmode: 4, rate: 5, swing: 6, gatescale: 7, restart: 8, latch: 9,
    patroot: 10, scale: 11, sroot: 12, velmode: 13, prand: 14, vrand: 15, outch: 16, len: 17 };
  const SE_LANES = [
    { tab: 'Velocity', base: 22, mn: 1, mx: 127, def: 100, dh: 0, fmt: v => String(v) },
    { tab: 'Pitch', base: 38, mn: -24, mx: 24, def: 0, dh: 0.1, bipolar: true, fmt: v => v === 0 ? '0' : (v > 0 ? '+' : '') + v },
    { tab: 'Gate', base: 54, mn: 0, mx: 200, def: 80, dh: -0.06, fmt: v => v === 0 ? 'rest' : v + '%', short: v => v === 0 ? '-' : String(v) },
    { tab: 'Chance', base: 70, mn: 0, mx: 100, def: 100, dh: 0.17, fmt: v => v + '%' },
    { tab: 'Ratchet', base: 86, mn: 1, mx: 4, def: 1, dh: -0.12, fmt: v => 'x' + v },
  ];
  const SE_DEFS = sliders(`
preset=0<0,7,1>
source=0<0,2,1>
arpmode=0<0,8,1>
octaves=1<1,4,1>
octmode=0<0,2,1>
rate=4<0,17,1>
swing=0<0,100,1>
gatescale=100<0,200,1>
restart=0<0,2,1>
latch=0<0,1,1>
patroot=48<0,127,1>
scale=0<0,18,1>
sroot=0<0,11,1>
velmode=0<0,2,1>
prand=0<0,12,1>
vrand=0<0,100,1>
outch=0<0,16,1>`).concat(Array.from({ length: 5 }, () => ({ name: '', def: 16, min: 1, max: 16, step: 1 })))
    .concat(...SE_LANES.map(L => Array.from({ length: 16 }, () => ({ name: '', def: L.def, min: L.mn, max: L.mx, step: 1 }))));
  // presets as in the JSFX (slider numbers are 1-based; lane8(base, first step, 8 values))
  const SE_PRESETS = (() => {
    const T = {}, L = (sl, o, vals) => vals.map((v, i) => [sl + o + i, v]);
    const VEL = 23, PIT = 39, GATE = 55, CHN = 71, RAT = 87, LEN = 18;
    T[0] = [[2, 0], [3, 0], [4, 1], [5, 0], [6, 4], [7, 0], [8, 100], [9, 0], [10, 0], [11, 48], [12, 0], [13, 0], [14, 0], [15, 0], [16, 0], [17, 0]];
    for (let i = 0; i < 5; i++) T[0].push([LEN + i, 16]);
    for (let i = 0; i < 16; i++) T[0].push([VEL + i, 100], [PIT + i, 0], [GATE + i, 80], [CHN + i, 100], [RAT + i, 1]);
    T[1] = [[4, 2], [14, 2], [LEN, 4], ...L(VEL, 0, [120, 85, 100, 85, 100, 100, 100, 100])];
    T[2] = [[3, 2], [4, 2], [10, 1], [14, 2], ...L(GATE, 0, [60, 60, 0, 60, 60, 0, 60, 60]), ...L(GATE, 8, [60, 60, 0, 60, 0, 60, 60, 40]),
      ...L(VEL, 0, [127, 90, 90, 100, 127, 90, 100, 90]), ...L(VEL, 8, [127, 90, 90, 100, 127, 90, 110, 100]), [RAT + 15, 2]];
    T[3] = [[2, 2], [7, 15], [11, 36], ...L(PIT, 0, [0, 0, 12, 0, 3, 0, 15, 0]), ...L(PIT, 8, [7, 0, 0, 10, 0, 12, 3, 5]),
      ...L(GATE, 0, [55, 140, 55, 0, 55, 55, 150, 55]), ...L(GATE, 8, [55, 0, 140, 55, 55, 150, 55, 40]),
      ...L(VEL, 0, [127, 80, 80, 80, 110, 80, 127, 80]), ...L(VEL, 8, [80, 80, 127, 80, 80, 110, 80, 127]), [RAT + 11, 2]];
    T[4] = [[LEN, 3], [LEN + 1, 4], [LEN + 2, 5], ...L(VEL, 0, [120, 70, 90, 100, 100, 100, 100, 100]), ...L(PIT, 0, [0, 12, 0, 7, 0, 0, 0, 0]), ...L(GATE, 0, [90, 30, 60, 0, 30, 80, 80, 80])];
    T[5] = [[2, 2], [11, 36], [LEN, 8], [LEN + 1, 8], [LEN + 2, 8], ...L(GATE, 0, [90, 0, 0, 90, 0, 0, 90, 0]), ...L(VEL, 0, [120, 100, 100, 95, 100, 100, 105, 100]), ...L(PIT, 0, [0, 0, 0, 0, 0, 0, 12, 0])];
    T[6] = [[2, 2], [6, 7], [11, 72], [12, 10], [15, 2], [16, 30], [LEN, 5], [LEN + 1, 8], [LEN + 2, 3], [LEN + 3, 7], [LEN + 4, 11],
      ...L(VEL, 0, [100, 70, 90, 60, 80, 100, 100, 100]), ...L(PIT, 0, [0, 2, 4, 1, 5, 3, 7, 2]), ...L(GATE, 0, [180, 120, 200, 80, 80, 80, 80, 80]),
      ...L(CHN, 0, [100, 50, 70, 30, 80, 40, 60, 100]), [RAT + 5, 2]];
    T[7] = [[3, 8], [7, 25], [14, 2], ...L(GATE, 0, [50, 0, 0, 50, 0, 0, 50, 0]), ...L(GATE, 8, [0, 0, 50, 0, 0, 120, 0, 0]),
      ...L(VEL, 0, [127, 100, 100, 100, 100, 100, 110, 100]), ...L(VEL, 8, [100, 100, 115, 100, 100, 120, 100, 100])];
    return T;
  })();
  // the demo's held chord for the Arp source (C3 Eb3 G3 Bb3, in the order played)
  const SE_HELD = [48, 51, 55, 58];
  function seArpOrder(mode, octs, omode) {
    const base = [[0, 1, 2, 3], [3, 2, 1, 0], [0, 1, 2, 3, 2, 1], [3, 2, 1, 0, 1, 2], [0, 3, 1, 2], [1, 2, 0, 3], [2, 0, 3, 1], [2, 0, 3, 3, 1, 0, 2, 1]][mode] || [0];
    const offs = [];
    if (omode === 1) for (let o = 0; o < octs; o++) offs.push(-o);
    else { for (let o = 0; o < octs; o++) offs.push(o); if (omode === 2) for (let o = octs - 2; o >= 1; o--) offs.push(o); }
    const seq = [];
    for (const o of offs) for (const n of base) seq.push(n + o * 4);
    return seq;
  }
  function buildStepEngine(body, api) {
    const P = SE_P, LANES = SE_LANES;
    const LX = 120, LW = 352, BX = 128, SW = 21, NS = 16, BY = 68, BH = 92, RY = 59;
    const E = { origin: 0, ap: 0, lastk: -1e9, flash: -1, wasPlaying: false };
    const CH_OUT = ['Same'].concat(Array.from({ length: 16 }, (_, i) => String(i + 1)));
    const spec = {
      id: 'midi-step-engine', Title: 'Step Engine', W: 744, Hue: 0.33, PresetW: 112, defs: SE_DEFS, startPreset: 3,
      Presets: ['Init', 'Classic Up 16ths', 'Trance Gate Arp', 'Acid Line', 'Polyrhythm 5:4', 'Euclid 3/8 Bass', 'Generative Bells', 'Chord Stabs'],
      applyPreset: ndPresetFn(SE_PRESETS),
      onPreset: v => { E.ap = 0; E.origin = Math.round(Math.floor(v.beat / 4) * 4 / ND_DIV[v.Int(P.rate)]); },
      Panels: [
        { title: 'ARP', x: 4, y: 22, w: 112, h: 180 }, { title: 'LANES', x: LX, y: 22, w: LW, h: 180 },
        { title: 'TIME', x: 476, y: 22, w: 80, h: 180 }, { title: 'KEY', x: 560, y: 22, w: 96, h: 180 }, { title: 'OUTPUT', x: 660, y: 22, w: 80, h: 180 },
      ],
      Items: [
        { t: 'enum', p: P.source, x: 10, y: 42, w: 100, label: 'SOURCE', list: ['Arp', 'Pattern', 'Pattern + transp.'],
          tip: 'Arp: plays the held notes\nPattern: plays the lanes from Pattern Root\nPattern + transp.: the same, transposed by the last held key' },
        { t: 'enum', p: P.arpmode, x: 10, y: 68, w: 100, label: 'ARP MODE', list: ['Up', 'Down', 'Up-Down', 'Down-Up', 'Converge', 'Diverge', 'As Played', 'Random', 'Chord'] },
        { t: 'knob', p: P.octaves, x: 28, y: 110, r: 10, label: 'OCTAVES', fmt: '%d' },
        { t: 'enum', p: P.octmode, x: 54, y: 104, w: 56, label: 'OCT DIR', list: ['Up', 'Down', 'Up-Down'] },
        { t: 'toggle', p: P.latch, x: 10, y: 146, w: 44, label: 'LATCH', tip: 'Keep the notes after release; the next key after a full release replaces them' },
        { t: 'enum', p: P.restart, x: 58, y: 146, w: 52, label: 'RESTART', list: ['Never', 'New chord', 'Every bar'], tip: 'When the lanes and the arp go back to step 1' },
        { t: 'enum', p: P.rate, x: 482, y: 42, w: 68, label: 'RATE', list: ND_RATES },
        { t: 'knob', p: P.swing, x: 516, y: 86, r: 10, label: 'SWING', fmt: '%d%%', tip: 'Delays every second step by up to half a step (50% = triplet feel)' },
        { t: 'knob', p: P.gatescale, x: 516, y: 132, r: 10, label: 'GATE', fmt: '%d%%', tip: 'Scales the Gate lane' },
        { t: 'enum', p: P.scale, x: 566, y: 42, w: 84, label: 'SCALE', list: ND_SCALES, tip: 'With a scale on, notes snap into it and the Pitch lane counts scale steps' },
        { t: 'enum', p: P.sroot, x: 566, y: 68, w: 84, label: 'ROOT', list: ND_ROOTS },
        { t: 'knob', p: P.patroot, x: 586, y: 110, r: 10, label: 'PAT ROOT', fmt: ndName, tip: 'Root note the Pattern sources play the lanes from' },
        { t: 'knob', p: P.prand, x: 630, y: 110, r: 10, label: 'P RAND', fmt: v => '+/-' + Math.round(v), tip: 'Random pitch offset per step (semitones, or scale steps with a scale on)' },
        { t: 'enum', p: P.velmode, x: 666, y: 42, w: 68, label: 'VELOCITY', list: ['Lane', 'As played', 'Lane x played'] },
        { t: 'knob', p: P.vrand, x: 700, y: 86, r: 10, label: 'VEL RAND', fmt: '%d%%' },
        { t: 'enum', p: P.outch, x: 666, y: 126, w: 68, label: 'OUT CH', list: CH_OUT },
      ],
    };
    // ---- the JSFX's step grid, on FXD.clock (Pattern sources run with the transport, Arp with the held chord)
    spec.tick = (V, dt, clock) => {
      const disp = V.disp;
      const src = V.Int(P.source), held = src === 0 ? SE_HELD : [];
      const active = clock.playing;
      if (clock.playing && !E.wasPlaying) { E.origin = Math.round(Math.floor(V.beat / 4) * 4 / ND_DIV[V.Int(P.rate)]); E.ap = 0; E.lastk = -1e9; }
      E.wasPlaying = clock.playing;
      disp[5] = 0;
      if (!active) { for (let i = 0; i < 5; i++) disp[i] = -1; return; }
      const div = ND_DIV[V.Int(P.rate)], b1 = V.beat, b0 = b1 - dt * clock.bpm / 60;
      const sw = V.Val(P.swing) / 100 * div * 0.5;
      const barlen = 4;
      let k = Math.ceil((b0 - sw) / div - 1e-6);
      let guard = 0;
      while (k * div < b1 && guard++ < 64) {
        const tb = k * div + (k % 2 !== 0 ? sw : 0);
        if (tb >= b0 - 1e-9 && tb < b1 && k !== E.lastk) {
          if (V.Int(P.restart) === 2 && Math.abs(k * div / barlen - Math.round(k * div / barlen)) < 1e-6) { E.origin = k; E.ap = 0; }
          fire(V, k, tb, div, held);
          E.lastk = k;
        }
        k++;
      }
    };
    const posmod = (a, b) => a - b * Math.floor(a / b);
    function fire(V, k, t, stepB, held) {
      const cnt = k - E.origin;
      const L = i => Math.max(1, Math.round(V.Val(P.len + i)));
      const pos = [0, 1, 2, 3, 4].map(i => posmod(cnt, L(i)));
      for (let i = 0; i < 5; i++) V.disp[i] = pos[i];
      V.disp[5] = 1; E.flash = V.now;
      const step = (lane, kk) => V.Int(LANES[lane].base + kk);
      const g = step(2, pos[2]);
      if (g <= 0) return;
      const idx = E.ap++;
      const ch = step(3, pos[3]);
      if (!(ch >= 100 || Math.random() * 100 < ch)) return;
      const hits = Math.max(1, Math.min(4, step(4, pos[4]))), hitB = stepB / hits;
      const len = hitB * g / 100 * V.Val(P.gatescale) / 100;
      if (len <= 0.001) return;
      let pitch = step(1, pos[1]);
      const pr = V.Int(P.prand);
      if (pr > 0) pitch += Math.floor(Math.random() * (2 * pr + 1)) - pr;
      const vlane = step(0, pos[0]);
      const set = ndSet(V.Int(P.scale), V.Int(P.sroot));
      const playNote = (n, tr, vp) => {
        n = ndClampN(ndStep(set, n, pitch) + tr);
        const vm = V.Int(P.velmode);
        let v = vm === 0 || vp <= 0 ? vlane : vm === 1 ? vp : vlane * vp / 127;
        const vr = V.Val(P.vrand); if (vr > 0) v *= 1 + (Math.random() * 2 - 1) * vr / 100;
        v = Math.max(1, Math.min(127, Math.round(v)));
        for (let i = 0; i < hits; i++) V.play(n, v, t + i * hitB, len);
        V.disp[6] = n;
      };
      const src = V.Int(P.source), am = V.Int(P.arpmode);
      if (src === 0) {
        if (!held.length) return;
        const sorted = held.slice().sort((a, b) => a - b);
        const octs = Math.max(1, Math.min(4, V.Int(P.octaves))), om = V.Int(P.octmode);
        const OCTS = [];
        if (om === 1) for (let i = 0; i < octs; i++) OCTS.push(-i);
        else { for (let i = 0; i < octs; i++) OCTS.push(i); if (om === 2) for (let i = octs - 2; i >= 1; i--) OCTS.push(i); }
        if (am === 8) { const oct = OCTS[idx % OCTS.length]; for (const n of held) playNote(n + 12 * oct, 0, 100); return; }
        let base = [];
        const nh = sorted.length;
        if (am === 0 || am === 7) base = sorted.slice();
        else if (am === 1) base = sorted.slice().reverse();
        else if (am === 2) { base = sorted.slice(); for (let i = nh - 2; i >= 1; i--) base.push(sorted[i]); }
        else if (am === 3) { base = sorted.slice().reverse(); for (let i = 1; i <= nh - 2; i++) base.push(sorted[i]); }
        else if (am === 4 || am === 5) { let lo = 0, hi = nh - 1; while (lo <= hi) { base.push(sorted[lo]); if (hi > lo) base.push(sorted[hi]); lo++; hi--; } if (am === 5) base.reverse(); }
        else base = held.slice();
        const seqlen = base.length * OCTS.length, j = idx % seqlen, oct = OCTS[Math.floor(j / base.length)];
        const n = am === 7 ? sorted[Math.floor(Math.random() * nh)] : base[j % base.length];
        playNote(n + 12 * oct, 0, 100);
      } else {
        const n = Math.round(V.Val(P.patroot));
        if (src === 1 || !held.length) playNote(n, 0, 0);
        else playNote(n, held[held.length - 1] - n, 100);
      }
    }
    spec.Draw = V => {
      const S = V.S, G = V.G;
      if (S.lane == null) { S.lane = 2; S.eu = 4; S.pz = 12; }
      const mx = G.mx, my = G.my;
      const scaleOn = V.Int(P.scale) > 0, white = 0xffffffff;
      const LaneHue = i => V.Hue + LANES[i].dh;
      const Len = i => Math.max(1, Math.min(NS, V.Int(P.len + i)));
      const Step = (i, k) => V.Int(LANES[i].base + k);
      const SetStep = (i, k, v) => { const L = LANES[i]; v = Math.max(L.mn, Math.min(L.mx, Math.round(v))); if (v !== Step(i, k)) V.SetVal(L.base + k, v); };
      const Cur = i => { const c = Math.round(V.Disp(i)); return c >= 0 ? c : null; };
      const SmallBtn = (id, x, y, w, label, tip, on) => {
        const b = V.Btn('se' + id, x, y, w, 14, 'pointer');
        V.RRect(x, y, w, 14, 7, on ? V.accentDim : (b.h ? 0x3a3a46ff : 0x2a2a33ff));
        V.TxtC(x + w / 2, y + 3.5, label, 7, b.h ? white : V.text);
        if (b.h && tip) G.tip(tip);
        return b.c;
      };
      // lane tabs
      const TY = 35, TW_ = 56, TG_ = 3;
      LANES.forEach((L, i) => {
        const x = 126 + i * (TW_ + TG_), sel = S.lane === i;
        const b = V.Btn('tab' + i, x, TY, TW_, 20, 'pointer');
        const hu = LaneHue(i);
        V.RRect(x, TY, TW_, 20, 4, sel ? hsv32(hu, 0.5, 0.42, 1) : (b.h ? 0x30303bff : 0x23232bff));
        if (sel) V.RRect(x + 4, TY + 19, TW_ - 8, 1.5, 1, hsv32(hu, 0.55, 1, 1));
        V.Txt(x + 5, TY + 2.5, L.tab, 7, sel ? white : (b.h ? V.text : V.dim));
        const len = Len(i), cur = Cur(i);
        for (let k = 0; k < NS; k++) {
          const dx = x + 5 + k * 3, dy = TY + 15;
          if (k === cur) V.Circ(dx, dy, 1.7, hsv32(hu, 0.4, 1, 1));
          else if (k < len) V.Circ(dx, dy, 0.9, hex32(0xffffff, sel ? 0.55 : 0.3));
          else V.Circ(dx, dy, 0.6, hex32(0xffffff, 0.1));
        }
        if (b.c) S.lane = i;
        if (b.h) { const d = V.Wheel(x, TY, TW_, 20); if (d) S.lane = ((S.lane - d) % 5 + 5) % 5; }
      });
      const li = S.lane, L = LANES[li], hu = LaneHue(li);
      let len = Len(li);
      const cur = Cur(li);
      {
        const x = 422;
        V.TxtC(x + 22, TY - 1, 'LENGTH', 6, V.dim);
        if (SmallBtn('lm', x, TY + 7, 13, '-', 'Shorter lane')) { V.SetVal(P.len + li, Math.max(1, len - 1)); api.check('length'); }
        V.TxtC(x + 22, TY + 10, String(len), 7.5, white);
        if (SmallBtn('lp', x + 31, TY + 7, 13, '+', 'Longer lane')) { V.SetVal(P.len + li, Math.min(NS, len + 1)); api.check('length'); }
      }
      V.RRect(BX - 4, RY - 2, NS * SW + 6, BH + (BY - RY) + 4, 4, 0x0f0f14ff);
      {
        const b = V.Btn('ruler', BX - 2, RY - 3, NS * SW + 4, 9, 'ew-resize');
        V.RRect(BX, RY, NS * SW - 2, 3, 1.5, hex32(0xffffff, b.h ? 0.12 : 0.07));
        V.RRect(BX, RY, len * SW - 2, 3, 1.5, hsv32(hu, 0.5, b.h ? 1 : 0.8, 0.9));
        const ex = BX + len * SW - 1;
        V.Tri(ex - 4, RY - 2, ex + 4, RY - 2, ex, RY + 4, white);
        if (len < NS) V.Ln(ex, RY + 4, ex, BY + BH, hex32(0xffffff, 0.45), 1);
        if (b.a) {
          const n = Math.max(1, Math.min(NS, Math.round((mx - BX) / SW)));
          if (n !== len) { V.SetVal(P.len + li, n); len = n; api.check('length'); }
        } else if (b.h) G.tip('Lane length: drag the marker (' + len + ' steps)');
      }
      const Y2V = y => {
        const t = 1 - (y - BY) / BH;
        if (L.bipolar) return (t * 2 - 1) * S.pz;
        if (li === 4) return 1 + Math.floor(t * 4);
        return L.mn + t * (L.mx - L.mn);
      };
      const bb = V.Btn('bars', BX, BY, NS * SW, BH, 'crosshair');
      let hk = bb.h || bb.a ? Math.max(0, Math.min(NS - 1, Math.floor((mx - BX) / SW))) : null;
      if (bb.a && G.down) {
        const k = Math.max(0, Math.min(NS - 1, Math.floor((mx - BX) / SW)));
        const v = Y2V(Math.max(BY, Math.min(BY + BH, my)));
        const pk = S.dk, pv = S.dv;
        if (pk != null && pk !== k) { const d = k > pk ? 1 : -1; for (let j = pk + d; j !== k; j += d) SetStep(li, j, pv + (v - pv) * (j - pk) / (k - pk)); }
        SetStep(li, k, v);
        S.dk = k; S.dv = v; hk = k;
        S.drawn = (S.drawn || 0) + Math.abs(G.dx) + Math.abs(G.dy) + (bb.start ? 1 : 0);
        if (S.drawn > 2) api.check(li === 2 ? 'draw' : 'lane');
      } else { S.dk = S.dv = null; S.drawn = 0; }
      if (bb.h && hk != null) {
        if (G.rdown) SetStep(li, hk, L.def);
        const d = V.Wheel(BX, BY, NS * SW, BH);
        if (d) SetStep(li, hk, Step(li, hk) + d);
        if (!bb.a) G.tip('Drag: draw values\nRight-click: reset to ' + L.fmt(L.def) + '\nWheel: fine adjust');
      }
      const midY = BY + BH / 2;
      if (L.bipolar) { V.Ln(BX - 2, midY, BX + NS * SW - 2, midY, hex32(0xffffff, 0.15)); V.Txt(BX - 1, BY + 1, '+' + S.pz, 5.5, hex32(0xffffff, 0.3)); }
      else if (li === 2) V.Ln(BX - 2, BY + BH * 0.5, BX + NS * SW - 2, BY + BH * 0.5, hex32(0xffffff, 0.12));
      for (let k = 0; k < NS; k++) {
        const x = BX + k * SW, w = SW - 2, on = k < len, a = on ? 1 : 0.28, v = Step(li, k);
        if (k === cur) V.RRect(x - 1, BY - 1, w + 2, BH + 2, 3, hsv32(hu, 0.6, 0.7, 0.35));
        else if (on) V.RRect(x, BY, w, BH, 2, hex32(0xffffff, Math.floor(k / 4) % 2 === 0 ? 0.045 : 0.025));
        if (k === hk) V.RRect(x, BY, w, BH, 2, hex32(0xffffff, 0.06));
        const bc = hsv32(hu, k === cur ? 0.35 : 0.55, k === cur ? 1 : 0.9, a);
        if (L.bipolar) {
          const t = Math.max(-1, Math.min(1, v / S.pz)), y = midY - t * (BH / 2 - 1);
          if (v !== 0) {
            V.RRect(x + 1, Math.min(y, midY), w - 2, Math.max(2, Math.abs(y - midY)), 1.5, bc);
            if (Math.abs(v) > S.pz) { const ty = v > 0 ? BY + 1 : BY + BH - 1, d = v > 0 ? 4 : -4; V.Tri(x + w / 2 - 3, ty + d, x + w / 2 + 3, ty + d, x + w / 2, ty, white); }
          } else V.RRect(x + 3, midY - 1, w - 6, 2, 1, hsv32(hu, 0.3, 0.6, a));
        } else if (li === 4) {
          const bh = BH / 4;
          for (let n = 1; n <= v; n++) V.RRect(x + 1, BY + BH - n * bh + 1, w - 2, bh - 2, 1.5, bc);
        } else {
          const t = (v - L.mn) / (L.mx - L.mn), hh = t * BH;
          if (v === L.mn && li === 2) {
            V.Ln(x + 5, BY + BH - 8, x + w - 5, BY + BH - 2, hex32(0xffffff, 0.3 * a));
            V.Ln(x + w - 5, BY + BH - 8, x + 5, BY + BH - 2, hex32(0xffffff, 0.3 * a));
          } else if (hh > 0) {
            V.RRect(x + 1, BY + BH - hh, w - 2, hh, 1.5, bc);
            if (li === 2 && v > 100) V.RRect(x + 1, BY + BH - hh, w - 2, hh - BH / 2, 1.5, hsv32(hu, 0.25, 1, 0.5 * a));
            V.RRect(x + 1, BY + BH - hh, w - 2, 1.5, 1, hex32(0xffffff, 0.5 * a));
          }
        }
        const sv = L.short ? L.short(v) : L.bipolar ? (v === 0 ? '0' : (v > 0 ? '+' : '') + v) : String(v);
        V.TxtC(x + w / 2, BY + BH + 4, sv, 5.5, k === hk ? white : hex32(0xe6e6ef, on ? 0.6 : 0.22));
      }
      // lane tools
      const ty = 180;
      let tx = 126;
      if (SmallBtn('clr', tx, ty, 34, 'Clear', 'Reset every step of this lane to ' + L.fmt(L.def))) for (let k = 0; k < NS; k++) SetStep(li, k, L.def);
      tx += 37;
      if (SmallBtn('rnd', tx, ty, 40, 'Random', 'Random values for the steps within the length')) {
        const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
        for (let k = 0; k < len; k++) {
          let v;
          if (li === 0) v = ri(50, 127);
          else if (li === 1) { const pool = scaleOn ? [0, 0, 0, 0, 1, 2, 4, 7, -3, -7] : [0, 0, 0, 0, 3, 5, 7, 12, -5, -12]; v = pool[ri(0, pool.length - 1)]; }
          else if (li === 2) v = Math.random() < 0.2 ? 0 : ri(40, 100);
          else if (li === 3) v = Math.random() < 0.5 ? 100 : ri(30, 95);
          else v = Math.random() < 0.7 ? 1 : ri(2, 4);
          SetStep(li, k, v);
        }
        api.check(li === 2 ? 'draw' : 'lane');
      }
      tx += 43;
      const Shift = d => { const vals = []; for (let k = 0; k < len; k++) vals[k] = Step(li, k); for (let k = 0; k < len; k++) SetStep(li, k, vals[posmod(k - d, len)]); };
      if (SmallBtn('shl', tx, ty, 16, '<', 'Shift the steps left (within the length)')) Shift(-1);
      if (SmallBtn('shr', tx + 18, ty, 16, '>', 'Shift the steps right (within the length)')) Shift(1);
      tx += 40;
      if (li === 2) {
        S.eu = Math.max(0, Math.min(len, S.eu));
        if (SmallBtn('eu', tx, ty, 40, 'Euclid', 'Fill the gate lane with ' + S.eu + ' hits spread over ' + len + ' steps')) {
          for (let k = 0; k < len; k++) { const hit = (k * S.eu) % len < S.eu, g = Step(li, k); SetStep(li, k, hit ? (g > 0 ? g : 80) : 0); }
          api.check('euclid');
        }
        if (SmallBtn('em', tx + 43, ty, 13, '-', 'Fewer hits')) S.eu = Math.max(0, S.eu - 1);
        V.TxtC(tx + 69, ty + 3.5, S.eu + '/' + len, 7, V.text);
        if (SmallBtn('ep', tx + 82, ty, 13, '+', 'More hits')) S.eu = Math.min(len, S.eu + 1);
      } else if (li === 1) {
        if (SmallBtn('pz', tx, ty, 40, '+/-' + S.pz, 'View range of the Pitch lane')) S.pz = S.pz === 12 ? 24 : 12;
        V.Txt(tx + 46, ty + 3.5, scaleOn ? 'scale steps' : 'semitones', 6.5, V.dim);
      }
      {
        const k = hk != null ? hk : cur;
        if (k != null) V.TxtR(LX + LW - 6, ty + 3.5, (hk != null ? 'Step ' : 'Playing ') + (k + 1) + '  ' + L.fmt(Step(li, k)), 7, hk != null ? white : hsv32(hu, 0.4, 1, 1));
      }
      // arp order preview
      {
        const x0 = 10, y0 = 168, w = 100, h = 30;
        V.RRect(x0, y0, w, h, 4, 0x0f0f14ff);
        const src = V.Int(P.source), mode = V.Int(P.arpmode);
        if (src === 1 || (src === 2 && mode !== 8)) {
          V.TxtC(x0 + w / 2, y0 + 5, src === 1 ? 'lanes from' : 'lanes from, + key', 6.5, V.dim);
          V.TxtC(x0 + w / 2, y0 + 15, ndName(V.Val(P.patroot)), 8, V.accent);
        } else if (mode === 8) {
          for (let st = 0; st < 8; st++) for (let n = 0; n < 4; n++) V.Circ(x0 + 9 + st * 11.7, y0 + h - 5 - n * 6.5, 1.8, V.accent);
        } else {
          const seq = seArpOrder(mode, Math.max(1, V.Int(P.octaves)), V.Int(P.octmode));
          let lo = 1e9, hi = -1e9;
          for (const n of seq) { lo = Math.min(lo, n); hi = Math.max(hi, n); }
          const cnt = Math.min(seq.length, 24), dx = (w - 12) / Math.max(1, cnt - 1);
          let px = null, py = null;
          for (let i = 0; i < cnt; i++) {
            const x = x0 + 6 + i * dx, y = y0 + h - 5 - (seq[i] - lo) / Math.max(1, hi - lo) * (h - 10);
            if (px != null) V.Ln(px, py, x, y, hex32(0xffffff, 0.15));
            V.Circ(x, y, 1.8, mode === 7 ? V.accentDim : V.accent);
            px = x; py = y;
          }
          if (mode === 7) V.TxtR(x0 + w - 4, y0 + 2, '?', 7, V.text);
        }
      }
      // time: swing and gate
      {
        const x0 = 482, y0 = 166, w = 68, h = 30;
        V.RRect(x0, y0, w, h, 4, 0x0f0f14ff);
        const sp = (w - 8) / 6, sw = V.Val(P.swing) / 100 * 0.5, g = V.Val(P.gatescale) / 100 * 0.8;
        for (let k = 0; k < 6; k++) {
          const x = x0 + 4 + k * sp + (k % 2 === 1 ? sw * sp : 0);
          const bw = Math.min(Math.max(1.5, Math.min(sp * 2, sp * g) - 1), x0 + w - 4 - x);
          V.RRect(x, y0 + 8, bw, h - 14, 1.5, hsv32(V.Hue, 0.5, k % 2 === 1 ? 0.8 : 1, 0.9));
        }
        V.Txt(x0 + 3, y0 + 1, 'GRID', 5.5, V.dim);
      }
      // key: one octave
      {
        const set = ndSet(V.Int(P.scale), V.Int(P.sroot)), root = V.Int(P.sroot), x0 = 566, y0 = 150;
        [0, 2, 4, 5, 7, 9, 11].forEach((pc, i2) => {
          const x = x0 + i2 * 12, inS = !set || set.has(pc);
          V.RRect(x, y0, 11, 44, 2, inS ? hex32(0xffffff, set ? 0.85 : 0.35) : hex32(0xffffff, 0.12));
          if (set && pc === root) V.Circ(x + 5.5, y0 + 38, 2.5, V.accentDim);
        });
        for (const [pc, wi] of [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]]) {
          const x = x0 + wi * 12 + 8, inS = !set || set.has(pc);
          V.RRect(x, y0, 7, 26, 1.5, inS ? (set ? V.accentDim : 0x45454fff) : 0x1b1b22ff);
          if (set && pc === root) V.Circ(x + 3.5, y0 + 21, 2, V.accent);
        }
      }
      // output: step LED, last note
      {
        const x0 = 666, y0 = 160, w = 68, h = 36;
        V.RRect(x0, y0, w, h, 4, 0x0f0f14ff);
        const f = E.flash >= 0 ? Math.max(0, 1 - (V.now - E.flash) / 0.15) : 0;
        V.Circ(x0 + 9, y0 + 9, 3.5, 0x2a2a33ff);
        if (f > 0) V.Circ(x0 + 9, y0 + 9, 3.5, hsv32(V.Hue, 0.5, 1, f));
        V.Txt(x0 + 17, y0 + 5.5, 'LAST NOTE', 6, V.dim);
        const n = V.Disp(6);
        V.TxtC(x0 + w / 2, y0 + 18, n >= 0 ? ndName(n) : '--', 10, n >= 0 ? V.text : V.dim);
      }
    };
    const V = NoteDev(body, api, spec);
    TG['midi-step-engine'] = {
      bars: V.G.anchor(BX, BY, NS * SW, BH), tabs: V.G.anchor(126, 35, 5 * 59 - 3, 20), ruler: V.G.anchor(BX - 2, RY - 3, NS * SW + 4, 9),
      tools: V.G.anchor(126, 180, 220, 14),
    };
    return () => V.G.cleanup();
  }
  reg({
    id: 'midi-step-engine', name: 'Step Engine', vendor: 'FX Devices', group: 'MIDI',
    width: frameW(744, ndScale(744)), height: frameH(216, ndScale(744)),
    blurb: 'An arpeggiator and step sequencer with five lanes: velocity, pitch, gate, chance and ratchet. Each lane has its own length, so short lanes drift against long ones. Shown with the Acid Line preset; press Space to run it.',
    steps: [
      { id: 'draw', text: 'Draw across the <b>Gate</b> bars', why: 'Drag over the bars to paint values. 0 is a rest, above 100% ties into the next step.', target: tg('midi-step-engine', 'bars') },
      { id: 'lane', text: 'Open the <b>Pitch</b> lane tab and draw a few steps', why: 'Each tab shows its own lane. The dots under a tab show its length and playhead.', target: tg('midi-step-engine', 'tabs') },
      { id: 'length', text: 'Drag the white marker on the ruler to shorten a lane', why: 'A 5-step lane against a 16-step one gives a pattern that takes many bars to repeat.', target: tg('midi-step-engine', 'ruler') },
      { id: 'euclid', text: 'In the Gate lane, set the hits with <b>-</b>/<b>+</b> and click <b>Euclid</b>', why: 'It spreads that many hits evenly over the lane length, like 3 in 8.', target: tg('midi-step-engine', 'tools') },
    ],
    notes: [
      { title: 'Lane editing', text: 'Right-click or right-drag a bar to reset it. Wheel over a bar for fine steps. Clear, Random and the arrows work on the lane shown.' },
      { title: 'Sources', text: 'Arp plays the held notes. Pattern plays the lanes from Pattern Root, and Pattern + transp. moves them with the last held key. In this demo the Arp source holds a C minor 7 chord.' },
      { title: 'OUT', text: 'Drag the OUT button onto a MIDI modulator (Velocity, Random, KeyTrack, CC) and it reads the notes the device sends.' },
    ],
    build(body, api) { return buildStepEngine(body, api); },
  });

  /* ---------------------------------------------------------------- Note Echo ("Echo & Strum") */
  const NE_P = { preset: 0, echo_on: 1, echo_rate: 2, echo_ms: 3, repeats: 4, fb: 5, pstep: 6, pmode: 7, scale: 8, root: 9, wrap: 10,
    ldecay: 11, tchange: 12, echance: 13, gate: 14, dry: 15, rcount: 16, rspan: 17, rcurve: 18, rvramp: 19, rchance: 20, rpitch: 21,
    rgate: 22, strum_ms: 23, sdir: 24, scurve: 25, stilt: 26, cwin: 27, fchance: 28, fofs: 29, fvel: 30, fpitch: 31, swing: 32,
    hum_ms: 33, hum_vel: 34, out_ch: 35 };
  const NE_DEFS = sliders(`
preset=0<0,8,1>
echo_on=1<0,1,1>
echo_rate=8<0,18,1>
echo_ms=250<10,4000,1:log>
repeats=3<0,32,1>
fb_pct=70<0,120,0.1>
pstep=0<-24,24,1>
pmode=0<0,1,1>
scale=0<0,18,1>
root=0<0,11,1>
wrap=0<0,48,1>
ldecay=0<0,90,0.1>
tchange=0<-50,50,0.1>
echance=100<0,100,0.1>
gate=50<1,200,0.1>
dry_on=1<0,1,1>
rcount=1<1,16,1>
rspan=7<0,17,1>
rcurve=0<-100,100,0.1>
rvramp=0<-100,100,0.1>
rchance=100<0,100,0.1>
rpitch=0<-12,12,1>
rgate=50<5,100,0.1>
strum_ms=0<0,500,0.1>
sdir=0<0,3,1>
scurve=0<-100,100,0.1>
stilt=0<-100,100,0.1>
cwin=15<0,50,0.1>
fchance=0<0,100,0.1>
fofs=25<5,80,0.1>
fvel=50<1,100,0.1>
fpitch=0<-12,12,1>
swing=0<0,100,0.1>
hum_ms=0<0,50,0.1>
hum_vel=0<0,50,0.1>
out_ch=0<0,16,1>`);
  const NE_PRESETS = {
    0: [[2, 1], [3, 8], [4, 250], [5, 3], [6, 70], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [13, 0], [14, 100], [15, 50], [16, 1], [17, 1], [18, 7],
      [19, 0], [20, 0], [21, 100], [22, 0], [23, 50], [24, 0], [25, 0], [26, 0], [27, 0], [28, 15], [29, 0], [30, 25], [31, 50], [32, 0], [33, 0], [34, 0], [35, 0], [36, 0]],
    1: [[3, 12], [5, 8], [6, 72], [12, 10], [15, 40], [33, 20]],
    2: [[3, 8], [5, 8], [6, 85], [7, 4], [8, 1], [9, 1], [11, 24], [15, 60]],
    3: [[2, 0], [17, 4], [18, 7], [20, 40], [21, 50], [23, 40], [35, 10]],
    4: [[3, 11], [5, 16], [6, 104], [12, 5], [13, -15], [15, 50]],
    5: [[2, 0], [24, 60], [25, 2], [26, 20], [27, -20], [28, 30], [34, 3], [35, 8]],
    6: [[3, 11], [5, 1], [6, 60], [7, 12], [15, 100], [24, 350], [25, 0], [26, 30], [27, 30], [28, 40]],
    7: [[2, 0], [29, 100], [30, 22], [31, 45], [34, 4], [35, 6]],
    8: [[3, 9], [5, 6], [6, 75], [7, 12], [8, 0], [11, 24], [15, 45]],
  };
  // what the demo plays into it, per preset: a note every 2 bars, hats, a chord, or a kick / snare beat
  const NE_INPUT = ['note', 'note', 'note', 'hats', 'note', 'chord', 'chord', 'drums', 'note'];
  const ECHO_DIV = [0.0625, 1 / 12, 0.125, 1 / 6, 0.25, 0.375, 1 / 3, 0.5, 0.75, 2 / 3, 1, 1.5, 4 / 3, 2, 3, 4, 8, 16];
  const neCurve = (p, c) => c === 0 ? p : 1 - Math.pow(1 - p, Math.pow(2, c / 50));
  function buildNoteEcho(body, api) {
    const P = NE_P;
    const ECHO_RATES = ['Free'].concat(ND_RATES), CH_OUT = ['Same'].concat(Array.from({ length: 16 }, (_, i) => String(i + 1)));
    const pct = v => Math.round(v) + '%', spct = v => (v >= 0 ? '+' : '') + Math.round(v) + '%', signed = v => (v >= 0 ? '+' : '') + Math.round(v), ms = v => Math.round(v) + ' ms';
    const E = { kind: 'note', alt: 0, lastIn: -1, nextIn: null };
    const spec = {
      id: 'midi-note-echo', Title: 'Echo & Strum', W: 822, Hue: 0.55, PresetW: 112, defs: NE_DEFS, startPreset: 2, offOnStop: false,
      Presets: ['Init', 'Dub Echo', 'Rising Fifths', 'Trap Hat Roll', 'Snare Build-Up', 'Guitar Strum', 'Harp Gliss', 'Flam Drums', 'Ping Octaves'],
      applyPreset: ndPresetFn(NE_PRESETS),
      onPreset: (V, i) => { E.kind = NE_INPUT[i]; E.nextIn = null; },
      onParam: (V, p) => {
        if (p === P.pstep && V.Int(P.pstep) !== 0) api.check('pstep');
        if (p === P.rcount && V.Int(P.rcount) >= 3) api.check('ratchet');
        if (p === P.strum_ms && V.Val(P.strum_ms) > 0) api.check('strum');
      },
      Panels: [
        { title: 'ECHO', x: 4, y: 22, w: 330, h: 180, enable: P.echo_on }, { title: 'RATCHET', x: 338, y: 22, w: 140, h: 180 },
        { title: 'STRUM', x: 482, y: 22, w: 140, h: 180 }, { title: 'FLAM', x: 626, y: 22, w: 94, h: 180 }, { title: 'GROOVE / OUT', x: 724, y: 22, w: 94, h: 180 },
      ],
      Items: [
        { t: 'knob', p: P.repeats, x: 28, y: 52, r: 10, label: 'REPEATS', fmt: '%.0f' },
        { t: 'knob', p: P.pstep, x: 72, y: 52, r: 10, label: 'P STEP', bipolar: true, fmt: signed, tip: 'Every repeat moves this much further (semitones or scale steps)' },
        { t: 'knob', p: P.tchange, x: 116, y: 52, r: 10, label: 'TIME CHG', bipolar: true, fmt: spct, tip: '- = repeats speed up, + = they slow down, a little more every time' },
        { t: 'knob', p: P.fb, x: 28, y: 98, r: 10, label: 'FEEDBACK', fmt: pct, tip: 'Velocity multiplier per repeat (over 100% = echoes get louder)' },
        { t: 'knob', p: P.wrap, x: 72, y: 98, r: 10, label: 'WRAP', fmt: v => v < 0.5 ? 'Off' : Math.round(v) + ' st', tip: 'Fold the repeats back so they stay within N semitones of the played note' },
        { t: 'knob', p: P.ldecay, x: 116, y: 98, r: 10, label: 'LEN DECAY', fmt: pct, tip: 'Every repeat is this much shorter' },
        { t: 'knob', p: P.gate, x: 28, y: 144, r: 10, label: 'GATE', fmt: pct, tip: 'A repeat\'s length as a % of its echo time' },
        { t: 'knob', p: P.echance, x: 72, y: 144, r: 10, label: 'CHANCE', fmt: pct },
        { t: 'knob', p: P.echo_ms, x: 116, y: 144, r: 10, label: 'FREE TIME', fmt: ms, when: V => V.Int(P.echo_rate) === 0 },
        { t: 'enum', p: P.echo_rate, x: 144, y: 42, w: 50, label: 'TIME', list: ECHO_RATES },
        { t: 'toggle', p: P.dry, x: 198, y: 42, w: 40, label: 'DRY', tip: 'Play the original note (Off = only the echoes are heard)' },
        { t: 'enum', p: P.pmode, x: 242, y: 42, w: 60, label: 'STEP IN', list: ['Semitones', 'Scale Steps'] },
        { t: 'enum', p: P.scale, x: 242, y: 66, w: 60, list: ND_SCALES, when: V => V.Int(P.pmode) === 1 },
        { t: 'enum', p: P.root, x: 306, y: 66, w: 22, list: ND_ROOTS, when: V => V.Int(P.pmode) === 1 },
        { t: 'knob', p: P.rcount, x: 362, y: 52, r: 10, label: 'COUNT', fmt: v => v < 1.5 ? 'Off' : String(Math.round(v)), tip: 'The played hit becomes a burst of this many hits (1 = off)' },
        { t: 'knob', p: P.rcurve, x: 406, y: 52, r: 10, label: 'CURVE', bipolar: true, fmt: signed, tip: '+ = the hits speed up, - = they slow down' },
        { t: 'knob', p: P.rvramp, x: 450, y: 52, r: 10, label: 'VEL RAMP', bipolar: true, fmt: spct, tip: '+ = crescendo, - = fade out' },
        { t: 'knob', p: P.rchance, x: 362, y: 98, r: 10, label: 'CHANCE', fmt: pct },
        { t: 'knob', p: P.rpitch, x: 406, y: 98, r: 10, label: 'PITCH', bipolar: true, fmt: signed },
        { t: 'knob', p: P.rgate, x: 450, y: 98, r: 10, label: 'GATE', fmt: pct },
        { t: 'enum', p: P.rspan, x: 344, y: 134, w: 48, label: 'SPAN', list: ND_RATES },
        { t: 'knob', p: P.strum_ms, x: 506, y: 52, r: 10, label: 'TIME', fmt: v => v <= 0 ? 'Off' : Math.round(v) + ' ms', tip: 'Spread the notes of a chord out in time (0 = off)' },
        { t: 'knob', p: P.scurve, x: 550, y: 52, r: 10, label: 'CURVE', bipolar: true, fmt: signed },
        { t: 'knob', p: P.stilt, x: 594, y: 52, r: 10, label: 'VEL TILT', bipolar: true, fmt: spct, tip: '+ = later notes louder, - = later notes softer' },
        { t: 'knob', p: P.cwin, x: 506, y: 98, r: 10, label: 'WINDOW', fmt: '%.0f ms', tip: 'Notes that arrive within this time count as one chord (adds this much latency)' },
        { t: 'enum', p: P.sdir, x: 532, y: 90, w: 84, label: 'DIRECTION', list: ['Up', 'Down', 'Alternate', 'Random'] },
        { t: 'knob', p: P.fchance, x: 650, y: 52, r: 10, label: 'CHANCE', fmt: pct },
        { t: 'knob', p: P.fofs, x: 694, y: 52, r: 10, label: 'OFFSET', fmt: ms, tip: 'The main note moves this much later than the grace note' },
        { t: 'knob', p: P.fvel, x: 650, y: 98, r: 10, label: 'VEL', fmt: pct },
        { t: 'knob', p: P.fpitch, x: 694, y: 98, r: 10, label: 'PITCH', bipolar: true, fmt: signed },
        { t: 'knob', p: P.swing, x: 748, y: 52, r: 10, label: 'SWING', fmt: pct, tip: 'Pushes every other echo late (100% = half an echo time)' },
        { t: 'knob', p: P.hum_ms, x: 792, y: 52, r: 10, label: 'HUM TIME', fmt: ms },
        { t: 'knob', p: P.hum_vel, x: 748, y: 98, r: 10, label: 'HUM VEL', fmt: pct },
        { t: 'enum', p: P.out_ch, x: 772, y: 90, w: 40, label: 'OUT CH', list: CH_OUT },
      ],
    };
    // echo events of one hit (same math as the timeline): [{ t ms, len ms, vel, po, k }]
    function echoEvents(V, bpm, vel0) {
      const rate = V.Int(P.echo_rate);
      let iv = rate === 0 ? V.Val(P.echo_ms) : ECHO_DIV[rate - 1] * 60000 / bpm;
      iv = Math.max(1, iv);
      const on = V.Int(P.echo_on) === 1, cnt = on ? V.Int(P.repeats) : 0;
      const fb = V.Val(P.fb) / 100, gate = V.Val(P.gate) / 100, ldec = V.Val(P.ldecay) / 100, tch = V.Val(P.tchange) / 100, swing = V.Val(P.swing) / 100;
      const pstep = V.Int(P.pstep), wrap = V.Int(P.wrap), smode = V.Int(P.pmode) === 1;
      const set = smode ? ndSet(V.Int(P.scale), V.Int(P.root)) : null;
      let base = 60 + (set ? V.Int(P.root) : 0);
      if (set) base = ndQuant(set, base, 0);
      const EchoPitch = k => {
        const st = pstep * k;
        let p = smode ? (st === 0 ? base : ndStep(set, base, st)) : base + st;
        if (wrap > 0) {
          let off = p - base;
          if (off > 0) off = off % wrap; else if (off < 0) off = -((-off) % wrap);
          p = base + off;
          if (smode && set) p = ndQuant(set, p, 0);
        }
        return p - base;
      };
      const ev = [{ t: 0, len: iv * gate, vel: vel0, po: 0, k: 0, dry: true }];
      let te = 0, vk = vel0, lenf = 1, ivk = iv;
      for (let k = 1; k <= cnt; k++) {
        te += ivk; vk *= fb;
        if (vk < 0.5) break;
        const sw = k % 2 === 1 ? swing * ivk * 0.5 : 0;
        ev.push({ t: te + sw, len: Math.max(1, ivk * gate * lenf), vel: Math.min(127, vk), po: EchoPitch(k), k });
        lenf *= 1 - ldec;
        ivk = Math.max(1, ivk * (1 + tch));
      }
      return { ev, iv, on };
    }
    // one input note (or chord) through Strum > Ratchet > Flam > Echo > humanize
    function input(V, chord, vel, bpm) {
      const msB = m => m / 1000 * bpm / 60;
      const t0 = V.beat;
      E.lastIn = chord[chord.length - 1];
      let order = chord.slice().sort((a, b) => a - b);
      const st = chord.length > 1 ? V.Val(P.strum_ms) : 0, dir = V.Int(P.sdir);
      if (dir === 1) order.reverse();
      else if (dir === 2) { if (E.alt++ % 2) order.reverse(); }
      else if (dir === 3) order.sort(() => Math.random() - 0.5);
      const hum = () => (Math.random() * 2 - 1) * V.Val(P.hum_ms), humV = v => v * (1 + (Math.random() * 2 - 1) * V.Val(P.hum_vel) / 100);
      const { ev } = echoEvents(V, bpm, 100);
      const dryOn = V.Int(P.dry) === 1, ech = V.Val(P.echance);
      order.forEach((n, i) => {
        const p = order.length > 1 ? i / (order.length - 1) : 0;
        const tOff = st > 0 ? neCurve(p, V.Val(P.scurve)) * st : 0;
        const v = vel * (1 + V.Val(P.stilt) / 100 * (p - 0.5));
        for (const e of ev) {
          if (e.dry && !dryOn) continue;
          if (!e.dry && !(ech >= 100 || Math.random() * 100 < ech)) continue;
          const tb = t0 + msB(tOff + e.t + hum()), vv = Math.max(1, Math.min(127, humV(v * e.vel / 100))), nn = n + e.po;
          if (e.dry) {
            // ratchet: the played hit becomes a burst
            const rc = V.Int(P.rcount);
            if (rc > 1 && (V.Val(P.rchance) >= 100 || Math.random() * 100 < V.Val(P.rchance))) {
              const span = ND_DIV[V.Int(P.rspan)], c = V.Val(P.rcurve), rr = V.Val(P.rvramp) / 100;
              for (let h = 0; h < rc; h++) {
                const a = neCurve(h / rc, c), b = neCurve((h + 1) / rc, c), q = h / (rc - 1);
                const vi = rr >= 0 ? 1 - rr * (1 - q) : 1 + rr * q;
                pushN(V, nn + h * V.Int(P.rpitch), vv * vi, tb + a * span, (b - a) * span * V.Val(P.rgate) / 100, 0);
              }
            } else {
              const fc = V.Val(P.fchance);
              if (fc > 0 && (fc >= 100 || Math.random() * 100 < fc)) {
                pushN(V, nn + V.Int(P.fpitch), vv * V.Val(P.fvel) / 100, tb, msB(Math.min(60, V.Val(P.fofs))), 0);
                pushN(V, nn, vv, tb + msB(V.Val(P.fofs)), msB(e.len), 0);
              } else pushN(V, nn, vv, tb, msB(e.len), 0);
            }
          } else pushN(V, nn, vv, tb, msB(e.len), e.k);
        }
      });
    }
    function pushN(V, n, vel, b0, len, k) { if (V.notes.length < 400) V.notes.push({ n: ndClampN(n), vel, b0, b1: b0 + Math.max(0.02, len), k }); }
    spec.onKey = (V, n) => { input(V, [n], 100, V.clock ? V.clock.bpm : 120); api.check('key'); };
    spec.tick = (V, dt, clock) => {
      // the demo's input, on the transport
      if (clock.playing) {
        const b = V.beat;
        const per = { note: 8, hats: 0.5, chord: 4, drums: 1 }[E.kind];
        if (E.nextIn == null || E.nextIn > b + per) E.nextIn = b;
        while (b >= E.nextIn) {
          const nb = E.nextIn;
          if (E.kind === 'note') input(V, [Math.floor(nb / 8) % 2 ? 67 : 60], 100, clock.bpm);
          else if (E.kind === 'hats') input(V, [42], Math.floor(nb * 2) % 2 ? 70 : 100, clock.bpm);
          else if (E.kind === 'chord') input(V, Math.floor(nb / 4) % 2 ? [45, 52, 57, 60, 64] : [48, 52, 55, 60, 64], 100, clock.bpm);
          else input(V, [Math.round(nb) % 2 ? 38 : 36], 105, clock.bpm);
          E.nextIn += per;
        }
      } else E.nextIn = null;
      let q = 0, lastK = 0;
      for (const N of V.notes) { if (N.b0 > V.beat) q++; else if (N.k > 0 && N.b1 > V.beat) lastK = Math.max(lastK, N.k); }
      V.disp[0] = q + (lastK > 0 ? 0 : 0); V.disp[1] = E.lastIn; V.disp[2] = lastK; V.disp[3] = lastK > 0 ? 1 : 0;
    };
    spec.Draw = V => {
      const well = 0x0f0f14ff, tempo = V.clock ? V.clock.bpm : 120;
      const BeatsToMs = b => b * 60000 / tempo;
      // echo timeline
      {
        let x0 = 142, y0 = 90, w = 186, h = 106;
        if (V.Int(P.pmode) !== 1) { y0 = 66; h = 130; }
        V.RRect(x0, y0, w, h, 4, well);
        const { ev, iv, on } = echoEvents(V, tempo, 100);
        const chance = V.Val(P.echance) / 100;
        let tEnd = 0, pmin = 0, pmax = 0;
        for (const e of ev) { tEnd = Math.max(tEnd, e.t + e.len); pmin = Math.min(pmin, e.po); pmax = Math.max(pmax, e.po); }
        tEnd = Math.max(tEnd, iv * 2);
        const barMax = Math.min(34, h * 0.36), top = y0 + 12 + barMax, bot = y0 + h - 6, span = Math.max(12, pmax - pmin);
        const PY = po => bot - (po - pmin) / span * (bot - top), TX = t => x0 + 8 + t / tEnd * (w - 16);
        const gridN = Math.floor(tEnd / iv);
        if (gridN <= 24) for (let i = 1; i <= gridN; i++) { const gx = TX(i * iv); V.Ln(gx, y0 + 3, gx, y0 + h - 3, hex32(0xffffff, 0.04)); }
        V.Ln(x0 + 4, PY(0), x0 + w - 4, PY(0), hex32(0xffffff, 0.08));
        if (pmax !== pmin) { V.Txt(x0 + 3, PY(pmax) - 8, (pmax >= 0 ? '+' : '') + pmax, 6, V.dim); if (pmin < 0) V.Txt(x0 + 3, PY(pmin) - 8, String(pmin), 6, V.dim); }
        const lastK = V.Disp(3) > 0 ? Math.round(V.Disp(2)) : -1;
        const dryOn = V.Int(P.dry) === 1;
        for (const e of ev) {
          const bx = TX(e.t), by = PY(e.po), bh = Math.max(2, e.vel / 127 * barMax);
          let a = e.dry ? (dryOn ? 1 : 0.25) : 0.35 + 0.65 * chance;
          if (!on && !e.dry) a = 0.2;
          const col = e.dry ? hsv32(V.Hue, 0.15, 1, a) : hsv32(V.Hue + e.k * 0.012, 0.55, 1, a * (on ? 1 : 0.4));
          V.RRect(bx, by - 1, Math.max(2, TX(e.t + e.len) - bx), 2, 1, hex32(col >>> 8, a * 0.35));
          V.RRect(bx - 1.5, by - bh, 3, bh, 1.5, col);
          if (e.k === lastK && !e.dry) V.Ring(bx, by - bh, 3.5, 0xffffffcc);
        }
        V.TxtR(x0 + w - 4, y0 + 3, on ? (ev.length - 1) + ' rep  ' + Math.round(iv) + ' ms' : 'ECHO OFF', 6, V.dim);
      }
      // ratchet burst
      {
        const x0 = 344, y0 = 152, w = 128, h = 44;
        V.RRect(x0, y0, w, h, 4, well);
        const cnt = V.Int(P.rcount), c = V.Val(P.rcurve), rr = V.Val(P.rvramp) / 100, g = V.Val(P.rgate) / 100, ch = V.Val(P.rchance) / 100;
        const span = ND_DIV[V.Int(P.rspan)] || 0.5;
        V.TxtR(x0 + w, 136, cnt > 1 ? cnt + ' hits' : 'off', 7, cnt > 1 ? V.text : V.dim);
        const TX = p => x0 + 6 + p * (w - 12), bmax = h - 10, rp = V.Int(P.rpitch);
        for (let i = 0; i < cnt; i++) {
          const t0 = neCurve(i / cnt, c), t1 = neCurve((i + 1) / cnt, c), p = cnt > 1 ? i / (cnt - 1) : 1;
          const vi = rr >= 0 ? 1 - rr * (1 - p) : 1 + rr * p, bh = Math.max(2, vi * bmax), bx = TX(t0);
          const lift = cnt > 1 && rp !== 0 ? (rp > 0 ? 1 : -1) * Math.min(6, i * 1.5) : 0;
          const by = y0 + h - 4 - Math.max(0, lift);
          const col = cnt > 1 ? hsv32(V.Hue + 0.05 + p * 0.06, 0.55, 1, 0.35 + 0.65 * ch) : hsv32(V.Hue, 0.15, 1, 0.8);
          V.RRect(bx, by - 1, Math.max(2, (TX(t1) - bx) * g), 2, 1, hex32(col >>> 8, 0.35));
          V.RRect(bx - 1.5, by - bh - Math.min(0, lift), 3, bh, 1.5, col);
        }
        V.Ln(TX(1), y0 + 3, TX(1), y0 + h - 3, hex32(0xffffff, 0.12));
        V.Txt(398, 137, Math.round(BeatsToMs(span)) + ' ms', 6.5, V.dim);
      }
      // strum fan
      {
        const x0 = 488, y0 = 120, w = 128, h = 76;
        V.RRect(x0, y0, w, h, 4, well);
        const st = V.Val(P.strum_ms), c = V.Val(P.scurve), tilt = V.Val(P.stilt) / 100, dir = V.Int(P.sdir), n = 5;
        const px = x0 + 8, py = y0 + h / 2;
        const Order = d => d === 1 ? [5, 4, 3, 2, 1] : d === 3 ? [3, 1, 5, 2, 4] : [1, 2, 3, 4, 5];
        const Fan = (order, alpha, hu) => {
          for (let i = 0; i < n; i++) {
            const str = order[i], p = i / (n - 1);
            const tx = x0 + 22 + (st > 0 ? neCurve(p, c) * st / 500 * (w - 34) : 0);
            const sy = y0 + h - 10 - (str - 1) / (n - 1) * (h - 20);
            const vel = 1 + tilt * (p - 0.5);
            V.Ln(px, py, tx, sy, hsv32(hu, 0.4, 1, alpha * 0.35), 1);
            V.Circ(tx, sy, 1.6 + 2 * vel, hsv32(hu + p * 0.05, 0.55, 1, alpha));
          }
        };
        for (let i = 1; i <= n; i++) { const sy = y0 + h - 10 - (i - 1) / (n - 1) * (h - 20); V.Ln(x0 + 20, sy, x0 + w - 6, sy, hex32(0xffffff, 0.05)); }
        if (dir === 2) { Fan(Order(1), 0.35, V.Hue + 0.08); Fan(Order(0), 1, V.Hue); } else Fan(Order(dir), 1, V.Hue);
        V.Circ(px, py, 2, V.dim);
        V.TxtR(x0 + w - 4, y0 + 3, st > 0 ? Math.round(st) + ' ms' : 'off', 6, st > 0 ? V.text : V.dim);
        V.TxtR(x0 + w - 4, y0 + h - 9, ['up', 'down', 'up / down', 'random'][dir], 6, V.dim);
      }
      // flam
      {
        const x0 = 632, y0 = 134, w = 82, h = 62;
        V.Txt(x0, y0 - 9, 'GRACE > HIT', 6.5, V.dim);
        V.RRect(x0, y0, w, h, 4, well);
        const ch = V.Val(P.fchance) / 100, ofs = V.Val(P.fofs), fv = V.Val(P.fvel) / 100, fp = V.Int(P.fpitch);
        const bot = y0 + h - 8, bmax = h - 22, gx = x0 + 10, mx = gx + ofs / 80 * (w - 22), gy = bot - fp / 12 * 6;
        V.RRect(mx - 2, bot - bmax, 4, bmax, 2, hsv32(V.Hue, 0.15, 1, 1));
        V.RRect(gx - 1.5, gy - Math.max(2, bmax * fv), 3, Math.max(2, bmax * fv), 1.5, hsv32(V.Hue + 0.06, 0.55, 1, ch > 0 ? 0.35 + 0.65 * ch : 0.15));
        V.Ln(gx, bot + 3, mx, bot + 3, hex32(0xffffff, 0.2));
        V.TxtR(x0 + w - 4, y0 + 3, ch > 0 ? pct(ch * 100) : 'off', 6, ch > 0 ? V.text : V.dim);
      }
      // groove / output
      {
        const x0 = 730, y0 = 134, w = 82;
        V.Txt(x0, y0 - 9, 'SWING', 6.5, V.dim);
        V.RRect(x0, y0, w, 26, 4, well);
        const sw = V.Val(P.swing) / 100;
        for (let i = 0; i < 4; i++) {
          const t = i + (i % 2 === 1 ? sw * 0.5 : 0), bx = x0 + 8 + t / 4 * (w - 16);
          V.RRect(bx - 1.5, y0 + (i % 2 === 0 ? 5 : 9), 3, i % 2 === 0 ? 16 : 12, 1.5, i % 2 === 1 ? V.accent : hsv32(V.Hue, 0.15, 1, 1));
        }
        const last = V.Disp(1), q = Math.round(V.Disp(0));
        V.Txt(x0, y0 + 34, 'IN', 6.5, V.dim);
        V.TxtR(x0 + w, y0 + 34, last > 0 ? ndName(last) : '-', 6.5, V.text);
        V.Txt(x0, y0 + 46, 'QUEUED', 6.5, V.dim);
        V.TxtR(x0 + w, y0 + 46, String(Math.max(0, q)), 6.5, q > 0 ? V.accent : V.text);
      }
    };
    const V = NoteDev(body, api, spec);
    TG['midi-note-echo'] = { preset: V.G.anchor(14 + V.TW('ECHO & STRUM', 10) + 13, 3, 112, 14), pstep: V.G.anchor(58, 38, 28, 28), ratchet: V.G.anchor(348, 38, 28, 28), strum: V.G.anchor(492, 38, 28, 28) };
    return () => V.G.cleanup();
  }
  reg({
    id: 'midi-note-echo', name: 'Echo & Strum', vendor: 'FX Devices', group: 'MIDI',
    width: frameW(822, ndScale(822)), height: frameH(216, ndScale(822)),
    blurb: 'A MIDI echo: every note you play comes back as repeats that can climb in pitch, speed up or fade. It also ratchets, strums chords and adds flams. Here it starts on Rising Fifths; press Space and the demo plays a note every two bars into it.',
    steps: [
      { id: 'pstep', text: 'Turn <b>P Step</b> in the Echo panel', why: 'Each repeat moves that many semitones further. The timeline shows the pitch of every repeat.', target: tg('midi-note-echo', 'pstep') },
      { id: 'preset', text: 'Pick another preset, like <b>Snare Build-Up</b>', why: 'Click the preset name for the list, or use the arrows. A preset sets every knob.', target: tg('midi-note-echo', 'preset') },
      { id: 'ratchet', text: 'Turn the Ratchet <b>Count</b> to 3 or more', why: 'The played hit becomes a burst of hits over the Span. The small view below draws the burst.', target: tg('midi-note-echo', 'ratchet') },
      { id: 'strum', text: 'Turn the Strum <b>Time</b> up, then pick <b>Guitar Strum</b>', why: 'Chord notes that arrive together get spread out in time, up, down or alternating.', target: tg('midi-note-echo', 'strum') },
    ],
    notes: [
      { title: 'Order', text: 'The panels follow the JSFX: Echo, then Ratchet, Strum, Flam, and Groove / Out (swing and humanize).' },
      { title: 'Demo input', text: 'With the transport running, the demo plays notes in: single notes, hats, chords or a kick and snare, picked by the preset. Click the keyboard strip to play a note yourself.' },
    ],
    build(body, api) { return buildNoteEcho(body, api); },
  });

  /* ---------------------------------------------------------------- Note Shaper */
  const NS_P = { preset: 0, lokey: 1, hikey: 2, lovel: 3, hivel: 4, chan_in: 5, nchance: 6, filtered: 7, transpose: 8, scale: 9, root: 10, qmode: 11,
    keych: 12, voices: 13, imode: 14, iv2: 15, iv3: 16, iv4: 17, iv5: 18, iv6: 19, vchance: 20, vvel: 21, playroot: 22, inversion: 23, spread: 24,
    rlo: 25, rhi: 26, vcurve: 27, vmin: 28, vmax: 29, vfixed: 30, vrand: 31, lmode: 32, length: 33, humanize: 34, mono: 35, legato: 36, latch: 37, chan_out: 38 };
  const NS_DEFS = sliders(`
preset=0<0,9,1>
lokey=0<0,127,1>
hikey=127<0,127,1>
lovel=1<1,127,1>
hivel=127<1,127,1>
chan_in=0<0,16,1>
nchance=100<0,100,0.1>
filtered=0<0,1,1>
transpose=0<-48,48,1>
scale=0<0,18,1>
root=0<0,11,1>
qmode=0<0,3,1>
keych=0<0,16,1>
voices=1<1,6,1>
imode=0<0,1,1>
iv2=4<-24,24,1>
iv3=7<-24,24,1>
iv4=12<-24,24,1>
iv5=16<-24,24,1>
iv6=19<-24,24,1>
vchance=100<0,100,0.1>
vvel=100<0,150,0.1>
playroot=1<0,1,1>
inversion=0<-3,3,1>
spread=0<0,3,0.01>
rlo=0<0,127,1>
rhi=127<0,127,1>
vcurve=0<-100,100,0.1>
vmin=1<1,127,1>
vmax=127<1,127,1>
vfixed=0<0,127,1>
vrand=0<0,100,0.1>
lmode=0<0,2,1>
length=7<0,17,1>
humanize=0<0,40,0.1>
mono=0<0,3,1>
legato=0<0,1,1>
latch=0<0,2,1>
chan_out=0<0,16,1>`);
  const NS_PRESETS = {
    0: [[2, 0], [3, 127], [4, 1], [5, 127], [6, 0], [7, 100], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [13, 0], [14, 1], [15, 0], [16, 4], [17, 7], [18, 12], [19, 16], [20, 19], [21, 100], [22, 100], [23, 1]],
    1: [[10, 2], [14, 4], [15, 1], [16, 2], [17, 4], [18, 6], [25, 0.6], [26, 40], [27, 88], [28, -30], [29, 50], [30, 100], [22, 85]],
    2: [[14, 2], [16, 12], [22, 80]], 3: [[14, 3], [16, 7], [17, 12], [22, 90]], 4: [[10, 1], [12, 0]],
    5: [[7, 94], [32, 22], [35, 18], [28, -15]], 6: [[28, 0], [29, 90], [30, 105]], 7: [[36, 2], [37, 1], [26, 24], [27, 55], [23, 1]],
    8: [[38, 1], [14, 3], [16, -12], [17, 7], [22, 70]], 9: [[10, 1], [14, 3], [15, 1], [16, 2], [17, 4]],
  };
  function nsChord(V, P, inNote) {
    const set = ndSet(V.Int(P.scale), V.Int(P.root));
    let base = ndQuant(set, inNote + V.Int(P.transpose), 0);
    const nv = V.Int(P.voices), steps = V.Int(P.imode) === 1;
    const notes = [];
    if (V.Int(P.playroot) === 1 || nv <= 1) notes.push(base);
    for (let i = 2; i <= nv; i++) { const iv = V.Int(P.iv2 + i - 2); notes.push(steps ? ndStep(set, base, iv) : ndQuant(set, base + iv, 0)); }
    notes.sort((a, b) => a - b);
    let inv = V.Int(P.inversion);
    while (inv > 0 && notes.length) { notes[0] += 12; notes.sort((a, b) => a - b); inv--; }
    while (inv < 0 && notes.length) { notes[notes.length - 1] -= 12; notes.sort((a, b) => a - b); inv++; }
    const sp = V.Val(P.spread);
    if (sp > 0 && notes.length > 1) for (let i = 1; i < notes.length; i++) notes[i] += 12 * Math.round(sp * i / (notes.length - 1));
    return notes;
  }
  function buildNoteShaper(body, api) {
    const P = NS_P;
    const note = ndName, pct = v => Math.round(v) + '%', signed = v => (v >= 0 ? '+' : '') + Math.round(v);
    const CH = ['Omni'].concat(Array.from({ length: 16 }, (_, i) => String(i + 1))), CH_OUT = ['Same'].concat(CH.slice(1)), KF = ['Off'].concat(CH.slice(1).map(c => 'Ch ' + c));
    const E = { next: null, mel: [60, 62, 64, 65, 67, 65, 64, 62] };
    const spec = {
      id: 'midi-note-shaper', Title: 'Note Shaper', W: 700, Hue: 0.08, PresetW: 112, defs: NS_DEFS, startPreset: 1, offOnStop: false,
      Presets: ['Init', 'Minor 7 Pads', 'Octave Doubler', 'Power Chords', 'Keep It In Key', 'Lo-fi Humanize', 'Velocity Flattener', 'Strict Bass Lane', 'Drone Latch', 'Diatonic Triads'],
      applyPreset: ndPresetFn(NS_PRESETS),
      onParam: (V, p) => { if (p === P.voices) api.check('voices'); if (p === P.scale) api.check('scale'); },
      Panels: [
        { title: 'FILTER', x: 4, y: 22, w: 94, h: 180 }, { title: 'PITCH', x: 102, y: 22, w: 100, h: 180 }, { title: 'CHORD', x: 206, y: 22, w: 176, h: 180 },
        { title: 'VOICING', x: 386, y: 22, w: 94, h: 180 }, { title: 'VELOCITY', x: 484, y: 22, w: 94, h: 180 }, { title: 'PLAY', x: 582, y: 22, w: 114, h: 180 },
      ],
      Items: [
        { t: 'knob', p: P.lokey, x: 28, y: 52, r: 10, label: 'LOW KEY', fmt: note }, { t: 'knob', p: P.hikey, x: 74, y: 52, r: 10, label: 'HIGH KEY', fmt: note },
        { t: 'knob', p: P.lovel, x: 28, y: 98, r: 10, label: 'LOW VEL', fmt: '%.0f' }, { t: 'knob', p: P.hivel, x: 74, y: 98, r: 10, label: 'HIGH VEL', fmt: '%.0f' },
        { t: 'knob', p: P.nchance, x: 28, y: 144, r: 10, label: 'CHANCE', fmt: pct, tip: 'Chance that a note gets through' },
        { t: 'enum', p: P.chan_in, x: 54, y: 136, w: 40, label: 'IN CH', list: CH },
        { t: 'enum', p: P.filtered, x: 54, y: 162, w: 40, label: 'OUTSIDE', list: ['Block', 'Pass'], tip: 'Notes outside the filter: blocked, or passed through untouched' },
        { t: 'knob', p: P.transpose, x: 126, y: 52, r: 10, label: 'TRANSP', bipolar: true, fmt: signed },
        { t: 'enum', p: P.scale, x: 148, y: 42, w: 50, label: 'SCALE', list: ND_SCALES }, { t: 'enum', p: P.root, x: 148, y: 68, w: 50, label: 'ROOT', list: ND_ROOTS },
        { t: 'enum', p: P.qmode, x: 108, y: 94, w: 88, label: 'SNAP', list: ['Nearest', 'Up', 'Down', 'Drop off-key'] },
        { t: 'enum', p: P.keych, x: 108, y: 122, w: 88, label: 'KEY FOLLOW', list: KF, tip: 'Notes on this channel aren\'t played: the lowest one held sets the root' },
        { t: 'knob', p: P.voices, x: 228, y: 52, r: 10, label: 'VOICES', fmt: '%.0f' },
        { t: 'enum', p: P.imode, x: 254, y: 42, w: 58, label: 'INTERVALS', list: ['Semitones', 'Scale steps'] },
        { t: 'toggle', p: P.playroot, x: 318, y: 42, w: 58, label: 'PLAYED NOTE', text: ['Muted', 'Played'] },
        { t: 'knob', p: P.iv2, x: 226, y: 100, r: 9, label: 'V2', bipolar: true, fmt: signed }, { t: 'knob', p: P.iv3, x: 259, y: 100, r: 9, label: 'V3', bipolar: true, fmt: signed },
        { t: 'knob', p: P.iv4, x: 292, y: 100, r: 9, label: 'V4', bipolar: true, fmt: signed }, { t: 'knob', p: P.iv5, x: 325, y: 100, r: 9, label: 'V5', bipolar: true, fmt: signed },
        { t: 'knob', p: P.iv6, x: 358, y: 100, r: 9, label: 'V6', bipolar: true, fmt: signed },
        { t: 'knob', p: P.vchance, x: 228, y: 146, r: 10, label: 'V CHANCE', fmt: pct }, { t: 'knob', p: P.vvel, x: 270, y: 146, r: 10, label: 'V VEL', fmt: pct },
        { t: 'knob', p: P.inversion, x: 410, y: 52, r: 10, label: 'INVERT', bipolar: true, fmt: signed }, { t: 'knob', p: P.spread, x: 456, y: 52, r: 10, label: 'SPREAD', fmt: '%.2f oct' },
        { t: 'knob', p: P.rlo, x: 410, y: 98, r: 10, label: 'RANGE LO', fmt: note }, { t: 'knob', p: P.rhi, x: 456, y: 98, r: 10, label: 'RANGE HI', fmt: note },
        { t: 'knob', p: P.vcurve, x: 506, y: 52, r: 10, label: 'CURVE', bipolar: true, fmt: signed }, { t: 'knob', p: P.vrand, x: 552, y: 52, r: 10, label: 'RANDOM', fmt: pct },
        { t: 'knob', p: P.vmin, x: 506, y: 98, r: 10, label: 'MIN', fmt: '%.0f' }, { t: 'knob', p: P.vmax, x: 552, y: 98, r: 10, label: 'MAX', fmt: '%.0f' },
        { t: 'knob', p: P.vfixed, x: 506, y: 144, r: 10, label: 'FIXED', fmt: v => v < 0.5 ? 'Off' : String(Math.round(v)) },
        { t: 'enum', p: P.lmode, x: 588, y: 46, w: 50, label: 'LENGTH', list: ['As played', 'Fixed', '+ Tail'] },
        { t: 'enum', p: P.length, x: 642, y: 46, w: 50, label: 'TIME', list: ND_RATES },
        { t: 'knob', p: P.humanize, x: 606, y: 96, r: 10, label: 'HUMANIZE', fmt: '%.1f ms' },
        { t: 'enum', p: P.mono, x: 634, y: 80, w: 58, label: 'MONO', list: ['Off', 'Last', 'Lowest', 'Highest'] },
        { t: 'toggle', p: P.legato, x: 634, y: 106, w: 58, label: 'LEGATO' },
        { t: 'enum', p: P.latch, x: 588, y: 140, w: 50, label: 'LATCH', list: ['Off', 'Hold', 'Toggle'], tip: 'Hold: notes keep sounding until the next chord\nToggle: press a key again to stop it' },
        { t: 'enum', p: P.chan_out, x: 642, y: 140, w: 50, label: 'OUT CH', list: CH_OUT },
      ],
    };
    // a light model of the JSFX: filter, transpose + snap, chord, inversion / spread, range, velocity curve, length
    function play(V, n, vel, lenB) {
      const lo = Math.min(V.Int(P.lokey), V.Int(P.hikey)), hi = Math.max(V.Int(P.lokey), V.Int(P.hikey));
      const inside = n >= lo && n <= hi && vel >= V.Int(P.lovel) && vel <= V.Int(P.hivel);
      if (!inside) { if (V.Int(P.filtered) === 1) V.play(n, vel, V.beat, lenB); return; }
      if (!(V.Val(P.nchance) >= 100 || Math.random() * 100 < V.Val(P.nchance))) return;
      const set = ndSet(V.Int(P.scale), V.Int(P.root));
      if (set && V.Int(P.qmode) === 3 && !set.has(pc12(n + V.Int(P.transpose)))) return;
      let notes = nsChord(V, P, n);
      const rlo = Math.min(V.Int(P.rlo), V.Int(P.rhi)), rhi = Math.max(V.Int(P.rlo), V.Int(P.rhi));
      notes = notes.map(x => { while (x < rlo && x + 12 <= 127) x += 12; while (x > rhi && x - 12 >= 0) x -= 12; return x; });
      const mono = V.Int(P.mono);
      if (mono === 2) notes = [Math.min(...notes)]; else if (mono === 3) notes = [Math.max(...notes)]; else if (mono === 1) notes = [notes[notes.length - 1]];
      const c = V.Val(P.vcurve) / 100, mn = V.Val(P.vmin), mx = V.Val(P.vmax), fixed = V.Val(P.vfixed);
      let v = fixed >= 0.5 ? fixed : mn + (mx - mn) * Math.pow(vel / 127, Math.pow(2, -2 * c));
      v *= 1 + (Math.random() * 2 - 1) * V.Val(P.vrand) / 100;
      const L = V.Int(P.lmode) === 1 ? ND_DIV[V.Int(P.length)] : V.Int(P.lmode) === 2 ? lenB + ND_DIV[V.Int(P.length)] : lenB;
      notes.forEach((x, i) => { if (i > 0 && !(V.Val(P.vchance) >= 100 || Math.random() * 100 < V.Val(P.vchance))) return; V.play(x, i > 0 ? v * V.Val(P.vvel) / 100 : v, V.beat + Math.random() * V.Val(P.humanize) / 1000 * 2, L); });
    }
    spec.onKey = (V, n) => play(V, n, 100, 0.5);
    spec.tick = (V, dt, clock) => {
      if (!clock.playing) { E.next = null; return; }
      if (E.next == null || E.next > V.beat + 1) E.next = Math.ceil(V.beat);
      while (V.beat >= E.next) { const i = Math.round(E.next) % 8; play(V, E.mel[i], 90 + (i % 2 ? 0 : 20), 0.9); E.next += 1; }
    };
    spec.Draw = V => {
      {
        let lo = V.Int(P.lokey), hi = V.Int(P.hikey); if (lo > hi) [lo, hi] = [hi, lo];
        V.RRect(10, 186, 82, 5, 2.5, hex32(0xffffff, 0.08));
        V.RRect(10 + lo / 127 * 82, 186, Math.max(2, (hi - lo) / 127 * 82), 5, 2.5, V.accent);
      }
      const scale = V.Int(P.scale), root = V.Int(P.root), set = ndSet(scale, root);
      {
        const x0 = 110, y0 = 152, kw = 7;
        [0, 2, 4, 5, 7, 9, 11].forEach((pc, i) => {
          const x = x0 + i * 12, inS = !set || set.has(pc);
          V.RRect(x, y0, 11, 34, 2, inS ? hex32(0xffffff, set ? 0.85 : 0.35) : hex32(0xffffff, 0.12));
          if (set && pc === root) V.Circ(x + 5.5, y0 + 28, 2.5, V.accent);
        });
        for (const [pc, wi] of [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]]) {
          const x = x0 + wi * 12 + 8, inS = !set || set.has(pc);
          V.RRect(x, y0, kw, 20, 1.5, inS ? (set ? V.accentDim : 0x45454fff) : 0x1b1b22ff);
          if (set && pc === root) V.Circ(x + kw / 2, y0 + 15, 2, V.accent);
        }
      }
      {
        const notes = nsChord(V, P, 60 + (set ? root : 0));
        const x0 = 300, y0 = 128, w = 76, h = 58;
        V.RRect(x0, y0, w, h, 4, 0x0f0f14ff);
        let lo = 1e9; for (const n of notes) lo = Math.min(lo, n);
        lo -= pc12(lo);
        for (let o = 0; o < 3; o++) { const y = y0 + h - 4 - o * 12 * (h - 8) / 36; V.Ln(x0 + 2, y, x0 + w - 2, y, hex32(0xffffff, 0.06)); }
        notes.forEach((n, i) => {
          const y = y0 + h - 4 - Math.max(0, Math.min(36, n - lo)) * (h - 8) / 36;
          const x = x0 + 8 + i * Math.min(12, (w - 16) / Math.max(1, notes.length - 1));
          V.Circ(x, y, 3.2, hsv32(V.Hue + (i + 1) * 0.03, 0.55, 1, 1));
        });
        V.TxtR(x0 + w - 3, y0 + 3, notes.map(ndName).join(' '), 6, V.dim);
      }
      {
        let lo = V.Int(P.rlo), hi = V.Int(P.rhi); if (lo > hi) [lo, hi] = [hi, lo];
        V.Txt(392, 140, 'RANGE', 6.5, V.dim);
        V.RRect(392, 152, 82, 5, 2.5, hex32(0xffffff, 0.08));
        V.RRect(392 + lo / 127 * 82, 152, Math.max(2, (hi - lo) / 127 * 82), 5, 2.5, V.accent);
        V.Txt(392, 162, ndName(lo) + ' - ' + ndName(hi), 6.5, V.text);
      }
      {
        const x0 = 530, y0 = 128, w = 44, h = 58;
        V.RRect(x0, y0, w, h, 4, 0x0f0f14ff);
        const c = V.Val(P.vcurve) / 100, mn = V.Val(P.vmin), mx = V.Val(P.vmax), fixed = V.Val(P.vfixed);
        const pts = [];
        for (let i = 0; i <= 24; i++) {
          const v = i / 24, o = fixed >= 0.5 ? fixed : mn + (mx - mn) * (v <= 0 ? 0 : Math.pow(v, Math.pow(2, -2 * c)));
          pts.push([x0 + 3 + v * (w - 6), y0 + h - 3 - o / 127 * (h - 6)]);
        }
        V.G.pline(pts, c32(V.accent), 1.5);
      }
    };
    const V = NoteDev(body, api, spec);
    TG['midi-note-shaper'] = { preset: V.G.anchor(14 + V.TW('NOTE SHAPER', 10) + 13, 3, 112, 14), voices: V.G.anchor(214, 38, 28, 28), scale: V.G.anchor(148, 42, 50, 13) };
    return () => V.G.cleanup();
  }
  reg({
    id: 'midi-note-shaper', name: 'Note Shaper', vendor: 'FX Devices', group: 'MIDI',
    width: frameW(700, ndScale(700)), height: frameH(216, ndScale(700)),
    blurb: 'Rewrites incoming notes: filters them, snaps them to a scale, builds chords, voices them and reshapes the velocity. Shown with Minor 7 Pads while the demo plays a simple melody into it.',
    steps: [
      { id: 'voices', text: 'Turn <b>Voices</b> in the Chord panel', why: 'Each played note becomes a chord. The preview shows the chord built on C4.', target: tg('midi-note-shaper', 'voices') },
      { id: 'scale', text: 'Pick a different <b>Scale</b>', why: 'Notes snap into the scale and, with Intervals on Scale steps, chords stay in key.', target: tg('midi-note-shaper', 'scale') },
      { id: 'preset', text: 'Try the <b>Power Chords</b> or <b>Strict Bass Lane</b> preset', why: 'Each preset is a starting point that sets every knob.', target: tg('midi-note-shaper', 'preset') },
    ],
    notes: [{ title: 'Demo input', text: 'With the transport running, the demo plays a C major melody into it. The keyboard strip shows what comes out. Click the strip to play a note yourself.' }],
    build(body, api) { return buildNoteShaper(body, api); },
  });

  /* ---------------------------------------------------------------- Note Generator */
  const NG_P = { preset: 0, engine: 1, rate: 2, swing: 3, gate: 4, scale: 5, root: 6, low: 7, high: 8, vel: 9, velrand: 10, density: 11, follow: 12,
    run: 13, outch: 14, thru: 15, bsides: 16, brot: 17, bspeed: 18, bballs: 19, bquant: 20, tlen: 21, tlock: 22, trange: 23, e1: 24, wstep: 44, wjump: 45, wpull: 46 };
  const NG_DEFS = sliders(`
preset=0<0,8,1>
engine=0<0,3,1>
rate=4<0,17,1>
swing=0<0,100,0.1>
gate=80<1,200,0.1>
scale=11<0,18,1>
root=0<0,11,1>
lownote=48<0,127,1>
highnote=84<0,127,1>
velocity=100<1,127,1>
velrand=10<0,100,0.1>
density=100<0,100,0.1>
follow=0<0,4,1>
runmode=0<0,1,1>
outch=1<1,16,1>
thru=1<0,1,1>
bsides=5<3,8,1>
brot=0.1<-2,2,0.01>
bspeed=1<0.25,8,0.01:log>
bballs=1<1,4,1>
bquant=0<0,1,1>
tlen=8<2,16,1>
tlock=100<0,100,0.1>
trange=7<1,24,1>
e1note=36<0,127,1>
e1hits=4<0,16,1>
e1steps=16<1,16,1>
e1rot=0<0,15,1>
e1vel=110<1,127,1>
e2note=38<0,127,1>
e2hits=2<0,16,1>
e2steps=16<1,16,1>
e2rot=4<0,15,1>
e2vel=100<1,127,1>
e3note=42<0,127,1>
e3hits=8<0,16,1>
e3steps=16<1,16,1>
e3rot=0<0,15,1>
e3vel=80<1,127,1>
e4note=39<0,127,1>
e4hits=0<0,16,1>
e4steps=16<1,16,1>
e4rot=0<0,15,1>
e4vel=90<1,127,1>
wstep=2<1,7,1>
wjump=5<0,100,0.1>
wpull=0<-100,100,1>`);
  const NG_PRESETS = {
    0: [[2, 0], [3, 4], [4, 0], [5, 80], [6, 11], [7, 0], [8, 48], [9, 84], [10, 100], [11, 10], [12, 100], [13, 0], [14, 0], [15, 1], [16, 1], [17, 5], [18, 0.1], [19, 1], [20, 1], [21, 0],
      [22, 8], [23, 100], [24, 7], [25, 36], [26, 4], [27, 16], [28, 0], [29, 110], [30, 38], [31, 2], [32, 16], [33, 4], [34, 100], [35, 42], [36, 8], [37, 16], [38, 0], [39, 80],
      [40, 39], [41, 0], [42, 16], [43, 0], [44, 90], [45, 2], [46, 5], [47, 0]],
    1: [[2, 0], [5, 60], [8, 60], [9, 84], [11, 15], [17, 5], [18, 0.25], [19, 1.5], [20, 2], [21, 1]],
    2: [[2, 0], [3, 7], [5, 50], [6, 3], [8, 55], [9, 79], [11, 20], [17, 3], [18, -0.5], [19, 2], [20, 3], [21, 0]],
    3: [[2, 1], [3, 4], [4, 15], [5, 70], [6, 2], [8, 36], [9, 55], [10, 105], [11, 10], [12, 85], [22, 8], [23, 100], [24, 7]],
    4: [[2, 1], [3, 4], [4, 20], [5, 60], [6, 3], [8, 60], [9, 88], [11, 25], [12, 70], [22, 16], [23, 85], [24, 14]],
    5: [[2, 2], [3, 4], [4, 10], [5, 30], [11, 12], [25, 36], [26, 3], [27, 8], [28, 0], [29, 115], [30, 38], [31, 5], [32, 16], [33, 2], [34, 95], [35, 42], [36, 9], [37, 16], [38, 0], [39, 75], [40, 39], [41, 2], [42, 16], [43, 4], [44, 100]],
    6: [[2, 2], [3, 4], [4, 25], [5, 20], [11, 30], [12, 85], [25, 42], [26, 11], [27, 16], [28, 0], [29, 85], [30, 46], [31, 2], [32, 16], [33, 2], [34, 95], [35, 44], [36, 4], [37, 16], [38, 2], [39, 60], [40, 42], [41, 3], [42, 7], [43, 1], [44, 50]],
    7: [[2, 3], [3, 10], [5, 180], [6, 5], [7, 2], [8, 55], [9, 86], [10, 70], [11, 25], [12, 60], [45, 2], [46, 3], [47, 0]],
    8: [[2, 3], [3, 4], [5, 70], [6, 0], [8, 48], [9, 84], [10, 95], [11, 10], [12, 100], [13, 2], [16, 0], [45, 1], [46, 0], [47, 40]],
  };
  const NG_ENGINES = ['Bounce', 'Turing', 'Euclid', 'Walk'];
  const NG_TIP = ['Balls fly inside a spinning polygon.\nEach wall plays one note of the scale.', 'A looping shift register (Turing Machine).\nLock sets how often a bit flips.',
    'Four Euclidean rhythm rings, each with its own note.', 'A random walk up and down the scale.'];
  const ngEuHit = (pos, hits, steps, rot) => { if (hits <= 0) return false; const i = ((pos - rot) % steps + steps) % steps; return (i * hits) % steps < hits; };
  function ngTable(V, P) {
    const set = ndSet(V.Int(P.scale), V.Int(P.root));
    let lo = V.Int(P.low), hi = V.Int(P.high);
    if (lo > hi) [lo, hi] = [hi, lo];
    const t = [];
    for (let n = lo; n <= hi; n++) if (!set || set.has(n % 12)) t.push(n);
    if (!t.length) t.push(ndClampN(ndQuant(set, lo, 0)));
    return { tbl: t, lo, hi, set };
  }
  function buildNoteGen(body, api) {
    const P = NG_P;
    const note = ndName, pct = v => Math.round(v) + '%', int = v => String(Math.round(v));
    const isEng = e => V => V.Int(P.engine) === e;
    const M = { rot: 0, wall: -1, balls: [], treg: 0xb5a3, tdeg: 0, epos: [0, 0, 0, 0], wnote: -1, lastk: null, onset: -1, wHist: [], tHist: [], trail: [], tLastReg: -1 };
    const resetBalls = () => { M.balls = []; for (let b = 0; b < 4; b++) { const a = 0.6 + b * 2.39996; M.balls.push({ x: 0.25 * Math.cos(a + 2.1), y: 0.25 * Math.sin(a + 2.1), vx: Math.cos(a), vy: Math.sin(a) }); } M.rot = 0; M.wall = -1; };
    resetBalls();
    const spec = {
      id: 'midi-note-generator', Title: 'Generator', W: 664, Hue: 0.78, PresetW: 130, defs: NG_DEFS, startPreset: 1,
      Presets: ['Init', 'Bouncing Pentatonic', 'Ricochet Triangle', 'Turing Bassline Locked', 'Turing Lead Drifting', 'Afro-Cuban Euclid Kit', 'Hi-Hat Generator', 'Ambient Drunk Walk', 'Arp Follower'],
      applyPreset: ndPresetFn(NG_PRESETS),
      onPreset: () => { resetBalls(); M.wHist = []; M.tHist = []; M.trail = []; M.wnote = -1; },
      onParam: (V, p) => { if (p >= P.e1 && p < P.e1 + 20 && (p - P.e1) % 5 === 1) api.check('hits'); if (p === P.scale || p === P.rate) api.check('scale'); },
      Panels: [{ title: 'ENGINE', x: 4, y: 22, w: 64, h: 180 }, { title: '', x: 72, y: 22, w: 200, h: 180 }, { title: '', x: 276, y: 22, w: 184, h: 180 }, { title: 'OUTPUT', x: 464, y: 22, w: 196, h: 180 }],
      Items: [
        { t: 'knob', p: P.bsides, x: 96, y: 52, r: 10, label: 'SIDES', fmt: int, when: isEng(0), tip: 'Walls of the polygon (3-8): one note each' },
        { t: 'knob', p: P.bballs, x: 140, y: 52, r: 10, label: 'BALLS', fmt: int, when: isEng(0) },
        { t: 'knob', p: P.brot, x: 184, y: 52, r: 10, label: 'SPIN', bipolar: true, when: isEng(0), fmt: v => (v >= 0 ? '+' : '') + v.toFixed(2) + '/bar', tip: 'Polygon rotation in turns per bar (- = backwards)' },
        { t: 'knob', p: P.bspeed, x: 228, y: 52, r: 10, label: 'SPEED', when: isEng(0), fmt: v => v.toFixed(2) + '/beat', tip: 'Ball speed: polygon crossings per beat' },
        { t: 'toggle', p: P.bquant, x: 82, y: 90, w: 76, label: 'TIMING', text: ['Free', 'Snap to Rate'], when: isEng(0), tip: 'Snap each hit to the next Rate step, or play it the moment it happens' },
        { t: 'knob', p: P.tlen, x: 96, y: 52, r: 10, label: 'LENGTH', fmt: v => int(v) + ' bits', when: isEng(1), tip: 'Loop length of the register (2-16 steps)' },
        { t: 'knob', p: P.tlock, x: 140, y: 52, r: 10, label: 'LOCK', fmt: pct, when: isEng(1), tip: '100% = the loop repeats exactly\n0% = a coin toss every step' },
        { t: 'knob', p: P.trange, x: 184, y: 52, r: 10, label: 'RANGE', when: isEng(1), fmt: v => int(v) + ' deg', tip: 'How many scale degrees the register spans' },
        { t: 'knob', p: P.wstep, x: 96, y: 52, r: 10, label: 'MAX STEP', when: isEng(3), fmt: v => int(v) + ' deg', tip: 'Largest move per step, in scale degrees' },
        { t: 'knob', p: P.wjump, x: 140, y: 52, r: 10, label: 'JUMP', fmt: pct, when: isEng(3), tip: 'Chance to leap to any note in the range' },
        { t: 'knob', p: P.wpull, x: 184, y: 52, r: 10, label: 'PULL', bipolar: true, when: isEng(3), fmt: v => (v >= 0 ? '+' : '') + Math.round(v), tip: '-100 always down .. +100 always up' },
        { t: 'knob', p: P.swing, x: 488, y: 52, r: 10, label: 'SWING', fmt: pct }, { t: 'knob', p: P.gate, x: 532, y: 52, r: 10, label: 'GATE', fmt: pct, tip: 'Note length in % of one Rate step' },
        { t: 'knob', p: P.density, x: 576, y: 52, r: 10, label: 'DENSITY', fmt: pct, tip: 'Chance that each note really plays' },
        { t: 'knob', p: P.low, x: 488, y: 98, r: 10, label: 'LOW', fmt: note }, { t: 'knob', p: P.high, x: 532, y: 98, r: 10, label: 'HIGH', fmt: note },
        { t: 'knob', p: P.vel, x: 488, y: 140, r: 10, label: 'VELOCITY', fmt: '%.0f', tip: 'Not used by Euclid (each ring has its own)' },
        { t: 'knob', p: P.velrand, x: 532, y: 140, r: 10, label: 'VEL RND', fmt: v => '+-' + pct(v) },
        { t: 'enum', p: P.rate, x: 604, y: 42, w: 50, label: 'RATE', list: ND_RATES }, { t: 'enum', p: P.scale, x: 604, y: 68, w: 50, label: 'SCALE', list: ND_SCALES },
        { t: 'enum', p: P.root, x: 604, y: 94, w: 50, label: 'ROOT', list: ND_ROOTS },
        { t: 'enum', p: P.outch, x: 604, y: 120, w: 50, label: 'OUT CH', list: Array.from({ length: 16 }, (_, i) => String(i + 1)), base: 1 },
        { t: 'toggle', p: P.run, x: 604, y: 146, w: 50, label: 'RUN', text: ['Transport', 'Always'], tip: 'Transport: only while playing\nAlways: also when stopped, on a free-running clock' },
        { t: 'toggle', p: P.thru, x: 604, y: 172, w: 50, label: 'PASS IN', tip: 'Played notes go through too' },
        { t: 'enum', p: P.follow, x: 470, y: 180, w: 128, label: 'FOLLOW INPUT', list: ['Off', 'Input Sets Root', 'Input Sets Notes', 'Input Gates', 'Input Transposes'] },
      ],
    };
    const EU_X = [108, 144, 180, 216, 252], EU_Y = [64, 98, 132, 166], EU_FMT = [note, int, int, int, int];
    for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) spec.Items.push({ t: 'knob', p: P.e1 + r * 5 + k, x: EU_X[k], y: EU_Y[r], r: 9, fmt: EU_FMT[k], when: isEng(2) });
    const RingHue = (V, r) => V.Hue + [0, 0.13, 0.3, 0.52][r];
    // ---- engines (as the JSFX)
    function gen(V, n, vel, tb, len) {
      if (!(V.Val(P.density) >= 100 || Math.random() * 100 < V.Val(P.density))) return;
      const vr = V.Val(P.velrand);
      const v = Math.max(1, Math.min(127, Math.round(vel * (1 + (Math.random() * 2 - 1) * vr / 100))));
      V.play(n, v, Math.max(tb, V.beat), len);
      M.onset = V.now;
    }
    spec.tick = (V, dt, clock) => {
      const live = clock.playing || V.Int(P.run) === 1;
      M.live = live;
      if (!live) { M.lastk = null; return; }
      const { tbl } = ngTable(V, P);
      const div = ND_DIV[V.Int(P.rate)], len = div * V.Val(P.gate) / 100, sw = V.Val(P.swing) / 100 * div * 0.5;
      const tbk = k => k * div + (k % 2 !== 0 ? sw : 0);
      const b1 = V.beat, b0 = b1 - dt * clock.bpm / 60;
      const eng = V.Int(P.engine);
      if (eng === 0) {
        const sides = Math.max(3, Math.min(8, V.Int(P.bsides))), nb = Math.max(1, Math.min(4, V.Int(P.bballs)));
        const rin = Math.cos(PI / sides), travel = V.Val(P.bspeed) * 2 * rin;
        let t = b0, cnt = 0;
        while (t < b1 - 1e-7 && cnt < 64) {
          const hstep = Math.min(1 / 64, b1 - t);
          const th = M.rot;
          let th1 = th + TAU * V.Val(P.brot) * hstep / 4;
          th1 -= TAU * Math.floor(th1 / TAU);
          for (let b = 0; b < nb; b++) {
            const B = M.balls[b];
            let rem = hstep * travel, used = 0, bounces = 0;
            while (rem > 0 && bounces < 8) {
              let best = -1, bt = rem, bnx = 0, bny = 0, bvn = 0;
              for (let i = 0; i < sides; i++) {
                const a = th + TAU * (i + 0.5) / sides, nx = Math.cos(a), ny = Math.sin(a), vn = B.vx * nx + B.vy * ny;
                if (vn > 1e-9) { let d = (rin - (B.x * nx + B.y * ny)) / vn; if (d < 0) d = 0; if (d <= bt) { bt = d; best = i; bnx = nx; bny = ny; bvn = vn; } }
              }
              B.x += B.vx * bt; B.y += B.vy * bt; used += bt; rem -= bt;
              if (best >= 0) {
                B.vx -= 2 * bvn * bnx; B.vy -= 2 * bvn * bny;
                M.wall = best;
                const beat = t + used / travel;
                let tb = beat;
                if (V.Int(P.bquant)) { let k = Math.floor(beat / div) - 1; while (tbk(k) < beat - 1e-6) k++; tb = tbk(k); }
                gen(V, tbl[best % tbl.length], V.Val(P.vel) * (0.7 + 0.3 * bvn), tb, len);
                bounces++;
              } else rem = 0;
            }
            for (let i = 0; i < sides; i++) {
              const a = th1 + TAU * (i + 0.5) / sides, nx = Math.cos(a), ny = Math.sin(a), d = B.x * nx + B.y * ny - rin;
              if (d > 0) { B.x -= nx * (d + 1e-6); B.y -= ny * (d + 1e-6); }
            }
            const d = Math.hypot(B.vx, B.vy);
            if (d > 0) { B.vx /= d; B.vy /= d; } else { B.vx = 1; B.vy = 0; }
          }
          M.rot = th1; t += hstep; cnt++;
        }
        return;
      }
      if (M.lastk == null) { let k = Math.floor(b0 / div) - 1; while (tbk(k) < b0 - 1e-6) k++; M.lastk = k - 1; }
      let k = M.lastk + 1, cnt = 0;
      while (tbk(k) < b1 && cnt < 64) {
        const tb = Math.max(tbk(k), b0);
        if (eng === 1) {
          const L = Math.max(2, Math.min(16, V.Int(P.tlen))), mask = Math.pow(2, L) - 1;
          let outb = (M.treg >> (L - 1)) & 1;
          if (Math.random() * 100 < (100 - V.Val(P.tlock)) / 2) outb = 1 - outb;
          M.treg = ((M.treg << 1) | outb) & 65535;
          const val = M.treg & mask, deg = Math.min(Math.floor(val * V.Int(P.trange) / (mask + 1)), 23);
          M.tdeg = deg;
          gen(V, tbl[deg % tbl.length], V.Val(P.vel), tb, len);
        } else if (eng === 2) {
          for (let r = 0; r < 4; r++) {
            const s = P.e1 + r * 5, n = Math.max(1, Math.min(16, V.Int(s + 2))), hh = Math.max(0, Math.min(n, V.Int(s + 1))), rot = V.Int(s + 3);
            const pos = ((k % n) + n) % n;
            M.epos[r] = pos;
            if (ngEuHit(pos, hh, n, rot)) gen(V, V.Int(s), V.Int(s + 4), tb, len);
          }
        } else {
          const npt = tbl.length;
          if (M.wnote < 0) M.wnote = tbl[Math.floor(npt / 2)];
          let wi = 0, bd = 1000;
          tbl.forEach((x, i) => { const d = Math.abs(x - M.wnote); if (d < bd) { bd = d; wi = i; } });
          const top = npt - 1;
          if (Math.random() * 100 < V.Val(P.wjump)) wi = Math.floor(Math.random() * npt);
          else {
            const mag = 1 + Math.floor(Math.random() * Math.max(1, V.Int(P.wstep)));
            wi += Math.random() < 0.5 + V.Val(P.wpull) / 200 ? mag : -mag;
            if (top <= 0) wi = 0;
            else { let c = 0; while ((wi < 0 || wi > top) && c++ < 16) { if (wi < 0) wi = -wi; if (wi > top) wi = 2 * top - wi; } }
          }
          wi = Math.max(0, Math.min(top, wi));
          M.wnote = tbl[wi];
          gen(V, M.wnote, V.Val(P.vel), tb, len);
        }
        M.lastk = k; k++; cnt++;
      }
    };
    const Flash = (V, dur) => M.onset < 0 ? 0 : Math.max(0, 1 - (V.now - M.onset) / (dur || 0.25));
    const PanelTitle = (V, x, y, main, sub) => { V.Txt(x + 6, y + 3, main, 8, hsv32(V.Hue, 0.45, 1, 0.95)); if (sub) V.Txt(x + 10 + V.TW(main, 8), y + 4, sub, 6.5, V.dim); };
    function NoteChips(V, x0, y0, tbl, used, lit, colFn, maxRows) {
      const cols = 8, cw = 22, ch = 12, total = Math.min(tbl.length, cols * maxRows);
      for (let i = 1; i <= total; i++) {
        const cx = x0 + ((i - 1) % cols) * (cw + 1), cy = y0 + Math.floor((i - 1) / cols) * (ch + 2), inUse = i <= used, on = lit === i;
        V.RRect(cx, cy, cw, ch, 3, on ? (colFn ? colFn(i) : V.accent) : (inUse ? hex32(0xffffff, 0.1) : hex32(0xffffff, 0.035)));
        if (inUse && colFn && !on) V.RRect(cx + 2, cy + ch - 2.5, cw - 4, 1.5, 1, colFn(i));
        V.TxtC(cx + cw / 2, cy + 2.5, ndName(tbl[i - 1]), 6, on ? 0x15151aff : (inUse ? V.text : 0x5c5c6aff));
      }
      if (tbl.length > total) V.TxtR(x0 + cols * (cw + 1) - 1, y0 + maxRows * (ch + 2), '+' + (tbl.length - total) + ' more', 6, V.dim);
    }
    const WX = 282, WY = 38, WW = 172, WH = 158, CX = WX + WW / 2, CY = WY + WH / 2;
    spec.Draw = V => {
      const eng = Math.max(0, Math.min(3, V.Int(P.engine))), live = M.live;
      const { tbl, lo, hi } = ngTable(V, P);
      const follows = V.Int(P.follow) === 2;
      // engine chips
      const glyph = [
        (cx, cy, col) => { let px = null, py = null; for (let i = 0; i <= 5; i++) { const a = -PI / 2 + i * TAU / 5, x = cx + Math.cos(a) * 7, y = cy + Math.sin(a) * 7; if (px != null) V.Ln(px, py, x, y, col, 1.3); px = x; py = y; } V.Circ(cx + 1.5, cy + 1, 1.8, col); },
        (cx, cy, col) => { for (let i = 0; i < 5; i++) { const on = (0x15 >> i) & 1, x = cx - 10 + i * 5; if (on) V.RRect(x - 1.8, cy - 3, 3.6, 6, 1, col); else V.RBox(x - 1.8, cy - 3, 3.6, 6, 1, col, 1); } },
        (cx, cy, col) => { for (let i = 0; i < 8; i++) { const a = -PI / 2 + i * TAU / 8, hit = i === 0 || i === 3 || i === 6; V.Circ(cx + Math.cos(a) * 6.5, cy + Math.sin(a) * 6.5, hit ? 1.9 : 1, col); } },
        (cx, cy, col) => { const ys = [2, -1, 1, -4, -2, 3, 0]; for (let i = 1; i < ys.length; i++) V.Ln(cx - 9 + (i - 1) * 3, cy + ys[i - 1], cx - 9 + i * 3, cy + ys[i], col, 1.3); },
      ];
      for (let i = 0; i < 4; i++) {
        const x = 10, y = 40 + i * 40, w = 52, h = 36, sel = eng === i;
        const b = V.Btn('eng' + i, x, y, w, h, 'pointer');
        V.RRect(x, y, w, h, 7, sel ? hsv32(V.Hue, 0.5, 0.92, 1) : (b.h ? 0x34343fff : 0x24242cff));
        if (!sel) V.RBox(x, y, w, h, 7, hex32(0xffffff, 0.06));
        glyph[i](x + w / 2, y + 12, sel ? 0x15151aff : (b.h ? V.text : V.dim));
        V.TxtC(x + w / 2, y + 22, NG_ENGINES[i].toUpperCase(), 7, sel ? 0x15151aff : (b.h ? V.text : 0xb0b0c0ff));
        if (b.h) { V.G.tip(NG_TIP[i]); const d = V.Wheel(x, y, w, h); if (d) V.SetVal(P.engine, Math.max(0, Math.min(3, eng - d))); }
        if (b.c && i !== eng) { V.SetVal(P.engine, i); M.lastk = null; api.check('engine'); }
      }
      PanelTitle(V, 72, 22, NG_ENGINES[eng].toUpperCase(), ['balls in a spinning polygon', 'shift register loop', 'four rhythm rings', 'random walk'][eng]);
      if (eng === 0) {
        const sides = Math.max(3, Math.min(8, V.Int(P.bsides))), used = Math.min(sides, tbl.length);
        V.Txt(82, 112, follows ? 'WALL NOTES (FROM HELD NOTES)' : 'WALL NOTES', 6.5, V.dim);
        const colFn = i => hsv32(V.Hue + (i - 1) / Math.max(1, tbl.length) * 0.4, 0.5, 0.95, 1);
        NoteChips(V, 82, 122, tbl.slice(0, used), used, live && M.wall >= 0 ? M.wall % tbl.length + 1 : null, colFn, 1);
        if (sides > tbl.length) V.Txt(82, 140, 'walls ' + (tbl.length + 1) + '-' + sides + ' wrap round', 6, V.dim);
        V.Txt(82, 166, 'Wall 1 plays the first note from Low up,', 6, V.dim);
        V.Txt(82, 175, 'wall 2 the next one... Straight hits are louder.', 6, V.dim);
      } else if (eng === 1) {
        const range = Math.max(1, V.Int(P.trange));
        V.Txt(82, 84, 'Each step the register shifts; the bit', 6, V.dim);
        V.Txt(82, 93, 'that falls off loops back (Lock = keep).', 6, V.dim);
        V.Txt(82, 112, follows ? 'DEGREES (FROM HELD NOTES)' : 'DEGREES IN RANGE', 6.5, V.dim);
        const list = []; for (let i = 0; i < Math.min(range, 24); i++) list.push(tbl[i % tbl.length]);
        NoteChips(V, 82, 122, list, list.length, live ? M.tdeg % tbl.length + 1 : null, null, 5);
      } else if (eng === 2) {
        ['NOTE', 'HITS', 'STEPS', 'ROT', 'VEL'].forEach((hd, k) => V.TxtC(EU_X[k], 38, hd, 6.5, V.dim));
        for (let r = 0; r < 4; r++) {
          const y = EU_Y[r], b = P.e1 + r * 5, on = V.Int(b + 1) > 0;
          V.Circ(82, y, 6, on ? hsv32(RingHue(V, r), 0.5, 1, 1) : 0x2e2e3aff);
          V.TxtC(82, y - 3.5, String(r + 1), 7, on ? 0x15151aff : V.dim);
          for (let k = 0; k < 5; k++) if (!V.S.hov[b + k]) V.TxtC(EU_X[k], y + 13, EU_FMT[k](V.Val(b + k)), 6, on ? 0xb8b8c8ff : 0x5c5c6aff);
        }
      } else {
        V.Txt(82, 84, 'Steps up or down the scale each Rate step,', 6, V.dim);
        V.Txt(82, 93, 'bouncing off Low / High. Rests: Density.', 6, V.dim);
        V.Txt(82, 112, follows ? 'NOTE TABLE (FROM HELD NOTES)' : 'NOTE TABLE', 6.5, V.dim);
        NoteChips(V, 82, 122, tbl, tbl.length, live ? tbl.indexOf(M.wnote) + 1 || null : null, null, 5);
      }
      PanelTitle(V, 276, 22, 'VIEW', live ? 'live' : 'not running');
      if (live) V.Circ(452, 28, 2.5, hsv32(V.Hue, 0.5, 1, 0.6 + 0.4 * Flash(V, 0.3)));
      V.RRect(WX, WY, WW, WH, 4, 0x0f0f14ff);
      if (eng === 0) {
        const sides = Math.max(3, Math.min(8, V.Int(P.bsides))), nb = Math.max(1, Math.min(4, V.Int(P.bballs)));
        const rot = live ? M.rot : 0, wall = live ? M.wall : -1, R = 58;
        const Pt = (x, y) => [CX + x * R, CY - y * R];
        const WallHue = i => V.Hue + (i % tbl.length) / Math.max(1, tbl.length) * 0.4;
        const fl = live ? Flash(V, 0.35) : 0;
        for (let i = 0; i < sides; i++) {
          const a0 = rot + TAU * i / sides, a1 = rot + TAU * (i + 1) / sides;
          const [x0, y0] = Pt(Math.cos(a0), Math.sin(a0)), [x1, y1] = Pt(Math.cos(a1), Math.sin(a1));
          const hit = i === wall;
          let col = hsv32(WallHue(i), 0.5, 0.95, 0.75);
          if (hit) { V.Ln(x0, y0, x1, y1, hsv32(WallHue(i), 0.4, 1, 0.25 + 0.5 * fl), 6 + 4 * fl); col = hsv32(WallHue(i), 0.25 + 0.3 * (1 - fl), 1, 1); }
          V.Ln(x0, y0, x1, y1, col, hit ? 2.5 : 1.6);
          V.Circ(x0, y0, 1.6, hex32(0xffffff, 0.5));
          const am = rot + TAU * (i + 0.5) / sides, ld = R * Math.cos(PI / sides) + 9;
          V.TxtC(CX + Math.cos(am) * ld, CY - Math.sin(am) * ld - 3.5, ndName(tbl[i % tbl.length]), 6, hit ? V.text : hsv32(WallHue(i), 0.35, 0.95, 0.85));
        }
        for (let b = 0; b < nb; b++) {
          const B = M.balls[b];
          const [x, y] = Pt(B.x, B.y);
          if (live) {
            const tr = M.trail[b] = M.trail[b] || [];
            const last = tr[tr.length - 1];
            if (!last || Math.abs(last[0] - x) + Math.abs(last[1] - y) > 0.5) { tr.push([x, y]); if (tr.length > 12) tr.shift(); }
            for (let k = 1; k < tr.length; k++) { const dx = tr[k][0] - tr[k - 1][0], dy = tr[k][1] - tr[k - 1][1]; if (dx * dx + dy * dy < 900) V.Ln(tr[k - 1][0], tr[k - 1][1], tr[k][0], tr[k][1], hsv32(V.Hue + 0.08 * b, 0.4, 1, (k + 1) / tr.length * 0.45), 1.5); }
          } else V.Ln(x, y, x + B.vx * 12, y - B.vy * 12, hex32(0xffffff, 0.3), 1);
          V.Circ(x, y, 3.6, hsv32(V.Hue + 0.08 * b, 0.25, 1, 1));
        }
        const spin = V.Val(P.brot);
        V.Txt(WX + 5, WY + 4, sides + ' walls', 6.5, V.dim);
        V.TxtR(WX + WW - 5, WY + 4, nb + (nb === 1 ? ' ball' : ' balls'), 6.5, V.dim);
        V.Txt(WX + 5, WY + WH - 11, 'spin ' + (spin >= 0 ? '+' : '') + spin.toFixed(2), 6.5, V.dim);
        V.TxtR(WX + WW - 5, WY + WH - 11, V.Int(P.bquant) === 1 ? 'snapped' : 'free', 6.5, V.dim);
      } else if (eng === 1) {
        const len = Math.max(2, Math.min(16, V.Int(P.tlen))), range = Math.max(1, V.Int(P.trange)), mask = Math.pow(2, len) - 1;
        const val = live ? M.treg & mask : 0, deg = Math.min(Math.floor(val * range / (mask + 1)), 23);
        if (live && M.tLastReg !== M.treg) { M.tLastReg = M.treg; M.tHist.push(deg); if (M.tHist.length > 32) M.tHist.shift(); }
        const fl = live ? Flash(V, 0.2) : 0, x0 = WX + 9, py = WY + 34, pitch = 10.3;
        V.Txt(WX + 5, WY + 4, 'REGISTER', 6.5, V.dim);
        V.TxtR(WX + WW - 5, WY + 4, len + ' bits', 6.5, V.dim);
        const lx1 = x0 + (len - 1) * pitch;
        V.Ln(x0 - 3, py - 10, lx1 + 3, py - 10, V.accent, 1.2); V.Ln(x0 - 3, py - 10, x0 - 3, py - 7, V.accent, 1.2); V.Ln(lx1 + 3, py - 10, lx1 + 3, py - 7, V.accent, 1.2);
        for (let i = 0; i < 16; i++) {
          const x = x0 + i * pitch, inLoop = i < len, on = ((val >> i) & 1) === 1 && inLoop;
          if (on) { if (i === 0 && fl > 0) V.Circ(x, py, 6, hsv32(V.Hue, 0.4, 1, 0.3 * fl)); V.Circ(x, py, 3.8, hsv32(V.Hue, 0.45, 1, 1)); }
          else { V.Circ(x, py, 3.8, inLoop ? 0x2e2e3aff : 0x1a1a22ff); if (inLoop) V.Ring(x, py, 3.8, hex32(0xffffff, 0.12)); }
        }
        const by = py + 9, lc = hex32(0xffffff, 0.3);
        V.Ln(lx1, py + 5, lx1, by, lc); V.Ln(lx1, by, x0, by, lc); V.Ln(x0, by, x0, py + 5, lc); V.Ln(x0, py + 5, x0 - 2, py + 8, lc); V.Ln(x0, py + 5, x0 + 2, py + 8, lc);
        const flip = (100 - V.Val(P.tlock)) / 2, ftxt = flip < 0.05 ? 'locked loop' : 'flip ' + Math.round(flip) + '%', fw = V.TW(ftxt, 6);
        const fx = Math.max(x0 + 4, (x0 + lx1) / 2 - fw / 2);
        V.RRect(fx - 2, by - 3, fw + 4, 7, 2, 0x0f0f14ff);
        V.Txt(fx, by - 3, ftxt, 6, V.dim);
        const ny = py + 20;
        if (live) { V.Txt(WX + 5, ny, val + ' / ' + (mask + 1), 7, V.text); V.TxtR(WX + WW - 5, ny, 'deg ' + deg + '  ' + ndName(tbl[deg % tbl.length]), 7, hsv32(V.Hue, 0.4, 1, 1)); }
        else V.Txt(WX + 5, ny, 'plays degrees 0-' + (range - 1), 7, V.dim);
        const hx = WX + 5, hy = WY + 78, hw = WW - 10, hh = WH - 84;
        V.RRect(hx, hy, hw, hh, 3, hex32(0xffffff, 0.025));
        for (let d = 0; d < range; d += Math.max(1, Math.floor(range / 6))) { const y = hy + hh - 3 - d / Math.max(1, range - 1) * (hh - 8); V.Ln(hx + 2, y, hx + hw - 2, y, hex32(0xffffff, 0.04)); }
        const Hs = M.tHist;
        if (live && Hs.length) {
          const bw = hw / 32;
          Hs.forEach((dg, k) => {
            const x = hx + hw - (Hs.length - k) * bw, y = hy + hh - 3 - dg / Math.max(1, range - 1) * (hh - 8), a = 0.25 + 0.75 * (k + 1) / Hs.length;
            V.RRect(x + 0.5, y - 1, bw - 1, hy + hh - y - 1, 1, hsv32(V.Hue, 0.45, 0.9, a * 0.5));
            V.RRect(x + 0.5, y - 1, bw - 1, 2.5, 1, hsv32(V.Hue, 0.4, 1, a));
          });
        } else V.TxtC(hx + hw / 2, hy + hh / 2 - 4, live ? '' : 'the loop shows here while it runs', 6.5, 0x5c5c6aff);
      } else if (eng === 2) {
        const fl = live ? Flash(V, 0.25) : 0, radii = [70, 54, 38, 22];
        for (let r = 0; r < 4; r++) {
          const b = P.e1 + r * 5, steps = Math.max(1, V.Int(b + 2)), hits = Math.max(0, Math.min(steps, V.Int(b + 1))), rot = V.Int(b + 3), rad = radii[r], hu = RingHue(V, r), off = hits === 0;
          V.Ring(CX, CY, rad, hex32(0xffffff, off ? 0.04 : 0.08), 1);
          const pos = live ? M.epos[r] % steps : -1;
          const pts = [];
          for (let st = 0; st < steps; st++) if (ngEuHit(st, hits, steps, rot)) { const a = -PI / 2 + st * TAU / steps; pts.push([CX + Math.cos(a) * rad, CY + Math.sin(a) * rad]); }
          if (pts.length > 1) for (let k = 0; k < pts.length; k++) { const p1 = pts[k], p2 = pts[(k + 1) % pts.length]; V.Ln(p1[0], p1[1], p2[0], p2[1], hsv32(hu, 0.5, 1, 0.16), 1); }
          const dr = Math.min(3.4, rad * PI / steps * 0.42);
          for (let st = 0; st < steps; st++) {
            const a = -PI / 2 + st * TAU / steps, x = CX + Math.cos(a) * rad, y = CY + Math.sin(a) * rad, hit = ngEuHit(st, hits, steps, rot), cur = st === pos;
            if (hit) { if (cur) V.Circ(x, y, dr + 2.5 + 2 * fl, hsv32(hu, 0.4, 1, 0.3 + 0.4 * fl)); V.Circ(x, y, dr, hsv32(hu, 0.5, 1, 1)); }
            else V.Circ(x, y, dr * 0.6, off ? 0x26262eff : 0x3a3a46ff);
            if (cur) V.Ring(x, y, dr + 1.8, 0xffffffdd, 1.2);
          }
        }
        if (!live) V.TxtR(WX + WW - 5, WY + WH - 11, 'from step 1', 6.5, V.dim);
      } else {
        const wn = live ? M.wnote : -1, Hs = M.wHist;
        if (live && wn >= 0 && (M.wLast !== wn || M.onset !== M.wOn)) { Hs.push(wn); if (Hs.length > 24) Hs.shift(); M.wLast = wn; M.wOn = M.onset; }
        const x0 = WX + 26, y0 = WY + 8, w = WW - 34, h = WH - 16, span = Math.max(1, hi - lo);
        const Y = n => y0 + h - (Math.max(lo, Math.min(hi, n)) - lo) / span * h;
        const root = V.Int(P.root), dense = tbl.length > 40;
        for (const n of tbl) { const isRoot = n % 12 === root; if (isRoot || !dense) V.Ln(x0, Y(n), x0 + w, Y(n), hex32(0xffffff, isRoot ? 0.12 : 0.045)); }
        V.TxtR(x0 - 4, Y(hi) - 3, ndName(hi), 6, V.dim);
        V.TxtR(x0 - 4, Y(lo) - 3, ndName(lo), 6, V.dim);
        if (live && Hs.length) {
          const stepw = (w - 8) / 24;
          let px = null, py = null;
          Hs.forEach((n, k) => {
            const x = x0 + w - (Hs.length - 1 - k) * stepw, y = Y(n), a = 0.2 + 0.8 * (k + 1) / Hs.length;
            if (px != null) { V.Ln(px, py, x, py, hsv32(V.Hue, 0.45, 1, a * 0.8), 1.4); V.Ln(x, py, x, y, hsv32(V.Hue, 0.45, 1, a * 0.5), 1); }
            V.Circ(x, y, k === Hs.length - 1 ? 3.4 : 1.5, hsv32(V.Hue, 0.4, 1, a));
            px = x; py = y;
          });
          const fl = Flash(V, 0.3);
          if (fl > 0) V.Circ(px, py, 3.4 + 4 * fl, hsv32(V.Hue, 0.4, 1, 0.35 * fl));
          V.TxtR(x0 + w - 6, Math.max(y0, Math.min(y0 + h - 8, py - 11)), ndName(Hs[Hs.length - 1]), 7, V.text);
        } else {
          const n = tbl[Math.floor(tbl.length / 2)];
          V.Circ(x0 + w, Y(n), 3, hsv32(V.Hue, 0.4, 1, 0.7));
          V.TxtR(x0 + w - 6, Y(n) - 11, 'starts ' + ndName(n), 6.5, V.dim);
        }
      }
      V.TxtC(576, 88, String(tbl.length), 10, V.text);
      V.TxtC(576, 101, tbl.length === 1 ? 'note' : 'notes', 6.5, V.dim);
      V.RRect(560, 112, 32, 3, 1.5, hex32(0xffffff, 0.08));
      V.RRect(560 + lo / 127 * 32, 112, Math.max(1.5, (hi - lo) / 127 * 32), 3, 1.5, V.accent);
    };
    const V = NoteDev(body, api, spec);
    TG['midi-note-generator'] = { chips: V.G.anchor(10, 40, 52, 156), hits: V.G.anchor(72, 38, 200, 150), scale: V.G.anchor(604, 42, 50, 39) };
    return () => V.G.cleanup();
  }
  reg({
    id: 'midi-note-generator', name: 'Generator', vendor: 'FX Devices', group: 'MIDI',
    width: frameW(664, ndScale(664)), height: frameH(216, ndScale(664)),
    blurb: 'Makes notes on its own with one of four engines: balls bouncing in a spinning polygon, a Turing Machine loop, four Euclidean rings, or a random walk. All of them feed the same output stage with scale, range and swing.',
    steps: [
      { id: 'engine', text: 'Switch to another engine, like <b>Euclid</b>', why: 'The controls and the view change with the engine. Press Space to run it.', target: tg('midi-note-generator', 'chips') },
      { id: 'hits', text: 'With Euclid, turn a ring\'s <b>Hits</b> knob', why: 'The hits spread as evenly as possible over the ring\'s steps. The rings show each one.', target: tg('midi-note-generator', 'hits') },
      { id: 'scale', text: 'Change the <b>Rate</b> or <b>Scale</b>', why: 'Rate sets the step grid; Scale and Root decide which notes the engines can play.', target: tg('midi-note-generator', 'scale') },
    ],
    notes: [{ title: 'Run', text: 'Run on Transport plays only while REAPER plays. Always keeps going on a free-running clock.' }],
    build(body, api) { return buildNoteGen(body, api); },
  });

  /* ---------------------------------------------------------------- Audio To Notes */
  const AT_P = { preset: 0, mode: 1, lo_on: 2, lo_note: 3, lo_thr: 4, lo_rt: 5, mid_on: 6, mid_note: 7, mid_thr: 8, mid_rt: 9, hi_on: 10, hi_note: 11, hi_thr: 12, hi_rt: 13,
    detector: 14, sens: 15, vwin: 16, notelen: 17, vel_lo: 18, vel_hi: 19, vel_rng: 20, trig_ch: 21, fmin: 22, fmax: 23, gate: 24, stab: 25, scale: 26, root: 27, octave: 28,
    bend: 29, pvel: 30, pitch_ch: 31, env_on: 32, env_cc: 33, env_att: 34, env_rel: 35, env_floor: 36, env_ceil: 37, thru: 38 };
  const AT_DEFS = sliders(`
preset=0<0,6,1>
mode=0<0,2,1>
lo_on=1<0,1,1>
lo_note=36<0,127,1>
lo_thr=-24<-60,0,0.1>
lo_rt=60<10,500,1>
mid_on=1<0,1,1>
mid_note=38<0,127,1>
mid_thr=-24<-60,0,0.1>
mid_rt=60<10,500,1>
hi_on=1<0,1,1>
hi_note=42<0,127,1>
hi_thr=-30<-60,0,0.1>
hi_rt=40<10,500,1>
detector=1<0,1,1>
sens=50<0,100,1>
vwin=3<0,20,0.1>
notelen=100<10,2000,1:log>
vel_lo=30<1,127,1>
vel_hi=127<1,127,1>
vel_rng=24<3,60,0.5>
trig_ch=10<1,16,1>
fmin=60<40,500,1:log>
fmax=1000<100,2000,1:log>
gate=-45<-80,0,0.1>
stab=30<0,250,1>
scale=0<0,18,1>
root=0<0,11,1>
octave=0<-3,3,1>
bend=0<0,2,1>
pvel=1<0,1,1>
pitch_ch=1<1,16,1>
env_on=0<0,1,1>
env_cc=1<0,127,1>
env_att=10<0.1,500,0.1:log>
env_rel=150<1,2000,1:log>
env_floor=-48<-80,0,0.1>
env_ceil=-6<-80,0,0.1>
thru=1<0,1,1>`);
  const AT_PRESETS = {
    0: [[2, 0], [3, 1], [4, 36], [5, -24], [6, 60], [7, 1], [8, 38], [9, -24], [10, 60], [11, 1], [12, 42], [13, -30], [14, 40], [15, 1], [16, 50], [17, 3], [18, 100], [19, 30], [20, 127], [21, 24], [22, 10],
      [23, 60], [24, 1000], [25, -45], [26, 30], [27, 0], [28, 0], [29, 0], [30, 0], [31, 1], [32, 1], [33, 0], [34, 1], [35, 10], [36, 150], [37, -48], [38, -6], [39, 1]],
    1: [[5, -20], [6, 80], [9, -22], [10, 70], [11, 0], [15, 1], [16, 55], [17, 4], [18, 80], [19, 20], [20, 127], [21, 30]],
    2: [[3, 0], [7, 0], [11, 1], [12, 42], [13, -42], [14, 35], [15, 1], [16, 70], [17, 1], [18, 40], [19, 15], [20, 100], [21, 30]],
    3: [[2, 1], [23, 80], [24, 1000], [25, -40], [26, 50], [27, 1], [28, 0], [30, 0], [31, 1], [19, 50], [20, 120], [21, 30]],
    4: [[2, 1], [23, 70], [24, 1400], [25, -45], [26, 25], [27, 0], [30, 1], [31, 1], [19, 40], [20, 127], [21, 30]],
    5: [[3, 1], [4, 36], [5, -24], [6, 100], [7, 0], [11, 0], [15, 1], [17, 0], [18, 50], [19, 127], [20, 127], [22, 1]],
    6: [[3, 0], [7, 0], [11, 0], [33, 1], [34, 1], [35, 5], [36, 200], [37, -45], [38, -6]],
  };
  function buildAudioToNotes(body, api) {
    const P = AT_P;
    const BANDS = [
      { name: 'Low', on: P.lo_on, note: P.lo_note, thr: P.lo_thr, rt: P.lo_rt, x: 8, hue: 0.0 },
      { name: 'Mid', on: P.mid_on, note: P.mid_note, thr: P.mid_thr, rt: P.mid_rt, x: 80, hue: 0.07 },
      { name: 'High', on: P.hi_on, note: P.hi_note, thr: P.hi_thr, rt: P.hi_rt, x: 152, hue: 0.13 },
    ];
    const MTR = { dx: 6, y: 62, w: 13, h: 134, lo: -60, hi: 0 };
    const PN_TRIG = { title: 'TRIGGER', x: 4, y: 22, w: 224, h: 180 }, PN_SET = { title: 'TRIGGER SETTINGS', x: 232, y: 22, w: 134, h: 180 };
    const PN_PITCH = { title: 'PITCH', x: 370, y: 22, w: 200, h: 180 }, PN_ENV = { title: 'ENVELOPE > CC', x: 574, y: 22, w: 118, h: 180, enable: P.env_on };
    const note = ndName, signed = v => (v >= 0 ? '+' : '') + Math.round(v), ms = v => v < 10 ? v.toFixed(1) + ' ms' : Math.round(v) + ' ms', hz = v => Math.round(v) + ' Hz';
    const CH = Array.from({ length: 16 }, (_, i) => String(i + 1));
    // the demo's audio: a drum loop (kick, snare, hats) and a sung line, as band levels and a pitch
    const E = { lvl: [-90, -90, -90], last: [-1e9, -1e9, -1e9], above: [false, false, false], f: 0, out: -1, env: 0, cand: -1, candT: 0, prevRaw: [-90, -90, -90] };
    const MEL = [57, 57, 60, 62, 64, 62, 60, 59];
    const spec = {
      id: 'midi-audio-to-notes', Title: 'Audio To Notes', W: 696, Hue: 0.01, PresetW: 128, defs: AT_DEFS, startPreset: 0, offOnStop: true,
      Presets: ['Init', 'Drum Replace Kick+Snare', 'Hat Ghost Notes', 'Voice to Synth', 'Guitar Doubler', 'Sidechain Trigger Note', 'Envelope to Mod Wheel'],
      applyPreset: ndPresetFn(AT_PRESETS),
      onParam: (V, p) => { if (p === P.env_on && V.Int(P.env_on)) api.check('env'); },
      Panels: [PN_TRIG, PN_SET, PN_PITCH, PN_ENV],
      Items: [
        { t: 'enum', p: P.detector, x: 238, y: 42, w: 60, label: 'DETECTOR', list: ['Peak', 'Transient'], tip: 'Peak: fires when the band crosses its threshold\nTransient: fires on a sharp rise, so swells and sustains don\'t retrigger' },
        { t: 'enum', p: P.trig_ch, x: 304, y: 42, w: 56, label: 'CHANNEL', list: CH, base: 1, tip: 'MIDI channel of the trigger notes (10 = GM drums)' },
        { t: 'knob', p: P.sens, x: 256, y: 84, r: 10, label: 'SENS', fmt: '%.0f%%', tip: 'Above 50% lowers every threshold (up to 10 dB) and, for Transient, accepts softer rises' },
        { t: 'knob', p: P.vwin, x: 299, y: 84, r: 10, label: 'VEL WIN', fmt: ms, tip: 'Velocity window: keeps measuring the hit\'s peak this long before sending the note' },
        { t: 'knob', p: P.notelen, x: 342, y: 84, r: 10, label: 'LENGTH', fmt: ms },
        { t: 'knob', p: P.vel_lo, x: 256, y: 130, r: 10, label: 'VEL LO', fmt: '%.0f' }, { t: 'knob', p: P.vel_hi, x: 299, y: 130, r: 10, label: 'VEL HI', fmt: '%.0f' },
        { t: 'knob', p: P.vel_rng, x: 342, y: 130, r: 10, label: 'RANGE', fmt: '%.1f dB', tip: 'Level above the threshold that reaches Velocity High' },
        { t: 'toggle', p: P.thru, x: 238, y: 178, w: 60, label: 'PASS MIDI', tip: 'Pass the MIDI coming into the track (note-offs always pass)' },
        { t: 'knob', p: P.fmin, x: 394, y: 104, r: 10, label: 'MIN FREQ', fmt: hz }, { t: 'knob', p: P.fmax, x: 438, y: 104, r: 10, label: 'MAX FREQ', fmt: hz },
        { t: 'knob', p: P.gate, x: 482, y: 104, r: 10, label: 'GATE', fmt: '%.1f dB', tip: 'Below this level the pitch note stops' },
        { t: 'knob', p: P.stab, x: 526, y: 104, r: 10, label: 'STABILITY', fmt: '%.0f ms', tip: 'A new pitch must hold this long before the note changes' },
        { t: 'enum', p: P.scale, x: 376, y: 142, w: 62, label: 'SCALE', list: ND_SCALES }, { t: 'enum', p: P.root, x: 444, y: 142, w: 34, label: 'ROOT', list: ND_ROOTS },
        { t: 'enum', p: P.bend, x: 484, y: 142, w: 48, label: 'BEND', list: ['Off', '+-2', '+-12'], tip: 'Pitch bend for the cents between the note and the detected pitch\n(set the synth\'s bend range to match)' },
        { t: 'enum', p: P.pvel, x: 376, y: 178, w: 62, label: 'VELOCITY', list: ['Fixed', 'From Level'], tip: 'Fixed = Velocity High; From Level uses Vel Lo / Vel Hi / Range above the gate' },
        { t: 'enum', p: P.pitch_ch, x: 444, y: 178, w: 34, label: 'CH', list: CH, base: 1, tip: 'MIDI channel of the pitch notes, pitch bend and the envelope CC' },
        { t: 'knob', p: P.octave, x: 550, y: 158, r: 10, label: 'OCTAVE', bipolar: true, fmt: signed },
        { t: 'knob', p: P.env_cc, x: 598, y: 52, r: 10, label: 'CC #', fmt: v => 'CC ' + Math.round(v) },
        { t: 'knob', p: P.env_att, x: 598, y: 98, r: 10, label: 'ATTACK', fmt: ms }, { t: 'knob', p: P.env_rel, x: 642, y: 98, r: 10, label: 'RELEASE', fmt: ms },
        { t: 'knob', p: P.env_floor, x: 598, y: 144, r: 10, label: 'FLOOR', fmt: '%.0f dB' }, { t: 'knob', p: P.env_ceil, x: 642, y: 144, r: 10, label: 'CEILING', fmt: '%.0f dB' },
      ],
    };
    for (const b of BANDS) spec.Items.push(
      { t: 'toggle', p: b.on, x: b.x, y: 42, w: 66, text: b.name, hue: b.hue },
      { t: 'knob', p: b.note, x: b.x + 46, y: 82, r: 10, label: 'NOTE', fmt: note, hue: b.hue },
      { t: 'knob', p: b.thr, x: b.x + 46, y: 128, r: 10, label: 'THRESH', fmt: '%.1f dB', hue: b.hue, tip: 'Threshold (also draggable on the meter)' },
      { t: 'knob', p: b.rt, x: b.x + 46, y: 174, r: 10, label: 'RETRIG', fmt: '%.0f ms', hue: b.hue, tip: 'Shortest gap between two hits' });
    spec.tick = (V, dt, clock) => {
      const playing = clock.playing, b = V.beat, mode = V.Int(P.mode);
      const sec = b * 60 / clock.bpm;
      // band levels (dB) of the loop: kick on 1 and 3, snare on 2 and 4, hats on 8ths, plus some bleed
      const x4 = b % 4, spb = 60 / clock.bpm;
      const env = (t0, tau) => { let d = x4 - t0; if (d < 0) d += 4; return Math.exp(-d * spb / tau); };
      const kick = Math.max(env(0, 0.12), env(2, 0.12)), snare = Math.max(env(1, 0.09), env(3, 0.09)), hat = Math.exp(-(b * 2 % 1) * spb / 2 / 0.03) * (Math.floor(b * 2) % 2 ? 0.6 : 1);
      const voiceOn = mode !== 0 && (b % 8) < 7;
      const voice = voiceOn ? 0.5 + 0.2 * Math.sin(b * PI * 2) : 0;
      const drums = mode !== 1;
      const lin = [drums ? kick + 0.08 * snare : 0, drums ? snare + 0.12 * kick + 0.3 * voice : voice * 0.6, drums ? hat * 0.7 + 0.2 * snare : voice * 0.15];
      const sensOff = (V.Val(P.sens) - 50) * 0.2;
      for (let i = 0; i < 3; i++) {
        const raw = playing ? 20 * Math.log10(Math.max(1e-5, lin[i] * (0.9 + 0.2 * Math.random()))) : -90;
        E.lvl[i] = raw;
        const Bd = BANDS[i], thr = V.Val(Bd.thr) - sensOff;
        const above = raw > thr;
        const transient = V.Int(P.detector) === 1 ? raw - E.prevRaw[i] > 3 : true;
        V.disp[3 + i] = 0;
        if (above && !E.above[i] && transient && (V.now - E.last[i]) * 1000 >= V.Val(Bd.rt) && V.Val(Bd.on) > 0.5 && mode !== 1) {
          E.last[i] = V.now;
          const vr = clamp((raw - thr) / V.Val(P.vel_rng));
          const vel = V.Val(P.vel_lo) + (V.Val(P.vel_hi) - V.Val(P.vel_lo)) * vr;
          V.play(V.Int(Bd.note), vel, V.beat, V.msToBeats(V.Val(P.notelen), clock));
          V.disp[3 + i] = 1;
        }
        E.above[i] = above;
        E.prevRaw[i] = raw;
        V.disp[i] = raw;
      }
      // pitch of the sung line (with a little vibrato), and the note it becomes
      if (mode !== 0 && playing && voiceOn) {
        const m = MEL[Math.floor(b / 2) % 8] + 0.18 * Math.sin(sec * TAU * 5.5);
        E.f = 440 * Math.pow(2, (m - 69) / 12);
      } else E.f = 0;
      const lvlV = voiceOn && playing ? 20 * Math.log10(voice + 1e-5) : -90;
      if (E.f > 0 && E.f >= V.Val(P.fmin) && E.f <= V.Val(P.fmax) && lvlV > V.Val(P.gate)) {
        const set = ndSet(V.Int(P.scale), V.Int(P.root));
        const n = ndClampN(ndQuant(set, Math.round(69 + 12 * Math.log2(E.f / 440)), 0) + 12 * V.Int(P.octave));
        if (n !== E.cand) { E.cand = n; E.candT = V.now; }
        if (n !== E.out && (V.now - E.candT) * 1000 >= V.Val(P.stab)) {
          E.out = n;
          V.notes.forEach(N => { if (N.pitch) N.b1 = Math.min(N.b1, V.beat); });
          V.notes.push({ n, vel: 100, b0: V.beat, b1: V.beat + 64, pitch: true });
        }
        V.disp[6] = E.f;
      } else {
        if (E.out >= 0) V.notes.forEach(N => { if (N.pitch) N.b1 = Math.min(N.b1, V.beat); });
        E.out = -1; E.cand = -1; V.disp[6] = 0;
      }
      V.disp[7] = E.out;
      // envelope follower -> CC
      const inLvl = playing ? 20 * Math.log10(Math.max(1e-5, lin[0] + lin[1] + lin[2])) : -90;
      const tau = (inLvl > 20 * Math.log10(Math.max(1e-5, E.env)) ? V.Val(P.env_att) : V.Val(P.env_rel)) / 1000;
      E.env += (Math.pow(10, inLvl / 20) - E.env) * (1 - Math.exp(-dt / Math.max(0.001, tau)));
      const envDb = 20 * Math.log10(Math.max(1e-5, E.env));
      const fl = V.Val(P.env_floor), ce = V.Val(P.env_ceil);
      V.disp[8] = V.Int(P.env_on) ? Math.round(clamp((envDb - fl) / ((ce - fl) || 1)) * 127) : -1;
      V.disp[9] = envDb;
    };
    const Dim = (V, pn, y1) => V.RRect(pn.x, pn.y, pn.w, (y1 || pn.y + pn.h) - pn.y, 5, hex32(0x101014, 0.62));
    spec.Draw = V => {
      const S = V.S, G = V.G, mode = V.Int(P.mode), trigOn = mode !== 1, pitchOn = mode !== 0, sensOff = (V.Val(P.sens) - 50) * 0.2;
      S.flash = S.flash || []; S.lvl = S.lvl || [];
      BANDS.forEach((b, i) => {
        const mx = b.x + MTR.dx, my = MTR.y, mw = MTR.w, mh = MTR.h, on = V.Val(b.on) > 0.5, col = hsv32(V.Hue + b.hue, 0.6, 1, 1);
        const yOf = db => my + mh - (Math.max(MTR.lo, Math.min(MTR.hi, db)) - MTR.lo) / (MTR.hi - MTR.lo) * mh;
        if (V.Disp(3 + i) > 0.5) S.flash[i] = V.now;
        const fl = S.flash[i] != null ? Math.max(0, 1 - (V.now - S.flash[i]) / 0.18) : 0;
        let db = V.Disp(i);
        const prev = S.lvl[i] == null ? -150 : S.lvl[i];
        db = db > prev ? db : Math.max(db, prev - 1.5);
        S.lvl[i] = db;
        V.RRect(mx - 2, my - 2, mw + 4, mh + 4, 3, 0x0f0f14ff);
        if (fl > 0) V.RBox(mx - 3, my - 3, mw + 6, mh + 6, 4, hex32(0xffffff, 0.15 + 0.6 * fl), 1.5);
        for (let d = -48; d <= -12; d += 12) V.Ln(mx, yOf(d), mx + 3, yOf(d), hex32(0xffffff, 0.12));
        const thr = V.Val(b.thr), ty = yOf(thr);
        if (db > MTR.lo) {
          const top = yOf(db), split = Math.max(top, ty);
          V.RRect(mx, split, mw, my + mh - split, 1.5, on ? hsv32(V.Hue + b.hue, 0.5, 0.55, 1) : 0x3a3a44ff);
          if (top < ty) V.RRect(mx, top, mw, ty - top, 1.5, on ? col : 0x55555fff);
        }
        if (fl > 0) V.RRect(mx, my, mw, mh, 1.5, hex32(0xffffff, 0.18 * fl));
        if (Math.abs(sensOff) > 0.05) { const ey = yOf(thr - sensOff); V.Ln(mx, ey, mx + mw, ey, hex32(0xffffff, 0.3)); }
        const bb = V.Btn('thr' + i, mx - 4, my - 4, mw + 8, mh + 8, 'ns-resize');
        const hot = bb.h || bb.a;
        V.Ln(mx - 3, ty, mx + mw + 3, ty, hot ? 0xffffffff : (on ? hsv32(V.Hue + b.hue, 0.3, 1, 1) : 0x77778aff), hot ? 2 : 1.5);
        V.Circ(mx + mw + 4, ty, hot ? 3 : 2.2, hot ? 0xffffffff : col);
        if (bb.a && G.down) {
          const v = MTR.lo + (my + mh - G.my) / mh * (MTR.hi - MTR.lo);
          V.SetVal(b.thr, Math.round(Math.max(MTR.lo, Math.min(MTR.hi, v)) * 10) / 10);
          if (bb.start || G.dy) api.check('thr');
        }
        if (hot) G.tip(b.name + ' threshold ' + thr.toFixed(1) + ' dB' + (Math.abs(sensOff) > 0.05 ? ' (' + (thr - sensOff).toFixed(1) + ' with Sensitivity)' : '') + '\nDrag to set');
      });
      {
        const x0 = 376, y0 = 36, w = 188, h = 46;
        V.RRect(x0, y0, w, h, 4, 0x0f0f14ff);
        const f = V.Disp(6), out = Math.round(V.Disp(7));
        let cents = null;
        if (f > 0) {
          const m = 69 + 12 * Math.log2(f / 440), n = Math.round(m);
          cents = (m - n) * 100;
          V.Txt(x0 + 8, y0 + 5, ndName(n), 16, V.text);
          V.Txt(x0 + 8, y0 + 25, f.toFixed(1) + ' Hz', 7, V.dim);
        } else { V.Txt(x0 + 8, y0 + 5, '--', 16, hex32(0xffffff, 0.25)); V.Txt(x0 + 8, y0 + 25, 'no pitch', 7, hex32(0xffffff, 0.3)); }
        V.Txt(x0 + 8, y0 + 35, 'OUT ' + (out >= 0 ? ndName(out) : '-'), 6.5, out >= 0 ? V.accent : hex32(0xffffff, 0.3));
        const cx = x0 + w - 52, cy = y0 + h - 6, rad = 32;
        S.cents = (S.cents || 0) + ((cents || 0) - (S.cents || 0)) * 0.35;
        const ang = c => -PI / 2 + c / 50 * (PI / 3);
        V.Arc(cx, cy, rad, ang(-50), ang(50), 2, hex32(0xffffff, 0.1));
        V.Arc(cx, cy, rad, ang(-5), ang(5), 2.5, hsv32(0.33, 0.5, 0.9, 0.9));
        for (const c of [-50, -25, 0, 25, 50]) { const a = ang(c); V.Ln(cx + Math.cos(a) * (rad - 4), cy + Math.sin(a) * (rad - 4), cx + Math.cos(a) * (rad + 2), cy + Math.sin(a) * (rad + 2), hex32(0xffffff, c === 0 ? 0.5 : 0.2)); }
        const a = ang(Math.max(-50, Math.min(50, S.cents))), inTune = cents != null && Math.abs(cents) < 5;
        const nc = cents == null ? 0x55555fff : (inTune ? hsv32(0.33, 0.55, 1, 1) : V.accent);
        V.Ln(cx, cy, cx + Math.cos(a) * (rad - 2), cy + Math.sin(a) * (rad - 2), nc, 1.6);
        V.Circ(cx, cy, 2.5, nc);
        V.TxtR(x0 + w - 5, y0 + 4, cents != null ? (cents >= 0 ? '+' : '') + Math.round(cents) + ' ct' : '', 6.5, V.dim);
      }
      {
        const on = V.Val(P.env_on) > 0.5, cc = V.Disp(8);
        const rx = 620, ry = 40, rw = 44, rh = 24;
        V.RRect(rx, ry, rw, rh, 4, 0x0f0f14ff);
        V.TxtC(rx + rw / 2, ry + 4, cc >= 0 ? String(Math.round(cc)) : '--', 12, on ? V.text : hex32(0xffffff, 0.3));
        const bx = 668, by = 40, bw = 10, bh = 156;
        V.RRect(bx - 2, by - 2, bw + 4, bh + 4, 3, 0x0f0f14ff);
        if (cc > 0) { const fh = Math.min(1, cc / 127) * bh; V.RRect(bx, by + bh - fh, bw, fh, 1.5, on ? V.accent : 0x44444fff); }
        const lx = 580, ly = 182, lw = 80, xOf = db => lx + (Math.max(-80, Math.min(0, db)) + 80) / 80 * lw;
        const fl = V.Val(P.env_floor), ce = V.Val(P.env_ceil);
        V.Txt(lx, ly - 10, 'INPUT', 6.5, V.dim);
        V.RRect(lx, ly, lw, 6, 3, hex32(0xffffff, 0.06));
        const a = Math.min(fl, ce), b = Math.max(fl, ce);
        V.RRect(xOf(a), ly, Math.max(1, xOf(b) - xOf(a)), 6, 1, hex32(0xffffff, 0.1));
        const lv = V.Disp(9);
        if (lv > -80) V.RRect(lx, ly + 2, xOf(lv) - lx, 2, 1, on ? V.accentDim : 0x44444fff);
        V.Ln(xOf(fl), ly - 2, xOf(fl), ly + 8, on ? V.accent : V.dim, 1.2);
        V.Ln(xOf(ce), ly - 2, xOf(ce), ly + 8, on ? V.accent : V.dim, 1.2);
      }
      {
        const names = ['Trigger', 'Pitch', 'Both'], cw = 46, ch = 14;
        const x0 = 14 + V.TW('AUDIO TO NOTES', 10) + 128 + 30 + 36;
        V.Txt(x0 - 26, 6, 'MODE', 6.5, V.dim);
        V.RRect(x0 - 1, 2, cw * 3 + 2, ch + 2, 8, 0x1c1c23ff);
        names.forEach((nm, i) => {
          const x = x0 + i * cw, sel = mode === i;
          const b = V.Btn('mode' + i, x, 3, cw, ch, 'pointer');
          if (sel) V.RRect(x, 3, cw, ch, 7, hsv32(V.Hue, 0.55, 0.9, 1)); else if (b.h) V.RRect(x, 3, cw, ch, 7, 0x34343fff);
          V.TxtC(x + cw / 2, 6, nm, 7, sel ? 0x15151aff : V.text);
          if (b.c && !sel) { V.SetVal(P.mode, i); if (i > 0) api.check('mode'); }
          if (b.h) { const d = V.Wheel(x, 3, cw, ch); if (d) V.SetVal(P.mode, Math.max(0, Math.min(2, mode - d))); }
        });
        S.modeX = x0;
      }
      if (!trigOn) { Dim(V, PN_TRIG); Dim(V, PN_SET, 164); V.TxtC(PN_TRIG.x + PN_TRIG.w / 2, PN_TRIG.y + 3, 'not used in Pitch mode', 6.5, 0x77778aff); }
      if (!pitchOn) { Dim(V, PN_PITCH); V.TxtR(PN_PITCH.x + PN_PITCH.w - 6, PN_PITCH.y + 3, 'not used in Trigger mode', 6.5, 0x77778aff); }
    };
    const V = NoteDev(body, api, spec);
    const mx0 = 14 + V.TW('AUDIO TO NOTES', 10) + 128 + 30 + 36;
    TG['midi-audio-to-notes'] = { meter: V.G.anchor(10, 58, 21, 142), mode: V.G.anchor(mx0 - 1, 2, 140, 16), env: V.G.anchor(574 + 118 - 16, 24, 14, 14) };
    return () => V.G.cleanup();
  }
  reg({
    id: 'midi-audio-to-notes', name: 'Audio To Notes', vendor: 'FX Devices', group: 'MIDI',
    width: frameW(696, ndScale(696)), height: frameH(216, ndScale(696)),
    blurb: 'Turns audio into MIDI: drum hits in three bands become trigger notes, a melody becomes pitch notes, and the loudness can drive a CC. Here a drum loop and a sung line play into it while the transport runs.',
    steps: [
      { id: 'thr', text: 'Drag a band\'s threshold line on its meter', why: 'The band fires a note when the level crosses the line. Lower it to catch softer hits.', target: tg('midi-audio-to-notes', 'meter') },
      { id: 'mode', text: 'Switch the mode to <b>Pitch</b> or <b>Both</b>', why: 'Pitch follows the sung line: the readout shows the note and a tuner needle.', target: tg('midi-audio-to-notes', 'mode') },
      { id: 'env', text: 'Turn on <b>Envelope > CC</b> with its power dot', why: 'The input level, between Floor and Ceiling, becomes a CC value from 0 to 127.', target: tg('midi-audio-to-notes', 'env') },
    ],
    notes: [{ title: 'Detector', text: 'Peak fires when a band crosses its threshold. Transient fires on a sharp rise, so swells and sustains don\'t retrigger. Retrig sets the shortest gap between two hits.' }],
    build(body, api) { return buildAudioToNotes(body, api); },
  });

  /* ================================================================== REAPER STOCK FX */
  // src/Functions/Stock FX UI.lua (SFX) and the plugin scripts that call it (ReaComp.lua, ReaEQ.lua, ReaDelay.lua,
  // ReaVerbate.lua, ReaSynth.lua). There is no REAPER here, so each plugin's params are modelled in their display
  // units (normalized 0..1 underneath, as TrackFX_GetParamNormalized). The drawing follows the Lua in content units.
  const SX_H = 216;
  const SX_ACC = { Dynamics: 0xF2B04Cff, EQ: 0x4FC3F7ff, Time: 0xA78BFAff, Pitch: 0x5FE0B8ff, Synth: 0xF472B6ff, Utility: 0x9BA1ABff };
  const SX_BAND = [0xF2B04Cff, 0x7ED957ff, 0x4FC3F7ff, 0xA78BFAff, 0xF472B6ff, 0xFF8A65ff, 0x5FE0B8ff, 0xE6D35Cff];
  const SXC = {
    Body: 0x1A1C20ff, Panel: 0x121317ff, PanelEdge: 0xFFFFFF10, Grid: 0xFFFFFF0A, GridHi: 0xFFFFFF16, Track: 0xFFFFFF12,
    KnobShade: 0x00000059, Knob: 0x2B2E35ff, KnobHi: 0x353943ff, KnobRim: 0xFFFFFF14, Pointer: 0xF2F4F7ff,
    Text: 0xE6E8EBff, TextDim: 0x9BA1ABff, TextMute: 0x6A707Aff, Chip: 0xFFFFFF08, ChipHi: 0xFFFFFF10, ChipEdge: 0xFFFFFF14, Handle: 0xDDE0E5ff,
  };
  const SX_KNOB = { L: 17, M: 14, S: 11 };
  const SX_SC = SC_S;
  const sxW = W => frameW(W, SX_SC), sxHt = () => frameH(SX_H, SX_SC);
  const sxDb = v => v === -Infinity ? '-inf' : v.toFixed(1);
  // SFX.ShortVal: append the unit to a plain number, kHz above 1000 Hz
  function sxShort(s, unit) {
    s = String(s).trim();
    if (unit && s !== '' && !/[a-z]/i.test(s)) {
      const n = parseFloat(s);
      if (unit === 'Hz' && n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + ' kHz';
      return s + ' ' + unit;
    }
    return s;
  }
  // one plugin param. map: lin | log | pow (e) | vol (-inf at 0) | ratio (1..hi, inf at the top) | list
  function sxP(o) {
    const P = Object.assign({ map: 'lin', lo: 0, hi: 1, e: 1 }, o);
    P.toV = n => {
      switch (P.map) {
        case 'log': return P.lo * Math.pow(P.hi / P.lo, n);
        case 'pow': return P.lo + (P.hi - P.lo) * Math.pow(n, P.e);
        case 'vol': return n <= 0.002 ? -Infinity : P.lo + (P.hi - P.lo) * n;
        case 'ratio': return n >= 0.999 ? Infinity : Math.exp(n * Math.log(P.hi));
        case 'list': return Math.round(n * (P.list.length - 1));
        default: return P.lo + (P.hi - P.lo) * n;
      }
    };
    P.toN = v => {
      switch (P.map) {
        case 'log': return clamp(Math.log(v / P.lo) / Math.log(P.hi / P.lo));
        case 'pow': return clamp(Math.pow(clamp((v - P.lo) / (P.hi - P.lo)), 1 / P.e));
        case 'vol': return v === -Infinity ? 0 : clamp((v - P.lo) / (P.hi - P.lo));
        case 'ratio': return v === Infinity ? 1 : clamp(Math.log(Math.max(1, v)) / Math.log(P.hi));
        case 'list': return P.list.length > 1 ? clamp(v / (P.list.length - 1)) : 0;
        default: return clamp((v - P.lo) / (P.hi - P.lo));
      }
    };
    P.n = P.toN(P.def); P.defN = P.n;
    Object.defineProperty(P, 'v', { get() { return P.toV(P.n); }, set(v) { P.n = P.toN(v); } });
    P.on = () => P.n >= 0.5;
    P.str = () => {
      const v = P.v;
      if (P.fmt) return P.fmt(v);
      if (P.map === 'list') return P.list[v];
      if (P.map === 'vol') return sxDb(v);
      return v.toFixed(1);
    };
    return P;
  }
  const sxTgl = (id, def) => sxP({ id, map: 'list', list: ['Off', 'On'], def });
  const sxHz = v => String(Math.round(v));

  // SFX.Begin + the Dev methods, on an IM canvas
  function SXDev(body, spec) {
    const W = spec.W, H = SX_H, sc = SX_SC;
    const G = IM(body, W, H, sc, { bg: c32(SXC.Body), pad: padFor(H, sc) });
    const D = { G, W, H, Acc: spec.Acc, S: {} };
    const chg = P => { spec.onParam && spec.onParam(P); };
    const T = D.Text = (x, y, col, s, sz = 10, al, bold) => G.text(x, y, s, sz, c32(col), al || 'l', bold ? 600 : 400);
    D.TW = (s, sz, bold) => G.tw(s, sz, bold ? 600 : 400);
    D.Rect = (x, y, w, h, col, r, fill, th) => { if (fill === false) G.rectS(x, y, w, h, c32(col), r, th || 1); else G.rect(x, y, w, h, c32(col), r); };
    D.Line = (x1, y1, x2, y2, col, th) => G.ln(x1, y1, x2, y2, c32(col), th || 1);
    D.Dashed = (x1, y1, x2, y2, col, dash = 3, gap = 3) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 1) return;
      const dx = (x2 - x1) / len, dy = (y2 - y1) / len;
      for (let t = 0; t < len; t += dash + gap) { const e = Math.min(t + dash, len); D.Line(x1 + dx * t, y1 + dy * t, x1 + dx * e, y1 + dy * e, col, 1); }
    };
    D.Panel = (x, y, w, h) => { D.Rect(x, y, w, h, SXC.Panel, 6); D.Rect(x, y, w, h, SXC.PanelEdge, 6, false); return [x, y, x + w, y + h]; };
    const stepN = P => P.map === 'list' ? 1 / Math.max(1, P.list.length - 1) : 0.02;
    // arc knob: label above, value below. o: { unit, bipolar, accent, value, dim, tip }
    D.Knob = function (P, cx, cy, size, label, o = {}) {
      const rad = typeof size === 'number' ? size : SX_KNOB[size || 'M'];
      const arcR = rad + 3.5, th = rad >= 15 ? 2.6 : 2.2;
      let b = { h: false, a: false };
      if (P) b = G.drag('k' + P.id, cx - rad - 3, cy - rad - 3, (rad + 3) * 2, (rad + 3) * 2, () => P.n, n => { P.n = n; chg(P); }, { def: P.defN, wheelStep: stepN(P) });
      const lit = b.h || b.a, v = P ? P.n : 0;
      let acc = o.accent || D.Acc;
      if (o.dim || !P) acc = Au(acc, 0.35);
      G.arc(cx, cy, arcR, A0, A1, th, c32(SXC.Track));
      const a = A0 + (A1 - A0) * v;
      if (P) {
        if (o.bipolar) { const m = (A0 + A1) / 2; if (a > m) G.arc(cx, cy, arcR, m, a, th, c32(acc)); else G.arc(cx, cy, arcR, a, m, th, c32(acc)); }
        else G.arc(cx, cy, arcR, A0, a, th, c32(acc));
      }
      G.circ(cx, cy + 1.5, rad + 0.5, c32(SXC.KnobShade));
      G.circ(cx, cy, rad, c32(lit ? SXC.KnobHi : SXC.Knob));
      G.ring(cx, cy, rad - 0.5, c32(SXC.KnobRim), 1);
      if (P) {
        const c = Math.cos(a), s = Math.sin(a);
        G.ln(cx + c * rad * 0.3, cy + s * rad * 0.3, cx + c * (rad - 3), cy + s * (rad - 3), c32(o.dim ? SXC.TextDim : SXC.Pointer), rad >= 15 ? 2.2 : 1.8);
      }
      const lsz = rad >= 15 ? 9 : 8;
      if (label) T(cx, cy - arcR - lsz - 4, lit ? SXC.TextDim : SXC.TextMute, label, lsz, 'c', true);
      const val = o.value || (P ? sxShort(P.str(), o.unit) : '-');
      T(cx, cy + arcR + 3, lit ? SXC.Text : SXC.TextDim, val, rad >= 15 ? 10 : 9, 'c');
      if (b.h && o.tip) G.tip(o.tip);
      return b;
    };
    // vertical fader (ImGui VSlider underneath: click jumps, drag follows)
    D.Fader = function (P, cx, y, h, label, o = {}) {
      const b = G.btn('f' + P.id, cx - 9, y, 18, h, 'ns-resize');
      if (b.a) { const n = clamp((y + h - 4 - G.my) / (h - 8)); if (n !== P.n) { P.n = n; chg(P); } }
      if (b.h) {
        const wv = G.useWheel(cx - 9, y, 18, h);
        if (wv) { P.n = clamp(P.n + wv * 0.02); chg(P); }
        if (G.dbl) { P.n = P.defN; chg(P); }
      }
      const lit = b.h || b.a, act = b.a, v = P.n;
      const acc = o.accent || D.Acc, X = cx, Tp = y, B = y + h;
      D.Rect(X - 2, Tp, 4, h, 0x0B0C0Eff, 2);
      const hy = B - (h - 8) * v - 4;
      if (o.bipolar) {
        const my = Tp + h / 2;
        G.rect(X - 2, Math.min(hy, my), 4, Math.abs(hy - my), A(acc, lit ? 0.95 : 0.8), 2);
        D.Line(X - 7, my, X + 7, my, SXC.TextMute);
      } else G.rect(X - 2, hy, 4, B - hy, A(acc, lit ? 0.95 : 0.8), 2);
      D.Rect(X - 8, hy - 2, 16, 7, SXC.KnobShade, 3);
      D.Rect(X - 8, hy - 3.5, 16, 7, lit ? 0xFFFFFFff : SXC.Handle, 3);
      D.Line(X - 4, hy, X + 4, hy, 0x1A1C20ff);
      if (label) T(cx, y + h + 5, lit ? SXC.TextDim : SXC.TextMute, label, 8, 'c', true);
      T(cx, y - 13, act ? SXC.Text : SXC.TextDim, o.value || sxShort(P.str(), o.unit), 9, 'c');
      return b;
    };
    // slim horizontal bar (ImGui slider underneath)
    D.Bar = function (P, x, y, w, h, label, o = {}) {
      const b = G.btn('b' + P.id, x, y, w, h, 'ew-resize');
      if (b.a) { const n = clamp((G.mx - x - 1) / (w - 2)); if (n !== P.n) { P.n = n; chg(P); } }
      if (b.h) {
        const wv = G.useWheel(x, y, w, h);
        if (wv) { P.n = clamp(P.n + wv * 0.02); chg(P); }
        if (G.dbl) { P.n = P.defN; chg(P); }
      }
      const lit = b.h || b.a, act = b.a, v = P.n;
      let acc = o.accent || D.Acc;
      if (o.dim) acc = Au(acc, 0.35);
      D.Rect(x, y, w, h, lit ? SXC.ChipHi : SXC.Chip, 4);
      D.Rect(x, y, w, h, act ? Au(acc, 0.6) : SXC.ChipEdge, 4, false);
      if (v > 0.001) {
        const fw = Math.max((w - 2) * v, 3);
        G.rect(x + 1, y + 1, fw, h - 2, A(acc, lit ? 0.2 : 0.13), 3);
        G.rect(x + 1 + fw - 1.5, y + 3, 1.5, h - 6, A(acc, lit ? 1 : 0.8));
      }
      const ty = y + (h - 9) / 2 - 1;
      T(x + 6, ty + 0.5, lit ? SXC.TextDim : SXC.TextMute, label, 8, 'l', true);
      T(x + w - 6, ty, lit ? SXC.Text : (o.dim ? SXC.TextMute : SXC.TextDim), o.value || sxShort(P.str(), o.unit), 9, 'r');
      return b;
    };
    // pill toggle with an LED dot; flips P, or calls o.onClick
    D.Toggle = function (P, x, y, w, label, o = {}) {
      const on = o.on != null ? o.on : (P && P.on());
      const h = o.h || 17;
      const b = G.btn('t' + label + (P ? P.id : ''), x, y, w, h, 'pointer');
      const acc = o.accent || D.Acc;
      D.Rect(x, y, w, h, on ? Au(acc, 0.16) : (b.h ? SXC.ChipHi : SXC.Chip), h / 2);
      D.Rect(x, y, w, h, on ? Au(acc, 0.7) : SXC.ChipEdge, h / 2, false);
      G.circ(x + 8.5, y + h / 2, 2.6, c32(on ? acc : 0x4C515Bff));
      if (on) G.ring(x + 8.5, y + h / 2, 4.5, A(acc, 0.3), 1.5);
      T(x + 16, y + (h - 9) / 2 - 0.5, on ? (o.textOn || SXC.Text) : (b.h ? SXC.Text : SXC.TextDim), label, 9, 'l', true);
      if (b.c) { if (o.onClick) o.onClick(); else if (P) { P.n = on ? 0 : 1; chg(P); } }
      if (b.h && o.tip) G.tip(o.tip);
      return b;
    };
    // drop-down chip. o: { label, h, value, items: [{ label, on, pick }] }
    D.Choice = function (id, x, y, w, o = {}) {
      const h = o.h || 18;
      const b = G.btn('c' + id, x, y, w, h, 'pointer');
      D.Rect(x, y, w, h, b.h ? SXC.ChipHi : SXC.Chip, 4);
      D.Rect(x, y, w, h, SXC.ChipEdge, 4, false);
      let tx = x + 7;
      if (o.label) { T(tx, y + (h - 8) / 2 - 0.5, SXC.TextMute, o.label, 8, 'l', true); tx += D.TW(o.label, 8, true) + 6; }
      T(tx, y + (h - 10) / 2 - 1, SXC.Text, o.value, 10);
      const cx = x + w - 9, cy = y + h / 2;
      G.tri(cx - 3, cy - 1.5, cx + 3, cy - 1.5, cx, cy + 2, c32(SXC.TextDim));
      if (b.c) G.menu(x, y, w, h, o.items);
      return b;
    };
    // tab chips; returns [sel, endX]. items: [[label, clr, dim]]
    D.Tabs = function (id, x, y, items, sel, o = {}) {
      const h = o.h || 18, gap = 4;
      let cx = x;
      items.forEach((it, i) => {
        const w = o.w || (D.TW(it[0], 9, true) + (it[1] ? 22 : 14));
        const b = G.btn(id + i, cx, y, w, h, 'pointer');
        const on = i === sel;
        D.Rect(cx, y, w, h, on ? 0xFFFFFF1A : (b.h ? SXC.ChipHi : SXC.Chip), 4);
        if (on) D.Rect(cx, y, w, h, 0xFFFFFF30, 4, false);
        let tx = cx + w / 2;
        if (it[1]) { G.circ(cx + 8, y + h / 2, 3, c32(it[2] ? Au(it[1], 0.3) : it[1])); tx += 4; }
        T(tx, y + (h - 9) / 2 - 0.5, on ? SXC.Text : (it[2] ? SXC.TextMute : SXC.TextDim), it[0], 9, 'c', true);
        if (b.c) sel = i;
        cx += w + gap;
      });
      return [sel, cx];
    };
    D.Meter = function (x, y, w, h, v, col, o = {}) {
      v = clamp(v || 0);
      D.Rect(x, y, w, h, 0x0B0C0Eff, 2);
      if (v > 0.001) { if (o.fromTop) G.rect(x, y, w, h * v, c32(col), 2); else G.rect(x, y + h * (1 - v), w, h * v, c32(col), 2); }
      if (o.label) T(x + w / 2, y + h + 5, SXC.TextMute, o.label, 8, 'c', true);
    };
    const holdV = {};
    D.Hold = (key, v, rate = 0.02) => { let p = holdV[key] || 0; p = v >= p ? v : Math.max(v, p - rate); holdV[key] = p; return p; };
    return D;
  }

  /* ---------------------------------------------------------------- ReaComp */
  // the demo input: kick on every beat, snare on 2 and 4, an eighth-note bass and 16th hats, on FXD.clock.
  // Each part has a main frequency, so the detector's Hipass / Lowpass change what the compressor hears.
  const RC_PARTS = [{ f: 55 }, { f: 110 }, { f: 1800 }, { f: 9000 }];
  function rcParts(b, spb, out) {
    const t1 = (b % 1) * spb, t2 = (b % 2) >= 1 ? ((b % 2) - 1) * spb : 9, t8 = (b % 0.5) * spb, t16 = (b % 0.25) * spb;
    out[0] = 0.3 * Math.exp(-t1 / 0.11);
    out[1] = (b % 0.5) < 0.42 ? 0.13 * (0.55 + 0.45 * Math.exp(-t8 / 0.15)) : 0.01;
    out[2] = 0.22 * Math.exp(-t2 / 0.13);
    out[3] = 0.05 * Math.exp(-t16 / 0.025);
    return out;
  }
  const rcHP = (f, fc) => 1 / Math.sqrt(1 + Math.pow(fc / f, 4)), rcLP = (f, fc) => 1 / Math.sqrt(1 + Math.pow(f / fc, 4));

  function buildReaComp(body, api) {
    const ID = 'rea-comp';
    const P = {
      thr: sxP({ id: 'thr', lo: -60, hi: 0, def: -20 }),
      ratio: sxP({ id: 'ratio', map: 'ratio', hi: 100, def: 6.7, fmt: v => v === Infinity ? 'inf:1' : v.toFixed(1) + ':1' }),
      att: sxP({ id: 'att', map: 'pow', lo: 0, hi: 500, e: 4, def: 0.5 }),
      rel: sxP({ id: 'rel', map: 'pow', lo: 0, hi: 5000, e: 4, def: 30, fmt: v => v.toFixed(0) }),
      pre: sxP({ id: 'pre', lo: 0, hi: 250, def: 0 }),
      rms: sxP({ id: 'rms', map: 'pow', lo: 0, hi: 250, e: 2, def: 25 }),
      knee: sxP({ id: 'knee', lo: 0, hi: 24, def: 6 }),
      hp: sxP({ id: 'hp', map: 'log', lo: 20, hi: 22100, def: 20, fmt: sxHz }),
      lp: sxP({ id: 'lp', map: 'log', lo: 20, hi: 22100, def: 22100, fmt: sxHz }),
      sig: sxP({ id: 'sig', map: 'list', list: ['Main L+R', 'Aux L+R'], def: 0 }),
      wet: sxP({ id: 'wet', map: 'vol', lo: -60, hi: 12, def: 0 }),
      dry: sxP({ id: 'dry', map: 'vol', lo: -60, hi: 12, def: -Infinity }),
      prev: sxTgl('prev', 0), mkup: sxTgl('mkup', 1), arel: sxTgl('arel', 0), lim: sxTgl('lim', 0),
    };
    const D = SXDev(body, {
      W: 326, Acc: SX_ACC.Dynamics,
      onParam: p => {
        if (p === P.att && P.att.v >= 20) api.check('attack');
        if (p === P.hp && P.hp.v >= 150) api.check('hipass');
        if (p === P.arel && P.arel.on()) api.check('auto');
      },
    });
    const G = D.G, C = SXC, Acc = D.Acc, S = D.S;
    const GW = 126, LO = -60, HI = 0;
    const [L, Tp, R, B] = [8, 8, 8 + GW, 8 + GW];
    TG[ID] = { graph: G.anchor(L, Tp, GW, GW), att: G.anchor(146, 74, 52, 52), hp: G.anchor(8, 156, GW, 15), arel: G.anchor(258, 138, 68, 15) };
    const parts = [0, 0, 0, 0], det = { pow: 0, gr: 0, inDb: -150 };
    const PX = db => L + (db - LO) / (HI - LO) * (R - L);
    const PY = db => B - (clamp(db, LO, HI) - LO) / (HI - LO) * (B - Tp);

    function sim(dt, clock) {
      const thr = P.thr.v, ratio = Math.min(P.ratio.v, 1000), knee = P.knee.v;
      const spb = 60 / clock.bpm;
      let inAmp = 0, dAmp = 0;
      if (clock.playing) {
        rcParts(clock.beat, spb, parts);
        for (const a of parts) inAmp += a;
        // the detector looks ahead by Pre-comp, through its Hipass / Lowpass
        rcParts(clock.beat + P.pre.v / 1000 / spb, spb, parts);
        const hp = P.hp.v, lp = P.lp.v;
        parts.forEach((a, i) => { dAmp += a * rcHP(RC_PARTS[i].f, hp) * rcLP(RC_PARTS[i].f, lp); });
        if (P.sig.v === 1) dAmp = 0; // nothing on the sidechain input in this demo
      }
      det.inDb = inAmp > 0 ? 20 * Math.log10(inAmp) : -150;
      const rms = P.rms.v;
      if (rms > 0.5) { det.pow += (dAmp * dAmp - det.pow) * (1 - Math.exp(-dt * 1000 / rms)); }
      else det.pow = dAmp * dAmp;
      const dDb = det.pow > 1e-12 ? 10 * Math.log10(det.pow) + (rms > 0.5 ? 3 : 0) : -150;
      const tgt = Math.max(0, dDb - rcOut(dDb, thr, ratio, knee));
      const tau = tgt > det.gr ? Math.max(0.05, P.att.v) : (P.arel.on() ? 50 + 25 * det.gr : Math.max(1, P.rel.v));
      det.gr += (tgt - det.gr) * (1 - Math.exp(-dt * 1000 / tau));
    }

    G.frame((G, dt, clock) => {
      sim(dt, clock);
      const thr = P.thr.v;
      let ratio = P.ratio.v; if (ratio === Infinity) ratio = 1000; ratio = Math.max(ratio, 1);
      const knee = Math.max(P.knee.v, 0);
      const Out = i => rcOut(i, thr, ratio, knee);
      // ---- transfer curve
      D.Panel(L, Tp, GW, GW);
      for (let db = -48; db <= -12; db += 12) { D.Line(PX(db), Tp + 1, PX(db), B - 1, C.Grid); D.Line(L + 1, PY(db), R - 1, PY(db), C.Grid); }
      D.Dashed(PX(LO), PY(LO), PX(HI), PY(HI), C.GridHi, 3, 3);
      if (thr > LO && thr < HI) D.Dashed(PX(thr), Tp + 2, PX(thr), B - 2, Au(Acc, 0.35), 2, 3);
      const pts = [];
      for (let i = 0; i <= 60; i++) { const db = LO + (HI - LO) * i / 60; pts.push([PX(db), PY(Out(db))]); }
      G.area(pts, B - 1, A(Acc, 0.07));
      G.pline(pts, c32(Acc), 2);
      if (det.inDb > LO) {
        const i = Math.min(det.inDb, HI);
        G.circ(PX(i), PY(Out(i)), 5, A(Acc, 0.25));
        G.circ(PX(i), PY(Out(i)), 3, '#fff');
      }
      D.Text(15, 14, C.TextMute, 'IN / OUT', 8, 'l', true);
      const rTxt = ratio >= 100 ? '∞ : 1' : ratio.toFixed(1).replace(/\.0$/, '') + ' : 1';
      D.Text(GW + 1, 14, C.TextDim, rTxt, 9, 'r');
      // drag the graph: left / right = threshold, up / down = ratio
      const gb = G.btn('graph', L, Tp, R - L, B - Tp, 'move');
      if (gb.start) S.GD = { mx: G.mx, my: G.my, thr: clamp(thr, LO, HI), ratio: P.ratio.v === Infinity ? 100 : P.ratio.v, moved: false };
      if (gb.a && S.GD && (S.GD.moved || Math.hypot(G.mx - S.GD.mx, G.my - S.GD.my) > 1)) {
        S.GD.moved = true;
        P.thr.v = clamp(S.GD.thr + (G.mx - S.GD.mx) * (HI - LO) / (R - L), LO, HI);
        const rv = Math.exp(Math.log(Math.max(S.GD.ratio, 1)) + (S.GD.my - G.my) * 0.8 * 0.012);
        P.ratio.v = rv >= 100 ? Infinity : Math.max(rv, 1);
        api.check('curve');
      }
      if (gb.h || gb.a) {
        D.Rect(L, Tp, R - L, B - Tp, Au(Acc, 0.35), 6, false);
        G.tip('Threshold ' + P.thr.str() + ' dB · Ratio ' + P.ratio.str() + '\nDrag: left / right = threshold, up / down = ratio');
      }
      // ---- detector (under the curve)
      const BH = 15, BG = 3, LY = GW + 12, RowY = n => LY + (BH + BG) * (n - 1);
      D.Choice('sig', 8, RowY(1), GW, { label: 'DETECT', h: BH, value: P.sig.str(), items: P.sig.list.map((nm, i) => ({ label: nm, on: P.sig.v === i, pick: () => { P.sig.v = i; } })) });
      D.Bar(P.hp, 8, RowY(2), GW, BH, 'HIPASS', { unit: 'Hz' });
      D.Bar(P.lp, 8, RowY(3), GW, BH, 'LOWPASS', { unit: 'Hz' });
      D.Toggle(P.prev, 8, RowY(4), GW, 'LISTEN TO DETECTOR', { h: BH, tip: 'Preview the Hipass / Lowpass filtered detector signal' });
      // ---- main knobs + secondary bars
      const MX = 146, MW = 104, K1 = MX + 24, K2 = MX + MW - 24, R1 = 36, R2 = 104;
      D.Knob(P.thr, K1, R1, 'M', 'THRESH', { unit: 'dB' });
      D.Knob(P.ratio, K2, R1, 'M', 'RATIO');
      D.Knob(P.att, K1, R2, 'M', 'ATTACK', { unit: 'ms' });
      D.Knob(P.rel, K2, R2, 'M', 'RELEASE', { unit: 'ms', dim: P.arel.on(), value: P.arel.on() ? 'AUTO' : null });
      D.Bar(P.knee, MX, RowY(1), MW, BH, 'KNEE', { unit: 'dB' });
      D.Bar(P.pre, MX, RowY(2), MW, BH, 'PRE-COMP', { unit: 'ms' });
      D.Bar(P.rms, MX, RowY(3), MW, BH, 'RMS', { unit: 'ms' });
      // ---- gain reduction + wet / dry + switches
      const RX = 258, MT = 22, MH = 102;
      const gr = det.gr, grH = D.Hold('gr', Math.min(gr / 24, 1), 0.01);
      D.Text(RX + 4, MT - 13, gr > 0.05 ? C.Text : C.TextMute, (-gr).toFixed(1), 9, 'c');
      D.Meter(RX, MT, 8, MH, Math.min(gr / 24, 1), Au(Acc, 0.85), { fromTop: true, label: 'GR' });
      if (grH > 0.002) D.Rect(RX, MT + MH * grH - 1, 8, 2, Acc);
      D.Fader(P.wet, RX + 29, MT, MH, 'WET');
      D.Fader(P.dry, RX + 54, MT, MH, 'DRY');
      const SW = 326 - RX;
      D.Toggle(P.arel, RX, RowY(1), SW, 'AUTO REL', { h: BH, tip: 'Program-dependent release' });
      D.Toggle(P.mkup, RX, RowY(2), SW, 'MAKEUP', { h: BH, tip: 'Auto make-up gain' });
      D.Toggle(P.lim, RX, RowY(3), SW, 'LIMIT', { h: BH, tip: 'Limit output' });
    });
    return () => G.cleanup();
  }
  // static curve, dB in -> dB out (ReaComp.lua Out)
  function rcOut(i, thr, ratio, knee) {
    const over = i - thr;
    if (knee > 0 && Math.abs(over) <= knee / 2) return i + (1 / ratio - 1) * Math.pow(over + knee / 2, 2) / (2 * knee);
    if (over > 0) return thr + over / ratio;
    return i;
  }

  const SX_OTHERS = { title: 'Other stock FX', text: 'The same look is used for ReaComp, ReaEQ, ReaDelay, ReaVerbate and ReaSynth (shown here) and also for ReaGate, ReaLimit, ReaXcomp, ReaPitch, ReaVocode, ReaVoice and ReaInsert. Each layout has its own display: a gate curve, a gain-reduction history, a band map, a pitch scale.' };
  const SX_REAL = { title: 'Real params', text: 'Every knob, bar and fader is an FX Devices param on top of the drawing, so modulation, linking and the right-click menu work on them as on any other device. Double-click one to reset it.' };

  reg({
    id: 'rea-comp', name: 'ReaComp', vendor: 'Cockos', group: 'REAPER',
    width: sxW(326), height: sxHt(),
    blurb: 'REAPER\'s compressor with a drawn transfer curve, the detector under it and a gain-reduction meter. A drum and bass loop plays into it while the transport runs.',
    steps: [
      { id: 'curve', text: 'Drag the curve: left or right sets the threshold, up or down the ratio', why: 'The white dot is the input level riding the curve. The GR meter shows how much it is turned down.', target: tg('rea-comp', 'graph') },
      { id: 'attack', text: 'Turn <b>Attack</b> up to 20 ms or more', why: 'The compressor now reacts later to each kick, so less of the hit is turned down. The GR meter moves less.', target: tg('rea-comp', 'att') },
      { id: 'hipass', text: 'Drag the detector\'s <b>HIPASS</b> bar above 150 Hz', why: 'The detector stops hearing the kick and bass, so the snare sets the gain reduction.', target: tg('rea-comp', 'hp') },
      { id: 'auto', text: 'Turn on <b>AUTO REL</b>', why: 'The release then follows the material and the Release knob shows AUTO.', target: tg('rea-comp', 'arel') },
    ],
    notes: [SX_REAL, SX_OTHERS],
    build(body, api) { return buildReaComp(body, api); },
  });

  /* ---------------------------------------------------------------- ReaEQ */
  const RE_TYPES = [['Low Shelf', 0, 'LS'], ['High Shelf', 1, 'HS'], ['Band', 8, 'B'], ['Band (alt)', 9, 'B'], ['Band (alt 2)', 2, 'B'],
    ['Low Pass', 3, 'LP'], ['High Pass', 4, 'HP'], ['All Pass', 5, 'AP'], ['Notch', 6, 'N'], ['Band Pass', 7, 'BP'], ['Parallel Band Pass', 10, 'PB']];
  const RE_TYPE_BY = {}; RE_TYPES.forEach(t => { RE_TYPE_BY[t[1]] = t; });
  const RE_FS = 48000;
  // RBJ biquads at 48 kHz, bandwidth in octaves (ReaEQ.lua Coefs)
  function reCoefs(t, f0, g, bw) {
    f0 = clamp(f0 || 1000, 10, RE_FS * 0.49); bw = Math.max(bw || 1, 0.01);
    const w0 = TAU * f0 / RE_FS, cw = Math.cos(w0), sw = Math.sin(w0);
    const u = Math.log(2) / 2 * bw * w0 / sw, alpha = sw * (Math.exp(u) - Math.exp(-u)) / 2, Ag = Math.pow(10, (g || 0) / 40);
    let b0, b1, b2, a0, a1, a2;
    if (t === 0 || t === 1) {
      const sa = 2 * Math.sqrt(Ag) * alpha;
      if (t === 0) {
        b0 = Ag * ((Ag + 1) - (Ag - 1) * cw + sa); b1 = 2 * Ag * ((Ag - 1) - (Ag + 1) * cw); b2 = Ag * ((Ag + 1) - (Ag - 1) * cw - sa);
        a0 = (Ag + 1) + (Ag - 1) * cw + sa; a1 = -2 * ((Ag - 1) + (Ag + 1) * cw); a2 = (Ag + 1) + (Ag - 1) * cw - sa;
      } else {
        b0 = Ag * ((Ag + 1) + (Ag - 1) * cw + sa); b1 = -2 * Ag * ((Ag - 1) + (Ag + 1) * cw); b2 = Ag * ((Ag + 1) + (Ag - 1) * cw - sa);
        a0 = (Ag + 1) - (Ag - 1) * cw + sa; a1 = 2 * ((Ag - 1) - (Ag + 1) * cw); a2 = (Ag + 1) - (Ag - 1) * cw - sa;
      }
    } else if (t === 3) { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
    else if (t === 4) { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
    else if (t === 6) { b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
    else if (t === 7 || t === 10) { b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
    else if (t === 5) return null;
    else { b0 = 1 + alpha * Ag; b1 = -2 * cw; b2 = 1 - alpha * Ag; a0 = 1 + alpha / Ag; a1 = -2 * cw; a2 = 1 - alpha / Ag; }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  function reMag(c, f) {
    if (!c) return 0;
    const w = TAU * f / RE_FS, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = c[0] + c[1] * c1 + c[2] * c2, ni = -(c[1] * s1 + c[2] * s2), dr = 1 + c[3] * c1 + c[4] * c2, di = -(c[3] * s1 + c[4] * s2);
    return 10 * Math.log10(Math.max((nr * nr + ni * ni) / Math.max(dr * dr + di * di, 1e-20), 1e-12));
  }
  const reHz = v => v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + 'k' : v.toFixed(1);

  function buildReaEQ(body, api) {
    const ID = 'rea-eq';
    let nb = 0;
    const band = (type, hz, db, bw) => {
      const i = nb++;
      return {
        i, type, on: true,
        f: sxP({ id: 'f' + i, map: 'log', lo: 20, hi: 24000, def: hz, fmt: v => v.toFixed(1) }),
        g: sxP({ id: 'g' + i, lo: -24, hi: 24, def: db }),
        q: sxP({ id: 'q' + i, lo: 0.01, hi: 4, def: bw, fmt: v => v.toFixed(2) }),
      };
    };
    const bands = [band(4, 46.8, 0, 1.41), band(0, 105, 1.5, 2), band(8, 450, -2.5, 1.2), band(8, 2200, 2, 1), band(1, 6500, -1, 2)];
    const gain = sxP({ id: 'gain', lo: -24, hi: 24, def: 0 });
    const S = { sel: 0, msg: null, now: 0, off: [0, 0] };
    const D = SXDev(body, {
      W: 492, Acc: SX_ACC.EQ,
      onParam: p => { if (/^q/.test(p.id)) api.check('bw'); },
    });
    const G = D.G, C = SXC, Acc = D.Acc;
    const PX0 = 8, PY0 = 8, PW = 440, PH = 136;
    const L = PX0, Tp = PY0, R = PX0 + PW, B = PY0 + PH;
    TG[ID] = { plot: G.anchor(L, Tp, PW, PH), type: G.anchor(60, 175, 124, 18), bw: G.anchor(377, 165, 34, 34) };
    const F_LO = 20, F_HI = 20000, RANGE = 24, LR = Math.log(F_HI / F_LO), MIDY = (Tp + B) / 2;
    const XF = f => L + Math.log(clamp(f, F_LO, F_HI) / F_LO) / LR * (R - L);
    const FX_ = x => F_LO * Math.exp((x - L) / (R - L) * LR);
    const YG = g => MIDY - clamp(g, -RANGE * 1.1, RANGE * 1.1) / RANGE * (PH / 2 - 8);
    const GY = y => (MIDY - y) / (PH / 2 - 8) * RANGE;
    const HasGain = b => b.type === 0 || b.type === 1 || b.type === 8 || b.type === 9 || b.type === 2;
    const NodeY = b => HasGain(b) ? YG(b.g.v) : MIDY;

    G.frame((G, dt) => {
      S.now += dt;
      D.Panel(PX0, PY0, PW, PH);
      G.clip(L, Tp, PW, PH, 6);
      for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
        const hi = f === 100 || f === 1000 || f === 10000;
        D.Line(XF(f), Tp + 1, XF(f), B - 1, hi ? C.GridHi : C.Grid);
        D.Text(XF(f) + 3, PH - 4, C.TextMute, f >= 1000 ? (f / 1000) + 'k' : String(f), 8);
      }
      for (const g of [-18, -12, -6, 6, 12, 18]) D.Line(L + 1, YG(g), R - 1, YG(g), C.Grid);
      D.Line(L + 1, MIDY, R - 1, MIDY, C.GridHi);
      for (const g of [12, -12]) D.Text(PX0 + 5, YG(g) - 10, C.TextMute, (g > 0 ? '+' : '') + g, 8);
      // band state
      for (const b of bands) { b.clr = SX_BAND[b.i % SX_BAND.length]; b.c = b.on ? reCoefs(b.type, b.f.v, b.g.v, b.q.v) : null; }
      // sample points every 2 px, plus extra points around each band's centre (narrow bells)
      const xs = [];
      for (let x = L; x <= R; x += 2) xs.push(x);
      xs.push(R);
      for (const b of bands) if (b.c) { const half = Math.max(b.q.v, 0.001) / 2; for (let k = -8; k <= 8; k++) xs.push(XF(b.f.v * Math.pow(2, half * k / 4))); }
      xs.sort((a, b) => a - b);
      const pts = []; let last = null;
      for (const x of xs) if (x >= L && x <= R && (last == null || x - last > 0.05)) { pts.push(x); last = x; }
      const sel = bands[S.sel];
      if (sel.c) G.area(pts.map(x => [x, YG(reMag(sel.c, FX_(x)))]), MIDY, A(sel.clr, 0.12));
      const sum = pts.map(x => { const f = FX_(x); let v = gain.v; for (const b of bands) if (b.c) v += reMag(b.c, f); return [x, YG(v)]; });
      G.area(sum, MIDY, A(Acc, 0.08));
      G.pline(sum, c32(Acc), 2);
      G.unclip();
      // nodes: drag = freq + gain, wheel = bandwidth, double-click = band on / off
      let overNode = false;
      for (const b of bands) {
        const x = XF(b.f.v), y = NodeY(b);
        const nb_ = G.btn('node' + b.i, x - 8, y - 8, 16, 16, 'move');
        if (nb_.h || nb_.a) overNode = true;
        if (nb_.start) { S.sel = b.i; S.off = [G.mx - x, G.my - y]; S.dragged = false; }
        if (nb_.h && G.dbl) { b.on = !b.on; }
        else if (nb_.a && (G.dx || G.dy)) {
          const hz = FX_(clamp(G.mx - S.off[0], L, R));
          b.f.v = hz;
          if (HasGain(b)) b.g.v = clamp(GY(G.my - S.off[1]), -RANGE, RANGE);
          api.check('drag');
        }
        if (nb_.h) {
          const wv = G.useWheel(x - 8, y - 8, 16, 16);
          if (wv) { b.q.n = clamp(b.q.n + wv * 0.01); api.check('bw'); }
          G.tip('Band ' + (b.i + 1) + ' · ' + RE_TYPE_BY[b.type][0] + '\n' + sxShort(b.f.str(), 'Hz') + (HasGain(b) ? '  ' + b.g.str() + ' dB' : '') + '  ' + b.q.str() + ' oct');
        }
        const rad = nb_.h || nb_.a ? 7.5 : 6.5;
        if (b === bands[S.sel]) G.ring(x, y, rad + 3, A(b.clr, 0.45), 1.5);
        G.circ(x, y + 1, rad, c32(SXC.KnobShade));
        G.circ(x, y, rad, c32(b.on ? b.clr : 0x3A3E46ff));
        D.Text(x, y - 5, b.on ? 0x121317ff : C.TextDim, String(b.i + 1), 9, 'c', true);
      }
      // double-click on an empty spot: add a Band there
      const bg = G.btn('eqbg', L, Tp, PW, PH);
      if (!overNode && bg.h && G.dbl) {
        if (bands.length < 16) {
          const b = band(8, FX_(G.mx), clamp(GY(G.my), -RANGE, RANGE), 1);
          bands.push(b); S.sel = b.i;
          api.check('add');
        } else S.msg = { t: S.now, txt: 'All bands are in use: add one in the ReaEQ window' };
      }
      if (S.msg) { if (S.now - S.msg.t > 3) S.msg = null; else D.Text(PX0 + PW - 8, PY0 + 6, C.TextDim, S.msg.txt, 9, 'r'); }
      // ---- the selected band
      const sb = bands[S.sel];
      D.Toggle(null, 8, 176, 46, 'ON', { on: sb.on, accent: sb.clr, onClick: () => { sb.on = !sb.on; } });
      D.Choice('type', 60, 175, 124, {
        value: RE_TYPE_BY[sb.type][0],
        items: RE_TYPES.map(t => ({ label: t[0], on: t[1] === sb.type, pick: () => { sb.type = t[1]; api.check('type'); } })),
      });
      G.circ(11, 160.5, 3, c32(sb.clr));
      D.Text(19, 156, C.TextMute, 'BAND ' + (sb.i + 1), 9, 'l', true);
      D.Knob(sb.f, 262, 182, 'M', 'FREQ', { unit: 'Hz', accent: sb.clr });
      D.Knob(sb.g, 328, 182, 'M', 'GAIN', { unit: 'dB', bipolar: true, accent: sb.clr, dim: !HasGain(sb) });
      D.Knob(sb.q, 394, 182, 'M', 'BANDWIDTH', { unit: 'oct', accent: sb.clr });
      // ---- global gain
      D.Fader(gain, 474, 22, 160, 'GAIN', { unit: 'dB', bipolar: true });
    });
    return () => G.cleanup();
  }
  void reHz;

  reg({
    id: 'rea-eq', name: 'ReaEQ', vendor: 'Cockos', group: 'REAPER',
    width: sxW(492), height: sxHt(),
    blurb: 'REAPER\'s EQ as a response curve with a node per band. Click a node to select its band and edit it below.',
    steps: [
      { id: 'drag', text: 'Drag a numbered node: left or right is frequency, up or down is gain', why: 'The blue line is the sum of all bands. The selected band\'s own curve is filled in its colour.', target: tg('rea-eq', 'plot') },
      { id: 'bw', text: 'Wheel over a node to change its bandwidth, or turn <b>BANDWIDTH</b>', why: 'Bandwidth is in octaves, as ReaEQ shows it.', target: tg('rea-eq', 'bw') },
      { id: 'type', text: 'Pick another type for the selected band, like <b>Notch</b>', why: 'Pass, notch and band pass types have no gain, so their node stays on the 0 dB line and Gain dims.', target: tg('rea-eq', 'type') },
      { id: 'add', text: 'Double-click an empty spot in the graph to add a band', why: 'Double-click a node to switch its band off or on.', target: tg('rea-eq', 'plot') },
    ],
    notes: [SX_REAL, { title: 'Band types', text: 'The type list is ReaEQ\'s own: shelves, three band variants, low and high pass, all pass, notch, band pass and parallel band pass.' }],
    build(body, api) { return buildReaEQ(body, api); },
  });

  /* ---------------------------------------------------------------- ReaDelay */
  function buildReaDelay(body, api) {
    const ID = 'rea-delay';
    const tap = (n, o) => ({
      n,
      on: sxTgl('on' + n, 1),
      time: sxP({ id: 'time' + n, map: 'pow', lo: 0, hi: 10000, e: 2, def: o.time }),
      beats: sxP({ id: 'beats' + n, lo: 0, hi: 16, def: o.beats || 0, fmt: v => v.toFixed(2) }),
      fb: sxP({ id: 'fb' + n, map: 'vol', lo: -60, hi: 12, def: o.fb }),
      lp: sxP({ id: 'lp' + n, map: 'log', lo: 20, hi: 22050, def: o.lp, fmt: sxHz }),
      hp: sxP({ id: 'hp' + n, map: 'log', lo: 20, hi: 22050, def: 20, fmt: sxHz }),
      bits: sxP({ id: 'bits' + n, lo: 1, hi: 24, def: o.bits, fmt: v => String(Math.round(v)) }),
      width: sxP({ id: 'width' + n, lo: -1, hi: 1, def: 0, fmt: v => v.toFixed(2) }),
      vol: sxP({ id: 'vol' + n, map: 'vol', lo: -60, hi: 12, def: o.vol }),
      pan: sxP({ id: 'pan' + n, lo: -1, hi: 1, def: 0, fmt: v => Math.abs(v) < 0.005 ? 'center' : Math.round(Math.abs(v) * 100) + '%' + (v < 0 ? 'L' : 'R') }),
    });
    const taps = [tap(1, { time: 250, fb: -20.8, lp: 5400, bits: 19, vol: -9.6 }), tap(2, { time: 750, fb: -Infinity, lp: 22050, bits: 24, vol: -14 })];
    const wet = sxP({ id: 'wet', map: 'vol', lo: -60, hi: 12, def: -5.7 }), dry = sxP({ id: 'dry', map: 'vol', lo: -60, hi: 12, def: -1.9 });
    const S = { sel: 0 };
    const D = SXDev(body, {
      W: 504, Acc: SX_ACC.Time,
      onParam: p => { if (/^(time|beats)/.test(p.id)) api.check('time'); if (/^fb/.test(p.id)) api.check('fb'); },
    });
    const G = D.G, C = SXC;
    const PW = 446, PH = 86, L = 8, Tp = 8, R = 8 + PW, B = 8 + PH;
    TG[ID] = { tabs: G.anchor(8, 102, 116, 18), time: G.anchor(8, 140, 100, 50), fb: G.anchor(109, 140, 46, 50) };
    G.frame((G, dt, clock) => {
      const bpm = clock.bpm, beatMs = 60000 / bpm;
      taps.forEach((t, i) => { t.clr = SX_BAND[(i + 3) % SX_BAND.length]; t.isOn = t.on.on(); t.ms = t.time.v + t.beats.v * beatMs; });
      D.Panel(L, Tp, PW, PH);
      let span = 0;
      for (const t of taps) if (t.isOn) span = Math.max(span, t.ms);
      span = Math.max(span * 3.4, 400);
      const XT = ms => L + 10 + ms / span * (R - L - 20);
      const YA = db => B - 12 - clamp(((db == null ? -100 : db) + 48) / 54) * (PH - 30);
      G.clip(L, Tp, PW, PH, 6);
      let step = beatMs;
      while (span / step > 16) step *= 2;
      for (let k = 0; k * step <= span; k++) {
        const x = XT(k * step);
        D.Line(x, Tp + 1, x, B - 12, k % 4 === 0 ? C.GridHi : C.Grid);
        if (k > 0 && k % 2 === 0) { const ms = k * step; D.Text(x + 3, PH - 3, C.TextMute, ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms.toFixed(0) + 'ms', 8); }
      }
      D.Line(L + 1, B - 12, R - 1, B - 12, C.GridHi);
      // a hit every bar while the transport runs: the echoes light up as the playhead passes them
      const el = clock.playing ? (clock.beat % 4) * beatMs : -1;
      D.Line(XT(0), B - 12, XT(0), YA(dry.v), el >= 0 && el < 90 ? C.Text : C.TextDim, 2);
      taps.forEach((t, i) => {
        if (!t.isOn || t.ms <= 0) return;
        const sel = i === S.sel;
        let amp = t.vol.v, x = XT(t.ms), te = t.ms;
        for (let n = 0; x < R && n < 64; n++) {
          const y = YA(amp), a = n === 0 ? 1 : 0.7;
          const lit = el >= te && el < te + 90;
          if (amp > -48) {
            G.ln(x, B - 12, x, y, A(lit ? 0xffffffff : t.clr, (sel ? 1 : 0.55) * a), sel ? 2 : 1.5);
            G.circ(x, y, sel ? 3 : 2.2, A(lit ? 0xffffffff : t.clr, (sel ? 1 : 0.6) * a));
          }
          if (t.fb.v === -Infinity) break;
          amp += t.fb.v; x += XT(t.ms) - XT(0); te += t.ms;
        }
      });
      if (el >= 0 && XT(el) < R) G.ln(XT(el), Tp + 1, XT(el), B - 12, A(0xffffffff, 0.12), 1);
      G.unclip();
      D.Text(14, 12, C.TextMute, 'ECHOES', 8, 'l', true);
      let selT = taps[S.sel];
      D.Text(PW + 2, 12, C.TextDim, selT.ms.toFixed(0) + ' ms  ·  ' + bpm.toFixed(0) + ' BPM', 9, 'r');
      // tap tabs + controls
      const [ns] = D.Tabs('tap', 8, 102, taps.map(t => ['TAP ' + t.n, t.clr, !t.isOn]), S.sel, { w: 56 });
      if (ns !== S.sel) { S.sel = ns; api.check('tap'); }
      selT = taps[S.sel];
      D.Toggle(selT.on, PW + 8 - 46, 102, 46, 'ON', { h: 18, accent: selT.clr });
      const KN = [['time', 'TIME', 'ms'], ['beats', 'BEATS'], ['fb', 'FEEDBACK', 'dB'], ['lp', 'LOWPASS', 'Hz'], ['hp', 'HIPASS', 'Hz'], ['bits', 'BITS'], ['width', 'WIDTH'], ['vol', 'VOLUME', 'dB'], ['pan', 'PAN']];
      const colW = PW / KN.length;
      KN.forEach((k, i) => D.Knob(selT[k[0]], 8 + colW * (i + 0.5), 168, 'M', k[1], { unit: k[2], accent: selT.clr, bipolar: k[0] === 'pan', dim: !selT.isOn }));
      D.Fader(wet, 474, 22, 160, 'WET');
      D.Fader(dry, 495, 22, 160, 'DRY');
    });
    return () => G.cleanup();
  }
  reg({
    id: 'rea-delay', name: 'ReaDelay', vendor: 'Cockos', group: 'REAPER',
    width: sxW(504), height: sxHt(),
    blurb: 'REAPER\'s delay as a timeline of every tap and its repeats. While the transport runs, a hit plays every bar and each echo lights up as it sounds.',
    steps: [
      { id: 'tap', text: 'Click <b>TAP 2</b> to edit the second tap', why: 'The knob row always shows the selected tap, in its colour.', target: tg('rea-delay', 'tabs') },
      { id: 'time', text: 'Turn <b>TIME</b> or <b>BEATS</b>', why: 'The tap moves on the timeline. Beats follow the tempo; the two add up.', target: tg('rea-delay', 'time') },
      { id: 'fb', text: 'Turn <b>FEEDBACK</b> up', why: 'Each repeat is that many dB quieter than the one before, so more repeats show.', target: tg('rea-delay', 'fb') },
    ],
    notes: [SX_REAL],
    build(body, api) { return buildReaDelay(body, api); },
  });

  /* ---------------------------------------------------------------- ReaVerbate */
  function buildReaVerbate(body, api) {
    const ID = 'rea-verbate';
    const pct = v => v.toFixed(2);
    const P = {
      size: sxP({ id: 'size', def: 0.62, fmt: pct }), damp: sxP({ id: 'damp', def: 0.4, fmt: pct }), width: sxP({ id: 'width', def: 0.8, fmt: pct }),
      delay: sxP({ id: 'delay', lo: 0, hi: 250, def: 24 }),
      lp: sxP({ id: 'lp', map: 'log', lo: 20, hi: 22050, def: 5400, fmt: sxHz }), hp: sxP({ id: 'hp', map: 'log', lo: 20, hi: 22050, def: 40, fmt: sxHz }),
      wet: sxP({ id: 'wet', map: 'vol', lo: -60, hi: 12, def: -9.6 }), dry: sxP({ id: 'dry', map: 'vol', lo: -60, hi: 12, def: 1.7 }),
    };
    const D = SXDev(body, {
      W: 404, Acc: SX_ACC.Time,
      onParam: p => { if (p === P.size) api.check('size'); if (p === P.delay) api.check('pre'); },
    });
    const G = D.G, C = SXC, Acc = D.Acc;
    const PW = 346, PH = 92, L = 8, Tp = 8, R = 8 + PW, B = 8 + PH;
    const colW = PW / 6;
    TG[ID] = { size: G.anchor(8 + colW * 0.5 - 22, 132, 44, 50), pre: G.anchor(8 + colW * 3.5 - 22, 132, 44, 50) };
    const env = (t, damp) => Math.exp(-t * (3.2 + damp * 2.5)) * (1 - Math.exp(-t * 40));
    G.frame((G, dt, clock) => {
      const size = P.size.n, damp = P.damp.n, width = P.width.n, pre = P.delay.n;
      D.Panel(L, Tp, PW, PH);
      const base = B - 10;
      G.clip(L, Tp, PW, PH, 6);
      for (let i = 1; i <= 5; i++) { const x = L + (R - L) * i / 6; D.Line(x, Tp + 1, x, base, C.Grid); }
      D.Line(L + 1, base, R - 1, base, C.GridHi);
      const x0 = L + 12;
      // a hit on every bar while the transport runs
      const el = clock.playing ? (clock.beat % 4) * 60 / clock.bpm : -1;
      D.Line(x0, base, x0, Tp + 14, el >= 0 && el < 0.06 ? C.Text : C.TextDim, 2);
      const xs = x0 + 4 + pre * (R - L) * 0.25, len = (R - xs - 6) * (0.18 + 0.82 * size), hh = (base - Tp - 26) * (0.7 + 0.3 * width);
      const N = 70;
      let mx = 0.001;
      for (let i = 0; i <= N; i++) mx = Math.max(mx, env(i / N, damp));
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, grain = 0.9 + 0.1 * Math.sin(i * 2.7 + 1.3) * Math.sin(i * 1.1);
        pts.push([xs + len * t, base - hh * env(t, damp) * grain / mx]);
      }
      for (let i = 1; i <= N; i++) G.poly([pts[i - 1], pts[i], [pts[i][0], base], [pts[i - 1][0], base]], A(Acc, 0.14 + 0.1 * (1 - i / N)));
      // the tail plays out after each hit: the part already heard is drawn brighter
      if (el >= 0) {
        const tailS = 0.3 + 2.7 * size, px = xs + len * clamp((el - pre * 0.25) / tailS);
        if (px > xs) { G.clip(xs, Tp, px - xs, PH); G.area(pts, base, A(Acc, 0.18)); G.unclip(); }
      }
      G.pline(pts, c32(Acc), 1.6);
      if (xs - x0 > 8) D.Dashed(x0 + 2, base - 4, xs, base - 4, C.TextMute, 2, 2);
      G.unclip();
      D.Text(15, 14, C.TextMute, 'TAIL', 8, 'l', true);
      D.Text(PW + 1, 14, C.TextDim, 'SIZE ' + Math.round(size * 100) + '%  ·  WIDTH ' + Math.round(width * 100) + '%', 9, 'r');
      const KN = [['size', 'ROOM SIZE'], ['damp', 'DAMPING'], ['width', 'WIDTH'], ['delay', 'PRE-DELAY', 'ms'], ['lp', 'LOWPASS', 'Hz'], ['hp', 'HIPASS', 'Hz']];
      KN.forEach((k, i) => D.Knob(P[k[0]], 8 + colW * (i + 0.5), 160, 'L', k[1], { unit: k[2] }));
      D.Fader(P.wet, 374, 22, 160, 'WET');
      D.Fader(P.dry, 395, 22, 160, 'DRY');
    });
    return () => G.cleanup();
  }
  reg({
    id: 'rea-verbate', name: 'ReaVerbate', vendor: 'Cockos', group: 'REAPER',
    width: sxW(404), height: sxHt(),
    blurb: 'REAPER\'s reverb with a picture of its tail: pre-delay, length from room size, height from width, decay from damping.',
    steps: [
      { id: 'size', text: 'Turn <b>ROOM SIZE</b>', why: 'The tail gets longer or shorter.', target: tg('rea-verbate', 'size') },
      { id: 'pre', text: 'Turn <b>PRE-DELAY</b> up', why: 'The tail starts later after the dry hit. The dashed line is the gap.', target: tg('rea-verbate', 'pre') },
    ],
    notes: [SX_REAL],
    build(body, api) { return buildReaVerbate(body, api); },
  });

  /* ---------------------------------------------------------------- ReaSynth */
  function buildReaSynth(body, api) {
    const ID = 'rea-synth';
    const pc = v => Math.round(v * 100) + '%';
    const P = {
      att: sxP({ id: 'att', map: 'pow', lo: 0, hi: 2000, e: 3, def: 2, fmt: v => v.toFixed(0) }),
      dec: sxP({ id: 'dec', map: 'pow', lo: 0, hi: 2000, e: 3, def: 13, fmt: v => v.toFixed(0) }),
      sus: sxP({ id: 'sus', map: 'vol', lo: -60, hi: 0, def: -24 }),
      rel: sxP({ id: 'rel', map: 'pow', lo: 0, hi: 2000, e: 3, def: 20, fmt: v => v.toFixed(0) }),
      sq: sxP({ id: 'sq', def: 0, fmt: pc }), saw: sxP({ id: 'saw', def: 0.6, fmt: pc }), tri: sxP({ id: 'tri', def: 0.2, fmt: pc }), sine: sxP({ id: 'sine', def: 0.3, fmt: pc }),
      sineTune: sxP({ id: 'sineTune', def: 0.75, fmt: v => { const o = Math.floor((v - 0.5) * 4 + 0.5); return (o > 0 ? '+' : '') + o + ' oct'; } }),
      pw: sxP({ id: 'pw', def: 0.5, fmt: pc }),
      det: sxP({ id: 'det', lo: -50, hi: 50, def: 0, fmt: v => Math.round(v) + ' ct' }),
      porta: sxP({ id: 'porta', map: 'pow', lo: 0, hi: 1000, e: 2, def: 0, fmt: v => v.toFixed(0) }),
      vol: sxP({ id: 'vol', map: 'vol', lo: -60, hi: 12, def: -9.6 }),
      legacy: sxTgl('legacy', 0),
    };
    const D = SXDev(body, {
      W: 444, Acc: SX_ACC.Synth,
      onParam: p => { if ([P.sq, P.saw, P.tri, P.sine, P.sineTune, P.pw].includes(p)) api.check('osc'); if ([P.att, P.dec, P.sus, P.rel].includes(p)) api.check('env'); },
    });
    const G = D.G, C = SXC, Acc = D.Acc;
    const colW = 390 / 6, cx = i => 8 + colW * (i - 0.5), R1 = 116, R2 = 178;
    TG[ID] = { osc: G.anchor(8, 96, colW * 4, 40), env: G.anchor(8, 158, colW * 4, 40) };
    G.frame((G, dt, clock) => {
      // oscillator: one cycle of the mix
      {
        const L = 8, Tp = 8, R = 180, B = 78;
        D.Panel(8, 8, 172, 70);
        const mid = (Tp + B) / 2 + 4;
        D.Line(L + 1, mid, R - 1, mid, C.Grid);
        const sq = P.sq.n, saw = P.saw.n, tri = P.tri.n, sine = P.sine.n, pw = 0.05 + 0.9 * P.pw.n;
        const ratio = Math.pow(2, Math.floor((P.sineTune.n - 0.5) * 4 + 0.5));
        const wave = t => sq * (t % 1 < pw ? 1 : -1) + saw * (2 * (t % 1) - 1) + tri * (1 - 4 * Math.abs((t % 1) - 0.5)) + sine * Math.sin(TAU * t * ratio);
        let peak = 0.001;
        for (let i = 0; i <= 120; i++) peak = Math.max(peak, Math.abs(wave(i / 120)));
        const amp = (B - Tp - 26) / 2, pts = [];
        for (let i = 0; i <= 120; i++) pts.push([L + 8 + (R - L - 16) * i / 120, mid - wave(i / 120) / peak * amp]);
        G.pline(pts, c32(Acc), 1.8);
        D.Text(15, 13, C.TextMute, 'OSCILLATOR', 8, 'l', true);
      }
      // envelope, with a note on every beat while the transport runs
      {
        const x0 = 188, PW = 210, L = x0, Tp = 8, R = x0 + PW, B = 78;
        D.Panel(x0, 8, PW, 70);
        const a = P.att.n, d = P.dec.n, s = P.sus.n, rl = P.rel.n;
        const base = B - 8, top = Tp + 20, w = R - L - 16, seg = w / 3.4;
        const xA = L + 8 + seg * (0.08 + 0.92 * a), xD = xA + seg * (0.08 + 0.92 * d), xS = xD + seg * 0.6, xR = xS + seg * (0.08 + 0.92 * rl);
        const yS = base - (base - top) * s;
        const pts = [[L + 8, base], [xA, top], [xD, yS], [xS, yS], [xR, base]];
        G.area(pts, base, A(Acc, 0.1));
        G.pline(pts, c32(Acc), 1.8);
        for (let i = 1; i < 5; i++) G.circ(pts[i][0], pts[i][1], 3, '#fff');
        D.Line(L + 1, base, R - 1, base, C.GridHi);
        D.Text(x0 + 7, 13, C.TextMute, 'ENVELOPE', 8, 'l', true);
        if (clock.playing) {
          // the note is held for half a beat; times from the knobs (ms), drawn along the same segments
          const spb = 60 / clock.bpm, t = (clock.beat % 1) * spb * 1000, hold = spb * 500;
          const ta = Math.max(1, P.att.v), td = Math.max(1, P.dec.v), tr = Math.max(1, P.rel.v);
          let px;
          if (t < ta) px = lerp(pts[0][0], pts[1][0], t / ta);
          else if (t < ta + td) px = lerp(pts[1][0], pts[2][0], (t - ta) / td);
          else if (t < hold) px = lerp(pts[2][0], pts[3][0], clamp((t - ta - td) / Math.max(1, hold - ta - td)));
          else if (t < hold + tr) px = lerp(pts[3][0], pts[4][0], (t - hold) / tr);
          if (px != null) {
            let py = base;
            for (let i = 1; i < 5; i++) if (px <= pts[i][0]) { const k = (px - pts[i - 1][0]) / Math.max(0.01, pts[i][0] - pts[i - 1][0]); py = lerp(pts[i - 1][1], pts[i][1], k); break; }
            G.ln(px, top - 6, px, base, A(0xffffffff, 0.25), 1);
            G.circ(px, py, 3.5, c32(Acc)); G.ring(px, py, 5, A(Acc, 0.4), 1.5);
          }
        }
      }
      const row1 = [['sq', 'SQUARE'], ['saw', 'SAW'], ['tri', 'TRIANGLE'], ['sine', 'SINE'], ['sineTune', 'SINE TUNE'], ['pw', 'PULSE W']];
      const row2 = [['att', 'ATTACK', 'ms'], ['dec', 'DECAY', 'ms'], ['sus', 'SUSTAIN', 'dB'], ['rel', 'RELEASE', 'ms'], ['det', 'DETUNE'], ['porta', 'PORTAMENTO', 'ms']];
      row1.forEach((k, i) => D.Knob(P[k[0]], cx(i + 1), R1, 'S', k[1], { unit: k[2], bipolar: k[0] === 'sineTune' }));
      row2.forEach((k, i) => D.Knob(P[k[0]], cx(i + 1), R2, 'S', k[1], { unit: k[2], bipolar: k[0] === 'det' }));
      D.Fader(P.vol, 422, 22, 160, 'VOLUME');
      D.Toggle(P.legacy, 116, 12, 58, 'LEGACY', { h: 14, tip: 'Legacy oscillator mode' });
    });
    return () => G.cleanup();
  }
  reg({
    id: 'rea-synth', name: 'ReaSynth', vendor: 'Cockos', group: 'REAPER',
    width: sxW(444), height: sxHt(),
    blurb: 'REAPER\'s little synth: one cycle of the oscillator mix, the ADSR envelope and two rows of knobs. While the transport runs, a note plays on every beat.',
    steps: [
      { id: 'osc', text: 'Turn one of the oscillator knobs in the top row, like <b>SQUARE</b>', why: 'The picture shows one cycle of the mix of all four waves.', target: tg('rea-synth', 'osc') },
      { id: 'env', text: 'Turn <b>ATTACK</b>, <b>DECAY</b>, <b>SUSTAIN</b> or <b>RELEASE</b>', why: 'The envelope picture follows, and the dot shows where each note is in it.', target: tg('rea-synth', 'env') },
    ],
    notes: [SX_REAL, SX_OTHERS],
    build(body, api) { return buildReaSynth(body, api); },
  });

  /* ================================================================== FXD ALGORITHMIC REVERB */
  // FXD Algorithmic Reverb.lua: a 3D room (Width x Height x Depth from the JSFX's sliders) with a Mic and a Src dot,
  // view gizmos, particles thrown from the source by the JSFX's input / early-reflection energies (gmem), Wet / Dry
  // knobs and the room size readout. Here the energies come from a hit on every beat while the transport runs, and
  // RT60 is the JSFX's Sabine formula for the room and its material (Wood).
  F.css(`
  .fd-arv-k { position: absolute; display: flex; flex-direction: column; align-items: center; }
  .fd-arv-k .fx-knob .k-lbl, .fd-arv-k .fx-knob .k-val { font-size: 11px; }
  `);
  const ARV = { LEN: [2, 50], WID: [2, 50], HGT: [2, 20], ALPHA: [0.10, 0.03, 0.02, 0.05, 0.02, 0.30, 0.07, 0.03, 0.02, 0.35, 0.60, 0.20] };
  function buildAlgoReverb(body, api) {
    const ID = 'fxd-algo-reverb';
    const W = 582, H = 220, SC = 1;
    const G = IM(body, W, H, SC, { bg: c32(0x111111ff), pad: padFor(H, SC) });
    // JSFX sliders (display values)
    const V = { mat: 0, len: 8, wid: 6, hgt: 3, mic: [0.5, 0.5, 1], src: [0.5, 0.5, 0.5], mix: 0.3, dry: 1 };
    const st = { yaw: 8 * PI / 180, pitch: 20 * PI / 180, roll: 206 * PI / 180, dragging: null, axis: null, dim: null, gzT: null, gzTime: -9, now: 0, gzHov: false };
    const ps = [];
    const PMAX = 500, PSPEED = 10;
    const VIEW_W = 300, VIEW_H = 160, viewL = 8, viewT = 28, sideL = viewL + VIEW_W + 16;
    const CH = [0, 20, VIEW_W + 140 + 40, VIEW_H + 40]; // the child window (content past it is clipped)
    const txt = (x, y, s, col) => G.text(x, y, s, 12, typeof col === 'string' ? col : c32(col), 'l', 400);
    // Wet / Dry: the real FXD knob (AddKnob)
    const mkKnob = (label, key, y) => {
      const K = F.knob({ label, value: V[key], def: key === 'mix' ? 0.3 : 1, r: 15, fmt: v => v.toFixed(2), onChange: v => { V[key] = v; } });
      const box = h('div', { class: 'fd-arv-k', style: { left: sideL + 'px', top: y + 'px' } }, K.el);
      G.wrap.append(box);
      return K;
    };
    mkKnob('Wet', 'mix', viewT + 20); mkKnob('Dry', 'dry', viewT + 90);
    TG[ID] = { view: G.anchor(viewL, viewT, VIEW_W, VIEW_H), gizmo: G.anchor(viewL + VIEW_W - 100, viewT + 8, 92, 36) };
    const rt60 = () => {
      const area = 2 * (V.len * V.wid + V.wid * V.hgt + V.len * V.hgt), vol = V.len * V.wid * V.hgt;
      return clamp(0.161 * vol / Math.max(0.0001, ARV.ALPHA[V.mat] * area), 0.2, 10);
    };
    const randUnit = () => { const x = Math.random() * 2 - 1, y = Math.random() * 2 - 1, z = Math.random() * 2 - 1, l = Math.hypot(x, y, z) + 1e-9; return [x / l, y / l, z / l]; };
    function spawn(num, clr, o, speed, baseA, rt) {
      for (let i = 0; i < num; i++) {
        if (ps.length >= PMAX) { const old = ps[0]; if (old) { old.decay *= 8; old.a *= 0.4; } }
        const u = randUnit(); u[1] += 0.3;
        ps.push({ x: o[0], y: o[1], z: o[2], vx: u[0] * speed * PSPEED, vy: u[1] * speed * PSPEED, vz: u[2] * speed * PSPEED, life: 1, clr, a: baseA,
          decay: (1 / clamp(rt, 0.2, 10)) * (0.8 + 0.4 * Math.random()), path: [], phase: Math.random() * 6.28318, t: 0, acc: 0 });
      }
    }
    function update(dt, Lx, Ly, Lz, alpha, rt) {
      const k = 0.998, bounce = 0.75 * (1 - alpha) + 0.35;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i], dts = dt * PSPEED;
        p.vy -= 1.2 * dts;
        p.x += p.vx * dts; p.y += p.vy * dts; p.z += p.vz * dts;
        p.vx *= k; p.vy *= k; p.vz *= k;
        if (p.x < 0) { p.x = 0; p.vx = -p.vx * bounce; } if (p.x > Lx) { p.x = Lx; p.vx = -p.vx * bounce; }
        if (p.y < 0) { p.y = 0; p.vy = -p.vy * bounce; } if (p.y > Ly) { p.y = Ly; p.vy = -p.vy * bounce; }
        if (p.z < 0) { p.z = 0; p.vz = -p.vz * bounce; } if (p.z > Lz) { p.z = Lz; p.vz = -p.vz * bounce; }
        p.t += dts; p.acc += dts;
        if (p.acc >= 0.02) { p.acc = 0; p.path.push([p.x, p.y, p.z]); if (p.path.length > 12) p.path.shift(); }
        p.life -= dts * (p.decay || 1 / (rt * 1.2));
        if (p.life <= 0) ps.splice(i, 1);
      }
    }
    // the JSFX's energies: a hit on every beat, the early reflections a little later and longer
    const energy = (clock) => {
      if (!clock.playing) return [0, 0];
      const t = (clock.beat % 1) * 60 / clock.bpm;
      return [0.04 * Math.exp(-t / 0.08), t > 0.02 ? 0.03 * Math.exp(-(t - 0.02) / 0.25) : 0];
    };

    G.frame((G, dt, clock) => {
      st.now += dt;
      const Lx = V.wid, Ly = V.hgt, Lz = V.len;
      const mic = { x: V.mic[0] * Lx, y: V.mic[1] * Ly, z: V.mic[2] * Lz }, src = { x: V.src[0] * Lx, y: V.src[1] * Ly, z: V.src[2] * Lz };
      G.clip(CH[0], CH[1], CH[2], CH[3]);
      G.rect(viewL, viewT, VIEW_W, VIEW_H, c32(0x202020ff));
      G.rectS(viewL, viewT, VIEW_W, VIEW_H, c32(0x404040ff), 0, 1);
      // ---- yaw / pitch / roll gizmos (top-right of the view)
      const aW = 92, aH = 36, ax = viewL + VIEW_W - aW - 8, ay = viewT + 8;
      G.rect(ax, ay, aW, aH, c32(0x00000055), 4); G.rectS(ax, ay, aW, aH, c32(0xFFFFFF33), 4, 1);
      const yawX = ax + 6, yawY = ay + 6, sw = 46, sh = 8;
      G.rect(yawX, yawY, sw, sh, c32(0x404040aa), 2);
      G.circ(yawX + ((st.yaw % TAU + TAU) % TAU) / TAU * sw, yawY + sh / 2, 4, c32(0xE0E0E0ff));
      const yb = G.btn('yaw', yawX, yawY, sw, sh, 'ew-resize');
      if (yb.a) { st.yaw = clamp((G.mx - yawX) / sw) * TAU; api.check('view'); }
      if (yb.h) G.tip('Yaw: ' + (((st.yaw * 180 / PI) % 360 + 360) % 360).toFixed(1) + '°');
      txt(yawX - 2, yawY - 12, 'Yaw', 0xA0A0A0ff);
      const pY = ay + 20, minP = -PI * 0.49, maxP = PI * 0.49;
      G.rect(yawX, pY, sw, sh, c32(0x404040aa), 2);
      G.circ(yawX + clamp((st.pitch - minP) / (maxP - minP)) * sw, pY + sh / 2, 4, c32(0xE0E0E0ff));
      const pb = G.btn('pitch', yawX, pY, sw, sh, 'ew-resize');
      if (pb.a) { st.pitch = minP + clamp((G.mx - yawX) / sw) * (maxP - minP); api.check('view'); }
      if (pb.h) G.tip('Pitch: ' + (st.pitch * 180 / PI).toFixed(1) + '°');
      txt(yawX - 2, pY - 12, 'Pitch', 0xA0A0A0ff);
      const rz = 10, rcx = ax + aW - rz - 8, rcy = ay + aH / 2;
      G.ring(rcx, rcy, rz, c32(0xA0A0A0ff), 1);
      G.ln(rcx, rcy, rcx + Math.cos(st.roll) * (rz - 2), rcy + Math.sin(st.roll) * (rz - 2), c32(0xD0D0D0ff), 2);
      const rb = G.btn('roll', rcx - rz, rcy - rz, rz * 2, rz * 2, 'grab');
      if (rb.a) { st.roll = Math.atan2(G.my - rcy, G.mx - rcx); api.check('view'); }
      if (rb.h) G.tip('Roll: ' + (((st.roll * 180 / PI) % 360 + 360) % 360).toFixed(1) + '°');
      txt(rcx - 12, ay - 4, 'Roll', 0xA0A0A0ff);
      const gizmoBusy = yb.h || yb.a || pb.h || pb.a || rb.h || rb.a;
      // ---- projection
      const maxDim = Math.max(Lx, Ly, Lz), scale = 0.6 * Math.min(VIEW_W, VIEW_H) / Math.max(0.0001, maxDim), shapeScale = scale * 2, offX = -20;
      const cy_ = Math.cos(st.yaw), sy_ = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch), cr = Math.cos(st.roll), sr = Math.sin(st.roll);
      const rot = (X, Y, Z) => { const X1 = X * cy_ - Y * sy_, Y1 = X * sy_ + Y * cy_, Z1 = Z; const Y2 = Y1 * cp - Z1 * sp, Z2 = Y1 * sp + Z1 * cp; return [X1 * cr + Z2 * sr, Y2, -X1 * sr + Z2 * cr]; };
      const proj = (x, y, z, s, o) => { const r = rot(x - Lx / 2, y - Ly / 2, z - Lz / 2); return [viewL + VIEW_W / 2 + r[0] * s + o, viewT + VIEW_H * 0.6 - r[1] * s, r[2]]; };
      const PS = (x, y, z) => proj(x, y, z, shapeScale, offX), PF = (x, y, z) => proj(x, y, z, scale, 0);
      const corners = [[0, 0, 0], [Lx, 0, 0], [0, Ly, 0], [Lx, Ly, 0], [0, 0, Lz], [Lx, 0, Lz], [0, Ly, Lz], [Lx, Ly, Lz]];
      const P8 = corners.map(c => PS(c[0], c[1], c[2]));
      let minZ = Infinity, maxZ = -Infinity;
      for (const p of P8) { minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]); }
      const cc = PS(Lx / 2, Ly / 2, Lz / 2);
      for (const p of P8) G.ln(cc[0], cc[1], p[0], p[1], c32(0x303030ff), 1);
      const shade = z => { const n = (z - minZ) / Math.max(1e-9, maxZ - minZ), v = Math.floor(255 * (0.55 + (1 - n) * 0.35)); return `rgb(${v},${v},${v})`; };
      const nz = v => rot(v[0], v[1], v[2])[2];
      const NZ = { nx: nz([-1, 0, 0]), px: nz([1, 0, 0]), ny: nz([0, -1, 0]), py: nz([0, 1, 0]), nzz: nz([0, 0, -1]), pz: nz([0, 0, 1]) };
      const front = z => z < 0;
      const faces = [[[0, 1, 3, 2], NZ.nzz], [[4, 5, 7, 6], NZ.pz], [[0, 1, 5, 4], NZ.ny], [[2, 3, 7, 6], NZ.py], [[0, 2, 6, 4], NZ.nx], [[1, 3, 7, 5], NZ.px]];
      for (const f of faces) if (!front(f[1])) G.poly(f[0].map(i => P8[i]), c32(0x00000018));
      for (const f of faces) if (front(f[1])) G.poly(f[0].map(i => P8[i]), c32(0xFFFFFF12));
      const dotted = (a, b, col) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], dist = Math.hypot(dx, dy) + 1e-9, ux = dx / dist, uy = dy / dist;
        let x = a[0], y = a[1];
        for (let i = 0, n = Math.floor(dist / 10); i < n; i++) { G.ln(x, y, x + ux * 6, y + uy * 6, col, 1.6); x += ux * 10; y += uy * 10; }
        G.ln(x, y, b[0], b[1], col, 1.6);
      };
      const edges = [[0, 1, NZ.ny, NZ.nzz, 'x'], [0, 2, NZ.nx, NZ.nzz, 'y'], [1, 3, NZ.px, NZ.nzz, 'y'], [2, 3, NZ.py, NZ.nzz, 'x'],
        [4, 5, NZ.ny, NZ.pz, 'x'], [4, 6, NZ.nx, NZ.pz, 'y'], [5, 7, NZ.px, NZ.pz, 'y'], [6, 7, NZ.py, NZ.pz, 'x'],
        [0, 4, NZ.nx, NZ.ny, 'z'], [1, 5, NZ.px, NZ.ny, 'z'], [2, 6, NZ.nx, NZ.py, 'z'], [3, 7, NZ.px, NZ.py, 'z']];
      const segD = (a, b, mx, my) => { const vx = b[0] - a[0], vy = b[1] - a[1], t = clamp(((mx - a[0]) * vx + (my - a[1]) * vy) / (vx * vx + vy * vy + 1e-9)); return Math.hypot(mx - a[0] - t * vx, my - a[1] - t * vy); };
      const inView = G.inside(viewL, viewT, VIEW_W, VIEW_H);
      const dotR = z => 6 + (1 - (z - minZ) / Math.max(1e-9, maxZ - minZ)) * 4;
      // dots (projected first: they take the click before the edges)
      const mp = PS(mic.x, mic.y, mic.z), sp_ = PS(src.x, src.y, src.z);
      const overMic = inView && Math.hypot(G.mx - mp[0], G.my - mp[1]) <= 12, overSrc = inView && Math.hypot(G.mx - sp_[0], G.my - sp_[1]) <= 12;
      // ---- gizmo axes of the hovered dot (they linger for 1 s)
      const axisVec = (pos, ax_) => { const o = PS(pos.x, pos.y, pos.z), n = PS(pos.x + (ax_ === 'x'), pos.y + (ax_ === 'y'), pos.z + (ax_ === 'z')); return [o, n[0] - o[0], n[1] - o[1]]; };
      if ((overMic || overSrc) && !st.axis) { st.gzT = overMic ? 'mic' : 'src'; st.gzTime = st.now; }
      else if (!st.axis && st.now - st.gzTime > 1) st.gzT = null;
      let gzHover = null;
      const gzLines = [];
      if (st.gzT && !st.dragging && !st.dim) {
        const pos = st.gzT === 'mic' ? mic : src;
        for (const [k, col] of [['x', 0xFF4040ff], ['y', 0x40FF40ff], ['z', 0x4080D0ff]]) {
          const [o, vx, vy] = axisVec(pos, k), ul = Math.hypot(vx, vy) + 1e-9;
          const e = [o[0] + vx / ul * 38, o[1] + vy / ul * 38];
          gzLines.push([o, e, col]);
          if (!st.axis && inView && segD(o, e, G.mx, G.my) <= 6) gzHover = k;
        }
      }
      // ---- edges: hover one to resize the room along its axis
      let hoverDim = null;
      if (!overMic && !overSrc && !gzHover && !st.axis && !st.dim && !st.dragging && !gizmoBusy && inView) {
        for (const e of edges) if (segD(P8[e[0]], P8[e[1]], G.mx, G.my) <= 8) { hoverDim = e[4]; break; }
        if (hoverDim) G.cursor = hoverDim === 'x' ? 'ew-resize' : 'ns-resize';
      }
      if (G.clicked && !G.claimed && inView) {
        // the dot itself first (its radius + 3), then the gizmo arrows, then the edges
        const hitDot = (q, z) => Math.hypot(G.mx - q[0], G.my - q[1]) <= dotR(z) + 3;
        if (hitDot(mp, mp[2]) || hitDot(sp_, sp_[2])) { st.dragging = hitDot(mp, mp[2]) ? 'mic' : 'src'; G.claimed = true; }
        else if (gzHover) { st.axis = { t: st.gzT, axis: gzHover }; G.claimed = true; }
        else if (hoverDim) { st.dim = hoverDim; G.claimed = true; }
      }
      if (!G.down) { st.dragging = null; st.axis = null; st.dim = null; }
      if (st.dim && (G.dx || G.dy)) {
        if (st.dim === 'x') V.wid = clamp(V.wid + G.dx / shapeScale, ARV.WID[0], ARV.WID[1]);
        else if (st.dim === 'y') V.hgt = clamp(V.hgt - G.dy / shapeScale, ARV.HGT[0], ARV.HGT[1]);
        else V.len = clamp(V.len - G.dy / shapeScale, ARV.LEN[0], ARV.LEN[1]);
        api.check('room');
      }
      for (const e of edges) {
        const a = P8[e[0]], b = P8[e[1]];
        const thick = (hoverDim || st.dim) === e[4] ? 3.2 : 1.8;
        if (front(e[2]) || front(e[3])) G.ln(a[0], a[1], b[0], b[1], shade((a[2] + b[2]) / 2), thick);
        else dotted(a, b, c32(thick > 2.5 ? 0xA0A0A0aa : 0x808080aa));
      }
      // floor grid, 10 m spacing on the floor plane (unscaled projection), clipped to the view
      {
        const o = PF(0, 0, 0), x1 = PF(1, 0, 0), z1 = PF(0, 0, 1);
        const rvx = [x1[0] - o[0], x1[1] - o[1]], rvz = [z1[0] - o[0], z1[1] - o[1]];
        const lx = Math.hypot(rvx[0], rvx[1]) + 1e-9, lz = Math.hypot(rvz[0], rvz[1]) + 1e-9;
        const ux = [rvx[0] / lx, rvx[1] / lx], uz = [rvz[0] / lz, rvz[1] / lz], sx = lx * 10, sz = lz * 10;
        const diag = Math.hypot(VIEW_W, VIEW_H);
        const nX = Math.min(300, Math.ceil(diag * 1.2 / Math.max(4, sx)) + 2), nZ = Math.min(300, Math.ceil(diag * 1.2 / Math.max(4, sz)) + 2);
        G.clip(viewL, viewT, VIEW_W, VIEW_H);
        for (let i = -nX; i <= nX; i++) { const px = o[0] + ux[0] * i * sx, py = o[1] + ux[1] * i * sx; G.ln(px - uz[0] * diag, py - uz[1] * diag, px + uz[0] * diag, py + uz[1] * diag, c32(0x505050ff), 1); }
        for (let j = -nZ; j <= nZ; j++) { const px = o[0] + uz[0] * j * sz, py = o[1] + uz[1] * j * sz; G.ln(px - ux[0] * diag, py - ux[1] * diag, px + ux[0] * diag, py + ux[1] * diag, c32(0x505050ff), 1); }
        G.unclip();
      }
      // drag a dot: left / right = depth, up / down = height (free view)
      if (st.dragging && (G.dx || G.dy)) {
        const p = st.dragging === 'mic' ? V.mic : V.src;
        p[2] = clamp(p[2] + G.dx / VIEW_W);
        p[1] = clamp(p[1] - G.dy / VIEW_H);
        api.check('dot');
      }
      if (st.axis && (G.dx || G.dy)) {
        const p = st.axis.t === 'mic' ? V.mic : V.src, pos = st.axis.t === 'mic' ? mic : src;
        const [, vx, vy] = axisVec(pos, st.axis.axis), along = (G.dx * vx + G.dy * vy) / (vx * vx + vy * vy + 1e-9);
        const i = { x: 0, y: 1, z: 2 }[st.axis.axis], Ls = [Lx, Ly, Lz][i];
        p[i] = clamp(p[i] + along / Ls);
        api.check('axis');
      }
      // ---- mic / src dots
      const dot = z => { const n = (z - minZ) / Math.max(1e-9, maxZ - minZ), v = Math.floor(255 * (0.65 + (1 - n) * 0.3)); return [6 + (1 - n) * 4, `rgb(${v},${v},${v})`]; };
      const mp2 = PS(V.mic[0] * Lx, V.mic[1] * Ly, V.mic[2] * Lz), sp2 = PS(V.src[0] * Lx, V.src[1] * Ly, V.src[2] * Lz);
      const [rm, cm] = dot(mp2[2]), [rs, cs] = dot(sp2[2]);
      G.circ(mp2[0], mp2[1], rm, cm); txt(mp2[0] + 8, mp2[1] - 10, 'Mic', 0xC0FFFFFF);
      G.circ(sp2[0], sp2[1], rs, cs); txt(sp2[0] + 8, sp2[1] - 10, 'Src', 0xC0FFFFFF);
      if (overMic || overSrc || st.dragging) G.cursor = 'grab';
      // ---- particles from the source
      const rt = rt60(), [eIn, eEr] = energy(clock), alpha = 1 - V.mat / 11;
      const amt = v => Math.min(80, Math.floor(v * 400));
      if (!F.reducedMotion) {
        const o = [V.src[0] * Lx, V.src[1] * Ly, V.src[2] * Lz];
        spawn(amt(eIn), [255, 224, 224], o, 7 + 16 * Math.min(1, eIn), 0.6, rt);
        spawn(amt(eEr), [255, 224, 160], o, 6 + 14 * Math.min(1, eEr), 0.5, rt);
      }
      update(Math.min(dt, 1 / 30), Lx, Ly, Lz, alpha, rt);
      const eLines = edges.map(e => [P8[e[0]], P8[e[1]]]);
      const ctx = G.ctx;
      ctx.lineJoin = 'round';
      for (const p of ps) {
        const a = clamp(p.a * p.life * 0.6), cs_ = `${p.clr[0]},${p.clr[1]},${p.clr[2]}`;
        if (p.path.length >= 2) {
          const pts = [];
          let prev = null;
          for (let j = 0; j < p.path.length; j++) {
            let [px, py] = PS(p.path[j][0], p.path[j][1], p.path[j][2]);
            if (prev) {
              const dx = px - prev[0], dy = py - prev[1], len = Math.hypot(dx, dy) + 1e-9, nx = -dy / len, ny = dx / len;
              let off = Math.sin(p.phase + p.t * 10 + (j + 1) * 0.6) * 5 * p.life, mind = 1e9;
              for (const e of eLines) mind = Math.min(mind, segD(e[0], e[1], px, py));
              const cap = Math.max(0, mind - 2);
              off = clamp(off, -cap, cap);
              px += nx * off; py += ny * off;
            }
            pts.push([px, py]); prev = [px, py];
          }
          for (const [al, th] of [[0.08, 9], [0.16, 6], [0.32, 2.6]]) G.pline(pts, `rgba(${cs_},${al * a})`, th);
        } else {
          const p1 = PS(p.x, p.y, p.z), p0 = PS(p.x - p.vx * 0.02, p.y - p.vy * 0.02, p.z - p.vz * 0.02);
          G.ln(p0[0], p0[1], p1[0], p1[1], `rgba(${cs_},${0.32 * a})`, 2);
        }
      }
      for (const [o, e, col] of gzLines) { G.ln(o[0], o[1], e[0], e[1], c32(col), 2); G.circ(e[0], e[1], 3, c32(col)); }
      if (gzHover || st.axis) G.cursor = 'move';
      if (st.axis) {
        const pos = st.axis.t === 'mic' ? V.mic : V.src, k = st.axis.axis;
        if (k === 'x') { const n = pos[0], side = n < 0.5 ? 'L' : (n > 0.5 ? 'R' : 'C'); G.tip(side === 'C' ? 'X: C' : 'X: ' + Math.round(Math.abs((n - 0.5) / 0.5) * 100) + '% ' + side); }
        else G.tip((k === 'y' ? 'Y: ' : 'Z: ') + Math.round(pos[k === 'y' ? 1 : 2] * 100) + '%');
      }
      // ---- room readout (the rest of the side column falls outside the child window)
      txt(sideL, viewT + 160, 'Width ' + Lx.toFixed(1) + 'm', 0xB0B0B0ff);
      txt(sideL, viewT + 175, 'Height ' + Ly.toFixed(1) + 'm', 0xB0B0B0ff);
      txt(sideL, viewT + 190, 'Depth ' + Lz.toFixed(1) + 'm', 0xB0B0B0ff);
      G.unclip();
    });
    return () => G.cleanup();
  }
  reg({
    id: 'fxd-algo-reverb', name: 'Algorithmic Reverb', vendor: 'FX Devices', group: 'FX Devices',
    width: frameW(582, 1), height: frameH(220, 1),
    blurb: 'A reverb built from a room you can see. Its size and material set the decay time, and the mic and source positions set the early reflections. While the transport runs, a hit plays on every beat and the traces show the sound bouncing off the walls.',
    steps: [
      { id: 'dot', text: 'Drag the <b>Src</b> or <b>Mic</b> dot', why: 'Up and down moves it in height, left and right in depth.', target: tg('fxd-algo-reverb', 'view') },
      { id: 'axis', text: 'Hover a dot, then drag one of its coloured arrows', why: 'Red is width, green is height, blue is depth. The dot moves along that axis only. On touch, tap the dot first.', target: tg('fxd-algo-reverb', 'view') },
      { id: 'room', text: 'Drag an edge of the room to resize it', why: 'Width, Height and Depth change on the right. A bigger room decays longer, so the traces live longer.', target: tg('fxd-algo-reverb', 'view') },
      { id: 'view', text: 'Drag <b>Yaw</b> or <b>Pitch</b>, or turn <b>Roll</b>, to turn the view', why: 'Only the view turns. The sound stays the same.', target: tg('fxd-algo-reverb', 'gizmo') },
    ],
    notes: [
      { title: 'Material', text: 'The JSFX has 12 materials, from Metal and Stone to Carpet, Curtains and Acoustic Panel. Each sets how much the walls absorb. Pick one from the plugin\'s own controls.' },
      { title: 'Decay', text: 'RT60 comes from the Sabine formula: 0.161 x room volume / (absorption x wall area), kept between 0.2 s and 10 s.' },
    ],
    build(body, api) { return buildAlgoReverb(body, api); },
  });

  /* ================================================================== WAVE SHIFTER (Minimal Audio) */
  // Wave Shifter.lua: the plugin's own UI redrawn from its 2000 x 1069 screenshot coordinates, scaled into 440 x 216.
  // The plugin itself is not here: its 19 host params are modelled in display units, its non-host settings
  // (Style, Mode, range, Sync / Snap, Invert, Soft Sync, FM source, Cross Feedback, LFO bypass, send, limiter) are
  // plain state. The LFO runs on FXD.clock; the feedback spectrum is a simulated noise band through the filter.
  const WS_C = {
    Body: 0x3b434fff, Panel: 0x454e5bff, PanelLo: 0x3a424dff, Edge: 0x535c6aff, Outline: 0x2a3038ff,
    Dark: 0x1b1f25ff, DarkLo: 0x1e2229ff, Grid: 0x262b33ff, GridHi: 0x30363fff,
    Hdr: 0x1b1f25ff, HdrSep: 0x49525fff, HdrText: 0x828b9dff, Foot: 0x3a414bff, FootLo: 0x313740ff,
    Text: 0xf2f3f4ff, Dim: 0xa9b0bdff, Faint: 0x5c6573ff, Violet: 0x8d7affff, Pink: 0xdc78ffff,
    PillOn: 0x6c5ff0ff, PillOnHi: 0x8d7affff, PillOff: 0x4a5361ff, PillEdge: 0x5a6372ff,
    Track: 0x2f353eff, Arc: 0xc4c9d1ff, Cap: 0x3d444fff, CapHi: 0x58606dff, CapLo: 0x262b33ff, Ptr: 0xf2f3f4ff, Slider: 0xa3aec2ff, SliderLo: 0x272c34ff,
  };
  const WS_STYLES = ['Freq Shift', 'Ring Mod', 'Amp Mod'], WS_RANGES = ['Fast', 'Tuned', 'Slow', 'Synced'];
  const WS_FM = ['Sine', 'Even', 'Dirty', 'Noise', 'Input', 'Output', 'Extern'];
  const WS_AX = [{ fmax: 7600, c: 75, grid: 'dec' }, { fmax: 2093, c: 30, grid: 'note' }, { fmax: 76, c: 0.75, grid: 'dec' }, { fmax: 76, c: 0.75, grid: 'dec' }];
  const WS_SYNC = ['8 Bar', '4 Bar', '2 Bar', '1 Bar', '1/2', '1/4', '1/8', '1/16', '1/32'], WS_SYNC_QN = [32, 16, 8, 4, 2, 1, 0.5, 0.25, 0.125];
  const WS_NOT_HOST = '\n(a plugin setting, not a host parameter: written into the plugin\'s state, can\'t be modulated)';
  const wsHzStr = f => { const a = Math.abs(f), s = f < 0 ? '-' : ''; return a >= 1000 ? s + (a / 1000).toFixed(2) + ' kHz' : a >= 100 ? s + a.toFixed(0) + ' Hz' : a >= 10 ? s + a.toFixed(1) + ' Hz' : s + a.toFixed(2) + ' Hz'; };
  const wsNote = f => { const a = Math.abs(f); if (a < 8) return wsHzStr(f); const m = Math.round(69 + 12 * Math.log2(a / 440)); return (f < 0 ? '-' : '') + ND_ROOTS[pc12(m)] + (Math.floor(m / 12) - 1); };

  function buildWaveShifter(body, api) {
    const ID = 'wave-shifter';
    const W = 440, H = 216, HDR = 15, sc = SX_SC;
    const G = IM(body, W, H, sc, { bg: c32(0x2a3038ff), pad: padFor(H, sc) });
    const C = WS_C;
    // non-host settings (the plugin's state)
    const ST = { ShiftMode: 0, FrequencyCurrentMapping: 0, ModRateCurrentMapping: 0, ModShapeCurrentMapping: 0, DelayTimeCurrentMapping: 0,
      MidSideActive: 0, LeftInvertActive: 0, RightInvertActive: 0, SoftSyncActive: 0, FMSource: 0, CrossFeedbackActive: 0, ModBypassActive: 0,
      StereoRandomizeActive: 0, InputSendMode: 0, OutputLimiterMode: 0 };
    const S = { lfoPh: 0, rnd: [0, 0], hist: [], trail: [], trailT: 0, spec: true, now: 0 };
    const range = () => ST.FrequencyCurrentMapping;
    const ax = () => WS_AX[range()];
    // Frequency: the knob's place is its place on the display's +/- log scale
    const fHz = n => { const a = ax(), u = Math.abs(n * 2 - 1); return Math.sign(n - 0.5) * a.c * (Math.pow(1 + a.fmax / a.c, u) - 1); };
    const pct = v => Math.round(v) + '%', spct = v => (v > 0 ? '+' : '') + Math.round(v) + '%';
    const P = {
      inGain: sxP({ id: 'in', lo: -24, hi: 12, def: 0, fmt: v => v.toFixed(1) + ' dB' }),
      outGain: sxP({ id: 'out', lo: -24, hi: 12, def: 0, fmt: v => v.toFixed(1) + ' dB' }),
      mix: sxP({ id: 'mix', lo: 0, hi: 100, def: 100, fmt: pct }),
      modDepth: sxP({ id: 'mdepth', lo: -100, hi: 100, def: 35, fmt: spct }),
      modRate: sxP({ id: 'mrate', lo: 0, hi: 1, def: 0.04, fmt: v => ST.ModRateCurrentMapping ? WS_SYNC[Math.round(v * (WS_SYNC.length - 1))] : (0.1 + v * 10).toFixed(2) + ' Hz' }),
      modShape: sxP({ id: 'mshape', lo: 0, hi: 1, def: 0, fmt: v => ['Sine', 'Triangle', 'Ramp', 'Square'][Math.round(v * 3)] + (ST.ModShapeCurrentMapping || Math.abs(v * 3 - Math.round(v * 3)) < 0.02 ? '' : ' ' + Math.round(v * 100) + '%') }),
      modRand: sxP({ id: 'mrand', lo: 0, hi: 100, def: 0, fmt: pct }),
      modPhase: sxP({ id: 'mphase', lo: -180, hi: 180, def: 90, fmt: v => Math.round(v) + '°' }),
      freq: sxP({ id: 'freq', lo: 0, hi: 1, def: 0.62, fmt: v => range() === 1 ? wsNote(fHz(v)) : wsHzStr(fHz(v)) }),
      spread: sxP({ id: 'spread', lo: -100, hi: 100, def: 8, fmt: spct }),
      width: sxP({ id: 'width', lo: -180, hi: 180, def: 0, fmt: v => Math.round(v) + '°' }),
      fmAmt: sxP({ id: 'fmamt', lo: 0, hi: 100, def: 0, fmt: pct }),
      fmRatio: sxP({ id: 'fmratio', lo: 0.25, hi: 8, def: 1, fmt: v => v.toFixed(2) }),
      fmFilter: sxP({ id: 'fmfilt', map: 'log', lo: 20, hi: 20000, def: 2000, fmt: wsHzStr }),
      depth: sxP({ id: 'depth', lo: 0, hi: 100, def: 100, fmt: pct }),
      fb: sxP({ id: 'fb', lo: 0, hi: 150, def: 40, fmt: pct }),
      time: sxP({ id: 'time', map: 'log', lo: 1, hi: 1000, def: 120, fmt: v => ST.DelayTimeCurrentMapping ? WS_SYNC[clamp(Math.round(Math.log(1000 / v) / Math.log(1000) * 8), 0, 8)] : v.toFixed(v < 10 ? 1 : 0) + ' ms' }),
      fbFreq: sxP({ id: 'fbf', map: 'log', lo: 20, hi: 20000, def: 1200, fmt: wsHzStr }),
      fbBW: sxP({ id: 'fbw', lo: 0, hi: 100, def: 35, fmt: pct }),
    };
    const OX0 = 120, OX1 = 1880, OHDR = 62, OB = 1020, SXk = W / (OX1 - OX0), SYk = (H - HDR) / (OB - OHDR);
    const PX = ox => (ox - OX0) * SXk, PY = oy => oy <= OHDR ? oy * HDR / OHDR : HDR + (oy - OHDR) * SYk, KR = orad => orad * SYk * 1.02;
    const LBL = 7;
    const Txt = (x, y, col, s, size) => G.text(x, y, s, size, typeof col === 'string' ? col : c32(col), 'l', 500);
    const TxtC = (cx, y, col, s, size) => G.text(cx, y, s, size, typeof col === 'string' ? col : c32(col), 'c', 500);
    const TxtR = (rx, y, col, s, size) => G.text(rx, y, s, size, typeof col === 'string' ? col : c32(col), 'r', 500);
    const TxtFit = (cx, cy, col, s, size, maxW) => { while (size > 6 && G.tw(s, size, 500) > maxW) size -= 0.5; TxtC(cx, cy - size / 2 - 0.5, col, s, size); };
    const Ab = (clr, a) => A(clr, a / 255);
    const lit = {};
    const chg = p => {
      if (p === P.freq) api.check('freq');
      if (p === P.modDepth) api.check('depth');
      if (p === P.fb || p === P.fbFreq || p === P.fbBW) api.check('fb');
    };
    // invisible FX Devices knob (AddKnob) over a drawing: vertical drag
    const PrmKnob = (p, cx, cy, rad) => {
      const b = G.drag('k' + p.id, cx - rad, cy - rad, rad * 2, rad * 2, () => p.n, n => { p.n = n; chg(p); }, { def: p.defN });
      lit[p.id] = b.h || b.a;
      return b;
    };
    const PrmSlider = (p, x, y, w, hh) => {
      const b = G.btn('s' + p.id, x, y, w, hh, 'ew-resize');
      if (b.a) { p.n = clamp((G.mx - x) / w); chg(p); }
      if (b.h && G.dbl) { p.n = p.defN; chg(p); }
      lit[p.id] = b.h || b.a;
      return b;
    };
    const Lit = p => p && lit[p.id];
    function Knob(p, cx, cy, rad, bipolar) {
      PrmKnob(p, cx, cy, rad);
      const v = p.n, l = Lit(p), th = Math.max(1.3, rad * 0.1), ar = rad - th / 2, Ang = t => A0 + (A1 - A0) * t;
      G.arc(cx, cy, ar, A0, A1, th, c32(C.Track));
      const col = l ? '#fff' : c32(C.Arc);
      if (bipolar) { if (v >= 0.5) G.arc(cx, cy, ar, Ang(0.5), Ang(v), th, col); else G.arc(cx, cy, ar, Ang(v), Ang(0.5), th, col); }
      else G.arc(cx, cy, ar, A0, Ang(v), th, col);
      const cr = rad * 0.74;
      G.circ(cx + cr * 0.06, cy + cr * 0.12, cr * 1.06, c32(0x00000060));
      G.circ(cx, cy, cr, c32(C.CapLo));
      G.circ(cx - cr * 0.05, cy - cr * 0.07, cr * 0.9, c32(l ? 0x48505cff : C.Cap));
      G.circ(cx - cr * 0.22, cy - cr * 0.28, cr * 0.45, Ab(C.CapHi, 0x55));
      G.arc(cx, cy, cr * 0.95, PI * -0.1, PI * 0.75, Math.max(1, cr * 0.09), Ab(C.Violet, 0xa0));
      G.ring(cx, cy, cr, c32(0x5d6573a0), 0.8);
      const a = Ang(v);
      G.ln(cx + Math.cos(a) * cr * 0.5, cy + Math.sin(a) * cr * 0.5, cx + Math.cos(a) * cr * 0.86, cy + Math.sin(a) * cr * 0.86, c32(C.Ptr), Math.max(1.3, rad * 0.1));
    }
    const KnobLabel = (p, cx, y, label) => { if (Lit(p)) TxtC(cx, y, '#fff', p.str(), LBL); else TxtC(cx, y, C.Text, label, LBL); };
    const KnobAt = (p, ox, oy, orad, ol, lbl, bipolar) => { Knob(p, PX(ox), PY(oy), KR(orad), bipolar); KnobLabel(p, PX(ox), PY(ol) - LBL / 2, lbl); };
    function Panel(ox0, oy0, ox1, oy1, screws) {
      const L = PX(ox0), T = PY(oy0), R = PX(ox1), B = PY(oy1);
      G.rect(L - 1, T - 1, R - L + 2, B - T + 2.5, c32(C.Outline), 5);
      G.gradV(L, T, R - L, B - T, c32(C.Panel), c32(C.PanelLo), 4);
      G.rectS(L, T, R - L, B - T, c32(C.Edge), 4, 1);
      if (screws) for (const sx of [L + 4, R - 4]) G.ring(sx, B - 4, 1.5, c32(0x5f6876ff), 0.8);
      return [L, T, R, B];
    }
    const toggleSt = key => { ST[key] = ST[key] ? 0 : 1; };
    function Pill(id, ox0, oy0, ox1, oy1, s, on, tip, key) {
      const L = PX(ox0), T = PY(oy0), R = PX(ox1), B = PY(oy1), b = G.btn('pill' + id, L, T, R - L, B - T, 'pointer');
      if (b.c) toggleSt(key);
      const rr = (B - T) / 2;
      if (on) {
        G.rect(L - 1, T - 1, R - L + 2, B - T + 2, Ab(C.Violet, 0x30), rr + 1);
        G.gradH(L, T, R - L, B - T, c32(C.PillOn), c32(C.PillOnHi), rr);
        G.rectS(L, T, R - L, B - T, c32(0xa99cffff), rr, 0.8);
      } else {
        G.rect(L, T, R - L, B - T, c32(b.h ? 0x555e6dff : C.PillOff), rr);
        G.rectS(L, T, R - L, B - T, c32(C.PillEdge), rr, 0.8);
      }
      TxtFit((L + R) / 2, (T + B) / 2, on ? '#fff' : C.Text, s, 6.5, R - L - 4);
      if (b.h) G.tip(tip + ': ' + (on ? 'on' : 'off') + WS_NOT_HOST);
      return b;
    }
    function RoundBtn(id, ox, oy, orad, key, tip, icon) {
      const cx = PX(ox), cy = PY(oy), rad = KR(orad), on = ST[key] > 0, b = G.btn('rb' + id, cx - rad, cy - rad, rad * 2, rad * 2, 'pointer');
      if (b.c) toggleSt(key);
      G.circ(cx, cy + 0.6, rad + 0.8, c32(0x00000060));
      G.circ(cx, cy, rad, c32(on ? C.PillOn : (b.h ? 0x353b45ff : 0x2b3039ff)));
      G.ring(cx, cy, rad, c32(on ? 0xa99cffff : 0x555e6cff), 0.8);
      icon(cx, cy, rad, c32(on ? 0xffffffff : 0xd8dbe0ff));
      if (b.h) G.tip(tip + ': ' + (on ? 'on' : 'off') + WS_NOT_HOST);
    }
    // the plugin's choice menu
    const choice = (x, y, w, hh, items, cur, set, seps) => G.menu(x, y, w, hh, items.flatMap((s, i) => {
      const it = [{ label: s, on: i === cur, pick: () => set(i) }];
      if (seps && seps[i]) it.push({ sep: true });
      return it;
    }));
    // ---- LFO
    const shape = (i, t) => { t = ((t % 1) + 1) % 1; return i === 1 ? Math.sin(TAU * t) : i === 2 ? 1 - 4 * Math.abs(((t + 0.25) % 1) - 0.5) : i === 3 ? 1 - 2 * t : (t < 0.5 ? 1 : -1); };
    const lfoShape = (t, v) => { const k = clamp(v) * 3; if (ST.ModShapeCurrentMapping) return shape(Math.round(k) + 1, t); const i = Math.min(Math.floor(k), 2), f = k - i; return shape(i + 1, t) * (1 - f) + shape(i + 2, t) * f; };
    TG[ID] = { freq: G.anchor(PX(948) - KR(85), PY(715) - KR(85), KR(85) * 2, KR(85) * 2), depth: G.anchor(PX(350) - KR(65), PY(390) - KR(65), KR(65) * 2, KR(65) * 2),
      range: G.anchor(PX(815), PY(532), PX(1080) - PX(815), PY(590) - PY(532)), fb: G.anchor(PX(1352), PY(482), PX(1865) - PX(1352), PY(650) - PY(482)) };

    G.frame((G, dt, clock) => {
      S.now += dt;
      const NOW = S.now;
      const rateSync = ST.ModRateCurrentMapping === 1, lfoOn = ST.ModBypassActive !== 1;
      const lfoHz = rateSync ? (clock.bpm / 60) / WS_SYNC_QN[Math.round(P.modRate.n * (WS_SYNC.length - 1))] : 0.1 + P.modRate.n * 10;
      const prev = S.lfoPh;
      if (rateSync && clock.playing) S.lfoPh = ((clock.beat / WS_SYNC_QN[Math.round(P.modRate.n * (WS_SYNC.length - 1))]) % 1 + 1) % 1;
      else if (clock.playing || !F.reducedMotion) S.lfoPh = (S.lfoPh + lfoHz * dt) % 1;
      if (S.lfoPh < prev) S.rnd = [Math.random() * 2 - 1, Math.random() * 2 - 1];
      const rnd = P.modRand.n, depthBi = P.modDepth.n * 2 - 1, stereoPh = (P.modPhase.n * 2 - 1) * 0.5;
      const lfoAt = (ch, ph) => {
        if (!lfoOn) return 0;
        if (ch === 1) ph -= stereoPh;
        const v = lfoShape(ph, P.modShape.n), rv = ch === 2 && ST.StereoRandomizeActive ? S.rnd[1] : S.rnd[0];
        return (v * (1 - rnd) + rv * rnd) * depthBi;
      };
      const lfoL = lfoAt(1, S.lfoPh), lfoR = lfoAt(2, S.lfoPh);
      if (prev !== S.lfoPh || !S.hist.length) { S.hist.unshift([NOW, lfoL, lfoR]); while (S.hist.length > 2 && NOW - S.hist[S.hist.length - 2][0] > 0.9) S.hist.pop(); }
      G.rect(0, 0, W, H, c32(C.Body), 5);

      // ---- MODULATION
      {
        const [L, T, R] = Panel(140, 82, 558, 928, true), tb = PY(138);
        G.clip(L, T, R - L, tb - T); G.rect(L, T, R - L, tb - T + 5, c32(C.Dark), 4); G.unclip();
        const ix = PX(169), iy = PY(110), bb = G.btn('modpow', ix - 5, iy - 5, 10, 10, 'pointer');
        if (bb.c) toggleSt('ModBypassActive');
        const pc = c32(lfoOn ? C.Violet : 0x6a7280ff);
        G.arc(ix, iy, 3.2, -PI / 2 + 0.7, PI * 1.5 - 0.7, 1, pc);
        G.ln(ix, iy - 3.5, ix, iy, pc, 1);
        if (bb.h) G.tip('Modulation ' + (lfoOn ? 'on' : 'bypassed') + WS_NOT_HOST);
        TxtFit((L + R) / 2 + 3, (T + tb) / 2, C.Text, 'Modulation', LBL, R - L - 20);
        // LFO view: violet = right, cyan = left, scrolling right to left
        const vL = PX(162), vT = PY(160), vR = PX(537), vB = PY(292), mid = (vT + vB) / 2, amp = (vB - vT) / 2 - 2, span = vR - vL - 6;
        G.rect(vL, vT, vR - vL, vB - vT, c32(C.Dark), 5);
        G.clip(vL, vT, vR - vL, vB - vT, 5);
        const curve = (idx, line, hi, lo) => {
          const pts = S.hist.map(hh => [vR - 3 - span * Math.min((NOW - hh[0]) / 0.9, 1.02), mid - clamp(hh[idx], -1, 1) * amp]);
          if (pts[pts.length - 1][0] > vL) pts.push([vL, pts[pts.length - 1][1]]);
          const g = G.ctx.createLinearGradient(0, vT, 0, vB); g.addColorStop(0, c32(hi)); g.addColorStop(1, c32(lo));
          G.area(pts, vB, g);
          G.pline(pts, lfoOn ? c32(line) : Ab(line, 0x70), 1.3);
        };
        curve(2, 0xaf89dfff, 0x514d72a0, 0x2a2b3c40);
        curve(1, 0x42aad2ff, 0x26374880, 0x1d242c30);
        G.unclip();
        G.rectS(vL, vT, vR - vL, vB - vT, c32(0x2a2f38ff), 5, 1);
        if (G.inside(vL, vT, vR - vL, vB - vT) && !G.active) G.tip('LFO  ' + lfoHz.toFixed(2) + ' Hz  (' + P.modShape.str() + ')');
        KnobAt(P.modDepth, 350, 390, 65, 482, 'Mod Depth', true);
        [203, 497].forEach((ox, i) => {
          const lv = Math.abs(i === 0 ? lfoL : lfoR), dx = PX(ox);
          for (let k = 0; k <= 6; k++) {
            const dy = PY(440) - (PY(440) - PY(340)) * k / 6, on = lfoOn && lv > (k + 0.5) / 7;
            for (const c2 of [-1, 1]) G.circ(dx + c2 * 1.1, dy, 0.75, c32(on ? C.Violet : 0x5a6371ff));
          }
        });
        Pill('Sync', 168, 518, 332, 556, 'Sync', rateSync, 'Rate sync', 'ModRateCurrentMapping');
        Pill('Snap', 366, 518, 530, 556, 'Snap', ST.ModShapeCurrentMapping === 1, 'Shape snap', 'ModShapeCurrentMapping');
        KnobAt(P.modRate, 250, 628, 48, 695, 'Rate');
        KnobAt(P.modShape, 447, 628, 48, 695, 'Shape');
        RoundBtn('StRnd', 350, 735, 26, 'StereoRandomizeActive', 'Stereo randomize', (cx, cy, rad, col) => {
          G.ring(cx - rad * 0.28, cy + rad * 0.28, rad * 0.3, col, 1); G.ring(cx + rad * 0.28, cy - rad * 0.28, rad * 0.3, col, 1);
          G.ln(cx - rad * 0.55, cy - rad * 0.55, cx - rad * 0.35, cy - rad * 0.35, col, 1); G.ln(cx + rad * 0.35, cy + rad * 0.35, cx + rad * 0.55, cy + rad * 0.55, col, 1);
        });
        KnobAt(P.modRand, 250, 815, 48, 882, 'Randomize');
        KnobAt(P.modPhase, 447, 815, 48, 882, 'Offset', true);
      }

      // ---- SHIFT DISPLAY
      {
        const L = PX(580), T = PY(82), R = PX(1865), B = PY(462);
        G.rect(L - 1, T - 1, R - L + 2, B - T + 2.5, c32(C.Outline), 5);
        G.gradV(L, T, R - L, B - T, c32(C.Dark), c32(C.DarkLo), 4);
        G.rectS(L, T, R - L, B - T, c32(0x4d5664ff), 4, 1);
        const sL = PX(625), sR = PX(1665), sx0 = (sL + sR) / 2, half = (sR - sL) / 2;
        const a = ax(), LN = Math.log(1 + a.fmax / a.c);
        const FreqX = f => sx0 + Math.sign(f) * clamp(Math.log(1 + Math.abs(f) / a.c) / LN, 0, 1.04) * half;
        const NoteHz = m => 440 * Math.pow(2, (m - 69) / 12);
        const labY = PY(443) - 3.5, gT = PY(90), gB = PY(425);
        G.clip(L, T, PX(1668) - L, B - T);
        let marks;
        if (a.grid === 'note') {
          for (let m = 12; m <= 96; m += 6) for (const sg of [-1, 1]) { const gx = FreqX(sg * NoteHz(m)); G.ln(gx, gT, gx, gB, c32(m % 12 === 0 ? C.GridHi : C.Grid), 1); }
          marks = [[NoteHz(24), 'C1'], [NoteHz(48), 'C3'], [NoteHz(72), 'C5'], [NoteHz(96), 'C7']];
        } else {
          const slow = a.fmax < 100;
          for (let dec = slow ? -1 : 1; dec <= (slow ? 2 : 4); dec++) for (const m of [1, 2, 3, 5, 7]) {
            const f = m * Math.pow(10, dec);
            if (f <= a.fmax) for (const sg of [-1, 1]) { const gx = FreqX(sg * f); G.ln(gx, gT, gx, gB, c32(m === 1 ? C.GridHi : C.Grid), 1); }
          }
          marks = slow ? [[2, '2 Hz'], [10, '10 Hz'], [50, '50 Hz']] : [[200, '200 Hz'], [1000, '1 kHz'], [5000, '5 kHz']];
        }
        G.ln(sx0, gT, sx0, gB, c32(C.GridHi), 1);
        TxtC(sx0, labY, C.Dim, '0', 6.5);
        for (const m of marks) { TxtC(FreqX(m[0]), labY, C.Dim, m[1], 6.5); TxtC(FreqX(-m[0]), labY, C.Dim, '-' + m[1], 6.5); }
        G.unclip();
        Txt(PX(594), PY(107) - 3.5, C.Faint, 'L', 6.5);
        Txt(PX(594), PY(438) - 3.5, C.Faint, 'R', 6.5);
        // the channels' lines: Frequency, moved by each channel's LFO, Spread, Invert
        const baseX = FreqX(fHz(P.freq.n)), spread = P.spread.n * 2 - 1;
        const chanX = (lfo, sg, inv) => { let x = baseX + lfo * half + sg * spread * 0.11 * half; if (inv) x = sx0 - (x - sx0); return x < sL - 2 || x > sR + 2 ? null : x; };
        const xL = chanX(lfoL, -1, ST.LeftInvertActive), xR = chanX(lfoR, 1, ST.RightInvertActive);
        const lT = PY(115), lB = PY(262), rT = PY(278), rB = PY(425);
        G.clip(L, T, PX(1668) - L, B - T);
        // Feedback leaves fading afterimages
        const fbAmt = P.fb.v / 100;
        if (fbAmt > 0.01) {
          const tau = 0.15 * fbAmt / (1 - Math.min(fbAmt, 0.97));
          if (NOW - S.trailT > 1 / 40) { S.trailT = NOW; S.trail.unshift([NOW, xL, xR]); }
          while (S.trail.length && (S.trail.length > 160 || NOW - S.trail[S.trail.length - 1][0] > tau * 3.2)) S.trail.pop();
          for (let i = S.trail.length - 1; i >= 1; i--) {
            const tr = S.trail[i], al = Math.floor(0xb0 * Math.exp(-(NOW - tr[0]) / tau));
            if (al > 6) { if (tr[1] != null) G.ln(tr[1], lT, tr[1], lB, Ab(C.Violet, al), 1.2); if (tr[2] != null) G.ln(tr[2], rT, tr[2], rB, Ab(C.Pink, al), 1.2); }
          }
        } else S.trail = [];
        if (xL != null) G.ln(xL, lT, xL, lB, c32(C.Violet), 1.6);
        if (xR != null) G.ln(xR, rT, xR, rB, c32(C.Pink), 1.6);
        G.unclip();
        [178, 364].forEach((oy, i) => {
          const cx = PX(601), cy = PY(oy), key = i === 0 ? 'LeftInvertActive' : 'RightInvertActive', inv = ST[key] === 1;
          const b = G.btn('inv' + i, cx - 4, cy - 4, 8, 8, 'pointer');
          if (b.c) toggleSt(key);
          const col = c32(inv ? C.Violet : (b.h ? 0xffffffff : 0xd8dbe0ff));
          G.ring(cx, cy, 2.8, col, 0.9);
          G.ctx.beginPath(); G.ctx.arc(cx, cy, 2.8, -PI / 2, PI / 2); G.ctx.closePath(); G.ctx.fillStyle = col; G.ctx.fill();
          if (b.h) G.tip('Invert ' + (i === 0 ? 'left' : 'right') + ' frequency: ' + (inv ? 'on' : 'off') + WS_NOT_HOST);
        });
        // STYLE / MODE box
        const bL = PX(1670), bc = (bL + R) / 2, bw = R - bL - 4;
        G.ln(bL, T + 2, bL, B - 2, c32(0x262b32ff), 1);
        const b1 = G.btn('style', bL, T, R - bL, PY(270) - T, 'pointer');
        if (b1.c) choice(bL, T, R - bL, PY(270) - T, WS_STYLES, ST.ShiftMode, i => { ST.ShiftMode = i; });
        TxtFit(bc, PY(165), b1.h ? C.Text : C.Dim, 'Style', 6.5, bw);
        TxtFit(bc, PY(200), '#fff', WS_STYLES[ST.ShiftMode], LBL, bw);
        if (b1.h) G.tip('Style: ' + WS_STYLES[ST.ShiftMode] + WS_NOT_HOST);
        G.ln(PX(1700), PY(270), PX(1830), PY(270), c32(0x2a3038ff), 1);
        const b2 = G.btn('mode', bL, PY(270), R - bL, B - PY(270), 'pointer');
        if (b2.c) choice(bL, PY(270), R - bL, B - PY(270), ['Stereo', 'Mid-Side'], ST.MidSideActive, i => { ST.MidSideActive = i; });
        TxtFit(bc, PY(335), b2.h ? C.Text : C.Dim, 'Mode', 6.5, bw);
        TxtFit(bc, PY(373), '#fff', ST.MidSideActive ? 'Mid-Side' : 'Stereo', LBL, bw);
        if (b2.h) G.tip('Stereo mode: ' + (ST.MidSideActive ? 'mid-side' : 'stereo') + WS_NOT_HOST);
      }

      // ---- FM + FREQUENCY
      {
        const [L, T, , B] = Panel(580, 482, 1332, 928, false), fR = PX(778);
        G.clip(L, T, fR - L, B - T); G.rect(L, T, fR - L + 5, B - T, c32(C.Dark), 4); G.unclip();
        G.poly([[PX(845), T], [PX(1080), T], [PX(1060), PY(505)], [PX(865), PY(505)]], c32(C.Dark));
        const fmCur = ST.FMSource, lowpassSrc = fmCur >= 3, fc = (L + fR) / 2;
        if (lowpassSrc) TxtC(fc, PY(509) - LBL / 2, C.Text, 'FM', LBL);
        else {
          const b = PrmKnob(P.fmFilter, fc, PY(509), 6);
          TxtC(fc, PY(509) - LBL / 2, Lit(P.fmFilter) ? '#fff' : C.Text, Lit(P.fmFilter) ? P.fmFilter.str() : 'FM', LBL);
          if (b.h) G.tip('FM Lowpass: drag up / down');
        }
        G.ln(PX(618), PY(533), PX(745), PY(533), c32(0x454d5bff), 1);
        {
          const bx = PX(600), by = PY(538), bw2 = PX(760) - PX(600), bh = PY(575) - PY(538), b = G.btn('fmsrc', bx, by, bw2, bh, 'pointer');
          if (b.c) {
            if (G.mx < PX(640)) ST.FMSource = (fmCur + WS_FM.length - 1) % WS_FM.length;
            else if (G.mx > PX(720)) ST.FMSource = (fmCur + 1) % WS_FM.length;
            else choice(bx, by, bw2, bh, WS_FM, fmCur, i => { ST.FMSource = i; }, { 2: true, 3: true });
          }
          const cy = PY(556);
          TxtFit(fc, cy, b.h ? '#fff' : C.Text, WS_FM[fmCur], 6.5, PX(735) - PX(625));
          for (const sg of [-1, 1]) { const x = sg < 0 ? PX(614) : PX(748); G.pline([[x - sg * 1.5, cy - 2.5], [x + sg * 1.5, cy], [x - sg * 1.5, cy + 2.5]], c32(C.Violet), 1); }
          if (b.h) G.tip('FM source: ' + WS_FM[fmCur] + WS_NOT_HOST);
        }
        if (lowpassSrc) KnobAt(P.fmFilter, 680, 645, 48, 711, 'Lowpass'); else KnobAt(P.fmRatio, 680, 645, 48, 711, 'Ratio');
        KnobAt(P.fmAmt, 680, 812, 48, 878, 'Amount');
        // range pill  < FAST >
        {
          const pL = PX(815), pT = PY(532), pR = PX(1080), pB = PY(590), b = G.btn('range', pL, pT, pR - pL, pB - pT, 'pointer');
          const setR = i => { ST.FrequencyCurrentMapping = i; api.check('range'); };
          if (b.c) {
            if (G.mx < PX(873)) setR((range() + 3) % 4);
            else if (G.mx > PX(1023)) setR((range() + 1) % 4);
            else choice(pL, pT, pR - pL, pB - pT, WS_RANGES, range(), setR);
          }
          const rr = (pB - pT) / 2, cy = (pT + pB) / 2;
          G.rect(pL, pT + 1, pR - pL, pB - pT, c32(0x00000050), rr);
          G.rect(pL, pT, pR - pL, pB - pT, c32(b.h ? 0x4c5563ff : 0x424b58ff), rr);
          G.rectS(pL, pT, pR - pL, pB - pT, c32(0x535c6aff), rr, 0.8);
          for (const ox of [873, 1023]) G.ln(PX(ox), pT + 2, PX(ox), pB - 2, c32(0x353c47ff), 1);
          for (const sg of [-1, 1]) { const x = sg < 0 ? PX(840) : PX(1053); G.pline([[x - sg * 1.5, cy - 2.5], [x + sg * 1.5, cy], [x - sg * 1.5, cy + 2.5]], c32(C.Text), 1); }
          TxtFit((PX(873) + PX(1023)) / 2, cy, C.Text, WS_RANGES[range()], LBL, PX(1020) - PX(876));
          if (b.h) G.tip('Frequency range: ' + WS_RANGES[range()] + WS_NOT_HOST);
        }
        KnobAt(P.freq, 948, 715, 85, 825, 'Frequency', true);
        {
          const y = PY(880), x0 = PX(800), x1 = PX(948);
          G.ln(x0, y, x1, y, c32(0x535c6aff), 1); G.ln(x1, y, x1, PY(855), c32(0x535c6aff), 1);
          if (P.fmAmt.n > 0.002) G.ln(x1 - (x1 - x0) * P.fmAmt.n, y, x1, y, c32(C.Violet), 1.2);
        }
        {
          const b = G.btn('softsync', PX(1140), PY(520), PX(1298) - PX(1140), PY(590) - PY(520), 'pointer');
          if (b.c) toggleSt('SoftSyncActive');
          const on = ST.SoftSyncActive === 1;
          TxtFit(PX(1218), PY(538), b.h ? C.Text : C.Dim, 'Soft Sync', 6.5, PX(1300) - PX(1136));
          TxtFit(PX(1218), PY(570), on ? C.Violet : 0xffffffff, on ? 'On' : 'Off', LBL, PX(1300) - PX(1136));
          if (b.h) G.tip('Soft sync: ' + (on ? 'on' : 'off') + WS_NOT_HOST);
        }
        {
          const bL = PX(1145), bT = PY(617), bR = PX(1295), bB = PY(628);
          const b = PrmSlider(P.depth, bL, bT - 2, bR - bL, bB - bT + 4);
          G.rect(bL, bT, bR - bL, bB - bT, c32(0x2e343dff), 2);
          G.rect(bL, bT, (bR - bL) * P.depth.n, bB - bT, c32(Lit(P.depth) ? 0x9a8cffff : 0x6c7482ff), 2);
          if (b.h) G.tip('Depth: ' + P.depth.str());
        }
        {
          const cx = PX(1218);
          TxtC(cx, PY(673) - 3.5, C.Dim, 'Stereo', 6.5);
          const b = PrmKnob(P.width, cx, PY(707), 7);
          TxtC(cx, PY(707) - LBL / 2, Lit(P.width) ? '#fff' : C.Text, P.width.str(), LBL);
          if (b.h) G.tip('Stereo: drag up / down');
        }
        KnobAt(P.spread, 1218, 812, 48, 878, 'Spread', true);
      }

      // ---- FEEDBACK
      {
        const [L, T, R] = Panel(1352, 482, 1865, 928, true);
        const vL = L, vT = T, vR = R, vB = PY(650), vh = vB - vT;
        G.clip(vL, vT, vR - vL, vB - vT + 5, 4); G.rect(vL, vT, vR - vL, vB - vT, c32(C.Dark)); G.unclip();
        const lo = Math.log(20), hi = Math.log(20000), fc = P.fbFreq.v, wv = P.fbBW.n;
        const fLo = fc / Math.pow(2, wv * 5), fHi = fc * Math.pow(2, wv * 5);
        const UX = f => vL + (vR - vL) * (Math.log(clamp(f, 20, 20000)) - lo) / (hi - lo);
        const n = Math.floor(vR - vL), ys = [];
        for (let i = 0; i <= n; i++) {
          const f = Math.exp(lo + (hi - lo) * i / n), xl = Math.pow(f / fHi, 4), xh = Math.pow(fLo / f, 4);
          ys.push([vL + i, vB - vh * clamp((-10 * Math.log10((1 + xl) * (1 + xh)) + 30) / 40)]);
        }
        G.clip(vL, vT, vR - vL, vB - vT);
        const g = G.ctx.createLinearGradient(0, vT, 0, vB); g.addColorStop(0, c32(0x3c3878ff)); g.addColorStop(1, c32(0x26283fff));
        G.area(ys, vB, g);
        // the feedback signal's spectrum (FXD's analyzer after the plugin): simulated, while the transport runs
        if (S.spec && clock.playing && P.fb.v > 0.5) {
          const pts = [], fbk = Math.min(1, P.fb.v / 100);
          for (let i = 0; i <= n; i += 2) {
            const f = Math.exp(lo + (hi - lo) * i / n), xl = Math.pow(f / fHi, 4), xh = Math.pow(fLo / f, 4);
            const db = -10 * Math.log10((1 + xl) * (1 + xh)) - 30 + 24 * fbk + (Math.random() - 0.5) * 6;
            pts.push([vL + i, vB - vh * 0.75 * clamp((db + 90) / 90)]);
          }
          G.pline(pts, c32(0xd6d9f0b0), 0.8);
        }
        G.pline(ys, c32(C.Violet), 1.5);
        G.unclip();
        const hx = UX(fc), hy = vB - vh * (0.07 + 0.86 * wv);
        G.circ(hx, hy, 3.4, c32(0xb4a8ffff)); G.circ(hx, hy, 2.6, c32(C.Violet));
        const bv = G.btn('bandpass', vL, vT, vR - vL, vB - vT, 'move');
        if (bv.a && (G.dx || G.dy)) {
          const fine = G.shift ? 0.2 : 1;
          if (G.dx) P.fbFreq.n = clamp(P.fbFreq.n + G.dx / (vR - vL) * fine);
          if (G.dy) P.fbBW.n = clamp(P.fbBW.n - G.dy / (vh * 0.86) * fine);
          chg(P.fbFreq);
        } else if (bv.h) G.tip('Feedback filter: drag left / right = frequency, up / down = width');
        const bB = PY(688);
        G.rect(vL, vB, vR - vL, bB - vB, c32(C.Dark));
        G.ln(PX(1608), vB + 2, PX(1608), bB - 2, c32(0x3a414bff), 1);
        const by = (vB + bB) / 2 - 3.5;
        const barVal = (p, cx, lbl) => {
          PrmKnob(p, cx, (vB + bB) / 2, 7);
          const s = p.str(), w1 = G.tw(lbl + ' ', 6.5, 500), w2 = G.tw(s, LBL, 500), x0 = cx - (w1 + w2) / 2;
          Txt(x0, by + 0.5, C.Dim, lbl, 6.5); Txt(x0 + w1, by, Lit(p) ? '#fff' : C.Text, s, LBL);
        };
        barVal(P.fbFreq, (PX(1355) + PX(1608)) / 2, 'Freq');
        barVal(P.fbBW, (PX(1608) + PX(1865)) / 2, 'Width');
        KnobAt(P.fb, 1492, 790, 65, 878, 'Feedback');
        G.ln(PX(1560), PY(752), PX(1585), PY(738), c32(0x262b33ff), 1);
        RoundBtn('XFb', 1607, 727, 26, 'CrossFeedbackActive', 'Cross feedback', (cx, cy, rad, col) => {
          const s = rad * 0.5;
          G.pline([[cx - s, cy - s * 0.6], [cx - s * 0.3, cy - s * 0.6], [cx + s * 0.3, cy + s * 0.6], [cx + s, cy + s * 0.6]], col, 1);
          G.pline([[cx - s, cy + s * 0.6], [cx - s * 0.3, cy + s * 0.6], [cx + s * 0.3, cy - s * 0.6], [cx + s, cy - s * 0.6]], col, 1);
        });
        Pill('TimeSync', 1668, 706, 1842, 742, 'Sync', ST.DelayTimeCurrentMapping === 1, 'Time sync', 'DelayTimeCurrentMapping');
        KnobAt(P.time, 1757, 812, 48, 878, 'Time');
      }

      // ---- FOOTER: INPUT / DRY - WET / OUTPUT
      {
        const T0 = PY(950), B0 = H;
        G.clip(0, T0, W, B0 - T0); G.rect(0, T0 - 5, W, B0 - T0 + 5, c32(C.Foot), 5); G.unclip();
        G.poly([[PX(578), B0], [PX(640), T0 + 1], [PX(1360), T0 + 1], [PX(1422), B0]], c32(C.FootLo));
        G.ln(PX(640), T0 + 1, PX(1360), T0 + 1, c32(0x4a525fff), 1);
        for (let k = 0; k <= 2; k++) {
          G.ln(PX(535 + k * 20), B0 - 3, PX(575 + k * 20), T0 + 3, c32(0x5d6573ff), 1);
          G.ln(PX(1425 + k * 20), T0 + 3, PX(1465 + k * 20), B0 - 3, c32(0x5d6573ff), 1);
        }
        const sy = PY(980), ly = PY(1003) - 3.5;
        const HSlider = (p, ox0, ox1, lbl) => {
          const x0 = PX(ox0), x1 = PX(ox1);
          PrmSlider(p, x0, sy - 4, x1 - x0, 8);
          const v = p.n, hx = x0 + (x1 - x0) * v;
          G.rect(x0, sy - 1.5, x1 - x0, 3, c32(C.SliderLo), 1.5);
          G.rect(x0, sy - 1.5, (x1 - x0) * v, 3, c32(Lit(p) ? 0xc4cde0ff : C.Slider), 1.5);
          G.rect(hx - 1, sy - 3, 2, 6, '#fff', 1);
          TxtC((x0 + x1) / 2, ly, Lit(p) ? '#fff' : C.Text, Lit(p) ? p.str() : lbl, 6.5);
        };
        HSlider(P.inGain, 225, 445, 'Input');
        HSlider(P.outGain, 1557, 1777, 'Output');
        {
          const x0 = PX(785), x1 = PX(1220), my = (T0 + B0) / 2;
          TxtR(x0 - 4, my - 3.5, C.Text, 'Dry', 6.5); Txt(x1 + 4, my - 3.5, C.Text, 'Wet', 6.5);
          PrmSlider(P.mix, x0, my - 5, x1 - x0, 10);
          G.rect(x0, my - 1.5, x1 - x0, 3, c32(0x8590a3ff), 1.5);
          const hx = x0 + (x1 - x0) * P.mix.n;
          G.rect(hx - 1.4, my - 4.5, 2.8, 9, '#fff', 1);
          if (Lit(P.mix)) TxtC(hx, T0 - 9, '#fff', P.mix.str(), 6.5);
        }
        RoundBtn('Send', 490, 986, 22, 'InputSendMode', 'Input send mode', (cx, cy, rad, col) => {
          for (let k = 0; k <= 1; k++) { const yy = cy - rad * 0.15 + k * rad * 0.45; G.pline([[cx - rad * 0.4, yy], [cx, yy - rad * 0.35], [cx + rad * 0.4, yy]], col, 1); }
        });
        RoundBtn('Limit', 1825, 986, 22, 'OutputLimiterMode', 'Output soft clip limiter', (cx, cy, rad, col) => {
          const s = rad * 0.5; G.pline([[cx - s, cy + s], [cx - s * 0.3, cy + s], [cx + s * 0.3, cy - s], [cx + s, cy - s]], col, 1);
        });
      }

      // ---- HEADER
      {
        const T0 = 0, B0 = HDR;
        G.clip(0, 0, W, HDR); G.rect(0, 0, W, HDR + 5, c32(C.Hdr), 5); G.unclip();
        const col = c32(C.HdrText), ix = 6, iy = 3.5;
        G.rectS(ix, iy, 9, 8, col, 1, 0.8);
        G.pline([[ix + 1.5, iy + 6], [ix + 3.5, iy + 2], [ix + 5, iy + 6], [ix + 7.5, iy + 2]], col, 0.9);
        Txt(19, T0 + 3.5, C.HdrText, 'WAVE SHIFTER', 7);
        const pL = W * 0.33, pR = W * 0.71;
        G.ln(pL - 3, 3, pL - 3, B0 - 3, c32(C.HdrSep), 1); G.ln(pR + 3, 3, pR + 3, B0 - 3, c32(C.HdrSep), 1);
        for (const [x, sg] of [[pL + 6, -1], [pR - 6, 1]]) G.pline([[x - sg * 1.8, 4.5], [x + sg * 1.8, 7.5], [x - sg * 1.8, 10.5]], c32(C.Text), 1.1);
        TxtC((pL + pR) / 2, 3.5, '#fff', 'Default', 7.5);
        const mx = W - 74, mc = c32(0xc7ccd4ff);
        G.pline([[mx, 4], [mx + 3, 11], [mx + 4.5, 7], [mx + 6, 11], [mx + 10, 3]], mc, 1.2);
        Txt(mx + 13, 1, 0xc7ccd4ff, 'MINIMAL', 6); Txt(mx + 17, 7, 0xc7ccd4ff, 'AUDIO', 6);
        const hm = G.btn('hdrmenu', W - 16, 0, 14, HDR, 'pointer');
        for (let i = 0; i <= 2; i++) G.ln(W - 13, 4.5 + i * 3, W - 5, 4.5 + i * 3, c32(hm.h ? 0xffffffff : C.HdrText), 1);
        if (hm.c) G.menu(W - 16, 0, 14, HDR, [{ label: 'Feedback spectrum', on: S.spec, pick: () => { S.spec = !S.spec; } }]);
      }
    });
    return () => G.cleanup();
  }
  reg({
    id: 'wave-shifter', name: 'Wave Shifter', vendor: 'Minimal Audio', group: 'Third-party',
    width: sxW(440), height: sxHt(),
    blurb: 'A frequency shifter by Minimal Audio, redrawn in the plugin\'s own look. The display shows the left and right shift as two lines on a +/- frequency scale, moved by the LFO.',
    steps: [
      { id: 'freq', text: 'Turn the big <b>Frequency</b> knob', why: 'Both lines move along the scale. Right of 0 shifts up, left of 0 shifts down.', target: tg('wave-shifter', 'freq') },
      { id: 'depth', text: 'Turn <b>Mod Depth</b> up or down', why: 'The LFO moves each channel\'s line by that much. Offset sets how far the left LFO runs behind the right one.', target: tg('wave-shifter', 'depth') },
      { id: 'range', text: 'Click the arrows on the range pill to switch <b>Fast</b>, <b>Tuned</b> and <b>Slow</b>', why: 'The scale changes: up to 7.6 kHz, note names up to C7, or a slow 76 Hz range for tremolo-like moves.', target: tg('wave-shifter', 'range') },
      { id: 'fb', text: 'Drag in the feedback filter view, or turn <b>Feedback</b>', why: 'Left and right sets the filter frequency, up and down its width. With feedback, the lines leave fading afterimages.', target: tg('wave-shifter', 'fb') },
    ],
    notes: [
      { title: 'Two kinds of control', text: 'Knobs and sliders are host params, so they can be modulated and linked. Style, Mode, the range, Sync, Snap, Invert, Soft Sync, the FM source and the round buttons are plugin settings: FX Devices writes them into the plugin\'s saved state, and they cannot be modulated.' },
      { title: 'Presets', text: 'The header steps through Minimal\'s own presets from its SubPresets folder. The header menu also has a compact layout.' },
    ],
    build(body, api) { return buildWaveShifter(body, api); },
  });

  /* ================================================================== VELA (Sonic Digital) */
  // There is no VELA layout script in the FX Devices source to port: this is drawn from the approved renders
  // (FX Devices review/VELA layout/*.png, 1980 x 648 = 3x of 660 x 216). Drawing units are the render's pixels.
  // Values, units and labels are read off the renders; the pages without a render (De-essing, Density) stay closed.
  const VL_S = SC_S / 3;
  const VL = {
    Text: 0xd7d8dbff, Dim: 0x827d8bff, Mute: 0x585065ff, LED: 0x0c87e1ff, Bar: 0x2b353bff, Tab: 0x36333fff, TabOn: 0x4d4a56ff,
    Pill: 0x545565ff, Chip: 0x3f3d51ff, Cap: 0x44404fff, Ring: 0x38374200, Track: 0x231f30ff, Foot: 0x31263fff,
  };
  const VL_TABS = [['De-essing', 175, true], ['Pre EQ', 449, true], ['Decay', 715, false], ['Density', 988, false], ['Filter', 1263, false], ['Post EQ', 1546, true], ['Ducking', 1820, true]];
  const VL_PAGES = { 1: 'eq', 2: 'decay', 4: 'filter', 5: 'eq2', 6: 'duck' };
  function buildVela(body, api) {
    const ID = 'vela', W = 1980, H = 648;
    const G = IM(body, W, H, VL_S, { bg: c32(0x31263fff), pad: padFor(216, SC_S) });
    const ctx = G.ctx;
    const S = {
      tab: 2, tabOn: [1, 1, 0, 0, 0, 1, 1], snap: true, filter: true, early: false, late: true, lock: true, erOn: true, lrOn: true,
      knobs: { size: 0.3, level1: 0.55, decay: 0.12, density: 0.78, level2: 0.5, spread: 0.85, width: 0.5, amount: 0.3, mix: 0.3,
        thr: 0.5, ratio: 0.35, att: 0.18, rel: 0.25, amt: 0.85 },
      seed: 78999, pre: 0, inW: 10, out: -4,
      // decay envelope: time (ms), level (dB), curve of the segment that ends at this node
      env: [{ t: 0, db: -3.9, c: 0 }, { t: 395, db: -21.7, c: -0.56 }, { t: 1250, db: -31.6, c: -0.1 }, { t: 2930, db: -60, c: 0 }],
      eq: [{ f: 81, g: -4.8, q: 0.85, t: 0 }, { f: 465, g: 2.3, q: 1.2, t: 8 }, { f: 1330, g: -2.6, q: 1.4, t: 8 }, { f: 5300, g: 4.6, q: 0.7, t: 1 }],
      eq2: [{ f: 60, g: 0, q: 0.7, t: 0 }, { f: 400, g: 0, q: 1, t: 8 }, { f: 2500, g: 0, q: 1, t: 8 }, { f: 10000, g: 0, q: 0.7, t: 1 }],
      flt: { lp: [1700, 99], hp: [20, 80], hpMode: '12dB/oct', lpMode: '6dB/oct' },
      band: [20, 20000], gate: 1, dEarly: true, dLate: true, sch: false, listen: false,
      drag: null, hov: null,
    };
    const T = (x, y, s, size, col, al, wt) => G.text(x, y, s, size, typeof col === 'string' ? col : c32(col), al || 'l', wt || 400);
    const LED = (x, y, on) => { G.circ(x, y, 10, c32(0x1e2230ff)); G.circ(x, y, 7, c32(on ? VL.LED : 0x15151cff)); if (on) G.circ(x - 2, y - 2, 2.5, 'rgba(255,255,255,.85)'); };
    const pill = (x, y, w, h, col) => G.rect(x, y, w, h, c32(col), h / 2);
    const power = (x, y, col) => { G.arc(x, y, 9, -PI / 2 + 0.6, PI * 1.5 - 0.6, 3, col); G.ln(x, y - 11, x, y - 1, col, 3); };
    // bokeh and floating specks (drift on FXD.clock)
    const specks = Array.from({ length: 70 }, (_, i) => ({ x: (i * 397) % 1900 + 40, y: 70 + (i * 131) % 230, r: 3 + (i * 7) % 6, a: 0.25 + ((i * 13) % 10) / 25, ph: i * 0.7 }));
    let tm = 0;
    // knob: dark cap, blue-violet value arc, white pointer, end dots
    function knob(key, cx, cy, r, label, big) {
      const b = G.drag('k' + key, cx - r - 8, cy - r - 8, (r + 8) * 2, (r + 8) * 2, () => S.knobs[key], n => { S.knobs[key] = n; api.check('knob'); }, { def: S.knobs[key] });
      const v = S.knobs[key], ar = r + 6, a = A0 + (A1 - A0) * v;
      for (const e of [A0, A1]) G.circ(cx + Math.cos(e) * (ar + 2), cy + Math.sin(e) * (ar + 2), 3, c32(0x5a5470ff));
      G.circ(cx + 3, cy + 5, r + 2, 'rgba(10,8,20,.55)');
      G.circ(cx, cy, r, c32(b.h || b.a ? 0x4d4959ff : VL.Cap));
      G.ring(cx, cy, r - 1.5, 'rgba(255,255,255,.06)', 2);
      if (v > 0.002) {
        const g = ctx.createLinearGradient(cx - ar, cy + ar, cx + ar, cy - ar);
        g.addColorStop(0, 'rgb(130,80,255)'); g.addColorStop(0.5, 'rgb(70,94,236)'); g.addColorStop(1, 'rgb(40,140,255)');
        G.arc(cx, cy, ar, A0, a, 6, g);
        if (big) G.arc(cx, cy, ar + 10, A0, a, 4, 'rgba(150,100,255,.7)');
      }
      G.ln(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4), '#e8e8ee', 4);
      if (label) T(cx, cy + r + (big ? 26 : 22), label, 22, VL.Text, 'c', 500);
      return b;
    }
    const tog = (id, x, y, w, h, label, on, set, col) => {
      const b = G.btn(id, x, y, w, h, 'pointer');
      if (b.c) set(!on);
      pill(x, y, w, h, col || (b.h ? 0x5f6072ff : VL.Pill));
      LED(x + 22, y + h / 2 - 2, on);
      T(x + 46, y + h / 2 - 11, label, 22, VL.Text, 'l', 500);
      return b;
    };
    // ---- the pages
    const tX = ms => 41 + ms / 250 * 161.8, xT = x => (x - 41) / 161.8 * 250;
    const dY = db => 119 + (-3.9 - db) * 2.8, yD = y => -3.9 - (y - 119) / 2.8;
    const curveF = (t, c) => c < 0 ? Math.pow(t, 1 + -c * 3) : c > 0 ? 1 - Math.pow(1 - t, 1 + c * 3) : t;
    function drawDecay() {
      const e = S.env;
      // SNAP 1/16
      tog('snap', 1755, 68, 183, 34, 'SNAP  1/16', S.snap, v => { S.snap = v; }, 0x29333aff);
      G.tri(1908, 80, 1926, 80, 1917, 91, c32(VL.Text));
      const pts = [];
      for (let i = 1; i < e.length; i++) for (let k = 0; k <= 24; k++) { const t = k / 24, f = curveF(t, e[i].c); pts.push([lerp(tX(e[i - 1].t), tX(e[i].t), t), lerp(dY(e[i - 1].db), dY(e[i].db), f)]); }
      const g = ctx.createLinearGradient(0, 110, 0, 295); g.addColorStop(0, 'rgba(60,95,140,.55)'); g.addColorStop(1, 'rgba(60,70,120,.15)');
      G.area(pts, 292, g);
      G.clip(41, 100, 1900, 195);
      for (let x = 44; x < 1940; x += 6) G.ln(x, 110, x, 292, 'rgba(120,150,200,.05)', 2);
      G.unclip();
      G.pline(pts, c32(0xc2c4cbff), 4);
      for (let i = 0; i < 12; i++) { const x = 41 + i * 161.8; G.circ(x, 285, 3.5, c32(0x9a96a8ff)); T(x, 297, ['1', '1.1.3', '1.2', '1.2.3', '1.3', '1.3.3', '1.4', '1.4.3', '2', '2.1.3', '2.2', '2.2.3'][i], 20, VL.Dim, 'c'); }
      let hov = null;
      e.forEach((n, i) => {
        const x = tX(n.t), y = dY(n.db), b = G.btn('env' + i, x - 18, y - 18, 36, 36, 'move');
        if (b.h || b.a) hov = i;
        if (b.a && (G.dx || G.dy)) {
          let t = clamp(xT(G.mx), i ? e[i - 1].t + 10 : 0, i < e.length - 1 ? e[i + 1].t - 10 : 2930);
          if (i === 0) t = 0;
          if (S.snap && i > 0) { const st = 60000 / (G.clock ? G.clock.bpm : 120) / 4; t = clamp(Math.round(t / st) * st, e[i - 1].t + 1, i < e.length - 1 ? e[i + 1].t - 1 : 2930); }
          n.t = t; n.db = clamp(yD(G.my), -60, 0);
          api.check('node');
        }
        const on = b.h || b.a;
        G.circ(x, y, 13, c32(0x1e1d2aff)); G.ring(x, y, 12, on ? c32(VL.LED) : c32(0xe8e8eeff), 4);
        const lx = i === e.length - 1 ? x - 18 : x + 20, ly = y - 36 + (i === 0 ? 30 : 0);
        T(lx, ly, n.db.toFixed(1) + 'dB', 22, on ? VL.LED : VL.Text, i === e.length - 1 ? 'r' : 'l');
      });
      if (hov != null) {
        const n = e[hov], x = clamp(tX(n.t) - 99, 20, 1660), y = clamp(dY(n.db) + 30, 60, 210);
        G.rect(x, y, 285, 120, 'rgba(40,38,52,.92)', 10); G.rectS(x, y, 285, 120, 'rgba(255,255,255,.16)', 10, 2);
        [['TIME:', Math.round(n.t), 'ms'], ['LEVEL:', n.db.toFixed(1), 'dB'], ['CURVE:', n.c.toFixed(2), '']].forEach((r, k) => {
          T(x + 20, y + 18 + k * 33, r[0], 21, VL.Dim); T(x + 112, y + 15 + k * 33, String(r[1]), 25, '#fff'); if (r[2]) T(x + 112 + G.tw(String(r[1]), 25, 400) + 6, y + 18 + k * 33, r[2], 21, VL.Dim);
        });
      }
    }
    const eqX = f => 483 + Math.log2(f / 100) * 191, xEq = x => 100 * Math.pow(2, (x - 483) / 191), eqY = g => 192 - g * 3.5, yEq = y => (192 - y) / 3.5;
    const qBw = q => 2 / Math.LN2 * Math.asinh(1 / (2 * q));
    function drawEQ(bands, key) {
      for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { G.ln(eqX(f), 90, eqX(f), 292, 'rgba(255,255,255,.07)', 2); T(eqX(f), 298, f >= 1000 ? f / 1000 + 'k' : String(f), 20, VL.Dim, 'c'); }
      for (const g of [12, 0, -12]) { G.ln(41, eqY(g), 1940, eqY(g), 'rgba(255,255,255,.07)', 2); T(12, eqY(g) - 11, (g > 0 ? '+' : '') + g, 20, VL.Dim); }
      const cs = bands.map(b => reCoefs(b.t, b.f, b.g, qBw(b.q)));
      const pts = [];
      for (let x = 41; x <= 1940; x += 4) { const f = xEq(x); let v = 0; for (const c of cs) v += reMag(c, f); pts.push([x, eqY(v)]); }
      G.ctx.beginPath(); G.ctx.moveTo(41, eqY(0)); for (const p of pts) G.ctx.lineTo(p[0], p[1]); G.ctx.lineTo(1940, eqY(0)); G.ctx.closePath(); G.ctx.fillStyle = 'rgba(40,80,120,.45)'; G.ctx.fill();
      G.pline(pts, c32(0xc2c4cbff), 4);
      let hov = null;
      bands.forEach((b, i) => {
        const x = eqX(b.f), y = eqY(b.g), bb = G.btn(key + i, x - 18, y - 18, 36, 36, 'move');
        if (bb.h || bb.a) hov = i;
        if (bb.a && (G.dx || G.dy)) { b.f = clamp(xEq(G.mx), 20, 20000); b.g = clamp(yEq(G.my), -18, 18); api.check('node'); }
        if (bb.h) { const wv = G.useWheel(x - 18, y - 18, 36, 36); if (wv) { b.q = clamp(b.q * Math.pow(1.1, wv), 0.1, 10); api.check('node'); } }
        const on = bb.h || bb.a;
        G.circ(x, y, 16, c32(0x1e1d2aff)); G.ring(x, y, 15, on ? c32(VL.LED) : c32(0xe8e8eeff), 3.5);
        T(x, y - 12, String(i + 1), 22, '#fff', 'c', 500);
      });
      if (hov != null) {
        const b = bands[hov], x = clamp(eqX(b.f) - 100, 20, 1630), y = clamp(eqY(b.g) + 29, 60, 210);
        G.rect(x, y, 335, 120, 'rgba(40,38,52,.92)', 10); G.rectS(x, y, 335, 120, 'rgba(255,255,255,.16)', 10, 2);
        LED(x + 24, y + 27, true);
        const fs = b.f >= 1000 ? (b.f / 1000).toFixed(2) : Math.round(b.f) + '', fu = b.f >= 1000 ? 'kHz' : 'Hz';
        [['FREQ:', fs, fu], ['GAIN:', b.g.toFixed(1), 'dB'], ['Q:', b.q.toFixed(2), '']].forEach((r, k) => {
          T(x + 44, y + 18 + k * 33, r[0], 21, VL.Dim); T(x + 137, y + 15 + k * 33, r[1], 25, '#fff'); if (r[2]) T(x + 137 + G.tw(r[1], 25, 400) + 6, y + 18 + k * 33, r[2], 21, VL.Dim);
        });
        G.rect(x + 263, y + 33, 54, 54, c32(0x4a4a5eff), 8);
        const ic = b.t === 0 ? [[0, 1], [0.4, 1], [0.6, 0], [1, 0]] : b.t === 1 ? [[0, 0], [0.4, 0], [0.6, 1], [1, 1]] : [[0, 0.5], [0.3, 0.5], [0.5, 0.1], [0.7, 0.5], [1, 0.5]];
        G.pline(ic.map(p => [x + 270 + p[0] * 40, y + 50 + p[1] * 20]), c32(0x2f9bf0ff), 3);
      }
    }
    const fY = f => 276 - 56 * Math.log10(f / 20), yF = y => 20 * Math.pow(10, (276 - y) / 56);
    function drawFilter() {
      const F_ = S.flt;
      for (const [k, x, lbl] of [['hpMode', 1400, 'HI-PASS'], ['lpMode', 1680, 'LO-PASS']]) {
        const w = 260, b = G.btn(k, x, 68, w, 34, 'pointer');
        pill(x, 68, w, 34, b.h ? 0x313b44ff : 0x29333aff);
        LED(x + 20, 83, true);
        T(x + 40, 74, lbl + '  ' + F_[k], 22, VL.Text, 'l', 500);
        G.tri(x + w - 26, 80, x + w - 8, 80, x + w - 17, 91, c32(VL.Text));
        if (b.c) G.menu(x, 68, w, 34, ['6dB/oct', '12dB/oct', '24dB/oct'].map(s => ({ label: s, on: F_[k] === s, pick: () => { F_[k] = s; } })));
      }
      const g = ctx.createLinearGradient(0, 110, 0, 295); g.addColorStop(0, 'rgba(60,95,140,.55)'); g.addColorStop(1, 'rgba(60,70,120,.15)');
      G.poly([[41, fY(F_.lp[0])], [1937, fY(F_.lp[1])], [1937, fY(F_.hp[1])], [41, fY(F_.hp[0])]], g);
      G.clip(41, 100, 1900, 195);
      for (let x = 44; x < 1940; x += 6) G.ln(x, 110, x, 292, 'rgba(120,150,200,.05)', 2);
      G.unclip();
      G.ln(41, fY(F_.hp[0]), 1937, fY(F_.hp[1]), c32(0x7a5ad8ff), 4);
      G.ln(41, fY(F_.lp[0]), 1937, fY(F_.lp[1]), c32(0xc2c4cbff), 4);
      const lbls = ['0', '0.25', '0.5', '0.75', '1', '1.2', '1.5', '1.8', '2', '2.2', '2.5', '2.8'];
      for (let i = 0; i < 12; i++) { const x = 41 + i * 161.8; if (i) G.circ(x, 285, 3.5, c32(0x9a96a8ff)); T(x, 297, lbls[i], 20, VL.Dim, 'c'); }
      const fmt = f => f >= 1000 ? (f / 1000).toFixed(1) + 'kHz' : Math.round(f) + 'Hz';
      [['lp', 0, 41], ['lp', 1, 1937], ['hp', 0, 41], ['hp', 1, 1937]].forEach(([k, j, x]) => {
        const y = fY(F_[k][j]), b = G.btn('f' + k + j, x - 18, y - 18, 36, 36, 'ns-resize');
        if (b.a && G.dy) { F_[k][j] = clamp(yF(G.my), 20, 20000); api.check('node'); }
        const on = b.h || b.a;
        G.circ(x, y, 13, c32(0x1e1d2aff)); G.ring(x, y, 12, on ? c32(VL.LED) : c32(0xe8e8eeff), 4);
        const col = k === 'hp' ? 0x7a5ad8ff : VL.Text;
        if (j === 0) T(k === 'hp' ? 60 : 60, k === 'hp' ? y + 14 : y - 32, fmt(F_[k][j]), 22, on ? VL.LED : col);
        else T(1918, k === 'hp' ? y + 14 : y - 34, fmt(F_[k][j]), 22, on ? VL.LED : col, 'r');
      });
    }
    const bX = f => 41 + Math.log10(f / 20) * 224.6, xB = x => 20 * Math.pow(10, (x - 41) / 224.6);
    function drawDuck() {
      const L = bX(S.band[0]), R = bX(S.band[1]);
      G.rect(41, 92, 672, 194, 'rgba(20,18,30,.35)');
      G.gradH(L, 92, R - L, 194, 'rgba(110,60,190,.75)', 'rgba(30,90,140,.75)');
      for (const f of [100, 1000, 10000]) { G.ln(bX(f), 92, bX(f), 286, 'rgba(255,255,255,.08)', 2); T(bX(f), 296, f === 100 ? '100' : f === 1000 ? '1k' : '10k', 20, VL.Dim, 'c'); }
      T(60, 104, 'DETECTOR BAND', 22, 0x9a8db5ff, 'l', 500);
      [0, 1].forEach(j => {
        const x = bX(S.band[j]), b = G.btn('band' + j, x - 16, 90, 32, 200, 'ew-resize');
        if (b.a && G.dx) { S.band[j] = j ? clamp(xB(G.mx), S.band[0] * 1.2, 20000) : clamp(xB(G.mx), 20, S.band[1] / 1.2); api.check('node'); }
        G.ln(x, 100, x, 286, b.h || b.a ? c32(VL.LED) : '#e8e8ee', 4);
        G.circ(x, 108, 9, b.h || b.a ? c32(VL.LED) : '#e8e8ee');
      });
      [['thr', 890, 'THRESHOLD'], ['ratio', 1048, 'RATIO'], ['att', 1207, 'ATTACK'], ['rel', 1366, 'RELEASE'], ['amt', 1524, 'AMOUNT']].forEach(k => knob(k[0], k[1], 198, 38, null));
      [['THRESHOLD', 890], ['RATIO', 1048], ['ATTACK', 1207], ['RELEASE', 1366], ['AMOUNT', 1524]].forEach(k => T(k[1], 248, k[0], 24, VL.Text, 'c', 500));
      // GATE / COMP
      pill(1643, 86, 295, 36, 0x2b2a36ff);
      ['GATE', 'COMP'].forEach((s, i) => {
        const x = 1643 + i * 148, b = G.btn('gc' + i, x, 86, 147, 36, 'pointer');
        if (b.c) S.gate = i;
        if (S.gate === i) pill(x, 86, 147, 36, 0x3a3846ff);
        T(x + 74, 92, s, 24, S.gate === i ? '#fff' : VL.Text, 'c', 500);
      });
      tog('dE', 1643, 134, 142, 35, 'EARLY', S.dEarly, v => { S.dEarly = v; });
      tog('dL', 1797, 134, 141, 35, 'LATE', S.dLate, v => { S.dLate = v; });
      tog('dS', 1643, 182, 142, 35, 'S-CHAIN', S.sch, v => { S.sch = v; });
      tog('dLi', 1797, 182, 141, 35, 'LISTEN', S.listen, v => { S.listen = v; });
    }

    TG[ID] = { tabs: G.anchor(30, 333, 1920, 40), display: G.anchor(20, 60, 1940, 270), knobs: G.anchor(80, 420, 1850, 140) };
    G.frame((G, dt, clock) => {
      if (!F.reducedMotion) tm += dt;
      // background
      G.gradV(0, 0, W, 330, c32(0x36424aff), c32(0x333347ff));
      G.gradV(0, 330, W, 268, c32(0x333347ff), c32(0x362b48ff));
      G.rect(0, 597, W, 51, c32(VL.Foot));
      // bokeh and specks over the display
      G.clip(0, 56, W, 280);
      for (const [x, y, r, a] of [[760, 190, 110, 0.35], [1060, 190, 80, 0.3], [1830, 230, 60, 0.25], [520, 250, 40, 0.18]]) {
        const yy = y + Math.sin(tm * 0.3 + x) * 6;
        const g = ctx.createRadialGradient(x, yy, 0, x, yy, r); g.addColorStop(0, `rgba(110,80,220,${a})`); g.addColorStop(1, 'rgba(110,80,220,0)');
        G.circ(x, yy, r, g);
      }
      for (const s of specks) { const y = 70 + ((s.y - 70 - tm * 6 + 1e4) % 240); G.circ(s.x + Math.sin(tm * 0.5 + s.ph) * 4, y, s.r, `rgba(160,165,200,${s.a * 0.5})`); }
      G.unclip();
      // header
      G.pline([[38, 16], [56, 44], [74, 16]], c32(VL.Text), 4);
      G.pline([[118, 16], [94, 16], [94, 44], [118, 44]], c32(VL.Text), 4); G.ln(94, 30, 114, 30, c32(VL.Text), 4);
      G.pline([[136, 14], [136, 44], [158, 44]], c32(VL.Text), 4);
      G.pline([[158, 44], [170, 16], [182, 44]], c32(VL.Text), 4);
      pill(318, 10, 1267, 42, VL.Bar);
      power(348, 32, c32(0x2f9bf0ff));
      for (let i = 0; i < 3; i++) G.ln(382, 22 + i * 9, 404, 22 + i * 9, c32(VL.Text), 3);
      T(425, 19, 'Factory > Drums >', 24, 0x9aa0aaff); T(632, 19, 'Snare Tail*', 24, '#fff');
      T(1518, 19, '<', 24, VL.Text, 'c'); T(1556, 19, '>', 24, VL.Text, 'c');
      T(1943, 8, 'SONIC', 30, VL.Text, 'r', 500);
      ctx.save(); ctx.letterSpacing = '6px'; T(1943, 38, 'DIGITAL', 14, 0x9aa0aaff, 'r', 500); ctx.restore();
      // the page
      const page = VL_PAGES[S.tab];
      if (page === 'decay') drawDecay(); else if (page === 'eq') drawEQ(S.eq, 'eq'); else if (page === 'eq2') drawEQ(S.eq2, 'eq2'); else if (page === 'filter') drawFilter(); else if (page === 'duck') drawDuck();
      // tabs
      pill(30, 333, 1920, 40, VL.Tab);
      VL_TABS.forEach(([name, cx, led], i) => {
        const x = cx - 135, open = VL_PAGES[i] != null, b = G.btn('tab' + i, x + (led ? 50 : 0), 333, 270 - (led ? 50 : 0), 40, open ? 'pointer' : 'default');
        if (S.tab === i) { G.rect(x + 6, 338, 260, 36, 'rgba(0,0,0,.25)', 16); G.rect(x + 6, 336, 260, 34, c32(VL.TabOn), 16); }
        if (b.c && open && S.tab !== i) { S.tab = i; api.check('tab'); }
        if (b.h && !open) G.tip('This page is not part of the demo');
        if (led) {
          const lx = cx - (name === 'De-essing' ? 82 : name === 'Ducking' ? 70 : 63) - (name === 'Post EQ' ? 6 : 0), lb = G.btn('tled' + i, lx - 16, 335, 32, 36, 'pointer');
          if (lb.c) S.tabOn[i] = S.tabOn[i] ? 0 : 1;
          LED(lx, 351, !!S.tabOn[i]);
        }
        T(cx + (led ? 8 : 0), 340, name, 24, S.tab === i ? '#fff' : (open ? VL.Text : 0x9893a3ff), 'c');
      });
      // stage row
      pill(30, 382, 355, 38, 0x3f3d51ff); G.rect(30, 382, 355, 38, c32(0x3f3d51ff), 8);
      T(48, 389, '<', 22, VL.Text, 'c'); T(84, 389, '>', 22, VL.Text, 'c'); T(114, 389, 'Stage P', 22, VL.Text);
      G.tri(354, 396, 372, 396, 363, 407, c32(VL.Text));
      tog('filter', 400, 382, 143, 38, 'FILTER', S.filter, v => { S.filter = v; });
      pill(1477, 384, 223, 34, 0x15151cff);
      { const b = G.btn('early', 1477, 384, 112, 34, 'pointer'); if (b.c) S.early = !S.early; LED(1496, 399, S.early); T(1520, 390, 'EARLY', 22, VL.Text, 'l', 500); }
      { const b = G.btn('late', 1591, 384, 109, 34, 'pointer'); if (b.c) S.late = !S.late; pill(1592, 386, 107, 30, S.late ? 0x2e2c3cff : 0x15151cff); LED(1610, 399, S.late); T(1641, 390, 'LATE', 22, VL.Text, 'l', 500); }
      tog('lock', 1770, 382, 130, 38, 'LOCK', S.lock, v => { S.lock = v; });
      // knobs and sections
      knob('size', 140, 470, 38, 'SIZE'); knob('level1', 312, 470, 38, 'LEVEL');
      knob('decay', 569, 470, 38, 'DECAY'); knob('density', 737, 470, 38, 'DENSITY'); knob('level2', 905, 470, 38, 'LEVEL');
      knob('spread', 1162, 470, 38, 'SPREAD'); knob('width', 1330, 470, 38, 'WIDTH'); knob('amount', 1583, 470, 38, 'AMOUNT');
      knob('mix', 1834, 468, 46, 'MIX', true);
      const sect = (x0, x1, cx, label, pw, on, set) => {
        const tw = G.tw(label, 22, 500) + (pw ? 34 : 0), l = cx - tw / 2, r = cx + tw / 2;
        G.rect(x0, 566, Math.max(0, l - 14 - x0), 7, c32(0x3e3350ff), 3); G.rect(r + 14, 566, Math.max(0, x1 - r - 14), 7, c32(0x3e3350ff), 3);
        if (pw) {
          const b = G.btn('pw' + label, l - 4, 556, 34, 34, 'pointer');
          if (b.c) set(!on);
          power(l + 12, 572, on ? c32(0x2f9bf0ff) : c32(0x6a6478ff));
        }
        T(l + (pw ? 34 : 0), 561, label, 22, VL.Dim, 'l', 500);
      };
      sect(36, 426, 230, 'EARLY REFLECTIONS', true, S.erOn, v => { S.erOn = v; });
      sect(462, 1020, 742, 'LATE REVERB', true, S.lrOn, v => { S.lrOn = v; });
      sect(1054, 1445, 1249, 'STEREO'); sect(1478, 1697, 1587, 'DIFFUSION'); sect(1732, 1950, 1841, 'OUTPUT');
      // footer
      const val = (id, x, label, v, fmt, set, lo, hi, step) => {
        T(x, 611, label, 22, VL.Dim, 'l', 500);
        const vx = x + G.tw(label, 22, 500) + 14, s = fmt(v), b = G.btn(id, vx - 4, 600, G.tw(s, 22, 500) + 10, 46, 'ns-resize');
        if (b.a && G.dy) { S['_' + id] = (S['_' + id] || 0) - G.dy; const d = Math.trunc(S['_' + id] / 6); if (d) { S['_' + id] -= d * 6; set(clamp(v + d * step, lo, hi)); } }
        T(vx, 611, s, 22, b.h || b.a ? '#fff' : 0xf2f2f6ff, 'l', 500);
      };
      val('pre', 40, 'PRE DELAY', S.pre, v => Math.round(v) + 'ms', v => { S.pre = v; }, 0, 500, 1);
      val('inw', 317, 'INPUT WIDTH', S.inW, v => Math.round(v) + '%', v => { S.inW = v; }, 0, 100, 1);
      T(614, 611, 'SEED', 22, VL.Dim, 'l', 500); T(683, 611, String(S.seed), 22, '#f2f2f6', 'l', 500);
      {
        const b = G.btn('dice', 800, 605, 36, 36, 'pointer');
        if (b.c) S.seed = 10000 + Math.floor(Math.random() * 89999);
        G.rectS(803, 608, 30, 30, b.h ? '#fff' : c32(0xb8b4c4ff), 5, 2.5);
        for (const [px, py] of [[811, 616], [818, 623], [825, 630]]) G.circ(px, py, 2.2, b.h ? '#fff' : c32(0xb8b4c4ff));
      }
      T(881, 611, 'MOD CHANNELS', 22, VL.Dim, 'l', 500); T(1068, 611, 'Off', 22, '#f2f2f6', 'l', 500); G.tri(1108, 618, 1122, 618, 1115, 627, '#f2f2f6');
      T(1208, 611, 'MOD SPEED  50%', 22, 0x58506aff, 'l', 500); T(1475, 611, 'MOD AMT  50%', 22, 0x58506aff, 'l', 500);
      val('out', 1713, 'OUTPUT', S.out, v => Math.round(v) + 'dB', v => { S.out = v; }, -24, 12, 1);
    });
    return () => G.cleanup();
  }
  reg({
    id: 'vela', name: 'VELA', vendor: 'Sonic Digital', group: 'Third-party',
    width: frameW(660, SC_S), height: frameH(216, SC_S),
    blurb: 'A reverb with a page per stage: pre EQ, a drawn decay envelope, a filter that moves over the tail, post EQ and ducking. FX Devices draws it from the plugin\'s own look so it fits in the chain.',
    steps: [
      { id: 'node', text: 'Drag a node in the decay envelope', why: 'Hover a node to see its time, level and curve. With SNAP on, time snaps to 1/16 notes.', target: tg('vela', 'display') },
      { id: 'tab', text: 'Open another page, like <b>Pre EQ</b>, <b>Filter</b> or <b>Ducking</b>', why: 'The display above the tabs changes with the page. The blue dots switch a stage on or off.', target: tg('vela', 'tabs') },
      { id: 'knob', text: 'Turn a knob in the bottom row, like <b>DECAY</b> or <b>MIX</b>', why: 'These stay the same on every page.', target: tg('vela', 'knobs') },
    ],
    notes: [
      { title: 'About this demo', text: 'VELA has no layout script in the FX Devices source yet, so this one is drawn from the approved design renders. The De-essing and Density pages are not drawn. Nothing here makes sound.' },
      { title: 'On the EQ pages', text: 'Drag a numbered node for frequency and gain. Wheel over it to change its Q.' },
    ],
    build(body, api) { return buildVela(body, api); },
  });

  /* ================================================================== Love 2 (Dawesome) */
  // There is no Love 2 layout script in the FX Devices source to port: this is drawn from the approved renders
  // (FX Devices review/Love 2 layout/*.png, viewed at 2000 x 583). Drawing units are those pixels.
  // Labels, colours and the four presets are read off the renders. The right ring on a slot header flips it
  // between its picture (front) and its knobs (back); only the sides shown in the renders are drawn.
  const L2_S = 0.42;
  const L2_ENG = [
    { name: 'SWARM', acc: 0xe456e8ff, line: 0xf070f0ff, wave: 0x4a3352ff, g0: 0xb848bcff, g1: 0x2c1630ff, knobs: ['COUNT', 'DURATION', 'POS-JIT'] },
    { name: 'CHOP', acc: 0xad77f5ff, line: 0xad77f5ff, wave: 0x48395cff, g0: 0x7a58c4ff, g1: 0x1f152cff, knobs: ['BPM', 'GRAIN SIZE', 'POS-JIT'] },
    { name: 'ROBOT', acc: 0xad77f5ff, line: 0xb49cf8ff, wave: 0x48395cff, g0: 0x5c4c9cff, g1: 0x221c38ff, knobs: ['BPM', 'SPEED', 'SYN'] },
  ];
  // knob rows: [label, x in slot, y, size 0 small / 1 medium / 2 big, dim label]
  const l2Two = (a, b) => [...a.map((l, i) => [l, 82 + i * 150, 375, 2]), ...b.map((l, i) => b.length === 2 ? [l, 82 + i * 150, 465, 2] : [l, 57 + i * 100, 465, 2])];
  const l2Three = (a, b) => [...a.map((l, i) => [l, 57 + i * 100, 375, 2]), ...b.map((l, i) => [l, 57 + i * 100, 465, 2])];
  const L2_FX = {
    grains: { hd: 'GRAINS', title: 'GRAINS', col: 0x9d90f0ff, front: 'grains', line: 387, knobs: [['GLITTER', 81, 375, 2], ['DETUNE', 231, 375, 2], ['JIT', 56, 465, 2], ['CALM', 156, 465, 2], ['WET', 256, 465, 2]] },
    grains2: { hd: 'GRAINS 2', title: 'GRAINS 2', col: 0xa79ff0ff, front: 'grains', line: 412, knobs: [['GLITTER', 81, 375, 2], ['DETUNE', 231, 375, 2], ['JIT', 56, 465, 2], ['CALM', 156, 465, 2], ['WET', 256, 465, 2]] },
    sat: { hd: 'SATURAT', title: 'SATURATOR', col: 0xf08c3cff, front: 'sat', line: 361, knobs: [['DRIVE', 56, 375, 2], ['ATT', 156, 375, 2], ['WET', 256, 375, 2]], sel: ['WARM', 156, 471, 5, 1] },
    loop: { hd: 'LOOPHOLE', title: 'LOOPHOLE', col: 0x9488f0ff, front: 'loop', line: 422, knobs: [['DENSE', 56, 465, 2], ['DECAY', 156, 465, 2], ['WET', 256, 465, 2]], boxes: [['REVERSE', 181, 371, 103, 25]], matrix: true },
    dist: { hd: 'DISTORT', title: 'DISTORT', col: 0xf06528ff, front: 'dist', line: 378 },
    delay: { hd: 'DELAY', title: 'DELAY', col: 0x1fbf80ff, front: 'delay', line: 439,
      knobs: [['FB', 57, 418, 0], ['TIME', 157, 418, 0], ['WET', 257, 418, 0], ['LOW-CUT', 82, 478, 0], ['HIGH-CUT', 232, 478, 0]], boxes: [['SYNC', 47, 357, 72, 23], ['PI-PO', 198, 357, 71, 23]] },
    shimmer: { hd: 'SHIMMER', title: 'SHIMMER', col: 0xb4c832ff, knobs: l2Two(['SIZE', 'PITCH'], ['CUTOFF', 'RESO', 'WET']) },
    clouds: { hd: 'CLOUDS', title: 'CLOUDS', col: 0x2cc8e8ff, knobs: l2Two(['SIZE', 'SPACE'], ['EARLY', 'LUSH', 'WET']) },
    dual: { hd: 'DUAL', title: 'DUAL DELAY', col: 0x22a8f2ff,
      knobs: [['RATE L', 43, 418, 0], ['RATE R', 117, 418, 0], ['FB-L', 192, 418, 0], ['FB-R', 268, 418, 0], ['SPILL', 56, 478, 0], ['TONE', 157, 478, 0], ['WET', 257, 478, 0]],
      boxes: [['SYNC', 22, 357, 71, 23], ['120', 126, 348, 64, 28, 'BPM'], ['LINK', 227, 357, 61, 23, null, true]] },
    multi: { hd: 'MULTI FIL', title: 'MULTI FILTER', col: 0xa4e070ff, front: 'multi', line: 397 },
    eq: { hd: 'EQ', title: 'EQ', col: 0xe2e2e2ff,
      knobs: [['LOW', 44, 375, 1], ['MID', 119, 375, 1, true], ['HIGH', 194, 375, 1], ['WET', 269, 375, 1], ['LOW X', 56, 465, 2], ['HIGH X', 156, 465, 2]], sel: ['24DB', 257, 471, 3, 1] },
    comp: { hd: 'COMP', title: 'COMPRESSOR', col: 0xf03a3aff, knobs: l2Three(['THRESH', 'RATIO', 'KNEE'], ['ATTACK', 'RELEASE', 'WET']) },
    ott: { hd: 'OTT', title: 'OTT', col: 0xf03a3aff, knobs: [['LOW', 56, 375, 2], ['MAIN-MID', 156, 375, 2], ['HIGH', 256, 375, 2], ['WET', 156, 465, 2]] },
    j60: { hd: 'J-60', title: 'J-60 CHORUS', col: 0xcfcab0ff, knobs: [['WET', 231, 420, 2]], j60: true },
    pulse: { hd: 'PULSE', title: 'PULSE GATE', col: 0xa488ffff,
      knobs: [['RATE', 194, 375, 1], ['WET', 269, 375, 1], ['A:R', 44, 465, 1], ['HOLD', 119, 465, 1], ['MISS', 194, 465, 1], ['JITT', 269, 465, 1]],
      boxes: [['SYNC', 9, 372, 70, 24], ['120', 88, 362, 63, 28, 'BPM']] },
    plate: { hd: 'PLATE', title: 'PLATE', col: 0xf070c0ff, knobs: l2Three(['LPF', 'HPF', 'PRE'], ['MOD', 'FB', 'WET']) },
    filter: { hd: 'FILTER', title: 'FILTER', col: 0xf08c1cff, knobs: l2Two(['CUTOFF', 'RESO'], ['DRIVE', 'ANTI', 'WET']) },
    vowel: { hd: 'VOWEL', title: 'VOWEL', col: 0x74c830ff, knobs: l2Two(['AEIOU', 'FORMANT'], ['VOW', 'WET']) },
    chorus: { hd: 'CHORUS', title: 'CHORUS', col: 0x20c8b4ff, knobs: l2Two(['DEPTH', 'SPEED'], ['FB', 'THICK', 'WET']) },
    lim: { hd: 'LIM', title: 'LIMITER', col: 0xf03044ff, knobs: l2Two(['KNEE', 'RELEASE'], ['THRESH', 'WET']) },
  };
  const L2_PRE = [
    { name: 'FEATHER DUST', eng: 1, slots: [['grains', 0], ['sat', 0], ['loop', 0], ['dist', 0], ['grains2', 0], ['delay', 0]] },
    { name: 'ROBOT LULLABY', eng: 2, slots: [['shimmer', 1], ['clouds', 1], ['dual', 1], ['loop', 1], ['grains', 1], ['sat', 1]] },
    { name: 'SWARM OF LIGHT', eng: 0, slots: [['multi', 0], ['eq', 1], ['comp', 1], ['ott', 1], ['j60', 1], ['pulse', 1]] },
    { name: 'GLASS CORRIDOR', eng: 1, slots: [['delay', 1], ['plate', 1], ['filter', 1], ['vowel', 1], ['chorus', 1], ['lim', 1]] },
  ];
  function buildLove2(body, api) {
    const ID = 'love2', W = 2000, H = 583;
    const G = IM(body, W, H, L2_S, { bg: '#0c0c0c', pad: padFor(H, L2_S) });
    const ctx = G.ctx, A0 = PI * 0.75, A1 = PI * 2.25;
    const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);
    const hash = s => { let x = 0; for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) | 0; return x; };
    const S = {
      pre: 0, eng: 1, j60: 1,
      slots: L2_PRE.map(p => p.slots.map(([t, b]) => ({ t, back: !!b, on: true }))),
      lines: {}, V: {},
      top: { in: 0.5, out: 0.56, offset: 0.85, trans: 0.5, oct: 0.5, tune: 0.5, tunej: 0.17, rev: 0.33, panj: 0.4, r0: 0.38, r1: 0.6, r2: 0.22, wetg: 0.5, mix: 0.64 },
      grains: [[837, 109, 17], [877, 133, 16], [912, 131, 15], [917, 127, 12]].map(([x, y, r]) => ({ x, y, r, age: 0, life: 1.6 })),
      beats: 0, spawn: 0,
    };
    // seeded decoration for the pictures
    const seeds = { bub: Array.from({ length: 24 }, () => [rnd(), rnd(), 4 + rnd() * 5, 0.45 + rnd() * 0.5]),
      str: Array.from({ length: 26 }, () => [rnd(), 0.35 + rnd() * 0.65, rnd() * 2 - 1]),
      dots: Array.from({ length: 64 }, () => 0.3 + rnd() * 0.7),
      wave: Array.from({ length: 150 }, (_, i) => 0.5 + 0.35 * Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11)) + rnd() * 0.15) };
    let tm = 0;
    const T = (x, y, s, size, col, al, wt) => G.text(x, y - size * 0.52, s, size, typeof col === 'string' ? col : c32(col), al || 'c', wt || 500);
    const radio = (x, y, col) => { G.ring(x, y, 8.5, col, 2.5); G.circ(x, y, 4, col); };
    const burger = (x, y, col) => { for (let i = 0; i < 3; i++) G.ln(x, y - 7 + i * 7, x + 20, y - 7 + i * 7, col, 2.5); };
    const defN = key => 0.25 + (((hash(key) % 1000) + 1000) % 1000) / 1000 * 0.55;
    const val = key => S.V[key] != null ? S.V[key] : defN(key);
    const pointer = (cx, cy, a, r0, r1, col, th) => G.ln(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, col, th);

    // outline knob of the top section (engine controls)
    function lineKnob(key, cx, cy, r, col, tip) {
      const b = G.drag('t' + key, cx - r - 6, cy - r - 6, (r + 6) * 2, (r + 6) * 2, () => S.top[key], n => { S.top[key] = n; api.check('knob'); });
      const a = A0 + (A1 - A0) * S.top[key];
      G.ring(cx, cy, r, b.h || b.a ? '#fff' : col, 3);
      pointer(cx, cy, a, 0, r, b.h || b.a ? '#fff' : col, 3);
      if (tip && (b.h || b.a)) G.tip(tip);
      return b;
    }
    // filled knob of the FX slots and the output section
    function fillKnob(key, cx, cy, sz, col, get, set, def) {
      const rb = [14, 18, 22][sz], ra = rb + [5, 6, 7][sz], th = [3.5, 4, 5][sz];
      const b = G.drag(key, cx - ra - 4, cy - ra - 4, (ra + 4) * 2, (ra + 4) * 2, get, set, { def });
      const a = A0 + (A1 - A0) * get();
      G.arc(cx, cy, ra, A0, A1, th, 'rgba(0,0,0,.35)');
      G.arc(cx, cy, ra, A0, a, th, col);
      G.circ(cx + 2, cy + 3, rb, 'rgba(0,0,0,.45)');
      G.circ(cx, cy, rb, b.h || b.a ? '#929292' : '#7a7a7a');
      G.ring(cx, cy, rb - 1, 'rgba(0,0,0,.25)', 1.5);
      pointer(cx, cy, a, rb * 0.2, rb - 2, '#1b1b1b', sz ? 4 : 3);
      return b;
    }
    // front side: a picture filled up to a line you can drag
    function picture(fx, x0, key, col, dim) {
      const px = x0 + 47, py = 345, pw = 221, ph = 173, hx = px + 110;
      const ly = S.lines[key] != null ? S.lines[key] : fx.line;
      const b = G.btn('pic' + key, px, py, pw, ph, 'ns-resize');
      if (b.a && G.dy) { S.lines[key] = clamp(G.my, py + 6, py + ph - 6); api.check('pic'); }
      if (b.h && !b.a) G.tip('Drag up or down to move the line');
      G.rect(px, py, pw, ph, '#1c1c1c');
      G.clip(px, ly, pw, py + ph - ly);
      const ty = py + ph;
      const grad = (c0, c1) => G.gradV(px, ly, pw, ty - ly, c32(c0), c32(c1));
      if (fx.front === 'grains') {
        grad(0x8f86c0ff, 0x21202bff);
        seeds.bub.forEach(([u, v, r, al], i) => { const y = py + 10 + ((v * ph - tm * (4 + (i % 5)) + ph * 20) % ph); G.circ(px + 8 + u * (pw - 16), y, r, `rgba(205,200,235,${al * 0.8})`); });
      } else if (fx.front === 'loop') {
        grad(0x5c5098ff, 0x1c182aff);
        for (let j = 0; j < 3; j++) for (let i = 0; i < 6; i++) G.circ(px + 18 + i * 37, py + 100 + j * 29, 6.5, `rgba(205,198,245,${seeds.dots[j * 6 + i]})`);
      } else if (fx.front === 'sat' || fx.front === 'dist') {
        if (fx.front === 'sat') grad(0xc8723aff, 0x2e1b0fff); else grad(0xe25a20ff, 0x2b1207ff);
        const sc_ = fx.front === 'sat' ? 'rgba(150,100,72,.85)' : 'rgba(130,64,40,.85)';
        seeds.str.forEach(([u, hgt, bend], i) => {
          const x = px + 6 + u * (pw - 12), top = ty - hgt * (ty - ly) - 10, sw = Math.sin(tm * 0.8 + i) * 2;
          G.pline([[x, ty], [x + bend * 4 + sw, (ty + top) / 2], [x + bend * 7 + sw * 1.5, top]], sc_, 3.5);
        });
      } else if (fx.front === 'delay') {
        grad(0x13664aff, 0x002016ff);
        for (let k = 0; k < 6; k++) {
          const pts = []; for (let i = 0; i <= 44; i++) { const u = i / 44; pts.push([px + u * pw, ty - Math.abs(Math.sin(u * PI * (1 + k * 0.6) + k + tm * 0.3)) * (ty - ly) * (0.95 - k * 0.1)]); }
          G.pline(pts, 'rgba(40,160,110,.55)', 2);
        }
      } else if (fx.front === 'multi') {
        grad(0x4a6838ff, 0x1c2a18ff);
        for (let r = 14; r < 150; r += 15) G.ring(px + 111, py + 127, r, 'rgba(18,28,14,.7)', 3);
      }
      G.unclip();
      G.ln(px, ly, px + pw, ly, col, 4);
      G.circ(hx, ly, 9, '#2d2d2d'); G.ring(hx, ly, 8, b.h || b.a ? '#fff' : col, 3);
      if (dim) G.rect(px, py, pw, ph, 'rgba(45,45,45,.6)');
    }
    // back side: knobs, boxes, selectors
    function back(fx, x0, key, col) {
      for (const [lab, rx, y, sz, dimL] of fx.knobs || []) {
        const k = key + lab;
        fillKnob('k' + k, x0 + rx, y, sz, col, () => val(k), n => { S.V[k] = n; api.check('knob'); }, defN(k));
        T(x0 + rx, y + (sz ? 40 : 31), lab, sz ? 22 : 19, dimL ? 0x9a9a9aff : col);
      }
      for (const [lab, rx, y, w, hh, sub, grey] of fx.boxes || []) {
        const c = grey ? '#9a9a9a' : col;
        G.rectS(x0 + rx, y, w, hh, grey ? 'rgba(154,154,154,.6)' : A(fx.col, 0.75), 4, 2);
        T(x0 + rx + w / 2, y + hh / 2 + 1, lab, 21, c);
        if (sub) T(x0 + rx + w / 2, y + hh + 15, sub, 19, c);
      }
      if (fx.sel) {
        const [lab, rx, y, n, on] = fx.sel;
        T(x0 + rx, y, lab, 22, col);
        for (let i = 0; i < n; i++) G.circ(x0 + rx + (i - (n - 1) / 2) * 13, y + 16, 2.6, i === on ? col : 'rgba(154,154,154,.7)');
      }
      if (fx.matrix) for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) G.circ(x0 + 51 + i * 16, 355 + j * 15, 3.6, `rgba(150,136,240,${seeds.dots[20 + j * 5 + i] * (((i + j) % 3) ? 0.55 : 1)})`);
      if (fx.j60) {
        [['I', 0xd4ccafff], ['II', 0xd1c162ff], ['I+II', 0xcf7c30ff]].forEach(([lab, c], i) => {
          const y = 348 + i * 43, b = G.btn('j60' + key + i, x0 + 37, y, 90, 33, 'pointer');
          if (b.c) S.j60 = i;
          G.rect(x0 + 37, y, 90, 33, c32(c), 3);
          if (b.h) G.rect(x0 + 37, y, 90, 33, 'rgba(255,255,255,.15)', 3);
          G.circ(x0 + 52, y + 16, 5, S.j60 === i ? '#ff2020' : 'rgba(170,70,60,.7)');
          T(x0 + 89, y + 17, lab, 22, '#2a2a2a', 'c', 600);
        });
      }
    }
    function slot(i, sl) {
      const fx = L2_FX[sl.t], x0 = 28 + i * 326, col = c32(fx.col), key = S.pre + ':' + i + ':';
      const canFlip = !!(fx.front && fx.knobs), back_ = fx.front ? (fx.knobs ? sl.back : false) : true;
      burger(x0 + 9, 318, '#c8c8c8');
      const lb = G.btn('led' + i, x0 + 38, 302, 26, 32, 'pointer');
      if (lb.c) { sl.on = !sl.on; api.check('slot'); }
      if (lb.h) G.tip(sl.on ? 'Switch ' + fx.title + ' off' : 'Switch ' + fx.title + ' on');
      if (sl.on) radio(x0 + 50, 317, col); else G.ring(x0 + 50, 317, 8.5, col, 2.5);
      T(x0 + 68, 320, fx.hd, 24, sl.on ? col : A(fx.col, 0.5), 'l');
      const rb = G.btn('flip' + i, x0 + 284, 302, 30, 32, canFlip ? 'pointer' : 'default');
      if (rb.c && canFlip) { sl.back = !sl.back; api.check('flip'); }
      if (rb.h) G.tip(canFlip ? (back_ ? 'Show the picture' : 'Show the knobs') : 'Only this side is drawn in this demo');
      radio(x0 + 298, 317, back_ ? col : (rb.h ? '#bbb' : '#8a8a8a'));
      G.rect(x0, 335, 316, 223, '#2d2d2d');
      if (back_) back(fx, x0, key, sl.on ? col : A(fx.col, 0.45)); else picture(fx, x0, key, col, !sl.on);
      T(x0 + 158, 544, fx.title, 31, sl.on ? col : A(fx.col, 0.45), 'c', 700);
    }
    function setPreset(p) {
      p = (p + L2_PRE.length) % L2_PRE.length;
      if (p === S.pre) return;
      S.pre = p; S.eng = L2_PRE[p].eng; api.check('preset');
    }
    function enginePicture(E) {
      const px = 349, py = 70, pw = 228, ph = 162, hx = 462;
      const ly = S.lines.eng != null ? S.lines.eng : 93;
      const b = G.btn('engpic', px, py, pw, ph, 'ns-resize');
      if (b.a && G.dy) { S.lines.eng = clamp(G.my, py + 6, py + ph - 6); api.check('pic'); }
      G.rect(px, py, pw, ph, '#111');
      G.clip(px, ly, pw, py + ph - ly);
      G.gradV(px, ly, pw, py + ph - ly, c32(E.g0), c32(E.g1));
      if (E.name === 'CHOP') for (let x = px - 160; x < px + pw; x += 24) G.ln(x, py + ph, x + 110, py, 'rgba(200,180,250,.42)', 3);
      else if (E.name === 'ROBOT') for (let j = 0; j < 7; j++) for (let i = 0; i < 8; i++) G.circ(px + 14 + i * 28.6, py + 31 + j * 19.8, 3.6, `rgba(232,226,252,${seeds.dots[j * 8 + i]})`);
      else seeds.bub.forEach(([u, v, r, al], i) => { const y = py + 10 + ((v * ph - tm * (5 + (i % 4)) + ph * 20) % ph); G.circ(px + 6 + u * (pw - 12), y, r + 1, `rgba(245,160,245,${al * 0.75})`); });
      G.unclip();
      G.ln(px, ly, px + pw, ly, c32(E.line), 4);
      G.circ(hx, ly, 9, '#2d2d2d'); G.ring(hx, ly, 8, b.h || b.a ? '#fff' : c32(E.line), 3);
    }

    TG[ID] = { preset: G.anchor(590, 24, 822, 32), engine: G.anchor(350, 240, 220, 54), slots: G.anchor(26, 300, 1950, 260), wave: G.anchor(640, 66, 750, 230) };
    G.frame((G, dt, clock) => {
      if (!F.reducedMotion) tm += dt;
      const E = L2_ENG[S.eng], acc = c32(E.acc), P = L2_PRE[S.pre];
      // panel
      G.rect(20, 20, 1960, 540, '#191919', 12);
      G.rect(20, 20, 1960, 40, '#232323', 12); G.rect(20, 48, 1960, 12, '#232323');
      const halo = ctx.createLinearGradient(500, 0, 1460, 0);
      halo.addColorStop(0, 'rgba(37,37,37,0)'); halo.addColorStop(0.4, 'rgba(37,37,37,1)'); halo.addColorStop(0.6, 'rgba(37,37,37,1)'); halo.addColorStop(1, 'rgba(37,37,37,0)');
      G.rect(500, 60, 960, 235, halo);
      G.rect(20, 296, 1960, 39, '#101010');
      // header
      burger(36, 38, '#d3d3d3');
      T(70, 42, 'LOVE 2', 34, '#e3e3e3', 'l', 600); T(198, 45, '.02', 20, '#8f8f8f', 'l', 500);
      radio(412, 39, '#d3d3d3'); T(430, 42, 'FX', 22, '#959595', 'l');
      G.rectS(590, 24, 822, 32, '#d3d3d3', 16, 2.5);
      const pl = G.btn('prev', 596, 24, 50, 32, 'pointer'), pr = G.btn('next', 1356, 24, 50, 32, 'pointer');
      if (pl.c) setPreset(S.pre - 1); if (pr.c) setPreset(S.pre + 1);
      T(616, 43, '<', 26, pl.h ? '#fff' : '#d3d3d3'); T(1384, 43, '>', 26, pr.h ? '#fff' : '#d3d3d3');
      const pn = G.btn('pname', 700, 24, 600, 32, 'pointer');
      if (pn.c && !G.menuOpen) G.menu(700, 24, 600, 32, L2_PRE.map((q, i) => ({ label: q.name, on: i === S.pre, pick: () => setPreset(i) })));
      T(1000, 42, P.name, 26, pn.h ? '#fff' : '#dcdcdc');
      ctx.save(); ctx.letterSpacing = '7px'; T(1797, 42, 'DAWESOME', 22, '#cfcfcf'); ctx.restore();
      // input
      radio(88, 84, '#e3e3e3'); T(108, 87, 'ON', 24, '#e3e3e3', 'l');
      lineKnob('in', 139, 146, 30, '#e3e3e3', 'Input level');
      T(139, 196, 'IN', 22, '#e3e3e3');
      const lv = (o) => clock.playing ? clamp(0.62 + 0.18 * Math.abs(Math.sin(S.beats * PI + o)) + 0.05 * Math.sin(S.beats * 7.3 + o)) : 0.77;
      for (let k = 0; k < 2; k++) { G.rect(88, 222 + k * 14, 134, 7, '#535353'); G.rect(88, 222 + k * 14, 134 * lv(k) * (0.4 + S.top.in * 1.2) / 1.0, 7, '#d3d3d3'); G.rect(195, 222 + k * 14, 2, 7, '#191919'); }
      // engine picture and switch
      enginePicture(E);
      radio(369, 259, acc);
      const en = G.btn('engname', 400, 240, 160, 40, 'pointer');
      if (en.c) { S.eng = (S.eng + 1) % 3; api.check('engine'); }
      if (en.h) G.tip('Click to switch the engine');
      T(412, 262, E.name, 34, en.h ? '#fff' : acc, 'l', 700);
      for (let i = 0; i < 3; i++) {
        const dx = 441 + i * 18, b = G.btn('eng' + i, dx - 9, 276, 18, 18, 'pointer');
        if (b.c && S.eng !== i) { S.eng = i; api.check('engine'); }
        if (b.h) G.tip(L2_ENG[i].name);
        G.circ(dx, 284, 4.5, S.eng === i ? (S.eng === 0 ? acc : '#d3d3d3') : (b.h ? '#bbb' : '#6a6a6a'));
      }
      // sample view with grains (the circles are spawned on the FXD clock)
      G.rect(645, 70, 645, 116, c32(E.wave));
      seeds.wave.forEach((a, i) => { const x = 650 + i * 4.25, hh = a * 52; G.ln(x, 128 - hh, x, 128 + hh, 'rgba(140,130,160,.55)', 2); });
      G.rect(800, 70, 6, 116, acc);
      if (clock.playing) {
        const db = clock.dt * clock.bpm / 60; S.beats += db;
        const every = S.eng === 0 ? 1 / (2 + S.top.r0 * 10) : S.eng === 2 ? 0.25 : 0.5;
        S.spawn += db;
        while (S.spawn >= every) {
          S.spawn -= every;
          const jit = S.eng === 2 ? 0.25 : S.top.r2;
          S.grains.push({ x: 808 + rnd() * (40 + jit * 300), y: 92 + rnd() * 72, r: 10 + (S.eng === 2 ? 0.5 : S.top.r1) * 16, age: 0, life: S.eng === 0 ? 0.5 + S.top.r1 * 1.8 : 1.4 });
        }
        for (const g of S.grains) g.age += db;
        S.grains = S.grains.filter(g => g.age < g.life);
      }
      G.clip(645, 70, 645, 116);
      for (const g of S.grains) G.ring(g.x, g.y, g.r * (1 + g.age / g.life * 0.15), A(E.acc, 0.9 * (1 - g.age / g.life) + 0.1), 3);
      G.unclip();
      const wv = G.btn('wave', 645, 70, 645, 116, null);
      if (wv.h) G.tip('Each circle is a grain played from the sample. Space starts and stops the clock.');
      // engine knobs
      const ofs = lineKnob('offset', 693, 216, 20, acc); T(693, 255, 'OFFSET ' + S.top.offset.toFixed(2), 21, ofs.h || ofs.a ? '#fff' : acc);
      const tr = lineKnob('trans', 826, 216, 20, acc), st = Math.round((S.top.trans - 0.5) * 48);
      T(826, 255, 'TRANS ' + (st > 0 ? '+' : '') + st, 21, tr.h || tr.a ? '#fff' : acc);
      G.rectS(782, 271, 86, 24, A(E.acc, 0.8), 4, 2); T(825, 284, 'QUANT', 21, acc);
      [['oct', 921, 'OCT'], ['tune', 1018, 'TUNE'], ['tunej', 1111, 'TUNE-JIT'], ['rev', 1246, 'REVERSE'], ['panj', 1342, 'PAN-JIT']].forEach(([k, x, lab]) => { lineKnob(k, x, 216, 20, acc); T(x, 255, lab, 21, acc); });
      E.knobs.forEach((lab, i) => { lineKnob('r' + i, 1496, 91 + i * 68, 20, acc); T(1496, 129 + i * 68, lab, 21, acc); });
      T(1600, 96, 'SYNC', 23, acc);
      // output
      T(1781, 85, 'OUT', 24, '#e3e3e3');
      lineKnob('out', 1825, 126, 32, '#e3e3e3', 'Output level');
      for (let k = 0; k < 2; k++) { G.rect(1753, 172 + k * 14, 153, 7, '#535353'); G.rect(1753, 172 + k * 14, Math.min(153, 153 * lv(k + 2) * (0.5 + S.top.out)), 7, '#d3d3d3'); G.rect(1870, 172 + k * 14, 2, 7, '#191919'); }
      G.circ(1760, 207, 8, '#8a8a8a'); G.rect(1755, 212, 10, 6, '#8a8a8a', 1); G.circ(1757, 207, 2, '#191919'); G.circ(1763, 207, 2, '#191919');
      T(1819, 212, '-6dB', 22, '#e3e3e3'); T(1889, 212, 'LIM', 22, '#e3e3e3');
      fillKnob('wetg', 1773, 250, 2, '#e3e3e3', () => S.top.wetg, n => { S.top.wetg = n; api.check('knob'); }, 0.5);
      fillKnob('mix', 1877, 250, 2, '#e3e3e3', () => S.top.mix, n => { S.top.mix = n; api.check('knob'); }, 0.64);
      T(1774, 288, 'WET GAIN', 20, '#e3e3e3'); T(1877, 288, 'MIX', 20, '#e3e3e3');
      // FX slots
      S.slots[S.pre].forEach((sl, i) => slot(i, sl));
    });
    return () => G.cleanup();
  }
  reg({
    id: 'love2', name: 'Love 2', vendor: 'Dawesome', group: 'Third-party',
    width: frameW(2000, L2_S), height: frameH(583, L2_S),
    blurb: 'A granular engine with three modes and six effect slots. FX Devices draws it in the plugin\'s own colours, with each slot showing either a picture or its knobs.',
    steps: [
      { id: 'preset', text: 'Step to another preset with <b>&lt;</b> or <b>&gt;</b>', why: 'Click the preset name for the full list. Each preset loads its own six effects.', target: tg('love2', 'preset') },
      { id: 'engine', text: 'Switch the engine with the three dots under <b>CHOP</b>', why: 'SWARM, CHOP and ROBOT each draw their own picture and change the three knobs at the right of the sample.', target: tg('love2', 'engine') },
      { id: 'flip', text: 'Click the ring at the right of a slot header', why: 'It flips the slot between its picture and its knobs. The dot at the left switches the slot on or off.', target: tg('love2', 'slots') },
      { id: 'pic', text: 'Drag the line in a picture up or down', why: 'The picture fills up to the line.', target: tg('love2', 'slots') },
    ],
    notes: [
      { title: 'About this demo', text: 'Love 2 has no layout script in the FX Devices source yet, so this one is drawn from the approved design renders. The four presets and their labels come from those renders. Only the sides of each slot shown there are drawn. Nothing here makes sound.' },
      { title: 'The grains', text: 'With the clock running, circles appear in the sample view. GRAIN SIZE and DURATION set their size, POS-JIT how far they spread, and COUNT how many SWARM makes.' },
    ],
    build(body, api) { return buildLove2(body, api); },
  });
  // (more devices below)
  F._fd = { IM, reg, c32, hexA, A, HSV, sliders, Store, frameW, frameH, padFor, SC_S };
})();
