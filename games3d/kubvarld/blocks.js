/**
 * Kubvärld – block, föremål och texturrutor. Ren datamodul (ingen three) – används av både huvudtråd och arbetare.
 */
export const CX = 16, CZ = 16, CY = 128, SEA = 46;
export const CHUNK_VOL = CX * CZ * CY;
/** index i en chunk: y<<8 | z<<4 | x */
export const cidx = (x, y, z) => (y << 8) | (z << 4) | x;

/* ---------- Texturrutor (lager i texturarrayen) ---------- */
export const TILES = [
  'missing',
  'grass_top', 'grass_side', 'dirt', 'stone', 'cobble', 'bedrock', 'sand', 'sandstone_side', 'sandstone_top', 'gravel',
  'snow', 'snow_side', 'ice', 'clay', 'peat', 'mossy_cobble',
  'spruce_log', 'spruce_log_top', 'spruce_leaves', 'birch_log', 'birch_log_top', 'birch_leaves', 'pine_log', 'pine_log_top', 'pine_leaves',
  'spruce_planks', 'birch_planks', 'pine_planks',
  'coal_ore', 'iron_ore', 'gold_ore', 'crystal_ore', 'glass', 'stone_bricks', 'bricks',
  'bench_top', 'bench_side', 'bench_front', 'furnace_side', 'furnace_front', 'furnace_lit', 'furnace_top',
  'chest_side', 'chest_front', 'chest_top', 'torch', 'torch_top', 'lantern', 'lantern_top',
  'wool_white', 'wool_blue', 'wool_yellow', 'wool_pink', 'wool_red', 'wool_green', 'wool_black',
  'crystal_block', 'gold_block', 'iron_block',
  'tallgrass', 'fern', 'bluebell', 'buttercup', 'fireweed', 'daisy', 'lingon_bush', 'chanterelle', 'cottongrass', 'cloudberry_plant',
  'beachgrass', 'dead_bush', 'spruce_sapling', 'birch_sapling', 'pine_sapling',
  'water0', 'water1', 'water2', 'water3',
  'door_lower', 'door_upper', 'bed_head', 'bed_foot', 'bed_side', 'bed_side_head',
  // föremål
  'i_stick', 'i_coal', 'i_iron', 'i_gold', 'i_crystal', 'i_glowdust', 'i_lingon', 'i_cloudberry', 'i_chanterelle', 'i_meat', 'i_meat_cooked',
  'i_moose', 'i_moose_cooked', 'i_chanterelle_fried', 'i_door', 'i_bed', 'i_moss', 'i_shadowfur',
  'i_pick_0', 'i_axe_0', 'i_shovel_0', 'i_sword_0', 'i_pick_1', 'i_axe_1', 'i_shovel_1', 'i_sword_1',
  'i_pick_2', 'i_axe_2', 'i_shovel_2', 'i_sword_2', 'i_pick_3', 'i_axe_3', 'i_shovel_3', 'i_sword_3'
];
export const TILE = Object.fromEntries(TILES.map((n, i) => [n, i]));

/* ---------- Block ---------- */
// modeller
export const M_NONE = 0, M_CUBE = 1, M_CROSS = 2, M_BOX = 3, M_LIQUID = 4;
// flaggor i vertexdata
export const F_WAVE = 8, F_LEAF = 16, F_LIQUID = 32, F_TINT = 64;

export const BLOCKS = [];
export const B = {};
const D = (id, key, name, o = {}) => {
  const d = Object.assign({
    id, key, name, model: M_CUBE, solid: true, opaque: true, att: 0, light: 0, hardness: 1, tool: null, tier: -1,
    drop: id, sound: 'stone', pass: 0, cullSelf: false, replace: false, gravity: false, creative: true, boxes: null,
    tex: null, flags: 0, selBox: null, food: 0, fuel: 0, interact: null
  }, o);
  BLOCKS[id] = d; B[key] = id; return d;
};
const T6 = (all) => [all, all, all, all, all, all];
// ordning: +x, -x, +y, -y, +z, -z
const TS = (top, side, bottom) => [side, side, top, bottom || top, side, side];

