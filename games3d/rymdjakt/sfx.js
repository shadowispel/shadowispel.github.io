/**
 * Rymdjakt – syntetiserade ljudeffekter ovanpå kitets Audio (med panorering och gränser mot ljudspam).
 */
export const MUSIC = {
  meny:   { tempo: 70, root: 50, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 2, 4, 6], [5, 7, 9], [3, 5, 7, 9], [4, 6, 8]], pad: 'sine', arp: true, arpEvery: 2, bass: true, arpType: 'sine', arpVol: 0.022 },
  patrull:{ tempo: 84, root: 52, scale: [0, 2, 3, 5, 7, 9, 10], chords: [[0, 2, 4], [6, 8, 10], [3, 5, 7], [4, 6, 8]], pad: 'triangle', arp: true, arpEvery: 2, bass: true, arpType: 'sine', arpVol: 0.02 },
  strid:  { tempo: 138, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]], pad: 'sawtooth', arp: true, bass: true, drums: true, arpVol: 0.018 },
  hot:    { tempo: 112, root: 47, scale: [0, 1, 3, 5, 7, 8, 10], chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [6, 8, 10]], pad: 'sawtooth', arp: true, bass: true, drums: true, arpVol: 0.016 },
  final:  { tempo: 146, root: 43, scale: [0, 2, 3, 5, 7, 8, 11], chords: [[0, 2, 4], [5, 7, 9], [6, 8, 10], [4, 6, 8]], pad: 'sawtooth', arp: true, bass: true, drums: true, arpVol: 0.02 },
  seger:  'victory'
};

