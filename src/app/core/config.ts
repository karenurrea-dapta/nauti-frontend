export const API_BASE = 'https://nauti-backend-333078302263.us-central1.run.app';

export const BATCH_API_BASE = 'https://next-wave-hack-production.up.railway.app';

// Nauti Engine (OpenCode server) — the AI assistant backend.
// '/engine' is proxied: locally by proxy.conf.json (ng serve), in prod by the
// vercel.json rewrite. Same-origin on both sides, so no CORS is involved.
export const NAUTI_ENGINE_BASE = '/engine';
export const NAUTI_ENGINE_AGENT = 'nauti-assistant';
