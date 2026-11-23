/**
 * Rymdjakt – procedurella porträtt för radiomeddelanden (ritas på canvas, cachas som bilder).
 */
import { CHARS } from './data.js';

const CACHE = {};

function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function draw(g, S, p) {
  const bg = g.createLinearGradient(0, 0, 0, S);
  bg.addColorStop(0, p.bg[0]); bg.addColorStop(1, p.bg[1]);
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  // svepande linjer i bakgrunden
  g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
  for (let y = 4; y < S; y += 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
  const c = S / 2;
  if (p.icon === 'station') {
    g.strokeStyle = '#9fd0ff'; g.lineWidth = S * 0.05;
    g.beginPath(); g.ellipse(c, c, S * 0.34, S * 0.12, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#cfe6ff'; rr(g, c - S * 0.09, c - S * 0.3, S * 0.18, S * 0.6, S * 0.05); g.fill();
    g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(c, c - S * 0.36, S * 0.05, 0, Math.PI * 2); g.fill();
    star(g, c, c, S * 0.08, '#1f5fbf');
    return;
  }
  if (p.icon === 'computer') {
    g.strokeStyle = '#8af0ff'; g.lineWidth = S * 0.035;
    g.beginPath(); g.arc(c, c, S * 0.3, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(c, c, S * 0.18, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#8af0ff'; g.beginPath(); g.arc(c, c, S * 0.08, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * S * 0.33, c + Math.sin(a) * S * 0.33); g.lineTo(c + Math.cos(a) * S * 0.42, c + Math.sin(a) * S * 0.42); g.stroke(); }
    return;
  }
  // axlar / uniform
  g.fillStyle = p.uniform;
  g.beginPath(); g.moveTo(S * 0.08, S); g.quadraticCurveTo(S * 0.12, S * 0.72, c, S * 0.7); g.quadraticCurveTo(S * 0.88, S * 0.72, S * 0.92, S); g.closePath(); g.fill();
  g.fillStyle = p.trim; g.fillRect(S * 0.2, S * 0.86, S * 0.14, S * 0.03); g.fillRect(S * 0.66, S * 0.86, S * 0.14, S * 0.03);
  if (!p.mask) { g.fillStyle = p.trim; g.beginPath(); g.moveTo(c - S * 0.08, S * 0.72); g.lineTo(c, S * 0.82); g.lineTo(c + S * 0.08, S * 0.72); g.fill(); }
  if (p.mask) {
    // fiende: metallmask med röd visirspringa
    const mg = g.createLinearGradient(c - S * 0.2, 0, c + S * 0.2, 0);
    mg.addColorStop(0, '#2a2c33'); mg.addColorStop(0.5, '#6a6e78'); mg.addColorStop(1, '#22242a');
    g.fillStyle = mg;
    g.beginPath(); g.moveTo(c - S * 0.22, S * 0.3); g.lineTo(c + S * 0.22, S * 0.3); g.lineTo(c + S * 0.18, S * 0.62); g.lineTo(c, S * 0.72); g.lineTo(c - S * 0.18, S * 0.62); g.closePath(); g.fill();
    g.fillStyle = '#1a1b20'; g.beginPath(); g.moveTo(c - S * 0.24, S * 0.32); g.quadraticCurveTo(c, S * 0.08, c + S * 0.24, S * 0.32); g.closePath(); g.fill();
    if (!p.simple) { g.fillStyle = p.trim; g.beginPath(); g.moveTo(c - S * 0.05, S * 0.12); g.lineTo(c, S * 0.02); g.lineTo(c + S * 0.05, S * 0.12); g.fill(); }
    const vg = g.createLinearGradient(0, S * 0.42, 0, S * 0.48);
    vg.addColorStop(0, '#ff7a3a'); vg.addColorStop(1, '#ff1a0a');
    g.shadowColor = '#ff3010'; g.shadowBlur = S * 0.08;
    g.fillStyle = vg; g.fillRect(c - S * 0.16, S * 0.42, S * 0.32, S * 0.045);
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(c - S * 0.1 + i * S * 0.065, S * 0.56); g.lineTo(c - S * 0.1 + i * S * 0.065, S * 0.66); g.stroke(); }
    return;
  }
  // hals
  g.fillStyle = shade(p.skin, -0.15); g.fillRect(c - S * 0.07, S * 0.56, S * 0.14, S * 0.16);
  // hår bakom
  if (p.style === 'long') { g.fillStyle = p.hair; rr(g, c - S * 0.22, S * 0.2, S * 0.44, S * 0.5, S * 0.18); g.fill(); }
  // huvud
  g.fillStyle = p.skin;
  g.beginPath(); g.ellipse(c, S * 0.42, S * 0.17, S * 0.21, 0, 0, Math.PI * 2); g.fill();
  // hår
  g.fillStyle = p.hair;
  if (p.style === 'bun') { g.beginPath(); g.ellipse(c, S * 0.3, S * 0.18, S * 0.12, 0, Math.PI, 0); g.fill(); g.beginPath(); g.arc(c + S * 0.12, S * 0.2, S * 0.08, 0, Math.PI * 2); g.fill(); }
  else if (p.style === 'short' || p.style === 'beard') { g.beginPath(); g.ellipse(c, S * 0.3, S * 0.18, S * 0.11, 0, Math.PI, 0); g.fill(); g.fillRect(c - S * 0.18, S * 0.28, S * 0.04, S * 0.1); g.fillRect(c + S * 0.14, S * 0.28, S * 0.04, S * 0.1); }
  else if (p.style === 'long') { g.beginPath(); g.ellipse(c, S * 0.3, S * 0.19, S * 0.12, 0, Math.PI, 0); g.fill(); }
  if (p.style === 'beard') { g.beginPath(); g.moveTo(c - S * 0.16, S * 0.44); g.quadraticCurveTo(c, S * 0.72, c + S * 0.16, S * 0.44); g.lineTo(c + S * 0.12, S * 0.46); g.quadraticCurveTo(c, S * 0.6, c - S * 0.12, S * 0.46); g.fill(); }
  // ögon
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(c - S * 0.07, S * 0.41, S * 0.03, S * 0.018, 0, 0, Math.PI * 2); g.ellipse(c + S * 0.07, S * 0.41, S * 0.03, S * 0.018, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2a3a5a'; g.beginPath(); g.arc(c - S * 0.07, S * 0.41, S * 0.014, 0, Math.PI * 2); g.arc(c + S * 0.07, S * 0.41, S * 0.014, 0, Math.PI * 2); g.fill();
  g.strokeStyle = shade(p.hair, -0.2); g.lineWidth = S * 0.012;
  g.beginPath(); g.moveTo(c - S * 0.11, S * 0.37); g.lineTo(c - S * 0.04, S * 0.365); g.moveTo(c + S * 0.04, S * 0.365); g.lineTo(c + S * 0.11, S * 0.37); g.stroke();
  // näsa och mun
  g.strokeStyle = shade(p.skin, -0.25); g.lineWidth = S * 0.01;
  g.beginPath(); g.moveTo(c, S * 0.43); g.lineTo(c - S * 0.015, S * 0.49); g.lineTo(c + S * 0.01, S * 0.495); g.stroke();
  g.strokeStyle = p.style === 'beard' ? shade(p.hair, -0.3) : '#8a4a40'; g.lineWidth = S * 0.012;
  g.beginPath(); g.moveTo(c - S * 0.05, S * 0.54); g.quadraticCurveTo(c, S * 0.56, c + S * 0.05, S * 0.54); g.stroke();
  if (p.age) { g.strokeStyle = shade(p.skin, -0.18); g.lineWidth = 1; g.beginPath(); g.moveTo(c - S * 0.12, S * 0.46); g.lineTo(c - S * 0.1, S * 0.5); g.moveTo(c + S * 0.12, S * 0.46); g.lineTo(c + S * 0.1, S * 0.5); g.stroke(); }
  if (p.glasses) { g.strokeStyle = '#111'; g.lineWidth = S * 0.012; g.strokeRect(c - S * 0.115, S * 0.385, S * 0.09, S * 0.05); g.strokeRect(c + S * 0.025, S * 0.385, S * 0.09, S * 0.05); g.beginPath(); g.moveTo(c - S * 0.025, S * 0.405); g.lineTo(c + S * 0.025, S * 0.405); g.stroke(); }
  if (p.cap) { g.fillStyle = p.cap; g.beginPath(); g.ellipse(c, S * 0.27, S * 0.19, S * 0.1, 0, Math.PI, 0); g.fill(); g.fillRect(c - S * 0.2, S * 0.26, S * 0.4, S * 0.03); star(g, c, S * 0.22, S * 0.03, '#f2c230'); }
  if (p.helmet) {
    // hjälm med uppfällt visir
    g.strokeStyle = p.helmet; g.lineWidth = S * 0.06;
    g.beginPath(); g.arc(c, S * 0.42, S * 0.23, Math.PI * 0.82, Math.PI * 2.18); g.stroke();
    g.fillStyle = p.helmet; g.beginPath(); g.ellipse(c, S * 0.24, S * 0.25, S * 0.11, 0, Math.PI, 0); g.fill();
    const vg = g.createLinearGradient(0, S * 0.14, 0, S * 0.24); vg.addColorStop(0, p.visor); vg.addColorStop(1, shade(p.visor, -0.5));
    g.fillStyle = vg; g.beginPath(); g.ellipse(c, S * 0.21, S * 0.2, S * 0.06, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#20232a'; g.fillRect(c + S * 0.2, S * 0.4, S * 0.05, S * 0.12);
    g.fillStyle = '#3a3d44'; g.fillRect(c + S * 0.08, S * 0.52, S * 0.14, S * 0.018);
  }
  // emblem
  star(g, S * 0.27, S * 0.8, S * 0.035, p.trim);
}
function star(g, x, y, r, col) {
  g.fillStyle = col; g.beginPath();
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 - Math.PI / 2; const rr2 = i % 2 ? r * 0.4 : r; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  g.closePath(); g.fill();
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
  const f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(r)},${f(gg)},${f(b)})`;
}

/** Returnerar en canvas med porträttet (cachad). */
export function portrait(id, S = 96) {
  const key = id + ':' + S;
  if (CACHE[key]) return CACHE[key];
  const ch = CHARS[id] || CHARS.dator;
  const c = document.createElement('canvas'); c.width = c.height = S;
  draw(c.getContext('2d'), S, ch.p);
  return (CACHE[key] = c);
}
export function portraitURL(id, S = 96) { return portrait(id, S).toDataURL(); }
