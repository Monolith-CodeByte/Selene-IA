# PR-9: Fix CORS origin rejection on the Gemini proxy (P3)

## Description

Local runs failed on every message with `POST http://localhost:3001/api/gemini/title net::ERR_FAILED` and `No 'Access-Control-Allow-Origin' header is present on the requested resource`. The request came from `http://localhost:5174` because Vite moved off 5173 when the port was busy, while `corsOptions.origin` in `server/proxyAuth.js` matched `http://localhost:5173` exactly. Because the `cors` middleware calls `next(err)` before writing any header and no error middleware followed `app.use(cors(corsOptions))` in `server/index.js`, Express fell through to its default HTML 500 with no CORS headers. No `[server]` model or error log existed for those requests, so Gemini was never reached: the failure was a local origin rejection, not a Gemini or API-key problem.

This change makes the dev matcher port-agnostic without loosening production, and makes the rejection honest. `createCorsOptions({ nodeEnv, allowedOrigins })` accepts `http://localhost:<port>` and `http://127.0.0.1:<port>` for any port when `NODE_ENV` is not `production`, keeps exact matching against `ALLOWED_ORIGINS` in production, and still rejects requests with no `Origin`. A new `createCorsErrorHandler()` mounted immediately after `app.use(cors(corsOptions))` answers `403 {"error":"Origin not allowed"}` and logs `[server] CORS rejected origin: <origin>` instead of the HTML 500. `vite.config.js` pins the dev server to 5173 with `strictPort: true`, so a busy port fails loudly instead of silently reintroducing the drift.

Covers S1-S5. The misleading UI string `Error de conexión o API Key inválida` in `src/services/chatFailure.js` is P5 and explicitly out of scope here.

## Changes Made

### Bug fixes

- **`server/proxyAuth.js`**: replaced the fixed `DEVELOPMENT_ORIGINS` array with `createCorsOptions({ nodeEnv, allowedOrigins })`; development now accepts `DEV_LOCAL_ORIGIN` (`/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/`) plus the configured origins, production keeps `includes(origin)` exact matching, missing `Origin` still returns `Error("Not allowed by CORS")`, and `credentials: false` is unchanged.
- **`server/proxyAuth.js`**: the module-level `corsOptions` is now built by the factory from `PRODUCTION_ORIGIN`, preserving `ALLOWED_ORIGINS` parsing and trimming at import time.
- **`server/corsError.js`**: new `createCorsErrorHandler({ warn = console.warn })`; handles only `Not allowed by CORS`, logs `[server] CORS rejected origin: <origin>` (or `(none)`), responds `403` with `{"error":"Origin not allowed"}`, sets no response headers, and forwards unrelated errors via `next(err)`.
- **`server/index.js`**: imports `createCorsErrorHandler` and mounts `app.use(createCorsErrorHandler())` immediately after `app.use(cors(corsOptions))`, before `express.json`.

### Configuration

- **`vite.config.js`**: new config with `server: { port: 5173, strictPort: true }`, plus `preview: { strictPort: false }` because Vite 7 inherits `server.strictPort` into `vite preview` and that would change the previous preview behavior.

### Tests

- **`tests/p3-cors.unit.test.js`**: new coverage for the dev matcher (5174, 5199, 5173, configured production origin), production rejection of `5173`/`5174`/`127.0.0.1:5173` and exact-match acceptance, missing origin, `credentials: false`, and a lookalike-host matrix (`http://localhost.evil.com`, `http://localhost:5173.evil.com`, `http://localhost@evil.com`, `http://127.0.0.1.evil.com`, `https://localhost:5173`, trailing slash, trailing space, `null`, `file://`); plus error-handler cases (403 JSON, logged origin, no reflected header, pass-through of unrelated errors) and a real Express preflight chain asserting `OPTIONS` from 5174 returns `204` with `access-control-allow-origin: http://localhost:5174`, while a disallowed origin returns `403`, `application/json`, no `access-control-allow-origin`, and exactly one log line.
- **`tests/p3-cors-wiring.unit.test.js`**: new assertions that `server/index.js` registers the handler after `cors()` with no layer in between, and that the import-time `corsOptions` honours `NODE_ENV=production` and `ALLOWED_ORIGINS`.
- **`tests/proxy-auth.unit.test.js`**: the existing rejection test now builds its options with `createCorsOptions({ nodeEnv: "development", allowedOrigins: ["https://seleneai2-0.web.app"] })` instead of importing `corsOptions`, removing that assertion's dependence on the ambient `NODE_ENV`; the `401` and `429` cases are untouched.

## Impact

- Development accepts any `localhost` / `127.0.0.1` port, so a Vite drift to 5174 no longer breaks the Gemini proxy; production keeps exact-match origin validation and still rejects local origins.
- A rejected origin now returns `403 {"error":"Origin not allowed"}` with `content-type: application/json` and a `[server] CORS rejected origin:` log, instead of an HTML 500 with no CORS headers. The rejected origin is not reflected into response headers and Gemini is not invoked on that path.
- A busy 5173 now fails with `Error: Port 5173 is already in use` instead of silently starting on 5174. `npm run preview` keeps its previous drift behavior.
- Requests without `Origin` are still rejected, so `curl` and server-to-server behavior is unchanged; `401` and `429` responses are unchanged.
- No Firestore rules, persisted data, auth configuration, deployment artifacts, or user-facing strings change in this PR.
- `Risk: item 2 (development CORS allowlist widened to any loopback port) + item 6 (no prior test distinguished origin rejection from a Gemini failure).`

## Notes

### Verification (observed)

- `npm run test:unit`: 63 pass, 0 fail.
- `npm run test:rules`: 29 pass, 0 fail.
- `npx vite build`: OK.
- Live checks: `OPTIONS` preflight returned `204` with `Access-Control-Allow-Origin`; a disallowed origin returned `403 {"error":"Origin not allowed"}` with a `[server] CORS rejected origin:` log; starting the dev server with 5173 busy returned `Error: Port 5173 is already in use`.
- The independent verifier reproduced the baseline defect (preflight from 5174 returned HTML 500 with no `Access-Control-Allow-Origin`) and confirmed the candidate answers `204` with the header, that production exact matching including `ALLOWED_ORIGINS` trimming is unchanged, that `401`/`429`/non-CORS paths are unchanged, and that the production build output is byte-identical to the baseline build.

### Local prerequisite

- `server/proxyAuth.js` initializes Firebase Admin through `applicationDefault()`. Local verification therefore requires `GOOGLE_APPLICATION_CREDENTIALS` to point at a service-account JSON stored outside the repository; without it, `POST /api/gemini/*` returned `401` even after the CORS fix. That value lives in the gitignored `.env` and is a prerequisite for local runs, not a change in this PR.

### Scope boundary

- The `Error de conexión o API Key inválida` string in `src/services/chatFailure.js` is P5 and is not modified here.
- `.atl/.skill-registry.cache.json` and `.atl/skill-registry.md` are runtime-generated noise and are excluded from this PR.
