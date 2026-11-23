/**
 * Äventyrsdagboken: kapitel med mål som guidar spelaren från första vedträt till kristallverktyg.
 * Framsteg räknas med "tallies" i världens flaggor (plockat, tillverkat, placerat, ätit, besegrat, nätter).
 */
import { B, I, TOOL0 } from './blocks.js';

const LOGS = [B.spruce_log, B.birch_log, B.pine_log];
const PLANKS = [B.spruce_planks, B.birch_planks, B.pine_planks];

/* d = text för tangentbord/mus, dt = text för pekskärm (valfri) */
export const CHAPTERS = [
  {
    name: 'Första dagen', reward: [[B.torch, 8, 'facklor'], [I.meat_cooked, 3, 'stekt kött']], goals: [
      { id: 'move', t: 'Ta dig ut i världen', d: 'Titta runt med musen och gå med W A S D. Mellanslag hoppar.', dt: 'Dra på vänster sida för att gå och på höger sida för att titta.', n: 8, v: g => g.tutMoved },
      { id: 'wood', t: 'Hugg ved', d: 'Gå fram till en trädstam och håll in vänster musknapp tills den lossnar. Samla 4 stammar.', dt: 'Sikta på en trädstam och håll in Bryt tills den lossnar. Samla 4 stammar.', n: 4, v: g => g.tl('p', LOGS) },
      { id: 'planks', t: 'Gör plankor', d: 'Öppna väskan med E. Lägg en stam i tillverkningsrutan och ta plankorna – eller klicka på receptet i receptboken (R).', dt: 'Tryck på Väska. Lägg en stam i tillverkningsrutan och ta plankorna.', n: 8, v: g => g.tl('c', PLANKS) },
      { id: 'bench', t: 'Bygg en arbetsbänk', d: 'Fyra plankor (2×2) blir en arbetsbänk. Välj den i snabbfältet och ställ ut den med höger musknapp.', dt: 'Fyra plankor (2×2) blir en arbetsbänk. Välj den i snabbfältet och ställ ut den med Använd.', n: 1, v: g => g.tl('pl', [B.workbench]) },
      { id: 'pick', t: 'Tälj en trähacka', d: 'Högerklicka på arbetsbänken. Gör pinnar och sedan en hacka – receptboken visar hur.', dt: 'Tryck Använd på arbetsbänken. Gör pinnar och sedan en hacka – receptboken visar hur.', n: 1, v: g => g.tl('c', [TOOL0, TOOL0 + 4, TOOL0 + 8, TOOL0 + 12]) },
      { id: 'stone', t: 'Bryt sten', d: 'Grå granit finns i backar och under jorden. Hacka loss 10 kullersten.', n: 10, v: g => g.tl('p', [B.cobble]) },
      { id: 'tools', t: 'Stenverktyg', d: 'Gör en stenhacka och ett stensvärd vid arbetsbänken. De håller dubbelt så länge.', n: 2, v: g => (g.tl('c', [TOOL0 + 4]) > 0 ? 1 : 0) + (g.tl('c', [TOOL0 + 7]) > 0 ? 1 : 0) },
      { id: 'torch', t: 'Tänd facklor', d: 'Kol sitter som svarta klumpar i berget – eller bränn ved i en ugn. Kol över en pinne blir fyra facklor.', n: 4, v: g => g.tl('c', [B.torch]) },
      { id: 'night', t: 'Klara första natten', d: 'Bygg ett skydd med tak och ställ facklor runt det. Skuggvarelser föds i mörker och tål inte solen.', n: 1, v: g => g.tl('x', ['night']) }
    ]
  },
  {
    name: 'Ett hem i vildmarken', reward: [[I.coal, 12, 'kol'], [I.moose_cooked, 2, 'älgstekar']], goals: [
      { id: 'furnace', t: 'Mura en ugn', d: 'Åtta kullersten i en ring på arbetsbänken. Ugnen smälter malm och steker mat.', n: 1, v: g => g.tl('pl', [B.furnace]) },
      { id: 'cook', t: 'Laga mat', d: 'Jaga tovfår eller älg, eller plocka kantareller. Stek i ugnen och ät – lagad mat mättar mycket mer.', n: 1, v: g => g.tl('e', [I.meat_cooked, I.moose_cooked, I.chanterelle_fried]) },
      { id: 'chest', t: 'Ett eget förråd', d: 'Åtta plankor i en ring blir en kista att spara skatter i.', n: 1, v: g => g.tl('pl', [B.chest]) },
      { id: 'bed', t: 'Bädda en säng', d: 'Tre ull (eller skuggskinn) över tre plankor. Fyra ängsull från myren blir vit ull. I sängen kan du sova bort natten.', n: 1, v: g => g.tl('pl', [I.bed]) }
    ]
  },
  {
    name: 'Ned i djupet', reward: [[B.crystal_block, 4, 'kristallblock'], [B.lantern, 2, 'lyktor']], goals: [
      { id: 'iron', t: 'Smält järn', d: 'Järnmalm har rostbruna klumpar och bryts med stenhacka. Smält den till tackor i ugnen.', n: 3, v: g => Math.max(g.have(I.iron_ingot), g.tl('s', [I.iron_ingot])) },
      { id: 'ironpick', t: 'Smid en järnhacka', d: 'Tre järntackor över två pinnar. Bara järn biter på guld och kristall.', n: 1, v: g => g.tl('c', [TOOL0 + 8, TOOL0 + 12]) },
      { id: 'gold', t: 'Guld i djupet', d: 'Guld ligger långt ned, under nivå 30. Ta med facklor – grottorna är mörka.', n: 1, v: g => g.tl('p', [B.gold_ore]) },
      { id: 'crystal', t: 'Kristallglans', d: 'Glimmande kristallmalm finns allra djupast, nära berggrunden. Samla 3 kristaller.', n: 3, v: g => g.tl('p', [I.crystal]) },
      { id: 'ctool', t: 'Kristallverktyg', d: 'Det finaste som går att tillverka – nästan oförstörbart.', n: 1, v: g => g.tl('c', [TOOL0 + 12, TOOL0 + 13, TOOL0 + 14, TOOL0 + 15]) }
    ]
  },
  {
    name: 'Vildmarkens utmaningar', side: true, goals: [
      { id: 'berries', t: 'Bärplockare', d: 'Plocka 12 lingon eller hjortron. Lingonris växer i barrskog, hjortron på myren.', n: 12, v: g => g.tl('p', [I.lingon, I.cloudberry]) },
      { id: 'wolf', t: 'Skuggjägare', d: 'Besegra en skuggvarg. De jagar i flock om natten.', n: 1, v: g => g.tl('k', ['wolf']) },
      { id: 'ghost', t: 'Släck en lyktgast', d: 'Lyktgastar svävar och kastar irrbloss. Deras glimtstoft blir lyktor.', n: 1, v: g => g.tl('k', ['ghost']) },
      { id: 'lantern', t: 'Lyktbärare', d: 'Tillverka en lykta av järn och glimtstoft (eller en fackla).', n: 1, v: g => g.tl('c', [B.lantern]) },
      { id: 'giant', t: 'Fäll en mossbjässe', d: 'Mossbjässar slår hårt men är långsamma. Använd ett bra svärd.', n: 1, v: g => g.tl('k', ['giant']) },
      { id: 'days', t: 'Överlevare', d: 'Överlev fem nätter i samma värld.', n: 5, v: g => g.tl('x', ['night']) }
    ]
  }
];
export const GOALS = [];
CHAPTERS.forEach((c, ci) => c.goals.forEach(goal => { goal.ch = ci; GOALS.push(goal); }));
const TUT_IDS = ['move', 'wood', 'planks', 'bench', 'pick', 'stone', 'tools'];

