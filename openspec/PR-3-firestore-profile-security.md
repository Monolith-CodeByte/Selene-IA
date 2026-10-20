# Add versioned Firestore rules with a profile field allowlist

## Description

`src/services/user.js` spread caller-supplied `data` straight into `updateDoc(...)` as `{ ...data, updatedAt }`, so every field a caller sent reached the `users/{uid}` document — including `role`, `plan`, and `permissions`, which are meant to be server-owned, and any field a future feature might add. The same lack of a server-side check applied to profile creation, where `createUserProfile` writes with `setDoc(..., { merge: true })` and nothing constrained the payload. The repository contained no `firestore.rules` and no `firebase.json`, so no such protection was versioned, reviewable, or testable. The exposure was latent rather than exploited: the only caller of `updateUserProfile` today is `src/components/Onboarding.js`, which sends exactly four fields.

This change moves the boundary to the server and makes it an allowlist rather than a deny-list. A new versioned `firestore.rules`, wired through `firebase.json`, requires `update` to satisfy `request.resource.data.diff(resource.data).affectedKeys().hasOnly(userUpdateFields())`, so only `preferredName`, `discoverySource`, `usageIntent`, `onboardingComplete`, and `updatedAt` may change. Everything else — `role`, `plan`, `permissions`, `email`, `createdAt`, `lastLogin`, and every field not yet written — is protected by default and needs no rules edit to stay locked. Creation is bounded the same way: the `create` clause requires `request.resource.data.keys().hasOnly(userCreateFields())`, requires the identity fields to be present, pins `email` to `request.auth.token.email`, forces `onboardingComplete == false`, and requires `createdAt` and `lastLogin` to equal `request.time`.

The rules are backed by a client mirror and by tests. A new pure module, `src/services/profileFields.js`, holds the same field names and sanitizes the payload before the write, turning a rejected field into an immediate local warning instead of a permission-denied round trip; it is explicitly documented as defence-in-depth only, because a browser client can always be bypassed. `updateUserProfile` now calls `sanitizeProfileUpdate` and writes the sanitized result. The change also ships an emulator-backed rules suite (`tests/firestore.rules.test.js`, 29 cases) and a dependency-free unit suite (`tests/profile-fields.unit.test.js`, 9 cases), both runnable fully offline.

## Changes Made

### Security — Firestore rules

- `firestore.rules` (new) — versioned rules using an allowlist model. `userUpdateFields()` gates `update` via `changedKeys().hasOnly(...)`, so removing a protected field (for example with `deleteField`) is denied exactly like editing it. `userCreateFields()` gates `create`, pins `email` to the authenticated token, forces `onboardingComplete == false`, and requires server timestamps. `read` is owner-only, `delete` is `if false`, and `chats` / `chats/{chatId}/messages` get per-user isolation. Anything unmatched is denied by default.
- `firebase.json` (new) — wires `firestore.rules` for both the emulator and deploy, and configures the Firestore emulator on `127.0.0.1:8080` with the UI disabled and `singleProjectMode` enabled.

### Security — client field policy

- `src/services/profileFields.js` (new) — exports `ALLOWED_PROFILE_FIELDS` and `sanitizeProfileUpdate(data)`, returning `{ safeData, rejected }`. It imports neither Firebase nor Vite, so it runs under plain `node --test`. The header documents it as a mirror of `userUpdateFields()`, not the security boundary.
- `src/services/user.js` — `updateUserProfile` sanitizes before writing: it writes `...safeData` plus `updatedAt: serverTimestamp()`, and `console.warn`s the names of rejected fields. `createUserProfile` is unchanged.

### Tests

- `tests/firestore.rules.test.js` (new, 29 cases) — positive replays of the exact onboarding payload and the exact creation payload, plus bypass attempts: `role`, `plan`, `permissions`, an unknown future field, a mixed allowed-plus-protected payload, deleting a protected field, re-opening onboarding, a client-supplied `updatedAt`, a `setDoc` with `merge: true` that injects `role`, cross-user access, unauthenticated access, and client-side deletion.
- `tests/profile-fields.unit.test.js` (new, 9 cases) — the unit policy: keeps allowlisted fields, drops `role`, `plan`, `permissions`, identity fields and unknown fields, tolerates non-object input, and preserves falsy allowlisted values.
- `tests/firestore.rules.test.js` — additional bypass cases added in a follow-up commit (`ed8f1a7`).

