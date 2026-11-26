/**
 * Unit tests for failed AI message persistence.
 *
 * Plain Node, no DOM and no Firebase: persistence is exercised via an injected
 * saveMessage dependency.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    AI_FAILURE_MESSAGE,
    USER_SAVE_FAILURE_MESSAGE,
    persistFailedAiMessage,
    shouldRenderPersistedFailure,
} from '../src/services/chatFailure.js';

describe('persistFailedAiMessage', () => {
    test('persists the AI failure text as an ai message', async () => {
        const calls = [];
        const saveMessage = async (userId, chatId, text, role) => {
            calls.push({ userId, chatId, text, role });
            return { chatId, messageId: 'msg-failed-1' };
        };

        const result = await persistFailedAiMessage({
            userId: 'user-1',
            chatId: 'chat-1',
            saveMessage,
        });

        assert.deepEqual(calls, [
            {
                userId: 'user-1',
                chatId: 'chat-1',
                text: AI_FAILURE_MESSAGE,
                role: 'ai',
            },
        ]);
        assert.deepEqual(result, { chatId: 'chat-1', messageId: 'msg-failed-1' });
    });

    test('does not persist when there is no chat to save into', async () => {
        let called = false;
        const saveMessage = async () => {
            called = true;
            return { chatId: 'x', messageId: 'y' };
        };

        const result = await persistFailedAiMessage({
            userId: 'user-1',
            chatId: null,
            saveMessage,
        });

        assert.equal(called, false);
        assert.equal(result, null);
    });
});

describe('shouldRenderPersistedFailure', () => {
    test('renders only when the failure was persisted into the current chat', () => {
        assert.equal(shouldRenderPersistedFailure({
            isCurrentChat: true,
            messageId: 'msg-failed-1',
        }), true);
    });

    test('does not render when no message id came back (P1: null chatId)', () => {
        assert.equal(shouldRenderPersistedFailure({
            isCurrentChat: true,
            messageId: undefined,
        }), false);
    });

    test('does not render for a stale chat even when persistence succeeded', () => {
        assert.equal(shouldRenderPersistedFailure({
            isCurrentChat: false,
            messageId: 'msg-failed-1',
        }), false);
    });
});

describe('ChatArea.js wiring (source-level; no DOM runner installed)', () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const chatArea = readFileSync(join(repoRoot, 'src/components/ChatArea.js'), 'utf8');

    test('user-save failure stops the send and never reaches Gemini', () => {
        const start = chatArea.indexOf("console.error('Firestore Error (User Msg):', dbError)");
        const end = chatArea.indexOf('showLoading(messagesArea)');
        assert.notEqual(start, -1);
        assert.notEqual(end, -1);

        const catchBody = chatArea.slice(start, end);
        assert.match(catchBody, /return;/);
        assert.match(catchBody, /USER_SAVE_FAILURE_MESSAGE/);
        assert.match(USER_SAVE_FAILURE_MESSAGE, /No se pudo guardar/);
        assert.doesNotMatch(catchBody, /sendMessage\(/);
    });

    test('AI failure bubble is gated by persisted failure, not by chat id equality alone', () => {
        const start = chatArea.indexOf("console.error('Gemini Error:', error)");
        const end = chatArea.indexOf('const { element: inputElement');
        assert.notEqual(start, -1);
        assert.notEqual(end, -1);

        const catchBody = chatArea.slice(start, end);
        assert.match(catchBody, /let persistedFailure\s*=\s*null/);
        assert.match(catchBody, /messageId:\s*persistedFailure\?\.messageId/);
        assert.match(catchBody, /shouldRenderPersistedFailure\(\{/);
    });

    test('AI failure copy is classified once and reused for persistence and display', () => {
        const start = chatArea.indexOf("console.error('Gemini Error:', error)");
        const end = chatArea.indexOf('const { element: inputElement');
        const catchBody = chatArea.slice(start, end);

        assert.match(catchBody, /const failureMessage = classifyAiFailure\(error\)/);
        assert.match(catchBody, /message:\s*failureMessage/);
        assert.match(catchBody, /appendMessage\(messagesArea, failureMessage, 'ai'\)/);
        assert.doesNotMatch(catchBody, /appendMessage\(messagesArea, AI_FAILURE_MESSAGE/);
    });
});
