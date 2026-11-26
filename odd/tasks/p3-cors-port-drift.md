# P3 — CORS port drift on the Gemini proxy

**Objective:** Stop dev-origin rejection when Vite drifts off port 5173, and make the rejection honest in server status/logs instead of an HTML 500.
**Branch:** `feat/resolve-config-users` (current) · **Delivery strategy:** `ask-on-risk` (commits and push are user-owned for this feature) · **Test runner:** `npm run test:unit`, `npm run test:rules`, `npx vite build`

## Specs

**S1 — Root cause is CORS origin rejection, not Gemini or the API key.**
User evidence verbatim: *"Metodo: post, url: http://localhost:3001/api/gemini/title, status code: CORS error, no hay nada en response headers, no hay nada en response."* · *"Error: Not allowed by CORS at origin (file:///home/eric_reyes/Monolith%20Studio/Selene-IA/server/proxyAuth.js:88:22)"* · *"Access to fetch at 'http://localhost:3001/api/gemini/title' from origin 'http://localhost:5174' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource."* · *"gemini.js:69  POST http://localhost:3001/api/gemini/title net::ERR_FAILED"* · *"Estamos corriendolo en local."*
Acceptance: no `[server]` model/error log exists for the failing request; the rejection is reproduced by a deterministic test before the fix (RED).
Check: `tests/proxy-auth.unit.test.js` asserts the current exact-match rejection on `http://localhost:5174`.

**S2 — Dev origin matching tolerates any localhost/127.0.0.1 port; production stays exact.**
Accepted proposal (not a new user requirement): extract `createCorsOptions({ nodeEnv, allowedOrigins })`; in dev accept `http://localhost:<port>` and `http://127.0.0.1:<port>` for any port; in production keep exact matching against `ALLOWED_ORIGINS`; keep rejecting requests with no `Origin`; keep `credentials: false` and the Bearer auth middleware unchanged.
Acceptance: `5174` and other local ports pass in dev, any disallowed host and no-origin still fail, production rejects `5173`/`5174`, and 401/429 behavior is unchanged.
Check: new unit cases for dev/prod/no-origin plus differential of existing 401/429 tests.

**S3 — Rejected origin returns 403 JSON and a server log, never HTML 500.**
Accepted proposal (not a new user requirement): error-handling middleware immediately after `app.use(cors(corsOptions))` in `server/index.js`, responding `403 {"error":"Origin not allowed"}` and logging `[server] CORS rejected origin: <origin>`. Arbitrary origins are not reflected into response headers.
Acceptance: the rejected-origin path no longer falls through to Express's default HTML 500 handler; Gemini is never invoked on that path.
Check: unit test on the middleware with a mock `req`/`res` plus `npm run test:unit`.

**S4 — Vite port is pinned so silent drift cannot reintroduce S1.**
Accepted proposal (not a new user requirement): add `vite.config.js` with `server: { port: 5173, strictPort: true }`.
Acceptance: dev server refuses to start on a busy 5173 instead of silently moving to 5174; production build is unaffected.
Check: config file exists with `strictPort: true`; `npx vite build` OK.

**S5 — Checks and scope boundary.**
User evidence verbatim: *"Se reproduce cuando envio cualquier mensaje, tenemos dichos errores y ademas nos aparece un mensaje de selene en la conversación que dice "Error de conexión o API Key inválida""*
The UI string lives in `src/services/chatFailure.js:8` and is **P5**, explicitly out of scope here.
Acceptance: all applicable checks pass and the high-risk change gets independent verification (Risk items 2 and 6).
Check: `npm run test:unit`, `npm run test:rules`, `npx vite build`, differential of 401/429, and one independent verifier on the final diff.

**Assumptions**
- The user runs both processes locally; no cloud/deploy change is part of P3.
- `ALLOWED_ORIGINS` in production is supplied externally and must remain exact-match; no allowlist values are invented.
- Commits and push remain user-owned (accepted option: *"Implementar (recomendado)"*).

## Tasks

| ID | Spec | Route | Description | Status | Evidence |
|----|------|-------|-------------|--------|----------|
| T1 | S1 | inline | RED tests: 5174 rejected today, dev/prod matcher cases, 403 middleware case | done | RED: 47 pass / 1 fail (`ERR_MODULE_NOT_FOUND: server/corsError.js`); GREEN: 60/60 |
| T2 | S2 | inline | `createCorsOptions` factory + resilient dev localhost matcher in `server/proxyAuth.js` | done | `tests/p3-cors.unit.test.js` dev/prod/no-origin cases |
| T3 | S3 | inline | 403 JSON error middleware + origin log in `server/index.js` | done | preflight-chain integration test: `OPTIONS` from 5174 → 204 + ACAO; disallowed → 403 JSON + log |
| T4 | S4 | inline | `vite.config.js` with `strictPort: true` | done | `npx vite build` OK (vite 7.2.7, 54 modules) |
| T5 | S5 | inline + delegated verify | Full checks, differential, independent verifier | done | independent verifier PASS S1–S5; final `npm run test:unit` 63/63, `npm run test:rules` 29/29, `npx vite build` OK; preview drift preserved |

## Log

**L1** (user request, verbatim): *"Bien, continuaremos con P3, dime exactamente qué es lo que necesitas de mi y cómo consigo esa información."*

**L2** (runtime evidence, verbatim):

