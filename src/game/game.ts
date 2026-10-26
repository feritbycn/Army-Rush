import * as THREE from 'three';
import { applyGate, applyHit, clampCount, collect, gateLabel, type GateDef, type RunState } from '../core/army';
import { bossAttackHits, damageBoss, newBoss, resolveBattle, type BossState } from '../core/combat';
import { CHUNK_LEN, MILESTONE_M, chunkRewardCoins, makeChunk, milestonesPassed, type Chunk } from '../core/endless';
import {
  abilityTimeMult, addQuestProgress, buildStartState, checkAchievements, completeLevel, defenseReduction, earnCoins,
} from '../core/progress';
import type { SaveData } from '../core/save';
import { BOSSES, ENEMIES, getBoss, type BossAttack, type BossDef, type EnemyKind } from '../data/enemies';
import { ECONOMY } from '../data/economy';
import { ENVS, getLevel, type EnemySpawn, type EnvDef, type GateRow, type ObstacleDef, type ObstacleType, type PickupDef } from '../data/levels';
import { Sfx } from './audio';
import { figureGeometry, figureMaterial, makeBoss, type BossMesh } from './models';
import { Particles } from './particles';
import { groundTexture, labelTexture } from './textures';

export type Mode = { type: 'level'; id: number } | { type: 'endless' };

export interface EndInfo {
  mode: 'level' | 'endless';
  win: boolean;
  levelId?: number;
  kills: number;
  survivors: number;
  coins: number;
  crystals: number;
  bossDefeated: boolean;
  distance: number;
  bestArmy: number;
  canContinue: boolean;
  newRecord: boolean;
}

export interface GameHooks { onEnd(info: EndInfo): void; persist(): void }

interface Segment {
  gates: GateRow[]; obstacles: ObstacleDef[]; pickups: PickupDef[]; enemies: EnemySpawn[];
  boss?: { id: string; hp: number; z: number };
  finishZ?: number;
}

type Item =
  | { k: 'gate'; z: number; row: GateRow; obj: THREE.Object3D; done: boolean }
  | { k: 'obs'; z: number; def: ObstacleDef; obj: THREE.Object3D; done: boolean; lastHit: number; baseX: number }
  | { k: 'pick'; z: number; def: PickupDef; obj: THREE.Object3D; done: boolean }
  | { k: 'enemy'; z: number; spawn: EnemySpawn; done: boolean }
  | { k: 'boss'; z: number; id: string; hp: number; done: boolean }
  | { k: 'finish'; z: number; obj: THREE.Object3D; done: boolean };

const LANE_W = 2.13;
const laneX = (l: number) => (l - 1) * LANE_W;
const laneOf = (x: number) => (x < -LANE_W / 2 ? 0 : x > LANE_W / 2 ? 2 : 1);
const MAX_X = 3.3;

const OBS_HIT: Record<ObstacleType, number> = {
  barrier: 0.18, narrow: 0.18, moving: 0.15, spinner: 0.2, damageFloor: 0.06, falling: 0.22, trap: 0.25, turret: 0.15, breakable: 0.08,
};
const OBS_WHY: Record<ObstacleType, string> = {
  barrier: 'Bariyere çarptın', narrow: 'Dar geçide çarptın', moving: 'Hareketli engele çarptın', spinner: 'Dönen mekanizma',
  damageFloor: 'Hasar veren zemin', falling: 'Düşen platform', trap: 'Tuzak!', turret: 'Taret ateşi', breakable: 'Kırılabilir kasa',
};

