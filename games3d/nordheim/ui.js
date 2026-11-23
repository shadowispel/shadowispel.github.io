// Nordheim – gränssnitt: resursrad, byggmeny, infopanel, aviseringar, minikarta, statistik, mål.
import { BUILDINGS, BUILD_ORDER, CATS, RES, RES_INFO, UNITS, ENEMIES, T, R, SEASONS, costText, DAY } from './data.js';
import { G, hooks, calendar, fmtTime, clamp } from './state.js';
import { canAfford, isAllowed, bstat, bname, population, goalProgress, deadlineLeft, upgradeBuilding, removeBuilding, queueUnit, trade, tradeRates, TRADE, foodUse, storageFor, buildCost } from './sim.js';
import { warnTime, seaRoute } from './combat.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor(app) {
    this.app = app;
    this.cat = 'base';
    this.notes = [];
    this.lastInfo = '';
    this.infoT = 0; this.resT = 0; this.mmT = 0; this.cardT = 0;
    this.mm = $('minimap'); this.mmc = this.mm.getContext('2d');
    this.buildCats();
    this.bindStatic();
    this.mmBase = document.createElement('canvas');
    this.mmDirty = true;
  }

  /* ---------- Byggmeny ---------- */
  buildCats() {
    const cats = $('cats');
    cats.innerHTML = CATS.map(c => `<button class="cat" data-cat="${c.id}" title="${c.name} (${c.key})"><span class="ci">${c.icon}</span><span class="cn">${c.name}</span><kbd>${c.key}</kbd></button>`).join('');
    cats.addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { this.setCat(b.dataset.cat); this.app.audio.play('click'); } });
    $('cards').addEventListener('click', e => {
      const b = e.target.closest('[data-b]'); if (!b) return;
      this.app.startPlacing(b.dataset.b);
    });
    $('cards').addEventListener('pointerover', e => { const b = e.target.closest('[data-b]'); if (b) this.showTip(b.dataset.b, b); });
    $('cards').addEventListener('pointerout', e => { const b = e.target.closest('[data-b]'); if (b) this.hideTip(); });
    this.setCat('base');
  }
  setCat(id) {
    this.cat = id;
    document.querySelectorAll('#cats .cat').forEach(b => b.classList.toggle('on', b.dataset.cat === id));
    const list = BUILD_ORDER.filter(t => BUILDINGS[t].cat === id);
    $('cards').innerHTML = list.map(t => {
      const d = BUILDINGS[t];
      return `<button class="card" data-b="${t}"><span class="bi">${d.icon}</span><span class="bn">${d.name}</span><span class="bc">${costText(d.cost)}</span></button>`;
    }).join('');
    this.refreshCards();
    $('buildbar').classList.add('open');
  }
  refreshCards() {
    if (!G.on) return;
    document.querySelectorAll('#cards .card').forEach(el => {
      const t = el.dataset.b;
      const allowed = isAllowed(t);
      el.classList.toggle('locked', !allowed);
      el.classList.toggle('poor', allowed && !canAfford(buildCost(t)));
      const bc = el.querySelector('.bc'); if (bc) { const txt = costText(buildCost(t)) || 'Gratis'; if (bc.textContent !== txt) bc.textContent = txt; }
      el.classList.toggle('on', G.placing && G.placing.type === t);
    });
    document.querySelectorAll('#cats .cat').forEach(b => {
      const any = BUILD_ORDER.some(t => BUILDINGS[t].cat === b.dataset.cat && isAllowed(t));
      b.classList.toggle('locked', !any);
    });
  }
  showTip(t, anchor) {
    const d = BUILDINGS[t];
    const req = { coast: 'Nära vatten', shore: 'Vid strandkanten', ore: 'Intill malm', stone: 'Nära stenblock', fertile: 'Gräs/äng' }[d.req];
    const bits = [];
    if (d.workers) bits.push('👷 ' + d.workers + ' arbetare');
    if (d.housing) bits.push('🛏️ ' + d.housing + ' bostäder');
    if (d.store) bits.push('📦 +' + (d.store.all || d.store.food) + (d.store.food ? ' mat' : ''));
    if (d.range) bits.push('🎯 räckvidd ' + d.range);
    bits.push('📐 ' + d.size[0] + '×' + d.size[1]);
    if (req) bits.push('📍 ' + req);
    const locked = !isAllowed(t);
    const tip = $('tooltip');
    tip.innerHTML = `<b>${d.icon} ${d.name}</b><div class="tc">${costText(buildCost(t)) || 'Gratis'}</div><p>${d.desc}${t === 'woodcutter' ? ' Gratis när träet är slut.' : ''}</p><div class="tb">${bits.join(' · ')}</div>${d.lvl ? `<div class="tu">⬆ Kan uppgraderas till ${d.lvl.name}</div>` : ''}${locked ? '<div class="tl">🔒 Inte tillgänglig i detta scenario</div>' : ''}`;
    tip.classList.remove('hidden');
    const r = anchor.getBoundingClientRect(), rr = $('root').getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = clamp(r.left + r.width / 2 - tw / 2 - rr.left, 6, rr.width - tw - 6) + 'px';
    tip.style.top = Math.max(6, r.top - th - 8 - rr.top) + 'px';
  }
  hideTip() { $('tooltip').classList.add('hidden'); }

  /* ---------- Statiska knappar ---------- */
  bindStatic() {
    $('speed').addEventListener('click', e => { const b = e.target.closest('[data-sp]'); if (b) { this.app.setSpeed(+b.dataset.sp); this.app.audio.play('click'); } });
    $('btnMenu').onclick = () => this.app.pause(true);
    $('btnAlarm').onclick = () => this.app.toggleAlarm();
    $('btnStats').onclick = () => this.openStats();
    $('btnArmy').onclick = () => this.app.selectArmy();
    $('btnHall').onclick = () => this.app.focusHall();
    $('btnBuild').onclick = () => $('buildbar').classList.toggle('open');
    $('info').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) this.infoAction(b.dataset.act, b.dataset.v, b); });
    $('notes').addEventListener('click', e => { const n = e.target.closest('[data-x]'); if (n) this.app.jumpTo(+n.dataset.x, +n.dataset.z); });
    $('statsClose').onclick = () => this.closeStats();
    $('statsTabs').addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (b) { b.classList.toggle('on'); this.drawStats(); } });
    const mmh = (e) => {
      const r = this.mm.getBoundingClientRect();
      const n = G.map.n;
      const x = (e.clientX - r.left) / r.width * n, z = (e.clientY - r.top) / r.height * n;
      this.app.jumpTo(x, z, true);
    };
    this.mm.addEventListener('pointerdown', e => { e.stopPropagation(); this.mmDrag = true; this.mm.setPointerCapture(e.pointerId); mmh(e); });
    this.mm.addEventListener('pointermove', e => { if (this.mmDrag) mmh(e); });
    this.mm.addEventListener('pointerup', () => { this.mmDrag = false; });
    $('confirmBar').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) this.app.touchConfirm(b.dataset.c); });
    // resurs-popup: hovra (mus) eller tryck (pek) på en resurs
    const rb = $('resbar');
    rb.addEventListener('pointerover', e => { if (e.pointerType !== 'mouse') return; const t = e.target.closest('[data-res]'); if (t) this.showResPop(t.dataset.res); });
    rb.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') this.hideResPop(); });
    rb.addEventListener('click', e => { const t = e.target.closest('[data-res]'); if (!t) return; if (this.popKey === t.dataset.res && e.pointerType !== 'mouse') this.hideResPop(); else this.showResPop(t.dataset.res); });
    document.addEventListener('pointerdown', e => { if (this.popKey && !e.target.closest('#resbar')) this.hideResPop(); }, true);
  }

  /* ---------- Resurs-popup ---------- */
  hideResPop() { this.popKey = null; $('respop').classList.add('hidden'); }
  showResPop(key) {
    if (!G.on) return;
    this.popKey = key;
    const el = $('respop');
    const html = this.resPopHtml(key);
    if (html !== this._popHtml) { el.innerHTML = html; this._popHtml = html; }
    el.classList.remove('hidden');
    const a = document.querySelector(`#resbar [data-res="${key}"]`); if (!a) return;
    const r = a.getBoundingClientRect(), rr = $('root').getBoundingClientRect();
    el.style.left = clamp(r.left - rr.left, 6, rr.width - el.offsetWidth - 6) + 'px';
    el.style.top = (r.bottom - rr.top + 6) + 'px';
  }
  resPopHtml(key) {
    const row = (a, b, cls = '') => `<div class="r"><span>${a}</span><b class="${cls}">${b}</b></div>`;
    const rate = G.rate || {}, f1 = v => (v >= 0 ? '+' : '') + Math.round(v);
    const pop = population(), cit = G.citizens.length;
    if (key === 'food') {
      const use = foodUse(), prod = rate.food || 0, net = prod - use;
      let h = `<b class="h">🍖 Mat</b>` + row('I lager', Math.floor(G.stock.food) + ' / ' + G.cap.food);
      h += row('Produktion', f1(prod) + ' per dygn', 'pos') + row('Förbrukning', '−' + Math.round(use) + ' per dygn', 'neg');
      h += `<div class="dim small">${pop} munnar × 2 mat per dygn${G.cal.season === 3 ? ' × 1,35 (vinter)' : ''}</div>`;
      h += row('Netto', f1(net) + ' per dygn', net >= 0 ? 'pos' : 'neg');
      const src = [['🐟 Fisk', 'ft_fish'], ['🫐 Bär', 'ft_berries'], ['🦌 Kött', 'ft_meat'], ['🌾 Bröd', 'ft_bread']].filter(([, k]) => (rate[k] || 0) >= 0.5);
      if (src.length) h += `<div class="dim">${src.map(([n, k]) => n + ' ' + Math.round(rate[k])).join(' · ')}</div>`;
      h += row('Matsorter', (G.variety || 0) + ' av 4', '') + `<div class="dim">Varje sort utöver den första ger +4 glädje.</div>`;
      if (net < -0.5 && G.stock.food > 0) h += `<div class="tipline">⏳ Räcker i ungefär ${Math.max(0, G.stock.food / -net).toFixed(1).replace('.', ',')} dygn.</div>`;
      const need = Math.ceil(pop * 1.4 + 8);
      h += `<div class="tipline">${G.stock.food >= need ? '✅' : '❌'} Nybyggare flyttar in först när det finns minst ${need} mat i lager.</div>`;
      if (net < 0) h += `<div class="tipline">💡 Bygg fler fiskarhyddor, jägarstugor, samlarkojor${isAllowed('field') ? ' eller åkrar med lada' : ''}.${G.stock.gold >= 30 && isAllowed('market') ? ' Med guld kan du köpa mat på en marknad.' : ''}</div>`;
      return h;
    }
    if (key === 'happy') {
      const p = G.happyParts || {};
      const L = [['Grund', p.base], ['Matvariation', p.variety], ['Skatt', p.tax], ['Hov', p.temple], ['Marknad', p.market], ['Brunn', p.well], ['Hunger', p.hunger], ['Hemlösa', p.homeless], ['Sorg efter döda', p.loss], ['Fiender i byn', p.raid], ['Vinter', p.winter], ['Arbetslöshet', p.idle]].filter(x => x[1]);
      let h = `<b class="h">🙂 Glädje ${Math.round(G.happiness)} %</b>`;
      h += L.map(([n, v]) => row(n, (v > 0 ? '+' : '') + v, v > 0 ? 'pos' : 'neg')).join('');
      h += `<div class="dim" style="margin-top:6px">Över 75 %: snabb inflyttning · 55–75 %: normal · under 35 %: ingen inflyttning · under 22 %: folk flyttar.</div>`;
      const tips = [];
      if (!p.variety || p.variety < 8) tips.push('fler matsorter (fisk, bär, kött, bröd)');
      if (!p.temple && isAllowed('temple')) tips.push('ett hov nära husen');
      if (!p.market && isAllowed('market')) tips.push('en marknad nära husen');
      if (!p.well) tips.push('brunnar nära husen');
      if (G.tax > 0) tips.push('lägre skatt (i hallens panel)');
      if (p.idle) tips.unshift('fler arbetsplatser åt de arbetslösa');
      if (tips.length) h += `<div class="tipline">💡 Höj glädjen med ${tips.slice(0, 3).join(', ')}.</div>`;
      return h;
    }
    if (key === 'pop') {
      const free = G.housing - cit, idle = G.citizens.filter(c => !c.job && !c.trainee).length;
      const need = Math.ceil(pop * 1.4 + 8);
      let h = `<b class="h">👥 Invånare ${pop}</b>` + row('Bybor', cit) + row('Soldater', G.units.length + ' / ' + G.soldierCap) + row('Bostäder', G.housing + (free > 0 ? ' (' + free + ' lediga)' : ' (fullt)'), free > 0 ? 'pos' : 'neg') + row('Lediga (byggare)', idle);
      h += `<div class="tipline">Inflyttning kräver:</div>`;
      h += `<div>${free > 0 ? '✅' : '❌'} ledig bostad</div><div>${G.stock.food >= need ? '✅' : '❌'} minst ${need} mat i lager</div><div>${(rate.food || 0) >= foodUse() || G.stock.food > foodUse() * 2.5 ? '✅' : '❌'} maten räcker till fler (produktion ≥ förbrukning)</div><div>${G.happiness >= 35 ? '✅' : '❌'} glädje minst 35 %</div><div>${G.starve <= 0 ? '✅' : '❌'} ingen svält</div>`;
      if ((G.happyParts || {}).idle) h += `<div class="tipline">💡 ${G.idleCount} saknar arbete – arbetslöshet sänker glädjen.</div>`;
      return h;
    }
    const r = key, inf = RES_INFO[r]; if (!inf) return '';
    let h = `<b class="h">${inf.icon} ${inf.name}</b>` + row('I lager', Math.floor(G.stock[r]) + (r !== 'gold' ? ' / ' + G.cap[r] : ''));
    if ((rate[r] || 0) >= 0.5) h += row('Produktion', f1(rate[r]) + ' per dygn', 'pos');
    const src = { wood: 'Huggarstugor fäller träd. Trä används till byggen, reparationer och smide.', stone: 'Stenhuggerier bryter stenblock.', iron: 'Gruvor intill malmådror ger järn.', gold: 'Skatt varje dygn, gruvor, handel och avvärjda räder.', weapons: 'Smedjan gör vapen av 2 järn + 1 trä. Krävs för krigare och sköldmör.' }[r];
    if (src) h += `<div class="dim">${src}</div>`;
    if (r === 'gold') h += row('Skatt', '≈ +' + Math.round(cit * [0.35, 0.8, 1.6][G.tax]) + ' per dygn', 'pos');
    if (r !== 'gold' && G.stock[r] >= G.cap[r]) h += `<div class="tipline">📦 Lagret är fullt – bygg en lagerbod.</div>`;
    return h;
  }

  /* ---------- Aviseringar ---------- */
  notify(text, type = 'info', pos) {
    const el = document.createElement('div');
    el.className = 'note ' + type;
    el.textContent = text;
    if (pos) { el.dataset.x = pos.x; el.dataset.z = pos.z; el.classList.add('link'); }
    const host = $('notes');
    host.prepend(el);
    while (host.children.length > 6) host.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, type === 'raid' ? 12000 : 7000);
    if (type === 'raid' || type === 'bad') this.app.audio.play(type === 'raid' ? 'countdown' : 'error', { vol: 0.5, gap: 400 });
  }

  /* ---------- Per bildruta ---------- */
  update(dt) {
    if (!G.on) return;
    this.resT -= dt; this.infoT -= dt; this.mmT -= dt; this.cardT -= dt;
    if (this.resT <= 0) { this.resT = 0.2; this.updateRes(); this.updateGoals(); }
    if (this.infoT <= 0) { this.infoT = 0.25; this.updateInfo(); }
    if (this.mmT <= 0) { this.mmT = 0.25; this.drawMinimap(); }
    if (this.cardT <= 0) { this.cardT = 0.5; this.refreshCards(); if (!$('statsModal').classList.contains('hidden')) this.drawStats(); }
  }

  updateRes() {
    const s = G.stock, c = G.cap;
    const out = RES.map(r => {
      const v = Math.floor(s[r]), cap = c[r];
      const full = r !== 'gold' && v >= cap;
      const low = r === 'food' && v < population();
      return `<span class="res${full ? ' full' : ''}${low ? ' low' : ''}" data-res="${r}"><i>${RES_INFO[r].icon}</i><b>${v}</b>${r !== 'gold' ? `<small>/${cap}</small>` : ''}</span>`;
    });
    const pop = population(), housing = G.housing;
    const h = Math.round(G.happyShown);
    const face = h >= 75 ? '😄' : h >= 55 ? '🙂' : h >= 35 ? '😐' : h >= 20 ? '🙁' : '😠';
    out.push(`<span class="res" data-res="pop"><i>👥</i><b>${pop}</b><small>/${housing + G.units.length}</small></span>`);
    out.push(`<span class="res happy" data-res="happy"><i>${face}</i><b>${h}%</b></span>`);
    const html = out.join('');
    if (html !== this._resHtml) { $('resbar').innerHTML = html; this._resHtml = html; }
    // resten av HUD:en placeras under toppfältet (som kan radbrytas på smala skärmar)
    const tb = $('topbar').getBoundingClientRect(), rr = $('root').getBoundingClientRect();
    const top = Math.round(tb.bottom - rr.top + 6) + 'px';
    if (top !== this._top && tb.height > 0) { this._top = top; $('hud').style.setProperty('--top', top); }
    if (this.popKey) this.showResPop(this.popKey);
    const cal = G.cal;
    const night = cal.phase > 0.8 || cal.phase < 0.03;
    const clock = `<span>${cal.seasonInfo.icon} ${cal.seasonInfo.name}</span><span class="dim">dag ${cal.dayInSeason} · år ${cal.year}</span><span class="sun" style="--p:${cal.phase}">${night ? '🌙' : '☀️'}</span>`;
    if (clock !== this._clock) { $('clock').innerHTML = clock; this._clock = clock; }
    // räd
    const R = G.raid, rb = $('raidbar');
    if (R && G.raidsOn) {
      let txt = '', cls = '';
      if (R.active) {
        const landed = G.enemies.filter(e => e.raid === R.wave).length;
        const aboard = G.ships.reduce((s, sh) => s + (sh.kind === 'long' && sh.raid === R.wave && sh.phase === 'in' && sh.cargo ? sh.cargo.length : 0), 0);
        txt = aboard && !landed ? `⛵ Räd ${R.wave}: drakskeppen närmar sig – ${aboard} fiender ombord` : `⚔️ Räd ${R.wave} pågår – ${landed + aboard} fiender kvar`; cls = 'active';
      }
      else if (R.warned) { txt = `⚠️ Räd om ${fmtTime(R.next - G.time)}!`; cls = 'warn'; }
      else { const t = R.next - G.time - warnTime(); txt = `🛡️ Nästa räd om ~${fmtTime(Math.max(0, R.next - G.time))}`; cls = t < 60 ? 'soon' : 'calm'; }
      rb.className = cls; rb.textContent = txt;
    } else rb.className = 'hidden';
    $('btnAlarm').classList.toggle('on', !!G.alarm);
    document.querySelectorAll('#speed [data-sp]').forEach(b => b.classList.toggle('on', +b.dataset.sp === this.app.speed));
  }

  updateGoals() {
    const el = $('goals');
    let html = '';
    if (G.sc) {
      html += `<div class="gt">${G.sc.icon} ${esc(G.sc.name)}</div>`;
      G.sc.goals.forEach((g, i) => {
        const [a, b] = goalProgress(g);
        const done = a >= b || G.goalsDone[i];
        const prog = g.type === 'survive' && !done ? (b - a) + ' dygn kvar' : g.type === 'destroyCamp' ? (done ? 'klart' : '') : Math.min(a, b) + '/' + b;
        html += `<div class="goal${done ? ' done' : ''}"><span>${done ? '✅' : '⬜'} ${esc(g.label)}</span><span class="gp">${prog}</span></div>`;
      });
      const dl = deadlineLeft();
      if (dl != null) html += `<div class="goal dl">⏳ ${esc(G.sc.deadline.label)}: ${fmtTime(dl)}</div>`;
    } else if (G.mode === 'survival') {
      html += `<div class="gt">🛡️ Överlevnad</div><div class="goal"><span>Överlevda räder</span><span class="gp">${G.counters.raids}</span></div><div class="goal"><span>Poäng</span><span class="gp">${G.score}</span></div><div class="goal dim"><span>Rekord</span><span class="gp">${Spelhallen.fmt(Spelhallen.best('nordheim'))}</span></div>`;
    } else {
      html += `<div class="gt">🌲 Fritt spel</div><div class="goal dim"><span>${esc(G.diff.name)} · ${G.raidsOn ? 'räder på' : 'inga räder'}</span></div><div class="goal"><span>Överlevda räder</span><span class="gp">${G.counters.raids}</span></div>`;
    }
    if (html !== this._goals) { el.innerHTML = html; this._goals = html; }
  }

  /* ---------- Infopanel ---------- */
  updateInfo(force) {
    const el = $('info');
    const s = G.sel;
    let html = '';
    if (G.selUnits && G.selUnits.size) html = this.unitsInfo();
    else if (s && s.kind === 'building' && G.buildings.has(s.b.id)) html = this.buildingInfo(s.b);
    else if (s && s.kind === 'citizen' && G.citizens.includes(s.c)) html = this.citizenInfo(s.c);
    else if (s && s.kind === 'enemy' && !s.e.dead) html = this.enemyInfo(s.e);
    else if (s) G.sel = null;
    el.classList.toggle('hidden', !html);
    if (html !== this.lastInfo || force) { el.innerHTML = html; this.lastInfo = html; }
  }
  hpBar(hp, max, cls = '') { const f = clamp(hp / max, 0, 1); return `<div class="hp ${cls}"><i style="width:${(f * 100).toFixed(1)}%;background:${f > 0.6 ? '#5bd46a' : f > 0.3 ? '#e8c040' : '#e85040'}"></i><span>${Math.ceil(hp)} / ${max}</span></div>`; }

  buildingInfo(b) {
    const d = b.def;
    let h = `<div class="ih"><span class="ii">${d.icon}</span><div><b>${esc(bname(b))}</b>${b.lvl > 1 ? ' <span class="lv">nivå 2</span>' : ''}<div class="dim">${b.team ? 'Fiendebyggnad' : esc(d.desc)}</div></div><button class="x" data-act="close" title="Stäng (Esc)">✕</button></div>`;
    h += this.hpBar(b.hp, b.maxHp);
    if (b.fire > 0) h += `<div class="warnline">🔥 Brinner! ${b.fighters ? 'Invånare släcker…' : 'Bygg en brunn i närheten.'}</div>`;
    if (b.team) return h;
    if (!b.built) {
      h += `<div class="prog"><i style="width:${(b.progress * 100).toFixed(0)}%"></i><span>${b.upgrading ? 'Byggs ut' : 'Byggs'} ${(b.progress * 100).toFixed(0)}% · ${b.builders || 0} byggare</span></div>`;
      if (!b.builders && !G.citizens.some(c => !c.job)) h += `<div class="warnline">Inga lediga byggare – minska antalet arbetare någonstans.</div>`;
    }
    const wk = bstat(b, 'workers');
    if (wk && b.built) {
      h += `<div class="row"><span>👷 Arbetare</span><span class="ctl"><button data-act="wk" data-v="-1">−</button><b>${b.workers.length}/${b.paused ? 0 : b.want}</b><button data-act="wk" data-v="1">+</button></span></div>`;
      if (b.workers.length < b.want && !b.paused) h += `<div class="dim small">Väntar på lediga invånare…</div>`;
    }
    // typ-specifikt
    const t = b.type;
    const prodRes = { woodcutter: 'wood', quarry: 'stone', mine: 'iron', fisher: 'food', hunter: 'food', gatherer: 'food', barn: 'food' }[t];
    if (prodRes && b.built) {
      const st = storageFor(prodRes, b.x, b.z);
      const dd = st ? Math.round(Math.hypot(st.x - b.x, st.z - b.z)) : null;
      if (dd == null) h += `<div class="warnline">Inget lager för ${RES_INFO[prodRes].name.toLowerCase()} – bygg en lagerbod.</div>`;
      else if (dd > 14) h += `<div class="warnline">📦 Långt till närmaste lager (${dd} rutor) – arbetarna går mycket. Bygg en ${prodRes === 'food' ? 'lada eller lagerbod' : 'lagerbod'} i närheten.</div>`;
    }
    if (bstat(b, 'housing')) { const occ = G.citizens.filter(c => c.home === b.id).length; h += `<div class="row"><span>🛏️ Boende</span><b>${occ}/${bstat(b, 'housing')}</b></div>`; }
    if (bstat(b, 'store')) { const st = bstat(b, 'store'); h += `<div class="row"><span>📦 Lager</span><b>+${st.all || st.food} ${st.food && !st.all ? 'mat' : 'av allt'}</b></div>`; }
    if (t === 'field') {
      const f = b.field;
      const txt = f.state === 'ripe' ? '🌾 Mogen – väntar på skörd' : f.state === 'growing' ? `🌱 Växer ${(f.grow * 100).toFixed(0)}%${G.cal.season === 3 ? ' (vilar under vintern)' : ''}` : '🟫 Träda – sås på våren/sommaren';
      h += `<div class="row"><span>${txt}</span></div><div class="dim small">Ängsrutor: ${b.meadow}/9 (ger större skörd)</div>`;
      const barn = [...G.buildings.values()].some(x => x.type === 'barn' && x.built && (x.x - b.x) ** 2 + (x.z - b.z) ** 2 <= bstat(x, 'radius') ** 2);
      if (!barn) h += `<div class="warnline">Ingen lada inom räckhåll – bygg en lada!</div>`;
    }
    if (t === 'barn') { const fs = [...G.buildings.values()].filter(x => x.field && (x.x - b.x) ** 2 + (x.z - b.z) ** 2 <= bstat(b, 'radius') ** 2); h += `<div class="row"><span>🌾 Åkrar inom räckhåll</span><b>${fs.length}</b></div>`; }
    if (t === 'archertower' || t === 'watchtower') h += `<div class="row"><span>🎯 Räckvidd / skada</span><b>${bstat(b, 'range')} / ${bstat(b, 'dmg')}</b></div>`;
    if (t === 'watchtower') h += `<div class="dim small">Räder varnas nu ${warnTime()} s i förväg.</div>`;
    if (t === 'temple') h += `<div class="dim small">${b.workers.length ? '✨ Ger +' + (b.lvl > 1 ? 24 : 16) + ' glädje till hus inom räckhåll' : 'Behöver en gode (arbetare) för att verka'}</div>`;
    if (t === 'mine') { let ore = 0; const n = G.map.n; for (let j = b.j - 3; j < b.j + b.d + 3; j++) for (let i = b.i - 3; i < b.i + b.w + 3; i++) { const k = j * n + i; if (k >= 0 && k < n * n && G.map.res[k] === R.ORE) ore += G.map.amt[k]; } h += `<div class="row"><span>⛰️ Malm kvar</span><b>${Math.round(ore)}</b></div>`; }
    if (t === 'smithy') h += `<div class="dim small">Smitt hittills: ${G.counters.weapons} vapen. Kräver 2 ⛓️ + 1 🪵 per vapen.</div>`;
    if (t === 'hall') {
      h += `<div class="row"><span>💰 Skatt</span><span class="seg">${['Låg', 'Normal', 'Hög'].map((n, i) => `<button data-act="tax" data-v="${i}" class="${G.tax === i ? 'on' : ''}">${n}</button>`).join('')}</span></div>`;
      h += `<div class="dim small">Låg skatt gör folk gladare, hög ger mer guld.</div>`;
      h += this.happyBreakdown();
    }
    if (t === 'market' && b.built) h += this.tradeHtml(b);
    if (t === 'harbor' && b.built) {
      if (!seaRoute(b)) h += `<div class="warnline">Hamnen saknar fri segelled till havet – handelsskepp kan inte komma hit (fisket fungerar).</div>`;
      else h += `<div class="dim small">Handelsskepp anländer varje årstid.${G.merchantT > 0 ? ' 🚢 Ett skepp ligger i hamn nu!' : ''}</div>`;
      if (G.merchantT > 0) h += this.tradeHtml(b);
    }
    if (t === 'barracks' && b.built) {
      h += `<div class="sub">Träna soldater <span class="dim">(${G.units.length}/${G.soldierCap})</span></div><div class="train">`;
      for (const [k, u] of Object.entries(UNITS)) {
        const ok = canAfford(u.cost);
        h += `<button data-act="train" data-v="${k}" class="${ok ? '' : 'poor'}" title="${esc(u.desc)}"><span class="bi">${u.icon}</span><span>${u.name}</span><small>${costText(u.cost)}</small></button>`;
      }
      h += `</div>`;
      if (b.queue.length) {
        const q = b.queue[0];
        h += `<div class="prog"><i style="width:${(q.t / UNITS[q.type].time * 100).toFixed(0)}%"></i><span>${UNITS[q.type].icon} ${UNITS[q.type].name}${b.waiting ? ' – väntar på ledig invånare' : ''}${b.queue.length > 1 ? ' (+' + (b.queue.length - 1) + ' i kö)' : ''}</span></div>`;
      }
      h += `<div class="dim small">Högerklicka på marken för att sätta samlingsplats.</div>`;
    }
    // knappar
    h += `<div class="btns">`;
    const lv = d.lvl;
    if (lv && b.lvl === 1 && b.built) h += `<button data-act="up" class="${canAfford(lv.cost) ? '' : 'poor'}" title="${esc(lv.desc)}">⬆ ${esc(lv.name)} <small>${costText(lv.cost)}</small> <kbd>U</kbd></button>`;
    if (wk && b.built) h += `<button data-act="pause">${b.paused ? '▶ Återuppta' : '⏸ Pausa'}</button>`;
    if (b.hp < b.maxHp && b.built && b.fire <= 0) h += `<span class="dim small">🔧 Lediga invånare reparerar (kostar trä)</span>`;
    if (t !== 'hall') h += `<button data-act="demolish" class="danger">🗑 Riv <kbd>Del</kbd></button>`;
    h += `</div>`;
    return h;
  }
  happyBreakdown() {
    const p = G.happyParts; if (!p) return '';
    const L = [['Grund', p.base], ['Matvariation', p.variety], ['Skatt', p.tax], ['Hov', p.temple], ['Marknad', p.market], ['Brunn', p.well], ['Hunger', p.hunger], ['Hemlösa', p.homeless], ['Sorg', p.loss], ['Räd', p.raid], ['Vinter', p.winter], ['Arbetslösa', p.idle]].filter(x => x[1]);
    return `<div class="sub">Glädje ${Math.round(G.happiness)}%</div><div class="hb">${L.map(([n, v]) => `<span class="${v > 0 ? 'pos' : 'neg'}">${n} ${v > 0 ? '+' : ''}${v}</span>`).join('')}</div>`;
  }
  tradeHtml(b) {
    const r = tradeRates();
    let h = `<div class="sub">Handel <span class="dim">${G.merchantT > 0 ? '(handelsskepp – bra priser!)' : ''}</span></div><div class="trade">`;
    for (const res of Object.keys(TRADE)) {
      const buyP = Math.ceil(TRADE[res] * 10 * r.buy), sellP = Math.floor(TRADE[res] * 10 * r.sell);
      h += `<span>${RES_INFO[res].icon} ×10</span><button data-act="buy" data-v="${res}">Köp ${buyP}🪙</button><button data-act="sell" data-v="${res}">Sälj ${sellP}🪙</button>`;
    }
    return h + `</div>`;
  }
  citizenInfo(c) {
    const job = c.job && G.buildings.get(c.job), home = c.home && G.buildings.get(c.home);
    let h = `<div class="ih"><span class="ii">🧑</span><div><b>${esc(c.name)}</b><div class="dim">${job ? esc(job.def.name) : (c.trainee ? 'Rekryt' : 'Ledig / byggare')}</div></div><button class="x" data-act="close">✕</button></div>`;
    h += this.hpBar(c.hp, c.maxHp);
    h += `<div class="act">“${esc(c.act || 'Ledig')}”</div>`;
    h += `<div class="row"><span>🏠 Hem</span><b>${home ? esc(home.def.name) : 'Hemlös'}</b></div>`;
    if (c.carry) h += `<div class="row"><span>🎒 Bär</span><b>${c.carry.n} ${RES_INFO[c.carry.r].icon}</b></div>`;
    h += `<div class="row"><span>🙂 Glädje</span><b>${Math.round(c.happy || 0)}%</b></div>`;
    h += `<div class="btns"><button data-act="follow">🎥 Följ</button>${job ? '<button data-act="gojob">Visa arbetsplats</button>' : ''}</div>`;
    return h;
  }
  enemyInfo(e) {
    const d = ENEMIES[e.type];
    let h = `<div class="ih"><span class="ii">☠️</span><div><b>${esc(d.name)}</b><div class="dim">${esc(d.desc || 'Fiende')}</div></div><button class="x" data-act="close">✕</button></div>`;
    h += this.hpBar(e.hp, e.maxHp, 'red');
    h += `<div class="row"><span>⚔️ Anfall / 🛡️ rustning</span><b>${e.atk} / ${e.armor}</b></div>`;
    if (e.loot) h += `<div class="warnline">Bär stöldgods: ${e.loot.n} ${RES_INFO[e.loot.r].icon}</div>`;
    return h;
  }
  unitsInfo() {
    const us = [...G.selUnits].filter(u => !u.dead);
    if (!us.length) { G.selUnits.clear(); return ''; }
    let h = '';
    if (us.length === 1) {
      const u = us[0];
      h += `<div class="ih"><span class="ii">${UNITS[u.type].icon}</span><div><b>${esc(u.name)}</b><div class="dim">${UNITS[u.type].name}</div></div><button class="x" data-act="close">✕</button></div>`;
      h += this.hpBar(u.hp, u.maxHp);
      h += `<div class="row"><span>⚔️ Anfall / 🛡️ rustning / 🎯</span><b>${u.atk} / ${u.armor} / ${u.range > 2 ? u.range : 'närstrid'}</b></div>`;
      h += `<div class="act">${u.order ? (u.order.type === 'move' ? 'Marscherar' : 'Anfaller') : u.target ? 'Strider' : 'Håller position'}</div>`;
    } else {
      const cnt = {}; us.forEach(u => cnt[u.type] = (cnt[u.type] || 0) + 1);
      const hp = us.reduce((s, u) => s + u.hp, 0), mx = us.reduce((s, u) => s + u.maxHp, 0);
      h += `<div class="ih"><span class="ii">⚔️</span><div><b>${us.length} soldater</b><div class="dim">${Object.entries(cnt).map(([k, v]) => UNITS[k].icon + ' ' + v).join('  ')}</div></div><button class="x" data-act="close">✕</button></div>`;
      h += this.hpBar(hp, mx);
    }
    const f = this.app.formation;
    h += `<div class="row"><span>Formation</span><span class="seg">${[['line', 'Linje'], ['block', 'Block'], ['wedge', 'Kil']].map(([k, n]) => `<button data-act="form" data-v="${k}" class="${f === k ? 'on' : ''}">${n}</button>`).join('')}</span></div>`;
    h += `<div class="dim small">Högerklicka (eller tryck) på marken för att flytta, på en fiende för att anfalla.</div>`;
    h += `<div class="btns"><button data-act="stop">✋ Stoppa</button><button data-act="disband" title="Gör soldaterna till vanliga invånare igen">Avrusta</button></div>`;
    return h;
  }

  infoAction(act, v, el) {
    const app = this.app, s = G.sel;
    const b = s && s.kind === 'building' ? s.b : null;
    app.audio.play('click');
    switch (act) {
      case 'close': app.deselect(); break;
      case 'wk': if (b) { const max = bstat(b, 'workers'); b.want = clamp(b.want + (+v), 0, max); b.paused = false; } break;
      case 'pause': if (b) b.paused = !b.paused; break;
      case 'up': if (b) { if (upgradeBuilding(b)) this.notify(b.def.name + ' byggs ut', 'info'); else app.audio.play('error'); } break;
      case 'demolish': if (b) app.demolish(b); break;
      case 'tax': G.tax = +v; break;
      case 'buy': case 'sell': if (!trade(v, 10, act === 'buy')) { app.audio.play('error'); this.notify(act === 'buy' ? 'Inte tillräckligt med guld eller lagerplats' : 'Inte tillräckligt att sälja', 'warn'); } else app.audio.play('coin'); break;
      case 'train': if (b) { const err = queueUnit(b, v); if (err) { this.notify(err, 'warn'); app.audio.play('error'); } } break;
      case 'follow': if (s && s.c) app.follow = s.c; break;
      case 'gojob': if (s && s.c && s.c.job) { const jb = G.buildings.get(s.c.job); if (jb) { app.jumpTo(jb.x, jb.z); G.sel = { kind: 'building', b: jb }; } } break;
      case 'form': app.formation = v; app.settings.set('formation', v); break;
      case 'stop': for (const u of G.selUnits) { u.order = null; u.target = null; u.path = null; u.ax = u.x; u.az = u.z; } break;
      case 'disband': app.disband(); break;
    }
    this.updateInfo(true);
    this.updateRes();
  }

  /* ---------- Minikarta ---------- */
  drawMinimapBase() {
    const m = G.map, n = m.n;
    this.mmBase.width = n; this.mmBase.height = n;
    const ctx = this.mmBase.getContext('2d');
    const img = ctx.createImageData(n, n);
    const cols = { [T.WATER]: [30, 80, 120], [T.SAND]: [214, 196, 140], [T.GRASS]: [104, 150, 66], [T.MEADOW]: [140, 180, 80], [T.FOREST]: [70, 110, 50], [T.ROCK]: [130, 128, 122] };
    for (let k = 0; k < n * n; k++) {
      let c = cols[m.type[k]];
      if (m.type[k] === T.WATER) { const i = k % n, j = (k / n) | 0; const h = m.h[j * (n + 1) + i]; const f = clamp(1 + h * 0.25, 0.4, 1); c = [30 + 60 * f, 80 + 60 * f, 120 + 40 * f]; }
      if (m.res[k] === R.TREE && m.grow[k] > 0.3) c = [46, 86, 40];
      else if (m.res[k] === R.STONE) c = [170, 170, 170];
      else if (m.res[k] === R.ORE) c = [190, 110, 60];
      if (G.road[k]) c = [150, 120, 80];
      else if (G.fieldOf[k]) c = [170, 140, 70];
      const o = k * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.mmDirty = false;
  }
  drawMinimap() {
    if (!G.map) return;
    const cv = this.mm, ctx = this.mmc, n = G.map.n;
    const W = cv.clientWidth || 160;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(W * dpr); }
    if (this.mmDirty) this.drawMinimapBase();
    const s = cv.width / n;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mmBase, 0, 0, cv.width, cv.height);
    for (const b of G.buildings.values()) {
      if (b.type === 'field') continue;
      ctx.fillStyle = b.team ? '#d02020' : b.fire > 0 ? '#ff8a20' : b.def.wall || b.def.gate ? '#d8c8a0' : b.built ? '#f2e2b0' : '#a89878';
      ctx.fillRect(b.i * s, b.j * s, Math.max(1.5, b.w * s), Math.max(1.5, b.d * s));
    }
    ctx.fillStyle = '#ffffff';
    for (const c of G.citizens) if (!c.inside) ctx.fillRect(c.x * s - 0.75 * dpr, c.z * s - 0.75 * dpr, 1.5 * dpr, 1.5 * dpr);
    ctx.fillStyle = '#4aa8ff';
    for (const u of G.units) ctx.fillRect(u.x * s - 1.25 * dpr, u.z * s - 1.25 * dpr, 2.5 * dpr, 2.5 * dpr);
    ctx.fillStyle = '#ff3030';
    for (const e of G.enemies) ctx.fillRect(e.x * s - 1.5 * dpr, e.z * s - 1.5 * dpr, 3 * dpr, 3 * dpr);
    for (const sh of G.ships) { ctx.fillStyle = sh.kind === 'long' ? '#ff3030' : '#60b0ff'; ctx.beginPath(); ctx.arc(sh.x * s, sh.z * s, 3 * dpr, 0, 6.28); ctx.fill(); }
    // räd-varning
    const R = G.raid;
    if (R && R.warned && !R.active && R.spawns) {
      const pulse = 4 + Math.sin(performance.now() / 150) * 2;
      ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 2 * dpr;
      for (const sp of R.spawns) { ctx.beginPath(); ctx.arc(sp.x * s, sp.z * s, (pulse + 3) * dpr, 0, 6.28); ctx.stroke(); }
    }
    // kamerans synfält
    const fr = this.app.frustumOnGround();
    if (fr) {
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath(); fr.forEach((p, i) => i ? ctx.lineTo(p.x * s, p.z * s) : ctx.moveTo(p.x * s, p.z * s)); ctx.closePath(); ctx.stroke();
    }
  }

  /* ---------- Statistik ---------- */
  openStats() { $('statsModal').classList.remove('hidden'); this.drawStats(); this.app.audio.play('click'); }
  closeStats() { $('statsModal').classList.add('hidden'); }
  drawStats() {
    const cv = $('statsCanvas'), ctx = cv.getContext('2d');
    const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const S = G.stats;
    const series = [['pop', 'Invånare', '#ffffff'], ['food', 'Mat', '#e0a040'], ['wood', 'Trä', '#b07a40'], ['stone', 'Sten', '#a0a0b0'], ['gold', 'Guld', '#ffd040'], ['happy', 'Glädje %', '#60e080'], ['soldiers', 'Soldater', '#4aa8ff']];
    const on = new Set([...document.querySelectorAll('#statsTabs [data-s].on')].map(b => b.dataset.s));
    const pad = { l: 38, r: 10, t: 10, b: 24 };
    const n = S.t.length;
    ctx.font = '12px Rubik, sans-serif';
    if (n < 2) { ctx.fillStyle = '#9aa6cf'; ctx.fillText('Statistik samlas in medan du spelar…', pad.l, H / 2); return; }
    let max = 10;
    for (const [k] of series) if (on.has(k)) for (const v of S[k]) max = Math.max(max, v);
    max = Math.ceil(max / 10) * 10;
    const t0 = S.t[0], t1 = S.t[n - 1];
    const X = t => pad.l + (t - t0) / Math.max(1, t1 - t0) * (W - pad.l - pad.r);
    const Y = v => H - pad.b - v / max * (H - pad.t - pad.b);
    ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.fillStyle = '#9aa6cf';
    for (let i = 0; i <= 4; i++) { const v = max * i / 4, y = Y(v); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); ctx.fillText(String(Math.round(v)), 4, y + 4); }
    const mins = (t1 - t0) / 60;
    for (let i = 0; i <= 4; i++) { const t = t0 + (t1 - t0) * i / 4; ctx.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center'; ctx.fillText(Math.round((t - t0) / 60 * 10) / 10 + ' min', X(t), H - 6); }
    ctx.textAlign = 'left';
    for (const [k, , c] of series) {
      if (!on.has(k)) continue;
      ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath();
      S[k].forEach((v, i) => { const x = X(S.t[i]), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    const c = G.counters;
    $('statsTotals').innerHTML = `<span>🏗️ Byggt: <b>${c.built}</b></span><span>🪓 Fällda träd: <b>${c.chopped}</b></span><span>⚔️ Vapen smidda: <b>${c.weapons}</b></span><span>🛡️ Tränade: <b>${c.trained}</b></span><span>☠️ Fiender fällda: <b>${c.kills || 0}</b></span><span>👶 Inflyttade: <b>${c.born}</b></span><span>⚰️ Döda: <b>${c.died}</b></span><span>🏴 Räder: <b>${c.raids}</b></span>`;
  }
}
