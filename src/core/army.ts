import { getClass, type SoldierClass } from '../data/soldiers';

/** Hesap ve ekran için sert üst sınır — taşma ve performans sorunlarını önler. */
export const MAX_ARMY = 5000;

export type GateKind = 'add' | 'mul' | 'atk' | 'rate' | 'shield' | 'speed' | 'hp' | 'immune' | 'risk';

export interface GateDef {
  kind: GateKind;
  value: number; // add: +N, mul: ×N, atk/rate/hp: oran (0.25 = +%25), immune: saniye, risk: kaybedilen oran
  risky?: boolean;
}

export interface RunState {
  count: number;
  atkMult: number;
  rateMult: number;
  hpMult: number;
  speedMult: number;
  shield: number; // kalan kalkan hakkı (bir çarpışmayı yutar)
  immuneUntil: number; // saniye cinsinden oyun zamanı
  cls: SoldierClass;
}

export function newRunState(count: number, classId = 'standard'): RunState {
  return {
    count: clampCount(count),
    atkMult: 1, rateMult: 1, hpMult: 1, speedMult: 1,
    shield: 0, immuneUntil: 0, cls: getClass(classId),
  };
}

export function clampCount(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_ARMY, Math.floor(n)));
}

/** Kapı saf fonksiyondur: yeni bir durum döndürür. 10 × 3 = 30. */
export function applyGate(s: RunState, g: GateDef, now = 0): RunState {
  const n: RunState = { ...s };
  switch (g.kind) {
    case 'add': n.count = clampCount(s.count + g.value); break;
    case 'mul': n.count = clampCount(s.count * g.value); break;
    case 'atk': n.atkMult = s.atkMult * (1 + g.value); break;
    case 'rate': n.rateMult = s.rateMult * (1 + g.value); break;
    case 'hp': n.hpMult = s.hpMult * (1 + g.value); break;
    case 'speed': n.speedMult = Math.min(2, s.speedMult * (1 + g.value)); break;
    case 'shield': n.shield = s.shield + Math.max(1, Math.floor(g.value)); break;
    case 'immune': n.immuneUntil = Math.max(s.immuneUntil, now + g.value); break;
    case 'risk': {
      // Riskli kapı: ordunun bir kısmını kaybet, karşılığında güçlü saldırı bonusu al.
      const lost = Math.ceil(s.count * g.value);
      n.count = clampCount(Math.max(1, s.count - lost));
      n.atkMult = s.atkMult * 1.5;
      n.rateMult = s.rateMult * 1.2;
      break;
    }
  }
  return n;
}

export function gateLabel(g: GateDef): string {
  switch (g.kind) {
    case 'add': return `+${g.value}`;
    case 'mul': return `×${g.value}`;
    case 'atk': return `Saldırı +%${Math.round(g.value * 100)}`;
    case 'rate': return `Ateş +%${Math.round(g.value * 100)}`;
    case 'hp': return `Can +%${Math.round(g.value * 100)}`;
    case 'speed': return `Hız +%${Math.round(g.value * 100)}`;
    case 'shield': return 'Kalkan';
    case 'immune': return `Bağışıklık ${g.value}sn`;
    case 'risk': return `Risk: -%${Math.round(g.value * 100)} / güç ↑`;
  }
}

export type HitResult = { state: RunState; lost: number; absorbed: 'immune' | 'shield' | null };

/** Engel / tuzak hasarı. frac = ordunun kaybedeceği oran. */
export function applyHit(s: RunState, frac: number, now: number): HitResult {
  if (now < s.immuneUntil) return { state: s, lost: 0, absorbed: 'immune' };
  if (s.shield > 0) return { state: { ...s, shield: s.shield - 1 }, lost: 0, absorbed: 'shield' };
  const lost = Math.min(s.count, Math.max(1, Math.ceil(s.count * frac)));
  return { state: { ...s, count: s.count - lost }, lost, absorbed: null };
}

/** Yoldaki asker toplama. */
export function collect(s: RunState, n: number): RunState {
  return { ...s, count: clampCount(s.count + n) };
}
