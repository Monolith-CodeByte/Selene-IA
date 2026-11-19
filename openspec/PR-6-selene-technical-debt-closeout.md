# PR-6: Close Selene IA technical debt (profile lifecycle, onboarding, chat failures, runtime dependencies)

## Description

This PR closes the outstanding Selene IA technical debt identified by a root-cause triage of seven clusters (C1–C7). Several defects were already affecting production users: `createUserProfile` used `setDoc(..., { merge: true })` on an existing document, which Firestore evaluates as an update and rejects, leaving two users stuck before onboarding. The bounded login-retry counter reset only on success, so a deterministic failure became a permanent dead end across sessions. Sign-out during onboarding removed a phantom `.onboarding-screen` selector instead of the `.onboarding-container` node that was actually mounted. Optional onboarding fields were written as invented values (`'unknown'`, `usageIntent: null`) despite having no read consumer, and failed AI responses were rendered in the DOM only, so they vanished on reload.

The remaining clusters were structural: `server/proxyAuth.js` imported `express-rate-limit` (and `firebase-admin`) without declaring them as runtime dependencies, making `npm ci --omit=dev` fail with `ERR_MODULE_NOT_FOUND` during the production smoke. An unused presence subsystem wrote `/status/{uid}` to Realtime Database with no consumer anywhere in `src`, so it was discarded by explicit product decision. Documentation carried a wrong test path and an incorrect vulnerability count.

The approach closes each cluster by cause rather than symptom: pure decision helpers are extracted into modules that run in plain Node, while `src/main.js` keeps transport concerns (rendering, auth, Firestore writes). Firestore rules are deliberately unchanged. The rules deploy was performed manually and verified against the active Firebase ruleset.

## Changes Made

### Bug fixes
- **`src/services/user.js`**: `setDoc` no longer passes `{ merge: true }`; profile creation is create-only, because the merge form is evaluated by `firestore.rules` as an update and denied on an existing document.
- **`src/services/loginFlow.js`** (new): `resolveProfileAction()` separates create, resume-onboarding and enter-app decisions. An existing profile with `onboardingComplete: false` reaches onboarding with zero writes.
- **`src/main.js`**: post-login flow now routes through `resolveProfileAction()` instead of calling `createUserProfile` for every incomplete profile.
- **`src/main.js`**, **`src/services/loginFlow.js`**: `createAttemptCounter()` replaces the raw `loginAttempts` variable and resets on sign-out (`onSignedOut`), so a fourth attempt in a fresh session no longer logs the user out immediately.
- **`src/main.js`**, **`src/services/loginFlow.js`**: `createOnboardingScreen()` holds the real mounted node; teardown calls `teardown()` on it instead of querying the never-matching `.onboarding-screen` selector.
- **`src/components/Onboarding.js`**, **`src/services/onboardingProfile.js`** (new): `buildOnboardingProfilePayload()` omits `discoverySource` and `usageIntent` when the user made no choice; the invented `'unknown'` default and explicit `usageIntent: null` write are removed.
- **`src/components/ChatArea.js`**, **`src/services/chatFailure.js`** (new): failed AI responses are persisted with `saveMessage(user.uid, targetChatId, AI_FAILURE_MESSAGE, 'ai')` via `persistFailedAiMessage()`, so the failure survives a reload. The accompanying `aiResult.messageId` is added to `renderedMessageIds`.

### Dependencies and dev tooling
- **`package.json`**, **`package-lock.json`**: `express-rate-limit` and `firebase-admin` declared as runtime dependencies (no `dev: true`), fixing `ERR_MODULE_NOT_FOUND` under `npm ci --omit=dev`.
- **`tests/runtime-deps.unit.test.js`** (new): guards the runtime dependency declaration.

### Refactors
- **`src/services/presence.js`** (deleted), **`src/main.js`**, **`src/firebase-config.js`**, **`README.md`**, **`src/config/seleneProjectKnowledge.generated.js`**: the unused presence slice is discarded — `PresenceService.init()`/`cleanup()` wiring removed, `getDatabase` and the `rtdb` export removed, `databaseURL` dropped from the web config, and the generated knowledge file regenerated without `presence.js`.

