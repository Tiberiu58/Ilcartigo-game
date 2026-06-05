/// <reference types="vite/client" />

/**
 * Typed access to the Vite build-time env vars this project reads.
 * Only `VITE_`-prefixed vars are exposed on `import.meta.env`.
 *
 *   VITE_SERVER_URL — multiplayer server origin (e.g. https://ilcartigo-server.fly.dev).
 *                     Unset in local dev → NetClient falls back to http://<host>:3001.
 */
interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