### Dev tooling

- `scripts/run-rules-tests.mjs` (new) — resolves a Java 11+ runtime (`JAVA_HOME` → a JDK under `~/.local/share/jdk21` → `java` on `PATH`) and runs `firebase emulators:exec --only firestore --project demo-selene-ia` against `node --test "tests/**/*.rules.test.js"`. No network call reaches a real Firebase project.
- `package.json` — adds `test`, `test:unit` (`node --test "tests/**/*.unit.test.js"`) and `test:rules` scripts, and adds `@firebase/rules-unit-testing` and `firebase-tools` as devDependencies.

### Configuration

- `package-lock.json` — refreshed for the two new devDependencies; this accounts for the bulk of the diff line count. No production dependency changed.

### Documentation

- `README.md` — documents the allowlist model, the `test:unit` / `test:rules` commands, the Java 11+ requirement, the new `scripts/` and `tests/` entries, and the deploy command.
- `odd/tasks/firestore-profile-security.md` (new) — the change record: specs, tasks, verification evidence, and the blocked independent review.

### Generated artifacts

- `src/config/seleneProjectKnowledge.generated.js` — regenerated by the `prebuild` step: only the `generatedAt` timestamp changed and `src/services/profileFields.js` was added to the detected file list. No behavior change.

## Impact

**Behavior changes**

- A raw profile update carrying a non-allowlisted field is now rejected server-side with `permission-denied`. Through `UserService.updateUserProfile`, the same field is stripped before the write and reported via `console.warn`, so the allowed subset still writes.
- Profile creation can no longer inject a protected field, pre-complete onboarding, spoof `email`, or supply client-side timestamps.
- Profile reads are owner-only; unauthenticated and cross-user access are denied, as is client-side profile deletion.
- Chat documents and their messages are readable and writable only by the owner of the parent profile.

**Compatibility**

- No new runtime dependency; two devDependencies were added. No change to the `users/{uid}` document shape and no change to `createUserProfile`.
- The exact payload `src/components/Onboarding.js` sends still succeeds — pinned by a test that replays it.
- Note for reviewers: `diff().affectedKeys()` reports only keys whose VALUE actually changed, so re-writing a protected field with its current value is a no-op and is accepted, without the value moving. This is pinned by a test so it is not later mistaken for a hole.

**Risks and caveats**

- The rules are committed and versioned but NOT deployed. Until `firebase deploy --only firestore:rules` runs against the shared Firebase project, the server-side protection is not active in production.
- No independent review was performed; the evidence in this PR is author-run. The currently deployed production rules are also unknown, because the team does not yet have console access to the shared project.

## Notes

### Verification (author-run)

- `npm run test:unit` → 9 pass / 0 fail.
- `npm run test:rules` (Firestore emulator) → 29 pass / 0 fail, exit 0.
- 38 tests total, GREEN.
- The rules suite was falsified against fully permissive rules (`allow read, write: if true`): 22 of the 29 cases failed, and the 7 that passed are the legitimate flows plus the no-op check. `firestore.rules` was then restored byte-identical (empty `git diff`). This shows the suite binds to the rules instead of passing tautologically.
- `npm run build` passes.

### How to verify

```bash
npm run test:unit
npm run test:rules   # starts the emulator; requires a Java 11+ runtime
```

### Deployment

Deploying the rules is a separate, authorized step and requires access to the shared Firebase project:

```bash
firebase deploy --only firestore:rules --project <project-id>
```

### Follow-ups

- RTDB rules for presence are untouched — `src/services/presence.js` uses Realtime Database, not Firestore.
- `chats` documents have per-user isolation only; field-level hardening for chat documents is not part of this change.
- Because the model is an allowlist, any field added later is protected by default. `role`, `plan`, and `permissions` must stay out of `userUpdateFields()` if they are ever introduced, since they are server-owned.
- Pre-existing production audit findings (4, via `@grpc/grpc-js` in the `firebase` dependency tree) are not introduced by this change; the diff adds only devDependencies.
