// Army Rush — uygulama girişi: menüler, kayıt, ekonomi akışları ve oyun döngüsünün bağlanması.
import { DemoAdProvider, adBlockReason, watchAdForCoins, type AdProvider } from './core/ads';
import { DemoBilling, handleBillingEvent, hasPremium, hasRemoveAds, restorePurchases, type BillingProvider } from './core/store';
import {
  buyChest, buyClass, buyUpgrade, canClaimDaily, checkAchievements, claimDaily, claimQuest, dateKey, earnCoins, isLevelUnlocked,
  nextUpgradeCost, openChestFree, questDone, selectClass, upgradeLevel,
} from './core/progress';
import { MemoryKV, loadSave, writeSave, type KV, type SaveData } from './core/save';
import { ACHIEVEMENTS, CHEST, COSMETICS, DAILY_REWARDS, ECONOMY, QUESTS, UPGRADES } from './data/economy';
import { ENVS, LEVELS, LEVEL_COUNT } from './data/levels';
import { PRODUCTS, getProduct } from './data/products';
import { SOLDIER_CLASSES } from './data/soldiers';
import { Game, type EndInfo } from './game/game';
import { Sfx } from './game/audio';

// ------------------------------------------------------------------ depolama
function makeKV(): KV {
  try {
    const t = '__armyrush_probe';
    localStorage.setItem(t, '1'); localStorage.removeItem(t);
    return localStorage;
  } catch { return new MemoryKV(); }
}
const kv = makeKV();
const save: SaveData = loadSave(kv);
const persist = () => writeSave(kv, save);

// ------------------------------------------------------------------ sağlayıcılar (DEMO)
// Gerçek reklam SDK'sı / Google Play Billing bağlanana kadar DEMO sağlayıcılar kullanılır (bkz. README).
const ads: AdProvider = new DemoAdProvider('complete');
const billing: BillingProvider = new DemoBilling('purchased');

// ------------------------------------------------------------------ DOM
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const menu = $('menu'); const pauseEl = $('pause'); const endEl = $('end'); const hudEl = $('hud');
const sfx = new Sfx();
const tz = () => -new Date().getTimezoneOffset();
const today = () => dateKey(Date.now(), tz());
const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'K' : String(Math.floor(n)));

type View = 'home' | 'levels' | 'soldiers' | 'upgrades' | 'quests' | 'rewards' | 'shop' | 'premium' | 'settings';
let view: View = 'home';
let note = '';
let lastEnd: EndInfo | null = null;
let adBonusUsed = false;
let lastMode: { type: 'level'; id: number } | { type: 'endless' } = { type: 'level', id: 1 };

const game = new Game($<HTMLCanvasElement>('game'), save, {
  persist,
  onEnd: (info) => { lastEnd = info; adBonusUsed = false; showEnd(); },
}, sfx);

function show(el: HTMLElement, on: boolean): void { el.classList.toggle('show', on); }
function hud(on: boolean): void { hudEl.style.display = on ? 'block' : 'none'; }

// ------------------------------------------------------------------ yardımcı arayüz parçaları
const topBar = () =>
  `<div class="bar"><span>🪙 ${fmt(save.coins)}</span><span>💎 ${fmt(save.crystals)}</span></div>`;
const backBtn = `<button class="btn sec" data-act="nav" data-v="home">← Ana menü</button>`;
const noteHtml = () => (note ? `<div class="note">${note}</div>` : '');

function adReasonText(r: ReturnType<typeof adBlockReason>): string {
  switch (r) {
    case 'unavailable': return 'Reklam şu an kullanılamıyor';
    case 'daily_limit': return 'Günlük reklam limiti doldu';
    case 'cooldown': return 'Biraz bekleyin';
    default: return '';
  }
}

function adButton(label: string, act: string, data = ''): string {
  if (hasRemoveAds(save)) return `<button class="btn" data-act="${act}" ${data}>${label} (reklamsız)</button>`;
  const r = adBlockReason(save, ads, Date.now(), tz());
  const demo = ads.isDemo ? ' <small>DEMO</small>' : '';
  return `<button class="btn" data-act="${act}" ${data} ${r ? 'disabled' : ''}>▶ ${label}${demo}</button>${r ? `<div class="demo">${adReasonText(r)}</div>` : ''}`;
}

