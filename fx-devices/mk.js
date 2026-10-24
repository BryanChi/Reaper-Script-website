/* FX Devices marketing page: screenshots with callouts, tabs, and a few live demos built from the tour's UI kit (core.js)
   and its device registry (dev-fabfilter.js, dev-fxd.js). Nothing here reacts to scrolling. */
(function () {
  'use strict';
  const { h, s, clamp, lerp } = FXD;
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => [...el.querySelectorAll(q)];

  /* ------------------------------------------------------------ screenshots */
  const IMG = {
    'chain-mastering': [3520, 580], proq4: [1440, 580], proc3: [920, 580], prol2: [1520, 580], pror2: [2000, 600],
    'wave-shifter': [1000, 580], kaleido: [1124, 544], 'clash-finder': [1524, 544], 'midi-devices': [4756, 544],
    'reaper-stock': [2960, 544], modulators: [2524, 670], 'lfo-editor': [2524, 1160], 'mod-panel': [841, 644, 600],
    'mod-targets': [1120, 960], 'container-mods': [2400, 636], 'band-split': [2580, 636], 'mid-side-transient': [1880, 636],
    'parallel-tabs': [2124, 644],
  };
  // callouts: [x %, y %, title, text]
  const HOT = {
    modulators: [
      [4.5, 15.4, 'Track modulators', 'LFOs, envelopes, macros, steps, followers, random, XY and MIDI, all along the top.'],
      [24.3, 42.4, 'Rings show the range', 'Each modulator adds a coloured ring around the knob. The white dot is the value you hear.'],
      [74.3, 33.9, 'Any plugin', 'Any parameter of any plugin can take modulators, not just the ones with a custom panel.'],
      [93.6, 15.8, 'Add more', 'Add as many modulators as the track needs.'],
    ],
    'chain-mastering': [
      [1.75, 70, 'The same frame on every device', 'Bypass at the top, the name down the side, wet at the bottom.'],
      [12.75, 66, 'Drag EQ bands in the chain', 'Shape Pro-Q 4 without opening its window.'],
      [51.9, 28.8, 'The knobs you use most', 'Pro-C 3\'s main controls, sized to fit the strip.'],
      [68, 71.5, 'Real plugin controls', 'Style, lookahead, attack and release change the plugin itself.'],
      [26, 6.5, 'Add FX search', 'Press Ctrl+F from anywhere and type a few letters.'],
    ],
    'mod-panel': [
      [28.5, 16.3, 'One badge per modulator', 'Hover a knob and a badge appears for each modulator on it, showing how it combines with the others.'],
      [95.8, 49.4, 'Warns before it clips', 'The bar shows where the knob sits and how far the modulators take it. The red end is where the range runs past the limit.'],
      [19.6, 74.7, 'In the plugin\'s own units', 'Each row shows the range that modulator covers on this knob, here in Hz.'],
      [36.3, 61.8, 'Add or scale', 'Choose how each modulator combines with the rest.'],
      [43.6, 72.2, 'One way or both', 'Push the knob up, down, or both ways around where it sits.'],
      [49.9, 82.3, 'A curve per link', 'Bend how the modulator maps onto this knob.'],
      [64.2, 62.1, 'Drag the amount', 'Set how far each modulator moves the knob, shown in % on the right.'],
      [52.3, 94.1, 'The maths, spelled out', 'How the modulators combine on this knob, written out in full.'],
    ],
    'lfo-editor': [
      [17.25, 19, 'Draw the shape', 'Double-click to add a point. Drag a line to bend it.'],
      [60.5, 39.2, 'Shape library', 'Keep shapes for every project, for this project, or for this track.'],
      [19.5, 81, 'Sync or free', 'Lock to tempo with an even, triplet or dotted feel, or run free.'],
    ],
    'container-mods': [
      [7.5, 28.3, 'Container modulators', 'Macros, LFOs and envelopes that belong to the container.'],
      [5, 86.8, 'One device for the group', 'Vocal Bus holds three FX and folds into a single device.'],
    ],
    'band-split': [
      [10, 33.5, 'Drag the crossovers', 'Set where the bands split, right on the display.'],
      [7.5, 58.6, 'Slope and phase', 'Pick the slope, or switch to linear phase.'],
      [6, 71.6, 'FX per band', 'Each band shows its FX count, with mute and solo.'],
      [18.75, 86.6, 'Always know where you are', 'The chain marks which band you are editing.'],
    ],
    'parallel-tabs': [
      [56.5, 85, 'Parallel FX as tabs', 'Each tab has its own mix bar, mute and solo.'],
      [69, 46.2, 'Open one, see it all', 'The selected tab shows that FX in full.'],
      [80.9, 86.1, 'Add a branch', 'One click adds another parallel FX.'],
    ],
    'clash-finder': [
      [13.1, 55.1, 'Pick the tracks', 'Every track with Clash Finder on it shows up here.'],
      [29.5, 71.7, 'See the overlap', 'Each track\'s spectrum, with the cuts drawn on top.'],
      [77.4, 31.8, 'Ranked by how much they fight', 'And when it happens, like only while the kick plays.'],
      [56.6, 21.1, 'Fix top 3', 'Cut the worst clashes in one click.'],
    ],
  };

  function fillShot(shot, name, alt, opts = {}) {
    const [w, hh, maxW] = IMG[name];
    const wide = !opts.contain && w / hh > 2.2;
    const img = h('img', { src: '/fx-devices/img/' + name + '.webp', width: w, height: hh, alt: alt || '', decoding: 'async', draggable: 'false' });
    const inner = h('div', { class: 'shot-in' + (wide ? ' wide' : '') + (opts.fade ? ' fade' : '') }, img);
    // tall shots: cap their height so a panel never fills more than a screen
    if (!opts.contain && w / hh < 2.4) inner.style.maxWidth = (maxW || Math.round(620 * w / hh)) + 'px';
    for (const [i, hs] of (HOT[name] || []).entries()) inner.append(hotspot(inner, hs, i));
    shot.replaceChildren(inner);
    const frame = shot.closest('.frame');
    const old = frame && frame.querySelector(':scope > .swipe');
    if (old) old.remove();
    if (wide && frame) frame.append(h('div', { class: 'swipe' }, 'Swipe to see the whole chain →'));
    return inner;
  }

  let openHot = null;
  function hotspot(inner, [x, y, title, text], i) {
    const b = h('button', { class: 'hs', type: 'button', style: { left: x + '%', top: y + '%' }, 'aria-label': title, 'aria-expanded': 'false' }, String(i + 1));
    let tip = null;
    const show = () => {
      if (tip) return;
      if (openHot && openHot !== hide) openHot();
      tip = h('div', { class: 'hs-tip', role: 'tooltip' }, h('b', null, title), text);
      inner.append(tip);
      const W = inner.offsetWidth, H = inner.offsetHeight, tw = tip.offsetWidth, th = tip.offsetHeight;
      const px = x / 100 * W, py = y / 100 * H;
      const left = clamp(px - tw / 2, 6, Math.max(6, W - tw - 6));
      let top = y < 45 ? py + 20 : py - th - 20;
      top = clamp(top, 6, Math.max(6, H - th - 6));
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
      requestAnimationFrame(() => tip && tip.classList.add('show'));
      b.setAttribute('aria-expanded', 'true');
      openHot = hide;
    };
    const hide = () => { if (!tip) return; tip.remove(); tip = null; b.setAttribute('aria-expanded', 'false'); if (openHot === hide) openHot = null; };
    b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') show(); });
    b.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
    b.addEventListener('click', () => (tip ? hide() : show()));
    b.addEventListener('focus', show);
    b.addEventListener('blur', hide);
    return b;
  }
  document.addEventListener('pointerdown', e => { if (openHot && !e.target.closest('.hs')) openHot(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openHot) openHot(); });

  $$('.shot[data-img]').forEach(el => fillShot(el, el.dataset.img, el.dataset.alt));

  /* ------------------------------------------------------------ tabs */
  const TABS = {
    mod: [
      { guide: true, label: 'The modulators', cap: '<b>Every kind of modulator</b> in FX Devices. The less obvious ones show what they do, live.' },
      { img: 'mod-panel', label: 'Mod panel', cap: '<b>Hover a knob</b> and its mod panel shows every modulator on it, with values in the plugin\'s own units.' },
      { img: 'mod-targets', label: 'Targets', cap: '<b>Everything one modulator drives,</b> in one list, with a curve for each link.' },
    ],
    chain: [
      { img: 'parallel-tabs', label: 'Parallel tabs', cap: '<b>Parallel FX as tabs:</b> ReaComp, ReaDelay and Pro-R 2 side by side, each with its own mix.' },
      { img: 'container-mods', label: 'Containers', cap: '<b>A container is one device</b> with its own modulators, shared by every FX inside.' },
    ],
    split: [
      { img: 'band-split', label: 'Band split', cap: '<b>Band Split</b> with three bands. The middle band holds ReaComp and ReaDelay.' },
      { img: 'mid-side-transient', label: 'Mid-Side + Transient', cap: '<b>Mid-Side and Transient-Sustain</b> splitters, one nested inside the other.' },
    ],
    dev: [
      { img: 'proq4', label: 'Pro-Q 4', vendor: 'FabFilter', live: 'proq4', text: 'The EQ curve, band nodes and band settings, drawn right in the chain. Drag a band, change its shape and slope, and every gain, frequency and Q can take modulators.' },
      { img: 'proc3', label: 'Pro-C 3', vendor: 'FabFilter', live: 'proc3', text: 'The level display with gain reduction, the knee curve, the meters and every main knob, including auto threshold, auto release and side chain.' },
      { img: 'prol2', label: 'Pro-L 2', vendor: 'FabFilter', live: 'prol2', text: 'Watch the limiter work on its scrolling display: the output in blue, gain reduction in red and the ceiling in yellow, with Style and the knobs right below.' },
      { img: 'pror2', label: 'Pro-R 2', vendor: 'FabFilter', live: 'pror2', text: 'Space, decay rate, character and the rest of the control row, over the decay EQ you can drag to change how long the reverb rings at each frequency.' },
      { img: 'wave-shifter', label: 'Wave Shifter', vendor: 'Minimal Audio', live: 'wave-shifter', text: 'A frequency shifter redrawn in the plugin\'s own look. The display shows the left and right shift moving with the LFO.' },
      { img: 'kaleido', label: 'Kaleido Chorus', vendor: 'FX Devices', live: 'fxd-kaleido', text: 'FX Devices\' own chorus with eight modes, from a warm two-voice BBD to a rotary speaker. The kaleidoscope draws every voice as it moves.' },
      { img: 'midi-devices', label: 'MIDI devices', vendor: 'FX Devices', live: 'midi-step-engine', text: 'Note Generator, Step Engine and Echo & Strum, three of the five MIDI devices that come with FX Devices. Generate notes, sequence them and echo them, all in the chain.' },
      { img: 'reaper-stock', label: 'REAPER stock FX', vendor: 'Cockos', live: 'rea-comp', text: 'ReaComp, ReaEQ and ReaDelay get proper displays: a drawn transfer curve, a response curve with a node per band, and a timeline of every delay tap.' },
    ],
  };

  function mountTabs(key, onSelect) {
    const bar = $(`[data-tabs="${key}"]`);
    const items = TABS[key];
    const btns = items.map((it, i) => {
      const b = h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': 'false' }, it.label);
      b.addEventListener('click', () => select(i, true));
      bar.append(b);
      return b;
    });
    bar.addEventListener('keydown', e => {
      const cur = btns.findIndex(b => b.getAttribute('aria-selected') === 'true');
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const n = (cur + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length;
        select(n, true); btns[n].focus(); e.preventDefault();
      }
    });
    function select(i, fade) {
      btns.forEach((b, j) => { b.setAttribute('aria-selected', String(i === j)); b.tabIndex = i === j ? 0 : -1; });
      onSelect(items[i], fade);
    }
    select(0, false);
    return select;
  }
  ['chain', 'split'].forEach(key => {
    const shot = $(`[data-tabbed="${key}"]`), cap = $(`[data-cap="${key}"]`);
    mountTabs(key, (it, fade) => { fillShot(shot, it.img, it.label, { fade }); cap.innerHTML = it.cap; });
  });

  /* ------------------------------------------------------------ modulation tabs, one of them the guide to every modulator type */
  (function modTabs() {
    const shot = $('[data-tabbed="mod"]'), frame = shot.closest('.frame'), cap = $('[data-cap="mod"]');
    const guideHost = h('div', { class: 'mg-host', id: 'modulators' });
    const guide = FXD.modGuide(guideHost, { fillShot });
    const tabIndex = TABS.mod.findIndex(t => t.guide);
    const selectTab = mountTabs('mod', (it, fade) => {
      cap.innerHTML = it.cap;
      if (it.guide) { frame.hidden = true; frame.after(guideHost); return; }
      guideHost.remove(); frame.hidden = false;
      fillShot(shot, it.img, it.label, { fade });
    });
    // the modulator names under the demo, and links like #mod-lfo, open that modulator in the guide
    function open(key) {
      selectTab(tabIndex, true);
      guide.select(key);
    }
    $$('[data-mod]').forEach(a => { const m = FXD.modGuide.mods[a.dataset.mod]; if (m) a.style.setProperty('--c', m.color); });
    $$('[data-mod]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); history.replaceState(null, '', '#mod-' + a.dataset.mod); open(a.dataset.mod); }));
    const fromHash = () => { const m = location.hash.match(/^#mod-([\w-]+)$/); if (m && FXD.modGuide.mods[m[1]]) open(m[1]); };
    window.addEventListener('hashchange', fromHash);
    // wait for the screenshots above to take their height, or the scroll lands short
    if (document.readyState === 'complete') fromHash(); else window.addEventListener('load', fromHash);
  })();
  let curDev = null;
  mountTabs('dev', (it, fade) => {
    curDev = it;
    fillShot($('[data-tabbed="dev"]'), it.img, it.label + ' front panel in FX Devices', { fade, contain: true });
    $('#dev-vendor').textContent = it.vendor;
    $('#dev-name').textContent = it.label;
    $('#dev-text').textContent = it.text;
    $('#dev-live').hidden = !(it.live && FXD.devices[it.live]);
  });
  $('#dev-live').addEventListener('click', () => curDev && openLive(curDev.live));
  $$('[data-live]').forEach(b => b.addEventListener('click', () => openLive(b.dataset.live)));

  /* ------------------------------------------------------------ nav menu (phones) */
  const menuBtn = $('#nav-menu'), links = $('#nav-links');
  menuBtn.addEventListener('click', () => {
    const open = !links.classList.contains('open');
    links.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  links.addEventListener('click', e => { if (e.target.closest('a')) { links.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); } });

  /* ------------------------------------------------------------ marquee */
  const NAMES = [['Pro-Q 4', 'FabFilter'], ['Pro-C 3', 'FabFilter'], ['Pro-L 2', 'FabFilter'], ['Pro-R 2', 'FabFilter'], ['Wave Shifter', 'Minimal Audio'],
    ['VELA', 'Sonic Digital'], ['Love 2', 'Dawesome'], ['ReaComp'], ['ReaEQ'], ['ReaDelay'], ['ReaVerbate'], ['ReaSynth'], ['Kaleido Chorus'],
    ['Step Engine'], ['Note Generator'], ['121 community layouts', null, true]];
  const row = $('#marquee');
  for (let k = 0; k < 2; k++) for (const [n, v, hl] of NAMES) row.append(h('span', { class: hl ? 'hl' : null, 'aria-hidden': k ? 'true' : null }, n, v ? h('small', null, v) : null));

  /* ------------------------------------------------------------ hero: REAPER arrange view above the docked FX Devices */
  (function arrange() {
    const host = $('#arrange');
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const wave = (n, dens) => {
      let top = '', bot = '';
      for (let i = 0; i <= n; i++) {
        const x = (i / n * 100).toFixed(2), env = 0.25 + 0.75 * Math.abs(Math.sin(i / n * Math.PI * dens)) * (0.5 + 0.5 * rnd());
        top += (i ? 'L' : 'M') + x + ' ' + (50 - env * 44).toFixed(1);
        bot = 'L' + x + ' ' + (50 + env * 44).toFixed(1) + bot;
      }
      return top + bot + 'Z';
    };
    const TR = [
      { n: 'Track 1', c: '#49cc85', sel: true, clips: [[2, 30], [36, 28], [70, 26]], d: 9 },
      { n: 'Drums', c: '#e8963a', clips: [[0, 48], [50, 48]], d: 30 },
      { n: 'Bass', c: '#5aa9f0', clips: [[0, 24], [26, 46], [74, 24]], d: 14 },
      { n: 'Keys', c: '#9a6ad6', clips: [[12, 36], [60, 34]], d: 6 },
    ];
    const lanes = h('div', { class: 'ar-lanes' });
    for (const [i, t] of TR.entries()) {
      const lane = h('div', { class: 'ar-lane' });
      for (const [l, w] of t.clips) {
        const sv = s('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none' }, s('path', { d: wave(Math.round(w * 2.2), t.d * w / 30), fill: FXD.alpha(t.c, 0.55) }));
        lane.append(h('div', { class: 'ar-clip', style: `left:${l}%;width:${w}%;--c:${t.c}` }, sv));
      }
      host.append(h('div', { class: 'ar-row' + (t.sel ? ' sel' : '') },
        h('div', { class: 'ar-head' }, h('i', { style: 'background:' + t.c }), h('span', null, String(i + 1).padStart(2, '0')), h('b', null, t.n), t.sel ? h('em', null, 'FX') : null), lane));
    }
    const ph = h('div', { class: 'ar-play' });
    host.append(h('div', { class: 'ar-ruler' }, [1, 2, 3, 4, 5, 6, 7, 8].map(n => h('span', null, String(n)))), ph);
    FXD.onFrame(() => { ph.style.setProperty('--p', ((FXD.clock.beat / 32) % 1).toFixed(4)); });
  })();

  /* ------------------------------------------------------------ modulation in two moves: live demo + a ghost cursor that shows the gesture */
  (function modDemo() {
    const win = $('#md-win'), stage = $('.md-stage'), cur = $('#md-cursor'), say = $('#md-say'), click = $('.md-click', cur), mode = $('#md-mode');
    const beat = () => FXD.clock.beat;
    const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    const MODS = [
      { name: 'LFO 1', i: 1, shape: p => 0.5 + 0.5 * Math.sin(p * Math.PI * 2), phase: () => (beat() / 4) % 1, bip: true },
      { name: 'Envelope 2', i: 2, shape: p => Math.exp(-4.5 * p), phase: () => beat() % 1 },
      { name: 'Random 3', i: 7, shape: null, phase: () => beat() % 1 },
    ];
    for (const m of MODS) {
      m.color = FXD.modBright(m.i);
      m.out = m.shape ? () => m.shape(m.phase()) : () => { const b = beat(), k = Math.floor(b), f = Math.min(1, (b - k) * 6); return lerp(hash(k - 1), hash(k), f); };
    }
    // tiles
    const tiles = MODS.map(m => {
      const W = 100, H = 30;
      let d = '';
      if (m.shape) for (let i = 0; i <= 40; i++) { const p = i / 40; d += (i ? 'L' : 'M') + (p * W).toFixed(1) + ' ' + (H - 3 - m.shape(p) * (H - 8)).toFixed(1); }
      else for (let k = 0; k < 6; k++) d += (k ? 'L' : 'M') + (k / 6 * W).toFixed(1) + ' ' + (H - 3 - hash(k + 3) * (H - 8)).toFixed(1) + 'L' + ((k + 1) / 6 * W).toFixed(1) + ' ' + (H - 3 - hash(k + 3) * (H - 8)).toFixed(1);
      const dot = s('circle', { r: 2.6, fill: '#fff' });
      const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' }, s('path', { d: d + `L${W} ${H}L0 ${H}Z`, fill: FXD.alpha(m.color, 0.16) }), s('path', { d, fill: 'none', stroke: m.color, 'stroke-width': 1.6 }), dot);
      const el = h('div', { class: 'md-tile', role: 'button', tabindex: 0, 'aria-label': m.name + ': right-click to arm', style: '--c:' + m.color }, h('span', null, m.name), svg);
      m.tile = el; m.dot = dot;
      el.addEventListener('contextmenu', e => { e.preventDefault(); takeOver(); arm(m, true); });
      el.addEventListener('click', e => { if (e.pointerType && e.pointerType !== 'mouse') { takeOver(); arm(m, true); } else hint(el, 'Right-click to arm it'); });
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); takeOver(); arm(m, true); } });
      return el;
    });
    // devices with knobs
    const knobs = [];
    const mkKnob = (label, value, fmt) => {
      const K = FXD.knob({ label, value, r: 21, fmt,
        onDrag: (dv, K, e) => { if (armed && e.pointerType !== 'mouse') { setAmt(K, armed, (linkOf(K, armed) ? linkOf(K, armed).amt : 0) + dv * 1.8, false, true); return true; } return false; } });
      K.links = new Map();
      K.el.style.setProperty('--c', '#fff');
      K.svg.addEventListener('contextmenu', e => e.preventDefault());
      K.svg.addEventListener('pointerdown', e => {
        if (e.button !== 2) return;
        e.preventDefault(); takeOver();
        const M = armed || [...K.links.keys()].pop();
        if (!M) { hint(K.el, 'Right-click a modulator first'); return; }
        const id = e.pointerId; let y0 = e.clientY; const a0 = linkOf(K, M) ? linkOf(K, M).amt : 0;
        K.svg.setPointerCapture(id);
        const mv = ev => { if (ev.pointerId !== id) return; setAmt(K, M, a0 + (y0 - ev.clientY) / 100, ev.altKey, true); };
        const up = ev => { if (ev.pointerId !== id) return; K.svg.removeEventListener('pointermove', mv); K.svg.removeEventListener('pointerup', up); K.svg.removeEventListener('pointercancel', up); chip.classList.remove('show'); };
        K.svg.addEventListener('pointermove', mv); K.svg.addEventListener('pointerup', up); K.svg.addEventListener('pointercancel', up);
      });
      knobs.push(K);
      return K;
    };
    const pct = v => Math.round(v * 100) + '%';
    const K1 = mkKnob('Space', 0.45, v => (0.1 * Math.pow(200, v)).toFixed(2) + ' s');
    const K2 = mkKnob('Decay Rate', 0.55, pct);
    const K3 = mkKnob('Brightness', 0.4, pct);
    const K4 = mkKnob('Mix', 0.35, pct);
    const K5 = mkKnob('Thresh', 0.6, v => (-60 + v * 60).toFixed(1) + ' dB');
    const K6 = mkKnob('Ratio', 0.3, v => (1 + v * 19).toFixed(1) + ':1');
    const D1 = FXD.device({ name: 'Pro-R 2', vendor: 'FabFilter', width: 300, height: 196, body: h('div', { class: 'md-knobs' }, [K1, K2, K3, K4].map(k => k.el)) });
    const D2 = FXD.device({ name: 'ReaComp', width: 168, height: 196, body: h('div', { class: 'md-knobs' }, [K5, K6].map(k => k.el)) });
    const chip = h('div', { class: 'md-chip' });
    win.append(
      h('div', { class: 'md-bar' }, h('i'), h('span', null, '01'), h('b', null, 'Track 1'), h('span', { class: 'md-modbtn' }, FXD.icons.mod(), 'Mod')),
      h('div', { class: 'md-tiles' }, tiles, h('div', { class: 'md-tile md-add', 'aria-hidden': 'true' }, '+')),
      h('div', { class: 'md-chain' }, D1.el, D2.el), chip);
    const hintEl = h('div', { class: 'md-hint' }); win.append(hintEl);
    let hintT = 0;
    function hint(anchor, text) {
      hintEl.textContent = text; place(hintEl, anchor, -34); hintEl.classList.add('show'); clearTimeout(hintT); hintT = setTimeout(() => hintEl.classList.remove('show'), 1600);
    }
    function place(el, anchor, dy) { const wb = win.getBoundingClientRect(), b = anchor.getBoundingClientRect(); el.style.left = (b.left - wb.left + b.width / 2) + 'px'; el.style.top = (b.top - wb.top + dy) + 'px'; }

    // state
    let armed = null;
    const linkOf = (K, M) => K.links.get(M);
    function arm(M, user) {
      armed = armed === M ? null : M;
      MODS.forEach(m => m.tile.classList.toggle('armed', m === armed));
      knobs.forEach(K => { K.el.classList.toggle('md-target', !!armed); if (armed) K.el.style.setProperty('--c', armed.color); });
      if (user && armed) mark('arm');
    }
    function setAmt(K, M, amt, bip, user) {
      amt = clamp(amt, -1, 1);
      let L = linkOf(K, M);
      if (!L) { L = { color: M.color, amt: 0, bipolar: false, out: M.out }; K.links.set(M, L); }
      L.amt = amt; if (bip) L.bipolar = true;
      K.setMods([...K.links.values()]);
      chip.textContent = M.name + '  ' + (amt >= 0 ? '+' : '') + Math.round(amt * 100) + '%' + (L.bipolar ? ' ±' : '');
      chip.style.setProperty('--c', M.color); place(chip, K.svg, -26); chip.classList.add('show');
      if (user && Math.abs(amt) > 0.05) { mark('drag'); mark('done'); }
    }
    function clearAll() { knobs.forEach(K => { K.links.clear(); K.setMods([]); }); if (armed) arm(armed); chip.classList.remove('show'); }
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && armed) arm(armed); });
    document.addEventListener('pointerdown', e => { if (armed && !ghost && !win.contains(e.target)) arm(armed); });

    // steps
    const steps = $$('.md-steps li');
    const done = new Set();
    function mark(id) { done.add(id); paintSteps(); }
    function paintSteps(active) {
      steps.forEach(li => { li.classList.toggle('done', done.has(li.dataset.step)); li.classList.toggle('active', li.dataset.step === active); });
    }

    // ghost cursor
    let ghost = !FXD.reducedMotion, gt = 0, combo = 0, pressed = false;
    const COMBOS = [[0, K1], [1, K3], [2, K4]];
    const rest = () => { const sb = stage.getBoundingClientRect(); return { x: sb.width * 0.82, y: sb.height * 0.9 }; };
    const centerOf = el => { const sb = stage.getBoundingClientRect(), b = el.getBoundingClientRect(); return { x: b.left - sb.left + b.width / 2, y: b.top - sb.top + b.height / 2 }; };
    const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    let last = { x: 0, y: 0 }, fired = {};
    function sayIt(t) { say.textContent = t; say.classList.toggle('show', !!t); }
    function ripple() { click.classList.remove('go'); void click.offsetWidth; click.classList.add('go'); }
    function once(k, fn) { if (!fired[k]) { fired[k] = true; fn(); } }
    function ghostFrame(dt) {
      if (!ghost) return;
      gt += dt;
      const [mi, K] = COMBOS[combo % COMBOS.length], M = MODS[mi];
      const a = rest(), tl = centerOf(M.tile), kn = centerOf(K.svg);
      let p;
      if (gt < 1) { p = { x: lerp(last.x, tl.x, ease(gt)), y: lerp(last.y, tl.y, ease(gt)) }; paintSteps('arm'); }
      else if (gt < 1.7) { p = tl; once('arm', () => { ripple(); sayIt('Right-click'); arm(M); }); }
      else if (gt < 2.7) { const u = ease((gt - 1.7) / 1); p = { x: lerp(tl.x, kn.x, u), y: lerp(tl.y, kn.y, u) }; once('mv', () => sayIt('')); paintSteps('drag'); }
      else if (gt < 4) {
        const u = ease(Math.min(1, (gt - 2.85) / 1.05));
        once('press', () => { ripple(); sayIt('Right-drag up'); pressed = true; });
        p = { x: kn.x, y: kn.y - u * 52 }; if (gt > 2.85) setAmt(K, M, u * (mi === 0 ? 0.3 : 0.42), mi === 0, false);
      }
      else if (gt < 5) { p = { x: kn.x, y: kn.y - 52 }; once('rel', () => { pressed = false; chip.classList.remove('show'); sayIt("That's it"); paintSteps('done'); }); }
      else if (gt < 5.6) { p = { x: kn.x, y: kn.y - 52 }; once('esc', () => { sayIt('Esc'); arm(M); }); }
      else { p = { x: kn.x, y: kn.y - 52 }; last = { ...p, set: true }; gt = 0; fired = {}; combo++; sayIt(''); if (combo % COMBOS.length === 0) clearAll(); return; }
      if (!last.set) { last = { ...a, set: true }; }
      cur.style.transform = `translate(${p.x}px, ${p.y}px)`;
      cur.classList.toggle('down', pressed);
    }
    function startGhost() {
      clearAll(); done.clear(); paintSteps(); ghost = true; gt = 0; combo = 0; fired = {}; last = { ...rest(), set: true };
      cur.hidden = false; mode.lastChild.textContent = 'Watch, then try it yourself';
    }
    function takeOver() {
      if (!ghost) return;
      ghost = false; cur.hidden = true; pressed = false; sayIt(''); chip.classList.remove('show');
      if (armed) arm(armed);
      done.clear(); paintSteps('arm');
      mode.lastChild.textContent = 'Your turn: right-click a modulator';
    }
    win.addEventListener('pointerdown', takeOver);
    $('#md-replay').addEventListener('click', startGhost);
    if (ghost) startGhost(); else { cur.hidden = true; paintSteps('arm'); mode.lastChild.textContent = 'Right-click a modulator to start'; }
    FXD.onFrame(dt => {
      for (const m of MODS) { const p = m.phase(), v = m.out(); m.dot.setAttribute('cx', (p * 100).toFixed(1)); m.dot.setAttribute('cy', (27 - v * 22).toFixed(1)); }
      ghostFrame(dt);
    });
  })();

  /* ------------------------------------------------------------ signal chain: REAPER's FX window vs FX Devices */
  (function compare() {
    const stage = $('#ba-stage'), cap = $('#ba-cap');
    const W = 780, H = 340;
    const knobs = n => h('div', { class: 'cw-knobs' }, Array.from({ length: n }, (_, i) => h('u', { style: '--v:' + (0.3 + (i * 37 % 60) / 100).toFixed(2) })));
    // REAPER FX window
    const row = (txt, ind, mark, sel) => h('div', { class: 'rw-row' + (sel ? ' sel' : ''), style: '--ind:' + ind }, h('span', { class: 'rw-chk' }), mark ? h('span', { class: 'rw-par' }, mark) : null, h('span', null, txt));
    const pins = h('div', { class: 'rw-pins' }, h('b', null, 'Pin connector · ReaDelay'), h('div', { class: 'rw-grid' }, Array.from({ length: 32 }, (_, i) => h('i', { class: [0, 9, 18, 27, 4, 13].includes(i) ? 'on' : null }))));
    const reaper = h('div', { class: 'rw' },
      h('div', { class: 'rw-title' }, 'FX: Track 1 "Lead Vocal"'),
      h('div', { class: 'rw-body' },
        h('div', { class: 'rw-list' },
          row('VST3: Pro-Q 4 (FabFilter)', 0),
          row('JS: 3-Band Splitter', 0),
          row('Container: Parallel verbs', 0, '▾'),
          row('VST3: ReaComp (Cockos)', 1),
          row('JS: ReaDelay', 1, '∥'),
          row('VST3: Pro-R 2 (FabFilter)', 1, '∥', true),
          row('JS: 3-Band Joiner', 0),
          h('div', { class: 'rw-btns' }, h('span', null, 'Add'), h('span', null, 'Remove'))),
        h('div', { class: 'rw-plug' },
          h('div', { class: 'rw-tb' }, h('span', null, 'Param'), h('span', null, '2 in 2 out'), h('span', null, 'UI')),
          h('div', { class: 'rw-gui' }, h('b', null, 'Pro-R 2'), knobs(6), h('div', { class: 'rw-eq' }))),
        pins));
    // FX Devices
    const dev = (name, w, body, cls) => h('div', { class: 'fl-dev' + (cls ? ' ' + cls : ''), style: 'width:' + w + 'px' }, h('div', { class: 'fl-t' }, h('i'), h('b', null, name)), h('div', { class: 'fl-b' }, body));
    const eq = s('svg', { viewBox: '0 0 100 50', preserveAspectRatio: 'none', class: 'fl-eq' }, s('path', { d: 'M0 38 C15 38 18 18 30 20 S48 34 60 28 S82 12 100 16', fill: 'none', stroke: '#f4c64e', 'stroke-width': 2 }));
    const bands = h('div', { class: 'fl-bands' }, [['HIGH', '#5aa9f0'], ['MID', '#f2a33a'], ['LOW', '#e8563a']].map(([n, c]) => h('div', { style: '--c:' + c }, h('i'), n)));
    const tabs = h('div', { class: 'fl-tabs' }, [['ReaComp', '#f2a33a', true], ['ReaDelay', '#5aa9f0'], ['Pro-R 2', '#e8763a']].map(([n, c, on]) => h('div', { class: on ? 'on' : null, style: '--c:' + c }, h('b', null, n), h('i'))));
    const fxd = h('div', { class: 'fl' },
      h('div', { class: 'fl-bar' }, h('i'), '01 Lead Vocal', h('em', null, '7 FX · PDC 5.3 ms')),
      h('div', { class: 'fl-chain' },
        dev('Pro-Q 4', 150, eq),
        dev('Band Split', 120, bands),
        h('div', { class: 'fl-box' }, h('span', { class: 'fl-lbl' }, 'Parallel verbs · 3 FX'), dev('ReaComp', 200, knobs(4), 'hl'), tabs),
        h('div', { class: 'fl-add' }, '+')));
    const inner = h('div', { class: 'cw', style: `width:${W}px;height:${H}px` }, reaper, fxd);
    stage.append(inner);
    const fit = () => { const avail = stage.clientWidth - 24, sc = Math.min(1.3, avail / W); inner.style.transform = `scale(${sc})`; inner.style.marginLeft = Math.max(0, (avail - W * sc) / 2) + 'px'; stage.style.height = Math.round(H * sc + 24) + 'px'; };
    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(stage); else window.addEventListener('resize', fit);
    const CAP = {
      false: '<b>REAPER:</b> a narrow list, one plugin at a time, and a pin matrix for every parallel branch.',
      true: '<b>FX Devices:</b> the same chain. The container is a box, the parallel FX are tabs, and the splitter shows its bands.',
    };
    function set(after) {
      stage.classList.toggle('after', after);
      cap.innerHTML = CAP[after];
      $$('.compare .ba-toggle button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.ba === 'after') === after)));
    }
    let after = false, auto = !FXD.reducedMotion;
    set(false);
    const timer = setInterval(() => { if (!auto) return clearInterval(timer); after = !after; set(after); }, 3800);
    $$('.compare .ba-toggle button').forEach(b => b.addEventListener('click', () => { auto = false; after = b.dataset.ba === 'after'; set(after); }));
  })();

  /* ------------------------------------------------------------ preset morph */
  (function morph() {
    const host = $('#morph');
    const A = { name: 'Small Room', v: [0.22, 0.18, 0.72, 0.3] }, B = { name: 'Big Hall', v: [0.86, 0.9, 0.34, 0.46] };
    const defs = [
      { label: 'Size', fmt: v => Math.round(v * 100) + '%' },
      { label: 'Decay', fmt: v => (0.2 * Math.pow(40, v)).toFixed(1) + ' s' },
      { label: 'Tone', fmt: v => (1 + v * 15).toFixed(1) + ' kHz' },
      { label: 'Mix', fmt: v => Math.round(v * 100) + '%' },
    ];
    let t = 0, auto = !FXD.reducedMotion, phase = 0;
    const knobs = defs.map((d, i) => FXD.knob({ label: d.label, value: A.v[i], r: 20, fmt: d.fmt, color: '#5fd3a0', onStart: () => { auto = false; } }));
    const thumb = h('div', { class: 'mo-thumb' });
    const slider = h('div', { class: 'mo-slider', role: 'slider', tabindex: 0, 'aria-label': 'Morph between A and B', 'aria-valuemin': 0, 'aria-valuemax': 100 }, thumb);
    const cur = h('div', { class: 'mo-preset' });
    function apply() {
      thumb.style.left = (t * 100) + '%';
      slider.setAttribute('aria-valuenow', Math.round(t * 100));
      knobs.forEach((k, i) => k.set(lerp(A.v[i], B.v[i], t), true));
      cur.replaceChildren(h('b', null, Math.round((1 - t) * 100) + '% '), A.name, ' · ', h('b', null, Math.round(t * 100) + '% '), B.name);
    }
    const fromX = x => { const b = slider.getBoundingClientRect(); t = clamp((x - b.left) / b.width); apply(); };
    slider.addEventListener('pointerdown', e => { auto = false; slider.setPointerCapture(e.pointerId); fromX(e.clientX); });
    slider.addEventListener('pointermove', e => { if (slider.hasPointerCapture(e.pointerId)) fromX(e.clientX); });
    slider.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { auto = false; t = clamp(t + 0.05); apply(); e.preventDefault(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { auto = false; t = clamp(t - 0.05); apply(); e.preventDefault(); }
    });
    host.append(
      h('div', { class: 'mo-row' }, h('span', { class: 'mo-ab', style: { background: FXD.C.morphA } }, 'A'), slider, h('span', { class: 'mo-ab', style: { background: FXD.C.morphB } }, 'B')),
      cur, h('div', { class: 'mo-knobs fx' }, knobs.map(k => k.el)));
    apply();
    FXD.onFrame(dt => { if (!auto || !host.isConnected) return; phase += dt * 0.35; t = 0.5 - 0.5 * Math.cos(phase); apply(); });
  })();

  /* ------------------------------------------------------------ live device dialog */
  const dlg = $('#live'), liveStage = $('#live-stage'), playBtn = $('#live-play');
  let offs = [], clean = null;
  function paintPlay() { playBtn.textContent = FXD.clock.playing ? 'Pause' : 'Play'; }
  playBtn.addEventListener('click', () => { FXD.setPlaying(!FXD.clock.playing); paintPlay(); });
  function teardown() {
    if (clean) { try { clean(); } catch (e) { console.error(e); } }
    offs.forEach(f => { try { f(); } catch (e) { /* ignore */ } });
    offs = []; clean = null; FXD.dragHook = null;
    liveStage.textContent = '';
  }
  function openLive(id) {
    const dev = FXD.devices[id];
    if (!dev) return;
    teardown();
    $('#live-h').textContent = dev.name;
    const hgt = dev.height || 250;
    const D = FXD.device({ name: dev.name, vendor: dev.vendor, width: dev.width || 300, height: hgt });
    const tb = FXD.topBar({ fx: 1, pdc: dev.pdc || '0.0 ms', track: dev.track || 'Mix Bus', num: '01', trackColor: '#5aa9f0' });
    liveStage.append(h('p', { class: 'live-blurb', html: dev.blurb || '' }), h('div', { class: 'fx-window' }, tb.el, h('div', { class: 'fx-chain' }, D.el, FXD.addCard({ height: hgt }))));
    const onFrame0 = FXD.onFrame, listen0 = FXD.listen;
    FXD.onFrame = fn => { const off = onFrame0(fn); offs.push(off); return off; };
    FXD.listen = (t, type, fn, opt) => { t.addEventListener(type, fn, opt); offs.push(() => t.removeEventListener(type, fn, opt)); };
    try { clean = dev.build(D.body, { check() {}, device: D }); }
    catch (e) { console.error(e); D.body.append(h('div', { style: { padding: '20px', color: '#9ba1ab' } }, 'This demo failed to load.')); }
    finally { FXD.onFrame = onFrame0; FXD.listen = listen0; }
    if (!FXD.reducedMotion) FXD.setPlaying(true);
    paintPlay();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  $('#live-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', teardown);
  dlg.addEventListener('keydown', e => {
    if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName) && document.activeElement.getAttribute('role') !== 'slider') {
      e.preventDefault(); FXD.setPlaying(!FXD.clock.playing); paintPlay();
    }
  });
})();