export class Sfx {
  constructor(audio) { this.a = audio; this.last = {}; this.engine = null; this.wind = null; this.window = []; }
  get muted() { return this.a.muted; }
  play(name, o = {}) {
    const A = this.a;
    if (A.muted) return;
    const now = performance.now();
    const gap = o.gap != null ? o.gap : (name.startsWith('laser_') ? 28 : 45);
    if (this.last[name] && now - this.last[name] < gap) return;
    // max ca 14 ljud per 100 ms
    while (this.window.length && now - this.window[0] > 100) this.window.shift();
    if (this.window.length > 14 && !o.force) return;
    this.window.push(now);
    this.last[name] = now;
    const v = o.vol == null ? 1 : o.vol, pan = o.pan || 0;
    const pit = o.pitch || 1;
    const T = (x) => A.tone(Object.assign({ pan }, x, { vol: (x.vol || 0.1) * v, freq: x.freq * pit, to: x.to ? x.to * pit : null }));
    const N = (x) => A.noise(Object.assign({ pan }, x, { vol: (x.vol || 0.1) * v }));
    try {
      switch (name) {
        case 'laser_pulse': T({ freq: 1500, to: 420, dur: 0.085, vol: 0.045, type: 'square' }); T({ freq: 2900, to: 900, dur: 0.05, vol: 0.016, type: 'sawtooth' }); break;
        case 'laser_heavy': T({ freq: 720, to: 150, dur: 0.22, vol: 0.075, type: 'sawtooth' }); N({ dur: 0.12, vol: 0.06, freq: 2200 }); break;
        case 'laser_ion': T({ freq: 2300, to: 1100, dur: 0.11, vol: 0.045, type: 'sine' }); T({ freq: 3400, to: 1700, dur: 0.07, vol: 0.02, type: 'triangle' }); break;
        case 'laser_scatter': N({ dur: 0.13, vol: 0.1, freq: 3200, to: 700, type: 'bandpass' }); T({ freq: 950, to: 280, dur: 0.09, vol: 0.05, type: 'square' }); break;
        case 'laser_enemy': T({ freq: 880, to: 240, dur: 0.1, vol: 0.04, type: 'sawtooth' }); break;
        case 'laser_turret': T({ freq: 560, to: 170, dur: 0.15, vol: 0.05, type: 'sawtooth' }); break;
        case 'shieldHit': T({ freq: 1900, to: 600, dur: 0.12, vol: 0.06, type: 'sine' }); N({ dur: 0.08, vol: 0.05, freq: 5000, type: 'highpass' }); break;
        case 'hullHit': N({ dur: 0.2, vol: 0.18, freq: 1100, to: 200 }); T({ freq: 170, to: 60, dur: 0.22, vol: 0.1, type: 'sawtooth' }); break;
        case 'impact': N({ dur: 0.06, vol: 0.06, freq: 3000 }); break;
        case 'hitConfirm': T({ freq: 2600, dur: 0.03, vol: 0.022, type: 'triangle' }); break;
        case 'kill': T({ freq: 880, to: 1500, dur: 0.12, vol: 0.05, type: 'triangle' }); T({ freq: 1320, dur: 0.1, vol: 0.04, type: 'triangle', delay: 0.08 }); break;
        case 'explode': N({ dur: 0.55, vol: 0.28, freq: 1000, to: 110 }); T({ freq: 120, to: 38, dur: 0.45, vol: 0.16, type: 'sine' }); break;
        case 'boom': N({ dur: 0.9, vol: 0.34, freq: 600, to: 60 }); T({ freq: 85, to: 28, dur: 0.75, vol: 0.24, type: 'sine' }); N({ dur: 0.4, vol: 0.12, freq: 3000, to: 500, delay: 0.05 }); break;
        case 'bigboom': N({ dur: 1.8, vol: 0.45, freq: 420, to: 35 }); T({ freq: 62, to: 22, dur: 1.6, vol: 0.32, type: 'sine' }); N({ dur: 1.0, vol: 0.2, freq: 1800, to: 200, delay: 0.25 }); N({ dur: 0.9, vol: 0.18, freq: 900, to: 90, delay: 0.6 }); break;
        case 'missileBoom': N({ dur: 0.5, vol: 0.26, freq: 1400, to: 140 }); T({ freq: 140, to: 45, dur: 0.35, vol: 0.13, type: 'sine' }); break;
        case 'missile': N({ dur: 0.6, vol: 0.14, freq: 400, to: 3200, type: 'bandpass' }); T({ freq: 220, to: 640, dur: 0.3, vol: 0.04, type: 'sawtooth' }); break;
        case 'flare': N({ dur: 0.35, vol: 0.12, freq: 6000, type: 'highpass' }); for (let i = 0; i < 3; i++) T({ freq: 500, to: 200, dur: 0.06, vol: 0.05, type: 'square', delay: i * 0.08 }); break;
        case 'lockBeep': T({ freq: 1250, dur: 0.045, vol: 0.04, type: 'square' }); break;
        case 'locked': T({ freq: 1700, dur: 0.14, vol: 0.05, type: 'square' }); T({ freq: 2200, dur: 0.14, vol: 0.03, type: 'square', delay: 0.15 }); break;
        case 'warn': T({ freq: 920, dur: 0.1, vol: 0.07, type: 'square' }); T({ freq: 690, dur: 0.1, vol: 0.07, type: 'square', delay: 0.12 }); break;
        case 'radio': N({ dur: 0.07, vol: 0.05, freq: 2600, type: 'bandpass' }); T({ freq: 1150, dur: 0.04, vol: 0.025, type: 'sine', delay: 0.05 }); break;
        case 'warp': N({ dur: 0.9, vol: 0.18, freq: 200, to: 4000, type: 'bandpass' }); T({ freq: 70, to: 900, dur: 0.6, vol: 0.06, type: 'sawtooth' }); break;
        case 'mineArm': for (let i = 0; i < 3; i++) T({ freq: 1600, dur: 0.05, vol: 0.07, type: 'square', delay: i * 0.12 }); break;
        case 'scrape': N({ dur: 0.3, vol: 0.22, freq: 700, to: 200 }); T({ freq: 90, to: 50, dur: 0.25, vol: 0.12, type: 'sawtooth' }); break;
        case 'overheat': T({ freq: 320, to: 140, dur: 0.35, vol: 0.08, type: 'square' }); N({ dur: 0.4, vol: 0.08, freq: 5000, type: 'highpass' }); break;
        case 'boostOn': N({ dur: 0.5, vol: 0.12, freq: 300, to: 2400, type: 'bandpass' }); break;
        case 'empty': T({ freq: 200, dur: 0.08, vol: 0.06, type: 'square' }); break;
        case 'objective': [523, 659, 784, 1047].forEach((f, i) => T({ freq: f, dur: 0.12, vol: 0.07, type: 'triangle', delay: i * 0.07 })); break;
        case 'failObj': [400, 300, 200].forEach((f, i) => T({ freq: f, dur: 0.18, vol: 0.08, type: 'sawtooth', delay: i * 0.12 })); break;
        case 'order': T({ freq: 900, dur: 0.05, vol: 0.05, type: 'triangle' }); T({ freq: 1200, dur: 0.07, vol: 0.05, type: 'triangle', delay: 0.06 }); break;
        case 'target': T({ freq: 1400, to: 1800, dur: 0.05, vol: 0.035, type: 'triangle' }); break;
        default: A.play(name, { vol: v, pan }); break;
      }
    } catch (e) { /* ljud får aldrig krascha spelet */ }
  }
  startEngine() {
    this.stopEngine();
    this.engine = this.a.loop('engine'); this.wind = this.a.loop('wind');
    this.engine.set({ freq: 55, vol: 0.0 }); this.wind.set({ freq: 400, vol: 0 });
  }
  setEngine(speedFrac, boost, alive = true) {
    if (!this.engine) return;
    if (!alive) { this.engine.set({ vol: 0 }); this.wind.set({ vol: 0 }); return; }
    this.engine.set({ freq: 42 + speedFrac * 40 + (boost ? 25 : 0), vol: 0.05 + speedFrac * 0.04 + (boost ? 0.05 : 0), filter: 300 + speedFrac * 500 + (boost ? 900 : 0) });
    this.wind.set({ freq: 300 + speedFrac * 600 + (boost ? 1400 : 0), vol: boost ? 0.09 : 0.012 + speedFrac * 0.015 });
  }
  stopEngine() { if (this.engine) { this.engine.stop(); this.engine = null; } if (this.wind) { this.wind.stop(); this.wind = null; } }
}
