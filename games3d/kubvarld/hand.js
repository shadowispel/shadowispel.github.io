/** Förstapersonshand och hållet föremål (egen scen som ritas ovanpå). */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { extrudedGeo, blockGeo, isCubeItem } from './models.js';

/** Stickat mönster (lusekofta) för vanten – ritas på en liten canvas */
function knitTexture(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d');
  const R = '#b8302e', R2 = '#9e2826', W = '#f2ece0', W2 = '#d9d1c2', N = '#1f3a6e', N2 = '#18305c';
  const px = (i, j, col) => { x.fillStyle = col; x.fillRect(i, j, 1, 1); };
  for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
    if (kind === 'cuff') { const band = (j >> 2) % 2; px(i, j, band ? ((i + j) % 2 ? W : W2) : ((i + j) % 2 ? R : R2)); continue; }
    if (kind === 'sleeve') { px(i, j, (i + (j >> 1)) % 3 ? N : N2); continue; }
    // vante: rött med vita "löss" och en stjärnbård
    let col = (i + (j >> 1)) % 2 ? R : R2;
    if (j >= 4 && j <= 6) col = W;
    if (j > 8 && (j % 4 === 1) && ((i + (j >> 2) * 2) % 4 === 0)) col = W;
    px(i, j, col);
  }
  // åttabladsrosor (enkla stjärnor)
  for (const [cx, cy] of [[8, 20], [24, 20]]) {
    for (let k = -3; k <= 3; k++) { px(cx + k, cy, W); px(cx, cy + k, W); if (Math.abs(k) < 3) { px(cx + k, cy + k, W); px(cx + k, cy - k, W); } }
    px(cx, cy, R);
  }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
import { BLOCKS, ITEMS, M_CROSS } from './blocks.js';

