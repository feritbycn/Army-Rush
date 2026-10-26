// Denge için otomatik oynatıcı: her kapı satırında en iyi (veya en kötü) seçeneği seçer, engelleri ve
// ödül toplamayı yok sayar (muhafazakâr). Bölüm kalibrasyonunda ve testlerde kullanılır.
import { ENEMIES, getBoss } from '../data/enemies';
import type { LevelDef } from '../data/levels';
import { applyGate, type GateDef, type RunState } from './army';
import { resolveBattle } from './combat';

const score = (s: RunState) => s.count * s.atkMult * s.rateMult * s.hpMult;

export type Policy = 'best' | 'worst';

export function chooseGate(s: RunState, l: GateDef, r: GateDef, policy: Policy = 'best'): GateDef {
  const a = score(applyGate(s, l)); const b = score(applyGate(s, r));
  return policy === 'best' ? (a >= b ? l : r) : (a <= b ? l : r);
}

export interface SimResult { won: boolean; finalCount: number; bossSeconds?: number; state: RunState }

type Ev = { z: number; kind: 'gate' | 'enemy'; i: number };

function groupedEvents(level: LevelDef): Ev[][] {
  const evs: Ev[] = [
    ...level.gates.map((g, i) => ({ z: g.z, kind: 'gate' as const, i })),
    ...level.enemies.map((e, i) => ({ z: e.z, kind: 'enemy' as const, i })),
  ].sort((a, b) => a.z - b.z || (a.kind === 'gate' ? -1 : 1));
  const grouped: Ev[][] = [];
  for (const e of evs) {
    const last = grouped[grouped.length - 1];
    if (e.kind === 'enemy' && last && last[0].kind === 'enemy' && last[0].z === e.z) last.push(e);
    else grouped.push([e]);
  }
  return grouped;
}

/** stopAtEnemyZ verilirse, o z'deki savaştan hemen önceki durumu döndürür. */
export function simulateLevel(level: LevelDef, start: RunState, policy: Policy = 'best', stopAtEnemyZ?: number): SimResult {
  let s = start;
  for (const grp of groupedEvents(level)) {
    if (grp[0].kind === 'gate') {
      const g = level.gates[grp[0].i];
      s = applyGate(s, chooseGate(s, g.left, g.right, policy));
    } else {
      if (stopAtEnemyZ !== undefined && grp[0].z === stopAtEnemyZ) return { won: true, finalCount: s.count, state: s };
      const groups = grp.map((e) => ({ def: ENEMIES[level.enemies[e.i].kind], count: level.enemies[e.i].count }));
      const r = resolveBattle(s, groups);
      if (!r.won) return { won: false, finalCount: 0, state: { ...s, count: 0 } };
      s = { ...s, count: r.survivors };
    }
  }
  if (level.boss) {
    const b = getBoss(level.boss);
    const dps = s.count * s.cls.atk * s.atkMult * s.cls.rate * s.rateMult * (1 - b.armor);
    const secs = (level.bossHp ?? b.hp) / Math.max(1, dps);
    return { won: secs <= 45, finalCount: s.count, bossSeconds: secs, state: s };
  }
  return { won: s.count > 0, finalCount: s.count, state: s };
}
