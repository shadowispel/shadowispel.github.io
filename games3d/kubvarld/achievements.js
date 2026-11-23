/**
 * Prestationer. Lätt att bygga ut: lägg till ett objekt i ACHIEVEMENTS (eller anropa registerAchievement) med
 *   id, name, desc, icon (föremåls-id eller emoji), cat (kategori-id), goal (antal), och antingen
 *   prog: g => tal   (framsteg räknat från spelets räknare/tillstånd)  eller
 *   on: 'händelse'   (räknas upp med game.achievements.event('händelse', n)).
 *   hidden: true döljer namn och beskrivning tills den låses upp.
 * Upplåsta sparas per värld i flags.ach = { id: tidpunkt }.
 */
import { B, I, TOOL0, ARMOR0, GOLD_TOOL0, HOES, armorOf } from './blocks.js';

const LOGS = [B.spruce_log, B.birch_log, B.pine_log, B.oak_log];
const PLANKS = [B.spruce_planks, B.birch_planks, B.pine_planks, B.oak_planks];
const range = (a, n) => Array.from({ length: n }, (_, i) => a + i);
const ALL_ARMOR = range(ARMOR0, 16);

export const ACH_CATS = [
  { id: 'start', name: 'Första stegen' },
  { id: 'craft', name: 'Hantverk' },
  { id: 'explore', name: 'Utforskning' },
  { id: 'fight', name: 'Strid' },
  { id: 'farm', name: 'Gård och natur' },
  { id: 'circuit', name: 'Gnistkretsar' },
  { id: 'secret', name: 'Hemligheter' }
];

