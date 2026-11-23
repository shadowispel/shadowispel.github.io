/**
 * Rymdjakt – speldata: skepp, vapen, uppgraderingar, svårighetsgrader, rollfigurer och sparfil.
 */
export const GAME_ID = 'rymdjakt';

/* ---------------------------------------------------------------- Svårighet */
export const DIFF = {
  easy:   { id: 'easy',   label: 'Lätt',   tokens: 1, dmgTaken: 0.5,  enemyAcc: 0.5,  enemyHp: 0.85, react: 0.65, aggro: 0.75, scoreMult: 0.75, count: 0.8,  allyDmg: 0.45 },
  normal: { id: 'normal', label: 'Normal', tokens: 2, dmgTaken: 0.72,  enemyAcc: 0.78, enemyHp: 1,    react: 1,    aggro: 1,    scoreMult: 1,    count: 1,    allyDmg: 0.6 },
  hard:   { id: 'hard',   label: 'Svår',   tokens: 3, dmgTaken: 1.25, enemyAcc: 1,    enemyHp: 1.15, react: 1.35, aggro: 1.3,  scoreMult: 1.5,  count: 1.2,  allyDmg: 0.8 }
};

/* ---------------------------------------------------------------- Primärvapen */
export const PRIMARY = {
  pulse:   { id: 'pulse',   name: 'Pulslaser',  desc: 'Snabb och pålitlig. Bra allround.', dmg: 9,  cd: 0.11, heat: 3.0, speed: 1050, life: 1.35, mode: 'alt',   color: [0.4, 1.6, 2.6],  size: 1,   shieldMult: 1,   hullMult: 1,   price: 0,    unlock: 0, sound: 'pulse' },
  heavy:   { id: 'heavy',   name: 'Tunglaser',  desc: 'Långsam eldtakt, kraftiga träffar. Bra mot stora skepp.', dmg: 26, cd: 0.34, heat: 7.5, speed: 950, life: 1.5, mode: 'both', color: [2.8, 0.9, 2.2], size: 1.6, shieldMult: 1, hullMult: 1.2, price: 1600, unlock: 3, sound: 'heavy' },
  ion:     { id: 'ion',     name: 'Jonkanon',   desc: 'Slår ut sköldar mycket snabbt men biter sämre på skrov.', dmg: 8, cd: 0.12, heat: 3.2, speed: 1150, life: 1.3, mode: 'alt', color: [1.2, 2.0, 3.2], size: 1.1, shieldMult: 2.6, hullMult: 0.55, price: 2000, unlock: 5, sound: 'ion' },
  scatter: { id: 'scatter', name: 'Spridkanon', desc: 'Tre skott i en solfjäder. Förödande på nära håll.', dmg: 7, cd: 0.24, heat: 6.5, speed: 900, life: 0.8, mode: 'spread', color: [2.6, 2.0, 0.5], size: 1.1, shieldMult: 1, hullMult: 1, price: 1800, unlock: 6, sound: 'scatter' }
};

/* ---------------------------------------------------------------- Sekundärvapen */
export const SECONDARY = {
  // Oändliga missiler: magasinet rymmer alltid 2 och laddas om en i taget (reload = sekunder per missil).
  homing:  { id: 'homing',  name: 'Hökmissil',     desc: 'Målsökande missil. Håll målet i siktet för att låsa – fungerar på allt från jaktplan och delsystem till asteroider och fiendens missiler.', dmg: 60,  speed: 300, turn: 2.6, life: 7, lockTime: 1.1, lockRange: 1500, reload: 3.6, price: 0, unlock: 0, blast: 25, capMult: 1 },
  swarm:   { id: 'swarm',   name: 'Svärmraketer',  desc: 'Fyra lätta raketer per salva som söker målet framför dig. Ingen låsning krävs.', dmg: 22, speed: 340, turn: 1.6, life: 4, lockTime: 0, lockRange: 1100, reload: 4.4, salvo: 4, price: 1400, unlock: 4, blast: 14, capMult: 1 },
  torpedo: { id: 'torpedo', name: 'Tungtorped',    desc: 'Långsam men enormt kraftfull mot kryssare, stationer och delsystem. Lång omladdning.', dmg: 210, speed: 170, turn: 0.9, life: 12, lockTime: 2.0, lockRange: 2200, reload: 9, price: 2200, unlock: 7, blast: 70, capMult: 1.9 }
};

