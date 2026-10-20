/**
 * Unit tests for the client-side profile field policy.
 *
 * Plain Node, no emulator and no Firebase: this module is pure by design.
 * These tests cover the client half of the rule; the server half (the real
 * boundary) lives in tests/firestore-rules.test.js.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
    ALLOWED_PROFILE_FIELDS,
    sanitizeProfileUpdate,
} from '../src/services/profileFields.js';

describe('sanitizeProfileUpdate', () => {
    test('keeps every allowlisted field the onboarding flow sends', () => {
        const payload = {
            preferredName: 'Eric',
            discoverySource: 'google',
            usageIntent: 'work',
            onboardingComplete: true,
        };

        const { safeData, rejected } = sanitizeProfileUpdate(payload);

        assert.deepEqual(safeData, payload);
        assert.deepEqual(rejected, []);
    });

    test('drops the protected field "role"', () => {
        const { safeData, rejected } = sanitizeProfileUpdate({ preferredName: 'Eric', role: 'admin' });

        assert.deepEqual(safeData, { preferredName: 'Eric' });
        assert.deepEqual(rejected, ['role']);
    });

    test('drops the protected field "plan"', () => {
        const { safeData, rejected } = sanitizeProfileUpdate({ plan: 'enterprise' });

        assert.deepEqual(safeData, {});
        assert.deepEqual(rejected, ['plan']);
    });

    test('drops the protected field "permissions"', () => {
        const { safeData, rejected } = sanitizeProfileUpdate({ permissions: ['admin'] });

        assert.deepEqual(safeData, {});
        assert.deepEqual(rejected, ['permissions']);
    });

    test('drops identity fields the rules also protect', () => {
        const { safeData, rejected } = sanitizeProfileUpdate({
            preferredName: 'Eric',
            email: 'attacker@selene.test',
            createdAt: '2000-01-01',
            lastLogin: '2000-01-01',
        });

        assert.deepEqual(safeData, { preferredName: 'Eric' });
        assert.deepEqual(rejected.sort(), ['createdAt', 'email', 'lastLogin']);
    });

    test('drops an unknown field a future feature might add', () => {
        const { safeData, rejected } = sanitizeProfileUpdate({ isAdmin: true });

        assert.deepEqual(safeData, {});
        assert.deepEqual(rejected, ['isAdmin']);
    });

    test('never returns a key outside the allowlist', () => {
        const { safeData } = sanitizeProfileUpdate({
            role: 'admin',
            plan: 'enterprise',
            permissions: ['*'],
            preferredName: 'Eric',
        });

        for (const key of Object.keys(safeData)) {
            assert.ok(
                ALLOWED_PROFILE_FIELDS.includes(key),
                `unexpected writable key: ${key}`
            );
        }
    });

    test('tolerates missing or non-object input', () => {
        assert.deepEqual(sanitizeProfileUpdate(undefined), { safeData: {}, rejected: [] });
        assert.deepEqual(sanitizeProfileUpdate(null), { safeData: {}, rejected: [] });
        assert.deepEqual(sanitizeProfileUpdate('role=admin'), { safeData: {}, rejected: [] });
    });

    test('preserves falsy allowlisted values', () => {
        const { safeData } = sanitizeProfileUpdate({ onboardingComplete: false, preferredName: '' });

        assert.deepEqual(safeData, { onboardingComplete: false, preferredName: '' });
    });
});
