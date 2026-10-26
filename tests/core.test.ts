import { describe, expect, it } from 'vitest';
import { MAX_ARMY, applyGate, applyHit, clampCount, collect, newRunState, type GateDef } from '../src/core/army';
import { bossAttackHits, damageBoss, newBoss, resolveBattle } from '../src/core/combat';
import { ENEMIES, BOSSES, getBoss } from '../src/data/enemies';
import { SOLDIER_CLASSES, powerIndex } from '../src/data/soldiers';
import { LEVELS, LEVEL_COUNT } from '../src/data/levels';
import { simulateLevel } from '../src/core/sim';
import { buildStartState } from '../src/core/progress';
import { defaultSave } from '../src/core/save';

const add = (v: number): GateDef => ({ kind: 'add', value: v });
const mul = (v: number): GateDef => ({ kind: 'mul', value: v });

describe('asker toplama ve kapılar', () => {
  it('+N kapısı', () => expect(applyGate(newRunState(10), add(25)).count).toBe(35));
  it('×N kapısı: 10 × 3 = 30', () => expect(applyGate(newRunState(10), mul(3)).count).toBe(30));
  it('×5 ve +50 ardışık', () => expect(applyGate(applyGate(newRunState(10), mul(5)), add(50)).count).toBe(100));
  it('asker toplama', () => expect(collect(newRunState(10), 4).count).toBe(14));
  it('birlik sayısı üst sınırı aşılmaz', () => {
    let s = newRunState(MAX_ARMY - 1);
    s = applyGate(s, mul(5));
    expect(s.count).toBe(MAX_ARMY);
    expect(clampCount(Infinity)).toBe(0);
    expect(clampCount(-5)).toBe(0);
  });
  it('kapılar durumu değiştirmez (saf)', () => {
    const s = newRunState(10); applyGate(s, mul(3)); expect(s.count).toBe(10);
  });
  it('güçlendirme kapıları', () => {
    expect(applyGate(newRunState(10), { kind: 'atk', value: 0.25 }).atkMult).toBeCloseTo(1.25);
    expect(applyGate(newRunState(10), { kind: 'rate', value: 0.2 }).rateMult).toBeCloseTo(1.2);
    expect(applyGate(newRunState(10), { kind: 'shield', value: 1 }).shield).toBe(1);
    expect(applyGate(newRunState(10), { kind: 'immune', value: 5 }, 2).immuneUntil).toBe(7);
  });
  it('riskli kapı ordu azaltır ama güç verir', () => {
    const s = applyGate(newRunState(100), { kind: 'risk', value: 0.2, risky: true });
    expect(s.count).toBe(80); expect(s.atkMult).toBeGreaterThan(1);
  });
});

describe('çarpışma ve hasar', () => {
  it('hasar asker kaybettirir', () => {
    const r = applyHit(newRunState(100), 0.2, 0);
    expect(r.state.count).toBe(80); expect(r.lost).toBe(20);
  });
  it('kalkan bir darbeyi yutar', () => {
    const s = { ...newRunState(100), shield: 1 };
    const r = applyHit(s, 0.5, 0);
    expect(r.state.count).toBe(100); expect(r.state.shield).toBe(0); expect(r.absorbed).toBe('shield');
  });
  it('bağışıklık hasarı engeller', () => {
    const s = { ...newRunState(100), immuneUntil: 10 };
    expect(applyHit(s, 0.5, 5).state.count).toBe(100);
    expect(applyHit(s, 0.5, 11).state.count).toBe(50);
  });
  it('en az 1 asker kaybedilir, sayı negatife düşmez', () => {
    expect(applyHit(newRunState(3), 0.01, 0).lost).toBe(1);
    expect(applyHit(newRunState(1), 5, 0).state.count).toBe(0);
  });
});

describe('düşman savaşı', () => {
  it('büyük ordu küçük düşmanı yener ve düşman sayısı kadar kill sayılır', () => {
    const r = resolveBattle(newRunState(100), [{ def: ENEMIES.normal, count: 20 }]);
    expect(r.won).toBe(true); expect(r.kills).toBe(20); expect(r.survivors).toBeGreaterThan(80);
  });
  it('küçük ordu büyük düşmana yenilir', () => {
    const r = resolveBattle(newRunState(5), [{ def: ENEMIES.normal, count: 200 }]);
    expect(r.won).toBe(false); expect(r.survivors).toBe(0);
  });
  it('daha fazla asker = daha fazla hayatta kalan', () => {
    const g = [{ def: ENEMIES.armored, count: 30 }];
    expect(resolveBattle(newRunState(120), g).survivors).toBeGreaterThan(resolveBattle(newRunState(60), g).survivors);
  });
  it('saldırı gücü bonusu savaşı etkiler', () => {
    const g = [{ def: ENEMIES.normal, count: 60 }];
    const strong = { ...newRunState(40), atkMult: 2 };
    expect(resolveBattle(strong, g).survivors).toBeGreaterThanOrEqual(resolveBattle(newRunState(40), g).survivors);
  });
  it('roket büyük hedeflere karşı standarttan iyi', () => {
    const g = [{ def: ENEMIES.heavy, count: 6 }];
    const t = resolveBattle(newRunState(60, 'rocket'), g).seconds;
    const u = resolveBattle(newRunState(60, 'standard'), g).seconds;
    expect(t).toBeLessThan(u);
  });
});

