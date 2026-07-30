# AGENTS.md

## Cursor Cloud specific instructions

This is a single frontend product: **SUMA-AI Copilot**, a Vue 3 + TypeScript + Vite SPA. Firebase Auth/Firestore and an n8n/AI webhook are external backends the app talks to; there is no local backend to run.

### Standard commands (defined in `package.json`)
- Dev server: `npm run dev` (Vite on `http://localhost:5173`).
- Lint: `npm run lint`.
- Tests: `npm test` (Node's built-in test runner over `tests/*.test.mjs`; no external services needed).
- Build: `npm run build` (`vue-tsc` typecheck + `vite build`). `npm run check` chains lint + test + build.

### Non-obvious notes
- Node `>=22.13.0` is required (`package.json` `engines`); the VM's default Node satisfies this.
- The dev server starts fine with no env vars, but the login card only renders when Firebase is configured. Without `VITE_FIREBASE_*` values the auth page shows a "Firebase belum dikonfigurasi" notice instead of the login/register form. To render the real UI locally, create a gitignored `.env.local` (see `.env.example`) with the `VITE_FIREBASE_*` keys. Placeholder values render the full form but real login/register fails with a Firebase `auth/api-key-not-valid` error — real credentials for the target Firebase project are needed for actual authentication, and a reachable `VITE_N8N_WEBHOOK_URL` is needed for the chat/AI flow.
- The AI chat reply comes from the external n8n webhook (`VITE_N8N_WEBHOOK_URL`). Sending a message always persists it to the chat thread, but a reply only arrives if that specific webhook path is active on the n8n instance. If the workflow is inactive (or the path is only registered in test mode), the host still responds `404` and the UI shows "Workflow n8n tidak dapat dihubungi" — that is an external-backend state, not a frontend bug.
- Full end-to-end (Firebase + n8n + Postgres) is a separate Docker stack (`compose.yaml`, see `DOCKER.md`/`README-N8N.md`); it is optional and not required for frontend development.
