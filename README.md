# Selene IA

Selene IA is an AI chat assistant for businesses. It is a single-page application written in vanilla JavaScript (no framework) with Vite and Tailwind CSS, backed by Firebase for Google Sign-In and data storage. All Gemini AI traffic flows through a small Node/Express proxy server that owns the Gemini API key, so the key never reaches the browser.

> Pre-release project (v0.0.0). Some UI affordances are placeholders — see [Features](#features).

## Architecture

```
┌────────────────────────┐   HTTP    ┌────────────────────────────┐    SDK    ┌──────────────┐
│  Browser client        │ ────────► │  Express proxy server      │ ────────► │  Gemini API  │
│  Vanilla JS + Vite     │           │  /api/gemini/chat          │           │              │
│  Firebase SDK          │ ◄──────── │  /api/gemini/title         │ ◄──────── │              │
│  (no Gemini API key)   │           │  owns GEMINI_API_KEY       │           │              │
└────────────────────────┘           └────────────────────────────┘           └──────────────┘
```

What each layer owns:

| Layer | Role |
|-------|------|
| Browser client (`src/`) | Renders the landing site and the chat app. Authenticates with Firebase, persists chats in Cloud Firestore, tracks presence in Realtime Database, and calls Gemini only through HTTP requests to the proxy (`src/services/gemini.js`). It never holds the Gemini API key. |
| Express proxy (`server/index.js`) | Owns `GEMINI_API_KEY`, builds the system instruction from `src/config/systemInstruction.js`, calls Gemini with the `@google/generative-ai` SDK, applies model fallback, enforces a CORS allowlist, and logs usage metadata. |
| Gemini API | Google's generative AI models. |

Proxy endpoints:

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `POST /api/gemini/chat` | Multi-turn chat completion (history sent with each request) | `{ "text": "..." }` |
| `POST /api/gemini/title` | Generates a short conversation title from the first message | `{ "text": "..." }` |

Other server behaviors:

- **Model fallback** — `MODEL_PRIORITY` in `server/index.js` tries `gemini-3.5-flash-lite` first, then `gemini-3.6-flash`. The older 2.5-series models return 404 and were removed.
- **CORS allowlist** — only `http://localhost:5173` and `http://127.0.0.1:5173` (the Vite dev server) are allowed.
- **Usage logging** — every Gemini call appends a JSONL entry to `server/data/usage.log.jsonl` (gitignored).

## Repository layout

| Path | Role |
|------|------|
| `src/` | Client application (vanilla JS ES modules, Vite entry `src/main.js`). |
| `src/components/` | UI components (Sidebar, ChatArea, InputArea, SettingsModal, Onboarding, LoginScreen, AFKMode, CookieConsent, UpdateBanner, ConfirmModal, PrivacyPolicyModal). |
| `src/services/` | Client logic: `api.js` (proxy base URL), `gemini.js` (HTTP bridge to the proxy), `auth.js` (Google Sign-In), `history.js` (Firestore chat history), `user.js` (Firestore profiles), `presence.js` (Realtime Database presence). |
| `src/config/` | `systemInstruction.js` (Selene's identity + knowledge prompt), `seleneProjectKnowledge.js` and generated variant, `seleneReleaseNotes.js`. |
| `src/landing_comp/` | Public marketing site: client-side router + pages (Home, Features, Privacy, Terms, Contact). |
| `src/styles/` | Per-component CSS. |
| `server/` | Express proxy (`index.js`) and `data/` for usage logs. |
| `scripts/` | `sync-selene-knowledge.mjs` — regenerates the project-knowledge file from static analysis of the source. |
| `public/` | Static assets (`vite.svg`, `ads.txt` for AdSense). |
| `docs/`, `openspec/`, `AGENTS.md` | Architecture and process docs — see [Documentation](#documentation). |

## Tech stack

| Layer | Technology |
|-------|------------|
| Language | JavaScript (ES modules), no framework |
| Client build | Vite 7, Tailwind CSS 3, PostCSS |
| Backend | Node.js + Express 4, `@google/generative-ai` SDK |
| Platform services | Firebase (Auth, Cloud Firestore, Realtime Database), Google Gemini, Google AdSense |

## Prerequisites

- **Node.js** `^20.19.0 || >=22.12.0` (Vite 7 requirement)
- A **Google Cloud project** with the Gemini API enabled and an API key
- A **Firebase project** with Authentication (Google Sign-In), Cloud Firestore, and Realtime Database enabled

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` at the project root with your credentials — see [Environment variables](#environment-variables). Start from `.env.example` and add the Firebase variables listed below.

3. Run the two local processes (each in its own terminal):

   ```bash
   # Terminal 1 — Vite dev server (client) on http://localhost:5173
   npm run dev

   # Terminal 2 — Express proxy (server) on http://localhost:3001
   npm run dev:server
   ```

4. Open `http://localhost:5173` and sign in with a Google account.

### Environment variables

All variables are read from `.env` at the project root.

| Variable | Used by | Purpose |
|----------|---------|---------|
| `GEMINI_API_KEY` | Server only | Gemini API key. No `VITE_` prefix, so it is never bundled into the client. Required — the proxy exits if it is missing. |
| `VITE_API_URL` | Client | Base URL of the proxy. Defaults to `http://localhost:3001`. |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`, `VITE_FIREBASE_DATABASE_URL` | Client | Firebase web-app configuration, read by `src/firebase-config.js`. |

> Note: `.env.example` currently documents only `GEMINI_API_KEY` and `VITE_API_URL`. The `VITE_FIREBASE_*` variables are required by `src/firebase-config.js` and must be added manually until the example file is updated.

## Scripts

| Script | Command | What it does |
|--------|---------|--------------|
| `dev` | `vite` | Starts the client dev server on port 5173. |
| `dev:server` | `node --env-file-if-exists=.env server/index.js` | Starts the Express proxy on port 3001, loading `.env` if present. |
| `build` | `vite build` | Builds the production bundle into `dist/`. The `prebuild` hook runs automatically first. |
| `preview` | `vite preview` | Serves the production build locally. |
| `sync:selene-knowledge` | `node scripts/sync-selene-knowledge.mjs` | Regenerates `src/config/seleneProjectKnowledge.generated.js` from static analysis of the source. Runs automatically before every build (`prebuild`). |

## Features

- Public landing pages with client-side routing (Home, Features, Privacy, Terms, Contact).
- Google Sign-In and a first-run onboarding flow before entering the chat app.
- Multi-turn chat with conversation history, sidebar, and auto-generated titles.
- Chat persistence in Cloud Firestore (per-user), including deleting conversations.
- Settings modal: font size, typing speed, animations, logout.
- Presence (online / last seen) via Firebase Realtime Database.
- Cookie-consent gate for ads; `ads.txt` shipped in `public/`.
- **Known limitations:** the image-upload and microphone buttons in the input area are UI placeholders ("feature not available") and do not yet upload or record anything.

## Documentation

| Document | Content |
|----------|---------|
| `AGENTS.md` | Team and agent conventions, including the mandatory Spec-Driven Development (SDD) workflow. |
| `Evaluacion-arquitectura-selene-ia.md` | Architecture evaluation of the project and the risk that motivated the API-key proxy (in Spanish). |
| `docs/decisions/technical-decisions.md` | Strategic decisions for the product roadmap (in Spanish). |
| `openspec/` | SDD artifacts: active specs (`gemini-api-proxy`, `gemini-chat-service`) and the archived change `gemini-api-key-proxy` (the F0 security change that moved the API key server-side, archived 2026-09-17). |