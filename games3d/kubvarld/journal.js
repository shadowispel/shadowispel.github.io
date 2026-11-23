/**
 * Äventyrsdagboken: kapitel med mål som guidar spelaren från första vedträt till diamantverktyg.
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
      { id: 'night', t: 'Klara första natten', d: 'Bygg ett skydd med tak och ställ facklor runt det. Zombier, skelett och spindlar föds i mörker – zombier och skelett brinner i solen.', n: 1, v: g => g.tl('x', ['night']) }
    ]
  },
  {
    name: 'Ett hem i vildmarken', reward: [[I.coal, 12, 'kol'], [I.pork_cooked, 2, 'stekt fläsk']], goals: [
      { id: 'furnace', t: 'Mura en ugn', d: 'Åtta kullersten i en ring på arbetsbänken. Ugnen smälter malm och steker mat.', n: 1, v: g => g.tl('pl', [B.furnace]) },
      { id: 'cook', t: 'Laga mat', d: 'Jaga kor, grisar, får eller hönor, eller plocka kantareller. Stek i ugnen och ät – lagad mat mättar mycket mer.', n: 1, v: g => g.tl('e', [I.meat_cooked, I.pork_cooked, I.chicken_cooked, I.egg_fried, I.chanterelle_fried]) },
      { id: 'chest', t: 'Ett eget förråd', d: 'Åtta plankor i en ring blir en kista att spara skatter i.', n: 1, v: g => g.tl('pl', [B.chest]) },
      { id: 'bed', t: 'Bädda en säng', d: 'Tre ull (eller läder) över tre plankor. Får ger ull – och fyra ängsull eller fyra tråd blir vit ull. I sängen kan du sova bort natten.', n: 1, v: g => g.tl('pl', [I.bed]) }
    ]
  },
  {
    name: 'Ned i djupet', reward: [[B.lantern, 3, 'lyktor'], [I.arrow, 16, 'pilar']], goals: [
      { id: 'iron', t: 'Smält järn', d: 'Järnmalm har rostbruna klumpar och bryts med stenhacka. Smält den till tackor i ugnen.', n: 3, v: g => Math.max(g.have(I.iron_ingot), g.tl('s', [I.iron_ingot])) },
      { id: 'ironpick', t: 'Smid en järnhacka', d: 'Tre järntackor över två pinnar. Bara järn biter på guld och diamant.', n: 1, v: g => g.tl('c', [TOOL0 + 8, TOOL0 + 12]) },
      { id: 'gold', t: 'Guld i djupet', d: 'Guld ligger långt ned, under nivå 30. Ta med facklor – grottorna är mörka.', n: 1, v: g => g.tl('p', [B.gold_ore]) },
      { id: 'diamond', t: 'Diamantfynd', d: 'Diamantmalm glittrar svagt allra djupast, under nivå 11 nära berggrunden. Den är sällsynt – samla 3 diamanter.', n: 3, v: g => g.tl('p', [I.diamond]) },
      { id: 'dtool', t: 'Diamantverktyg', d: 'Det finaste som går att tillverka – skarpast och mest hållbart.', n: 1, v: g => g.tl('c', [TOOL0 + 12, TOOL0 + 13, TOOL0 + 14, TOOL0 + 15]) }
    ]
  },
  {
    name: 'Vildmarkens utmaningar', side: true, goals: [
      { id: 'berries', t: 'Bärplockare', d: 'Plocka 12 lingon eller hjortron. Lingonris växer i barrskog, hjortron på myren.', n: 12, v: g => g.tl('p', [I.lingon, I.cloudberry]) },
      { id: 'zombie', t: 'Zombiejägare', d: 'Besegra en zombie. De vandrar i mörkret, går rakt mot dig och brinner i solen.', n: 1, v: g => g.tl('k', ['zombie']) },
      { id: 'skeleton', t: 'Benknäckare', d: 'Besegra ett skelett. Håll dig i skydd – de håller avstånd och skjuter pilar.', n: 1, v: g => g.tl('k', ['skeleton']) },
      { id: 'spider', t: 'Spindelskräck', d: 'Besegra en spindel. De klättrar på väggar och är lugna i dagsljus – tills någon slår dem.', n: 1, v: g => g.tl('k', ['spider']) },
      { id: 'bow', t: 'Bågskytt', d: 'Gör en båge av pinnar och tråd. Håll in höger musknapp för att spänna och släpp för att skjuta. Pilar görs av sten, pinne och fjäder.', dt: 'Gör en båge av pinnar och tråd. Håll in Använd för att spänna och släpp för att skjuta.', n: 1, v: g => g.tl('sh', ['bow']) },
      { id: 'bonemeal', t: 'Gröna fingrar', d: 'Mal ben till benmjöl och strö det på en planta – den växer till ett träd direkt.', n: 1, v: g => g.tl('bm', [1]) },
      { id: 'lantern', t: 'Lyktbärare', d: 'Tillverka en lykta av järn och en fackla.', n: 1, v: g => g.tl('c', [B.lantern]) },
      { id: 'days', t: 'Överlevare', d: 'Överlev fem nätter i samma värld.', n: 5, v: g => g.tl('x', ['night']) }
    ]
  },
  {
    name: 'Gård och smedja', side: true, goals: [
      { id: 'till', t: 'Plöj en åker', d: 'Gör en jordhacka (sten och pinnar) och använd den på gräs nära vatten. Vetefrön får du när du slår av högt gräs.', n: 4, v: g => g.tl('hoe', [1]) },
      { id: 'sow', t: 'Så och skörda', d: 'Så vetefrön, morötter eller potatis i åkerjorden. Skörda moget vete och baka bröd av tre vete.', n: 1, v: g => g.tl('c', [I.bread]) },
      { id: 'bucket', t: 'Hink och mjölk', d: 'Tre järntackor blir en hink. Ösa upp vatten – eller mjölka en ko.', n: 1, v: g => g.tl('bk', [1]) + g.tl('milk', [1]) },
      { id: 'armor', t: 'Rustad', d: 'Smid en rustningsdel av läder, järn, guld eller diamant och ta på den. Rustning minskar skadan du tar.', n: 1, v: g => (g.armorPoints && g.armorPoints() > 0 ? 1 : 0) },
      { id: 'fish', t: 'Fiskelycka', d: 'Gör ett fiskespö av pinnar och tråd. Kasta mot vatten och dra in när flötet dyker.', n: 1, v: g => g.tl('p', [I.fish]) },
      { id: 'tnt', t: 'Sprängmästare', d: 'Fyll en låda med sand och kol (TNT) och tänd den med en fackla. Spring!', n: 1, v: g => g.tl('tnt', [1]) },
      { id: 'anvil', t: 'Smeden', d: 'Bygg ett städ och laga ett slitet verktyg med samma material som det är gjort av.', n: 1, v: g => g.tl('fix', [1]) }
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
    // äldre världar: kristallmålen heter nu diamant; mål för borttagna varelser glöms
    const RENAMED = { crystal: 'diamond', ctool: 'dtool' }, known = new Set(GOALS.map(x => x.id));
    this.done = new Set((f.journal || []).map(id => RENAMED[id] || id).filter(id => known.has(id)));
    f.journal = [...this.done];
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
