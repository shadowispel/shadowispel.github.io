/**
 * Fjällracet – miljöteman per bana (ljus, himmel, dimma, vägtyp, räcken, väder, musik).
 */
export const THEMES = {
  midsommar: {
    label: 'Midsommarkväll', road: 'normal', shoulder: 'grass', barrier: 'wood', tunnel: 'rock', bridge: 'concrete', bank: 1,
    sky: { top: 0x4f86cf, horizon: 0xf4d2a0, bottom: 0xb99c74, sun: 0xffcf8a, sunEl: 10, sunAz: 235, sunSize: 1.0, stars: 0, aurora: 0 },
    fog: { color: 0xe6c99c, far: 950 },
    sun: { color: 0xffd2a0, intensity: 2.7 }, hemi: { sky: 0xbcd0ff, ground: 0x5c4a2c, intensity: 0.9 },
    exposure: 1.0, night: false, weather: 'pollen', music: 'adventure', water: -4, bloom: 0.35
  },
  skargard: {
    label: 'Eftermiddag', road: 'normal', shoulder: 'gravel', barrier: 'stone', tunnel: 'rock', bridge: 'arch', bank: 0.9,
    sky: { top: 0x2f72d2, horizon: 0xcfe5f6, bottom: 0x6f8fa8, sun: 0xfff1d0, sunEl: 38, sunAz: 150, sunSize: 0.8, stars: 0, aurora: 0 },
    fog: { color: 0xc9def0, far: 1200 },
    sun: { color: 0xfff2dc, intensity: 3.0 }, hemi: { sky: 0xc4dcff, ground: 0x5a5048, intensity: 0.85 },
    exposure: 1.0, night: false, weather: 'none', music: 'calm', water: -6, bloom: 0.3
  },
  odemark: {
    label: 'Solnedgång', road: 'light', shoulder: 'sand', barrier: 'rail', tunnel: 'rock', bridge: 'concrete', bank: 0.9,
    sky: { top: 0x2b2c6a, horizon: 0xff9448, bottom: 0x8a5a3a, sun: 0xff6a24, sunEl: 5, sunAz: 275, sunSize: 1.6, stars: 0.15, aurora: 0 },
    fog: { color: 0xe49466, far: 850 },
    sun: { color: 0xffa060, intensity: 2.6 }, hemi: { sky: 0xffb48a, ground: 0x6a4a30, intensity: 0.8 },
    exposure: 1.05, night: false, weather: 'dust', music: 'action', water: null, bloom: 0.45
  },
  fjall: {
    label: 'Klar vinterdag', road: 'normal', shoulder: 'snow', barrier: 'rail', tunnel: 'rock', bridge: 'concrete', bank: 1,
    sky: { top: 0x1a56b8, horizon: 0xdde9f6, bottom: 0xc8d6e6, sun: 0xffffff, sunEl: 26, sunAz: 140, sunSize: 0.9, stars: 0, aurora: 0 },
    fog: { color: 0xdce7f2, far: 1400 },
    sun: { color: 0xfff6ea, intensity: 2.9 }, hemi: { sky: 0xcfe0ff, ground: 0x8a8a96, intensity: 0.95 },
    exposure: 0.95, night: false, weather: 'snow', music: 'adventure', water: null, bloom: 0.25
  },
  stad: {
    label: 'Regnig natt', road: 'wet', shoulder: 'pave', barrier: 'concrete', tunnel: 'city', bridge: 'concrete', bank: 0.25,
    sky: { top: 0x04050c, horizon: 0x2b1d40, bottom: 0x120d1c, sun: 0xc8d4ff, sunEl: 32, sunAz: 60, sunSize: 0.7, stars: 0.2, aurora: 0, moon: true },
    fog: { color: 0x1d1830, far: 620 },
    sun: { color: 0x9aaaff, intensity: 0.55 }, hemi: { sky: 0x3a3a70, ground: 0x3a2a20, intensity: 0.75 },
    exposure: 1.0, night: true, weather: 'rain', music: 'night', water: null, bloom: 0.55
  },
  is: {
    label: 'Norrskensnatt', road: 'ice', shoulder: 'snow', barrier: 'snow', tunnel: 'rock', bridge: 'concrete', bank: 0.4,
    sky: { top: 0x020713, horizon: 0x15405c, bottom: 0x0b1e2e, sun: 0xd8e6ff, sunEl: 24, sunAz: 200, sunSize: 0.7, stars: 1, aurora: 1, moon: true },
    fog: { color: 0x0f2a40, far: 900 },
    sun: { color: 0xa8c4ff, intensity: 0.9 }, hemi: { sky: 0x5a86b0, ground: 0x2a3a50, intensity: 1.0 },
    exposure: 1.05, night: true, weather: 'snow', music: 'space', water: null, bloom: 0.55
  }
};
