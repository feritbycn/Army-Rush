// Asker sınıfları — tüm denge verisi burada (merkezi veri).
export interface SoldierClass {
  id: string;
  name: string;
  hp: number;
  atk: number;
  rate: number; // saniyede saldırı
  range: number;
  speed: number;
  armor: number; // 0..0.6 gelen hasar azaltma
  healPerSec: number;
  ability: string;
  unlockCost: number; // jeton; 0 = baştan açık
  color: number;
}

export const SOLDIER_CLASSES: SoldierClass[] = [
  { id: 'standard', name: 'Standart Asker', hp: 100, atk: 10, rate: 1.0, range: 8, speed: 1.0, armor: 0, healPerSec: 0, ability: 'Dengeli', unlockCost: 0, color: 0x3a86ff },
  { id: 'heavy', name: 'Ağır Zırhlı', hp: 220, atk: 5, rate: 0.8, range: 6, speed: 0.85, armor: 0.3, healPerSec: 0, ability: 'Yüksek dayanıklılık', unlockCost: 600, color: 0x5a6b8c },
  { id: 'rapid', name: 'Hızlı Saldırı', hp: 70, atk: 6, rate: 2.2, range: 7, speed: 1.15, armor: 0, healPerSec: 0, ability: 'Seri atış', unlockCost: 800, color: 0x2ec4b6 },
  { id: 'sniper', name: 'Keskin Nişancı', hp: 60, atk: 28, rate: 0.5, range: 16, speed: 1.0, armor: 0, healPerSec: 0, ability: 'Uzun menzil', unlockCost: 1200, color: 0xb5838d },
  { id: 'rocket', name: 'Roket Birimi', hp: 90, atk: 24, rate: 0.5, range: 10, speed: 0.95, armor: 0, healPerSec: 0, ability: 'Büyük düşmanlara +%50', unlockCost: 1600, color: 0xf77f00 },
  { id: 'support', name: 'Destek Birimi', hp: 110, atk: 4, rate: 1.0, range: 8, speed: 1.0, armor: 0, healPerSec: 8, ability: 'Birliği iyileştirir', unlockCost: 1000, color: 0x80ed99 },
  { id: 'shield', name: 'Kalkanlı Asker', hp: 180, atk: 4, rate: 0.8, range: 5, speed: 0.9, armor: 0.4, healPerSec: 0, ability: 'Ön hat koruması', unlockCost: 1400, color: 0x4895ef },
  { id: 'energy', name: 'Enerji Birimi', hp: 85, atk: 14, rate: 1.1, range: 9, speed: 1.05, armor: 0, healPerSec: 0, ability: 'Zırh delici enerji', unlockCost: 2500, color: 0x9d4edd },
];

export function getClass(id: string): SoldierClass {
  return SOLDIER_CLASSES.find((c) => c.id === id) ?? SOLDIER_CLASSES[0];
}

/** Sınıf güç endeksi: etkin can × (saldırı·hız + 0.5·iyileştirme). Denge testinde kullanılır. */
export function powerIndex(c: SoldierClass): number {
  const ehp = c.hp / (1 - c.armor);
  return ehp * (c.atk * c.rate + 0.5 * c.healPerSec);
}
