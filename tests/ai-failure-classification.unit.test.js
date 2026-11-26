/**
 * Unit tests for honest AI failure copy (P5).
 *
 * Plain Node: the classifier is a pure helper and needs no DOM or Firebase.
 * Browser-only modules are checked at source level, matching the existing
 * ChatArea wiring tests in this repository.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as chatFailure from '../src/services/chatFailure.js';

const withStatus = (status, message = 'proxy error') =>
    Object.assign(new Error(message), { status });

describe('classifyAiFailure', () => {
    const classify = (error) => chatFailure.classifyAiFailure(error);

    test('401 uses session copy and never blames the API key', () => {
        const message = classify(withStatus(401, 'Unauthorized: Invalid or expired token'));
        assert.equal(message, chatFailure.AI_AUTH_FAILURE_MESSAGE);
        assert.match(message, /sesión/i);
        assert.doesNotMatch(message, /API Key/i);
    });

    test('429 uses rate-limit copy', () => {
        const message = classify(withStatus(429, 'Too many requests'));
        assert.equal(message, chatFailure.AI_RATE_LIMIT_MESSAGE);
        assert.match(message, /demasiados mensajes/i);
    });

    test('500 uses service-unavailable copy', () => {
        const message = classify(withStatus(500, 'Gemini API error'));
        assert.equal(message, chatFailure.AI_SERVER_FAILURE_MESSAGE);
        assert.match(message, /no está disponible/i);
    });

    test('403 CORS rejection uses connection copy', () => {
        const message = classify(withStatus(403, 'Origin not allowed'));
        assert.equal(message, chatFailure.AI_NETWORK_FAILURE_MESSAGE);
        assert.doesNotMatch(message, /API Key/i);
    });

    test('fetch TypeError uses connection copy', () => {
        assert.equal(
            classify(new TypeError('Failed to fetch')),
            chatFailure.AI_NETWORK_FAILURE_MESSAGE
        );
    });

    test('unknown failure uses the honest generic fallback', () => {
        assert.equal(
            classify(new Error('unexpected failure')),
            chatFailure.AI_FAILURE_MESSAGE
        );
        assert.doesNotMatch(chatFailure.AI_FAILURE_MESSAGE, /API Key/i);
    });
});

describe('persistFailedAiMessage with a classified message', () => {
    test('persists the supplied text instead of the generic constant', async () => {
        const calls = [];
        const saveMessage = async (userId, chatId, text, role) => {
            calls.push({ userId, chatId, text, role });
            return { chatId, messageId: 'msg-classified-1' };
        };

        const result = await chatFailure.persistFailedAiMessage({
            userId: 'user-1',
            chatId: 'chat-1',
            saveMessage,
            message: chatFailure.AI_RATE_LIMIT_MESSAGE,
        });

        assert.deepEqual(calls, [{
            userId: 'user-1',
            chatId: 'chat-1',
            text: chatFailure.AI_RATE_LIMIT_MESSAGE,
            role: 'ai',
        }]);
        assert.deepEqual(result, { chatId: 'chat-1', messageId: 'msg-classified-1' });
    });
});

describe('GeminiService.sendMessage error status (source-level; import.meta.env unavailable in Node)', () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const gemini = readFileSync(join(repoRoot, 'src/services/gemini.js'), 'utf8');

    test('preserves the HTTP status on the thrown error', () => {
        assert.match(gemini, /if \(!response\.ok\)/);
        assert.match(gemini, /const failure = new Error\(/);
        assert.match(gemini, /failure\.status\s*=\s*response\.status/);
        assert.match(gemini, /throw failure/);
    });
});
