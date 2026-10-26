import type { GateDef } from '../core/army';
import { newRunState } from '../core/army';
import { resolveBattle } from '../core/combat';
import { makeRng, pick, type Rng } from '../core/rng';
import { simulateLevel } from '../core/sim';
import { ENEMIES, getBoss, type EnemyKind } from './enemies';

export type EnvId = 'desert' | 'forest' | 'snow' | 'volcano' | 'scifi' | 'night' | 'factory' | 'space' | 'ruins';

export interface EnvDef { id: EnvId; name: string; ground: number; sky: number; fog: number; light: number; accent: number }

export const ENVS: Record<EnvId, EnvDef> = {
  desert: { id: 'desert', name: 'Çöl', ground: 0xd9b26f, sky: 0xf2d8a7, fog: 0xf2d8a7, light: 0xfff1c9, accent: 0xb5651d },
  forest: { id: 'forest', name: 'Yeşil Vadi', ground: 0x4f9d4f, sky: 0x9ad1ff, fog: 0xb7e0c4, light: 0xffffff, accent: 0x2d6a4f },
  snow: { id: 'snow', name: 'Karlı Dağlar', ground: 0xe9f5fb, sky: 0xcfe8f7, fog: 0xdcecf5, light: 0xdbefff, accent: 0x74b3ce },
  volcano: { id: 'volcano', name: 'Volkanik Bölge', ground: 0x3b2a2a, sky: 0x5a1e12, fog: 0x6b2a18, light: 0xff9966, accent: 0xff5400 },
  scifi: { id: 'scifi', name: 'Bilim Kurgu Üssü', ground: 0x2b3a55, sky: 0x0e1b33, fog: 0x13284a, light: 0x9ad7ff, accent: 0x00e5ff },
  night: { id: 'night', name: 'Gece Savaş Alanı', ground: 0x2a3a2a, sky: 0x060b18, fog: 0x0b1224, light: 0x6c8cff, accent: 0xffd166 },
  factory: { id: 'factory', name: 'Fabrika', ground: 0x555b61, sky: 0x2f343a, fog: 0x3a4047, light: 0xffe6b3, accent: 0xffb703 },
  space: { id: 'space', name: 'Uzay İstasyonu', ground: 0x1d2433, sky: 0x02030a, fog: 0x050814, light: 0xc9d6ff, accent: 0x7b2cbf },
  ruins: { id: 'ruins', name: 'Terk Edilmiş Şehir', ground: 0x6a6a6a, sky: 0x8a8f98, fog: 0x8a8f98, light: 0xe0e0e0, accent: 0xa68a64 },
};

const ENV_ORDER: EnvId[] = ['desert', 'forest', 'snow', 'volcano', 'scifi', 'night', 'factory', 'space', 'ruins'];

export type ObstacleType = 'barrier' | 'moving' | 'narrow' | 'spinner' | 'damageFloor' | 'falling' | 'trap' | 'turret' | 'breakable';

export interface GateRow { z: number; left: GateDef; right: GateDef; mid?: GateDef }
export interface ObstacleDef { z: number; lane: number; type: ObstacleType }
export interface EnemySpawn { z: number; kind: EnemyKind; count: number }
export interface PickupDef { z: number; lane: number; count: number }

export interface LevelDef {
  id: number;
  env: EnvId;
  length: number;
  startCount: number;
  gates: GateRow[];
  obstacles: ObstacleDef[];
  pickups: PickupDef[];
  enemies: EnemySpawn[]; // savaş bölgeleri: son grup bitiş çizgisindedir
  boss?: string; // BossDef id
  bossHp?: number; // kalibre edilmiş boss sağlığı (yoksa BossDef.hp)
  miniBoss?: boolean;
  difficulty: number; // 1..10
  reward: number;
  unlockAfter: number; // önceki bölüm id (0 = baştan açık)
  tutorial?: string;
}

