// Ekonomi, yükseltme, görev, günlük ödül, bölüm tamamlama — tümü SaveData üzerinde saf işlemler.
import { ACHIEVEMENTS, COSMETICS, CHEST, DAILY_REWARDS, ECONOMY, QUESTS, UPGRADES, getUpgrade, upgradeCost, type QuestEvent } from '../data/economy';
import { LEVEL_COUNT, getLevel } from '../data/levels';
import { SOLDIER_CLASSES } from '../data/soldiers';
import type { RunState } from './army';
import { newRunState } from './army';
import type { Rng } from './rng';
import type { SaveData } from './save';

// ---- Jeton / kristal ----
export function earnCoins(s: SaveData, n: number): void { if (n > 0) s.coins = Math.min(1e12, s.coins + Math.floor(n)); }
export function earnCrystals(s: SaveData, n: number): void { if (n > 0) s.crystals = Math.min(1e12, s.crystals + Math.floor(n)); }
export function spendCoins(s: SaveData, n: number): boolean {
  if (!Number.isInteger(n) || n < 0 || s.coins < n) return false;
  s.coins -= n; return true;
}
export function spendCrystals(s: SaveData, n: number): boolean {
  if (!Number.isInteger(n) || n < 0 || s.crystals < n) return false;
  s.crystals -= n; return true;
}

// ---- Yükseltmeler ----
export function upgradeLevel(s: SaveData, id: string): number { return s.upgrades[id] ?? 0; }

export function nextUpgradeCost(s: SaveData, id: string): number | null {
  const u = getUpgrade(id); const lv = upgradeLevel(s, id);
  return lv >= u.maxLevel ? null : upgradeCost(u, lv);
}

export function buyUpgrade(s: SaveData, id: string): boolean {
  const cost = nextUpgradeCost(s, id);
  if (cost === null || !spendCoins(s, cost)) return false;
  s.upgrades[id] = upgradeLevel(s, id) + 1;
  return true;
}

/** Yükseltmelerin GERÇEK oynanış etkisi: bölüm başlangıç durumunu üretir. */
export function buildStartState(s: SaveData, baseCount: number): RunState {
  const lv = (id: string) => upgradeLevel(s, id);
  const u = (id: string) => getUpgrade(id).perLevel * lv(id);
  const st = newRunState(baseCount + Math.floor(u('startCount')), s.selectedClass);
  st.hpMult = 1 + u('hp') ;
  st.atkMult = 1 + u('atk');
  st.rateMult = 1 + u('rate');
  st.shield = Math.floor(u('startShield'));
  return st;
}

export function defenseReduction(s: SaveData): number { return Math.min(0.5, getUpgrade('defense').perLevel * upgradeLevel(s, 'defense')); }
export function rewardMultiplier(s: SaveData): number { return 1 + getUpgrade('rewardMult').perLevel * upgradeLevel(s, 'rewardMult'); }
export function abilityTimeMult(s: SaveData): number { return 1 + getUpgrade('abilityTime').perLevel * upgradeLevel(s, 'abilityTime'); }

// ---- Asker sınıfı ----
export function buyClass(s: SaveData, id: string): boolean {
  const c = SOLDIER_CLASSES.find((x) => x.id === id);
  if (!c || s.unlockedClasses.includes(id)) return false;
  if (!spendCoins(s, c.unlockCost)) return false;
  s.unlockedClasses.push(id); return true;
}
export function selectClass(s: SaveData, id: string): boolean {
  if (!s.unlockedClasses.includes(id)) return false;
  s.selectedClass = id; return true;
}

// ---- Görevler ----
export function addQuestProgress(s: SaveData, ev: QuestEvent, n: number): void {
  for (const q of QUESTS) {
    if (q.event !== ev || s.quests.claimed.includes(q.id)) continue;
    s.quests.progress[q.id] = Math.min(q.target, (s.quests.progress[q.id] ?? 0) + n);
  }
}
export function questDone(s: SaveData, id: string): boolean {
  const q = QUESTS.find((x) => x.id === id); return !!q && (s.quests.progress[id] ?? 0) >= q.target;
}
export function claimQuest(s: SaveData, id: string): boolean {
  const q = QUESTS.find((x) => x.id === id);
  if (!q || !questDone(s, id) || s.quests.claimed.includes(id)) return false;
  s.quests.claimed.push(id);
  earnCoins(s, q.coins); earnCrystals(s, q.crystals ?? 0);
  return true;
}

// ---- Başarımlar ----
export function checkAchievements(s: SaveData): string[] {
  const got: string[] = [];
  const stats = s.stats as unknown as Record<string, number>;
  for (const a of ACHIEVEMENTS) {
    if (!s.achievements.includes(a.id) && (stats[a.stat] ?? 0) >= a.target) { s.achievements.push(a.id); got.push(a.id); }
  }
  return got;
}