// ------------------------------------------------------------------ menü görünümleri
function renderMenu(): void {
  hud(false); show(pauseEl, false); show(endEl, false); show(menu, true);
  menu.classList.toggle('scroll', view !== 'home');
  let h = '';
  switch (view) {
    case 'home': h = homeView(); break;
    case 'levels': h = levelsView(); break;
    case 'soldiers': h = soldiersView(); break;
    case 'upgrades': h = upgradesView(); break;
    case 'quests': h = questsView(); break;
    case 'rewards': h = rewardsView(); break;
    case 'shop': h = shopView(); break;
    case 'premium': h = premiumView(); break;
    case 'settings': h = settingsView(); break;
  }
  menu.innerHTML = h;
}

function homeView(): string {
  const next = Math.min(save.unlockedLevel, LEVEL_COUNT);
  const daily = canClaimDaily(save, today()) ? ' 🎁' : '';
  const q = QUESTS.some((x) => questDone(save, x.id) && !save.quests.claimed.includes(x.id)) ? ' ❗' : '';
  return `${topBar()}
    <h1>ARMY RUSH</h1>
    <p>Ordunu büyüt, kapıları akıllıca seç!</p>
    <button class="btn big" data-act="play" data-id="${next}">▶ Oyna — Bölüm ${next}</button>
    <div class="grid">
      <button class="btn sec" data-act="nav" data-v="levels">Bölümler</button>
      <button class="btn sec" data-act="endless">Sonsuz Mod</button>
      <button class="btn sec" data-act="nav" data-v="soldiers">Askerler</button>
      <button class="btn sec" data-act="nav" data-v="upgrades">Yükseltmeler</button>
      <button class="btn sec" data-act="nav" data-v="quests">Görevler${q}</button>
      <button class="btn sec" data-act="nav" data-v="rewards">Ödüller${daily}</button>
      <button class="btn sec" data-act="nav" data-v="shop">Mağaza</button>
      <button class="btn sec" data-act="nav" data-v="premium">Premium${hasPremium(save) ? ' ✔' : ''}</button>
      <button class="btn sec" data-act="nav" data-v="settings">Ayarlar</button>
    </div>
    <div class="demo">Sürüm 0.1 · Geçici prototip modeller (GLB varlıkları henüz yok)</div>`;
}

function levelsView(): string {
  const cells = LEVELS.map((l) => {
    const ok = isLevelUnlocked(save, l.id);
    const done = l.id < save.unlockedLevel;
    const tag = l.boss ? '👑' : l.miniBoss ? '☠' : '';
    return `<button class="lvl ${ok ? '' : 'locked'} ${done ? 'done' : ''}" ${ok ? '' : 'disabled'} data-act="play" data-id="${l.id}">
      <b>${l.id}</b><small>${ENVS[l.env].name}</small><small>${tag} ${done ? '✔' : ok ? '' : '🔒'}</small></button>`;
  }).join('');
  return `${topBar()}<h2>Bölümler</h2><div class="lvls">${cells}</div>${backBtn}`;
}

function soldiersView(): string {
  const rows = SOLDIER_CLASSES.map((c) => {
    const owned = save.unlockedClasses.includes(c.id);
    const sel = save.selectedClass === c.id;
    const action = sel ? `<button class="btn sec" disabled>Seçili</button>`
      : owned ? `<button class="btn" data-act="selclass" data-id="${c.id}">Seç</button>`
        : `<button class="btn" data-act="buyclass" data-id="${c.id}" ${save.coins < c.unlockCost ? 'disabled' : ''}>🪙 ${c.unlockCost}</button>`;
    return `<div class="card"><div class="sw" style="background:#${c.color.toString(16).padStart(6, '0')}"></div>
      <div class="grow"><b>${c.name}</b><small>${c.ability}</small>
      <small>❤ ${c.hp} · ⚔ ${c.atk} · ⏱ ${c.rate}/sn · 🎯 ${c.range} · 🏃 ${c.speed} · 🛡 %${Math.round(c.armor * 100)}${c.healPerSec ? ` · ✚ ${c.healPerSec}/sn` : ''}</small></div>${action}</div>`;
  }).join('');
  return `${topBar()}<h2>Askerler</h2>${noteHtml()}${rows}${backBtn}`;
}

