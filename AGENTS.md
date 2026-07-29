# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is

Single-product repo: **SUMA-AI Copilot**, a Vue 3 + TypeScript + Vite frontend SPA (Indonesian UI). It talks to cloud **Firebase** (Auth + Firestore) for accounts/sessions/memory, and to an **n8n** webhook (backed by Google Gemini + an external Analytics API) for AI chat and file analysis. There is no in-repo backend; the backend services are external/cloud. Package manager is **npm** (see `package-lock.json`); Node `>=22.13` is required (the VM has a compatible Node).

### Standard commands (already defined in `package.json`)

- Dev server: `npm run dev` (Vite, serves at `http://localhost:5173`).
- Lint: `npm run lint` (ESLint flat config in `eslint.config.js`).
- Tests: `npm test` (Node built-in test runner over `tests/*.test.mjs`, uses `--experimental-strip-types`; the "Type Stripping is experimental" warning is expected and harmless). These are self-contained unit tests of core logic (AI scope, chat store, personal memory, n8n contract, file analysis) and need no external services.
- Build: `npm run build` (runs `vue-tsc --noEmit` typecheck, then `vite build`). The ">500 kB chunk" warning is expected.
- `npm run check` chains lint + test + build.

### Non-obvious caveats

- **The whole UI is gated behind Firebase auth.** Without Firebase env vars the auth screen renders a "Firebase belum dikonfigurasi" notice and hides the login/register form (see `src/lib/firebase.ts` `isFirebaseConfigured`). So login, chat, sessions, memory, and file upload cannot be exercised end-to-end without real Firebase config. This is expected behavior, not a bug.
- Runtime config comes from `VITE_*` env vars, normally placed in a **gitignored `.env.local`** (copy from `.env.example`). Required for the app to function: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, plus `VITE_N8N_WEBHOOK_URL` (and `VITE_SUMAI_COMPANY_ID`, default `COMPANY-001`) for AI chat. These are secrets and are not committed; set them in the Cloud Agent Secrets panel when the full flow must be tested.
- AI chat / file analysis additionally require a reachable, active n8n workflow with a Google Gemini credential and outbound HTTPS to the Analytics API. See `README-N8N.md` and `README-FILE-ANALYSIS.md`.
- The full Docker stack (`compose.yaml`, `DOCKER.md`) bundles n8n + PostgreSQL + Nginx and needs `.env` secrets (>=32 char). It is heavier and not needed for frontend dev; prefer `npm run dev` for iterating on the SPA.
- ESLint ignores `dist/`, `node_modules/`, and `n8n/`.
