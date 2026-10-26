import type { RunState } from './army';
import type { BossAttack, BossDef, EnemyDef } from '../data/enemies';

export interface EnemyGroup { def: EnemyDef; count: number }

export interface BattleResult {
  won: boolean;
  survivors: number;
  kills: number;
  seconds: number;
}

/**
 * Deterministik toplu savaş. Ekranda gösterilen birlik sayısı = hesaptaki sayıdır;
 * görsel temsil sınırlı olabilir ama sayı (etiket) her zaman gerçek değerdir.
 */
export function resolveBattle(run: RunState, groups: EnemyGroup[], maxSeconds = 120): BattleResult {
  const dt = 0.1;
  const unitHp = run.cls.hp * run.hpMult;
  let armyHp = run.count * unitHp;
  const startCount = run.count;
  const pools = groups.map((g) => ({ g, hp: g.count * g.def.hp }));
  let totalKills = 0;
  let t = 0;

  const aliveEnemies = () => pools.reduce((s, p) => s + Math.ceil(p.hp / p.g.def.hp - 1e-9), 0);

  while (t < maxSeconds) {
    const count = Math.ceil(armyHp / unitHp - 1e-9);
    if (count <= 0 || aliveEnemies() <= 0) break;

    // Ordunun hasarı sırayla gruplara uygulanır.
    let dmg = count * run.cls.atk * run.atkMult * run.cls.rate * run.rateMult * dt;
    for (const p of pools) {
      if (dmg <= 0) break;
      if (p.hp <= 0) continue;
      const bonus = run.cls.id === 'rocket' && p.g.def.big ? 1.5 : 1;
      const eff = dmg * bonus * (run.cls.id === 'energy' ? 1 : 1 - p.g.def.armor) ;
      const dealt = Math.min(p.hp, eff);
      p.hp -= dealt;
      dmg -= dealt / (bonus * (run.cls.id === 'energy' ? 1 : 1 - p.g.def.armor));
    }

    // Düşman hasarı.
    let edmg = 0;
    for (const p of pools) {
      const alive = Math.ceil(p.hp / p.g.def.hp - 1e-9);
      edmg += alive * p.g.def.atk * p.g.def.rate * dt;
    }
    edmg *= 1 - run.cls.armor;
    const heal = count * run.cls.healPerSec * dt;
    armyHp = Math.min(startCount * unitHp, armyHp - edmg + heal);
    t += dt;
  }

  for (const p of pools) totalKills += p.g.count - Math.ceil(p.hp / p.g.def.hp - 1e-9);
  const survivors = Math.max(0, Math.ceil(armyHp / unitHp - 1e-9));
  const won = aliveEnemies() <= 0 && survivors > 0;
  return { won, survivors: won ? survivors : 0, kills: Math.max(0, totalKills), seconds: t };
}

// ---------------- Boss ----------------

export interface BossState {
  def: BossDef;
  hp: number;
  phase: number; // 0,1,2
  defeated: boolean;
}

export function newBoss(def: BossDef): BossState {
  return { def, hp: def.hp, phase: 0, defeated: false };
}

export function bossPhaseFor(def: BossDef, hp: number): number {
  const frac = hp / def.hp;
  let phase = 0;
  def.phases.forEach((p, i) => { if (frac < p.hpBelow || i === 0) phase = i; });
  return phase;
}

/** Boss'a hasar ver. Zayıf noktaya isabet hasarı çarpar. */
export function damageBoss(b: BossState, rawDamage: number, weakSpot = false): BossState {
  if (b.defeated) return b;
  const dmg = rawDamage * (weakSpot ? b.def.weakSpotMult : 1) * (1 - b.def.armor);
  const hp = Math.max(0, b.hp - dmg);
  return { ...b, hp, phase: bossPhaseFor(b.def, hp), defeated: hp <= 0 };
}

/** Oyuncu şeridi saldırı şeritlerinin dışındaysa saldırıdan kaçmıştır. */
export function bossAttackHits(a: BossAttack, playerLane: number): boolean {
  return a.lanes.includes(playerLane);
}
