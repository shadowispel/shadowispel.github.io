/* Spelhallen – gemensamma hjälpfunktioner: lagring, rekord, ljud, ljudknapp.
 * Används av alla spel via window.Spelhallen.
 */
(function () {
  'use strict';
  const NS = 'spelhallen:';

  // ---------- Lagring (tål privat läge / blockerad lagring) ----------
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(NS + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch (e) { /* ignorera */ }
    }
  };

  // ---------- Rekord & statistik ----------
  function best(gameId) { return store.get('best:' + gameId, 0) || 0; }
  /** Sparar poäng. Returnerar { best, isNew }. */
  function submit(gameId, score) {
    score = Math.floor(score || 0);
    const prev = best(gameId);
    const plays = store.get('plays:' + gameId, 0) + 1;
    store.set('plays:' + gameId, plays);
    if (score > prev) {
      store.set('best:' + gameId, score);
      updateBestLabel(score);
      return { best: score, isNew: prev > 0 || score > 0 };
    }
    return { best: prev, isNew: false };
  }
  function plays(gameId) { return store.get('plays:' + gameId, 0) || 0; }
  function updateBestLabel(value) {
    const el = document.getElementById('best');
    if (el) el.textContent = Number(value).toLocaleString('sv-SE');
  }

  // ---------- Ljud (syntetiserat med WebAudio, inga filer) ----------
  let ctx = null;
  let master = null;
  let muted = store.get('muted', false);

  function audio() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(opt) {
    if (muted) return;
    const a = audio(); if (!a) return;
    const o = Object.assign({ freq: 440, to: null, type: 'square', dur: 0.1, vol: 0.12, delay: 0 }, opt);
    const t0 = a.currentTime + o.delay;
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + o.dur + 0.02);
  }

  function noise(opt) {
    if (muted) return;
    const a = audio(); if (!a) return;
    const o = Object.assign({ dur: 0.2, vol: 0.2, freq: 1200, delay: 0 }, opt);
    const t0 = a.currentTime + o.delay;
    const len = Math.max(1, Math.floor(a.sampleRate * o.dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.freq;
    const g = a.createGain(); g.gain.value = o.vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  // Begränsa hur ofta samma ljud spelas (undvik öronbedövande spam)
  const lastPlayed = {};
  const SOUNDS = {
    click:   () => tone({ freq: 660, dur: 0.05, vol: 0.08, type: 'triangle' }),
    select:  () => tone({ freq: 520, to: 780, dur: 0.08, vol: 0.08, type: 'triangle' }),
    shoot:   () => tone({ freq: 900, to: 300, dur: 0.07, vol: 0.05, type: 'square' }),
    hit:     () => tone({ freq: 220, to: 90, dur: 0.09, vol: 0.12, type: 'sawtooth' }),
    hurt:    () => { tone({ freq: 300, to: 80, dur: 0.25, vol: 0.18, type: 'sawtooth' }); noise({ dur: 0.15, vol: 0.12, freq: 900 }); },
    explode: () => noise({ dur: 0.35, vol: 0.25, freq: 700 }),
    coin:    () => { tone({ freq: 988, dur: 0.06, vol: 0.09, type: 'square' }); tone({ freq: 1319, dur: 0.12, vol: 0.09, type: 'square', delay: 0.06 }); },
    jump:    () => tone({ freq: 300, to: 620, dur: 0.12, vol: 0.09, type: 'square' }),
    power:   () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.09, vol: 0.09, type: 'triangle', delay: i * 0.06 })),
    win:     () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ freq: f, dur: 0.16, vol: 0.1, type: 'triangle', delay: i * 0.09 })),
    lose:    () => [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.22, vol: 0.12, type: 'sawtooth', delay: i * 0.15 })),
    step:    () => tone({ freq: 140, dur: 0.03, vol: 0.04, type: 'triangle' }),
    zap:     () => { tone({ freq: 1400, to: 200, dur: 0.15, vol: 0.07, type: 'sawtooth' }); noise({ dur: 0.08, vol: 0.06, freq: 4000 }); },
    freeze:  () => tone({ freq: 1800, to: 900, dur: 0.18, vol: 0.05, type: 'sine' }),
    boom:    () => { noise({ dur: 0.5, vol: 0.3, freq: 400 }); tone({ freq: 120, to: 40, dur: 0.4, vol: 0.2, type: 'sine' }); }
  };

  function sfx(name, minGapMs) {
    if (muted || !SOUNDS[name]) return;
    const now = performance.now();
    const gap = minGapMs == null ? 35 : minGapMs;
    if (lastPlayed[name] && now - lastPlayed[name] < gap) return;
    lastPlayed[name] = now;
    try { SOUNDS[name](); } catch (e) { /* ljud får aldrig krascha spelet */ }
  }

  // ---------- Ljudknapp ----------
  function setMuted(v) {
    muted = !!v;
    store.set('muted', muted);
    document.querySelectorAll('[data-mute]').forEach(b => {
      b.textContent = muted ? '🔇' : '🔊';
      b.setAttribute('aria-label', muted ? 'Slå på ljud' : 'Stäng av ljud');
      b.title = (muted ? 'Slå på ljud' : 'Stäng av ljud') + ' (M)';
    });
  }
  function toggleMute() { setMuted(!muted); if (!muted) sfx('click'); }

  function init(gameId) {
    setMuted(muted);
    document.querySelectorAll('[data-mute]').forEach(b => b.addEventListener('click', e => { e.currentTarget.blur(); toggleMute(); }));
    window.addEventListener('keydown', e => {
      if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        toggleMute();
      }
    });
    // Låt första interaktionen låsa upp ljudet (krav i webbläsare)
    const unlock = () => { audio(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    if (gameId) updateBestLabel(best(gameId));
  }

  window.Spelhallen = {
    store, best, submit, plays, sfx, init, toggleMute,
    isMuted: () => muted,
    fmt: n => Number(Math.floor(n)).toLocaleString('sv-SE')
  };
})();
