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
  'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'glass', 'stone_bricks', 'bricks',
  'bench_top', 'bench_side', 'bench_front', 'furnace_side', 'furnace_front', 'furnace_lit', 'furnace_top',
  'chest_side', 'chest_front', 'chest_top', 'torch', 'torch_top', 'lantern', 'lantern_top',
  'wool_white', 'wool_blue', 'wool_yellow', 'wool_pink', 'wool_red', 'wool_green', 'wool_black',
  'diamond_block', 'gold_block', 'iron_block',
  'tallgrass', 'fern', 'bluebell', 'buttercup', 'fireweed', 'daisy', 'lingon_bush', 'chanterelle', 'cottongrass', 'cloudberry_plant',
  'beachgrass', 'dead_bush', 'spruce_sapling', 'birch_sapling', 'pine_sapling',
  'water0', 'water1', 'water2', 'water3',
  'door_lower', 'door_upper', 'bed_head', 'bed_foot', 'bed_side', 'bed_side_head',
  // utökning 2: ek, stjälkar, fällucka, gnistkretsar
  'oak_log', 'oak_log_top', 'oak_leaves', 'oak_planks', 'oak_sapling', 'stem0', 'stem1', 'stem2', 'stem3', 'trapdoor',
  'spark_ore', 'wire_0', 'wire_1', 'wire_2', 'wire_3', 'spark_torch', 'spark_torch_off', 'spark_torch_top', 'spark_torch_top_off',
  'repeater_top', 'repeater_top_on', 'repeater_side', 'lamp', 'lamp_on', 'piston_side', 'piston_front', 'piston_back', 'piston_sticky_front',
  'dispenser_front', 'observer_front', 'observer_back', 'observer_side', 'observer_top', 'daylight_top', 'note_block', 'button',
  // föremål
  'i_stick', 'i_coal', 'i_iron', 'i_gold', 'i_diamond', 'i_bone_meal', 'i_lingon', 'i_cloudberry', 'i_chanterelle', 'i_meat', 'i_meat_cooked',
  'i_pork', 'i_pork_cooked', 'i_chanterelle_fried', 'i_door', 'i_bed', 'i_string', 'i_leather',
  'i_chicken', 'i_chicken_cooked', 'i_feather', 'i_egg', 'i_egg_fried', 'i_rotten', 'i_bone', 'i_arrow', 'i_bow',
  // utökning: byggblock, odling, funktioner
  'smooth_stone', 'smooth_stone_top', 'obsidian', 'terracotta', 'packed_ice', 'bookshelf', 'barrel_side', 'barrel_top', 'tnt_side', 'tnt_top', 'tnt_bottom',
  'anvil', 'farmland', 'wheat0', 'wheat1', 'wheat2', 'wheat3', 'carrot0', 'carrot1', 'carrot2', 'potato0', 'potato1', 'potato2', 'reed',
  'pumpkin_side', 'pumpkin_top', 'jack_face', 'melon_side', 'melon_top', 'candle', 'flowerpot', 'flowerpot_top',
  'wool_orange', 'wool_purple', 'wool_lightblue', 'wool_grey', 'wool_brown', 'ladder', 'painting', 'lever', 'lava', 'emerald_ore', 'emerald_block',
  'i_seeds', 'i_wheat', 'i_bread', 'i_carrot', 'i_potato', 'i_potato_baked', 'i_apple', 'i_paper', 'i_melon', 'i_pie',
  'i_bucket', 'i_bucket_water', 'i_bucket_lava', 'i_bucket_milk', 'i_emerald', 'i_shears', 'i_compass', 'i_clock', 'i_rod', 'i_fish', 'i_fish_cooked',
  'i_helmet_0', 'i_chest_0', 'i_legs_0', 'i_boots_0', 'i_helmet_1', 'i_chest_1', 'i_legs_1', 'i_boots_1',
  'i_helmet_2', 'i_chest_2', 'i_legs_2', 'i_boots_2', 'i_helmet_3', 'i_chest_3', 'i_legs_3', 'i_boots_3',
  'i_pick_0', 'i_axe_0', 'i_shovel_0', 'i_sword_0', 'i_pick_1', 'i_axe_1', 'i_shovel_1', 'i_sword_1',
  'i_pick_2', 'i_axe_2', 'i_shovel_2', 'i_sword_2', 'i_pick_3', 'i_axe_3', 'i_shovel_3', 'i_sword_3',
  'i_pick_4', 'i_axe_4', 'i_shovel_4', 'i_sword_4', 'i_hoe_0', 'i_hoe_1', 'i_hoe_2', 'i_hoe_3', 'i_hoe_4',
  'i_shield', 'i_pumpkin_seeds', 'i_melon_seeds', 'i_spark_dust'
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
D(27, 'diamond_ore', 'Diamantmalm', { tex: T6('diamond_ore'), hardness: 3.5, tool: 'pick', tier: 2, drop: 260, light: 3 });
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
D(48, 'diamond_block', 'Diamantblock', { tex: T6('diamond_block'), hardness: 5, tool: 'pick', tier: 2, light: 4, sound: 'glass' });
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
/* ---------- utökning (id 100–174) ---------- */
const PK = { tool: 'pick', tier: 0 };
D(100, 'smooth_stone', 'Slät sten', Object.assign({ tex: TS('smooth_stone_top', 'smooth_stone'), hardness: 2 }, PK));
D(101, 'obsidian', 'Obsidian', { tex: T6('obsidian'), hardness: 14, tool: 'pick', tier: 3 });
D(102, 'terracotta', 'Terrakotta', Object.assign({ tex: T6('terracotta'), hardness: 1.4 }, PK));
D(103, 'packed_ice', 'Packad is', { tex: T6('packed_ice'), hardness: 0.6, tool: 'pick', sound: 'glass' });
D(104, 'bookshelf', 'Bokhylla', { tex: ['bookshelf', 'bookshelf', 'spruce_planks', 'spruce_planks', 'bookshelf', 'bookshelf'], hardness: 1.5, tool: 'axe', sound: 'wood', fuel: 15 });
D(105, 'barrel', 'Tunna', { tex: TS('barrel_top', 'barrel_side'), hardness: 2.5, tool: 'axe', sound: 'wood', interact: 'chest', fuel: 15 });
D(106, 'tnt', 'TNT', { tex: TS('tnt_top', 'tnt_side', 'tnt_bottom'), hardness: 0, sound: 'grass', interact: 'tnt' });
D(107, 'anvil', 'Städ', { tex: T6('anvil'), model: M_BOX, boxes: [[2, 0, 2, 14, 4, 14], [5, 4, 4, 11, 10, 12], [1, 10, 3, 15, 16, 13]], opaque: false, hardness: 5, tool: 'pick', tier: 0, sound: 'metal', interact: 'anvil' });
D(108, 'farmland', 'Åkerjord', { tex: ['dirt', 'dirt', 'farmland', 'dirt', 'dirt', 'dirt'], model: M_BOX, boxes: [[0, 0, 0, 16, 15, 16]], opaque: false, hardness: 0.6, tool: 'shovel', sound: 'dirt', drop: 2 });
const CROP = (id, key, name, tile, kind, stage, max) => PLANT(id, key, name, tile, { drop: -1, creative: false, flags: F_WAVE, crop: { kind, stage, max }, selBox: [2, 0, 2, 14, 4 + stage * 3, 14] });
for (let s = 0; s < 4; s++) CROP(109 + s, 'wheat_' + s, 'Vete', 'wheat' + s, 'wheat', s, 3);
for (let s = 0; s < 3; s++) CROP(113 + s, 'carrot_' + s, 'Morötter', 'carrot' + s, 'carrot', s, 2);
for (let s = 0; s < 3; s++) CROP(116 + s, 'potato_' + s, 'Potatis', 'potato' + s, 'potato', s, 2);
PLANT(119, 'reed', 'Vass', 'reed', { flags: 0, selBox: [2, 0, 2, 14, 16, 14] });
D(120, 'pumpkin', 'Pumpa', { tex: TS('pumpkin_top', 'pumpkin_side'), hardness: 1, tool: 'axe', sound: 'wood' });
D(121, 'jack', 'Lyktgubbe', { tex: ['jack_face', 'jack_face', 'pumpkin_top', 'pumpkin_top', 'jack_face', 'jack_face'], hardness: 1, tool: 'axe', sound: 'wood', light: 15 });
D(122, 'melon', 'Melon', { tex: TS('melon_top', 'melon_side'), hardness: 1, tool: 'axe', sound: 'wood', drop: 308 });
D(123, 'candle', 'Stearinljus', { tex: T6('candle'), model: M_BOX, boxes: [[6, 0, 6, 10, 8, 10], [7, 8, 7, 9, 10, 9]], solid: false, opaque: false, hardness: 0, light: 11, sound: 'wool', selBox: [5, 0, 5, 11, 10, 11] });
D(124, 'flowerpot', 'Blomkruka', { tex: ['flowerpot', 'flowerpot', 'flowerpot_top', 'flowerpot', 'flowerpot', 'flowerpot'], model: M_BOX, boxes: [[5, 0, 5, 11, 6, 11], [7, 6, 7, 9, 11, 9], [6, 10, 6, 10, 14, 10]], opaque: false, hardness: 0.3, sound: 'stone', selBox: [5, 0, 5, 11, 14, 11] });
const WOOL_C = [['white', 'Vit'], ['blue', 'Blå'], ['yellow', 'Gul'], ['pink', 'Rosa'], ['red', 'Röd'], ['green', 'Grön'], ['black', 'Svart']];
WOOL_C.forEach(([c, n], i) => D(125 + i, 'carpet_' + c, n + ' matta', { tex: T6('wool_' + c), model: M_BOX, boxes: [[0, 0, 0, 16, 1, 16]], opaque: false, hardness: 0.1, sound: 'wool', fuel: 3 }));
[['orange', 'Orange ull'], ['purple', 'Lila ull'], ['lightblue', 'Ljusblå ull'], ['grey', 'Grå ull'], ['brown', 'Brun ull']].forEach(([c, n], i) => D(132 + i, 'wool_' + c, n, { tex: T6('wool_' + c), hardness: 0.8, sound: 'wool', fuel: 5 }));
D(137, 'fence', 'Staket', { tex: T6('spruce_planks'), model: M_BOX, boxes: [[6, 0, 6, 10, 16, 10], [0, 6, 7, 16, 9, 9], [7, 6, 0, 9, 9, 16], [0, 12, 7, 16, 15, 9], [7, 12, 0, 9, 15, 16]], opaque: false, hardness: 2, tool: 'axe', sound: 'wood', fuel: 8, conn: 1 });
// väggfästa tunna block (stege, tavla): 0 fäst mot +x, 1 mot -x, 2 mot +z, 3 mot -z
const WALL = [[[15, 0, 0, 16, 16, 16]], [[0, 0, 0, 1, 16, 16]], [[0, 0, 15, 16, 16, 16]], [[0, 0, 0, 16, 16, 1]]];
for (let i = 0; i < 4; i++) D(138 + i, 'ladder_' + i, 'Stege', { tex: T6('ladder'), model: M_BOX, boxes: WALL[i], solid: false, opaque: false, hardness: 0.5, tool: 'axe', sound: 'wood', drop: 138, creative: i === 0, climb: true, wall: i, fuel: 4 });
D(142, 'glass_pane', 'Glasruta', { tex: T6('glass'), model: M_BOX, boxes: [[0, 0, 7, 16, 16, 9]], opaque: false, hardness: 0.3, sound: 'glass', drop: 0 });
D(143, 'glass_pane_1', 'Glasruta', { tex: T6('glass'), model: M_BOX, boxes: [[7, 0, 0, 9, 16, 16]], opaque: false, hardness: 0.3, sound: 'glass', drop: 0, creative: false });
// trappor: 4 material × 4 riktningar (övre halvan bort från spelaren)
const STAIR_UP = [[0, 8, 0, 16, 16, 8], [8, 8, 0, 16, 16, 16], [0, 8, 8, 16, 16, 16], [0, 8, 0, 8, 16, 16]];
export const STAIR0 = 144;
[['cobble', 'Kullerstenstrappa', T6('cobble'), 'pick', 'stone'], ['plank', 'Plankstrappa', T6('spruce_planks'), 'axe', 'wood'], ['brick', 'Stenklosstrappa', T6('stone_bricks'), 'pick', 'stone'], ['sandstone', 'Sandstenstrappa', TS('sandstone_top', 'sandstone_side'), 'pick', 'stone']].forEach(([k, n, tex, tool, sound], m) => {
  for (let f = 0; f < 4; f++) D(STAIR0 + m * 4 + f, k + '_stairs_' + f, n, { tex, model: M_BOX, boxes: [[0, 0, 0, 16, 8, 16], STAIR_UP[f]], opaque: false, hardness: 2, tool, tier: tool === 'pick' ? 0 : -1, sound, drop: STAIR0 + m * 4, creative: f === 0, stair: f, fuel: tool === 'axe' ? 8 : 0 });
});
export const isStair = id => id >= STAIR0 && id < STAIR0 + 16;
D(160, 'brick_slab', 'Stenklossplatta', { tex: T6('stone_bricks'), model: M_BOX, boxes: [[0, 0, 0, 16, 8, 16]], opaque: false, hardness: 2, tool: 'pick', tier: 0, full: 29 });
D(161, 'sandstone_slab', 'Sandstensplatta', { tex: TS('sandstone_top', 'sandstone_side'), model: M_BOX, boxes: [[0, 0, 0, 16, 8, 16]], opaque: false, hardness: 1, tool: 'pick', tier: 0, full: 7 });
D(162, 'smooth_slab', 'Slät stenplatta', { tex: TS('smooth_stone_top', 'smooth_stone'), model: M_BOX, boxes: [[0, 0, 0, 16, 8, 16]], opaque: false, hardness: 2, tool: 'pick', tier: 0, full: 100 });
const PWALL = [[[15, 1, 1, 16, 15, 15]], [[0, 1, 1, 1, 15, 15]], [[1, 1, 15, 15, 15, 16]], [[1, 1, 0, 15, 15, 1]]];
for (let i = 0; i < 4; i++) D(163 + i, 'painting_' + i, 'Tavla', { tex: T6('painting'), model: M_BOX, boxes: PWALL[i], solid: false, opaque: false, hardness: 0.3, sound: 'wood', drop: 163, creative: i === 0, wall: i, fuel: 4 });
D(167, 'lever', 'Spak', { tex: T6('lever'), model: M_BOX, boxes: [[5, 0, 4, 11, 2, 12], [7, 2, 4, 9, 9, 6]], solid: false, opaque: false, hardness: 0.5, sound: 'wood', interact: 'lever', selBox: [5, 0, 4, 11, 9, 12] });
D(168, 'lever_on', 'Spak', { tex: T6('lever'), model: M_BOX, boxes: [[5, 0, 4, 11, 2, 12], [7, 2, 10, 9, 9, 12]], solid: false, opaque: false, hardness: 0.5, sound: 'wood', interact: 'lever', drop: 167, creative: false, selBox: [5, 0, 4, 11, 9, 12] });
export const LAVA = 169;
for (let l = 0; l < 4; l++) D(LAVA + l, l ? 'lava_' + l : 'lava', 'Lava', { tex: T6('lava'), model: M_BOX, boxes: [[0, 0, 0, 16, [15, 12, 9, 6][l], 16]], solid: false, opaque: false, light: 15, hardness: -1, drop: 0, sound: 'water', creative: l === 0, lava: l });
export const isLava = id => id >= LAVA && id <= LAVA + 3;
D(173, 'emerald_ore', 'Smaragdmalm', { tex: T6('emerald_ore'), hardness: 3, tool: 'pick', tier: 2, drop: 314 });
D(174, 'emerald_block', 'Smaragdblock', { tex: T6('emerald_block'), hardness: 5, tool: 'pick', tier: 2, sound: 'metal' });

