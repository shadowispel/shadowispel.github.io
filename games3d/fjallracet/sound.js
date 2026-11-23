/**
 * Fjällracet – egen motorsyntes (varmare än kitets råa såg+fyrkant).
 * Två lätt ostämda sågtandsvågor + en triangel en oktav upp, mjukt lågpassfiltrerade med en
 * "kaross"-resonans runt 320 Hz (hörs även i laptophögtalare) och en svag tändpuls. Ger ett runt, brummande ljud i stället för surr.
 * Samma gränssnitt som kitets audio.loop(): { set({ freq, vol, filter }), stop() }.
 */
export function engineVoice(audio, opts = {}) {
  const a = audio._ensure ? audio._ensure() : audio.ctx;
  if (!a || !audio.sfxBus) return { set() {}, stop() {} };
  const out = a.createGain(); out.gain.value = 0; out.connect(audio.sfxBus);
  const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 1.1;
  const body = a.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = opts.body || 380; body.Q.value = 0.7; body.gain.value = 7;
  const rumble = a.createBiquadFilter(); rumble.type = 'highpass'; rumble.frequency.value = 75; rumble.Q.value = 0.5;
  const hiCut = a.createBiquadFilter(); hiCut.type = 'lowpass'; hiCut.frequency.value = 2200; hiCut.Q.value = 0.5;
  const am = a.createGain(); am.gain.value = 1;
  lp.connect(rumble); rumble.connect(body); body.connect(hiCut); hiCut.connect(am); am.connect(out);
  const osc = (type, gain, detune = 0) => {
    const o = a.createOscillator(); o.type = type; o.detune.value = detune;
    const g = a.createGain(); g.gain.value = gain; o.connect(g); g.connect(lp); o.start(); return o;
  };
  const o1 = osc('sawtooth', 0.45), o2 = osc('sawtooth', 0.32, 11), sub = osc('triangle', 0.28);
  // tändpuls: svag amplitudmodulering på halva grundtonen
  const lfo = a.createOscillator(); lfo.type = 'sine';
  const lfoG = a.createGain(); lfoG.gain.value = 0.1; lfo.connect(lfoG); lfoG.connect(am.gain); lfo.start();
  const nodes = [o1, o2, sub, lfo];
  let stopped = false;
  return {
    set({ freq, vol, filter } = {}) {
      if (stopped) return;
      const t = a.currentTime;
      if (freq != null) {
        o1.frequency.setTargetAtTime(freq, t, 0.04); o2.frequency.setTargetAtTime(freq, t, 0.04);
        sub.frequency.setTargetAtTime(freq * 2, t, 0.04); lfo.frequency.setTargetAtTime(freq / 2, t, 0.04);
      }
      if (filter != null) lp.frequency.setTargetAtTime(filter, t, 0.06);
      if (vol != null) out.gain.setTargetAtTime(audio.muted ? 0 : vol, t, 0.05);
    },
    stop() {
      if (stopped) return; stopped = true;
      out.gain.setTargetAtTime(0, a.currentTime, 0.05);
      setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch (e) {} }); try { out.disconnect(); } catch (e) {} }, 300);
    }
  };
}