/* ---------------------------------------------------------------- Spelarskepp */
export const PLAYER_SHIPS = {
  svala: {
    id: 'svala', name: 'Svala', role: 'Allroundjakt', model: 'svala',
    desc: 'Nordstjärneflottans arbetshäst. Balanserad fart, smidighet och tålighet.',
    hull: 100, shield: 100, shieldRegen: 10, speed: 118, boost: 205, accel: 80, energyRegen: 14,
    turn: { pitch: 1.95, yaw: 1.55, roll: 3.0 }, radius: 5.5, heatMult: 1, dmgMult: 1, reloadMult: 1, flares: 6,
    price: 0, unlock: 0
  },
  falk: {
    id: 'falk', name: 'Falk', role: 'Snabbjakt', model: 'falk',
    desc: 'Snabbast i flottan och mycket smidig, men tunt skrov och lite långsammare missilomladdning. Kyler vapnen effektivt.',
    hull: 72, shield: 80, shieldRegen: 12, speed: 140, boost: 250, accel: 105, energyRegen: 18,
    turn: { pitch: 2.35, yaw: 1.9, roll: 3.6 }, radius: 5, heatMult: 0.75, dmgMult: 0.95, reloadMult: 1.1, flares: 5,
    price: 3000, unlock: 3
  },
  orn: {
    id: 'orn', name: 'Örn', role: 'Tung attackjakt', model: 'orn',
    desc: 'Tungt bepansrad med kraftigare lasrar och snabbare missilomladdning. Trögare i svängarna.',
    hull: 165, shield: 150, shieldRegen: 9, speed: 98, boost: 165, accel: 60, energyRegen: 11,
    turn: { pitch: 1.55, yaw: 1.2, roll: 2.4 }, radius: 7, heatMult: 1.1, dmgMult: 1.3, reloadMult: 0.85, flares: 8,
    price: 4800, unlock: 6
  }
};

/* ---------------------------------------------------------------- Uppgraderingar */
export const UPGRADES = [
  { id: 'motor',  name: 'Motorer',    desc: '+6 % fart, boost och svängförmåga per nivå, snabbare energiladdning.' },
  { id: 'skold',  name: 'Sköld',      desc: '+15 % sköldkapacitet och laddning per nivå.' },
  { id: 'skrov',  name: 'Skrov',      desc: '+15 % skrovstyrka per nivå.' },
  { id: 'vapen',  name: 'Vapen',      desc: '+10 % laserskada och 10 % mindre värme per nivå.' },
  { id: 'robot',  name: 'Laddsystem', desc: '8 % snabbare missilomladdning och +1 motåtgärd per nivå. Magasinet rymmer alltid två missiler.' }
];
export const UPGRADE_COST = [400, 900, 1600, 2600];
export const MAX_UPG = 4;
/** Antal missiler i magasinet (samma för alla skepp). */
export const MISSILE_MAG = 2;

