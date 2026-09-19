# PR-2: Add project README

## Description

Selene IA had no user-facing entry point at the repository root. Knowledge of the system lived in `AGENTS.md`, the architecture evaluation document, and the `openspec/` artifacts, but there was no single document that explains what the project is, how the pieces fit together, and how to run it locally. New developers and reviewers had to reconstruct the architecture from source.

This PR adds `README.md`, which documents the three-layer architecture: a vanilla-JS browser client built with Vite and Firebase, an Express proxy that owns the Gemini API key, and the Gemini API itself. It also covers repository layout, tech stack, prerequisites, local setup, environment variables, npm scripts, features, known limitations, and pointers to the existing documentation.

Since the Gemini-to-server proxy change (F0) landed, the API key lives only on the server. The README makes that security model explicit and makes the two-process local workflow (client dev server + proxy) reproducible.

## Changes Made

### Documentation

- `README.md` — new file (131 lines) introducing Selene IA: an AI chat assistant for businesses, pre-release (v0.0.0), with UI placeholders called out.
- `README.md` — architecture section: browser client (`src/`) sends no `GEMINI_API_KEY`; the Express proxy (`server/index.js`) owns the key, builds the system instruction from `src/config/systemInstruction.js`, calls Gemini via the `@google/generative-ai` SDK, and exposes `POST /api/gemini/chat` and `POST /api/gemini/title`.
- `README.md` — server behaviors: `MODEL_PRIORITY` model fallback (`gemini-3.5-flash-lite` → `gemini-3.6-flash`), CORS allowlist for the Vite dev server, and JSONL usage logging to `server/data/usage.log.jsonl` (gitignored).
- `README.md` — repository layout table (`src/`, `src/components/`, `src/services/`, `src/config/`, `src/landing_comp/`, `src/styles/`, `server/`, `scripts/`, `public/`, `docs/`, `openspec/`).
- `README.md` — tech stack, prerequisites (Node.js `^20.19.0 || >=22.12.0`, Google Cloud + Firebase projects), and a step-by-step getting-started guide.
- `README.md` — environment variable reference: `GEMINI_API_KEY` (server only), `VITE_API_URL`, and the `VITE_FIREBASE_*` set read by `src/firebase-config.js`, with a note that `.env.example` currently documents only the first two.
- `README.md` — npm script reference matching `package.json`: `dev`, `dev:server`, `build` (with `prebuild` hook), `preview`, `sync:selene-knowledge`.
- `README.md` — features and known limitations (image-upload and microphone buttons are UI placeholders), plus links to `AGENTS.md`, `docs/decisions/technical-decisions.md`, and the `openspec/` artifacts.

## Impact

Documentation-only change: no runtime behavior, dependencies, or configuration are modified. The README accurately reflects the current system — every script name, file path, environment variable, and model in `MODEL_PRIORITY` was verified against the codebase.

New contributors now have a working local-setup path: install dependencies, create `.env` from `.env.example` (adding the `VITE_FIREBASE_*` variables manually until the example file is updated), then run `npm run dev` and `npm run dev:server` in separate terminals.

No backward-compatibility concerns. The only known caveat is documented in the README itself: `.env.example` does not yet include the Firebase variables, so fresh setups must add them by hand.

## Notes

- Verification: cross-check the Scripts section against `package.json`, and the architecture/endpoint claims against `server/index.js` and `src/`.
- The working tree also contains uncommitted modifications under `.atl/` (skill-registry cache and index). They are tooling churn unrelated to this PR and were intentionally excluded.
- Known follow-up: update `.env.example` with the `VITE_FIREBASE_*` variables so the README note becomes unnecessary.