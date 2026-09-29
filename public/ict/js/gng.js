(function (global) {
  'use strict';
  const ICT = global.ICT = global.ICT || {};

  const COLORS = { red: '#e5484d', blue: '#3b82f6', green: '#30a46c', yellow: '#f5d90a' };
  const IMG_COLORS = ['#e5484d', '#3b82f6', '#30a46c', '#f5d90a', '#a855f7', '#f97316', '#22d3ee', '#ec4899'];
  const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'pentagon', 'hexagon', 'star', 'cross', 'ring', 'plus'];
  const PATTERNS = ['solid', 'outline', 'stripes', 'dots'];

  /* Randomly generated image: shape, 1-3 colors, pattern, size (scale) and
     rotation. Identity is the descriptor's id — on no-go trials the stimulus
     is the exact same descriptor (same id), so the image is identical to the
     cue. multi (multiColor) lets an image mix several colors. */
  function pickDistinctColors(n) {
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < 50) {
      const c = IMG_COLORS[ICT.randInt(0, IMG_COLORS.length - 1)];
      if (!out.includes(c)) out.push(c);
    }
    return out;
  }
  function randomImage(opts) {
    const multi = !!(opts && opts.multi);
    const vary = !opts || opts.vary !== false;
    const colors = pickDistinctColors(multi ? 2 + (Math.random() < 0.45 ? 1 : 0) : 1);
    const shape = SHAPES[ICT.randInt(0, SHAPES.length - 1)];
    const pattern = PATTERNS[ICT.randInt(0, PATTERNS.length - 1)];
    const scale = vary ? +(0.55 + Math.random() * 0.45).toFixed(3) : 1;
    const rotation = shape === 'circle' || shape === 'ring' ? 0 : ICT.randInt(0, 23) * 15;
    const id = [shape, colors.join('+'), pattern, scale, rotation].join('|');
    return { id, shape, color: colors[0], colors, pattern, scale, rotation };
  }
  ICT.randomImage = randomImage;

  /* Similarity engine: copy the cue and change exactly ONE attribute, so the
     go image looks almost like the forbidden image and discriminating them is
     hard. Which attributes can change depends on the shape (rotation is a
     no-op for symmetric shapes). */
  function similarTo(cue) {
    const possible = ['color', 'shape', 'pattern', 'scale'];
    if (cue.shape !== 'circle' && cue.shape !== 'ring') possible.push('rotation');
    const choice = possible[ICT.randInt(0, possible.length - 1)];
    const s = {
      shape: cue.shape, color: cue.color, colors: cue.colors.slice(),
      pattern: cue.pattern, scale: cue.scale, rotation: cue.rotation
    };
    if (choice === 'color') {
      let c;
      do { c = IMG_COLORS[ICT.randInt(0, IMG_COLORS.length - 1)]; } while (c === cue.color);
      s.color = c;
      s.colors[0] = c;
    } else if (choice === 'shape') {
      let sh;
      do { sh = SHAPES[ICT.randInt(0, SHAPES.length - 1)]; } while (sh === cue.shape);
      s.shape = sh;
    } else if (choice === 'pattern') {
      let p;
      do { p = PATTERNS[ICT.randInt(0, PATTERNS.length - 1)]; } while (p === cue.pattern);
      s.pattern = p;
    } else if (choice === 'scale') {
      s.scale = +(0.55 + Math.random() * 0.45).toFixed(3);
    } else {
      s.rotation = ICT.randInt(0, 23) * 15;
    }
    s.id = [s.shape, s.colors.join('+'), s.pattern, s.scale, s.rotation].join('|');
    return s;
  }

  function polyPoints(c, r, n, rotDeg) {
    const rot = (rotDeg * Math.PI) / 180;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = rot + (i * 2 * Math.PI) / n - Math.PI / 2;
      pts.push((c + r * Math.cos(a)).toFixed(2) + ',' + (c + r * Math.sin(a)).toFixed(2));
    }
    return pts.join(' ');
  }
  function starPoints(c, r, rotDeg) {
    const rot = (rotDeg * Math.PI) / 180;
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
      pts.push((c + rad * Math.cos(a)).toFixed(2) + ',' + (c + rad * Math.sin(a)).toFixed(2));
    }
    return pts.join(' ');
  }
  function shapeBody(shape, c, r, s) {
    switch (shape) {
      case 'circle':   return `<circle cx="${c}" cy="${c}" r="${r}"/>`;
      case 'square':   return `<rect x="${c - r}" y="${c - r}" width="${r * 2}" height="${r * 2}" rx="${r * 0.14}"/>`;
      case 'triangle': return `<polygon points="${c},${c - r} ${c - r * 0.866},${c + r * 0.5} ${c + r * 0.866},${c + r * 0.5}"/>`;
      case 'diamond':  return `<polygon points="${c},${c - r} ${c + r},${c} ${c},${c + r} ${c - r},${c}"/>`;
      case 'pentagon': return `<polygon points="${polyPoints(c, r, 5, 0)}"/>`;
      case 'hexagon':  return `<polygon points="${polyPoints(c, r, 6, 0)}"/>`;
      case 'star':     return `<polygon points="${starPoints(c, r, 0)}"/>`;
      case 'cross':    return `<path d="M ${c - r * 0.4} ${c - r} L ${c + r * 0.4} ${c - r} L ${c + r} ${c - r * 0.4} L ${c + r} ${c + r * 0.4} L ${c + r * 0.4} ${c + r} L ${c - r * 0.4} ${c + r} L ${c - r} ${c + r * 0.4} L ${c - r} ${c - r * 0.4} Z"/>`;
      case 'ring':     return `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${Math.max(3, s * 0.08)}"/>`;
      case 'plus':     return `<path d="M ${c - r * 0.3} ${c - r} L ${c + r * 0.3} ${c - r} L ${c + r * 0.3} ${c - r * 0.3} L ${c + r} ${c - r * 0.3} L ${c + r} ${c + r * 0.3} L ${c + r * 0.3} ${c + r * 0.3} L ${c + r * 0.3} ${c + r} L ${c - r * 0.3} ${c + r} L ${c - r * 0.3} ${c + r * 0.3} L ${c - r} ${c + r * 0.3} L ${c - r} ${c - r * 0.3} L ${c - r * 0.3} ${c - r * 0.3} Z"/>`;
    }
    return '';
  }
  function stripeLines(s) {
    let out = '';
    for (let x = -s; x <= 2 * s; x += s * 0.28) out += `<line x1="${x}" y1="0" x2="${x + s * 0.14}" y2="${s}"/>`;
    return out;
  }
  function dotGrid(s) {
    let out = '';
    for (let y = s * 0.15; y < s; y += s * 0.3) {
      for (let x = s * 0.15; x < s; x += s * 0.3) out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(s * 0.035).toFixed(1)}"/>`;
    }
    return out;
  }
  let _uid = 0;
  function uniq() { return 'ict' + (++_uid); }

  ICT.renderImage = function (d, size) {
    size = size || 110;
    const s = size, c = s / 2;
    const r = s * 0.36 * (d.scale || 1);
    const rot = d.rotation || 0;
    const rotAttr = rot ? ` transform="rotate(${rot} ${c} ${c})"` : '';
    const body = shapeBody(d.shape, c, r, s);
    const colors = d.colors && d.colors.length ? d.colors : [d.color];
    const c0 = colors[0];
    const c1 = colors.length > 1 ? colors[1] : c0;
    let inner;
    if (d.shape === 'ring') {
      if (colors.length > 1) {
        inner = `<g fill="none" stroke="${c0}" stroke-width="${Math.max(3, s * 0.07)}">${body}</g>
          <g fill="none" stroke="${c1}" stroke-width="${Math.max(2, s * 0.035)}"><circle cx="${c}" cy="${c}" r="${(r * 0.6).toFixed(1)}"/></g>`;
      } else {
        inner = `<g fill="none" stroke="${c0}">${body}</g>`;
      }
    } else if (d.pattern === 'outline') {
      if (colors.length > 1) {
        inner = `<g fill="none">
          <g stroke="${c0}" stroke-width="${Math.max(3, s * 0.07)}">${body}</g>
          <g stroke="${c1}" stroke-width="${Math.max(2, s * 0.03)}">${body}</g>
        </g>`;
      } else {
        inner = `<g fill="none" stroke="${c0}" stroke-width="${Math.max(3, s * 0.07)}">${body}</g>`;
      }
    } else if (d.pattern === 'stripes' || d.pattern === 'dots') {
      const id = uniq();
      const overlayColor = colors.length > 1 ? c1 : '#ffffff';
      const overlayOpacity = colors.length > 1 ? 0.8 : 0.55;
      inner = `<g fill="${c0}">${body}</g>
        <clipPath id="${id}"><g>${body}</g></clipPath>
        <g clip-path="url(#${id})" opacity="${overlayOpacity}" fill="none" stroke="${overlayColor}" stroke-width="${Math.max(2, s * 0.035)}">
          ${d.pattern === 'stripes' ? `<g transform="rotate(-30 ${c} ${c})">${stripeLines(s)}</g>` : dotGrid(s)}
        </g>`;
    } else if (colors.length > 1) {
      /* solid fill + multiple colors → diagonal two-tone split */
      const id = uniq();
      inner = `<clipPath id="${id}"><g>${body}</g></clipPath>
        <g clip-path="url(#${id})">
          <polygon points="0,0 ${s},0 0,${s}" fill="${c0}"/>
          <polygon points="${s},0 ${s},${s} 0,${s}" fill="${c1}"/>
        </g>`;
    } else {
      inner = `<g fill="${c0}">${body}</g>`;
    }
    return `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}"><g${rotAttr}>${inner}</g></svg>`;
  };

  const DIMS = {
    color:  { label: 'Color',  items: ['red', 'blue', 'green', 'yellow'] },
    shape:  { label: 'Shape',  items: ['circle', 'square', 'triangle', 'diamond'] },
    letter: { label: 'Letter', items: ['A', 'B', 'C', 'D'] },
    number: { label: 'Number', items: ['1', '2', '3', '4'] },
    image:  { label: 'Image',  generate: randomImage }
  };

  const VARIANTS = {
    color:  DIMS.color,
    shape:  DIMS.shape,
    letter: DIMS.letter,
    number: DIMS.number,
    image:  DIMS.image,
    set:    { label: 'Set', set: true },
    mixed:  { label: 'Mixed', dims: ['color', 'shape', 'letter', 'number'] },
    switch: { label: 'Switch', switch: true, dims: ['color', 'shape', 'letter', 'number', 'image'] }
  };

  const DEFAULTS = {
    variant: 'color', trials: 120, noGoRate: 0.5, practice: true,
    adaptive: false, adaptStartMs: 1000, adaptStep: 20, adaptMin: 350, adaptMax: 1500,
    fixMs: 300, cueMs: 800, stimMs: 1000, itiMs: 400, revealMs: 400,
    varySize: true, multiColor: false, similar: false, rewards: false,
    capacity: 3, setImages: false, setSpan: 1,
    twoKey: false, forbidKey: 'left', switchDim: 'mixed', learnSwitches: true
  };

  const GNG = ICT.GNG = { DEFAULTS, VARIANTS, DIMS };

  ICT.renderItem = function (dim, item, size) {
    size = size || 110;
    const s = size, c = s / 2;
    if (dim === 'image') return ICT.renderImage(item, size);
    if (dim === 'color') {
      return `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}"><circle cx="${c}" cy="${c}" r="${c * 0.72}" fill="${COLORS[item]}" stroke="#0e1420" stroke-width="5"/></svg>`;
    }
    if (dim === 'shape') {
      let shape;
      if (item === 'circle') shape = `<circle cx="${c}" cy="${c}" r="${c * 0.68}" fill="#e6edf7"/>`;
      else if (item === 'square') shape = `<rect x="${c * 0.3}" y="${c * 0.3}" width="${c * 1.4}" height="${c * 1.4}" rx="6" fill="#e6edf7"/>`;
      else if (item === 'triangle') shape = `<polygon points="${c},${c * 0.2} ${c * 0.12},${c * 1.75} ${c * 1.88},${c * 1.75}" fill="#e6edf7"/>`;
      else shape = `<polygon points="${c},${c * 0.12} ${c * 1.88},${c} ${c},${c * 1.88} ${c * 0.12},${c}" fill="#e6edf7"/>`;
      return `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">${shape}</svg>`;
    }
    return `<svg viewBox="0 0 ${s} ${s}" width="${s}" height="${s}"><text x="${c}" y="${c * 1.3}" text-anchor="middle" font-size="${s * 0.56}" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="#e6edf7">${item}</text></svg>`;
  };

  /* ---------------- pure sequence builder (testable) ----------------
     Each trial has a rule cue (the forbidden item for THAT trial) followed by
     a stimulus. The rule switches every trial (context-dependent, trial-by-
     trial reconfiguration — no blocks). isNoGo means the stimulus IS the
     forbidden item, so you must withhold; otherwise you respond.
     'mixed' picks a random dimension per trial. */
  ICT.buildGNGSequence = function (cfg) {
    const variant = cfg.variant;
    const v = VARIANTS[variant];
    /* Switch mode runs Mixed dimensions by default (the forbidden item
       switches color/shape/letter/number every trial); a single dimension can
       be chosen instead. */
    const dims = v.switch
      ? (cfg.switchDim === 'mixed' || !cfg.switchDim ? CLASSIC_DIMS.slice() : [cfg.switchDim])
      : (v.dims ? v.dims : [variant]);
    const opts = { vary: cfg.varySize !== false, multi: !!cfg.multiColor };
    const similar = !!cfg.similar;
    const seq = [];
    let prevCue = null;

    /* Set mode: the forbidden "rule" is a set of items you must hold in mind
       (capacity). By default the set changes every trial; with setSpan > 1 the
       same set is in force for that many consecutive trials and is only shown
       on its first trial (cueIntro) — you have to remember it from memory.
       Stop if the stimulus matches ANY member. */
    if (variant === 'set') {
      const capacity = Math.max(1, Math.min(8, cfg.capacity || 3));
      const images = !!cfg.setImages;
      const span = Math.max(1, cfg.setSpan || 1);
      let activeSet = null;
      let spanLeft = 0;
      for (let i = 0; i < cfg.trials; i++) {
        if (spanLeft <= 0) {
          let guard = 0;
          do { activeSet = setPool(capacity, images); } while (sameSet(activeSet, prevCue) && guard++ < 30);
          spanLeft = span;
          prevCue = activeSet;
        }
        spanLeft--;
        const isNoGo = Math.random() < cfg.noGoRate;
        const stimulus = isNoGo
          ? Object.assign({}, activeSet[ICT.randInt(0, activeSet.length - 1)])
          : setGoStim(activeSet, images);
        seq.push({ dim: 'set', cue: activeSet, stimulus, isNoGo, cueIntro: spanLeft === span - 1 });
      }
      return seq;
    }

    for (let i = 0; i < cfg.trials; i++) {
      const dim = dims.length > 1 ? dims[ICT.randInt(0, dims.length - 1)] : dims[0];
      const D = DIMS[dim];
      const isNoGo = Math.random() < cfg.noGoRate;
      let cue, guard = 0;
      if (D.generate) {
        cue = D.generate(opts);
        while (sameItem(cue, prevCue) && guard++ < 20) cue = D.generate(opts);
      } else {
        const K = D.items.length;
        cue = D.items[ICT.randInt(0, K - 1)];
        while (cue === prevCue && guard++ < 20) cue = D.items[ICT.randInt(0, K - 1)];
      }
      let stimulus;
      if (isNoGo) {
        stimulus = cue;
      } else if (D.generate) {
        guard = 0;
        if (similar) {
          stimulus = similarTo(cue);
          while (sameItem(stimulus, cue) && guard++ < 30) stimulus = similarTo(cue);
        } else {
          stimulus = D.generate(opts);
          while ((sameItem(stimulus, cue) || (stimulus.shape === cue.shape && stimulus.color === cue.color)) && guard++ < 30) {
            stimulus = D.generate(opts);
          }
        }
      } else {
        const K = D.items.length;
        guard = 0;
        stimulus = D.items[ICT.randInt(0, K - 1)];
        while (stimulus === cue && guard++ < 20) stimulus = D.items[ICT.randInt(0, K - 1)];
      }
      seq.push({ dim, cue, stimulus, isNoGo });
      prevCue = cue;
    }
    return seq;
  };

  function sameItem(a, b) {
    if (a == null || b == null) return false;
    return typeof a === 'object' ? a.id === b.id : a === b;
  }

  /* ---------------- set mode helpers ---------------- */
  const CLASSIC_DIMS = ['color', 'shape', 'letter', 'number'];

  function setPool(capacity, images) {
    const out = [];
    const seen = new Set();
    let guard = 0;
    while (out.length < capacity && guard++ < 120) {
      if (images) {
        const d = randomImage({});
        if (!seen.has(d.id)) { seen.add(d.id); out.push({ dim: 'image', item: d }); }
      } else {
        const dim = CLASSIC_DIMS[ICT.randInt(0, CLASSIC_DIMS.length - 1)];
        const item = DIMS[dim].items[ICT.randInt(0, DIMS[dim].items.length - 1)];
        const key = dim + ':' + item;
        if (!seen.has(key)) { seen.add(key); out.push({ dim, item }); }
      }
    }
    return out;
  }

  function sameSetEntry(a, b) {
    if (!a || !b) return false;
    if (a.dim !== b.dim) return false;
    if (a.item && typeof a.item === 'object') return a.item.id === b.item.id;
    return a.item === b.item;
  }

  function sameSet(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((e, i) => sameSetEntry(e, b[i]));
  }

  function setGoStim(cue, images) {
    let guard = 0;
    while (guard++ < 60) {
      if (images) {
        const d = randomImage({});
        if (!cue.some(e => e.item.id === d.id)) return { dim: 'image', item: d };
      } else {
        const dim = CLASSIC_DIMS[ICT.randInt(0, CLASSIC_DIMS.length - 1)];
        const item = DIMS[dim].items[ICT.randInt(0, DIMS[dim].items.length - 1)];
        const stim = { dim, item };
        if (!cue.some(e => sameSetEntry(stim, e))) return stim;
      }
    }
    return images ? { dim: 'image', item: cue[0].item } : { dim: cue[0].dim, item: cue[0].item };
  }

  /* ---------------- lifecycle ---------------- */

  GNG.start = function (cfg, root) {
    this.cfg = Object.assign({}, DEFAULTS, cfg);
    for (const key of ['adaptStartMs', 'adaptMin']) {
      const value = Number(this.cfg[key]);
      this.cfg[key] = Number.isFinite(value) ? Math.round(Math.max(50, Math.min(10000, value))) : DEFAULTS[key];
    }
    this.cfg.adaptMin = Math.min(this.cfg.adaptMin, this.cfg.adaptStartMs);
    this.cfg.adaptMax = Math.max(DEFAULTS.adaptMax, this.cfg.adaptStartMs);
    this.root = root;
    this._disposed = false;
    this._sessionStartedAt = null;
    this._sessionRecorded = false;
    this._timers = [];
    this._onKey = (e) => this._handleKey(e);
    window.addEventListener('keydown', this._onKey, true);
    this.renderSettings();
  };

  GNG.destroy = function () {
    this._recordSession(true);
    ICT.setActive(false);
    this._disposed = true;
    (this._timers || []).forEach(clearTimeout);
    this._timers = [];
    if (this._onKey) { window.removeEventListener('keydown', this._onKey, true); this._onKey = null; }
  };

  GNG._timer = function (fn, ms) {
    const id = setTimeout(() => { if (!this._disposed) fn(); }, ms);
    this._timers.push(id);
    return id;
  };

  /* Two-key forced choice is in play either from the settings toggle (any
     variant) or inherently in Switch mode. */
  GNG._usingTwoKey = function () {
    return !!this.cfg && (this.cfg.twoKey || this.cfg.variant === 'switch');
  };

  GNG._setButtons = function (disabled) {
    const root = this.root;
    const go = root.querySelector('[data-go]');
    const sides = root.querySelectorAll('[data-side]');
    if (go) go.classList.toggle('disabled', disabled);
    for (const b of sides) b.classList.toggle('disabled', disabled);
  };

  /* The legend shows which physical key currently means FORBIDDEN. In Switch
     mode the mapping must be learned from the arrow cue, so the legend only
     appears during practice. */
  GNG._updateLegend = function () {
    const el = this.root.querySelector('[data-map-legend]');
    if (!el) return;
    const forbid = this.forbidSide === 'left' ? '◀ LEFT' : 'RIGHT ▶';
    const go = this.forbidSide === 'left' ? 'RIGHT ▶' : '◀ LEFT';
    const show = this.cfg.variant === 'switch'
      ? (!!this.isPractice || this.cfg.learnSwitches === false)
      : true;
    el.style.display = show ? '' : 'none';
    el.innerHTML = `<b>${forbid}</b> = FORBIDDEN &nbsp;·&nbsp; <b>${go}</b> = NOT forbidden`;
  };

  /* Switch mode: after a correct trial an arrow sets the new response keys —
     it points to the side that is now FORBIDDEN. */
  GNG._showArrowCue = function () {
    this.forbidSide = Math.random() < 0.5 ? 'left' : 'right';
    const el = this.root.querySelector('[data-swarrow]');
    if (el) {
      el.textContent = this.forbidSide === 'left' ? '←' : '→';
      el.style.display = '';
    }
    this._updateLegend();
  };

  GNG._revealLabel = function (tr) {
    if (this._usingTwoKey()) {
      if (tr.choice == null) return 'No response — you must pick a key';
      if (tr.correct) return tr.isNoGo ? 'Correctly said FORBIDDEN' : 'Hit — correctly said NOT forbidden';
      return tr.isNoGo ? 'False alarm — it was forbidden' : 'Wrong key — it was NOT forbidden';
    }
    return tr.isNoGo
      ? (tr.correct ? 'Correctly withheld' : 'False alarm — it was forbidden')
      : (tr.correct ? 'Hit' : 'Missed a go trial');
  };

  /* Short human description of how you respond, for the settings screen. */
  GNG._keyHint = function (c) {
    if (c.variant === 'switch') {
      return c.learnSwitches === false
        ? 'Answer <b>every</b> trial with <b>← or →</b>: one side says <b>FORBIDDEN</b>, the other says <b>NOT forbidden</b>.'
        : 'Answer <b>every</b> trial with <b>← or →</b>. After each correct trial an <b>arrow</b> appears and sets the response keys — it points to the side that is now <b>FORBIDDEN</b>, the other side is <b>NOT forbidden</b>.';
    }
    if (c.twoKey) {
      return 'Answer <b>every</b> trial with <b>← or →</b>: one side says <b>FORBIDDEN</b>, the other says <b>NOT forbidden</b>.';
    }
    return 'Press <b>Space</b> (or the button) when the item is <b>not</b> the forbidden one; <b>withhold</b> when it is.';
  };

  /* ---------------- settings ---------------- */

  GNG.renderSettings = function () {
    const c = this.cfg;
    const v = VARIANTS[c.variant];
    const root = this.root;
    const itemDesc = v.switch
      ? (c.switchDim === 'mixed' || !c.switchDim
          ? `the forbidden item switches between <b>color, shape, letter and number</b> dimensions`
          : c.switchDim === 'image'
            ? `the forbidden item is a <b>randomly generated image</b> — random shape, color, pattern, size and rotation`
            : `the forbidden item is one of <b>${DIMS[c.switchDim].items.length} possible ${DIMS[c.switchDim].label.toLowerCase()}s</b>`)
      : v.dims
        ? `the forbidden item switches between <b>${v.dims.join(', ')}</b> dimensions`
        : v.generate
          ? `the forbidden item is a <b>randomly generated image</b> — random shape, color, pattern, size and rotation`
          : v.set
            ? `you must hold <b>${Math.max(1, c.capacity || 3)} forbidden items</b> in mind at once — stop if the item matches <b>ANY</b> of them; the set changes every trial`
            : `the forbidden item is one of <b>${v.items.length} possible ${v.label.toLowerCase()}s</b>`;
    root.innerHTML = `
      <div class="head">
        <a class="head-link" href="https://disboard.org/server/1200540503654010910" target="_blank" rel="noopener">Discord</a>
        <h2>ICT</h2>
        <span class="pill">Go/No-Go — ${v.label}</span>
        <div class="head-links">
          <a class="head-link" href="#" data-home>Home</a>
        </div>
      </div>
      <div class="settings card">
        <h3>Settings — ${v.label} go/no-go</h3>
        <p class="desc">
          Each trial shows a rule cue (<b>NO-GO</b>), then an item. ${this._keyHint(c)} The forbidden item changes
          <b>every trial</b> — ${itemDesc}.
        </p>
        <div class="settings-grid">
          <label>Trials
            <select data-trials>
              ${[100, 120, 160, 200].map(n => `<option value="${n}" ${c.trials === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </label>
          <label class="check">
            <input type="checkbox" data-practice ${c.practice ? 'checked' : ''} />
            Include a short practice phase
          </label>
          <label class="check">
            <input type="checkbox" data-adaptive ${c.adaptive ? 'checked' : ''} />
            Adaptive pacing — quickens when you're accurate, eases when you're not
          </label>
          <label>Starting response window (ms)
            <input type="number" data-adaptstart required min="50" max="10000" step="1" value="${c.adaptStartMs}" ${c.adaptive ? '' : 'disabled'} />
          </label>
          <label>Minimum response window (ms)
            <input type="number" data-adaptmin required min="50" max="10000" step="1" value="${c.adaptMin}" ${c.adaptive ? '' : 'disabled'} />
          </label>
          ${v.switch ? `
          <label>Forbidden item dimension
            <select data-switchdim>
              <option value="mixed" ${c.switchDim === 'mixed' || !c.switchDim ? 'selected' : ''}>Mixed (dimension changes every trial)</option>
              ${['color', 'shape', 'letter', 'number', 'image'].map(d => `<option value="${d}" ${c.switchDim === d ? 'selected' : ''}>${DIMS[d].label}</option>`).join('')}
            </select>
          </label>
          <label class="check">
            <input type="checkbox" data-learnswitches ${c.learnSwitches !== false ? 'checked' : ''} />
            Learn the switches — an arrow after each correct trial flips which key is FORBIDDEN
          </label>` : `
          <label class="check">
            <input type="checkbox" data-twokey ${c.twoKey ? 'checked' : ''} />
            Two-key forced choice — answer every trial with ← or → instead of press/withhold
          </label>
          ${c.twoKey ? `<label>Left key (←) means
            <select data-forbidkey>
              <option value="left" ${c.forbidKey === 'left' ? 'selected' : ''}>Forbidden</option>
              <option value="right" ${c.forbidKey === 'right' ? 'selected' : ''}>Not forbidden</option>
            </select>
          </label>` : ''}`}
          <label class="check">
            <input type="checkbox" data-rewards ${c.rewards ? 'checked' : ''} />
            Rewards — whole-screen green flash + chime on every correct go (makes the go response rewarding, so holding back on no-go is harder)
          </label>
          ${v.generate ? `<label class="check">
            <input type="checkbox" data-varysize ${c.varySize !== false ? 'checked' : ''} />
            Vary image size every trial
          </label>
          <label class="check">
            <input type="checkbox" data-multicolor ${c.multiColor ? 'checked' : ''} />
            Mix multiple colors into each image
          </label>
          <label class="check">
            <input type="checkbox" data-similar ${c.similar ? 'checked' : ''} />
            Similarity engine — go images look almost like the forbidden image (harder to tell apart)
          </label>` : ''}
          ${v.set ? `<label>Capacity — how many forbidden items to hold in mind
            <select data-capacity>
              ${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${c.capacity === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </label>
          <label>Trials to remember the set for
            <select data-setspan>
              ${[1, 2, 3, 5, 8, 10].map(n => `<option value="${n}" ${c.setSpan === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </label>
          <label class="check">
            <input type="checkbox" data-setimages ${c.setImages ? 'checked' : ''} />
            Include randomly generated images in the sets
          </label>` : ''}
        </div>
        <div class="rule-note">
          <b>No-go frequency: 50%</b> — stopping happens often so you anticipate it. This supports fast,
          proactive, top-down inhibitory control.
          ${v.set ? `<br/><b>Set mode:</b> stop if the item is <b>ANY</b> of the forbidden items you're holding in mind. ${
            c.setSpan > 1
              ? `The set stays the same for <b>${c.setSpan} trials</b> and is shown once — after that you must remember it from memory.`
              : 'The set changes every trial.'}` : ''}
          ${v.generate && c.similar ? '<br/><b>Similarity on:</b> the forbidden item is an exact image, and other images are generated to look nearly identical to it — you must compare details before deciding to press.' : ''}
          ${v.switch ? `<br/><b>Switch mode:</b> the forbidden item is <b>Mixed</b> — the dimension switches every trial. ${c.learnSwitches !== false ? 'After every correct trial an <b>arrow (← or →)</b> sets the response keys — it points to the side that is now <b>FORBIDDEN</b>. Remember it: the keys flip when the arrow flips. The mapping is shown during practice only.' : 'Key switching is off — the mapping stays fixed.'}` : ''}
          <span data-adaptive-note ${c.adaptive ? '' : 'hidden'}></span>
        </div>
        <button class="btn primary big" data-start>Start</button>
      </div>`;
    root.querySelector('[data-home]').addEventListener('click', (e) => { e.preventDefault(); this.destroy(); ICT.home(); });
    const adaptive = root.querySelector('[data-adaptive]');
    const startMs = root.querySelector('[data-adaptstart]');
    const minMs = root.querySelector('[data-adaptmin]');
    const updateAdaptive = () => {
      startMs.disabled = minMs.disabled = !adaptive.checked;
      minMs.setCustomValidity(adaptive.checked && Number(minMs.value) > Number(startMs.value)
        ? 'Minimum response window must be no greater than the starting response window.' : '');
      const note = root.querySelector('[data-adaptive-note]');
      note.hidden = !adaptive.checked;
      note.textContent = ` Adaptive: starts at ${startMs.value} ms, with a minimum of ${minMs.value} ms. Settings are saved separately for each mode.`;
    };
    adaptive.addEventListener('change', updateAdaptive);
    startMs.addEventListener('input', updateAdaptive);
    minMs.addEventListener('input', updateAdaptive);
    updateAdaptive();
    root.querySelector('[data-start]').addEventListener('click', () => {
      updateAdaptive();
      if (adaptive.checked && (!startMs.reportValidity() || !minMs.reportValidity())) return;
      this.cfg.trials = parseInt(root.querySelector('[data-trials]').value, 10);
      this.cfg.practice = root.querySelector('[data-practice]').checked;
      this.cfg.adaptive = adaptive.checked;
      if (this.cfg.adaptive) {
        this.cfg.adaptStartMs = Number(startMs.value);
        this.cfg.adaptMin = Number(minMs.value);
        this.cfg.adaptMax = Math.max(DEFAULTS.adaptMax, this.cfg.adaptStartMs);
      }
      const tkEl = root.querySelector('[data-twokey]');
      if (tkEl) this.cfg.twoKey = tkEl.checked;
      const fkEl = root.querySelector('[data-forbidkey]');
      if (fkEl) this.cfg.forbidKey = fkEl.value;
      const sdEl = root.querySelector('[data-switchdim]');
      if (sdEl) this.cfg.switchDim = sdEl.value;
      const lsEl = root.querySelector('[data-learnswitches]');
      if (lsEl) this.cfg.learnSwitches = lsEl.checked;
      if (this.cfg.variant === 'switch') this.cfg.twoKey = true;
      const rwEl = root.querySelector('[data-rewards]');
      if (rwEl) this.cfg.rewards = rwEl.checked;
      const vsEl = root.querySelector('[data-varysize]');
      if (vsEl) this.cfg.varySize = vsEl.checked;
      const mcEl = root.querySelector('[data-multicolor]');
      if (mcEl) this.cfg.multiColor = mcEl.checked;
      const simEl = root.querySelector('[data-similar]');
      if (simEl) this.cfg.similar = simEl.checked;
      const capEl = root.querySelector('[data-capacity]');
      if (capEl) this.cfg.capacity = parseInt(capEl.value, 10);
      const siEl = root.querySelector('[data-setimages]');
      if (siEl) this.cfg.setImages = siEl.checked;
      const spEl = root.querySelector('[data-setspan]');
      if (spEl) this.cfg.setSpan = parseInt(spEl.value, 10);
      ICT.saveMode(this.cfg);
      this.begin();
    });
  };

  /* ---------------- setup ---------------- */

  GNG.begin = function () {
    ICT.setActive(true);
    this.stimMs = this.cfg.adaptive ? this.cfg.adaptStartMs : this.cfg.stimMs;
    this.minStimMs = this.stimMs;
    this.log = [];
    this.forbidSide = this.cfg.variant === 'switch'
      ? (Math.random() < 0.5 ? 'left' : 'right')
      : this.cfg.forbidKey;
    if (this.cfg.practice) { this._runPractice(); }
    else { this._runSession(); }
  };

  GNG._runPractice = function () {
    const root = this.root;
    const twoKey = this._usingTwoKey();
    root.innerHTML = `
      <div class="head">
        <a class="head-link" href="https://disboard.org/server/1200540503654010910" target="_blank" rel="noopener">Discord</a>
        <h2>ICT</h2>
        <span class="pill">Practice</span>
      </div>
      <div class="card center-card">
        <h3>Learn the task</h3>
        <p class="desc">
          A <b>rule cue</b> appears first: it shows which item is forbidden for that trial.
          Then an item appears. ${twoKey
            ? `Answer <b>every</b> trial with <b>← or →</b>: one side says <b>FORBIDDEN</b>, the other says
              <b>NOT forbidden</b>. Which side is which is shown under the buttons during practice.`
            : `<b>Press Space</b> when the item is <b>not</b> the forbidden one.
              <b>Do not press</b> when it is the forbidden item.`}
          ${this.cfg.variant === 'switch' && this.cfg.learnSwitches !== false ? `After every correct trial an <b>arrow (← or →)</b> appears and sets the
            response keys — it points to the side that is now <b>FORBIDDEN</b>.` : ''}
          The forbidden item changes every trial.
        </p>
        <button class="btn primary big" data-go>Begin practice</button>
      </div>`;
    root.querySelector('[data-go]').addEventListener('click', () => {
      this._runTrials(ICT.buildGNGSequence(Object.assign({}, this.cfg, { trials: 12 })), () => {
        root.innerHTML = `
          <div class="card center-card">
            <h3>Practice complete</h3>
            <p class="desc">Now the real session — one continuous run, no blocks. ${this.cfg.variant === 'switch'
              ? (this.cfg.learnSwitches !== false
                  ? `Remember: the arrow after each correct trial tells you which side is <b>FORBIDDEN</b> — hold it in mind.`
                  : `The keys stay fixed — just answer <b>every</b> trial with <b>← or →</b>.`)
              : `Keep responding fast; the no-go rule keeps changing.`}</p>
            <button class="btn primary big" data-go>Continue</button>
          </div>`;
        root.querySelector('[data-go]').addEventListener('click', () => this._runSession());
      }, true);
    });
  };

  GNG._runSession = function () {
    this.stimMs = this.cfg.adaptive ? this.cfg.adaptStartMs : this.cfg.stimMs;
    this.minStimMs = this.stimMs;
    const run = () => this._runTrials(ICT.buildGNGSequence(this.cfg), () => this._results(), false);
    if (this.cfg.variant === 'switch') {
      this.forbidSide = Math.random() < 0.5 ? 'left' : 'right';
      this._showSwitchIntro(run);
    } else {
      run();
    }
  };

  /* Switch mode: the response mapping must be learned, so before the first
     trial we reveal the current arrow once. */
  GNG._showSwitchIntro = function (done) {
    const root = this.root;
    const forbid = this.forbidSide === 'left' ? '◀ LEFT' : 'RIGHT ▶';
    const go = this.forbidSide === 'left' ? 'RIGHT ▶' : '◀ LEFT';
    root.innerHTML = `
      <div class="head">
        <a class="head-link" href="https://disboard.org/server/1200540503654010910" target="_blank" rel="noopener">Discord</a>
        <h2>ICT</h2>
        <span class="pill">Switch — learn the switches</span>
      </div>
      <div class="card center-card">
        <h3>Current response keys</h3>
        <div class="switch-intro-arrow">${this.forbidSide === 'left' ? '←' : '→'}</div>
        <p class="desc">
          In this mode you answer <b>every</b> trial with <b>← or →</b>. ${this.cfg.learnSwitches === false
            ? `The mapping is fixed: <b>${forbid} = FORBIDDEN</b> and <b>${go} = NOT forbidden</b>.`
            : `The <b>arrow</b> sets the mapping: it points to the side that is <b>FORBIDDEN</b>. Right now <b>${forbid} = FORBIDDEN</b> and
            <b>${go} = NOT forbidden</b>. After every correct trial a new arrow may flip them — remember it.`}
        </p>
        <button class="btn primary big" data-go>Begin</button>
      </div>`;
    root.querySelector('[data-go]').addEventListener('click', () => done());
  };

  GNG._runTrials = function (trials, done, isPractice) {
    if (!isPractice) {
      this._sessionStartedAt = Date.now();
      this._sessionRecorded = false;
      this._sessionId = global.crypto && global.crypto.randomUUID
        ? global.crypto.randomUUID()
        : `ict:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    }
    this.trials = trials;
    this.isPractice = isPractice;
    this._blockDone = done;
    this.trialIdx = 0;
    const root = this.root;
    const v = VARIANTS[this.cfg.variant];
    const twoKey = this._usingTwoKey();
    const modeLabel = this.cfg.variant === 'switch' ? 'Switch — learn the switches' : v.label + ' go/no-go';
    root.innerHTML = `
      <div class="game">
        <div class="hud">
          <span class="pill">${isPractice ? 'PRACTICE' : modeLabel}</span>
          ${this.cfg.adaptive && !isPractice ? '<span class="pill window-pill" data-window></span>' : ''}
          <span class="progress"><span class="progress-fill" data-fill></span></span>
          <span class="counter" data-counter></span>
        </div>
        <div class="stage">
          <div class="rule-box" data-rule></div>
          <div class="stim" data-stim></div>
          <div class="fixation overlay" data-fixation>+</div>
          <div class="flash overlay" data-flash></div>
          <div class="reveal overlay" data-reveal></div>
          <div class="switch-arrow overlay" data-swarrow></div>
        </div>
        ${this.cfg.rewards ? '<div class="reward-flash" data-reward></div>' : ''}
        ${twoKey
          ? `<div class="key-btns">
              <button class="btn primary key-btn" data-side="left">◀ LEFT</button>
              <button class="btn primary key-btn" data-side="right">RIGHT ▶</button>
            </div>
            <div class="key-legend" data-map-legend></div>`
          : `<button class="btn primary big go-btn" data-go>GO — press if it is NOT the forbidden item</button>`}
      </div>`;
    root.querySelectorAll('[data-side]').forEach(b => b.addEventListener('click', () => this._respond(b.dataset.side, 'button:' + b.dataset.side)));
    const goBtn = root.querySelector('[data-go]');
    if (goBtn) goBtn.addEventListener('click', () => this._respond('go', 'button'));
    this._updateLegend();
    this._trialLoop();
  };

  GNG._trialLoop = function () {
    if (this.trialIdx >= this.trials.length) { this._blockDone(); return; }
    const tr = this.trials[this.trialIdx];
    this.trialIdx++;
    this._updateProgress();
    this._runTrial(tr);
  };

  GNG._updateProgress = function () {
    const root = this.root;
    if (!root.querySelector('[data-fill]')) return;
    const pct = Math.min(100, (this.trialIdx / this.trials.length) * 100);
    root.querySelector('[data-fill]').style.width = pct + '%';
    root.querySelector('[data-counter]').textContent = this.trialIdx + ' / ' + this.trials.length;
    const w = root.querySelector('[data-window]');
    if (w) w.textContent = 'window: ' + Math.round(this.stimMs) + ' ms';
  };

  GNG._runTrial = function (tr) {
    const root = this.root;
    tr.isPractice = this.isPractice;
    this.tr = null;
    this.responded = false;
    root.querySelector('[data-rule]').style.display = 'none';
    root.querySelector('[data-stim]').style.display = 'none';
    this._setOverlay('fixation');
    this._timer(() => {
      if (this._disposed) return;
      const rule = root.querySelector('[data-rule]');
      const isSet = Array.isArray(tr.cue);
      const showCue = isSet ? tr.cueIntro : true;
      rule.innerHTML = showCue
        ? (isSet
            ? `<span class="rule-label">NO-GO:</span>` + tr.cue.map(e => `<span class="set-item">${ICT.renderItem(e.dim, e.item, e.dim === 'image' ? 64 : 54)}</span>`).join('')
            : `<span class="rule-label">NO-GO:</span>${ICT.renderItem(tr.dim, tr.cue, tr.dim === 'image' ? 88 : 56)}`)
        : '';
      rule.style.display = showCue ? '' : 'none';
      this._timer(() => {
        if (this._disposed) return;
        this.stimOnset = performance.now();
        this.tr = tr;
        this.responded = false;
        root.querySelector('[data-rule]').style.display = 'none';
        root.querySelector('[data-stim]').innerHTML = isSet
          ? ICT.renderItem(tr.stimulus.dim, tr.stimulus.item, 130)
          : ICT.renderItem(tr.dim, tr.stimulus, 130);
        root.querySelector('[data-stim]').style.display = '';
        this._setOverlay('none');
        this._setButtons(false);
        const windowMs = this.cfg.adaptive ? this.stimMs : this.cfg.stimMs;
        this._timer(() => this._endWindow(tr), windowMs);
      }, this.cfg.cueMs);
    }, this.cfg.fixMs);
  };

  GNG._endWindow = function (tr) {
    if (this._disposed) return;
    if (!this.responded) {
      tr.response = false;
      tr.rt = null;
      tr.choice = null;
      tr.side = null;
      /* Two-key mode is a forced choice — a missed window is an error on
         every trial, not a passive "withhold". */
      tr.correct = this._usingTwoKey() ? false : tr.isNoGo;
    }
    this._finishTrial(tr);
  };

  GNG._respond = function (side, source) {
    const tr = this.tr;
    if (!tr || this.responded) return;
    this.responded = true;
    tr.rt = performance.now() - this.stimOnset;
    tr.source = source || 'button';
    tr.side = side || null;
    if (this._usingTwoKey()) {
      tr.choice = side === this.forbidSide ? 'forbid' : 'go';
      tr.response = true;
    } else {
      tr.choice = 'go';
      tr.response = true;
    }
    tr.correct = tr.choice === 'go' ? !tr.isNoGo : tr.isNoGo;
    this._finishTrial(tr);
  };

  GNG._finishTrial = function (tr) {
    if (tr.finished) return;
    tr.finished = true;
    this.tr = null;
    this.log.push(tr);
    if (this.cfg.rewards && tr.correct && !tr.isNoGo) this._reward();
    if (this.cfg.adaptive && !tr.isPractice) {
      const s = this.cfg.adaptStep;
      this.stimMs = tr.correct
        ? Math.max(this.cfg.adaptMin, this.stimMs - s)
        : Math.min(this.cfg.adaptMax, this.stimMs + s * 1.5);
      this.minStimMs = Math.min(this.minStimMs, this.stimMs);
    }
    const root = this.root;
    this._setButtons(true);
    const flashEl = root.querySelector('[data-flash]');
    if (flashEl) {
      flashEl.className = 'flash overlay ' + (tr.correct ? 'ok' : 'bad');
      flashEl.textContent = tr.correct ? '✓' : '✗';
      flashEl.style.display = '';
    }
    const revealEl = root.querySelector('[data-reveal]');
    if (revealEl) {
      revealEl.textContent = this._revealLabel(tr);
      revealEl.className = 'reveal overlay';
    }
    if (this.cfg.variant === 'switch' && this.cfg.learnSwitches !== false && tr.correct) this._showArrowCue();
    this._timer(() => {
      if (this._disposed) return;
      if (flashEl) { flashEl.className = 'flash overlay'; flashEl.textContent = ''; }
      if (revealEl) revealEl.textContent = '';
      root.querySelector('[data-stim]').style.display = 'none';
      root.querySelector('[data-rule]').style.display = 'none';
      this._timer(() => this._trialLoop(), this.cfg.itiMs);
    }, this.cfg.revealMs);
  };

  GNG._setOverlay = function (which) {
    const root = this.root;
    const fix = root.querySelector('[data-fixation]');
    const flash = root.querySelector('[data-flash]');
    const arrow = root.querySelector('[data-swarrow]');
    if (fix) fix.style.display = which === 'fixation' ? '' : 'none';
    if (flash) flash.style.display = 'none';
    if (arrow) arrow.style.display = 'none';
  };

  /* Reward on a correct go: whole-screen green flash + a bright chime. The
     point is to make the go response rewarding, so the no-go rule has to
     inhibit a genuinely rewarding, prepotent action. */
  GNG._reward = function () {
    const root = this.root;
    const el = root.querySelector('[data-reward]');
    if (el) {
      el.classList.add('on');
      this._timer(() => { if (el) el.classList.remove('on'); }, 400);
    }
    this._playChime();
  };

  GNG._playChime = function () {
    try {
      const AC = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
      if (!AC) return;
      if (!this._audio) this._audio = new AC();
      const ctx = this._audio;
      const now = ctx.currentTime;
      const notes = [
        [783.99, 0.00, 0.28, 0.30],   // G5
        [1174.66, 0.00, 0.24, 0.24],  // D6 (fifth)
        [1567.98, 0.05, 0.20, 0.16]   // G6
      ];
      notes.forEach(([freq, delay, dur, vol]) => {
        const t0 = now + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
      });
    } catch (e) { /* audio is optional */ }
  };

  GNG._handleKey = function (e) {
    if (this._disposed) return;
    if (this._usingTwoKey()) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (this.tr && !this.responded) this._respond(e.key === 'ArrowLeft' ? 'left' : 'right', 'key:' + e.key);
      }
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (this.tr && !this.responded) this._respond('go', 'key:' + e.key);
    }
  };

  /* ---------------- results ---------------- */

  GNG._recordSession = function (endedEarly) {
    if (this._sessionStartedAt === null || this._sessionRecorded) return;
    this._sessionRecorded = true;
    const real = (this.log || []).filter(t => !t.isPractice);
    if (!real.length) return;
    const completedAt = Date.now();
    const startedAt = Math.min(completedAt, Math.max(completedAt - 86400000, this._sessionStartedAt));
    const responseTimes = real.filter(t => t.response && Number.isFinite(t.rt)).map(t => t.rt);
    ICT.notifySuite('session-complete', { session: {
      sessionId: this._sessionId,
      startedAt: new Date(startedAt).toISOString(),
      completedAt: new Date(completedAt).toISOString(),
      durationSec: (completedAt - startedAt) / 1000,
      mode: this.cfg.variant,
      adaptive: !!this.cfg.adaptive,
      startingWindowMs: this.cfg.adaptive ? this.cfg.adaptStartMs : this.cfg.stimMs,
      minimumWindowMs: this.cfg.adaptMin,
      fastestIntervalMs: this.minStimMs,
      endingIntervalMs: this.stimMs,
      correctCount: real.filter(t => t.correct).length,
      totalAnswers: real.length,
      averageResponseTimeMs: responseTimes.length ? ICT.mean(responseTimes) : 0,
      endedEarly: !!endedEarly,
    } });
  };

  GNG._summarize = function (trials) {
    const go = trials.filter(t => !t.isNoGo);
    const nogo = trials.filter(t => t.isNoGo);
    const twoKey = this._usingTwoKey();
    const hits = go.filter(t => t.choice === 'go');
    const falseAlarms = nogo.filter(t => t.choice === 'go');
    const correctRejections = twoKey
      ? nogo.filter(t => t.choice === 'forbid')
      : nogo.filter(t => !t.response);
    const wrongKey = twoKey ? go.filter(t => t.choice === 'forbid') : [];
    const noResp = trials.filter(t => !t.response);
    const goRTs = hits.map(t => t.rt);
    return {
      n: trials.length, nGo: go.length, nNoGo: nogo.length, twoKey,
      hits: hits.length, omissions: go.length - hits.length,
      falseAlarms: falseAlarms.length, correctRejections: correctRejections.length,
      wrongKey: wrongKey.length, noResp: noResp.length,
      hitRate: go.length ? hits.length / go.length : null,
      omissionRate: go.length ? (go.length - hits.length) / go.length : null,
      faRate: nogo.length ? falseAlarms.length / nogo.length : null,
      inhibitionSuccess: nogo.length ? correctRejections.length / nogo.length : null,
      meanGoRT: ICT.mean(goRTs),
      medianGoRT: ICT.median(goRTs),
      sdGoRT: ICT.sd(goRTs),
      dprime: go.length && nogo.length ? ICT.dprime(hits.length / go.length, falseAlarms.length / nogo.length) : null
    };
  };

  GNG._results = function () {
    this._recordSession(false);
    ICT.setActive(false);
    const root = this.root;
    const v = VARIANTS[this.cfg.variant];
    const real = this.log.filter(t => !t.isPractice);
    const s = this._summarize(real);

    root.innerHTML = `
      <div class="head">
        <a class="head-link" href="https://disboard.org/server/1200540503654010910" target="_blank" rel="noopener">Discord</a>
        <h2>ICT</h2>
        <span class="pill">Results — ${v.label} go/no-go</span>
        <div class="head-links">
          <a class="head-link" href="#" data-home>Home</a>
          <a class="head-link" href="#" data-export-json>Export JSON</a>
          <a class="head-link" href="#" data-export-csv>Export CSV</a>
        </div>
      </div>
      <div class="results">
        <div class="metric-grid">
          <div class="metric"><b>${ICT.pct(s.hitRate)}</b><span>go hits</span></div>
          <div class="metric"><b>${ICT.pct(s.faRate)}</b><span>false alarms</span></div>
          <div class="metric key"><b>${ICT.pct(s.inhibitionSuccess)}</b><span>inhibition success (no-go)</span></div>
          <div class="metric"><b>${ICT.fmt(s.meanGoRT)} ms</b><span>mean go RT</span></div>
          <div class="metric"><b>${ICT.pct(s.omissionRate)}</b><span>go omissions</span></div>
          <div class="metric"><b>${ICT.fmt(s.dprime, 2)}</b><span>d' (sensitivity)</span></div>
        </div>
        ${s.twoKey ? `<div class="metric-grid">
          <div class="metric"><b>${s.wrongKey}</b><span>wrong-key errors (go)</span></div>
          <div class="metric"><b>${s.noResp}</b><span>no response</span></div>
        </div>` : ''}
        ${this.cfg.adaptive ? `<div class="metric-grid">
          <div class="metric"><b>${ICT.fmt(this.stimMs)} ms</b><span>final response window</span></div>
          <div class="metric"><b>${ICT.fmt(this.minStimMs)} ms</b><span>fastest window reached</span></div>
        </div>` : ''}
        <div class="card">
          <h3>Summary</h3>
          <table class="table">
            <tr><td>Trials</td><td>${s.n} (${s.nGo} go, ${s.nNoGo} no-go)</td></tr>
            <tr><td>Go hits / omissions</td><td>${s.hits} / ${s.omissions}</td></tr>
            <tr><td>No-go correct rejections / false alarms</td><td>${s.correctRejections} / ${s.falseAlarms}</td></tr>
            <tr><td>Median go RT</td><td>${ICT.fmt(s.medianGoRT)} ms</td></tr>
            <tr><td>SD of go RT</td><td>${ICT.fmt(s.sdGoRT)} ms</td></tr>
            ${s.twoKey ? `<tr><td>Wrong-key errors (go)</td><td>${s.wrongKey}</td></tr>
            <tr><td>No response</td><td>${s.noResp}</td></tr>` : ''}
          </table>
        </div>
        <div class="card">
          <button class="btn primary" data-home2>Back to home</button>
        </div>
      </div>`;

    root.querySelector('[data-home]').addEventListener('click', (e) => { e.preventDefault(); this.destroy(); ICT.home(); });
    root.querySelector('[data-home2]').addEventListener('click', () => { this.destroy(); ICT.home(); });
    root.querySelector('[data-export-json]').addEventListener('click', (e) => {
      e.preventDefault();
      ICT.download('ict-gng-results.json', JSON.stringify(this._exportPayload(), null, 2), 'application/json');
    });
    root.querySelector('[data-export-csv]').addEventListener('click', (e) => {
      e.preventDefault();
      ICT.download('ict-gng-trials.csv', this._exportCSV(), 'text/csv');
    });
  };

  GNG._exportPayload = function () {
    return {
      app: 'ICT', mode: 'gng', variant: this.cfg.variant, cfg: this.cfg,
      generatedAt: new Date().toISOString(),
      summary: this._summarize(this.log.filter(t => !t.isPractice)),
      trials: this.log.map(t => ({
        dim: t.dim, cue: t.cue, stimulus: t.stimulus, isNoGo: t.isNoGo, isPractice: t.isPractice,
        response: !!t.response, rt: t.rt, correct: !!t.correct, source: t.source || null,
        choice: t.choice || null, side: t.side || null
      }))
    };
  };

  GNG._exportCSV = function () {
    const lines = ['trial,isPractice,dim,cue,stimulus,isNoGo,response,rt,correct,source,choice,side'];
    const lab = (x) => {
      if (x == null) return '';
      if (Array.isArray(x)) return x.map(lab).join('|');
      if (typeof x === 'object') {
        if (x.id !== undefined) return x.id;
        if (x.item !== undefined) return (x.item && typeof x.item === 'object') ? x.item.id : x.dim + ':' + x.item;
        return '';
      }
      return x;
    };
    this.log.forEach((t, i) => {
      lines.push([i + 1, t.isPractice, t.dim, lab(t.cue), lab(t.stimulus), t.isNoGo, !!t.response, t.rt, !!t.correct, t.source || '', t.choice || '', t.side || ''].join(','));
    });
    return lines.join('\n');
  };

})(typeof window !== 'undefined' ? window : globalThis);
