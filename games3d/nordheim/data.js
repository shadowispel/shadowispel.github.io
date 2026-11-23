// Nordheim – speldata: resurser, byggnader, enheter, fiender, kampanj.
// Ren logikmodul (inga three-importer) så att den kan syntaxkontrolleras fristående.

export const GAME_ID = 'nordheim';

export const RES = ['wood', 'stone', 'food', 'iron', 'gold', 'weapons'];
export const RES_INFO = {
  wood:    { name: 'Trä',   icon: '🪵', color: 0x9a6a3a },
  stone:   { name: 'Sten',  icon: '🪨', color: 0x9a9aa2 },
  food:    { name: 'Mat',   icon: '🍖', color: 0xd9a441 },
  iron:    { name: 'Järn',  icon: '⛓️', color: 0x6c7480 },
  gold:    { name: 'Guld',  icon: '🪙', color: 0xffcc33 },
  weapons: { name: 'Vapen', icon: '⚔️', color: 0xb8c4d0 }
};

// Tid
export const DAY = 120;            // sekunder speltid per dygn
export const DAYS_PER_SEASON = 2;
export const SEASONS = [
  { id: 'spring', name: 'Vår',    icon: '🌱' },
  { id: 'summer', name: 'Sommar', icon: '☀️' },
  { id: 'autumn', name: 'Höst',   icon: '🍂' },
  { id: 'winter', name: 'Vinter', icon: '❄️' }
];
export const YEAR = DAY * DAYS_PER_SEASON * 4;

// Terrängtyper (per ruta)
export const T = { WATER: 0, SAND: 1, GRASS: 2, MEADOW: 3, FOREST: 4, ROCK: 5 };
// Resurser på ruta
export const R = { NONE: 0, TREE: 1, STONE: 2, ORE: 3, BERRY: 4, FISH: 5 };

export const CATS = [
  { id: 'base',  name: 'Bas',      key: '1', icon: '🏠' },
  { id: 'raw',   name: 'Råvaror',  key: '2', icon: '🪓' },
  { id: 'food',  name: 'Mat',      key: '3', icon: '🌾' },
  { id: 'craft', name: 'Hantverk', key: '4', icon: '⚒️' },
  { id: 'def',   name: 'Försvar',  key: '5', icon: '🛡️' }
];

/*
 * Byggnader. size [bredd (x), djup (z)] i rutor. cost = resurser. time = arbetssekunder för en byggare.
 * workers = arbetsplatser. housing = bostäder. store = lagerkapacitet (all = alla resurser, food = endast mat).
 * req: 'coast' (nära vatten), 'ore' (malm intill), 'stone' (stenbrott i närheten), 'fertile' (äng), 'shore' (vid strandlinjen).
 * lvl: uppgradering (nivå 2).
 */
