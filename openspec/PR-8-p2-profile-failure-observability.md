# PR-8: Add profile-boot failure observability (P2)

## Description

Manual QA on 2026-11-20 reported that an existing profile with `onboardingComplete:false` showed `No pudimos cargar tu perfil` / `Revisa tu conexión e inténtalo de nuevo.` / `Reintentar`, while the console reported `Missing or insufficient permissions`. The login-error surface discarded `err.code` and asserted a network diagnosis for every profile-boot failure, so the console message could not be correlated with the user-visible state.

Read-only exploration confirmed that `users/{uid}` is built from the authenticated `user.uid` and that the active `firestore.rules` allow the owner to read, so the earlier `uid != doc id` hypothesis was wrong. Firestore emits the same message for an unauthenticated token, and the repository alone cannot distinguish a project/env mismatch, a stale pre-T2 bundle, or a deployed ruleset mismatch. The user reran the project on 2026-11-24 and P2 no longer reproduced; it is being closed as non-reproducible.

This change keeps a diagnostic layer instead of guessing a root cause. A pure mapper turns the failure `code` and boot `phase` into honest user-facing copy plus a visible `Detalle: <code> (carga|creación)` line, and both profile-boot catch sites log a structured object. No Firebase configuration values, Firestore rules, persisted data, or deployment artifacts are changed.

## Changes Made

### Features

- **`src/services/profileFailure.js`**: new pure `resolveProfileFailure({ code, phase })` returning `{ title, message, retryable, detail }`; maps `permission-denied`, `unauthenticated`, `unavailable`, `network-request-failed`, `invalid-argument`, and a default case. `detail` renders as `Detalle: <code> (carga|creación)` using `PHASE_LABEL` (`load` -> `carga`, `create` -> `creación`).
- **`src/main.js`**: imports `app as firebaseApp` and `resolveProfileFailure`.
- **`src/main.js`**: the `load` and `create` catch sites now log `{ code, phase, projectId, uid, error }` with `projectId: firebaseApp.options.projectId` and pass the matching phase to `resolveProfileFailure`.
- **`src/main.js`**: `failLogin` accepts a `failure` argument; a non-retryable failure bypasses `attemptCounter.recordFailure()` and the bounded 3-attempt logout path.
- **`src/main.js`**: `renderLoginError(retry, failure)` renders `failure.title`, `failure.message`, and `failure.detail`, then switches between the `Reintentar` button and an explicit `Cerrar sesión` button wired to `AuthService.logout()`.
- **`src/firebase-config.js`**: exports `app` alongside `auth` and `db` so `main.js` can log the active project id.
- **`src/styles/login-error.css`**: adds `.login-error__detail` styling and shares the existing `.login-error__retry` button rules with `.login-error__signout`, including hover, active, focus, and reduced-motion states.

### Tests

- **`tests/profile-failure.unit.test.js`**: new unit cases for every mapped code/phase combination, plus source-level wiring assertions on `main.js` because this project has no DOM runner.

## Impact

- Profile-boot failures now show code-specific copy instead of a universal connectivity claim: `No pudimos acceder a tu perfil`, `Tu sesión venció`, `No pudimos cargar tu perfil` with `Los datos de tu perfil no son válidos. Cierra sesión y vuelve a intentarlo.`, or the default `No pudimos completar la carga. Inténtalo de nuevo.`
- `permission-denied`, `unauthenticated`, and `invalid-argument` return `retryable: false` and show `Cerrar sesión`; `unavailable`, `network-request-failed`, and unknown codes keep `Reintentar` and still consume the bounded attempt budget.
- Non-retryable failures no longer consume the 3-attempt counter; the structured console record now includes `code`, `phase`, `projectId`, `uid`, and the original `error` for diagnosis.
- Callers that do not supply a `failure` receive the default mapped surface from `resolveProfileFailure({ code: 'unknown', phase: 'load' })`. No Firestore paths, persisted data, auth configuration, Firestore rules, or other UI strings change.
- `main.js` wiring is verified against source text rather than a rendered component, since no DOM runner is installed.

## Notes

### Verification (observed)

- `npm run test:unit`: 47 pass, 0 fail; RED was observed first on the new test file, then GREEN.
- `npm test`: 47 unit tests and 29 Firestore rules tests pass, 0 fail.
- `npx vite build`: OK.
- `gentle-ai review assess` with the untracked files declared returned `medium / under_budget`; no review was started. The tier was inflated by unrelated runtime-generated changes, which are excluded from this PR.
- `Risk: none` (no auth, data, rules, or config changes). Any future config/rules/deploy fix remains item 2 + item 5.

### Deliberate deviation

- The proposal said non-retryable failures would sign out immediately. The implementation shows an explicit `Cerrar sesión` button while keeping `code` visible in `failure.detail`, because an immediate logout would erase the evidence needed to report the failure. This is intentional.

### Closure

- P2 is closed as non-reproducible after the 2026-11-24 rerun. This PR adds diagnostics only; it does not claim a root cause or a configuration, rules, or deployment fix.