/* ---------- utökning 2 (id 175–252): ek, stjälkar, fällucka, knapp, grind, gnistkretsar ---------- */
D(175, 'oak_log', 'Ekstam', { tex: TS('oak_log_top', 'oak_log'), hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
D(176, 'oak_leaves', 'Eklöv', { tex: T6('oak_leaves'), hardness: 0.2, tool: 'axe', opaque: false, att: 1, sound: 'leaves', drop: -1, flags: F_LEAF | F_TINT });
D(177, 'oak_planks', 'Ekplankor', { tex: T6('oak_planks'), hardness: 2, tool: 'axe', sound: 'wood', fuel: 15 });
PLANT(178, 'oak_sapling', 'Ekplanta', 'oak_sapling', { fuel: 5 });
// stjälkar: pumpa 179–182, melon 183–186 (växer på åkerjord, mogen stjälk sätter frukt bredvid sig)
for (let s = 0; s < 4; s++) CROP(179 + s, 'pumpkin_stem_' + s, 'Pumpastjälk', 'stem' + s, 'pumpkin', s, 3);
for (let s = 0; s < 4; s++) CROP(183 + s, 'melon_stem_' + s, 'Melonstjälk', 'stem' + s, 'melon', s, 3);
// fällucka 187–194: riktning (gångjärnssida) + (öppen ? 4 : 0)
export const TRAP0 = 187;
const TRAP_OPEN = [[[13, 0, 0, 16, 16, 16]], [[0, 0, 0, 3, 16, 16]], [[0, 0, 13, 16, 16, 16]], [[0, 0, 0, 16, 16, 3]]];
for (let i = 0; i < 8; i++) {
  const f = i & 3, open = i >> 2;
  D(TRAP0 + i, 'trapdoor_' + i, 'Fällucka', { tex: T6('trapdoor'), model: M_BOX, boxes: open ? TRAP_OPEN[f] : [[0, 0, 0, 16, 3, 16]], opaque: false, hardness: 3, tool: 'axe', sound: 'wood', drop: TRAP0, creative: i === 0, interact: 'trapdoor', trap: { f, open }, climb: !!open, fuel: 8, powerable: true });
}
export const isTrap = id => id >= TRAP0 && id < TRAP0 + 8;
// knapp 195–199: 0–3 på vägg (samma konvention som stegen), 4 på golvet
export const BUTTON0 = 195;
const BTN = [[[14, 6, 5, 16, 10, 11]], [[0, 6, 5, 2, 10, 11]], [[5, 6, 14, 11, 10, 16]], [[5, 6, 0, 11, 10, 2]], [[5, 0, 6, 11, 2, 10]]];
for (let i = 0; i < 5; i++) D(BUTTON0 + i, 'button_' + i, 'Knapp', { tex: T6('button'), model: M_BOX, boxes: BTN[i], selBox: BTN[i][0].map((v, k) => k < 3 ? Math.max(0, v - 1) : Math.min(16, v + 1)), solid: false, opaque: false, hardness: 0.5, tool: 'pick', sound: 'stone', drop: BUTTON0, creative: i === 0, interact: 'button', wall: i < 4 ? i : undefined, attach: i < 4 ? i : 4 });
export const isButton = id => id >= BUTTON0 && id < BUTTON0 + 5;
// grind 200–203: axel (0 = spänner längs x, 1 = längs z) + (öppen ? 2 : 0)
export const GATE0 = 200;
const swapXZ = b => [b[2], b[1], b[0], b[5], b[4], b[3]];
const GATE_C = [[0, 5, 7, 2, 16, 9], [14, 5, 7, 16, 16, 9], [2, 6, 7, 14, 9, 9], [2, 12, 7, 14, 15, 9], [7, 9, 7, 9, 12, 9]];
const GATE_O = [[0, 5, 7, 2, 16, 9], [14, 5, 7, 16, 16, 9], [0, 6, 9, 2, 9, 15], [0, 12, 9, 2, 15, 15], [14, 6, 9, 16, 9, 15], [14, 12, 9, 16, 15, 15]];
for (let i = 0; i < 4; i++) {
  const ax = i & 1, open = i >> 1, bx = open ? GATE_O : GATE_C;
  D(GATE0 + i, 'gate_' + i, 'Grind', { tex: T6('spruce_planks'), model: M_BOX, boxes: ax ? bx.map(swapXZ) : bx, selBox: ax ? [7, 0, 0, 9, 16, 16] : [0, 0, 7, 16, 16, 9], solid: !open, opaque: false, hardness: 2, tool: 'axe', sound: 'wood', drop: GATE0, creative: i === 0, interact: 'gate', gate: { ax, open }, conn: 2 + ax, tall: true, fuel: 8, powerable: true });
}
export const isGate = id => id >= GATE0 && id < GATE0 + 4;
/* ----- gnistkretsar ----- */
D(204, 'spark_ore', 'Gnistmalm', { tex: T6('spark_ore'), hardness: 3, tool: 'pick', tier: 2, drop: 324, light: 4 });
// gnistdamm (ledning) 205–208: utseende efter styrka (0 = ingen, 1 = svag, 2 = medel, 3 = stark). Exakt styrka finns i kretsmotorn.
export const WIRE0 = 205;
for (let i = 0; i < 4; i++) D(WIRE0 + i, 'wire_' + i, 'Gnistledning', { tex: T6('wire_' + i), model: M_BOX, boxes: [[0, 0, 0, 16, 1, 16]], solid: false, opaque: false, hardness: 0, sound: 'stone', drop: 324, creative: false, support: true, wire: true });
export const isWire = id => id >= WIRE0 && id < WIRE0 + 4;
const STORCH = [[7, 0, 7, 9, 10, 9]];
D(209, 'spark_torch', 'Gnistfackla', { tex: ['spark_torch', 'spark_torch', 'spark_torch_top', 'spark_torch', 'spark_torch', 'spark_torch'], model: M_BOX, boxes: STORCH, solid: false, opaque: false, hardness: 0, light: 7, sound: 'wood', selBox: [6, 0, 6, 10, 11, 10], support: true, circ: 'torch' });
D(210, 'spark_torch_off', 'Gnistfackla', { tex: ['spark_torch_off', 'spark_torch_off', 'spark_torch_top_off', 'spark_torch_off', 'spark_torch_off', 'spark_torch_off'], model: M_BOX, boxes: STORCH, solid: false, opaque: false, hardness: 0, sound: 'wood', drop: 209, creative: false, selBox: [6, 0, 6, 10, 11, 10], support: true, circ: 'torch' });
export const isSparkTorch = id => id === 209 || id === 210;
// tryckplattor: sten (spelare och varelser), trä (även föremål)
D(211, 'plate_stone', 'Tryckplatta av sten', { tex: T6('smooth_stone_top'), model: M_BOX, boxes: [[1, 0, 1, 15, 1, 15]], solid: false, opaque: false, hardness: 0.5, tool: 'pick', sound: 'stone', support: true, plate: 1 });
D(212, 'plate_wood', 'Tryckplatta av trä', { tex: T6('oak_planks'), model: M_BOX, boxes: [[1, 0, 1, 15, 1, 15]], solid: false, opaque: false, hardness: 0.5, tool: 'axe', sound: 'wood', support: true, plate: 2, fuel: 5 });
// förstärkare 213–220: riktning (0 +x, 1 −x, 2 +z, 3 −z = utgång) + (på ? 4 : 0)
export const REP0 = 213;
for (let i = 0; i < 8; i++) {
  const f = i & 3, on = i >> 2;
  const top = on ? 'repeater_top_on' : 'repeater_top';
  D(REP0 + i, 'repeater_' + i, 'Förstärkare', { tex: ['repeater_side', 'repeater_side', top, 'smooth_stone_top', 'repeater_side', 'repeater_side'], model: M_BOX, boxes: [[0, 0, 0, 16, 2, 16]], topRot: [1, 3, 0, 2][f], opaque: false, hardness: 0, sound: 'stone', drop: REP0, creative: i === 0, support: true, rep: { f, on }, interact: 'repeater', light: on ? 3 : 0 });
}
export const isRep = id => id >= REP0 && id < REP0 + 8;
D(221, 'lamp', 'Gnistlampa', { tex: T6('lamp'), hardness: 0.3, sound: 'glass', powerable: true });
D(222, 'lamp_on', 'Gnistlampa', { tex: T6('lamp_on'), hardness: 0.3, sound: 'glass', drop: 221, creative: false, light: 15, powerable: true });
// kolvar: 223–228 kolv, 229–234 klisterkolv, 235–240 kolvhuvud (riktning 0 +x, 1 −x, 2 +y, 3 −y, 4 +z, 5 −z)
export const PISTON0 = 223, STICKY0 = 229, PHEAD0 = 235;
const FACE6 = (front, back, side) => [0, 1, 2, 3, 4, 5].map(f => { const t = []; for (let d = 0; d < 6; d++) t.push(d === f ? front : d === (f ^ 1) ? back : side); return t; });
const P_HEAD = [
  [[12, 0, 0, 16, 16, 16], [0, 6, 6, 12, 10, 10]], [[0, 0, 0, 4, 16, 16], [4, 6, 6, 16, 10, 10]],
  [[0, 12, 0, 16, 16, 16], [6, 0, 6, 10, 12, 10]], [[0, 0, 0, 16, 4, 16], [6, 4, 6, 10, 16, 10]],
  [[0, 0, 12, 16, 16, 16], [6, 6, 0, 10, 10, 12]], [[0, 0, 0, 16, 16, 4], [6, 6, 4, 10, 10, 16]]
];
for (let f = 0; f < 6; f++) {
  D(PISTON0 + f, 'piston_' + f, 'Kolv', { tex: FACE6('piston_front', 'piston_back', 'piston_side')[f], hardness: 1.5, tool: 'pick', drop: PISTON0, creative: f === 0, piston: { f, sticky: false }, powerable: true });
  D(STICKY0 + f, 'sticky_piston_' + f, 'Klisterkolv', { tex: FACE6('piston_sticky_front', 'piston_back', 'piston_side')[f], hardness: 1.5, tool: 'pick', drop: STICKY0, creative: f === 0, piston: { f, sticky: true }, powerable: true });
  D(PHEAD0 + f, 'piston_head_' + f, 'Kolvhuvud', { tex: FACE6('piston_front', 'piston_side', 'piston_side')[f], model: M_BOX, boxes: P_HEAD[f], opaque: false, hardness: 1.5, tool: 'pick', drop: 0, creative: false, phead: f });
}
export const isPiston = id => id >= PISTON0 && id < PISTON0 + 12;
export const isPHead = id => id >= PHEAD0 && id < PHEAD0 + 6;
// utmatare 241–244 (riktning 0 +x, 1 −x, 2 +z, 3 −z)
export const DISP0 = 241;
const SIDE4 = [0, 1, 4, 5];
for (let f = 0; f < 4; f++) D(DISP0 + f, 'dispenser_' + f, 'Utmatare', { tex: FACE6('dispenser_front', 'furnace_side', 'furnace_side')[SIDE4[f]].map((t, d) => d === 2 || d === 3 ? 'furnace_top' : t), hardness: 3.5, tool: 'pick', tier: 0, drop: DISP0, creative: f === 0, interact: 'dispenser', disp: SIDE4[f], powerable: true });
D(245, 'daylight', 'Dagsljussensor', { tex: ['repeater_side', 'repeater_side', 'daylight_top', 'oak_planks', 'repeater_side', 'repeater_side'], model: M_BOX, boxes: [[0, 0, 0, 16, 6, 16]], opaque: false, hardness: 0.3, tool: 'axe', sound: 'wood', circ: 'daylight', fuel: 8 });
D(246, 'note_block', 'Notblock', { tex: T6('note_block'), hardness: 0.8, tool: 'axe', sound: 'wood', interact: 'note', powerable: true, fuel: 15 });
// observatör 247–252: tittar åt riktning f, sänder ut puls bakåt
export const OBS0 = 247;
for (let f = 0; f < 6; f++) D(OBS0 + f, 'observer_' + f, 'Observatör', { tex: FACE6('observer_front', 'observer_back', 'observer_side')[f].map((t, d) => (d === 2 || d === 3) && f < 2 || (d === 0 || d === 1) && f >= 4 ? 'observer_top' : t), hardness: 3, tool: 'pick', tier: 0, drop: OBS0, creative: f === 0, obs: f });
export const isObs = id => id >= OBS0 && id < OBS0 + 6;
export const NUM_BLOCKS = 253;
/** Riktningar för kretsar: 0 +x, 1 −x, 2 +y, 3 −y, 4 +z, 5 −z (motsatt = d ^ 1) */
export const DIR6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// Fyll tomma id:n med luft-liknande så att tabeller blir kompletta
for (let i = 0; i < 256; i++) if (!BLOCKS[i]) BLOCKS[i] = null;

/* ---------- Tabeller för arbetaren ---------- */
export const T_OPAQUE = new Uint8Array(256), T_ATT = new Uint8Array(256), T_EMIT = new Uint8Array(256), T_MODEL = new Uint8Array(256),
  T_CULLSELF = new Uint8Array(256), T_PASS = new Uint8Array(256), T_FLAGS = new Uint8Array(256), T_SOLID = new Uint8Array(256),
  T_FACE = new Uint8Array(256 * 6), T_TINTTOP = new Uint8Array(256), T_CONN = new Uint8Array(256);
export const T_BOXES = [];
for (let i = 0; i < 256; i++) {
  const d = BLOCKS[i];
  if (!d) continue;
  T_OPAQUE[i] = d.opaque && d.model === M_CUBE ? 1 : 0;
  T_ATT[i] = d.att; T_EMIT[i] = d.light; T_MODEL[i] = d.model; T_CULLSELF[i] = d.cullSelf ? 1 : 0; T_PASS[i] = d.pass; T_FLAGS[i] = d.flags;
  T_SOLID[i] = d.solid ? 1 : 0; T_TINTTOP[i] = d.tintTop ? 1 : 0; T_CONN[i] = d.conn || 0;
  if (d.tex) for (let f = 0; f < 6; f++) T_FACE[i * 6 + f] = TILE[d.tex[f]] || 0;
  if (d.boxes) T_BOXES[i] = { boxes: d.boxes, vOff: d.vOff || 0, topRot: d.topRot || 0 };
}

/* ---------- Staket som kopplar ihop sig ---------- */
/** Kopplar ett staket i riktning k (0 +x, 1 −x, 2 +z, 3 −z) mot grannblocket n? */
export function fenceLinks(n, k) { const c = T_CONN[n]; return c === 1 || T_OPAQUE[n] === 1 || (c === 2 && k < 2) || (c === 3 && k >= 2); }
const FENCE_ARMS = [[[10, 6, 7, 16, 9, 9], [10, 12, 7, 16, 15, 9]], [[0, 6, 7, 6, 9, 9], [0, 12, 7, 6, 15, 9]], [[7, 6, 10, 9, 9, 16], [7, 12, 10, 9, 15, 16]], [[7, 6, 0, 9, 9, 6], [7, 12, 0, 9, 15, 6]]];
const FENCE_COLL = [[10, 0, 6, 16, 24, 10], [0, 0, 6, 6, 24, 10], [6, 0, 10, 10, 24, 16], [6, 0, 0, 10, 24, 6]];
const _fb = [], _fc = [], _fs = [];
/** Lådor (1/16-enheter) för staket med kopplingsmask (bit k = koppling i riktning k) */
export function fenceBoxes(mask) {
  if (!_fb[mask]) { const b = [[6, 0, 6, 10, 16, 10]]; for (let k = 0; k < 4; k++) if (mask & (1 << k)) b.push(...FENCE_ARMS[k]); _fb[mask] = b; }
  return _fb[mask];
}
/** Kollisionslådor (block-enheter, 1,5 block höga så att man inte kan hoppa över) */
export function fenceColl(mask) {
  if (!_fc[mask]) { const b = [[6, 0, 6, 10, 24, 10]]; for (let k = 0; k < 4; k++) if (mask & (1 << k)) b.push(FENCE_COLL[k]); _fc[mask] = b.map(q => q.map(v => v / 16)); }
  return _fc[mask];
}
/** Markeringslåda (en låda som omsluter staketet) */
export function fenceSel(mask) {
  if (!_fs[mask]) _fs[mask] = [[mask & 2 ? 0 : 6, 0, mask & 8 ? 0 : 6, mask & 1 ? 16 : 10, 16, mask & 4 ? 16 : 10]];
  return _fs[mask];
}

/* ---------- Föremål (id >= 256) ---------- */
export const ITEMS = [];
export const I = {};
const It = (id, key, name, tile, o = {}) => { const d = Object.assign({ id, key, name, tile, stack: 64, food: 0, fuel: 0, tool: null, place: 0 }, o); ITEMS[id] = d; I[key] = id; return d; };
It(256, 'stick', 'Pinne', 'i_stick', { fuel: 5 });
It(257, 'coal', 'Kol', 'i_coal', { fuel: 80 });
It(258, 'iron_ingot', 'Järntacka', 'i_iron');
It(259, 'gold_ingot', 'Guldtacka', 'i_gold');
// id 260 hette förr Kristall, 261 Glimtstoft, 267/268 älgstek, 272 mossa, 273 skuggskinn – id:na återanvänds så att gamla sparfiler laddas
It(260, 'diamond', 'Diamant', 'i_diamond');
It(261, 'bone_meal', 'Benmjöl', 'i_bone_meal');
It(262, 'lingon', 'Lingon', 'i_lingon', { food: 2 });
It(263, 'cloudberry', 'Hjortron', 'i_cloudberry', { food: 3 });
It(264, 'chanterelle_item', 'Kantarell', 'i_chanterelle', { food: 2, place: 57 });
It(265, 'meat', 'Rått kött', 'i_meat', { food: 2 });
It(266, 'meat_cooked', 'Stekt kött', 'i_meat_cooked', { food: 7 });
It(267, 'pork', 'Rått fläsk', 'i_pork', { food: 3 });
It(268, 'pork_cooked', 'Stekt fläsk', 'i_pork_cooked', { food: 8 });
It(269, 'door', 'Dörr', 'i_door', { stack: 16, fuel: 10 });
It(270, 'bed', 'Säng', 'i_bed', { stack: 1 });
It(271, 'chanterelle_fried', 'Stekt kantarell', 'i_chanterelle_fried', { food: 6 });
It(272, 'string', 'Tråd', 'i_string');
It(273, 'leather', 'Läder', 'i_leather');
It(274, 'chicken', 'Rå kyckling', 'i_chicken', { food: 2 });
It(275, 'chicken_cooked', 'Grillad kyckling', 'i_chicken_cooked', { food: 6 });
It(276, 'feather', 'Fjäder', 'i_feather');
It(277, 'egg', 'Ägg', 'i_egg', { stack: 16 });
It(278, 'rotten_flesh', 'Ruttet kött', 'i_rotten', { food: 2 });
It(279, 'bone', 'Ben', 'i_bone');
It(296, 'arrow', 'Pil', 'i_arrow');
It(297, 'bow', 'Båge', 'i_bow', { stack: 1, fuel: 5, tool: { type: 'bow', tier: 0, speed: 1, dur: 240, dmg: 1 } });
It(298, 'egg_fried', 'Stekt ägg', 'i_egg_fried', { food: 5, sat: 0.8 });
// utökning: odling, verktyg och utrustning (sat = mättnad per matpoäng, standard 0,6)
It(299, 'hoe', 'Stenjordhacka', 'i_hoe_1', { stack: 1, tool: { type: 'hoe', tier: 1, speed: 1, dur: 132, dmg: 1, rep: '#stone' } });
It(300, 'seeds', 'Vetefrön', 'i_seeds', { place: 109 });
It(301, 'wheat', 'Vete', 'i_wheat');
It(302, 'bread', 'Bröd', 'i_bread', { food: 5, sat: 1.2 });
It(303, 'carrot', 'Morot', 'i_carrot', { food: 3, sat: 1.2, place: 113 });
It(304, 'potato', 'Potatis', 'i_potato', { food: 1, sat: 0.3, place: 116 });
It(305, 'potato_baked', 'Bakad potatis', 'i_potato_baked', { food: 5, sat: 1.2 });
It(306, 'apple', 'Äpple', 'i_apple', { food: 4, sat: 0.6 });
It(307, 'paper', 'Papper', 'i_paper', { fuel: 2 });
It(308, 'melon_slice', 'Melonskiva', 'i_melon', { food: 2, sat: 0.3 });
It(309, 'pie', 'Pumpapaj', 'i_pie', { food: 8, sat: 0.6 });
It(310, 'bucket', 'Hink', 'i_bucket', { stack: 16 });
It(311, 'bucket_water', 'Vattenhink', 'i_bucket_water', { stack: 1 });
It(312, 'bucket_lava', 'Lavahink', 'i_bucket_lava', { stack: 1, fuel: 1000 });
It(313, 'bucket_milk', 'Mjölkhink', 'i_bucket_milk', { stack: 1, drink: 4 });
It(314, 'emerald', 'Smaragd', 'i_emerald', { desc: 'Sällsynt och värdefull – en riktig valuta. Spara dem till handel!', value: 1 });
It(315, 'shears', 'Sax', 'i_shears', { stack: 1, tool: { type: 'shears', tier: 1, speed: 1, dur: 238, dmg: 1 } });
It(316, 'compass', 'Kompass', 'i_compass', { stack: 1 });
It(317, 'clock', 'Klocka', 'i_clock', { stack: 1 });
It(318, 'rod', 'Fiskespö', 'i_rod', { stack: 1, tool: { type: 'rod', tier: 0, speed: 1, dur: 64, dmg: 1 } });
It(319, 'fish', 'Rå fisk', 'i_fish', { food: 2, sat: 0.2 });
It(320, 'fish_cooked', 'Stekt fisk', 'i_fish_cooked', { food: 6, sat: 1.0 });
It(321, 'shield', 'Sköld', 'i_shield', { stack: 1, shield: true, desc: 'Håll höger musknapp för att parera attacker och pilar framifrån. Fungerar även i andra handen (F).', tool: { type: 'shield', tier: 0, speed: 1, dur: 336, dmg: 1, rep: '#planks' } });
It(322, 'pumpkin_seeds', 'Pumpafrön', 'i_pumpkin_seeds', { place: 179 });
It(323, 'melon_seeds', 'Melonfrön', 'i_melon_seeds', { place: 183 });
It(324, 'spark_dust', 'Gnistdamm', 'i_spark_dust', { place: 205, desc: 'Läggs ut som ledning. Leder ström upp till 15 steg.' });
// rustning: 4 material × 4 delar (id 330–345)
export const ARMOR0 = 330;
export const ARMOR_MATS = [['Läder', 0x9a6232, 80], ['Järn', 0xc8ccd2, 240], ['Guld', 0xf2c63a, 110], ['Diamant', 0x8fe0f0, 520]];
const ARMOR_PTS = [[1, 3, 2, 1], [2, 6, 5, 2], [2, 5, 3, 1], [3, 8, 6, 3]];
const ARMOR_PARTS = [['helmet', 'hjälm'], ['chest', 'bröstplåt'], ['legs', 'benskydd'], ['boots', 'kängor']];
for (let m = 0; m < 4; m++) for (let p = 0; p < 4; p++) It(ARMOR0 + m * 4 + p, ARMOR_PARTS[p][0] + '_' + m, ARMOR_MATS[m][0] + ARMOR_PARTS[p][1], 'i_' + ARMOR_PARTS[p][0] + '_' + m, { stack: 1, armor: { slot: p, mat: m, pts: ARMOR_PTS[m][p], dur: Math.round(ARMOR_MATS[m][2] * [0.8, 1.15, 1.1, 0.95][p]) } });
export const ARMOR_SLOT_NAMES = ['Hjälm', 'Bröstplåt', 'Benskydd', 'Kängor'];
export const TIER_NAMES = ['Trä', 'Sten', 'Järn', 'Diamant', 'Guld'];
const TOOL_TYPES = [['pick', 'hacka'], ['axe', 'yxa'], ['shovel', 'spade'], ['sword', 'svärd']];
const TOOL_SPEED = [2, 4, 6, 10, 12], TOOL_DUR = [60, 132, 251, 1561, 33];
const TOOL_DMG = { pick: [2, 3, 4, 5, 2], axe: [3, 4, 5, 7, 3], shovel: [1.5, 2.5, 3, 4, 1.5], sword: [4, 5, 6, 8.5, 4] };
const TOOL_REP = ['#planks', '#stone', 258, 260, 259];
export const TOOL0 = 280;
for (let t = 0; t < 4; t++) for (let k = 0; k < 4; k++) {
  const [type, sv] = TOOL_TYPES[k];
  It(TOOL0 + t * 4 + k, type + '_' + t, TIER_NAMES[t] + sv, 'i_' + type + '_' + t, { stack: 1, fuel: t === 0 ? 10 : 0, tool: { type, tier: t, speed: TOOL_SPEED[t], dur: TOOL_DUR[t], dmg: TOOL_DMG[type][t], rep: TOOL_REP[t] } });
}
// guldverktyg (id 350–353): snabba men sköra, bryter som sten
export const GOLD_TOOL0 = 350;
for (let k = 0; k < 4; k++) {
  const [type, sv] = TOOL_TYPES[k];
  It(GOLD_TOOL0 + k, type + '_gold', 'Guld' + sv, 'i_' + type + '_4', { stack: 1, tool: { type, tier: 1, speed: TOOL_SPEED[4], dur: TOOL_DUR[4], dmg: TOOL_DMG[type][4], rep: 259 } });
}
// jordhackor (sten = 299): trä 354, järn 355, guld 356, diamant 357
[[354, 0, 'Trä'], [355, 2, 'Järn'], [356, 4, 'Guld'], [357, 3, 'Diamant']].forEach(([id, t, n]) => It(id, 'hoe_' + t, n + 'jordhacka', 'i_hoe_' + [0, 1, 2, 3, 4][t], { stack: 1, fuel: t === 0 ? 10 : 0, tool: { type: 'hoe', tier: t === 4 ? 1 : t, speed: 1, dur: TOOL_DUR[t], dmg: 1, rep: TOOL_REP[t] } }));
export const HOES = [354, 299, 355, 356, 357];
export const isHoe = id => { const t = toolOf(id); return !!t && t.type === 'hoe'; };

/* ---------- Gemensamma hjälpare ---------- */
export function isBlockId(id) { return id > 0 && id < 256; }
export function itemDef(id) { return id < 256 ? BLOCKS[id] : ITEMS[id]; }
export function itemName(id) { const d = itemDef(id); return d ? d.name : '?'; }
export function maxStack(id) { if (id < 256) return 64; const d = ITEMS[id]; return d ? d.stack : 64; }
export function toolOf(id) { return id >= 256 && ITEMS[id] ? ITEMS[id].tool || ITEMS[id].armor || null : null; }
export function armorOf(id) { return id >= 256 && ITEMS[id] ? ITEMS[id].armor || null : null; }
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
  [B.spruce_log]: 257, [B.birch_log]: 257, [B.pine_log]: 257, [265]: 266, [267]: 268, [264]: 271, [B.peat]: 257, [274]: 275, [277]: 298,
  [B.stone]: B.smooth_stone, [304]: 305, [319]: 320, [B.terracotta]: B.bricks, [B.oak_log]: 257, [B.spark_ore]: 324
};