export const BUILDINGS = {
  hall: {
    name: 'Hövdingahallen', icon: '🏛️', cat: null, size: [4, 3], cost: {}, time: 1, hp: 1500,
    housing: 8, store: { all: 250 }, desc: 'Byns hjärta: lager, bostad och samlingsplats. Hövdingens huskarlar skjuter pilar mot fiender i närheten. Faller hallen är allt förlorat.',
    lvl: { name: 'Jarlahallen', cost: { wood: 150, stone: 150, gold: 60 }, hp: 2600, housing: 12, store: { all: 450 }, desc: 'Större lager, fler bostäder och starkare väggar.' }
  },
  house: {
    name: 'Långhus', icon: '🏠', cat: 'base', size: [3, 2], cost: { wood: 35 }, time: 16, hp: 300, housing: 6,
    desc: 'Bostad för 6 invånare. Fler bostäder låter byn växa.',
    lvl: { name: 'Stort långhus', cost: { wood: 40, stone: 30 }, hp: 450, housing: 10, desc: 'Plats för 10 invånare.' }
  },
  storehouse: {
    name: 'Lagerbod', icon: '📦', cat: 'base', size: [2, 2], cost: { wood: 40, stone: 10 }, time: 14, hp: 280, store: { all: 250 },
    desc: 'Ökar lagret för alla resurser och kortar bärarnas väg.',
    lvl: { name: 'Stort förråd', cost: { wood: 40, stone: 40 }, hp: 400, store: { all: 500 }, desc: 'Rymmer dubbelt så mycket.' }
  },
  road: {
    name: 'Väg', icon: '🟫', cat: 'base', size: [1, 1], cost: { stone: 1 }, time: 1, hp: 1, drag: true, walkable: true, instant: true,
    desc: 'Invånare och soldater går 60 % snabbare på vägar. Dra för att bygga en sträcka.'
  },
  demolish: {
    name: 'Riv väg/mur', icon: '🗑️', cat: 'base', size: [1, 1], cost: {}, time: 1, hp: 1, drag: true, tool: true,
    desc: 'Dra över vägar, palissader och portar för att riva dem (du får tillbaka en del av kostnaden). Andra byggnader rivs via deras panel.'
  },
  well: {
    name: 'Brunn', icon: '🪣', cat: 'base', size: [1, 1], cost: { stone: 15, wood: 5 }, time: 8, hp: 200, radius: 11,
    desc: 'Invånare i närheten hämtar vatten och släcker bränder snabbt.'
  },
  woodcutter: {
    name: 'Huggarstuga', icon: '🪓', cat: 'raw', size: [2, 2], cost: { wood: 20 }, time: 12, hp: 220, workers: 2, radius: 11,
    desc: 'Huggare fäller träd i närheten och bär stockar till lagret.',
    lvl: { name: 'Skogvaktarstuga', cost: { wood: 30, stone: 15 }, hp: 300, workers: 3, desc: '3 arbetare som även planterar nya träd.' }
  },
  quarry: {
    name: 'Stenhuggeri', icon: '⛏️', cat: 'raw', size: [2, 2], cost: { wood: 30 }, time: 14, hp: 260, workers: 2, radius: 10, req: 'stone',
    desc: 'Bryter sten ur stenblock i närheten. Måste byggas nära stenblock.',
    lvl: { name: 'Stort stenbrott', cost: { wood: 30, stone: 20 }, hp: 350, workers: 3, desc: '3 stenhuggare.' }
  },
  mine: {
    name: 'Gruva', icon: '⚒️', cat: 'raw', size: [2, 2], cost: { wood: 40, stone: 20 }, time: 18, hp: 320, workers: 2, req: 'ore', radius: 4,
    desc: 'Bryter järnmalm – och ibland guld. Måste byggas intill en malmåder.',
    lvl: { name: 'Djupgruva', cost: { wood: 40, stone: 40 }, hp: 420, workers: 4, desc: '4 gruvarbetare och större chans till guld.' }
  },
  field: {
    name: 'Åker', icon: '🌾', cat: 'food', size: [3, 3], cost: { wood: 10 }, time: 6, hp: 60, walkable: true, req: 'fertile',
    desc: 'Sås på våren, skördas på hösten. Kräver en lada i närheten. Bäst på ängsmark.'
  },
  barn: {
    name: 'Lada', icon: '🛖', cat: 'food', size: [2, 2], cost: { wood: 40 }, time: 14, hp: 260, workers: 2, radius: 11, store: { food: 250 },
    desc: 'Bönder sår och skördar åkrar inom räckhåll. Lagrar mat.',
    lvl: { name: 'Gård', cost: { wood: 40, stone: 30 }, hp: 360, workers: 4, store: { food: 450 }, desc: '4 bönder och större matlager.' }
  },
  fisher: {
    name: 'Fiskarhydda', icon: '🎣', cat: 'food', size: [2, 2], cost: { wood: 25 }, time: 12, hp: 200, workers: 2, radius: 13, req: 'coast',
    desc: 'Fiskare fiskar vid stranden. Måste ligga nära fiskevatten (visas blått vid placering). Fungerar året runt, men långsammare under isvintern.',
    lvl: { name: 'Fiskeläge', cost: { wood: 30, stone: 10 }, hp: 260, workers: 3, desc: '3 fiskare.' }
  },
  hunter: {
    name: 'Jägarstuga', icon: '🏹', cat: 'food', size: [2, 2], cost: { wood: 25 }, time: 12, hp: 200, workers: 2, radius: 16,
    desc: 'Jägare fäller hjortar i skogen och bär hem kött.'
  },
  gatherer: {
    name: 'Samlarkoja', icon: '🫐', cat: 'food', size: [2, 2], cost: { wood: 20 }, time: 10, hp: 180, workers: 2, radius: 11,
    desc: 'Plockar bär från buskar. Bären växer till snabbast på sommaren och hösten – inte alls på vintern.'
  },
  harbor: {
    name: 'Hamn', icon: '⚓', cat: 'food', size: [3, 3], cost: { wood: 80, stone: 30 }, time: 24, hp: 400, workers: 2, req: 'shore',
    desc: 'Fiskebåtar ger mycket mat. Handelsskepp kommer varje årstid och köper överskott för guld.'
  },
  smithy: {
    name: 'Smedja', icon: '🔨', cat: 'craft', size: [2, 2], cost: { wood: 40, stone: 40 }, time: 18, hp: 300, workers: 1,
    desc: 'Smider vapen av 2 järn och 1 trä. Vapen behövs för krigare och sköldmör.',
    lvl: { name: 'Stor smedja', cost: { stone: 40, iron: 10, gold: 20 }, hp: 400, workers: 2, desc: '2 smeder som arbetar snabbare.' }
  },
  market: {
    name: 'Marknad', icon: '🏪', cat: 'craft', size: [3, 3], cost: { wood: 60, stone: 40, gold: 20 }, time: 22, hp: 300, workers: 1, radius: 16,
    desc: 'Gör invånare i närheten gladare, ökar skatteintäkterna och låter dig handla resurser mot guld.'
  },
  temple: {
    name: 'Hov', icon: '🛕', cat: 'craft', size: [3, 3], cost: { wood: 80, stone: 80, gold: 40 }, time: 30, hp: 500, workers: 1, radius: 18,
    desc: 'Tempel åt gudarna. Höjer glädjen kraftigt för hus inom räckhåll.',
    lvl: { name: 'Stora hovet', cost: { stone: 100, gold: 80 }, hp: 700, workers: 2, desc: 'Ännu större glädje och längre räckvidd.' }
  },
  barracks: {
    name: 'Kasern', icon: '🛡️', cat: 'def', size: [3, 2], cost: { wood: 80, stone: 40 }, time: 22, hp: 500, soldiers: 10,
    desc: 'Tränar krigare, bågskyttar och sköldmör av lediga invånare. Rymmer 10 soldater.',
    lvl: { name: 'Stor kasern', cost: { wood: 60, stone: 60, gold: 30 }, hp: 700, soldiers: 18, desc: 'Rymmer 18 soldater och tränar snabbare.' }
  },
  archertower: {
    name: 'Bågskyttetorn', icon: '🗼', cat: 'def', size: [2, 2], cost: { wood: 40, stone: 40 }, time: 18, hp: 500,
    range: 9, dmg: 8, cd: 1.4,
    desc: 'Skjuter pilar mot fiender inom räckhåll.',
    lvl: { name: 'Stentorn', cost: { stone: 60, iron: 10 }, hp: 800, range: 11, dmg: 12, cd: 1.1, desc: 'Längre räckvidd och hårdare pilar.' }
  },
  watchtower: {
    name: 'Vakttorn', icon: '🔭', cat: 'def', size: [1, 1], cost: { wood: 30 }, time: 10, hp: 250, range: 7, dmg: 4, cd: 2.2,
    desc: 'Ger 20 sekunders tidigare varning för räder (högst +60 s) och skjuter svaga pilar.'
  },
  wall: {
    name: 'Palissad', icon: '🧱', cat: 'def', size: [1, 1], cost: { wood: 3 }, time: 2, hp: 260, drag: true, wall: true,
    desc: 'Stoppar fiender. Dra för att bygga en mur. Fiender måste slå sig igenom.',
    lvl: { name: 'Stenmur', cost: { stone: 5 }, hp: 750, desc: 'Mycket starkare mur.' }
  },
  gate: {
    name: 'Port', icon: '🚪', cat: 'def', size: [1, 1], cost: { wood: 15 }, time: 4, hp: 420, gate: true,
    desc: 'Dina invånare och soldater kan passera – fienden kan inte.',
    lvl: { name: 'Stenport', cost: { stone: 20 }, hp: 950, desc: 'Mycket starkare port.' }
  }
};
export const BUILD_ORDER = ['house', 'storehouse', 'road', 'demolish', 'well', 'woodcutter', 'quarry', 'mine', 'field', 'barn', 'fisher', 'hunter', 'gatherer', 'harbor',
  'smithy', 'market', 'temple', 'barracks', 'archertower', 'watchtower', 'wall', 'gate'];