/* ---------------------------------------------------------------- Fiender och övriga skepp (AI) */
// ai: fighter | interceptor | bomber | capital | station | freighter | mine | drone | none
export const NPC = {
  wing:     { name: 'Svala', model: 'svala_w', ai: 'fighter', hull: 120, shield: 100, shieldRegen: 8, speed: 116, boost: 200, accel: 80, turn: { pitch: 1.8, yaw: 1.4, roll: 2.8 }, radius: 5.5, weapon: 'pulse', points: 0, kind: 'fighter' },
  ally:     { name: 'Svala', model: 'svala_w', ai: 'fighter', hull: 70, shield: 60, shieldRegen: 6, speed: 112, boost: 190, accel: 75, turn: { pitch: 1.7, yaw: 1.3, roll: 2.6 }, radius: 5.5, weapon: 'pulse', points: 0, kind: 'fighter' },
  hugg:     { name: 'Hugg-jakt', model: 'hugg', ai: 'fighter', hull: 55, shield: 30, shieldRegen: 4, speed: 108, boost: 185, accel: 75, turn: { pitch: 1.7, yaw: 1.3, roll: 2.7 }, radius: 5, weapon: 'enemy', points: 100, kind: 'fighter' },
  spjut:    { name: 'Spjut-snabbjakt', model: 'spjut', ai: 'interceptor', hull: 45, shield: 45, shieldRegen: 6, speed: 135, boost: 230, accel: 100, turn: { pitch: 2.0, yaw: 1.55, roll: 3.2 }, radius: 4.5, weapon: 'enemy', missiles: 2, points: 150, kind: 'fighter' },
  tordon:   { name: 'Tordön-bombare', model: 'tordon', ai: 'bomber', hull: 150, shield: 70, shieldRegen: 3, speed: 78, boost: 120, accel: 45, turn: { pitch: 1.1, yaw: 0.9, roll: 1.6 }, radius: 8, weapon: 'enemy', torpedoes: 2, tailGun: true, points: 200, kind: 'bomber' },
  bastion:  { name: 'Bastion-korvett', model: 'bastion', ai: 'capital', hull: 900, shield: 350, shieldRegen: 6, speed: 34, boost: 34, accel: 8, turn: { pitch: 0.22, yaw: 0.2, roll: 0.2 }, radius: 40, points: 700, kind: 'capital' },
  klyvare:  { name: 'Klyvare-fregatt', model: 'klyvare', ai: 'capital', hull: 2000, shield: 0, speed: 26, boost: 26, accel: 6, turn: { pitch: 0.14, yaw: 0.13, roll: 0.12 }, radius: 80, points: 1500, kind: 'capital' },
  domare:   { name: 'Kryssaren Domaren', model: 'domare', ai: 'capital', hull: 4200, shield: 0, speed: 16, boost: 16, accel: 4, turn: { pitch: 0.07, yaw: 0.07, roll: 0.06 }, radius: 220, points: 4000, kind: 'capital' },
  fangskepp:{ name: 'Fångtransporten Kedjan', model: 'fangskepp', ai: 'capital', hull: 1800, shield: 300, shieldRegen: 0, speed: 30, boost: 30, accel: 5, turn: { pitch: 0.12, yaw: 0.12, roll: 0.1 }, radius: 70, points: 0, kind: 'capital' },
  modern:   { name: 'Svärmmodern', model: 'modern', ai: 'capital', hull: 6000, shield: 0, speed: 6, boost: 6, accel: 2, turn: { pitch: 0.02, yaw: 0.02, roll: 0.02 }, radius: 600, points: 10000, kind: 'capital' },
  gruvbas:  { name: 'Gruvbasen Malmkäften', model: 'gruvbas', ai: 'station', targetsKill: true, hull: 3000, shield: 0, speed: 0, boost: 0, accel: 0, turn: { pitch: 0, yaw: 0, roll: 0 }, radius: 260, points: 3000, kind: 'station' },
  varv:     { name: 'Varvet Smedjan', model: 'varv', ai: 'station', targetsKill: true, hull: 4000, shield: 0, speed: 0, boost: 0, accel: 0, turn: { pitch: 0, yaw: 0, roll: 0 }, radius: 360, points: 4000, kind: 'station' },
  polstjarnan: { name: 'Polstjärnan', model: 'station', ai: 'station', hull: 6000, shield: 1500, shieldRegen: 4, speed: 0, boost: 0, accel: 0, turn: { pitch: 0, yaw: 0, roll: 0 }, radius: 260, points: 0, kind: 'station' },
  frakt:    { name: 'Malmfraktare', model: 'frakt', ai: 'freighter', hull: 900, shield: 250, shieldRegen: 3, speed: 38, boost: 38, accel: 10, turn: { pitch: 0.3, yaw: 0.3, roll: 0.3 }, radius: 34, points: 0, kind: 'capital' },
  farja:    { name: 'Admiralsfärjan', model: 'farja', ai: 'freighter', hull: 700, shield: 300, shieldRegen: 5, speed: 52, boost: 52, accel: 14, turn: { pitch: 0.5, yaw: 0.5, roll: 0.5 }, radius: 20, points: 0, kind: 'capital' },
  vaktare:  { name: 'Fregatten Stormfågel', model: 'vaktare', ai: 'capital', hull: 3200, shield: 800, shieldRegen: 6, speed: 24, boost: 24, accel: 6, turn: { pitch: 0.14, yaw: 0.13, roll: 0.12 }, radius: 90, points: 0, kind: 'capital' },
  drone:    { name: 'Övningsdrönare', model: 'drone', ai: 'drone', hull: 30, shield: 0, speed: 40, boost: 40, accel: 20, turn: { pitch: 0.8, yaw: 0.8, roll: 0.8 }, radius: 4, points: 50, kind: 'drone' },
  mine:     { name: 'Mina', model: 'mine', ai: 'mine', hull: 18, shield: 0, speed: 0, boost: 0, accel: 0, turn: { pitch: 0, yaw: 0, roll: 0 }, radius: 4, points: 40, kind: 'mine' },
  container:{ name: 'Lastcontainer', model: 'container', ai: 'none', hull: 60, shield: 0, speed: 0, boost: 0, accel: 0, turn: { pitch: 0, yaw: 0, roll: 0 }, radius: 8, points: 0, kind: 'object' },
  gate:     { name: 'Hoppgrinden', model: 'gate', ai: 'none', hull: 99999, shield: 0, speed: 0, boost: 0, accel: 0, turn: { pitch: 0, yaw: 0, roll: 0 }, radius: 130, points: 0, kind: 'object', invulnerable: true }
};

