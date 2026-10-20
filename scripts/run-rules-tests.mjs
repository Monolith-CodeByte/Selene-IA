/**
 * Runs the Firestore rules test suite against the local emulator.
 *
 * The Firestore emulator is a JVM process, so a Java 11+ runtime must be
 * reachable. This wrapper resolves one and hands it to `firebase`, so
 * `npm run test:rules` behaves the same on every machine:
 *
 *   1. an already exported JAVA_HOME wins;
 *   2. a JDK installed inside the user profile is used next
 *      (~/.local/share/jdk21, where a local Temurin install lands);
 *   3. otherwise the `java` on PATH is trusted as-is.
 *
 * Nothing is written outside the emulator's own data directory and no network
 * call reaches a real Firebase project: the suite runs under the offline
 * project id `demo-selene-ia`.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'demo-selene-ia';
const LOCAL_JDK_CANDIDATES = [
    join(homedir(), '.local', 'share', 'jdk21'),
    join(homedir(), '.local', 'share', 'java'),
];

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @returns {string | null} JAVA_HOME to export, or null to inherit PATH. */
function resolveJavaHome() {
    const exported = process.env.JAVA_HOME;
    if (exported && existsSync(join(exported, 'bin', 'java'))) {
        return exported;
    }

    for (const candidate of LOCAL_JDK_CANDIDATES) {
        if (existsSync(join(candidate, 'bin', 'java'))) {
            return candidate;
        }
    }

    return null;
}

const javaHome = resolveJavaHome();

if (!javaHome && !process.env.PATH) {
    console.error('No Java runtime found and no PATH available to search.');
    process.exit(1);
}

if (!javaHome) {
    console.warn(
        'No JAVA_HOME or local JDK found; relying on `java` from PATH.\n' +
            'If the emulator reports "Could not spawn `java -version`", install a JRE 11+:\n' +
            '  sudo apt install openjdk-21-jre-headless\n' +
            'or install Temurin inside your user profile (~/.local/share/jdk21).'
    );
}

const env = {
    ...process.env,
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
    ...(javaHome ? { PATH: `${join(javaHome, 'bin')}:${process.env.PATH ?? ''}` } : {}),
};

const firebaseBin = join(repoRoot, 'node_modules', '.bin', 'firebase');
const command = existsSync(firebaseBin) ? firebaseBin : 'firebase';

const child = spawn(
    command,
    [
        'emulators:exec',
        '--only',
        'firestore',
        '--project',
        PROJECT_ID,
        // Node's own glob support, quoted so the shell passes the pattern
        // through untouched. A bare directory argument (`node --test tests`)
        // is resolved as a module path by Node 22 and fails.
        'node --test "tests/**/*.rules.test.js"',
    ],
    { cwd: repoRoot, env, stdio: 'inherit' }
);

child.on('error', (error) => {
    console.error(`Failed to start the rules test run: ${error.message}`);
    process.exit(1);
});

child.on('exit', (code, signal) => {
    if (signal) {
        console.error(`Rules test run terminated by signal ${signal}`);
        process.exit(1);
    }
    process.exit(code ?? 1);
});