D(0, 'air', 'Luft', { model: M_NONE, solid: false, opaque: false, creative: false, hardness: 0, drop: 0, replace: true });
D(1, 'grass', 'Gräs', { tex: TS('grass_top', 'grass_side', 'dirt'), hardness: 0.6, tool: 'shovel', drop: 2, sound: 'grass', tintTop: true });
D(2, 'dirt', 'Jord', { tex: T6('dirt'), hardness: 0.5, tool: 'shovel', sound: 'dirt' });
D(3, 'stone', 'Sten', { tex: T6('stone'), hardness: 1.5, tool: 'pick', tier: 0, drop: 4 });
D(4, 'cobble', 'Kullersten', { tex: T6('cobble'), hardness: 2, tool: 'pick', tier: 0 });
D(5, 'bedrock', 'Berggrund', { tex: T6('bedrock'), hardness: -1, creative: true });
D(6, 'sand', 'Sand', { tex: T6('sand'), hardness: 0.5, tool: 'shovel', sound: 'sand', gravity: true });
D(7, 'sandstone', 'Sandsten', { tex: TS('sandstone_top', 'sandstone_side'), hardness: 0.8, tool: 'pick', tier: 0 });
D(8, 'gravel', 'Grus', { tex: T6('gravel'), hardness: 0.6, tool: 'shovel', sound: 'sand', gravity: true });
D(9, 'snow', 'Snö', { tex: T6('snow'), hardness: 0.2, tool: 'shovel', sound: 'snow' });
D(10, 'snowgrass', 'Snötäckt gräs', { tex: TS('snow', 'snow_side', 'dirt'), hardness: 0.6, tool: 'shovel', drop: 2, sound: 'snow' });
D(11, 'ice', 'Is', { tex: T6('ice'), hardness: 0.5, tool: 'pick', opaque: false, att: 1, pass: 1, cullSelf: true, sound: 'glass' });
D(12, 'clay', 'Lera', { tex: T6('clay'), hardness: 0.6, tool: 'shovel', sound: 'dirt' });
D(13, 'peat', 'Torv', { tex: T6('peat'), hardness: 0.5, tool: 'shovel', sound: 'dirt', fuel: 40 });
D(14, 'mossy_cobble', 'Mossig sten', { tex: T6('mossy_cobble'), hardness: 2, tool: 'pick', tier: 0 });
D(15, 'spruce_log', 'Granstam', { tex: TS('spruce_log_top', 'spruce_log'), hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
D(16, 'spruce_leaves', 'Granris', { tex: T6('spruce_leaves'), hardness: 0.2, tool: 'axe', opaque: false, att: 1, sound: 'leaves', drop: -1, flags: F_LEAF | F_TINT });
D(17, 'birch_log', 'Björkstam', { tex: TS('birch_log_top', 'birch_log'), hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
D(18, 'birch_leaves', 'Björklöv', { tex: T6('birch_leaves'), hardness: 0.2, tool: 'axe', opaque: false, att: 1, sound: 'leaves', drop: -1, flags: F_LEAF | F_TINT });
D(19, 'pine_log', 'Tallstam', { tex: TS('pine_log_top', 'pine_log'), hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
D(20, 'pine_leaves', 'Tallbarr', { tex: T6('pine_leaves'), hardness: 0.2, tool: 'axe', opaque: false, att: 1, sound: 'leaves', drop: -1, flags: F_LEAF | F_TINT });
D(21, 'spruce_planks', 'Granplankor', { tex: T6('spruce_planks'), hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
D(22, 'birch_planks', 'Björkplankor', { tex: T6('birch_planks'), hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
D(23, 'pine_planks', 'Tallplankor', { tex: T6('pine_planks'), hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
D(24, 'coal_ore', 'Kolmalm', { tex: T6('coal_ore'), hardness: 3, tool: 'pick', tier: 0, drop: 257 });
D(25, 'iron_ore', 'Järnmalm', { tex: T6('iron_ore'), hardness: 3, tool: 'pick', tier: 1 });
D(26, 'gold_ore', 'Guldmalm', { tex: T6('gold_ore'), hardness: 3, tool: 'pick', tier: 2 });
D(27, 'crystal_ore', 'Kristallmalm', { tex: T6('crystal_ore'), hardness: 3, tool: 'pick', tier: 2, drop: 260, light: 7 });
D(28, 'glass', 'Glas', { tex: T6('glass'), hardness: 0.3, opaque: false, cullSelf: true, sound: 'glass', drop: 0 });
D(29, 'stone_bricks', 'Stenkloss', { tex: T6('stone_bricks'), hardness: 1.5, tool: 'pick', tier: 0 });
D(30, 'bricks', 'Tegel', { tex: T6('bricks'), hardness: 2, tool: 'pick', tier: 0 });
D(31, 'workbench', 'Arbetsbänk', { tex: [ 'bench_side', 'bench_side', 'bench_top', 'spruce_planks', 'bench_front', 'bench_front' ], hardness: 2.5, tool: 'axe', sound: 'wood', interact: 'bench', fuel: 15 });
D(32, 'furnace', 'Ugn', { tex: ['furnace_side', 'furnace_side', 'furnace_top', 'furnace_top', 'furnace_front', 'furnace_front'], hardness: 3.5, tool: 'pick', tier: 0, interact: 'furnace' });
D(33, 'furnace_lit', 'Tänd ugn', { tex: ['furnace_side', 'furnace_side', 'furnace_top', 'furnace_top', 'furnace_lit', 'furnace_lit'], hardness: 3.5, tool: 'pick', tier: 0, interact: 'furnace', drop: 32, light: 13, creative: false });
D(34, 'chest', 'Kista', { tex: ['chest_side', 'chest_side', 'chest_top', 'chest_top', 'chest_front', 'chest_front'], hardness: 2.5, tool: 'axe', sound: 'wood', interact: 'chest' });
const TORCH_BOX = [[7, 0, 7, 9, 10, 9]];
D(35, 'torch', 'Fackla', { tex: ['torch', 'torch', 'torch_top', 'torch', 'torch', 'torch'], model: M_BOX, boxes: TORCH_BOX, solid: false, opaque: false, hardness: 0, light: 14, sound: 'wood', selBox: [6, 0, 6, 10, 11, 10] });
// väggfacklor: 36 +x-vägg (står mot väst-sidan?) – fästs mot blocket i riktning f
const WT = [
  [[14, 3, 7, 16, 13, 9]], // fäst mot +x
  [[0, 3, 7, 2, 13, 9]],   // fäst mot -x
  [[7, 3, 14, 9, 13, 16]], // fäst mot +z
  [[7, 3, 0, 9, 13, 2]]    // fäst mot -z
];
for (let i = 0; i < 4; i++) {
  const b = WT[i][0];
  D(36 + i, 'wall_torch_' + i, 'Fackla', { tex: ['torch', 'torch', 'torch_top', 'torch', 'torch', 'torch'], model: M_BOX, boxes: WT[i], vOff: 3, solid: false, opaque: false, hardness: 0, light: 14, sound: 'wood', drop: 35, creative: false, selBox: [b[0] - 1, b[1], b[2] - 1, b[3] + 1, b[4] + 1, b[5] + 1].map((v, k) => Math.max(0, Math.min(16, v))) });
}
D(40, 'lantern', 'Lykta', { tex: ['lantern', 'lantern', 'lantern_top', 'lantern_top', 'lantern', 'lantern'], model: M_BOX, boxes: [[4, 0, 4, 12, 9, 12], [6, 9, 6, 10, 11, 10]], opaque: false, hardness: 1, tool: 'pick', light: 15, sound: 'metal', selBox: [4, 0, 4, 12, 11, 12] });
const WOOL = [['white', 'Vit ull'], ['blue', 'Blå ull'], ['yellow', 'Gul ull'], ['pink', 'Rosa ull'], ['red', 'Röd ull'], ['green', 'Grön ull'], ['black', 'Svart ull']];
WOOL.forEach(([c, n], i) => D(41 + i, 'wool_' + c, n, { tex: T6('wool_' + c), hardness: 0.8, sound: 'wool', fuel: 5 }));
D(48, 'crystal_block', 'Kristallblock', { tex: T6('crystal_block'), hardness: 1.5, tool: 'pick', tier: 0, light: 12, sound: 'glass' });
D(49, 'gold_block', 'Guldblock', { tex: T6('gold_block'), hardness: 4, tool: 'pick', tier: 2, sound: 'metal' });
const PLANT = (id, key, name, tile, o = {}) => D(id, key, name, Object.assign({ tex: T6(tile), model: M_CROSS, solid: false, opaque: false, hardness: 0, sound: 'grass', flags: F_WAVE, selBox: [3, 0, 3, 13, 13, 13] }, o));
PLANT(50, 'tallgrass', 'Gräs', 'tallgrass', { replace: true, drop: -1, flags: F_WAVE | F_TINT });
PLANT(51, 'fern', 'Ormbunke', 'fern', { replace: true, drop: -1, flags: F_WAVE | F_TINT });
PLANT(52, 'bluebell', 'Blåklocka', 'bluebell');
PLANT(53, 'buttercup', 'Smörblomma', 'buttercup');
PLANT(54, 'fireweed', 'Mjölkört', 'fireweed');
PLANT(55, 'daisy', 'Prästkrage', 'daisy');
PLANT(56, 'lingon_bush', 'Lingonris', 'lingon_bush', { drop: 262 });
PLANT(57, 'chanterelle', 'Kantarell', 'chanterelle', { drop: 264, flags: 0, selBox: [4, 0, 4, 12, 8, 12] });
PLANT(58, 'cottongrass', 'Ängsull', 'cottongrass');
PLANT(59, 'cloudberry_plant', 'Hjortronplanta', 'cloudberry_plant', { drop: 263 });
PLANT(60, 'beachgrass', 'Strandråg', 'beachgrass', { replace: true, drop: -1 });
PLANT(61, 'dead_bush', 'Torrbuske', 'dead_bush', { replace: true, drop: 256, flags: 0 });
PLANT(62, 'spruce_sapling', 'Granplanta', 'spruce_sapling', { fuel: 5 });
PLANT(63, 'birch_sapling', 'Björkplanta', 'birch_sapling', { fuel: 5 });
PLANT(64, 'pine_sapling', 'Tallplanta', 'pine_sapling', { fuel: 5 });
D(65, 'water', 'Vatten', { tex: T6('water0'), model: M_LIQUID, solid: false, opaque: false, att: 1, pass: 1, hardness: -1, replace: true, drop: 0, sound: 'water', flags: F_LIQUID, creative: true });
for (let l = 1; l <= 7; l++) D(65 + l, 'water_' + l, 'Vatten', { tex: T6('water0'), model: M_LIQUID, solid: false, opaque: false, att: 1, pass: 1, hardness: -1, replace: true, drop: 0, sound: 'water', flags: F_LIQUID, creative: false });
export const WATER = 65;
export const isWater = id => id >= 65 && id <= 72;
export const waterLevel = id => id - 65; // 0 = källa

// Dörrar 73..88: (övre?8:0) + (öppen?4:0) + riktning
const SLAB = [[0, 0, 0, 16, 16, 3], [13, 0, 0, 16, 16, 16], [0, 0, 13, 16, 16, 16], [0, 0, 0, 3, 16, 16]];
export const DOOR0 = 73;
for (let i = 0; i < 16; i++) {
  const f = i & 3, open = (i >> 2) & 1, upper = (i >> 3) & 1;
  const box = SLAB[open ? (f + 1) & 3 : f];
  D(DOOR0 + i, 'door_' + i, 'Dörr', { tex: T6(upper ? 'door_upper' : 'door_lower'), model: M_BOX, boxes: [box], opaque: false, solid: !open, hardness: 3, tool: 'axe', sound: 'wood', drop: 269, creative: false, interact: 'door', door: { f, open, upper } });
}
export const isDoor = id => id >= DOOR0 && id < DOOR0 + 16;
// Sängar 89..96: (huvud?4:0) + riktning
export const BED0 = 89;
for (let i = 0; i < 8; i++) {
  const f = i & 3, head = (i >> 2) & 1;
  D(BED0 + i, 'bed_' + i, 'Säng', { tex: [head ? 'bed_side_head' : 'bed_side', head ? 'bed_side_head' : 'bed_side', head ? 'bed_head' : 'bed_foot', 'spruce_planks', head ? 'bed_side_head' : 'bed_side', head ? 'bed_side_head' : 'bed_side'], model: M_BOX, boxes: [[0, 0, 0, 16, 9, 16]], topRot: f, opaque: false, hardness: 0.3, sound: 'wool', drop: 270, creative: false, interact: 'bed', bed: { f, head } });
}
export const isBed = id => id >= BED0 && id < BED0 + 8;
D(97, 'cobble_slab', 'Kullerstensplatta', { tex: T6('cobble'), model: M_BOX, boxes: [[0, 0, 0, 16, 8, 16]], opaque: false, hardness: 2, tool: 'pick', tier: 0 });
D(98, 'plank_slab', 'Plankplatta', { tex: T6('spruce_planks'), model: M_BOX, boxes: [[0, 0, 0, 16, 8, 16]], opaque: false, hardness: 2, tool: 'axe', sound: 'wood', fuel: 8 });
D(99, 'iron_block', 'Järnblock', { tex: T6('iron_block'), hardness: 4, tool: 'pick', tier: 1, sound: 'metal' });
export const NUM_BLOCKS = 100;

// Fyll tomma id:n med luft-liknande så att tabeller blir kompletta
for (let i = 0; i < 256; i++) if (!BLOCKS[i]) BLOCKS[i] = null;

/* ---------- Tabeller för arbetaren ---------- */
export const T_OPAQUE = new Uint8Array(256), T_ATT = new Uint8Array(256), T_EMIT = new Uint8Array(256), T_MODEL = new Uint8Array(256),
  T_CULLSELF = new Uint8Array(256), T_PASS = new Uint8Array(256), T_FLAGS = new Uint8Array(256), T_SOLID = new Uint8Array(256),
  T_FACE = new Uint8Array(256 * 6), T_TINTTOP = new Uint8Array(256);
export const T_BOXES = [];
for (let i = 0; i < 256; i++) {
  const d = BLOCKS[i];
  if (!d) continue;
  T_OPAQUE[i] = d.opaque && d.model === M_CUBE ? 1 : 0;
  T_ATT[i] = d.att; T_EMIT[i] = d.light; T_MODEL[i] = d.model; T_CULLSELF[i] = d.cullSelf ? 1 : 0; T_PASS[i] = d.pass; T_FLAGS[i] = d.flags;
  T_SOLID[i] = d.solid ? 1 : 0; T_TINTTOP[i] = d.tintTop ? 1 : 0;
  if (d.tex) for (let f = 0; f < 6; f++) T_FACE[i * 6 + f] = TILE[d.tex[f]] || 0;
  if (d.boxes) T_BOXES[i] = { boxes: d.boxes, vOff: d.vOff || 0, topRot: d.topRot || 0 };
}

/* ---------- Föremål (id >= 256) ---------- */
export const ITEMS = [];
export const I = {};
const It = (id, key, name, tile, o = {}) => { const d = Object.assign({ id, key, name, tile, stack: 64, food: 0, fuel: 0, tool: null, place: 0 }, o); ITEMS[id] = d; I[key] = id; return d; };
It(256, 'stick', 'Pinne', 'i_stick', { fuel: 5 });
It(257, 'coal', 'Kol', 'i_coal', { fuel: 80 });
It(258, 'iron_ingot', 'Järntacka', 'i_iron');
It(259, 'gold_ingot', 'Guldtacka', 'i_gold');
It(260, 'crystal', 'Kristall', 'i_crystal');
It(261, 'glowdust', 'Glimtstoft', 'i_glowdust');
It(262, 'lingon', 'Lingon', 'i_lingon', { food: 2 });
It(263, 'cloudberry', 'Hjortron', 'i_cloudberry', { food: 3 });
It(264, 'chanterelle_item', 'Kantarell', 'i_chanterelle', { food: 2, place: 57 });
It(265, 'meat', 'Rått kött', 'i_meat', { food: 2 });
It(266, 'meat_cooked', 'Stekt kött', 'i_meat_cooked', { food: 7 });
It(267, 'moose', 'Rå älgstek', 'i_moose', { food: 3 });
It(268, 'moose_cooked', 'Älgstek', 'i_moose_cooked', { food: 9 });
It(269, 'door', 'Dörr', 'i_door', { stack: 16, fuel: 10 });
It(270, 'bed', 'Säng', 'i_bed', { stack: 1 });
It(271, 'chanterelle_fried', 'Stekt kantarell', 'i_chanterelle_fried', { food: 6 });
It(272, 'moss', 'Mossa', 'i_moss');
It(273, 'shadowfur', 'Skuggskinn', 'i_shadowfur');
export const TIER_NAMES = ['Trä', 'Sten', 'Järn', 'Kristall'];
const TOOL_TYPES = [['pick', 'hacka'], ['axe', 'yxa'], ['shovel', 'spade'], ['sword', 'svärd']];
const TOOL_SPEED = [2, 4, 6, 9], TOOL_DUR = [60, 132, 251, 1200];
const TOOL_DMG = { pick: [2, 3, 4, 5], axe: [3, 4, 5, 7], shovel: [1.5, 2.5, 3, 4], sword: [4, 5, 6, 8] };
export const TOOL0 = 280;
for (let t = 0; t < 4; t++) for (let k = 0; k < 4; k++) {
  const [type, sv] = TOOL_TYPES[k];
  It(TOOL0 + t * 4 + k, type + '_' + t, TIER_NAMES[t] + sv, 'i_' + type + '_' + t, { stack: 1, fuel: t === 0 ? 10 : 0, tool: { type, tier: t, speed: TOOL_SPEED[t], dur: TOOL_DUR[t], dmg: TOOL_DMG[type][t] } });
}

/* ---------- Gemensamma hjälpare ---------- */
export function isBlockId(id) { return id > 0 && id < 256; }
export function itemDef(id) { return id < 256 ? BLOCKS[id] : ITEMS[id]; }
export function itemName(id) { const d = itemDef(id); return d ? d.name : '?'; }
export function maxStack(id) { if (id < 256) return 64; const d = ITEMS[id]; return d ? d.stack : 64; }
export function toolOf(id) { return id >= 256 && ITEMS[id] ? ITEMS[id].tool : null; }
export function foodOf(id) { const d = itemDef(id); return d ? d.food || 0 : 0; }
export function fuelOf(id) { const d = itemDef(id); return d ? d.fuel || 0 : 0; }
/** Vilket block placerar föremålet? (0 = inget) */
export function placeOf(id) {
  if (id > 0 && id < 256) return BLOCKS[id] ? id : 0;
  const d = ITEMS[id]; return d ? d.place || 0 : 0;
}
export function itemTile(id) {
  if (id >= 256) { const d = ITEMS[id]; return d ? TILE[d.tile] : 0; }
  const d = BLOCKS[id]; if (!d || !d.tex) return 0;
  return TILE[d.tex[4]] || TILE[d.tex[2]] || 0;
}
/** Alla föremål som visas i kreativ-menyn, i ordning. */
export function creativeList() {
  const out = [];
  for (let i = 1; i < 256; i++) { const d = BLOCKS[i]; if (d && d.creative) out.push(i); }
  for (const k in ITEMS) out.push(+k);
  return out;
}
/** Smältrecept: insats → resultat */
export const SMELT = {
  [B.cobble]: B.stone, [B.sand]: B.glass, [B.iron_ore]: 258, [B.gold_ore]: 259, [B.clay]: B.bricks,
  [B.spruce_log]: 257, [B.birch_log]: 257, [B.pine_log]: 257, [265]: 266, [267]: 268, [264]: 271, [B.peat]: 257
};
