# chore: remove unused git dependency

## Description

The root `package.json` declared a direct dependency on `git@^0.1.5`, an npm package that is unrelated to the `git` command-line binary and was never imported anywhere in the codebase. This PR removes that dependency and its now-orphaned transitive entry from the lockfile.

The package had already been flagged as abandoned debt in `openspec/changes/gemini-api-key-proxy/exploration.md`: "Abandoned `git` npm dependency — pre-existing, unrelated to this change." Nothing consumed it, so it was pure install weight and an extra dependency surface.

The approach is deliberately minimal: drop the declaration from `package.json` and let the lockfile carry the corresponding removal. No source file changes are needed because there are no imports to update.

## Changes Made

### Dev tooling

- `package.json` — removed the `"git": "^0.1.5"` entry from `dependencies`.
- `package-lock.json` — removed the `node_modules/git` entry (version 0.1.5) and its only transitive dependency `node_modules/mime` (version 1.2.9); updated the root package dependency list to match.

## Impact

No runtime or user-facing behavior changes. The `git` npm package was a leaf dependency with a single dependent (itself) and no importers, so removing it cannot affect application code.

Backward compatibility is unaffected. The `git` command-line binary used for repository work is a separate system tool and is not touched by this change.

Dev experience improves marginally: fewer packages installed, and one fewer abandoned 2012-era package in the dependency tree. Before removal the lockfile carried a redundant `mime@1.2.9` pulled in solely by `git`; after removal only the `mime` versions required by `send` and `firebase-tools` remain.

Risk: removing a lockfile entry is reversible with a single `npm install git` if that package is ever genuinely needed.

## Notes

### Verification

- `npm uninstall git` reported: "removed 2 packages, and audited 742 packages".
- `npm ls git` returns empty.
- `node_modules/git` is absent.
- Clean reinstall (`rm -rf node_modules` then `npm install`) exits 0 with no errors.
- `npm run test:unit` — 9 pass / 0 fail.
- `npm run test:rules` (Firebase Emulator) — 29 pass / 0 fail, exit 0.
- Total 38 GREEN, identical to the pre-change baseline.

### Caveats

- This removes ONLY the npm package. The `git` command-line binary used for repository work is unaffected and must not be removed.
- Why the package was originally added cannot be determined from the code. The evidence is consistent with an accidental `npm install git`: someone likely wanted the git CLI or a library to operate on the repository, and npm resolved the bare name `git` to this unrelated 2012 package.
- Pre-existing `npm audit` findings (21 total: 6 moderate, 14 high, 1 critical) are neither introduced nor fixed by this change. They were already present and are out of scope.
