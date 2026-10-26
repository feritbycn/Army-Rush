export type EnemyKind = 'normal' | 'fast' | 'armored' | 'ranged' | 'heavy' | 'miniboss';

export interface EnemyDef {
  id: EnemyKind;
  name: string;
  hp: number;
  atk: number;
  rate: number;
  armor: number;
  big: boolean; // roketler büyük hedeflere bonus verir
  color: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  normal: { id: 'normal', name: 'Piyade', hp: 60, atk: 6, rate: 1, armor: 0, big: false, color: 0xd62828 },
  fast: { id: 'fast', name: 'Akıncı', hp: 40, atk: 5, rate: 1.6, armor: 0, big: false, color: 0xf48c06 },
  armored: { id: 'armored', name: 'Zırhlı', hp: 110, atk: 5, rate: 0.9, armor: 0.3, big: false, color: 0x6c757d },
  ranged: { id: 'ranged', name: 'Nişancı', hp: 45, atk: 11, rate: 0.7, armor: 0, big: false, color: 0xc77dff },
  heavy: { id: 'heavy', name: 'Savaş Makinesi', hp: 420, atk: 22, rate: 0.6, armor: 0.25, big: true, color: 0x495057 },
  miniboss: { id: 'miniboss', name: 'Mini Boss', hp: 1800, atk: 40, rate: 0.7, armor: 0.2, big: true, color: 0x9d0208 },
};

export interface BossAttack {
  id: string;
  name: string;
  telegraphSec: number; // uyarı süresi
  damageFrac: number; // ordudan kaybedilecek oran
  lanes: number[]; // vurulan şeritler (0,1,2)
}

export interface BossPhase {
  hpBelow: number; // bu orandan düşünce faz başlar (1 = başlangıç)
  intervalSec: number;
  attacks: string[];
}

export interface BossDef {
  id: string;
  name: string;
  hp: number;
  weakSpotMult: number;
  armor: number;
  attacks: BossAttack[];
  phases: BossPhase[];
  color: number;
  reward: number;
  rareCosmetic?: string;
}

const A = {
  sweepLeft: { id: 'sweepLeft', name: 'Sol Süpürme', telegraphSec: 1.2, damageFrac: 0.3, lanes: [0, 1] },
  sweepRight: { id: 'sweepRight', name: 'Sağ Süpürme', telegraphSec: 1.2, damageFrac: 0.3, lanes: [1, 2] },
  slam: { id: 'slam', name: 'Yer Darbesi', telegraphSec: 1.0, damageFrac: 0.35, lanes: [1] },
  barrage: { id: 'barrage', name: 'Yağmur Atışı', telegraphSec: 0.9, damageFrac: 0.25, lanes: [0, 2] },
  beam: { id: 'beam', name: 'Enerji Işını', telegraphSec: 0.8, damageFrac: 0.4, lanes: [0] },
} satisfies Record<string, BossAttack>;

function boss(id: string, name: string, hp: number, color: number, reward: number, rare?: string): BossDef {
  return {
    id, name, hp, weakSpotMult: 2, armor: 0.15, color, reward, rareCosmetic: rare,
    attacks: [A.sweepLeft, A.sweepRight, A.slam, A.barrage, A.beam],
    phases: [
      { hpBelow: 1, intervalSec: 4, attacks: ['sweepLeft', 'sweepRight'] },
      { hpBelow: 0.66, intervalSec: 3.2, attacks: ['slam', 'sweepLeft', 'sweepRight'] },
      { hpBelow: 0.33, intervalSec: 2.6, attacks: ['barrage', 'slam', 'beam'] },
    ],
  };
}

export const BOSSES: BossDef[] = [
  boss('b10', 'Çöl Devi', 9000, 0xb08968, 300),
  boss('b15', 'Orman Bekçisi', 16000, 0x386641, 400),
  boss('b20', 'Buz Golemi', 26000, 0x90e0ef, 500, 'skin_frost'),
  boss('b25', 'Magma Titanı', 40000, 0xe85d04, 650),
  boss('b30', 'Çekirdek Yöneticisi', 65000, 0x7209b7, 900, 'skin_core'),
];

export function getBoss(id: string): BossDef {
  const b = BOSSES.find((x) => x.id === id);
  if (!b) throw new Error('Bilinmeyen boss: ' + id);
  return b;
}