// Spelarens soldater
export const UNITS = {
  krigare: { name: 'Krigare', icon: '🪓', cost: { weapons: 1, food: 10, gold: 5 }, time: 14, hp: 70, atk: 9, range: 0.9, cd: 1.0, armor: 1, speed: 1.7,
    desc: 'Pålitlig närstridskämpe med yxa.' },
  bagskytt: { name: 'Bågskytt', icon: '🏹', cost: { wood: 10, food: 10, gold: 8 }, time: 14, hp: 40, atk: 7, range: 7.5, cd: 1.6, armor: 0, speed: 1.7,
    desc: 'Skjuter på avstånd. Skydda dem bakom krigarna.' },
  skoldmo: { name: 'Sköldmö', icon: '🛡️', cost: { weapons: 1, iron: 3, food: 10, gold: 10 }, time: 18, hp: 130, atk: 7, range: 0.9, cd: 1.1, armor: 4, speed: 1.45,
    desc: 'Tung försvarare med sköld och spjut. Tål mycket stryk.' }
};

// Fiender
export const ENEMIES = {
  plundrare: { name: 'Plundrare', hp: 40, atk: 6, range: 0.85, cd: 1.1, armor: 0, speed: 1.75, cost: 1, desc: 'Stjäl ur lagret och tänder eld på hus.' },
  fbagskytt: { name: 'Fiendebågskytt', hp: 32, atk: 6, range: 6.5, cd: 1.8, armor: 0, speed: 1.6, cost: 1.5 },
  barsark:   { name: 'Bärsärk', hp: 80, atk: 13, range: 0.9, cd: 0.9, armor: 1, speed: 2.15, cost: 2.5 },
  stege:     { name: 'Stegbärare', hp: 50, atk: 4, range: 0.85, cd: 1.3, armor: 0, speed: 1.5, cost: 2, desc: 'Reser stormstegar över murar.' },
  murbracka: { name: 'Murbräcka', hp: 320, atk: 70, range: 1.1, cd: 2.6, armor: 5, speed: 0.9, cost: 5, siege: true, desc: 'Krossar murar och portar.' },
  troll:     { name: 'Troll', hp: 520, atk: 30, range: 1.3, cd: 1.7, armor: 3, speed: 1.3, cost: 11, big: true, desc: 'Ett jättelikt bergstroll.' },
  hovding:   { name: 'Fiendehövding', hp: 260, atk: 16, range: 1.0, cd: 1.0, armor: 3, speed: 1.6, cost: 8 }
};

