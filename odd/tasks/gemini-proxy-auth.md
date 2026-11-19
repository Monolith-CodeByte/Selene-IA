# Gemini proxy hardening — `server/index.js` (Jira punto 5)

**Branch:** `feat/resolve-config-users`
**Delivery strategy:** work-unit commits, user handles commit/push/merge/pull manually
**Test runner:** `npm test` = `npm run test:unit` + `npm run test:rules`

## Specs

- **S1** — El proxy `/api/gemini/chat` y `/api/gemini/title` exigen un ID token de Firebase válido. Requests sin token, con token expirado o de otro proyecto son rechazadas con 401. CORS no es autenticación; las reglas de Firestore/RTDB no protegen el proxy.
- **S2** — El `userId` del usage log se deriva del token verificado (claims.sub), **nunca del body**. Hoy `server/index.js:137` toma userId del body → el usage log es suplantable.
- **S3** — Rate limit: 30 req/min por usuario autenticado (burst 5), 15 req/min por IP no autenticado (burst 3). Protege la cuota de Gemini. Respuesta 429 con `Retry-After`.
- **S4** — CORS: whitelist de orígenes. Producción configurable por env `ALLOWED_ORIGINS` (default `https://seleneai2-0.web.app`); development mantiene `http://localhost:5173`, `http://127.0.0.1:5173`. Se rechaza requests sin Origin cuando el Origin no está en la whitelist (hoy los acepta sin condición).
- **S5** — El cliente envía el token. `gemini.js`: `startChat` y `generateTitle` añaden header `Authorization: Bearer <token>`. `ChatArea.js`: pide `auth.getIdToken()` al usuario autenticado y lo pasa. Sin token el request falla con 401 (no hay fallback silencioso a body).
- **S6** — Consumidores no se rompen: `ChatArea.js:12,86,127,141,201` y `gemini.js:45,49` siguen funcionando con la misma response shape `{ text }`. `GEMINI_API_KEY` sigue en `server/index.js:19`.
- **S7** — `firebase-admin` se añade a `dependencies` y se inicializa con las credenciales del proyecto `seleneai2-0` (application credentials). Sin credenciales el server no arranca (fail-closed), igual que hoy con `GEMINI_API_KEY`.

## Tasks

- **T1** — `server/index.js`: Firebase Admin init (fail-closed), middleware verifyIdToken, rate limit, CORS whitelist. [inline]
- **T2** — `src/services/gemini.js`: header Authorization en startChat + generateTitle. [inline]
- **T3** — `src/components/ChatArea.js`: getIdToken + pasar token a GeminiService. [inline]
- **T4** — Tests: `tests/proxy-auth.unit.test.js` (token verify, rate limit, CORS, userId del token). [inline]
- **T5** — `npm run build` + `npm test` GREEN. [inline]

## Log

- **L1** — `2026-10-22 19:51` — Resumen de la sessión previa (Engram #1197): punto 5 sin tocar, alcance acordado de 5 ítems sobre `server/index.js`. Eric confirmó: "Si te lo confirmo, puedes continuar por favor." → Opción B (3 archivos) elegida tras descubrir que el cliente no envía token. Números de rate limit aprobados (30/15). Origen production: configurable por env, default `https://seleneai2-0.web.app`.