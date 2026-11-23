/**
 * Rymdjakt – HUD: målmarkeringar, förhandssikte, låsning, pilar mot mål utanför skärmen, radar,
 * träffmarkörer, skadeindikatorer, mätare, målinformation, uppdragsmål, radiorutor och vingmän.
 */
import * as THREE from 'three';
import { CHARS } from './data.js';
import { portrait } from './portraits.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const C = { enemy: '#ff5a4a', ally: '#5adc8a', obj: '#c0c8d8', target: '#ffd24a', nav: '#ffcc33', protect: '#5ad0ff', mine: '#ff9a3a' };
const MARK = { protect: 'SKYDDA', destroy: 'MÅL', disable: 'SLÅ UT MOTORERNA' };
const fmtDist = d => d >= 1000 ? (d / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(d) + ' m';
const $ = id => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.g = game;
    this.root = $('hud');
    this.canvas = $('hudc');
    this.ctx = this.canvas.getContext('2d');
    this.W = 1; this.H = 1; this.s = 1;
    this.el = {
      shield: $('barShield'), hull: $('barHull'), energy: $('barEnergy'), heat: $('barHeat'), heatRow: $('rowHeat'),
      shieldTxt: $('txtShield'), hullTxt: $('txtHull'),
      speed: $('txtSpeed'), thr: $('barThr'), weap: $('txtWeap'), sec: $('txtSec'), ammo: $('txtAmmo'), flares: $('txtFlares'),
      tgt: $('tgtBox'), tgtName: $('tgtName'), tgtClass: $('tgtClass'), tgtDist: $('tgtDist'), tgtHull: $('tgtHull'), tgtShield: $('tgtShield'), tgtSub: $('tgtSub'), tgtLock: $('tgtLock'),
      obj: $('objList'), objBox: $('objBox'), radio: $('radio'), radioPic: $('radioPic'), radioName: $('radioName'), radioText: $('radioText'),
      timer: $('timer'), warn: $('warn'), vig: $('vignette'), msg: $('centerMsg'), wing: $('wing'), tip: $('tip'), bound: $('boundWarn'), score: $('txtScore')
    };
    this.cache = {};
    this.hitT = 0; this.killT = 0; this.dmg = []; this.floaters = [];
    this.msgT = 0;
    this.radioCur = null; this.radioChars = 0; this.radioFull = '';
    this.objectives = [];
    this.timerVal = null;
    this.visible = false;
    this.time = 0;
  }
  resize(w, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = w; this.H = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.s = Math.max(0.62, Math.min(1.25, Math.min(w, h) / 760));
    this.root.style.setProperty('--hs', this.s.toFixed(3));
  }
  show(on) { this.visible = on; this.root.classList.toggle('on', on); if (!on) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  _set(key, el, val, prop = 'textContent') { if (this.cache[key] !== val) { this.cache[key] = val; el[prop] = val; } }
  _w(key, el, frac) { const v = Math.round(Math.max(0, Math.min(1, frac)) * 1000) / 10; if (this.cache[key] !== v) { this.cache[key] = v; el.style.width = v + '%'; } }

  /* ---------------------------------------------------------------- meddelanden */
  flashMsg(text, dur = 2) { this.el.msg.textContent = text; this.el.msg.classList.add('on'); this.msgT = dur; }
  tip(text) { if (!text) { this.el.tip.classList.remove('on'); return; } this.el.tip.innerHTML = text; this.el.tip.classList.add('on'); }
  hit(kill) { if (kill) this.killT = 0.45; else this.hitT = 0.12; }
  floater(pos, text, color = '#ffd24a') { this.floaters.push({ pos: pos.clone(), text, color, t: 0 }); if (this.floaters.length > 8) this.floaters.shift(); }
  damageFrom(dir) { this.dmg.push({ dir: dir.clone(), t: 0 }); if (this.dmg.length > 6) this.dmg.shift(); }
  setObjectives(list) {
    this.objectives = list;
    const ul = this.el.obj; ul.innerHTML = '';
    for (const o of list) {
      if (o.hidden) continue;
      const li = document.createElement('li');
      li.className = 'st-' + o.state + (o.optional ? ' opt' : '');
      const mark = o.state === 'done' ? '✓' : o.state === 'failed' ? '✗' : '◆';
      li.innerHTML = `<i>${mark}</i><span></span>`;
      li.querySelector('span').textContent = o.text + (o.progress ? ' ' + o.progress : '') + (o.optional ? ' (frivilligt)' : '');
      ul.appendChild(li);
    }
    this.el.objBox.classList.toggle('empty', !list.some(o => !o.hidden));
  }
  radio(charId, text) {
    if (!charId) { this.el.radio.classList.remove('on'); this.radioCur = null; return; }
    const ch = CHARS[charId] || CHARS.dator;
    const pic = this.el.radioPic.getContext('2d');
    pic.clearRect(0, 0, 96, 96); pic.drawImage(portrait(charId, 96), 0, 0);
    this.el.radioName.textContent = ch.name; this.el.radioName.style.color = ch.col;
    this.radioFull = text; this.radioChars = 0; this.radioCur = charId;
    this.el.radioText.textContent = '';
    this.el.radio.classList.add('on');
    this.el.radio.classList.toggle('enemy', charId === 'vahl' || charId === 'svarm');
  }
  setTimer(sec) { this.timerVal = sec; if (sec == null) this.el.timer.classList.remove('on'); }

  /* ---------------------------------------------------------------- uppdatering */
  update(dt) {
    this.time += dt;
    const g = this.g, W = g.world, P = W.player, pc = g.pc;
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.el.msg.classList.remove('on'); }
    if (this.radioCur && this.radioChars < this.radioFull.length) {
      this.radioChars = Math.min(this.radioFull.length, this.radioChars + dt * 70);
      this.el.radioText.textContent = this.radioFull.slice(0, Math.ceil(this.radioChars));
    }
    if (this.timerVal != null) {
      const t = Math.max(0, this.timerVal);
      const txt = Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
      this._set('timer', this.el.timer, txt);
      this.el.timer.classList.add('on');
      this.el.timer.classList.toggle('low', t < 30);
    }
    if (!P) return;
    // mätare
    const st = P;
    this._w('sh', this.el.shield, st.maxShield ? st.shield / st.maxShield : 0);
    this._w('hu', this.el.hull, st.hull / st.maxHull);
    this._w('en', this.el.energy, st.energy / 100);
    this._w('he', this.el.heat, st.heat / 100);
    this._set('sht', this.el.shieldTxt, Math.ceil(st.shield) + '');
    this._set('hut', this.el.hullTxt, Math.ceil(st.hull) + '');
    this.el.heatRow.classList.toggle('over', st.overheated);
    this.el.hull.parentNode.classList.toggle('low', st.hull / st.maxHull < 0.3);
    this._set('spd', this.el.speed, Math.round(st.speed) + '');
    this._w('thr', this.el.thr, pc.throttleTarget);
    this._set('wp', this.el.weap, st.weapon.name);
    this._set('sec', this.el.sec, st.secondary.name);
    this._set('am', this.el.ammo, '× ' + st.missiles);
    this._set('fl', this.el.flares, '× ' + st.flares);
    // mål
    const T = W.playerTarget;
    if (T && !T.dead) {
      this.el.tgt.classList.add('on');
      const sub = g.targetSub;
      this._set('tn', this.el.tgtName, T.name);
      this._set('tc', this.el.tgtClass, T.team === 0 ? 'Allierad' : (T.isLarge ? (T.kind === 'station' ? 'Station' : 'Stort skepp') : ({ mine: 'Mina', drone: 'Övningsmål', object: 'Föremål', bomber: 'Bombplan' })[T.kind] || 'Jaktplan'));
      this._set('td', this.el.tgtDist, fmtDist(T.pos.distanceTo(P.pos)));
      this._w('th', this.el.tgtHull, T.hull / T.maxHull);
      this._w('ts', this.el.tgtShield, T.maxShield ? T.shield / T.maxShield : 0);
      this.el.tgtShield.parentNode.style.display = T.maxShield ? '' : 'none';
      let subTxt = '';
      if (sub && sub.alive) subTxt = 'Delsystem: ' + sub.name + ' ' + Math.ceil(sub.hp / sub.maxHp * 100) + ' %';
      else if (T.isLarge && T.hullLocked()) subTxt = T.def.targetsKill ? 'Slå ut målen (G växlar delsystem)' : 'Skyddas av sköldgenerator – G växlar delsystem';
      else if (T.isLarge) subTxt = 'G: välj delsystem';
      this._set('tsub', this.el.tgtSub, subTxt);
      this._set('tl', this.el.tgtLock, pc.locked ? 'LÅST' : (pc.lock > 0 ? 'Låser… ' + Math.round(pc.lock * 100) + ' %' : ''));
      this.el.tgtLock.classList.toggle('on', pc.locked);
    } else this.el.tgt.classList.remove('on');
    // skadevinjett: blinkar kort vid skrovträff och pulserar vid lågt skrov
    const hf = st.hull / st.maxHull;
    if (this._lastHull != null && st.hull < this._lastHull - 0.5) this.hurtT = 0.35;
    this._lastHull = st.hull;
    this.hurtT = Math.max(0, (this.hurtT || 0) - dt);
    const vig = Math.max(this.hurtT * 2, hf < 0.3 && !st.dead ? (0.35 + 0.25 * Math.sin(this.time * 5)) * (1 - hf / 0.3) : 0);
    const vr = Math.round(Math.min(1, vig) * 100) / 100;
    if (this.cache.vig !== vr) { this.cache.vig = vr; this.el.vig.style.opacity = vr; }
    // varningar
    const inc = pc.incoming;
    const missileWarn = !!(inc && inc.n > 0), lockWarn = !missileWarn && W.lockWarn > 0;
    this.el.warn.classList.toggle('on', missileWarn || lockWarn);
    this.el.warn.classList.toggle('lock', lockWarn);
    this._set('warnTxt', this.el.warn, missileWarn ? 'MISSILVARNING – FÄLL MOTÅTGÄRDER' : 'FIENDEN LÅSER PÅ DIG');
    this.el.bound.classList.toggle('on', pc.autopilot);
    // vingmän
    const wing = W.ships.filter(s => s.ai && s.ai.kind === 'wingman');
    const wk = wing.map(s => s.name + Math.round(s.hull / s.maxHull * 20) + s.ai.order + (s.dead ? 'd' : '')).join('|') + (g.mission ? g.mission.lostWing.join(',') : '');
    if (this.cache.wing !== wk) {
      this.cache.wing = wk;
      const ord = { attack: 'anfaller ditt mål', protect: 'skyddar dig', free: 'fri jakt' };
      let html = wing.map(s => `<div class="wm"><b>${s.callsign || s.name}</b><span class="bar"><i style="width:${Math.max(0, s.hull / s.maxHull * 100)}%"></i></span><em>${ord[s.ai.order] || ''}</em></div>`).join('');
      if (g.mission) html += g.mission.lostWing.map(n => `<div class="wm lost"><b>${n}</b><em>utskjuten</em></div>`).join('');
      this.el.wing.innerHTML = html;
      this.el.wing.classList.toggle('on', html.length > 0);
    }
    if (g.mission && this.el.score) this._set('score', this.el.score, g.mission.liveScore());
    // timers
    if (this.hitT > 0) this.hitT -= dt;
    if (this.killT > 0) this.killT -= dt;
    for (const d of this.dmg) d.t += dt;
    this.dmg = this.dmg.filter(d => d.t < 0.9);
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter(f => f.t < 1.4);
  }

  /* ---------------------------------------------------------------- ritning */
  proj(p, out) {
    const cam = this.g.camera;
    _v.copy(p).applyMatrix4(cam.matrixWorldInverse);
    out.cx = _v.x; out.cy = _v.y; out.cz = _v.z;
    out.behind = _v.z > -1;
    _v.applyMatrix4(cam.projectionMatrix);
    out.x = (_v.x * 0.5 + 0.5) * this.W; out.y = (-_v.y * 0.5 + 0.5) * this.H;
    out.on = !out.behind && out.x > 0 && out.x < this.W && out.y > 0 && out.y < this.H;
    out.depth = -out.cz;
    return out;
  }
  edge(o) {
    // vinkel mot punkten i skärmplanet
    let x = o.cx, y = -o.cy;
    if (o.behind && Math.abs(x) < 1e-3 && Math.abs(y) < 1e-3) y = 1;
    const a = Math.atan2(y, x);
    const rx = this.W / 2 - 46 * this.s, ry = this.H / 2 - 46 * this.s;
    const k = Math.min(rx / Math.abs(Math.cos(a) || 1e-6), ry / Math.abs(Math.sin(a) || 1e-6));
    return { x: this.W / 2 + Math.cos(a) * k, y: this.H / 2 + Math.sin(a) * k, a };
  }
  draw() {
    if (!this.visible) return;
    const g = this.g, W = g.world, P = W.player, cam = g.camera, pc = g.pc;
    const ctx = this.ctx, s = this.s;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    if (!P) return;
    const focal = this.H / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    ctx.lineWidth = 1.5 * s;
    ctx.font = `600 ${Math.round(11 * s)}px Rubik, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const o = {};
    const T = W.playerTarget;
    const radarRange = W.radarRange || 5000;
    // ---- cockpitram
    if (pc.view === 'cockpit' && !P.dead) this.cockpit(ctx);
    // ---- navpunkter
    for (const n of W.navs) {
      if (!n.active) continue;
      this.proj(n.pos, o);
      const d = n.pos.distanceTo(P.pos);
      if (o.on) {
        this.diamond(ctx, o.x, o.y, 9 * s, C.nav, true);
        ctx.fillStyle = C.nav; ctx.fillText(n.label, o.x, o.y - 14 * s); ctx.fillText(fmtDist(d), o.x, o.y + 22 * s);
      } else { const e = this.edge(o); this.arrow(ctx, e, C.nav, n.label + ' ' + fmtDist(d)); }
    }
    // ---- skepp
    for (const sh of W.ships) {
      if (sh === P || sh.dead || !sh.targetable) continue;
      const d = sh.pos.distanceTo(P.pos);
      const isT = sh === T;
      if (!isT && !sh.hudMark && d > (sh.isLarge ? 9000 : 3200)) continue;
      this.proj(sh.pos, o);
      const col = isT ? C.target : sh.hudMark === 'protect' ? C.protect : sh.hudMark === 'disable' ? C.mine : sh.kind === 'mine' ? C.mine : sh.team === 0 ? C.ally : (sh.kind === 'object' ? C.obj : C.enemy);
      if (o.on) {
        const r = Math.max(9 * s, Math.min(this.H * 0.45, (sh.isLarge ? sh.radius * 0.9 : sh.radius) * focal / Math.max(1, o.depth)));
        if (isT) this.bracket(ctx, o.x, o.y, r + 5 * s, col, 2.2 * s, 0.32);
        else if (r < 12 * s && !sh.isLarge) this.tri(ctx, o.x, o.y, 5 * s, col);
        else this.bracket(ctx, o.x, o.y, r, col, 1.3 * s, 0.22);
        if (sh.hudMark) {
          ctx.fillStyle = col;
          const mt = MARK[sh.hudMark] || 'MÅL', mp = this.clampOut({ x: o.x, y: o.y - r - 10 * s }, ctx.measureText(mt).width / 2 + 4 * s, 8 * s);
          ctx.fillText(mt, mp.x, mp.y);
          this.minibar(ctx, o.x, o.y + r + 8 * s, 40 * s, sh.hull / sh.maxHull, col);
        }
        if (isT) {
          ctx.fillStyle = col;
          ctx.fillText(sh.name, o.x, o.y - r - (sh.hudMark ? 24 : 12) * s);
          ctx.fillText(fmtDist(d), o.x, o.y + r + (sh.hudMark ? 26 : 18) * s);
          // delsystem
          const sub = g.targetSub;
          if (sub && sub.alive) {
            this.proj(sub.w, o);
            if (o.on) {
              const rr = Math.max(8 * s, sub.r * focal / Math.max(1, o.depth));
              ctx.strokeStyle = C.target; ctx.setLineDash([4 * s, 3 * s]); ctx.beginPath(); ctx.arc(o.x, o.y, rr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
              ctx.fillStyle = C.target; ctx.fillText(sub.name, o.x, o.y - rr - 6 * s);
            }
            this.proj(sh.pos, o);
          }
          // låsning
          if (pc.lock > 0) {
            const lp = sub && sub.alive ? this.proj(sub.w, {}) : o;
            if (lp.on) {
              ctx.strokeStyle = pc.locked ? '#ff4a3a' : C.target; ctx.lineWidth = 2 * s;
              const lr = pc.locked ? r * 0.5 + 10 * s : (r + 40 * s) * (1.6 - pc.lock * 0.9);
              const rot = this.time * (pc.locked ? 0 : 4);
              for (let k = 0; k < 4; k++) { const a0 = rot + k * Math.PI / 2; ctx.beginPath(); ctx.arc(lp.x, lp.y, lr, a0 + 0.2, a0 + Math.PI / 2 - 0.2); ctx.stroke(); }
              if (pc.locked) { this.diamond(ctx, lp.x, lp.y, 7 * s, '#ff4a3a', false); ctx.fillStyle = '#ff4a3a'; ctx.fillText('LÅST', lp.x, lp.y + lr + 14 * s); }
              ctx.lineWidth = 1.5 * s;
            }
          }
        }
      } else if (isT || sh.hudMark || (sh.isLarge && d < 6000)) {
        const e = this.edge(o);
        this.arrow(ctx, e, col, isT ? fmtDist(d) : (sh.hudMark ? (MARK[sh.hudMark] || 'MÅL') : ''));
      } else if (sh.team === 1 && sh.ai && sh.ai.target === P && d < 1500) {
        // fiender som jagar spelaren utanför bild: diskret pil så man ser var hotet kommer ifrån
        this.arrow(ctx, this.edge(o), 'rgba(255,96,72,0.6)', '');
      }
    }
    // ---- förhandssikte
    if (T && !T.dead && pc.leadPos && !g.targetSub) {
      this.proj(pc.leadPos, o);
      if (o.on) {
        const tp = this.proj(T.pos, {});
        ctx.strokeStyle = 'rgba(255,210,74,0.35)'; ctx.beginPath(); ctx.moveTo(tp.x, tp.y); ctx.lineTo(o.x, o.y); ctx.stroke();
        const aim = this.proj(_v2.copy(P.pos).addScaledVector(P.fwd, Math.max(50, P.aimDist)), {});
        const near = Math.hypot(aim.x - o.x, aim.y - o.y) < 14 * s;
        ctx.strokeStyle = near ? '#ffffff' : C.target; ctx.lineWidth = near ? 2.4 * s : 1.6 * s;
        ctx.beginPath(); ctx.arc(o.x, o.y, 7 * s, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(o.x, o.y, 1.6 * s, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
        ctx.lineWidth = 1.5 * s;
      }
    }
    // ---- sikte
    if (!P.dead) {
      const aimP = this.proj(_v2.copy(P.pos).addScaledVector(P.fwd, Math.max(80, Math.min(1200, P.aimDist))), {});
      if (!aimP.behind) this.crosshair(ctx, aimP.x, aimP.y, P);
      // virtuell spak
      if (g.input.locked && (Math.abs(pc.stick.x) > 0.02 || Math.abs(pc.stick.y) > 0.02)) {
        const cx = this.W / 2, cy = this.H / 2, R = 90 * s;
        ctx.strokeStyle = 'rgba(160,220,255,0.35)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + pc.stick.x * R, cy + pc.stick.y * R); ctx.stroke();
        ctx.fillStyle = 'rgba(160,220,255,0.8)'; ctx.beginPath(); ctx.arc(cx + pc.stick.x * R, cy + pc.stick.y * R, 3.5 * s, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(160,220,255,0.15)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      }
      // träffmarkör
      if (this.hitT > 0 || this.killT > 0) {
        const k = this.killT > 0, r = (k ? 16 : 10) * s, r0 = (k ? 7 : 5) * s;
        ctx.strokeStyle = k ? '#ff5a4a' : '#ffffff'; ctx.lineWidth = (k ? 3 : 2) * s;
        ctx.beginPath();
        for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { ctx.moveTo(aimP.x + dx * r0, aimP.y + dy * r0); ctx.lineTo(aimP.x + dx * r, aimP.y + dy * r); }
        ctx.stroke(); ctx.lineWidth = 1.5 * s;
      }
    }
    // ---- skadeindikatorer
    for (const d of this.dmg) {
      _v.copy(d.dir).applyQuaternion(_q.copy(cam.quaternion).invert());
      const a = Math.atan2(-_v.y, _v.x);
      const r = 150 * s, f = 1 - d.t / 0.9;
      ctx.strokeStyle = `rgba(255,60,40,${0.85 * f})`; ctx.lineWidth = 6 * s;
      ctx.beginPath(); ctx.arc(this.W / 2, this.H / 2, r, a - 0.35, a + 0.35); ctx.stroke();
    }
    ctx.lineWidth = 1.5 * s;
    // ---- inkommande missiler
    if (pc.incoming && pc.incoming.n > 0) {
      for (const m of W.missiles.list) {
        if (m.target !== P || !m.guided) continue;
        this.proj(m.pos, o);
        const blink = Math.sin(this.time * 20) > 0;
        if (o.on) { ctx.strokeStyle = '#ff3a2a'; ctx.beginPath(); ctx.arc(o.x, o.y, 10 * s, 0, Math.PI * 2); ctx.stroke(); }
        else { const e = this.edge(o); if (blink) this.arrow(ctx, e, '#ff3a2a', 'MISSIL'); }
      }
    }
    // ---- poängtext
    for (const f of this.floaters) {
      this.proj(f.pos, o); if (!o.on) continue;
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      ctx.fillStyle = f.color; ctx.font = `800 ${Math.round(14 * s)}px Rubik, system-ui, sans-serif`;
      ctx.fillText(f.text, o.x, o.y - 30 * s - f.t * 30 * s);
      ctx.globalAlpha = 1;
    }
    ctx.font = `600 ${Math.round(11 * s)}px Rubik, system-ui, sans-serif`;
    // ---- radar
    this.radar(ctx, P, W, radarRange);
  }
  crosshair(ctx, x, y, P) {
    const s = this.s;
    ctx.strokeStyle = 'rgba(200,240,255,0.9)'; ctx.lineWidth = 1.6 * s;
    const r = 11 * s;
    ctx.beginPath();
    ctx.moveTo(x - r * 1.8, y); ctx.lineTo(x - r * 0.6, y); ctx.moveTo(x + r * 0.6, y); ctx.lineTo(x + r * 1.8, y);
    ctx.moveTo(x, y - r * 1.4); ctx.lineTo(x, y - r * 0.6); ctx.moveTo(x, y + r * 0.6); ctx.lineTo(x, y + r * 1.4);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 1.5 * s, 0, Math.PI * 2); ctx.fillStyle = 'rgba(200,240,255,0.9)'; ctx.fill();
    // värmebåge
    const h = P.heat / 100;
    if (h > 0.02) {
      ctx.strokeStyle = P.overheated ? (Math.sin(this.time * 18) > 0 ? '#ff3a2a' : '#ff9a3a') : `hsl(${Math.round(120 - h * 120)},90%,60%)`;
      ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.arc(x, y, r * 2.4, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 0.5 * h); ctx.stroke();
    }
    ctx.lineWidth = 1.5 * s;
  }
  bracket(ctx, x, y, r, col, lw, k) {
    const L = Math.max(5, r * k * 2);
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r + L); ctx.lineTo(x - r, y - r); ctx.lineTo(x - r + L, y - r);
    ctx.moveTo(x + r - L, y - r); ctx.lineTo(x + r, y - r); ctx.lineTo(x + r, y - r + L);
    ctx.moveTo(x + r, y + r - L); ctx.lineTo(x + r, y + r); ctx.lineTo(x + r - L, y + r);
    ctx.moveTo(x - r + L, y + r); ctx.lineTo(x - r, y + r); ctx.lineTo(x - r, y + r - L);
    ctx.stroke();
    ctx.lineWidth = 1.5 * this.s;
  }
  tri(ctx, x, y, r, col) { ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); ctx.stroke(); }
  diamond(ctx, x, y, r, col, stroke = true) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); if (stroke) { ctx.strokeStyle = col; ctx.stroke(); } else { ctx.fillStyle = col; ctx.fill(); } }
  minibar(ctx, x, y, w, f, col) {
    const h = 3 * this.s;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - w / 2, y, w, h);
    ctx.fillStyle = col; ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, f)), h);
  }
  /** Uppdaterar HUD-panelernas rektanglar (i canvaskoordinater) högst var 0,25 s. */
  _panels() {
    if (this.time - (this._prT || -9) < 0.25 && this._pr) return this._pr;
    this._prT = this.time;
    const cr = this.canvas.getBoundingClientRect(), out = [];
    for (const k of ['objBox', 'tgt', 'radio', 'wing']) this._prPush(out, this.el[k], cr);
    this._prPush(out, $('status'), cr); this._prPush(out, $('weap'), cr);
    return (this._pr = out);
  }
  _prPush(out, el, cr) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.1) return;
    out.push({ l: r.left - cr.left, t: r.top - cr.top, r: r.right - cr.left, b: r.bottom - cr.top });
  }
  /** Flyttar en punkt (med halv bredd/höjd px, py) ut ur HUD-panelerna, mot skärmens mitt. */
  clampOut(p, px, py) {
    for (const R of this._panels()) {
      const l = R.l - px, r = R.r + px, t = R.t - py, b = R.b + py;
      if (p.x <= l || p.x >= r || p.y <= t || p.y >= b) continue;
      const cx = (R.l + R.r) / 2, cy = (R.t + R.b) / 2;
      const ex = cx < this.W / 2 ? r : l, ey = cy < this.H / 2 ? b : t;
      const spansX = R.l < this.W / 2 && R.r > this.W / 2;
      if (spansX || Math.abs(ey - p.y) < Math.abs(ex - p.x)) p.y = ey; else p.x = ex;
    }
    return p;
  }
  arrow(ctx, e, col, label) {
    const s = this.s;
    this.clampOut(e, 14 * s, 14 * s);
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.a);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(12 * s, 0); ctx.lineTo(-6 * s, -8 * s); ctx.lineTo(-2 * s, 0); ctx.lineTo(-6 * s, 8 * s); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (label) {
      ctx.fillStyle = col;
      const lp = this.clampOut({ x: e.x - Math.cos(e.a) * 26 * s, y: e.y - Math.sin(e.a) * 22 * s + 4 * s }, ctx.measureText(label).width / 2 + 4 * s, 8 * s);
      ctx.fillText(label, lp.x, lp.y);
    }
  }
  cockpit(ctx) {
    const Wd = this.W, H = this.H;
    ctx.fillStyle = 'rgba(8,12,22,0.92)';
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, H * 0.8); ctx.lineTo(Wd * 0.22, H * 0.86); ctx.lineTo(Wd * 0.78, H * 0.86); ctx.lineTo(Wd, H * 0.8); ctx.lineTo(Wd, H); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Wd * 0.16, 0); ctx.lineTo(Wd * 0.04, H * 0.82); ctx.lineTo(0, H * 0.8); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(Wd, 0); ctx.lineTo(Wd * 0.84, 0); ctx.lineTo(Wd * 0.96, H * 0.82); ctx.lineTo(Wd, H * 0.8); ctx.closePath(); ctx.fill();
    ctx.fillRect(0, 0, Wd, H * 0.035);
    ctx.strokeStyle = 'rgba(90,170,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(Wd * 0.16, 0); ctx.lineTo(Wd * 0.04, H * 0.82); ctx.moveTo(Wd * 0.84, 0); ctx.lineTo(Wd * 0.96, H * 0.82); ctx.moveTo(Wd * 0.22, H * 0.86); ctx.lineTo(Wd * 0.78, H * 0.86); ctx.stroke();
  }
  radar(ctx, P, W, range) {
    const s = this.s;
    const touch = this.g.touchOn;
    const R = (touch ? 60 : 72) * s;
    const cx = touch ? this.W - R - 12 : this.W / 2, cy = touch ? R + 12 : this.H - R - 14 * s;
    ctx.fillStyle = 'rgba(6,14,28,0.62)'; ctx.beginPath(); ctx.arc(cx, cy, R + 4 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(120,190,255,0.45)'; ctx.lineWidth = 1.2 * s;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,190,255,0.22)';
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    _q.copy(P.quat).invert();
    const dot = (p, col, size, filled, shape) => {
      _v.copy(p).sub(P.pos);
      const d = _v.length(); if (d > range) return;
      _v.applyQuaternion(_q);
      const ang = Math.acos(Math.max(-1, Math.min(1, -_v.z / (d || 1))));
      const h = Math.hypot(_v.x, _v.y) || 1;
      const r = ang / Math.PI * R;
      const x = cx + _v.x / h * r, y = cy - _v.y / h * r;
      const sz = size * s * (1.3 - Math.min(1, d / range) * 0.6);
      ctx.fillStyle = col; ctx.strokeStyle = col;
      if (shape === 'sq') { if (filled) ctx.fillRect(x - sz, y - sz, sz * 2, sz * 2); else ctx.strokeRect(x - sz, y - sz, sz * 2, sz * 2); }
      else if (shape === 'dia') this.diamond(ctx, x, y, sz * 1.3, col, !filled);
      else { ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI * 2); if (filled) ctx.fill(); else ctx.stroke(); }
      return { x, y };
    };
    for (const n of W.navs) if (n.active) dot(n.pos, C.nav, 3.2, true, 'dia');
    const T = W.playerTarget;
    for (const sh of W.ships) {
      if (sh === P || sh.dead || !sh.targetable) continue;
      _v2.copy(sh.pos).sub(P.pos).applyQuaternion(_q);
      const front = _v2.z < 0;
      const col = sh === T ? C.target : sh.hudMark === 'protect' ? C.protect : sh.kind === 'mine' ? C.mine : sh.team === 0 ? C.ally : (sh.kind === 'object' ? C.obj : C.enemy);
      const r = dot(sh.pos, col, sh.isLarge ? 3.4 : 2.2, front, sh.isLarge ? 'sq' : 'c');
      if (r && sh === T) { ctx.strokeStyle = C.target; ctx.beginPath(); ctx.arc(r.x, r.y, 6 * s, 0, Math.PI * 2); ctx.stroke(); }
    }
    for (const m of W.missiles.list) if (m.target === P && m.guided) dot(m.pos, '#ff3a2a', 1.6, true, 'c');
    ctx.fillStyle = 'rgba(200,230,255,0.9)';
    ctx.beginPath(); ctx.moveTo(cx, cy - 4 * s); ctx.lineTo(cx + 3 * s, cy + 3 * s); ctx.lineTo(cx - 3 * s, cy + 3 * s); ctx.closePath(); ctx.fill();
  }
}