describe('boss sağlık sistemi', () => {
  const def = getBoss('b10');
  it('hasar sağlığı düşürür, zayıf nokta daha çok vurur', () => {
    const n = damageBoss(newBoss(def), 1000);
    const w = damageBoss(newBoss(def), 1000, true);
    expect(n.hp).toBeLessThan(def.hp); expect(w.hp).toBeLessThan(n.hp);
  });
  it('fazlar sağlık eşiğinde değişir', () => {
    let b = newBoss(def);
    expect(b.phase).toBe(0);
    b = damageBoss(b, def.hp * 0.4 / (1 - def.armor));
    expect(b.phase).toBe(1);
    b = damageBoss(b, def.hp * 0.4 / (1 - def.armor));
    expect(b.phase).toBe(2);
  });
  it('sağlık 0 olunca yenilir', () => {
    const b = damageBoss(newBoss(def), 1e9);
    expect(b.defeated).toBe(true); expect(b.hp).toBe(0);
  });
  it('her boss en az iki farklı saldırı düzeni ve uyarı süresi içerir', () => {
    for (const b of BOSSES) {
      const used = new Set(b.phases.flatMap((p) => p.attacks));
      expect(used.size).toBeGreaterThanOrEqual(2);
      for (const a of b.attacks) expect(a.telegraphSec).toBeGreaterThan(0.5);
    }
  });
  it('saldırı şeridi dışındaki oyuncu kaçar', () => {
    const a = def.attacks.find((x) => x.id === 'slam')!;
    expect(bossAttackHits(a, 1)).toBe(true); expect(bossAttackHits(a, 0)).toBe(false);
  });
  it('hiçbir saldırı üç şeridi birden kapatmaz (kaçınılabilir)', () => {
    for (const b of BOSSES) for (const a of b.attacks) expect(a.lanes.length).toBeLessThan(3);
  });
});

describe('asker sınıfı dengesi', () => {
  it('hiçbir sınıf güç endeksiyle diğerlerini ezmez', () => {
    const idx = SOLDIER_CLASSES.map(powerIndex);
    const mean = idx.reduce((a, b) => a + b, 0) / idx.length;
    for (const v of idx) { expect(v / mean).toBeGreaterThan(0.7); expect(v / mean).toBeLessThan(1.35); }
  });
  it('8 sınıf tanımlı', () => expect(SOLDIER_CLASSES.length).toBe(8));
});

describe('bölümler', () => {
  it(`en az 30 bölüm`, () => expect(LEVEL_COUNT).toBeGreaterThanOrEqual(30));
  it('her bölüm zorunlu alanları taşır', () => {
    for (const l of LEVELS) {
      expect(l.length).toBeGreaterThan(0); expect(l.startCount).toBeGreaterThan(0);
      expect(l.gates.length).toBeGreaterThan(0); expect(l.reward).toBeGreaterThan(0); expect(l.env).toBeTruthy();
    }
  });
  it('bölüm 5 mini boss, 10/15/20/25/30 boss', () => {
    expect(LEVELS[4].miniBoss).toBe(true);
    for (const id of [10, 15, 20, 25, 30]) expect(LEVELS[id - 1].boss).toBeTruthy();
  });
  it('ilk 3 bölüm düşmansız, bölüm 4 düşmanlı', () => {
    for (const i of [0, 1, 2]) expect(LEVELS[i].enemies.length).toBe(0);
    expect(LEVELS[3].enemies.length).toBeGreaterThan(0);
  });
  it('kapı satırında her zaman olumlu bir seçenek vardır (adil)', () => {
    for (const l of LEVELS) for (const g of l.gates) {
      const good = (x: GateDef) => x.kind !== 'risk';
      expect(good(g.left) || good(g.right)).toBe(true);
    }
  });
  it('hiçbir satırda üç şerit birden engelli değildir', () => {
    for (const l of LEVELS) {
      const byZ = new Map<number, Set<number>>();
      for (const o of l.obstacles) { if (!byZ.has(o.z)) byZ.set(o.z, new Set()); byZ.get(o.z)!.add(o.lane); }
      for (const s of byZ.values()) expect(s.size).toBeLessThan(3);
    }
  });
  it('denge: en iyi kapı seçimiyle (yükseltmesiz) her bölüm yenilebilir', () => {
    for (const l of LEVELS) {
      const r = simulateLevel(l, buildStartState(defaultSave(), l.startCount));
      expect(r.won, `Bölüm ${l.id} yenilemedi (final ${r.finalCount}, boss ${r.bossSeconds})`).toBe(true);
    }
  });
  it('zorluk gerçek: en kötü kapı seçimi 4. bölümden itibaren kaybettirir', () => {
    for (const l of LEVELS.filter((x) => x.id >= 4)) {
      expect(simulateLevel(l, buildStartState(defaultSave(), l.startCount), 'worst').won, `Bölüm ${l.id}`).toBe(false);
    }
  });
  it('bölüm ilerledikçe düşman payı artar (en iyi oyunda kalan oran azalır)', () => {
    const ratio = (id: number) => {
      const l = LEVELS[id - 1];
      const pre = simulateLevel(l, buildStartState(defaultSave(), l.startCount), 'best', l.enemies[l.enemies.length - 1].z).state.count;
      return simulateLevel(l, buildStartState(defaultSave(), l.startCount)).finalCount / pre;
    };
    expect(ratio(24)).toBeLessThan(ratio(6) + 1e-9);
  });
  it('boss bölümlerinde kalibre boss sağlığı tanımlıdır', () => {
    for (const id of [10, 15, 20, 25, 30]) expect(LEVELS[id - 1].bossHp).toBeGreaterThan(0);
  });
});