export const ACHIEVEMENTS = [
  // första stegen
  { id: 'first_tree', cat: 'start', name: 'Första trädet', desc: 'Hugg loss en trädstam.', icon: B.oak_log, goal: 1, prog: g => g.tl('p', LOGS) },
  { id: 'planks', cat: 'start', name: 'Snickarglädje', desc: 'Gör plankor av en stam.', icon: B.oak_planks, goal: 1, prog: g => g.tl('c', PLANKS) },
  { id: 'bench', cat: 'start', name: 'Verkstaden', desc: 'Ställ ut en arbetsbänk.', icon: B.workbench, goal: 1, prog: g => g.tl('pl', [B.workbench]) },
  { id: 'stone_age', cat: 'start', name: 'Stenåldern', desc: 'Tillverka en stenhacka.', icon: TOOL0 + 4, goal: 1, prog: g => g.tl('c', [TOOL0 + 4]) },
  { id: 'night1', cat: 'start', name: 'Överlevde första natten', desc: 'Klara dig genom en hel natt.', icon: '🌙', goal: 1, prog: g => g.tl('x', ['night']) },
  { id: 'furnace', cat: 'start', name: 'Värme i stugan', desc: 'Mura en ugn.', icon: B.furnace, goal: 1, prog: g => g.tl('pl', [B.furnace]) },
  { id: 'cook', cat: 'start', name: 'Husmanskost', desc: 'Ät något som du har lagat i ugnen.', icon: I.meat_cooked, goal: 1, prog: g => g.tl('e', [I.meat_cooked, I.pork_cooked, I.chicken_cooked, I.egg_fried, I.chanterelle_fried, I.fish_cooked, I.potato_baked]) },
  { id: 'sleep', cat: 'start', name: 'God natt', desc: 'Sov en natt i en säng.', icon: I.bed, goal: 1, prog: g => g.tl('sleep', [1]) },
  // hantverk
  { id: 'iron_age', cat: 'craft', name: 'Järnålder', desc: 'Smält en järntacka i ugnen.', icon: I.iron_ingot, goal: 1, prog: g => g.tl('s', [I.iron_ingot]) },
  { id: 'armor', cat: 'craft', name: 'Rustad', desc: 'Ta på dig en rustningsdel.', icon: ARMOR0 + 5, goal: 1, prog: g => g.tl('eq', ALL_ARMOR) },
  { id: 'full_armor', cat: 'craft', name: 'Plåtslagen', desc: 'Bär rustning på huvud, kropp, ben och fötter samtidigt.', icon: ARMOR0 + 13, goal: 4, prog: g => g.inv.armor.filter(s => s && armorOf(s.id)).length },
  { id: 'shield', cat: 'craft', name: 'Sköldvakt', desc: 'Parera en attack eller en pil med en sköld.', icon: I.shield, goal: 1, prog: g => g.tl('block', [1]) },
  { id: 'diamond_tool', cat: 'craft', name: 'Skarpast i skogen', desc: 'Tillverka ett diamantverktyg.', icon: TOOL0 + 15, goal: 1, prog: g => g.tl('c', [TOOL0 + 12, TOOL0 + 13, TOOL0 + 14, TOOL0 + 15, HOES[4]]) },
  { id: 'gold_tool', cat: 'craft', name: 'Glitter och glans', desc: 'Tillverka ett verktyg av guld.', icon: GOLD_TOOL0, goal: 1, prog: g => g.tl('c', [GOLD_TOOL0, GOLD_TOOL0 + 1, GOLD_TOOL0 + 2, GOLD_TOOL0 + 3, HOES[3]]) },
  { id: 'smith', cat: 'craft', name: 'Smeden', desc: 'Laga ett slitet verktyg på ett städ.', icon: B.anvil, goal: 1, prog: g => g.tl('fix', [1]) },
  { id: 'builder', cat: 'craft', name: 'Bygget', desc: 'Placera 500 block i samma värld.', icon: B.stone_bricks, goal: 500, prog: g => g.stats.placed },
  { id: 'fence', cat: 'craft', name: 'Inhägnad', desc: 'Ställ ut 16 staket och en grind.', icon: B.fence, goal: 17, prog: g => Math.min(16, g.tl('pl', [B.fence])) + Math.min(1, g.tl('pl', [B.gate_0])) },
  { id: 'lantern', cat: 'craft', name: 'Lyktbärare', desc: 'Tillverka en lykta.', icon: B.lantern, goal: 1, prog: g => g.tl('c', [B.lantern]) },
  // utforskning
  { id: 'deep', cat: 'explore', name: 'Djupt ner', desc: 'Ta dig ned under nivå 16.', icon: '⛏️', goal: 1, prog: g => g.tl('depth', [1]) },
  { id: 'peak', cat: 'explore', name: 'Toppen av fjället', desc: 'Stå på nivå 100 eller högre.', icon: '🏔️', goal: 1, prog: g => g.tl('peak', [1]) },
  { id: 'walker', cat: 'explore', name: 'Långfärd', desc: 'Vandra 2 000 meter.', icon: '🥾', goal: 2000, prog: g => Math.floor(g.tl('walk', [1])) },
  { id: 'diamonds', cat: 'explore', name: 'Diamanter!', desc: 'Hitta en diamant.', icon: I.diamond, goal: 1, prog: g => g.tl('p', [I.diamond]) },
  { id: 'gold', cat: 'explore', name: 'Guldfeber', desc: 'Bryt guldmalm.', icon: B.gold_ore, goal: 1, prog: g => g.tl('p', [B.gold_ore]) },
  { id: 'emerald', cat: 'explore', name: 'Smaragdfynd', desc: 'Hitta en smaragd – den sällsynta valutan.', icon: I.emerald, goal: 1, prog: g => g.tl('p', [I.emerald]) },
  { id: 'rich', cat: 'explore', name: 'Smaragdskatt', desc: 'Pressa ihop nio smaragder till ett smaragdblock.', icon: B.emerald_block, goal: 1, prog: g => g.tl('c', [B.emerald_block]) },
  { id: 'survivor', cat: 'explore', name: 'Överlevare', desc: 'Överlev sju nätter i samma värld.', icon: '🔥', goal: 7, prog: g => g.tl('x', ['night']) },
  // strid
  { id: 'zombie', cat: 'fight', name: 'Zombiejägare', desc: 'Besegra tio zombier.', icon: I.rotten_flesh, goal: 10, prog: g => g.tl('k', ['zombie']) },
  { id: 'skeleton', cat: 'fight', name: 'Benknäckare', desc: 'Besegra ett skelett.', icon: I.bone, goal: 1, prog: g => g.tl('k', ['skeleton']) },
  { id: 'spider', cat: 'fight', name: 'Spindelskräck', desc: 'Besegra en spindel.', icon: I.string, goal: 1, prog: g => g.tl('k', ['spider']) },
  { id: 'archer', cat: 'fight', name: 'Bågskytt', desc: 'Skjut en pil med en båge.', icon: I.bow, goal: 1, prog: g => g.tl('sh', ['bow']) },
  { id: 'kaboom', cat: 'fight', name: 'Kaboom', desc: 'Tänd en TNT-laddning.', icon: B.tnt, goal: 1, prog: g => g.tl('tnt', [1]) },
  // gård och natur
  { id: 'farmer', cat: 'farm', name: 'Bonde', desc: 'Skörda tio vete.', icon: I.wheat, goal: 10, prog: g => g.tl('p', [I.wheat]) },
  { id: 'fruit', cat: 'farm', name: 'Pumpodlare', desc: 'Odla fram en pumpa eller melon från frön.', icon: B.pumpkin, goal: 1, prog: g => g.tl('fruit', [1]) },
  { id: 'berries', cat: 'farm', name: 'Bärplockare', desc: 'Plocka 12 lingon eller hjortron.', icon: I.lingon, goal: 12, prog: g => g.tl('p', [I.lingon, I.cloudberry]) },
  { id: 'fishing', cat: 'farm', name: 'Fiskelycka', desc: 'Fånga en fisk med fiskespö.', icon: I.fish, goal: 1, prog: g => g.tl('p', [I.fish]) },
  { id: 'milk', cat: 'farm', name: 'Mjölkbonde', desc: 'Mjölka en ko.', icon: I.bucket_milk, goal: 1, prog: g => g.tl('milk', [1]) },
  { id: 'bonemeal', cat: 'farm', name: 'Gröna fingrar', desc: 'Få en planta att växa med benmjöl.', icon: I.bone_meal, goal: 1, prog: g => g.tl('bm', [1]) },
  { id: 'shear', cat: 'farm', name: 'Fårklippare', desc: 'Klipp ett får med sax.', icon: I.shears, goal: 1, prog: g => g.tl('shear', [1]) },
  // gnistkretsar
  { id: 'spark', cat: 'circuit', name: 'Gnistfynd', desc: 'Bryt gnistmalm djupt nere i berget.', icon: I.spark_dust, goal: 1, prog: g => g.tl('p', [I.spark_dust]) },
  { id: 'circuit', cat: 'circuit', name: 'Första kretsen', desc: 'Tänd en gnistlampa med ström.', icon: B.lamp_on, goal: 1, prog: g => g.tl('lamp', [1]) },
  { id: 'autodoor', cat: 'circuit', name: 'Automatisk dörr', desc: 'Öppna en dörr med ström – en tryckplatta eller knapp.', icon: I.door, goal: 1, prog: g => g.tl('autodoor', [1]) },
  { id: 'piston', cat: 'circuit', name: 'Kolvkraft', desc: 'Låt en kolv skjuta ut.', icon: B.piston_0, goal: 1, prog: g => g.tl('piston', [1]) },
  // hemliga
  { id: 'rotten', cat: 'secret', hidden: true, name: 'Usch!', desc: 'Ät ruttet kött.', icon: I.rotten_flesh, goal: 1, prog: g => g.tl('e', [I.rotten_flesh]) },
  { id: 'lava', cat: 'secret', hidden: true, name: 'Het om fötterna', desc: 'Bränn dig på lava – och överlev.', icon: B.lava, goal: 1, prog: g => g.tl('lavahurt', [1]) },
  { id: 'fall', cat: 'secret', hidden: true, name: 'Hård landning', desc: 'Överlev ett fall på minst 15 block.', icon: '🪂', goal: 1, prog: g => g.tl('bigfall', [1]) },
  { id: 'obsidian', cat: 'secret', hidden: true, name: 'Hårdare än berget', desc: 'Bryt loss obsidian.', icon: B.obsidian, goal: 1, prog: g => g.tl('p', [B.obsidian]) },
  { id: 'style', cat: 'secret', hidden: true, name: 'Egen stil', desc: 'Spela med en figur som du har ritat själv i Min figur.', icon: '🎨', goal: 1, prog: g => g.customSkin ? 1 : 0 }
];
const BY_ID = new Map(ACHIEVEMENTS.map(a => [a.id, a]));
export function registerAchievement(def) { if (BY_ID.has(def.id)) return; ACHIEVEMENTS.push(def); BY_ID.set(def.id, def); if (def.cat && !ACH_CATS.some(c => c.id === def.cat)) ACH_CATS.push({ id: def.cat, name: def.cat }); }

