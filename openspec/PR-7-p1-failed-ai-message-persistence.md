# PR-7: Fix failed AI message persistence (P1)

## Description

Two send-path gaps remained after the earlier chat-failure persistence work. When `ChatHistoryService.saveMessage` failed for the user's message, `ChatArea.js` only logged `Firestore Error (User Msg):` and continued toward Gemini, so the user got no save-failure feedback. When Gemini failed, `AI_FAILURE_MESSAGE` was appended based only on `currentChatId === targetChatId`; if `persistFailedAiMessage` returned no `messageId` (for example with a null `chatId`), the bubble was shown in the DOM without being saved in history.

This fix stops the send when the user message cannot be saved, with an explicit failure bubble, and gates the AI failure bubble on a successful persistence result returned by `persistFailedAiMessage` plus current-chat membership. The gating rule is a pure helper in `src/services/chatFailure.js`.

## Changes Made

### Bug fixes
- **`src/services/chatFailure.js`**: added `USER_SAVE_FAILURE_MESSAGE` (`'No se pudo guardar el mensaje. Revisá tu conexión y volvé a intentar.'`) and `shouldRenderPersistedFailure({ isCurrentChat, messageId })`, which requires both a current chat and a persisted `messageId`.
- **`src/components/ChatArea.js`**: the `Firestore Error (User Msg):` catch now appends `USER_SAVE_FAILURE_MESSAGE` as an `ai` message and returns before `showLoading` and `chatSession.sendMessage`.
- **`src/components/ChatArea.js`**: the `Gemini Error:` catch keeps the `persistedFailure` result, registers its `messageId` in `renderedMessageIds`, and calls `appendMessage(messagesArea, AI_FAILURE_MESSAGE, 'ai')` only through `shouldRenderPersistedFailure`.

### Tests
- **`tests/chat-failure.unit.test.js`**: added three `shouldRenderPersistedFailure` cases (persisted current chat, missing `messageId`, stale chat) and source-level assertions for both `ChatArea.js` wiring points.

## Impact

- A failed user-message save now shows `USER_SAVE_FAILURE_MESSAGE` and does not reach Gemini.
- The AI failure bubble is rendered only when it was persisted into the chat currently on screen; a null `chatId` no longer produces an unsaved error bubble.
- No existing persisted data, Firestore paths, Firestore rules, or other UI strings are changed. Existing chat history behavior is unaffected.
- The project has no DOM runner, so `ChatArea.js` wiring is asserted against source text rather than by a rendered-component test.

## Notes

### Verification
- `npm test` passes: 38 unit tests and 29 Firestore rules tests.
- Browser check performed by the user: the failure bubble appears and is persisted in Firestore.

### Follow-up
- A pre-existing duplicate-render race between the snapshot listener and `appendMessage` remains open. It is not part of this fix.