export const DIFFS = {
  fredlig: { name: 'Fredlig', raid: 0, start: 1.4, desc: 'Inga räder – bygg i lugn och ro.' },
  latt:    { name: 'Lätt', raid: 0.6, start: 1.25, desc: 'Små räder med längre mellanrum.' },
  normal:  { name: 'Normal', raid: 1.0, start: 1.0, desc: 'Ett balanserat spel.' },
  svar:    { name: 'Svår', raid: 1.5, start: 0.8, desc: 'Stora räder och snålt startkapital.' }
};
export const SIZES = {
  liten: { name: 'Liten', n: 96 },
  medel: { name: 'Medel', n: 128 },
  stor:  { name: 'Stor', n: 160 }
};

export const START_STOCK = { wood: 160, stone: 60, food: 120, iron: 0, gold: 30, weapons: 0 };

/*
 * Kampanj. Mål (goals): { type, n, res, b, label }
 *  pop, stock(res), build(b), raids, happy, units, weapons, destroyCamp, year (överlev till)
 * deadline: { year, season } – misslyckas om tiden passerar.
 */
export const CAMPAIGN = [
  {
    id: 'c1', name: 'Landstigningen', icon: '⛵',
    story: 'Er knarr har lagt till vid en okänd ö. Hövdingen ger dig ansvaret för den nya bosättningen. Börja med det viktigaste: trä, mat och tak över huvudet.',
    seed: 'landstigning', size: 96, raids: false, tutorial: true,
    build: ['house', 'storehouse', 'road', 'woodcutter', 'quarry', 'fisher', 'gatherer', 'hunter', 'well'],
    stock: { wood: 140, stone: 40, food: 100, gold: 20 }, pop: 8,
    goals: [
      { type: 'build', b: 'woodcutter', n: 1, label: 'Bygg en huggarstuga' },
      { type: 'build', b: 'fisher', n: 1, label: 'Bygg en fiskarhydda' },
      { type: 'build', b: 'house', n: 2, label: 'Bygg två långhus' },
      { type: 'pop', n: 16, label: 'Nå 16 invånare' }
    ]
  },
  {
    id: 'c2', name: 'Första vintern', icon: '❄️',
    story: 'Vintern på ön är lång och hård. Inga åkrar växer och fisket går trögt under isen. Fyll lagren innan snön faller.',
    seed: 'forsta-vintern', size: 112, raids: false,
    build: ['house', 'storehouse', 'road', 'woodcutter', 'quarry', 'fisher', 'gatherer', 'hunter', 'well', 'field', 'barn'],
    stock: { wood: 160, stone: 60, food: 90, gold: 20 }, pop: 10,
    goals: [
      { type: 'build', b: 'field', n: 3, label: 'Anlägg tre åkrar' },
      { type: 'pop', n: 30, label: 'Ha minst 30 invånare' },
      { type: 'survive', year: 2, season: 0, label: 'Klara er genom vintern' }
    ]
  },
  {
    id: 'c3', name: 'Eld i natten', icon: '🔥',
    story: 'Rökpelare vid horisonten. Plundrare från fastlandet har fått syn på er by. Bygg försvar och håll ut.',
    seed: 'eld-i-natten', size: 112, raids: true, raidMult: 0.7, firstRaid: 300, interval: 240,
    build: ['house', 'storehouse', 'road', 'woodcutter', 'quarry', 'fisher', 'gatherer', 'hunter', 'well', 'field', 'barn', 'barracks', 'archertower', 'watchtower', 'wall', 'gate', 'mine', 'smithy'],
    stock: { wood: 220, stone: 120, food: 150, gold: 60, weapons: 4 }, pop: 14,
    goals: [
      { type: 'build', b: 'archertower', n: 1, label: 'Bygg ett bågskyttetorn' },
      { type: 'units', n: 4, label: 'Träna 4 soldater' },
      { type: 'raids', n: 3, label: 'Överlev 3 räder' }
    ]
  },
  {
    id: 'c4', name: 'Gudarnas gunst', icon: '🛕',
    story: 'Folket är oroligt efter räderna. Bygg ett hov åt gudarna, öppna en marknad och gör Nordheim till en plats man vill leva i.',
    seed: 'gudarnas-gunst', size: 128, raids: true, raidMult: 0.6, firstRaid: 420, interval: 300,
    build: 'all',
    stock: { wood: 250, stone: 150, food: 160, gold: 80, weapons: 4 }, pop: 16,
    goals: [
      { type: 'build', b: 'temple', n: 1, label: 'Bygg ett hov' },
      { type: 'build', b: 'market', n: 1, label: 'Bygg en marknad' },
      { type: 'pop', n: 50, label: 'Nå 50 invånare' },
      { type: 'happy', n: 75, label: 'Glädje minst 75 %' }
    ]
  },
  {
    id: 'c5', name: 'Järn och stål', icon: '⚔️',
    story: 'Spejare varnar för en stor flotta med murbräckor. Bryt malm, smid vapen och bygg en armé värdig sagorna.',
    seed: 'jarn-och-stal', size: 128, raids: true, raidMult: 1.0, firstRaid: 360, interval: 240,
    build: 'all',
    stock: { wood: 260, stone: 180, food: 180, gold: 80, iron: 10, weapons: 2 }, pop: 18,
    goals: [
      { type: 'weapons', n: 30, label: 'Smid 30 vapen' },
      { type: 'units', n: 12, label: 'Träna 12 soldater' },
      { type: 'raids', n: 5, label: 'Överlev 5 räder' }
    ]
  },
  {
    id: 'c6', name: 'Trollens ö', icon: '🏴',
    story: 'En fientlig jarl har slagit läger på andra sidan ön och skickar ständigt krigare mot er. Bygg upp en armé, rensa hans vakter och bränn ned hans hall.',
    seed: 'trollens-o', size: 140, raids: true, raidMult: 0.8, firstRaid: 480, interval: 300, camp: true,
    build: 'all',
    stock: { wood: 300, stone: 200, food: 200, gold: 120, iron: 20, weapons: 6 }, pop: 20,
    goals: [
      { type: 'destroyCamp', n: 1, label: 'Förstör jarlens hall' }
    ]
  },
  {
    id: 'c7', name: 'Ragnarök', icon: '🐺',
    story: 'Himlen mörknar. Troll vaknar i bergen och flotta efter flotta siktas. Detta är Nordheims sista prov – överlev tio räder.',
    seed: 'ragnarok', size: 140, raids: true, raidMult: 1.05, firstRaid: 360, interval: 230,
    build: 'all',
    stock: { wood: 320, stone: 260, food: 260, gold: 220, iron: 30, weapons: 10 }, pop: 22,
    goals: [
      { type: 'raids', n: 10, label: 'Överlev 10 räder' },
      { type: 'pop', n: 35, label: 'Ha minst 35 invånare' }
    ]
  }
];