/** Gamla äventyrsdagbokens mål → motsvarande prestation */
const FROM_JOURNAL = { wood: 'first_tree', planks: 'planks', bench: 'bench', pick: null, stone: null, tools: 'stone_age', night: 'night1', furnace: 'furnace', cook: 'cook', iron: 'iron_age', gold: 'gold', diamond: 'diamonds', crystal: 'diamonds', dtool: 'diamond_tool', ctool: 'diamond_tool', berries: 'berries', zombie: null, skeleton: 'skeleton', spider: 'spider', bow: 'archer', bonemeal: 'bonemeal', lantern: 'lantern', days: 'survivor', sow: null, bucket: null, armor: 'armor', fish: 'fishing', tnt: 'kaboom', anvil: 'smith' };

export class Achievements {
  constructor(game) {
    this.g = game;
    const f = game.flags;
    this.done = Object.assign({}, f.ach || {});
    // äldre världar: konvertera klara dagboksmål och släng resten av dagboken
    if (Array.isArray(f.journal)) { for (const j of f.journal) { const a = FROM_JOURNAL[j]; if (a && BY_ID.has(a) && !this.done[a]) this.done[a] = Date.now(); } }
    delete f.journal; delete f.tutDone;
    f.ach = this.done;
    this._t = 0.5; this.queue = []; this._showing = false;
  }
  isDone(id) { return !!this.done[id]; }
  get count() { return Object.keys(this.done).filter(id => BY_ID.has(id)).length; }
  get total() { return ACHIEVEMENTS.length; }
  progress(a) {
    let v = 0;
    try { v = a.on ? this.g.tl('ev', [a.on]) : a.prog ? a.prog(this.g) : 0; } catch (e) { v = 0; }
    return Math.max(0, Math.min(a.goal || 1, Math.floor(v || 0)));
  }
  /** Händelse från spelet (för prestationer med on:) */
  event(name, n = 1) { this.g.tally('ev', name, n); this._t = 0; }
  update(dt) {
    if (this.g.creative) return;
    this._t -= dt; if (this._t > 0) return;
    this._t = 0.5;
    for (const a of ACHIEVEMENTS) if (!this.done[a.id] && this.progress(a) >= (a.goal || 1)) this.unlock(a);
  }
  unlock(a) {
    if (typeof a === 'string') a = BY_ID.get(a);
    if (!a || this.done[a.id]) return;
    this.done[a.id] = Date.now(); this.g.flags.ach = this.done;
    this.queue.push(a); this._next();
    this.g.log('Prestation upplåst: ' + a.name, 'good');
  }
  _next() {
    if (this._showing || !this.queue.length) return;
    const a = this.queue.shift(); this._showing = true;
    const host = document.getElementById('achToasts') || document.body;
    const t = document.createElement('div'); t.className = 'kv-achtoast' + (a.hidden ? ' secret' : '');
    const ic = document.createElement('div'); ic.className = 'ic'; achIcon(ic, a, this.g.icons);
    const tx = document.createElement('div'); tx.className = 'tx';
    const s = document.createElement('small'); s.textContent = a.hidden ? 'Hemlig prestation!' : 'Prestation upplåst!';
    const b = document.createElement('b'); b.textContent = a.name;
    tx.append(s, b); t.append(ic, tx); host.appendChild(t);
    this.g.audio.play('levelup', { vol: 0.45 });
    setTimeout(() => { t.classList.add('out'); setTimeout(() => { t.remove(); this._showing = false; this._next(); }, 450); }, 3600);
  }
}