function upgradesView(): string {
  const rows = UPGRADES.map((u) => {
    const lv = upgradeLevel(save, u.id); const cost = nextUpgradeCost(save, u.id);
    const btn = cost === null ? `<button class="btn sec" disabled>MAKS</button>`
      : `<button class="btn" data-act="buyup" data-id="${u.id}" ${save.coins < cost ? 'disabled' : ''}>🪙 ${cost}</button>`;
    return `<div class="card"><div class="grow"><b>${u.name}</b><small>${u.desc}</small><small>Seviye ${lv} / ${u.maxLevel}</small></div>${btn}</div>`;
  }).join('');
  return `${topBar()}<h2>Yükseltmeler</h2>${rows}${backBtn}`;
}

function questsView(): string {
  const qs = QUESTS.map((q) => {
    const p = Math.floor(save.quests.progress[q.id] ?? 0);
    const claimed = save.quests.claimed.includes(q.id);
    const done = questDone(save, q.id);
    const reward = `🪙 ${q.coins}${q.crystals ? ` 💎 ${q.crystals}` : ''}`;
    const btn = claimed ? `<button class="btn sec" disabled>Alındı</button>`
      : `<button class="btn" data-act="claimq" data-id="${q.id}" ${done ? '' : 'disabled'}>${done ? 'Al ' + reward : reward}</button>`;
    return `<div class="card"><div class="grow"><b>${q.name}</b><small>${p} / ${q.target}</small></div>${btn}</div>`;
  }).join('');
  const ach = ACHIEVEMENTS.map((a) => `<div class="card"><div class="grow"><b>${save.achievements.includes(a.id) ? '🏆' : '⬜'} ${a.name}</b></div></div>`).join('');
  const s = save.stats;
  const stats = `<div class="card col"><b>İstatistikler</b>
    <small>Oynama süresi: ${Math.floor(s.playSec / 60)} dk</small><small>Tamamlanan bölüm: ${s.levelsDone}</small>
    <small>Yenilen boss: ${s.bossesKilled}</small><small>Yenilen düşman: ${s.enemiesKilled}</small>
    <small>En büyük ordu: ${s.bestArmy}</small>
    <small>Sonsuz mod rekoru: ${save.endless.bestDistance} m (ordu ${save.endless.bestArmy})</small></div>`;
  return `${topBar()}<h2>Görevler</h2>${qs}<h2>Başarımlar</h2>${ach}${stats}${backBtn}`;
}