export class Journal {
  constructor(game) {
    this.g = game;
    const f = game.flags;
    if (!f.journal && f.tutDone) f.journal = TUT_IDS.slice(); // äldre världar som klarat introduktionen
    this.done = new Set(f.journal || []);
    this._t = 0; this._key = '';
  }
  isDone(id) { return this.done.has(id); }
  progress(goal) { return Math.min(goal.n, Math.max(0, Math.floor(goal.v(this.g) || 0))); }
  /** Nuvarande huvudmål (eller sidomål när huvudspåret är klart) */
  current() {
    for (const goal of GOALS) if (!CHAPTERS[goal.ch].side && !this.done.has(goal.id)) return goal;
    for (const goal of GOALS) if (!this.done.has(goal.id)) return goal;
    return null;
  }
  get count() { return this.done.size; }
  update(dt, touch) {
    this._t -= dt;
    if (this._t > 0) return;
    this._t = 0.25;
    for (const goal of GOALS) {
      if (this.done.has(goal.id)) continue;
      if (this.progress(goal) >= goal.n) this._complete(goal);
    }
    const cur = this.current();
    const key = cur ? cur.id + ':' + this.progress(cur) : 'none';
    if (key !== this._key) {
      this._key = key;
      this.g.ui.setQuest(cur ? {
        chapter: CHAPTERS[cur.ch].name, title: cur.t, desc: (touch && cur.dt) || cur.d || '',
        cur: this.progress(cur), max: cur.n, done: this.done.size, total: GOALS.length, side: !!CHAPTERS[cur.ch].side
      } : null);
    }
  }
  _complete(goal) {
    this.done.add(goal.id);
    this.g.flags.journal = [...this.done];
    this.g.log('Dagboken: ' + goal.t + ' ✓', 'good');
    this.g.audio.play('coin', { vol: 0.45 });
    this.g.ui.flashQuest();
    // kapitel klart → belöning
    const ch = CHAPTERS[goal.ch];
    if (ch.reward && ch.goals.every(x => this.done.has(x.id))) {
      for (const [id, n] of ch.reward) { const left = this.g.inv.add(id, n); if (left > 0) this.g.throwItem({ id, n: left, d: 0 }); }
      this.g.log(`Kapitel klart: ${ch.name}! Belöning: ${ch.reward.map(r => r[1] + ' ' + r[2]).join(' och ')}.`, 'good');
      this.g.toast(`📖 Kapitel klart: ${ch.name}`);
      this.g.audio.play('levelup', { vol: 0.55 });
    }
  }
}
