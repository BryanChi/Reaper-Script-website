/* FX Devices marketing page: "The modulators", a card per modulator type with an icon and a line or two on what it does.
   The less obvious ones get a small live picture. Every picture is a pure function of the beat, so it draws the same
   whether the clock runs or not. */
(function () {
  'use strict';
  const { h, s, clamp, lerp } = FXD;
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const smooth = t => t * t * (3 - 2 * t);
  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = m => NOTE[m % 12] + (Math.floor(m / 12) - 1);

  /* ------------------------------------------------------------ made-up input the pictures react to (one 4-beat bar, looping) */
  // played notes: [on, off, velocity, key]
  const NOTES = [[0, .6, .95, 48], [1, 1.35, .55, 55], [1.5, 1.85, .75, 60], [2.5, 3.6, 1, 52], [3.5, 3.8, .4, 64]];
  // drum hits for the audio modulators: [beat, level]
  const HITS = [[0, 1], [.5, .3], [1, .8], [1.5, .28], [1.75, .5], [2, .95], [2.5, .32], [3, .82], [3.5, .3]];
  // a sung line for Pitch: [beat, midi]
  const MELODY = [[0, 57], [.75, 60], [1.5, 67], [2, 64], [2.75, 62], [3.25, 53]];

  // the latest event at or before beat b, from a list that loops every 4 beats
  function last(list, b) {
    const bar = Math.floor(b / 4);
    for (let k = bar; k >= bar - 1; k--) for (let i = list.length - 1; i >= 0; i--) {
      const at = k * 4 + list[i][0];
      if (at <= b) return { at, ev: list[i], idx: k * list.length + i, prev: list[(i - 1 + list.length) % list.length] };
    }
    return { at: b, ev: list[0], idx: 0, prev: list[0] };
  }
  // every event in the last few beats, for things that ring on
  function recent(list, b, span = 3) {
    const out = [], bar = Math.floor(b / 4);
    for (let k = bar - 1; k <= bar; k++) for (const ev of list) { const at = k * 4 + ev[0]; if (at <= b && b - at < span) out.push([b - at, ev]); }
    return out;
  }
  const audioIn = b => clamp(recent(HITS, b).reduce((a, [t, [, v]]) => a + v * Math.exp(-t * 10), 0));
  const noteOn = b => { const n = last(NOTES, b); return { ...n, t: b - n.at }; };
  const held = (v, t) => v * smooth(clamp(t / .03));

  /* ------------------------------------------------------------ icons: 24px line drawings in the modulator's colour */
  const ICON = {
    macro: '<circle cx="12" cy="13" r="7"/><path d="M12 13 15.5 8.5"/><path d="M4.5 19.5l1.4-1.4M19.5 19.5l-1.4-1.4"/>',
    xy: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M12 3.5v17M3.5 12h17" opacity=".35"/><path d="M6 17c3-1 4-6 9-8" stroke-dasharray="1.5 2"/><circle cx="15.5" cy="8.7" r="2" fill="currentColor"/>',
    lfo: '<path d="M2.5 12c2.4-8 4.8-8 7.2 0s4.8 8 7.2 0 3.6-6 4.6-4"/>',
    step: '<path d="M3 19V9h4v10M7 19v-6h4v6M11 19V5h4v14M15 19v-9h4v9M2.5 19h19"/>',
    random: '<path d="M2.5 15h3.5V7h3.5v10h3.5V5h3.5v8h4.5"/>',
    envelope: '<path d="M2.5 19h2l2-14c1 6 3 10.5 7 12.5 2 1 4 1.5 8 1.5"/>',
    adsr: '<path d="M2.5 19 7 5l3 6h7l4 8"/><circle cx="7" cy="5" r="1.4" fill="currentColor"/><circle cx="10" cy="11" r="1.4" fill="currentColor"/><circle cx="17" cy="11" r="1.4" fill="currentColor"/>',
    follower: '<path d="M3 12v0M5 9.5v5M7 6.5v11M9 9v6M11 11v2M13 8v8M15 5v14M17 9v6M19 11v2M21 12v0" opacity=".45"/><path d="M3 11c2-1 3-5 4-5s2 3 4 4 2-4 4-5 3 4 6 6"/>',
    transient: '<path d="M13.5 2.5 6 13.5h5.5l-1.5 8 8-11.5h-5.5z"/>',
    pitch: '<path d="M9 17.5V5l9-2v12"/><circle cx="6.8" cy="17.5" r="2.4"/><circle cx="15.8" cy="15" r="2.4"/><path d="M20.5 9l1.5-2 1.5 2" transform="translate(-2 -4)"/>',
    velocity: '<path d="M5 3.5h6v17H5z"/><path d="M17 4v11M14 12l3 3.5 3-3.5"/><path d="M14.5 20.5h5"/>',
    'midi-random': '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor"/>',
    keytrack: '<path d="M2.5 13.5h19v7h-19zM7.25 13.5v7M12 13.5v7M16.75 13.5v7"/><path d="M3 10.5 21 3.5"/><circle cx="21" cy="3.5" r="1.3" fill="currentColor"/>',
    cc: '<path d="M7 3.5v17M17 3.5v17"/><rect x="4" y="12" width="6" height="4" rx="1" fill="currentColor"/><rect x="14" y="6" width="6" height="4" rx="1" fill="currentColor"/>',
  };
  const icon = k => { const e = s('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' }); e.innerHTML = ICON[k]; return e; };

  /* ------------------------------------------------------------ the modulators */
  const C = i => FXD.modBright(i);
  const M = FXD.MIDI_CLR;
  const GROUPS = [
    { name: 'Hands on', mods: ['macro', 'xy'] },
    { name: 'Over time', mods: ['lfo', 'step', 'random'] },
    { name: 'Every note', mods: ['envelope', 'adsr'] },
    { name: 'From the audio', mods: ['follower', 'transient', 'pitch'] },
    { name: 'From MIDI', mods: ['velocity', 'midi-random', 'keytrack', 'cc'] },
  ];
  // pic: a small live picture for the ones that aren't obvious from the name
  const MODS = {
    macro: { name: 'Macro', color: C(1), text: 'A knob you turn or automate. Point it at as many parameters as you like, each with its own amount.' },
    xy: { name: 'XY', color: C(8), pic: 'pad', text: 'Drag a dot around a pad to move two things at once, one on each axis.',
      x: b => clamp(.5 + .36 * Math.sin(b * 1.1)), y: b => clamp(.5 + .32 * Math.sin(b * 1.7 + 1.4)) },
    lfo: { name: 'LFO', color: C(2), text: 'Loops a shape you draw, locked to the song so it stays in phase when you jump around.',
      editor: ['editor-lfo', 1550, 948, 'Draw the shape point by point, set the rate and cycle, and keep favourites in the shape library.'] },
    step: { name: 'Step', color: C(7), text: 'A step sequencer of up to 64 steps. Drag across them to draw a pattern, with glide if you want it smooth.' },
    random: { name: 'Random', color: C(6), text: 'New random values over time, free or synced to the grid. Smooth it into a drift or keep it as sample and hold.' },
    envelope: { name: 'Envelope', color: C(3), text: 'Plays a shape you draw once per note, with the same drawing tools and library as the LFO.' },
    adsr: { name: 'ADSR', color: C(4), text: 'The classic attack, hold, decay, sustain and release, started by each note. Drag the points to set it.' },
    follower: { name: 'Follower', color: C(5), pic: 'audio', text: 'Follows how loud the audio is. Listen to the track or a sidechain, and filter it to follow just the lows or highs.',
      out: b => clamp(recent(HITS, b).reduce((a, [t, [, v]]) => a + v * (1 - Math.exp(-t / .04)) * Math.exp(-t * 2.4), 0) * .95) },
    transient: { name: 'Transient', color: C(9), pic: 'audio', text: 'Fires a short envelope on every hit in the audio and ignores the quiet bits. Make a kick pump anything.',
      out: b => clamp(recent(HITS, b).filter(([, [, v]]) => v > .45).reduce((a, [t]) => Math.max(a, t < .025 ? t / .025 : Math.exp(-(t - .025) * 5.5)), 0)) },
    pitch: { name: 'Pitch', color: C(11), pic: 'line', text: 'Hears the note being sung or played and turns it into a value between a lowest and highest note.',
      out: b => { const n = last(MELODY, b), map = m => (m - 50) / 20; return lerp(map(n.prev[1]), map(n.ev[1]), 1 - Math.exp(-(b - n.at) * 16)); },
      read: b => noteName(last(MELODY, b).ev[1]) },
    velocity: { name: 'Velocity', color: M.Velocity, midi: true, text: 'How hard each note is played, through a response curve you draw.' },
    'midi-random': { name: 'Random', color: M.Random, midi: true, pic: 'notes', text: 'A new random value each time a note starts, so no two hits sound quite the same.',
      out: b => { const n = noteOn(b); return held(.1 + .85 * hash(n.idx * 3.7 + 9), n.t); } },
    keytrack: { name: 'KeyTrack', color: M.KeyTrack, midi: true, pic: 'notes', text: 'Turns which key you play into a value, so higher notes can be brighter.',
      out: b => { const n = noteOn(b); return held((n.ev[3] - 36) / 36, n.t); }, read: b => noteName(noteOn(b).ev[3]) },
    cc: { name: 'CC', color: M.CC, midi: true, text: 'The mod wheel, a pedal or any knob on your MIDI controller. Press Learn and move it.' },
  };

  /* ------------------------------------------------------------ live pictures */
  const W = 400, HT = 90, SPAN = 4, N = 160;
  const yOf = v => HT - 8 - v * (HT - 18);
  function path(f, b0) {
    let d = '';
    for (let i = 0; i <= N; i++) d += (i ? 'L' : 'M') + (i / N * W).toFixed(1) + ' ' + yOf(f(b0 + i / N * SPAN)).toFixed(1);
    return d;
  }
  // a scrolling line of what the modulator outputs, over what it listens to
  function scope(m) {
    const input = s('path', { class: 'mc-in' }), notes = s('g', { class: 'mc-notes' }), fill = s('path', { class: 'mc-fill' }), line = s('path', { class: 'mc-line' });
    const svg = s('svg', { viewBox: `0 0 ${W} ${HT}`, preserveAspectRatio: 'none' }, input, notes, fill, line);
    const dot = h('i', { class: 'mc-dot' }), read = m.read ? h('span', { class: 'mc-read' }) : null;
    const el = h('div', { class: 'mc-pic', 'aria-hidden': 'true' }, svg, dot, read);
    const draw = () => {
      const b = FXD.clock.beat, b0 = b - SPAN, d = path(m.out, b0);
      line.setAttribute('d', d);
      fill.setAttribute('d', d + `L${W} ${HT}L0 ${HT}Z`);
      if (m.pic === 'audio') {
        let top = '', bot = '';
        for (let i = 0; i <= N; i++) {
          const x = (i / N * W).toFixed(1), bb = b0 + i / N * SPAN, a = audioIn(bb) * (.55 + .45 * Math.abs(Math.sin(bb * 173))) * (HT / 2 - 6);
          top += (i ? 'L' : 'M') + x + ' ' + (HT / 2 - a).toFixed(1); bot = 'L' + x + ' ' + (HT / 2 + a).toFixed(1) + bot;
        }
        input.setAttribute('d', top + bot + 'Z');
      }
      if (m.pic === 'line') input.setAttribute('d', path(bb => (last(MELODY, bb).ev[1] - 50) / 20, b0));
      if (m.pic === 'notes') {
        notes.replaceChildren();
        for (let k = Math.floor(b0 / 4); k <= Math.floor(b / 4); k++) for (const [on, off] of NOTES) {
          const x0 = (k * 4 + on - b0) / SPAN * W, x1 = (k * 4 + off - b0) / SPAN * W;
          if (x1 > 0 && x0 < W) notes.append(s('rect', { x: x0.toFixed(1), y: HT - 4, width: Math.max(2, x1 - x0).toFixed(1), height: 3 }));
        }
      }
      dot.style.top = (yOf(m.out(b)) / HT * 100) + '%';
      if (read) read.textContent = m.read(b);
    };
    return { el, draw };
  }
  // XY: the dot moving round the pad, with a fading trail
  function pad(m) {
    const trail = s('g', { class: 'mc-trail' }), dot = s('circle', { r: 5, class: 'mc-pdot' });
    const hx = s('line', { class: 'mc-cross', y1: 0, y2: 100 }), hy = s('line', { class: 'mc-cross', x1: 0, x2: 100 });
    const svg = s('svg', { viewBox: '0 0 100 100' }, hx, hy, trail, dot);
    const el = h('div', { class: 'mc-pic mc-pad', 'aria-hidden': 'true' }, svg);
    const draw = () => {
      const b = FXD.clock.beat, X = t => 6 + m.x(t) * 88, Y = t => 94 - m.y(t) * 88;
      trail.replaceChildren();
      for (let i = 24; i > 0; i--) { const t0 = b - i * .06, t1 = t0 + .06; trail.append(s('line', { x1: X(t0), y1: Y(t0), x2: X(t1), y2: Y(t1), 'stroke-opacity': (1 - i / 24) * .8 })); }
      const x = X(b), y = Y(b);
      dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      hx.setAttribute('x1', x); hx.setAttribute('x2', x); hy.setAttribute('y1', y); hy.setAttribute('y2', y);
    };
    return { el, draw };
  }

  /* ------------------------------------------------------------ the cards */
  FXD.modGuide = function (host, { fillShot } = {}) {
    const cards = {}, pics = [];
    const groups = GROUPS.map(g => h('section', { class: 'mc-group' }, h('p', { class: 'mc-gname' }, g.name), h('div', { class: 'mc-grid' }, g.mods.map(k => {
      const m = MODS[k];
      const pic = m.pic ? (m.pic === 'pad' ? pad(m) : scope(m)) : null;
      if (pic) pics.push(pic);
      return (cards[k] = h('article', { class: 'mc' + (pic ? ' has-pic' : ''), id: 'mod-' + k, style: '--c:' + m.color },
        h('div', { class: 'mc-head' }, h('span', { class: 'mc-icon' }, icon(k)), h('h4', null, m.name), m.midi ? h('small', null, 'MIDI') : null),
        h('p', null, m.text), pic && pic.el, m.editor ? h('span', { class: 'mc-open' }, 'See its editor ↗') : null));
    }))));
    host.replaceChildren(h('div', { class: 'mcs' }, groups));
    // cards with a screenshot of their editor open it in a dialog
    const dlg = document.getElementById('mc-dlg');
    if (dlg) dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    for (const [k, c] of Object.entries(cards)) {
      const m = MODS[k];
      if (!m.editor || !dlg) continue;
      const [img, w, hh, cap] = m.editor;
      const open = () => {
        dlg.querySelector('h3').textContent = m.name + ' editor';
        dlg.querySelector('.live-hint').textContent = cap;
        dlg.querySelector('.mc-dlg-body').replaceChildren(h('img', { src: '/fx-devices/img/' + img + '.webp', width: w, height: hh, alt: 'The ' + m.name + ' editor in FX Devices' }));
        if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      };
      c.classList.add('can-open');
      c.setAttribute('role', 'button'); c.tabIndex = 0;
      c.setAttribute('aria-label', 'Open the ' + m.name + ' editor');
      c.addEventListener('click', open);
      c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }
    FXD.onFrame(() => { if (host.isConnected) pics.forEach(p => p.draw()); });
    pics.forEach(p => p.draw());
    // bring a card into view and make it glow for a moment
    function select(k) {
      const c = cards[k];
      if (!c) return;
      c.scrollIntoView({ behavior: FXD.reducedMotion ? 'auto' : 'smooth', block: 'center' });
      c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash');
    }
    return { select };
  };
  FXD.modGuide.mods = MODS;
})();
