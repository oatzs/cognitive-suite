(function (global) {
  'use strict';
  const ICT = global.ICT = global.ICT || {};

  const MESSAGE_SOURCE = 'cognitive-suite:ict';

  ICT.notifySuite = function (type, detail) {
    if (global.parent === global) return;
    global.parent.postMessage(Object.assign({ source: MESSAGE_SOURCE, type }, detail || {}), '*');
  };

  ICT.setActive = function (active) {
    const isActive = Boolean(active);
    const existing = document.querySelector('[data-suite-exit]');
    root.classList.toggle('session-active', isActive);

    if (isActive && !existing) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn suite-exit';
      button.dataset.suiteExit = '';
      button.textContent = 'End session';
      button.addEventListener('click', () => {
        if (!global.confirm('End the current ICT session?')) return;
        ICT.GNG.destroy();
        ICT.home();
      });
      document.body.appendChild(button);
    } else if (!isActive && existing) {
      existing.remove();
    }

    ICT.notifySuite('active-change', { active: isActive });
  };

  ICT.defaults = {
    variant: 'color', trials: 120, practice: true
  };

  ICT.save = function (key, val) {
    try { localStorage.setItem('ict.' + key, JSON.stringify(val)); } catch (e) { }
  };
  ICT.load = function (key) {
    try { const v = localStorage.getItem('ict.' + key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  };
  ICT.mergeCfg = function (key, defaults) {
    return Object.assign({}, defaults, ICT.load(key) || {});
  };

  ICT.download = function (filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const root = document.getElementById('screen');

  const CARDS = {
    color:  { title: 'Color go/no-go',      desc: 'Rule cue: a forbidden color each trial. Press for any other color.' },
    shape:  { title: 'Shape go/no-go',      desc: 'Rule cue: a forbidden shape each trial. Press for any other shape.' },
    letter: { title: 'Letter go/no-go',     desc: 'Rule cue: a forbidden letter each trial. Press for any other letter.' },
    number: { title: 'Number go/no-go',     desc: 'Rule cue: a forbidden number each trial. Press for any other number.' },
    image:  { title: 'Image go/no-go',      desc: 'Rule cue: a randomly generated image each trial (random shape, color, pattern, size, rotation). Press for any different image. Optional multi-color and similarity-engine difficulty.' },
    set:    { title: 'Set go/no-go',        desc: 'Rule cue: a set of forbidden items — stop if the item matches ANY of them. Set the capacity and how many trials to remember the set for; optional image sets.' },
    mixed:  { title: 'Mixed go/no-go',      desc: 'Colors, shapes, letters and numbers interleaved — the forbidden item switches dimension every trial.' },
    switch: { title: 'Switch — learn the switches', desc: 'Two-key go/no-go on Mixed dimensions — the forbidden item switches dimension every trial. After every correct trial an arrow (←/→) sets which side is FORBIDDEN; the key switching can be toggled off in settings.' }
  };

  ICT.home = function () {
    ICT.setActive(false);
    root.innerHTML = `
      <div class="head">
        <a class="head-link" href="https://disboard.org/server/1200540503654010910" target="_blank" rel="noopener">Discord</a>
        <h2>ICT</h2>
        <span class="pill">Context-Dependent Inhibitory Control Training</span>
      </div>
      <p class="lead">
        A go/no-go task where <b>inhibition depends on the current rule</b>. Each trial shows a rule cue
        (the forbidden item for that trial), then an item — press for go, withhold for the forbidden item
        (or answer <b>every</b> trial with <b>←/→</b> via the two-key option). The rule changes
        <b>every trial</b> and stopping is <b>frequent (50%)</b>, so stopping is always
        anticipated — fast, top-down, rule-gated inhibitory control.
      </p>
      <div class="home">
        ${Object.keys(CARDS).map(k => `
          <div class="card mode">
            <h3>${CARDS[k].title}</h3>
            <p class="desc">${CARDS[k].desc}</p>
            <button class="btn primary" data-variant="${k}">Start</button>
          </div>`).join('')}
      </div>`;


    root.querySelectorAll('[data-variant]').forEach(b => b.addEventListener('click', () => {
      const cfg = ICT.mergeCfg('ict', ICT.defaults);
      cfg.variant = b.dataset.variant;
      ICT.GNG.start(cfg, root);
    }));
  };

  function ready() {
    ICT.home();
    ICT.notifySuite('ready', { active: false });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();

})(typeof window !== 'undefined' ? window : globalThis);
