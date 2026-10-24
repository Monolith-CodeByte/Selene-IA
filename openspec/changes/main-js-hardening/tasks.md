# Tasks: main-js-hardening

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~30-60 (2 files) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Sync boot + token + bounded retry in `src/main.js`, empty `#app` in `index.html` | Single PR | `npm run build` | Manual smoke: login, throttled-Firestore error + Retry, 3-failure sign-out, mid-await logout | Single-commit revert of `src/main.js` + `index.html` |

## Phase 1: Foundation — empty shell and login state (JIRA: `SELENE-BOOT-001`)

- [x] 1.1 Replace `index.html:27-30` shell with empty `<div id="app"></div>`; `src/main.js` becomes sole shell source (D4).
- [x] 1.2 Add `authGeneration`, `isStale`, `loginAttempts`, `MAX_ATTEMPTS = 3` beside `activeAppCleanup` in `src/main.js` (A1/A3).

## Phase 2: Synchronous boot with generation token (JIRA: `SELENE-BOOT-001`)

- [x] 2.1 Convert `onUserChange` callback to non-async wrapper: `++authGeneration` on both branches + `.catch((err) => console.error('Auth callback:', err))` (A1/A5).
- [x] 2.2 Inline the `setTimeout(..., 50)` block at `src/main.js:67-103`; run `PresenceService.init` + five initializers synchronously, delete timer, no rAF (A2).
- [x] 2.3 Add `isStale` checks after every `await` (`getUserProfile`, `createUserProfile`, `logout`) and deferred resume, before any DOM write (A1).
- [x] 2.4 Keep `proceedToApp` await-free so check-then-boot stays atomic (A1).

Note: do NOT add a rapid-logout guard — A6 declines it as dead code under sync boot.

## Phase 3: Bounded login-error recovery (JIRA: `SELENE-BOOT-001`)

- [x] 3.1 Add `failLogin(user, generation, retry)`: attempts++, `>=3` → `await logout()` + stale-check, else `renderLoginError` (D2/D3).
- [x] 3.2 Add `renderLoginError(retry)`: `#app`-only Spanish copy ("No pudimos cargar tu perfil" / "Revisa tu conexión e inténtalo de nuevo." / [Reintentar]), styled by the statically imported `src/styles/login-error.css`; never the landing button (A4 revised — see design.md Deviations D-A4; D1).
- [x] 3.3 Wire `try/catch` in `onLoginSuccess`: fetch failure retries `onLoginSuccess(user, generation)`; create failure retries `createUserProfile` only (`setDoc` `merge: true`) (D2).
- [x] 3.4 Reset `loginAttempts` when `getUserProfile` resolves (A3). Non-goal: do NOT modify `src/services/auth.js` (A5).

## Phase 4: Manual verification — no test suite (JIRA: `SELENE-BOOT-001`)

- [x] 4.1 Run `npm run build` — PASSED (vite build, 53 modules, 2.57s; chunk-size warning only, pre-existing). Manual smokes (login/boot, empty-`#app` first paint, rapid-logout no resurrection) NOT performed — need a human in a browser, see apply-progress checklist.
- [ ] 4.2 Simulate Firestore failure (DevTools throttle/offline): inline error + Retry; 3 failures → sign-out to enabled CTA; mid-await logout aborts silently. Also verify W1 smoke (landing→app→landing cycle, logout→landing, login→logout→login, onboarding path). MANUAL — requires a human in a browser; NOT verified by apply. Checklist in apply-progress and `STATUS.md`.

## Open Questions

- None blocking.
