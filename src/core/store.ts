// Satın alma durum makinesi + hak (entitlement) hesabı. Gerçek Google Play Billing yerine DEMO sağlayıcı kullanılır.
import { getProduct } from '../data/products';
import { earnCoins, earnCrystals } from './progress';
import type { PurchaseRecord, SaveData } from './save';

export type BillingEvent =
  | { kind: 'purchased'; productId: string; token: string; verified: boolean }
  | { kind: 'pending'; productId: string; token: string }
  | { kind: 'cancelled'; productId: string; token: string }
  | { kind: 'refunded'; productId: string; token: string };

export interface BillingProvider {
  readonly isDemo: boolean;
  /** Mağaza yanıtından yerelleştirilmiş fiyat; DEMO'da null. */
  priceOf(productId: string): string | null;
  purchase(productId: string): Promise<BillingEvent>;
  /** Mağazadaki sahip olunan ürünleri geri yükle. */
  queryOwned(): Promise<BillingEvent[]>;
}

export class DemoBilling implements BillingProvider {
  readonly isDemo = true;
  private owned: BillingEvent[] = [];
  constructor(private next: 'purchased' | 'pending' | 'cancelled' = 'purchased') {}
  setNext(n: 'purchased' | 'pending' | 'cancelled') { this.next = n; }
  priceOf() { return null; }
  async purchase(productId: string): Promise<BillingEvent> {
    const token = 'demo-tok-' + productId + '-' + this.owned.length + '-' + Date.now();
    const ev: BillingEvent = this.next === 'purchased'
      ? { kind: 'purchased', productId, token, verified: true }
      : { kind: this.next, productId, token } as BillingEvent;
    if (ev.kind === 'purchased') this.owned.push(ev);
    return ev;
  }
  async queryOwned() { return this.owned.filter((e) => e.kind === 'purchased'); }
}

function grantContents(s: SaveData, productId: string): void {
  const p = getProduct(productId);
  if (!p) return;
  earnCoins(s, p.grants.coins ?? 0); earnCrystals(s, p.grants.crystals ?? 0);
  for (const c of p.grants.cosmetics ?? []) if (!s.cosmetics.includes(c)) s.cosmetics.push(c);
}

/** Olay işleyici: aynı token iki kez ödül vermez; iade hakkı geri alır. */
export function handleBillingEvent(s: SaveData, ev: BillingEvent, demo: boolean): void {
  const p = getProduct(ev.productId);
  if (!p) return;
  const existing = s.purchases.find((r) => r.token === ev.token);

  if (ev.kind === 'pending') {
    if (!existing) s.purchases.push({ productId: ev.productId, token: ev.token, state: 'pending', verified: false, demo });
    return;
  }
  if (ev.kind === 'cancelled') {
    if (existing && existing.state === 'pending') existing.state = 'cancelled';
    else if (!existing) s.purchases.push({ productId: ev.productId, token: ev.token, state: 'cancelled', verified: false, demo });
    return;
  }
  if (ev.kind === 'refunded') {
    if (existing) { existing.state = 'refunded'; existing.verified = false; }
    return;
  }
  // purchased
  if (!ev.verified) {
    if (!existing) s.purchases.push({ productId: ev.productId, token: ev.token, state: 'pending', verified: false, demo });
    return; // doğrulanmayan satın alma hak vermez
  }
  if (existing && existing.state === 'purchased') return; // çifte ödül yok
  const rec: PurchaseRecord = existing ?? { productId: ev.productId, token: ev.token, state: 'purchased', verified: true, demo };
  rec.state = 'purchased'; rec.verified = true;
  if (!existing) s.purchases.push(rec);
  grantContents(s, ev.productId);
}

function activePurchase(s: SaveData, productId: string): boolean {
  return s.purchases.some((r) => r.productId === productId && r.state === 'purchased' && r.verified);
}

export const hasPremium = (s: SaveData) => activePurchase(s, 'premium_forever');
export const hasRemoveAds = (s: SaveData) => activePurchase(s, 'remove_ads');
export const hasSeasonPass = (s: SaveData) => activePurchase(s, 'season_pass');

/** Uygulama açılışında mağazadan hakları yeniden kur (tüketilebilir ürünler tekrar ödül vermez). */
export async function restorePurchases(s: SaveData, billing: BillingProvider): Promise<number> {
  const owned = await billing.queryOwned();
  let restored = 0;
  for (const ev of owned) {
    if (ev.kind !== 'purchased') continue;
    const had = s.purchases.some((r) => r.token === ev.token && r.state === 'purchased');
    handleBillingEvent(s, ev, billing.isDemo);
    if (!had) restored++;
  }
  return restored;
}
