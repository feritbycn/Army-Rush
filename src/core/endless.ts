// Sonsuz mod: tohumlu prosedürel parkur parçaları, kademeli zorluk.
import type { GateDef } from './army';
import { MAX_ARMY } from './army';
import { makeRng, pick } from './rng';
import type { EnemyKind } from '../data/enemies';
import type { GateRow, ObstacleDef, ObstacleType } from '../data/levels';

export const CHUNK_LEN = 135;
export const BOSS_EVERY = 10; // her 10 parçada bir boss
export const MINIBOSS_EVERY = 5;

/** Zorluk: logaritmik artış, sınırlı. */
export function difficultyAt(chunk: number): number {
  return Math.min(12, 1 + 2.2 * Math.log(1 + chunk / 4));
}

export interface Chunk {
  index: number;
  template: number;
  gates: GateRow[];
  obstacles: ObstacleDef[];
  enemy?: { kind: EnemyKind; count: number };
  boss?: boolean;
  miniBoss?: boolean;
}

const TEMPLATES = 6;
const OBST: ObstacleType[] = ['barrier', 'narrow', 'moving', 'damageFloor', 'spinner', 'breakable', 'trap', 'falling', 'turret'];
const GOOD: GateDef[] = [
  { kind: 'add', value: 10 }, { kind: 'add', value: 25 }, { kind: 'mul', value: 2 }, { kind: 'mul', value: 3 },
  { kind: 'atk', value: 0.25 }, { kind: 'rate', value: 0.2 }, { kind: 'hp', value: 0.25 }, { kind: 'shield', value: 1 },
];

export function makeChunk(seed: number, index: number, prevTemplate = -1): Chunk {
  const rng = makeRng(seed * 1000003 + index * 7919);
  let template = Math.floor(rng() * TEMPLATES);
  if (template === prevTemplate) template = (template + 1 + Math.floor(rng() * (TEMPLATES - 1))) % TEMPLATES; // arka arkaya aynı şablon yok
  const d = difficultyAt(index);
  const gates: GateRow[] = [];
  for (let i = 0; i < 3; i++) {
    const a = pick(rng, GOOD); const b = pick(rng, GOOD);
    gates.push({ z: 20 + i * 40, left: a, right: rng() < 0.15 && index > 3 ? { kind: 'risk', value: 0.2, risky: true } : b });
  }
  const obstacles: ObstacleDef[] = [];
  const nObs = Math.min(4, 1 + Math.floor(d / 3));
  const typePool = OBST.slice(0, Math.min(OBST.length, 2 + Math.floor(index / 2)));
  for (let i = 0; i < nObs; i++) obstacles.push({ z: 30 + i * 28, lane: Math.floor(rng() * 3), type: pick(rng, typePool) });

  const boss = (index + 1) % BOSS_EVERY === 0;
  const miniBoss = !boss && (index + 1) % MINIBOSS_EVERY === 0;
  const kinds: EnemyKind[] = ['normal', 'fast', 'armored', 'ranged', 'heavy'];
  const count = Math.min(MAX_ARMY, Math.round(10 + d * 14));
  return {
    index, template, gates, obstacles,
    enemy: boss ? undefined : { kind: pick(rng, kinds.slice(0, Math.min(5, 1 + Math.floor(index / 3)))), count },
    boss: boss || undefined, miniBoss: miniBoss || undefined,
  };
}

export function chunkRewardCoins(distanceM: number): number {
  return Math.floor(distanceM / 100) * 8;
}

/** Kilometre taşı ödülleri (her 500 m). */
export const MILESTONE_M = 500;
export function milestonesPassed(prevM: number, nowM: number): number {
  return Math.max(0, Math.floor(nowM / MILESTONE_M) - Math.floor(prevM / MILESTONE_M));
}
