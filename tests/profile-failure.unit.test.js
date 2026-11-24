/**
 * Unit tests for the profile-boot failure surface.
 *
 * The mapper is pure so code/phase decisions run in plain Node; main.js is a
 * Vite entry with CSS imports, so its wiring is asserted against source text.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveProfileFailure } from '../src/services/profileFailure.js';

describe('resolveProfileFailure', () => {
    test('permission-denied is not retryable and exposes phase and code', () => {
        const failure = resolveProfileFailure({ code: 'permission-denied', phase: 'load' });

        assert.equal(failure.retryable, false);
        assert.match(failure.detail, /permission-denied/);
        assert.match(failure.detail, /carga/);
        assert.doesNotMatch(failure.message, /conexión/);
    });

    test('create phase is labelled as creación in the detail line', () => {
        const failure = resolveProfileFailure({ code: 'permission-denied', phase: 'create' });

        assert.equal(failure.retryable, false);
        assert.match(failure.detail, /creación/);
    });

    test('unauthenticated ends the session path without retrying', () => {
        const failure = resolveProfileFailure({ code: 'unauthenticated', phase: 'load' });

        assert.equal(failure.retryable, false);
        assert.match(failure.message, /iniciar sesión/);
    });

    test('network failures keep the connectivity copy and remain retryable', () => {
        for (const code of ['unavailable', 'network-request-failed']) {
            const failure = resolveProfileFailure({ code, phase: 'load' });

            assert.equal(failure.retryable, true);
            assert.match(failure.message, /Revisa tu conexión e inténtalo de nuevo\./);
        }
    });

    test('invalid-argument is not retryable', () => {
        const failure = resolveProfileFailure({ code: 'invalid-argument', phase: 'create' });

        assert.equal(failure.retryable, false);
    });

    test('unknown codes stay retryable but remain diagnosable', () => {
        const failure = resolveProfileFailure({ code: 'unknown-code', phase: 'load' });

        assert.equal(failure.retryable, true);
        assert.match(failure.detail, /unknown-code/);
    });
});

describe('main.js wiring (source-level; no DOM runner installed)', () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const main = readFileSync(join(repoRoot, 'src/main.js'), 'utf8');
    const renderBody = main.slice(
        main.indexOf('const renderLoginError ='),
        main.indexOf('const onLoginSuccess =')
    );
    const failLoginBody = main.slice(
        main.indexOf('const failLogin ='),
        main.indexOf('// Superficie de error')
    );

    test('both failure catch sites pass code and phase with projectId', () => {
        // Each catch logs the structured object and builds a mapped failure;
        // 'load' also appears in renderLoginError's default.
        assert.equal(main.match(/phase: 'load'/g)?.length, 3);
        assert.equal(main.match(/phase: 'create'/g)?.length, 2);
        assert.equal(main.match(/code: err\?\.code/g)?.length, 4);
        assert.match(main, /projectId: firebaseApp\.options\.projectId/);
    });

    test('the error surface renders the mapped copy, detail and explicit exit', () => {
        assert.match(renderBody, /resolveProfileFailure/);
        assert.match(renderBody, /failure\.title/);
        assert.match(renderBody, /failure\.message/);
        assert.match(renderBody, /failure\.detail/);
        assert.match(renderBody, /class="login-error__detail"/);
        assert.match(renderBody, /login-signout/);
    });

    test('non-retryable failures skip the bounded retry counter', () => {
        assert.match(failLoginBody, /failure\?\.retryable === false/);
        assert.match(failLoginBody, /renderLoginError\(retry, failure\)/);
        assert.match(failLoginBody, /attemptCounter\.recordFailure\(\)/);
        assert.match(failLoginBody, /attemptCounter\.isExhausted\(\)/);
        assert.match(failLoginBody, /AuthService\.logout\(\)/);
    });
});
