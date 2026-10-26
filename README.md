# Army Rush

Dikey mobil ekran için 3D birlik büyütme ve savaş oyunu. Kapılardan geç, ordunu büyüt, engellerden kaç, düşmanları ve boss'ları yen, jetonlarla kalıcı yükseltmeler al.

**Teknoloji:** TypeScript · Vite · Three.js · Capacitor (Android) · Vitest · GitHub Actions

> **Durum: 0.1 — oynanabilir prototip.** Oyun mantığı, ekonomi, 30 bölüm, boss'lar, sonsuz mod, menüler ve testler gerçek ve çalışır durumda. 3D modeller **geçici prototip** (kodla üretilmiş stilize low-poly figürler; GLB/glTF varlıkları henüz yok). Reklam ve satın alma **DEMO** sağlayıcılarla çalışır. Ayrıntı için aşağıdaki "Durum raporu" bölümüne bakın.

## Hızlı başlangıç

```bash
npm ci
npm run dev        # http://localhost:5173 — mobil ekran boyutunu (DevTools) kullanın
npm test           # birim testleri
npm run typecheck  # tip kontrolü
npm run build      # dist/ üretir
```

Tarayıcıda: parmak/fare sürükleyerek veya ←/→ (A/D) tuşlarıyla şerit değiştirin.

## Oyun özeti

