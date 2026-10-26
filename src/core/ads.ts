// Ödüllü reklam — DEMO sağlayıcı. Gerçek SDK bağlanana kadar hiçbir gerçek reklam gösterilmez.
import { ECONOMY } from '../data/economy';
import { dateKey, earnCoins } from './progress';
import type { SaveData } from './save';

export type AdPlacement = 'level_double' | 'daily_bonus' | 'chest' | 'continue';

export interface AdResult {
  completed: boolean; // sağlayıcı tamamlanmayı doğruladı mı
  token: string; // her tamamlanma olayına benzersiz kimlik
}

export interface AdProvider {
  readonly isDemo: boolean;
  isAvailable(): boolean;
  show(placement: AdPlacement): Promise<AdResult>;
}

let demoSeq = 0;

export class DemoAdProvider implements AdProvider {
  readonly isDemo = true;
  constructor(private behavior: 'complete' | 'cancel' | 'fail' = 'complete') {}
  isAvailable() { return this.behavior !== 'fail'; }
  async show(_p: AdPlacement): Promise<AdResult> {
    if (this.behavior === 'fail') throw new Error('Reklam yüklenemedi');
    demoSeq++;
    return { completed: this.behavior === 'complete', token: 'demo-' + Date.now() + '-' + demoSeq };
  }
}

export type AdBlockReason = 'unavailable' | 'daily_limit' | 'cooldown' | null;

export function adBlockReason(s: SaveData, provider: AdProvider, nowMs: number, tz = 0): AdBlockReason {
  if (!provider.isAvailable()) return 'unavailable';
  const today = dateKey(nowMs, tz);
  const count = s.ads.day === today ? s.ads.countToday : 0;
  if (count >= ECONOMY.adDailyLimit) return 'daily_limit';
  if (nowMs - s.ads.lastAtMs < ECONOMY.adCooldownSec * 1000) return 'cooldown';
  return null;
}

/** Ödülü yalnızca tamamlanma doğrulandıysa ve token daha önce kullanılmadıysa verir. */
export function grantAdReward(s: SaveData, result: AdResult, coins: number, nowMs: number, tz = 0): boolean {
  if (!result.completed || !result.token) return false;
  if (s.ads.usedTokens.includes(result.token)) return false;
  const today = dateKey(nowMs, tz);
  if (s.ads.day !== today) { s.ads.day = today; s.ads.countToday = 0; }
  s.ads.usedTokens.push(result.token);
  if (s.ads.usedTokens.length > 200) s.ads.usedTokens.shift();
  s.ads.countToday++; s.ads.lastAtMs = nowMs;
  earnCoins(s, coins);
  return true;
}

/** Tüm akış: engelleri kontrol et → reklamı göster → ödülü ver. İptal/hata temel ödülü etkilemez. */
export async function watchAdForCoins(
  s: SaveData, provider: AdProvider, placement: AdPlacement, coins: number, nowMs: number, tz = 0,
): Promise<{ granted: boolean; reason?: string }> {
  const block = adBlockReason(s, provider, nowMs, tz);
  if (block) return { granted: false, reason: block };
  try {
    const res = await provider.show(placement);
    const ok = grantAdReward(s, res, coins, nowMs, tz);
    return ok ? { granted: true } : { granted: false, reason: res.completed ? 'duplicate' : 'cancelled' };
  } catch {
    return { granted: false, reason: 'error' };
  }
}
