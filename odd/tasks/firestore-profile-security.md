# Firestore profile security & versioned rules

**Objective:** Enforce which fields a user may change on their own profile, protect privileged fields, and version the Firestore security rules inside the repository.
**Branch:** `feat/firebase-rules` (from `main`) · **Delivery strategy:** `ask-on-risk` · **Test runner:** `npm run test:rules` (Firebase Emulator + `node --test`)

## Specs

**S1 — User-writable profile fields are explicitly defined.**
Owner: the user may update only the fields in the service allowlist and the rules allowlist.
Acceptance: any field not in the allowlist is rejected, both client-side (stripped) and server-side (`permission-denied`).
Check: `tests/firestore.rules.test.js` — allowlisted update succeeds.

**S2 — Protected fields cannot be modified through the profile update path.**
Original request verbatim: *"Impedir que pueda modificar campos que deben estar protegidos."*
Protected set for `users/{uid}`: everything outside the allowlist, explicitly `role`, `plan`, `permissions`.
Acceptance: an authenticated owner sending `role`, `plan` or `permissions` gets `permission-denied`.
Check: three negative tests, one per protected field.

**S3 — Firestore security rules are reviewed and organized.**
Original request verbatim: *"Revisar y organizar las reglas de seguridad de Firestore."*
Acceptance: a single `firestore.rules` with one `match` block per collection, shared helper functions, and comments explaining each allowlist.
Check: rules file exists, parses, and is wired from `firebase.json`.

**S4 — Rules live in the repository and are versioned with the code.**
Original request verbatim: *"Guardar las reglas de Firestore dentro del repositorio para que puedan ser revisadas y versionadas junto con el código."*
Acceptance: `firestore.rules` + `firebase.json` are tracked by git.
Check: `git ls-files` lists both files.

**S5 — Rules allow only the operations that correspond to each user.**
Original request verbatim: *"Las reglas permiten únicamente las operaciones que correspondan a cada tipo de usuario."*
Acceptance: an authenticated user can read/write only their own `users/{uid}` document and its `chats` subtree; cross-user access and unauthenticated access are denied.
Check: cross-user read/update tests and unauthenticated tests.

**S6 — The normal profile update flow keeps working.**
Original request verbatim: *"Los cambios no rompen la actualización normal del perfil."*
Acceptance: the exact payload `Onboarding.js` sends (plus `updatedAt`) is accepted; the login create payload is accepted.
Check: positive tests replaying both real payloads, plus `npm run build`.

**S7 — Tests prove a user cannot modify protected information.**
Original request verbatim: *"Se realizan pruebas para comprobar que un usuario no puede modificar información protegida."*
Acceptance: an automated suite runs against the emulator, versioned in the repo, and fails if the protection is removed.
Check: `npm run test:rules` green; RED evidence captured against permissive rules.

**Assumptions**
- `role`, `plan` and `permissions` do not exist in the user document yet; they are treated as future protected fields, which is why the rules use an allowlist and not a deny-list.
- Production rules currently deployed are unknown (no console access); deploy is a separate, user-authorized step.

## Tasks

| ID | Spec | Route | Description | Status | Evidence |
|----|------|-------|-------------|--------|----------|
| T1 | S3, S4 | inline | `firestore.rules` with allowlist model + `firebase.json` | done | `7f0da25` |
| T2 | S1, S2 | inline | Client field policy in `src/services/profileFields.js` + `updateUserProfile` sanitizes before writing | done | `66f4001` |
| T3 | S7 | inline | Emulator test infra (`firebase-tools` 15.34.0, `@firebase/rules-unit-testing` 5.0.2) + `npm run test:rules` / `test:unit` | done | `66f4001` |
| T4 | S2, S5, S6, S7 | inline | `tests/firestore.rules.test.js` + bypass attempts (29 cases) and `tests/profile-fields.unit.test.js` (9 cases) | done | `7f0da25`, `ed8f1a7`; RED/GREEN below |
| T5 | S6 | inline | Build + offline replay of the real onboarding and creation payloads | done | `npm run build` OK; positive tests replay both payloads |
| T6 | — | delegated | Independent verification (security = high risk) | **blocked** | subagent tool permission-denied; RDD off by user's global decision |

## Verification evidence

**GREEN** — `npm test` (exit 0): 9 unit + 29 rules tests pass. `npm run build` succeeds.

**RED (falsification)** — the same rules suite executed against fully permissive rules
(`allow read, write: if true`) fails 22 of 29 tests, proving the suite measures the
protection and is not tautological:
```
# tests 29 / # pass 7 / # fail 22
```
The 7 that pass under open rules are exactly the legitimate-flow cases plus the two
"no escalation" checks, which legitimately succeed by design. `firestore.rules` was
restored byte-identical afterwards (`git diff --stat firestore.rules` → empty).

**Java resolution** — `JAVA_HOME` is empty and `java` is not on `PATH` in this
environment, so every successful run went through the wrapper's local-JDK fallback
(`~/.local/share/jdk21`). That is the path the team will hit.

**Build artifact** — the sanitizer and the allowlist are present in
`dist/assets/index-*.js` (verified by grep on the built bundle).

**Findings from the adversarial pass**
- `diff().affectedKeys()` reports only keys whose value changed, so resending a
  protected field with its *current* value is accepted as a no-op. Not an escalation;
  pinned by a test so it is not mistaken for a hole later.