const POS: GateDef[] = [
  { kind: 'add', value: 5 }, { kind: 'add', value: 10 }, { kind: 'add', value: 25 }, { kind: 'add', value: 50 },
];
const MUL: GateDef[] = [{ kind: 'mul', value: 2 }, { kind: 'mul', value: 3 }, { kind: 'mul', value: 5 }];
const BUFF: GateDef[] = [
  { kind: 'atk', value: 0.25 }, { kind: 'rate', value: 0.2 }, { kind: 'shield', value: 1 },
  { kind: 'speed', value: 0.15 }, { kind: 'hp', value: 0.25 }, { kind: 'immune', value: 5 },
];
const RISKY: GateDef[] = [{ kind: 'risk', value: 0.2, risky: true }];

const OBSTACLE_UNLOCK: [ObstacleType, number][] = [
  ['barrier', 3], ['narrow', 6], ['moving', 8], ['damageFloor', 11], ['spinner', 13],
  ['breakable', 16], ['trap', 18], ['falling', 21], ['turret', 24],
];

function gatePair(rng: Rng, lvl: number): { left: GateDef; right: GateDef } {
  const small = POS.slice(0, 2);
  let a: GateDef; let b: GateDef;
  if (lvl === 1) {
    a = pick(rng, small); b = pick(rng, small);
  } else {
    const roll = rng();
    if (lvl >= 9 && roll < 0.12) { a = RISKY[0]; b = pick(rng, POS.slice(1)); }          // risk ↔ güvenli ekleme
    else if (lvl >= 4 && roll < 0.35) { a = pick(rng, BUFF); b = pick(rng, POS.slice(0, 3)); } // güçlendirme ↔ ekleme
    else if (roll < 0.62) { a = pick(rng, lvl >= 15 ? MUL : MUL.slice(0, 2)); b = pick(rng, POS.slice(1)); } // çarpan ↔ büyük ekleme
    else { a = pick(rng, POS); b = pick(rng, POS); }
  }
  return rng() < 0.5 ? { left: a, right: b } : { left: b, right: a };
}

function buildLevel(id: number): LevelDef {
  const rng = makeRng(id * 7919 + 13);
  const env = ENV_ORDER[Math.floor((id - 1) / 3) % ENV_ORDER.length];
  const length = 260 + id * 10;
  const startCount = 10;
  const rowCount = Math.min(9, 4 + Math.floor(id / 4));
  const rowGap = Math.floor((length - 90) / rowCount);
  const gates: GateRow[] = [];
  for (let i = 0; i < rowCount; i++) {
    const z = 40 + i * rowGap;
    gates.push({ z, ...gatePair(rng, id) });
  }
  const obstacles: ObstacleDef[] = [];
  const available = OBSTACLE_UNLOCK.filter(([, from]) => id >= from).map(([t]) => t);
  if (available.length) {
    const density = Math.min(0.9, 0.25 + (id - 2) * 0.03);
    for (let z = 62; z < length - 70; z += 45) {
      if (rng() < density) {
        const type = pick(rng, available);
        const blocked = Math.floor(rng() * 3);
        // En az bir şerit her zaman boş bırakılır (haksız çarpışma yok).
        obstacles.push({ z, lane: blocked, type });
        if (id >= 12 && rng() < 0.35) obstacles.push({ z, lane: (blocked + 1) % 3, type });
      }
    }
  }
  const pickups: PickupDef[] = [];
  for (let z = 55; z < length - 60; z += 45) {
    if (rng() < 0.6) pickups.push({ z, lane: Math.floor(rng() * 3), count: 2 + Math.floor(rng() * 4) });
  }

  const isBoss = id % 5 === 0 && id >= 10;
  const isMini = id === 5 || (id % 5 === 0 && !isBoss);
  const kinds: EnemyKind[] = ['normal'];
  if (id >= 7) kinds.push('fast');
  if (id >= 10) kinds.push('armored');
  if (id >= 13) kinds.push('ranged');
  if (id >= 17) kinds.push('heavy');

  const enemies: EnemySpawn[] = [];
  const power = 12 + id * 5; // başlangıç tahmini; calibrate() gerçek değeri belirler
  if (id >= 4) {
    enemies.push({ z: length - 10, kind: pick(rng, kinds), count: Math.round(power * 0.8) });
  }
  if (id >= 12) {
    enemies.push({ z: Math.floor(length / 2), kind: pick(rng, kinds), count: Math.round(power * 0.4) });
  }
  if (isMini) enemies.push({ z: length - 10, kind: 'miniboss', count: 1 });

  const bossIds = ['b10', 'b15', 'b20', 'b25', 'b30'];
  const boss = isBoss ? bossIds[(id / 5) - 2] : undefined;

  const tutorials: Record<number, string> = {
    1: 'Parmağını sağa-sola sürükle ve asker topla!',
    2: 'Kapılar ordunu büyütür: ×3 ile 10 asker 30 olur.',
    3: 'Engellerden doğru şeride geçerek kaç.',
    4: 'Düşman ordusuyla savaş otomatik başlar. Ordunu büyük tut!',
    5: 'Mini boss! Güçlü bir orduyla gel.',
  };

  const level: LevelDef = {
    id, env, length, startCount, gates, obstacles, pickups, enemies, boss, miniBoss: isMini || undefined,
    difficulty: Math.min(10, 1 + Math.floor(id / 3.2)),
    reward: 40 + id * 12 + (isBoss ? 150 : 0),
    unlockAfter: id - 1,
    tutorial: tutorials[id],
  };
  calibrate(level);
  return level;
}