const OFFSETS: { x: number; z: number }[] = Array.from({ length: 150 }, (_, i) => {
  const r = 0.27 * Math.sqrt(i + 0.3); const a = i * 2.399963;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r * 1.25 };
});

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
  readonly particles = new Particles();
  sfx: Sfx;

  private ground!: THREE.Mesh;
  private groundMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  private outer!: THREE.Mesh;
  private outerMat = new THREE.MeshStandardMaterial({ roughness: 1 });
  private props: THREE.InstancedMesh | null = null;
  private propZ: number[] = [];
  private hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.0);
  private sun = new THREE.DirectionalLight(0xffffff, 1.6);

  private armyMesh: THREE.InstancedMesh | null = null;
  private armyClassKey = '';
  private enemyMeshes: { mesh: THREE.InstancedMesh; total: number; kind: EnemyKind }[] = [];
  private tele: THREE.Mesh[] = [];
  private items: Item[] = [];
  private dummy = new THREE.Object3D();

  // oyun durumu
  private mode: Mode = { type: 'level', id: 1 };
  private run!: RunState;
  private pz = 0; private armyX = 0; private targetX = 0;
  private time = 0; private runTime = 0;
  private phase: 'idle' | 'running' | 'battle' | 'boss' | 'ended' = 'idle';
  paused = false;
  private kills = 0; private soldiersCollected = 0; private peakArmy = 0; private bossesKilled = 0;
  private levelLength = 0; private chunkNext = 0; private chunkPrev = -1; private endlessSeed = 1; private prevM = 0; private milestoneCoins = 0;
  private continuesUsed = 0;
  private lastTime = 0;
  private shake = 0;

  private battle: { t: number; dur: number; startCount: number; endCount: number; enemyTotal: number; won: boolean; kills: number; items: Item[] } | null = null;
  private boss: {
    def: BossDef; st: BossState; mesh: BossMesh; t: number; nextAttack: number; atk: { a: BossAttack; at: number } | null;
    weakLane: number; weakUntil: number; nextWeak: number; item: Item;
  } | null = null;

  private dragging = false; private lastPX = 0;
  private hud = {
    count: document.getElementById('count')!, prog: document.querySelector('#progress > div') as HTMLElement,
    level: document.getElementById('level')!, bossbar: document.getElementById('bossbar')!,
    bossfill: document.querySelector('#bossbar > div') as HTMLElement, toast: document.getElementById('toast')!,
    pause: document.getElementById('pauseBtn')!,
  };
  private toastTimer = 0;

  constructor(private canvas: HTMLCanvasElement, private save: SaveData, private hooks: GameHooks, sfx: Sfx) {
    this.sfx = sfx;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.scene.add(this.hemi, this.sun, this.sun.target, this.particles.points);
    this.sun.position.set(-8, 18, -6);
    const g = new THREE.PlaneGeometry(7.2, 300);
    this.ground = new THREE.Mesh(g, this.groundMat); this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true;
    this.outer = new THREE.Mesh(new THREE.PlaneGeometry(260, 360), this.outerMat); this.outer.rotation.x = -Math.PI / 2; this.outer.position.y = -0.05;
    this.scene.add(this.ground, this.outer);
    for (let l = 0; l < 3; l++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W - 0.1, 16), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(laneX(l), 0.04, 0); m.visible = false; this.scene.add(m); this.tele.push(m);
    }
    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.applySettings();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ------------------------------------------------------------ ayarlar / giriş
  applySettings(): void {
    const s = this.save.settings;
    this.sfx.enabled = s.sfx; this.sfx.volume = s.volume;
    this.renderer.setPixelRatio(s.gfx === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = false; // gölge: yüksek grafikte bile ucuz sahte gölge (yer düzlemi) kullanılır
    this.resize();
  }

  private resize(): void {
    const w = window.innerWidth; const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = h / w > 1.3 ? 62 : 52;
    this.camera.updateProjectionMatrix();
  }

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => { this.dragging = true; this.lastPX = e.clientX; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => {
      if (!this.dragging || this.paused || this.phase === 'ended') return;
      const dx = e.clientX - this.lastPX; this.lastPX = e.clientX;
      const k = (MAX_X * 2.2) / Math.min(window.innerWidth, 520);
      this.targetX = Math.max(-MAX_X, Math.min(MAX_X, this.targetX + dx * k * this.save.settings.sensitivity));
    });
    const up = () => { this.dragging = false; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') this.targetX = Math.max(-MAX_X, this.targetX - LANE_W);
      if (e.key === 'ArrowRight' || e.key === 'd') this.targetX = Math.min(MAX_X, this.targetX + LANE_W);
    });
  }

  // ------------------------------------------------------------ ortam
  private applyEnv(env: EnvDef): void {
    this.scene.background = new THREE.Color(env.sky);
    this.scene.fog = new THREE.Fog(env.fog, 40, this.save.settings.gfx === 'low' ? 110 : 150);
    this.hemi.color.set(env.light); this.hemi.groundColor.set(env.ground);
    this.sun.color.set(env.light);
    this.groundMat.map?.dispose();
    this.groundMat.map = groundTexture(env.ground, env.accent);
    this.groundMat.map.repeat.set(1, 30);
    this.groundMat.needsUpdate = true;
    this.outerMat.color.set(env.ground).multiplyScalar(0.7);
    this.buildProps(env);
  }

  private buildProps(env: EnvDef): void {
    if (this.props) { this.scene.remove(this.props); this.props.geometry.dispose(); (this.props.material as THREE.Material).dispose(); }
    let geo: THREE.BufferGeometry; let color = env.accent; let emissive = 0;
    switch (env.id) {
      case 'forest': geo = new THREE.ConeGeometry(1.4, 4.5, 7); geo.translate(0, 2.25, 0); color = 0x2d6a4f; break;
      case 'snow': geo = new THREE.ConeGeometry(1.6, 5, 6); geo.translate(0, 2.5, 0); color = 0xf1f8ff; break;
      case 'desert': geo = new THREE.DodecahedronGeometry(1.5); geo.translate(0, 1, 0); color = 0xa0693b; break;
      case 'volcano': geo = new THREE.DodecahedronGeometry(1.8); geo.translate(0, 1, 0); color = 0x2a1a1a; emissive = 0x551100; break;
      case 'scifi': geo = new THREE.BoxGeometry(0.8, 7, 0.8); geo.translate(0, 3.5, 0); color = 0x2b3a55; emissive = 0x006688; break;
      case 'night': geo = new THREE.BoxGeometry(0.3, 5, 0.3); geo.translate(0, 2.5, 0); color = 0x444444; emissive = 0x664400; break;
      case 'factory': geo = new THREE.CylinderGeometry(0.9, 1.1, 8, 8); geo.translate(0, 4, 0); color = 0x6a6f75; break;
      case 'space': geo = new THREE.BoxGeometry(2, 6, 2); geo.translate(0, 3, 0); color = 0x2c3350; emissive = 0x331166; break;
      default: geo = new THREE.BoxGeometry(2.4, 6, 2.4); geo.translate(0, 3, 0); color = 0x5b5b5b; break;
    }
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, emissive, emissiveIntensity: 0.6 });
    const n = this.save.settings.gfx === 'low' ? 36 : 70;
    this.props = new THREE.InstancedMesh(geo, mat, n);
    this.propZ = Array.from({ length: n }, (_, i) => (i / n) * 220);
    for (let i = 0; i < n; i++) this.placeProp(i, this.propZ[i]);
    this.scene.add(this.props);
  }

  private placeProp(i: number, z: number): void {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (6 + ((i * 37) % 11) * 1.1);
    const s = 0.8 + ((i * 53) % 7) / 8;
    this.dummy.position.set(x, 0, z); this.dummy.rotation.set(0, i, 0); this.dummy.scale.set(s, s * (1 + ((i * 13) % 5) / 10), s);
    this.dummy.updateMatrix();
    this.props!.setMatrixAt(i, this.dummy.matrix);
    this.propZ[i] = z;
  }

  // ------------------------------------------------------------ yaşam döngüsü
  start(mode: Mode): void {
    this.clearTrack();
    this.mode = mode; this.continuesUsed = 0;
    this.phase = 'running'; this.paused = false;
    this.pz = 0; this.armyX = 0; this.targetX = 0; this.time = 0; this.runTime = 0;
    this.kills = 0; this.soldiersCollected = 0; this.peakArmy = 0; this.bossesKilled = 0; this.battle = null; this.boss = null;
    this.prevM = 0; this.milestoneCoins = 0; this.shake = 0;
    this.hud.bossbar.style.display = 'none';

    if (mode.type === 'level') {
      const l = getLevel(mode.id);
      this.run = buildStartState(this.save, l.startCount);
      this.levelLength = l.length;
      this.applyEnv(ENVS[l.env]);
      this.addSegment({
        gates: l.gates, obstacles: l.obstacles, pickups: l.pickups, enemies: l.enemies,
        boss: l.boss ? { id: l.boss, hp: l.bossHp ?? getBoss(l.boss).hp, z: l.length + 24 } : undefined,
        finishZ: l.boss ? undefined : l.length,
      }, 0);
      this.hud.level.textContent = `Bölüm ${l.id}`;
      if (l.tutorial) this.toast(l.tutorial, 3500);
    } else {
      this.endlessSeed = (Math.random() * 1e6) | 0;
      this.run = buildStartState(this.save, 10);
      this.levelLength = 0; this.chunkNext = 0; this.chunkPrev = -1;
      this.applyEnv(ENVS[(['forest', 'desert', 'snow', 'night', 'scifi', 'factory'] as const)[this.endlessSeed % 6]]);
      this.ensureChunks();
      this.hud.level.textContent = 'Sonsuz';
    }
    this.peakArmy = this.run.count;
    this.makeArmyMesh();
    this.updateHud();
  }

  private clearTrack(): void {
    for (const it of this.items) if ('obj' in it) this.scene.remove(it.obj);
    this.items = [];
    this.clearEnemyMeshes();
    if (this.boss) { this.scene.remove(this.boss.mesh.group); this.boss = null; }
    this.tele.forEach((t) => { t.visible = false; });
  }

  private clearEnemyMeshes(): void {
    for (const e of this.enemyMeshes) { this.scene.remove(e.mesh); e.mesh.geometry.dispose(); }
    this.enemyMeshes = [];
  }

  private makeArmyMesh(): void {
    const key = this.run.cls.id + ':' + this.save.cosmetics.length;
    if (this.armyMesh && this.armyClassKey === key) return;
    if (this.armyMesh) { this.scene.remove(this.armyMesh); this.armyMesh.geometry.dispose(); }
    const hasGold = this.save.cosmetics.includes('skin_gold');
    const geo = figureGeometry({ body: hasGold ? 0xe0b040 : this.run.cls.color, scale: 0.55 });
    this.armyMesh = new THREE.InstancedMesh(geo, figureMaterial(), 150);
    this.armyMesh.frustumCulled = false;
    this.scene.add(this.armyMesh);
    this.armyClassKey = key;
  }

  pause(): void { if (this.phase !== 'ended' && this.phase !== 'idle') this.paused = true; }
  resume(): void { this.paused = false; this.lastTime = performance.now(); }
  stop(): void { this.phase = 'idle'; this.paused = false; this.clearTrack(); this.hud.bossbar.style.display = 'none'; }
  get isRunning(): boolean { return this.phase !== 'idle' && this.phase !== 'ended'; }
  get currentMode(): Mode { return this.mode; }

  /** Yenilgi sonrası (reklamla) devam: ordu kısmen geri gelir ve kısa süre dokunulmaz olur. */
  revive(): void {
    if (this.phase !== 'ended') return;
    this.continuesUsed++;
    this.run = { ...this.run, count: clampCount(Math.max(this.mode.type === 'level' ? getLevel(this.mode.id).startCount : 10, Math.floor(this.peakArmy * 0.5))), immuneUntil: this.time + 4 * abilityTimeMult(this.save) };
    // Yenilginin yaşandığı savaş/boss yeniden başlamasın diye ileri sar.
    if (this.battle) { this.finishBattleVisuals(); this.battle = null; }
    this.items.forEach((it) => { if (it.k === 'enemy' && it.z <= this.pz + 16) it.done = true; });
    this.phase = this.boss ? 'boss' : 'running';
    this.paused = false;
    this.updateHud();
  }
  get canContinue(): boolean { return this.continuesUsed < ECONOMY.continueAdLimitPerRun; }

  // ------------------------------------------------------------ parkur kurulumu
  private addSegment(seg: Segment, zOff: number): void {
    for (const row of seg.gates) {
      const obj = this.makeGateRow(row);
      obj.position.z = row.z + zOff; this.scene.add(obj);
      this.items.push({ k: 'gate', z: row.z + zOff, row, obj, done: false });
    }
    for (const def of seg.obstacles) {
      const obj = this.makeObstacle(def.type);
      const bx = laneX(def.lane); obj.position.set(bx, 0, def.z + zOff); this.scene.add(obj);
      this.items.push({ k: 'obs', z: def.z + zOff, def, obj, done: false, lastHit: -9, baseX: bx });
    }
    for (const def of seg.pickups) {
      const obj = this.makePickup(def.count);
      obj.position.set(laneX(def.lane), 0, def.z + zOff); this.scene.add(obj);
      this.items.push({ k: 'pick', z: def.z + zOff, def, obj, done: false });
    }
    for (const sp of seg.enemies) this.items.push({ k: 'enemy', z: sp.z + zOff, spawn: sp, done: false });
    if (seg.boss) this.items.push({ k: 'boss', z: seg.boss.z + zOff, id: seg.boss.id, hp: seg.boss.hp, done: false });
    if (seg.finishZ !== undefined) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.1, 1.5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      f.position.set(0, 0.06, seg.finishZ + zOff); this.scene.add(f);
      this.items.push({ k: 'finish', z: seg.finishZ + zOff, obj: f, done: false });
    }
  }

  private ensureChunks(): void {
    while (this.chunkNext * CHUNK_LEN < this.pz + 2.5 * CHUNK_LEN) {
      const idx = this.chunkNext++;
      const c: Chunk = makeChunk(this.endlessSeed, idx, this.chunkPrev);
      this.chunkPrev = c.template;
      const off = idx * CHUNK_LEN + 30;
      const enemies: EnemySpawn[] = [];
      let boss: Segment['boss'];
      if (c.boss) {
        const k = Math.floor(idx / 10);
        const def = BOSSES[k % BOSSES.length];
        boss = { id: def.id, hp: Math.round(def.hp * (1 + 0.35 * k)), z: CHUNK_LEN - 4 };
      } else if (c.enemy) {
        enemies.push({ z: CHUNK_LEN - 22, kind: c.enemy.kind, count: c.enemy.count });
        if (c.miniBoss) enemies.push({ z: CHUNK_LEN - 22, kind: 'miniboss', count: 1 });
      }
      const pickups: PickupDef[] = [{ z: 48, lane: idx % 3, count: 3 }, { z: 88, lane: (idx + 1) % 3, count: 4 }];
      this.addSegment({ gates: c.gates, obstacles: c.obstacles, pickups, enemies, boss }, off);
    }
  }

  // ------------------------------------------------------------ nesne üreticiler
  private static matCache = new Map<string, THREE.Material>();
  private static mat(color: number, emissive = 0): THREE.MeshStandardMaterial {
    const k = color + ':' + emissive;
    let m = Game.matCache.get(k) as THREE.MeshStandardMaterial | undefined;
    if (!m) { m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? 0.8 : 0, roughness: 0.7 }); Game.matCache.set(k, m); }
    return m;
  }

  private makeGateRow(row: GateRow): THREE.Group {
    const g = new THREE.Group();
    const sides: [GateDef, number][] = [[row.left, -1.6], [row.right, 1.6]];
    for (const [def, x] of sides) {
      const good = def.kind !== 'risk';
      const bg = def.kind === 'risk' ? '#b5179e' : def.kind === 'mul' ? '#1b9aaa' : def.kind === 'add' ? '#2a6fdb' : '#2d9d4f';
      const tex = labelTexture(gateLabel(def), bg);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
      panel.position.set(x, 1.7, 0); panel.rotation.y = Math.PI; // kameraya doğru çevir (metin aynalanmasın)
      const frameMat = Game.mat(good ? 0x9be7ff : 0xff5fd2, good ? 0x113344 : 0x441133);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.0, 0.15), frameMat); l.position.set(x - 1.5, 1.5, 0);
      const r = l.clone(); r.position.x = x + 1.5;
      const t = new THREE.Mesh(new THREE.BoxGeometry(3.15, 0.15, 0.15), frameMat); t.position.set(x, 3, 0);
      g.add(panel, l, r, t);
    }
    return g;
  }

  private makeObstacle(type: ObstacleType): THREE.Object3D {
    const g = new THREE.Group();
    const a = Game.mat(0xff8800); const d = Game.mat(0x222222); const red = Game.mat(0xcc2222, 0x440000);
    switch (type) {
      case 'barrier': { const b = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 0.7), a); b.position.y = 0.65; g.add(b); break; }
      case 'narrow': for (const x of [-0.8, 0.8]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 0.9), d); p.position.set(x, 1.2, 0); g.add(p); } break;
      case 'moving': { const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.0), Game.mat(0xe63946)); b.position.y = 0.7; g.add(b); break; }
      case 'spinner': {
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8), d); hub.position.y = 0.9;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.25, 0.25), red); bar.position.y = 1.0; bar.name = 'spin'; g.add(hub, bar); break;
      }
      case 'damageFloor': { const f = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 6), red); f.position.y = 0.06; g.add(f); break; }
      case 'falling': { const f = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, 2.0), Game.mat(0x8d99ae)); f.position.y = 0.15; f.name = 'fall'; g.add(f); break; }
      case 'trap': for (let i = -1; i <= 1; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 6), Game.mat(0xcfcfcf)); s.position.set(i * 0.55, 0.35, 0); g.add(s); } break;
      case 'turret': { const b = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 1.0), d); b.position.y = 0.4; const br = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 8), red); br.rotation.x = Math.PI / 2; br.position.set(0, 0.9, -0.5); g.add(b, br); break; }
      case 'breakable': { const c = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), Game.mat(0xa47148)); c.position.y = 0.6; g.add(c); break; }
    }
    return g;
  }

  private makePickup(count: number): THREE.Object3D {
    const g = new THREE.Group();
    const s = new THREE.Mesh(figureGeometry({ body: 0x3a86ff, scale: 0.7 }), figureMaterial()); g.add(s);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshBasicMaterial({ map: labelTexture('+' + count, '#2a6fdb'), transparent: true, side: THREE.DoubleSide }));
    tag.position.y = 1.7; tag.rotation.y = Math.PI; g.add(tag);
    return g;
  }

  // ------------------------------------------------------------ ana döngü
  private loop(now: number): void {
    requestAnimationFrame((t) => this.loop(t));
    const minDt = this.save.settings.fps === 30 ? 1000 / 30 - 2 : 0;
    if (this.lastTime && now - this.lastTime < minDt) return;
    const dt = Math.min(0.05, this.lastTime ? (now - this.lastTime) / 1000 : 0.016);
    this.lastTime = now;
    if (!this.paused && (this.phase === 'running' || this.phase === 'battle' || this.phase === 'boss')) this.update(dt);
    this.particles.update(this.paused ? 0 : dt);
    this.render(dt);
  }

  private update(dt: number): void {
    this.time += dt; this.runTime += dt;
    this.armyX += (this.targetX - this.armyX) * Math.min(1, dt * 12);
    this.updateObstacles();

    if (this.phase === 'running') {
      const spd = 9 * this.run.speedMult * (0.6 + 0.4 * this.run.cls.speed);
      this.pz += spd * dt;
      this.processItems();
      if (this.mode.type === 'endless') this.updateEndless(dt);
    } else if (this.phase === 'battle') {
      this.updateBattle(dt);
    } else if (this.phase === 'boss') {
      this.updateBoss(dt);
    }
    // iyileştirici sınıf
    if (this.run.cls.healPerSec > 0 && this.phase !== 'battle') { /* destek birimi savaşta etkindir; yolda sayı sabit kalır */ }

    if (this.phase !== 'ended' && this.run.count <= 0) this.lose();
    this.peakArmy = Math.max(this.peakArmy, this.run.count);
    this.updateHud();
  }

  private updateEndless(dt: number): void {
    this.ensureChunks();
    const m = Math.max(0, this.pz - 30);
    const k = milestonesPassed(this.prevM, m);
    if (k > 0) { this.milestoneCoins += 50 * k; this.toast(`${Math.floor(m / MILESTONE_M) * MILESTONE_M} m! +${50 * k} jeton`, 1800); this.sfx.play('coin'); }
    this.prevM = m;
    addQuestProgress(this.save, 'endlessSec', dt);
    // geride kalan nesneleri sil
    this.items = this.items.filter((it) => {
      if (it.z < this.pz - 40) { if ('obj' in it) this.scene.remove(it.obj); return false; }
      return true;
    });
  }

  private updateObstacles(): void {
    for (const it of this.items) {
      if (it.k !== 'obs' || Math.abs(it.z - this.pz) > 60) continue;
      if (it.def.type === 'moving') it.obj.position.x = it.baseX + Math.sin(this.time * 1.6 + it.z) * 1.3;
      else if (it.def.type === 'spinner') { const s = it.obj.getObjectByName('spin'); if (s) { s.rotation.y = this.time * 4; } }
      else if (it.def.type === 'falling') {
        const f = it.obj.getObjectByName('fall'); if (f) f.position.y = it.z - this.pz < 9 ? Math.max(-3, 0.15 - (9 - (it.z - this.pz)) * 0.3) : 0.15;
      }
    }
  }

  private processItems(): void {
    const defense = defenseReduction(this.save);
    for (const it of this.items) {
      if (it.done || it.z > this.pz + 18) continue;
      switch (it.k) {
        case 'gate': {
          if (this.pz < it.z) break;
          it.done = true;
          const def = this.armyX < 0 ? it.row.left : it.row.right;
          const before = this.run.count;
          const dur = def.kind === 'immune' ? { ...def, value: def.value * abilityTimeMult(this.save) } : def;
          this.run = applyGate(this.run, dur, this.time);
          this.makeArmyMesh();
          this.save.stats.gates++; addQuestProgress(this.save, 'gates', 1);
          const diff = this.run.count - before;
          if (diff > 0) { this.soldiersCollected += diff; this.save.stats.soldiers += diff; addQuestProgress(this.save, 'soldiers', diff); }
          this.sfx.play('gate');
          this.particles.burst(this.armyX, 1.5, this.pz + 1, def.kind === 'risk' ? 0xff4dd2 : 0x7fd8ff, 24, 6);
          this.toast(gateLabel(def) + (diff !== 0 ? `  (${diff > 0 ? '+' : ''}${diff})` : ''), 1100);
          break;
        }
        case 'pick': {
          if (this.pz < it.z - 0.3) break;
          it.done = true;
          if (Math.abs(this.armyX - laneX(it.def.lane)) < 1.6) {
            this.run = collect(this.run, it.def.count); this.soldiersCollected += it.def.count;
            this.save.stats.soldiers += it.def.count; addQuestProgress(this.save, 'soldiers', it.def.count);
            this.sfx.play('collect'); this.particles.burst(it.obj.position.x, 1, it.z, 0x7fd8ff, 10, 3);
          }
          this.scene.remove(it.obj);
          break;
        }
        case 'obs': {
          if (Math.abs(it.z - this.pz) > 1.1 && !(it.def.type === 'damageFloor' && Math.abs(it.z - this.pz) < 3.2)) {
            if (this.pz > it.z + 3.3) it.done = true;
            break;
          }
          const coreR = Math.min(1.5, 0.6 + 0.04 * Math.sqrt(this.run.count));
          const dx = Math.abs(this.armyX - it.obj.position.x);
          const half = it.def.type === 'narrow' ? 1.3 : 1.0;
          if (dx >= half + coreR * 0.5) break;
          if (it.def.type === 'damageFloor') { if (this.time - it.lastHit < 0.5) break; }
          else if (it.def.type === 'falling' && it.z - this.pz > 0) break;
          else it.done = true;
          it.lastHit = this.time;
          const h = applyHit(this.run, OBS_HIT[it.def.type] * (1 - defense), this.time);
          this.run = h.state;
          if (h.absorbed) { this.toast(h.absorbed === 'shield' ? 'Kalkan engeli yuttu!' : 'Bağışıklık!', 900); this.sfx.play('gate'); }
          else {
            this.toast(`${OBS_WHY[it.def.type]}: -${h.lost}`, 1100); this.sfx.play('hit'); this.shake = 0.35;
            this.particles.burst(this.armyX, 1, this.pz + 1, 0xff4040, 16, 5);
            if ('vibrate' in navigator) try { navigator.vibrate(40); } catch { /* yok say */ }
          }
          if (it.def.type === 'breakable') { this.scene.remove(it.obj); this.particles.burst(it.obj.position.x, 0.8, it.z, 0xa47148, 14, 4); }
          break;
        }
        case 'enemy': {
          if (this.pz < it.z - 16) break;
          this.startBattle(it);
          return;
        }
        case 'boss': {
          if (this.pz < it.z - 26) break;
          this.startBoss(it);
          return;
        }
        case 'finish': {
          if (this.pz < it.z) break;
          it.done = true; this.win(false); return;
        }
      }
    }
  }

  // ------------------------------------------------------------ savaş
  private startBattle(first: Item & { k: 'enemy' }): void {
    const group = this.items.filter((i): i is Item & { k: 'enemy' } => i.k === 'enemy' && !i.done && i.z === first.z);
    const groups = group.map((g) => ({ def: ENEMIES[g.spawn.kind], count: g.spawn.count }));
    const res = resolveBattle(this.run, groups);
    const total = groups.reduce((a, g) => a + g.count, 0);
    this.phase = 'battle';
    this.battle = {
      t: 0, dur: Math.max(1.6, Math.min(5, res.seconds * 0.7)), startCount: this.run.count,
      endCount: res.won ? res.survivors : 0, enemyTotal: total, won: res.won, kills: res.kills, items: group,
    };
    // Düşman görselleri
    this.clearEnemyMeshes();
    const cap = this.save.settings.gfx === 'low' ? 40 : 90;
    const sumVis = Math.min(cap, total);
    let placed = 0;
    for (const g of group) {
      const vis = Math.max(1, Math.round((g.spawn.count / total) * sumVis));
      const big = ENEMIES[g.spawn.kind].big;
      const geo = figureGeometry({ body: ENEMIES[g.spawn.kind].color, scale: big ? (g.spawn.kind === 'miniboss' ? 2.4 : 1.1) : 0.55, horns: true, bulky: big });
      const mesh = new THREE.InstancedMesh(geo, figureMaterial(), vis);
      mesh.frustumCulled = false;
      for (let i = 0; i < vis; i++) {
        const o = OFFSETS[(placed + i) % OFFSETS.length];
        this.dummy.position.set(o.x * 1.1, 0, this.pz + 12 + Math.abs(o.z) + 1); this.dummy.rotation.set(0, Math.PI, 0); this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix(); mesh.setMatrixAt(i, this.dummy.matrix);
      }
      placed += vis;
      this.scene.add(mesh); this.enemyMeshes.push({ mesh, total: g.spawn.count, kind: g.spawn.kind });
    }
  }

  private updateBattle(dt: number): void {
    const b = this.battle!;
    b.t += dt;
    const f = Math.min(1, b.t / b.dur);
    this.run = { ...this.run, count: Math.max(b.won ? b.endCount : 0, Math.round(b.startCount + (b.endCount - b.startCount) * f)) };
    const remaining = Math.ceil(b.enemyTotal * (1 - (b.won ? f : f * 0.6)));
    // görünen düşman sayısı: gerçek orana göre
    for (const e of this.enemyMeshes) {
      const shown = Math.max(0, Math.ceil(e.mesh.instanceMatrix.count * (remaining / b.enemyTotal)));
      e.mesh.count = shown;
    }
    if (Math.random() < dt * 14) {
      this.particles.burst(this.armyX + (Math.random() - 0.5) * 3, 1.2, this.pz + 3 + Math.random() * 8, 0xffe066, 2, 3);
      this.sfx.play('enemyHit');
    }
    this.hud.count.textContent = `${this.run.count}  ⚔  ${remaining}`;
    if (f >= 1) {
      if (b.won) {
        this.kills += b.kills; this.save.stats.enemiesKilled += 0;
        this.run = { ...this.run, count: b.endCount };
        b.items.forEach((i) => { i.done = true; });
        this.finishBattleVisuals(true); this.battle = null; this.phase = 'running';
        this.sfx.play('coin'); this.toast(`Zafer! ${b.kills} düşman yenildi`, 1200);
      } else {
        this.run = { ...this.run, count: 0 };
      }
    }
  }

  private finishBattleVisuals(burst = false): void {
    if (burst) for (const e of this.enemyMeshes) this.particles.burst(this.armyX, 1.5, this.pz + 12, ENEMIES[e.kind].color, 30, 7);
    this.clearEnemyMeshes();
  }

  // ------------------------------------------------------------ boss
  private startBoss(it: Item & { k: 'boss' }): void {
    const base = getBoss(it.id);
    const def: BossDef = { ...base, hp: it.hp };
    const mesh = makeBoss(def.color);
    mesh.group.position.set(0, 0, it.z); this.scene.add(mesh.group);
    this.boss = { def, st: newBoss(def), mesh, t: 0, nextAttack: 3, atk: null, weakLane: 1, weakUntil: 0, nextWeak: 4, item: it };
    this.phase = 'boss';
    this.hud.bossbar.style.display = 'block'; this.hud.bossfill.style.width = '100%';
    this.toast(def.name + '!', 1800); this.sfx.play('warn');
  }

  private updateBoss(dt: number): void {
    const B = this.boss!; B.t += dt;
    // ordu boss önünde durur
    this.pz += (B.item.z - 24 - this.pz) * Math.min(1, dt * 3);
    const lane = laneOf(this.armyX);
    // hasar: zayıf noktaya hizalıysa çarpan
    const weak = B.t < B.weakUntil && lane === B.weakLane;
    const dps = this.run.count * this.run.cls.atk * this.run.atkMult * this.run.cls.rate * this.run.rateMult;
    B.st = damageBoss(B.st, dps * dt * (this.run.cls.id === 'rocket' ? 1.5 : 1), weak);
    this.hud.bossfill.style.width = Math.max(0, (B.st.hp / B.def.hp) * 100) + '%';
    if (Math.random() < dt * 10) this.particles.burst(B.mesh.group.position.x + (Math.random() - 0.5) * 4, 4 + Math.random() * 4, B.item.z - 2.4, weak ? 0xffd60a : 0xffe066, 2, 3);

    // zayıf nokta: periyodik olarak bir şeritte belirir
    if (B.t >= B.nextWeak) { B.weakLane = Math.floor(Math.random() * 3); B.weakUntil = B.t + 3; B.nextWeak = B.t + 7; }
    B.mesh.weak.visible = B.t < B.weakUntil;
    B.mesh.weak.position.x = Math.max(-2.8, Math.min(2.8, laneX(B.weakLane))) ;
    B.mesh.weak.scale.setScalar(1 + 0.2 * Math.sin(B.t * 10));

    // saldırılar
    const phase = B.def.phases[B.st.phase];
    if (!B.atk && B.t >= B.nextAttack) {
      const id = phase.attacks[Math.floor(Math.random() * phase.attacks.length)];
      const a = B.def.attacks.find((x) => x.id === id)!;
      B.atk = { a, at: B.t + a.telegraphSec };
      this.sfx.play('warn'); this.toast('⚠ ' + a.name, a.telegraphSec * 1000);
    }
    const tl = this.tele;
    if (B.atk) {
      const left = B.atk.at - B.t;
      tl.forEach((m, l) => {
        m.visible = B.atk!.a.lanes.includes(l);
        m.position.z = this.pz + 12;
        (m.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.3 * Math.abs(Math.sin(B.t * 12));
      });
      B.mesh.group.position.y = Math.sin(B.t * 20) * 0.1;
      B.mesh.arm.rotation.z = Math.max(0, 1 - left) * 0.5;
      if (left <= 0) {
        const hit = bossAttackHits(B.atk.a, lane);
        this.sfx.play('bossAttack'); this.shake = 0.5;
        if (hit) {
          const h = applyHit(this.run, B.atk.a.damageFrac * (1 - defenseReduction(this.save)), this.time);
          this.run = h.state;
          this.toast(h.absorbed ? 'Saldırı engellendi!' : `${B.atk.a.name}: -${h.lost}`, 1200);
          this.particles.burst(this.armyX, 1, this.pz + 1, 0xff3030, 24, 6);
        } else this.toast('Kaçtın!', 800);
        tl.forEach((m) => { m.visible = false; });
        B.atk = null; B.nextAttack = B.t + phase.intervalSec; B.mesh.arm.rotation.z = 0;
      }
    }
    if (B.st.defeated) {
      this.sfx.play('bossDown'); this.particles.burst(B.mesh.group.position.x, 6, B.item.z, B.def.color, 120, 12);
      this.bossesKilled++; this.kills += 1;
      this.scene.remove(B.mesh.group); tl.forEach((m) => { m.visible = false; });
      this.hud.bossbar.style.display = 'none'; B.item.done = true;
      this.boss = null;
      if (this.mode.type === 'level') { this.win(true); }
      else {
        this.phase = 'running'; this.toast('Boss yenildi! +100 jeton', 1800); this.milestoneCoins += 100;
        this.save.stats.bossesKilled++; addQuestProgress(this.save, 'bosses', 1);
      }
    }
  }

  // ------------------------------------------------------------ bitiş
  private win(bossDefeated: boolean): void {
    if (this.mode.type !== 'level') return;
    this.phase = 'ended';
    const id = this.mode.id;
    this.save.stats.playSec += this.runTime;
    const out = completeLevel(this.save, id, this.kills, this.run.count, bossDefeated);
    const l = getLevel(id);
    let crystals = out.crystals;
    const bossDef = l.boss ? getBoss(l.boss) : undefined;
    if (bossDefeated && bossDef) {
      earnCoins(this.save, bossDef.reward);
      if (bossDef.rareCosmetic && !this.save.cosmetics.includes(bossDef.rareCosmetic)) this.save.cosmetics.push(bossDef.rareCosmetic);
    }
    checkAchievements(this.save);
    this.sfx.play('win'); this.hooks.persist();
    this.hooks.onEnd({
      mode: 'level', win: true, levelId: id, kills: this.kills, survivors: this.run.count,
      coins: out.coins + (bossDefeated && bossDef ? bossDef.reward : 0), crystals,
      bossDefeated, distance: 0, bestArmy: this.peakArmy, canContinue: false, newRecord: false,
    });
  }

  private lose(): void {
    this.phase = 'ended';
    this.sfx.play('lose');
    const dist = Math.max(0, Math.floor(this.pz - 30));
    const info: EndInfo = {
      mode: this.mode.type, win: false, levelId: this.mode.type === 'level' ? this.mode.id : undefined,
      kills: this.kills, survivors: 0, coins: 0, crystals: 0, bossDefeated: false, distance: dist,
      bestArmy: this.peakArmy, canContinue: this.canContinue, newRecord: false,
    };
    this.save.stats.playSec += this.runTime;
    this.save.stats.enemiesKilled += this.kills;
    addQuestProgress(this.save, 'kills', this.kills);
    this.save.stats.bestArmy = Math.max(this.save.stats.bestArmy, this.peakArmy);
    if (this.mode.type === 'endless') {
      const coins = chunkRewardCoins(dist) + this.milestoneCoins + Math.floor(this.kills * ECONOMY.coinsPerKill);
      earnCoins(this.save, coins); info.coins = coins;
      info.newRecord = dist > this.save.endless.bestDistance;
      this.save.endless.bestDistance = Math.max(this.save.endless.bestDistance, dist);
      this.save.endless.bestArmy = Math.max(this.save.endless.bestArmy, this.peakArmy);
      this.save.stats.bossesKilled += 0;
    } else {
      const coins = Math.floor(this.kills * ECONOMY.coinsPerKill);
      earnCoins(this.save, coins); info.coins = coins;
    }
    checkAchievements(this.save);
    this.hooks.persist();
    this.hooks.onEnd(info);
  }

  // ------------------------------------------------------------ çizim / arayüz
  private render(dt: number): void {
    // ordu örnekleri
    if (this.armyMesh) {
      const vis = Math.min(this.run ? this.run.count : 0, this.save.settings.gfx === 'low' ? 60 : 150);
      const spread = vis > 80 ? 0.85 : 1;
      for (let i = 0; i < vis; i++) {
        const o = OFFSETS[i];
        const bob = this.phase === 'ended' ? 0 : Math.abs(Math.sin(this.time * 9 + i * 1.7)) * 0.12;
        this.dummy.position.set(this.armyX + o.x * spread, bob, this.pz + o.z * spread);
        this.dummy.rotation.set(0, Math.sin(this.time * 3 + i) * 0.06, 0); this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix(); this.armyMesh.setMatrixAt(i, this.dummy.matrix);
      }
      this.armyMesh.count = vis; this.armyMesh.instanceMatrix.needsUpdate = true;
    }
    // zemin ve dekor takibi
    const gz = Math.floor(this.pz / 10) * 10;
    this.ground.position.set(0, 0, gz + 120);
    this.outer.position.set(0, -0.05, gz + 120);
    if (this.props) {
      for (let i = 0; i < this.propZ.length; i++) if (this.propZ[i] < this.pz - 25) this.placeProp(i, this.propZ[i] + 220);
      this.props.instanceMatrix.needsUpdate = true;
    }
    this.sun.position.set(-8, 18, this.pz - 6); this.sun.target.position.set(0, 0, this.pz + 10);
    // kamera
    const boss = this.phase === 'boss';
    const wantY = boss ? 13 : 8.5; const wantBack = boss ? 17 : 11; const look = boss ? 12 : 15;
    const k = Math.min(1, dt * 4);
    const cx = this.armyX * 0.55;
    this.camera.position.x += (cx - this.camera.position.x) * k;
    this.camera.position.y += (wantY - this.camera.position.y) * k;
    this.camera.position.z += (this.pz - wantBack - this.camera.position.z) * Math.min(1, dt * 8);
    if (this.shake > 0) { this.camera.position.x += (Math.random() - 0.5) * this.shake; this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.5; this.shake = Math.max(0, this.shake - dt * 1.4); }
    this.camera.lookAt(this.armyX * 0.3, 0, this.pz + look);
    this.renderer.render(this.scene, this.camera);
  }

  private updateHud(): void {
    if (this.phase !== 'battle') this.hud.count.textContent = String(this.run.count);
    if (this.mode.type === 'level') {
      const total = Math.max(1, this.levelLength + (this.items.some((i) => i.k === 'boss') || this.boss ? 24 : 0));
      this.hud.prog.style.width = Math.min(100, (this.pz / total) * 100) + '%';
    } else {
      this.hud.prog.style.width = ((this.pz % 500) / 5) + '%';
      this.hud.level.textContent = `Sonsuz  ${Math.max(0, Math.floor(this.pz - 30))} m`;
    }
  }

  private toast(text: string, ms: number): void {
    const t = this.hud.toast; t.textContent = text; t.style.opacity = '1';
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { t.style.opacity = '0'; }, ms);
  }
}
