/**
 * Fjällracet – HUD: hastighetsmätare, varv, placering, tider, minikarta, boostmätare, meddelanden.
 */
export function fmtTime(t) {
  if (!(t >= 0) || !isFinite(t)) return '–:––.–';
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
}
const CAR_DOT = ['#ff5a6e', '#39d5ff', '#ffcc33', '#4ade80', '#b083ff', '#ff9a3a', '#f0f0f0', '#ff7ad0'];

export class Hud {
  constructor(el) {
    this.el = el;
    el.innerHTML = `
      <div class="fj-tl">
        <div class="fj-pos"><b id="hPos">1</b><span id="hPosOf">/8</span><small>PLACERING</small></div>
        <div class="fj-lap"><small>VARV</small><b id="hLap">1/3</b></div>
        <ol class="fj-list" id="hList"></ol>
      </div>
      <div class="fj-tr">
        <div class="fj-times">
          <div><small>TOTAL</small><b id="hTotal">0:00.00</b></div>
          <div><small>VARV</small><b id="hLapT">0:00.00</b></div>
          <div><small>BÄSTA</small><b id="hBest">–:––.–</b></div>
        </div>
        <canvas id="hMap" width="180" height="180"></canvas>
      </div>
      <div class="fj-speedo"><canvas id="hSpeed" width="220" height="220"></canvas></div>
      <div class="fj-center" id="hCenter"></div>
      <div class="fj-wrong hidden" id="hWrong">FEL HÅLL!</div>
      <div class="fj-drift hidden" id="hDrift"></div>
      <div class="fj-tip hidden" id="hTip"></div>
      <div class="fj-msg" id="hMsg"></div>`;
    const $ = (id) => el.querySelector('#' + id);
    this.e = { pos: $('hPos'), posOf: $('hPosOf'), lap: $('hLap'), list: $('hList'), total: $('hTotal'), lapT: $('hLapT'), best: $('hBest'), map: $('hMap'), speed: $('hSpeed'), center: $('hCenter'), wrong: $('hWrong'), drift: $('hDrift'), tip: $('hTip'), msg: $('hMsg') };
    this.mapCtx = this.e.map.getContext('2d');
    this.spCtx = this.e.speed.getContext('2d');
    this.mapBg = null; this.cache = {};
  }
  setMode(mode) { this.el.dataset.mode = mode; }
  /** Förrendera banan på minikartan. */
  setTrack(track) {
    const W = 180, pad = 12;
    const bb = track.bbox; const sx = bb.x1 - bb.x0, sz = bb.z1 - bb.z0;
    const sc = (W - pad * 2) / Math.max(sx, sz);
    this.map = { sc, ox: pad + ((W - pad * 2) - sx * sc) / 2 - bb.x0 * sc, oz: pad + ((W - pad * 2) - sz * sc) / 2 - bb.z0 * sc };
    const c = document.createElement('canvas'); c.width = W; c.height = W;
    const g = c.getContext('2d');
    const path = () => { g.beginPath(); for (let i = 0; i <= track.N; i += 2) { const k = i % track.N; const [x, y] = this.mp(track.P[k * 3], track.P[k * 3 + 2]); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.closePath(); };
    g.lineJoin = 'round'; g.lineCap = 'round';
    path(); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 9; g.stroke();
    path(); g.strokeStyle = 'rgba(235,240,255,0.92)'; g.lineWidth = 4.5; g.stroke();
    // broar ljusare
    g.strokeStyle = '#ffcc33'; g.lineWidth = 4.5;
    for (let i = 0; i < track.N; i++) if (track.bridge[i] && track.bridge[(i + 1) % track.N]) { const [a, b] = this.mp(track.P[i * 3], track.P[i * 3 + 2]); const k = (i + 1) % track.N; const [c2, d] = this.mp(track.P[k * 3], track.P[k * 3 + 2]); g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke(); }
    // mållinje
    const [fx, fz] = this.mp(track.P[0], track.P[2]);
    g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.arc(fx, fz, 4.5, 0, 7); g.fill(); g.stroke();
    this.mapBg = c;
  }
  mp(x, z) { return [x * this.map.sc + this.map.ox, z * this.map.sc + this.map.oz]; }

  drawMap(cars, player, ghost) {
    const g = this.mapCtx; if (!this.mapBg) return;
    g.clearRect(0, 0, 180, 180);
    g.drawImage(this.mapBg, 0, 0);
    if (ghost) { const [x, y] = this.mp(ghost.x, ghost.z); g.fillStyle = 'rgba(127,214,255,0.8)'; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); }
    cars.forEach((c, k) => {
      if (c === player) return;
      const [x, y] = this.mp(c.pos.x, c.pos.z);
      g.fillStyle = CAR_DOT[k % CAR_DOT.length]; g.strokeStyle = '#000'; g.lineWidth = 1.2;
      g.beginPath(); g.arc(x, y, 3.6, 0, 7); g.fill(); g.stroke();
    });
    if (player) {
      const [x, y] = this.mp(player.pos.x, player.pos.z);
      const a = Math.atan2(player.F.x, player.F.z);
      g.save(); g.translate(x, y); g.rotate(-a + Math.PI);
      g.fillStyle = '#ffcc33'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2.5); g.lineTo(-5, 5); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
  }

