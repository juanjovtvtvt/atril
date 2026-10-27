import type { CapacitorConfig } from '@capacitor/cli';

/*
 * Android app (APK) with Capacitor: it packages the same React build (dist) in a native WebView.
 * The data stays in SQL Server on the PC, which the app reaches over the Wi-Fi (VITE_API_URL).
 * The API is plain http on the local network, so the app is served over http as well (androidScheme)
 * and cleartext traffic is allowed.
 */
const config: CapacitorConfig = {
  appId: 'com.atril.lector',
  appName: 'Atril',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
