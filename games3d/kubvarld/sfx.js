/** Materialljud och varelseljud byggda på kit-Audio (syntes). */
const MAT = {
  stone: { f: 1900, t: 'bandpass', tone: 180, dur: 0.12, v: 0.22 },
  wood: { f: 900, t: 'lowpass', tone: 240, toneType: 'triangle', dur: 0.13, v: 0.22 },
  grass: { f: 3200, t: 'highpass', dur: 0.12, v: 0.16 },
  dirt: { f: 520, t: 'lowpass', dur: 0.14, v: 0.28 },
  sand: { f: 3800, t: 'highpass', dur: 0.15, v: 0.14 },
  snow: { f: 1400, t: 'lowpass', dur: 0.16, v: 0.18 },
  glass: { f: 5000, t: 'highpass', tone: 2200, toneType: 'sine', dur: 0.1, v: 0.12 },
  wool: { f: 420, t: 'lowpass', dur: 0.12, v: 0.2 },
  leaves: { f: 2600, t: 'highpass', dur: 0.14, v: 0.14 },
  metal: { f: 3000, t: 'bandpass', tone: 920, toneType: 'triangle', dur: 0.14, v: 0.16 },
  water: { f: 1500, t: 'lowpass', dur: 0.3, v: 0.18 }
};
export function matSound(audio, sound, kind, { vol = 1, pan = 0 } = {}) {
  if (!audio || audio.muted) return;
  const m = MAT[sound] || MAT.stone;
  const key = 'm_' + kind;
  const now = performance.now();
  if (kind !== 'break' && audio._last[key] && now - audio._last[key] < 45) return;
  audio._last[key] = now;
  try {
    const r = 0.9 + Math.random() * 0.2;
    if (kind === 'step') {
      audio.noise({ dur: m.dur * 0.6, vol: m.v * 0.35 * vol, freq: m.f * r, type: m.t, pan });
    } else if (kind === 'hit') {
      audio.noise({ dur: m.dur * 0.5, vol: m.v * 0.45 * vol, freq: m.f * r, type: m.t, pan });
      if (m.tone) audio.tone({ freq: m.tone * 1.2 * r, dur: 0.04, vol: 0.03 * vol, type: m.toneType || 'square', pan });
    } else if (kind === 'place') {
      audio.noise({ dur: m.dur * 0.8, vol: m.v * 0.8 * vol, freq: m.f * 0.8 * r, type: m.t, pan });
      audio.tone({ freq: (m.tone || 140) * 0.8 * r, to: (m.tone || 140) * 0.6, dur: 0.06, vol: 0.06 * vol, type: 'triangle', pan });
    } else { // break
      audio.noise({ dur: m.dur * 1.6, vol: m.v * vol, freq: m.f * r, type: m.t, to: m.f * 0.5, pan });
      if (m.tone) audio.tone({ freq: m.tone * r, to: m.tone * 0.6, dur: 0.12, vol: 0.06 * vol, type: m.toneType || 'square', pan });
      if (sound === 'glass') [2400, 3100, 2700].forEach((f, i) => audio.tone({ freq: f * r, dur: 0.08, vol: 0.04 * vol, type: 'sine', delay: i * 0.04, pan }));
    }
  } catch (e) { /* ljud får aldrig krascha spelet */ }
}

export function mobSound(audio, type, kind, { vol = 1, pan = 0 } = {}) {
  if (!audio || audio.muted || vol < 0.03) return;
  try {
    const r = 0.92 + Math.random() * 0.16;
    if (type === 'cow') { // råmande
      if (kind === 'hurt') audio.tone({ freq: 190 * r, to: 130, dur: 0.35, vol: 0.1 * vol, type: 'sawtooth', pan });
      else { audio.tone({ freq: 150 * r, to: 175 * r, dur: 0.35, vol: 0.07 * vol, type: 'sawtooth', attack: 0.12, pan }); audio.tone({ freq: 175 * r, to: 120, dur: 0.6, vol: 0.07 * vol, type: 'sawtooth', delay: 0.33, pan }); }
    } else if (type === 'pig') { // grymtningar
      const n = kind === 'hurt' ? 1 : 2 + (Math.random() * 2 | 0);
      for (let i = 0; i < n; i++) { audio.tone({ freq: (kind === 'hurt' ? 420 : 240) * r, to: 180, dur: 0.09, vol: 0.06 * vol, type: 'square', delay: i * 0.13, pan }); audio.noise({ dur: 0.08, vol: 0.05 * vol, freq: 500, type: 'lowpass', delay: i * 0.13, pan }); }
    } else if (type === 'sheep') {
      if (kind === 'hurt') audio.tone({ freq: 520 * r, to: 380, dur: 0.25, vol: 0.08 * vol, type: 'sawtooth', pan });
      else { audio.tone({ freq: 390 * r, to: 360 * r, dur: 0.18, vol: 0.06 * vol, type: 'sawtooth', pan }); audio.tone({ freq: 400 * r, to: 330 * r, dur: 0.28, vol: 0.06 * vol, type: 'sawtooth', delay: 0.17, pan }); }
    } else if (type === 'chicken') { // kluckande
      const n = kind === 'hurt' ? 1 : 3;
      for (let i = 0; i < n; i++) audio.tone({ freq: (kind === 'hurt' ? 1400 : 900 + i * 120) * r, to: 700, dur: 0.06, vol: 0.045 * vol, type: 'triangle', delay: i * 0.1, pan });
    } else if (type === 'zombie') { // stön
      if (kind === 'hurt') audio.tone({ freq: 160 * r, to: 90, dur: 0.3, vol: 0.12 * vol, type: 'sawtooth', pan });
      else { audio.tone({ freq: 95 * r, to: 70, dur: 0.9, vol: 0.1 * vol, type: 'sawtooth', attack: 0.25, pan }); audio.noise({ dur: 0.8, vol: 0.07 * vol, freq: 350, type: 'lowpass', pan }); }
    } else if (type === 'skeleton') { // skrammel
      for (let i = 0; i < (kind === 'hurt' ? 3 : 5); i++) audio.noise({ dur: 0.03, vol: 0.09 * vol, freq: 2400 + Math.random() * 1600, type: 'bandpass', delay: i * 0.05 + Math.random() * 0.02, pan });
    } else if (type === 'spider') { // väsning
      if (kind === 'hurt') audio.noise({ dur: 0.2, vol: 0.12 * vol, freq: 3200, type: 'highpass', pan });
      else { audio.noise({ dur: 0.5, vol: 0.08 * vol, freq: 4200, type: 'highpass', to: 2400, pan }); for (let i = 0; i < 4; i++) audio.tone({ freq: 2600 * r, dur: 0.02, vol: 0.02 * vol, type: 'square', delay: 0.1 + i * 0.06, pan }); }
    }
    if (kind === 'death') audio.noise({ dur: 0.35, vol: 0.12 * vol, freq: 600, to: 120, pan });
  } catch (e) { }
}

export function birdChirp(audio, vol = 1) {
  if (!audio || audio.muted) return;
  const b = 2400 + Math.random() * 1600, n = 2 + (Math.random() * 3 | 0), pan = Math.random() * 1.6 - 0.8;
  for (let i = 0; i < n; i++) audio.tone({ freq: b, to: b * (1.15 + Math.random() * 0.2), dur: 0.07, vol: 0.018 * vol, type: 'sine', delay: i * 0.11, pan });
}
