/* FX Devices tour: shared runtime + UI kit. Every chapter file uses window.FXD.
   Colours and geometry follow the real script (src/Constants.lua THEME, GUI.lua Draw_Device_Frame,
   Layout Editor functions.lua AddKnob default style). */
(function () {
  'use strict';
  const FXD = window.FXD = window.FXD || {};
  FXD.chapters = [];
  FXD.devices = FXD.devices || {};

  /* ------------------------------------------------------------ helpers */
  const SVGNS = 'http://www.w3.org/2000/svg';
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  }
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) { const v = attrs[k]; if (v != null && v !== false) el.setAttribute(k, v); }
    for (const c of kids.flat(Infinity)) if (c) el.append(c);
    return el;
  }
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  FXD.h = h; FXD.s = s; FXD.clamp = clamp; FXD.lerp = lerp;
  /** add a chapter's own stylesheet once (prefix your classes with your chapter's prefix) */
  FXD.css = function (text) { const st = document.createElement('style'); st.textContent = text; document.head.append(st); return st; };

  /* ------------------------------------------------------------ colours */
  FXD.C = {
    canvas: '#0e0f12', body: '#1a1c20', title: '#25282e', accent: '#49cc85', accentDark: '#2b794f',
    text: '#e6e8eb', dim: '#9ba1ab', muted: '#6a707a', border: 'rgba(255,255,255,.071)', borderHi: 'rgba(255,255,255,.18)',
    knob: '#2c2f36', knobHi: '#3a3e47', track: '#0c0d10', pointer: '#f2f4f7', ledOff: '#4c515b',
    popup: 'rgba(23,24,27,.965)', menubar: '#141519', container: '#7d838d', containerOff: '#4a4d54',
    morphA: '#18464e', morphB: '#184e37',
  };
  /** HSV (0..1 each) to css rgba, same maths as ImGui ColorConvertHSVtoRGB */
  FXD.hsv = function (hh, ss, vv, a = 1) {
    hh = ((hh % 1) + 1) % 1;
    const i = Math.floor(hh * 6), f = hh * 6 - i, p = vv * (1 - ss), q = vv * (1 - f * ss), t = vv * (1 - (1 - f) * ss);
    const [r, g, b] = [[vv, t, p], [q, vv, p], [p, vv, t], [p, q, vv], [t, p, vv], [vv, p, q]][i % 6];
    return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
  };
  /** colour of track modulator i (1-based), EightColors.LFO in Execute Before Loop.lua */
  FXD.modColor = (i, v = 0.5, sat = 0.7, a = 1) => FXD.hsv(0.08 * (i - 1), sat, v, a);
  /** a brighter cut of the same hue, for lines, beads and playheads */
  FXD.modBright = (i, a = 1) => FXD.hsv(0.08 * (i - 1), 0.75, 0.95, a);
  FXD.MIDI_CLR = { Velocity: '#d9823b', Random: '#9a6ad6', KeyTrack: '#35b3a5', CC: '#4b8fdc' };
  /** css colour with a new alpha (accepts #rrggbb or rgb/rgba) */
  FXD.alpha = function (c, a) {
    if (c[0] === '#') {
      const n = parseInt(c.slice(1, 7), 16);
      return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
    }
    const m = c.match(/[\d.]+/g);
    return `rgba(${m[0]},${m[1]},${m[2]},${a})`;
  };

  /* ------------------------------------------------------------ clock + frame loop */
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  FXD.reducedMotion = reduced;
  FXD.clock = { playing: !reduced, bpm: 120, beat: 0, time: 0, dt: 0 };
  let scope = { frames: new Set(), offs: [] };
  FXD.onFrame = fn => { scope.frames.add(fn); const sc = scope; return () => sc.frames.delete(fn); };
  /** addEventListener that is removed when the chapter unmounts */
  FXD.listen = (target, type, fn, opt) => { target.addEventListener(type, fn, opt); scope.offs.push(() => target.removeEventListener(type, fn, opt)); };
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const c = FXD.clock; c.dt = dt; c.time += dt;
    if (c.playing) c.beat += dt * c.bpm / 60;
    for (const fn of [...scope.frames]) { try { fn(dt, c); } catch (e) { console.error(e); scope.frames.delete(fn); } }
    if (FXD._afterFrame) FXD._afterFrame();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  const transportListeners = new Set();
  FXD.onTransport = fn => { transportListeners.add(fn); return () => transportListeners.delete(fn); };
  FXD.setPlaying = function (p) {
    FXD.clock.playing = p;
    transportListeners.forEach(f => f(p));
  };

  /* ------------------------------------------------------------ icons (line icons in the power glyph's weight) */
  const I = FXD.icons = {};
  function icon(paths, vb = 16) { return () => { const e = s('svg', { viewBox: `0 0 ${vb} ${vb}`, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); e.innerHTML = paths; return e; }; }
  I.mod = icon('<path d="M1 7 C3 0.5 5 0.5 7 7 S11 13.5 13 7"/>');
  I.learn = icon('<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none"/>');
  I.pin = icon('<path d="M5 2h6M6 2v5l-2 2h8l-2-2V2M8 9v5"/>');
  I.left = icon('<path d="M10 3 5 8l5 5"/>');
  I.right = icon('<path d="M6 3l5 5-5 5"/>');
  I.search = icon('<circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4 14 14"/>');
  I.gear = icon('<circle cx="8" cy="8" r="2.3"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>');
  I.container = icon('<path d="M2 12.4V3.2h4.2L7.8 5H14v8.4H2z"/>');
  I.containerAdd = icon('<path d="M2 12.4V3.2h4.2L7.8 5H14v8.4H2z"/><path d="M5.6 9.4h4.8M8 7v4.8"/>');
  I.list = icon('<circle cx="3" cy="4" r="1" fill="currentColor"/><circle cx="3" cy="8" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><path d="M6 4h8M6 8h8M6 12h8"/>');
  I.parallel = icon('<path d="M2 4h12M2 8h12M2 12h12"/>');
  I.bypass = icon('<path d="M5.2 3.6A5.4 5.4 0 1 0 10.8 3.6M8 1.6v5.2"/>');
  I.close = icon('<path d="M4 4l8 8M12 4l-8 8"/>');
  I.plus = icon('<path d="M8 3v10M3 8h10"/>');
  I.star = icon('<path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/>');
  I.play = () => { const e = s('svg', { viewBox: '0 0 16 16' }); e.innerHTML = '<path d="M5 3.2v9.6L12.6 8z" fill="currentColor"/>'; return e; };
  I.pause = () => { const e = s('svg', { viewBox: '0 0 16 16' }); e.innerHTML = '<rect x="4" y="3" width="2.8" height="10" rx=".8" fill="currentColor"/><rect x="9.2" y="3" width="2.8" height="10" rx=".8" fill="currentColor"/>'; return e; };
  I.menu = icon('<path d="M3 4.5h10M3 8h10M3 11.5h10"/>');
  I.chev = icon('<path d="M4 6l4 4 4-4"/>');

  /** power glyph (Draw_FX_Power_Icon) */
  FXD.powerIcon = function (on) {
    const e = s('svg', { viewBox: '-11 -11 22 22' });
    const accent = FXD.C.accent;
    const clr = on ? accent : FXD.C.ledOff;
    const r = 4.5, a0 = -Math.PI / 2 + 0.8, a1 = Math.PI * 1.5 - 0.8;
    const p = (a) => `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
    e.innerHTML = (on ? `<circle r="8" fill="${FXD.alpha(accent, 0.11)}"/>` : '') +
      `<path d="M${p(a0)} A${r} ${r} 0 1 1 ${p(a1)}" fill="none" stroke="${clr}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<line x1="0" y1="${-r - 1.2}" x2="0" y2="-0.6" stroke="${clr}" stroke-width="1.6" stroke-linecap="round"/>`;
    return e;
  };

  /* ------------------------------------------------------------ arc maths */
  const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;
  FXD.angle = t => A0 + (A1 - A0) * t;
  /** svg path of an arc on a circle centred at 0,0 from angle a to b (radians, screen coords) */
  FXD.arcPath = function (r, a, b, cx = 0, cy = 0) {
    if (Math.abs(b - a) < 1e-4) return '';
    if (b < a) [a, b] = [b, a];
    const x0 = cx + Math.cos(a) * r, y0 = cy + Math.sin(a) * r, x1 = cx + Math.cos(b) * r, y1 = cy + Math.sin(b) * r;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${b - a > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };

  /* ------------------------------------------------------------ pointer drag helper */
  /** vertical/horizontal value drag with Shift = fine. cb(dx, dy, e) gets deltas in px. */
  FXD.dragger = function (el, { onStart, onMove, onEnd, cursor } = {}) {
    let id = null, lx = 0, ly = 0, moved = 0;
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      id = e.pointerId; lx = e.clientX; ly = e.clientY; moved = 0;
      el.setPointerCapture(id);
      onStart && onStart(e);
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      onMove && onMove(dx, dy, e);
    });
    const end = e => { if (e.pointerId !== id) return; id = null; onEnd && onEnd(e, moved); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };

  /* ------------------------------------------------------------ knob */
  /**
   * FXD.knob({ label, value, def, r, color, cap, fmt, lblPos:'bottom'|'top'|'none', showVal, onChange, onDrag, mods, live })
   * - value/base 0..1; base never moves with modulation (look A "On the track").
   * - mods: [{ color, amt (-1..1), bipolar, out: () => 0..1, muted }]: drawn as range bands outside the arc,
   *   live value = white bead on the track.
   * - live(base, mods): optional override of how the live value is computed.
   * - onDrag(dv, knob, e): return true to take over the drag (e.g. setting a modulation amount).
   */
  FXD.knob = function (o = {}) {
    const r = o.r || 18;
    const pad = 8 + (o.modRings || 2) * 3;
    const size = (r + pad) * 2;
    const K = {
      value: o.value != null ? o.value : 0.5, def: o.def != null ? o.def : (o.value != null ? o.value : 0.5),
      mods: o.mods || [], liveV: null, label: o.label || '', color: o.color || FXD.C.accent, cap: o.cap || FXD.C.knob,
      fmt: o.fmt || (v => Math.round(v * 100) + '%'), hover: false, active: false,
    };
    const svg = s('svg', { width: size, height: size, viewBox: `${-size / 2} ${-size / 2} ${size} ${size}`, role: 'slider', tabindex: 0, 'aria-label': K.label || 'knob', 'aria-valuemin': 0, 'aria-valuemax': 100 });
    const arcW = Math.max(2, r * 0.13), arcR = r - arcW / 2 - 0.5, capR = Math.max(2, r - arcW - Math.max(1.5, r * 0.08));
    const track = s('path', { d: FXD.arcPath(arcR, A0, A1), stroke: FXD.C.track, 'stroke-width': arcW, fill: 'none', 'stroke-linecap': 'butt' });
    const val = s('path', { stroke: K.color, 'stroke-width': arcW, fill: 'none' });
    const bands = s('g');
    const shadow = s('circle', { cy: 1, r: capR, fill: 'rgba(0,0,0,.35)' });
    const cap = s('circle', { r: capR, fill: K.cap });
    const sheen = s('path', { d: FXD.arcPath(capR - 0.6, Math.PI * 1.15, Math.PI * 1.85), stroke: 'rgba(255,255,255,.12)', 'stroke-width': 1, fill: 'none' });
    const ptr = s('line', { stroke: o.pointer || FXD.C.pointer, 'stroke-width': o.pointerW || 2, 'stroke-linecap': 'round' });
    const bead = s('circle', { r: Math.max(2.4, arcW * 0.95), fill: '#fff', stroke: '#0b0c0f', 'stroke-width': 1.2, visibility: 'hidden' });
    const hit = s('circle', { r: r + 4, fill: 'transparent' });
    svg.append(track, val, bands, shadow, cap, sheen, ptr, bead, hit);
    const lbl = h('div', { class: 'k-lbl' }, K.label);
    const vtxt = h('div', { class: 'k-val' });
    const el = h('div', { class: 'fx-knob' + (o.cls ? ' ' + o.cls : '') });
    const pos = o.lblPos || 'bottom';
    if (pos === 'top') el.append(lbl, svg, vtxt); else if (pos === 'none') el.append(svg); else el.append(svg, lbl, vtxt);
    if (o.showVal === false) vtxt.remove();
    el.style.margin = `${-pad + 4}px ${-pad + 6}px`;
    if (pos !== 'none') { lbl.style.marginTop = pos === 'bottom' ? `${-pad + 3}px` : ''; }
    if (pos === 'top') { lbl.style.marginBottom = `${-pad + 3}px`; vtxt.style.marginTop = `${-pad + 3}px`; }

    function liveValue() {
      if (o.live) return o.live(K.value, K.mods);
      let v = K.value;
      for (const m of K.mods) {
        if (m.muted) continue;
        const out = m.out ? m.out() : 0;
        v += m.amt * (m.bipolar ? out * 2 - 1 : out);
      }
      return clamp(v);
    }
    K.liveValue = liveValue;
    function draw() {
      const t = clamp(K.value), a = FXD.angle(t);
      val.setAttribute('d', t > 0.003 ? FXD.arcPath(arcR, A0, a) : '');
      val.setAttribute('stroke', K.hover ? (o.colorHi || K.color) : K.color);
      cap.setAttribute('fill', K.active ? (o.capActive || FXD.C.knobHi) : K.hover ? (o.capHover || '#33363e') : K.cap);
      const pIn = capR * 0.35, pOut = capR - Math.max(1.5, capR * 0.12);
      ptr.setAttribute('x1', (Math.cos(a) * pIn).toFixed(2)); ptr.setAttribute('y1', (Math.sin(a) * pIn).toFixed(2));
      ptr.setAttribute('x2', (Math.cos(a) * pOut).toFixed(2)); ptr.setAttribute('y2', (Math.sin(a) * pOut).toFixed(2));
      // modulation bands: one ring per modulator, from base to base + amount (both ways if bipolar)
      bands.textContent = '';
      let k = 0;
      for (const m of K.mods) {
        const rr = r + 2.5 + k * 3; k++;
        const lo = clamp(m.bipolar ? t - Math.abs(m.amt) : Math.min(t, t + m.amt));
        const hi = clamp(m.bipolar ? t + Math.abs(m.amt) : Math.max(t, t + m.amt));
        if (hi - lo > 0.002) bands.append(s('path', { d: FXD.arcPath(rr, FXD.angle(lo), FXD.angle(hi)), stroke: m.muted ? 'rgba(255,255,255,.18)' : m.color, 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round', opacity: m.muted ? 0.6 : 1 }));
      }
      if (K.mods.length) {
        const lv = liveValue(); K.liveV = lv;
        const la = FXD.angle(lv);
        bead.setAttribute('cx', (Math.cos(la) * arcR).toFixed(2)); bead.setAttribute('cy', (Math.sin(la) * arcR).toFixed(2));
        bead.setAttribute('visibility', 'visible');
      } else { bead.setAttribute('visibility', 'hidden'); K.liveV = null; }
      vtxt.textContent = K.fmt(K.value, K);
      svg.setAttribute('aria-valuenow', Math.round(t * 100));
      svg.setAttribute('aria-valuetext', vtxt.textContent);
    }
    K.el = el; K.svg = svg; K.r = r; K.draw = draw; K.labelEl = lbl; K.valEl = vtxt;
    K.set = function (v, silent) { K.value = clamp(v); draw(); if (!silent && o.onChange) o.onChange(K.value, K); };
    K.setMods = function (m) { K.mods = m || []; draw(); };
    K.setColor = function (c) { K.color = c; draw(); };
    K.setLabel = function (t) { K.label = t; lbl.textContent = t; };
    /** where the knob's centre is on screen */
    K.center = () => { const b = svg.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
    svg.addEventListener('pointerenter', () => { K.hover = true; draw(); o.onHover && o.onHover(true, K); });
    svg.addEventListener('pointerleave', () => { K.hover = false; draw(); o.onHover && o.onHover(false, K); });
    FXD.dragger(svg, {
      onStart: e => { K.active = true; el.classList.add('active'); draw(); o.onStart && o.onStart(K, e); },
      onMove: (dx, dy, e) => {
        const dv = -dy / (e.shiftKey ? 900 : 180);
        if (o.onDrag && o.onDrag(dv, K, e)) { draw(); return; }
        if (FXD.dragHook && FXD.dragHook(dv, K, e)) { draw(); return; }
        K.set(K.value + dv);
      },
      onEnd: (e, moved) => { K.active = false; el.classList.remove('active'); draw(); o.onEnd && o.onEnd(K, e, moved); },
    });
    svg.addEventListener('dblclick', () => { K.set(K.def); o.onReset && o.onReset(K); });
    svg.addEventListener('keydown', e => {
      const st = e.shiftKey ? 0.01 : 0.05;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { K.set(K.value + st); e.preventDefault(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { K.set(K.value - st); e.preventDefault(); }
    });
    if (o.onContext) svg.addEventListener('contextmenu', e => { e.preventDefault(); o.onContext(K, e); });
    // knobs with modulation redraw every frame (live bead moves)
    FXD.onFrame(() => { if (K.mods.length && el.isConnected) draw(); });
    draw();
    return K;
  };

  /* ------------------------------------------------------------ drag bar (FXD "Drag" style) */
  FXD.dragBar = function (o = {}) {
    const D = { value: o.value != null ? o.value : 0.5, def: o.def != null ? o.def : (o.value != null ? o.value : 0.5), fmt: o.fmt || (v => Math.round(v * 100) + '%') };
    const fill = h('div', { class: 'fill' });
    const lbl = h('span', null, o.label || '');
    const v = h('span', { class: 'v' });
    const el = h('div', { class: 'fx-drag', style: { width: (o.w || 140) + 'px' }, role: 'slider', tabindex: 0, 'aria-label': o.label || 'value' }, fill, lbl, v);
    if (o.color) fill.style.background = o.color;
    if (o.center) { el.style.justifyContent = 'center'; lbl.remove(); }
    D.el = el;
    D.draw = () => { fill.style.width = (D.value * 100) + '%'; v.textContent = D.fmt(D.value); };
    D.set = (x, silent) => { D.value = clamp(x); D.draw(); if (!silent && o.onChange) o.onChange(D.value, D); };
    FXD.dragger(el, { onMove: (dx, dy, e) => D.set(D.value + (dx - dy) / (e.shiftKey ? 1200 : (o.w || 140) * 1.4)) });
    el.addEventListener('dblclick', () => D.set(D.def));
    el.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') D.set(D.value + 0.05); if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') D.set(D.value - 0.05); });
    D.draw();
    return D;
  };

  /* ------------------------------------------------------------ vertical slider */
  FXD.vslider = function (o = {}) {
    const V = { value: o.value != null ? o.value : 0.5, def: o.value != null ? o.value : 0.5 };
    const hgt = o.h || 120;
    const fill = h('div', { class: 'fill' });
    const grab = h('div', { class: 'grab' });
    const el = h('div', { class: 'fx-vslider', style: { height: hgt + 'px', width: (o.w || 12) + 'px' }, role: 'slider', tabindex: 0, 'aria-label': o.label || 'slider' }, fill, grab);
    if (o.color) fill.style.background = o.color;
    V.el = el;
    V.draw = () => { fill.style.height = (V.value * 100) + '%'; grab.style.bottom = `calc(${V.value * 100}% - 4px)`; };
    V.set = (x, silent) => { V.value = clamp(x); V.draw(); if (!silent && o.onChange) o.onChange(V.value, V); };
    FXD.dragger(el, { onMove: (dx, dy, e) => V.set(V.value - dy / (e.shiftKey ? 900 : hgt)) });
    el.addEventListener('dblclick', () => V.set(V.def));
    V.draw();
    return V;
  };

  /* ------------------------------------------------------------ device frame */
  /**
   * FXD.device({ name, vendor, width, height, body, bodyColor, titleColor, enabled, onBypass, onCollapse,
   *              collapsible, wet, menu, onTitleDown, onTitleContext })
   * returns { el, body, title, setEnabled, setCollapsed, enabled, collapsed }
   */
  FXD.device = function (o = {}) {
    const D = { enabled: o.enabled !== false, collapsed: !!o.collapsed, width: o.width || 260 };
    const power = h('button', { class: 'fx-power', 'aria-label': 'Bypass ' + (o.name || 'FX'), title: '' });
    const vt = h('div', { class: 'fx-vtitle' }, o.name || 'FX', o.vendor ? h('span', { class: 'vend' }, o.vendor) : null);
    const title = h('div', { class: 'fx-dev-title' }, power, vt);
    if (o.menu) { const m = I.menu(); m.setAttribute('class', 'fx-dev-menu'); m.style.color = FXD.C.dim; title.append(m); }
    if (o.wet !== false) {
      const w = s('svg', { class: 'fx-dev-wet', viewBox: '-10 -10 20 20' });
      w.innerHTML = `<path d="${FXD.arcPath(7, A0, A1)}" stroke="${FXD.C.dim}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
      title.append(w);
    } else vt.style.marginBottom = '10px';
    const body = h('div', { class: 'fx-dev-body' });
    if (o.bodyColor) body.style.background = o.bodyColor;
    if (o.titleColor) title.style.background = o.titleColor;
    const el = h('div', { class: 'fx-dev fx' }, title, body);
    if (o.height) el.style.height = o.height + 'px';
    if (o.body) body.append(o.body);
    D.el = el; D.body = body; D.title = title; D.power = power; D.titleText = vt;
    function paint() {
      el.classList.toggle('off', !D.enabled);
      power.replaceChildren(FXD.powerIcon(D.enabled));
      el.style.width = (D.collapsed ? 30 : D.width) + 'px';
      el.classList.toggle('collapsed', D.collapsed);
    }
    D.setEnabled = (on, silent) => { D.enabled = on; paint(); if (!silent && o.onBypass) o.onBypass(on, D); };
    D.setCollapsed = (c, silent) => { D.collapsed = c; paint(); if (!silent && o.onCollapse) o.onCollapse(c, D); };
    D.setWidth = w => { D.width = w; paint(); };
    power.addEventListener('click', e => { e.stopPropagation(); D.setEnabled(!D.enabled); });
    power.addEventListener('pointerdown', e => e.stopPropagation());
    title.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (o.onTitleContext && o.onTitleContext(D, e)) return;
      if (o.collapsible !== false) D.setCollapsed(!D.collapsed);
    });
    if (o.onTitleDown) title.addEventListener('pointerdown', e => o.onTitleDown(D, e));
    paint();
    return D;
  };

  /** the dashed ADD FX card at the end of a chain */
  FXD.addCard = function (o = {}) {
    const el = h('button', { class: 'fx-addcard', type: 'button', 'aria-label': 'Add FX' }, h('span', { class: 'plus' }, '+'), 'ADD FX');
    if (o.height) el.style.height = o.height + 'px';
    if (o.width) el.style.width = o.width + 'px';
    if (o.onClick) el.addEventListener('click', o.onClick);
    return el;
  };

  /* ------------------------------------------------------------ top bar */
  /** FXD.topBar({ num, track, trackColor, mods, modOn, onMod, learnOn, onLearn, auto, fx, pdc, right, middle }) */
  FXD.topBar = function (o = {}) {
    const learn = h('button', { class: 'fx-tb-btn' + (o.learnOn ? ' on' : ''), type: 'button' }, I.learn(), o.learnOn ? 'Learning' : 'Learn');
    const modBtn = h('button', { class: 'fx-tb-btn' + (o.modOn ? ' on' : ''), type: 'button' }, I.mod(), 'Mod');
    if (o.mods) modBtn.append(h('span', { class: 'fx-badge' }, String(o.mods)));
    learn.addEventListener('click', () => { o.learnOn = !o.learnOn; learn.classList.toggle('on', o.learnOn); learn.lastChild.textContent = o.learnOn ? 'Learning' : 'Learn'; o.onLearn && o.onLearn(o.learnOn); });
    modBtn.addEventListener('click', () => { o.modOn = !o.modOn; modBtn.classList.toggle('on', o.modOn); o.onMod && o.onMod(o.modOn); });
    const mid = h('div', { style: { display: 'contents' } });
    if (o.middle) mid.append(o.middle);
    const el = h('div', { class: 'fx-topbar fx' },
      h('div', { class: 'tb-trk' }, h('i', { style: { background: o.trackColor || '#e8963a' } }), h('span', { class: 'tb-num' }, o.num || '04'), h('span', { class: 'tb-name' }, o.track || 'Lead Vocal'), (() => { const c = I.chev(); c.style.cssText = 'width:12px;height:12px;color:#9ba1ab'; return c; })()),
      h('button', { class: 'fx-tb-btn', type: 'button', 'aria-label': 'Pin track' }, I.pin()),
      h('button', { class: 'fx-tb-btn', type: 'button', 'aria-label': 'Previous track', style: { padding: '0 3px' } }, I.left()),
      h('button', { class: 'fx-tb-btn', type: 'button', 'aria-label': 'Next track', style: { padding: '0 3px' } }, I.right()),
      h('span', { class: 'tb-sep' }),
      h('div', { class: 'tb-group' }, learn, modBtn),
      h('span', { class: 'fx-tb-pill' }, o.auto || 'Read'),
      h('span', { class: 'tb-sep' }),
      mid,
      h('span', { class: 'fx-tb-search' }, I.search(), 'Add FX…', h('span', { class: 'kc' }, 'Cmd F')),
      h('div', { class: 'tb-right' }, h('span', null, h('b', null, String(o.fx != null ? o.fx : 4)), ' FX'), h('span', null, 'PDC ', h('b', null, o.pdc || '5.3 ms')), h('span', { class: 'tb-sep' }), (() => { const g = I.gear(); g.style.cssText = 'width:16px;height:16px'; return g; })()),
    );
    el.querySelectorAll('.fx-tb-search svg').forEach(x => x.style.cssText = 'width:14px;height:14px');
    return { el, learn, modBtn, mid };
  };

  /* ------------------------------------------------------------ tooltips and popups */
  /** FXD-style tooltip on hover. host = positioned ancestor (defaults to closest .stage-inner) */
  FXD.tooltip = function (el, title, sub, opts = {}) {
    let tip = null, timer = null;
    const show = () => {
      const host = opts.host || el.closest('.stage-inner') || document.body;
      tip = h('div', { class: 'fx-tip fx' }, typeof title === 'function' ? title() : title, sub ? h('small', null, typeof sub === 'function' ? sub() : sub) : null);
      host.append(tip);
      const hb = host.getBoundingClientRect(), b = el.getBoundingClientRect();
      tip.style.left = Math.max(4, b.left - hb.left + host.scrollLeft) + 'px';
      tip.style.top = (b.bottom - hb.top + host.scrollTop + 6) + 'px';
    };
    el.addEventListener('pointerenter', () => { clearTimeout(timer); timer = setTimeout(show, opts.delay != null ? opts.delay : 350); });
    el.addEventListener('pointerleave', () => { clearTimeout(timer); tip && tip.remove(); tip = null; });
    el.addEventListener('pointerdown', () => { clearTimeout(timer); tip && tip.remove(); tip = null; });
  };
  /** place an absolutely positioned popup under/next to an anchor inside host. Returns { el, close } */
  FXD.popup = function (anchor, content, opts = {}) {
    const host = opts.host || anchor.closest('.stage-inner') || document.body;
    const el = h('div', { class: 'fx-pop fx' + (opts.cls ? ' ' + opts.cls : '') }, content);
    host.append(el);
    const place = () => {
      const hb = host.getBoundingClientRect(), b = anchor.getBoundingClientRect();
      let x = b.left - hb.left + host.scrollLeft + (opts.dx || 0), y = (opts.above ? b.top - hb.top - el.offsetHeight - 6 : b.bottom - hb.top + 6) + host.scrollTop + (opts.dy || 0);
      if (opts.right) { x = b.right - hb.left + 8 + host.scrollLeft; y = b.top - hb.top + host.scrollTop + (opts.dy || 0); }
      const maxX = host.scrollWidth - el.offsetWidth - 6;
      el.style.left = Math.max(6, Math.min(x, maxX)) + 'px'; el.style.top = Math.max(6, y) + 'px';
    };
    place();
    let closed = false;
    const close = () => { if (closed) return; closed = true; el.remove(); document.removeEventListener('pointerdown', outside, true); opts.onClose && opts.onClose(); };
    const outside = e => { if (!el.contains(e.target) && !(opts.keepFor && opts.keepFor.contains(e.target)) && !anchor.contains(e.target)) close(); };
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    scope.offs.push(close);
    return { el, close, place };
  };

  /* ------------------------------------------------------------ lesson scaffold */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('fxd-tour:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('fxd-tour:' + k, JSON.stringify(v)); } catch (e) { /* storage blocked: fine */ } },
  };
  FXD.store = store;

  /**
   * FXD.lesson(root, { kicker, title, lede, tabs, steps, stageClass, caption, notes })
   * returns L = { root, stage (the .stage-inner to build in), stageBox, check(id), setSteps(steps), caption(el|str), notes(list), tabs }
   * steps: [{ id, text, why, target: () => element }]
   */
  FXD.lesson = function (root, o) {
    const L = {};
    const head = h('header', { class: 'ch-head' },
      o.kicker ? h('div', { class: 'kicker' }, o.kicker) : null,
      h('h1', { class: 'ch-title' }, o.title),
      o.lede ? h('p', { class: 'ch-lede' }, o.lede) : null);
    const tabsEl = h('div', { class: 'subtabs', role: 'tablist' });
    const stageInner = h('div', { class: 'stage-inner' });
    const stageBox = h('div', { class: 'stage' + (o.stageClass ? ' ' + o.stageClass : '') }, stageInner);
    const cap = h('div', { class: 'stage-cap' });
    const stepsEl = h('ol', { class: 'steps' });
    const count = h('span', { class: 'tryit-count' });
    const resetBtn = h('button', { class: 'btn-quiet', type: 'button' }, 'Reset demo');
    const tryit = h('aside', { class: 'tryit', 'aria-label': 'Try it' },
      h('div', { class: 'tryit-head' }, h('h3', null, 'Try it'), h('span', { class: 'tryit-hint' }, 'Click a step to see where to do it'), h('span', { class: 'tryit-right' }, count, resetBtn)),
      stepsEl,
      h('div', { class: 'all-done' }, 'All done here. Pick another feature from the menu.'));
    const notesEl = h('div', { class: 'notes' });
    const lessonEl = h('div', { class: 'lesson' }, h('div', { class: 'stage-wrap' }, stageBox, cap), tryit);
    root.append(head, tabsEl, lessonEl, notesEl);
    if (!o.tabs) tabsEl.remove();
    let steps = [], done = new Set(), active = null, ring = null;
    const key = 'steps:' + (o.id || o.title);
    function renderSteps() {
      stepsEl.textContent = '';
      steps.forEach((st, i) => {
        const b = h('button', { class: 'step' + (done.has(st.id) ? ' done' : '') + (active === st.id ? ' active' : ''), type: 'button' },
          h('span', { class: 'box' }, done.has(st.id) ? '✓' : String(i + 1)),
          h('span', { class: 'txt', html: st.text }, st.why ? h('span', { class: 'why', html: st.why }) : null));
        b.addEventListener('click', () => { active = active === st.id ? null : st.id; renderSteps(); });
        stepsEl.append(h('li', null, b));
      });
      const n = steps.filter(x => done.has(x.id)).length;
      count.textContent = `${n} / ${steps.length}`;
      tryit.classList.toggle('complete', steps.length > 0 && n === steps.length);
      if (!steps.length) tryit.hidden = true; else tryit.hidden = false;
    }
    L.setSteps = function (list, subkey) {
      steps = list || []; active = null;
      L._key = key + (subkey ? ':' + subkey : '');
      done = new Set(store.get(L._key, []).filter(id => steps.some(x => x.id === id)));
      renderSteps();
    };
    L.check = function (id) {
      if (!steps.some(x => x.id === id) || done.has(id)) return;
      done.add(id); store.set(L._key, [...done]);
      if (active === id) active = null;
      // next unfinished step becomes the pointed one only if the user was following along
      renderSteps();
    };
    L.isDone = id => done.has(id);
    resetBtn.addEventListener('click', () => { done.clear(); store.set(L._key, []); active = null; renderSteps(); o.onReset && o.onReset(); });
    // pointer ring around the active step's target
    FXD.onFrame(() => {
      const st = active && steps.find(x => x.id === active);
      const t = st && st.target && st.target();
      if (!t || !t.isConnected) { if (ring) { ring.remove(); ring = null; } return; }
      if (!ring) { ring = h('div', { class: 'pointer-ring' }); stageInner.append(ring); }
      const hb = stageInner.getBoundingClientRect(), b = t.getBoundingClientRect();
      ring.style.left = (b.left - hb.left - 4) + 'px'; ring.style.top = (b.top - hb.top - 4) + 'px';
      ring.style.width = (b.width + 8) + 'px'; ring.style.height = (b.height + 8) + 'px';
    });
    L.root = root; L.stage = stageInner; L.stageBox = stageBox; L.tryit = tryit;
    L.caption = function (...items) { cap.replaceChildren(...items); };
    L.notes = function (list) {
      notesEl.replaceChildren(...list.map(n => h('div', { class: 'note' }, h('h4', null, n.title), h('p', { html: n.text }))));
    };
    /** sub tabs: items [{ id, label, dot }] ; onSelect(id) */
    L.tabs = function (items, onSelect, initial) {
      tabsEl.textContent = '';
      const btns = items.map(it => {
        const b = h('button', { class: 'subtab', role: 'tab', type: 'button', 'aria-selected': 'false' }, it.dot ? h('span', { class: 'dot', style: { background: it.dot } }) : null, it.label);
        b.addEventListener('click', () => select(it.id));
        tabsEl.append(b);
        return [it.id, b];
      });
      function select(id) { btns.forEach(([i, b]) => b.setAttribute('aria-selected', String(i === id))); store.set('tab:' + (o.id || o.title), id); onSelect(id); }
      const saved = store.get('tab:' + (o.id || o.title), null);
      select(items.some(i => i.id === saved) ? saved : (initial || items[0].id));
      return select;
    };
    L.setSteps(o.steps || []);
    if (o.notes) L.notes(o.notes);
    return L;
  };

  /* ------------------------------------------------------------ chapters + router */
  /**
   * FXD.chapter({ id, group, nav, icon, mount(root) -> cleanup? })
   * Register in nav order. mount() builds into root; frame callbacks, FXD.listen handlers
   * and popups opened while mounted are cleaned up automatically.
   */
  FXD.chapter = function (c) { FXD.chapters.push(c); };
  let current = null;
  function go(id) {
    const ch = FXD.chapters.find(c => c.id === id) || FXD.chapters[0];
    if (current && current.cleanup) { try { current.cleanup(); } catch (e) { console.error(e); } }
    scope.offs.forEach(f => { try { f(); } catch (e) { /* ignore */ } });
    scope = { frames: new Set(), offs: [] };
    FXD.dragHook = null;
    const main = document.getElementById('main');
    main.textContent = '';
    const root = h('section', { class: 'chapter', id: 'ch-' + ch.id });
    main.append(root);
    let cleanup;
    try { cleanup = ch.mount(root); } catch (e) { console.error(e); root.append(h('p', null, 'This demo failed to load: ' + e.message)); }
    // previous / next links
    const i = FXD.chapters.indexOf(ch), prev = FXD.chapters[i - 1], next = FXD.chapters[i + 1];
    if (ch.id !== 'home') root.append(h('nav', { class: 'next-row', 'aria-label': 'More features' },
      prev ? h('a', { href: '#' + prev.id }, '← Previous', h('b', null, prev.nav)) : null,
      next ? h('a', { href: '#' + next.id, class: 'nx' }, 'Next →', h('b', null, next.nav)) : null));
    current = { ch, cleanup };
    document.querySelectorAll('.nav-link').forEach(a => a.setAttribute('aria-current', a.dataset.id === ch.id ? 'page' : 'false'));
    const link = document.querySelector(`.nav-link[data-id="${ch.id}"]`);
    if (link) { link.classList.add('visited'); if (matchMedia('(max-width: 820px)').matches) link.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    const seen = store.get('seen', []); if (!seen.includes(ch.id)) { seen.push(ch.id); store.set('seen', seen); }
    window.scrollTo(0, 0);
  }
  FXD.go = id => { if (location.hash.slice(1) === id) go(id); else location.hash = id; };

  FXD.boot = function () {
    const nav = document.getElementById('nav');
    const groups = [];
    for (const c of FXD.chapters) { let g = groups.find(x => x.name === c.group); if (!g) groups.push(g = { name: c.group, items: [] }); g.items.push(c); }
    const seen = store.get('seen', []);
    for (const g of groups) {
      nav.append(h('div', { class: 'nav-group' }, g.name ? h('div', { class: 'nav-group-label' }, g.name) : null,
        g.items.map(c => h('a', { class: 'nav-link' + (seen.includes(c.id) ? ' visited' : ''), href: '#' + c.id, 'data-id': c.id }, c.icon ? c.icon() : null, c.nav, h('span', { class: 'seen' })))));
    }
    // transport
    const tb = document.getElementById('play');
    const tTxt = document.getElementById('play-txt');
    const paint = () => { tb.replaceChildren(FXD.clock.playing ? I.pause() : I.play()); tb.setAttribute('aria-pressed', String(FXD.clock.playing)); tb.setAttribute('aria-label', FXD.clock.playing ? 'Stop playback' : 'Play'); tb.querySelector('svg').style.cssText = 'width:14px;height:14px'; };
    tb.addEventListener('click', () => { FXD.setPlaying(!FXD.clock.playing); });
    FXD.onTransport(paint); paint();
    const beatTxt = document.getElementById('play-beat');
    const tick = () => { const b = FXD.clock.beat; beatTxt.textContent = `${Math.floor(b / 4) + 1}.${Math.floor(b % 4) + 1} · ${FXD.clock.bpm} BPM`; requestAnimationFrame(tick); };
    tick();
    tTxt.textContent = 'Transport';
    document.addEventListener('keydown', e => {
      if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable && document.activeElement.getAttribute('role') !== 'slider') { e.preventDefault(); FXD.setPlaying(!FXD.clock.playing); }
    });
    window.addEventListener('hashchange', () => go(location.hash.slice(1)));
    go(location.hash.slice(1) || 'home');
  };
})();