```
1. Metodo: post, url: http://localhost:3001/api/gemini/title, status code: CORS error, no hay nada en response headers, no hay nada en response.
2. Error: Not allowed by CORS
    at origin (file:///home/eric_reyes/Monolith%20Studio/Selene-IA/server/proxyAuth.js:88:22)
    at /home/eric_reyes/Monolith Studio/Selene-IA/node_modules/cors/lib/index.js:219:13
    at optionsCallback (/home/eric_reyes/Monolith Studio/Selene-IA/node_modules/cors/lib/index.js:199:9)
    at corsMiddleware (/home/eric_reyes/Monolith Studio/Selene-IA/node_modules/cors/lib/index.js:204:7)
    at Layer.handle [as handle_request] (/home/eric_reyes/Monolith Studio/Selene-IA/node_modules/express/lib/router/layer.js:95:5)
    at trim_prefix (/home/eric_reyes/Monolith Studio/Selene-IA/node_modules/express/lib/router/index.js:328:13)
    at /home/eric_reyes/Monolith Studio/Selene-IA/node_modules/express/lib/router/index.js:286:9
    at Function.process_params (/home/eric_reyes/Monolith Studio/Selene-IA/node_modules/express/lib/router/index.js:346:12)
    at next (/home/eric_reyes/Monolith Studio/Selene-IA/node_modules/express/lib/router/index.js:280:10)
    at expressInit (/home/eric_reyes/Monolith Studio/Selene-IA/node_modules/express/lib/middleware/init.js:40:5) 

3. Access to fetch at 'http://localhost:3001/api/gemini/title' from origin 'http://localhost:5174' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.
gemini.js:69  POST http://localhost:3001/api/gemini/title net::ERR_FAILED 

4. No muestra origen del frontend.

5. Estamos corriendolo en local.

6. Se reproduce cuando envio cualquier mensaje, tenemos dichos errores y ademas nos aparece un mensaje de selene en la conversación que dice "Error de conexión o API Key inválida"
```

**L3** (accepted scope, verbatim option label): *"Implementar (recomendado)"* — apply parts A+B+C with RED→GREEN tests on the current branch; commits and push stay with the user.

**L4** — Analysis: `corsOptions.origin` rejects `http://localhost:5174` at `server/proxyAuth.js:88`; `cors` calls `next(err)` before setting headers, and no error middleware follows `app.use(cors(...))` at `server/index.js:46`, so Express emits HTML 500 with no ACAO. The browser reports the failed preflight as `net::ERR_FAILED` on the POST. No `[server]` log means Gemini was never reached. `src/services/chatFailure.js:8` supplies the misleading UI string (P5, out of scope).

**L5** — Implementation evidence: `server/proxyAuth.js` now exposes `createCorsOptions({ nodeEnv, allowedOrigins })`; dev accepts any `http://localhost:<port>` / `http://127.0.0.1:<port>` plus configured origins, production keeps exact match, missing `Origin` still fails. New `server/corsError.js` returns `403 {"error":"Origin not allowed"}` and logs `[server] CORS rejected origin: ...`; wired immediately after `app.use(cors(corsOptions))`. `vite.config.js` pins 5173 with `strictPort: true`. `tests/proxy-auth.unit.test.js` now builds its CORS options via the factory, removing the `NODE_ENV` dependence of the 5173 assertion. RED observed before the source change: 47 pass / 1 fail (`ERR_MODULE_NOT_FOUND` for `server/corsError.js`). GREEN: 60/60 unit, 29/29 rules, `npx vite build` OK. Differential of untouched 401/429 behavior: their tests passed before (47/47 baseline apart from the new file) and after (60/60). No source-mutating normalizer ran after implementation.

**L6** — Independent verification (`gentle-ai-verify`, baseline `25f314c`, scratch copy): PASS on S1–S5. The verifier reproduced the baseline defect itself (OPTIONS from 5174 → 500 HTML with no ACAO) and confirmed the candidate answers 204 + ACAO; production exact match, including `ALLOWED_ORIGINS` trimming, is byte-identical to baseline; 401/429/non-CORS paths unchanged; `dist/` byte-identical to baseline build. Advisories handled in one bounded correction batch: (a) Vite 7 inherits `server.strictPort` into `vite preview`, so `preview: { strictPort: false }` was added and verified live — a second preview on busy 4173 drifts to 4174 again; (b) added `tests/p3-cors-wiring.unit.test.js` to pin the middleware order and the import-time env behavior; (c) added the lookalike-host boundary matrix to `tests/p3-cors.unit.test.js`. Recheck limited to those three points: 63/63 unit, build OK. Remaining unverified: live server boot with real `GEMINI_API_KEY`/Firebase credentials and the browser flow itself (server exits without credentials); `.env` has no `NODE_ENV` key, so dev behavior applies. The verifier's scratch path `/tmp/opencode/p3-verify.eYql0Y` was reported for parent cleanup.

**L7** — Receipt-driven development was on (global default). `review assess` returned `high_risk` / `review_due: true`; the canonical START offered the candidate consent, and the user chose *"Omitir esta vez"*. The exact captured decline invocation ran once and returned `action: declined`, `consent: declined_this_candidate`, matching target `sha256:42f445542c83dbe8a69520ab3a7f8a85a92f86921e97989d5755084ec8fd75b1`; a re-queried STATUS still offers `fresh_target_ready`, confirming no review authority, lineage, or receipt was created. RDD stays enabled for future candidates. Commits and push remain user-owned.

**Route declaration:** inline for T1–T5 (one coherent change with a shared test file; no parallel/disjoint units and no context backstop). Delegation only for the independent high-risk verifier in T5. `Risk: item 2 (dev CORS allowlist/guards) + item 6 (no prior test distinguished origin rejection from Gemini 500 under NODE_ENV=production)`.
