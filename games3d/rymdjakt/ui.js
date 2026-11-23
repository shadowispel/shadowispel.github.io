/**
 * Rymdjakt – menyer: huvudmeny, kampanjkarta, genomgång, hangar, överlevnad, debriefing, paus, rekord och hjälp.
 */
import { show, hide, buildSettings, isTouchDevice } from '../../engine/kit.js';
import { DIFF, PRIMARY, SECONDARY, PLAYER_SHIPS, UPGRADES, UPGRADE_COST, MAX_UPG, playerStats, writeSave, defaultSave } from './data.js';
import { MISSIONS } from './missions.js';
import { portraitURL } from './portraits.js';

const $ = id => document.getElementById(id);
const SCREENS = ['menu', 'campaign', 'briefing', 'survival', 'hangar', 'debrief', 'pause', 'settingsScr', 'help', 'records', 'loading', 'online'];
const kr = n => Number(Math.floor(n)).toLocaleString('sv-SE') + ' kr';
const pts = n => Number(Math.floor(n)).toLocaleString('sv-SE');
const GRADE_ORDER = ['S', 'A', 'B', 'C', 'D'];

export class UI {
  constructor(game) {
    this.g = game;
    this.stack = [];
    this.cur = null;
    this.brIdx = 0;
    this.hgTab = 'ships';
    document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { this.g.sfx.play('click'); this.back(); }));
    const click = (id, fn) => $(id).addEventListener('click', () => { this.g.audio.play('select'); fn(); });
    click('btnCampaign', () => {
      // gå direkt till nästa uppdrags genomgång (kampanjkartan ligger bakom "Tillbaka")
      const s = this.save;
      if (s.campaignDone) { this.openCampaign(); return; }
      this.buildCampaign(); this.show('campaign');
      this.openBriefing(Math.min(MISSIONS.length - 1, s.unlocked));
    });
    click('btnSurvival', () => this.openSurvival());
    click('btnOnline', () => this.g.online.openLobby());
    click('btnHangar', () => this.openHangar());
    click('btnSettings', () => this.openSettings());
    click('btnHelp', () => this.show('help'));
    click('btnRecords', () => this.openRecords());
    click('campHangar', () => this.openHangar());
    click('brHangar', () => this.openHangar());
    click('svHangar', () => this.openHangar());
    click('brStart', () => this.g.startCampaignMission(this.brIdx));
    click('svStart', () => this.g.startSurvival());
    click('pResume', () => this.g.resume());
    click('pRestart', () => this.g.restartMission());
    click('pSettings', () => this.openSettings());
    click('pHelp', () => this.show('help'));
    click('pQuit', () => this.g.quitToMenu());
    click('recReset', () => this.resetProgress());
    $('hgTabs').addEventListener('click', e => { const t = e.target.closest('button'); if (!t) return; this.hgTab = t.dataset.tab; this.g.sfx.play('click'); this.buildHangar(); });
    $('helpTabs').addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      document.querySelectorAll('#helpTabs button').forEach(b => b.classList.toggle('on', b === t));
      document.querySelectorAll('[data-hp]').forEach(d => d.classList.toggle('hidden', d.dataset.hp !== t.dataset.h));
    });
    if (isTouchDevice()) { const tb = document.querySelector('#helpTabs [data-h="touch"]'); if (tb) tb.click(); }
    this.padCd = 0;
  }
  get save() { return this.g.save; }

  /* ---------------------------------------------------------------- skärmbyten */
  show(id, push = true) {
    if (this.cur && push && this.cur !== id) this.stack.push(this.cur);
    for (const s of SCREENS) if (s !== id) hide(s);
    show(id);
    const prev = this.cur;
    this.cur = id;
    if (id === 'hangar') this.g.showcase(true); else if (prev === 'hangar') this.g.showcase(false);
    if (id === 'menu') { this.stack.length = 0; this.refreshMenu(); }
  }
  back() {
    const prev = this.stack.pop();
    if (!prev) { this.show('menu', false); return; }
    if (prev === 'briefing') this.openBriefing(this.brIdx, false);
    else if (prev === 'survival') { this.buildSurvival(); this.show('survival', false); }
    else if (prev === 'campaign') { this.buildCampaign(); this.show('campaign', false); }
    else this.show(prev, false);
  }
  hideAll() { for (const s of SCREENS) hide(s); if (this.cur === 'hangar') this.g.showcase(false); this.cur = null; this.stack.length = 0; }

  /* ---------------------------------------------------------------- huvudmeny */
  refreshMenu() {
    const s = this.save;
    const done = Object.values(s.missions).filter(x => x.done).length;
    $('btnCampaign').textContent = done === 0 ? 'Starta kampanjen' : (s.campaignDone ? 'Kampanjen (avklarad)' : `Fortsätt kampanjen (${Math.min(12, s.unlocked + 1)}/12)`);
    $('menuCredits').innerHTML = `Krediter: <b>${kr(s.credits)}</b> · Kampanjpoäng: <b>${pts(this.g.campaignTotal())}</b>`;
  }
  openSettings() {
    buildSettings($('setBox'), this.g.settings, [
      { key: 'adMode', label: 'A/D-tangenterna', type: 'select', options: [['roll', 'Rollar (Q/E girar)'], ['yaw', 'Girar (Q/E rollar)']] },
      { key: 'stickReturn', label: 'Musspakens återfjädring', type: 'range', min: 0, max: 4, step: 0.1, format: v => +v === 0 ? 'Av' : (+v).toFixed(1).replace('.', ',') },
      { key: 'aimAssist', label: 'Siktstöd', type: 'range', min: 0, max: 1.5, step: 0.25, format: v => Math.round(v * 100) + ' %' },
      { key: 'shake', label: 'Skärmskakning', type: 'range', min: 0, max: 1.5, step: 0.1, format: v => Math.round(v * 100) + ' %' },
      { key: 'hudScale', label: 'HUD-storlek', type: 'range', min: 0.7, max: 1.4, step: 0.05, format: v => Math.round(v * 100) + ' %' }
    ]);
    this.show('settingsScr');
  }

  /* ---------------------------------------------------------------- kampanj */
  openCampaign() { this.buildCampaign(); this.show('campaign'); }
  buildCampaign() {
    const s = this.save, list = $('missionList');
    list.innerHTML = '';
    $('campSub').textContent = s.campaignDone ? 'Kampanjen är avklarad – spela om uppdragen för bättre betyg och fler krediter.' : 'Välj ett uppdrag. Nya uppdrag låses upp när du klarar det föregående.';
    MISSIONS.forEach((m, i) => {
      const rec = s.missions[m.id];
      const b = document.createElement('button');
      b.className = 'rj-mcard';
      b.disabled = i > s.unlocked;
      b.innerHTML = `<span class="n">${i + 1}</span><span class="t"></span><span class="gr">${rec && rec.grade ? rec.grade : ''}</span><span class="p"></span><span class="sc">${rec && rec.best ? 'Bästa: ' + pts(rec.best) : (i > s.unlocked ? 'Låst' : 'Ej spelat')}</span>`;
      b.querySelector('.t').textContent = m.title; b.querySelector('.p').textContent = m.place;
      b.addEventListener('click', () => { this.g.audio.play('select'); this.openBriefing(i); });
      list.appendChild(b);
    });
  }
  openBriefing(i, push = true) {
    this.brIdx = i;
    const m = MISSIONS[i], s = this.save;
    $('brNum').textContent = `Uppdrag ${i + 1} av ${MISSIONS.length}`;
    $('brTitle').textContent = m.title; $('brPlace').textContent = m.place;
    $('brPic').src = portraitURL('lind', 96);
    $('brText').innerHTML = '';
    m.brief.forEach(p => { const el = document.createElement('p'); el.textContent = p; $('brText').appendChild(el); });
    const ul = $('brObj'); ul.innerHTML = '';
    m.preview.forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
    if (m.wing) { const li = document.createElement('li'); li.textContent = 'Vingmän: ' + m.wing.map(w => w === 'varg' ? 'Varg' : 'Gnista').join(' och '); li.style.color = 'var(--muted)'; ul.appendChild(li); }
    $('brShip').innerHTML = this.shipSummary();
    this.diffTabs('brDiff');
    this.show('briefing', push);
  }
  diffTabs(id) {
    const box = $(id); box.innerHTML = '';
    for (const d of Object.values(DIFF)) {
      const b = document.createElement('button'); b.textContent = d.label; b.className = this.save.diff === d.id ? 'on' : '';
      b.addEventListener('click', () => { this.save.diff = d.id; writeSave(this.save); this.g.sfx.play('click'); this.diffTabs(id); });
      box.appendChild(b);
    }
  }
  shipSummary() {
    const s = this.save, st = playerStats(s), u = s.upgrades[s.ship];
    const up = UPGRADES.map(x => `${x.name} ${u[x.id] || 0}/${MAX_UPG}`).join(' · ');
    return `<div class="rj-shipsum"><b>${st.name}</b> – ${st.role}<br>Laser: ${st.primary.name}<br>${st.secondary.name}: ${st.ammo} st · Motåtgärder: ${st.flares}<br><small>${up}</small></div>`;
  }

  /* ---------------------------------------------------------------- överlevnad */
  openSurvival() { this.buildSurvival(); this.show('survival'); }
  buildSurvival() {
    $('svShip').innerHTML = this.shipSummary();
    this.diffTabs('svDiff');
    const ol = $('svTop'); ol.innerHTML = '';
    const top = this.save.survival.slice(0, 5);
    if (!top.length) ol.innerHTML = '<li style="list-style:none;color:var(--muted)">Inga omgångar ännu.</li>';
    top.forEach(e => { const li = document.createElement('li'); li.innerHTML = `<b>${pts(e.score)}</b> – våg ${e.wave}, ${PLAYER_SHIPS[e.ship] ? PLAYER_SHIPS[e.ship].name : ''}, ${DIFF[e.diff] ? DIFF[e.diff].label.toLowerCase() : ''}`; ol.appendChild(li); });
  }

  /* ---------------------------------------------------------------- hangar */
  openHangar() { this.buildHangar(); this.show('hangar'); }
  buildHangar() {
    const s = this.save, body = $('hgBody');
    $('hgCredits').textContent = kr(s.credits);
    document.querySelectorAll('#hgTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === this.hgTab));
    body.innerHTML = '';
    const card = (sel) => { const d = document.createElement('div'); d.className = 'rj-card' + (sel ? ' sel' : ''); body.appendChild(d); return d; };
    const btn = (parent, text, fn, primary = false, disabled = false) => { const b = document.createElement('button'); b.className = 'btn small' + (primary ? ' primary' : ''); b.textContent = text; b.disabled = disabled; b.addEventListener('click', fn); parent.appendChild(b); return b; };
    if (this.hgTab === 'ships') {
      for (const sh of Object.values(PLAYER_SHIPS)) {
        const owned = !!s.ships[sh.id], sel = s.ship === sh.id, locked = s.unlocked < sh.unlock;
        const d = card(sel);
        const mx = { speed: 140, turn: 2.35, shield: 150, hull: 165, dmg: 1.3 };
        d.innerHTML = `<h4>${sh.name} <small>${sh.role}</small></h4><p>${sh.desc}</p>
          <div class="rj-statbars"><span>Fart</span><i style="width:${sh.speed / mx.speed * 100}%"></i><span>Smidighet</span><i style="width:${sh.turn.pitch / mx.turn * 100}%"></i>
          <span>Sköld</span><i style="width:${sh.shield / mx.shield * 100}%"></i><span>Skrov</span><i style="width:${sh.hull / mx.hull * 100}%"></i><span>Eldkraft</span><i style="width:${sh.dmgMult / mx.dmg * 100}%"></i></div>`;
        const row = document.createElement('div'); row.className = 'row'; d.appendChild(row);
        if (owned) btn(row, sel ? 'Valt skepp' : 'Välj', () => { s.ship = sh.id; writeSave(s); this.g.sfx.play('select'); this.buildHangar(); this.g.showcase(true); }, !sel, sel);
        else if (locked) { const sp = document.createElement('span'); sp.className = 'rj-lock'; sp.textContent = `Låses upp efter uppdrag ${sh.unlock}`; row.appendChild(sp); }
        else btn(row, `Köp – ${kr(sh.price)}`, () => this.buy(sh.price, () => { s.ships[sh.id] = true; s.ship = sh.id; }), true, s.credits < sh.price);
        d.addEventListener('mouseenter', () => this.g.showcase(true, sh.id));
        d.addEventListener('mouseleave', () => this.g.showcase(true));
      }
    } else if (this.hgTab === 'upg') {
      const sh = PLAYER_SHIPS[s.ship], u = s.upgrades[sh.id];
      const info = document.createElement('p'); info.className = 'g3-sub'; info.style.margin = '0 0 10px'; info.textContent = `Uppgraderingar gäller för ${sh.name}. Varje skepp uppgraderas för sig.`; body.appendChild(info);
      for (const up of UPGRADES) {
        const lvl = u[up.id] || 0;
        const d = card(false);
        d.innerHTML = `<h4>${up.name} <span class="rj-pips">${[0, 1, 2, 3].map(k => `<i class="${k < lvl ? 'on' : ''}"></i>`).join('')}</span></h4><p>${up.desc}</p>`;
        const row = document.createElement('div'); row.className = 'row'; d.appendChild(row);
        if (lvl >= MAX_UPG) { const sp = document.createElement('span'); sp.className = 'rj-lock'; sp.textContent = 'Fullt uppgraderad'; row.appendChild(sp); }
        else { const cost = UPGRADE_COST[lvl]; btn(row, `Uppgradera till nivå ${lvl + 1} – ${kr(cost)}`, () => this.buy(cost, () => { u[up.id] = lvl + 1; }), true, s.credits < cost); }
      }
    } else {
      const h = (t) => { const e = document.createElement('h3'); e.textContent = t; e.style.margin = '6px 0'; e.style.color = 'var(--accent-2)'; body.appendChild(e); };
      h('Laser');
      for (const w of Object.values(PRIMARY)) this.weaponCard(card(s.primary === w.id), w, 'primary', btn);
      h('Sekundärvapen');
      for (const w of Object.values(SECONDARY)) this.weaponCard(card(s.secondary === w.id), w, 'secondary', btn);
    }
  }
  weaponCard(d, w, slot, btn) {
    const s = this.save, owned = !!s.owned[w.id], sel = s[slot] === w.id, locked = s.unlocked < w.unlock;
    const extra = slot === 'primary' ? `Skada ${w.dmg}${w.mode === 'spread' ? ' × 3' : ''} · ${Math.round(1 / w.cd)} skott/s${w.shieldMult > 1 ? ' · ×' + w.shieldMult + ' mot sköld' : ''}` : `Skada ${w.dmg}${w.salvo ? ' × ' + w.salvo : ''} · ${w.ammo} st${w.lockTime ? ' · låsning ' + String(w.lockTime).replace('.', ',') + ' s' : ' · ingen låsning'}`;
    d.innerHTML = `<h4>${w.name} <small>${extra}</small></h4><p>${w.desc}</p>`;
    const row = document.createElement('div'); row.className = 'row'; d.appendChild(row);
    if (owned) btn(row, sel ? 'Monterad' : 'Montera', () => { s[slot] = w.id; writeSave(s); this.g.sfx.play('select'); this.buildHangar(); }, !sel, sel);
    else if (locked) { const sp = document.createElement('span'); sp.className = 'rj-lock'; sp.textContent = `Låses upp efter uppdrag ${w.unlock}`; row.appendChild(sp); }
    else btn(row, `Köp – ${kr(w.price)}`, () => this.buy(w.price, () => { s.owned[w.id] = true; s[slot] = w.id; }), true, s.credits < w.price);
  }
  buy(cost, fn) {
    const s = this.save;
    if (s.credits < cost) { this.g.sfx.play('error'); return; }
    s.credits -= cost; fn(); writeSave(s);
    this.g.sfx.play('coin');
    this.buildHangar(); this.g.showcase(true);
  }

  /* ---------------------------------------------------------------- rekord */
  openRecords() { this.buildRecords(); this.show('records'); }
  buildRecords() {
    const s = this.save;
    $('recCamp').textContent = pts(this.g.campaignTotal()) + ' poäng';
    const t = $('recMissions'); t.innerHTML = '';
    MISSIONS.forEach((m, i) => { const r = s.missions[m.id]; const tr = document.createElement('tr'); tr.innerHTML = `<td>${i + 1}. ${m.title}</td><td>${r && r.best ? pts(r.best) + ' (' + r.grade + ')' : '–'}</td>`; t.appendChild(tr); });
    const ol = $('recSurv'); ol.innerHTML = '';
    if (!s.survival.length) ol.innerHTML = '<li style="list-style:none;color:var(--muted)">Inga omgångar ännu.</li>';
    s.survival.slice(0, 10).forEach(e => { const li = document.createElement('li'); li.innerHTML = `<b>${pts(e.score)}</b> – våg ${e.wave} (${new Date(e.date).toLocaleDateString('sv-SE')})`; ol.appendChild(li); });
  }
  resetProgress() {
    const b = $('recReset');
    if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Säker? Klicka igen för att nollställa'; setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'Nollställ framsteg'; }, 4000); return; }
    b.dataset.confirm = ''; b.textContent = 'Nollställ framsteg';
    const keepDiff = this.save.diff;
    this.g.save = Object.assign(defaultSave(), { diff: keepDiff });
    writeSave(this.g.save);
    this.g.sfx.play('error');
    this.buildRecords();
  }

  /* ---------------------------------------------------------------- debriefing */
  showDebrief(o) {
    const r = o.r;
    const camp = o.mode === 'campaign';
    $('dbTitle').textContent = o.mode === 'survival' ? 'Omgången är slut' : (r.win ? 'Uppdraget lyckades' : 'Uppdraget misslyckades');
    $('dbSub').textContent = o.mode === 'survival' ? `Du klarade dig till våg ${o.wave}.` : (o.title + (r.win ? '' : ' – ' + (o.reason || '')));
    const gEl = $('dbGrade');
    if (o.mode === 'survival') { gEl.textContent = o.wave; gEl.className = 'rj-grade'; gEl.title = 'Våg'; }
    else { gEl.textContent = r.win ? r.grade : '✗'; gEl.className = 'rj-grade' + (r.win ? '' : ' fail'); gEl.title = 'Betyg'; }
    const rows = [];
    const mmss = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
    rows.push(['Tid', mmss(r.time)]);
    rows.push(['Nedskjutna fiender', r.kills]);
    rows.push(['Träffprocent', Math.round(r.acc * 100) + ' %']);
    rows.push(['Poäng för strid', pts(r.killPoints)]);
    if (camp && r.win) {
      rows.push(['Uppdragsmål', pts(r.objPts)]);
      rows.push(['Tidsbonus', pts(r.timeBonus)]);
      rows.push(['Träffbonus', pts(r.accBonus)]);
      rows.push(['Skrovbonus', pts(r.hullBonus)]);
    }
    rows.push([`Svårighet (${DIFF[o.diff].label})`, '× ' + String(r.mult).replace('.', ',')]);
    const t = $('dbStats'); t.innerHTML = '';
    for (const [a, b] of rows) { const tr = document.createElement('tr'); tr.innerHTML = `<td>${a}</td><td>${b}</td>`; t.appendChild(tr); }
    const tr = document.createElement('tr'); tr.className = 'tot'; tr.innerHTML = `<td>Totalt</td><td>${pts(r.total)}</td>`; t.appendChild(tr);
    $('dbCred').textContent = o.credits > 0 ? `+${kr(o.credits)} till hangaren` + (o.firstClear ? ' (inklusive första genomförandet)' : '') : '';
    $('dbRecord').textContent = o.campaignDone ? '★ Kampanjen avklarad! Nordstjärnan lyser igen. ★' : (o.newBest ? (camp ? 'Nytt personbästa på uppdraget!' : 'Nytt rekord i överlevnad!') : '');
    const bx = $('dbBtns'); bx.innerHTML = '';
    const B = (txt, fn, primary) => { const b = document.createElement('button'); b.className = 'btn' + (primary ? ' primary' : ''); b.textContent = txt; b.addEventListener('click', () => { this.g.audio.play('select'); fn(); }); bx.appendChild(b); };
    if (camp) {
      const next = o.idx + 1;
      if (r.win && next < MISSIONS.length) B('Nästa uppdrag', () => { this.g.toMenuWorld(); this.openBriefing(next, false); this.stack = ['menu', 'campaign']; }, true);
      if (!r.win && o.cp) B('Fortsätt från kontrollpunkten', () => this.g.startCampaignMission(o.idx, o.cp), true);
      B('Försök igen', () => this.g.startCampaignMission(o.idx), !r.win && !o.cp);
      B('Hangar', () => { this.g.toMenuWorld(); this.stack = ['menu', 'campaign']; this.buildCampaign(); this.cur = 'campaign'; this.openHangar(); });
      B('Kampanjkartan', () => { this.g.toMenuWorld(); this.stack = ['menu']; this.cur = 'menu'; this.openCampaign(); });
    } else {
      B('Spela igen', () => this.g.startSurvival(), true);
      B('Hangar', () => { this.g.toMenuWorld(); this.stack = ['menu']; this.cur = 'menu'; this.openHangar(); });
    }
    B('Huvudmeny', () => { this.g.toMenuWorld(); this.show('menu', false); });
    this.show('debrief', false);
  }

  /* ---------------------------------------------------------------- handkontroll i menyer */
  padNav(input, dt) {
    if (!this.cur || input.gamepad == null) return;
    this.padCd -= dt;
    const scr = $(this.cur);
    const els = [...scr.querySelectorAll('button:not(:disabled), a.g3-back, select, input')].filter(e => e.offsetParent !== null);
    if (!els.length) return;
    let i = els.indexOf(document.activeElement);
    const ay = input.gpAxis(1);
    let mv = 0;
    if (input.pressed('Pad13') || (ay > 0.6 && this.padCd <= 0)) mv = 1;
    if (input.pressed('Pad12') || (ay < -0.6 && this.padCd <= 0)) mv = -1;
    if (mv) { this.padCd = 0.22; i = (i + mv + els.length) % els.length; els[i].focus(); }
    const el = document.activeElement;
    if (el && el.type === 'range' && (input.pressed('Pad14') || input.pressed('Pad15'))) {
      const st = +el.step || 0.1; el.value = +el.value + (input.pressed('Pad15') ? st : -st); el.dispatchEvent(new Event('input'));
    }
    if (input.pressed('Pad0') && el && els.includes(el)) { if (el.tagName === 'INPUT' && el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('change')); } else el.click(); }
    if (input.pressed('Pad1')) { if (this.cur === 'pause') this.g.resume(); else if (this.cur !== 'menu' && this.cur !== 'debrief') this.back(); }
  }
}
export { GRADE_ORDER };
