// Sürümlenebilir, bozulmaya dayanıklı kayıt sistemi.
export const SAVE_VERSION = 1;

export interface PurchaseRecord {
  productId: string;
  token: string;
  state: 'pending' | 'purchased' | 'cancelled' | 'refunded';
  verified: boolean; // yalnızca doğrulama sonucu true olur
  demo: boolean;
}

export interface SaveData {
  version: number;
  coins: number;
  crystals: number;
  unlockedLevel: number; // en yüksek açık bölüm
  upgrades: Record<string, number>;
  cosmetics: string[];
  selectedClass: string;
  unlockedClasses: string[];
  quests: { progress: Record<string, number>; claimed: string[] };
  achievements: string[];
  settings: { sfx: boolean; volume: number; gfx: 'low' | 'high'; fps: 30 | 60; sensitivity: number };
  endless: { bestDistance: number; bestArmy: number };
  daily: { lastDate: string; streak: number };
  purchases: PurchaseRecord[];
  stats: { playSec: number; levelsDone: number; bossesKilled: number; enemiesKilled: number; gates: number; soldiers: number; bestArmy: number };
  ads: { day: string; countToday: number; lastAtMs: number; usedTokens: string[] };
  chestsOpened: number;
  chestsSinceRare: number;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION, coins: 0, crystals: 0, unlockedLevel: 1,
    upgrades: {}, cosmetics: [], selectedClass: 'standard', unlockedClasses: ['standard'],
    quests: { progress: {}, claimed: [] }, achievements: [],
    settings: { sfx: true, volume: 0.7, gfx: 'high', fps: 60, sensitivity: 1 },
    endless: { bestDistance: 0, bestArmy: 0 },
    daily: { lastDate: '', streak: 0 },
    purchases: [],
    stats: { playSec: 0, levelsDone: 0, bossesKilled: 0, enemiesKilled: 0, gates: 0, soldiers: 0, bestArmy: 0 },
    ads: { day: '', countToday: 0, lastAtMs: 0, usedTokens: [] },
    chestsOpened: 0, chestsSinceRare: 0,
  };
}

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export class MemoryKV implements KV {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

/** Basit bütünlük sağlaması (hile koruması değildir — gerçek haklar mağaza/sunucuda doğrulanmalı). */
export function checksum(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

const KEY = 'armyrush.save';
const BAK = 'armyrush.save.bak';

function num(v: unknown, d: number, min = 0, max = 1e12): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
}

/** Bilinmeyen/eksik alanları güvenli varsayılanlarla birleştirir. */
export function sanitize(raw: unknown): SaveData {
  const d = defaultSave();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<SaveData>;
  const strArr = (v: unknown, fb: string[]) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : fb);
  const out: SaveData = {
    ...d,
    coins: num(r.coins, 0), crystals: num(r.crystals, 0),
    unlockedLevel: Math.floor(num(r.unlockedLevel, 1, 1, 1000)),
    upgrades: {}, cosmetics: strArr(r.cosmetics, []),
    selectedClass: typeof r.selectedClass === 'string' ? r.selectedClass : 'standard',
    unlockedClasses: strArr(r.unlockedClasses, ['standard']),
    achievements: strArr(r.achievements, []),
    chestsOpened: num(r.chestsOpened, 0), chestsSinceRare: num(r.chestsSinceRare, 0),
  };
  if (!out.unlockedClasses.includes('standard')) out.unlockedClasses.push('standard');
  if (r.upgrades && typeof r.upgrades === 'object') {
    for (const [k, v] of Object.entries(r.upgrades)) out.upgrades[k] = Math.floor(num(v, 0, 0, 1000));
  }
  if (r.quests && typeof r.quests === 'object') {
    const q = r.quests as SaveData['quests'];
    out.quests = { progress: {}, claimed: strArr(q.claimed, []) };
    if (q.progress && typeof q.progress === 'object') for (const [k, v] of Object.entries(q.progress)) out.quests.progress[k] = num(v, 0);
  }
  if (r.settings && typeof r.settings === 'object') {
    const s = r.settings as SaveData['settings'];
    out.settings = {
      sfx: typeof s.sfx === 'boolean' ? s.sfx : true,
      volume: num(s.volume, 0.7, 0, 1),
      gfx: s.gfx === 'low' ? 'low' : 'high',
      fps: s.fps === 30 ? 30 : 60,
      sensitivity: num(s.sensitivity, 1, 0.3, 3),
    };
  }
  if (r.endless) out.endless = { bestDistance: num(r.endless.bestDistance, 0), bestArmy: num(r.endless.bestArmy, 0) };
  if (r.daily) out.daily = { lastDate: typeof r.daily.lastDate === 'string' ? r.daily.lastDate : '', streak: Math.floor(num(r.daily.streak, 0, 0, 100000)) };
  if (Array.isArray(r.purchases)) {
    out.purchases = r.purchases.filter((p) => p && typeof p.productId === 'string' && typeof p.token === 'string').map((p) => ({
      productId: p.productId, token: p.token,
      state: (['pending', 'purchased', 'cancelled', 'refunded'] as const).includes(p.state) ? p.state : 'pending',
      verified: p.verified === true, demo: p.demo === true,
    }));
  }
  if (r.stats) {
    const st = r.stats as SaveData['stats'];
    out.stats = {
      playSec: num(st.playSec, 0), levelsDone: num(st.levelsDone, 0), bossesKilled: num(st.bossesKilled, 0),
      enemiesKilled: num(st.enemiesKilled, 0), gates: num(st.gates, 0), soldiers: num(st.soldiers, 0), bestArmy: num(st.bestArmy, 0),
    };
  }
  if (r.ads) {
    out.ads = { day: typeof r.ads.day === 'string' ? r.ads.day : '', countToday: num(r.ads.countToday, 0), lastAtMs: num(r.ads.lastAtMs, 0), usedTokens: strArr(r.ads.usedTokens, []).slice(-200) };
  }
  return out;
}

export function serialize(data: SaveData): string {
  const body = JSON.stringify(data);
  return JSON.stringify({ c: checksum(body), d: body });
}

function parse(text: string | null): SaveData | null {
  if (!text) return null;
  try {
    const env = JSON.parse(text) as { c: string; d: string };
    if (typeof env.d !== 'string' || checksum(env.d) !== env.c) return null;
    return sanitize(JSON.parse(env.d));
  } catch {
    return null;
  }
}

export function loadSave(kv: KV): SaveData {
  // Ana kayıt → yedek → varsayılan. Uygulamanın açılması hiçbir zaman engellenmez.
  try {
    const main = parse(kv.getItem(KEY));
    if (main) return main;
    const bak = parse(kv.getItem(BAK));
    if (bak) return bak;
  } catch { /* depolama okunamadı */ }
  return defaultSave();
}

export function writeSave(kv: KV, data: SaveData): void {
  try {
    const prev = kv.getItem(KEY);
    if (prev && parse(prev)) kv.setItem(BAK, prev);
    kv.setItem(KEY, serialize(data));
  } catch { /* kota doluysa oyun devam eder */ }
}
