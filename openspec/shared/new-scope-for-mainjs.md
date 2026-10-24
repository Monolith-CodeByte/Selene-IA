# New Scope: `main-js-hardening` follow-up — audit response and pending work

**Audience:** the agent executing the next work unit on `src/main.js`.
**Origin:** lead review of the `main-js-hardening` change (commit `d80b39f`, PR #4). This document is the authoritative scope for the follow-up. Read it fully before touching any file.
**Baseline:** the original 7-point audit was written against the pre-hardening `src/main.js` (available as `git show d80b39f^:src/main.js`). Line numbers in the audit table refer to that baseline.

---

## 1. Why this document exists

The original lead audit of `src/main.js` raised **7 findings**. The previous execution run fixed **3 of them** (points 1, 4, 7) and dismissed the remaining 4 with the claim that "only 3 of the 7 were true."

That claim is **false**. A line-by-line re-verification against the real code establishes that **6 of the 7 observations are factually true**. Only point 6 is incorrect, and only as it was cited. The four dismissed findings carry **zero documented justification** anywhere in `openspec/PR-2-harden-auth-boot-sequence.md`, `design.md`, `tasks.md`, or `STATUS.md` — while every decision that *was* taken is documented in detail (A1–A6, D1–D4).

A finding that is deprioritized with a written reason is legitimate engineering. A finding silently discarded is an unauditable gap. This document closes that gap and assigns the remaining work.

**What the previous run got right — keep all of it:**
- The `authGeneration` token design (A1) and its placement after every `await` and deferred resume.
- The synchronous boot: removal of the `setTimeout(..., 50)` window (A2).
- Bounded login-failure recovery with `MAX_ATTEMPTS = 3`, the inline error surface, and the idempotent `createUserProfile` retry (D2/D3).
- The D-A4 styling correction (static `src/styles/login-error.css`, token-safe, verified to ship in the static CSS chunk). This analysis re-confirmed it: all 8 `.login-error*` rules are in `dist/assets/index-*.css`, absent from the lazy landing chunk, and every `var()` token they consume is defined in the same chunk.
- `npm run build` passes (52 modules, exit 0, pre-existing chunk-size warning only).

---

## 2. The original 7-point audit (verbatim, baseline line numbers)

| # | Baseline lines | Error | Stated impact |
|---|----------------|-------|---------------|
| 1 | 60-65 | Duplicates the app shell already hardcoded in `index.html:27-30` | Two sources of truth. Bugs when adding elements |
| 2 | 55-56 | `querySelectorAll(...).remove()` destructive and irreversible | Fragile equilibrium. Touch those lines and the app breaks |
| 3 | 124 | Unsubscribe of `onUserChange()` discarded | Duplicate listeners under Vite HMR, phantom errors in dev |
| 4 | 67 | `setTimeout(..., 50)` used as synchronization | Race on slow machines. App starts half-built |
| 5 | 28, 44-49, 96-99 | Mutable closure state with no formal lifecycle | Untestable, not reusable |
| 6 | 60-65, 111 | `innerHTML` with unescaped user data | XSS risk |
| 7 | 106-122 | `onLoginSuccess` without `try/catch` | Silent login failure |

Original priority guidance: points 1 and 3 first (low risk, high benefit, small task), then 2 and 4 (real bug, reproduce before touching), and 5–7 as background refactors.

---

## 3. Point-by-point adjudication (verified against real code)

### Point 1 — TRUE, fixed ✅
Baseline `main.js:60-65` duplicated the shell that `index.html:27-30` hardcoded. Resolved as decision D4: `index.html` now ships an empty `<div id="app"></div>` and `src/main.js` is the single shell source. No further work.

### Point 2 — TRUE, NOT fixed, NOT documented ❌ *(this is a required fix — see W1)*
Verified mechanics:
- The landing renders **inside `#app`**: `src/landing_comp/router.js:55` executes `app.innerHTML = route()`. The landing's `header`/`footer`/`main` nodes are children of `#app`.
- `src/main.js:62` runs `document.querySelectorAll('header, footer, main, .login-container').forEach(el => el.remove())` — a **document-global** destructive selector.
- The `main` token **also matches the app's own shell tag** `<main id="chat-container">` written by the same function at `src/main.js:64`.
- The `.login-container` token matches nothing at runtime: `src/components/LoginScreen.js` is not imported by any module (its only reference is the generated `src/config/seleneProjectKnowledge.generated.js`). It is dead code.
- The call is currently **harmless only by accident**: the very next statement rewrites `app.innerHTML`, destroying the landing subtree anyway. The landing cannot exist outside `#app`, so the global removal is fully redundant.

Why this is a defect and not a style note: the global selector couples `proceedToApp` to the landing's exact tag names while its `main` token also matches the app's own output. Any future element rendered at body level with one of those tags — or any refactor that moves the landing out of `#app` — breaks the landing→app transition silently. This is precisely the "fragile equilibrium" the audit flagged. It was dismissed without a line of justification.

### Point 3 — TRUE observation; stated impact does NOT materialize here; skip was correct but undocumented *(see W2)*
- The unsubscribe returned by `AuthService.onUserChange` is still discarded (baseline `main.js:124`, current `src/main.js:210`). The observation is true.
- The stated impact ("duplicate listeners under Vite HMR") **cannot occur in this architecture**: `src/main.js` is the Vite entry module (`index.html`: `<script type="module" src="/src/main.js">`). Vite cannot hot-swap the entry — editing it forces a full page reload. The subscription is created exactly once per page load, page lifetime equals subscription lifetime, and this vanilla-JS app has no remount path (no component framework, no double-mount semantics). There is no production leak and no dev duplication.
- Verdict: leaving the code unchanged was the correct call. The failure was writing none of this down.

### Point 4 — TRUE, fixed ✅
Baseline `main.js:67-103` deferred initialization behind `setTimeout(..., 50)` with no cancellation path. Removed; `PresenceService.init` and all five initializers now run synchronously in the same task as the shell write (A2). Note for accuracy: the audit's impact phrasing ("app starts half-built") was imprecise — the shell DOM was written before the timer — but the defect itself was real, and the hardened-change documentation articulates the correct hazard (the uncancelable window). No further work.

### Point 5 — TRUE; deprioritization defensible; undocumented — and the previous run DEEPENED it *(see W3)*
- Baseline closure state: `activeAppCleanup` (line 28) and its helper (44-49, 96-99). The observation is true.
- Deferring a background refactor was consistent with the audit's own priority note (5–7 = background). Defensible.
- However, the previous run **added two more closure variables** — `authGeneration` and `loginAttempts` — going from 1 to 3 pieces of lifecycle-less mutable state. The generation token is now the **sole defense** against stale auth continuations, and because this project has no test runner (`strict_tdd: false`, empty `verify.test_command`), that token **can only be exercised by a manual browser smoke**. That is a direct, foreseeable consequence of point 5 being deprioritized, and it is nowhere acknowledged.

### Point 6 — MIS-CITED for `main.js`; the underlying risk class lives elsewhere *(see W4)*
- Baseline `main.js:60-65` is a static markup literal with **no interpolated data**. Baseline `main.js:111` is `app.innerHTML = ''` — an empty string. Neither `innerHTML` site in `main.js` carries user-controlled content. As cited, the finding is factually wrong for this file.
- The nearest user data (`displayName`, `email`, `photoURL`, baseline lines 69-72) flows to `PresenceService.init` → Firebase **Realtime Database** (`src/services/presence.js:104`, `set()` to `/status/{uid}`). It never reaches the DOM through this path.
- **The audit's underlying concern is still valid — just not in `main.js`.** `src/components/Sidebar.js` and `src/components/ChatArea.js` render chat titles and message content via `innerHTML`, and those strings are user-derived. That is the real XSS surface and it must be recorded as a separate follow-up (W4). It is out of scope for `main.js`.

### Point 7 — TRUE, fixed ✅
Baseline `main.js:106-122` let `getUserProfile`'s rejections escape into `onAuthStateChanged` as an unhandled rejection. Resolved: `try/catch` in `onLoginSuccess`, bounded `failLogin`, non-async wrapper with `.catch()` (D2/D3/A5). No further work.

**Scorecard: 6 of 7 observations true (1, 2, 3, 4, 5, 7). Only 6 mis-cited. Points 1, 4, 7 fixed correctly. Point 2 left as an undocumented landmine. Points 3, 5, 6 dismissed without traceable reasoning.**

---

## 4. Required work

### W1 — Fix point 2: eliminate the destructive global selector *(code)*
**Target:** `src/main.js`, the `landingElements` removal inside `proceedToApp` (current line 62).

Verified premise: the landing exists only inside `#app` (`router.js:55`); the onboarding screen is the only body-level append and it **self-removes** on completion (`src/components/Onboarding.js:142`); `.login-container` never exists at runtime (`LoginScreen.js` is unimported dead code).

**Requirements:**
1. Remove the document-global `querySelectorAll('header, footer, main, .login-container').forEach(el => el.remove())` call. Rewriting `app.innerHTML` already destroys the entire landing subtree; the global removal is redundant and its `main` token matches the app's own shell tag.
2. Before deleting, verify the full landing→app→landing cycle manually (see acceptance criteria). If — and only if — verification finds a node that survives the `innerHTML` rewrite and breaks the transition, replace the global call with logic **scoped to `#app`** and name the exact node in the change record. Never restore a document-global tag-name selector.
3. Do not touch `router.js`, the onboarding self-removal, or the shell markup while doing this.

**Acceptance criteria (manual smoke, record results):**
- Cold load → landing renders inside `#app` → login → app boots with sidebar + chat, no leftover landing nodes.
- Logout → landing re-renders correctly (router fade included).
- Login → logout → login again in one page session → app boots cleanly, no duplicated header/footer/main, no orphan nodes at body level.
- New-user path: first login → onboarding → complete onboarding → app boots, `.onboarding-screen` gone.

### W2 — Document the rejected findings *(documentation)*
Add a **"Rejected findings and justification"** section to `openspec/changes/main-js-hardening/design.md` (or extend `STATUS.md`) covering points 3, 5, and 6, using the verified reasoning in §3 of this document — with your own re-verification, not by copying conclusions blindly. Each rejected finding must state: the observation was true/false, the evidence (file:line), the impact verdict, and why no code change follows. A rejection without evidence is the defect this scope exists to correct.

### W3 — Acknowledge the point-5 tradeoff *(documentation)*
Record explicitly in the change record that the hardening **increased** closure state from 1 to 3 variables (`activeAppCleanup`, `authGeneration`, `loginAttempts`) and that the generation token is therefore runtime-only verifiable until roadmap item F2 (test runner) lands. Link this to task 4.2: the manual smoke is not a nice-to-have, it is the **only** acceptance evidence the token will ever get in this scope.

### W4 — Record the real XSS surface as a separate follow-up *(documentation, no code)*
Open a follow-up item (roadmap/issue — per project convention) covering `innerHTML` usage with user-derived data in `src/components/Sidebar.js` and `src/components/ChatArea.js` (chat titles, message content). Note that `preferredName` is user-typed input (onboarding) and `displayName` comes from the Google profile — both are user-controlled strings. **Do not fix it in this scope.** The follow-up must exist and be referenced from the change record.

### W5 — Complete the outstanding closure steps already listed in STATUS.md
These were flagged by the previous run and remain open:
1. Perform the 5-step manual smoke documented in `STATUS.md` and record the outcome on task 4.2 (W1's acceptance criteria supersede step ordering where they overlap — run both sets).
2. Replace the `JIRA-TBD` placeholder in the four task-group headers of `tasks.md` with the real ticket id (`openspec/config.yaml` → `rules.tasks`).
3. Run the `verify` phase; its report cites the manual smoke results as human-provided evidence.
4. Only then run `archive`, which syncs the delta specs into `openspec/specs/`.

---

## 5. Constraints

- `src/services/auth.js` stays untouched (decision A5).
- No new runtime dependencies. Vanilla ES modules only.
- No test runner in this scope — F2 remains roadmap. Do not add one ad hoc.
- No changes to `router.js`, the shell markup contract, or the onboarding self-removal.
- The pre-existing worktree changes in `.atl/` (skill-registry cache and paths) are **not** part of this work and must not be staged with it.
- Commit messages: conventional commits, no AI attribution.

## 6. Definition of done

- [ ] W1: global selector removed; W1 smoke executed and results recorded in the change record.
- [ ] W2: "Rejected findings and justification" section present, covering points 3, 5, 6 with file:line evidence.
- [ ] W3: closure-state tradeoff acknowledged in the change record.
- [ ] W4: XSS follow-up item created and referenced (Sidebar/ChatArea).
- [ ] W5: task 4.2 checked with recorded smoke results; real ticket id in `tasks.md`; `verify` report exists; `archive` run.
- [ ] `npm run build` still passes.
- [ ] A closing note in the change record acknowledging the triage error: the original audit raised 6 valid findings, not 3.

## W5 — Manual smoke checklist (to be executed by human)

Copy results here when done. Mark PASS/FAIL + notes/screenshots.

### A) STATUS.md smoke (core auth/boot/token)
- [ ] 1. Normal login → app boots; sidebar + chat render
- [ ] 2. DevTools → Network → Offline, hard reload with persisted session → inline error "No pudimos cargar tu perfil" **styled** (accent button, centred, readable)
- [ ] 3. Back Online, click **Reintentar** → recovers and boots
- [ ] 4. Repeat failure **3 times** → on 3rd: signs out to landing with **live CTA** (not "Cargando Elai...")
- [ ] 5. Offline → trigger error → **authenticate in a second tab** before clicking Reintentar → **no** error surface; **no** dead session boots

### B) W1 cycle smoke (landing removal / global selector)
- [ ] Cold load → landing renders inside `#app` → login → app boots cleanly
- [ ] Logout → landing re-renders correctly (router fade)
- [ ] Login → logout → login again in same session → no duplicated header/footer/main, no orphan nodes at body level
- [ ] New user → onboarding → complete onboarding → app boots, `.onboarding-screen` removed

### Execution log
- Tester: ___________
- Date/time: ___________
- Browser/DevTools: ___________
- Build hash (dist): ___________
- Notes/bugs found: ___________
- Result: ☐ PASS  ☐ FAIL  (if FAIL, list failing steps)