- `withSecurityRulesDisabled` does not forward the callback's return value in
  `@firebase/rules-unit-testing` v5; capture into a variable instead.
- `node --test tests/` (directory form) is resolved as a module path by Node 22 and
  fails; the runner uses `node --test "tests/**/*.rules.test.js"`.

**Not verified**
- Independent verification did not happen: the `subagent` tool is permission-denied in
  this runtime, and receipt-driven development is off by the user's own global decision,
  so no native review may be started. The change has author-run evidence only.
- Production rules currently deployed are unknown (no Firebase console access), and the
  rules have **not** been deployed anywhere.

**Next step:** user decision on independent verification; deploy remains a separate
authorized step once the team shares Firebase project access.


## Log

**L1 (original request, verbatim):**
> Actualmente, el sistema permite que un usuario envíe información adicional al actualizar su perfil sin comprobar exactamente qué campos está autorizado a modificar.
>
> Esto podría permitir que, en el futuro, un usuario modifique información que debería estar protegida, como su rol, plan o permisos.
>
> Además, las reglas de seguridad de Firestore no están guardadas en el repositorio del proyecto, por lo que no podemos revisar fácilmente qué información está protegida ni llevar un control de sus cambios.
>
> ¿Qué debemos hacer?
>
> Definir qué campos puede modificar un usuario de su propio perfil.
> Impedir que pueda modificar campos que deben estar protegidos.
> Revisar y organizar las reglas de seguridad de Firestore.
> Guardar las reglas de Firestore dentro del repositorio para que puedan ser revisadas y versionadas junto con el código.
>
> Criterios de aceptación
>
> Un usuario solo puede modificar los campos permitidos de su perfil.
> No es posible modificar campos protegidos como rol, plan o permisos desde la actualización del perfil.
> Las reglas de seguridad de Firestore están incluidas en el repositorio.
> Las reglas permiten únicamente las operaciones que correspondan a cada tipo de usuario.
> Los cambios no rompen la actualización normal del perfil.
> Se realizan pruebas para comprobar que un usuario no puede modificar información protegida.
>
> Notas
>
> Área: Seguridad.
> Se debe revisar la implementación actual de src/services/user.js y las reglas de seguridad de Firestore antes de realizar los cambios.

**L2 (user decision, 2026-10-15):** approved the 6 execution points including installing the Firestore emulator as devDependencies (`firebase-tools`, `@firebase/rules-unit-testing`). Explicit instruction: create branch `feat/firebase-rules` from `main`.

**L3 (user constraint, 2026-10-15):** no access to the real Firebase project yet — the project was started by Luis and the database must still be shared with the team. Deployment of rules to production is therefore out of scope for this change; the whole cycle runs offline against the emulator.

**Analysis — current state (evidence):**
- `src/services/user.js:47` spreads caller data straight into `updateDoc` → any field reaches Firestore.
- `src/services/user.js:35` `setDoc(..., { merge: true })` → same hole at document creation.
- Single caller today: `src/components/Onboarding.js:132` (4 fields). So the hole is latent, not exploited.
- No `firestore.rules` and no `firebase.json` in the repository (verified by grep + `ls`).
- Subcollections in use: `users/{uid}/chats` and `.../chats/{chatId}/messages` (`src/services/history.js`).
- Presence uses RTDB (`src/services/presence.js`), not Firestore → RTDB rules remain a separate follow-up, untouched here.

**Decision:** allowlist model (`affectedKeys().hasOnly([...])`) instead of a deny-list, so any field added in the future (`role`, `plan`, `permissions`) is protected by default without touching the rules again.

**Decision:** chats get per-user isolation only. Field-level hardening for chat documents is not requested by this change and would risk breaking the normal flow; recorded as follow-up.

**Environment blocker:** the Firestore emulator needs a JRE 11+, and this machine had no Java and no passwordless sudo. Resolved by installing Temurin JDK 21 inside the user profile (`~/.local/share/jdk21`, symlink to `jdk-21.0.12.1+1`), no sudo and nothing touched system-wide. `scripts/run-rules-tests.mjs` resolves `JAVA_HOME` → local JDK → `PATH` in that order, so the suite runs for any teammate regardless of how they installed Java.

**Bug found and fixed while building the suite:** `node --test tests/` is resolved as a module path by Node 22 (`Cannot find module .../tests`). The runner passes a quoted glob instead. Also `withSecurityRulesDisabled` does not return the callback's value in `@firebase/rules-unit-testing` v5.

**Security semantics confirmed by attack:** writing a protected field with its *current* value is accepted, because `diff().affectedKeys()` only reports keys whose value changed. It is a no-op, not an escalation, and it is pinned by a test.

**L4 (final state, 2026-10-15):** implementation complete in 4 work-unit commits (`7f0da25`, `66f4001`, `bd6cb96`, `ed8f1a7`) on `feat/firebase-rules`. `npm test` green (9 unit + 29 rules), `npm run build` green, RED evidence captured at 22/29 failures against permissive rules. Independent verification blocked: `subagent` permission-denied, RDD off by user's global decision.

**Next step:** user decision on independent verification; rule deployment to the real project remains pending until the team shares Firebase access.