/** Fiendernas och de allierades laservapen. */
export const NPC_WEAPON = {
  enemy: { dmg: 4.5, cd: 0.2, heat: 4, speed: 900, life: 1.4, mode: 'alt', color: [2.4, 0.6, 0.2], size: 1, shieldMult: 1, hullMult: 1, sound: 'enemy' },
  pulse: { dmg: 7, cd: 0.14, heat: 3.5, speed: 1000, life: 1.35, mode: 'alt', color: [0.4, 1.6, 2.6], size: 1, shieldMult: 1, hullMult: 1, sound: 'pulse' },
  turret: { dmg: 8, cd: 0.5, heat: 0, speed: 800, life: 2.0, mode: 'single', color: [2.8, 0.6, 0.2], size: 1.6, shieldMult: 1, hullMult: 1, sound: 'turret' },
  turretAlly: { dmg: 10, cd: 0.5, heat: 0, speed: 850, life: 2.0, mode: 'single', color: [0.5, 1.8, 2.8], size: 1.6, shieldMult: 1, hullMult: 1, sound: 'turret' },
  heavyTurret: { dmg: 45, cd: 1.6, heat: 0, speed: 600, life: 3.2, mode: 'single', color: [3.0, 1.2, 0.3], size: 3.2, shieldMult: 1, hullMult: 1, sound: 'heavy' },
  heavyAlly: { dmg: 45, cd: 1.6, heat: 0, speed: 650, life: 3.2, mode: 'single', color: [0.8, 1.6, 3.0], size: 3.2, shieldMult: 1, hullMult: 1, sound: 'heavy' },
  tail: { dmg: 4, cd: 0.3, heat: 0, speed: 850, life: 1.0, mode: 'single', color: [2.8, 0.7, 0.25], size: 0.9, shieldMult: 1, hullMult: 1, sound: 'enemy' }
};
export const NPC_MISSILE = { dmg: 30, speed: 250, turn: 1.8, life: 7, blast: 18, capMult: 1 };
export const NPC_TORPEDO = { dmg: 140, speed: 150, turn: 0.8, life: 14, blast: 50, capMult: 2.2, torpedo: true };

/* ---------------------------------------------------------------- Rollfigurer (radio) */
// Porträtten ritas procedurellt i portraits.js utifrån dessa parametrar.
export const CHARS = {
  lind:     { name: 'Kommendör Astrid Lind', col: '#8ab8ff', p: { bg: ['#1d3a6e', '#0b1630'], skin: '#e8c4a8', hair: '#c9ccd2', style: 'bun', uniform: '#1f4f9f', trim: '#f2c230', age: 1 } },
  varg:     { name: 'Löjtnant Erik ”Varg” Holm', col: '#7fe0a8', p: { bg: ['#1f4a3a', '#0a1a14'], skin: '#d9a888', hair: '#5a3a22', style: 'beard', helmet: '#d8dde6', visor: '#3fa9ff', uniform: '#2a5f9f', trim: '#f2c230' } },
  gnista:   { name: 'Fänrik Saga ”Gnista” Berg', col: '#ffb070', p: { bg: ['#5a2a1a', '#1a0a06'], skin: '#f0cdb4', hair: '#d4542a', style: 'long', helmet: '#f2c230', visor: '#ff9a40', uniform: '#2a5f9f', trim: '#ffffff' } },
  ek:       { name: 'Ingenjör Nils Ek', col: '#ffe080', p: { bg: ['#4a4020', '#16130a'], skin: '#e2b896', hair: '#2a2a2a', style: 'short', glasses: true, uniform: '#5a5f6a', trim: '#f2c230', cap: '#f2c230' } },
  kontroll: { name: 'Polstjärnan Kontroll', col: '#9fd0ff', p: { icon: 'station', bg: ['#123060', '#060c1c'] } },
  sund:     { name: 'Kapten Mira Sund', col: '#c9a0ff', p: { bg: ['#3a2a5a', '#120a1e'], skin: '#a8765a', hair: '#1a1210', style: 'short', uniform: '#6a5a3a', trim: '#d0b070' } },
  rask:     { name: 'Amiral Johan Rask', col: '#e0e6ff', p: { bg: ['#2a3550', '#0c101c'], skin: '#e6c0a0', hair: '#efefef', style: 'beard', uniform: '#13306a', trim: '#f2c230', cap: '#13306a', age: 1 } },
  vahl:     { name: 'Överherre Vahl', col: '#ff6a5a', p: { mask: true, bg: ['#4a0c0c', '#120202'], uniform: '#2a2a30', trim: '#b0301c' } },
  svarm:    { name: 'Svärmpilot', col: '#ff8a6a', p: { mask: true, bg: ['#3a1410', '#0e0404'], uniform: '#3a3d44', trim: '#a8321f', simple: true } },
  dator:    { name: 'Skeppsdatorn', col: '#8af0ff', p: { icon: 'computer', bg: ['#0e3a44', '#03100f'] } }
};