function rewardsView(): string {
  const can = canClaimDaily(save, today());
  const nextDay = can ? (save.daily.lastDate && dayGap() === 1 ? (save.daily.streak % DAILY_REWARDS.length) + 1 : 1) : -1;
  const days = DAILY_REWARDS.map((r) => {
    const cur = r.day === nextDay;
    const past = !can && ((save.daily.streak - 1) % DAILY_REWARDS.length) + 1 >= r.day;
    return `<div class="day ${cur ? 'cur' : ''} ${past ? 'past' : ''}"><b>${r.day}. gün</b><small>${r.label}</small></div>`;
  }).join('');
  const odds = CHEST.drops.map((d) => `<small>${d.label}: %${((d.weight / CHEST.drops.reduce((a, x) => a + x.weight, 0)) * 100).toFixed(1)}</small>`).join('');
  const owned = COSMETICS.map((c) => `<small>${save.cosmetics.includes(c.id) ? '✔' : '✖'} ${c.name} (${c.rarity})${c.premium ? ' · Premium' : ''}</small>`).join('');
  return `${topBar()}<h2>Günlük Ödül</h2><div class="days">${days}</div>
    <button class="btn" data-act="daily" ${can ? '' : 'disabled'}>${can ? 'Ödülü Al' : 'Yarın tekrar gel'}</button>
    ${save.daily.lastDate === today() ? adButton('Ek bonus +100 jeton', 'dailyAd') : ''}
    ${noteHtml()}
    <h2>Sandık</h2>
    <div class="card col"><b>Özel Sandık — 🪙 ${CHEST.cost}</b>${odds}
      <small>Garanti: ${CHEST.pityAfter} açılışta bir nadir veya epik. Sandıklar yalnızca oyun içi jetonla açılır, gerçek para harcanmaz.</small>
      <small>Açılan sandık: ${save.chestsOpened}</small></div>
    <button class="btn" data-act="chest" ${save.coins < CHEST.cost ? 'disabled' : ''}>Sandık Aç</button>
    ${adButton('Bedava sandık', 'chestAd')}
    <h2>Koleksiyon</h2><div class="card col">${owned}</div>${backBtn}`;
}
function dayGap(): number {
  const a = Date.parse(save.daily.lastDate + 'T00:00:00Z'); const b = Date.parse(today() + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

function ownedProduct(id: string): boolean {
  const p = getProduct(id);
  return !!p && p.type !== 'consumable' && save.purchases.some((r) => r.productId === id && r.state === 'purchased' && r.verified);
}

function productCard(p: (typeof PRODUCTS)[number]): string {
  const price = billing.priceOf(p.id) ?? '— (DEMO)';
  const own = ownedProduct(p.id);
  const pending = save.purchases.some((r) => r.productId === p.id && r.state === 'pending');
  const kind = p.type === 'consumable' ? 'Tüketilebilir' : p.type === 'non_consumable' ? 'Tek seferlik' : 'Abonelik';
  const btn = own ? `<button class="btn sec" disabled>Sahipsin</button>`
    : pending ? `<button class="btn sec" disabled>Beklemede</button>`
      : `<button class="btn" data-act="buy" data-id="${p.id}">${price}</button>`;
  return `<div class="card"><div class="grow"><b>${p.name}</b><small>${p.contents}</small><small>${kind}</small></div>${btn}</div>`;
}

function shopView(): string {
  const demo = billing.isDemo ? `<div class="warn">DEMO MAĞAZA: gerçek ödeme alınmaz, fiyat gösterilmez. Gerçek fiyatlar Google Play'den gelecektir.</div>` : '';
  return `${topBar()}<h2>Mağaza</h2>${demo}${noteHtml()}${PRODUCTS.map(productCard).join('')}
    <button class="btn sec" data-act="restore">Satın almaları geri yükle</button>${backBtn}`;
}

function premiumView(): string {
  const on = hasPremium(save);
  const demo = billing.isDemo ? `<div class="warn">DEMO MAĞAZA: gerçek ödeme alınmaz.</div>` : '';
  const p = getProduct('premium_forever')!;
  return `${topBar()}<h2>Premium ${on ? '✔' : ''}</h2>${demo}${noteHtml()}
    <div class="card col"><b>Premium yalnızca kozmetiktir</b>
      <small>Özel asker görünümü, premium profil çerçevesi, ek kozmetik koleksiyonu.</small>
      <small>Temel bölümler ve tüm oynanış mekanikleri ücretsiz oyuncular için de açıktır; Premium savaş gücünü değiştirmez.</small></div>
    ${productCard(p)}${backBtn}`;
}

function settingsView(): string {
  const s = save.settings;
  return `${topBar()}<h2>Ayarlar</h2>
    <div class="card"><div class="grow"><b>Ses efektleri</b></div><button class="btn sec" data-act="set" data-k="sfx">${s.sfx ? 'Açık' : 'Kapalı'}</button></div>
    <div class="card"><div class="grow"><b>Ses seviyesi</b></div><input type="range" min="0" max="100" value="${Math.round(s.volume * 100)}" data-range="volume"></div>
    <div class="card"><div class="grow"><b>Kontrol hassasiyeti</b></div><input type="range" min="30" max="300" value="${Math.round(s.sensitivity * 100)}" data-range="sensitivity"></div>
    <div class="card"><div class="grow"><b>Grafik</b></div><button class="btn sec" data-act="set" data-k="gfx">${s.gfx === 'high' ? 'Yüksek' : 'Düşük'}</button></div>
    <div class="card"><div class="grow"><b>Hedef FPS</b></div><button class="btn sec" data-act="set" data-k="fps">${s.fps}</button></div>
    <div class="card col"><small>Lisans: MIT (kod). Ses ve modeller proje içinde üretilmiştir.</small></div>${backBtn}`;
}

// ------------------------------------------------------------------ bölüm sonu / duraklatma
function showEnd(): void {
  const e = lastEnd; if (!e) return;
  hud(false); show(menu, false); show(pauseEl, false);
  const title = e.win ? (e.bossDefeated ? '👑 Boss Yenildi!' : '🏁 Zafer!') : e.mode === 'endless' ? 'Koşu Bitti' : '💀 Yenilgi';
  const lines: string[] = [];
  if (e.mode === 'endless') {
    lines.push(`Mesafe: ${e.distance} m${e.newRecord ? ' 🏆 YENİ REKOR' : ''}`);
    lines.push(`En büyük ordu: ${e.bestArmy}`);
  } else if (e.win) {
    lines.push(`Kalan asker: ${e.survivors}`);
  } else {
    lines.push('Ordu yok edildi. Kapıları ve engelleri daha dikkatli seç!');
  }
  lines.push(`Yenilen düşman: ${e.kills}`);
  lines.push(`Kazanılan: 🪙 ${e.coins}${e.crystals ? ` · 💎 ${e.crystals}` : ''}`);
  const done = QUESTS.filter((q) => questDone(save, q.id) && !save.quests.claimed.includes(q.id)).length;
  if (done) lines.push(`❗ ${done} görev ödülü seni bekliyor`);
  const bonus = Math.floor(e.coins * ECONOMY.adBonusMultiplier);
  let adHtml = '';
  if (e.coins > 0 && !adBonusUsed) adHtml += adButton(`+${bonus} jeton al`, 'endAd');
  if (!e.win && e.canContinue && game.canContinue) adHtml += adButton('Devam et', 'continueAd');
  const hasNext = e.mode === 'level' && e.win && e.levelId !== undefined && e.levelId < LEVEL_COUNT;
  endEl.innerHTML = `<h1>${title}</h1>${lines.map((l) => `<p>${l}</p>`).join('')}${noteHtml()}${adHtml}
    <div class="row">
      <button class="btn" data-act="retry">Tekrar dene</button>
      ${hasNext ? `<button class="btn" data-act="next">Sonraki bölüm</button>` : ''}
      <button class="btn sec" data-act="home">Ana menü</button></div>`;
  show(endEl, true);
}

function showPause(): void {
  pauseEl.innerHTML = `<h1>Duraklatıldı</h1>
    <button class="btn" data-act="resume">Devam</button>
    <button class="btn sec" data-act="retry">Yeniden başlat</button>
    <button class="btn sec" data-act="set" data-k="sfx">Ses: ${save.settings.sfx ? 'Açık' : 'Kapalı'}</button>
    <button class="btn sec" data-act="home">Ana menü</button>`;
  show(pauseEl, true);
}

// ------------------------------------------------------------------ akış
function startGame(mode: typeof lastMode): void {
  lastMode = mode; note = '';
  show(menu, false); show(endEl, false); show(pauseEl, false); hud(true);
  game.start(mode);
}

function goHome(): void {
  game.stop(); view = 'home'; note = ''; renderMenu();
}

async function onAction(act: string, el: HTMLElement): Promise<void> {
  const id = el.dataset.id ?? '';
  sfx.play('click');
  switch (act) {
    case 'nav': view = (el.dataset.v as View) ?? 'home'; note = ''; renderMenu(); return;
    case 'play': if (isLevelUnlocked(save, Number(id))) startGame({ type: 'level', id: Number(id) }); return;
    case 'endless': startGame({ type: 'endless' }); return;
    case 'retry': game.stop(); startGame(lastMode); return;
    case 'next': if (lastEnd?.levelId) { game.stop(); startGame({ type: 'level', id: Math.min(LEVEL_COUNT, lastEnd.levelId + 1) }); } return;
    case 'home': goHome(); return;
    case 'resume': show(pauseEl, false); game.resume(); return;
    case 'buyclass': note = buyClass(save, id) ? 'Sınıf açıldı!' : 'Yeterli jeton yok.'; break;
    case 'selclass': selectClass(save, id); note = ''; break;
    case 'buyup': if (!buyUpgrade(save, id)) note = 'Yeterli jeton yok.'; break;
    case 'claimq': claimQuest(save, id); break;
    case 'daily': {
      const r = claimDaily(save, today());
      note = r.ok ? `${r.day}. gün ödülü alındı!` : 'Bugünkü ödül zaten alındı.'; checkAchievements(save); sfx.play('coin'); break;
    }
    case 'dailyAd': {
      const r = hasRemoveAds(save) ? (earnCoins(save, 100), { granted: true }) : await watchAdForCoins(save, ads, 'daily_bonus', 100, Date.now(), tz());
      note = r.granted ? 'Bonus +100 jeton!' : 'Ödül verilmedi (reklam tamamlanmadı).'; break;
    }
    case 'chest': {
      const got = buyChest(save, Math.random);
      note = got ? `Sandıktan çıkan: ${CHEST.drops.find((d) => d.id === got)?.label ?? got}` : 'Yeterli jeton yok.'; break;
    }
    case 'chestAd': {
      const r = await watchAdForCoins(save, ads, 'chest', 0, Date.now(), tz());
      if (r.granted) {
        const got = openChestFree(save, Math.random);
        note = `Bedava sandık: ${CHEST.drops.find((d) => d.id === got)?.label ?? got}`;
      } else note = 'Sandık verilmedi (reklam tamamlanmadı).';
      break;
    }
    case 'buy': {
      const ev = await billing.purchase(id);
      handleBillingEvent(save, ev, billing.isDemo);
      note = ev.kind === 'purchased' ? 'Satın alma tamamlandı (DEMO).' : ev.kind === 'pending' ? 'Ödeme beklemede.' : 'Satın alma iptal edildi.';
      break;
    }
    case 'restore': {
      const n = await restorePurchases(save, billing);
      note = n > 0 ? `${n} satın alma geri yüklendi.` : 'Geri yüklenecek yeni satın alma yok.'; break;
    }
    case 'set': {
      const k = el.dataset.k;
      if (k === 'sfx') save.settings.sfx = !save.settings.sfx;
      else if (k === 'gfx') save.settings.gfx = save.settings.gfx === 'high' ? 'low' : 'high';
      else if (k === 'fps') save.settings.fps = save.settings.fps === 60 ? 30 : 60;
      game.applySettings(); persist();
      if (game.paused) showPause(); else renderMenu();
      return;
    }
    case 'endAd': {
      const coins = Math.floor((lastEnd?.coins ?? 0) * ECONOMY.adBonusMultiplier);
      const r = hasRemoveAds(save) ? (earnCoins(save, coins), { granted: true }) : await watchAdForCoins(save, ads, 'level_double', coins, Date.now(), tz());
      if (r.granted) { adBonusUsed = true; note = `Bonus +${coins} jeton!`; sfx.play('coin'); } else note = 'Ödül verilmedi; temel ödülün korundu.';
      persist(); showEnd(); return;
    }
    case 'continueAd': {
      const r = await watchAdForCoins(save, ads, 'continue', 0, Date.now(), tz());
      persist();
      if (r.granted) { show(endEl, false); hud(true); note = ''; game.revive(); } else { note = 'Devam edilemedi (reklam tamamlanmadı).'; showEnd(); }
      return;
    }
  }
  persist();
  if (menu.classList.contains('show')) renderMenu();
}

document.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (el && !(el as HTMLButtonElement).disabled) void onAction(el.dataset.act!, el);
});
document.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement;
  const k = el.dataset.range; if (!k) return;
  if (k === 'volume') save.settings.volume = Number(el.value) / 100;
  if (k === 'sensitivity') save.settings.sensitivity = Number(el.value) / 100;
  game.applySettings(); persist();
});

