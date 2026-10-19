/* FX Devices marketing page: "The modulators" guide, one short introduction per modulator type with a live scope of
   what it outputs. Every scope is a pure function of the beat, so it draws the same whether the clock runs or not. */
(function () {
  'use strict';
  const { h, s, clamp, lerp } = FXD;
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const smooth = t => t * t * (3 - 2 * t);
  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = m => NOTE[m % 12] + (Math.floor(m / 12) - 1);

  /* ------------------------------------------------------------ made-up input the scopes react to (one 4-beat bar, looping) */
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
  const noteOn = b => { const n = last(NOTES, b); const off = n.at + n.ev[1] - n.ev[0]; return { ...n, t: b - n.at, off, held: b < off }; };
  const held = (v, t) => v * smooth(clamp(t / .03));

  // a curve drawn from points, bent like the LFO editor's lines
  const drawn = pts => p => {
    for (let i = 1; i < pts.length; i++) if (p <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return lerp(y0, y1, smooth((p - x0) / (x1 - x0)));
    }
    return pts[pts.length - 1][1];
  };
  const LFO_SHAPE = drawn([[0, .12], [.22, .92], [.36, .58], [.55, .78], [1, .12]]);
  const STEPS = [.9, .2, .55, .2, .72, .3, 1, .15, .82, .42, .62, .22, .95, .5, .3, .66];

  // a new note starts its attack from wherever the last one's release had got to
  function adsr(b, depth) {
    const n = noteOn(b), A = .1, H = .05, D = .3, S = .5, R = .4, vel = .4 + .6 * n.ev[2];
    const from = depth ? adsr(n.at - 1e-4, depth - 1) : 0;
    const lvl = t => t < A ? lerp(from, vel, Math.pow(t / A, .6)) : vel * (t < A + H ? 1 : S + (1 - S) * Math.pow(1 - clamp((t - A - H) / D), 2));
    if (n.held) return lvl(n.t);
    return lvl(n.off - n.at) * Math.pow(1 - clamp((b - n.off) / R), 2);
  }

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
  const MODS = {
    macro: {
      name: 'Macro', color: C(1), tag: 'A knob you turn or automate',
      text: 'A plain knob that can move as many parameters as you like, each by its own amount and in its own direction. Turn it by hand, or show its automation lane and draw the moves in REAPER. Every track starts with two.',
      ctl: [['Name', 'Rename it to say what it does, like "Brightness" or "Space".'], ['Automation', 'Show or hide its envelope lane in REAPER from the right-click menu.'], ['Scale', 'Set a macro to scale the other modulators on a knob instead of adding to them.']],
      out: b => clamp(.55 + .28 * Math.sin(b * .55) + .1 * Math.sin(b * 1.7 + 1)),
    },
    xy: {
      name: 'XY', color: C(8), tag: 'Two values from one pad',
      text: 'Drag a dot around a pad to move two things at once, one on each axis. Sweep a filter\'s cutoff and resonance together, or blend two effects with one hand. A fading trail shows where you have been.',
      ctl: [['Assign X', 'Right-click the pad, then right-drag a knob.'], ['Assign Y', 'Double right-click the pad, then right-drag a knob.'], ['X and Y fields', 'Type or drag an exact value for each axis.']],
      out: b => clamp(.5 + .38 * Math.sin(b * .8)), out2: b => clamp(.5 + .32 * Math.sin(b * 1.25 + 1.4)),
      read: b => '<b>X</b> ' + Math.round(MODS.xy.out(b) * 127) + ' · <b class="y">Y</b> ' + Math.round(MODS.xy.out2(b) * 127),
    },
    lfo: {
      name: 'LFO', color: C(2), tag: 'Loops a shape you draw',
      text: 'Draw any shape and it loops in time with the song. It follows the playhead rather than a free-running clock, so it stays in phase when you jump around, loop a section or change the tempo.',
      ctl: [['Shape', 'Double-click to add a point, Alt-click to delete one, drag a line to bend it.'], ['Rate', 'From 2 bars down to 1/128, even, triplet or dotted. Or run it free, from 10 ms to 20 s.'], ['Length and phase', 'Stretch one cycle over up to 8 steps, and offset it so two LFOs move apart.'], ['Retrigger', 'Restart the shape on every note instead of following the playhead.'], ['Shape library', 'Save shapes for every project, for this project, or for this track. Hover one to preview it.']],
      out: b => LFO_SHAPE((b / 2) % 1), img: 'lfo-editor',
    },
    step: {
      name: 'Step', color: C(7), tag: 'A step sequencer',
      text: 'Up to 64 steps locked to the beat. Drag across the steps to draw a pattern and right-drag to clear them. Add glide and it slides from one step to the next instead of jumping.',
      ctl: [['Length', '2 to 64 steps, with buttons to halve or double it.'], ['Rate', 'From 2 bars per step down to 1/64.'], ['Glide', 'From off up to a whole step.'], ['Pattern tools', 'Random, invert, shift left or right, ramp, reverse and clear.']],
      out: b => {
        const x = (b * 4) % 16, i = Math.floor(x), f = x - i, v = STEPS[i], p = STEPS[(i + 15) % 16];
        return f < .18 ? lerp(p, v, smooth(f / .18)) : v;
      },
    },
    random: {
      name: 'Random', color: C(6), tag: 'New random values over time',
      text: 'Picks a new value on a timer, either free in milliseconds or locked to the grid. Smooth it out for a slow drift, or keep it sharp for classic sample and hold.',
      ctl: [['Timing', 'Free from 1 to 500 ms, or synced from 1/64 up to a bar.'], ['Smooth', 'Glide to each new value over 3 ms up to 1.5 s.'], ['Chance', 'How likely it is to pick a new value each time, so it can skip a beat.']],
      out: b => {
        const k = Math.floor(b * 2), pick = n => { while (hash(n + 50) > .75 && n > k - 6) n--; return hash(n); };
        return lerp(pick(k - 1), pick(k), smooth(clamp((b * 2 - k) / .45)));
      },
    },
    envelope: {
      name: 'Envelope', color: C(3), tag: 'Plays a shape you draw, once per note',
      text: 'The same drawing tools and shape library as the LFO, but the shape plays once each time a note starts. Use it for a pluck on a filter, a swell on a reverb, or a pitch drop on a kick.',
      ctl: [['Shape', 'Draw it point by point, or pick one from the envelope shape library.'], ['Notes', 'Only react to a range of keys.'], ['Legato', 'Only the first note of a phrase restarts it.'], ['Velocity', 'Make softer notes play a smaller shape.'], ['Release', 'Latch plays the whole shape. Jump and Glide hold until you let go, then move to the release point.']],
      notes: true,
      out: b => {
        const n = noteOn(b), u = n.t / .9;
        if (u > 1) return 0;
        const v = u < .05 ? u / .05 : Math.exp(-4 * (u - .05)) * Math.pow(1 - u, .35);
        return v * (.35 + .65 * n.ev[2]);
      },
    },
    adsr: {
      name: 'ADSR', color: C(4), tag: 'Attack, hold, decay, sustain, release',
      text: 'The classic synth envelope, started by each note and released when you let go. Drag the points on the graph to set the times, and drag a segment to bend its curve.',
      ctl: [['Attack and decay', '1 ms to 2 s each.'], ['Hold', 'Stay at the top for up to 2 s before decaying.'], ['Sustain', 'The level it holds while the note is down.'], ['Release', '1 ms to 2 s after the note ends.'], ['Velocity', 'Make softer notes reach a lower peak.']],
      notes: true,
      out: b => adsr(b, 1),
    },
    follower: {
      name: 'Follower', color: C(5), tag: 'Follows the audio level',
      text: 'Turns how loud the track is into movement. Open a filter as the drums get louder, or listen to a sidechain and duck a pad under the vocal. Add a filter and it only follows one part of the sound.',
      ctl: [['Attack', '0.1 to 500 ms.'], ['Release', '1 to 2000 ms.'], ['Gain', 'Up to 400%, for quiet sources.'], ['Input', 'The track itself on 1/2, or a sidechain on 3/4.'], ['Filter', 'Low, band or high pass, from 20 Hz to 20 kHz.']],
      audio: true,
      out: b => clamp(recent(HITS, b).reduce((a, [t, [, v]]) => a + v * (1 - Math.exp(-t / .04)) * Math.exp(-t * 2.4), 0) * .95),
    },
    transient: {
      name: 'Transient', color: C(9), tag: 'Fires an envelope on hits in the audio',
      text: 'Listens for hits and fires a short attack and decay on each one, so a kick can pump a compressor or every snare can throw up a delay. Quieter hits below the sensitivity are ignored, and the tile flashes on each one it catches.',
      ctl: [['Sensitivity', 'How hard a hit has to be to fire it.'], ['Attack', '0.1 to 200 ms.'], ['Decay', '10 ms to 3 s.'], ['Input', 'The track itself, or a sidechain.'], ['Filter', 'React to just the kick, or just the snare.']],
      audio: true,
      out: b => clamp(recent(HITS, b).filter(([, [, v]]) => v > .45).reduce((a, [t]) => Math.max(a, t < .025 ? t / .025 : Math.exp(-(t - .025) * 5.5)), 0)),
    },
    pitch: {
      name: 'Pitch', color: C(11), tag: 'Follows the pitch of the audio',
      text: 'Hears the note being sung or played and turns it into a value between the lowest and highest note you set. Made for one note at a time, like a vocal, a bass or a lead. Between notes it holds the last pitch.',
      ctl: [['Range', 'Lowest and highest note, anywhere from C0 to C8.'], ['Smooth', 'Up to 500 ms, so it glides instead of jumping.'], ['Input', 'The track itself, or a sidechain.'], ['Filter', 'Keep other sounds out of the way.']],
      out: b => {
        const n = last(MELODY, b), map = m => (m - 50) / 20;
        return lerp(map(n.prev[1]), map(n.ev[1]), 1 - Math.exp(-(b - n.at) * 16));
      },
      raw: b => (last(MELODY, b).ev[1] - 50) / 20,
      read: b => noteName(last(MELODY, b).ev[1]),
    },
    velocity: {
      name: 'Velocity', color: M.Velocity, tag: 'How hard each note is played', midi: true,
      text: 'Each note\'s velocity becomes a value, so harder hits can open a filter or add drive. Draw a response curve to choose how it reacts.',
      ctl: [['Response curve', 'Input left to right, output up. Draw any curve.'], ['Notes from', 'Notes played into the track, or from an FX Devices note device.']],
      notes: true, out: b => { const n = noteOn(b); return held(Math.pow(n.ev[2], .8), n.t); },
    },
    'midi-random': {
      name: 'Random', color: M.Random, tag: 'A new value on every note', midi: true,
      text: 'Rolls a fresh value each time a note starts, so no two hits sound quite the same. Use up to three, each with its own response curve.',
      ctl: [['Response curve', 'Shape the spread of values it picks.'], ['Notes from', 'Notes played into the track, or from an FX Devices note device.']],
      notes: true, out: b => { const n = noteOn(b); return held(.1 + .85 * hash(n.idx * 3.7 + 9), n.t); },
    },
    keytrack: {
      name: 'KeyTrack', color: M.KeyTrack, tag: 'Follows the key you play', midi: true,
      text: 'Turns the note number into a value, so higher notes can be brighter, or a filter can follow the melody. Use up to three, each with its own response curve.',
      ctl: [['Response curve', 'Choose which part of the keyboard moves it, and how much.'], ['Notes from', 'Notes played into the track, or from an FX Devices note device.']],
      notes: true, out: b => { const n = noteOn(b); return held((n.ev[3] - 36) / 36, n.t); },
      read: b => noteName(noteOn(b).ev[3]),
    },
    cc: {
      name: 'CC', color: M.CC, tag: 'Any knob on your controller', midi: true,
      text: 'Use the mod wheel, an expression pedal or any knob or fader on a MIDI controller. Type the CC number, or press Learn and move the control.',
      ctl: [['CC number', 'Type it in, or press Learn and move the control.'], ['Recent CCs', 'The tile lists the controllers it has seen lately, so you can pick one.'], ['Response curve', 'Bend how the controller maps onto the knob.']],
      out: b => Math.round(clamp(.45 + .32 * Math.sin(b * .9) + .14 * Math.sin(b * 2.3 + 1)) * 127) / 127,
      read: b => 'CC 1 · ' + Math.round(MODS.cc.out(b) * 127),
    },
  };
  const ORDER = GROUPS.flatMap(g => g.mods);

  /* ------------------------------------------------------------ the scope */
  const W = 600, HT = 150, SPAN = 4, N = 240;
  const yOf = v => (HT - 10 - v * (HT - 24)).toFixed(1);
  function path(f, b0) {
    let d = '';
    for (let i = 0; i <= N; i++) d += (i ? 'L' : 'M') + (i / N * W).toFixed(1) + ' ' + yOf(f(b0 + i / N * SPAN));
    return d;
  }
  function scope() {
    const grid = s('g', { class: 'mg-grid' });
    for (let i = 1; i < SPAN; i++) grid.append(s('line', { x1: i / SPAN * W, x2: i / SPAN * W, y1: 0, y2: HT }));
    const input = s('path', { class: 'mg-in' }), notes = s('g', { class: 'mg-notes' }), raw = s('path', { class: 'mg-raw' });
    const fill = s('path', { class: 'mg-fill' }), line = s('path', { class: 'mg-line' }), line2 = s('path', { class: 'mg-line2' });
    const svg = s('svg', { viewBox: `0 0 ${W} ${HT}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' }, grid, input, notes, raw, fill, line2, line);
    const dot = h('i', { class: 'mg-dot' }), dot2 = h('i', { class: 'mg-dot mg-dot2' }), read = h('span', { class: 'mg-read' });
    const el = h('div', { class: 'mg-scope' }, svg, dot, dot2, read);
    let m = null;
    function draw() {
      if (!m || !el.isConnected) return;
      const b = FXD.clock.beat, b0 = b - SPAN;
      const d = path(m.out, b0);
      line.setAttribute('d', d);
      fill.setAttribute('d', d + `L${W} ${HT}L0 ${HT}Z`);
      line2.setAttribute('d', m.out2 ? path(m.out2, b0) : '');
      raw.setAttribute('d', m.raw ? path(m.raw, b0) : '');
      if (m.audio) {
        let top = '', bot = '';
        for (let i = 0; i <= N; i++) {
          const x = (i / N * W).toFixed(1), bb = b0 + i / N * SPAN, a = audioIn(bb) * (.55 + .45 * Math.abs(Math.sin(bb * 173))) * (HT / 2 - 8);
          top += (i ? 'L' : 'M') + x + ' ' + (HT / 2 - a).toFixed(1); bot = 'L' + x + ' ' + (HT / 2 + a).toFixed(1) + bot;
        }
        input.setAttribute('d', top + bot + 'Z');
      } else input.setAttribute('d', '');
      notes.replaceChildren();
      if (m.notes) for (let k = Math.floor(b0 / 4); k <= Math.floor(b / 4); k++) for (const [on, off, vel] of NOTES) {
        const x0 = (k * 4 + on - b0) / SPAN * W, x1 = (k * 4 + off - b0) / SPAN * W;
        if (x1 < 0 || x0 > W) continue;
        notes.append(s('rect', { x: x0.toFixed(1), y: HT - 6, width: Math.max(2, x1 - x0).toFixed(1), height: 4, opacity: (.35 + .65 * vel).toFixed(2) }));
      }
      const v = m.out(b);
      dot.style.top = (yOf(v) / HT * 100) + '%';
      dot2.hidden = !m.out2;
      if (m.out2) dot2.style.top = (yOf(m.out2(b)) / HT * 100) + '%';
      read.innerHTML = m.read ? m.read(b) : Math.round(v * 100) + '%';
    }
    return { el, draw, set(mod) { m = mod; el.style.setProperty('--c', mod.color); draw(); } };
  }

  /* ------------------------------------------------------------ the guide */
  FXD.modGuide = function (host, { fillShot } = {}) {
    const sc = scope();
    const btns = {};
    const nav = h('nav', { class: 'mg-nav', 'aria-label': 'Modulator types' },
      GROUPS.map(g => h('div', { class: 'mg-group' }, h('p', null, g.name), g.mods.map(k => {
        const m = MODS[k];
        return (btns[k] = h('button', { class: 'mg-pick', type: 'button', 'aria-pressed': 'false', style: '--c:' + m.color, onclick: () => select(k) }, h('i'), m.name, m.midi ? h('small', null, 'MIDI') : null));
      }))));
    const kick = h('p', { class: 'mg-kick' }), name = h('h3', { class: 'mg-name' }), tag = h('p', { class: 'mg-tag' }), text = h('p', { class: 'mg-text' });
    const ctl = h('dl', { class: 'mg-ctl' }), extra = h('div', { class: 'mg-extra' });
    const body = h('div', { class: 'mg-body', 'aria-live': 'polite' }, h('div', { class: 'mg-top' }, h('div', null, kick, name, tag), h('p', { class: 'mg-hint' }, 'Live output')), sc.el, text, ctl, extra);
    host.replaceChildren(h('div', { class: 'mg' }, nav, body));
    let cur = null;
    function select(k) {
      if (!MODS[k]) return;
      if (cur) btns[cur].setAttribute('aria-pressed', 'false');
      cur = k;
      const m = MODS[k];
      btns[k].setAttribute('aria-pressed', 'true');
      kick.textContent = GROUPS.find(g => g.mods.includes(k)).name;
      name.textContent = m.name;
      tag.textContent = m.tag;
      text.textContent = m.text;
      ctl.replaceChildren(...m.ctl.flatMap(([a, b]) => [h('dt', null, a), h('dd', null, b)]));
      extra.replaceChildren();
      if (m.img && fillShot) {
        const shot = h('div', { class: 'shot' });
        extra.append(h('p', { class: 'mg-sub' }, 'The shape editor'), h('div', { class: 'frame' }, shot));
        fillShot(shot, m.img, 'The LFO shape editor in FX Devices', { contain: true });
      }
      body.style.setProperty('--c', m.color);
      sc.set(m);
    }
    const off = FXD.onFrame(sc.draw);
    select('lfo');
    return { select, off };
  };
  FXD.modGuide.order = ORDER;
  FXD.modGuide.mods = MODS;
})();