- **Kapılar:** +5/+10/+25/+50, ×2/×3/×5, saldırı/ateş hızı/can/hız artışı, kalkan, geçici bağışıklık ve riskli kapı (asker kaybı ↔ güçlü saldırı bonusu). Matematik saf fonksiyonlardır: `10 × 3 = 30`.
- **Engeller:** bariyer, hareketli engel, dar geçit, dönen mekanizma, hasar zemini, düşen platform, tuzak, taret, kırılabilir kasa. Her hasar nedeni ekranda yazılır.
- **Düşmanlar:** normal, hızlı, zırhlı, menzilli, ağır makine, mini boss.
- **Boss'lar (bölüm 10/15/20/25/30):** her biri ≥2 saldırı düzeni, saldırı öncesi şerit uyarısı, değişen aşamalar, periyodik zayıf nokta. Bölüm 5'te mini boss.
- **Sonsuz mod:** tohumlu prosedürel parçalar, art arda aynı şablon yok, kademeli zorluk, periyodik mini boss/boss, rekor ve kilometre taşı ödülleri.
- **Ekonomi:** jeton + premium kristal; 8 kalıcı yükseltme (maliyet eğrileri `src/data/economy.ts`); 8 asker sınıfı (`src/data/soldiers.ts`); günlük ödül, görevler, başarımlar, sandık (olasılıklar arayüzde gösterilir, 20 açılışta nadir+ garanti, yalnızca oyun içi jetonla).
- **Performans:** ordu `InstancedMesh` ile çizilir (en fazla 150 görünür figür; gerçek sayı 5000'e kadar hesaplanır, savaş hesabı görünen sayıdan bağımsız ama tutarlıdır). Düşük/yüksek grafik ve 30/60 FPS ayarı.

## Proje yapısı

```
src/core/    saf oyun mantığı (army, combat, endless, progress, save, ads, store, sim) — DOM'a bağımlı değil, testli
src/data/    merkezi veri: levels, enemies, soldiers, economy (fiyat/eğri/ödül), products
src/game/    Three.js sahnesi, modeller, partiküller, ses (WebAudio ile sentezlenen özgün sesler)
src/main.ts  menüler, kayıt, reklam/satın alma akışlarının bağlanması
tests/       Vitest
android/     Capacitor Android projesi
.github/     CI iş akışı
```

Yeni bölüm / ürün / yükseltme eklemek için yalnızca `src/data/*` dosyaları değişir.

## Android: APK ve AAB

Gereksinimler: JDK 21, Android SDK (platform 36), Node 22.

```bash
npm ci
npm run android:debug   # → android/app/build/outputs/apk/debug/app-debug.apk  (test için)
npm run android:aab     # → android/app/build/outputs/bundle/release/app-release.aab
```

**GitHub Actions** (`.github/workflows/android.yml`): her push/PR'da typecheck + test + web build; ardından debug APK ve release AAB derlenir, çıktılar **Actions → Artifacts** altında yüklenir, hata olursa raporlar da yüklenir.

### Google Play'e yayın için yapılması gerekenler

1. **Paket kimliğini değiştirin:** `capacitor.config.ts` (`appId`) ve `android/app/build.gradle` (`namespace`, `applicationId`) şu an `com.example.armyrush`. Yayından sonra değiştirilemez. (Java paket klasörünü de yeniden adlandırın: `npx cap` ile platformu yeniden eklemek en kolayıdır.)
2. **İmzalama anahtarı oluşturun** (kaynak koda/depoya koymayın):
   `keytool -genkeypair -v -keystore release.keystore -alias armyrush -keyalg RSA -keysize 2048 -validity 10000`
   GitHub → Settings → Secrets: `ANDROID_KEYSTORE_BASE64` (`base64 -w0 release.keystore`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Secret'lar yoksa AAB **imzasız** üretilir ve Play'e yüklenemez (iş akışı özetinde belirtilir). Play App Signing kullanmanız önerilir.
3. **Sürüm:** `versionCode` CI'da `github.run_number` ile artar; `versionName` için `-PversionName=1.0.0`.
4. Play Console: mağaza kaydı, içerik derecelendirmesi, Veri güvenliği formu, gizlilik politikası, ürünlerin (IAP) oluşturulması.

## Reklam entegrasyonu (şu an DEMO)

`src/core/ads.ts` içindeki `AdProvider` arayüzünü gerçek bir ödüllü reklam SDK'sıyla (ör. AdMob) uygulayın ve `src/main.ts` içindeki `DemoAdProvider`'ın yerine verin. Kurallar hazırdır ve testlidir: ödül yalnızca sağlayıcı `completed: true` döndürürse verilir, aynı `token` ikinci kez ödül vermez, günlük limit (`ECONOMY.adDailyLimit`) ve bekleme süresi uygulanır, iptal/hata temel ödülü etkilemez. **Üretimde** (özellikle jeton gibi değerli ödüller için) AdMob'un sunucu tarafı doğrulaması (SSV) kullanılmalıdır; istemci tarafı tamamlanma bilgisi tek başına güvenilir değildir.

## Satın alma entegrasyonu (şu an DEMO)

`src/core/store.ts` içindeki `BillingProvider` arayüzünü Google Play Billing ile uygulayın (Capacitor eklentisi veya özel Android köprüsü). Durum makinesi hazırdır ve testlidir: bekleyen / iptal / iade / çift token / doğrulanmamış satın alma / geri yükleme. **Gereken harici iş:**

- Play Console'da `src/data/products.ts` içindeki ürün kimliklerini oluşturun. Fiyatlar kodda **yoktur**; Play yanıtından gelmelidir (`priceOf`).
- Satın alma token'larını bir **backend** üzerinden Google Play Developer API ile doğrulayın (`purchases.products.get` / `purchases.subscriptionsv2.get`), tüketilebilir ürünleri tüketin, tüm ürünleri onaylayın (acknowledge). Şu an `verified` bayrağı DEMO sağlayıcı tarafından ayarlanır — **gerçek ödeme doğrulaması yoktur.**
- Yerel kayıttaki haklar (premium vb.) istemci tarafında değiştirilebilir; yayında hak durumu her açılışta mağaza/sunucudan yeniden kurulmalıdır (`restorePurchases`).
- Sandık gibi rastgele ödül mekanikleri şu an yalnızca oyun içi jetonla açılır. **Gerçek parayla** rastgele ödül satmayı düşünüyorsanız Google Play'in olasılık açıklama kurallarına ve bölgenizin mevzuatına uyun.

## Lisans ve varlıklar

Kod: MIT (`LICENSE`). Tüm sesler Web Audio ile çalışma anında sentezlenir, modeller koddan üretilir, simge (`assets/`) bu proje için üretilmiştir; üçüncü taraf telifli varlık yoktur. Üçüncü taraf bağımlılıklar kendi lisanslarına tabidir (three.js: MIT, Capacitor: MIT).

---

## Durum raporu

**Uygulandı:** (kodda yazılı) çekirdek oyun döngüsü; 3D parkur, şerit kontrolü, kamera; kapı/engel/pickup sistemleri; savaş çözümü; 5 boss + mini boss; 30 veri odaklı bölüm; sonsuz mod; ekonomi, 8 yükseltme, 8 asker sınıfı; görev/başarım/istatistik; günlük ödül; sandık; kayıt sistemi (sürümlü, sağlamalı, yedekli); DEMO reklam ve DEMO mağaza durum makineleri; tüm menüler, HUD, duraklatma, bölüm sonu; Android geri tuşu/arka plana alınca duraklatma; Capacitor Android projesi; CI iş akışı.

**Test edildi:** 85 birim testi geçiyor (`npm test`); `tsc` temiz; üretim derlemesi başarılı; masaüstü Chromium'da (390×844, yazılım WebGL) bölüm 1, bölüm 10 (boss dâhil) ve sonsuz mod otomatik olarak oynatıldı, konsol hatası yok.

**Henüz yapılmadı:** gerçek GLB/glTF modeller ve iskelet animasyonları (şu an geçici low-poly figürler, koşma/zafer/düşme animasyonları yok — yalnızca sallanma); kozmetiklerin seçilip donatılması (şu an yalnızca Altın görünüm otomatik uygulanır); premium görev yolu / sezon bileti içeriği; ek ortam dokuları ve çevre modelleri (ortamlar renk/ışık/sis/dekor ile ayrışır); titreşim dışında dokunsal geri bildirim; analitik/hata kaydı; ses dosyaları (sentezlenmiş basit sesler); boss'lar için bölüm-sonu nadir kozmetik ekranı animasyonu; çok dilli destek (yalnızca Türkçe).

**Harici kurulum gerekiyor:** Android SDK ile gerçek APK/AAB derlemesi (bu ortamda SDK indirilemedi → **APK/AAB burada üretilmedi ve cihazda denenmedi**); keystore ve GitHub Secrets; Play Console kaydı ve ürünleri; gerçek reklam SDK'sı ve hesabı; Google Play Billing + sunucu doğrulama; gizlilik politikası; gerçek cihaz ve emülatör testleri (dokunmatik kontrol hissi, çentik/güvenli alan, 30/60 FPS, düşük donanım, bellek, arka plana alma/geri dönme, Android geri tuşu).