  drawSpeed(kmh, rpm, gear, nitro, nitroOn, drift) {
    const g = this.spCtx, W = 220, cx = W / 2, cy = W / 2;
    g.clearRect(0, 0, W, W);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    // bakgrund
    g.beginPath(); g.arc(cx, cy, 96, 0, Math.PI * 2); g.fillStyle = 'rgba(8,12,26,0.62)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.15)'; g.stroke();
    // varvtal
    g.lineCap = 'round';
    g.beginPath(); g.arc(cx, cy, 82, a0, a1); g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 10; g.stroke();
    const ra = a0 + (a1 - a0) * Math.min(1, rpm);
    const grd = g.createLinearGradient(0, W, W, 0); grd.addColorStop(0, '#39d5ff'); grd.addColorStop(0.7, '#ffcc33'); grd.addColorStop(1, '#ff5a6e');
    g.beginPath(); g.arc(cx, cy, 82, a0, ra); g.strokeStyle = grd; g.lineWidth = 10; g.stroke();
    // markeringar
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
    for (let k = 0; k <= 10; k++) { const a = a0 + (a1 - a0) * k / 10; g.beginPath(); g.moveTo(cx + Math.cos(a) * 70, cy + Math.sin(a) * 70); g.lineTo(cx + Math.cos(a) * 75, cy + Math.sin(a) * 75); g.stroke(); }
    // nitro-båge (nedtill)
    const n0 = Math.PI * 0.28, n1 = Math.PI * 0.72;
    g.beginPath(); g.arc(cx, cy, 96, n1, n0, true); g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 8; g.stroke();
    g.beginPath(); g.arc(cx, cy, 96, n1, n1 - (n1 - n0) * nitro, true); g.strokeStyle = nitroOn ? '#9fe0ff' : (nitro > 0.25 ? '#39d5ff' : '#3a7a9a'); g.lineWidth = 8; g.stroke();
    // text
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 56px Rubik, system-ui, sans-serif'; g.fillText(String(Math.round(kmh)), cx, cy - 4);
    g.font = '700 14px Rubik, system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillText('km/h', cx, cy + 30);
    g.font = '900 20px Rubik, system-ui, sans-serif'; g.fillStyle = drift ? '#ffcc33' : '#39d5ff'; g.fillText(gear, cx, cy - 48);
    g.font = '800 11px Rubik, system-ui, sans-serif'; g.fillStyle = nitroOn ? '#bff0ff' : 'rgba(255,255,255,0.65)'; g.fillText('NITRO', cx, cy + 74);
  }

  set(key, el, val) { if (this.cache[key] !== val) { this.cache[key] = val; el.textContent = val; } }
  setHtml(key, el, val) { if (this.cache[key] !== val) { this.cache[key] = val; el.innerHTML = val; } }

  center(text, cls = '') {
    const c = this.e.center;
    c.className = 'fj-center ' + cls;
    c.textContent = text;
    c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
  }
  msg(text, ms = 1800, cls = '') {
    const d = document.createElement('div'); d.className = 'fj-msgi ' + cls; d.textContent = text;
    this.e.msg.appendChild(d);
    while (this.e.msg.children.length > 3) this.e.msg.firstChild.remove();
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, ms);
  }
  tip(text) {
    if (!text) { this.e.tip.classList.add('hidden'); this.cache.tip = null; return; }
    this.e.tip.classList.remove('hidden'); this.setHtml('tip', this.e.tip, text);
  }
  wrong(on) { if (this.cache.wrongOn !== on) { this.cache.wrongOn = on; this.e.wrong.classList.toggle('hidden', !on); } }
  drift(text) {
    if (!text) { if (this.cache.driftOn) { this.cache.driftOn = false; this.e.drift.classList.add('hidden'); } return; }
    if (!this.cache.driftOn) { this.cache.driftOn = true; this.e.drift.classList.remove('hidden'); }
    this.set('drift', this.e.drift, text);
  }
  standings(rows) {
    // rows: [{name, me, gap}]
    const html = rows.map((r, k) => `<li class="${r.me ? 'me' : ''}"><i style="background:${r.color}"></i><span>${k + 1}. ${r.name}</span></li>`).join('');
    this.setHtml('list', this.e.list, html);
  }
}
