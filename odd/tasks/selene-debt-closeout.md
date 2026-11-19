# Selene technical debt closeout — cierre de la deuda técnica de Jira
Branch: `feat/resolve-config-users` (HEAD `7f3d575`) | Delivery strategy: `ask-on-risk` | Test runner: `npm test` (unit + rules), `npm run build`, smoke `npm ci --omit=dev`
Modo: interactivo — detener después de cada tarea y esperar la confirmación explícita del usuario antes de continuar.

## Specs

**S1 — Contrato de interacción (autorización).** "Vamos a implemenatarlo con ODD, asi que empieza con el feature doc y cada vez que termines una tarea detente y yo te confirmo que continues." Alcance: este documento se crea antes de la primera escritura de código; cada tarea se detiene al terminar; push, PR y merge siguen siendo decisiones humanas. Check: confirmación del usuario entre tareas.

**S2 — Objetivo aceptado.** "Ufff parace que tenemos bastantes problemas, quiero que explores el código y en base a ello - ademas de los hallazgos encontrados - me des tu propuesta nivel senior para solucionar todos estos problemas y concluir la deuda tecnica de la forma correcta." Alcance: cerrar los clusters C1–C7 de la propuesta aceptada por causa raíz, no por síntoma. Check: tests nombrados por cluster en S3–S9.

**S3 — C6 ship-blocker: dependencias de runtime.** `server/proxyAuth.js:3` importa `express-rate-limit`, ausente de `package.json` y con `dev: true` en `package-lock.json`; `npm ci --omit=dev` produce `ERR_MODULE_NOT_FOUND`. `firebase-admin` también está sin declarar en HEAD (adición no commiteada detectada al crear este doc). Criterio: ambas como dependencias de runtime, lock sin `dev: true` para ellas, y smoke de arranque del servidor con install de producción. Check: `npm ci --omit=dev` + import smoke + `npm test`.

**S4 — C1: crear no es cargar.** `setDoc(..., { merge: true })` en `src/services/user.js:36` sobre un documento existente cae en la rama update de `firestore.rules:68-77` y devuelve `permission-denied` porque `createdAt`/`lastLogin` no están en `userUpdateFields()`. Criterio: `profile === null` crea; perfil existente con `onboardingComplete: false` va a onboarding sin ningún write; se elimina `merge: true`. Check: test "existing profile + onboardingComplete=false alcanza onboarding con cero writes"; conservar `firestore.rules.test.js:179-188`.

**S5 — C2: salida del callejón sin salida.** `loginAttempts` se resetea solo en éxito (`src/main.js:161`), no en `onSignedOut` (`:196`). Criterio: reset al cerrar sesión, de modo que un 4º intento en una sesión nueva no haga logout inmediato. Check: test de reset y de superficie de error visible; el test debe verificar que onboarding renderiza, no que el error desaparece.

**S6 — C3: teardown contra el DOM real.** `src/main.js:199` consulta `.onboarding-screen`, pero `src/components/Onboarding.js:5` crea `.onboarding-container` y se cuelga de `body`. Criterio: eliminar el selector mágico usando la referencia del nodo creado. Check: test de sign-out durante onboarding remueve `.onboarding-container`.

**S7 — C4: campos opcionales sin lector.** `src/components/Onboarding.js:108` inventa `'unknown'` y `:135` escribe `usageIntent: null`; `discoverySource`/`usageIntent` tienen cero consumidores en `src`. Criterio: omitir la key cuando no hay elección; eliminar el valor inventado; no agregar enums a `firestore.rules`. Check: test de payload sin las keys no elegidas; conservar los 9 tests de `tests/profile-fields.unit.test.js`.

**S8 — C5: decidir, no construir.** `firestore.rules:88-94` ya restringe todo el subtree a `isOwner(uid)` bajo `/users/{uid}/chats`; `ownerId` sería una segunda representación del path y no se agregará. Criterio: conservar las reglas actuales; el fallo real es que `ChatArea.js:169-175` muestra el error solo en DOM y se pierde al recargar, así que se persiste con la forma existente `saveMessage(..., 'ai')`. Check: test de fallo de IA persiste un mensaje.