/* ---------------------------------------------------------------- Sparfil */
const SAVE_KEY = 'rymdjakt:save';
export function defaultSave() {
  return {
    v: 1, credits: 0, unlocked: 0, missions: {},
    ship: 'svala', ships: { svala: true },
    upgrades: { svala: { motor: 0, skold: 0, skrov: 0, vapen: 0, robot: 0 }, falk: { motor: 0, skold: 0, skrov: 0, vapen: 0, robot: 0 }, orn: { motor: 0, skold: 0, skrov: 0, vapen: 0, robot: 0 } },
    primary: 'pulse', secondary: 'homing', owned: { pulse: true, homing: true },
    diff: 'normal', survival: [], campaignDone: false, seenTips: {}
  };
}
export function loadSave() {
  const S = window.Spelhallen;
  const raw = S ? S.store.get(SAVE_KEY, null) : null;
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const s = Object.assign(d, raw);
  for (const k of Object.keys(PLAYER_SHIPS)) s.upgrades[k] = Object.assign({ motor: 0, skold: 0, skrov: 0, vapen: 0, robot: 0 }, (raw.upgrades || {})[k] || {});
  if (!PLAYER_SHIPS[s.ship] || !s.ships[s.ship]) s.ship = 'svala';
  if (!PRIMARY[s.primary] || !s.owned[s.primary]) s.primary = 'pulse';
  if (!SECONDARY[s.secondary] || !s.owned[s.secondary]) s.secondary = 'homing';
  if (!DIFF[s.diff]) s.diff = 'normal';
  if (!Array.isArray(s.survival)) s.survival = [];
  return s;
}
export function writeSave(s) { const S = window.Spelhallen; if (S) S.store.set(SAVE_KEY, s); }
export function clearSave() { const S = window.Spelhallen; if (S) S.store.set(SAVE_KEY, null); }

/** Räknar ut spelarskeppets slutliga värden utifrån skepp, uppgraderingar och vapen. */
export function playerStats(save, shipId) {
  const base = PLAYER_SHIPS[shipId || save.ship];
  const u = save.upgrades[base.id] || {};
  const m = 1 + 0.06 * (u.motor || 0);
  const prim = PRIMARY[save.primary], sec = SECONDARY[save.secondary];
  const st = Object.assign({}, base, {
    turn: { pitch: base.turn.pitch * (1 + 0.05 * (u.motor || 0)), yaw: base.turn.yaw * (1 + 0.05 * (u.motor || 0)), roll: base.turn.roll * (1 + 0.04 * (u.motor || 0)) },
    speed: base.speed * m, boost: base.boost * m, accel: base.accel * m, energyRegen: base.energyRegen * (1 + 0.1 * (u.motor || 0)),
    shield: Math.round(base.shield * (1 + 0.15 * (u.skold || 0))), shieldRegen: base.shieldRegen * (1 + 0.15 * (u.skold || 0)),
    hull: Math.round(base.hull * (1 + 0.15 * (u.skrov || 0))),
    dmgMult: base.dmgMult * (1 + 0.1 * (u.vapen || 0)), heatMult: base.heatMult * (1 - 0.1 * (u.vapen || 0)),
    magazine: MISSILE_MAG,
    reload: Math.round(sec.reload * (base.reloadMult || 1) * (1 - 0.08 * (u.robot || 0)) * 100) / 100,
    flares: base.flares + (u.robot || 0),
    primary: prim, secondary: sec
  });
  return st;
}

/** Betyg utifrån prestation (0–100). */
export function gradeFor(p) {
  if (p >= 90) return 'S';
  if (p >= 77) return 'A';
  if (p >= 62) return 'B';
  if (p >= 45) return 'C';
  return 'D';
}