export const NAMES = ['Astrid', 'Bjarne', 'Sigrid', 'Ragnar', 'Ingrid', 'Leif', 'Gudrun', 'Torsten', 'Helga', 'Erik', 'Frida', 'Halvar', 'Solveig',
  'Ulf', 'Tyra', 'Gunnar', 'Ylva', 'Sven', 'Ragnhild', 'Knut', 'Estrid', 'Orm', 'Torun', 'Arne', 'Gyda', 'Hjalmar', 'Ingeborg', 'Rune', 'Sölve',
  'Asta', 'Folke', 'Disa', 'Ebbe', 'Gerd', 'Hakon', 'Inga', 'Jorund', 'Kettil', 'Liv', 'Mats', 'Nanna', 'Olof', 'Ragna', 'Sten', 'Thora', 'Vidar',
  'Åsa', 'Ödger', 'Alva', 'Brand', 'Dagny', 'Egil', 'Freja', 'Grim', 'Hild', 'Ivar', 'Kari', 'Lodin', 'Märta', 'Njål', 'Ottar', 'Ronja', 'Sune',
  'Tove', 'Unn', 'Valdis', 'Yngve', 'Algot', 'Borghild', 'Embla', 'Finn', 'Gisle', 'Haldis', 'Ingvar', 'Jofrid', 'Ketil', 'Ljot', 'Moa', 'Nils'];

export function costText(cost) {
  return Object.entries(cost || {}).filter(([, v]) => v > 0).map(([k, v]) => RES_INFO[k].icon + ' ' + v).join('  ');
}