export class Hand {
  constructor(game) {
    this.g = game;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 1.4); d.position.set(-0.4, 1, 0.6); this.scene.add(d);
    this.root = new THREE.Group(); this.scene.add(this.root);
    // stickad vante med mönster, mudd och tröjärm
    this.texs = [knitTexture('mitten'), knitTexture('cuff'), knitTexture('sleeve')];
    const [tm, tc, ts] = this.texs;
    this.armMats = [new THREE.MeshLambertMaterial({ map: tm }), new THREE.MeshLambertMaterial({ map: tc }), new THREE.MeshLambertMaterial({ map: ts })];
    const [mm, mc, msl] = this.armMats;
    const arm = new THREE.Group();
    const sleeve = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.62, 0.3, 2, 0.08), msl); sleeve.position.y = 0.06;
    const cuff = new THREE.Mesh(new RoundedBoxGeometry(0.31, 0.16, 0.31, 2, 0.06), mc); cuff.position.y = -0.3;
    const mit = new THREE.Mesh(new RoundedBoxGeometry(0.29, 0.34, 0.24, 3, 0.1), mm); mit.position.set(0, -0.5, 0.01);
    const tip = new THREE.Mesh(new RoundedBoxGeometry(0.27, 0.12, 0.22, 3, 0.06), mm); tip.position.set(0, -0.66, 0.01);
    const thumb = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.2, 0.11, 2, 0.05), mm); thumb.position.set(-0.16, -0.44, 0.05); thumb.rotation.z = -0.45;
    const tassel = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.06, 0.06, 1, 0.02), mc); tassel.position.set(0.16, -0.25, 0.1);
    arm.add(sleeve, cuff, mit, tip, thumb, tassel);
    this.arm = arm;
    this.itemMatL = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.item = new THREE.Group();
    this.root.add(arm, this.item);
    this.layout = null; // { xr, yt } snabbfältets högerkant/överkant i NDC
    this.curId = -1; this.equip = 0; this.swing = 0; this.eat = 0; this.pull = 0; this.light = new THREE.Color(1, 1, 1);
    this._mesh = null;
    // andra handen (sköld m.m.) – ritas nere till vänster
    this.off = new THREE.Group(); this.scene.add(this.off);
    this.offId = -1; this._offMesh = null; this.block = 0; this.blockHit = 0; this._blk = 0;
  }
  _setOff(id) {
    if (this._offMesh) { this.off.remove(this._offMesh); this._offMesh = null; }
    this.offId = id; if (!id) return;
    const cube = isCubeItem(id);
    const m = cube ? new THREE.Mesh(blockGeo(id), this.g.mats.entity) : new THREE.Mesh(extrudedGeo(this.g.atlas, id), this.itemMatL);
    m.scale.setScalar(cube ? 0.46 : ITEMS[id] && ITEMS[id].shield ? 0.8 : 0.64);
    if (cube) { const self = this; m.onBeforeRender = function (r, s, c, g, mat) { mat.uniforms.uEntLight.value.set(self.sky, self.blk); mat.uniformsNeedUpdate = true; }; m.rotation.y = Math.PI / 4; }
    this._offMesh = m; this.off.add(m);
  }
  dispose() { this.arm.children.forEach(c => c.geometry.dispose()); this.armMats.forEach(m => m.dispose()); this.texs.forEach(t => t.dispose()); this.itemMatL.dispose(); }
  setAspect(a) {
    this.cam.aspect = a;
    // stående mobil: vidga synfältet så att vanten inte täcker halva skärmen
    this.cam.fov = a >= 1 ? 70 : 2 * Math.atan(Math.tan(35 * Math.PI / 180) * Math.min(1.75, Math.max(1, 0.78 / a))) * 180 / Math.PI;
    this.cam.updateProjectionMatrix();
  }
  _setItem(id) {
    if (this._mesh) { this.item.remove(this._mesh); this._mesh = null; }
    this.curId = id;
    if (!id) return;
    let m;
    if (isCubeItem(id)) {
      m = new THREE.Mesh(blockGeo(id), this.g.mats.entity);
      m.scale.setScalar(0.5);
      m.position.set(-0.04, 0.15, -0.05);
      m.rotation.set(0, Math.PI / 4, 0);
      const self = this;
      m.onBeforeRender = function (r, s, c, g, mat) { mat.uniforms.uEntLight.value.set(self.sky, self.blk); mat.uniformsNeedUpdate = true; };
    } else {
      m = new THREE.Mesh(extrudedGeo(this.g.atlas, id), this.itemMatL);
      const tool = !!(ITEMS[id] && ITEMS[id].tool);
      const plant = id > 0 && (id < 256 || id >= 400) && BLOCKS[id] && BLOCKS[id].model === M_CROSS;
      m.scale.setScalar(tool ? 0.95 : 0.6);
      m.rotation.set(tool ? -0.2 : 0, tool ? -1.35 : -0.3, tool ? 0.35 : 0);
      m.position.set(tool ? 0.04 : 0.05, tool ? 0.32 : plant ? 0.2 : 0.16, tool ? -0.12 : -0.04);
    }
    this._mesh = m;
    this.item.add(m);
  }
  update(dt, heldId, player, eating) {
    if (heldId !== this.curId) { this.equip = 1; this._setItem(heldId); }
    this.equip = Math.max(0, this.equip - dt * 5);
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt * 3.6);
    this.eat = eating ? this.eat + dt : 0;
    // ljus
    const L = this.g.world.light(Math.floor(player.pos.x), Math.floor(player.pos.y + player.camY), Math.floor(player.pos.z));
    this.sky = (L >> 4) / 15; this.blk = (L & 15) / 15;
    const sl = this.g.sky.skyLight;
    const sf = this.sky ? Math.pow(0.8, 15 - (L >> 4)) : 0, bf = this.blk ? Math.pow(0.8, 15 - (L & 15)) : 0;
    const am = this.g.mats.uniforms.uAmbient.value;
    this.light.setRGB(Math.max(sl.r * sf, bf, 0.05, am.r * 1.3), Math.max(sl.g * sf, bf * 0.78, 0.05, am.g * 1.3), Math.max(sl.b * sf, bf * 0.52, 0.05, am.b * 1.3));
    for (const m of this.armMats) m.color.copy(this.light).multiplyScalar(0.72);
    this.itemMatL.color.copy(this.light).multiplyScalar(0.62);
    // pose
    const bob = player.bob, ba = player.bobAmt;
    const s = this.swing > 0 ? Math.sin((1 - this.swing) * Math.PI) : 0;
    const s2 = this.swing > 0 ? Math.sin((1 - this.swing) * Math.PI * 2) : 0;
    const hasItem = !!heldId;
    let ax = 0.52 * Math.min(1.7, Math.max(0.6, this.cam.aspect)), ay = -0.4, sc = 1;
    // håll vanten fri från snabbfältet: flytta åt höger förbi det, eller (smal skärm) upp ovanför det
    const lay = this.layout;
    if (lay) {
      const tv = Math.tan(this.cam.fov * Math.PI / 360), th = tv * this.cam.aspect, D = 1.08;
      const needX = lay.xr * D * th + 0.36;      // vantens vänsterkant till höger om fältet
      const needY = lay.yt * D * tv + 0.44;      // vantens underkant ovanför fältet
      const dx = Math.max(0, needX - ax), dy = Math.max(0, needY - ay);
      const maxX = D * th + 0.12;              // längre åt höger hamnar vanten för långt utanför bild
      if (dx > 0 && dy > 0) {
        if (ax + dx <= maxX) ax += dx;           // helst åt sidan – vanten får sticka ut lite i kanten
        else { ax = maxX; sc = 0.82; ay += Math.max(0, (needX - ax) / Math.max(0.01, dx) * dy * 0.9); } // smal skärm: mindre och lite högre
      }
    }
    // stående mobil: snabbfältet täcker nästan hela bredden – mindre vante som vilar ovanför fältet
    if (lay && lay.xr > 0.75) { sc = 0.78; ay += 0.1 + Math.max(0, lay.yt + 0.75) * 0.3; }
    this.root.scale.setScalar(sc);
    this.root.position.set(ax + Math.sin(bob) * 0.025 * ba - s * 0.22, ay - Math.abs(Math.cos(bob)) * 0.035 * ba - this.equip * 0.5 + s * 0.1, -0.95 - s * 0.15);
    this.root.rotation.set(-s * 0.7 + s2 * 0.1, -s * 0.5, s * 0.2);
    if (this.pull > 0) { this.root.position.x -= 0.25 * this.pull; this.root.position.z += 0.18 * this.pull; this.root.rotation.z += 0.5 * this.pull; this.root.position.y += Math.sin(performance.now() * 0.05) * 0.004 * this.pull; }
    if (this.eat > 0) { this.root.position.set(ax * 0.45, -0.36 + Math.abs(Math.sin(this.eat * 14)) * 0.04, -0.6); this.root.rotation.set(0.3, 0.7, 0.1); }
    this.arm.rotation.order = 'YXZ';
    this.arm.position.set(0.04, -0.24, 0.32);
    this.arm.rotation.set(1.62, 0.45, -0.12);
    this.arm.visible = true;
    this.item.position.set(-0.15, -0.25, -0.13); // i vantens grepp
    this.item.visible = hasItem;
    // parering: skölden (i handen eller andra handen) lyfts fram mitt i bild
    this._blk += ((this.block ? 1 : 0) - this._blk) * (1 - Math.exp(-18 * dt));
    this.blockHit = Math.max(0, this.blockHit - dt * 4);
    const offS = this.g.inv && this.g.inv.off, offId = offS ? offS.id : 0;
    if (offId !== this.offId) this._setOff(offId);
    const b = this._blk, kick = Math.sin(this.blockHit * Math.PI) * 0.05;
    this.off.visible = !!offId;
    this.off.position.set(-ax * 0.95 + b * 0.55 * ax, -0.52 + b * 0.22 - this.equip * 0.3 + kick, -0.95 + b * 0.25);
    this.off.rotation.set(0, 0.35 - b * 0.35, 0);
    if (this.block === 1) { this.root.position.x -= b * 0.32; this.root.position.y += b * 0.1; this.root.rotation.set(0, 0.2 * b, 0); this.item.rotation.set(0, -0.6 * b, 0); this.arm.visible = b < 0.5; }
    else this.item.rotation.set(0, 0, 0);
  }
  render(renderer) { const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth(); renderer.render(this.scene, this.cam); renderer.autoClear = ac; }
}
