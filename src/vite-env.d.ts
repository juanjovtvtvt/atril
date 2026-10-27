/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API address for the Android app, e.g. http://192.168.0.103:3001. Empty on the web. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
