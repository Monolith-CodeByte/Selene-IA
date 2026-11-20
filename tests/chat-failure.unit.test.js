/**
 * Unit tests for failed AI message persistence.
 *
 * Plain Node, no DOM and no Firebase: persistence is exercised via an injected
 * saveMessage dependency.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { AI_FAILURE_MESSAGE, persistFailedAiMessage } from '../src/services/chatFailure.js';

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
