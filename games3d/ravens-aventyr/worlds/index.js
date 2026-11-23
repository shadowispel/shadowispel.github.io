/* Världsregister */
import hub from './hub.js';
import forest from './forest.js';
import cave from './cave.js';
import ice from './ice.js';
import islands from './islands.js';
import tower from './tower.js';
export const WORLDS = { hub, forest, cave, ice, islands, tower };
export const WORLD_ORDER = ['hub', 'forest', 'cave', 'ice', 'islands', 'tower'];
export const TOTAL_STONES = WORLD_ORDER.reduce((n, id) => n + WORLDS[id].stones.length, 0);
