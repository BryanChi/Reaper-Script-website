/* FX Devices marketing page: "The mod square", the small square in the corner of a modulated control.
   Same rules as ModVis.Mod_Square in FX Devices: one nested layer per modulator, the one used last on the outside;
   hover or click unfolds them into a row you can drag, click and right-click. */
(function () {
  'use strict';
  const { h, s, clamp, lerp } = FXD;
  const SQ = { OUT: 10, STEP: 2, ITEM: 14, GAP: 4, K: 16, STAG: 0.016, OPEN_DELAY: 0.12, CLOSE_DELAY: 0.3 };
  const MIX = [{ chip: '+', name: 'Add' }, { chip: '×', name: 'Scale' }, { chip: 'min', name: 'Min' }, { chip: 'max', name: 'Max' }];
  const CONT_CLR = '#c9ced6';
  const beat = () => FXD.clock.beat;
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // the made-up modulators driving the demo knobs
  const SRC = {
    lfo: { name: 'LFO 1', color: FXD.modBright(1), out: () => 0.5 + 0.5 * Math.sin(beat() / 2 * Math.PI) },
    env: { name: 'Envelope 2', color: FXD.modBright(3), out: () => Math.exp(-4.5 * (beat() % 1)) },
    rnd: { name: 'Random 3', color: FXD.modBright(6), out: () => { const b = beat() / 2, k = Math.floor(b); return lerp(hash(k - 1), hash(k), Math.min(1, (b - k) * 5)); } },
    vel: { name: 'Velocity', color: FXD.MIDI_CLR.Velocity, out: () => [0.95, 0.55, 0.75, 0.4][Math.floor(beat()) % 4] },
    mac: { name: 'Container Macro 1', color: CONT_CLR, kind: 'cont', out: () => 0.62 },
  };
  const START = [
    { label: 'Decay Rate', value: 0.42, fmt: v => (0.25 + v * 7.75).toFixed(2) + ' s', mods: [['lfo', 0.32], ['env', 0.5, { op: 1 }], ['vel', 0.22]] },
    { label: 'Brightness', value: 0.55, fmt: v => Math.round(-100 + v * 200) + '%', mods: [['rnd', 0.26, { bip: true }], ['mac', -0.3]] },
    { label: 'Mix', value: 0.35, fmt: v => Math.round(v * 100) + '%', mods: [['lfo', 0.4, { muted: true }]] },
  ];

  // FX Devices' Ctrl is Cmd on a Mac (ReaImGui)
  const CTRL = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? 'Cmd' : 'Ctrl';
  const shape = (x, bend) => (bend > 0 ? Math.pow(x, 1 + bend) : bend < 0 ? 1 - Math.pow(1 - x, 1 - bend) : x);

  FXD.modSquare = function (host) {
    const knobs = [];
    const stage = h('div', { class: 'msq-chain' });
    const tip = h('div', { class: 'msq-tip', 'aria-hidden': 'true' });
    const graph = s('svg', { class: 'msq-graph', viewBox: '0 0 84 54', 'aria-hidden': 'true' });
    const say = h('div', { class: 'msq-say', 'aria-live': 'polite' });
    const reset = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Reset the demo');
    const win = h('div', { class: 'msq-win fx' }, stage, tip, graph, say);
    let sayT = 0;
    const tell = t => { say.textContent = t; say.classList.add('show'); clearTimeout(sayT); sayT = setTimeout(() => say.classList.remove('show'), 1800); };
    const mods = { ctrl: false, shift: false, alt: false };
    const keys = e => { mods.ctrl = e.ctrlKey || e.metaKey; mods.shift = e.shiftKey; mods.alt = e.altKey; };
    FXD.listen(window, 'keydown', keys); FXD.listen(window, 'keyup', keys);
    FXD.listen(window, 'blur', () => { mods.ctrl = mods.shift = mods.alt = false; });

    function build() {
      knobs.length = 0;
      stage.replaceChildren();
      const els = START.map(def => {
        const C = { links: def.mods.map(([k, amt, o = {}]) => ({ id: k, src: SRC[k], amt, op: o.op || 0, bip: !!o.bip, muted: !!o.muted, bend: 0 })) };
        C.K = FXD.knob({ label: def.label, value: def.value, r: 22, fmt: def.fmt, modRings: 3, live: base => liveOf(C, base) });
        C.sq = square(C);
        C.K.el.classList.add('msq-k');
        C.K.el.append(C.sq.el);
        paint(C);
        knobs.push(C);
        return C.K.el;
      });
      const D = FXD.device({ name: 'Pro-R 2', vendor: 'FabFilter', width: 318, height: 168, body: h('div', { class: 'msq-knobs' }, els) });
      stage.append(D.el);
    }

    // the knob's live value, with the mix modes FX Devices runs: Add, Scale (sets the others' depth), Min, Max
    function liveOf(C, base) {
      const live = C.links.filter(l => !l.muted && l.amt !== 0);
      const outOf = l => shape(l.src.out(), l.bend);
      let add = 0;
      for (const l of live) if (l.op === 0) add += l.amt * (l.bip ? outOf(l) * 2 - 1 : outOf(l));
      for (const l of live) if (l.op === 1) add *= l.amt > 0 ? lerp(1, outOf(l), l.amt) : lerp(1, 1 - outOf(l), -l.amt);
      let v = clamp(base + add);
      for (const l of live) if (l.op === 2) v = Math.min(v, clamp(base + l.amt * outOf(l)));
      for (const l of live) if (l.op === 3) v = Math.max(v, clamp(base + l.amt * outOf(l)));
      return v;
    }
    // rings on the knob; the hovered square's ring stands out
    function paint(C) {
      const hot = C.sq && C.sq.hot;
      C.K.setMods(C.links.map(l => ({ color: hot && hot !== l ? FXD.alpha(l.src.color, 0.25) : l.src.color, amt: l.op === 1 ? 0 : l.amt, bipolar: l.bip, muted: l.muted, out: () => shape(l.src.out(), l.bend) })));
    }

    /* ------------------------------------------------ one square */
    function square(C) {
      const el = h('div', { class: 'msq', role: 'group', 'aria-label': 'Modulation square: ' + C.links.length + ' modulators' });
      const S = { open: false, hov: 0, away: 0, t0: 0, order: C.links.slice(), row: new Map(), q: new Map(), last: null, drag: null, hot: null, edit: null };
      const items = new Map();
      function itemOf(l) {
        if (items.has(l)) return items.get(l);
        const glyph = s('path', { class: 'msq-glyph' });
        const svg = s('svg', { viewBox: '0 0 14 14', 'aria-hidden': 'true' }, glyph);
        const it = { l, box: h('div', { class: 'msq-i' }, svg), glyph };
        el.append(it.box);
        hook(it);
        items.set(l, it);
        return it;
      }
      // drag up / down = amount, left / right = curve; clicks with keys change the mix, mute, remove
      function hook(it) {
        const l = it.l, b = it.box;
        b.addEventListener('pointerenter', () => { if (S.open) { S.hot = l; S.last = l; paint(C); } });
        b.addEventListener('pointerleave', () => { if (S.hot === l && !S.drag) { S.hot = null; paint(C); } });
        b.addEventListener('pointerdown', e => {
          if (!S.open || e.button !== 0) return;
          e.preventDefault(); e.stopPropagation();
          keys(e);
          b.setPointerCapture(e.pointerId);
          S.drag = { l, id: e.pointerId, x: e.clientX, y: e.clientY, ly: e.clientY, axis: null, bip: mods.ctrl && l.op !== 1 && l.src.kind !== 'cont', b0: l.bend };
          S.hot = l; S.last = l;
        });
        b.addEventListener('pointermove', e => {
          const D = S.drag;
          if (!D || D.id !== e.pointerId) return;
          if (!D.axis && (Math.abs(e.clientX - D.x) > 3 || Math.abs(e.clientY - D.y) > 3)) {
            D.axis = Math.abs(e.clientY - D.y) >= Math.abs(e.clientX - D.x) ? 'amt' : 'curve';
            if (D.axis === 'amt' && l.src.kind !== 'cont') { if (D.bip && !l.bip) l.amt = Math.abs(l.amt); l.bip = D.bip; }
            if (D.axis === 'curve' && l.src.kind === 'cont') D.axis = 'none';
          }
          if (D.axis === 'amt') {
            const dv = (D.ly - e.clientY) / 90 * (e.shiftKey ? 0.1 : 1);
            D.ly = e.clientY;
            l.amt = l.bip ? clamp(Math.abs(l.amt) + dv) : clamp(l.amt + dv, -1, 1);
          } else if (D.axis === 'curve') l.bend = clamp(D.b0 + (e.clientX - D.x) / 40, -4, 4);
          paint(C);
        });
        const end = e => {
          const D = S.drag;
          if (!D || D.id !== e.pointerId) return;
          S.drag = null;
          if (!D.axis && e.type === 'pointerup') click(l);
          graphHide();
          paint(C);
        };
        b.addEventListener('pointerup', end);
        b.addEventListener('pointercancel', end);
        b.addEventListener('contextmenu', e => {
          e.preventDefault(); e.stopPropagation();
          if (!S.open || S.drag) return; // a Ctrl+click on a Mac also fires this
          if (e.ctrlKey || e.metaKey) { tell('In FX Devices this opens the full mod panel over the control'); return; }
          l.amt = 0; tell(l.src.name + ': amount at zero'); paint(C);
        });
        b.addEventListener('dblclick', e => { if (S.open) { e.preventDefault(); editAmt(l, it); } });
      }
      function click(l) {
        if (mods.alt) {
          C.links.splice(C.links.indexOf(l), 1);
          S.order = S.order.filter(x => x !== l);
          const it = items.get(l); if (it) it.box.remove(); items.delete(l);
          if (S.hot === l) S.hot = null;
          if (S.last === l) S.last = null;
          tell(l.src.name + ' removed');
        } else if (mods.ctrl) {
          l.op = (l.op + 1) % MIX.length;
          if (l.op === 1) l.bip = false; // Scale has no "both ways"
          tell('Mix: ' + MIX[l.op].name);
        } else if (mods.shift) {
          l.muted = !l.muted;
          tell(l.src.name + (l.muted ? ' muted' : ' unmuted'));
        }
      }
      function editAmt(l, it) {
        const inp = h('input', { class: 'msq-edit', type: 'text', inputmode: 'decimal', value: String(Math.round((l.bip ? Math.abs(l.amt) : l.amt) * 100)), 'aria-label': l.src.name + ' amount in percent' });
        S.edit = inp;
        win.append(inp);
        const wb = win.getBoundingClientRect(), bb = it.box.getBoundingClientRect();
        inp.style.left = (bb.left - wb.left - 4) + 'px'; inp.style.top = (bb.bottom - wb.top + 8) + 'px';
        inp.focus(); inp.select();
        const done = ok => {
          if (S.edit !== inp) return;
          const n = parseFloat(inp.value);
          if (ok && isFinite(n)) l.amt = l.bip ? clamp(Math.abs(n) / 100) : clamp(n / 100, -1, 1);
          S.edit = null; inp.remove(); paint(C);
        };
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
        inp.addEventListener('blur', () => done(true));
      }

      // hover the folded square a moment, or click it, to unfold
      let over = false;
      el.addEventListener('pointerenter', () => { over = true; });
      el.addEventListener('pointerleave', () => { over = false; });
      el.addEventListener('pointerdown', e => { if (!S.open && C.links.length) { e.preventDefault(); e.stopPropagation(); unfold(); } });
      function unfold() {
        const folded = [...S.q.values()].every(v => v <= 0.01);
        if (folded) S.order.forEach((l, i) => S.row.set(l, i));
        S.open = true; S.t0 = performance.now() / 1000; S.away = 0;
      }

      function frame() {
        if (!el.isConnected) return;
        const now = performance.now() / 1000, dt = Math.min(now - (S.tf || now), 0.05);
        S.tf = now;
        const n = S.order.length;
        el.hidden = !n;
        if (!n) return;
        if (!S.open) {
          S.hov = over && !S.drag ? S.hov + dt : 0;
          if (S.hov >= SQ.OPEN_DELAY) unfold();
        }
        // each square eases toward the row (open) or its layer (folded), one after another
        let maxQ = 0;
        S.order.forEach((l, i) => {
          const ri = S.row.has(l) ? S.row.get(l) : i;
          const tgt = S.open ? (now - S.t0 >= ri * SQ.STAG ? 1 : 0) : (now - S.t0 >= (n - 1 - ri) * SQ.STAG ? 0 : 1);
          let q = S.q.get(l) || 0;
          q = FXD.reducedMotion ? tgt : q + (tgt - q) * (1 - Math.exp(-dt * SQ.K));
          if (Math.abs(tgt - q) < 0.003) q = tgt;
          S.q.set(l, q);
          maxQ = Math.max(maxQ, q);
        });
        if (!S.open && maxQ === 0) S.order.forEach((l, i) => S.row.set(l, i));
        el.classList.toggle('open', S.open || maxQ > 0);
        el.classList.toggle('hov', !S.open && S.hov > 0);
        el.style.setProperty('--w', (S.open || maxQ > 0 ? n * (SQ.ITEM + SQ.GAP) - SQ.GAP : SQ.OUT) + 'px');
        // draw, outer layer first
        S.order.forEach((l, i) => {
          const it = itemOf(l), q = S.q.get(l) || 0;
          const sN = Math.max(2, SQ.OUT - SQ.STEP * i), xN = (SQ.OUT - sN) / 2, yN = (SQ.OUT - sN) / 2;
          const xR = (S.row.has(l) ? S.row.get(l) : i) * (SQ.ITEM + SQ.GAP), yR = (SQ.OUT - SQ.ITEM) / 2;
          const x = lerp(xN, xR, q), y = lerp(yN, yR, q), sz = lerp(sN, SQ.ITEM, q), g = Math.max(0, (q - 0.5) * 2);
          const st = it.box.style;
          st.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
          st.width = st.height = sz.toFixed(2) + 'px';
          st.zIndex = String(i + 1);
          st.setProperty('--c', l.src.color);
          st.setProperty('--g', g.toFixed(3));
          it.box.classList.toggle('muted', l.muted);
          it.box.classList.toggle('del', S.open && S.hot === l && mods.alt && !S.drag);
          it.box.style.pointerEvents = S.open ? 'auto' : 'none';
          it.glyph.setAttribute('d', ['M3.8 7h6.4M7 3.8v6.4', 'M4 4l6 6M10 4l-6 6', 'M3.8 3.8h6.4M7 3.8v6.4', 'M3.8 10.2h6.4M7 3.8v6.4'][l.op]);
        });
        // readout over the row: the range it moves the knob over, or its amount for Scale
        const hot = S.open && S.hot && !S.edit && !(S.drag && S.drag.axis === 'curve') ? S.hot : null;
        if (hot) {
          const fmt = C.K.fmt || (v => v), base = C.K.value, a = hot.amt;
          let txt;
          if (hot.op === 1) txt = (a < 0 ? 'x-' : 'x') + Math.round(Math.abs(a) * 100) + '%';
          else {
            const lo = clamp(hot.bip ? base - Math.abs(a) : Math.min(base, base + a)), hi = clamp(hot.bip ? base + Math.abs(a) : Math.max(base, base + a));
            txt = fmt(a < 0 && !hot.bip ? hi : lo) + ' > ' + fmt(a < 0 && !hot.bip ? lo : hi);
          }
          const del = mods.alt && !S.drag;
          tip.replaceChildren((hot.op || mods.ctrl) && !del ? h('b', null, MIX[hot.op].chip + ' ' + MIX[hot.op].name.toUpperCase()) : '', del ? 'Click to remove' : txt);
          tip.style.setProperty('--c', del ? '#e5534b' : hot.src.color);
          const wb = win.getBoundingClientRect(), eb = el.getBoundingClientRect();
          tip.style.left = (eb.left - wb.left - 4) + 'px'; tip.style.top = (eb.top - wb.top - 10) + 'px';
          tip.classList.add('show');
          tip.owner = C;
        } else if (tip.owner === C) tip.classList.remove('show');
        // the curve graph while a square's curve is dragged
        if (S.drag && S.drag.axis === 'curve') graphShow(S.drag.l, items.get(S.drag.l));
        // fold back a moment after the mouse leaves; the one used last becomes the outer layer
        if (S.open) {
          S.away = over || S.drag || S.edit ? 0 : S.away + dt;
          if (S.away >= SQ.CLOSE_DELAY) {
            if (S.last && S.order.includes(S.last)) S.order = [S.last, ...S.order.filter(x => x !== S.last)];
            S.open = false; S.t0 = now; S.hov = 0;
            if (S.hot) { S.hot = null; paint(C); }
          }
        }
      }
      FXD.onFrame(frame);
      const api = { el, get hot() { return S.hot; } };
      return api;
    }

    function graphShow(l, it) {
      let d = '';
      for (let i = 0; i <= 32; i++) d += (i ? 'L' : 'M') + (3 + i / 32 * 78).toFixed(1) + ' ' + (51 - shape(i / 32, l.bend) * 48).toFixed(1);
      const name = l.bend > 0.05 ? 'EXP' : l.bend < -0.05 ? 'LOG' : 'LINEAR';
      graph.innerHTML = `<rect x=".5" y=".5" width="83" height="53"/><path d="${d}" stroke="${l.src.color}"/><text x="4" y="9">${name}</text>`;
      const wb = win.getBoundingClientRect(), bb = it.box.getBoundingClientRect();
      graph.style.left = (bb.left - wb.left + bb.width / 2 - 42) + 'px'; graph.style.top = (bb.top - wb.top - 64) + 'px';
      graph.classList.add('show');
    }
    function graphHide() { graph.classList.remove('show'); }

    build();
    reset.addEventListener('click', () => { build(); tell('Back to the start'); });

    const row = (k, t) => h('li', null, h('span', { class: 'msq-keys' }, k), h('span', null, t));
    const kbd = t => h('kbd', null, t);
    const look = (cls, t) => h('li', null, h('span', { class: 'msq-ico ' + cls }), h('span', null, t));
    host.replaceChildren(h('div', { class: 'msqs' },
      h('div', { class: 'msq-demo' }, win, h('p', { class: 'msq-try' }, 'Hover the little squares by each knob, then drag one up or down.'), reset),
      h('div', { class: 'msq-help' },
        h('h4', null, 'Reading it'),
        h('ul', { class: 'msq-look' },
          look('i-layers', 'One layer per modulator, nested. The one you used last sits on the outside.'),
          look('i-glyph', 'The sign in it is how it mixes: + adds, × scales the others, and the T shapes are Min and Max, which cap the top or the bottom.'),
          look('i-muted', 'Black with a coloured edge means it\'s muted.')),
        h('h4', null, 'Using it'),
        h('ul', { class: 'msq-use' },
          row(['Hover'], 'Unfold the modulators into a row. Hover one to see the range it covers.'),
          row(['Drag ↕'], ['Amount. Hold ', kbd('Shift'), ' for fine, ', kbd(CTRL), ' to go both ways.']),
          row(['Drag ↔'], 'The curve, from log to exponential.'),
          row(['Double-click'], 'Type the amount.'),
          row([kbd(CTRL), ' click'], 'Next mix mode.'),
          row([kbd('Shift'), ' click'], 'Mute or unmute.'),
          row([kbd('Alt'), ' click'], 'Remove it.'),
          row(['Right-click'], 'Set the amount to zero.'),
          row([kbd(CTRL), ' right-click'], 'Open the full mod panel.')),
        h('p', { class: 'msq-note' }, 'Rather have the old hover panel? Turn the square off in Settings, under Devices > Modulation.'))));
  };
})();