// ---- Günlük ödül ----
export function dateKey(ms: number, tzOffsetMin = 0): string {
  const d = new Date(ms + tzOffsetMin * 60000);
  return d.toISOString().slice(0, 10);
}
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

export function canClaimDaily(s: SaveData, today: string): boolean { return s.daily.lastDate !== today; }

export function claimDaily(s: SaveData, today: string): { ok: boolean; day: number } {
  if (!canClaimDaily(s, today)) return { ok: false, day: s.daily.streak };
  const gap = s.daily.lastDate ? dayDiff(s.daily.lastDate, today) : 0;
  const streak = s.daily.lastDate && gap === 1 ? s.daily.streak + 1 : 1; // seri koptuysa 1. günden başla
  const day = ((streak - 1) % DAILY_REWARDS.length) + 1;
  const r = DAILY_REWARDS[day - 1];
  earnCoins(s, r.coins ?? 0); earnCrystals(s, r.crystals ?? 0);
  if (r.cosmetic && !s.cosmetics.includes(r.cosmetic)) s.cosmetics.push(r.cosmetic);
  if (r.chest) openChestFree(s, defaultRngForDaily(today));
  s.daily = { lastDate: today, streak };
  return { ok: true, day };
}
function defaultRngForDaily(today: string): Rng {
  let h = 7; for (const c of today) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; };
}

// ---- Sandık ----
export function openChestFree(s: SaveData, rng: Rng): string {
  const forceRare = s.chestsSinceRare + 1 >= CHEST.pityAfter;
  const drops = forceRare ? CHEST.drops.filter((d) => d.id === 'rare' || d.id === 'epic') : CHEST.drops;
  const total = drops.reduce((a, d) => a + d.weight, 0);
  let r = rng() * total; let chosen = drops[0].id;
  for (const d of drops) { if ((r -= d.weight) < 0) { chosen = d.id; break; } }
  s.chestsOpened++;
  s.chestsSinceRare = chosen === 'rare' || chosen === 'epic' ? 0 : s.chestsSinceRare + 1;
  if (chosen === 'coins') earnCoins(s, 150 + Math.floor(rng() * 151));
  else if (chosen === 'crystals') earnCrystals(s, 3 + Math.floor(rng() * 6));
  else {
    const pool = COSMETICS.filter((c) => !c.premium && c.rarity === (chosen === 'common' ? 'common' : chosen === 'rare' ? 'rare' : 'epic') && !s.cosmetics.includes(c.id));
    if (pool.length) s.cosmetics.push(pool[Math.floor(rng() * pool.length)].id);
    else earnCoins(s, 100); // koleksiyon tamamsa jeton
  }
  return chosen;
}
export function buyChest(s: SaveData, rng: Rng): string | null {
  if (!spendCoins(s, CHEST.cost)) return null;
  return openChestFree(s, rng);
}

// ---- Bölüm tamamlama ----
export interface LevelOutcome { coins: number; crystals: number; firstClear: boolean }

export function levelReward(s: SaveData, levelId: number, kills: number, bossDefeated: boolean): number {
  const l = getLevel(levelId);
  const base = l.reward + kills * ECONOMY.coinsPerKill + (bossDefeated ? 0 : 0);
  return Math.round(base * rewardMultiplier(s));
}

export function completeLevel(s: SaveData, levelId: number, kills: number, survivors: number, bossDefeated: boolean): LevelOutcome {
  const firstClear = levelId >= s.unlockedLevel && levelId <= LEVEL_COUNT;
  const coins = levelReward(s, levelId, kills, bossDefeated);
  earnCoins(s, coins);
  const crystals = bossDefeated ? ECONOMY.bossBonusCrystals : 0;
  earnCrystals(s, crystals);
  if (levelId >= s.unlockedLevel && levelId < LEVEL_COUNT) s.unlockedLevel = levelId + 1;
  s.stats.levelsDone++; s.stats.enemiesKilled += kills;
  s.stats.bestArmy = Math.max(s.stats.bestArmy, survivors);
  if (bossDefeated) s.stats.bossesKilled++;
  addQuestProgress(s, 'levels', 1); addQuestProgress(s, 'kills', kills);
  if (bossDefeated) addQuestProgress(s, 'bosses', 1);
  checkAchievements(s);
  return { coins, crystals, firstClear };
}

export function isLevelUnlocked(s: SaveData, id: number): boolean { return id >= 1 && id <= Math.min(LEVEL_COUNT, s.unlockedLevel); }

export { UPGRADES };