/**
 * Düşman sayılarını, "en iyi kapı seçimiyle" oynayan bir oyuncunun savaştan belirli bir oranda asker
 * koruyarak çıkacağı şekilde ayarlar. Oran bölüm numarasıyla düşer: bölüm ilerledikçe pay daralır.
 * Böylece zorluk yalnızca elle yazılmış bir sayı değil, kapı düzeninin sonucudur.
 */
function calibrate(level: LevelDef): void {
  const keep = Math.max(0.3, 0.85 - 0.55 * (level.id / 30));
  const zs = [...new Set(level.enemies.map((e) => e.z))].sort((a, b) => a - b);
  for (const z of zs) {
    const pre = simulateLevel(level, newRunState(level.startCount), 'best', z).state;
    const target = level.enemies.find((e) => e.z === z && e.kind !== 'miniboss');
    if (!target) continue;
    const others = level.enemies.filter((e) => e.z === z && e !== target).map((e) => ({ def: ENEMIES[e.kind], count: e.count }));
    let lo = 1; let hi = 4000;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const r = resolveBattle(pre, [{ def: ENEMIES[target.kind], count: mid }, ...others]);
      if (r.won && r.survivors >= pre.count * keep) lo = mid; else hi = mid - 1;
    }
    target.count = lo;
  }
  if (level.boss) {
    // Boss sağlığı: en iyi oyunla ~22 sn'lik bir boss savaşı (saldırılardan kaçarak) hedeflenir.
    const s = simulateLevel(level, newRunState(level.startCount), 'best').state;
    const def = getBoss(level.boss);
    const dps = s.count * s.cls.atk * s.atkMult * s.cls.rate * s.rateMult * (1 - def.armor);
    level.bossHp = Math.max(def.hp, Math.round(dps * 22));
  }
}

export const LEVEL_COUNT = 30;
export const LEVELS: LevelDef[] = Array.from({ length: LEVEL_COUNT }, (_, i) => buildLevel(i + 1));

export function getLevel(id: number): LevelDef {
  const l = LEVELS[id - 1];
  if (!l) throw new Error('Bilinmeyen bölüm: ' + id);
  return l;
}

export function enemyDefOf(kind: EnemyKind) { return ENEMIES[kind]; }