### Tests
- **`tests/login-flow.unit.test.js`** (new): 119 lines covering profile-action decisions, the bounded retry counter and onboarding mount/teardown.
- **`tests/onboarding-profile.unit.test.js`** (new): payload omits unanswered optional keys.
- **`tests/chat-failure.unit.test.js`** (new): failure path persists one `ai` message via the injected `saveMessage`, and returns `null` without `userId`/`chatId`.

### Documentation
- **`openspec/PR-5-gemini-proxy-auth-hardening.md`**: audit inventory corrected from 4 to 14 production vulnerabilities (1 critical `websocket-driver`, 3 high, 9 moderate, 1 low); the upgrade is recorded as a separate decision.
- **`src/services/profileFields.js`**: stale comment now points to `tests/profile-fields.unit.test.js`.
- **`odd/tasks/selene-debt-closeout.md`** (new): ODD feature document with specs S1–S11, task evidence and the close log.
- **`README.md`**: Realtime Database removed from the platform list, prerequisites, env var table and feature list.

## Impact

### Behavior changes
- Existing users with an incomplete profile resume onboarding instead of receiving `permission-denied` on profile creation; a missing profile is still created exactly once.
- A bounded login failure no longer carries into the next session: the counter resets on sign-out.
- Sign-out during onboarding removes the node that was actually mounted.
- Profile documents no longer contain `'unknown'` or explicit `null` values for optional fields.
- Failed AI responses now appear in chat history as `ai` messages and remain visible after reload.
- Presence writes to `/status/{uid}` and the Realtime Database client initialization are gone. There was no reader for that data in `src`.

### Backward compatibility
- Firestore rules are unchanged; `firestore.rules` still owns the profile update boundary.
- New modules (`loginFlow.js`, `onboardingProfile.js`, `chatFailure.js`) are additive and have no external consumers.
- `src/firebase-config.js` no longer exports `rtdb`. All in-repo consumers were removed with the presence slice (verified: zero remaining references in active source).
- No data migration is performed and no existing stored documents are modified by this PR.

### Developer experience
- The login, onboarding-payload and chat-failure rules are pure functions testable in plain Node without a DOM or Firebase credentials.
- The production smoke (`npm ci --omit=dev`) now starts the server instead of failing with `ERR_MODULE_NOT_FOUND`.

### Risks and caveats
- Sign-out teardown and the retry reset are verified at the behavior level through pure helpers plus wiring inspection; there is no DOM test runner in this project.
- `persistFailedAiMessage` is unit-tested in isolation; its `ChatArea.js` call site was verified by inspection rather than a dedicated integration test.
- The Firebase Rules API reports 4207 bytes against 4209 bytes in the local file while the sha256 matches; the size difference comes from a different API field, not different content.

## Notes

### How to verify
```bash
npm test            # 33 unit + 29 rules = GREEN
npm run build       # passes
npm ci --omit=dev --offline   # production smoke, with d11adb5 as the discriminating baseline
```

### Deployment
1. Firestore rules were deployed manually with `npx firebase deploy --only firestore:rules --project seleneai2-0`.
2. The active `cloud.firestore` ruleset uses source sha256 `211b1b0f9df2d66e…`, identical to the local `firestore.rules`; the deploy was idempotent, so no new ruleset is expected in the Firebase console.
3. No Realtime Database deployment is needed after discarding the presence slice.

### Verification
- Independent verification result: `PASS_WITH_NOTES`, no blockers. Coverage: full test suite, build, production smoke with baseline at `d11adb5`, zero presence references in active source, and specs S1–S11 met.

### Known follow-ups (outside this ticket)
- `npm audit --omit=dev` still reports 14 production vulnerabilities. Remediation requires a semver-major `firebase-admin` upgrade (14.5.1) and is tracked as a separate decision.

### Related
- Commit range: `f391fe2`..`67227c7` on `feat/resolve-config-users`.
- **Stacked on PR-5**: this work continues the scope introduced in PR-5 (`openspec/PR-5-gemini-proxy-auth-hardening.md`, commit `d11adb5`). PR-5 has not been merged into `main` as of this draft, so the two PRs are nested: the diff of `feat/resolve-config-users` against `main` still includes `d11adb5` until PR-5 lands. Review and merge PR-5 first.