$('pauseBtn').addEventListener('click', () => { if (game.isRunning) { game.pause(); showPause(); } });

// Uygulama arka plana alınınca otomatik duraklat + kaydet.
function autoPause(): void {
  persist();
  if (game.isRunning && !game.paused) { game.pause(); showPause(); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
window.addEventListener('pagehide', persist);

// Android geri tuşu (Capacitor varsa).
async function bindBackButton(): Promise<void> {
  try {
    const mod = await import('@capacitor/app');
    await mod.App.addListener('backButton', () => {
      if (endEl.classList.contains('show')) goHome();
      else if (pauseEl.classList.contains('show')) { show(pauseEl, false); game.resume(); }
      else if (game.isRunning) { game.pause(); showPause(); }
      else if (view !== 'home') { view = 'home'; renderMenu(); }
      else void mod.App.exitApp();
    });
    await mod.App.addListener('pause', autoPause);
  } catch { /* tarayıcıda Capacitor yoktur */ }
}
void bindBackButton();

// Başlangıç: satın almaları geri yükle, menüyü göster.
void restorePurchases(save, billing).then(persist);
renderMenu();

// Test/hata ayıklama için küçük yardımcı (yalnızca geliştirme).
if (import.meta.env?.DEV) (window as unknown as { __ar: unknown }).__ar = { save, game };
