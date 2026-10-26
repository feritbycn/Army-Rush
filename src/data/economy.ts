// Ekonomi, yükseltme, ödül ve görev verileri — fiyatlar yalnızca burada.

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  baseCost: number;
  growth: number; // maliyet = baseCost * growth^seviye
  maxLevel: number;
  perLevel: number; // seviye başına etki
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'startCount', name: 'Başlangıç Askeri', desc: '+N başlangıç askeri', baseCost: 60, growth: 1.35, maxLevel: 30, perLevel: 1 },
  { id: 'hp', name: 'Asker Sağlığı', desc: '+%6 can / seviye', baseCost: 80, growth: 1.35, maxLevel: 25, perLevel: 0.06 },
  { id: 'atk', name: 'Saldırı Gücü', desc: '+%6 hasar / seviye', baseCost: 80, growth: 1.35, maxLevel: 25, perLevel: 0.06 },
  { id: 'rate', name: 'Ateş Hızı', desc: '+%4 hız / seviye', baseCost: 100, growth: 1.38, maxLevel: 20, perLevel: 0.04 },
  { id: 'defense', name: 'Savunma', desc: '+%2 hasar azaltma / seviye', baseCost: 120, growth: 1.4, maxLevel: 15, perLevel: 0.02 },
  { id: 'startShield', name: 'Başlangıç Kalkanı', desc: '+1 kalkan hakkı / 5 seviye', baseCost: 300, growth: 1.8, maxLevel: 10, perLevel: 0.2 },
  { id: 'rewardMult', name: 'Ödül Çarpanı', desc: '+%5 jeton / seviye', baseCost: 200, growth: 1.5, maxLevel: 20, perLevel: 0.05 },
  { id: 'abilityTime', name: 'Yetenek Süresi', desc: '+%10 süre (bağışıklık vb.)', baseCost: 150, growth: 1.45, maxLevel: 15, perLevel: 0.1 },
];

export function upgradeCost(u: UpgradeDef, level: number): number {
  return Math.round(u.baseCost * Math.pow(u.growth, level));
}

export function getUpgrade(id: string): UpgradeDef {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) throw new Error('Bilinmeyen yükseltme: ' + id);
  return u;
}

export const ECONOMY = {
  coinsPerKill: 0.6,
  levelBaseReward: 40,
  levelRewardPerLevel: 12,
  bossBonusCrystals: 5,
  adBonusMultiplier: 1, // reklam: kazanılan jetonun +%100'ü
  adDailyLimit: 6,
  adCooldownSec: 30,
  continueAdLimitPerRun: 1,
  endlessCoinsPer100m: 8,
};

export interface DailyReward { day: number; coins?: number; crystals?: number; cosmetic?: string; chest?: boolean; label: string }

export const DAILY_REWARDS: DailyReward[] = [
  { day: 1, coins: 100, label: '100 jeton' },
  { day: 2, coins: 200, label: '200 jeton' },
  { day: 3, cosmetic: 'helmet_green', label: 'Kozmetik: Yeşil Kask' },
  { day: 4, crystals: 10, label: '10 kristal' },
  { day: 5, chest: true, label: 'Özel sandık' },
  { day: 6, coins: 500, label: '500 jeton' },
  { day: 7, crystals: 25, cosmetic: 'skin_gold', label: '25 kristal + Altın görünüm' },
];

export type QuestEvent = 'soldiers' | 'kills' | 'bosses' | 'levels' | 'endlessSec' | 'gates';

export interface QuestDef { id: string; name: string; event: QuestEvent; target: number; coins: number; crystals?: number }

export const QUESTS: QuestDef[] = [
  { id: 'q_soldiers', name: '100 asker topla', event: 'soldiers', target: 100, coins: 120 },
  { id: 'q_kills', name: '500 düşman yen', event: 'kills', target: 500, coins: 250 },
  { id: 'q_bosses', name: '3 boss yen', event: 'bosses', target: 3, coins: 300, crystals: 5 },
  { id: 'q_levels', name: '5 bölüm tamamla', event: 'levels', target: 5, coins: 200 },
  { id: 'q_endless', name: '10 dk sonsuz modda oyna', event: 'endlessSec', target: 600, coins: 300 },
  { id: 'q_gates', name: '50 kapıdan geç', event: 'gates', target: 50, coins: 150 },
];

export interface AchievementDef { id: string; name: string; stat: string; target: number }

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'a_first', name: 'İlk Zafer', stat: 'levelsDone', target: 1 },
  { id: 'a_ten', name: '10 Bölüm', stat: 'levelsDone', target: 10 },
  { id: 'a_boss', name: 'Boss Avcısı', stat: 'bossesKilled', target: 1 },
  { id: 'a_army', name: '1000 Kişilik Ordu', stat: 'bestArmy', target: 1000 },
  { id: 'a_kills', name: '1000 Düşman', stat: 'enemiesKilled', target: 1000 },
];

export interface CosmeticDef { id: string; name: string; slot: string; premium?: boolean; rarity: 'common' | 'rare' | 'epic' }

export const COSMETICS: CosmeticDef[] = [
  { id: 'helmet_green', name: 'Yeşil Kask', slot: 'helmet', rarity: 'common' },
  { id: 'helmet_red', name: 'Kırmızı Kask', slot: 'helmet', rarity: 'common' },
  { id: 'skin_gold', name: 'Altın Görünüm', slot: 'skin', rarity: 'epic' },
  { id: 'skin_frost', name: 'Buz Görünümü', slot: 'skin', rarity: 'rare' },
  { id: 'skin_core', name: 'Çekirdek Görünümü', slot: 'skin', rarity: 'epic' },
  { id: 'trail_blue', name: 'Mavi İz', slot: 'effect', rarity: 'common' },
  { id: 'prem_skin', name: 'Premium Askeri', slot: 'skin', rarity: 'epic', premium: true },
  { id: 'prem_frame', name: 'Premium Çerçeve', slot: 'frame', rarity: 'epic', premium: true },
];

/** Sandık olasılıkları — arayüzde açıkça gösterilir. */
export const CHEST = {
  cost: 400,
  drops: [
    { id: 'coins', label: '150–300 jeton', weight: 55 },
    { id: 'crystals', label: '3–8 kristal', weight: 20 },
    { id: 'common', label: 'Sıradan kozmetik', weight: 18 },
    { id: 'rare', label: 'Nadir kozmetik', weight: 6 },
    { id: 'epic', label: 'Epik kozmetik', weight: 1 },
  ],
  pityAfter: 20, // 20 açılışta nadir+ garanti
};
