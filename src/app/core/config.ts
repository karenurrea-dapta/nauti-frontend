export const API_BASE = 'https://nauti-backend-333078302263.us-central1.run.app';

export const DAPTA_CALL_AGENTS_URL =
  'https://api.dapta.ai/api/727fa9f119dea137/call_other_agents';
export const DAPTA_CALL_AGENTS_KEY =
  'S1qq3-727fa9f1-f279-475f-bec7-dc0419dea137-a';

// Nauti Engine (OpenCode server) — the AI assistant backend.
// '/engine' is proxied: locally by proxy.conf.json (ng serve), in prod by the
// vercel.json rewrite. Same-origin on both sides, so no CORS is involved.
export const NAUTI_ENGINE_BASE = '/engine';
export const NAUTI_ENGINE_AGENT = 'nauti-assistant';