**S9 — C6/C4 documental: verdad verificable.** `src/services/profileFields.js:6` apunta a `tests/profile-fields.test.js` (archivo inexistente; el real es `tests/profile-fields.unit.test.js`). El doc `openspec/PR-5-gemini-proxy-auth-hardening.md` afirma 4 vulnerabilidades cuando `npm audit --omit=dev` reporta 14 (1 critical, 3 high, 9 moderate, 1 low). Criterio: rutas y números correctos; el upgrade de dependencias se documenta como decisión separada, no se mezcla con el fix de seguridad. Check: readback de paths y cifras.

**S10 — C7: presence requiere decisión de producto.** `src/services/presenceStatus.js:18-32` y `src/services/presence.js:42` escriben `/status/{uid}` y ningún consumidor lo lee. Criterio: el usuario decide si se entrega con un consumidor (online dot) o se descarta el slice; mientras tanto el trabajo sin commitear no se mezcla con los work units de este documento. Check: decisión explícita del usuario. **Bloqueada por decisión humana.**

**S11 — C6 deploy: paso manual.** `firebase deploy --only firestore:rules,database:rules --project <id>`; `.firebaserc` está en `.gitignore:38`, así que el id se pasa a mano. Criterio: queda como paso manual del usuario; no se simula éxito de deploy. Check: confirmación del usuario.

## Tasks

- **T1** — S3 — inline — done — `fix(deps): declare proxy runtime dependencies` (commit `f391fe2`) — evidence: RED `ERR_MODULE_NOT_FOUND` + 2 tests failing; GREEN `npm test` 23 unit + 38 rules, smoke `npm ci --omit=dev` + import OK; assess `medium` / `under_budget` (sin review).
- **T2** — S4–S6 — inline — done — `fix(auth): separate profile creation from onboarding resume` (commit `7f3d575`) — evidence: RED `ERR_MODULE_NOT_FOUND` (11 tests) + wiring fails; GREEN 34 unit + 38 rules, `npm run build` OK; assess `medium` / `under_budget` (sin review).
- **T3** — S7 + S9 (ruta de test) — inline — done — `fix(onboarding): omit unanswered optional fields` (commit `796fbe6`) — evidence: RED `ERR_MODULE_NOT_FOUND` en `tests/onboarding-profile.unit.test.js` (módulo puro ausente); GREEN 37 unit + 38 rules, `npm run build` OK. S7: payload omite keys no elegidas (sin `'unknown'`, sin `usageIntent: null`) vía `buildOnboardingProfilePayload`; S9: ruta de test corregida en `profileFields.js`. Se conservan los 9 tests de `tests/profile-fields.unit.test.js`.
- **T4** — S8 — inline — done — `fix(chat): persist failed AI messages` (commit `<pending>`) — evidence: RED `ERR_MODULE_NOT_FOUND` en `tests/chat-failure.unit.test.js` (módulo ausente); GREEN 39 unit, `npm run build` OK. El fallo de IA ahora se persiste con `saveMessage(user.uid, targetChatId, AI_FAILURE_MESSAGE, 'ai')` vía `persistFailedAiMessage`; las reglas de Firestore se conservan sin cambios.
- **T5** — S9 (cifras de audit) — inline — pending — `docs: correct audit inventory in PR-5` — evidence: pending.
- **T6** — S10 — inline — blocked — presence: requiere decisión de producto del usuario.
- **T7** — S11 — manual — pending — deploy de reglas por el usuario; verificación final del feature.

Route declaration: **inline** para T1–T5. Trigger evidence: sin Writer trigger — no hay unidades paralelas independientes (presence y boot comparten `src/main.js`), por lo que se usa un solo escritor; el Mapping trigger se satisfizo con un explorer read-only (`gentle-ai-explore`) y un spot-check del parent. Sin feature docs paralelos.

Line budget: heurística de ~400 líneas por slice; el forecast es bajo (cambios de una a pocas líneas por clúster, más tests). No se usa recorte cosmético para cumplir el budget.

## Log

**L1** (2026-11-19): "Vamos a implemenatarlo con ODD, asi que empieza con el feature doc y cada vez que termines una tarea detente y yo te confirmo que continues."

**L2** (2026-11-19): "Ufff parace que tenemos bastantes problemas, quiero que explores el código y en base a ello - ademas de los hallazgos encontrados - me des tu propuesta nivel senior para solucionar todos estos problemas y concluir la deuda tecnica de la forma correcta."

