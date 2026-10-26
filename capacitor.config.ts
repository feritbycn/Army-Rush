import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Google Play paket kimliği: yayından önce kendi alan adınıza göre DEĞİŞTİRİN. Yayınlandıktan sonra değiştirilemez.
  appId: 'com.example.armyrush',
  appName: 'Army Rush',
  webDir: 'dist',
  android: { allowMixedContent: false },
  backgroundColor: '#0b1020',
};

export default config;
