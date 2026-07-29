# AGENTS.md

## Cursor Cloud specific instructions

SUMA-AI Copilot is a **frontend-only** app: Vue 3 + TypeScript + Vite, package manager `npm`, Node `>=22.13.0`. There is no backend service in this repo; the "backend" (AI answers) is an external n8n webhook, and auth/data are external Firebase (Auth + Firestore). No local emulator is provided.

Standard commands live in `package.json` scripts — use those instead of duplicating:
- Dev server: `npm run dev` (Vite, http://localhost:5173).
- Lint: `npm run lint`. Tests: `npm test` (Node built-in test runner, `tests/*.test.mjs`, no backend needed). Build: `npm run build` (runs `vue-tsc --noEmit` then `vite build`). Combined: `npm run check` (lint + test + build).

Non-obvious gotchas:
- The auth/chat UI is gated on Firebase config. Without the `VITE_FIREBASE_*` vars (normally in a git-ignored `.env.local`), the login/register **form fields are hidden** and a red "Firebase belum dikonfigurasi" notice is shown. The dev server and UI shell still render fine — this is expected, not a build failure.
- A genuine end-to-end flow (register/login → chat) additionally needs a reachable n8n webhook via `VITE_N8N_WEBHOOK_URL` (+ `VITE_SUMAI_COMPANY_ID`). These plus the Firebase web config are external and are NOT in the repo; see `.env.example`. Groq/Gemini/Google-Sheets keys are configured inside n8n, not here.
- `VITE_*` values are build-time only (baked into the bundle); changing them requires restarting `npm run dev` (or rebuilding).
- Optional full self-hosted stack (nginx + n8n + Postgres) is documented in `DOCKER.md` / `compose.yaml`; not required for frontend development or for lint/test/build.