**L3** — Análisis y decisiones: se exploró el código con un mapper read-only y se hicieron spot-checks del parent sobre `express-rate-limit`, `loginAttempts`, el selector de onboarding y `.firebaserc`. Se agruparon los síntomas en 7 clusters por causa raíz. Se eligió `ask-on-risk` como delivery strategy por defecto (forecast por debajo del budget, sin cadena de PR). Se decidió diferir presence (T6) a decisión del usuario y el deploy (T7) a ejecución manual.

**L4** — Descubrimiento al crear el doc: `firebase-admin` tampoco está declarado en `package.json` en HEAD; la adición existe solo como cambio no commiteado. Se incorpora a S3/T1 por pertenecer al mismo cluster de entrega.

**L5** — Aislamiento de worktree: hay cambios no commiteados de presence en `src/main.js`, `package.json`, `package-lock.json` y otros archivos. Para T1 se usa staging de `package.json`/lock completos (pertenecen al bloqueante); para T2 se usará staging selectivo de hunks de `src/main.js`, dejando intactos los hunks de presence. Push/PR/merge quedan fuera de autorización.

**L6** — T1 completado y verificado: `express-rate-limit` y `firebase-admin` declaradas como dependencias de runtime, lock sin flag `dev`, y nuevo test `tests/runtime-deps.unit.test.js` que detecta imports de `server/` no declarados. RED reproducido en scratch con `npm ci --omit=dev`; GREEN con 23 unit + 38 rules y smoke de import. Commit `f391fe2`. Assess nativo: `medium`, `review_due: false`, `under_budget`; el boundary de review sigue en `d11adb5` y se acumula al próximo slice.

**L7** — Próximo paso: DETENER y esperar confirmación del usuario antes de T2 (ciclo de login: C1+C2+C3). No se hicieron push, PR ni merge.

**L8** — T2 completado y verificado. Extracción de lógica pura a `src/services/loginFlow.js` (`resolveProfileAction`, `createAttemptCounter`, `createOnboardingScreen`) para que las reglas S4–S6 sean testeables en Node sin DOM runner; `main.js` delega en esos helpers y `user.js` ya no usa `merge: true`. Tests: `tests/login-flow.unit.test.js` (11 tests). RED observado (`ERR_MODULE_NOT_FOUND` del módulo nuevo + fallos de wiring) antes del fix; GREEN con 34 unit + 38 rules y build. Commit `7f3d575` con staging selectivo: el índice llevó `main.js` solo-T2 y el working tree conservó los 3 hunks de presence (`signOutCleanly`, `PresenceService.init`, `failLogin`) — verificado con `git diff src/main.js`. Assess nativo: `medium`, `review_due: false`, `under_budget`; boundary sigue en `d11adb5`.

**L9** — Próximo paso: DETENER y esperar confirmación del usuario antes de T3 (S7: omitir campos opcionales no elegidos + S9 ruta de test). No se hicieron push, PR ni merge.

**L10** — T3 completado y verificado. Se extrajo `buildOnboardingProfilePayload` a `src/services/onboardingProfile.js` (puro, testeable en Node) y `Onboarding.js` ahora lo usa: ya no inventa `'unknown'` para `discoverySource` ni escribe `usageIntent: null`; las keys no elegidas se omiten. S9: `src/services/profileFields.js` referencia `tests/profile-fields.unit.test.js`. RED observado por módulo ausente; GREEN con 37 unit + 38 rules y `npm run build`. Commit `796fbe6` (work-unit, staging selectivo). Assess/review boundary: pendiente de registrar en el cierre del slice según estrategia.

**L11** — Próximo paso: DETENER y esperar confirmación del usuario antes de T4 (S8: persistir mensajes de IA fallidos). No se hicieron push, PR ni merge.

**L12** — T4 completado y verificado. Se extrajo `persistFailedAiMessage`/`AI_FAILURE_MESSAGE` a `src/services/chatFailure.js` (inyectable, testeable en Node) y `ChatArea.js` persiste el mensaje de error de IA en el chat (`role: 'ai'`) cuando falla Gemini, además de mostrarlo en UI; se evita duplicado marcando el `messageId` persistido. RED observado por módulo ausente; GREEN con 39 unit y `npm run build`. Reglas de Firestore sin cambios (no ejecutadas). Commit `<pending>` (work-unit, staging selectivo).

**L13** — Próximo paso: DETENER y esperar confirmación del usuario antes de T5 (S9: corregir cifras de `npm audit` en `openspec/PR-5-gemini-proxy-auth-hardening.md`). No se hicieron push, PR ni merge.
