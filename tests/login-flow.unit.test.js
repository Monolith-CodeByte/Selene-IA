/**
 * Unit tests for the pure post-login flow decisions and the onboarding screen
 * handle. These are extracted from main.js because it is a Vite entry (CSS
 * imports + DOMContentLoaded) and cannot be imported in plain Node.
 *
 * S4: a missing profile creates; an existing incomplete profile resumes with
 *     zero writes; a complete profile enters the app.
 * S5: the bounded retry counter resets on sign-out.
 * S6: sign-out removes the actual onboarding node, not a magic DOM selector.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    resolveProfileAction,
    createAttemptCounter,
    createOnboardingScreen,
} from '../src/services/loginFlow.js';

describe('resolveProfileAction', () => {
    test('missing profile is created', () => {
        assert.equal(resolveProfileAction(null), 'create');
    });

    test('existing profile with onboardingComplete=false resumes with zero writes', () => {
        // The action must be onboarding, never create: calling createUserProfile
        // on an existing doc hits the rules' update branch and is denied.
        assert.equal(resolveProfileAction({ onboardingComplete: false }), 'onboarding');
    });

    test('complete profile enters the app', () => {
        assert.equal(resolveProfileAction({ onboardingComplete: true }), 'app');
    });
});

describe('createAttemptCounter', () => {
    test('exhausts after the configured number of failures', () => {
        const counter = createAttemptCounter(3);
        counter.recordFailure();
        counter.recordFailure();
        assert.equal(counter.isExhausted(), false);
        counter.recordFailure();
        assert.equal(counter.isExhausted(), true);
    });

    test('reset on sign-out lets a new session fail again without immediate logout', () => {
        const counter = createAttemptCounter(3);
        counter.recordFailure();
        counter.recordFailure();
        counter.recordFailure();
        assert.equal(counter.isExhausted(), true);

        counter.reset();
        assert.equal(counter.value, 0);
        assert.equal(counter.isExhausted(), false);

        // A 4th attempt in a new session is only the first attempt there.
        counter.recordFailure();
        assert.equal(counter.isExhausted(), false);
    });
});

describe('createOnboardingScreen', () => {
    test('teardown removes the mounted node and clears the reference', () => {
        let removed = false;
        const node = { className: 'onboarding-container fade-in', remove() { removed = true; } };
        const screen = createOnboardingScreen();

        assert.equal(screen.current, null);
        assert.equal(screen.mount(node), node);
        assert.equal(screen.current, node);

        screen.teardown();
        assert.equal(removed, true, 'the created node must be removed on sign-out');
        assert.equal(screen.current, null, 'the reference must be cleared');
    });

    test('teardown is safe when onboarding was never shown', () => {
        const screen = createOnboardingScreen();
        assert.doesNotThrow(() => screen.teardown());
    });
});

describe('main.js / user.js wiring (source-level; no DOM runner installed)', () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const userService = readFileSync(join(repoRoot, 'src/services/user.js'), 'utf8');
    const main = readFileSync(join(repoRoot, 'src/main.js'), 'utf8');

    test('createUserProfile no longer uses setDoc merge', () => {
        const createBody = userService.slice(
            userService.indexOf('createUserProfile'),
            userService.indexOf('// Update specific fields')
        );
        assert.doesNotMatch(createBody, /merge\s*:\s*true/);
    });

    test('main.js never queries the non-existent .onboarding-screen selector', () => {
        assert.doesNotMatch(main, /\.onboarding-screen/);
    });

    test('main.js routes on resolveProfileAction and resets attempts/teardown on sign-out', () => {
        assert.match(main, /resolveProfileAction\(profile\)/);
        assert.match(main, /attemptCounter\.reset\(\)/);
        assert.match(main, /onboardingScreen\.teardown\(\)/);
    });

    test('login error surface stays in failLogin, not in the onboarding resume path', () => {
        assert.match(main, /renderLoginError/);
        const resumeBranch = main.slice(
            main.indexOf("action === 'onboarding'"),
            main.indexOf('const onSignedOut')
        );
        assert.doesNotMatch(resumeBranch, /failLogin/);
    });
});
