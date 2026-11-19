/**
 * Unit tests for onboarding profile payload construction.
 *
 * Plain Node, no DOM and no Firebase: this module is pure by design.
 * Covers S7: omit unanswered optional fields (no invented 'unknown', no null).
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { buildOnboardingProfilePayload } from '../src/services/onboardingProfile.js';

describe('buildOnboardingProfilePayload', () => {
    test('omits discoverySource and usageIntent when not chosen', () => {
        const payload = buildOnboardingProfilePayload({
            preferredName: 'Eric',
            discoverySource: '',
            usageIntent: null,
        });

        assert.deepEqual(payload, {
            preferredName: 'Eric',
            onboardingComplete: true,
        });
        assert.equal(Object.prototype.hasOwnProperty.call(payload, 'discoverySource'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(payload, 'usageIntent'), false);
    });

    test('includes discoverySource and usageIntent only when chosen', () => {
        const payload = buildOnboardingProfilePayload({
            preferredName: 'Eric',
            discoverySource: 'friend',
            usageIntent: 'work',
        });

        assert.deepEqual(payload, {
            preferredName: 'Eric',
            onboardingComplete: true,
            discoverySource: 'friend',
            usageIntent: 'work',
        });
    });

    test('never invents unknown for unanswered discoverySource', () => {
        const payload = buildOnboardingProfilePayload({
            preferredName: 'Eric',
            discoverySource: undefined,
            usageIntent: undefined,
        });

        assert.equal(Object.prototype.hasOwnProperty.call(payload, 'discoverySource'), false);
        assert.notEqual(payload.discoverySource, 'unknown');
    });
});
