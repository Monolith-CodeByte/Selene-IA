# PR-10: Honest AI failure copy by failure type (P5)

## Description

Every failed AI reply previously rendered the same string, `Error de conexión o API Key inválida.`, regardless of what actually failed. An expired session, a rate limit, a Gemini 500, a rejected dev origin and a plain `fetch` `TypeError` were all reported as an API-key problem. The same misleading text was written to Firestore by `persistFailedAiMessage` and shown in the bubble, so it also survived a reload.

This change classifies the failure once at the catch site and reuses that single result for both the persisted message and the UI bubble. `classifyAiFailure(error)` reads the HTTP status from `error?.status`, `error?.response?.status` or `error?.statusCode` and maps `401` to session expiry, `429` to rate limiting, `403` and fetch-level connection errors to a connection failure, and numeric statuses `>= 500` to service unavailability; anything else gets an honest generic fallback that no longer mentions the API key. `gemini.js` now attaches `response.status` to the thrown error so the classifier can see it, and `persistFailedAiMessage` accepts a `message` override so the stored text matches what the user was shown. The P1 `shouldRenderPersistedFailure` gate is unchanged.

## Changes Made

### Bug fixes

- **`src/services/chatFailure.js`**: replaced the single misleading `AI_FAILURE_MESSAGE` value with `AI_AUTH_FAILURE_MESSAGE`, `AI_RATE_LIMIT_MESSAGE`, `AI_SERVER_FAILURE_MESSAGE` and `AI_NETWORK_FAILURE_MESSAGE`, and changed the generic `AI_FAILURE_MESSAGE` to `No se pudo generar la respuesta. Intentá de nuevo.` None of these strings mention the API key.
- **`src/services/chatFailure.js`**: added `classifyAiFailure(error)` with `NETWORK_ERROR_PATTERN` for fetch-level failures; `403` is deliberately grouped with connection failures because the proxy surfaces a rejected dev origin as `403 {"error":"Origin not allowed"}` or a browser `TypeError`, not as an auth failure.
- **`src/services/chatFailure.js`**: `persistFailedAiMessage` now takes `message = AI_FAILURE_MESSAGE` and passes it to `saveMessage(userId, chatId, message, 'ai')`, preserving the previous default for existing callers.
- **`src/services/gemini.js`**: in the `!response.ok` branch, the thrown `Error` now carries `failure.status = response.status` before `throw failure`, so HTTP status survives to the catch site.
- **`src/components/ChatArea.js`**: imports `classifyAiFailure` in place of `AI_FAILURE_MESSAGE`, computes `const failureMessage = classifyAiFailure(error)` once, passes `message: failureMessage` to `persistFailedAiMessage`, and renders `appendMessage(messagesArea, failureMessage, 'ai')`. The `shouldRenderPersistedFailure` check around the bubble is untouched.

### Tests

- **`tests/ai-failure-classification.unit.test.js`**: new file covering the `401`, `429`, `500`, `403` and `TypeError` mappings plus the generic fallback, the `persistFailedAiMessage` message override, and a source-level assertion that `gemini.js` preserves `response.status` on the thrown error.
- **`tests/chat-failure.unit.test.js`**: replaced the check that required `appendMessage(..., AI_FAILURE_MESSAGE, 'ai')` with a check for the `shouldRenderPersistedFailure({` gate, and added a test asserting that the classified copy is computed once and reused for both persistence and display.

## Impact

- Users now see copy that matches the actual failure: an expired session, a rate limit, an unavailable service, a connection problem, or an honest generic retry message. No new failure message blames the API key.
- A failed AI bubble is persisted with the same classified text that is displayed, so a reload shows the same explanation. Existing Firestore documents are not rewritten.
- `401` and `403` now produce different copy; a rejected dev origin is reported as a connection failure rather than an authentication failure.
- No changes to Firestore rules, authentication, proxy behavior, or the P1 `shouldRenderPersistedFailure` gate. The `message` parameter of `persistFailedAiMessage` has a default, so callers that omit it keep the previous behavior.
- `Risk: none (user-facing copy and a defaulted message parameter change; no stored data is rewritten and no published contract is removed).`

## Notes

### Verification (observed)

- `node --test tests/ai-failure-classification.unit.test.js tests/chat-failure.unit.test.js`: 16 pass, 0 fail. The same focused suite reported 9 failures before the implementation (RED).
- `npm test`: exit 0; `npm run test:rules`: 29 pass, 0 fail.
- `node --check`: OK on `src/services/chatFailure.js`, `src/services/gemini.js` and `src/components/ChatArea.js`.
- No live browser verification was run.

### Scope boundary

- P4 (dead landing buttons) is not included in this PR; it is specific technical debt to be resolved later.
- P3 is committed as `ed1735c` and documented in `openspec/PR-9-p3-cors-port-drift.md`; it is not part of this PR.
- `.atl/.skill-registry.cache.json` and `.atl/skill-registry.md` are unrelated pre-existing modifications and are excluded from this PR.
- This document contains the PR description only. No commit, push, PR creation or merge was performed.