export function achIcon(el, a, icons) {
  el.innerHTML = '';
  if (typeof a.icon === 'number' && icons[a.icon]) { const im = document.createElement('img'); im.src = icons[a.icon]; im.alt = ''; el.appendChild(im); }
  else el.textContent = a.icon || '★';
}

/** Ritar prestationsskärmen i en behållare. ach = Achievements (eller null om ingen värld är laddad) */
export function renderAchievements(box, ach, icons, creative) {
  box.innerHTML = '';
  const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };
  const head = el('div', 'kv-achhead', box);
  const n = ach ? ach.count : 0, tot = ACHIEVEMENTS.length;
  el('div', 'kv-achsum', head).innerHTML = `<b>${n}</b> av ${tot} upplåsta`;
  const bar = el('div', 'kv-achbar', head); el('i', '', bar).style.width = Math.round(n / tot * 100) + '%';
  if (creative) el('div', 'kv-hint', box).textContent = 'Prestationer låses inte upp i kreativt läge.';
  const tabs = el('div', 'kv-tabs kv-achtabs', box);
  const list = el('div', 'kv-achlist', box);
  let cur = 'all';
  const draw = () => {
    list.innerHTML = '';
    for (const c of ACH_CATS) {
      if (cur !== 'all' && cur !== c.id) continue;
      const items = ACHIEVEMENTS.filter(a => a.cat === c.id); if (!items.length) continue;
      const got = items.filter(a => ach && ach.isDone(a.id)).length;
      const h = el('div', 'kv-achcat', list); h.textContent = c.name; el('span', '', h).textContent = got + '/' + items.length;
      const grid = el('div', 'kv-achgrid', list);
      for (const a of items) {
        const done = !!(ach && ach.isDone(a.id)), secret = a.hidden && !done;
        const card = el('div', 'kv-ach' + (done ? ' done' : '') + (secret ? ' secret' : ''), grid);
        const ic = el('div', 'ic', card); if (secret) ic.textContent = '?'; else achIcon(ic, a, icons);
        const tx = el('div', 'tx', card);
        el('b', '', tx).textContent = secret ? 'Dold prestation' : a.name;
        el('small', '', tx).textContent = secret ? 'Fortsätt utforska för att hitta den.' : a.desc;
        if (!done && !secret && (a.goal || 1) > 1) {
          const p = ach ? ach.progress(a) : 0;
          const pb = el('div', 'pb', tx); el('i', '', pb).style.width = Math.round(p / a.goal * 100) + '%';
          el('em', '', tx).textContent = p + '/' + a.goal;
        }
        if (done) { const d = new Date(ach.done[a.id]); el('em', 'when', tx).textContent = '✓ ' + d.toLocaleDateString('sv-SE'); }
      }
    }
  };
  [['all', 'Alla'], ...ACH_CATS.map(c => [c.id, c.name])].forEach(([id, name]) => {
    const b = el('button', id === cur ? 'on' : '', tabs); b.textContent = name;
    b.onclick = () => { cur = id; tabs.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); draw(); };
  });
  draw();
}
