/**
 * Fjällracet – miljöteman per bana (ljus, himmel, dimma, vägtyp, räcken, väder, musik).
 *
 * road:     'normal' | 'light' | 'wet' | 'ice' | 'gravel' | 'snow' | 'neo' | 'airfield'
 * shoulder: 'grass' | 'gravel' | 'sand' | 'snow' | 'pave' | 'moss' | 'limestone'
 * barrier:  'wood' | 'stone' | 'rail' | 'concrete' | 'snow' | 'bank' (jordvall) | 'neon' (betong med ljuslist)
 * bridge:   'concrete' | 'arch' | 'suspension' | 'steel'
 * weather:  'rain' | 'snow' | 'dust' | 'pollen' | 'none'   (weatherVel: valfri vindvektor [x,y,z])
 * dust:     [r,g,b] 0–1 – partikelfärg för damm/sladd på vägen (läses av main.js)
 * lamps:    { spacing, color, radius, d, height, strength } – gatlampor vars ljus räknas i vägens shader
 *           (ljuspölar) och de närmaste blir riktiga punktljus (pointLights st).
 * edgeGlow: [r,g,b] – pulserande ljuslister i vägkanten (Neostad)
 */
export const THEMES = {
  midsommar: {
    label: 'Midsommarkväll', road: 'normal', shoulder: 'grass', barrier: 'wood', tunnel: 'rock', bridge: 'concrete', bank: 1,
    sky: { top: 0x4f86cf, horizon: 0xf4d2a0, bottom: 0xb99c74, sun: 0xffcf8a, sunEl: 10, sunAz: 235, sunSize: 1.0, stars: 0, aurora: 0 },
    fog: { color: 0xe6c99c, far: 950 },
    sun: { color: 0xffd2a0, intensity: 2.7 }, hemi: { sky: 0xbcd0ff, ground: 0x5c4a2c, intensity: 0.9 },
    exposure: 1.0, night: false, weather: 'pollen', music: 'adventure', water: -4, bloom: 0.35, dust: [0.62, 0.6, 0.55]
  },
  skargard: {
    label: 'Eftermiddag', road: 'normal', shoulder: 'gravel', barrier: 'stone', tunnel: 'rock', bridge: 'arch', bank: 0.9,
    sky: { top: 0x2f72d2, horizon: 0xcfe5f6, bottom: 0x6f8fa8, sun: 0xfff1d0, sunEl: 38, sunAz: 150, sunSize: 0.8, stars: 0, aurora: 0 },
    fog: { color: 0xc9def0, far: 1200 },
    sun: { color: 0xfff2dc, intensity: 3.0 }, hemi: { sky: 0xc4dcff, ground: 0x5a5048, intensity: 0.85 },
    exposure: 1.0, night: false, weather: 'none', music: 'calm', water: -6, bloom: 0.3, dust: [0.66, 0.62, 0.58]
  },
  odemark: {
    label: 'Solnedgång', road: 'light', shoulder: 'sand', barrier: 'rail', tunnel: 'rock', bridge: 'concrete', bank: 0.9,
    sky: { top: 0x2b2c6a, horizon: 0xff9448, bottom: 0x8a5a3a, sun: 0xff6a24, sunEl: 5, sunAz: 275, sunSize: 1.6, stars: 0.15, aurora: 0 },
    fog: { color: 0xe49466, far: 850 },
    sun: { color: 0xffa060, intensity: 2.6 }, hemi: { sky: 0xffb48a, ground: 0x6a4a30, intensity: 0.8 },
    exposure: 1.05, night: false, weather: 'dust', music: 'action', water: null, bloom: 0.45, dust: [0.86, 0.7, 0.5]
  },
  fjall: {
    label: 'Klar vinterdag', road: 'normal', shoulder: 'snow', barrier: 'rail', tunnel: 'rock', bridge: 'concrete', bank: 1,
    sky: { top: 0x1a56b8, horizon: 0xdde9f6, bottom: 0xc8d6e6, sun: 0xffffff, sunEl: 26, sunAz: 140, sunSize: 0.9, stars: 0, aurora: 0 },
    fog: { color: 0xdce7f2, far: 1400 },
    sun: { color: 0xfff6ea, intensity: 2.9 }, hemi: { sky: 0xcfe0ff, ground: 0x8a8a96, intensity: 0.95 },
    exposure: 0.95, night: false, weather: 'snow', music: 'adventure', water: null, bloom: 0.25, dust: [0.9, 0.93, 0.97]
  },
  stad: {
    label: 'Neonnatt i regn', road: 'neo', shoulder: 'pave', barrier: 'neon', tunnel: 'city', bridge: 'steel', bank: 0.25,
    sky: { top: 0x05030f, horizon: 0x3a1650, bottom: 0x10081c, sun: 0xd8c8ff, sunEl: 32, sunAz: 60, sunSize: 0.7, stars: 0.05, aurora: 0, moon: true },
    fog: { color: 0x241632, far: 640 },
    sun: { color: 0x8a90ff, intensity: 0.4 }, hemi: { sky: 0x4a3a80, ground: 0x2a1a30, intensity: 0.7 },
    exposure: 1.0, night: true, weather: 'rain', music: 'night', water: null, bloom: 0.75, dust: [0.42, 0.4, 0.55],
    lamps: { spacing: 26, color: [0.75, 0.9, 1.0], radius: 7.5, d: 1.0, height: 8.2, strength: 1.5, alt: true },
    pointLights: 3, edgeGlow: [0.15, 0.85, 1.0], edgeGlow2: [1.0, 0.25, 0.75]
  },
  is: {
    label: 'Norrskensnatt', road: 'ice', shoulder: 'snow', barrier: 'snow', tunnel: 'rock', bridge: 'concrete', bank: 0.4,
    sky: { top: 0x020713, horizon: 0x15405c, bottom: 0x0b1e2e, sun: 0xd8e6ff, sunEl: 24, sunAz: 200, sunSize: 0.7, stars: 1, aurora: 1, moon: true },
    fog: { color: 0x0f2a40, far: 900 },
    sun: { color: 0xa8c4ff, intensity: 0.9 }, hemi: { sky: 0x5a86b0, ground: 0x2a3a50, intensity: 1.0 },
    exposure: 1.05, night: true, weather: 'snow', music: 'space', water: null, bloom: 0.55, dust: [0.9, 0.95, 1]
  },
  kust: {
    label: 'Klar eftermiddag', road: 'normal', shoulder: 'gravel', barrier: 'rail', tunnel: 'rock', bridge: 'suspension', bank: 1,
    sky: { top: 0x2a68c8, horizon: 0xd8e8f4, bottom: 0x5a7a90, sun: 0xfff0d8, sunEl: 30, sunAz: 215, sunSize: 0.9, stars: 0, aurora: 0 },
    fog: { color: 0xc8dcea, far: 1500 },
    sun: { color: 0xfff0dc, intensity: 3.0 }, hemi: { sky: 0xc4d8f8, ground: 0x4a4a40, intensity: 0.85 },
    exposure: 1.0, night: false, weather: 'none', music: 'adventure', water: -36, bloom: 0.3, dust: [0.66, 0.63, 0.6]
  },
  hamn: {
    label: 'Regnig skymning', road: 'wet', shoulder: 'pave', barrier: 'concrete', tunnel: 'city', bridge: 'steel', bank: 0.3,
    sky: { top: 0x1a2236, horizon: 0x8a6a6a, bottom: 0x2a2a34, sun: 0xffb080, sunEl: 3, sunAz: 260, sunSize: 0.9, stars: 0, aurora: 0 },
    fog: { color: 0x4a4a58, far: 700 },
    sun: { color: 0xffb890, intensity: 0.9 }, hemi: { sky: 0x7a86a8, ground: 0x3a3430, intensity: 0.95 },
    exposure: 1.05, night: true, weather: 'rain', music: 'tense', water: -3.5, bloom: 0.5, dust: [0.45, 0.46, 0.5],
    lamps: { spacing: 34, color: [1.0, 0.78, 0.5], radius: 8.5, d: 1.2, height: 10, strength: 1.2, alt: true },
    pointLights: 2
  },
  gotland: {
    label: 'Sommardag', road: 'light', shoulder: 'limestone', barrier: 'stone', tunnel: 'rock', bridge: 'concrete', bank: 0.9,
    sky: { top: 0x2c74d8, horizon: 0xdcecf8, bottom: 0x7aa0b8, sun: 0xfff6e0, sunEl: 48, sunAz: 170, sunSize: 0.8, stars: 0, aurora: 0 },
    fog: { color: 0xd6e8f4, far: 1300 },
    sun: { color: 0xfff6e6, intensity: 3.1 }, hemi: { sky: 0xc8e0ff, ground: 0x8a8070, intensity: 0.9 },
    exposure: 0.98, night: false, weather: 'pollen', music: 'calm', water: -5, bloom: 0.28, dust: [0.88, 0.86, 0.8],
    waterColor: 0x2a8a9a
  },
  lappland: {
    label: 'Polarnatt med norrsken', road: 'snow', shoulder: 'snow', barrier: 'snow', tunnel: 'rock', bridge: 'concrete', bank: 0.6,
    sky: { top: 0x02060f, horizon: 0x123a4a, bottom: 0x0a1a26, sun: 0xd8e6ff, sunEl: 30, sunAz: 120, sunSize: 0.7, stars: 1, aurora: 1.3, moon: true },
    fog: { color: 0x0e2436, far: 900 },
    sun: { color: 0xa8c4ff, intensity: 1.0 }, hemi: { sky: 0x5a8ab0, ground: 0x2a3a50, intensity: 1.05 },
    exposure: 1.08, night: true, weather: 'snow', music: 'night', water: null, bloom: 0.55, dust: [0.92, 0.95, 1]
  },
  dalarna: {
    label: 'Morgonljus', road: 'normal', shoulder: 'grass', barrier: 'wood', tunnel: 'rock', bridge: 'concrete', bank: 1,
    sky: { top: 0x5a8ad0, horizon: 0xffe2c0, bottom: 0xa8a090, sun: 0xffe0b0, sunEl: 9, sunAz: 95, sunSize: 1.1, stars: 0, aurora: 0 },
    fog: { color: 0xe8dcc8, far: 900 },
    sun: { color: 0xffe0b8, intensity: 2.6 }, hemi: { sky: 0xc8d8ff, ground: 0x5a4a30, intensity: 0.9 },
    exposure: 1.0, night: false, weather: 'pollen', music: 'calm', water: -5, bloom: 0.35, dust: [0.62, 0.58, 0.52]
  },
  oland: {
    label: 'Blåsigt solsken', road: 'normal', shoulder: 'limestone', barrier: 'stone', tunnel: 'rock', bridge: 'concrete', bank: 0.9,
    sky: { top: 0x2e78de, horizon: 0xe0eef8, bottom: 0x80a0b0, sun: 0xffffff, sunEl: 40, sunAz: 200, sunSize: 0.8, stars: 0, aurora: 0, clouds: 1 },
    fog: { color: 0xd8e8f4, far: 1500 },
    sun: { color: 0xfff8ec, intensity: 3.1 }, hemi: { sky: 0xc8e0ff, ground: 0x7a7a60, intensity: 0.9 },
    exposure: 0.98, night: false, weather: 'pollen', weatherVel: [9, 0.4, 2.5], music: 'adventure', water: -4, bloom: 0.25, dust: [0.8, 0.78, 0.7],
    waterColor: 0x2a6a8a
  },
  flyg: {
    label: 'Skymning', road: 'airfield', shoulder: 'grass', barrier: 'rail', tunnel: 'city', bridge: 'concrete', bank: 0.4,
    sky: { top: 0x101a40, horizon: 0xf08a50, bottom: 0x3a2a30, sun: 0xff7a3a, sunEl: 2, sunAz: 290, sunSize: 1.5, stars: 0.35, aurora: 0 },
    fog: { color: 0x6a5a68, far: 1300 },
    sun: { color: 0xff9a60, intensity: 1.6 }, hemi: { sky: 0x8a90c0, ground: 0x3a3030, intensity: 0.85 },
    exposure: 1.05, night: true, weather: 'none', music: 'action', water: null, bloom: 0.6, dust: [0.55, 0.55, 0.58]
  },
  gruva: {
    label: 'Dammig eftermiddag', road: 'gravel', shoulder: 'gravel', barrier: 'bank', tunnel: 'rock', bridge: 'steel', bank: 0.7,
    sky: { top: 0x5a7ab0, horizon: 0xe8d0b0, bottom: 0x8a7a68, sun: 0xffe0b0, sunEl: 22, sunAz: 240, sunSize: 1.0, stars: 0, aurora: 0 },
    fog: { color: 0xc8b49a, far: 800 },
    sun: { color: 0xffe2c0, intensity: 2.7 }, hemi: { sky: 0xd0d0e0, ground: 0x6a5040, intensity: 0.85 },
    exposure: 1.0, night: false, weather: 'dust', weatherVel: [4, 0.3, 1.5], music: 'tense', water: null, bloom: 0.3, dust: [0.66, 0.52, 0.4],
    bankColor: 0x7a5e48
  },
  tivoli: {
    label: 'Sommarnatt', road: 'normal', shoulder: 'pave', barrier: 'concrete', tunnel: 'city', bridge: 'steel', bank: 0.4,
    sky: { top: 0x060818, horizon: 0x2a2050, bottom: 0x100c1c, sun: 0xe0e4ff, sunEl: 35, sunAz: 30, sunSize: 0.7, stars: 0.7, aurora: 0, moon: true },
    fog: { color: 0x1c1830, far: 700 },
    sun: { color: 0x9aa4ff, intensity: 0.5 }, hemi: { sky: 0x4a4a80, ground: 0x302430, intensity: 0.8 },
    exposure: 1.05, night: true, weather: 'none', music: 'night', water: -2, bloom: 0.7, dust: [0.5, 0.48, 0.55],
    lamps: { spacing: 22, color: [1.0, 0.85, 0.6], radius: 7, d: 1.0, height: 6.5, strength: 1.3, alt: true },
    pointLights: 2
  },
  skog: {
    label: 'Dimmig förmiddag', road: 'gravel', shoulder: 'moss', barrier: 'bank', tunnel: 'rock', bridge: 'concrete', bank: 0.8,
    sky: { top: 0x7a94b0, horizon: 0xd0d8d8, bottom: 0x7a8478, sun: 0xfff4e0, sunEl: 24, sunAz: 150, sunSize: 0.8, stars: 0, aurora: 0 },
    fog: { color: 0xb8c4c0, far: 420 },
    sun: { color: 0xfff0dc, intensity: 2.2 }, hemi: { sky: 0xc8d4e0, ground: 0x3a4a30, intensity: 1.0 },
    exposure: 1.0, night: false, weather: 'none', music: 'action', water: null, bloom: 0.3, dust: [0.6, 0.5, 0.4],
    bankColor: 0x4a5a32
  }
};
