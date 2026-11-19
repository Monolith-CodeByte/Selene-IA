# PR-5: Harden Gemini proxy with authentication, rate limiting, and CORS

## Description

This PR closes **punto 5** of the Jira technical debt (Monolith Studio) regarding exposed configuration and user data in the Selene IA frontend. The Gemini proxy (`/api/gemini/*`) previously had no authentication, no rate limiting, and an overly permissive CORS policy that only allowed `localhost:5173` — effectively leaving the proxy open to abuse in production.

The changes enforce:
- **Firebase ID token verification** on every request: the proxy now rejects requests without a valid `Authorization: Bearer <idToken>` header (401). CORS is not authentication; Firestore/RTDB rules do not protect the proxy.
- **Rate limiting**: 30 requests/minute per authenticated user (keyed by `claims.uid`), 15 requests/minute per IP for unauthenticated traffic. Protects the Gemini API quota.
- **CORS whitelist**: production origin configurable via `ALLOWED_ORIGINS` env (default `https://seleneai2-0.web.app`); development retains `localhost:5173` and `127.0.0.1:5173`. Requests without an Origin header are now rejected.
- **User identity from token, not body**: the `userId` written to the usage log now comes from the verified token's `uid` claim. The previous implementation trusted `userId` from the request body, making the usage log spoofable.
- **Client sends token**: `ChatArea.js` obtains the Firebase ID token via `auth.currentUser.getIdToken(true)` and passes it to `GeminiService`, which adds the `Authorization` header. No silent fallback to body — missing token = 401.

## Changes Made

### Security / Authentication
- **`server/proxyAuth.js`** (new): Firebase Admin initialization (fail-closed if credentials missing), `verifyIdToken()` wrapper, `createAuthMiddleware()` (extracts Bearer token, verifies, attaches `req.userId = claims.uid`), `createRateLimiter()` (configurable window/max, keyed by `userId` or IP with `ipKeyGenerator`), `corsOptions` (whitelist with env-driven production origin, rejects missing Origin).
- **`server/index.js`**: imports and uses `proxyAuth`; adds `authMiddleware` + dual rate limiters on `/api/gemini/*`; removes `userId` from request body destructuring; reads `req.userId` for usage logging.

### Client Changes
- **`src/services/gemini.js`**: `SmartChatSession.sendMessage()` and `GeminiService.generateTitle()` now accept optional `idToken` and add `Authorization: Bearer <token>` header.
- **`src/components/ChatArea.js`**: calls `getAuth().currentUser.getIdToken(true)` before each chat message and title generation; passes token to `GeminiService`.

### Tests
- **`tests/proxy-auth.unit.test.js`** (new): 6 unit tests covering token extraction, auth middleware (missing header → 401, valid token → attaches `userId`, invalid/expired → 401), rate limiter returns middleware function, CORS origin validation (allows localhost, rejects unknown and missing Origin).

### Dependencies
- **`package.json`**: added `firebase-admin` to `dependencies`.

## Impact

### Behavior Changes
- **Breaking**: `/api/gemini/chat` and `/api/gemini/title` now require a valid Firebase ID token. Requests without `Authorization: Bearer <token>` receive `401 { "error": "Missing or invalid Authorization header" }`. Clients must be updated (this PR updates the web client).
- **Usage log integrity**: `userId` in `server/data/usage.log.jsonl` now reflects the authenticated user's UID, not a client-supplied value.
- **Rate limits enforced**: exceeding 30 req/min (user) or 15 req/min (IP) returns `429 { "error": "Too many requests. Please slow down." }` with `Retry-After` header.
- **CORS tightened**: production deployments must set `ALLOWED_ORIGINS` (comma-separated) or requests from the production domain will be rejected. Development unaffected.

### Backward Compatibility
- **API contract change**: the two endpoints now require the `Authorization` header. No fallback to body `userId`.
- **No database migrations** or Firestore/RTDB rule changes.
- **Environment variable**: `ALLOWED_ORIGINS` is optional (has a sensible default for the known Firebase Hosting URL).

### Developer Experience
- New module `server/proxyAuth.js` is testable in isolation (pure functions + middleware factory).
- Unit tests run in Node without emulators or Firebase credentials.
- `firebase-admin` initializes with Application Default Credentials; works on GCP / Cloud Run / Cloud Functions out of the box. Local dev requires `GOOGLE_APPLICATION_CREDENTIALS` or the server exits fail-closed (by design — prevents accidental unauthenticated deployments).

## Notes

### How to Verify
```bash
npm run build       # passes
npm test            # 21 unit + 38 rules = 59 GREEN
```

### Known Follow-ups (Outside This Ticket)
- Bug in `src/main.js:161`: `createUserProfile` called on existing profile → `setDoc(..., {merge:true})` treated as UPDATE, rejected by Firestore rules. Two production users affected.
- `usageIntent: null` written explicitly (3 users) — should omit the key.
- Missing `ownerId` on chats for admin queries.
- Missing `status`/`error` on messages (silent AI failures).
- Open enums for `discoverySource`/`usageIntent`.
- Stale comment in `src/services/profileFields.js:6` (wrong test file path).
- `npm audit --omit=dev` reports 14 production vulnerabilities: 1 critical (`websocket-driver`), 3 high (`@grpc/grpc-js`, `body-parser`, `node-forge`), 9 moderate, and 1 low (`fast-xml-parser`). Remediation requires a semver-major `firebase-admin` upgrade (to 14.5.1); dependency upgrades are tracked as a separate decision and are deliberately not mixed into this security fix.

### Deployment
1. Set `ALLOWED_ORIGINS=https://your-production-domain.com` (or comma-separated list) in production environment.
2. Ensure `GOOGLE_APPLICATION_CREDENTIALS` points to a service account with `firebase.auth.tokens.verify` permission (or run on GCP with ADC).
3. Deploy `server/index.js` (Cloud Run, Cloud Functions, or VM).
4. Deploy frontend (Vite build) — the client now sends the ID token automatically.

### Related
- Closes Jira punto 5 (configuración expuesta / datos de usuario).
- PR-1 (Gemini API key proxy) already merged — this PR hardens that proxy.
- Branch: `feat/resolve-config-users`.