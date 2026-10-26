// Mağaza ürün tanımları. Fiyat YOKTUR: gerçek fiyat Google Play yanıtından gelir (DEMO'da yer tutucu).
export type ProductType = 'consumable' | 'non_consumable' | 'subscription';

export interface ProductDef {
  id: string;
  name: string;
  type: ProductType;
  contents: string;
  grants: { coins?: number; crystals?: number; cosmetics?: string[]; premium?: boolean; removeAds?: boolean; season?: boolean };
}

export const PRODUCTS: ProductDef[] = [
  { id: 'starter_pack', name: 'Başlangıç Paketi', type: 'non_consumable', contents: '1000 jeton + 20 kristal + Kırmızı Kask', grants: { coins: 1000, crystals: 20, cosmetics: ['helmet_red'] } },
  { id: 'coins_small', name: 'Jeton Paketi (S)', type: 'consumable', contents: '1500 jeton', grants: { coins: 1500 } },
  { id: 'coins_large', name: 'Jeton Paketi (L)', type: 'consumable', contents: '8000 jeton', grants: { coins: 8000 } },
  { id: 'crystals_small', name: 'Kristal Paketi (S)', type: 'consumable', contents: '50 kristal', grants: { crystals: 50 } },
  { id: 'cosmetic_pack', name: 'Kozmetik Paketi', type: 'non_consumable', contents: 'Mavi İz + Altın Görünüm', grants: { cosmetics: ['trail_blue', 'skin_gold'] } },
  { id: 'soldier_skin_pack', name: 'Özel Asker Görünümü', type: 'non_consumable', contents: 'Premium Askeri görünümü', grants: { cosmetics: ['prem_skin'] } },
  { id: 'season_pass', name: 'Sezon Bileti', type: 'subscription', contents: 'Premium görev yolu (sezonluk)', grants: { season: true } },
  { id: 'premium_forever', name: 'Kalıcı Premium', type: 'non_consumable', contents: 'Premium kozmetikler, çerçeve, ekstra efektler, premium görev yolu', grants: { premium: true, cosmetics: ['prem_skin', 'prem_frame'] } },
  { id: 'remove_ads', name: 'Reklam Kaldır', type: 'non_consumable', contents: 'İsteğe bağlı reklam teklifleri kaldırılır (oyun ödülleri korunur)', grants: { removeAds: true } },
];

export function getProduct(id: string): ProductDef | undefined { return PRODUCTS.find((p) => p.id === id); }
